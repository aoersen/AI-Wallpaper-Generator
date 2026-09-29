/**
 * Aurora Wallpaper — Electron 主进程入口
 *
 * phase-3：托盘常驻，关窗不退出（保留后台轮换）
 * phase-2：注册全部业务 IPC 处理器
 * phase-1a：每日图片域（bing + 主题池）
 * phase-1c：sandbox: true，electron-log，WALLPAPER_READ_DATA_URL
 */

import { app, BrowserWindow, Notification, powerMonitor, shell } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';
import { IPC } from '../shared/ipc';
import type { GenerateProgress } from '../shared/types';
import { createSettingsService } from './services/settings';
import { createWallpaperStore } from './services/wallpaperStore';
import { createTrayService } from './services/trayService';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerGenerateHandlers } from './ipc/generateHandlers';
import { registerWallpaperHandlers } from './ipc/wallpaperHandlers';
import { registerHistoryHandlers } from './ipc/historyHandlers';
import { registerEnvHandlers } from './ipc/envHandlers';
import { createDailyService } from './services/dailyService';
import { registerDailyHandlers } from './ipc/dailyHandlers';
import { createSchedulerService } from './services/schedulerService';
import { registerRotationHandlers } from './ipc/rotationHandlers';

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER_URL);

/** 全局：是否正在主动退出（exit menu / before-quit）。用于区分「关窗」与「真退出」。 */
let isQuitting = false;
/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null;
/** 托盘服务引用 */
let trayService: { destroy(): void } | null = null;
/** 首次隐藏到托盘通知是否已发送（保证仅弹一次） */
let trayTipShown = false;

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
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭窗口：非退出态 → 隐藏到托盘；退出态 → 允许关闭
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      // 首次隐藏到托盘时弹一次通知
      if (!trayTipShown) {
        trayTipShown = true;
        if (Notification.isSupported()) {
          new Notification({
            title: 'Aurora Wallpaper 仍在后台运行',
            body: '定时轮换继续，右键托盘图标恢复窗口',
          }).show();
        }
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL!);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }
}

// 单实例锁
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.aurora.wallpaper');
  }

  // 任何真正的退出路径都经过这里，便于统一置位
  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(async () => {
    log.initialize();
    log.transports.file.maxSize = 5 * 1024 * 1024;
    log.transports.file.level = 'info';
    log.transports.console.level = 'info';
    log.info('Aurora Wallpaper 启动');

    process.on('uncaughtException', (err) => log.error('uncaughtException', err));
    process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));

    // 服务组装
    const settingsService = createSettingsService({
      getUserDataPath: () => app.getPath('userData'),
    });
    const wallpaperStore = createWallpaperStore(app.getPath('userData'));

    const sendProgress = (progress: GenerateProgress) => {
      mainWindow?.webContents.send(IPC.GENERATE_PROGRESS, progress);
    };

    const dailyService = createDailyService({ wallpaperStore });

    const schedulerService = createSchedulerService({
      settingsService,
      dailyService,
      wallpaperStore,
      getUserDataPath: () => app.getPath('userData'),
      powerMonitor,
    });

    // IPC
    registerSettingsHandlers(settingsService);
    registerDailyHandlers({ dailyService });
    registerGenerateHandlers({ settingsService, wallpaperStore, sendProgress });
    registerWallpaperHandlers({ wallpaperStore });
    registerHistoryHandlers({ wallpaperStore });
    registerEnvHandlers();
    registerRotationHandlers({ settingsService, schedulerService });

    schedulerService.start();

    // 「立即换一张」 — 复用 schedulerService.rotateNow()
    const rotateNow = () => {
      void schedulerService.rotateNow();
    };

    // 创建托盘（依赖注入，buildDir 指向 dist/main 同级）
    trayService = createTrayService({
      // 动态 import 避免循环引用（Tray 在 main process 可用）
      Tray: (await import('electron')).Tray,
      Menu: (await import('electron')).Menu,
      nativeImage: (await import('electron')).nativeImage,
      platform: process.platform,
      getMainWindow: () => mainWindow,
      onRotateNow: rotateNow,
      onQuit: () => {
        isQuitting = true;
        app.quit();
      },
      buildDir: path.join(__dirname, '..', 'build'),
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    // 程序退出清理
    app.on('will-quit', () => {
      trayService?.destroy();
    });
  });

  // 关键修复：非 darwin 不再立即退出，由托盘保持后台
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') {
      // macOS 保持传统：无窗口 + 用户点 X → 由托盘接管（同 Win/Linux）
      // 注意：macOS 上点 X 不会自动 quit，托盘常驻语义统一
    }
    // Windows/Linux + 有托盘 → 不退出，托盘继续运行
  });
}
