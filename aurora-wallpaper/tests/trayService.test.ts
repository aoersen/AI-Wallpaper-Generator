/**
 * trayService.ts unit tests
 *
 * Menu mock strategy: Menu.buildFromTemplate passes through the template so we can
 * verify labels and invoke the real click handlers that createTrayService constructs.
 * Other deps use standard vi.fn() mocks.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createTrayService } from '../src/main/services/trayService';

const projectRoot = path.resolve(path.dirname(__filename), '..');

beforeAll(() => {
  // Ensure tray icon assets exist under dist/build/ before any test runs.
  // dist/ is git-ignored and won't exist in a fresh checkout — this hook
  // makes `npm test` self-sufficient on CI (build-win.yml / build-mac.yml).
  execSync('npm run build:assets', { cwd: projectRoot, stdio: 'inherit' });
});

/** 复制脚本复制的托盘资源 */
describe('dist/build tray resources', () => {
  it('dist/build/tray.ico exists after build:assets', () => {
    const p = path.resolve(projectRoot, 'dist/build/tray.ico');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('dist/build/trayTemplate.png exists after build:assets', () => {
    const p = path.resolve(projectRoot, 'dist/build/trayTemplate.png');
    expect(fs.existsSync(p)).toBe(true);
  });
});

/** Helper to build a deps object with pass-through menu template */
function makeDeps(overrides: Record<string, any> = {}) {
  const trayMock = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  return {
    Tray: vi.fn(() => trayMock),
    Menu: { buildFromTemplate: vi.fn((tpl: any) => tpl) },
    nativeImage: {
      createFromPath: vi.fn(() => ({ isEmpty: () => false, resize: vi.fn() })),
    },
    platform: 'win32',
    getMainWindow: vi.fn(() => null),
    onRotateNow: vi.fn(),
    onQuit: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

describe('createTrayService', () => {
  it('Windows: passes correct template labels and click handlers invoke callbacks', () => {
    const winMock = { show: vi.fn(), focus: vi.fn() };
    const onRotateNowMock = vi.fn();
    const onQuitMock = vi.fn();
    const deps = makeDeps({
      getMainWindow: vi.fn(() => winMock),
      onRotateNow: onRotateNowMock,
      onQuit: onQuitMock,
    });

    createTrayService(deps as any);

    expect(deps.Tray).toHaveBeenCalledTimes(1);
    expect(deps.Menu.buildFromTemplate).toHaveBeenCalledTimes(1);

    const template = deps.Menu.buildFromTemplate.mock.calls[0]![0] as any[];
    expect(template).toHaveLength(4);
    expect(template[0].label).toBe('显示主窗口');
    expect(template[1].label).toBe('立即换一张');
    expect(template[2].type).toBe('separator');
    expect(template[3].label).toBe('退出');

    template[0].click();
    expect(winMock.show).toHaveBeenCalledTimes(1);
    expect(winMock.focus).toHaveBeenCalledTimes(1);

    template[1].click();
    expect(onRotateNowMock).toHaveBeenCalledTimes(1);

    template[3].click();
    expect(onQuitMock).toHaveBeenCalledTimes(1);
  });

  it('macOS: platform branch builds from trayTemplate.png and resizes to 16x16', () => {
    const resizeMock = vi.fn();
    const deps = makeDeps({ platform: 'darwin', nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => false, resize: resizeMock })) } });

    createTrayService(deps as any);

    expect(resizeMock).toHaveBeenCalledWith({ width: 16, height: 16 });
  });

  it('Linux: platform branch does NOT call resize (uses tray.ico via nativeImage)', () => {
    const resizeMock = vi.fn();
    const deps = makeDeps({ platform: 'linux', nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => false, resize: resizeMock })) } });

    createTrayService(deps as any);

    expect(resizeMock).not.toHaveBeenCalled();
  });

  it('tray.on("click") registers handler that shows main window', () => {
    const winMock = { show: vi.fn(), focus: vi.fn() };
    const deps = makeDeps({ platform: 'linux', getMainWindow: vi.fn(() => winMock) });

    createTrayService(deps as any);

    const firstArg = (deps.Tray as any).mock.results[0].value.on.mock.calls.map((c: any) => c[0]);
    expect(firstArg).toContain('click');

    // Find the click handler and invoke it
    const trayInstance = (deps.Tray as any).mock.results[0].value;
    const clickHandler = trayInstance.on.mock.calls.find((c: any) => c[0] === 'click')[1];
    clickHandler();
    expect(winMock.show).toHaveBeenCalledTimes(1);
    expect(winMock.focus).toHaveBeenCalledTimes(1);
  });

  it('destroy() calls tray.destroy()', () => {
    const deps = makeDeps({ platform: 'win32' });

    const service = createTrayService(deps as any);

    const trayInstance = (deps.Tray as any).mock.results[0].value;
    service.destroy();
    expect(trayInstance.destroy).toHaveBeenCalledTimes(1);
  });

  it('getMainWindow returns null — show click does not throw', () => {
    const deps = makeDeps({ platform: 'linux', getMainWindow: vi.fn(() => null) });

    createTrayService(deps as any);

    const template = deps.Menu.buildFromTemplate.mock.calls[0]![0] as any[];
    expect(() => template[0].click()).not.toThrow();
  });

  it('tooltip is set to "Aurora Wallpaper · 后台轮换中"', () => {
    const deps = makeDeps({});
    createTrayService(deps as any);
    const trayInstance = (deps.Tray as any).mock.results[0].value;
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('Aurora Wallpaper · 后台轮换中');
  });

  it('setContextMenu is called with built menu', () => {
    const deps = makeDeps({});
    createTrayService(deps as any);
    const trayInstance = (deps.Tray as any).mock.results[0].value;
    expect(trayInstance.setContextMenu).toHaveBeenCalledWith(expect.any(Array));
  });

  it('notifyBackgroundOnce() 连续调用 3 次 → deps.notify 只被调用 1 次，且参数为指定文案', () => {
    const notifyMock = vi.fn();
    const deps = makeDeps({ notify: notifyMock });
    const service = createTrayService(deps as any);

    service.notifyBackgroundOnce();
    service.notifyBackgroundOnce();
    service.notifyBackgroundOnce();

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      'Aurora Wallpaper 仍在后台运行',
      '定时轮换继续，右键托盘图标恢复窗口',
    );
  });

  it('notifyBackgroundOnce() 首次调用触发通知，第二次调用不再触发', () => {
    const notifyMock = vi.fn();
    const deps = makeDeps({ notify: notifyMock });
    const service = createTrayService(deps as any);

    service.notifyBackgroundOnce();
    expect(notifyMock).toHaveBeenCalledTimes(1);

    service.notifyBackgroundOnce();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('resolveIcons 路径落在 dist/build/ 下（win32 用 tray.ico）', () => {
    const deps = makeDeps({ platform: 'win32', buildDir: path.resolve(projectRoot, 'dist', 'build') });
    createTrayService(deps as any);

    expect(deps.nativeImage.createFromPath).toHaveBeenCalledWith(
      path.resolve(projectRoot, 'dist', 'build', 'tray.ico'),
    );
  });

  it('resolveIcons 路径落在 dist/build/ 下（darwin 用 trayTemplate.png）', () => {
    const deps = makeDeps({ platform: 'darwin', buildDir: path.resolve(projectRoot, 'dist', 'build') });
    createTrayService(deps as any);

    expect(deps.nativeImage.createFromPath).toHaveBeenCalledWith(
      path.resolve(projectRoot, 'dist', 'build', 'trayTemplate.png'),
    );
  });
});
