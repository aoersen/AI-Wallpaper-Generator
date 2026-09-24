/**
 * Aurora Wallpaper — 壁纸设置服务测试
 *
 * 通过注入 execFile 模拟命令执行，断言命令构造与路径转义。
 */

import { describe, it, expect, vi } from 'vitest';
import { setWallpaper } from '../src/main/services/wallpaperSetter';

describe('wallpaperSetter', () => {
  describe('win32', () => {
    it('调用 powershell.exe 并传入 SystemParametersInfo 脚本（含空格路径）', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const filePath = 'C:\\Users\\test user\\Pictures\\wallpaper.png';

      await setWallpaper(filePath, { platform: 'win32', execFile: mockExec });

      expect(mockExec).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExec.mock.calls[0];
      expect(cmd).toBe('powershell.exe');
      expect(args).toContain('-NoProfile');
      expect(args).toContain('-NonInteractive');
      expect(args).toContain('-Command');
      // 脚本内容在 args[3]
      const script = args[args.length - 1];
      expect(script).toContain('SystemParametersInfo');
      expect(script).toContain('20'); // SPI_SETDESKWALLPAPER
      expect(script).toContain('3'); // SPIF_UPDATEINIFILE | SPIF_SENDCHANGE
      // 路径含空格，应原样出现在单引号内
      expect(script).toContain("'C:\\Users\\test user\\Pictures\\wallpaper.png'");
    });

    it('路径含单引号时正确转义（单引号翻倍）', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const filePath = "C:\\Users\\test\\wall's.png";

      await setWallpaper(filePath, { platform: 'win32', execFile: mockExec });

      const script = mockExec.mock.calls[0][1][3];
      // 单引号应翻倍
      expect(script).toContain("'C:\\Users\\test\\wall''s.png'");
    });
  });

  describe('darwin', () => {
    it('调用 osascript 并传入 POSIX file 路径', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const filePath = '/Users/test user/Pictures/wallpaper.png';

      await setWallpaper(filePath, { platform: 'darwin', execFile: mockExec });

      expect(mockExec).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExec.mock.calls[0];
      expect(cmd).toBe('osascript');
      expect(args).toContain('-e');
      const script = args[args.length - 1];
      expect(script).toContain('tell application "System Events"');
      expect(script).toContain('set picture to POSIX file');
      expect(script).toContain('"/Users/test user/Pictures/wallpaper.png"');
    });

    it('路径含双引号时正确转义（双引号转义）', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const filePath = '/Users/test/wall"s.png';

      await setWallpaper(filePath, { platform: 'darwin', execFile: mockExec });

      const script = mockExec.mock.calls[0][1][1];
      // 双引号应转义
      expect(script).toContain('/Users/test/wall\\"s.png');
    });
  });

  describe('错误分支', () => {
    it('stderr 非空时抛出错误（含 stderr 内容）', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: 'SystemParametersInfo returned 0 (failure)' });
      const filePath = 'C:\\test\\wall.png';

      await expect(setWallpaper(filePath, { platform: 'win32', execFile: mockExec }))
        .rejects.toThrow(/设置壁纸失败/);
      await expect(setWallpaper(filePath, { platform: 'win32', execFile: mockExec }))
        .rejects.toThrow(/SystemParametersInfo returned 0/);
    });

    it('darwin stderr 非空时抛出错误', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: 'osascript error: execution error' });
      const filePath = '/Users/test/wall.png';

      await expect(setWallpaper(filePath, { platform: 'darwin', execFile: mockExec }))
        .rejects.toThrow(/设置壁纸失败/);
      await expect(setWallpaper(filePath, { platform: 'darwin', execFile: mockExec }))
        .rejects.toThrow(/osascript error/);
    });

    it('filePath 为空时抛出错误', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      await expect(setWallpaper('', { platform: 'win32', execFile: mockExec }))
        .rejects.toThrow(/filePath 不能为空/);
    });
  });

  describe('不支持的平台', () => {
    it('linux 抛出中文不支持错误', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      await expect(setWallpaper('/home/user/wall.png', { platform: 'linux', execFile: mockExec }))
        .rejects.toThrow(/当前平台暂不支持设置壁纸：linux/);
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('未知平台抛出中文不支持错误', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      await expect(setWallpaper('/path/wall.png', { platform: 'freebsd' as NodeJS.Platform, execFile: mockExec }))
        .rejects.toThrow(/当前平台暂不支持设置壁纸：freebsd/);
    });
  });
});
