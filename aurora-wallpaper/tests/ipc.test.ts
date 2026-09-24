import { describe, it, expect } from 'vitest';
import { IPC } from '../src/shared/ipc';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('IPC 通道常量', () => {
  it('所有通道值唯一', () => {
    const values = Object.values(IPC);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('包含预期的通道名', () => {
    expect(IPC.SETTINGS_GET).toBe('settings:get');
    expect(IPC.GENERATE_IMAGE).toBe('generate:image');
    expect(IPC.WALLPAPER_SET).toBe('wallpaper:set');
  });
});

describe('DEFAULT_SETTINGS 默认值', () => {
  it('baseURL 指向 likegpt 兼容接口', () => {
    expect(DEFAULT_SETTINGS.baseURL).toBe('https://www.likegpt.top/v1');
  });

  it('apiKey 默认为空串', () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe('');
  });
});
