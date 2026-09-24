/**
 * Aurora Wallpaper — 壁纸存储服务测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWallpaperStore } from '../src/main/services/wallpaperStore';

describe('wallpaperStore', () => {
  let tmpDir: string;
  let store: ReturnType<typeof createWallpaperStore>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-store-'));
    store = createWallpaperStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloadAndStore 下载并写入文件', async () => {
    // 启动临时 HTTP 服务器提供图片
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const record = await store.downloadAndStore(`http://127.0.0.1:${port}/img.png`, {
        prompt: 'test prompt',
        rawInput: 'raw',
        styleId: 'style1',
        size: '16:9',
        mode: 'text-to-image',
      });

      expect(record.id).toBeTruthy();
      expect(record.fileName).toMatch(/^wallpaper-.+\.png$/);
      expect(fs.existsSync(record.filePath)).toBe(true);
      expect(record.fileSize).toBeGreaterThan(0);
      expect(record.prompt).toBe('test prompt');
      expect(record.size).toBe('16:9');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('getIndex 损坏时回退空', () => {
    fs.mkdirSync(path.join(tmpDir, 'wallpapers'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'wallpapers', 'index.json'), 'corrupted{{{');
    const index = store.getIndex();
    expect(index.items).toEqual([]);
  });

  it('list 按 createdAt 降序', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await store.downloadAndStore(`http://127.0.0.1:${port}/1.png`, {
        prompt: 'first', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });
      await new Promise((r) => setTimeout(r, 10));
      await store.downloadAndStore(`http://127.0.0.1:${port}/2.png`, {
        prompt: 'second', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });

      const list = store.list();
      expect(list).toHaveLength(2);
      expect(list[0].prompt).toBe('second');
      expect(list[1].prompt).toBe('first');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('pruneToLimit 超过 20 张时删除最旧的', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // 灌入 25 张
      for (let i = 0; i < 25; i++) {
        await store.downloadAndStore(`http://127.0.0.1:${port}/img${i}.png`, {
          prompt: `img${i}`, rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
        });
        await new Promise((r) => setTimeout(r, 1));
      }

      const list = store.list();
      expect(list).toHaveLength(20);
      // 最旧的 5 张（img0-img4）应被删除
      const prompts = list.map((r) => r.prompt);
      expect(prompts).not.toContain('img0');
      expect(prompts).not.toContain('img4');
      expect(prompts).toContain('img24');

      // 文件也应被删除
      const files = fs.readdirSync(path.join(tmpDir, 'wallpapers')).filter((f) => f !== 'index.json');
      expect(files).toHaveLength(20);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deleteById 删除文件+记录', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const record = await store.downloadAndStore(`http://127.0.0.1:${port}/del.png`, {
        prompt: 'to delete', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });

      expect(fs.existsSync(record.filePath)).toBe(true);
      const deleted = store.deleteById(record.id);
      expect(deleted).toBe(true);
      expect(fs.existsSync(record.filePath)).toBe(false);
      expect(store.list()).toHaveLength(0);

      // 重复删除返回 false
      expect(store.deleteById(record.id)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
