/**
 * Aurora Wallpaper — 历史 IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DeleteHistoryRequest } from '../../shared/types';
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
}
