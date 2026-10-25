// Steam görselleri (Tur 70): başarım simgeleri, mağaza kapsülleri,
// kütüphane görselleri ve uygulama simgesi.
//
//   pnpm build
//   node tools/run-node-script.mjs tools/tanitim/sehir.ts <durumlar>
//   node tools/run-node-script.mjs tools/steam/basarimlar.ts docs/steam
//   node tools/steam/gorseller.mjs <durumlar> docs/steam
//
// Şehir gerçek oyundan: tanıtım karelerinin şehri (`tools/tanitim/`),
// arayüz gizli, kamera ve gün saati geliştirici kancasından. Logo oyunun
// kendi parçalarıyla: uygulama simgesi (`tools/app-icon.mjs`) ve kurulum
// ekranının başlığındaki Fredoka. Kapsüllerde oyunun adından başka yazı
// yok (Steam'in kuralı); kütüphane kahramanında hiç yazı yok, logo ayrı
// dosya ve Steam onu kahramanın üstüne koyuyor.
//
// Başarım simgeleri `basarimlar.csv`den (`tools/steam/basarimlar.ts`):
// grubun rengi, rozetin kendi çizimi (aşağıda `GLYPHS`); kilitli hali aynı
// simgenin solgun gri hali. Ölçüler ve yükleme `docs/STEAM.md`de.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_SVG } from '../app-icon.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const [states, output] = process.argv.slice(2);
if (!states || !output) {
  console.error('kullanım: node tools/steam/gorseller.mjs <durumlar dizini> <çıktı dizini>');
  process.exit(2);
}
const dist = join(root, 'apps/web/dist');
const PORT = 8821;

function loadPlaywright() {
  for (const base of [root, '/opt/node22/lib/node_modules/']) {
    try {
      return createRequire(join(base, 'noop.js'))('playwright');
    } catch {
      /* sıradaki */
    }
  }
  throw new Error('playwright bulunamadı');
}
const { chromium } = loadPlaywright();

// ---- Başarım simgeleri

/** Grubun rengi: oyunun kendi renkleri (`styles.css`), simgede koyulaşmış. */
const GROUP_COLORS = {
  growth: { light: '#2dc26f', dark: '#0b6a40', disc: '#0e7f4c' },
  victory: { light: '#e39a1c', dark: '#6b3a00', disc: '#8a5000' },
  rivalry: { light: '#f06464', dark: '#8f2222', disc: '#b52f2f' },
  city: { light: '#5c98f5', dark: '#1d3f82', disc: '#2e62bc' },
  career: { light: '#a985d6', dark: '#553583', disc: '#75509f' },
};

/** Beş köşeli yıldız: 24'lük ızgarada merkez ve dış yarıçap. */
function star(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `<polygon class="f" points="${points.join(' ')}"/>`;
}

/** Damla biçimli konum iğnesi; `cx` ortası, ucu 20'de. */
function pin(cx) {
  return `<path d="M${cx} 20c-2.6-3-4-5.2-4-7.2a4 4 0 0 1 8 0c0 2-1.4 4.2-4 7.2z"/><circle class="f" cx="${cx}" cy="12.8" r="1.3"/>`;
}

/**
 * Rozetin çizimi, 24 × 24 ızgarada çizgi (`f` sınıfı dolu). Her başarımın
 * kendi resmi: neyi anlattığı adından okunuyor.
 */
const GLYPHS = {
  // Büyüme
  CF_PUBLIC_COMPANY: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M12 3v2"/>',
  CF_QUARTER_BILLION: '<circle cx="12" cy="12" r="9"/><path class="f" d="M12 12V3a9 9 0 0 1 9 9z"/>',
  CF_HALF_BILLION: '<circle cx="12" cy="12" r="9"/><path class="f" d="M12 3a9 9 0 0 1 0 18z"/>',
  CF_SECOND_CITY: pin(7) + pin(17) + '<path d="M3 21.5h18"/>',
  CF_EMPIRE: '<path d="M4 17 3 7l5 4 4-7 4 7 5-4-1 10z"/><path d="M4 20.5h16"/>',
  // Zafer
  CF_FIRST_VICTORY: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a3 3 0 0 0 3 4.5M17 6h2.5a3 3 0 0 1-3 4.5"/><path d="M12 14v4M8 20.5h8"/>',
  CF_BLITZ: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
  CF_HARD_VICTORY: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4.5-10.5C12.5 6.5 12 8.5 12 10c-1.2-.8-2-2.2-2.2-4C7 8.5 5 11.5 5 15a7 7 0 0 0 7 7z"/><path d="M12 22a3 3 0 0 0 3-3c0-2-1.5-3-3-5-1.5 2-3 3-3 5a3 3 0 0 0 3 3z"/>',
  CF_BIG_CITY: '<path d="M2.5 21.5h19"/><path d="M4 21.5V12h4.5v9.5M8.5 21.5V4.5h7v17M15.5 21.5v-8H20v8"/><path d="M11 8h2M11 11.5h2M11 15h2"/>',
  CF_HOUSE_RULES: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle class="f" cx="8.5" cy="8.5" r="1.5"/><circle class="f" cx="12" cy="12" r="1.5"/><circle class="f" cx="15.5" cy="15.5" r="1.5"/>',
  CF_ALL_RULES: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/><circle class="f" cx="7" cy="7" r="1.4"/><circle class="f" cx="17" cy="7" r="1.4"/><circle class="f" cx="7" cy="17" r="1.4"/><circle class="f" cx="17" cy="17" r="1.4"/>',
  CF_THREE_CEOS: '<circle cx="12" cy="8" r="3"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="5" cy="10" r="2.2"/><path d="M1.5 18a4 4 0 0 1 5-3.6"/><circle cx="19" cy="10" r="2.2"/><path d="M22.5 18a4 4 0 0 0-5-3.6"/>',
  CF_THREE_PATHS: '<path d="M12 21.5V14M12 14 5.5 6.5M12 14V4.5M12 14l6.5-7.5"/><circle class="f" cx="5" cy="5.5" r="1.8"/><circle class="f" cx="12" cy="3.5" r="1.8"/><circle class="f" cx="19" cy="5.5" r="1.8"/>',
  // Rekabet
  CF_FIRST_TAKEOVER: '<rect x="12" y="4" width="9" height="16" rx="2"/><path d="M15 8h3M15 12h3M15 16h3"/><path d="M2.5 12h7M7 8.5l3.5 3.5L7 15.5"/>',
  CF_SERIAL_ACQUIRER: '<rect x="14" y="4" width="7.5" height="16" rx="2"/><path d="M2.5 8.5 6 12l-3.5 3.5M7.5 8.5 11 12l-3.5 3.5"/>',
  CF_MONOPOLY: '<path d="M7.5 21.5V9h9v12.5M5 21.5h14"/><path d="M12 9V2.5l5 2-5 2"/><path d="M10.5 13h3M10.5 17h3"/>',
  CF_SHIELD: '<path d="M12 2.5 4 5.5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10v-6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  CF_CONSORTIUM_BROKEN: '<path d="m9 15-2.2 2.2a3.2 3.2 0 0 1-4.5-4.5L5.5 9.5a3.2 3.2 0 0 1 4.5 0"/><path d="m15 9 2.2-2.2a3.2 3.2 0 0 1 4.5 4.5l-3.2 3.2a3.2 3.2 0 0 1-4.5 0"/><path d="M11 3.5V6M3.5 11H6M13 20.5V18M20.5 13H18"/>',
  CF_WEATHERED: '<path d="M2.5 12.5a9.5 9.5 0 0 1 19 0z"/><path d="M12 12.5V19a2.2 2.2 0 0 0 4.4 0"/><path d="M12 3V2"/>',
  CF_STORM_GROWER: '<path d="M12 21.5V12"/><path d="M12 13.5C12 9 9 7 4.5 7c0 4.5 3 6.5 7.5 6.5zM12 11c0-3.5 2.2-5.5 6.5-5.5 0 3.5-2.2 5.5-6.5 5.5z"/><path d="M8 21.5h8"/>',
  // Şehir
  CF_CITY_SPONSOR: '<path d="M2 18.5h20"/><path d="M2.5 14.5a9.5 7 0 0 1 19 0"/><path d="M5 18.5v-5M19 18.5v-5M8.5 18.5v-7.2M12 18.5v-8M15.5 18.5v-7.2"/>',
  CF_COUNCIL_VOICE: '<path d="M3.5 4.5h17v11H10l-4.5 4v-4h-2z"/><path d="M7.5 8.5h9M7.5 12h5.5"/>',
  CF_TRUSTED_CONTRACTOR: '<path d="M4.5 15.5a7.5 7.5 0 0 1 15 0"/><path d="M2.5 15.5h19v3h-19z"/><path d="M10 8.4v7.1M14 8.4v7.1"/>',
  CF_AUCTIONEER: '<path d="m14 3 7 7-2.8 2.8-7-7z"/><path d="M14.6 8.4 4 19"/><path d="M3 21.5h9"/>',
  CF_BUBBLE_HUNTER: '<circle cx="9" cy="14" r="6"/><circle cx="17.5" cy="6.5" r="3.5"/><circle cx="19" cy="16.5" r="2"/><path d="M6 13a3 3 0 0 1 3-3"/>',
  // Kariyer
  CF_QUEST_MASTER: '<rect x="5" y="4" width="14" height="17.5" rx="2"/><rect x="9" y="2.5" width="6" height="3.5" rx="1"/><path d="m8.5 13.5 2.5 2.5 4.5-5"/>',
  CF_SCENARIO_TOUR: '<path d="M3 6.5 9 4.5l6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  CF_SCENARIO_PERFECT: star(5.5, 14.5, 4) + star(12, 8, 5) + star(18.5, 14.5, 4),
  CF_LEAGUE_PLAYER: '<path d="M2.5 21.5h19"/><path d="M3.5 21.5V15h5.5v6.5M9 21.5V10.5h6v11M15 21.5v-4h5.5v4"/>' + star(12, 5.5, 3),
};

/** 256'lık simge: grubun zemini, altın çerçeveli madalya, ortasında çizim. */
function achievementSvg(api, group) {
  const color = GROUP_COLORS[group];
  const glyph = GLYPHS[api];
  if (!color) throw new Error(`grubun rengi yok: ${group}`);
  if (!glyph) throw new Error(`simgenin çizimi yok: ${api} (tools/steam/gorseller.mjs GLYPHS)`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.35" r="0.75">
      <stop offset="0" stop-color="${color.light}"/><stop offset="1" stop-color="${color.dark}"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1b8"/><stop offset="0.5" stop-color="#ffd45e"/><stop offset="1" stop-color="#c27c00"/>
    </linearGradient>
    <linearGradient id="disc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color.disc}"/><stop offset="1" stop-color="${color.dark}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <circle cx="128" cy="134" r="100" fill="rgba(0,0,0,0.22)"/>
  <circle cx="128" cy="128" r="100" fill="url(#rim)"/>
  <circle cx="128" cy="128" r="86" fill="url(#disc)"/>
  <path d="M52 112a78 78 0 0 1 152 0a90 40 0 0 0-152 0z" fill="rgba(255,255,255,0.12)"/>
  <g transform="translate(128 128) scale(5) translate(-12 -12)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <style>.f { fill: #ffffff; stroke: none; }</style>
    ${glyph}
  </g>
</svg>`;
}

/** RFC 4180 CSV: tırnaklı alan, çift tırnak kaçışı. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])));
}

// ---- Sunucu ve tarayıcı

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
/** Çizilmiş şehir kareleri; kompozisyon sayfası `/__kare/<ad>.png` ile alıyor. */
const frames = new Map();
const server = http.createServer((req, res) => {
  const bare = (req.url ?? '/').split('?')[0];
  if (bare.startsWith('/__kare/')) {
    const png = frames.get(bare.slice('/__kare/'.length));
    res.writeHead(png ? 200 : 404, { 'Content-Type': 'image/png' });
    res.end(png);
    return;
  }
  if (bare === '/__bos') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>bos</title>');
    return;
  }
  const file = join(dist, bare === '/' ? 'index.html' : bare);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const problems = [];

function write(file, buffer) {
  const path = join(output, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, buffer);
  console.log(`${file} · ${Math.round(buffer.length / 1024)} KB`);
}

/** Kompozisyon sayfası: oyunun yazı tipi, saydam zemin. */
async function composer(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(`http://127.0.0.1:${PORT}/__bos`);
  return page;
}

const FREDOKA = readdirSync(join(dist, 'assets')).find((file) => /^fredoka-700-.*\.woff2$/.test(file));
if (!FREDOKA) throw new Error('Fredoka bulunamadı: önce `pnpm build`');
const ICON_URI = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`;

// ---- 1. Başarım simgeleri

const achievements = parseCsv(readFileSync(join(output, 'basarimlar.csv'), 'utf8'));
for (const api of Object.keys(GLYPHS)) {
  if (!achievements.some((row) => row.api_name === api)) throw new Error(`tabloda olmayan çizim: ${api}`);
}
rmSync(join(output, 'basarim'), { recursive: true, force: true });
{
  const page = await composer(256, 256);
  for (const { api_name: api, group } of achievements) {
    const uri = `data:image/svg+xml;base64,${Buffer.from(achievementSvg(api, group)).toString('base64')}`;
    for (const [suffix, filter] of [
      ['', 'none'],
      // Kilitli: aynı resim, gri ve karanlık; Steam açılmamış başarımı böyle gösteriyor.
      ['_kilitli', 'grayscale(1) brightness(0.62) contrast(0.92)'],
    ]) {
      await page.setContent(`<body style="margin:0"><img src="${uri}" width="256" height="256" style="display:block;filter:${filter}"></body>`);
      await page.locator('img').evaluate((img) => img.decode());
      write(`basarim/${api}${suffix}.jpg`, await page.screenshot({ type: 'jpeg', quality: 92 }));
    }
  }
  await page.close();
}

// ---- 2. Şehir kareleri

/**
 * Kapsüllerin şehri: tanıtım karelerinin 420. günü, oyun duruk (hava ve
 * mevsim kare boyunca aynı), arayüz gizli. `view` kamera, `time` gün saati.
 */
const SHOTS = {
  gunduz: { view: { x: 15, z: 15, distance: 22, polar: 0.95, azimuth: Math.PI * 0.25 }, time: 0.3 },
  yakin: { view: { x: 13.5, z: 16, distance: 16, polar: 1.0, azimuth: Math.PI * 0.3 }, time: 0.32 },
  // Kahraman geniş ve alçak: yakından bakınca gökyüzü bandı kalmıyor, pencereler yanık.
  gece: { view: { x: 15, z: 16, distance: 19, polar: 0.9, azimuth: Math.PI * 0.25 }, time: 0.72 },
};

async function cityFrames(sizes) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('capitalforge.locale', 'en');
    localStorage.setItem('capitalforge.tutorial.v1', JSON.stringify({ seen: true, games: {} }));
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('[data-newgame-start]', { timeout: 30000 });
  await page.locator('[data-newgame-start]').click();
  await page.waitForSelector('.topbar', { timeout: 30000 });
  const state = readFileSync(join(states, 'en-orta.json'), 'utf8');
  await page.evaluate((json) => {
    window.__capital.engine.replaceState(JSON.parse(json));
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
  }, state);
  // Trafik ve yayalar şehre yayılsın; sonra takvim dursun.
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    window.__capital.setQuality(0);
  });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  for (const [name, { shot, width, height }] of Object.entries(sizes)) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ view, time }) => {
      window.__capital.setView(view);
      window.__capital.setTimeOfDay(time);
    }, SHOTS[shot]);
    await page.waitForTimeout(2500);
    // Yazılımsal GPU'da 3840'lık bir kare yarım dakikayı aşabiliyor.
    frames.set(`${name}.png`, await page.screenshot({ type: 'png', timeout: 180000 }));
    console.log(`kare: ${name} (${shot}, ${width}×${height})`);
  }
  await context.close();
}

/** Kapsülün çizim boyutu; kahraman ve logo dışındakiler 2× çizilip küçültülüyor. */
const CAPSULES = {
  header: { width: 920, height: 430, shot: 'gunduz', layout: 'center' },
  small: { width: 462, height: 174, shot: 'gunduz', layout: 'fill' },
  main: { width: 1232, height: 706, shot: 'gunduz', layout: 'corner' },
  vertical: { width: 748, height: 896, shot: 'yakin', layout: 'stack' },
  library: { width: 600, height: 900, shot: 'yakin', layout: 'stack' },
  hero: { width: 3840, height: 1240, shot: 'gece', layout: 'none' },
};
await cityFrames(
  Object.fromEntries(
    Object.entries(CAPSULES).map(([name, capsule]) => {
      const scale = capsule.width >= 1920 ? 1 : 2;
      return [name, { shot: capsule.shot, width: capsule.width * scale, height: capsule.height * scale }];
    }),
  ),
);

// ---- 3. Logo ve kapsüller

const BASE_CSS = `
  @font-face { font-family: 'Fredoka'; font-weight: 700; src: url('/assets/${FREDOKA}') format('woff2'); }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  .frame { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .scrim { position: absolute; inset: 0; }
  .lockup { position: absolute; display: flex; align-items: center; gap: 0.32em; font-family: 'Fredoka', sans-serif; font-weight: 700; line-height: 1; }
  .lockup img { width: 1.18em; height: 1.18em; border-radius: 22%; box-shadow: 0 0.05em 0 #1d3557, 0 0.08em 0.22em rgba(4, 12, 36, 0.45); }
  .word { color: #ffffff; letter-spacing: -0.01em; white-space: nowrap;
    text-shadow: 0 0.055em 0 #1d3557, 0 0.07em 0 #1d3557, 0 0.1em 0.28em rgba(4, 12, 36, 0.55); }
  .word b { color: #ffd45e; font-weight: 700; }
  .stack { flex-direction: column; gap: 0.22em; }
  .stack img { width: 1.6em; height: 1.6em; }
`;

function lockup(className, style) {
  return `<div class="lockup ${className}" style="${style}"><img src="${ICON_URI}" alt=""><span class="word">Capital<b>Forge</b></span></div>`;
}

const LAYOUTS = {
  // Ortada, şehrin üstünde yumuşak bir gölge.
  center: (w, h) =>
    `<div class="scrim" style="background: radial-gradient(ellipse 62% 46% at 50% 52%, rgba(10, 20, 51, 0.5), rgba(10, 20, 51, 0) 100%)"></div>` +
    lockup('', `font-size:${Math.round(h * 0.2)}px; left:50%; top:50%; transform:translate(-50%,-50%)`),
  // Küçük kapsül: 120 × 45'te de okunsun diye logo neredeyse bütün kare.
  fill: (w, h) =>
    `<div class="scrim" style="background: rgba(10, 20, 51, 0.42)"></div>` +
    lockup('', `font-size:${Math.round(h * 0.36)}px; left:50%; top:50%; transform:translate(-50%,-50%)`),
  // Ana kapsül: sol altta, şehir öne çıksın.
  corner: (w, h) =>
    `<div class="scrim" style="background: linear-gradient(0deg, rgba(10, 20, 51, 0.62) 0%, rgba(10, 20, 51, 0) 46%)"></div>` +
    lockup('', `font-size:${Math.round(h * 0.13)}px; left:${Math.round(w * 0.05)}px; bottom:${Math.round(h * 0.08)}px`),
  // Dikey: simge ve ad üst üste, üst üçte birde.
  stack: (w, h) =>
    `<div class="scrim" style="background: linear-gradient(180deg, rgba(10, 20, 51, 0.6) 0%, rgba(10, 20, 51, 0.15) 42%, rgba(10, 20, 51, 0) 60%)"></div>` +
    lockup('stack', `font-size:${Math.round(w * 0.135)}px; left:50%; top:${Math.round(h * 0.07)}px; transform:translateX(-50%)`),
  none: () => '',
};

for (const [name, { width, height, layout }] of Object.entries(CAPSULES)) {
  const page = await composer(width, height);
  await page.setContent(
    `<style>${BASE_CSS}</style><div class="frame" style="background-image:url('/__kare/${name}.png')"></div>${LAYOUTS[layout](width, height)}`,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  await page.waitForTimeout(300);
  const folder = name === 'library' || name === 'hero' ? 'kutuphane' : 'magaza';
  write(`${folder}/${name}.jpg`, await page.screenshot({ type: 'jpeg', quality: 90 }));
  await page.close();
}

// Kütüphane logosu: saydam PNG, 1280 geniş; Steam kahramanın üstüne koyuyor.
{
  const page = await composer(1280, 400);
  await page.setContent(`<style>${BASE_CSS}</style>${lockup('', 'font-size:168px; left:50%; top:50%; transform:translate(-50%,-50%)')}`);
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('.lockup').boundingBox();
  const pad = 24;
  const clip = { x: 0, y: Math.max(0, Math.floor(box.y - pad)), width: 1280, height: Math.ceil(box.height + pad * 2) };
  if (box.width > 1280 - pad * 2) throw new Error(`logo sığmıyor: ${box.width}`);
  write('kutuphane/logo.png', await page.screenshot({ omitBackground: true, clip }));
  await page.close();
}

// ---- 4. Uygulama simgeleri: topluluk simgesi 184 JPG, kısayol 256 PNG.
{
  const page = await composer(256, 256);
  for (const [file, size, round] of [
    ['simge/app-184.jpg', 184, false],
    ['simge/shortcut-256.png', 256, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent"><img src="${ICON_URI}" width="${size}" height="${size}" style="display:block;${round ? 'border-radius:22%;' : ''}"></body>`);
    await page.locator('img').evaluate((img) => img.decode());
    const jpeg = file.endsWith('.jpg');
    write(file, await page.screenshot(jpeg ? { type: 'jpeg', quality: 92 } : { omitBackground: true }));
  }
  await page.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.error('sayfa hataları:', problems.slice(0, 3).join(' | '));
  process.exit(1);
}
