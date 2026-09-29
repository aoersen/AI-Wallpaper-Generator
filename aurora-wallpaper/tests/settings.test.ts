/**
 * Aurora Wallpaper — 设置服务测试
 *
 * 覆盖：
 * - 文件缺失/损坏回退默认值
 * - save/load 往返（apiKey trim、baseURL 校验）
 * - model 字段默认 'qwen-image'
 * - API Key 加密（safeStorage 可用时）
 * - safeStorage 不可用时回退明文
 * - 旧明文 key 迁移：读到明文时自动加密重写
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 可控标志：测试 safeStorage 不可用场景时置为 false
let encryptionAvailable = true;

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    // 模拟真实 safeStorage：encryptString 返回 Buffer，decryptString 接受 Buffer
    encryptString: (s: string) => Buffer.from(s).reverse(),
    decryptString: (b: Buffer) => Buffer.from(b).reverse().toString('utf-8'),
  },
}));

import { createSettingsService } from '../src/main/services/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('settingsService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-settings-'));
    encryptionAvailable = true;
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

  it('saveSettings 与默认值合并（含 model 字段）', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const saved = service.saveSettings({ apiKey: 'c2a_test123', model: 'qwen-image' });
    expect(saved.apiKey).toBe('c2a_test123');
    expect(saved.baseURL).toBe(DEFAULT_SETTINGS.baseURL);
    expect(saved.retryLimit).toBe(DEFAULT_SETTINGS.retryLimit);
    expect(saved.model).toBe('qwen-image');
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

  it('默认 model 为 qwen-image', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const saved = service.saveSettings({});
    expect(saved.model).toBe('qwen-image');
  });

  it('apiKey 加密存储：settings.json 中为非明文 base64', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    service.saveSettings({ apiKey: 'c2a_secret_key' });

    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // 加密存储不应有 apiKey 字段，应有 apiKeyEncrypted
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.apiKeyEncrypted).toBeDefined();
    expect(parsed.apiKeyEncrypted).not.toBe('c2a_secret_key');
    expect(typeof parsed.apiKeyEncrypted).toBe('string');
    expect(parsed.apiKeyEncrypted.length).toBeGreaterThan(0);
  });

  it('loadSettings 解密后返回明文 apiKey', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    service.saveSettings({ apiKey: 'c2a_secret_key' });

    // 重新创建服务（清空内存态），验证从文件解密
    const service2 = createSettingsService({ getUserDataPath: () => tmpDir });
    const loaded = service2.loadSettings();
    expect(loaded.apiKey).toBe('c2a_secret_key');
  });

  it('迁移：读到旧明文 key 时自动加密写回并返回明文', () => {
    // 模拟旧版本写入的明文 settings.json
    fs.mkdirSync(tmpDir, { recursive: true });
    const oldSettings = {
      baseURL: DEFAULT_SETTINGS.baseURL,
      apiKey: 'c2a_old_plain',
      retryLimit: 2,
      retryIntervalMs: 2000,
      requestTimeoutMs: 120000,
      model: 'qwen-image',
    };
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify(oldSettings, null, 2));

    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const loaded = service.loadSettings();
    // 应返回明文
    expect(loaded.apiKey).toBe('c2a_old_plain');

    // 重写后文件中的 apiKey 应消失，出现 apiKeyEncrypted
    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.apiKeyEncrypted).toBeDefined();
    expect(parsed.apiKeyEncrypted).not.toBe('c2a_old_plain');
  });
});

// ----- safeStorage 不可用时的明文回退 -----
describe('settingsService (safeStorage 不可用)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-settings-fallback-'));
    encryptionAvailable = false;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    encryptionAvailable = true;
  });

  it('saveSettings 回退明文存储', () => {
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const saved = service.saveSettings({ apiKey: 'c2a_plain' });
    // 明文保存（因为 safeStorage 不可用时不抛错，存储原始值）
    expect(saved.apiKey).toBe('c2a_plain');

    const raw = fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.apiKey).toBe('c2a_plain');
    expect(parsed.apiKeyEncrypted).toBeUndefined();
  });

  it('loadSettings 直接返回明文', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ apiKey: 'c2a_plain', model: 'qwen-image' }),
    );
    const service = createSettingsService({ getUserDataPath: () => tmpDir });
    const loaded = service.loadSettings();
    expect(loaded.apiKey).toBe('c2a_plain');
  });
});
