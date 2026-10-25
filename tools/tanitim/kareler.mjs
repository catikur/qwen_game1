// Tanıtım kareleri (Tur 50): gerçek oyundan, üç dilde (Almanca Tur 70'te),
// masaüstü ve telefon.
//
//   pnpm build
//   node tools/run-node-script.mjs tools/tanitim/sehir.ts <durumlar>
//   node tools/tanitim/kareler.mjs <durumlar> docs/tanitim/kareler [diller]
//
// `diller` virgülle (varsayılan `tr,en,de`); tek dili yeniden çekmek için.
//
// Şehir `sehir.ts`ten: oyunun denge vekili 516 gün oynamış. Kare oyunun
// kendi yolundan geliyor: kurulum, `engine.replaceState` (kayıt yüklemenin
// yaptığı), kamera ve gün saati geliştirici kancasından (`window.__capital`).
// Çıktı JPEG (q≈85): masaüstü 1920×1080, telefon 1170×2532 (390×844 @3).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const [states, output, languages = 'tr,en,de'] = process.argv.slice(2);
if (!states || !output) {
  console.error('kullanım: node tools/tanitim/kareler.mjs <durumlar dizini> <çıktı dizini>');
  process.exit(2);
}
const dist = join(root, 'apps/web/dist');
mkdirSync(output, { recursive: true });

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const bare = (req.url ?? '/').split('?')[0];
  const file = join(dist, bare === '/' ? 'index.html' : bare);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(8820, resolve));
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

/** PNG'yi JPEG'e çevir (ffmpeg); depo şişmesin. */
function toJpeg(png, jpg) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '4', jpg]);
  rmSync(png);
}

const DEVICES = {
  masaustu: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  telefon: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
};

async function open(device, locale, stateFile) {
  const context = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block' });
  await context.addInitScript((loc) => {
    localStorage.setItem('capitalforge.locale', loc);
    localStorage.setItem('capitalforge.tutorial.v1', JSON.stringify({ seen: true, games: {} }));
  }, locale);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8820/');
  await page.waitForSelector('[data-newgame-start]', { timeout: 30000 });
  if (stateFile) {
    await page.locator('[data-newgame-start]').click();
    await page.waitForSelector('.topbar', { timeout: 30000 });
    const state = readFileSync(join(states, stateFile), 'utf8');
    await page.evaluate((json) => {
      window.__capital.engine.replaceState(JSON.parse(json));
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
    }, state);
    // Trafik ve yayalar şehre yayılsın, haber akışı ve gündem otursun.
    await page.waitForTimeout(6000);
  }
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

async function shot(page, name) {
  const png = join(output, `${name}.png`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: png });
  toJpeg(png, join(output, `${name}.jpg`));
  console.log(name);
}

async function panel(page, id) {
  await page.locator(`.topbar-actions [data-panel="${id}"]`).click();
  await page.waitForTimeout(700);
}

/** Pencereyi kapat; odak halkası (Escape klavyeden geldi) karede kalmasın. */
async function close(page) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(300);
}

/**
 * Karar kartı: oyun sürerken birkaç gün içinde geliyor. Kart pencere
 * açıkken bekliyor; oyun sürerken en çok 20 sn.
 */
async function decision(page) {
  const card = page.locator('.decision-card');
  await card.waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
}

const problems = [];
for (const locale of languages.split(',')) {
  // Masaüstü: kurulum, gündüz, gece, zincir, borsa, karar kartı.
  {
    const { context, page, errors } = await open('masaustu', locale, null);
    await shot(page, `${locale}-masaustu-1-kurulum`);
    problems.push(...errors);
    await context.close();
  }
  {
    const { context, page, errors } = await open('masaustu', locale, `${locale}-orta.json`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.27));
    await shot(page, `${locale}-masaustu-2-sehir`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.78));
    await page.waitForTimeout(800);
    await shot(page, `${locale}-masaustu-3-gece`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.27));
    await panel(page, 'chain');
    await shot(page, `${locale}-masaustu-4-zincir`);
    await close(page);
    await panel(page, 'bourse');
    await shot(page, `${locale}-masaustu-5-borsa`);
    await close(page);
    await decision(page);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.3));
    await shot(page, `${locale}-masaustu-6-karar`);
    problems.push(...errors);
    await context.close();
  }
  // Telefon: şehir, gece, zincir, karar kartı. Karar kartı pencere
  // kapanınca hemen geliyor; gece karesi ondan önce.
  {
    const { context, page, errors } = await open('telefon', locale, `${locale}-orta.json`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.27));
    await shot(page, `${locale}-telefon-1-sehir`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.78));
    await page.waitForTimeout(800);
    await shot(page, `${locale}-telefon-2-gece`);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.27));
    await panel(page, 'chain');
    await shot(page, `${locale}-telefon-3-zincir`);
    await close(page);
    await decision(page);
    await page.evaluate(() => window.__capital.setTimeOfDay(0.3));
    await shot(page, `${locale}-telefon-4-karar`);
    problems.push(...errors);
    await context.close();
  }
}
await browser.close();
server.close();
if (problems.length) {
  console.error('sayfa hataları:', problems.slice(0, 3).join(' | '));
  process.exit(1);
}
