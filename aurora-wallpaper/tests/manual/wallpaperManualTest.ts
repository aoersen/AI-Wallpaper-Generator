/**
 * 手动测试：生成纯色 PNG 并设置为桌面壁纸（仅 Windows）
 * 运行后请观察桌面壁纸是否已更换为红色纯色。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { setWallpaper } from '../../src/main/services/wallpaperSetter';

/** 生成一个 256x256 的纯色 PNG（红色） */
function generateSolidPng(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const width = 256;
  const height = 256;
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(2, 9);   // color type: RGB
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const pxStart = rowStart + 1 + x * 3;
      rawData[pxStart] = 255;
      rawData[pxStart + 1] = 0;
      rawData[pxStart + 2] = 0;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

const crc32Table: number[] = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crc32Table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-wallpaper-test-'));
  const pngPath = path.join(tmpDir, 'test-red.png');
  const png = generateSolidPng();
  fs.writeFileSync(pngPath, png);
  console.log(`[manual] 生成测试图片: ${pngPath} (${png.length} bytes)`);

  try {
    await setWallpaper(pngPath);
    console.log('[manual] setWallpaper 调用成功！请检查桌面壁纸是否已更换为红色纯色。');
  } catch (err) {
    console.error('[manual] setWallpaper 失败:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
