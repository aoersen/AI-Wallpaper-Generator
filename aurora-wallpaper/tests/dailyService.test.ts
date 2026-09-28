/**
 * Aurora Wallpaper — 每日图片服务测试（phase-1a / fix-p0-1）
 *
 * 覆盖契约 §4 要求的场景：
 * 1. Bing 响应解析正确（urlbase→UHD 拼接 / url 回退 / 缩略图规则 / enddate 格式化 / 坏条目过滤）；
 * 2. dayIndex 确定性：同日任意时刻结果一致，跨自然日轮换；
 * 3. 缓存命中：30 分钟内第二次调用不重复发请求，过期后重新拉取；
 * 4. 网络失败：bingError 非空且 bing=[]，绝不抛异常；
 * 5. 白名单外 URL 拒绝（防 SSRF / 越权写）；
 * 6. 默认传输层确实委托 qwenHttp.performRequest（vi.mock 验证）。
 *
 * 传输层通过 DailyServiceDeps.request 注入假实现（不依赖真实网络/二进制），
 * 固定 now 注入，断言不随真实时间漂移。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// vi.mock qwenHttp：默认传输层用例需要；同时防止任何未注入 request 的服务
// 意外 spawn 真实 pq-client 二进制发起网络请求。
vi.mock('../src/main/services/qwenHttp', () => ({
  performRequest: vi.fn(),
}));

// vi.mock wallpaperSetter：setDailyWallpaper 内部动态 import 该模块，
// 若不 mock，测试将真的调 PowerShell / osascript 修改用户桌面壁纸。
vi.mock('../src/main/services/wallpaperSetter', () => ({
  setWallpaper: vi.fn().mockResolvedValue(undefined),
}));

import { performRequest } from '../src/main/services/qwenHttp';
import { setWallpaper } from '../src/main/services/wallpaperSetter';
import { createDailyService, type DailyServiceDeps } from '../src/main/services/dailyService';
import { createWallpaperStore } from '../src/main/services/wallpaperStore';
import { IPC } from '../src/shared/ipc';
import {
  DAILY_THEME_COUNT,
  MONTHLY_THEME_POOLS,
  getBeijingDayIndex,
  getDailyThemes,
} from '../src/shared/dailyThemes';

/** 固定测试时间：2026-09-28T04:00:00Z（北京时间当日 12:00，自然日 2026-09-28） */
const FIXED_NOW_MS = Date.UTC(2026, 8, 28, 4, 0, 0);

/** 与 FIXED_NOW_MS 同一自然日的另一时刻（北京时间 23:59）同属一天 */
const SAME_DAY_LATE_MS = Date.UTC(2026, 8, 28, 15, 59, 0);

/** 次日时刻：北京时间 2026-09-29 00:30 */
const NEXT_DAY_MS = Date.UTC(2026, 8, 28, 16, 30, 0);

/** 2026-09-28（北京时间）自然日相对 1970-01-01 的天数（手工核算基准） */
const EXPECTED_DAY_INDEX = 20724;

/**
 * 构造 HPImageArchive JSON 响应体（真实 API 形状：urlbase + url）。
 *
 * 含一条 urlbase/url 均缺失的坏条目（应被过滤），
 * 以及一条仅含 url 字段的条目（测试 url 回退路径）。
 */
function makeArchiveBody(): string {
  return JSON.stringify({
    images: [
      {
        urlbase: '/th?id=OHR.MountainCN_ZH-CN1234',
        title: '连绵起伏的群山',
        copyright: '某某山脉 (© 某某摄影)',
        enddate: '20260928',
      },
      {
        // 仅 url 无 urlbase：测试回退路径
        url: '//s.cn.bing.net/th?id=OHR.LakeCN_ZH-CN5678',
        title: '静谧湖泊',
        copyright: '某湖 (© 某某)',
        enddate: '20260927',
      },
      { title: '坏条目', copyright: 'x', enddate: '20260926' },
    ],
  });
}

describe('getBeijingDayIndex · 北京时间自然日序号', () => {
  it('同日不同时刻 dayIndex 相同（确定性）', () => {
    expect(getBeijingDayIndex(FIXED_NOW_MS)).toBe(getBeijingDayIndex(SAME_DAY_LATE_MS));
  });

  it('跨自然日 dayIndex +1（北京时间 0 点切换）', () => {
    expect(getBeijingDayIndex(NEXT_DAY_MS)).toBe(getBeijingDayIndex(FIXED_NOW_MS) + 1);
  });

  it('北京时间 0 点边界：UTC 15:59:999 属前一天，16:00:00 属当天', () => {
    const before = Date.UTC(2026, 8, 28, 15, 59, 59, 999);
    const at = Date.UTC(2026, 8, 28, 16, 0, 0);
    expect(getBeijingDayIndex(at)).toBe(getBeijingDayIndex(before) + 1);
  });

  it('与 Date.UTC 核算的基准值一致（2026-09-28 北京时间 = 20724）', () => {
    expect(getBeijingDayIndex(FIXED_NOW_MS)).toBe(EXPECTED_DAY_INDEX);
  });
});

describe('MONTHLY_THEME_POOLS · 主题池结构', () => {
  it('12 个月、每月 ≥ 12 个主题、每日取 6 个', () => {
    expect(MONTHLY_THEME_POOLS).toHaveLength(12);
    for (const pool of MONTHLY_THEME_POOLS) {
      expect(pool.length).toBeGreaterThanOrEqual(12);
      expect(new Set(pool.map((t) => t.id)).size).toBe(pool.length); // 月内 id 唯一
    }
  });

  it('覆盖 ≥ 8 个类别（山川/湖海/星空/城市/国风/萌宠/节气/抽象等）', () => {
    const icons = new Set(MONTHLY_THEME_POOLS.flat().map((t) => t.icon));
    expect(icons.size).toBeGreaterThanOrEqual(8);
  });

  it('主题 id 全局唯一（跨月份不冲突）', () => {
    const ids = MONTHLY_THEME_POOLS.flat().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getDailyThemes · 主题轮换', () => {
  it('同日任意时刻结果恒定（确定性），且恰为 6 个不重复', () => {
    const a = getDailyThemes(FIXED_NOW_MS);
    const b = getDailyThemes(SAME_DAY_LATE_MS);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DAILY_THEME_COUNT);
    expect(new Set(a.map((t) => t.id)).size).toBe(DAILY_THEME_COUNT);
  });

  it('起始主题 = 当月池[dayIndex % 池长]，次日偏移 +1', () => {
    const month = 8; // 九月池（下标 8）
    const pool = MONTHLY_THEME_POOLS[month];
    const today = getDailyThemes(FIXED_NOW_MS);
    const tomorrow = getDailyThemes(NEXT_DAY_MS);
    expect(today[0]).toBe(pool[EXPECTED_DAY_INDEX % pool.length]);
    expect(tomorrow[0]).toBe(pool[(EXPECTED_DAY_INDEX + 1) % pool.length]);
  });

  it('取出的主题均来自当月池', () => {
    const pool = MONTHLY_THEME_POOLS[8];
    for (const theme of getDailyThemes(FIXED_NOW_MS)) {
      expect(pool).toContain(theme);
    }
  });
});

describe('createDailyService.fetchBingDaily', () => {
  it('解析 HPImageArchive 响应：urlbase→UHD 拼接、url 回退、缩略图、enddate 格式化、坏条目过滤', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: makeArchiveBody() });
    const { service } = makeService(request);

    const { items, error } = await service.fetchBingDaily();

    expect(error).toBeNull();
    expect(items).toHaveLength(2);
    // urlbase 拼 UHD：https://cn.bing.com + urlbase + _UHD.jpg
    expect(items[0]).toEqual({
      date: '2026-09-28',
      title: '连绵起伏的群山',
      copyright: '某某山脉 (© 某某摄影)',
      url: 'https://cn.bing.com/th?id=OHR.MountainCN_ZH-CN1234_UHD.jpg',
      thumbnailUrl: 'https://cn.bing.com/th?id=OHR.MountainCN_ZH-CN1234_800x480.jpg',
    });
    // url 回退：protocol-relative → https + url，缩略图追加 _w=400
    expect(items[1]).toEqual({
      date: '2026-09-27',
      title: '静谧湖泊',
      copyright: '某湖 (© 某某)',
      url: 'https://s.cn.bing.net/th?id=OHR.LakeCN_ZH-CN5678',
      thumbnailUrl: 'https://s.cn.bing.net/th?id=OHR.LakeCN_ZH-CN5678&_w=400',
    });
  });

  it('url 字段为 / 相对路径时也能正确规范化', async () => {
    const body = JSON.stringify({
      images: [
        {
          url: '/th?id=OHR.RelativePath_ZH-CN9999',
          title: '相对路径测试',
          copyright: '© test',
          enddate: '20260928',
        },
      ],
    });
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: body });
    const { service } = makeService(request);

    const { items } = await service.fetchBingDaily();
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://cn.bing.com/th?id=OHR.RelativePath_ZH-CN9999');
  });

  it('缓存命中：30 分钟内第二次调用不重复请求，过期后重新拉取', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: makeArchiveBody() });
    const { service, advance } = makeService(request);

    await service.fetchBingDaily();
    expect(request).toHaveBeenCalledTimes(1);

    await service.fetchBingDaily();
    expect(request).toHaveBeenCalledTimes(1); // 命中缓存

    advance(31 * 60 * 1000); // 超过 30 分钟 TTL
    await service.fetchBingDaily();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('HTTP 非 2xx 视为失败：bingError 非空且 bing=[]，不抛异常', async () => {
    const request = vi.fn().mockResolvedValue({ status: 503, bodyText: 'unavailable' });
    const { service } = makeService(request);

    const { items, error } = await service.fetchBingDaily();

    expect(items).toEqual([]);
    expect(error).toBe('网络错误或服务不可用');
  });

  it('传输层拒绝（网络异常）时同样兜底为错误结果', async () => {
    const request = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));
    const { service } = makeService(request);

    const { items, error } = await service.fetchBingDaily();

    expect(items).toEqual([]);
    expect(error).toBe('网络错误或服务不可用');
  });

  it('响应 JSON 非法（images 缺失）时兜底为错误结果且不抛异常', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: '{"foo":1}' });
    const { service } = makeService(request);

    const { items, error } = await service.fetchBingDaily();

    expect(items).toEqual([]);
    expect(error).toBe('网络错误或服务不可用');
  });

  it('urlbase 拼出的 UHD URL 以 https://cn.bing.com 开头且通过白名单校验', async () => {
    const body = JSON.stringify({
      images: [
        {
          urlbase: '/th?id=OHR.WhitelistTest_ZH-CN0001',
          title: '白名单校验测试',
          copyright: '© test',
          enddate: '20260928',
        },
      ],
    });
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: body });
    const { service } = makeService(request);

    const { items } = await service.fetchBingDaily();
    expect(items).toHaveLength(1);
    // urlbase 拼 UHD 必须落在白名单 cn.bing.com 前缀下
    expect(items[0].url.startsWith('https://cn.bing.com/')).toBe(true);
    expect(items[0].url).toContain('_UHD.jpg');
  });

  it('默认传输层委托 qwenHttp.performRequest（vi.mock 验证）', async () => {
    const mocked = vi.mocked(performRequest);
    mocked.mockResolvedValue({ status: 200, bodyText: makeArchiveBody() });

    const service = createDailyService({
      wallpaperStore: createWallpaperStore(tmpDir()),
      now: () => FIXED_NOW_MS,
      // 故意不注入 request：验证默认实现走 qwenHttp.performRequest
    });

    const { items, error } = await service.fetchBingDaily();
    expect(error).toBeNull();
    expect(items).toHaveLength(2);
    expect(
      mocked,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN',
      }),
    );
  });
});

describe('createDailyService.listDaily', () => {
  it('组装 { bing, themes, bingError }：Bing 成功 + 当月 6 个主题', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, bodyText: makeArchiveBody() });
    const { service } = makeService(request);

    const result = await service.listDaily();

    expect(result.bing).toHaveLength(2);
    expect(result.bingError).toBeNull();
    expect(result.themes).toEqual(getDailyThemes(FIXED_NOW_MS));
    expect(result.themes).toHaveLength(DAILY_THEME_COUNT);
  });

  it('Bing 失败时 themes 仍正常返回（本地计算不受网络影响）', async () => {
    const request = vi.fn().mockRejectedValue(new Error('boom'));
    const { service } = makeService(request);

    const result = await service.listDaily();

    expect(result.bing).toEqual([]);
    expect(result.bingError).toBe('网络错误或服务不可用');
    expect(result.themes).toHaveLength(DAILY_THEME_COUNT);
  });
});

describe('createDailyService.setDailyWallpaper · URL 白名单与全链路', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-daily-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('非白名单 URL 直接拒绝，不发起下载也不设置壁纸', async () => {
    const request = vi.fn();
    const store = createWallpaperStore(tmpRoot);
    const service = createDailyService({ wallpaperStore: store, now: () => FIXED_NOW_MS, request });

    const denied = [
      'http://cn.bing.com/th?id=1', // http 明文拒绝
      'https://evil.com/th?id=1', // 外域
      'https://cn.bing.com.evil.com/x', // 前缀伪装（点号续接）
      'https://s.cn.bing.net.evil.com/1', // 前缀伪装（点号续接）
      'file:///C:/Windows/win.ini', // 本地协议
      '',
    ];
    for (const url of denied) {
      const result = await service.setDailyWallpaper({ url, fileName: 'x.jpg' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('不支持的图片来源');
    }
    expect(request).not.toHaveBeenCalled();
    expect(setWallpaper).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
  });

  it('白名单 URL：下载 → 转存 wallpapers 目录 → 设置壁纸（全链路成功）', async () => {
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakePng, { status: 200, headers: { 'content-type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const store = createWallpaperStore(tmpRoot);
    const service = createDailyService({
      wallpaperStore: store,
      now: () => FIXED_NOW_MS,
      request: vi.fn(),
    });

    const result = await service.setDailyWallpaper({
      url: 'https://s.cn.bing.net/th?id=OHR.Test_ZH-CN_uhd.jpg',
      fileName: 'OHR.Test_ZH-CN_uhd.jpg',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://s.cn.bing.net/th?id=OHR.Test_ZH-CN_uhd.jpg');
    expect(setWallpaper).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(1); // 复用既有壁纸库目录体系
  });

  it('下载失败（HTTP 404）返回失败且不设置壁纸', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('not found', { status: 404 })),
    );

    const store = createWallpaperStore(tmpRoot);
    const service = createDailyService({
      wallpaperStore: store,
      now: () => FIXED_NOW_MS,
      request: vi.fn(),
    });

    const result = await service.setDailyWallpaper({
      url: 'https://cn.bing.com/th?id=OHR.Missing_ZH-CN.jpg',
      fileName: 'missing.jpg',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('下载失败');
    expect(setWallpaper).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(0);
  });
});

describe('IPC 契约一致性', () => {
  it('daily 通道常量与契约一致', () => {
    expect(IPC.DAILY_LIST).toBe('daily:list');
    expect(IPC.DAILY_SET_WALLPAPER).toBe('daily:set-wallpaper');
  });
});

/* ------------------------------------------------------------------ */
/* 测试辅助                                                            */
/* ------------------------------------------------------------------ */

/** 构造临时目录（默认传输层用例使用，无独立生命周期管理） */
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-daily-'));
}

/** 构造带假传输层 + 固定时钟的服务，返回 service 与推进时钟方法 */
function makeService(
  request: NonNullable<DailyServiceDeps['request']>,
  nowMs: number = FIXED_NOW_MS,
): { service: ReturnType<typeof createDailyService>; advance(ms: number): void } {
  let current = nowMs;
  const service = createDailyService({
    wallpaperStore: createWallpaperStore(tmpDir()),
    now: () => current,
    request,
  });
  return {
    service,
    advance(ms: number): void {
      current += ms;
    },
  };
}
