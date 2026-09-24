/**
 * Aurora Wallpaper — IPC 通道常量与负载类型
 *
 * 全部通道集中定义于此，主进程（ipcMain.handle / webContents.send）与
 * preload（ipcRenderer.invoke / on）共用，避免字符串散落各处。
 *
 * 命名约定：`domain:action`，域包括 settings / generate / wallpaper / history / env。
 */

import type {
  DeleteHistoryRequest,
  DeleteHistoryResult,
  DownloadWallpaperRequest,
  DownloadWallpaperResult,
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
} from './types';

/* ------------------------------------------------------------------ */
/* 通道常量                                                            */
/* ------------------------------------------------------------------ */

/** 全部 IPC 通道名（invoke/handle 型） */
export const IPC = {
  /** 读取应用设置 */
  SETTINGS_GET: 'settings:get',
  /** 保存应用设置 */
  SETTINGS_SAVE: 'settings:save',

  /** 单张图片生成（含重试），返回生成结果 */
  GENERATE_IMAGE: 'generate:image',
  /** 批量生成进度事件（主进程 → 渲染进程，send 型） */
  GENERATE_PROGRESS: 'generate:progress',

  /** 下载生成的图片 URL 并转存到本地壁纸库 */
  WALLPAPER_DOWNLOAD: 'wallpaper:download',
  /** 设置桌面壁纸 */
  WALLPAPER_SET: 'wallpaper:set',

  /** 读取本地壁纸文件为 base64 data URL（绕过 file:// CSP 限制） */
  WALLPAPER_READ_DATA_URL: 'wallpaper:read-data-url',

  /** 获取历史壁纸列表 */
  HISTORY_LIST: 'history:list',
  /** 删除指定历史记录（含文件） */
  HISTORY_DELETE: 'history:delete',

  /** 平台信息（win32/darwin/linux 及是否支持） */
  ENV_PLATFORM: 'env:platform',
  /** 主屏信息（尺寸、缩放、宽高比字符串） */
  ENV_SCREEN: 'env:screen',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/* ------------------------------------------------------------------ */
/* 通道负载/响应类型映射                                                 */
/* ------------------------------------------------------------------ */

/** invoke 型通道的请求负载 */
export type IpcRequestMap = {
  [IPC.SETTINGS_GET]: void;
  [IPC.SETTINGS_SAVE]: SaveSettingsRequest;
  [IPC.GENERATE_IMAGE]: GenerateRequest;
  [IPC.WALLPAPER_DOWNLOAD]: DownloadWallpaperRequest;
  [IPC.WALLPAPER_SET]: SetWallpaperRequest;
  [IPC.WALLPAPER_READ_DATA_URL]: { filePath: string };
  [IPC.HISTORY_LIST]: void;
  [IPC.HISTORY_DELETE]: DeleteHistoryRequest;
  [IPC.ENV_PLATFORM]: void;
  [IPC.ENV_SCREEN]: void;
};

/** invoke 型通道的响应 */
export type IpcResponseMap = {
  [IPC.SETTINGS_GET]: SettingsPayload;
  [IPC.SETTINGS_SAVE]: SaveSettingsResult;
  [IPC.GENERATE_IMAGE]: GenerateResult;
  [IPC.WALLPAPER_DOWNLOAD]: DownloadWallpaperResult;
  [IPC.WALLPAPER_SET]: SetWallpaperResult;
  [IPC.WALLPAPER_READ_DATA_URL]: { dataUrl: string };
  [IPC.HISTORY_LIST]: HistoryPayload;
  [IPC.HISTORY_DELETE]: DeleteHistoryResult;
  [IPC.ENV_PLATFORM]: PlatformInfo;
  [IPC.ENV_SCREEN]: ScreenInfo;
};

/** 事件推送型通道的负载（主进程 → 渲染进程） */
export type IpcEventMap = {
  [IPC.GENERATE_PROGRESS]: GenerateProgress;
};

/** 提取某通道的请求类型 */
export type IpcRequest<T extends IpcChannel> = T extends keyof IpcRequestMap ? IpcRequestMap[T] : never;
/** 提取某通道的响应类型 */
export type IpcResponse<T extends IpcChannel> = T extends keyof IpcResponseMap ? IpcResponseMap[T] : never;
