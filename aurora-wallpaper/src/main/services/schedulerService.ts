/**
 * Aurora Wallpaper — 壁纸轮换调度服务
 *
 * 按 settings.rotation 配置定时切换桌面壁纸。
 * 设计要点：
 * - setTimeout 链（非 setInterval）：避免间隔漂移，便于 suspend/resume 后重新计时
 * - 连续 3 次失败自动暂停（防网络/权限问题无限重试）
 * - powerMonitor 处理 suspend/resume：suspend 时暂停计时，resume 后立即触发一次
 * - 来源 bing 复用 dailyService；history/favorites 从 wallpaperStore 取
 * - lastRotationAt 持久化到 userData/scheduler-state.json
 */

import fs from 'node:fs';
import path from 'node:path';
import type { powerMonitor } from 'electron';
import type { BingDailyItem, WallpaperRecord } from '../../shared/types';
import type { DailyService } from './dailyService';
import type { WallpaperStore } from './wallpaperStore';
import type { SettingsService } from './settings';

/** 连续失败自动暂停阈值 */
const MAX_CONSECUTIVE_FAILURES = 3;

/** 最小轮换间隔（毫秒）—— 防止配置过小 */
const MIN_INTERVAL_MS = 15 * 60 * 1000;

/** 调度器状态文件 */
interface SchedulerState {
  lastRotationAt: string | null;
  consecutiveFailures: number;
  paused: boolean;
}

/** 调度器依赖 */
export interface SchedulerDeps {
  settingsService: SettingsService;
  dailyService: DailyService;
  wallpaperStore: WallpaperStore;
  /** 获取 userData 路径 */
  getUserDataPath: () => string;
  /** Electron powerMonitor（测试注入） */
  powerMonitor?: typeof powerMonitor;
  /** 设置壁纸函数（测试注入，默认动态 import） */
  setWallpaper?: (filePath: string) => Promise<void>;
  /** 当前时间（测试注入） */
  now?: () => number;
  /** 随机源（测试注入，默认 Math.random） */
  rng?: () => number;
  /** 日志输出（测试注入） */
  log?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/** 调度器接口 */
export interface SchedulerService {
  /** 启动调度（幂等：已启动时返回） */
  start(): void;
  /** 停止调度 */
  stop(): void;
  /** 是否正在运行 */
  isRunning(): boolean;
  /** 手动触发一次轮换（测试/调试用） */
  rotateNow(): Promise<boolean>;
}

/** Bing 候选 + 选中的记录信息 */
type BingCandidate = BingDailyItem;

export function createSchedulerService(deps: SchedulerDeps): SchedulerService {
  const {
    settingsService,
    dailyService,
    wallpaperStore,
    getUserDataPath,
    now = Date.now,
    rng = Math.random,
    log = console,
  } = deps;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let state: SchedulerState = { lastRotationAt: null, consecutiveFailures: 0, paused: false };
  /** 上一次设置的壁纸路径（用于避免连续重复） */
  let lastPickedPath: string | null = null;

  /** 状态文件路径 */
  function statePath(): string {
    return path.join(getUserDataPath(), 'scheduler-state.json');
  }

  /** 读取状态（损坏/缺失回退默认值） */
  function readState(): SchedulerState {
    try {
      const raw = fs.readFileSync(statePath(), 'utf-8');
      const parsed = JSON.parse(raw) as SchedulerState;
      return {
        lastRotationAt: parsed.lastRotationAt ?? null,
        consecutiveFailures: parsed.consecutiveFailures ?? 0,
        paused: parsed.paused ?? false,
      };
    } catch {
      return { lastRotationAt: null, consecutiveFailures: 0, paused: false };
    }
  }

  /** 写入状态 */
  function writeState(s: SchedulerState): void {
    try {
      fs.mkdirSync(path.dirname(statePath()), { recursive: true });
      fs.writeFileSync(statePath(), JSON.stringify(s, null, 2), 'utf-8');
    } catch {
      // 写入失败不影响核心功能
    }
  }

  /** 从来源获取壁纸候选 */
  async function pickWallpaper(): Promise<
    { type: 'bing'; candidate: BingCandidate } | { type: 'local'; record: WallpaperRecord } | null
  > {
    const settings = settingsService.loadSettings();
    const rotation = settings.rotation;

    if (rotation.source === 'bing') {
      const { items } = await dailyService.fetchBingDaily();
      if (items.length === 0) return null;
      // 顺序模式：取第一张；随机模式：使用注入的 rng
      const idx = rotation.order === 'random'
        ? Math.floor(rng() * items.length)
        : 0;
      return { type: 'bing', candidate: items[idx] };
    }

    // history / favorites
    const records = wallpaperStore.list();
    const candidates = rotation.source === 'favorites'
      ? records.filter((r) => r.favorite)
      : records;

    if (candidates.length === 0) return null;

    let picked: WallpaperRecord;
    if (rotation.order === 'newest') {
      picked = candidates[0];
    } else {
      // 随机模式：使用注入的 rng，避免连续两次选到同一张
      let idx = Math.floor(rng() * candidates.length);
      if (candidates.length > 1 && candidates[idx].filePath === lastPickedPath) {
        // 如果随机到同一张，尝试下一张（环形）
        idx = (idx + 1) % candidates.length;
      }
      picked = candidates[idx];
    }

    return { type: 'local', record: picked };
  }

  /** 执行一次轮换 */
  async function doRotate(): Promise<boolean> {
    const settings = settingsService.loadSettings();
    if (!settings.rotation.enabled) {
      log.info?.('[scheduler] rotation disabled, skipping');
      return false;
    }

    // 检查暂停状态
    state = readState();
    if (state.paused) {
      log.warn?.('[scheduler] paused due to consecutive failures, skipping');
      return false;
    }

    try {
      const picked = await pickWallpaper();
      if (!picked) {
        log.warn?.('[scheduler] no wallpaper candidate available');
        return false;
      }

      let filePath: string;
      let source: string;

      if (picked.type === 'bing') {
        const c = picked.candidate;
        const result = await dailyService.setDailyWallpaper({
          url: c.url,
          fileName: `${c.date}-${c.title}`,
        });
        if (!result.ok) {
          throw new Error(result.error || 'Bing 壁纸设置失败');
        }
        // 使用 setDailyWallpaper 返回的记录路径（不依赖 list 顺序）
        if (!result.record) {
          throw new Error('Bing 壁纸设置成功但未返回记录');
        }
        filePath = result.record.filePath;
        source = 'bing';
      } else {
        filePath = picked.record.filePath;
        const setWallpaperFn = deps.setWallpaper ?? (await import('./wallpaperSetter')).setWallpaper;
        await setWallpaperFn(filePath);
        source = picked.record.favorite ? 'favorites' : 'history';
      }

      lastPickedPath = filePath;
      state = {
        lastRotationAt: new Date(now()).toISOString(),
        consecutiveFailures: 0,
        paused: false,
      };
      writeState(state);
      log.info?.(`[scheduler] wallpaper rotated: ${source} → ${filePath}`);
      return true;
    } catch (err) {
      const failures = state.consecutiveFailures + 1;
      state = {
        ...state,
        consecutiveFailures: failures,
        paused: failures >= MAX_CONSECUTIVE_FAILURES,
      };
      writeState(state);
      log.error?.(`[scheduler] rotation failed (${failures}/${MAX_CONSECUTIVE_FAILURES}): ${err}`);
      return false;
    }
  }

  /** 计算下次触发时间（毫秒） */
  function nextDelay(): number {
    const settings = settingsService.loadSettings();
    const intervalMs = Math.max(settings.rotation.intervalMinutes * 60 * 1000, MIN_INTERVAL_MS);
    return intervalMs;
  }

  /** 调度下一次 */
  function scheduleNext(): void {
    if (!running) return;
    const delay = nextDelay();
    timer = setTimeout(async () => {
      await doRotate();
      scheduleNext();
    }, delay);
  }

  /** 处理 suspend */
  function onSuspend(): void {
    log.info?.('[scheduler] system suspend, pausing timer');
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** 处理 resume：仅在已到点时立即轮换，未到点则按剩余时间重排 */
  function onResume(): void {
    log.info?.('[scheduler] system resume, checking if rotation is due');
    const settings = settingsService.loadSettings();
    const intervalMs = Math.max(settings.rotation.intervalMinutes * 60 * 1000, MIN_INTERVAL_MS);
    const lastAt = state.lastRotationAt ? new Date(state.lastRotationAt).getTime() : 0;
    const elapsed = now() - lastAt;

    if (elapsed >= intervalMs) {
      // 已到点（或从未轮换过）→ 立即轮换
      void doRotate();
      scheduleNext();
    } else {
      // 未到点 → 按剩余时间重排
      const remaining = intervalMs - elapsed;
      timer = setTimeout(async () => {
        await doRotate();
        scheduleNext();
      }, remaining);
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;

      if (deps.powerMonitor) {
        deps.powerMonitor.on('suspend', onSuspend);
        deps.powerMonitor.on('resume', onResume);
      }

      log.info?.('[scheduler] started');
      scheduleNext();
    },

    stop(): void {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (deps.powerMonitor) {
        deps.powerMonitor.off('suspend', onSuspend);
        deps.powerMonitor.off('resume', onResume);
      }

      log.info?.('[scheduler] stopped');
    },

    isRunning(): boolean {
      return running;
    },

    async rotateNow(): Promise<boolean> {
      return doRotate();
    },
  };
}
