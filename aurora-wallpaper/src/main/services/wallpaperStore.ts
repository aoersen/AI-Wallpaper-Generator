/**
 * Aurora Wallpaper — 壁纸存储服务
 *
 * 下载图片 URL → userData/wallpapers/，维护 index.json 元数据。
 * 通过 createWallpaperStore(baseDir) 工厂注入根目录，测试用临时目录。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GenerateMode, ImageAspectRatio, WallpaperRecord } from '../../shared/types';

/* ------------------------------------------------------------------ */
/* 索引结构                                                            */
/* ------------------------------------------------------------------ */

interface IndexFile {
  version: number;
  items: WallpaperRecord[];
}

const INDEX_VERSION = 1;
const MAX_ITEMS = 20;

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** 从 URL path 推断扩展名 */
function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    return ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : '';
  } catch {
    return '';
  }
}

/** 从 Content-Type 推断扩展名 */
function extFromContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  return '';
}

/** 进程内单调递增序号：保证同毫秒内生成的 id 次序稳定 */
let idSequence = 0;

/** 生成唯一 id：时间戳 + 单调序号（同毫秒内按序号排序仍稳定） */
function makeId(): string {
  idSequence += 1;
  return `${Date.now()}-${String(idSequence).padStart(6, '0')}`;
}

/** 按年龄升序比较：createdAt 相同毫秒时用 id 内嵌的单调序号决胜 */
function compareByAgeAsc(a: WallpaperRecord, b: WallpaperRecord): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* 服务接口                                                            */
/* ------------------------------------------------------------------ */

export interface DownloadMeta {
  prompt: string;
  rawInput: string;
  styleId: string;
  size: ImageAspectRatio;
  mode: GenerateMode;
}

export interface WallpaperStore {
  /** 下载 URL 并写入本地，返回记录 */
  downloadAndStore(url: string, meta: DownloadMeta): Promise<WallpaperRecord>;
  /** 读取索引（损坏回退空列表） */
  getIndex(): IndexFile;
  /** 列出全部记录（按 createdAt 降序） */
  list(): WallpaperRecord[];
  /** 修剪到 MAX_ITEMS 条，删除最旧的文件+记录 */
  pruneToLimit(): WallpaperRecord[];
  /** 按 id 删除文件+记录 */
  deleteById(id: string): boolean;
}

/* ------------------------------------------------------------------ */
/* 工厂                                                                */
/* ------------------------------------------------------------------ */

export function createWallpaperStore(baseDir: string): WallpaperStore {
  const wallpapersDir = path.join(baseDir, 'wallpapers');
  const indexPath = path.join(wallpapersDir, 'index.json');

  /** 确保目录存在 */
  function ensureDir(): void {
    fs.mkdirSync(wallpapersDir, { recursive: true });
  }

  /** 读取索引，损坏/缺失回退空 */
  function readIndex(): IndexFile {
    try {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as IndexFile;
      if (!parsed || !Array.isArray(parsed.items)) {
        return { version: INDEX_VERSION, items: [] };
      }
      return parsed;
    } catch {
      return { version: INDEX_VERSION, items: [] };
    }
  }

  /** 写入索引 */
  function writeIndex(index: IndexFile): void {
    ensureDir();
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /** 修剪到 MAX_ITEMS 条（按 createdAt 升序，同毫秒用 id 决胜），删除最旧的文件+记录 */
  function pruneToLimitImpl(): WallpaperRecord[] {
    const index = readIndex();
    if (index.items.length <= MAX_ITEMS) {
      return index.items;
    }

    // 最旧的在前
    const sorted = [...index.items].sort(compareByAgeAsc);
    const toRemove = sorted.slice(0, sorted.length - MAX_ITEMS);
    const toKeep = sorted.slice(sorted.length - MAX_ITEMS);

    for (const item of toRemove) {
      try {
        fs.unlinkSync(item.filePath);
      } catch {
        // 文件可能已不存在，忽略
      }
    }

    index.items = toKeep;
    writeIndex(index);
    return toKeep;
  }

  return {
    async downloadAndStore(url: string, meta: DownloadMeta): Promise<WallpaperRecord> {
      ensureDir();

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败：HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const ext = extFromContentType(contentType) || extFromUrl(url) || 'png';
      const fileName = `wallpaper-${makeId()}.${ext}`;
      const filePath = path.join(wallpapersDir, fileName);

      const buf = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buf);

      const record: WallpaperRecord = {
        id: makeId(),
        fileName,
        filePath,
        prompt: meta.prompt,
        rawInput: meta.rawInput,
        styleId: meta.styleId,
        size: meta.size,
        mode: meta.mode,
        fileSize: buf.length,
        createdAt: new Date().toISOString(),
      };

      const index = readIndex();
      index.items.push(record);
      writeIndex(index);

      // 自动修剪到上限：任何调用入口（IPC handler / 测试直调）都不会超量存储
      pruneToLimitImpl();

      return record;
    },

    getIndex(): IndexFile {
      return readIndex();
    },

    list(): WallpaperRecord[] {
      const index = readIndex();
      return [...index.items].sort((a, b) => -compareByAgeAsc(a, b));
    },

    pruneToLimit(): WallpaperRecord[] {
      return pruneToLimitImpl();
    },

    deleteById(id: string): boolean {
      const index = readIndex();
      const idx = index.items.findIndex((item) => item.id === id);
      if (idx === -1) {
        return false;
      }

      const [removed] = index.items.splice(idx, 1);
      try {
        fs.unlinkSync(removed.filePath);
      } catch {
        // 文件可能已不存在，忽略
      }

      writeIndex(index);
      return true;
    },
  };
}
