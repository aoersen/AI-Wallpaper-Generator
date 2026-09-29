/**
 * Aurora Wallpaper — 壁纸设置服务
 *
 * 通过平台原生命令设置桌面壁纸：
 * - win32: PowerShell + user32.dll::SystemParametersInfo(20, 0, path, 3)
 * - darwin: osascript tell System Events / Finder set picture
 *
 * 设计要点：
 * - 不依赖 electron，所有副作用通过 WallpaperSetterDeps 注入 → vitest 可测
 * - 路径转义：win32 单引号内单引号翻倍；darwin 双引号内双引号转义
 * - 失败时 Error message 含平台、命令、退出码、stderr（截断 500 字符）
 * - Windows: PowerShell 脚本内 try/catch + 显式 exit 1，主进程只信任退出码
 */

import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const SPI_SETDESKWALLPAPER = 20;
const SPIF_UPDATEINIFILE = 0x01;
const SPIF_SENDCHANGE = 0x02;
const SPIF_WIN_PARAM = SPIF_UPDATEINIFILE | SPIF_SENDCHANGE; // = 3

/** 注入依赖，便于测试 */
export interface WallpaperSetterDeps {
  /** 平台标识，默认 process.platform */
  platform?: NodeJS.Platform;
  /** 命令执行器，默认 node child_process execFile promisify */
  execFile?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  /** 路径转义函数（内部默认实现，可覆盖用于测试） */
  escapePath?: (p: string, platform: NodeJS.Platform) => string;
}

const execFileAsync = promisify(nodeExecFile);

/**
 * 转义路径中的特殊字符。
 * - win32: 用于 PowerShell 单引号字符串，单引号翻倍
 * - darwin: 用于 AppleScript 双引号字符串，双引号转义
 */
function defaultEscapePath(p: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    // PowerShell 单引号字符串：单引号 → 两个单引号
    return p.replace(/'/g, "''");
  }
  if (platform === 'darwin') {
    // AppleScript 双引号字符串：双引号 → \"
    return p.replace(/"/g, '\\"');
  }
  return p;
}

/** 截断字符串，避免错误消息过长 */
function truncate(s: string, max = 500): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...(截断，共 ${s.length} 字符)`;
}

/**
 * 设置桌面壁纸。
 * @param filePath 本地图片绝对路径
 * @param deps 注入依赖（测试用）
 * @throws Error 设置失败时抛出，message 含平台、命令、退出码、stderr
 */
export async function setWallpaper(filePath: string, deps: WallpaperSetterDeps = {}): Promise<void> {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('设置壁纸失败：filePath 不能为空');
  }

  const platform = deps.platform ?? process.platform;
  const execFile = deps.execFile ?? ((cmd: string, args: string[]) =>
    execFileAsync(cmd, args).then(({ stdout, stderr }) => ({ stdout, stderr }))
  );
  const escapePath = deps.escapePath ?? defaultEscapePath;

  const escaped = escapePath(filePath, platform);

  if (platform === 'win32') {
    // PowerShell 脚本：通过 P/Invoke 调用 user32.dll::SystemParametersInfo
    // 脚本内 try/catch + 显式 exit 1，主进程只信任退出码
    const script = [
      'try {',
      '  Add-Type -TypeDefinition @"',
      'using System.Runtime.InteropServices;',
      'public class Win32 {',
      '  [DllImport("user32.dll", CharSet=CharSet.Auto)]',
      '  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);',
      '}',
      '"@',
      `  $result = [Win32]::SystemParametersInfo(${SPI_SETDESKWALLPAPER}, 0, '${escaped}', ${SPIF_WIN_PARAM})`,
      '  if ($result -eq 0) {',
      '    Write-Error "SystemParametersInfo returned 0 (failure)"',
      '    exit 1',
      '  }',
      '  exit 0',
      '} catch {',
      '  Write-Error $_',
      '  exit 1',
      '}',
    ].join('\n');

    const args = ['-NoProfile', '-NonInteractive', '-Command', script];
    await execFile('powershell.exe', args);

    // 主进程只信任退出码，不再检查 stderr 是否非空
    // PowerShell 执行策略警告会写 stderr，但脚本内 try/catch 已确保失败时 exit 1
    // execFileAsync 在 exitCode 非 0 时会 reject，因此能执行到这里即代表成功
    return;
  }

  if (platform === 'darwin') {
    // AppleScript: 通过 System Events 设置所有桌面的壁纸
    // 也可用 tell application "Finder" to set desktop picture to POSIX file "..."
    // 这里选 System Events，兼容性更好（多桌面场景）
    const script = `tell application "System Events" to tell every desktop to set picture to POSIX file "${escaped}"`;
    const args = ['-e', script];

    let stderr = '';
    try {
      const result = await execFile('osascript', args);
      stderr = result.stderr;
    } catch (err: any) {
      // osascript 退出码非 0，execFileAsync 会 reject
      stderr = err?.stderr ?? err?.message ?? '';

      // 检查是否为自动化权限错误（-1743 / errAEEventNotPermitted）
      if (/-1743|errAEEventNotPermitted/.test(stderr)) {
        throw new Error(
          `设置壁纸失败：缺少自动化权限。请前往「系统设置 → 隐私与安全性 → 自动化」，打开 Aurora Wallpaper 的开关；若列表里没有，终端运行 tccutil reset AppleEvents com.aurora.wallpaper 重置后再试。原始错误: ${truncate(stderr.trim())}`
        );
      }

      throw new Error(
        `设置壁纸失败：[darwin] osascript 执行异常，stderr: ${truncate(stderr.trim())}`
      );
    }

    if (stderr && stderr.trim()) {
      throw new Error(
        `设置壁纸失败：[darwin] osascript 执行异常，stderr: ${truncate(stderr.trim())}`
      );
    }
    return;
  }

  // 其他平台不支持
  throw new Error(`当前平台暂不支持设置壁纸：${platform}`);
}
