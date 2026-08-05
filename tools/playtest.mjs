// Tarayıcıda uçtan uca oynanabilirlik testi.
// Çalıştırma: pnpm build && node tools/playtest.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright projenin bağımlılığı değil (yalnızca test aracı). Yerelde
// kuruluysa oradan, değilse global kurulumdan çözülür.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error('Playwright bulunamadı. Kurulum: npm i -g playwright');
}
const { chromium } = loadPlaywright();

const ROOT = process.env.DIST || new URL('../apps/web/dist', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
};

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t) => console.log(`\n=== ${t} ===`);

const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

const OUT = process.env.SHOTS || '/tmp';

(async () => {
  await new Promise((r) => server.listen(8811, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto('http://127.0.0.1:8811/');

  // ---------- Açılış ----------
  section('Açılış ve WebGL sahnesi');
  await page.waitForSelector('.topbar', { timeout: 20000 });
  check('Uygulama açılıyor', true);

  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.scene');
    if (!canvas) return { ok: false };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return { ok: Boolean(gl), w: canvas.width, h: canvas.height };
  });
  check('WebGL bağlamı canlı', webgl.ok, `canvas ${webgl.w}×${webgl.h}`);

  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT + '/scene-boot.png' });

  check('Başlangıç nakdi görünüyor', (await page.locator('.metric').first().textContent()).includes('₺'));
  check('6 veri lensi var', (await page.locator('.lens').count()) === 6);
  check('Yapı menüsü dolu', (await page.locator('.buildcard').count()) === 12);

  // ---------- Simülasyon akıyor mu ----------
  section('Simülasyon döngüsü');
  const day0 = await page.evaluate(() => document.querySelector('.brand-sub').textContent);
  await page.waitForTimeout(3200);
  const day1 = await page.evaluate(() => document.querySelector('.brand-sub').textContent);
  check('Zaman ilerliyor', day0 !== day1, `${day0} → ${day1}`);

  await page.click('.speed:nth-child(1)'); // duraklat
  const pausedA = await page.evaluate(() => document.querySelector('.brand-sub').textContent);
  await page.waitForTimeout(1800);
  const pausedB = await page.evaluate(() => document.querySelector('.brand-sub').textContent);
  check('Duraklatma çalışıyor', pausedA === pausedB, pausedA);

  await page.click('.speed:nth-child(3)'); // 2x
  await page.waitForTimeout(1500);
  check('Hız kademesi çalışıyor',
    (await page.evaluate(() => document.querySelector('.brand-sub').textContent)) !== pausedB);

  // ---------- Arsa seçimi ve satın alma ----------
  section('Arsa seçimi, satın alma, inşa');
  const canvasBox = await page.locator('canvas.scene').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.waitForTimeout(400);

  const inspectorFilled = await page.locator('.inspector .statgrid').count();
  check('Haritaya tıklayınca arsa paneli doluyor', inspectorFilled > 0);
  check('Bölge talebi gösteriliyor', (await page.locator('.demandrow').count()) > 0);

  const buyButton = page.locator('button:has-text("Arsayı satın al")');
  const hasBuy = (await buyButton.count()) > 0;
  check('Satın alma butonu çıkıyor', hasBuy);

  if (hasBuy) {
    await buyButton.first().click();
    await page.waitForTimeout(300);
    check('Arsa satın alındı (panel boş arsaya döndü)',
      (await page.locator('text=Boş arsan').count()) > 0);
  }

  // Tahminler bölgeye göre hesaplanıyor mu?
  check('Yatırım tahmini gösteriliyor', (await page.locator('.estimate').count()) > 0,
    (await page.locator('.estimate').first().textContent())?.trim());

  // İnşa: bir bina seç, sonra seçili arsaya kur.
  await page.locator('.buildcard').first().click();
  await page.waitForTimeout(200);
  check('Yerleştirme modu açılıyor', (await page.locator('.placing').count()) > 0);

  const placeButton = page.locator('button:has-text("Seçili arsaya inşa et")');
  if ((await placeButton.count()) > 0) {
    await placeButton.click();
    await page.waitForTimeout(400);
  }
  check('Bina inşa edildi', (await page.locator('.ledger').count()) > 0);
  check('Kâr/zarar kırılımı gösteriliyor', (await page.locator('.ledgerrow').count()) >= 5);

  // ---------- Lensler ----------
  section('Veri lensleri');
  for (const lens of ['Arsa Değeri', 'Rekabet', 'Mülkiyet', 'Fırsat']) {
    await page.locator('.lens', { hasText: lens }).click();
    await page.waitForTimeout(250);
  }
  check('Tüm lensler hatasız değişiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Kamera ----------
  section('Kamera kontrolü');
  await page.mouse.move(canvasBox.x + 700, canvasBox.y + 400);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/scene-zoom.png' });
  check('Kamera girdisi hata üretmiyor', consoleErrors.length === 0, consoleErrors.slice(0,2).join(' | '));

  // ---------- Rakipler ----------
  section('Rakipler ve şirket paneli');
  await page.locator('.topbar-actions button', { hasText: 'Rakipler' }).click();
  await page.waitForTimeout(300);
  const rivalRows = await page.locator('.modal .table tbody tr').count();
  check('Rakip tablosu doluyor', rivalRows >= 5, `${rivalRows} şirket`);
  check('Oyuncu tabloda işaretli', (await page.locator('.modal tr.me').count()) === 1);
  await page.keyboard.press('Escape');

  await page.locator('.topbar-actions button', { hasText: 'Şirket' }).click();
  await page.waitForTimeout(300);
  check('Şirket paneli açılıyor', (await page.locator('.company').count()) === 1);
  await page.keyboard.press('Escape');

  // ---------- Kayıt / yükleme ----------
  section('Kayıt sistemi (IndexedDB)');
  await page.locator('.topbar-actions button', { hasText: 'Kayıt' }).click();
  await page.waitForTimeout(300);
  check('Kayıt paneli açılıyor', (await page.locator('.slotlist').count()) === 1);

  await page.locator('.slot').nth(1).locator('button:has-text("Kaydet")').click();
  await page.waitForTimeout(700);
  const savedMeta = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('capital-game', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!db) return null;
    return new Promise((resolve) => {
      const req = db.transaction('saves', 'readonly').objectStore('saves').get(1);
      req.onsuccess = () => resolve(req.result?.meta ?? null);
      req.onerror = () => resolve(null);
    });
  });
  check('IndexedDB slotuna yazıldı', savedMeta !== null,
    savedMeta ? `${savedMeta.companyName}, ${savedMeta.day}. gün` : '');

  // İlerlemeyi değiştir, sonra kaydı geri yükle.
  const beforeLoad = await page.evaluate(() => document.querySelector('.metric-value').textContent);
  await page.locator('.slot').nth(1).locator('button:has-text("Yükle")').click();
  await page.waitForTimeout(600);
  check('Kayıt yüklenebiliyor', (await page.locator('.toast').count()) > 0,
    (await page.locator('.toast').first().textContent())?.trim());

  // ---------- Sayfa yenileme (kritik regresyon) ----------
  section('Sayfa yenileme — otomatik kayıt regresyonu');
  consoleErrors.length = 0;
  await page.reload();
  await page.waitForSelector('.topbar', { timeout: 20000 });
  await page.waitForTimeout(1500);
  check('Yenileme sonrası oyun açılıyor', (await page.locator('.buildcard').count()) === 12);
  check('Yenileme sonrası konsolda hata yok', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '));

  // ---------- Bozuk kayıt ----------
  section('Bozuk kayıt dayanıklılığı');
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open('capital-game', 1);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise((resolve) => {
      const req = db
        .transaction('saves', 'readwrite')
        .objectStore('saves')
        .put({ meta: { slot: 0 }, state: { meta: { schemaVersion: 1 }, map: null } });
      req.onsuccess = resolve;
      req.onerror = resolve;
    });
  });
  consoleErrors.length = 0;
  await page.reload();
  await page.waitForSelector('.topbar', { timeout: 20000 });
  await page.waitForTimeout(1200);
  check('Bozuk otomatik kayıtta oyun yine açılıyor', (await page.locator('.buildcard').count()) === 12);
  check('Bozuk kayıt sessizce çökmüyor', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | '));

  // ---------- Uzun oturum ----------
  section('Uzun oturum ve performans');
  await page.click('.speed:nth-child(4)'); // 3x
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else resolve(Math.round((frames * 1000) / (performance.now() - start)));
        };
        requestAnimationFrame(tick);
      }),
  );
  // Bu kapta GPU yok; Chromium SwiftShader ile yazılımdan rasterize ediyor.
  // Eşik buna göre; gerçek donanımda ölçüm çok daha yüksek olur.
  check('Yazılım rasterizasyonunda oyun akıcı kalıyor', fps >= 8, `${fps} FPS (SwiftShader, GPU yok)`);

  await page.waitForTimeout(5000);
  const laterDay = await page.evaluate(() => document.querySelector('.brand-sub').textContent);
  check('3× hızda günler akıyor', /\d+\. gün/.test(laterDay), laterDay);
  check('Uzun oturumda konsol temiz', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---------- Responsive ----------
  section('Responsive');
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('Dar ekranda yatay taşma yok', overflow <= 0, `taşma ${overflow}px`);
  await page.screenshot({ path: `${OUT}/game-mobile.png` });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/game-desktop.png` });

  console.log(`\n================================`);
  console.log(`TOPLAM: ${pass} geçti, ${fail} kaldı`);
  if (fail) console.log('Kalanlar:\n - ' + failures.join('\n - '));
  console.log(`Konsol hataları: ${consoleErrors.length}`);

  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('TEST ÇÖKTÜ:', e);
  process.exit(2);
});
