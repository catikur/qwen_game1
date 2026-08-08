// Tek dosyalık build'in duman testi.
//
// İki şeyi doğruluyor:
//   1. Gömülü HTML dış istek yapmadan boot ediyor ve oynanabiliyor,
//   2. Depolama TAMAMEN kapalıyken (gizli sekme / bölümlenmiş çerçeve)
//      oyun yine açılıyor — kayıt okumak boot'un ön koşulu değil.
//
// Çalıştırma: node tools/build-single-file.mjs <dosya> && node tools/singlefile-check.mjs <dosya>
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error('Playwright bulunamadı.');
}
const { chromium } = loadPlaywright();

const FILE = process.argv[2];
const OUT = process.env.SHOTS || '/tmp';
if (!FILE || !fs.existsSync(FILE)) throw new Error('Tek dosyalık build yolu verilmedi.');
const HTML = fs.readFileSync(FILE, 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// Sunucu yalnızca tek dosyayı verir; başka her istek 404. Böylece
// gömülemeyen bir varlık kalmışsa test bunu görür.
const missed = [];
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (url === '/favicon.ico') {
    // Favicon'u barındıran ortam verir; testin ilgi alanı değil.
    res.writeHead(204);
    res.end();
    return;
  }
  missed.push(url);
  res.writeHead(404);
  res.end('nf');
});

/** Depolamayı bölümlenmiş çerçevedeki gibi tamamen kapatır. */
const BLOCK_STORAGE = () => {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'indexedDB', { get: boom, configurable: true });
  Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
};

async function boot(browser, { blockStorage }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (blockStorage) await page.addInitScript(BLOCK_STORAGE);
  await page.goto('http://127.0.0.1:8812/');
  return { page, errors };
}

(async () => {
  await new Promise((r) => server.listen(8812, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });

  // ---------- 1. Normal ortam ----------
  console.log('\n=== Tek dosya, normal ortam ===');
  {
    const { page, errors } = await boot(browser, { blockStorage: false });
    await page.waitForSelector('.newgame', { timeout: 30000 });
    check('Kurulum ekranı geliyor', true);
    check('Dış varlık isteği yok', missed.length === 0, missed.join(', ') || '404 yok');

    await page.fill('.newgame-field input[type="text"]', 'Deneme Holding');
    await page.locator('button:has-text("Şirketi kur")').click();
    await page.waitForSelector('.topbar', { timeout: 30000 });

    const webgl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.scene');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      return { ok: Boolean(gl), w: canvas?.width, h: canvas?.height };
    });
    check('WebGL sahnesi canlı', webgl.ok, `canvas ${webgl.w}×${webgl.h}`);

    // Bir kaç gün ilerlet — simülasyon gerçekten dönüyor mu
    const before = await page.evaluate(() => window.__capital.getState().time.day);
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__capital.engine.runDay();
    });
    const after = await page.evaluate(() => window.__capital.getState().time.day);
    check('Simülasyon ilerliyor', after === before + 5, `gün ${before} → ${after}`);

    await page.screenshot({ path: `${OUT}/singlefile.png` });
    check('Konsol temiz', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }

  // ---------- 2. Depolama kapalı ----------
  console.log('\n=== Tek dosya, depolama kapalı ===');
  {
    const { page, errors } = await boot(browser, { blockStorage: true });
    await page.waitForSelector('.newgame', { timeout: 30000 });
    check('Depolama yokken de boot ediyor', true);

    await page.fill('.newgame-field input[type="text"]', 'Kapalı Depo A.Ş.');
    await page.locator('button:has-text("Şirketi kur")').click();
    await page.waitForSelector('.topbar', { timeout: 30000 });
    check('Oyuna girilebiliyor', true);

    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.__capital.engine.runDay();
    });
    // Otomatik kayıt bu ortamda yazamaz; yakalanmamış hata bırakmamalı.
    await page.waitForTimeout(500);
    const fatal = errors.filter((e) => e.startsWith('pageerror:'));
    check('Yakalanmamış hata yok', fatal.length === 0, fatal.slice(0, 2).join(' | '));
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${pass} geçti, ${fail} kaldı`);
  process.exit(fail === 0 ? 0 : 1);
})();
