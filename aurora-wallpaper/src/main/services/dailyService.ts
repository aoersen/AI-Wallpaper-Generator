/**
 * Aurora Wallpaper — 每日图片服务
 *
 * 职责（契约 §4）：
 * 1. fetchBingDaily：经 pq-client（qwenHttp.performRequest）拉取 Bing 中国区
 *    每日壁纸 JSON（HPImageArchive），解析为 BingDailyItem[]，内存缓存 30 分钟，
 *    任何失败都不抛异常（返回错误信息由 UI 提示重试）；
 * 2. listDaily：组装 { bing, themes, bingError }（themes 纯本地确定性计算）；
 * 3. setDailyWallpaper：URL 白名单（cn.bing.com / s.cn.bing.net 前缀）校验后，
 *    经 wallpaperStore 复用既有下载目录体系转存，再调用 wallpaperSetter 设壁纸。
 *
 * 关于下载通道的说明：pq-client 的 stdin/stdout 协议为 JSON 文本（Go 端
 * string(bodyBytes) 经 JSON marshal），无法无损承载 JPEG 二进制字节，
 * 因此 HPImageArchive JSON 走 pq-client，图片字节复用 wallpaperStore
 * 内置 fetch（与既有 AI 生成图下载同通道、同为受信域白名单校验后的 URL）。
 */

import type { BingDailyItem, DailyListResult, SetWallpaperResult } from '../../shared/types';
import { getDailyThemes } from '../../shared/dailyThemes';
import { performRequest } from './qwenHttp';
import type { WallpaperStore } from './wallpaperStore';

/** Bing HPImageArchive 接口地址（中国区，近 8 天，JSON 格式） */
const BING_API_URL = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN';

/** Bing 大图拼接基础域名（urlbase 拼接用） */
const BING_IMAGE_ORIGIN = 'https://cn.bing.com';

/** 缩略图分辨率（urlbase 替换后缀规则） */
const BING_THUMB_SIZE = '_800x480.jpg';

/** 大图分辨率（urlbase 替换后缀规则） */
const BING_UHD_SIZE = '_UHD.jpg';

/** 备用 URL 宽度参数（url 字段回退拼接） */
const BING_THUMB_WIDTH = 400;

/** Bing 响应缓存的 TTL（毫秒） */
const BING_CACHE_TTL_MS = 30 * 60 * 1000;

/** 网络请求超时时间（毫秒） */
const BING_REQUEST_TIMEOUT_MS = 20 * 1000;

/** 允下载的图片 URL 前缀白名单（防 SSRF / 越权写） */
const ALLOWED_URL_PREFIXES = ['https://cn.bing.com/', 'https://s.cn.bing.net/'];

/** Bing 日历条目缺失/出错时返回的兜底错误文案（契约 §4 固定文案） */
const BING_ERROR_MESSAGE = '网络错误或服务不可用';

/* ------------------------------------------------------------------ */
/* Bing 响应结构（HPImageArchive，仅声明用到的字段）                      */
/* ------------------------------------------------------------------ */

/** HPImageArchive 接口返回的 images 数组元素（真实字段：urlbase + url） */
interface BingArchiveImage {
  /** 图片基础路径，拼接 _UHD.jpg 得到高清大图 */
  urlbase?: string;
  /** 图片完整访问 URL（protocol-relative 或相对路径，urlbase 缺失时回退） */
  url?: string;
  /** 标题 */
  title?: string;
  /** 版权信息 */
  copyright?: string;
  /** 结束日期，格式 YYYYMMDD（北京时间） */
  enddate?: string;
}

/** HPImageArchive 接口响应 */
interface BingArchiveResponse {
  images?: BingArchiveImage[];
}

/** 内存缓存条目 */
interface BingCacheEntry {
  /** 缓存写入时间戳（毫秒） */
  fetchedAt: number;
  items: BingDailyItem[];
  error: string | null;
}

/* ------------------------------------------------------------------ */
/* 服务工厂                                                            */
/* ------------------------------------------------------------------ */

/** 每日图片服务依赖（由主进程组装时注入，便于测试替换 now/传输层） */
export interface DailyServiceDeps {
  wallpaperStore: WallpaperStore;
  /** 当前时间（默认 Date.now，测试注入固定值） */
  now?: () => number;
  /** HTTP 传输层（默认 qwenHttp.performRequest，测试用 vi.mock 替换整个模块） */
  request?: (input: { url: string; timeoutMs: number }) => Promise<{ status: number; bodyText: string }>;
}

/** 每日图片服务 */
export interface DailyService {
  /** 拉取 Bing 每日壁纸（带 30 分钟内存缓存；失败不抛异常） */
  fetchBingDaily(): Promise<{ items: BingDailyItem[]; error: string | null }>;
  /** 组装 daily:list 响应（Bing + 今日主题） */
  listDaily(): Promise<DailyListResult>;
  /** 下载 Bing 每日壁纸并设置桌面壁纸 */
  setDailyWallpaper(req: { url: string; fileName: string }): Promise<SetWallpaperResult>;
}

/**
 * 创建每日图片服务。
 *
 * @param deps 依赖注入（wallpaperStore 必填；now/request 供单测替换）
 */
export function createDailyService(deps: DailyServiceDeps): DailyService {
  const { wallpaperStore } = deps;
  const now: () => number = deps.now ?? Date.now;
  const request =
    deps.request ??
    ((input: { url: string; timeoutMs: number }): Promise<{ status: number; bodyText: string }> =>
      performRequest({ url: input.url, apiKey: '', body: {}, timeoutMs: input.timeoutMs }));

  /** Bing 内存缓存（单例字段；缓存失败结果以避免短时间反复打网络） */
  let bingCache: BingCacheEntry | null = null;

  /** 规范化 url 字段：protocol-relative → https + url、/ 相对路径 → 拼域名 */
  function normalizeUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BING_IMAGE_ORIGIN + url;
    return url;
  }

  /** urlbase 拼出大图 UHD URL */
  function toUhdUrl(urlbase: string | undefined): string {
    if (!urlbase) return '';
    return `${BING_IMAGE_ORIGIN}${urlbase}${BING_UHD_SIZE}`;
  }

  /** urlbase 拼出缩略图 URL */
  function toThumbnailFromUrlbase(urlbase: string | undefined): string {
    if (!urlbase) return '';
    return `${BING_IMAGE_ORIGIN}${urlbase}${BING_THUMB_SIZE}`;
  }

  /** url 字段拼出缩略图（追加 _w= 宽度参数） */
  function toThumbnailFromUrl(url: string | undefined): string {
    if (!url) return '';
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_w=${BING_THUMB_WIDTH}`;
  }

  /** enddate（YYYYMMDD）→ YYYY-MM-DD；非法输入返回空串 */
  function formatEndDate(enddate: string | undefined): string {
    if (!enddate || !/^\d{8}$/.test(enddate)) return '';
    return `${enddate.slice(0, 4)}-${enddate.slice(4, 6)}-${enddate.slice(6, 8)}`;
  }

  /** 解析 HPImageArchive JSON 文本为条目列表；文本非法时抛异常（由调用方兜底） */
  function parseArchiveResponse(bodyText: string): BingDailyItem[] {
    const parsed = JSON.parse(bodyText) as BingArchiveResponse;
    if (!parsed || !Array.isArray(parsed.images)) {
      throw new Error('响应格式错误');
    }
    const items: BingDailyItem[] = [];
    for (const img of parsed.images) {
      let fullUrl: string;
      let thumbUrl: string;
      // 优先用 urlbase 拼 UHD 大图与高分辨率缩略图；urlbase 缺失时回退 url 字段
      if (typeof img.urlbase === 'string' && img.urlbase.length > 0) {
        fullUrl = toUhdUrl(img.urlbase);
        thumbUrl = toThumbnailFromUrlbase(img.urlbase);
      } else if (typeof img.url === 'string' && img.url.length > 0) {
        const normalized = normalizeUrl(img.url);
        fullUrl = normalized;
        thumbUrl = toThumbnailFromUrl(normalized);
      } else {
        // urlbase / url 均缺失或为空 → 跳过无效条目
        continue;
      }
      items.push({
        date: formatEndDate(img.enddate),
        title: typeof img.title === 'string' ? img.title : '',
        copyright: typeof img.copyright === 'string' ? img.copyright : '',
        url: fullUrl,
        thumbnailUrl: thumbUrl,
      });
    }
    return items;
  }

  return {
    async fetchBingDaily(): Promise<{ items: BingDailyItem[]; error: string | null }> {
      // 1) 命中未过期缓存直接返回
      if (bingCache && now() - bingCache.fetchedAt < BING_CACHE_TTL_MS) {
        return { items: bingCache.items, error: bingCache.error };
      }

      // 2) 拉取（任何异常都转成错误结果，绝不抛出）
      let entry: BingCacheEntry;
      try {
        const res = await request({ url: BING_API_URL, timeoutMs: BING_REQUEST_TIMEOUT_MS });
        if (res.status < 200 || res.status >= 300) {
          entry = { fetchedAt: now(), items: [], error: BING_ERROR_MESSAGE };
        } else {
          entry = { fetchedAt: now(), items: parseArchiveResponse(res.bodyText), error: null };
        }
      } catch {
        entry = { fetchedAt: now(), items: [], error: BING_ERROR_MESSAGE };
      }

      bingCache = entry;
      return { items: entry.items, error: entry.error };
    },

    async listDaily(): Promise<DailyListResult> {
      const [{ items, error }, themes] = await Promise.all([
        this.fetchBingDaily(),
        Promise.resolve(getDailyThemes(now())),
      ]);
      return { bing: items, themes, bingError: error };
    },

    async setDailyWallpaper(req: { url: string; fileName: string }): Promise<SetWallpaperResult> {
      // 1) 白名单校验（防 SSRF / 越权写文件）
      const url = typeof req.url === 'string' ? req.url : '';
      if (!ALLOWED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
        return { ok: false, error: '不支持的图片来源：仅允许 Bing 中国区壁纸地址' };
      }

      try {
        // 2) 下载并转存到 userData/wallpapers 既有目录体系（记录主题元信息便于历史页展示）
        const record = await wallpaperStore.downloadAndStore(url, {
          prompt: `Bing 每日壁纸 · ${typeof req.fileName === 'string' ? req.fileName : ''}`.trim(),
          rawInput: 'Bing 每日壁纸',
          styleId: 'daily-bing',
          size: '16:9',
          mode: 'text-to-image',
        });

        // 3) 设置桌面壁纸（动态导入避免主进程启动即加载原生依赖）
        const { setWallpaper } = await import('./wallpaperSetter');
        await setWallpaper(record.filePath);

        return { ok: true, record };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
