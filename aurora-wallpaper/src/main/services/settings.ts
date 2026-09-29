/**
 * Aurora Wallpaper — 设置服务
 *
 * 读写 userData/settings.json，与默认值合并，损坏/缺失时回退默认值。
 * 通过工厂注入 userData 路径，便于测试使用临时目录。
 *
 * API Key 使用 Electron safeStorage 加密存储：
 * - 保存：encryptString → base64 → 写入 apiKeyEncrypted 字段（明文不落地）
 * - 加载：detect apiKeyEncrypted → detachString → 还原明文
 * - 旧版明文 apiKey 字段自动迁移为 apiKeyEncrypted
 * - safeStorage 不可用时回退明文并 console.warn
 */

import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { DEFAULT_SETTINGS } from '../../shared/types';
import type { AppSettings } from '../../shared/types';

/** 设置服务依赖（由主进程组装时注入） */
export interface SettingsServiceDeps {
  /** 返回 userData 目录绝对路径 */
  getUserDataPath: () => string;
}

export interface SettingsService {
  loadSettings(): AppSettings;
  saveSettings(patch: Partial<AppSettings>): AppSettings;
}

/** 合并用户设置与默认值（用户值优先，缺失字段用默认值补齐） */
function mergeWithDefaults(patch: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

/** 校验 baseURL 必须以 http(s):// 开头 */
function validateBaseUrl(baseURL: string): void {
  if (!/^https?:\/\//i.test(baseURL)) {
    throw new Error('Base URL 必须以 http:// 或 https:// 开头');
  }
}

/**
 * 获取 safeStorage 实例。
 * 仅在 Electron 主进程且系统支持加密时返回；
 * 测试环境（纯 Node）或不支持时返回 null，调用方回退明文。
 */
function getSafeStorage(): typeof safeStorage | null {
  try {
    if (safeStorage?.isEncryptionAvailable?.()) {
      return safeStorage;
    }
  } catch {
    // 非 Electron 主进程环境（如 vitest），回退明文
  }
  return null;
}

export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
  const { getUserDataPath } = deps;

  /** settings.json 绝对路径 */
  function settingsPath(): string {
    return path.join(getUserDataPath(), 'settings.json');
  }

  return {
    loadSettings(): AppSettings {
      try {
        const raw = fs.readFileSync(settingsPath(), 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AppSettings> & { apiKeyEncrypted?: string };
        const merged = mergeWithDefaults(parsed);
        const safeStorage = getSafeStorage();

        if (!safeStorage) {
          // safeStorage 不可用：无论 apiKeyEncrypted 还是 apiKey 都直接返回
          return merged;
        }

        // 1) 优先从 apiKeyEncrypted 解密（新版加密存储）
        if (parsed.apiKeyEncrypted) {
          try {
            const buf = Buffer.from(parsed.apiKeyEncrypted, 'base64');
            merged.apiKey = safeStorage.decryptString(buf);
          } catch {
            // 解密失败：回退明文，避免数据丢失
            console.warn('apiKeyEncrypted 解密失败，保留明文');
          }
          return merged;
        }

        // 2) 存在旧明文 apiKey → 迁移加密
        if (merged.apiKey) {
          try {
            const encryptedBuf = safeStorage.encryptString(merged.apiKey);
            const encrypted = encryptedBuf.toString('base64');
            const toWrite = { ...merged, apiKey: undefined, apiKeyEncrypted: encrypted };
            delete toWrite.apiKey;
            fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2), 'utf-8');
          } catch {
            // 加密失败，不阻止读取，下次 save 时再尝试
          }
        }

        return merged;
      } catch {
        // 文件缺失或损坏 → 回退默认值，不抛错
        return { ...DEFAULT_SETTINGS };
      }
    },

    saveSettings(patch: Partial<AppSettings>): AppSettings {
      const merged = mergeWithDefaults(patch);
      validateBaseUrl(merged.baseURL);
      // apiKey trim 后存储
      merged.apiKey = merged.apiKey.trim();

      const safeStorage = getSafeStorage();
      const toWrite: Record<string, unknown> = { ...merged, apiKey: undefined };

      if (safeStorage) {
        // 加密 → base64 → 写入 apiKeyEncrypted
        const encryptedBuf = safeStorage.encryptString(merged.apiKey);
        toWrite.apiKeyEncrypted = encryptedBuf.toString('base64');
      } else {
        // 回退明文加密存储
        console.warn('safeStorage 不可用，API Key 将以明文存储');
        toWrite.apiKey = merged.apiKey;
      }

      const filePath = settingsPath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2), 'utf-8');
      return merged;
    },
  };
}
