/**
 * Aurora Wallpaper — 设置服务测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSettingsService } from '../src/main/services/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('settingsService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-settings-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadSettings 文件缺失时返回默认值', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const settings = service.loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('loadSettings 文件损坏时返回默认值', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), 'not json{{{');
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const settings = service.loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('saveSettings 与默认值合并', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const saved = service.saveSettings({ apiKey: 'c2a_test123' });
    expect(saved.apiKey).toBe('c2a_test123');
    expect(saved.baseURL).toBe(DEFAULT_SETTINGS.baseURL);
    expect(saved.retryLimit).toBe(DEFAULT_SETTINGS.retryLimit);

    const loaded = service.loadSettings();
    expect(loaded.apiKey).toBe('c2a_test123');
  });

  it('saveSettings apiKey trim 后存储', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const saved = service.saveSettings({ apiKey: '  c2a_test  ' });
    expect(saved.apiKey).toBe('c2a_test');
  });

  it('saveSettings 非法 baseURL 抛中文错误', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    expect(() => service.saveSettings({ baseURL: 'ftp://invalid' })).toThrow('Base URL 必须以 http:// 或 https:// 开头');
  });

  it('saveSettings 合法 http/https baseURL 通过', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    expect(() => service.saveSettings({ baseURL: 'http://localhost:8080/v1' })).not.toThrow();
    expect(() => service.saveSettings({ baseURL: 'https://api.example.com/v1' })).not.toThrow();
  });
});
