// 纯 Node 脚本（无依赖）：生成托盘图标
// build/tray.ico（ICO 容器内嵌 16x16 + 32x32 PNG，用于 Windows/Linux 托盘）
// build/trayTemplate.png（16x16 白色圆环模板，用于 macOS 托盘）
// 运行：node scripts/make-tray-icons.mjs
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

// ---------- PNG 生成（白色圆环，透明背景） ----------
function makeRingPng(size) {
  const bytesPerPixel = 4; // RGBA
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
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let r = 0, g = 0, b = 0, a = 0;
      if (dist <= outerR && dist >= innerR) {
        r = 255; g = 255; b = 255; a = 255;
      }
      const o = rowStart + 1 + x * bytesPerPixel;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;                  // bit depth
  ihdr[9] = 6;                  // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 写 build/trayTemplate.png（32x32，macOS 模板） ----------
const templatePng = makeRingPng(32);
writeFileSync(join(buildDir, 'trayTemplate.png'), templatePng);

// ---------- 写 build/tray.ico（内嵌 16x16 + 32x32 PNG） ----------
const png16 = makeRingPng(16);
const png32 = makeRingPng(32);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);  // reserved
header.writeUInt16LE(1, 2);  // type: icon
header.writeUInt16LE(2, 4);  // count: 2

const entry16 = Buffer.alloc(16);
entry16[0] = 16; // width
entry16[1] = 16; // height
entry16[2] = 0;  // palette colors
entry16[3] = 0;  // reserved
entry16.writeUInt16LE(1, 4);          // planes
entry16.writeUInt16LE(32, 6);         // bit count
entry16.writeUInt32LE(png16.length, 8); // bytes in resource
entry16.writeUInt32LE(22, 12);        // image offset (6 + 16*2)

const entry32 = Buffer.alloc(16);
entry32[0] = 32; // width
entry32[1] = 32; // height
entry32[2] = 0;
entry32[3] = 0;
entry32.writeUInt16LE(1, 4);
entry32.writeUInt32LE(32, 6);
entry32.writeUInt32LE(png32.length, 8);
entry32.writeUInt32LE(22 + png16.length, 12); // offset after first image

const ico = Buffer.concat([header, entry16, entry32, png16, png32]);
writeFileSync(join(buildDir, 'tray.ico'), ico);

console.log(`✓ build/trayTemplate.png (${templatePng.length} bytes)`);
console.log(`✓ build/tray.ico        (${ico.length} bytes, 2 images)`);
