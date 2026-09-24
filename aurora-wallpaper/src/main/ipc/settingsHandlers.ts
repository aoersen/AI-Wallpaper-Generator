/**
 * Aurora Wallpaper — 设置 IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { SaveSettingsRequest } from '../../shared/types';
import type { SettingsService } from '../services/settings';

export function registerSettingsHandlers(settingsService: SettingsService): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    return { settings: settingsService.loadSettings() };
  });

  ipcMain.handle(IPC.SETTINGS_SAVE, (_event, req: SaveSettingsRequest) => {
    const settings = settingsService.saveSettings(req.settings);
    return { ok: true, settings };
  });
}
