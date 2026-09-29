/**
 * Aurora Wallpaper — 托盘服务
 *
 * 提供常驻系统托盘图标，保证窗口关闭后轮换继续运行。
 * macOS 使用模板图（ trayTemplate.png + setTemplateImage 语义），Windows/Linux 用 tray.ico。
 * 菜单项：显示主窗口 / 立即换一张 / 退出。
 *
 * 设计要点：
 * - 依赖注入 Tray/Menu/nativeImage/platform（便于单测 mock）
 * - 通过回调 onRotateNow/onQuit 与外部解耦，不直接引用 schedulerService
 * - 提供 destroy() 清理资源（托盘对象不被 GC 回收风险）
 */

import type { Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';

/** 托盘依赖（便于测试注入） */
export interface TrayDeps {
  Tray: typeof Tray;
  Menu: typeof Menu;
  nativeImage: typeof nativeImage;
  platform: NodeJS.Platform;
  /** 主窗口查找与显示 */
  getMainWindow: () => { show(): void; focus(): void } | null;
  /** 「立即换一张」回调 */
  onRotateNow: () => void;
  /** 「退出」回调 */
  onQuit: () => void;
  /** 构建产物根目录（生产 = __dirname，测试可注入） */
  buildDir?: string;
}

/** 托盘服务接口 */
export interface TrayService {
  /** 销毁托盘，释放资源 */
  destroy(): void;
}

/**
 * 基础 PNG → ICO 转换（Windows/Linux 兜底：无外部依赖时从 PNG 生成简单 ICO）。
 * 这里直接使用预生成的 tray.ico，不运行时合成。
 */

export function createTrayService(deps: TrayDeps): TrayService {
  const { Tray, Menu, nativeImage } = deps;

  /** 构建图标文件路径 */
  function resolveIcons() {
    const base = deps.buildDir ?? path.join(__dirname, '..');
    if (deps.platform === 'darwin') {
      return { mac: path.join(base, 'trayTemplate.png'), win: null };
    }
    return { mac: null, win: path.join(base, 'tray.ico') };
  }

  /** 创建托盘图标 */
  function buildIcon() {
    if (deps.platform === 'darwin') {
      const macPath = resolveIcons().mac!;
      const img = nativeImage.createFromPath(macPath);
      if (!img.isEmpty()) {
        // 尺寸统一为 16x16（模板图标准尺寸）
        return img.resize({ width: 16, height: 16 });
      }
    }
    const winPath = resolveIcons().win!;
    const img = nativeImage.createFromPath(winPath);
    return img;
  }

  /** 创建菜单 */
  function buildMenu() {
    return Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          const win = deps.getMainWindow();
          if (win) {
            win.show();
            win.focus();
          }
        },
      },
      {
        label: '立即换一张',
        click: () => deps.onRotateNow(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => deps.onQuit(),
      },
    ]);
  }

  /** 创建托盘 */
  const tray = new Tray(buildIcon());
  tray.setToolTip('Aurora Wallpaper · 后台轮换中');
  const menu = buildMenu();
  tray.setContextMenu(menu);

  // 点击托盘显示窗口
  tray.on('click', () => {
    const win = deps.getMainWindow();
    if (win) {
      win.show();
      win.focus();
    }
  });

  return {
    destroy() {
      tray.destroy();
    },
  };
}
