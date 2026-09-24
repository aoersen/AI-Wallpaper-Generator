/**
 * Aurora Wallpaper — Electron 主进程入口
 *
 * phase-2：注册全部业务 IPC 处理器（设置/生成/壁纸/历史/环境）。
 */

import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import type { GenerateProgress } from '../shared/types';
import { createSettingsService } from './services/settings';
import { createWallpaperStore } from './services/wallpaperStore';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerGenerateHandlers } from './ipc/generateHandlers';
import { registerWallpaperHandlers } from './ipc/wallpaperHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { registerEnvHandlers } from './ipc/envHandlers';

/** 开发模式下 Vite dev server 地址（由 dev:electron 脚本注入） */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/** 是否开发模式 */
const isDev = Boolean(DEV_SERVER_URL);

/** 主窗口引用（避免被 GC 回收） */
let mainWindow: BrowserWindow | null = null;

/** 创建主窗口 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Aurora Wallpaper · AI 壁纸工坊',
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  // 就绪后再显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // 外部链接交给系统默认浏览器，不在应用内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式加载 vite 构建产物。
    // 注意：__dirname 为 dist/main（打包后为 app.asar/dist/main），
    // 需上溯两级才能到达项目根的 dist-renderer。
    void mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 单实例锁：重复启动时聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 组装服务层（依赖注入）
    const settingsService = createSettingsService({
      getUserDataPath: () => app.getPath('userData'),
    });
    const wallpaperStore = createWallpaperStore(app.getPath('userData'));

    // 向渲染进程发送进度事件
    const sendProgress = (progress: GenerateProgress): void => {
      mainWindow?.webContents.send(IPC.GENERATE_PROGRESS, progress);
    };

    // 注册 IPC 处理器
    registerSettingsHandlers(settingsService);
    registerGenerateHandlers({ settingsService, wallpaperStore, sendProgress });
    registerWallpaperHandlers({ wallpaperStore });
    registerHistoryHandlers({ wallpaperStore });
    registerEnvHandlers();

    createWindow();

    app.on('activate', () => {
      // macOS：点击 Dock 图标且无窗口时重建
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // Windows/Linux：关闭全部窗口即退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
