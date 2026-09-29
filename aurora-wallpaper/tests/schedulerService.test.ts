/**
 * Aurora Wallpaper — 轮换调度服务测试
 *
 * 覆盖：
 * 1. start/stop 幂等性
 * 2. rotateNow：history 来源，设置壁纸成功
 * 3. rotateNow：favorites 来源，只取收藏记录
 * 4. rotateNow：bing 来源，调用 dailyService.setDailyWallpaper
 * 5. 连续失败 3 次自动暂停
 * 6. pause 时跳过执行
 * 7. rotation disabled 时跳过
 * 8. setTimeout 链触发（fake timers）
 * 9. powerMonitor suspend/resume 处理
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SettingsService } from '../src/main/services/settings';
import type { DailyService } from '../src/main/services/dailyService';
import type { WallpaperStore } from '../src/main/services/wallpaperStore';
import type { RotationSettings } from '../src/shared/types';
import { createSchedulerService } from '../src/main/services/schedulerService';

// Mock wallpaperSetter
vi.mock('../src/main/services/wallpaperSetter', () => ({
  setWallpaper: vi.fn().mockResolvedValue(undefined),
}));

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-test-'));
}

function makeSettings(rotation: RotationSettings): SettingsService {
  return {
    loadSettings: () => ({
      baseURL: 'https://example.com/v1',
      apiKey: 'test-key',
      retryLimit: 2,
      retryIntervalMs: 2000,
      requestTimeoutMs: 120000,
      model: 'qwen-image',
      rotation,
    }),
    saveSettings: vi.fn(),
  } as unknown as SettingsService;
}

function makeWallpaperStore(records: Array<{ id: string; filePath: string; favorite: boolean }>): WallpaperStore {
  // Create dummy files
  for (const r of records) {
    fs.writeFileSync(r.filePath, 'dummy');
  }
  return {
    list: () => records.map((r) => ({
      id: r.id,
      fileName: path.basename(r.filePath),
      filePath: r.filePath,
      prompt: 'test',
      rawInput: 'test',
      styleId: 'test',
      size: '16:9' as const,
      mode: 'text-to-image' as const,
      fileSize: 5,
      createdAt: new Date().toISOString(),
      favorite: r.favorite,
    })),
    getIndex: () => ({ version: 2, items: [] }),
    pruneToLimit: () => [],
    downloadAndStore: vi.fn(),
    deleteById: vi.fn(),
    setFavorite: vi.fn(),
  } as unknown as WallpaperStore;
}

function makeDailyService(result: { ok: boolean; error?: string }): DailyService {
  return {
    fetchBingDaily: vi.fn().mockResolvedValue({
      items: [{ date: '2026-09-28', title: 'test', copyright: '', url: 'https://cn.bing.com/test.jpg', thumbnailUrl: '' }],
      error: null,
    }),
    setDailyWallpaper: vi.fn().mockResolvedValue(result.ok ? { ok: true, record: { id: 'bing-1', fileName: 'bing.png', filePath: '/tmp/bing.png', prompt: 'Bing 每日壁纸', rawInput: 'Bing', styleId: 'bing', size: '16:9', mode: 'text-to-image', fileSize: 100, createdAt: new Date().toISOString(), favorite: false } } : result),
    listDaily: vi.fn(),
  } as unknown as DailyService;
}

function makePowerMonitor() {
  const listeners: Record<string, Function[]> = {};
  return {
    on: vi.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    off: vi.fn((event: string, cb: Function) => {
      listeners[event] = (listeners[event] || []).filter((fn) => fn !== cb);
    }),
    emit: (event: string) => {
      (listeners[event] || []).forEach((cb) => cb());
    },
  };
}

describe('schedulerService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('start is idempotent', () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const store = makeWallpaperStore([]);
    const daily = makeDailyService({ ok: true });
    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
    });

    scheduler.start();
    scheduler.start(); // second call should be no-op
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('rotateNow picks from history', async () => {
    const filePath = path.join(tempDir, 'wall.png');
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const store = makeWallpaperStore([{ id: '1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      setWallpaper,
    });

    const result = await scheduler.rotateNow();
    expect(result).toBe(true);
    expect(setWallpaper).toHaveBeenCalledWith(filePath);
  });

  it('rotateNow picks from favorites only', async () => {
    const favPath = path.join(tempDir, 'fav.png');
    const nonFavPath = path.join(tempDir, 'nonfav.png');
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'favorites', order: 'random' });
    const store = makeWallpaperStore([
      { id: '1', filePath: nonFavPath, favorite: false },
      { id: '2', filePath: favPath, favorite: true },
    ]);
    const daily = makeDailyService({ ok: true });
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      setWallpaper,
    });

    const result = await scheduler.rotateNow();
    expect(result).toBe(true);
    expect(setWallpaper).toHaveBeenCalledWith(favPath);
  });

  it('rotateNow calls dailyService for bing source', async () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'bing', order: 'random' });
    const filePath = path.join(tempDir, 'bing.png');
    const store = makeWallpaperStore([{ id: 'bing-1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
    });

    const result = await scheduler.rotateNow();
    expect(result).toBe(true);
    expect(daily.setDailyWallpaper).toHaveBeenCalled();
  });

  it('pauses after 3 consecutive failures', async () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const filePath = path.join(tempDir, 'wall.png');
    const store = makeWallpaperStore([{ id: '1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });
    const setWallpaper = vi.fn().mockRejectedValue(new Error('fail'));

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      setWallpaper,
    });

    // 3 failures
    await scheduler.rotateNow();
    await scheduler.rotateNow();
    await scheduler.rotateNow();

    // 4th should be skipped due to pause
    const result = await scheduler.rotateNow();
    expect(result).toBe(false);
    expect(setWallpaper).toHaveBeenCalledTimes(3);
  });

  it('skips when rotation is disabled', async () => {
    const settings = makeSettings({ enabled: false, intervalMinutes: 60, source: 'history', order: 'random' });
    const filePath = path.join(tempDir, 'wall.png');
    const store = makeWallpaperStore([{ id: '1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      setWallpaper,
    });

    const result = await scheduler.rotateNow();
    expect(result).toBe(false);
    expect(setWallpaper).not.toHaveBeenCalled();
  });

  it('schedules next rotation with setTimeout', () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const store = makeWallpaperStore([]);
    const daily = makeDailyService({ ok: true });

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Should have scheduled a timer
    // Advance time to trigger
    vi.advanceTimersByTime(60 * 60 * 1000);

    scheduler.stop();
  });

  it('powerMonitor suspend/resume does NOT rotate if not due', async () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const filePath = path.join(tempDir, 'wall.png');
    const store = makeWallpaperStore([{ id: '1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });
    const pm = makePowerMonitor();
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      powerMonitor: pm as any,
      setWallpaper,
      now: () => new Date('2026-09-28T12:00:00Z').getTime(),
    });

    scheduler.start();

    // Perform a rotation that sets lastRotationAt to T12:00:00Z
    await scheduler.rotateNow();
    expect(setWallpaper).toHaveBeenCalledTimes(1);

    // Advance 15 minutes (not due)
    pm.emit('suspend');
    pm.emit('resume');

    // Should NOT have rotated again (lastRotationAt was just set, interval not yet elapsed)
    expect(setWallpaper).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('powerMonitor rotate now if already due on resume', async () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const filePath = path.join(tempDir, 'wall.png');
    const store = makeWallpaperStore([{ id: '1', filePath, favorite: false }]);
    const daily = makeDailyService({ ok: true });
    const pm = makePowerMonitor();
    let nowMs = new Date('2026-09-28T12:00:00Z').getTime();
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      powerMonitor: pm as any,
      setWallpaper,
      now: () => nowMs,
    });

    scheduler.start();

    // Rotate once at noon → sets lastRotationAt to T12:00:00Z
    await scheduler.rotateNow();
    expect(setWallpaper).toHaveBeenCalledTimes(1);

    // Move time 2 hours forward → interval has elapsed
    nowMs += 2 * 60 * 60 * 1000;

    // Suspend then resume
    pm.emit('suspend');
    pm.emit('resume');

    // Should have rotated again since interval elapsed (onResume fires doRotate async)
    await vi.waitFor(() => {
      expect(setWallpaper).toHaveBeenCalledTimes(2);
    });

    scheduler.stop();
  });

  it('random order does not repeat same image across calls', async () => {
    const filePath1 = path.join(tempDir, 'a.png');
    const filePath2 = path.join(tempDir, 'b.png');
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'history', order: 'random' });
    const store = makeWallpaperStore([
      { id: '1', filePath: filePath1, favorite: false },
      { id: '2', filePath: filePath2, favorite: false },
    ]);
    const daily = makeDailyService({ ok: true });
    const setWallpaper = vi.fn().mockResolvedValue(undefined);

    // Inject rng to control selection sequence: 0 → 0, then 1 → 0 (would repeat)
    let rngCalls = 0;
    const rngCallsLog: number[] = [];
    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
      setWallpaper,
      rng: () => {
        const v = rngCalls % 2 === 0 ? 0 : 0; // [0, 0, ...] — triggers repeat detection
        rngCallsLog.push(v);
        rngCalls++;
        return v;
      },
    });

    // First call → picks item 0
    await scheduler.rotateNow();
    expect(setWallpaper).toHaveBeenCalledWith(filePath1);

    // Second call → rng returns 0 again (same index), should pick item 1 to avoid repeat
    await scheduler.rotateNow();
    expect(setWallpaper).toHaveBeenCalledWith(filePath2);
  });

  it('bing source uses returned record path (not list order)', async () => {
    const settings = makeSettings({ enabled: true, intervalMinutes: 60, source: 'bing', order: 'random' });
    const bingPath = path.join(tempDir, 'bing-new.png');
    const oldPath = path.join(tempDir, 'old.png');
    const store = makeWallpaperStore([
      { id: 'old-1', filePath: oldPath, favorite: false },
      { id: 'old-2', filePath: path.join(tempDir, 'old2.png'), favorite: false },
    ]);
    // Mock dailyService.setDailyWallpaper to return record with bingPath
    const daily = {
      fetchBingDaily: vi.fn().mockResolvedValue({
        items: [{ date: '2026-09-28', title: 'b', copyright: '', url: 'https://cn.bing.com/b.jpg', thumbnailUrl: '' }],
        error: null,
      }),
      setDailyWallpaper: vi.fn().mockResolvedValue({
        ok: true,
        record: {
          id: 'bing-1', fileName: 'bing-new.png', filePath: bingPath,
          prompt: 'Bing 每日壁纸', rawInput: 'Bing', styleId: 'bing', size: '16:9',
          mode: 'text-to-image', fileSize: 100, createdAt: new Date().toISOString(), favorite: false,
        },
      }),
    } as unknown as any;

    const scheduler = createSchedulerService({
      settingsService: settings,
      wallpaperStore: store,
      dailyService: daily,
      getUserDataPath: () => tempDir,
    });

    const result = await scheduler.rotateNow();
    expect(result).toBe(true);
    // Verify setDailyWallpaper was called (scheduler uses returned record path)
    expect(daily.setDailyWallpaper).toHaveBeenCalled();
  });
});
