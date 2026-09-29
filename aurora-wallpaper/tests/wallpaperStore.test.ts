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

  it('setFavorite 首次设置 favorite=true 后，list() 中该 record.favorite === true 且落盘可读', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const record = await store.downloadAndStore(`http://127.0.0.1:${port}/fav.png`, {
        prompt: 'fav test', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });

      // 初始 favorite 为 false
      expect(record.favorite).toBe(false);

      // 设置收藏
      const updated = store.setFavorite(record.id, true);
      expect(updated).not.toBeNull();
      expect(updated!.favorite).toBe(true);

      // list() 中该 record.favorite === true
      const list = store.list();
      const found = list.find((r) => r.id === record.id);
      expect(found).toBeDefined();
      expect(found!.favorite).toBe(true);

      // 落盘可读：重新读取 index.json
      const index = store.getIndex();
      const diskRecord = index.items.find((r) => r.id === record.id);
      expect(diskRecord).toBeDefined();
      expect(diskRecord!.favorite).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('setFavorite(id, true) 后再 setFavorite(id, false) 可还原', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const record = await store.downloadAndStore(`http://127.0.0.1:${port}/toggle.png`, {
        prompt: 'toggle test', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });

      // 设置收藏
      store.setFavorite(record.id, true);
      expect(store.list().find((r) => r.id === record.id)!.favorite).toBe(true);

      // 取消收藏
      const reverted = store.setFavorite(record.id, false);
      expect(reverted).not.toBeNull();
      expect(reverted!.favorite).toBe(false);

      // list() 中验证
      const found = store.list().find((r) => r.id === record.id);
      expect(found!.favorite).toBe(false);

      // 落盘验证：favorite:false 读回后为 boolean false 而非 undefined
      const index = store.getIndex();
      const diskRecord = index.items.find((r) => r.id === record.id);
      expect(diskRecord!.favorite).toBe(false);
      expect(diskRecord!.favorite).not.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('pruneToLimit 有收藏项时，不删除任何收藏记录', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // 灌入 20 张非收藏
      const ids: string[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await store.downloadAndStore(`http://127.0.0.1:${port}/base${i}.png`, {
          prompt: `base${i}`, rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
        });
        ids.push(r.id);
        await new Promise((r) => setTimeout(r, 1));
      }

      // 将前 3 张设为收藏
      const favIds = [ids[0], ids[1], ids[2]];
      for (const id of favIds) {
        store.setFavorite(id, true);
      }

      // 再灌入 5 张非收藏（auto prune 会删掉最旧的非收藏，但收藏应保留）
      for (let i = 0; i < 5; i++) {
        await store.downloadAndStore(`http://127.0.0.1:${port}/extra${i}.png`, {
          prompt: `extra${i}`, rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
        });
        await new Promise((r) => setTimeout(r, 1));
      }

      // 手动调用 pruneToLimit
      const result = store.pruneToLimit();

      // 验证收藏记录全部保留
      for (const id of favIds) {
        const found = result.find((r) => r.id === id);
        expect(found).toBeDefined();
        expect(found!.favorite).toBe(true);
      }

      // 验证总数量：3 收藏 + 20 非收藏 = 23
      expect(result).toHaveLength(23);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('C7-a: v1 JSON（无 version 字段）加载后自动迁移为 v2', () => {
    const wallpapersDir = path.join(tmpDir, 'wallpapers');
    fs.mkdirSync(wallpapersDir, { recursive: true });
    const v1Json = JSON.stringify({
      items: [{
        id: '1',
        filePath: '/test.png',
        source: 'bing',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }],
    });
    fs.writeFileSync(path.join(wallpapersDir, 'index.json'), v1Json);

    const index = store.getIndex();
    expect(index.version).toBe(2);
    expect(index.items[0].favorite).toBe(false);
  });

  it('C7-b: v1 JSON（version: 1）加载后自动迁移为 v2', () => {
    const wallpapersDir = path.join(tmpDir, 'wallpapers');
    fs.mkdirSync(wallpapersDir, { recursive: true });
    const v1Json = JSON.stringify({
      version: 1,
      items: [{
        id: '1',
        filePath: '/test.png',
        source: 'bing',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }],
    });
    fs.writeFileSync(path.join(wallpapersDir, 'index.json'), v1Json);

    const index = store.getIndex();
    expect(index.version).toBe(2);
    expect(index.items[0].favorite).toBe(false);
  });

  it('C7-c: 迁移后磁盘写回 v2 格式', () => {
    const wallpapersDir = path.join(tmpDir, 'wallpapers');
    fs.mkdirSync(wallpapersDir, { recursive: true });
    const v1Json = JSON.stringify({
      items: [{
        id: '1',
        filePath: '/test.png',
        source: 'bing',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }],
    });
    fs.writeFileSync(path.join(wallpapersDir, 'index.json'), v1Json);

    // 触发迁移
    store.getIndex();

    // 从磁盘重读验证持久化
    const raw = fs.readFileSync(path.join(wallpapersDir, 'index.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(2);
  });

  it('C7-d: v2 JSON 中 favorite 字段缺失时防御性补全', () => {
    const wallpapersDir = path.join(tmpDir, 'wallpapers');
    fs.mkdirSync(wallpapersDir, { recursive: true });
    const v2Json = JSON.stringify({
      version: 2,
      items: [{
        id: '1',
        filePath: '/test.png',
        source: 'bing',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      }],
    });
    fs.writeFileSync(path.join(wallpapersDir, 'index.json'), v2Json);

    const index = store.getIndex();
    expect(index.items[0].favorite).toBe(false);
    expect(index.items[0].favorite).not.toBeUndefined();
  });

  it('B4: setFavorite 超过 100 张收藏时返回 null', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // 下载并立即收藏 100 张（收藏记录不会被 prune 删除）
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        const r = await store.downloadAndStore(`http://127.0.0.1:${port}/fav${i}.png`, {
          prompt: `fav${i}`, rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
        });
        ids.push(r.id);
        store.setFavorite(r.id, true);
        await new Promise((r) => setTimeout(r, 1));
      }

      // 验证已收藏 100 张
      expect(store.list().filter(r => r.favorite).length).toBe(100);

      // 第 101 张尝试收藏 → 应返回 null
      const extra = await store.downloadAndStore(`http://127.0.0.1:${port}/extra.png`, {
        prompt: 'extra', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });
      const result = store.setFavorite(extra.id, true);
      expect(result).toBeNull();

      // 取消一张收藏后再收藏 → 应成功
      const reverted = store.setFavorite(ids[0], false);
      expect(reverted).not.toBeNull();
      const result2 = store.setFavorite(extra.id, true);
      expect(result2).not.toBeNull();
      expect(result2!.favorite).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('C2: jpg 源不被重编码（保留原 buffer 与原扩展名）', async () => {
    const http = await import('node:http');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      // JPEG header: FF D8 FF E0 ...
      res.end(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const record = await store.downloadAndStore(`http://127.0.0.1:${port}/photo.jpg`, {
        prompt: 'jpg test', rawInput: '', styleId: '', size: '16:9', mode: 'text-to-image',
      });
      // 扩展名应为 .jpg（不是 .png）
      expect(record.fileName).toMatch(/\.jpg$/);
      // 文件大小应与原始 buffer 一致（未重编码）
      expect(record.fileSize).toBe(8);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
