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
/* Electron nativeImage —— 用于 webp→png/jpg 转码                      */
/* 仅在 Electron 主进程可用；vitest 等 Node 环境走 try/catch 降级        */
/* ------------------------------------------------------------------ */

let electronNativeImage: typeof import('electron').nativeImage | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron');
  electronNativeImage = electron?.nativeImage;
} catch {
  // 非 Electron 主进程（如 vitest）：nativeImage 不可用，保留原 buffer
}

/* ------------------------------------------------------------------ */
/* 索引结构                                                            */
/* ------------------------------------------------------------------ */

interface IndexFile {
  version: number;
  items: WallpaperRecord[];
}

const INDEX_VERSION = 2;
const MAX_ITEMS = 20;
/** 收藏软上限 */
const MAX_FAVORITES = 100;

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

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
  /** 切换/设置收藏状态，返回更新后的记录；不存在则返回 null */
  setFavorite(id: string, favorite: boolean): WallpaperRecord | null;
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

  /** 读取索引，损坏/缺失回退空；v1 → v2 迁移补 favorite: false */
  function readIndex(): IndexFile {
    try {
      const raw = fs.readFileSync(indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as IndexFile;
      if (!parsed || !Array.isArray(parsed.items)) {
        return { version: INDEX_VERSION, items: [] };
      }

      // v1 (无 version 字段 或 version < 2) → v2 迁移
      if (!parsed.version || parsed.version < 2) {
        const migrated: WallpaperRecord[] = parsed.items.map((item) => ({
          ...item,
          favorite: item.favorite ?? false,
        }));
        const migratedIndex: IndexFile = { version: 2, items: migrated };
        // 写回磁盘，避免每次加载都重迁移
        writeIndex(migratedIndex);
        return migratedIndex;
      }

      // v2+ 记录里仍可能缺 favorite（防御性补全）
      const items: WallpaperRecord[] = parsed.items.map((item) => ({
        ...item,
        favorite: item.favorite ?? false,
      }));
      return { version: parsed.version, items };
    } catch {
      return { version: INDEX_VERSION, items: [] };
    }
  }

  /** 写入索引 */
  function writeIndex(index: IndexFile): void {
    ensureDir();
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 修剪规则：
   * - 不删除收藏记录
   * - 非收藏记录超过 MAX_ITEMS 条时，删除最旧的，直到 <= MAX_ITEMS 或只剩收藏
   * - 收藏记录软上限 100 条（超过 100 条收藏时不再新增收藏，由调用方保证）
   */
  function pruneToLimitImpl(): WallpaperRecord[] {
    const index = readIndex();
    const favorites = index.items.filter((i) => i.favorite);
    const nonFavorites = index.items.filter((i) => !i.favorite);

    // 非收藏未超限 → 不删
    if (nonFavorites.length <= MAX_ITEMS) {
      return index.items;
    }

    // 只删最旧的非收藏
    const sorted = [...nonFavorites].sort(compareByAgeAsc);
    const toRemoveCount = nonFavorites.length - MAX_ITEMS;
    const toRemove = sorted.slice(0, toRemoveCount);
    const toKeep = sorted.slice(toRemoveCount);

    for (const item of toRemove) {
      try {
        fs.unlinkSync(item.filePath);
      } catch {
        // 文件可能已不存在，忽略
      }
    }

    const newItems = [...favorites, ...toKeep];
    const newIndex: IndexFile = { version: INDEX_VERSION, items: newItems };
    writeIndex(newIndex);
    return newItems;
  }

  /**
   * 获取图片格式签名（PNG/JPEG/WEBP 等），用于决定是否转码。
   * 返回小写扩展名或空串（无法识别时）。
   */
  function detectImageExt(buf: Buffer): string {
    if (buf.length < 8) return '';
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
    // WEBP: RIFF....WEBP
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
    return '';
  }

  /**
   * 转码图片 buffer：仅当源为 webp（或其他非 png/jpg 格式）时才用 nativeImage 转码为 png；
   * 源已是 png/jpg/jpeg 时保留原 buffer 与原扩展名（避免把 jpg 重编码成巨大 PNG）。
   * nativeImage 不可用时降级：保留原 buffer，扩展名尝试检测或使用 .png + console.warn。
   */
  function transcodeImage(originalBuffer: Buffer): { buffer: Buffer; ext: string } {
    const detectedExt = detectImageExt(originalBuffer);

    // 已是 png/jpg → 保留原 buffer，不重编码
    if (detectedExt === 'png' || detectedExt === 'jpg') {
      return { buffer: originalBuffer, ext: detectedExt };
    }

    // webp 或其他格式 → 尝试用 nativeImage 转码为 png
    if (!electronNativeImage) {
      console.warn(`nativeImage 不可用，保留原 buffer（格式：${detectedExt || 'unknown'}）并使用 .png 扩展名`);
      return { buffer: originalBuffer, ext: 'png' };
    }

    try {
      const img = electronNativeImage.createFromBuffer(originalBuffer);
      if (img.isEmpty()) {
        console.warn('nativeImage.createFromBuffer 返回空图片，保留原 buffer 并使用 .png 扩展名');
        return { buffer: originalBuffer, ext: 'png' };
      }
      const pngBuffer = img.toPNG();
      return { buffer: pngBuffer, ext: 'png' };
    } catch (err) {
      console.warn(`nativeImage 解码失败：${err}，保留原 buffer 并使用 .png 扩展名`);
      return { buffer: originalBuffer, ext: 'png' };
    }
  }

  return {
    async downloadAndStore(url: string, meta: DownloadMeta): Promise<WallpaperRecord> {
      ensureDir();

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败：HTTP ${response.status}`);
      }

      const buf = Buffer.from(await response.arrayBuffer());
      const { buffer: transcodedBuf, ext } = transcodeImage(buf);
      const fileName = `wallpaper-${makeId()}.${ext}`;
      const filePath = path.join(wallpapersDir, fileName);

      fs.writeFileSync(filePath, transcodedBuf);

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
        favorite: false,
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

    setFavorite(id: string, favorite: boolean): WallpaperRecord | null {
      const index = readIndex();
      const idx = index.items.findIndex((item) => item.id === id);
      if (idx === -1) {
        return null;
      }

      // 收藏软上限：增到收藏时检查
      if (favorite && !index.items[idx].favorite) {
        const favCount = index.items.filter((i) => i.favorite).length;
        if (favCount >= MAX_FAVORITES) {
          return null; // 超过上限，不写入
        }
      }

      index.items[idx] = { ...index.items[idx], favorite };
      writeIndex(index);
      return index.items[idx];
    },
  };
}
