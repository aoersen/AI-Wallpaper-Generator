/**
 * 渲染进程本地类型定义（替代从 shared 导入，化解路径深度与全局声明冲突）
 * 对应 src/shared/types.ts 的字段语义在 phase-1a 后保持一致
 */

export interface RotationSettings {
  enabled: boolean;
  intervalMinutes: number;
  source: 'bing' | 'history' | 'favorites';
  order: 'random' | 'newest';
}

export interface AppSettings {
  baseURL: string;
  apiKey: string;
  retryLimit: number;
  retryIntervalMs: number;
  requestTimeoutMs: number;
  /** 图片生成模型名，默认 qwen-image */
  model: string;
  /** 壁纸轮换设置 */
  rotation: RotationSettings;
}

export const DEFAULT_BASE_URL = 'https://www.likegpt.top/v1';

export const DEFAULT_SETTINGS: AppSettings = {
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  retryLimit: 2,
  retryIntervalMs: 2000,
  requestTimeoutMs: 120_000,
  model: 'qwen-image',
  rotation: {
    enabled: false,
    intervalMinutes: 60,
    source: 'bing',
    order: 'random',
  },
}

export interface SettingsPayload {
  settings: AppSettings;
}

export interface SaveSettingsRequest {
  settings: AppSettings;
}

export interface SaveSettingsResult {
  ok: boolean;
  settings: AppSettings;
}

export type ImageAspectRatio = '16:9' | '16:10' | '4:3' | '3:2' | '1:1';

export type GenerateMode = 'text-to-image' | 'image-to-image';

export interface ReferenceImage {
  recordId: string;
  filePath: string;
}

export interface GenerateRequest {
  prompt: string;
  rawInput: string;
  styleId: string;
  size: ImageAspectRatio;
  mode: GenerateMode;
  references: ReferenceImage[];
}

export interface GenerateResult {
  ok: boolean;
  imageUrl?: string;
  localPath?: string;
  error?: string;
  attempts: number;
}

export interface GenerateProgress {
  index: number;
  total: number;
  status: 'pending' | 'requesting' | 'retrying' | 'downloading' | 'done' | 'failed';
  attempts: number;
  message?: string;
}

export interface WallpaperRecord {
  id: string;
  fileName: string;
  filePath: string;
  prompt: string;
  rawInput: string;
  styleId: string;
  size: ImageAspectRatio;
  mode: GenerateMode;
  fileSize: number;
  createdAt: string;
  /** 是否收藏（v2 新增，默认 false） */
  favorite: boolean;
}

export interface HistoryPayload {
  records: WallpaperRecord[];
}

export interface DeleteHistoryRequest {
  ids: string[];
}

export interface DeleteHistoryResult {
  ok: boolean;
  deleted: string[];
}

export interface DownloadWallpaperRequest {
  imageUrl: string;
  prompt: string;
  rawInput: string;
  styleId: string;
  size: ImageAspectRatio;
  mode: GenerateMode;
}

export interface DownloadWallpaperResult {
  ok: boolean;
  record?: WallpaperRecord;
  error?: string;
}

export interface SetWallpaperRequest {
  filePath: string;
}

export interface SetWallpaperResult {
  ok: boolean;
  error?: string;
}

export interface PlatformInfo {
  platform: NodeJS.Platform;
  supported: boolean;
}

export interface ScreenInfo {
  width: number;
  height: number;
  scaleFactor: number;
  aspectRatio: ImageAspectRatio;
}

export interface ReadDataUrlResult {
  ok: boolean;
  dataUrl?: string;
  error?: string;
}

/** 切换收藏请求 */
export interface ToggleFavoriteRequest {
  id: string;
}

/** 切换收藏结果 */
export interface ToggleFavoriteResult {
  ok: boolean;
  favorite: boolean;
  /** 失败时的错误信息（如收藏已达上限 100 张） */
  error?: string;
}

export interface SessionContext {
  keywords: string[];
  styleId?: string;
}

export interface EnhancedPrompt {
  raw: string;
  enhanced: string;
  styleId: string;
  styleLabel: string;
  keywords: string[];
  timestamp: string;
}

export interface PromptHistoryEntry {
  id: string;
  text: string;
  savedAt: string;
}

// -------- 每日图片类型（1a 新增） --------
export interface BingDailyItem {
  date: string;
  title: string;
  copyright: string;
  url: string;
  thumbnailUrl: string;
}

export interface DailyTheme {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface DailyListResult {
  bing: BingDailyItem[];
  themes: DailyTheme[];
  bingError: string | null;
}
