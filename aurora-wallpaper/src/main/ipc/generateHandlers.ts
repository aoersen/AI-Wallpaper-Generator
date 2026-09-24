/**
 * Aurora Wallpaper — 生成 IPC 处理器
 *
 * GENERATE_IMAGE 流程：读 settings → generateImageWithRetry → 下载转存 → 发进度事件。
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { GenerateProgress, GenerateRequest, GenerateResult } from '../../shared/types';
import { generateImageWithRetry } from '../services/qwenClient';
import type { SettingsService } from '../services/settings';
import type { WallpaperStore } from '../services/wallpaperStore';

export interface GenerateDeps {
  settingsService: SettingsService;
  wallpaperStore: WallpaperStore;
  /** 向渲染进程发送进度事件 */
  sendProgress: (progress: GenerateProgress) => void;
}

export function registerGenerateHandlers(deps: GenerateDeps): void {
  const { settingsService, wallpaperStore, sendProgress } = deps;

  ipcMain.handle(IPC.GENERATE_IMAGE, async (_event, req: GenerateRequest): Promise<GenerateResult> => {
    const settings = settingsService.loadSettings();

    // 初始进度：requesting
    sendProgress({
      index: 0,
      total: 1,
      status: 'requesting',
      attempts: 0,
      message: '正在生成图片…',
    });

    let imageUrl: string;
    let attempts = 0;

    try {
      const result = await generateImageWithRetry(
        {
          prompt: req.prompt,
          referenceImages: req.references.length > 0 ? req.references : undefined,
          size: req.size,
          settings,
        },
        {
          maxAttempts: settings.retryLimit + 1,
          intervalMs: settings.retryIntervalMs,
          onAttempt: (attempt) => {
            attempts = attempt;
            sendProgress({
              index: 0,
              total: 1,
              status: attempt > 1 ? 'retrying' : 'requesting',
              attempts: attempt,
              message: attempt > 1 ? `第 ${attempt} 次重试中…` : '正在生成图片…',
            });
          },
        },
      );
      imageUrl = result.imageUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendProgress({
        index: 0,
        total: 1,
        status: 'failed',
        attempts,
        message,
      });
      return { ok: false, error: message, attempts };
    }

    // 下载转存
    sendProgress({
      index: 0,
      total: 1,
      status: 'downloading',
      attempts,
      message: '正在下载转存…',
    });

    try {
      const record = await wallpaperStore.downloadAndStore(imageUrl, {
        prompt: req.prompt,
        rawInput: req.rawInput,
        styleId: req.styleId,
        size: req.size,
        mode: req.mode,
      });

      // 修剪到 20 张
      wallpaperStore.pruneToLimit();

      sendProgress({
        index: 0,
        total: 1,
        status: 'done',
        attempts,
        message: '生成完成',
      });

      return { ok: true, imageUrl, localPath: record.filePath, attempts };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendProgress({
        index: 0,
        total: 1,
        status: 'failed',
        attempts,
        message,
      });
      return { ok: false, error: message, attempts };
    }
  });
}
