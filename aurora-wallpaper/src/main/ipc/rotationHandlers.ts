/**
 * Aurora Wallpaper — 轮换设置 IPC 处理器
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { RotationSettings } from '../../shared/types';
import type { SettingsService } from '../services/settings';
import type { SchedulerService } from '../services/schedulerService';

export interface RotationDeps {
  settingsService: SettingsService;
  schedulerService: SchedulerService;
}

export function registerRotationHandlers(deps: RotationDeps): void {
  const { settingsService, schedulerService } = deps;

  ipcMain.handle(IPC.ROTATION_GET, () => {
    return settingsService.loadSettings().rotation;
  });

  ipcMain.handle(IPC.ROTATION_SAVE, (_event, rotation: RotationSettings) => {
    const current = settingsService.loadSettings();
    settingsService.saveSettings({ ...current, rotation });
    return settingsService.loadSettings().rotation;
  });

  ipcMain.handle(IPC.ROTATION_ROTATE_NOW, async () => {
    const result = await schedulerService.rotateNow();
    return result;
  });
}
