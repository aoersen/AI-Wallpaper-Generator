/**
 * Aurora Wallpaper — 领域类型定义
 *
 * 字段设计依据：
 * - finalGoal.md 检查清单（设置持久化、20 张历史上限、批量 1~4 张、重试、图生图 base64 等）
 * - qwen-image-video-api.md（size 为宽高比字符串、baseURL 默认值、非流式调用、URL 时效性）
 */

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

/** 应用设置（持久化到 userData/settings.json） */
export interface AppSettings {
  /** Chat2API 兼容接口 Base URL，默认 https://www.likegpt.top/v1 */
  baseURL: string;
  /** API Key（c2a_xxx），未配置时生成请求应返回中文引导提示 */
  apiKey: string;
  /** 单张生成失败自动重试次数（0~3，默认 2，即最多 3 次尝试） */
  retryLimit: number;
  /** 重试间隔毫秒（默认 2000，≥1500） */
  retryIntervalMs: number;
  /** 请求超时毫秒（默认 120000，≥120s） */
  requestTimeoutMs: number;
}

export const DEFAULT_BASE_URL = 'https://www.likegpt.top/v1';

export const DEFAULT_SETTINGS: AppSettings = {
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  retryLimit: 2,
  retryIntervalMs: 2000,
  requestTimeoutMs: 120_000,
};

/** 设置读取结果 */
export interface SettingsPayload {
  settings: AppSettings;
}

/** 设置保存请求 */
export interface SaveSettingsRequest {
  settings: AppSettings;
}

/** 设置保存结果 */
export interface SaveSettingsResult {
  ok: boolean;
  settings: AppSettings;
}

/* ------------------------------------------------------------------ */
/* 生成请求与结果                                                       */
/* ------------------------------------------------------------------ */

/** 图片宽高比（size 参数仅支持宽高比字符串，不支持像素值） */
export type ImageAspectRatio = '16:9' | '16:10' | '4:3' | '3:2' | '1:1';

/** 生成模式 */
export type GenerateMode = 'text-to-image' | 'image-to-image';

/** 图生图参考图（本地文件转 base64 data URI，见 API 文档 §2.5） */
export interface ReferenceImage {
  /** 壁纸记录 id（历史图库中的记录） */
  recordId: string;
  /** 本地文件绝对路径 */
  filePath: string;
}

/** 单次生成请求（一张图） */
export interface GenerateRequest {
  /** 完善后的生图提示词 */
  prompt: string;
  /** 原始用户输入（未经完善的描述） */
  rawInput: string;
  /** 风格模板 id */
  styleId: string;
  /** 宽高比（自动取当前主屏宽高比，如 "16:9"） */
  size: ImageAspectRatio;
  /** 生成模式：文生图 / 图生图 */
  mode: GenerateMode;
  /** 图生图参考图列表（mode 为 image-to-image 时有效） */
  references: ReferenceImage[];
}

/** 单张生成结果 */
export interface GenerateResult {
  /** 是否成功 */
  ok: boolean;
  /** 成功时：生成的图片 URL（有时效性，需立即下载转存） */
  imageUrl?: string;
  /** 成功且已转存时：本地文件绝对路径 */
  localPath?: string;
  /** 失败时的中文错误信息 */
  error?: string;
  /** 本张实际尝试次数（含重试） */
  attempts: number;
}

/** 批量生成进度事件（主进程 → 渲染进程推送） */
export interface GenerateProgress {
  /** 批次内序号（0 起） */
  index: number;
  /** 批量总数 */
  total: number;
  /** 当前状态 */
  status: 'pending' | 'requesting' | 'retrying' | 'downloading' | 'done' | 'failed';
  /** 已尝试次数 */
  attempts: number;
  /** 状态说明（如「第 2 次重试中…」） */
  message?: string;
}

/* ------------------------------------------------------------------ */
/* 壁纸记录与历史                                                       */
/* ------------------------------------------------------------------ */

/** 壁纸记录（userData/wallpapers/index.json 中的一条） */
export interface WallpaperRecord {
  /** 唯一 id（时间戳+随机后缀） */
  id: string;
  /** 本地文件名（位于 userData/wallpapers/ 下） */
  fileName: string;
  /** 本地文件绝对路径 */
  filePath: string;
  /** 生成时的提示词（完善后） */
  prompt: string;
  /** 原始描述（用户输入） */
  rawInput: string;
  /** 风格模板 id */
  styleId: string;
  /** 宽高比 */
  size: ImageAspectRatio;
  /** 生成模式 */
  mode: GenerateMode;
  /** 文件字节大小 */
  fileSize: number;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
}

/** 历史列表响应 */
export interface HistoryPayload {
  records: WallpaperRecord[];
}

/** 历史清理请求（删除指定记录） */
export interface DeleteHistoryRequest {
  ids: string[];
}

/** 历史清理结果 */
export interface DeleteHistoryResult {
  ok: boolean;
  deleted: string[];
}

/** 壁纸下载/转存请求（生成成功后立即转存，URL 有时效性） */
export interface DownloadWallpaperRequest {
  imageUrl: string;
  prompt: string;
  rawInput: string;
  styleId: string;
  size: ImageAspectRatio;
  mode: GenerateMode;
}

/** 壁纸下载/转存结果 */
export interface DownloadWallpaperResult {
  ok: boolean;
  record?: WallpaperRecord;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* 壁纸设置                                                            */
/* ------------------------------------------------------------------ */

/** 设置桌面壁纸请求 */
export interface SetWallpaperRequest {
  /** 本地图片绝对路径 */
  filePath: string;
}

/** 设置桌面壁纸结果 */
export interface SetWallpaperResult {
  ok: boolean;
  /** 失败时的中文错误信息（含平台命令输出/退出码） */
  error?: string;
}

/* ------------------------------------------------------------------ */
/* 平台与屏幕信息                                                       */
/* ------------------------------------------------------------------ */

/** 平台信息 */
export interface PlatformInfo {
  /** darwin | win32 | linux */
  platform: NodeJS.Platform;
  /** 是否为受支持平台 */
  supported: boolean;
}

/** 屏幕信息 */
export interface ScreenInfo {
  /** 主屏宽度（物理像素） */
  width: number;
  /** 主屏高度（物理像素） */
  height: number;
  /** 缩放因子 */
  scaleFactor: number;
  /** 由宽高比换算出的 size 字符串（如 "16:9"） */
  aspectRatio: ImageAspectRatio;
}

/* ------------------------------------------------------------------ */
/* 通用                                                                */
/* ------------------------------------------------------------------ */

/** 通用 IPC 错误响应 */
export interface IpcError {
  ok: false;
  error: string;
}

/* ------------------------------------------------------------------ */
/* 每日图片（Bing 每日壁纸 + AI 每日主题）                                */
/* ------------------------------------------------------------------ */

/** Bing 每日壁纸条目 */
export interface BingDailyItem {
  /** 本地日期显示，如 2026-09-28 */
  date: string;
  /** 壁纸标题（如"连绵起伏的群山"） */
  title: string;
  /** 版权/出处说明 */
  copyright: string;
  /** 图片完整 URL（https://cn.bing.com + path） */
  url: string;
  /** 缩略图 URL（小图，卡片用） */
  thumbnailUrl: string;
}

/** AI 每日主题条目 */
export interface DailyTheme {
  /** 稳定 slug，如 "misty-mountains" */
  id: string;
  /** 中文主题名，如 "雾隐青山" */
  name: string;
  /** 主题描述/提示词主题句（中文，喂给 promptEngine 前的原始主题句） */
  description: string;
  /** 主题图标类型（UI 用，UI 完全自定义映射） */
  icon: string;
}

/** daily:list 响应 */
export interface DailyListResult {
  /** Bing 每日壁纸（近 8 天，含今天；拉取失败时为空数组，UI 显示重试） */
  bing: BingDailyItem[];
  /** 今日 AI 主题（6 个，确定性轮换） */
  themes: DailyTheme[];
  /** Bing 拉取是否出错过（用于 UI 提示） */
  bingError: string | null;
}

/** daily:set-wallpaper 请求（下载 Bing 每日壁纸并设为桌面壁纸） */
export interface SetDailyWallpaperRequest {
  /** Bing 图片完整 URL（必须命中 cn.bing.com / s.cn.bing.net 白名单前缀） */
  url: string;
  /** 保存文件名（UI 传入，用于展示与去重） */
  fileName: string;
}

/* ------------------------------------------------------------------ */
/* 提示词引擎相关类型（UI 使用）                                          */
/* ------------------------------------------------------------------ */

/** 会话上下文：同批次生成的 keywords/style 可作为 context 传入 enhance */
export interface SessionContext {
  keywords: string[];
  styleId?: string;
}

/** 完善后的提示词结果 */
export interface EnhancedPrompt {
  /** 原始输入（清洗后） */
  raw: string;
  /** 完善后的提示词 */
  enhanced: string;
  /** 风格模板 id */
  styleId: string;
  /** 风格模板中文标签 */
  styleLabel: string;
  /** 提取的关键词 */
  keywords: string[];
  /** 生成时间（ISO 字符串） */
  timestamp: string;
}

/** 提示词编辑史条目 */
export interface PromptHistoryEntry {
  id: string;
  text: string;
  savedAt: string;
}
