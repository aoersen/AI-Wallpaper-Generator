/**
 * Aurora Wallpaper — Qwen 客户端测试
 *
 * 使用 node:http 本地 mock 服务器验证请求体与错误分类。
 * 传输层（qwenHttp）被 vi.mock 替换为基于 fetch 的本地实现，
 * 因此本套测试不依赖 pq-client 二进制，可在无 Go 环境运行。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../src/main/services/qwenHttp', () => ({
  performRequest: vi.fn(
    async ({ url, apiKey, body, timeoutMs }: { url: string; apiKey: string; body: unknown; timeoutMs: number }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        return { status: res.status, bodyText: await res.text() };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw Object.assign(new Error('请求超时'), { code: 'TIMEOUT' });
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  ),
}));

import { generateImage, generateImageWithRetry } from '../src/main/services/qwenClient';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import type { AppSettings } from '../src/shared/types';

/* ------------------------------------------------------------------ */
/* Mock 服务器                                                         */
/* ------------------------------------------------------------------ */

interface MockResponse {
  status?: number;
  body?: unknown;
  /** 延迟响应毫秒（用于超时测试） */
  delayMs?: number;
}

let server: http.Server;
let serverPort: number;
let lastRequest: { method: string; path: string; body: unknown } | null = null;
let mockResponse: MockResponse = { status: 200, body: { choices: [{ message: { content: 'https://cdn.example.com/img.png' } }] } };

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        lastRequest = {
          method: req.method ?? '',
          path: req.url ?? '',
          body: body ? JSON.parse(body) : null,
        };

        const respond = () => {
          const status = mockResponse.status ?? 200;
          const bodyStr = typeof mockResponse.body === 'string'
            ? mockResponse.body
            : JSON.stringify(mockResponse.body ?? {});
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(bodyStr);
        };

        if (mockResponse.delayMs) {
          setTimeout(respond, mockResponse.delayMs);
        } else {
          respond();
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as AddressInfo).port;
      resolve();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    baseURL: `http://127.0.0.1:${serverPort}/v1`,
    apiKey: 'c2a_test',
    requestTimeoutMs: 500,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* 测试                                                                */
/* ------------------------------------------------------------------ */

describe('qwenClient', () => {
  beforeEach(async () => {
    lastRequest = null;
    mockResponse = { status: 200, body: { choices: [{ message: { content: 'https://cdn.example.com/img.png' } }] } };
    await startServer();
  });

  afterEach(async () => {
    await stopServer();
  });

  it('请求 method/path/body 正确（文生图）', async () => {
    const result = await generateImage({
      prompt: '一只橘猫',
      size: '16:9',
      settings: makeSettings(),
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/img.png');
    expect(lastRequest?.method).toBe('POST');
    expect(lastRequest?.path).toBe('/v1/chat/completions');
    const body = lastRequest?.body as Record<string, unknown>;
    expect(body.model).toBe('qwen-image');
    expect(body.stream).toBe(false);
    expect(body.size).toBe('16:9');
    expect(body.messages).toEqual([{ role: 'user', content: '一只橘猫' }]);
  });

  it('图生图 content 为多模态数组（base64 data URI）', async () => {
    // 创建临时图片文件
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    try {
      await generateImage({
        prompt: '参考风格生成雪景',
        referenceImages: [{ recordId: 'r1', filePath: tmpFile }],
        size: '16:9',
        settings: makeSettings(),
      });

      const body = lastRequest?.body as Record<string, unknown>;
      const messages = body.messages as Array<{ content: unknown }>;
      const content = messages[0].content as Array<Record<string, unknown>>;
      expect(Array.isArray(content)).toBe(true);
      expect(content[0].type).toBe('image_url');
      expect((content[0].image_url as { url: string }).url).toMatch(/^data:image\/png;base64,/);
      expect(content[1].type).toBe('text');
      expect((content[1] as { text: string }).text).toBe('参考风格生成雪景');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('未配置 apiKey 抛 NO_API_KEY', async () => {
    await expect(
      generateImage({ prompt: 'test', size: '16:9', settings: makeSettings({ apiKey: '' }) }),
    ).rejects.toMatchObject({ code: 'NO_API_KEY', message: '尚未配置 API Key，请先在设置中填写' });
  });

  it('HTTP 500 抛 HTTP_ERROR', async () => {
    mockResponse = { status: 500, body: { error: 'Internal Server Error' } };
    await expect(
      generateImage({ prompt: 'test', size: '16:9', settings: makeSettings() }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('超时抛 TIMEOUT', async () => {
    mockResponse = { status: 200, body: {}, delayMs: 2000 };
    await expect(
      generateImage({ prompt: 'test', size: '16:9', settings: makeSettings({ requestTimeoutMs: 300 }) }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('content 非 URL 抛 INVALID_RESPONSE', async () => {
    mockResponse = { status: 200, body: { choices: [{ message: { content: 'not a url' } }] } };
    await expect(
      generateImage({ prompt: 'test', size: '16:9', settings: makeSettings() }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: '响应内容不是有效的图片 URL' });
  });

  it('响应非 JSON 抛 INVALID_RESPONSE', async () => {
    mockResponse = { status: 200, body: 'not json' };
    await expect(
      generateImage({ prompt: 'test', size: '16:9', settings: makeSettings() }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('重试：第 1 次失败第 2 次成功', async () => {
    let callCount = 0;
    const originalMock = mockResponse;
    mockResponse = { status: 500, body: {} };

    // 用自定义服务器逻辑：第一次 500，第二次 200
    await stopServer();
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        callCount++;
        if (callCount === 1) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end('{}');
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { content: 'https://cdn.example.com/ok.png' } }] }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(serverPort, '127.0.0.1', resolve));

    const attempts: number[] = [];
    const result = await generateImageWithRetry(
      { prompt: 'test', size: '16:9', settings: makeSettings() },
      { maxAttempts: 3, intervalMs: 10, onAttempt: (a) => attempts.push(a) },
    );

    expect(result.imageUrl).toBe('https://cdn.example.com/ok.png');
    expect(attempts).toEqual([1, 2]);
    expect(callCount).toBe(2);
    mockResponse = originalMock;
  });

  it('NO_API_KEY 不重试直接抛', async () => {
    let callCount = 0;
    await stopServer();
    server = http.createServer((_req, res) => {
      callCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'https://cdn.example.com/x.png' } }] }));
    });
    await new Promise<void>((resolve) => server.listen(serverPort, '127.0.0.1', resolve));

    await expect(
      generateImageWithRetry(
        { prompt: 'test', size: '16:9', settings: makeSettings({ apiKey: '' }) },
        { maxAttempts: 3, intervalMs: 10 },
      ),
    ).rejects.toMatchObject({ code: 'NO_API_KEY' });
    expect(callCount).toBe(0);
  });
});
