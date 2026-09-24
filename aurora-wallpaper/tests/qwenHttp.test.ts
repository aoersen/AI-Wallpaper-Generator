/**
 * Aurora Wallpaper — pq-client 传输层集成测试
 *
 * 走真实 pq-client 二进制（spawn 子进程 + JSON 协议），验证：
 * 状态码/响应体透传、超时分类、连接失败分类。
 * 二进制缺失（未运行 npm run build:pq-client）时整体跳过。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { performRequest } from '../src/main/services/qwenHttp';

/** 与 qwenHttp.resolveBinaryPath 的开发模式路径保持一致 */
function devBinaryPath(): string | null {
  const exeName = process.platform === 'win32' ? 'pq-client.exe' : 'pq-client';
  const dirName = process.platform === 'win32'
    ? 'win-x64'
    : process.platform === 'darwin'
      ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64')
      : `linux-${process.arch}`;
  const candidate = path.resolve(process.cwd(), 'tools', 'pq-client', 'bin', dirName, exeName);
  return fs.existsSync(candidate) ? candidate : null;
}

const hasBinary = devBinaryPath() !== null;

describe.skipIf(!hasBinary)('qwenHttp（pq-client 集成）', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // /slow 延迟 8 秒（超时用例）；/error 返回 500；其余 200
        if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"late":true}');
          }, 8000);
          return;
        }
        if (req.url === '/error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end('{"error":"boom"}');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: req.url, echo: body ? JSON.parse(body) : null }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as AddressInfo).port;
      resolve();
    }));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('200：状态码与响应体透传', async () => {
    const result = await performRequest({
      url: `http://127.0.0.1:${serverPort}/ok`,
      apiKey: 'c2a_test',
      body: { hello: '世界' },
      timeoutMs: 5000,
    });
    expect(result.status).toBe(200);
    const parsed = JSON.parse(result.bodyText) as { path: string; echo: { hello: string } };
    expect(parsed.path).toBe('/ok');
    expect(parsed.echo.hello).toBe('世界');
  });

  it('500：状态码透传，不抛错（由上层分类 HTTP_ERROR）', async () => {
    const result = await performRequest({
      url: `http://127.0.0.1:${serverPort}/error`,
      apiKey: 'c2a_test',
      body: {},
      timeoutMs: 5000,
    });
    expect(result.status).toBe(500);
    expect(result.bodyText).toBe('{"error":"boom"}');
  });

  it('超时：抛 TIMEOUT', async () => {
    await expect(
      performRequest({
        url: `http://127.0.0.1:${serverPort}/slow`,
        apiKey: 'c2a_test',
        body: {},
        timeoutMs: 400,
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  }, 10_000);

  it('连接失败：抛 NETWORK_ERROR', async () => {
    // 选一个几乎必然无监听的端口（先 bind 再 close，端口已释放）
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const deadPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    await expect(
      performRequest({
        url: `http://127.0.0.1:${deadPort}/nope`,
        apiKey: 'c2a_test',
        body: {},
        timeoutMs: 3000,
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
