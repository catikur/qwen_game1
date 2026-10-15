// CapitalForge Lite — uygulama simgesi (L5, "Cam & Bulut": gökyüzünde süzülen ada).
//
// SVG burada kuruluyor, Chromium'da (Playwright) 1024×1024 çiziliyor ve
// alfa kanalı atılarak PNG'ye yazılıyor: iOS simgesinde saydamlık olmamalı.
// Çalıştırma: node ios-lite/App/tools/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'Resources', 'Assets.xcassets', 'AppIcon.appiconset');
const SIZE = 1024;

// İzometrik kutu: taban merkezi (x, y), yarım genişlik a, yarım yükseklik b, yükseklik h.
function prism(x, y, a, b, h, top, left, right) {
  const pts = (list) => list.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  return [
    `<polygon points="${pts([[x - a, y - h], [x, y - h + b], [x, y + b], [x - a, y]])}" fill="${left}"/>`,
    `<polygon points="${pts([[x, y - h + b], [x + a, y - h], [x + a, y], [x, y + b]])}" fill="${right}"/>`,
    `<polygon points="${pts([[x, y - h - b], [x + a, y - h], [x, y - h + b], [x - a, y - h]])}" fill="${top}"/>`,
  ].join('');
}

// Bina: açık duvarlar, zincir renginde çatı plakası, pencere sıraları.
function building(x, y, a, b, h, roofTop, roofSide, rows) {
  let out = prism(x, y, a, b, h, '#FFFFFF', '#EEF3F9', '#D5DFEB');
  out += prism(x, y - 0, a * 1.06, b * 1.06, h + 34, roofTop, roofTop, roofSide).replace(/<polygon points="[^"]*" fill="[^"]*"\/><polygon points="[^"]*" fill="[^"]*"\/>/, '');
  // çatı plakasının yanları: yalnızca üst 34 birim
  const slab = (side) => side;
  out += `<polygon points="${[[x - a * 1.06, y - h - 34], [x, y - h - 34 + b * 1.06], [x, y - h + b * 1.06], [x - a * 1.06, y - h]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${roofTop}"/>`;
  out += `<polygon points="${[[x, y - h - 34 + b * 1.06], [x + a * 1.06, y - h - 34], [x + a * 1.06, y - h], [x, y - h + b * 1.06]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${roofSide}"/>`;
  out += `<polygon points="${[[x, y - h - 34 - b * 1.06], [x + a * 1.06, y - h - 34], [x, y - h - 34 + b * 1.06], [x - a * 1.06, y - h - 34]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${roofTop}" style="filter:brightness(1.08)"/>`;
  void slab;
  // pencereler: sol yüzde
  for (let row = 0; row < rows; row++) {
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.62) / 3.35;
      const px = x - a + a * t;
      const py = y - b * 0 + b * t - (h * (row + 0.55)) / (rows + 0.3);
      out += `<rect x="${(px - 9).toFixed(1)}" y="${(py - 13).toFixed(1)}" width="18" height="20" rx="5" fill="#7FD0FF"/>`;
      out += `<rect x="${(px - 6).toFixed(1)}" y="${(py - 10).toFixed(1)}" width="5" height="6" fill="#FFFFFF"/>`;
    }
  }
  // sağ yüzde tek sütun
  for (let row = 0; row < rows; row++) {
    const px = x + a * 0.5;
    // Sağ yüzün ortası: alt kenar (x, y + b) → (x + a, y) üzerinde, yükseklik kadar yukarıda.
    const py = y + b * 0.5 - (h * (row + 0.55)) / (rows + 0.3);
    out += `<rect x="${(px - 9).toFixed(1)}" y="${(py - 13).toFixed(1)}" width="18" height="20" rx="5" fill="#5FB4E6"/>`;
  }
  return out;
}

function svg() {
  const a = 132;
  const b = a * Math.tan(Math.PI / 6);
  // Ada: büyük izometrik karo, toprak yanları, altında yumuşak gölge.
  const cx = 512, cy = 604;
  const A = 380, B = A * Math.tan(Math.PI / 6), D = 58;
  const pts = (list) => list.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const island = [
    `<ellipse cx="${cx}" cy="${cy + B + 150}" rx="${A * 0.72}" ry="${B * 0.3}" fill="#285078" fill-opacity="0.14"/>`,
    `<polygon points="${pts([[cx - A, cy], [cx, cy + B], [cx, cy + B + D], [cx - A, cy + D]])}" fill="#B9875A"/>`,
    `<polygon points="${pts([[cx, cy + B], [cx + A, cy], [cx + A, cy + D], [cx, cy + B + D]])}" fill="#9B6C43"/>`,
    `<polygon points="${pts([[cx, cy - B], [cx + A, cy], [cx, cy + B], [cx - A, cy]])}" fill="#A6E58E"/>`,
    `<polyline points="${pts([[cx - A, cy + 5], [cx, cy + B + 5], [cx + A, cy + 5]])}" fill="none" stroke="#86CF6C" stroke-width="12" stroke-linejoin="round"/>`,
  ].join('');
  // Üç bina: ham → işleme → satış gibi yükselen; renkler oyundaki zincirlerden.
  const step = 1.18;
  const x0 = cx - step * a * 1.0, y0 = cy - step * b * 1.0 + 30;
  const towers = [
    { h: 170, top: '#FFD25E', side: '#FFB020', rows: 2 },
    { h: 270, top: '#DA8BF0', side: '#B85DD6', rows: 3 },
    { h: 380, top: '#FF7A7A', side: '#E04848', rows: 4 },
  ];
  const body = towers.map((t, k) => building(x0 + k * step * a, y0 + k * step * b, a * 0.8, b * 0.8, t.h, t.top, t.side, t.rows)).join('');
  // Ağaçlar ve bulut.
  const tree = (x, y, r) => `<rect x="${x - 6}" y="${y - 26}" width="12" height="28" fill="#8A5A3B"/><circle cx="${x}" cy="${y - 44}" r="${r}" fill="#43B05A"/><circle cx="${x - 10}" cy="${y - 54}" r="${r * 0.45}" fill="#6ED36E"/>`;
  const trees = tree(250, 664, 34) + tree(312, 724, 28);
  const cloud = (x, y, s) => `<g fill="#FFFFFF" fill-opacity="0.92"><circle cx="${x}" cy="${y}" r="${46 * s}"/><circle cx="${x + 54 * s}" cy="${y - 24 * s}" r="${58 * s}"/><circle cx="${x + 118 * s}" cy="${y}" r="${42 * s}"/><rect x="${x}" y="${y}" width="${118 * s}" height="${42 * s}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6CC3FF"/>
      <stop offset="0.6" stop-color="#A9DEFF"/>
      <stop offset="1" stop-color="#DDF2FF"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#sky)"/>
  ${cloud(110, 210, 1)}${cloud(720, 150, 0.75)}
  ${island}
  ${trees}
  ${body}
</svg>`;
}

// PNG'den alfa kanalını at (RGBA → RGB). Yalnızca 8 bit RGBA, taramasız PNG.
function dropAlpha(png) {
  const chunks = [];
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error('beklenmeyen PNG biçimi');
    } else if (type === 'IDAT') idat.push(data);
    chunks.push(type);
    offset += 12 + length;
  }
  if (colorType === 2) return png;
  if (colorType !== 6) throw new Error(`renk tipi ${colorType} beklenmiyordu`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(height * stride);
  // Satır filtrelerini çöz (0 yok, 1 sol, 2 üst, 3 ortalama, 4 Paeth).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? rgba[y * stride + i - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + i] : 0;
      const diag = y > 0 && i >= 4 ? rgba[(y - 1) * stride + i - 4] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - diag;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - diag);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : diag;
      }
      rgba[y * stride + i] = value & 0xff;
    }
  }
  const rgbStride = width * 3;
  const rgb = Buffer.alloc(height * (rgbStride + 1));
  for (let y = 0; y < height; y++) {
    rgb[y * (rgbStride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) rgb[y * (rgbStride + 1) + 1 + x * 3 + c] = rgba[y * stride + x * 4 + c];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright']) {
    if (!name) continue;
    try {
      return require(name);
    } catch {}
  }
  throw new Error('Playwright bulunamadı');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
const source = svg();
writeFileSync(join(here, 'icon.svg'), source);
await page.setContent(`<html><body style="margin:0">${source}</body></html>`);
const png = dropAlpha(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE } }));
await browser.close();
writeFileSync(join(out, 'icon-1024.png'), png);
writeFileSync(
  join(out, 'Contents.json'),
  `${JSON.stringify({ images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);
writeFileSync(join(out, '..', 'Contents.json'), `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
console.log(`simge yazıldı: ${join(out, 'icon-1024.png')} (${png.length} bayt)`);
