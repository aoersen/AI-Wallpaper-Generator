/**
 * Aurora Wallpaper — 每日图片 IPC 处理器
 *
 * DAILY_LIST：返回 Bing 每日壁纸 + 今日 AI 主题（Bing 拉取失败时 bingError 非空）。
 * DAILY_SET_WALLPAPER：白名单校验 → 下载转存 → 设置桌面壁纸。
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DailyListResult, SetDailyWallpaperRequest, SetWallpaperResult } from '../../shared/types';
import type { DailyService } from '../services/dailyService';

/** 每日图片处理器依赖 */
export interface DailyDeps {
  dailyService: DailyService;
}

/** 注册 daily 域 IPC 处理器 */
export function registerDailyHandlers(deps: DailyDeps): void {
  const { dailyService } = deps;

  // 获取每日图片数据（Bing 壁纸 + 今日 AI 主题）
  ipcMain.handle(IPC.DAILY_LIST, async (): Promise<DailyListResult> => {
    return dailyService.listDaily();
  });

  // 下载 Bing 每日壁纸并设置桌面壁纸
  ipcMain.handle(
    IPC.DAILY_SET_WALLPAPER,
    async (_event, req: SetDailyWallpaperRequest): Promise<SetWallpaperResult> => {
      return dailyService.setDailyWallpaper(req);
    },
  );
}
