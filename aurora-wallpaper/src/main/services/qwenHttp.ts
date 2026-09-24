/**
 * Aurora Wallpaper — HTTP 传输层（pq-client 助手）
 *
 * Electron 主进程的 TLS 栈（BoringSSL / Node 20）不支持 X25519MLKEM768
 * 后量子密钥交换，而业务服务器只接受携带该 keyshare 的 TLS 1.3 ClientHello，
 * 不带会直接 RST。因此所有业务 HTTP 请求都委托给独立编译的 Go 助手
 * （tools/pq-client，Go ≥ 1.24 的 crypto/tls 默认发送 X25519MLKEM768），
 * 通过 stdin/stdout 的 JSON 协议交互。
 *
 * 助手定位顺序：AURORA_PQ_CLIENT 环境变量 → 打包后的 resources/pq-client/
 * → 开发模式项目内 tools/pq-client/bin/<平台>-<架构>/ → PATH 中的裸名。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { QwenError } from './qwenErrors';

/** 传输层输入：一次 HTTP POST（JSON body） */
export interface PerformRequestInput {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
}

/** 传输层输出：HTTP 状态码 + 响应体原文（4xx/5xx 也正常返回，由上层分类） */
export interface PerformRequestResult {
  status: number;
  bodyText: string;
}

/** 助手 stdout 协议消息 */
interface HelperResult {
  ok: boolean;
  status?: number;
  bodyText?: string;
  code?: 'TIMEOUT' | 'NETWORK_ERROR';
  message?: string;
}

/** stdout/stderr 收集上限，防止异常输出撑爆内存 */
const MAX_STDOUT = 64 * 1024 * 1024;
const MAX_STDERR = 64 * 1024;

/** 助手超时后的额外宽限（覆盖进程启动开销），超限则强杀 */
const KILL_GRACE_MS = 5000;

/** 助手文件名（按平台带/不带 .exe） */
function helperFileName(): string {
  return process.platform === 'win32' ? 'pq-client.exe' : 'pq-client';
}

/** 解析助手二进制路径；找不到返回 null */
function resolveBinaryPath(): string | null {
  const exeName = helperFileName();
  const candidates: Array<string | null> = [
    // 1. 显式覆盖（调试/特殊部署）
    process.env.AURORA_PQ_CLIENT ?? null,
    // 2. 打包后：electron-builder extraResources → resources/pq-client/
    path.join((process as { resourcesPath?: string }).resourcesPath ?? '', 'pq-client', exeName),
    // 3. 开发模式：项目根 tools/pq-client/bin/<平台>-<架构>/
    path.resolve(process.cwd(), 'tools', 'pq-client', 'bin', platformDirName(), exeName),
    // 4. PATH 兜底（裸名交给 spawn 自行解析）
    exeName,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === exeName) return candidate; // 最后兜底，无法预检存在性
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 当前宿主平台/架构 → 构建脚本产物目录名（Windows 统一 x64） */
function platformDirName(): string {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  return `linux-${process.arch}`;
}

interface HelperRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** spawn 本身失败（ENOENT 等） */
  spawnError: string | null;
  /** 超时强杀 */
  timedOut: boolean;
}

/** 启动助手进程、写入请求、收集输出 */
function runHelper(binary: string, payload: PerformRequestInput): Promise<HelperRunResult> {
  return new Promise((resolve) => {
    const child = spawn(binary, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (result: HelperRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(0, payload.timeoutMs) + KILL_GRACE_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(killTimer);
      finish({ stdout, stderr, exitCode: null, spawnError: err.message, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      finish({ stdout, stderr, exitCode: code, spawnError: null, timedOut });
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

/** 解析助手 stdout 最后一行 JSON；失败返回 null */
function parseHelperOutput(stdout: string): HelperResult | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  const last = lines[lines.length - 1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last) as HelperResult;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.ok !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 执行一次 HTTP POST 请求（委托 pq-client 助手）。
 * 成功返回 { status, bodyText }；超时抛 QwenError(TIMEOUT)；其余抛 QwenError(NETWORK_ERROR)。
 */
export async function performRequest(input: PerformRequestInput): Promise<PerformRequestResult> {
  const binary = resolveBinaryPath();
  if (!binary) {
    throw new QwenError(
      'NETWORK_ERROR',
      '内置网络客户端（pq-client）缺失：开发模式请先运行 npm run build:pq-client',
    );
  }

  const timeoutSeconds = Math.max(1, Math.round(input.timeoutMs / 1000));
  const run = await runHelper(binary, input);

  if (run.timedOut) {
    throw new QwenError('TIMEOUT', `请求超时（${timeoutSeconds} 秒）`);
  }
  if (run.spawnError) {
    throw new QwenError('NETWORK_ERROR', `无法启动内置网络客户端：${run.spawnError}`);
  }

  const parsed = parseHelperOutput(run.stdout);
  if (!parsed) {
    const detail = run.stderr.trim() ? `：${run.stderr.trim().slice(0, 300)}` : '';
    throw new QwenError('NETWORK_ERROR', `内置网络客户端返回异常（退出码 ${run.exitCode}）${detail}`);
  }
  if (!parsed.ok) {
    if (parsed.code === 'TIMEOUT') {
      throw new QwenError('TIMEOUT', `请求超时（${timeoutSeconds} 秒）`);
    }
    throw new QwenError('NETWORK_ERROR', parsed.message || '网络错误');
  }

  return { status: parsed.status ?? 0, bodyText: parsed.bodyText ?? '' };
}
