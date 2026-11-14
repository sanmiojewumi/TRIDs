// Generates PNG icons (needed by iOS / Android installers) without any image library.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const BLUE = [15, 111, 198];
  const WHITE = [255, 255, 255];
  const PALE = [178, 221, 255];
  const s = size / 512;
  const px = (x, y) => {
    const X = x / s;
    const Y = y / s;
    const inDoc = X >= 144 && X <= 384 && Y >= 96 && Y <= 416;
    if (!inDoc) return BLUE;
    if (X > 320 && Y < 160) return X - 320 + (Y - 96) > 64 ? BLUE : PALE;
    const bar = (bx, by, bw, bh) => X >= bx && X <= bx + bw && Y >= by && Y <= by + bh;
    if (bar(184, 200, 160, 16) || bar(184, 248, 200, 16) || bar(184, 296, 200, 16) || bar(264, 352, 120, 28)) return BLUE;
    return WHITE;
  };
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
console.log('icons written');
