// CapitalForge Lite — uygulama simgesi (L9, "Altın sikke": mavi ışınlar
// önünde, yüzünde şehir silueti olan altın sikke).
//
// SVG burada kuruluyor, Chromium'da (Playwright) 1024×1024 çiziliyor ve
// alfa kanalı atılarak PNG'ye yazılıyor: iOS simgesinde saydamlık olmamalı.
// Aynı SVG'den web sayfaları (gizlilik, destek) için küçük bir icon.png.
// Çalıştırma: node ios-lite/App/tools/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'Resources', 'Assets.xcassets', 'AppIcon.appiconset');
const web = join(here, '..', '..', '..', 'apps', 'web', 'public', 'lite', 'icon.png');
const SIZE = 1024;
const WEB_SIZE = 192;

/** Dört köşeli parıltı. */
const sparkle = (x, y, r, opacity = 1) =>
  `<path d="M${x} ${y - r} Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r}Z" fill="#FFFFFF" fill-opacity="${opacity}"/>`;

function svg() {
  const cx = 512, cy = 500, R = 330;
  // Yüzdeki siluet: üç bina, ortadaki en yüksek; pencereler sıra sıra.
  const base = 668;
  const towers = [[-150, 210, 96], [-30, 330, 116], [100, 255, 100]];
  let skyline = '';
  for (const [dx, h, w] of towers) {
    const x = cx + dx - w / 2;
    skyline += `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="14" fill="#B86A06"/>`;
    skyline += `<rect x="${x + 8}" y="${base - h + 8}" width="${w - 16}" height="10" rx="5" fill="#FFE9A0" fill-opacity="0.55"/>`;
    for (let r = 0; r < Math.floor((h - 50) / 54); r++) {
      for (let k = 0; k < 2; k++) {
        skyline += `<rect x="${x + w * (0.2 + k * 0.38)}" y="${base - h + 40 + r * 54}" width="${w * 0.24}" height="26" rx="7" fill="#FFD24A"/>`;
      }
    }
  }
  // Kenar tırtılı: kenarda ince çentikler (büyük boyda doku, küçükte kayboluyor).
  let reeds = '';
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * 2 * Math.PI;
    const r0 = R - 22, r1 = R - 6;
    reeds += `<line x1="${(cx + r0 * Math.cos(angle)).toFixed(1)}" y1="${(cy + r0 * Math.sin(angle)).toFixed(1)}" x2="${(cx + r1 * Math.cos(angle)).toFixed(1)}" y2="${(cy + r1 * Math.sin(angle)).toFixed(1)}"/>`;
  }
  // Arka plandaki ışınlar: sikkenin arkasından yayılan sekiz kama.
  const rays = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) => {
      const a0 = i * 0.785, a1 = a0 + 0.22;
      return `<polygon points="512,440 ${(512 + 900 * Math.cos(a0)).toFixed(1)},${(440 + 900 * Math.sin(a0)).toFixed(1)} ${(512 + 900 * Math.cos(a1)).toFixed(1)},${(440 + 900 * Math.sin(a1)).toFixed(1)}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="#3F86FF"/><stop offset="0.55" stop-color="#1F4FC4"/><stop offset="1" stop-color="#11286E"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEC8A"/><stop offset="0.5" stop-color="#FFBE2E"/><stop offset="1" stop-color="#E0860E"/></linearGradient>
    <linearGradient id="face" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FFDF5C"/><stop offset="1" stop-color="#F3A417"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0.25" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.42" stop-color="#FFFFFF" stop-opacity="0.38"/><stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <clipPath id="faceclip"><circle cx="${cx}" cy="${cy}" r="${R - 46}"/></clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <g fill="#FFFFFF" fill-opacity="0.06">${rays}</g>
  <ellipse cx="${cx}" cy="${cy + R + 70}" rx="${R * 0.82}" ry="40" fill="#050E2E" fill-opacity="0.35"/>
  <circle cx="${cx}" cy="${cy + 26}" r="${R}" fill="#A9580A"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#rim)"/>
  <g stroke="#C77A0C" stroke-opacity="0.35" stroke-width="5" stroke-linecap="round">${reeds}</g>
  <circle cx="${cx}" cy="${cy}" r="${R - 30}" fill="none" stroke="#FFF4C2" stroke-opacity="0.7" stroke-width="7"/>
  <circle cx="${cx}" cy="${cy}" r="${R - 46}" fill="url(#face)"/>
  <g clip-path="url(#faceclip)">${skyline}
    <rect x="${cx - 260}" y="${base}" width="520" height="12" rx="6" fill="#B86A06"/>
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#shine)"/></g>
  ${sparkle(790, 230, 52)}${sparkle(230, 790, 30, 0.8)}${sparkle(840, 360, 22, 0.7)}
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
  for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) {
    if (!name) continue;
    try {
      return require(name);
    } catch {}
  }
  throw new Error('Playwright bulunamadı');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const source = svg();
writeFileSync(join(here, 'icon.svg'), source);

/** SVG'yi verilen boyda çiz, alfasız PNG döndür. */
async function render(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const scaled = source.replace(`width="${SIZE}" height="${SIZE}"`, `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0">${scaled}</body></html>`);
  const png = dropAlpha(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
  return png;
}

const png = await render(SIZE);
const small = await render(WEB_SIZE);
await browser.close();
writeFileSync(join(out, 'icon-1024.png'), png);
writeFileSync(web, small);
writeFileSync(
  join(out, 'Contents.json'),
  `${JSON.stringify({ images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
);
writeFileSync(join(out, '..', 'Contents.json'), `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
console.log(`simge yazıldı: ${join(out, 'icon-1024.png')} (${png.length} bayt), web: ${web} (${small.length} bayt)`);
