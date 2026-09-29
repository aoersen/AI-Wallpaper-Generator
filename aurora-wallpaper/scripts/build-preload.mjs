/**
 * 构建 preload 为单文件 CJS bundle（sandbox 兼容）。
 *
 * 主窗口 webPreferences 启用了 sandbox: true，sandbox 化的 preload 只能
 * require 少量 Electron 内置模块（electron / events / timers / url），
 * 无法加载本地相对路径模块。tsc 直出的产物会残留 `require("../shared/ipc")`，
 * 导致 preload 在启动时报 "module not found"、window.aurora 未注入、界面白屏。
 *
 * 因此用 esbuild 把 preload 及其引用的 shared 常量打包进单个文件，
 * electron 保持 external（sandbox 提供该模块）。
 */

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src/preload/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['electron'],
  outfile: path.join(root, 'dist/preload/index.js'),
  sourcemap: false,
  logLevel: 'info',
});
