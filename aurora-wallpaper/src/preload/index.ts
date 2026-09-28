/**
 * Aurora Wallpaper — preload 安全 IPC 桥
 *
 * contextIsolation 开启，通过 contextBridge 暴露类型化的 `window.aurora` API。
 * phase-1a：接入每日图片域（listDaily / setDailyWallpaper），其余通道此前已实现。
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  DailyListResult,
  DeleteHistoryResult,
  DownloadWallpaperResult,
  GenerateProgress,
  GenerateResult,
  HistoryPayload,
  PlatformInfo,
  SaveSettingsResult,
  ScreenInfo,
  SetDailyWallpaperRequest,
  SetWallpaperResult,
  SettingsPayload,
} from '../shared/types';
import type { DownloadWallpaperRequest, GenerateRequest, SaveSettingsRequest, SetWallpaperRequest } from '../shared/types';

/** 暴露给渲染进程的 API 形状 */
export interface AuroraApi {
  /* 设置 */
  getSettings(): Promise<SettingsPayload>;
  saveSettings(req: SaveSettingsRequest): Promise<SaveSettingsResult>;

  /* 生成 */
  generateImage(req: GenerateRequest): Promise<GenerateResult>;
  /** 订阅批量生成进度事件，返回取消订阅函数 */
  onGenerateProgress(listener: (progress: GenerateProgress) => void): () => void;

  /* 壁纸 */
  downloadWallpaper(req: DownloadWallpaperRequest): Promise<DownloadWallpaperResult>;
  setWallpaper(req: SetWallpaperRequest): Promise<SetWallpaperResult>;

  /* 每日图片（Bing 每日壁纸 + 今日 AI 主题） */
  /** 拉取每日图片数据：Bing 近 8 天壁纸 + 今日 6 个 AI 主题（确定性轮换） */
  listDaily(): Promise<DailyListResult>;
  /** 下载 Bing 每日壁纸并设为桌面壁纸（url 仅允许 cn.bing.com / s.cn.bing.net 前缀） */
  setDailyWallpaper(req: SetDailyWallpaperRequest): Promise<SetWallpaperResult>;

  /* 历史 */
  listHistory(): Promise<HistoryPayload>;
  deleteHistory(ids: string[]): Promise<DeleteHistoryResult>;

  /* 平台与屏幕 */
  getPlatform(): Promise<PlatformInfo>;
  getScreen(): Promise<ScreenInfo>;
}

const api: AuroraApi = {
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET) as Promise<SettingsPayload>,
  saveSettings: (req) => ipcRenderer.invoke(IPC.SETTINGS_SAVE, req) as Promise<SaveSettingsResult>,

  generateImage: (req) => ipcRenderer.invoke(IPC.GENERATE_IMAGE, req) as Promise<GenerateResult>,
  onGenerateProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: GenerateProgress): void => listener(progress);
    ipcRenderer.on(IPC.GENERATE_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC.GENERATE_PROGRESS, handler);
    };
  },

  downloadWallpaper: (req) => ipcRenderer.invoke(IPC.WALLPAPER_DOWNLOAD, req) as Promise<DownloadWallpaperResult>,
  setWallpaper: (req) => ipcRenderer.invoke(IPC.WALLPAPER_SET, req) as Promise<SetWallpaperResult>,

  listDaily: () => ipcRenderer.invoke(IPC.DAILY_LIST) as Promise<DailyListResult>,
  setDailyWallpaper: (req) => ipcRenderer.invoke(IPC.DAILY_SET_WALLPAPER, req) as Promise<SetWallpaperResult>,

  listHistory: () => ipcRenderer.invoke(IPC.HISTORY_LIST) as Promise<HistoryPayload>,
  deleteHistory: (ids) => ipcRenderer.invoke(IPC.HISTORY_DELETE, { ids }) as Promise<DeleteHistoryResult>,

  getPlatform: () => ipcRenderer.invoke(IPC.ENV_PLATFORM) as Promise<PlatformInfo>,
  getScreen: () => ipcRenderer.invoke(IPC.ENV_SCREEN) as Promise<ScreenInfo>,
};

contextBridge.exposeInMainWorld('aurora', api);
