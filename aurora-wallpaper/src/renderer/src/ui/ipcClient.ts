/**
 * Aurora Wallpaper — 渲染进程 IPC 客户端
 *
 * 对 preload 暴露的 window.aurora 做类型安全封装：
 * - AuroraApi 接口以 type-only import 从 preload 模块引入（编译后完全擦除，不会打包 electron 运行时）；
 * - 全局 Window 类型声明（原 aurora.d.ts，按任务信封并入本文件）；
 * - 便捷函数逐通道导出，组件不直接触碰 window。
 *
 * 注意：若 src/preload/index.ts 的 AuroraApi 接口变更，此处类型随之同步。
 */

import type { AuroraApi } from '../../../preload/index';
import type {
  DeleteHistoryResult,
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  HistoryPayload,
  PlatformInfo,
  SaveSettingsRequest,
  SaveSettingsResult,
  ScreenInfo,
  SetWallpaperRequest,
  SetWallpaperResult,
  SettingsPayload,
} from '../../../shared/types';

/** 全局 window.aurora 类型声明（preload contextBridge.exposeInMainWorld('aurora', api)） */
declare global {
  interface Window {
    aurora: AuroraApi;
  }
}

/** 非浏览器环境（SSR/单测 Node 上下文）直接抛错，避免静默 undefined */
if (typeof window === 'undefined') {
  throw new Error('ipcClient 只能在渲染进程（浏览器环境）中使用');
}

/** 类型安全的 window.aurora 访问入口 */
export const api: AuroraApi = window.aurora;

/** 重新导出接口类型，供组件/测试引用 */
export type { AuroraApi };

/* ------------------------------------------------------------------ */
/* 便捷函数（逐 IPC 通道）                                               */
/* ------------------------------------------------------------------ */

/** 读取应用设置 */
export const getSettings = (): Promise<SettingsPayload> => api.getSettings();

/** 保存应用设置 */
export const saveSettings = (req: SaveSettingsRequest): Promise<SaveSettingsResult> => api.saveSettings(req);

/** 发起单张生成请求 */
export const generateImage = (req: GenerateRequest): Promise<GenerateResult> => api.generateImage(req);

/** 订阅批量生成进度事件，返回取消订阅函数 */
export const onGenerateProgress = (listener: (progress: GenerateProgress) => void): (() => void) =>
  api.onGenerateProgress(listener);

/** 读取历史记录列表 */
export const listHistory = (): Promise<HistoryPayload> => api.listHistory();

/** 删除指定历史记录 */
export const deleteHistory = (ids: string[]): Promise<DeleteHistoryResult> => api.deleteHistory(ids);

/** 设置桌面壁纸 */
export const setWallpaper = (req: SetWallpaperRequest): Promise<SetWallpaperResult> => api.setWallpaper(req);

/** 读取平台信息 */
export const getPlatform = (): Promise<PlatformInfo> => api.getPlatform();

/** 读取主屏信息（含宽高比） */
export const getScreen = (): Promise<ScreenInfo> => api.getScreen();
