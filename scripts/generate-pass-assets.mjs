// Rasterizes the original shark-fin emblem into the PNG files a .pkpass needs.
// Usage: node scripts/generate-pass-assets.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(process.cwd(), "src/lib/server/passes/assets");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
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
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const quad = (p0, c, p1, n) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
  });
// Same geometry as the SVG emblem in src/components/brand/Fin.tsx (unit square).
const FIN = [...quad([0.16, 0.8], [0.38, 0.3], [0.66, 0.14], 40), ...quad([0.66, 0.14], [0.56, 0.52], [0.84, 0.8], 40)];
function inside(x, y, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const lerp = (a, b, t) => a + (b - a) * t;
const coral = [255, 136, 107];
const pink = [255, 78, 174];
const midnight = [18, 22, 37];

function render(w, h, { finBox, background }) {
  const buf = Buffer.alloc(w * h * 4);
  const S = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let cover = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S - finBox.x) / finBox.size;
          const v = (y + (sy + 0.5) / S - finBox.y) / finBox.size;
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && inside(u, v, FIN)) cover++;
        }
      const a = cover / (S * S);
      const t = Math.min(1, Math.max(0, (x - finBox.x) / finBox.size));
      const fin = coral.map((c, i) => lerp(c, pink[i], t));
      const i = (y * w + x) * 4;
      if (background) {
        for (let k = 0; k < 3; k++) buf[i + k] = Math.round(lerp(midnight[k], fin[k], a));
        buf[i + 3] = 255;
      } else {
        for (let k = 0; k < 3; k++) buf[i + k] = Math.round(fin[k]);
        buf[i + 3] = Math.round(a * 255);
      }
    }
  }
  return png(w, h, buf);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of [["icon.png", 29], ["icon@2x.png", 58], ["icon@3x.png", 87]]) {
  fs.writeFileSync(path.join(OUT, name), render(size, size, { finBox: { x: size * 0.12, y: size * 0.1, size: size * 0.76 }, background: true }));
}
for (const [name, scale] of [["logo.png", 1], ["logo@2x.png", 2]]) {
  const w = 50 * scale;
  const h = 50 * scale;
  fs.writeFileSync(path.join(OUT, name), render(w, h, { finBox: { x: 4 * scale, y: 4 * scale, size: 42 * scale }, background: false }));
}
fs.copyFileSync(path.join(OUT, "icon@3x.png"), path.join(process.cwd(), "src/app/icon.png"));
console.log("Pass assets written to", OUT);
