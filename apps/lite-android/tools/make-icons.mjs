// CapitalForge Lite (Android) — simgeler ve açılış ekranı, iOS simgesiyle aynı
// "Altın sikke" SVG'sinden (ios-lite/App/tools/icon.svg; önce make-icon.mjs).
//
// - Uyarlanabilir simge (Android 8+): arka plan (mavi ışınlar, tam taşan) ve
//   ön plan (sikke, saydam, 66 dp güvenli alanın içinde); Android 13+ tek renkli.
// - Eski simge (kare ve yuvarlak), bildirim simgesi (beyaz siluet),
//   açılış ekranı (gökyüzü + sikke), Play Store simgesi (512) ve öne çıkan
//   görsel (1024×500).
// Çalıştırma: node apps/lite-android/tools/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const res = join(here, '..', 'android', 'app', 'src', 'main', 'res');
const store = join(here, '..', 'store');
const icon = readFileSync(join(root, 'ios-lite', 'App', 'tools', 'icon.svg'), 'utf8');

// icon.svg: <defs>…</defs>, zemin dikdörtgeni, ışınlar (<g fill-opacity="0.06">), sonra sikke.
const defs = icon.slice(icon.indexOf('<defs>'), icon.indexOf('</defs>') + 7);
const raysStart = icon.indexOf('<g fill="#FFFFFF" fill-opacity="0.06">');
const raysEnd = icon.indexOf('</g>', raysStart) + 4;
const rays = icon.slice(raysStart, raysEnd);
const coin = icon.slice(raysEnd, icon.lastIndexOf('</svg>'));

const svg = (viewBox, body, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${defs}${body}</svg>`;
/** Uyarlanabilir simgenin 108 dp tuvali: 1024'lük çizim ortadaki 72 dp'ye (görünen alan) denk. */
const ADAPTIVE = '-256 -256 1536 1536';
const background = (size) => svg(ADAPTIVE, `<rect x="-256" y="-256" width="1536" height="1536" fill="url(#bg)"/>${rays}`, size);
/** Ön plan: sikke 66 dp güvenli alanın içinde (biraz daha küçük). */
const foreground = (size) => svg('-330 -330 1684 1684', coin, size);
const full = (size) => icon.replace('width="1024" height="1024"', `width="${size}" height="${size}"`);
const round = (size) =>
  svg('0 0 1024 1024', `<clipPath id="r"><circle cx="512" cy="512" r="512"/></clipPath><g clip-path="url(#r)">${icon.slice(icon.indexOf('</defs>') + 7, icon.lastIndexOf('</svg>'))}</g>`, size);

/** Beyaz siluet: sikke halkası ve üç bina (bildirim ve tek renkli simge). */
function silhouette(viewBox, size) {
  const body = `<g fill="#FFFFFF">
    <path fill-rule="evenodd" d="M512 182a330 330 0 1 0 0.1 0Z M512 262a250 250 0 1 1-0.1 0Z"/>
    <rect x="314" y="458" width="96" height="210" rx="14"/>
    <rect x="424" y="338" width="116" height="330" rx="14"/>
    <rect x="562" y="413" width="100" height="255" rx="14"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${body}</svg>`;
}

function splash(width, height) {
  const size = Math.round(Math.min(width, height) * 0.36);
  return `<html><body style="margin:0;width:${width}px;height:${height}px;background:linear-gradient(180deg,#7ccbff 0%,#a9deff 36%,#d3eeff 66%,#e8f6ff 100%);display:flex;align-items:center;justify-content:center">
    <div style="width:${size}px;height:${size}px;border-radius:${size * 0.22}px;overflow:hidden;box-shadow:0 ${size * 0.06}px ${size * 0.16}px rgba(29,53,87,.25)">${full(size)}</div></body></html>`;
}

function feature() {
  const font = readFileSync(join(root, 'ios-lite', 'App', 'Resources', 'Fonts', 'Fredoka-Bold.ttf')).toString('base64');
  return `<html><head><style>@font-face{font-family:F;src:url(data:font/ttf;base64,${font})}</style></head>
  <body style="margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(circle at 30% 40%,#3f86ff,#1f4fc4 55%,#11286e);display:flex;align-items:center;gap:40px;padding:0 56px;box-sizing:border-box;font-family:F,sans-serif;color:#fff">
    <div style="width:330px;height:330px;flex:none">${svg('80 80 864 864', coin, 330)}</div>
    <div><div style="font-size:64px;line-height:1.05;white-space:nowrap">CapitalForge Lite</div>
    <div style="font-size:34px;opacity:.9;margin-top:14px">Zincir kur, şehri büyüt</div></div></body></html>`;
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

async function render(html, width, height, transparent) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html.startsWith('<svg') ? `<html><body style="margin:0;background:transparent">${html}</body></html>` : html);
  await page.evaluate(() => document.fonts?.ready);
  const png = await page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return png;
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * scale);
  const adaptive = Math.round(108 * scale);
  const status = Math.round(24 * scale);
  write(join(res, `mipmap-${density}`, 'ic_launcher.png'), await render(full(legacy), legacy, legacy, false));
  write(join(res, `mipmap-${density}`, 'ic_launcher_round.png'), await render(round(legacy), legacy, legacy, true));
  write(join(res, `mipmap-${density}`, 'ic_launcher_background.png'), await render(background(adaptive), adaptive, adaptive, false));
  write(join(res, `mipmap-${density}`, 'ic_launcher_foreground.png'), await render(foreground(adaptive), adaptive, adaptive, true));
  write(join(res, `mipmap-${density}`, 'ic_launcher_monochrome.png'), await render(silhouette('-330 -330 1684 1684', adaptive), adaptive, adaptive, true));
  write(join(res, `drawable-${density}`, 'ic_stat_coin.png'), await render(silhouette('150 150 724 724', status), status, status, true));
  for (const [orientation, w, h] of [['port', 320, 480], ['land', 480, 320]]) {
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);
    write(join(res, `drawable-${orientation}-${density}`, 'splash.png'), await render(splash(width, height), width, height, false));
  }
}
write(join(res, 'drawable', 'splash.png'), await render(splash(480, 320), 480, 320, false));
write(join(store, 'icon-512.png'), await render(full(512), 512, 512, false));
write(join(store, 'feature-graphic.png'), await render(feature(), 1024, 500, false));
await browser.close();
console.log('Android simgeleri, açılış ekranı ve mağaza görselleri yazıldı.');
