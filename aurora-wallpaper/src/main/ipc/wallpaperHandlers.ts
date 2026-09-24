/**
 * Aurora Wallpaper — 壁纸 IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DownloadWallpaperRequest, SetWallpaperRequest, SetWallpaperResult } from '../../shared/types';
import type { WallpaperStore } from '../services/wallpaperStore';

export interface WallpaperDeps {
  wallpaperStore: WallpaperStore;
}

export function registerWallpaperHandlers(deps: WallpaperDeps): void {
  const { wallpaperStore } = deps;

  ipcMain.handle(IPC.WALLPAPER_DOWNLOAD, async (_event, req: DownloadWallpaperRequest) => {
    try {
      const record = await wallpaperStore.downloadAndStore(req.imageUrl, {
        prompt: req.prompt,
        rawInput: req.rawInput,
        styleId: req.styleId,
        size: req.size,
        mode: req.mode,
      });
      wallpaperStore.pruneToLimit();
      return { ok: true, record };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // phase-4 实现：设置桌面壁纸
  ipcMain.handle(IPC.WALLPAPER_SET, async (_event, req: SetWallpaperRequest): Promise<SetWallpaperResult> => {
    try {
      const { setWallpaper } = await import('../services/wallpaperSetter');
      await setWallpaper(req.filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
