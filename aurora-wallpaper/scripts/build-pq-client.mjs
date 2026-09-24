/**
 * 构建 pq-client 助手二进制（Go ≥ 1.24，仅标准库）。
 *
 * 用法：
 *   node scripts/build-pq-client.mjs        # 当前平台（win→x64；mac→arm64/x64 按宿主）
 *   node scripts/build-pq-client.mjs --all  # win-x64 + mac-arm64 + mac-x64 全量交叉编译
 *
 * 产物布局（electron-builder extraResources 按 ${os}-${arch} 选取）：
 *   tools/pq-client/bin/win-x64/pq-client.exe
 *   tools/pq-client/bin/mac-arm64/pq-client
 *   tools/pq-client/bin/mac-x64/pq-client
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modDir = path.join(root, 'tools', 'pq-client');
const binDir = path.join(modDir, 'bin');

const TARGETS = [
  { name: 'win-x64', goos: 'windows', goarch: 'amd64', ext: '.exe' },
  { name: 'mac-arm64', goos: 'darwin', goarch: 'arm64', ext: '' },
  { name: 'mac-x64', goos: 'darwin', goarch: 'amd64', ext: '' },
];

/** 读取 go 版本号，保证 ≥ 1.24（X25519MLKEM768 默认启用） */
function checkGoVersion() {
  const out = execFileSync('go', ['version'], { encoding: 'utf8' });
  const m = out.match(/go(\d+)\.(\d+)/);
  if (!m) throw new Error(`无法解析 go version 输出：${out.trim()}`);
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major < 1 || (major === 1 && minor < 24)) {
    throw new Error(`需要 Go ≥ 1.24（X25519MLKEM768 自 1.24 默认启用），当前为 ${major}.${minor}。请先安装 Go。`);
  }
}

function build(target) {
  const out = path.join(binDir, target.name, `pq-client${target.ext}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('go', ['build', '-trimpath', '-ldflags', '-s -w', '-o', out, '.'], {
    cwd: modDir,
    encoding: 'utf8',
    env: { ...process.env, GOOS: target.goos, GOARCH: target.goarch, CGO_ENABLED: '0' },
    stdio: 'inherit',
  });
  const sizeMB = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`✓ ${target.name}/pq-client${target.ext} (${sizeMB} MB)`);
}

/** 当前宿主平台对应的目标（Windows 无论宿主位数统一产出 x64） */
function currentTarget() {
  if (process.platform === 'win32') return TARGETS[0];
  if (process.platform === 'darwin') return process.arch === 'arm64' ? TARGETS[1] : TARGETS[2];
  throw new Error(`不支持的宿主平台：${process.platform}（仅支持 Windows / macOS）`);
}

try {
  checkGoVersion();
  const targets = process.argv.includes('--all') ? TARGETS : [currentTarget()];
  for (const t of targets) build(t);
} catch (err) {
  console.error(`✗ pq-client 构建失败：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
