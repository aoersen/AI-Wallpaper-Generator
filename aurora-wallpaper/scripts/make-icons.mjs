// 纯 Node 脚本（无依赖）：生成 build/icon.png（512x512 青紫渐变 + 白色圆环）
// 与 build/icon.ico（ICO 容器内嵌 256x256 PNG）。
// 运行：node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });

// ---------- CRC32 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// ---------- PNG 生成（青紫对角渐变 + 白色圆环） ----------
function makePng(size) {
  const bytesPerPixel = 3;
  const rowSize = size * bytesPerPixel + 1; // +1 filter byte
  const raw = Buffer.alloc(rowSize * size);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.35;
  const innerR = size * 0.27;

  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size - 2);
      // 青 (0,200,220) → 紫 (130,60,220)
      let r = Math.round(0 + (130 - 0) * t);
      let g = Math.round(200 + (60 - 200) * t);
      let b = Math.round(220 + (220 - 220) * t);
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= outerR && dist >= innerR) {
        r = 255; g = 255; b = 255;
      }
      const o = rowStart + 1 + x * bytesPerPixel;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;                  // bit depth
  ihdr[9] = 2;                  // color type: RGB
  // [10] compression=0, [11] filter=0, [12] interlace=0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 写 icon.png（512x512） ----------
const png512 = makePng(512);
writeFileSync(join(buildDir, 'icon.png'), png512);

// ---------- 写 icon.ico（内嵌 256x256 PNG） ----------
const png256 = makePng(256);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // width: 0 表示 256
entry[1] = 0; // height: 0 表示 256
entry[2] = 0; // palette colors
entry[3] = 0; // reserved
entry.writeUInt16LE(1, 4);          // planes
entry.writeUInt16LE(32, 6);         // bit count
entry.writeUInt32LE(png256.length, 8); // bytes in resource
entry.writeUInt32LE(22, 12);        // image offset (6 + 16)
const ico = Buffer.concat([header, entry, png256]);
writeFileSync(join(buildDir, 'icon.ico'), ico);

console.log(`✓ build/icon.png  (${png512.length} bytes)`);
console.log(`✓ build/icon.ico  (${ico.length} bytes)`);
