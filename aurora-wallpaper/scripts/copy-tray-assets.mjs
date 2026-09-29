/**
 * 复制托盘图标到 dist/build/ 目录
 *
 * 原因：tsconfig.main.json outDir=dist ⇒ 产物在 dist/main/index.js，运行时 __dirname=<app>/dist/main
 * trayService 用 buildDir=path.join(__dirname,'..','build') ⇒ 解析为 <app>/dist/build
 * tsc 不复制静态资源，electron-builder.yml 的 files 白名单也不含 build/**，
 * 所以必须显式把 build/tray.ico 和 build/trayTemplate.png 复制到 dist/build/。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const assets = [
  'tray.ico',
  'trayTemplate.png',
];

const srcDir = path.join(projectRoot, 'build');
const destDir = path.join(projectRoot, 'dist', 'build');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const asset of assets) {
  const src = path.join(srcDir, asset);
  const dest = path.join(destDir, asset);
  if (!fs.existsSync(src)) {
    console.error(`[copy-tray-assets] 源文件不存在: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`[copy-tray-assets] ${asset} → dist/build/${asset}`);
}
