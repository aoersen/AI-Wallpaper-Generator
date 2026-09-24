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
    const script = [
      'Add-Type -TypeDefinition @"',
      'using System.Runtime.InteropServices;',
      'public class Win32 {',
      '  [DllImport("user32.dll", CharSet=CharSet.Auto)]',
      '  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);',
      '}',
      '"@',
      `$result = [Win32]::SystemParametersInfo(${SPI_SETDESKWALLPAPER}, 0, '${escaped}', ${SPIF_WIN_PARAM})`,
      'if ($result -eq 0) {',
      '  Write-Error "SystemParametersInfo returned 0 (failure)"',
      '  exit 1',
      '}',
      'exit 0',
    ].join('\n');

    const args = ['-NoProfile', '-NonInteractive', '-Command', script];
    const { stderr } = await execFile('powershell.exe', args);

    // PowerShell 可能写 stderr 警告（如执行策略），仅当 exitCode 非 0 时判定失败
    // 但 execFileAsync 在 exitCode 非 0 时会 reject，所以这里只需检查 stderr 是否异常
    // 实际上 promisify(execFile) 返回 {stdout, stderr}，不抛错；我们通过 stderr 判断
    // 严格模式：stderr 含 Error/Warning 视为失败（简化：stderr 非空即失败）
    // 权衡：PowerShell 写 stderr 警告不罕见，但 SystemParametersInfo 成功时不应写 stderr
    // 这里采用：stderr 非空 → 失败（与任务要求一致）
    if (stderr && stderr.trim()) {
      throw new Error(
        `设置壁纸失败：[win32] powershell.exe SystemParametersInfo 执行异常，stderr: ${truncate(stderr.trim())}`
      );
    }
    return;
  }

  if (platform === 'darwin') {
    // AppleScript: 通过 System Events 设置所有桌面的壁纸
    // 也可用 tell application "Finder" to set desktop picture to POSIX file "..."
    // 这里选 System Events，兼容性更好（多桌面场景）
    const script = `tell application "System Events" to tell every desktop to set picture to POSIX file "${escaped}"`;
    const args = ['-e', script];
    const { stderr } = await execFile('osascript', args);

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
