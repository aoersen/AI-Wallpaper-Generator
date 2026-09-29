/**
 * Aurora Wallpaper — 历史 IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DeleteHistoryRequest, ToggleFavoriteRequest } from '../../shared/types';
import type { WallpaperStore } from '../services/wallpaperStore';

export interface HistoryDeps {
  wallpaperStore: WallpaperStore;
}

export function registerHistoryHandlers(deps: HistoryDeps): void {
  const { wallpaperStore } = deps;

  ipcMain.handle(IPC.HISTORY_LIST, () => {
    return { records: wallpaperStore.list() };
  });

  ipcMain.handle(IPC.HISTORY_DELETE, (_event, req: DeleteHistoryRequest) => {
    const deleted: string[] = [];
    for (const id of req.ids) {
      if (wallpaperStore.deleteById(id)) {
        deleted.push(id);
      }
    }
    return { ok: true, deleted };
  });

  ipcMain.handle(IPC.HISTORY_TOGGLE_FAVORITE, (_event, req: ToggleFavoriteRequest) => {
    const current = wallpaperStore.list().find((r) => r.id === req.id);
    if (!current) {
      return { ok: false, favorite: false, error: '记录不存在' };
    }

    const updated = wallpaperStore.setFavorite(req.id, !current.favorite);
    if (!updated) {
      // 收藏到上限（取消失败时基本不会出现，但统一处理）
      const isFavoriteAttempt = !current.favorite;
      if (isFavoriteAttempt) {
        return { ok: false, favorite: false, error: '收藏已达上限 100 张，请先取消部分收藏' };
      }
      return { ok: false, favorite: false, error: '操作失败' };
    }
    return { ok: true, favorite: updated.favorite };
  });
}
