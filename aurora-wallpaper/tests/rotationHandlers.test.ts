/**
 * Aurora Wallpaper — rotationHandlers 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron ipcMain
const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

import { registerRotationHandlers } from '../src/main/ipc/rotationHandlers';
import { IPC } from '../src/shared/ipc';
import type { RotationSettings } from '../src/shared/types';

describe('rotationHandlers', () => {
  let mockSettingsService: {
    loadSettings: () => { rotation: RotationSettings };
    saveSettings: (patch: { rotation: RotationSettings }) => { rotation: RotationSettings };
  };
  let mockSchedulerService: {
    rotateNow: () => Promise<boolean>;
  };

  beforeEach(() => {
    handlers.clear();

    const defaultRotation: RotationSettings = {
      enabled: false,
      intervalMinutes: 60,
      source: 'bing',
      order: 'random',
    };

    mockSettingsService = {
      loadSettings: vi.fn(() => ({ rotation: defaultRotation })),
      saveSettings: vi.fn((_patch) => ({ rotation: defaultRotation })),
    };

    mockSchedulerService = {
      rotateNow: vi.fn(() => Promise.resolve(true)),
    };

    registerRotationHandlers({
      settingsService: mockSettingsService as never,
      schedulerService: mockSchedulerService as never,
    });
  });

  it('ROTATION_GET 返回当前 rotation 设置', async () => {
    const handler = handlers.get(IPC.ROTATION_GET);
    expect(handler).toBeDefined();

    const result = (await handler!()) as RotationSettings;
    expect(result).toEqual({
      enabled: false,
      intervalMinutes: 60,
      source: 'bing',
      order: 'random',
    });
    expect(mockSettingsService.loadSettings).toHaveBeenCalledTimes(1);
  });

  it('ROTATION_SAVE 合并并持久化 rotation 设置', async () => {
    const handler = handlers.get(IPC.ROTATION_SAVE);
    expect(handler).toBeDefined();

    const newRotation: RotationSettings = {
      enabled: true,
      intervalMinutes: 30,
      source: 'favorites',
      order: 'newest',
    };

    // 模拟 loadSettings 返回可变状态：第一次返回默认值，第二次（save 后）返回新值
    const defaultRotation: RotationSettings = { enabled: false, intervalMinutes: 60, source: 'bing', order: 'random' };
    let callCount = 0;
    mockSettingsService.loadSettings = vi.fn(() => {
      callCount++;
      return callCount === 1 ? { rotation: defaultRotation } : { rotation: newRotation };
    });
    const mockSave = vi.fn(() => ({ rotation: newRotation }));
    mockSettingsService.saveSettings = mockSave;

    const result = (await handler!(null, newRotation)) as RotationSettings;

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ rotation: newRotation }));
    expect(result).toEqual(newRotation);
  });

  it('ROTATION_ROTATE_NOW 调用 scheduler.rotateNow', async () => {
    const handler = handlers.get(IPC.ROTATION_ROTATE_NOW);
    expect(handler).toBeDefined();

    const result = (await handler!()) as boolean;
    expect(mockSchedulerService.rotateNow).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('ROTATION_ROTATE_NOW 失败时返回 false', async () => {
    mockSchedulerService.rotateNow = vi.fn(() => Promise.resolve(false));

    // 重新注册以使用新的 mock
    registerRotationHandlers({
      settingsService: mockSettingsService as never,
      schedulerService: mockSchedulerService as never,
    });

    const handler = handlers.get(IPC.ROTATION_ROTATE_NOW);
    const result = (await handler!()) as boolean;
    expect(result).toBe(false);
  });
});
