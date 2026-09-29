/**
 * Aurora Wallpaper — 壁纸 IPC 处理器
 */

import { app, ipcMain } from 'electron';
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

  // 读取本地壁纸文件为 base64 data URL（dev 模式图片显示）
  ipcMain.handle(IPC.WALLPAPER_READ_DATA_URL, async (_event, req: { filePath: string }) => {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const resolved = path.resolve(req.filePath);
      // 只允许读取 userData/wallpapers/ 下的文件
      const userDataPath = app.getPath('userData');
      const wallpapersDir = path.join(userDataPath, 'wallpapers');
      if (!resolved.startsWith(wallpapersDir)) {
        return { ok: false, error: '非法路径' };
      }
      const buf = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
