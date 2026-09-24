/**
 * Aurora Wallpaper — 环境信息 IPC 处理器
 */

import { ipcMain, screen } from 'electron';
import { IPC } from '../../shared/ipc';
import type { ImageAspectRatio, PlatformInfo, ScreenInfo } from '../../shared/types';

/** 计算最大公约数 */
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** 由宽高比换算 size 字符串（GCD 约分） */
function aspectRatioToString(width: number, height: number): ImageAspectRatio {
  const g = gcd(width, height);
  const w = width / g;
  const h = height / g;

  // 映射到最接近的标准比例
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 16 / 10) < 0.05) return '16:10';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(ratio - 3 / 2) < 0.05) return '3:2';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';

  // 兜底：返回约分后的整数比（限制在合理范围）
  const max = Math.max(w, h);
  if (max <= 20) {
    return `${w}:${h}` as ImageAspectRatio;
  }
  return '16:9';
}

export function registerEnvHandlers(): void {
  ipcMain.handle(IPC.ENV_PLATFORM, (): PlatformInfo => {
    const platform = process.platform;
    return {
      platform,
      supported: platform === 'win32' || platform === 'darwin' || platform === 'linux',
    };
  });

  ipcMain.handle(IPC.ENV_SCREEN, (): ScreenInfo => {
    const primary = screen.getPrimaryDisplay();
    const { width, height } = primary.size;
    const scaleFactor = primary.scaleFactor;
    return {
      width,
      height,
      scaleFactor,
      aspectRatio: aspectRatioToString(width, height),
    };
  });
}
