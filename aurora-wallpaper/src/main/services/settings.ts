/**
 * Aurora Wallpaper — 设置服务
 *
 * 读写 userData/settings.json，与默认值合并，损坏/缺失时回退默认值。
 * 通过工厂注入 userData 路径，便于测试使用临时目录。
 */

import fs from 'node:fs';
import path from 'node:path';
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
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return mergeWithDefaults(parsed);
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

      const filePath = settingsPath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
      return merged;
    },
  };
}
