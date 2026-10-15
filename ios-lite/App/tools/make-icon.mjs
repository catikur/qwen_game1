// CapitalForge Lite — uygulama simgesi (geçici; L5'teki stil yenilemesinde baştan çiziliyor).
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

// İzometrik kule: taban merkezi (x, y), yarım genişlik a, yarım yükseklik b, yükseklik h.
function prism(x, y, a, b, h, top, left, right) {
  const pts = (list) => list.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  return [
    `<polygon points="${pts([[x - a, y - h], [x, y - h + b], [x, y + b], [x - a, y]])}" fill="${left}"/>`,
    `<polygon points="${pts([[x, y - h + b], [x + a, y - h], [x + a, y], [x, y + b]])}" fill="${right}"/>`,
    `<polygon points="${pts([[x, y - h - b], [x + a, y - h], [x, y - h + b], [x - a, y - h]])}" fill="${top}"/>`,
  ].join('');
}

function svg() {
  const a = 130;
  const b = a * Math.tan(Math.PI / 6);
  const step = 1.2;
  const x0 = 356;
  const y0 = 547;
  // Ham → işleme → satış: zincir büyüdükçe yükselen üç kule (oyunun çekirdeği).
  const towers = [
    { h: 170, top: '#D9B44A' },
    { h: 290, top: '#B07A52' },
    { h: 430, top: '#3FB58A' },
  ];
  // Zemin: kulelerin oturduğu izometrik parsel. U = (a, b), V = (a, -b) eksenleri;
  // kule tabanı u, v ∈ [-0.5, 0.5], kuleler U boyunca 1.2 arayla.
  const at = (u, v) => [x0 + (u + v) * a, y0 + (u - v) * b];
  const ground = [at(-0.95, -0.95), at(-0.95, 0.95), at(2 * step + 0.95, 0.95), at(2 * step + 0.95, -0.95)];
  const body = towers
    .map((t, k) => prism(x0 + k * step * a, y0 + k * step * b, a, b, t.h, t.top, '#EEF0EC', '#B3BAB5'))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#1B2621"/>
      <stop offset="1" stop-color="#0B100E"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
  <polygon points="${ground.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')}" fill="#FFFFFF" fill-opacity="0.06"/>
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
