/**
 * ipcClient.ts — 渲染进程 IPC 客户端
 * 集中式 window.aurora 类型声明 + 便捷函数封装
 */

import type {
  DeleteHistoryResult,
  DailyListResult,
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  HistoryPayload,
  PlatformInfo,
  ReadDataUrlResult,
  RotationSettings,
  SaveSettingsRequest,
  SaveSettingsResult,
  ScreenInfo,
  SetWallpaperRequest,
  SetWallpaperResult,
  SettingsPayload,
  ToggleFavoriteResult,
} from '../types';

/** 全局 window.aurora 声明（preload 通过 contextBridge.exposeInMainWorld('aurora', api) 暴露） */
declare global {
  interface Window {
    aurora: {
      getSettings(): Promise<SettingsPayload>;
      saveSettings(req: SaveSettingsRequest): Promise<SaveSettingsResult>;
      generateImage(req: GenerateRequest): Promise<GenerateResult>;
      onGenerateProgress(listener: (progress: GenerateProgress) => void): () => void;
      setWallpaper(req: SetWallpaperRequest): Promise<SetWallpaperResult>;
      listHistory(): Promise<HistoryPayload>;
      deleteHistory(ids: string[]): Promise<DeleteHistoryResult>;
      getPlatform(): Promise<PlatformInfo>;
      getScreen(): Promise<ScreenInfo>;
      /** 1a 新增 —— 每日图片 */
      listDaily(): Promise<DailyListResult>;
      setDailyWallpaper(req: { url: string; fileName: string }): Promise<SetWallpaperResult>;
      /** 打开日志目录（userData/logs） */
      openLogDir(): Promise<void>;
      /** 切换收藏状态 */
      toggleFavorite(req: { id: string }): Promise<ToggleFavoriteResult>;
      /** 取消当前生成任务 */
      cancelGenerate(): Promise<void>;
      /** 读取本地壁纸文件为 base64 data URL（dev 模式绕过 file:// CSP 限制） */
      readDataUrl(filePath: string): Promise<ReadDataUrlResult>;

      /* 壁纸轮换 */
      /** 读取当前轮换设置 */
      getRotationSettings(): Promise<RotationSettings>;
      /** 保存轮换设置 */
      saveRotationSettings(rotation: RotationSettings): Promise<RotationSettings>;
      /** 手动触发一次轮换 */
      rotateNow(): Promise<boolean>;
    };
  }
}

if (typeof window === 'undefined') {
  throw new Error('ipcClient 只能在渲染进程（浏览器环境）中使用');
}

export const api = window.aurora;

export const getSettings = (): Promise<SettingsPayload> => api.getSettings();
export const saveSettings = (req: SaveSettingsRequest): Promise<SaveSettingsResult> => api.saveSettings(req);
export const generateImage = (req: GenerateRequest): Promise<GenerateResult> => api.generateImage(req);
export const onGenerateProgress = (listener: (progress: GenerateProgress) => void): (() => void) =>
  api.onGenerateProgress(listener);
export const listHistory = (): Promise<HistoryPayload> => api.listHistory();
export const deleteHistory = (ids: string[]): Promise<DeleteHistoryResult> => api.deleteHistory(ids);
export const setWallpaper = (req: SetWallpaperRequest): Promise<SetWallpaperResult> => api.setWallpaper(req);
export const getPlatform = (): Promise<PlatformInfo> => api.getPlatform();
export const getScreen = (): Promise<ScreenInfo> => api.getScreen();
export const listDaily = (): Promise<DailyListResult> => api.listDaily();
export const setDailyWallpaper = (req: { url: string; fileName: string }): Promise<SetWallpaperResult> =>
  api.setDailyWallpaper(req);
export const toggleFavorite = (req: { id: string }): Promise<ToggleFavoriteResult> =>
  api.toggleFavorite(req);
export const cancelGenerate = (): Promise<void> => api.cancelGenerate();
export const readDataUrl = (filePath: string): Promise<ReadDataUrlResult> => api.readDataUrl(filePath);

/* 壁纸轮换 */
export const getRotationSettings = (): Promise<RotationSettings> => api.getRotationSettings();
export const saveRotationSettings = (rotation: RotationSettings): Promise<RotationSettings> =>
  api.saveRotationSettings(rotation);
export const rotateNow = (): Promise<boolean> => api.rotateNow();
