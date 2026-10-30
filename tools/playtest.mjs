// Tarayıcıda uçtan uca oynanabilirlik testi.
// Çalıştırma: pnpm build && node tools/playtest.mjs [--smoke]
//
// --smoke (ya da PLAYTEST=smoke): yalnızca açılış, şehir, döngü, parsel,
// inşa, harita, görünüm ve panel bölümleri — birkaç dakikada "oyun açılıyor
// ve oynanıyor" cevabı. Tam koşu birleştirmeden önce; duman her değişiklikte.
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright projenin bağımlılığı değil (yalnızca test aracı). Yerelde
// kuruluysa oradan, değilse global kurulumdan çözülür.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const id of candidates.filter(Boolean)) {
    try {
      return require(id);
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error('Playwright bulunamadı. Kurulum: npm i -g playwright');
}
const { chromium, devices } = loadPlaywright();

const ROOT = process.env.DIST || new URL('../apps/web/dist', import.meta.url).pathname;
const OUT = process.env.SHOTS || '/tmp';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
/**
 * Yeni sürümü taklit etmek için (Tur 48, "Kurulabilir ve çevrimdışı oyun"):
 * doluyken sunucu `sw.js`'teki sürümün sonuna bunu ekliyor. Tarayıcı
 * çalışanın baytları değişti diye yeni sürümü kurmaya başlıyor.
 */
let swBump = '';
/**
 * Bağlantı yok (Tur 48): sunucu her isteği kesiyor. Playwright'ın
 * `setOffline`'ı hizmet çalışanının isteklerine uygulanmıyor; çalışan
 * ağdan alıp geçerdi (Lite'ın uçtan uca testi de aynı yolu kullanıyor).
 */
let serverDown = false;

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}
/**
 * Testin açtığı süreçler (yerel lig sunucusu): bitişte, test çökse de
 * kapanıyor. `run-node-script` sunucuyu kendi alt sürecinde koşturuyor;
 * yalnız üsttekini kapatmak sunucuyu açık (ve portu dolu) bırakıyordu.
 * Süreç kendi grubunda açılıyor, grup bütün kapanıyor.
 */
const children = [];
function stopChild(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // zaten kapanmış
  }
}
process.on('exit', () => children.forEach(stopChild));
const REPO = new URL('..', import.meta.url).pathname;

/**
 * Yerel lig sunucusu (Tur 51): Worker'ın işleyicisi Node'un SQLite'ı
 * üstünde, bellekte. Tarayıcı testi canlı sunucuya hiç gitmiyor; oyun
 * adresi test kancasından alıyor (`window.__capitalLeagueUrl`).
 */
function startLeagueServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(REPO, 'tools/run-node-script.mjs'), 'packages/lite-league/test/local-server.ts', String(port)], {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    children.push(child);
    const timer = setTimeout(() => reject(new Error('lig sunucusu 60 sn içinde açılmadı')), 60000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('lig sunucusu:')) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`lig sunucusu kapandı (${code})`));
    });
  });
}

const startedAt = Date.now();
const section = (t) => console.log(`\n=== ${t} === (${Math.round((Date.now() - startedAt) / 1000)} sn)`);
const SMOKE = process.argv.includes('--smoke') || process.env.PLAYTEST === 'smoke';

// Kapta önceden kurulmuş Chromium varsa o; yoksa (CI) Playwright'ın kendi
// indirdiği tarayıcı. Yol elle de verilebilir.
const CHROMIUM = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = http.createServer((req, res) => {
  if (serverDown) {
    req.socket.destroy();
    return;
  }
  // Sorgu önce ayrılıyor: '/?lang=en' de kök sayfa.
  const bare = req.url.split('?')[0];
  const rel = bare === '/' ? '/index.html' : bare;
  if (rel === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  if (rel === '/sw.js' && swBump) {
    res.end(fs.readFileSync(file, 'utf8').replace(/const VERSION = "([0-9a-f]+)"/, `const VERSION = "$1-${swBump}"`));
    return;
  }
  res.end(fs.readFileSync(file));
});

/**
 * Belirli türde bir kare bulur: 'vacant' | 'occupied' | 'road' | 'civic' |
 * 'locked'. Parsel türleri AÇIK bölgeden seçilir — kare 0 artık kilitli
 * köşe (Liman) olabiliyor ve satın alma kontrolleri "imara kapalı"
 * kapısına çarpıp yanlış kırmızı yakardı. 'locked' tam tersi: kilitli
 * bölgeden boş parsel ister (imar kontrolü için).
 */
const findTile = (page, kind) =>
  page.evaluate((want) => {
    const state = window.__capital.getState();
    const isOpen = (t) => {
      const district = state.districts[t.districtId];
      return !district || district.opensOnDay === undefined || state.time.day >= district.opensOnDay;
    };
    const match = state.map.tiles.find((t) => {
      if (want === 'road') return t.kind === 'road';
      if (want === 'civic') return t.kind === 'civic';
      if (want === 'locked') return t.kind === 'plot' && !t.structureId && !t.ownerId && !isOpen(t);
      if (want === 'occupied') return t.kind === 'plot' && t.structureId && !t.ownerId && isOpen(t);
      return t.kind === 'plot' && !t.structureId && !t.ownerId && isOpen(t);
    });
    return match ? match.id : null;
  }, kind);

/*
 * REHBER (Tur 26) temiz bir tarayıcıda kendiliğinden açılıyor ve zamanı
 * durduruyor. Diğer bölümler "rehberi daha önce görmüş" oyuncuyu oynuyor —
 * yoksa her bağlamda kart ekrana gelir, oyun durur ve bölümlerin ölçtüğü
 * şey değişirdi. Yalnızca "Rehber" bölümü temiz tarayıcıyla açılıyor.
 */
const TUTORIAL_KEY = 'capitalforge.tutorial.v1';
function veteran(key) {
  try {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ seen: true, games: {} }));
    // Yenilikleri de görmüş (Tur 74): bölümler yeni sürüm duyurusuyla oynamıyor; duyurunun kendisi "Sürüm 1.0" bölümünde.
    if (!localStorage.getItem('capitalforge.whatsnew.v1')) localStorage.setItem('capitalforge.whatsnew.v1', '999.0.0');
  } catch {
    /* depo kapalı: rehber zaten hatırlanmaz */
  }
}

/*
 * Kökün içindeki her görünür düğme kaydırılarak görünür alana gelebiliyor
 * ve üstünde başka bir şey yok mu? Telefon katmanı kaymadığı için uzun
 * senaryo açılışında "Başla" düğmesine ulaşılamıyordu (Tur 39c). Cila ve
 * Kariyer bölümleri kullanıyor.
 */
function reachable(page, selector) {
  return page.evaluate(async (sel) => {
    const root = document.querySelector(sel);
    if (!root) return { count: 0, bad: ['katman yok'] };
    const controls = [...root.querySelectorAll('button, a[href], input, select')].filter(
      (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
    );
    const bad = [];
    for (const el of controls) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const r = el.getBoundingClientRect();
      const inside = r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!inside || !top || !(top === el || el.contains(top))) bad.push((el.textContent || el.tagName).trim().slice(0, 30));
    }
    return { count: controls.length, bad };
  }, selector);
}

/** Rehberi baştan sona oynar; her adımda halkanın hedefi kartın altında mı, ona bakar. */
async function tutorialWalk(context, label) {
  const p = await context.newPage();
  const errors = [];
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const stepOf = () => p.evaluate(() => window.__capital?.tutorialStep?.() ?? null);
  const waitStep = async (id, ms = 10000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      if ((await stepOf()) === id) return true;
      await p.waitForTimeout(120);
    }
    return false;
  };
  // Halkanın ortasındaki en üst öğe kartın kendisi olmamalı: rehber kendi hedefini örtmesin.
  const ringFree = () =>
    p.evaluate(() => {
      const r = document.querySelector('.coach-ring')?.getBoundingClientRect();
      if (!r) return null;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !top?.closest('.coach');
    });
  const covered = [];
  const noteRing = async (step) => {
    await p.waitForTimeout(450);
    if ((await ringFree()) === false) covered.push(step);
  };

  await p.goto('http://127.0.0.1:8811/');
  await p.waitForSelector('.newgame', { timeout: 20000 });
  check(`${label}: ilk oyunda rehber seçeneği açık geliyor`, await p.locator('[data-newgame-tutorial] input').isChecked());
  await p.fill('.newgame-field input[type="text"]', 'Rehber AŞ');
  await p.locator('button:has-text("Şirketi kur")').click();
  const gameStarted = Date.now();
  await p.waitForSelector('.coach[data-coach-step="welcome"]', { timeout: 20000 });
  await p.waitForTimeout(500);
  check(`${label}: rehber karşılamada zamanı durduruyor`, await p.evaluate(() => window.__capital.getState().time.speed === 0));
  await p.locator('[data-coach="next"]').click();

  const reached = {};
  reached.lens = await waitStep('lens');
  await noteRing('lens');
  if (!(await p.locator('[data-lens="opportunity"]').isVisible())) await p.locator('[data-collapse="lens"]').click();
  await p.locator('[data-lens="opportunity"]').click();
  reached.pick = await waitStep('pick');
  const tileId = await findTile(p, 'vacant');
  await p.evaluate((id) => window.__capital.selectTile(id), tileId);
  reached.buy = await waitStep('buy');
  await noteRing('buy');
  await p.locator('[data-action="buy-tile"]').click();
  reached.choose = await waitStep('choose');
  await noteRing('choose');
  if (await p.locator('[data-action="show-build"]').isVisible()) {
    await p.locator('[data-action="show-build"]').click();
    await p.waitForTimeout(700);
  }
  await noteRing('choose-list');
  await p.locator('.buildcard:has(.buildcard-best)').first().click();
  reached.build = await waitStep('build');
  await noteRing('build');
  if (await p.locator('[data-action="build-here"]').isVisible()) await p.locator('[data-action="build-here"]').click();
  else await p.locator('[data-action="build-selected"]').click();
  reached.play = await waitStep('play');
  await noteRing('play');
  await p.locator('.speeds button').nth(3).click();
  reached.goals = await waitStep('goals', 25000);
  await p.waitForTimeout(400);
  const before = ((await p.locator('.coach-body').textContent()) ?? '').trim();
  const chip = p.locator('[data-agenda="goal"] button');
  if (await chip.isVisible()) await chip.click();
  else await p.locator('[data-coach="next"]').click();
  await p.waitForTimeout(400);
  const during = ((await p.locator('.coach-body').textContent()) ?? '').trim();
  await p.keyboard.press('Escape');
  reached.chain = await waitStep('chain');
  await p.locator('[data-panel="chain"]').click();
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  reached.rivals = await waitStep('rivals');
  await p.locator('[data-panel="bourse"]').click();
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  reached.done = await waitStep('done');

  const missed = Object.entries(reached).filter(([, ok]) => !ok).map(([id]) => id);
  check(`${label}: rehber oyunun kendi akışıyla ilerliyor (mercek → arsa → mağaza → zaman → hedef → zincir → borsa)`,
    missed.length === 0, missed.length ? `takıldı: ${missed.join(', ')}` : '10 adım');
  check(`${label}: panel adımında kart panelin anlatımına geçiyor`, before !== during && during.length > 40, during.slice(0, 50));
  check(`${label}: kart hiçbir adımda kendi hedefini örtmüyor`, covered.length === 0, covered.join(', ') || 'halka her adımda açık');
  const owned = await p.evaluate(() => {
    const s = window.__capital.getState();
    return Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId).length;
  });
  check(`${label}: rehberin sonunda gerçek bir mağaza var`, owned >= 1, `${owned} bina`);

  await p.locator('[data-coach="next"]').click();
  await p.waitForTimeout(300);
  const stored = await p.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), TUTORIAL_KEY);
  check(`${label}: bitince kart kalkıyor ve tarayıcı rehberi hatırlıyor`,
    (await p.locator('.coach').count()) === 0 && stored.seen === true);
  check(`${label}: rehber konsolu kirletmiyor`, errors.length === 0, errors.slice(0, 2).join(' | '));
  return { p, gameStarted };
}

async function finish(browser, consoleErrors) {
  console.log('\n================================');
  console.log(`TOPLAM: ${pass} geçti, ${fail} kaldı${SMOKE ? ' (duman koşusu)' : ''}`);
  if (fail) console.log('Kalanlar:\n - ' + failures.join('\n - '));
  console.log(`Konsol hataları: ${consoleErrors.length}`);
  console.log(`Süre: ${Math.round((Date.now() - startedAt) / 1000)} sn`);

  await browser.close();
  server.close();
  children.forEach(stopChild);
  process.exit(fail ? 1 : 0);
}

(async () => {
  await new Promise((r) => server.listen(8811, r));
  const browser = await chromium.launch({
    ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  /*
   * Hizmet çalışanı (Tur 48) varsayılan olarak kapalı. Açıkken yenilenen
   * sayfa önbellekten açılıyor ve bağlamın istek yakalaması (`route`)
   * çalışanın cevapladığı istekleri görmüyor; bölümler Tur 47'ye kadar
   * nasıl koşuyorsa öyle koşsun. Çalışanı "Kurulabilir ve çevrimdışı oyun"
   * bölümü açıkça açıyor.
   */
  const openContext = browser.newContext.bind(browser);
  browser.newContext = (options = {}) => openContext({ serviceWorkers: 'block', ...options });
  const openPage = browser.newPage.bind(browser);
  browser.newPage = (options = {}) => openPage({ serviceWorkers: 'block', ...options });
  /*
   * REHBER EN BAŞTA, ana sayfa açılmadan (Tur 26). İkinci bir bağlamda
   * yeni oyun kurmak, ana sayfanın WebGL bağlamı canlıyken yazılımsal
   * GPU'da 30 saniyeyi aşabiliyordu (CI'da "Şirketi kur" tıklaması
   * zaman aşımına düştü; yerelde geçiyordu). Tek bağlamla koşunca
   * ölçülen şey rehber oluyor, GPU kuyruğu değil.
   */
  section('Rehber');
  {
    const tutorialContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { p: tp } = await tutorialWalk(tutorialContext, 'Masaüstü');
    // Bir kez bitirilen rehber yeni oyunda kendiliğinden açılmıyor; Yardım'dan yeniden başlıyor.
    await tp.locator('[data-panel="help"]').click();
    await tp.locator('[data-coach-restart]').click();
    await tp.waitForSelector('.coach[data-coach-step="welcome"]', { timeout: 5000 });
    check('Yardım panelinden rehber yeniden başlıyor', (await tp.locator('.coach').count()) === 1);
    await tp.waitForTimeout(300);
    // Rehberin yürüyüşü zamanı ▶▶▶'de bıraktı: yeniden başlayan rehber de durdurmalı.
    check('Yeniden başlayan rehber de zamanı durduruyor',
      await tp.evaluate(() => window.__capital.getState().time.speed === 0));
    await tp.locator('[data-coach="close"]').click();
    await tp.waitForTimeout(300);
    check('"Rehberi kapat" kartı kaldırıyor', (await tp.locator('.coach').count()) === 0);
    await tutorialContext.close();
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(veteran, TUTORIAL_KEY);

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto('http://127.0.0.1:8811/');

  // ---------- Açılış ekranı ----------
  section('Şirket kurulumu');
  await page.waitForSelector('.newgame', { timeout: 20000 });
  check('Yeni oyunda önce kurulum ekranı çıkıyor', true);
  check('CEO seçenekleri listeleniyor', (await page.locator('.ceo-card').count()) === 10);
  check('CEO portreleri çiziliyor', (await page.locator('.ceo-card svg').count()) === 10);

  const firstCeo = (await page.locator('.ceo-detail h2').textContent())?.trim();
  await page.locator('.ceo-card').nth(3).click();
  const pickedCeo = (await page.locator('.ceo-detail h2').textContent())?.trim();
  check('CEO seçimi detay kartını değiştiriyor', firstCeo !== pickedCeo, `${firstCeo} → ${pickedCeo}`);
  const selectedIndex = await page.evaluate(() =>
    [...document.querySelectorAll('.ceo-card')].findIndex((el) => el.classList.contains('selected')),
  );
  check('Seçim vurgusu tıklanan karta gidiyor', selectedIndex === 3, `vurgulu kart: ${selectedIndex + 1}.`);
  check(
    'CEO güçlü/zayıf yanları gösteriliyor',
    (await page.locator('.ceo-perk').count()) === 2,
    (await page.locator('.ceo-perk').first().textContent())?.trim(),
  );

  check('Zorluk seçenekleri listeleniyor', (await page.locator('.difficulty-option[data-difficulty]').count()) === 3);
  check('Varsayılan zorluk Dengeli',
    (await page.locator('.difficulty-option[data-difficulty][aria-checked="true"]').getAttribute('data-difficulty')) === 'normal');
  check('Varsayılan oyun türü serbest şehir',
    (await page.locator('.mode-picker [data-mode="free"][aria-checked="true"]').count()) === 1);
  await page.locator('.difficulty-option[data-difficulty="hard"]').click();
  // Kurulumda üç açıklama kutusu var (oyun türü, zorluk, şehir boyutu; Tur 21):
  // zorluğunkini adıyla seç.
  const hardDetail = ((await page.locator('.difficulty-detail[data-detail="difficulty"]').textContent()) ?? '').trim();
  check('Zorluk seçimi farkları açıkça yazıyor', hardDetail.includes('150M'), hardDetail.slice(0, 90));
  await page.locator('.difficulty-option[data-difficulty="normal"]').click();

  await page.screenshot({ path: `${OUT}/newgame.png` });
  check('Rehberi görmüş oyuncuda "Rehberle başla" kapalı geliyor',
    !(await page.locator('[data-newgame-tutorial] input').isChecked()));

  await page.fill('.newgame-field input[type="text"]', 'Karaca Holding');
  await page.locator('button:has-text("Şirketi kur")').click();
  await page.waitForSelector('.topbar', { timeout: 20000 });
  check(
    'Girilen şirket adı oyuna taşınıyor',
    (await page.locator('.brand-name').textContent())?.includes('Karaca Holding'),
  );
  check(
    'Seçilen CEO üst barda görünüyor',
    (await page.locator('.brand-ceo svg').count()) === 1,
    (await page.locator('.brand-sub').textContent())?.trim(),
  );
  check('Dengeli oyun kayda zorluk alanı yazmıyor',
    await page.evaluate(() => window.__capital.getState().difficulty === undefined));

  // ---------- Sahne ----------
  section('Şehir sahnesi');
  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.scene');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return { ok: Boolean(gl), w: canvas?.width, h: canvas?.height };
  });
  check('WebGL bağlamı canlı', webgl.ok, `canvas ${webgl.w}×${webgl.h}`);

  // Doku oranları AÇIK şehirden: kilitli köşeler bilerek boş (açılınca
  // kurulacak arazi onlar) ve pazarda değiller — onları saymak "şehir
  // bomboş" yanlış alarmı verirdi. Denge koşumundaki kuralın aynısı.
  const fabric = await page.evaluate(() => {
    const state = window.__capital.getState();
    const isOpen = (t) => {
      const district = state.districts[t.districtId];
      return !district || district.opensOnDay === undefined || state.time.day >= district.opensOnDay;
    };
    const tiles = state.map.tiles.filter(isOpen);
    return {
      roads: tiles.filter((t) => t.kind === 'road').length,
      civic: tiles.filter((t) => t.kind === 'civic').length,
      occupied: tiles.filter((t) => t.kind === 'plot' && t.structureId).length,
      vacant: tiles.filter((t) => t.kind === 'plot' && !t.structureId).length,
      total: tiles.length,
      locked: state.map.tiles.length - tiles.length,
    };
  });
  // Bu üç kontrol ORANLA ölçüyor, mutlak sayıyla değil.
  //
  // Eskiden `vacant > 60 && vacant < 200` yazıyordu ve Tur 8'de harita
  // 285'ten 504 parsele çıkınca kırıldı — oysa ölçtüğü şey (şehrin ne
  // kadar boş başladığı) %38'den %39'a gitmişti, yani hiç değişmemişti.
  // Haritanın boyutuna bağlanan bir eşik, gerçek bir sorun yokken
  // kırmızı yakar ve asıl sorunu gölgeler.
  const plots = fabric.occupied + fabric.vacant;
  const roadShare = fabric.roads / fabric.total;
  const vacantShare = fabric.vacant / plots;
  check('Şehirde sokak ızgarası var', roadShare > 0.25, `karelerin %${Math.round(roadShare * 100)}'i sokak`);
  // Tur 16: şehir gün 0'da bitmiş bir dekor değil, bir KASABA. Yoğunluk
  // artık kuruluşta değil zaman içinde geliyor (denge koşumundaki
  // "Şehir zamanla gelişiyor" bölümü onu ölçüyor); buradaki bant
  // kasabanın ne çorak ne dolu olduğunu koruyor.
  check('Kuruluşta şehir bir kasaba', fabric.occupied / plots >= 0.18 && fabric.occupied / plots <= 0.45,
    `${fabric.occupied}/${plots} parsel dolu · ${fabric.locked} kare imara kapalı`);
  check(
    'Kuruluşta genişlemeye yer var',
    vacantShare >= 0.55 && vacantShare <= 0.85,
    `${fabric.vacant}/${plots} açık parsel boş — %${Math.round(vacantShare * 100)}`,
  );

  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/city-day.png` });

  // ---------- Simülasyon ----------
  section('Simülasyon döngüsü');
  const day0 = await page.evaluate(() => window.__capital.getState().time.day);
  // SABİT UYKU DEĞİL, KOŞUL: CI'da yazılım render'ı (~3 FPS) sahne yeni
  // yüklenmişken en yavaşında; 6 saniyelik sabit pencerede yeşil koşuda bile
  // yalnızca bir gün geçiyordu (payı tek gün) ve bir koşuda sıfıra indi.
  // İddia aynı — zaman ilerliyor — ama 15 saniyeye kadar bekleniyor.
  await page
    .waitForFunction((d) => window.__capital.getState().time.day > d, day0, { timeout: 15000, polling: 250 })
    .catch(() => null);
  const day1 = await page.evaluate(() => window.__capital.getState().time.day);
  check('Zaman ilerliyor', day1 > day0, `${day0}. gün → ${day1}. gün`);

  await page.click('.speed:nth-child(1)');
  const pausedA = await page.evaluate(() => window.__capital.getState().time.day);
  await page.waitForTimeout(1800);
  const pausedB = await page.evaluate(() => window.__capital.getState().time.day);
  check('Duraklatma çalışıyor', pausedA === pausedB, `${pausedA}. günde durdu`);
  await page.click('.speed:nth-child(3)');

  // ---------- Parsel kuralları ----------
  section('Parsel kuralları');
  const roadId = await findTile(page, 'road');
  await page.evaluate((id) => window.__capital.selectTile(id), roadId);
  await page.waitForTimeout(200);
  check(
    'Sokak satın alınamaz olarak gösteriliyor',
    (await page.locator('.plot-note').textContent())?.includes('Sokak'),
  );
  check('Sokakta satın alma butonu yok', (await page.locator('button:has-text("satın al")').count()) === 0);

  const civicId = await findTile(page, 'civic');
  if (civicId !== null) {
    await page.evaluate((id) => window.__capital.selectTile(id), civicId);
    await page.waitForTimeout(200);
    check(
      'Kamu alanı satılık değil olarak gösteriliyor',
      (await page.locator('.plot-note').textContent())?.includes('belediye'),
      (await page.locator('.plot-note').textContent())?.trim(),
    );
  }

  const occupiedId = await findTile(page, 'occupied');
  await page.evaluate((id) => window.__capital.selectTile(id), occupiedId);
  await page.waitForTimeout(200);
  const buyoutButton = page.locator('button:has-text("Sahibinden devral")');
  check('Dolu parselde devralma seçeneği çıkıyor', (await buyoutButton.count()) === 1,
    (await page.locator('.plot-note').textContent())?.trim());
  check('Dolu parselde doğrudan satın alma yok',
    (await page.locator('button:has-text("Parseli satın al")').count()) === 0);

  // Kademeli imar: kilitli köşe parseli satılık değil, takvimini söylüyor.
  const lockedId = await findTile(page, 'locked');
  check('Haritada kilitli bölge var', lockedId !== null, `kare ${lockedId}`);
  if (lockedId !== null) {
    await page.evaluate((id) => window.__capital.selectTile(id), lockedId);
    await page.waitForTimeout(200);
    const lockedNote = (await page.locator('.plot-note').textContent())?.trim();
    check('Kilitli parsel "imara kapalı" olarak gösteriliyor',
      lockedNote?.includes('imara kapalı'), lockedNote);
    check('Kilitli parselde satın alma butonu yok',
      (await page.locator('button:has-text("satın al")').count()) === 0);
  }

  // ---------- Satın alma ve inşa ----------
  section('Satın alma, devralma, inşa');
  // Bölüm boyunca oyun duruyor: boş parseli seçmekle "satın al"a basmak
  // arasında bir rakip o parseli alabiliyordu ve düğme hiç gelmiyordu
  // (Tur 24'te bir koşuda oldu). Bölüm arayüzü sınıyor, rakiple yarışı değil.
  const speedBeforeBuy = await page.evaluate(() => {
    const speed = window.__capital.getState().time.speed;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return speed;
  });
  const vacantId = await findTile(page, 'vacant');
  await page.evaluate((id) => window.__capital.selectTile(id), vacantId);
  await page.waitForTimeout(200);
  check('Boş parsel "alınabilir" olarak işaretleniyor',
    (await page.locator('.plot-note.vacant').count()) === 1);
  check('Yatırım tahmini gösteriliyor', (await page.locator('.estimate').count()) > 0,
    (await page.locator('.estimate').first().textContent())?.trim());

  await page.locator('button:has-text("Parseli satın al")').click();
  await page.waitForTimeout(300);
  check('Boş parsel satın alınabiliyor',
    await page.evaluate((id) => window.__capital.getState().map.tiles[id].ownerId === 'player', vacantId));

  // Kartı SIRAYA göre değil ADINA göre seç.
  //
  // Liste artık katalog sırasında değil, parsel getirisine göre sıralı
  // (Tur 7). Sıraya bağlı bir tıklama, sıralama ölçütü her
  // değiştiğinde başka bir bina kurar ve buradan sonraki bütün
  // kontroller (zincir kartının kaç yuvası olduğu dahil) sessizce
  // başka bir şeyi ölçmeye başlar.
  await page.locator('.buildcard:has(.buildcard-name:text-is("Bakkal"))').click();
  await page.waitForTimeout(200);
  const placeButton = page.locator('button:has-text("Seçili arsaya inşa et")');
  if ((await placeButton.count()) > 0) await placeButton.click();
  await page.waitForTimeout(400);
  check('Bina inşa edildi', (await page.locator('.ledger').count()) > 0);
  check('Kâr/zarar kırılımı gösteriliyor', (await page.locator('.ledgerrow').count()) >= 5);

  // Devralma gerçekten çalışıyor mu?
  const buyoutTarget = await findTile(page, 'occupied');
  await page.evaluate((id) => {
    window.__capital.getState().companies.player.cash = 5_000_000;
    window.__capital.selectTile(id);
  }, buyoutTarget);
  await page.waitForTimeout(250);
  await page.locator('button:has-text("Sahibinden devral")').click();
  await page.waitForTimeout(300);
  const afterBuyout = await page.evaluate((id) => {
    const tile = window.__capital.getState().map.tiles[id];
    return { owner: tile.ownerId, structure: tile.structureId };
  }, buyoutTarget);
  check('Devralma parseli boşaltıp sahibi yapıyor',
    afterBuyout.owner === 'player' && afterBuyout.structure === null);
  await page.evaluate((speed) => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed }), speedBeforeBuy);

  // ---------- Haritada tıklama ----------
  section('Harita etkileşimi');
  const canvasBox = await page.locator('canvas.scene').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.waitForTimeout(400);
  check('Haritaya tıklayınca parsel paneli doluyor',
    (await page.locator('.inspector .statgrid').count()) > 0);

  for (const lens of ['Fırsat', 'Arsa Değeri', 'Rekabet', 'Mülkiyet', 'Şehir']) {
    await page.locator('.lens', { hasText: lens }).click();
    await page.waitForTimeout(200);
  }
  check('Tüm lensler hatasız değişiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  await page.mouse.move(canvasBox.x + 700, canvasBox.y + 400);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(700);
  check('Kamera girdisi hata üretmiyor', consoleErrors.length === 0);

  // ---------- Görünüm modları ve renk kararlılığı ----------
  section('Görünüm modları');

  // Aynı lense dönünce zemin renkleri birebir aynı olmalı: lens değiştirmek
  // renkleri sürüklememeli. Oyuncunun bildirdiği "her geçişte biraz daha
  // karardı" şikâyetinin doğrudan regresyon testi.
  const lensCycle = ['none', 'opportunity', 'landValue', 'competition', 'income', 'ownership'];

  // Simülasyonu dondur: yoksa arsa değerleri ve rakip hamleleri de rengi
  // değiştirir ve testin ne ölçtüğü belirsizleşir.
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  await page.waitForTimeout(300);

  // Sabit süre beklemek yazılım rasterizasyonunda yetmiyor: bir kare ~170ms
  // sürdüğü için React'in efekti sahneye taşıması gecikiyor ve test bir adım
  // geriden okuyordu. Sahnenin lensi GERÇEKTEN uyguladığını bekliyoruz.
  const readAfterLens = (lens) =>
    page.evaluate(async (l) => {
      window.__capital.setLens(l);
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const info = window.__capital.renderInfo();
        if (info && info.activeLens === l) return info;
        await new Promise((r) => setTimeout(r, 25));
      }
      return window.__capital.renderInfo();
    }, lens);

  const cityFirst = (await readAfterLens('none')).groundColorSum;

  for (let round = 0; round < 3; round++) {
    for (const lens of lensCycle) await readAfterLens(lens);
  }

  const cityAgain = (await readAfterLens('none')).groundColorSum;
  check(
    'Üç lens turundan sonra şehir renkleri birebir aynı',
    Math.abs(cityFirst - cityAgain) < 1e-6,
    `${cityFirst.toFixed(3)} → ${cityAgain.toFixed(3)}`,
  );

  const cityMode = await readAfterLens('none');
  const lensMode = await readAfterLens('opportunity');

  check('Şehir görünümünde binalar katı', cityMode.buildingOpacity === 1,
    `opaklık ${cityMode.buildingOpacity}`);
  check('Veri lensinde binalar saydam siluet',
    lensMode.buildingOpacity > 0 && lensMode.buildingOpacity < 0.4,
    `opaklık ${lensMode.buildingOpacity}`);
  check('Veri lensinde amber pencere parıltısı susuyor', lensMode.fabricEmissive === 0);

  const spread = await page.evaluate(() => {
    const { getState } = window.__capital;
    const s2 = getState();
    const values = s2.districts.map((d) => {
      let units = 0;
      for (const c of ['grocery', 'dining', 'retail', 'electronics', 'services']) {
        units += (d.demand[c] || 0) * (d.unmet[c] || 0);
      }
      return units;
    });
    const max = Math.max(...values);
    const min = Math.min(...values);
    return { max, min, ratio: max > 0 ? min / max : 1 };
  });
  check('Fırsat lensi bölgeleri birbirinden ayırıyor', spread.ratio < 0.75,
    `en düşük/en yüksek = ${spread.ratio.toFixed(2)}`);
  check('Lens modu sahneye doğru bildiriliyor',
    lensMode.dataLens === true && cityMode.dataLens === false);

  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(700);
  await readAfterLens('opportunity');
  await page.screenshot({ path: `${OUT}/lens-opportunity.png` });

  // ---------- Gece oynanabilirliği ----------
  section('Gece oynanabilirliği');

  //
  // SABİT `sleep` KULLANMA. Bu ortamda kare süresi sahnenin ağırlığına
  // göre 20 ms ile 1 sn arasında değişiyor; sabit bir bekleme yavaş
  // koşumda bir adım geriden okur ve ÇALIŞAN bir özelliği hatalı
  // raporlar. `timeOfDay` her karede biraz ilerlediği için 0,75'in
  // üstüne çıkmış olması en az bir karenin çizildiğinin kanıtı.
  //
  //
  // LENS DEĞİŞTİKTEN SONRA BİR KARE ÇİZİLMİŞ OLMALI.
  //
  // Sondaj eskiden yalnızca `activeLens` ve `timeOfDay`'e bakıyordu ve
  // arada sırada kırmızı yanıyordu: `setLens` veri lensinden çıkarken
  // pencere parıltısını ANINDA sıfırlıyor, gerçek değeri ise bir sonraki
  // kare hesaplıyor. İkisinin arasında okunan değer 0 çıkıyor ve ÇALIŞAN
  // bir özellik hatalı raporlanıyordu.
  //
  // KARE SAYACINI BEKLE, SİMÜLASYON SAATİNİ DEĞİL.
  //
  // İlk düzeltmem "kare çizildi mi"yi `timeOfDay`'in ilerlemesinden
  // çıkarıyordu. O çıkarım oyun DURAKLATILMIŞKEN yanlış: saat durunca
  // koşul hiç sağlanmıyor, sondaj 10 sn zaman aşımına düşüyor ve
  // ÇALIŞAN bir özelliği "emissive 0.00" diye raporluyordu — üstelik
  // düzeltmeden önceki halinden daha sık.
  //
  // Çizim döngüsü simülasyon saatinden bağımsız döner; doğru gösterge
  // sahnenin kendi kare sayacı.
  const atNight = async (lens) =>
    page.evaluate(
      async (l) => {
        window.__capital.setLens(l);
        window.__capital.setTimeOfDay(0.75); // güneşin en alçak olduğu an
        /*
         * Kare sayımı LENS UYGULANDIKTAN SONRA başlar. Eski hâli çağrı
         * anından itibaren 2 kare sayıyordu ve o kareler React'in lens
         * geçişini uygulamasından ÖNCE çizilebiliyordu: pencere emisyonu
         * lens uygulandıktan sonraki ilk updateDaylight'ta yazıldığı
         * için sonda 0,00 okuyup çalışan özelliği hatalı raporluyordu.
         */
        let lensFrame = null;
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const info = window.__capital.renderInfo();
          if (info && info.activeLens === l) {
            if (lensFrame === null) lensFrame = info.frameCount;
            else if (info.frameCount > lensFrame) return info;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
        return window.__capital.renderInfo();
      },
      lens,
    );

  const darkest = await atNight('none');
  check('Gecenin en karanlık anında güneş sönmüyor', darkest.sunIntensity >= 0.6,
    `güneş ${darkest.sunIntensity.toFixed(2)}`);
  check('Gecenin en karanlık anında ortam ışığı yeterli', darkest.hemisphereIntensity >= 0.7,
    `ortam ${darkest.hemisphereIntensity.toFixed(2)}`);
  // Bu kontrol Tur 6'da anlamını değiştirdi ve BİLEREK gevşetildi.
  //
  // Eskiden emisyon binanın TÜM yüzeyine düz uygulanıyordu; yükseltmek
  // şehri tek parça amber bir kütleye çeviriyordu, o yüzden tavan 0,05'ti.
  // Artık emisyon bir dokudan geliyor: siyah zemin üzerinde yalnızca
  // pencereler parlıyor. Korunması gereken şey artık parlaklığın DÜŞÜK
  // olması değil, emisyonun DOKUDAN gelmesi — asıl güvence bu.
  check('Gece pencereler yanıyor', darkest.fabricEmissive > 0.5,
    `emissive ${darkest.fabricEmissive.toFixed(2)}`);
  check('Emisyon dokudan geliyor, düz yüzeyden değil', darkest.emissiveMapped === true);
  check('Işık kaynağı yer altına inmiyor', darkest.sunHeight > 5,
    `ışık yüksekliği ${darkest.sunHeight.toFixed(1)}`);
  check('Gece gökyüzü tamamen siyaha inmiyor', darkest.skyLightness >= 0.1,
    `gök parlaklığı ${darkest.skyLightness.toFixed(3)}`);
  await page.screenshot({ path: `${OUT}/city-night.png` });

  const cycleHeights = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      window.__capital.setTimeOfDay(i / 12);
      await new Promise((r) => setTimeout(r, 60));
      out.push(window.__capital.renderInfo().sunHeight);
    }
    return out;
  });
  check('Gün döngüsünün tamamında ışık yerin üstünde',
    cycleHeights.every((h) => h > 5),
    `en alçak ${Math.min(...cycleHeights).toFixed(1)}`);

  const lensAtNight = await atNight('opportunity');
  check('Gece de veri lensi ışıktan bağımsız çiziliyor',
    lensAtNight.dataLens === true && lensAtNight.fabricEmissive === 0);
  await page.screenshot({ path: `${OUT}/lens-night.png` });

  await page.evaluate(() => {
    window.__capital.setLens('none');
    window.__capital.setTimeOfDay(0.28);
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 2 });
  });

  // ---------- Paneller ----------
  section('Paneller');
  await page.locator('.topbar-actions [data-panel="rivals"]').click();
  await page.waitForTimeout(300);
  check('Rakip tablosu doluyor', (await page.locator('.modal .table tbody tr').count()) >= 5);
  await page.keyboard.press('Escape');

  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(300);
  check('Şirket paneli açılıyor', (await page.locator('.company').count()) === 1);
  await page.keyboard.press('Escape');

  // ---------- Zincir kartı ----------
  // Motor katmanı A parçasında doğrulandı; burada bakılan şey oyuncunun
  // gerçekten görüp kullanabildiği mi.
  // ---------- Gündem ve hedefler ----------
  section('Gündem ve hedefler');
  const goalChip = page.locator('.agenda [data-agenda="goal"] button');
  check('Gündemde sıradaki hedef duruyor', (await goalChip.count()) === 1,
    ((await goalChip.textContent().catch(() => '')) ?? '').trim());
  await goalChip.click();
  await page.waitForTimeout(250);
  const ladder = await page.evaluate(() => ({
    rows: document.querySelectorAll('.goal-list .goal').length,
    done: document.querySelectorAll('.goal-list .goal-done').length,
    next: document.querySelectorAll('.goal-list .goal-next').length,
  }));
  check('Hedef çipi merdiveni açıyor', ladder.rows === 10, `${ladder.rows} basamak`);
  check('İnşa edilen dükkân merdivende işaretli', ladder.done >= 1 && ladder.next === 1,
    `${ladder.done} tamam · ${ladder.next} sıradaki`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Aciliyet sırası: kontrole yaklaşan baskın şeridin başına geçmeli.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    const rival = Object.values(s.companies).find((c) => !c.isPlayer);
    rival.shares[s.playerCompanyId] = 4200;
    window.__capital.raidProbe = rival.id;
  });
  await page.waitForFunction(() => document.querySelector('.agenda [data-agenda="raid"]') !== null, null, { timeout: 5000 }).catch(() => null);
  const firstAgenda = await page.evaluate(() => document.querySelector('.agenda [data-agenda]')?.getAttribute('data-agenda'));
  check('Acil baskın gündemin başına geçiyor', firstAgenda === 'raid', `ilk kalem: ${firstAgenda}`);
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.companies[window.__capital.raidProbe].shares[s.playerCompanyId];
  });

  // İmar geri sayımı: tıklanınca kamera bölgeye gider.
  //
  // Oyun bu kontrol boyunca DURUYOR. Akarken gündem her gün yeniden
  // diziliyor (olay, ihale, sayaçlar) ve çip tıklama anında kayıyordu:
  // PR #44'ün duman koşusunda tıklamayı önce "Moda Haftası", sonra ihale
  // çipi aldı, sonunda çip DOM'dan söküldü. Ölçülen şey çipin kamerayı
  // götürmesi; hareketli bir hedefe isabet değil. Haber kontrolü hızı
  // yeniden 1'e alıyor.
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  await page.waitForTimeout(300);
  const unlockProbe = await page.evaluate(() => {
    const s = window.__capital.getState();
    const district = s.districts.find((d) => d.opensOnDay !== undefined && d.opensOnDay > s.time.day);
    if (!district) return null;
    window.__capital.unlockProbe = { id: district.id, was: district.opensOnDay };
    district.opensOnDay = s.time.day + 12;
    // Oyun durduğu için gün akmıyor ve arayüz kendiliğinden tazelenmiyor;
    // başarılı her komut durumu yayınlıyor.
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return { id: district.id, cx: (district.x0 + district.x1) / 2, cz: (district.y0 + district.y1) / 2 };
  });
  if (unlockProbe) {
    await page.waitForFunction(() => document.querySelector('.agenda [data-agenda="unlock"] button') !== null, null, { timeout: 5000 }).catch(() => null);
    const unlockButton = page.locator('.agenda [data-agenda="unlock"] button');
    check('Yaklaşan imar açılışı gündemde geri sayıyor', (await unlockButton.count()) === 1,
      ((await unlockButton.textContent().catch(() => '')) ?? '').trim());
    if ((await unlockButton.count()) === 1) await unlockButton.click();
    await page.waitForTimeout(200);
    const target = await page.evaluate(() => window.__capital.cameraTarget());
    const dist = target ? Math.hypot(target.x - unlockProbe.cx, target.z - unlockProbe.cz) : 999;
    check('İmar çipi kamerayı bölgeye götürüyor', dist < 6, `merkeze ${dist.toFixed(1)} kare`);
    await page.evaluate(() => {
      const probe = window.__capital.unlockProbe;
      window.__capital.getState().districts[probe.id].opensOnDay = probe.was;
    });
  }

  // Olay yerine git: yeri olan haber bir dokunuşla oraya götürür.
  const newsProbe = await page.evaluate(() => {
    const s = window.__capital.getState();
    const tile = s.map.tiles.find((t) => t.kind === 'plot' && t.x > 20 && t.y > 20);
    s.news.unshift({ id: s.nextId++, day: s.time.day, tone: 'rival', title: 'Deneme haberi', body: 'Yeri olan haber.', tileId: tile.id });
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
    return { tileId: tile.id, x: tile.x, z: tile.y };
  });
  await page.waitForFunction(() => document.querySelector('.news .news-goto') !== null, null, { timeout: 5000 }).catch(() => null);
  const gotoButtons = await page.locator('.news .news-goto').count();
  check('Yeri olan haberde "Git" var', gotoButtons >= 1, `${gotoButtons} haber`);
  if (gotoButtons >= 1) {
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('.news .news-item')].find((li) => li.textContent.includes('Deneme haberi'));
      item?.querySelector('.news-goto')?.click();
    });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({
      target: window.__capital.cameraTarget(),
      selected: document.querySelector('.inspector') !== null,
    }));
    const gap = after.target ? Math.hypot(after.target.x - newsProbe.x, after.target.z - newsProbe.z) : 999;
    check('"Git" kamerayı olay yerine götürüyor', gap < 6, `kareye ${gap.toFixed(1)}`);
    check('"Git" kareyi seçip ayrıntısını açıyor', after.selected);
  }
  await page.evaluate(() => window.__capital.selectTile(null));

  // Meclis: oturumu bugüne çek, önergeler gündeme düşsün, lobi işlesin.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.council = { nextSessionDay: s.time.day, session: null, history: [] };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
  });
  const councilChip = page.locator('.agenda [data-agenda="council"] button');
  await page.waitForFunction(() => document.querySelector('.agenda [data-agenda="council"] button') !== null, null, { timeout: 6000 }).catch(() => null);
  check('Meclis toplanınca gündemde geri sayıyor', (await councilChip.count()) === 1,
    ((await councilChip.textContent().catch(() => '')) ?? '').trim());
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  if ((await councilChip.count()) === 1) {
    await councilChip.click();
    await page.waitForTimeout(250);
    const motions = await page.locator('.council-motion').count();
    check('Meclis paneli önergeleri listeliyor', motions === 2, `${motions} önerge`);
    const before = await page.evaluate(() => {
      const s = window.__capital.getState();
      return { cash: s.companies[s.playerCompanyId].cash, fill: document.querySelector('.council-motion .council-bar-fill')?.style.width };
    });
    await page.locator('.council-motion').first().locator('.council-give.for').first().click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
      const s = window.__capital.getState();
      const first = document.querySelector('.council-motion');
      return {
        cash: s.companies[s.playerCompanyId].cash,
        fill: first?.querySelector('.council-bar-fill')?.style.width,
        listed: [...(first?.querySelectorAll('.council-lobby li') ?? [])].some((li) => li.textContent.includes('Karaca')),
      };
    });
    check('Lobi bağışı nakitten düşüyor', Math.round(before.cash - after.cash) === 50_000,
      `${Math.round(before.cash - after.cash)} ₺`);
    check('Bağış desteği kaydırıyor ve kamuya açık listede', parseFloat(after.fill) > parseFloat(before.fill) && after.listed,
      `${before.fill} → ${after.fill}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  check('Rıhtımda meclis sekmesi var', (await page.locator('.topbar-actions [data-panel="council"]').count()) === 1);

  // Ses manzarası: dokunuşlardan sonra bağlam açık, olaylar tetikleniyor,
  // sessize alma çalışıyor ve hatırlanıyor.
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));
  // Ses katmanları yarım saniyede bir şehirden okunuyor; yavaş makinede
  // (saniyede ~2 kare) 1,2 sn'lik sabit bekleme o güncellemeyi kaçırıyordu.
  // Güncellemenin kendisi bekleniyor.
  await page.waitForFunction(() => (window.__capital.audio?.()?.levels.traffic ?? 0) > 0, null, { timeout: 15000 }).catch(() => {});
  const sound = await page.evaluate(() => window.__capital.audio?.() ?? null);
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  check('Ses manzarası ilk dokunuştan sonra başlıyor', sound !== null && sound.context !== 'none',
    sound ? `bağlam ${sound.context}` : 'kanca yok');
  check('Oyun olayları ses tetikliyor (inşaat, iyi haber)',
    sound !== null && sound.played.build >= 1 && sound.played.cash >= 1,
    sound ? JSON.stringify(sound.played) : '');
  check('Ses katmanları şehirden besleniyor', sound !== null && sound.levels.hum > 0.05 && sound.levels.traffic > 0,
    sound ? `uğultu ${sound.levels.hum.toFixed(3)} · trafik ${sound.levels.traffic.toFixed(3)} · gece ${sound.levels.night.toFixed(2)}` : '');
  await page.locator('.sound-toggle').click();
  await page.waitForTimeout(150);
  const mutedNow = await page.evaluate(() => ({
    muted: window.__capital.audio().muted,
    // Tur 47'den beri sessize alma Ayarlar'ın içinde saklanıyor.
    stored: JSON.parse(localStorage.getItem('capitalforge.settings.v1') ?? '{}').muted === true ? '1' : '0',
    pressed: document.querySelector('.sound-toggle')?.getAttribute('aria-pressed'),
  }));
  check('Sessize alma çalışıyor ve hatırlanıyor', mutedNow.muted && mutedNow.stored === '1' && mutedNow.pressed === 'false',
    JSON.stringify(mutedNow));
  await page.locator('.sound-toggle').click();

  // ---------- Banka ve işgücü ----------
  //
  // Tur 18: kredi formu, erken kapatma, sendika talebi ve ihtar çipi.
  // Kurulumlar state'e elle yazılıyor ve bir komutla dinleyici uyarılıyor;
  // bölüm sonunda her şey temizleniyor ki sonraki ölçümler (müşteri akışı,
  // kayıt) grevden ya da faizden etkilenmesin.
  section('Banka ve işgücü');
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(250);
  check('Şirket panelinde banka ve işgücü bölümleri var',
    (await page.locator('.company .bank').count()) === 1 && (await page.locator('.company .labor').count()) === 1);
  const ratingText = ((await page.locator('.bank-rating').textContent().catch(() => '')) ?? '').trim();
  check('Kredi notu görünüyor', /^[ABCD]$/.test(ratingText), ratingText);
  const loanBefore = await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    return { cash: p.cash, debt: p.debt };
  });
  await page.locator('.bank-form button.primary').click();
  await page.waitForTimeout(250);
  const loanAfter = await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    return { cash: p.cash, debt: p.debt, loans: p.credit?.loans.length ?? 0, rows: document.querySelectorAll('.bank-loans tbody tr').length };
  });
  check('Kredi formu nakdi ve borcu birlikte artırıyor',
    loanAfter.loans === 1 && Math.round(loanAfter.cash - loanBefore.cash) === Math.round(loanAfter.debt - loanBefore.debt) && loanAfter.debt > loanBefore.debt,
    `+${Math.round(loanAfter.cash - loanBefore.cash)} ₺ · ${loanAfter.rows} satır`);
  const reapply = ((await page.locator('.bank-form').textContent().catch(() => '')) ?? '');
  check('Yeni başvuru soğumada', reapply.includes('bekle'), reapply.slice(-60).trim());
  await page.locator('.bank-loans tbody tr button').first().click();
  await page.waitForTimeout(200);
  check('Kredi erken kapatılıyor',
    await page.evaluate(() => (window.__capital.getState().companies.player.credit?.loans.length ?? 0) === 0 && document.querySelectorAll('.bank-loans').length === 0));

  await page.locator('.labor-policy button:has-text("Yüksek")').click();
  await page.waitForTimeout(150);
  const policy = await page.evaluate(() => ({
    stored: window.__capital.getState().companies.player.labor?.policy,
    pressed: document.querySelector('.labor .labor-policy button[aria-pressed="true"]')?.textContent,
    lockedOthers: [...document.querySelectorAll('.labor .labor-policy button')].filter((b) => b.disabled).length,
  }));
  check('Ücret politikası seçiliyor, diğerleri soğumada kilitli', policy.stored === 'high' && policy.pressed === 'Yüksek' && policy.lockedOthers === 2,
    JSON.stringify(policy));
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies.player;
    p.labor = { policy: 'market', pressure: 1, agreement: 1, demand: { raise: 0.08, offeredDay: s.time.day, deadlineDay: s.time.day + 2 } };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForFunction(() => document.querySelector('.agenda [data-agenda="union"] button') !== null, null, { timeout: 5000 }).catch(() => null);
  const unionFirst = await page.evaluate(() => document.querySelector('.agenda [data-agenda]')?.getAttribute('data-agenda'));
  check('Süresi dolan sendika talebi gündemin başında', unionFirst === 'union', `ilk kalem: ${unionFirst}`);
  await page.locator('.agenda [data-agenda="union"] button').click();
  await page.waitForTimeout(250);
  check('Sendika çipi talep kartını açıyor', (await page.locator('.labor-demand .labor-choices button').count()) === 3);
  await page.locator('.labor-demand button:has-text("Uzlaşma")').click();
  await page.waitForTimeout(200);
  const unionSettled = await page.evaluate(() => {
    const l = window.__capital.getState().companies.player.labor;
    return { demand: !!l.demand, response: l.lastResponse?.kind, card: document.querySelectorAll('.labor-demand').length };
  });
  check('Uzlaşma cevabı talebi kapatıyor', !unionSettled.demand && unionSettled.response === 'compromise' && unionSettled.card === 0, JSON.stringify(unionSettled));
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies.player;
    p.credit = { loans: [], rating: 'C', overdraftDays: 30, arrearsDays: 4 };
    p.debt = 5_000_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForFunction(() => document.querySelector('.agenda [data-agenda="bank"]') !== null, null, { timeout: 5000 }).catch(() => null);
  const bankChip = await page.evaluate(() => ({
    first: document.querySelector('.agenda [data-agenda]')?.getAttribute('data-agenda'),
    text: document.querySelector('.agenda [data-agenda="bank"]')?.textContent ?? '',
  }));
  check('Banka ihtarı acil kalem olarak gündemde', bankChip.first === 'bank' || bankChip.first === 'union', `${bankChip.first} · ${bankChip.text.trim()}`);

  // Halka arz (Tur 19): borsa panelindeki form ihraç ediyor, kurucu payı düşüyor.
  await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    delete p.credit;
    p.debt = 0;
    p.cash = Math.max(p.cash, 5_000_000);
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.evaluate(() => { window.__capital.engine.runDay(); window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }); });
  await page.locator('.topbar-actions [data-panel="bourse"]').click();
  await page.waitForTimeout(300);
  const issueOpen = await page.evaluate(() => document.querySelector('.issuance')?.getAttribute('data-issuance'));
  check('Borsada halka arz formu açık', issueOpen === 'open', `durum: ${issueOpen}`);
  if (issueOpen === 'open') {
    await page.locator('.issuance button.issue-go').click();
    await page.waitForTimeout(250);
  }
  const issued = await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    return { count: p.shareCount ?? 10000, investors: p.investorShares ?? 0, head: document.querySelector('.issuance .defense-head')?.textContent ?? '' };
  });
  check('Halka arz hisse adedini ve yatırımcı payını büyütüyor', issued.count > 10000 && issued.investors === issued.count - 10000,
    `${issued.count} hisse · ${issued.head.trim()}`);

  /*
   * Kalıcı kalkan (Tur 28): kurucu tabanında (yatırımcı %48,8) tek rakip
   * %45'te. Blok kilide kalan hisseyi söylüyor; "geri al" serbest hisseden
   * hazineye çekiyor ve blok "kontrol kilitli"ye dönüyor, düğme kalkıyor.
   */
  const lockSetup = await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies.player;
    const rival = Object.values(s.companies).find((c) => !c.isPlayer);
    p.shareCount = 19_531;
    p.investorShares = 9_531;
    p.cash = Math.max(p.cash, 50_000_000);
    rival.shares.player = Math.floor(19_531 * 0.45);
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return rival.id;
  });
  await page.waitForTimeout(250);
  const lockBefore = await page.evaluate(() => ({
    state: document.querySelector('[data-defense-lock]')?.getAttribute('data-defense-lock') ?? null,
    text: document.querySelector('[data-defense-lock]')?.textContent ?? '',
    button: document.querySelector('.defense-threat button')?.textContent ?? null,
  }));
  check('Kendi hissen bloğu kilide kalan hisseyi söylüyor', lockBefore.state === 'open' && /\d/.test(lockBefore.text),
    `${lockBefore.state} · ${lockBefore.text.trim()} · ${lockBefore.button}`);
  if (lockBefore.button) await page.locator('.defense-threat button').click();
  await page.waitForTimeout(250);
  const lockAfter = await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    return {
      state: document.querySelector('[data-defense-lock]')?.getAttribute('data-defense-lock') ?? null,
      button: document.querySelectorAll('.defense-threat button').length,
      treasury: p.shares.player ?? 0,
      investors: p.investorShares ?? 0,
    };
  });
  check('Geri alım serbest hisseden hazineye, kontrol kilitleniyor', lockAfter.state === 'locked' && lockAfter.button === 0 &&
    lockAfter.treasury > 0 && lockAfter.investors === 9_531,
    `${lockAfter.state} · hazine ${lockAfter.treasury} · yatırımcı ${lockAfter.investors} · düğme ${lockAfter.button}`);

  await page.keyboard.press('Escape');
  await page.evaluate((rivalId) => {
    const s = window.__capital.getState();
    const p = s.companies.player;
    delete p.shareCount;
    delete p.investorShares;
    delete p.lastIssueDay;
    delete p.issues;
    delete p.shares.player;
    delete s.companies[rivalId]?.shares.player;
  }, lockSetup);

  // Temizlik: sonraki bölümler kredisiz, sendikasız, piyasa ücretiyle.
  await page.evaluate(() => {
    const p = window.__capital.getState().companies.player;
    delete p.credit;
    p.debt = 0;
    p.labor = { policy: 'market', pressure: 0, agreement: 1 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  check('Banka ve işgücü konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Geç oyun giderleri ve kriz (Tur 37a) ----------
  section('Kriz ve geç oyun giderleri');
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.crisis = { defId: 'rate_shock', phase: 'warning', activeDay: s.time.day + 30, endDay: s.time.day + 150 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(300);
  const warningChip = await page.evaluate(() => {
    const chip = document.querySelector('.crisis-chip');
    return chip ? { phase: chip.getAttribute('data-crisis'), text: chip.textContent?.trim() ?? '', title: chip.getAttribute('title') ?? '' } : null;
  });
  check('Kriz bir ay önceden gündemde uyarı olarak görünüyor',
    warningChip?.phase === 'warning' && warningChip.text.includes('30') && warningChip.title.length > 20,
    warningChip ? `${warningChip.text} · ${warningChip.title.slice(0, 50)}` : 'çip yok');
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.crisis = { defId: 'deep_recession', phase: 'active', activeDay: s.time.day, endDay: s.time.day + 120 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(300);
  const activeChip = await page.evaluate(() => document.querySelector('.crisis-chip')?.getAttribute('data-crisis') ?? null);
  check('Süren kriz gündemde kriz olarak görünüyor', activeChip === 'active', String(activeChip));
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.crisis;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(300);
  const lateCosts = await page.evaluate(() => {
    const block = document.querySelector('.modal [data-late-costs]');
    return block ? [...block.querySelectorAll('.stat-label')].map((el) => el.textContent?.trim() ?? '') : null;
  });
  check('Şirket panelinde yönetim yükü ve servet vergisi görünüyor', lateCosts?.length === 2, lateCosts?.join(' · ') ?? 'blok yok');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Kriz ve gider akışı konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Karar kartı ve rakip kampanyası (Tur 37b) ----------
  section('Karar kartı ve rakip kampanyası');
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.card;
    s.card = { defId: 'inspection', offeredDay: s.time.day, deadlineDay: s.time.day + 12, amount: 100000, category: 'dining' };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(400);
  const cardView = await page.evaluate(() => {
    const el = document.querySelector('.decision-card');
    if (!el) return null;
    return {
      title: el.querySelector('.card-title')?.textContent?.trim() ?? '',
      choices: el.querySelectorAll('.card-choice').length,
      chips: el.querySelectorAll('.card-effect').length,
      odds: el.querySelector('.card-odds')?.textContent?.trim() ?? '',
      fallback: el.querySelector('.card-fallback')?.textContent?.trim() ?? '',
    };
  });
  check('Karar kartı masada açılıyor: başlık, iki seçenek, etiketli etkiler',
    cardView?.title === 'Denetim haftası' && cardView.choices === 2 && cardView.chips >= 4,
    cardView ? `${cardView.title} · ${cardView.choices} seçenek · ${cardView.chips} etiket` : 'kart yok');
  check('Şanslı seçenek ihtimali ve varsayılanı yazıyor',
    Boolean(cardView?.odds.includes('65')) && Boolean(cardView?.fallback.includes('Olduğu gibi bırak')),
    cardView ? `${cardView.odds} · ${cardView.fallback.slice(0, 60)}` : 'kart yok');

  await page.locator('.decision-card .card-later').click();
  await page.waitForTimeout(250);
  const collapsed = await page.evaluate(() => ({
    card: Boolean(document.querySelector('.decision-card')),
    chip: Boolean(document.querySelector('[data-agenda="card"] .card-chip')),
  }));
  check('"Sonra" kartı gündem çipine indiriyor', !collapsed.card && collapsed.chip, JSON.stringify(collapsed));
  // Başka bir oyun (kayıt yükleme, yeni oyun) aynı kartı aynı günde getirirse kart açık gelmeli.
  const otherGame = await page.evaluate(async () => {
    const s = window.__capital.getState();
    const own = s.meta.createdAtIso;
    s.meta.createdAtIso = '2000-01-01T00:00:00.000Z';
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const open = Boolean(document.querySelector('.decision-card'));
    s.meta.createdAtIso = own;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { open, back: Boolean(document.querySelector('.decision-card')) };
  });
  check('Küçültme yalnız o oyunun kartında geçerli', otherGame.open && !otherGame.back, JSON.stringify(otherGame));
  await page.locator('[data-agenda="card"] .card-chip').click();
  await page.waitForTimeout(250);
  check('Gündem çipi kartı yeniden açıyor', (await page.locator('.decision-card').count()) === 1);

  const cashBefore = await page.evaluate(() => window.__capital.getState().companies[window.__capital.getState().playerCompanyId].cash);
  await page.locator('.decision-card [data-card-choice="renovate"]').click();
  await page.waitForTimeout(300);
  const chosen = await page.evaluate((before) => {
    const s = window.__capital.getState();
    const player = s.companies[s.playerCompanyId];
    return {
      card: Boolean(s.card),
      open: Boolean(document.querySelector('.decision-card')),
      paid: Math.round(before - player.cash),
      boosts: player.boosts?.length ?? 0,
      news: s.news[0]?.title ?? '',
    };
  }, cashBefore);
  check('Seçim uygulanıyor: kart kalkıyor, bedel ödeniyor, etki başlıyor, haber düşüyor',
    !chosen.card && !chosen.open && chosen.paid === 60000 && chosen.boosts >= 1 && chosen.news === 'Denetim haftası',
    JSON.stringify(chosen));

  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(300);
  const boostRow = await page.evaluate(() => document.querySelector('.modal [data-card-boosts]')?.textContent?.trim() ?? '');
  check('Şirket panelinde süren kart etkisi görünüyor', boostRow.includes('Çekicilik') && boostRow.includes('Yeme-İçme'), boostRow.slice(0, 80));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Panel açıkken kart çekiliyor (pencerenin üstüne binmesin).
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.card = { defId: 'charity_drive', offeredDay: s.time.day, deadlineDay: s.time.day + 12, amount: 100000 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(300);
  const hiddenUnderPanel = (await page.locator('.decision-card').count()) === 0;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const backAfterPanel = (await page.locator('.decision-card').count()) === 1;
  check('Panel açıkken kart çekiliyor, kapanınca geri geliyor', hiddenUnderPanel && backAfterPanel,
    `panelde ${hiddenUnderPanel ? 'gizli' : 'görünür'} · sonra ${backAfterPanel ? 'açık' : 'yok'}`);
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.card;
    const rival = Object.values(s.companies).find((c) => !c.isPlayer);
    s.campaign = { companyId: rival.id, category: 'retail', startDay: s.time.day, endDay: s.time.day + 45, playerShare: 0.3 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(300);
  const campaignChip = await page.evaluate(() => document.querySelector('[data-agenda="campaign"]')?.textContent?.trim() ?? '');
  check('Rakip kampanyası gündemde geri sayıyor', campaignChip.includes('Kampanya') && /45/.test(campaignChip), campaignChip);
  await page.evaluate(() => {
    delete window.__capital.getState().campaign;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  check('Kart ve kampanya akışı konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Fırsat balonu ve görev panosu (Tur 37c) ----------
  section('Fırsat balonu ve görev panosu');
  const bubbleAt = await page.evaluate(() => {
    const cap = window.__capital;
    const s = cap.getState();
    const outlet = Object.values(s.buildings).find((b) => b.companyId === s.playerCompanyId && cap.buildingRole(b.defId) === 'outlet');
    if (!outlet) return null;
    s.bubble = { kind: 'order', tileId: outlet.tileId, offeredDay: s.time.day, untilDay: s.time.day + 5, amount: 84000 };
    const tile = s.map.tiles[outlet.tileId];
    cap.setView({ x: tile.x, z: tile.y, distance: 14 });
    cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return outlet.tileId;
  });
  await page.waitForTimeout(1500);
  const bubbleView = await page.evaluate(() => {
    const anchor = document.querySelector('.bubble-anchor');
    const button = anchor?.querySelector('.opportunity-bubble');
    if (!anchor || !button) return null;
    const r = button.getBoundingClientRect();
    return {
      text: button.textContent?.trim() ?? '',
      edge: anchor.getAttribute('data-edge'),
      inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    };
  });
  check('Fırsat balonu mağazanın çatısında, ödülü rakamla yazılı',
    bubbleAt !== null && bubbleView?.edge === 'no' && bubbleView.inside && /84/.test(bubbleView.text),
    JSON.stringify(bubbleView));

  const bubbleCash = await page.evaluate(() => window.__capital.getState().companies[window.__capital.getState().playerCompanyId].cash);
  const anchorBox = await page.evaluate(() => {
    const r = document.querySelector('.bubble-anchor')?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top } : null;
  });
  // Balon hafifçe sallanıyor: Playwright "kararlı değil" diye beklemesin.
  await page.locator('.opportunity-bubble').click({ force: true });
  await page.waitForTimeout(120);
  const caught = await page.evaluate((before) => {
    const s = window.__capital.getState();
    const burst = document.querySelector('.bubble-burst')?.getBoundingClientRect();
    return {
      gone: !s.bubble && !document.querySelector('.opportunity-bubble'),
      gained: Math.round(s.companies[s.playerCompanyId].cash - before),
      caught: s.bubblesCaught ?? 0,
      burst: burst ? { x: burst.left + burst.width / 2, y: burst.top } : null,
      toast: [...document.querySelectorAll('.toast')].map((el) => el.textContent ?? '').join(' | '),
    };
  }, bubbleCash);
  check('Dokununca ödül kasada, balon kalkıyor, tost çıkıyor',
    caught.gone && caught.gained === 84000 && caught.caught >= 1 && caught.toast.includes('Toplu sipariş'),
    JSON.stringify({ ...caught, burst: undefined }));
  check('Ödül balonun yerinden süzülüyor',
    Boolean(caught.burst && anchorBox && Math.abs(caught.burst.x - anchorBox.x) < 40 && Math.abs(caught.burst.y - anchorBox.y) < 120),
    JSON.stringify({ burst: caught.burst, anchor: anchorBox }));

  // Bina ekran dışında: balon kenara yapışıyor ama ekranın içinde kalıyor.
  await page.evaluate(() => {
    const cap = window.__capital;
    const s = cap.getState();
    const outlet = Object.values(s.buildings).find((b) => b.companyId === s.playerCompanyId && cap.buildingRole(b.defId) === 'outlet');
    s.bubble = { kind: 'vip', tileId: outlet.tileId, offeredDay: s.time.day, untilDay: s.time.day + 5, amount: 50000 };
    const tile = s.map.tiles[outlet.tileId];
    cap.setView({ x: tile.x > s.map.width / 2 ? 1 : s.map.width - 2, z: tile.y > s.map.height / 2 ? 1 : s.map.height - 2, distance: 8 });
    cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(1500);
  const edged = await page.evaluate(() => {
    const anchor = document.querySelector('.bubble-anchor');
    const r = anchor?.querySelector('.opportunity-bubble')?.getBoundingClientRect();
    return r ? { edge: anchor.getAttribute('data-edge'), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight } : null;
  });
  check('Ekran dışındaki balon kenara yapışıyor, taşmıyor', edged?.edge === 'yes' && edged.inside, JSON.stringify(edged));

  // Bina, açık bina penceresinin (sağ panel) arkasında: balon panelin üstüne
  // binmiyor, kenarına yapışıyor. Kamerayı binayı panelin ortasına düşürecek
  // kadar kaydır (groundAt: o ekran noktasının altındaki zemin).
  {
    const behind = await page.evaluate(async () => {
      const cap = window.__capital;
      const s = cap.getState();
      const outlet = Object.values(s.buildings).find((b) => b.companyId === s.playerCompanyId && cap.buildingRole(b.defId) === 'outlet');
      const tile = s.map.tiles[outlet.tileId];
      s.bubble = { kind: 'vip', tileId: outlet.tileId, offeredDay: s.time.day, untilDay: s.time.day + 5, amount: 50000 };
      cap.selectTile(outlet.tileId);
      cap.setView({ x: tile.x, z: tile.y, distance: 14 });
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const panel = document.querySelector('.inspector')?.getBoundingClientRect();
      if (!panel) return null;
      const cx = panel.left + panel.width / 2;
      const cy = panel.top + panel.height / 2;
      const ground = cap.groundAt((cx / innerWidth) * 2 - 1, -((cy / innerHeight) * 2 - 1));
      const target = cap.cameraTarget();
      if (!ground || !target) return null;
      cap.setView({ x: target.x - (ground.x - (tile.x + 0.5)), z: target.z - (ground.z - (tile.y + 0.5)), distance: 14 });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const anchor = document.querySelector('.bubble-anchor');
      const r = anchor?.querySelector('.opportunity-bubble')?.getBoundingClientRect();
      const p = document.querySelector('.inspector')?.getBoundingClientRect();
      if (!r || !p) return null;
      return { edge: anchor.getAttribute('data-edge'), right: Math.round(r.right), panelLeft: Math.round(p.left), overlaps: r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom };
    });
    check('Bina penceresinin arkasındaki binanın balonu pencereye binmiyor, kenarında duruyor',
      behind !== null && behind.edge === 'yes' && !behind.overlaps && behind.panelLeft - behind.right < 40,
      JSON.stringify(behind));
    await page.evaluate(() => window.__capital.selectTile(null));
    await page.waitForTimeout(200);
  }
  await page.locator('.topbar-actions [data-panel="company"]').click();
  await page.waitForTimeout(300);
  check('Pencere açıkken balon gizli', (await page.locator('.opportunity-bubble').count()) === 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const cap = window.__capital;
    const s = cap.getState();
    delete s.bubble;
    // Panoda biri tamamlanmış (ödül bekliyor), biri yolda.
    s.quests = {
      startDay: s.time.day,
      endDay: s.time.day + 20,
      items: [
        { defId: 'producer', base: 0, target: 1, reward: 64000, doneDay: s.time.day },
        { defId: 'parcels', base: 0, target: 2, reward: 30000 },
      ],
    };
    cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(300);
  const questChip = await page.evaluate(() => document.querySelector('[data-agenda="quests"]')?.textContent?.trim() ?? '');
  check('Gündemde görev ödülü hazır', questChip.includes('Ödül hazır') && /20/.test(questChip), questChip);
  await page.locator('[data-agenda="quests"] button').click();
  await page.waitForTimeout(400);
  const board = await page.evaluate(() => ({
    rows: document.querySelectorAll('.modal .quest').length,
    claim: Boolean(document.querySelector('.modal [data-quest-claim="0"]')),
    text: document.querySelector('.modal .quest-board')?.textContent ?? '',
  }));
  check('Görev panosu açılıyor: satırlar, ödül ve "Ödülü al"',
    board.rows === 2 && board.claim && board.text.includes('64 B') && board.text.includes('Bir üretim tesisi kur'),
    `${board.rows} satır · ${board.claim ? 'düğme var' : 'düğme yok'}`);
  const questCash = await page.evaluate(() => window.__capital.getState().companies[window.__capital.getState().playerCompanyId].cash);
  await page.locator('.modal [data-quest-claim="0"]').click();
  await page.waitForTimeout(300);
  const claimed = await page.evaluate((before) => {
    const s = window.__capital.getState();
    return {
      gained: Math.round(s.companies[s.playerCompanyId].cash - before),
      done: Boolean(document.querySelector('.modal .quest.quest-done[data-quest="producer"]')),
      button: Boolean(document.querySelector('.modal [data-quest-claim="0"]')),
    };
  }, questCash);
  check('Ödül alınıyor: kasaya giriyor, satır tamam, düğme kalkıyor',
    claimed.gained === 64000 && claimed.done && !claimed.button, JSON.stringify(claimed));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Balon ve görev akışı konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Canlı pazar (Tur 37d) ----------
  section('Canlı pazar');
  await page.locator('.topbar-actions [data-panel="rivalry"]').click();
  await page.waitForTimeout(400);
  const pulse = await page.evaluate(() => {
    const box = document.querySelector('.modal [data-market-pulse]');
    if (!box) return null;
    return {
      rows: box.querySelectorAll('[data-pulse]').length,
      season: box.querySelector('.pulse-season')?.textContent?.trim() ?? '',
      trends: [...box.querySelectorAll('.pulse-trend')].map((el) => el.textContent?.trim() ?? ''),
    };
  });
  check('Rekabet panelinde pazar nabzı: beş kategori, mevsim ve eğilim yönü',
    pulse?.rows === 5 && pulse.season.startsWith('Mevsim') && pulse.trends.every((text) => /[↗↘→]/.test(text) && /gün/.test(text)),
    pulse ? `${pulse.rows} kategori · ${pulse.season} · ${pulse.trends[0]}` : 'nabız yok');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Canlı pazar konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Şehir projesi (Tur 37d) ----------
  section('Şehir projesi');
  // Takvimi beklemeden bir proje aç (oyundaki gibi bir park ya da meydanda),
  // bir rakip 300 B ₺ ile önde başlasın. Test arayüzü ölçüyor.
  const projectSetup = await page.evaluate(() => {
    const c = window.__capital;
    const s = c.getState();
    const tile = s.map.tiles.find((t) => t.kind === 'civic' && (t.structureId === 'park' || t.structureId === 'plaza') && s.districts[t.districtId]?.opensOnDay === undefined);
    const rival = Object.values(s.companies).find((company) => !company.isPlayer);
    if (!tile || !rival) return null;
    s.project = {
      defId: 'metro', districtId: tile.districtId, tileId: tile.id,
      openedDay: s.time.day, closesDay: s.time.day + 90, doneDay: s.time.day + 130,
      phase: 'funding', contributions: { [rival.id]: 300_000 }, previousStructureId: tile.structureId,
    };
    s.companies[s.playerCompanyId].cash = Math.max(s.companies[s.playerCompanyId].cash, 5_000_000);
    c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return { tileId: tile.id };
  });
  await page.waitForTimeout(400);
  const projectChip = page.locator('[data-agenda="project"] .project-chip');
  check('Gündemde proje çipi: ad ve geri sayım', projectSetup !== null && (await projectChip.count()) === 1
    && /Metro Hattı/.test((await projectChip.textContent()) ?? ''), (await projectChip.textContent().catch(() => '')) ?? 'çip yok');
  await projectChip.click();
  await page.waitForTimeout(400);
  const projectView = await page.evaluate(() => {
    const card = document.querySelector('.modal .project-card');
    if (!card) return null;
    return {
      phase: card.getAttribute('data-phase'),
      rows: card.querySelectorAll('[data-project-row]').length,
      gives: [...card.querySelectorAll('[data-project-give]')].map((el) => Number(el.getAttribute('data-project-give'))),
      effects: card.querySelectorAll('.project-effects .pulse-chip').length,
      cash: window.__capital.getState().companies[window.__capital.getState().playerCompanyId].cash,
    };
  });
  check('Proje paneli: katkı tablosu, etkiler ve katkı düğmeleri',
    projectView?.phase === 'funding' && projectView.rows === 1 && projectView.effects >= 3 && projectView.gives.length >= 2 && projectView.gives[0] === 301_000,
    JSON.stringify(projectView));
  await page.locator('.modal [data-project-give]').first().click();
  await page.waitForTimeout(400);
  const afterGive = await page.evaluate(() => {
    const s = window.__capital.getState();
    const first = document.querySelector('.modal [data-project-row]');
    return {
      top: first?.getAttribute('data-project-row') ?? '',
      given: s.project?.contributions[s.playerCompanyId] ?? 0,
      cash: s.companies[s.playerCompanyId].cash,
      chip: document.querySelector('[data-agenda="project"] .project-chip')?.textContent ?? '',
    };
  });
  check('"Öne geç" katkıyı kasadan düşüyor; oyuncu tablonun başında, çip sırayı yazıyor',
    afterGive.top === 'player' && afterGive.given === 301_000 && projectView !== null && afterGive.cash === projectView.cash - 301_000 && /1\./.test(afterGive.chip),
    JSON.stringify(afterGive));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate((tileId) => window.__capital.selectTile(tileId), projectSetup?.tileId ?? null);
  await page.waitForTimeout(400);
  const siteNote = await page.locator('[data-project-site]').textContent().catch(() => null);
  check('Proje sahasının penceresinde şehir projesi notu', Boolean(siteNote?.includes('Metro Hattı')), siteNote ?? 'not yok');
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.project;
    window.__capital.selectTile(null);
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(200);
  check('Şehir projesi konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  // ---------- Rakip konsorsiyumu (Tur 37d-3) ----------
  section('Rakip konsorsiyumu');
  // Kurulmuş bir konsorsiyum: savunma penceresinde 30 gün. Test arayüzü ölçüyor.
  await page.evaluate(() => {
    const c = window.__capital;
    const s = c.getState();
    const members = Object.values(s.companies).filter((company) => !company.isPlayer).sort((a, b) => b.netWorth - a.netWorth).slice(0, 2);
    s.consortium = {
      leaderId: members[0].id, memberIds: members.map((m) => m.id), names: members.map((m) => m.name),
      formedDay: s.time.day, startsDay: s.time.day + 30, baseShares: 0,
    };
    c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(400);
  const consortiumChip = page.locator('[data-agenda="consortium"] .consortium-chip');
  const warningText = (await consortiumChip.textContent().catch(() => '')) ?? '';
  check('Gündemde konsorsiyum çipi: önder, ortak sayısı ve alıma kalan gün',
    (await consortiumChip.count()) === 1 && /Konsorsiyum/.test(warningText) && /30g/.test(warningText), warningText || 'çip yok');
  await consortiumChip.click();
  await page.waitForTimeout(400);
  check('Konsorsiyum çipi borsa panelini açıyor', (await page.locator('.modal').count()) === 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const c = window.__capital;
    const s = c.getState();
    const leader = s.companies[s.consortium.leaderId];
    s.consortium.startsDay = s.time.day;
    leader.shares[s.playerCompanyId] = Math.round((s.companies[s.playerCompanyId].shareCount ?? 10000) * 0.18);
    c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(300);
  const buyingText = (await page.locator('[data-agenda="consortium"] .consortium-chip').textContent().catch(() => '')) ?? '';
  check('Alım başlayınca çip konsorsiyumun payını yazıyor; tek baskıncı çipi tekrarlanmıyor',
    /%18/.test(buyingText) && (await page.locator('[data-agenda="raid"]').count()) === 0, buyingText || 'çip yok');
  await page.evaluate(() => {
    const s = window.__capital.getState();
    delete s.companies[s.consortium.leaderId].shares[s.playerCompanyId];
    delete s.consortium;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(200);
  check('Konsorsiyum konsolu kirletmiyor', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  if (SMOKE) {
    await finish(browser, consoleErrors);
    return;
  }

  section('Zincir kartı');

  // Oyuncuya zinciri kurabilecek sermaye ver; test parayı değil arayüzü ölçüyor.
  //
  // Pazarın krizi de nötrleniyor (Tur 32): sektör olayı (Tur 27) hammaddeyi
  // pahalandırınca ara mal ünitesi zarar ediyor ve kart hamle yerine sebebini
  // yazıyor — doğru davranış (birim testi `chain.test.ts`), ama hangi gün hangi
  // olayın düştüğü kare zamanlamasına bağlı. main'deki tam koşuda bir kez
  // böyle düştü; yerelde hiç. Test o günün pazarını değil kartın arayüzünü
  // ölçüyor.
  await page.evaluate(() => {
    const c = window.__capital;
    const s = c.getState();
    const p = s.companies[s.playerCompanyId];
    p.cash = 50_000_000;
    p.netWorth = 50_000_000;
    s.activeEvents = [];
    for (const goodId of Object.keys(s.market.spot)) {
      const base = c.basePrice(goodId);
      if (base !== null && s.market.spot[goodId] > base) s.market.spot[goodId] = base;
    }
    c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });

  await page.locator('.topbar-actions [data-panel="chain"]').click();
  await page.waitForTimeout(400);
  check('Zincir paneli açılıyor', (await page.locator('.modal').count()) === 1);

  const cardCount = await page.locator('.chain').count();
  check('Satılan ürün için zincir kartı çıkıyor', cardCount >= 1, `${cardCount} kart`);

  const slots = await page.locator('.chain').first().locator('.chain-slot').count();
  check('Kartta dört yuva var', slots === 4, `${slots} yuva`);

  // ZİNCİR YUVALARI DAR EKRANDA KESİLMEMELİ.
  //
  // Yatay şerittiler ve aritmetik tutmuyordu: 4 yuva × en az 118 px + 3 ×
  // 6 px boşluk = 490 px, telefonda modal gövdesi 388 px. `overflow-x:
  // auto` bunu taşırmıyor ama GİZLİYOR — sağdaki iki halka kesiliyor ve
  // kaydırılabildiğine dair hiçbir işaret yok.
  //
  // Kontrol burada, çünkü zincir kartı ancak gerçekten ürün satan bir
  // oyuncuda doğuyor; mobil bölümde sıfırdan o duruma gelmek pahalı.
  // Aynı sayfayı daraltmak hem ucuz hem gerçek.
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(500);
  const chainNarrow = await page.evaluate(() => {
    const strip = document.querySelector('.chain-slots');
    if (!strip) return null;
    const r = strip.getBoundingClientRect();
    return {
      hidden: Math.round(strip.scrollWidth - strip.clientWidth),
      overflowsRight: Math.round(Math.max(0, r.right - innerWidth)),
      slots: strip.querySelectorAll('.chain-slot').length,
    };
  });
  check(
    'Dar ekranda zincir yuvaları kesilmiyor',
    Boolean(chainNarrow && chainNarrow.hidden <= 2 && chainNarrow.overflowsRight === 0),
    chainNarrow
      ? `${chainNarrow.slots} yuva · gizli ${chainNarrow.hidden}px · taşan ${chainNarrow.overflowsRight}px`
      : 'şerit yok',
  );

  // Aynı daraltmada bütün panellerde gizli yatay kaydırıcı var mı?
  const hiddenScrollers = [];
  for (const panel of ['chain', 'rivalry', 'bourse', 'company', 'rivals', 'saves', 'help']) {
    await page.evaluate(() => document.querySelector('.modal-head button.icon')?.click());
    await page.waitForTimeout(150);
    await page.locator(`.topbar-actions [data-panel="${panel}"]`).click();
    await page.waitForTimeout(250);
    const found = await page.evaluate(() => {
      const body = document.querySelector('.modal-body');
      if (!body) return [];
      const out = [];
      for (const el of body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (el.scrollWidth - el.clientWidth > 2) {
          out.push(`${String(el.className).split(' ')[0] || el.tagName.toLowerCase()}`);
        }
      }
      return out;
    });
    if (found.length) hiddenScrollers.push(`${panel}: ${found[0]}`);
  }
  check(
    'Hiçbir panelde gizli yatay kaydırıcı yok',
    hiddenScrollers.length === 0,
    hiddenScrollers.join(', ') || '7 panel temiz',
  );
  await page.evaluate(() => document.querySelector('.modal-head button.icon')?.click());
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(500);
  await page.locator('.topbar-actions [data-panel="chain"]').click();
  await page.waitForTimeout(400);

  const stateLabels = await page.locator('.chain').first().locator('.chain-state').allTextContents();
  check(
    'Her yuvada metin etiketi var (renk tek başına anlam taşımıyor)',
    stateLabels.length === 4 && stateLabels.every((t) => t.trim().length > 0),
    stateLabels.join(' · '),
  );

  const moveButton = page.locator('.chain').first().locator('.chain-action button');
  const hasMove = (await moveButton.count()) === 1;
  check('Kart tek bir hamle öneriyor', hasMove, hasMove ? await moveButton.textContent() : 'öneri yok');

  if (hasMove) {
    const before = await page.evaluate(() => {
      const s = window.__capital.getState();
      return Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId).length;
    });
    await moveButton.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const s = window.__capital.getState();
      const own = Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId);
      return {
        count: own.length,
        zoned: own.some((b) => ['coffee_roastery', 'flour_mill', 'textile_mill', 'chip_fab',
          'coffee_estate', 'wheat_farm', 'cotton_farm', 'silicon_mine'].includes(b.defId)),
        districts: own.map((b) => s.districts[b.districtId].archetype),
      };
    });
    check('Hamle butonu parseli alıp üniteyi kuruyor', after.count === before + 1,
      `${before} → ${after.count} bina`);
    check('Kurulan ünite bir üretim ünitesi', after.zoned);
    check('Üretim ünitesi imarlı bölgeye kuruldu',
      after.districts.some((a) => a === 'industrial' || a === 'port'), after.districts.join(', '));
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---------- Zincir kamyonları ----------
  // Zincir görünür olmadan anlaşılmıyor. Burada bakılan şey kamyonların
  // GERÇEKTEN kurulan zincire bağlı olması: tesis yoksa kamyon yok, tesis
  // kurulunca yola çıkıyor, ve yerinde durmuyorlar.
  section('Zincir kamyonları');

  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));
  await page.waitForTimeout(600);

  const fleet = await page.evaluate(() => ({
    trucks: window.__capital.renderInfo().truckCount,
    legs: window.__capital.routeCount(),
  }));
  check('Kurulan zincir için kamyon yola çıkıyor', fleet.trucks > 0,
    `${fleet.trucks} kamyon / ${fleet.legs} bacak`);
  check('Kamyon sayısı bacak sayısını aşmıyor', fleet.trucks <= fleet.legs * 3,
    `${fleet.trucks} kamyon / ${fleet.legs} bacak`);

  const moved = await page.evaluate(async () => {
    const a = window.__capital.renderInfo().truckPositionSum;
    await new Promise((r) => setTimeout(r, 900));
    return { a, b: window.__capital.renderInfo().truckPositionSum };
  });
  check('Kamyonlar rotada ilerliyor', Math.abs(moved.b - moved.a) > 0.05,
    `ilerleme ${(moved.b - moved.a).toFixed(2)}`);

  // Kamyon BİLGİ taşıyor, manzara değil: lensin altında da görünmeye
  // devam ediyor. Fon araçları ise susuyor.
  const trucksUnderLens = await readAfterLens('opportunity');
  check('Veri lensinde fon araçları susuyor', trucksUnderLens.carsVisible === false);
  check('Veri lensinde kamyonlar kalıyor', trucksUnderLens.truckCount > 0,
    `${trucksUnderLens.truckCount} kamyon`);
  await page.screenshot({ path: `${OUT}/trucks-lens.png` });

  const backToCity = await readAfterLens('none');
  check('Şehir görünümünde fon araçları geri geliyor', backToCity.carsVisible === true);
  await page.screenshot({ path: `${OUT}/trucks-city.png` });

  // Rota listesi değişmediği sürece kamyonlar kurulmamalı — yoksa her gün
  // başa ışınlanırlar ve akış yerine titreşim görürsün.
  const stable = await page.evaluate(async () => {
    const before = window.__capital.routeSignature();
    window.__capital.engine.runDay();
    window.__capital.engine.runDay();
    await new Promise((r) => setTimeout(r, 300));
    return { before, after: window.__capital.routeSignature() };
  });
  check('Bina değişmedikçe rota imzası sabit', stable.before === stable.after,
    `${stable.after.split('|').length} bacak`);

  // ---------- Müşteri akışı ----------
  //
  // Şehrin bugüne kadarki tek canlı katmanı oyuncunun KENDİ kamyonlarıydı:
  // senden dışarı akan bir şey. Müşteri akışı ters yönü ekliyor — dün kaç
  // birim sattığın mağazanın kapısına gelen araç sayısına dönüşüyor.
  //
  // Burada sınanan şey akışın gerçekten SATIŞA bağlı olması. Sokakta
  // rastgele araç yürütmek kolay; anlamlı olan, araç sayısının pazar payını
  // izlemesi — yoksa dekordan farkı kalmaz.
  section('Müşteri akışı');

  // Akışın o anki fotoğrafı: hangi şirket kaç birim satıyor, sokakta kaç aracı var.
  const sampleFlow = () => page.evaluate(() => {
    const state = window.__capital.getState();
    const info = window.__capital.renderInfo();
    const flows = window.__capital.customerFlows();

    const colorOf = {};
    for (const c of Object.values(state.companies)) {
      colorOf[(c.isPlayer ? '#3fd39a' : c.color).toLowerCase()] = c.id;
    }
    const carsBy = {};
    for (const hex of info.shopperColors) {
      const id = colorOf[hex.toLowerCase()] ?? hex;
      carsBy[id] = (carsBy[id] ?? 0) + 1;
    }
    const unitsBy = {};
    for (const f of flows) unitsBy[f.companyId] = (unitsBy[f.companyId] ?? 0) + f.units;

    const rank = (obj) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

    const unitLeader = rank(unitsBy)[0];
    const carLeader = rank(carsBy)[0];
    return {
      shoppers: info.shopperCount,
      stores: flows.length,
      playerId: state.playerCompanyId,
      playerUnits: unitsBy[state.playerCompanyId] ?? 0,
      playerCars: carsBy[state.playerCompanyId] ?? 0,
      unitLeader,
      carLeader,
      unitLeaderCars: carsBy[unitLeader] ?? 0,
      carLeaderCars: carsBy[carLeader] ?? 0,
      companies: Object.keys(carsBy).length,
    };
  });
  const runBriefly = async (ms) => {
    await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 2 }));
    await page.waitForTimeout(ms);
    await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await page.waitForTimeout(400);
  };

  await runBriefly(1400);
  const flow = await sampleFlow();

  check('Satan mağaza için müşteri yola çıkıyor', flow.shoppers > 0,
    `${flow.shoppers} araç / ${flow.stores} mağaza`);
  check(
    'Oyuncunun mağazasına kendi renginde müşteri geliyor',
    flow.playerUnits > 0 ? flow.playerCars > 0 : true,
    `oyuncu ${flow.playerUnits.toFixed(0)} birim → ${flow.playerCars} araç`,
  );
  // Asıl kontrol bu: en çok satan şirketin kapısı en kalabalık olmalı.
  // Bu tutmazsa akış "canlı görünen ama yalan söyleyen" bir süse dönüşür.
  //
  // ±1 araç toleransı bilinçli: araçlar önce şirketlere en büyük kalan
  // yöntemiyle paylaştırılıyor, yani şirket toplamı satışa ±1 araç sadık.
  //
  // Beş anın HEPSİ (Tur 34 sonrası). Önceden "beş anın çoğunluğu"ydu, çünkü
  // dağıtım doğrudan mağazalara yapılıyordu ve şirket toplamı kayabiliyordu.
  // Main'de 1/5 an geçti: birimde lider 17 araç, rakip 19. Ölçünce görüldü
  // ki bu bir kuanta talihsizliği değil, yöntemin kendisiydi: 8 tohum ×
  // 210 günde anların %16,8'i yalandı, en kötüsü 14 araç fark. Şimdiki
  // dağıtımda (render-three/src/shopper-allocation.ts) aynı ölçümde %0.
  // Artık her an tutmalı; bir an bile tutmazsa gerçek bir hata.
  const flowSamples = [flow];
  for (let i = 0; i < 4; i++) {
    await runBriefly(700);
    flowSamples.push(await sampleFlow());
  }
  const honest = flowSamples.filter((f) => f.unitLeader === f.carLeader || f.unitLeaderCars >= f.carLeaderCars - 1);
  const worst = flowSamples.find((f) => !honest.includes(f)) ?? flow;
  check(
    'En çok satanın kapısı en kalabalık (±1 araç, 5 anın hepsi)',
    honest.length === flowSamples.length,
    `${honest.length}/5 an · en kötüsü: birimde ${worst.unitLeader} (${worst.unitLeaderCars} araç), araçta ${worst.carLeader} (${worst.carLeaderCars} araç)`,
  );
  check('Akış birden fazla şirketi gösteriyor', flow.companies >= 2,
    `${flow.companies} şirket sokakta`);

  const shopperMoved = await page.evaluate(async () => {
    const a = window.__capital.renderInfo().shopperPositionSum;
    await new Promise((r) => setTimeout(r, 900));
    return { a, b: window.__capital.renderInfo().shopperPositionSum };
  });
  check('Müşteriler yolda ilerliyor', Math.abs(shopperMoved.b - shopperMoved.a) > 0.05,
    `ilerleme ${(shopperMoved.b - shopperMoved.a).toFixed(2)}`);

  // Müşteri de kamyon gibi BİLGİ: veri lensinin altında susmamalı.
  const shoppersUnderLens = await readAfterLens('opportunity');
  check('Veri lensinde müşteriler kalıyor', shoppersUnderLens.shopperCount > 0,
    `${shoppersUnderLens.shopperCount} araç`);
  await readAfterLens('none');

  // Dağıtım değişmedikçe filo yeniden kurulmamalı: araçların hepsi aynı
  // anda başa ışınlanırsa akış yerine titreşim görülür.
  const fleetStable = await page.evaluate(async () => {
    const before = window.__capital.renderInfo().shopperPositionSum;
    await new Promise((r) => setTimeout(r, 250));
    const mid = window.__capital.renderInfo().shopperCount;
    return { before, mid };
  });
  check('Filo satış oynamasıyla sıfırlanmıyor', fleetStable.mid === flow.shoppers,
    `${fleetStable.mid} araç`);

  // ---------- Geçilme anı ve genel merkez ----------
  //
  // Sıralama bugüne kadar üst barda "4." diye duran bir sayıydı; rakip
  // seni geçtiğinde hiçbir şey olmuyordu. Burada sınanan şey o anın bir
  // OLAY hâline gelmesi — ve olayın kimin geçtiğini söylemesi.
  section('Geçilme anı ve genel merkez');

  const overtake = await page.evaluate(async () => {
    const cap = window.__capital;
    const s = cap.getState();
    const rival = Object.values(s.companies).find((c) => !c.isPlayer);

    // Önce oyuncuyu tepeye çıkar ve sıranın oturmasını bekle.
    s.companies[s.playerCompanyId].cash = 90_000_000;
    cap.engine.runDay();
    // Yeni haberler KİMLİKTEN ayrılıyor, uzunluktan değil: akış 60 kalemle
    // sınırlı ve doluyken uzunluk değişmiyor (Tur 19'da yeni sistemlerin
    // haberleriyle akış bu noktada dolmaya başladı ve kontrol kör kaldı).
    const before = Math.max(0, ...cap.getState().news.map((n) => n.id));

    // Sonra rakibi oyuncunun üstüne çıkar.
    cap.getState().companies[rival.id].cash = 400_000_000;
    cap.engine.runDay();
    const after = cap.getState();
    const fresh = after.news.filter((n) => n.id > before);
    const hit = fresh.find((n) => n.title.includes('seni geçti'));

    return {
      haber: hit ? { tone: hit.tone, title: hit.title, yuz: hit.companyId ?? null } : null,
      rakip: rival.id,
    };
  });
  check(
    'Rakip geçince olay düşüyor',
    Boolean(overtake.haber) && overtake.haber.tone === 'bad',
    overtake.haber ? overtake.haber.title : 'haber yok',
  );
  check(
    'Geçilme olayı kimin geçtiğini söylüyor',
    overtake.haber?.yuz === overtake.rakip,
    `yüz: ${overtake.haber?.yuz ?? 'yok'}`,
  );

  // Geri almanın da bir karşılığı olmalı: yalnızca kötü haberi vermek
  // oyuncuyu cezalandırırdı.
  const reclaim = await page.evaluate(async () => {
    const cap = window.__capital;
    const before = Math.max(0, ...cap.getState().news.map((n) => n.id));
    cap.getState().companies[cap.getState().playerCompanyId].cash = 900_000_000;
    cap.engine.runDay();
    const after = cap.getState();
    const fresh = after.news.filter((n) => n.id > before);
    // Başlık ekten bağımsız (Tur 37b): "{rakip} artık arkanda".
    const hit = fresh.find((n) => n.title.includes('arkanda'));
    return hit ? { tone: hit.tone, title: hit.title } : null;
  });
  check('Sırayı geri alınca da olay düşüyor', reclaim?.tone === 'good',
    reclaim ? reclaim.title : 'haber yok');

  /*
   * ARAYÜZÜN HABERİ OLMASI İÇİN BİR UYARI GEREKİYOR.
   *
   * İlk yazdığım kontrol doğrudan portre sayıyordu ve "0 portre" dedi —
   * oysa state'te haber vardı ve yüzü de vardı. Sebep motorda: `runDay()`
   * dinleyicileri UYARMIYOR, yalnızca `tick()` uyarıyor. Yani testin
   * elle çevirdiği günler ekrana hiç yansımıyordu; React eski listeyi
   * çiziyordu.
   *
   * Gerçek oyunda günler `tick()` ile geçtiği için bu bir ürün hatası
   * değil. Ama kontrol, oyuncunun GÖRDÜĞÜ şeyi sınamalı: bu yüzden önce
   * bir uyarı tetikleniyor (hızı yeniden atamak yeterli), sonra da
   * haberin DOM'a düşmesi bekleniyor.
   */
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  const faceShown = await page
    .waitForFunction(() => document.querySelectorAll('.news-portrait').length > 0, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(
    'Rakip haberinde yüz görünüyor',
    faceShown,
    `${await page.locator('.news-portrait').count()} portre`,
  );

  // GENEL MERKEZ: en eski bina. Saklanmıyor, türetiliyor.
  const hq = await page.evaluate(async () => {
    const cap = window.__capital;
    const s = cap.getState();
    s.companies[s.playerCompanyId].cash = 90_000_000;
    const bos = s.map.tiles
      .filter((t) => t.kind === 'plot' && !t.buildingId && !t.structureId)
      .slice(0, 2);
    for (const tile of bos) {
      cap.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
      cap.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
      cap.engine.runDay();
    }
    await new Promise((r) => setTimeout(r, 900));

    const after = cap.getState();
    const mine = Object.values(after.buildings).filter((b) => b.companyId === after.playerCompanyId);
    const eldest = mine.slice().sort((a, b) => a.builtDay - b.builtDay || (a.id < b.id ? -1 : 1))[0];
    const tile = after.map.tiles[eldest.tileId];
    const info = cap.renderInfo();
    return {
      binalar: mine.length,
      gorunur: info.hqVisible,
      konum: info.hqPosition,
      beklenen: { x: tile.x, z: tile.y },
    };
  });
  check('Genel merkez işareti haritada', hq.gorunur === true, `${hq.binalar} bina`);
  check(
    'İşaret EN ESKİ binanın üstünde',
    hq.konum !== null &&
      Math.abs(hq.konum.x - hq.beklenen.x) < 0.01 &&
      Math.abs(hq.konum.z - hq.beklenen.z) < 0.01,
    hq.konum ? `(${hq.konum.x}, ${hq.konum.z}) beklenen (${hq.beklenen.x}, ${hq.beklenen.z})` : 'konum yok',
  );
  // İşaret binanın TEPESİNDE olmalı, zemininde değil.
  check('İşaret binanın tepesinde', (hq.konum?.y ?? 0) > 0.3, `y = ${(hq.konum?.y ?? 0).toFixed(2)}`);

  // ---------- Rekabet kartı ----------
  // Kollar A parçasında motorda çalışıyordu ama oyuncunun göreceği bir
  // yüzü yoktu. Burada bakılan şey kartın DOĞRU şeyi söyleyip söylemediği
  // ve hamlenin gerçekten çalışması.
  // Yukarıdaki sondaj oyuncuya 900M ₺ nakit verdi: bu gerçek bir zafer
  // koşulu. Ekran inmeli ve "devam" ile serbest oyuna dönülebilmeli —
  // yoksa sonraki her tıklama zafer kartına çarpar.
  // Zafer ekranı havai fişeklerden ~2,4 sn sonra iniyor (Tur 63).
  const organicVictory = await page
    .waitForFunction(() => document.querySelector('.gameover.victory') !== null, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('Hedef değeri aşan bir numara için zafer ilan ediliyor', organicVictory,
    organicVictory ? 'zafer ekranı indi' : 'ekran yok');
  if (organicVictory) {
    await page.locator('.gameover.victory button:has-text("Serbest oyuna devam")').click();
    await page.waitForTimeout(200);
  }

  section('Rekabet kartı');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies[s.playerCompanyId];
    p.cash = 50_000_000;
    p.netWorth = 50_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });

  await page.locator('.topbar-actions [data-panel="rivalry"]').click();
  await page.waitForTimeout(400);
  check('Rekabet paneli açılıyor', (await page.locator('.modal').count()) === 1);

  const rivalCards = await page.locator('.rival-card').count();
  check('Sattığın kategori için rekabet kartı çıkıyor', rivalCards >= 1, `${rivalCards} kart`);

  const channelText = await page.locator('.rival-channel').first().textContent();
  check('Kart hangi kanaldan kazandığını söylüyor',
    /dolu/.test(channelText || ''), (channelText || '').slice(0, 70));

  const armCount = await page.locator('.rival-card').first().locator('.rival-arm').count();
  check('Kartta iki kol var', armCount === 2, `${armCount} kol`);

  const rows = await page.locator('.rival-card').first().locator('.rival-table tbody tr').count();
  check('Sen/rakip tablosu dört satır', rows === 4, `${rows} satır`);

  const armMove = page.locator('.rival-card').first().locator('.chain-action button');
  const hasArmMove = (await armMove.count()) === 1;
  check('Kart tek bir kol hamlesi öneriyor', hasArmMove,
    hasArmMove ? await armMove.textContent() : 'öneri yok');

  if (hasArmMove) {
    const before = await page.evaluate(() => {
      const s = window.__capital.getState();
      return Object.values(s.buildings).filter(
        (b) => b.companyId === s.playerCompanyId && b.focus !== null,
      ).length;
    });
    await armMove.click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const s = window.__capital.getState();
      const armed = Object.values(s.buildings).filter(
        (b) => b.companyId === s.playerCompanyId && b.focus !== null,
      );
      return { count: armed.length, focuses: armed.map((b) => b.focus) };
    });
    check('Hamle kol binasını kuruyor ve bir kategoriye atıyor',
      after.count === before + 1, `${before} → ${after.count} · odak ${after.focuses.join(', ')}`);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ---------- Odak düzenleyici ----------
  section('Odak düzenleyici');

  const focusTile = await page.evaluate(() => {
    const s = window.__capital.getState();
    for (const b of Object.values(s.buildings)) {
      if (b.companyId !== s.playerCompanyId) continue;
      if (b.focus === null) continue;
      return b.tileId;
    }
    return null;
  });
  check('Kol binası bulundu', focusTile !== null);

  if (focusTile !== null) {
    await page.evaluate((id) => window.__capital.selectTile(id), focusTile);
    await page.waitForTimeout(400);

    const chips = page.locator('.shelf-chip');
    const chipCount = await chips.count();
    check('Odak düzenleyici çıkıyor', chipCount >= 4, `${chipCount} kategori`);

    const counts = await page.locator('.shelf-share').allTextContents();
    check('Her kategorinin yanında mağaza sayısı yazıyor',
      counts.length >= 4 && counts.every((t) => /\d+ mağaza/.test(t)), counts.join(' · '));

    const before = await page.evaluate((id) => {
      const s = window.__capital.getState();
      return s.buildings[s.map.tiles[id].buildingId].focus;
    }, focusTile);

    // Seçili olmayan ilk kategoriye tıkla.
    const offIndex = (await chips.nth(0).getAttribute('aria-pressed')) === 'true' ? 1 : 0;
    await chips.nth(offIndex).click();
    await page.waitForTimeout(400);
    const moved = await page.evaluate((id) => {
      const s = window.__capital.getState();
      return s.buildings[s.map.tiles[id].buildingId].focus;
    }, focusTile);
    check('Odak değiştirilebiliyor', moved !== before, `${before} → ${moved}`);
  }

  // ---------- Raf seçimi ----------
  // Aynı kategorideki iki ürünün birim maliyeti aynıdır; karar bölgesel
  // talep farkından doğar. Burada bakılan şey oyuncunun o kararı gerçekten
  // verebiliyor olması.
  section('Raf seçimi');

  const shelfTile = await page.evaluate(() => {
    const { engine, getState } = window.__capital;
    const s = getState();
    for (const t of s.map.tiles) {
      if (t.kind !== 'plot' || t.ownerId || t.structureId || t.buildingId) continue;
      if (s.districts[t.districtId].archetype !== 'mid_residential') continue;
      if (!engine.dispatch({ type: 'BUY_TILE', tileId: t.id }).ok) continue;
      if (engine.dispatch({ type: 'BUILD', tileId: t.id, defId: 'corner_shop' }).ok) return t.id;
    }
    return null;
  });
  check('Raf testi için bakkal kuruldu', shelfTile !== null);

  if (shelfTile !== null) {
    await page.evaluate((id) => window.__capital.selectTile(id), shelfTile);
    await page.waitForTimeout(400);

    const chips = page.locator('.shelf-chip');
    const chipCount = await chips.count();
    check('Raf düzenleyici çıkıyor', chipCount === 2, `${chipCount} ürün`);

    const shares = await page.locator('.shelf-share').allTextContents();
    check('Her ürünün yanında bölge talep payı yazıyor',
      shares.length === 2 && shares.every((t) => /%\d+/.test(t)), shares.join(' · '));

    const before = await page.evaluate((id) => {
      const s = window.__capital.getState();
      return s.buildings[s.map.tiles[id].buildingId].stocked.slice();
    }, shelfTile);
    check('Bakkal tek yuvalı: tek ürün taşıyor', before.length === 1, before.join(', '));

    // Rafta olmayan ürüne TEK tıklama rafı değiştirmeli. Reddetmek, tek
    // yuvalı dükkânı çıkmaza sokuyordu: tek ürünü çıkaramıyor, ikinciyi
    // ekleyemiyordu — yani bakkalın seçimi hiç yapılamıyordu.
    const offIndex = (await chips.nth(0).getAttribute('aria-pressed')) === 'true' ? 1 : 0;
    await chips.nth(offIndex).click();
    await page.waitForTimeout(400);
    const swapped = await page.evaluate((id) => {
      const s = window.__capital.getState();
      return s.buildings[s.map.tiles[id].buildingId].stocked.slice();
    }, shelfTile);
    check('Tek tıkla raf değişiyor', swapped.length === 1 && swapped[0] !== before[0],
      `${before[0]} → ${swapped[0]}`);
    check('Yuva sınırı korunuyor', swapped.length === 1, `${swapped.length}/1 yuva`);

    // Son ürünü çıkarmak reddedilmeli; raf boş kalamaz.
    await chips.nth(offIndex).click();
    await page.waitForTimeout(400);
    const kept = await page.evaluate((id) => {
      const s = window.__capital.getState();
      return s.buildings[s.map.tiles[id].buildingId].stocked.slice();
    }, shelfTile);
    check('Son ürün raftan çıkarılamıyor', kept.length === 1, kept.join(', '));
  }

  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));

  // ---------- Parsel ihalesi ----------
  // İhale oyunun akışını KESMEYEN ilk mekanik: üstte bir çip, tıklanınca
  // panel. Burada bakılan şey oyuncunun gerçekten teklif verebilmesi ve
  // ihaledeki parseli normal yoldan alamaması.
  section('Parsel ihalesi');

  await page.evaluate(async () => {
    const { engine, getState } = window.__capital;
    const s = getState();
    s.companies[s.playerCompanyId].cash = 50_000_000;
    engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    // Bir sonraki ihale gününe kadar koş.
    for (let i = 0; i < 40 && !s.auction; i++) engine.runDay();
  });
  await page.waitForTimeout(500);

  const auctionOpen = await page.evaluate(() => window.__capital.getState().auction !== null);
  check('Belediye ihale açıyor', auctionOpen);

  if (auctionOpen) {
    check('İhale çipi üstte görünüyor', (await page.locator('.auction-chip').count()) === 1,
      (await page.locator('.auction-chip').textContent())?.trim());

    // Oyun duraklamamalı: ihale akışı kesmiyor.
    const speed = await page.evaluate(() => window.__capital.getState().time.speed);
    check('İhale oyunu duraklatmıyor (hız oyuncunun bıraktığı yerde)', speed === 0, `hız ${speed}`);

    await page.locator('.auction-chip').click();
    await page.waitForTimeout(400);
    check('İhale paneli açılıyor', (await page.locator('.auction').count()) === 1);

    // İhale açıldıktan sonra rakipler kendi değerlemelerine göre teklif
    // veriyor; oyuncu panele geldiğinde ortada zaten bir teklif olabilir.
    // Panelin işi bunu GÖSTERMEK.
    const before = await page.evaluate(() => {
      const s = window.__capital.getState();
      return {
        bid: s.auction.bid,
        bidder: s.auction.bidderId,
        reserve: s.auction.reserve,
        playerId: s.playerCompanyId,
      };
    });
    const stateText = (await page.locator('.auction-state').textContent()) || '';
    check('Panel ihalenin güncel durumunu yazıyor',
      before.bidder === null
        ? /Henüz teklif yok/.test(stateText)
        : /değer biçti|teklif senin/.test(stateText),
      stateText.trim().slice(0, 70));
    check('Teklif tabanın altına düşmüyor', before.bid === 0 || before.bid >= before.reserve,
      `${before.bid} ≥ ${before.reserve}`);

    await page.locator('.auction-actions button.primary').click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const s = window.__capital.getState();
      return { bid: s.auction.bid, bidder: s.auction.bidderId, playerId: s.playerCompanyId };
    });
    check('Teklif verilebiliyor', after.bidder === after.playerId, `${after.bid} ₺`);
    check('Öndeyken buton kilitleniyor',
      await page.locator('.auction-actions button.primary').isDisabled());

    // İhaledeki parsel normal yoldan alınamamalı.
    const blocked = await page.evaluate(() => {
      const s = window.__capital.getState();
      return window.__capital.engine.dispatch({ type: 'BUY_TILE', tileId: s.auction.tileId });
    });
    check('İhaledeki parsel doğrudan satın alınamıyor', !blocked.ok, blocked.reason || '');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ---------- Borsa ----------
  // Turun vaadi: rakibini pazarda değil sahiplikte yenmek. Burada
  // bakılan şey oyuncunun gerçekten hisse alabilmesi ve devralmanın
  // haritada karşılık bulması.
  section('Borsa');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.companies[s.playerCompanyId].cash = 500_000_000;
    s.companies[s.playerCompanyId].netWorth = 500_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    for (let i = 0; i < 120; i++) window.__capital.engine.runDay();
  });
  await page.waitForTimeout(500);

  await page.locator('.topbar-actions [data-panel="bourse"]').click();
  await page.waitForTimeout(400);
  check('Borsa paneli açılıyor', (await page.locator('.bourse').count()) === 1);

  const listings = await page.locator('.bourse-row').count();
  check('Rakipler listeleniyor', listings >= 3, `${listings} şirket`);

  const trust = await page.locator('.bourse-trust').first().textContent();
  check('Hisse fiyatının yanında güven yazıyor', /primli|iskontolu/.test(trust || ''), (trust || '').trim());

  const stakeText = await page.locator('.bourse-stake-text').first().textContent();
  check('Kontrole ne kadar kaldığı yazıyor', /kontrol için/.test(stakeText || ''),
    (stakeText || '').trim().slice(0, 60));

  // Kurucu kilidi (Tur 19): oyun başı rakipler baskın ısınması bitene kadar
  // piyasada değil. Bölüm kilidi gösterip kaldırıyor; sonraki kontroller
  // açık piyasada alım-satımı ölçüyor.
  const lockProbe = await page.evaluate(() => {
    const s = window.__capital.getState();
    const target = Object.values(s.companies).find((c) => c.id !== s.playerCompanyId);
    target.lockedUntilDay = s.time.day + 40;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return target.id;
  });
  await page.waitForTimeout(250);
  const lockedRow = await page.evaluate(() => {
    const note = document.querySelector('.bourse-row .bourse-locked');
    return { text: note?.textContent ?? '', disabled: note?.closest('.bourse-row')?.querySelector('.bourse-actions button')?.disabled ?? false };
  });
  check('Kilitli rakipte kurucu kilidi yazıyor, alım kapalı', /Kurucu kilidi/.test(lockedRow.text) && lockedRow.disabled,
    lockedRow.text.trim());
  await page.evaluate(() => {
    const s = window.__capital.getState();
    for (const c of Object.values(s.companies)) delete c.lockedUntilDay;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForTimeout(250);
  void lockProbe;

  const before = await page.evaluate(() => {
    const s = window.__capital.getState();
    const target = Object.values(s.companies).find((c) => c.id !== s.playerCompanyId);
    return { id: target.id, held: s.companies[s.playerCompanyId].shares[target.id] || 0 };
  });
  await page.locator('.bourse-row').first().locator('button', { hasText: '100 al' }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate((id) => {
    const s = window.__capital.getState();
    return s.companies[s.playerCompanyId].shares[id] || 0;
  }, before.id);
  check('Hisse alınabiliyor', after > before.held, `${before.held} → ${after} hisse`);

  // Günlük alım tavanı (Tur 20): oyuncu da rakip gibi günde en fazla %3,5.
  const capNote = (await page.locator('.bourse-row .bourse-cap').first().textContent()) || '';
  check('Günlük alım tavanı satırda yazıyor', /Günde en fazla [\d.]+ hisse · bugün [\d.]+ kaldı/.test(capNote), capNote.trim());
  const overCap = await page.evaluate((id) => {
    const { engine, getState } = window.__capital;
    const s = getState();
    const outstanding = s.companies[id].shareCount ?? 10000;
    return engine.dispatch({ type: 'BUY_SHARES', companyId: id, count: Math.ceil(outstanding * 0.51) });
  }, before.id);
  check('Tek seferde %51 alınamıyor', !overCap.ok, overCap.reason ?? 'alım geçti');

  // Devralma emri: arayüzden verilir, satırda ve gündemde görünür, iptal edilir.
  const targetRow = page.locator('.bourse-row').first();
  const targetId = await targetRow.getAttribute('data-company');
  // Bu bölüm emrin uçtan uca çalıştığını ölçüyor; savunmanın kendisi
  // denge testinde. Hedefin savunması ve rakip baskınları bu sürede kapalı:
  // tarayıcıda geçen gün sayısı makineye göre değişiyor, sonuç değişmesin.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.flags.raids = false;
    s.flags.issuance = false;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await targetRow.locator('.order-go').click();
  await page.waitForTimeout(300);
  const orderRow = page.locator(`.bourse-row[data-company="${targetId}"]`);
  const orderText = (await orderRow.locator('.bourse-order').textContent().catch(() => '')) || '';
  check('Devralma emri veriliyor ve satırda görünüyor',
    (await orderRow.getAttribute('data-order')) === 'active' && /Devralma emri/.test(orderText), orderText.trim().slice(0, 80));
  check('Gündemde süren emir çipi', (await page.locator('.order-chip').count()) === 1,
    ((await page.locator('.order-chip').first().textContent().catch(() => '')) || '').trim());
  await orderRow.locator('.order-cancel').click();
  await page.waitForTimeout(300);
  const cancelled = await page.evaluate((id) => !window.__capital.getState().companies[window.__capital.getState().playerCompanyId].orders?.some((o) => o.issuerId === id), targetId);
  check('Emir iptal edilebiliyor', cancelled && (await orderRow.getAttribute('data-order')) === null);
  await orderRow.locator('.order-go').click();
  await page.waitForTimeout(300);

  // Devralma: haritada gerçekten karşılığı var mı?
  const takeover = await page.evaluate((id) => {
    const { engine, getState } = window.__capital;
    const s = getState();
    const target = s.companies[id];
    let mine = 0;
    let theirs = 0;
    let days = 1;
    while (getState().companies[id] && days < 90) {
      // Son günün fotoğrafı: devir o gün oluyor.
      const now = getState();
      mine = Object.values(now.buildings).filter((b) => b.companyId === now.playerCompanyId).length;
      theirs = Object.values(now.buildings).filter((b) => b.companyId === id).length;
      engine.runDay();
      days += 1;
    }
    const next = getState();
    next.flags.raids = true;
    next.flags.issuance = true;
    engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return {
      name: target.name,
      days,
      gone: next.companies[id] === undefined,
      mine,
      theirs,
      after: Object.values(next.buildings).filter((b) => b.companyId === next.playerCompanyId).length,
      orphans: Object.values(next.buildings).filter((b) => b.companyId === id).length,
      orderLeft: (next.companies[next.playerCompanyId].orders ?? []).length,
    };
  }, targetId);
  check('Devralma emri günlere yayılıyor', takeover.gone && takeover.days > 1, `${takeover.days} alım günü`);
  check('Emir devralmayla kapanıyor', takeover.orderLeft === 0, `${takeover.orderLeft} emir kaldı`);
  check('Devralınan şirket oyundan çıkıyor', takeover.gone, takeover.name);
  // TAM EŞİTLİK DEĞİL, DEVRİN KENDİSİ ÖLÇÜLÜYOR.
  //
  // Burada `after === mine + theirs` yazıyordu ve arada sırada bir fazla
  // sayıyla kırılıyordu (4 → 30, beklenen 29). Sebep hata değil: devralma
  // bir GÜN İÇİNDE oluyor ve o gün şehir çalışmaya devam ediyor, oyuncu
  // ilgisiz bir sebeple bir bina daha kazanabiliyor. Tarayıcı testinde
  // adımlar arası geçen gün sayısı makinenin hızına göre değiştiği için
  // bu her koşumda aynı yere denk gelmiyor.
  //
  // Sorulan şey "oyuncunun tam kaç binası var" değil, "hedefin binaları
  // el değiştirdi mi". İki koşullu ölçüt bunu doğrudan söylüyor ve
  // ilgisiz bir inşaattan etkilenmiyor.
  check('Devralınan binalar haritada el değiştiriyor',
    takeover.after >= takeover.mine + takeover.theirs && takeover.orphans === 0,
    `${takeover.mine} → ${takeover.after} (en az +${takeover.theirs}) · sahipsiz kalan ${takeover.orphans}`);

  await page.waitForTimeout(400);
  const remaining = await page.locator('.bourse-row').count();
  check('Devralınan şirket listeden düşüyor', remaining === listings - 1,
    `${listings} → ${remaining}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));

  // ---------- Kayıt ----------
  section('Kayıt sistemi');
  await page.locator('.topbar-actions [data-panel="saves"]').click();
  await page.waitForTimeout(300);
  await page.locator('.slot').nth(1).locator('button:has-text("Kaydet")').click();
  await page.waitForTimeout(700);
  const savedMeta = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('capital-game', 1);
        req.onsuccess = () => {
          const get = req.result.transaction('saves', 'readonly').objectStore('saves').get(1);
          get.onsuccess = () => resolve(get.result?.meta ?? null);
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );
  check('IndexedDB slotuna yazıldı', savedMeta !== null,
    savedMeta ? `${savedMeta.companyName}, ${savedMeta.day}. gün` : '');
  const schemaVersion = await page.evaluate(() => window.__capital.schemaVersion);
  check('Kayıt güncel şemayla yazılıyor', savedMeta?.schemaVersion === schemaVersion,
    `v${savedMeta?.schemaVersion} (güncel v${schemaVersion})`);

  // Dışa aktarma her ortamda olanı söylemeli: kendi sunucusunda gerçek bir
  // indirme, barındırıcıda yetenek yoksa açık bir "engellendi" + elle aktarım.
  const lastToast = () => page.evaluate(() => {
    const all = document.querySelectorAll('.toasts .toast');
    return all.length ? all[all.length - 1].textContent : '';
  });
  const exportButton = page.locator('.saverow-actions button:has-text("JSON dışa aktar")');
  // 20 sn: indirme olayı tıklamanın kendisini de içeriyor. Yavaş CI
  // koşucusunda (2 FPS, kare başına ~500 ms) Playwright'ın "öğe sabit mi"
  // beklemesi ve 400 KB'lık kaydın serileşmesi ana iş parçacığında sıraya
  // giriyor; 5 sn main'de bir kez yetmedi — uygulama indirmeyi başlatmıştı
  // ("İndirme başlatıldı" kontrolü geçti), olay süreden sonra geldi.
  const download = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await exportButton.click();
  const downloaded = await download;
  check('Dışa aktarma tarayıcıda gerçek bir indirme başlatıyor', downloaded !== null,
    downloaded ? downloaded.suggestedFilename() : 'indirme olayı yok');
  // Dosya adı ASCII (Tur 65): şirketin adındaki boşluk ve harf, UTF-8 olmayan sistemlerde adı "download" yapıyordu.
  check('Dışa aktarmanın dosya adı ASCII: capitalforge-Şirket-Adı-gun….json', /^capitalforge-[A-Za-z0-9._-]+-gun\d+\.json$/.test(downloaded?.suggestedFilename() ?? ''),
    downloaded?.suggestedFilename() ?? 'indirme yok');
  check('İndirme sonucu dürüstçe bildiriliyor', (await lastToast()).includes('başlatıldı'), await lastToast());

  await page.evaluate(() => {
    window.claude = { use: async () => null };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('izin yok')) },
    });
  });
  await exportButton.click();
  await page.waitForTimeout(300);
  const manualBox = await page.evaluate(() => {
    const box = document.querySelector('.manual-text');
    return box ? box.value : null;
  });
  check('Engelli ortamda indirildi denmiyor', (await lastToast()).includes('engelli'), await lastToast());
  check('Engelli ortamda elle aktarım kutusu açılıyor', typeof manualBox === 'string' && manualBox.startsWith('{'),
    manualBox ? `${Math.round(manualBox.length / 1024)} KB metin` : 'kutu yok');

  await page.evaluate(() => {
    window.claude = {
      use: async (name) => (name === 'downloads'
        ? { save: () => Promise.reject({ code: 'declined', message: 'hayır' }) }
        : null),
    };
  });
  await exportButton.click();
  await page.waitForTimeout(300);
  check('Kaydetmeyi reddetmek "iptal" olarak bildiriliyor', (await lastToast()).includes('iptal'), await lastToast());
  await page.evaluate(() => { delete window.claude; });

  // Kutu düzenlenebilir: metindeki kaydı duraklatılmış hâle getirip
  // yüklüyoruz — böylece yükleme sonrası gün tam olarak metindeki gün olmalı.
  const edited = manualBox ? JSON.parse(manualBox) : null;
  if (edited) edited.state.time.speed = 0;
  const textDay = edited?.state.time.day ?? null;
  if (edited) await page.locator('.manual-text').fill(JSON.stringify(edited));
  await page.locator('.manual-actions button:has-text("Bu metni yükle")').click();
  await page.waitForTimeout(300);
  check('Elle aktarım metni geri yükleniyor', (await lastToast()).includes('metinden yüklendi'), await lastToast());
  const dayAfterManual = await page.evaluate(() => window.__capital.getState().time.day);
  check('Metinden yükleme metindeki günü getiriyor', dayAfterManual === textDay,
    `metin ${textDay}. gün → oyun ${dayAfterManual}. gün`);
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));
  await page.keyboard.press('Escape');

  // ---------- Yenileme ----------
  section('Sayfa yenileme');
  await page.evaluate(async () => {
    const { saveGame } = window.__capital;
    void saveGame;
  });
  // Otomatik kayıt slotuna yazılması için oyunun autosave aralığını beklemek
  // yerine slot 1'i doğruladık; burada yenileme sonrası açılışı kontrol ediyoruz.
  consoleErrors.length = 0;
  await page.reload();
  await page.waitForTimeout(2000);
  const afterReload = await page.evaluate(() => ({
    menu: Boolean(document.querySelector('.newgame')),
    game: Boolean(document.querySelector('.topbar')),
  }));
  check('Yenileme sonrası oyun açılıyor', afterReload.menu || afterReload.game);
  check('Yenileme sonrası konsol temiz', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---------- v1 kaydı göçü ----------
  section('Eski kayıt göçü');
  await page.evaluate(async () => {
    const state = window.__capital
      ? window.__capital.getState()
      : null;
    // Elde bir v1 kaydı üret: parsel alanları yok, ceoId yok.
    const legacy = JSON.parse(JSON.stringify(state ?? {}));
    if (!legacy.meta) return;
    legacy.meta.schemaVersion = 1;
    for (const tile of legacy.map.tiles) {
      delete tile.kind;
      delete tile.structureId;
      delete tile.structureHeight;
    }
    for (const company of Object.values(legacy.companies)) delete company.ceoId;

    await new Promise((resolve) => {
      const req = indexedDB.open('capital-game', 1);
      req.onsuccess = () => {
        const put = req.result
          .transaction('saves', 'readwrite')
          .objectStore('saves')
          .put({ meta: { slot: 0, schemaVersion: 1 }, state: legacy });
        put.onsuccess = resolve;
        put.onerror = resolve;
      };
      req.onerror = resolve;
    });
  });
  consoleErrors.length = 0;
  await page.reload();
  await page.waitForSelector('.topbar', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const migrated = await page.evaluate(() => {
    const s = window.__capital.getState();
    return {
      version: s.meta.schemaVersion,
      allTilesHaveKind: s.map.tiles.every((t) => typeof t.kind === 'string'),
    };
  });
  check('v1 kaydı güncel şemaya taşındı', migrated.version === schemaVersion, `v${migrated.version}`);
  check('Göç sonrası tüm kareler geçerli', migrated.allTilesHaveKind);
  check('Göç sırasında konsol temiz', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---------- Bozuk kayıt ----------
  section('Bozuk kayıt dayanıklılığı');
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('capital-game', 1);
        req.onsuccess = () => {
          const put = req.result
            .transaction('saves', 'readwrite')
            .objectStore('saves')
            .put({ meta: { slot: 0 }, state: { meta: { schemaVersion: 2 }, map: null } });
          put.onsuccess = resolve;
          put.onerror = resolve;
        };
        req.onerror = resolve;
      }),
  );
  consoleErrors.length = 0;
  await page.reload();
  await page.waitForSelector('.newgame', { timeout: 20000 });
  // Açılış kaydı neden açamadığını söylüyor (Tur 75): sessizce yeni oyuna düşüyordu.
  const brokenNotice = ((await page.waitForSelector('[data-boot-notice]', { timeout: 5000 }).then((el) => el.textContent(), () => '')) ?? '').trim();
  check('Bozuk kayıtta kurulum ekranına düşüyor, nedeni söyleniyor', brokenNotice === 'Otomatik kayıt açılmadı. Kayıt eksik ya da bozuk.', brokenNotice);
  check('Bozuk kayıt sessizce çökmüyor', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---------- Performans ve görsel ----------
  section('Performans ve görünüm');
  await page.locator('button:has-text("Şirketi kur")').click();
  await page.waitForSelector('.topbar');
  await page.click('.speed:nth-child(4)');
  // Ham FPS'i eşik olarak kullanmak kabı ölçer, kodu değil: burada GPU yok
  // ve SwiftShader tavanı düşük. Asıl korunması gereken şey zaten kare
  // hızı değil — OYUN SAATİNİN GERÇEK ZAMANLA UYUMU. Düşük kare hızında
  // simülasyon sessizce yavaşlarsa seçilen hız kademesi yalan söyler;
  // motorun dt üst sınırı tam olarak bunu engellemek için var.
  //
  // Kalite en ucuz kademeye SABİTLENİYOR. Aksi halde ölçüm motorun
  // saatini değil, o an hangi kademede olduğumuzu ölçer: Tur 6'nın
  // dokuları ve ortam haritasıyla yazılım rasterizasyonu 1 FPS'e
  // inebiliyor ve dt üst sınırı devreye girip saat geride kalıyor.
  // Bu bir motor arızası değil, kabın sınırı.
  await page.evaluate(() => window.__capital.setQuality(3));
  await page.waitForTimeout(600);
  const pace = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const startDay = window.__capital.getState().time.day;
        const start = performance.now();
        const tick = () => {
          frames++;
          const elapsed = performance.now() - start;
          if (elapsed < 4000) requestAnimationFrame(tick);
          else
            resolve({
              fps: Math.round((frames * 1000) / elapsed),
              days: window.__capital.getState().time.day - startDay,
              expected: elapsed / 480, // 3x hızda bir oyun günü = 480ms
            });
        };
        requestAnimationFrame(tick);
      }),
  );
  const paceRatio = pace.days / pace.expected;
  check(
    'Düşük kare hızında oyun saati gerçek zamanla uyumlu',
    paceRatio > 0.75,
    `${pace.days}/${pace.expected.toFixed(0)} gün (%${Math.round(paceRatio * 100)}) · ${pace.fps} FPS (SwiftShader, GPU yok)`,
  );

  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/city-later.png` });
  check('Uzun oturumda konsol temiz', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---------- Görsel katman ----------
  section('Görsel katman');
  const visual = await page.evaluate(() => window.__capital.renderInfo());
  check('Bina kütlesi üç parçalı', visual.massParts === 3, `${visual.massParts} parça (taban, gövde, çatı)`);
  check(
    'Sokaklar parsellerden ayrı çiziliyor',
    visual.roadInstances > 0 && visual.plotInstances > 0,
    `${visual.roadInstances} sokak · ${visual.plotInstances} parsel`,
  );
  const tileCount = await page.evaluate(() => window.__capital.getState().map.tiles.length);
  check(
    'Sokak ve parsel toplamı haritayı kapatıyor',
    visual.roadInstances + visual.plotInstances === tileCount,
    'kayıp kare yok',
  );
  // Tur 8 haritayı 576'dan 900 kareye çıkardı. Şehrin tamamı
  // InstancedMesh ile çizildiği için çizim çağrısı kare sayısıyla
  // BÜYÜMEMELİ — büyüyorsa toplu çizim bir yerde bozulmuş demektir ve
  // haritayı bir daha büyütmek mümkün olmaz.
  check(
    'Harita büyümesi çizim çağrısını artırmıyor',
    visual.drawCalls > 0 && visual.drawCalls < 60,
    `${tileCount} kare · ${visual.drawCalls} çizim çağrısı`,
  );

  // Detay katmanı (Tur 24): her bina türü ne olduğunu söylüyor — kırma
  // çatı, tente, tabela, silo; sokaklarda ağaç ve lamba; binaların altında
  // temas gölgesi. Lenste bilgi kalabalığı yapmasınlar diye gizleniyorlar.
  const decorInfo = visual.decor;
  check(
    'Detay katmanı dolu: çatı, ağaç, lamba, tabela',
    decorInfo.roof > 0 && decorInfo.tree > 0 && decorInfo.lamp > 0 && decorInfo.sign > 0 && visual.decorVisible,
    `çatı ${decorInfo.roof} · ağaç ${decorInfo.tree} · lamba ${decorInfo.lamp} · tabela ${decorInfo.sign} · tente ${decorInfo.awning} · silo/tank ${decorInfo.cylinder}`,
  );
  check('Binalar zemine temas gölgesiyle oturuyor', visual.contactShadows > 0, `${visual.contactShadows} leke`);
  // Lens arayüzün eşitlemesiyle sahneye iniyor; yazılımsal GPU'da 3 karede
  // bir kare ~0,3–1,1 sn sürüyor (Tur 62 ölçümü, main'de de aynı). Sabit
  // 300 ms bekleme bazen bir kare erkendi: durum bekleniyor, en çok 5 sn.
  await page.evaluate(() => window.__capital.setLens('opportunity'));
  await page.waitForFunction(() => window.__capital.renderInfo()?.decorVisible === false, null, { timeout: 5000 }).catch(() => {});
  const lensDecor = await page.evaluate(() => window.__capital.renderInfo());
  await page.evaluate(() => window.__capital.setLens('none'));
  await page.waitForFunction(() => window.__capital.renderInfo()?.decorVisible === true, null, { timeout: 5000 }).catch(() => {});
  const backDecor = await page.evaluate(() => window.__capital.renderInfo());
  check('Veri lensinde detaylar gizleniyor, dönünce geri geliyor', !lensDecor.decorVisible && backDecor.decorVisible,
    `lens ${lensDecor.decorVisible ? 'görünür' : 'gizli'} · şehir ${backDecor.decorVisible ? 'görünür' : 'gizli'}`);

  // Pencere ışıkları: gündüz sönük, gece yanıyor. Emisyon artık düz bir
  // yüzey parlaklığı değil bir DOKUDAN geldiği için değer serbestçe
  // yükselebiliyor — eskiden 0,03 gibi bir "ima" seviyesindeydi.
  await page.evaluate(() => window.__capital.setTimeOfDay(0.25));
  await page.waitForTimeout(400);
  const noon = await page.evaluate(() => window.__capital.renderInfo());
  await page.evaluate(() => window.__capital.setTimeOfDay(0.76));
  await page.waitForTimeout(400);
  const midnight = await page.evaluate(() => window.__capital.renderInfo());
  check('Gündüz pencere ışığı sönük', noon.fabricEmissive === 0, `${noon.fabricEmissive.toFixed(2)}`);
  check('Sokak lambaları gece yanıyor, gündüz sönük', noon.lampGlow === 0 && midnight.lampGlow > 1,
    `gündüz ${noon.lampGlow.toFixed(2)} · gece ${midnight.lampGlow.toFixed(2)}`);
  check('Gece pencereler yanıyor', midnight.fabricEmissive > 0.5,
    `${midnight.fabricEmissive.toFixed(2)} (eski düz emisyon 0,03 idi)`);

  // Ayrıntı (Tur 36): kavşak ve yaya geçidi kendi dokusunda, gece lambaların
  // altına ışık düşüyor, gece yarısına doğru pencereler tek tek sönüyor.
  const cells = visual.roadCells;
  check('Kavşaklar ve yaya geçitleri kendi dokusunda',
    cells.intersection > 0 && cells.crosswalk >= cells.intersection * 2 && cells.straight > 0,
    `kavşak ${cells.intersection} · geçit ${cells.crosswalk} · düz ${cells.straight}`);
  check('Gece lambaların altına ışık düşüyor, gündüz düşmüyor',
    !noon.lampPools.visible && midnight.lampPools.visible && midnight.lampPools.count > 20 && midnight.lampPools.opacity > 0.2,
    `${midnight.lampPools.count} havuz · gece ${midnight.lampPools.opacity.toFixed(2)} · gündüz ${noon.lampPools.visible ? 'görünür' : 'yok'}`);
  check('Gece yarısına doğru pencereler sönmeye başlıyor',
    noon.windowLateNight === 0 && midnight.windowLateNight > 0.9,
    `gündüz ${noon.windowLateNight.toFixed(2)} · gece yarısı ${midnight.windowLateNight.toFixed(2)}`);

  // Canlılık (Tur 34): kırsalda gerçek ağaçlar, üç tür fon aracı ve gece
  // farları, kaldırımda yayalar, üretim yapan tesisin bacasında duman.
  check('Kırsalda 3B ağaçlar var', visual.countrysideTrees > 100, `${visual.countrysideTrees} ağaç`);
  check(
    'Fon araçları üç türde: araba, minibüs, otobüs',
    visual.vehicles.car > 0 && visual.vehicles.van > 0 && visual.vehicles.bus > 0,
    `araba ${visual.vehicles.car} · minibüs ${visual.vehicles.van} · otobüs ${visual.vehicles.bus}`,
  );
  check('Araç farları gece yanıyor, gündüz sönük', noon.vehicles.lights === false && midnight.vehicles.lights === true,
    `gündüz ${noon.vehicles.lights ? 'açık' : 'kapalı'} · gece ${midnight.vehicles.lights ? 'açık' : 'kapalı'}`);
  check('Kaldırımda yayalar yürüyor, gece sokak boşalıyor', noon.street.walkers > 20 && midnight.street.walkers < noon.street.walkers,
    `gündüz ${noon.street.walkers} · gece ${midnight.street.walkers} yaya`);
  check('Veri lensinde yaya ve duman susuyor, dönünce geri geliyor', !lensDecor.street.visible && backDecor.street.visible);
  // Duman BİLGİ: yalnızca dün üretim yapmış tesisin bacası tütüyor,
  // girdisi kesilen tesis susuyor. Bu noktada şehirde üretim yapan tesis
  // olup olmadığı koşuya bağlı (ilk sürüm 0 = 0 ile boşuna geçiyordu), o
  // yüzden kural iki yönde de sınanıyor: önce bütün tesislerin üretimi
  // sıfırlanıyor (hiçbiri tütmemeli), sonra tek bir tesis üretmiş sayılıyor
  // (yalnızca o tütmeli). Sahne lens gidip gelince yeniden senkronlanıyor.
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  const plantSetup = await page.evaluate(() => {
    const c = window.__capital;
    const s = c.getState();
    const isPlant = (b) => c.buildingRole(b.defId) === 'process';
    let built = false;
    let reason = '';
    if (!Object.values(s.buildings).some(isPlant)) {
      // Tesis yoksa bir değirmen kuruluyor: imarın izin verdiği ilk boş
      // parsel. Değirmen net değer eşiğiyle açılıyor; zincir bölümündeki
      // gibi kasa ve net değer birlikte yükseltiliyor.
      const p = s.companies[s.playerCompanyId];
      p.cash = Math.max(p.cash, 50_000_000);
      p.netWorth = Math.max(p.netWorth, 50_000_000);
      for (const tile of s.map.tiles) {
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        // Yalnızca sanayi ve liman: başka yerde alınan parsel boşa kalırdı.
        const archetype = s.districts[tile.districtId]?.archetype;
        if (archetype !== 'industrial' && archetype !== 'port') continue;
        const bought = c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
        if (!bought.ok) {
          reason = `parsel: ${bought.reason}`;
          continue;
        }
        const result = c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'flour_mill' });
        if (result.ok) {
          built = true;
          break;
        }
        reason = `kurulum: ${result.reason}`;
      }
    }
    const plants = Object.values(s.buildings).filter(isPlant);
    return { plants: plants.length, built, reason, day: s.time.day };
  });
  // Yeni kurulduysa inşaat animasyonu bitsin: yükselen binadan duman çıkmıyor.
  if (plantSetup.built) await page.waitForTimeout(1600);
  // Sahne lensle yeniden senkronlanıyor; puflar ise çizim döngüsünde
  // hesaplanıyor. Sabit bekleme (400 ms) main'deki yavaş koşucuda (2 FPS)
  // tek kare bile çizdirmedi ve puf 0 kaldı: yeni kareleri bekliyoruz.
  const resync = async () => {
    await page.evaluate(() => window.__capital.setLens('opportunity'));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__capital.setLens('none'));
    await page.evaluate(async () => {
      const start = window.__capital.renderInfo().frameCount;
      const t0 = performance.now();
      while (window.__capital.renderInfo().frameCount < start + 3 && performance.now() - t0 < 20000) {
        await new Promise((r) => setTimeout(r, 50));
      }
    });
  };
  const saved = await page.evaluate(() => {
    const c = window.__capital;
    const out = {};
    for (const b of Object.values(c.getState().buildings)) {
      if (c.buildingRole(b.defId) !== 'process') continue;
      out[b.id] = b.last.producedUnits;
      b.last.producedUnits = 0;
    }
    return out;
  });
  await resync();
  const silent = await page.evaluate(() => window.__capital.renderInfo().street);
  const oneOn = await page.evaluate((ids) => {
    const b = window.__capital.getState().buildings[ids[0]];
    if (b) b.last.producedUnits = 7;
    return Boolean(b);
  }, Object.keys(saved));
  await resync();
  const smoking = await page.evaluate(() => window.__capital.renderInfo().street);
  await page.evaluate((saved) => {
    const buildings = window.__capital.getState().buildings;
    for (const [id, units] of Object.entries(saved)) if (buildings[id]) buildings[id].last.producedUnits = units;
  }, saved);
  await resync();
  check(
    'Duman yalnızca üretim yapan tesisten çıkıyor',
    plantSetup.plants > 0 && oneOn && silent.producing === 0 && smoking.producing === 1 && smoking.puffs > 0,
    `${plantSetup.plants} tesis${plantSetup.built ? ' (test kurdu)' : ''}${plantSetup.reason && !plantSetup.built ? ` (kurulamadı, gün ${plantSetup.day}: ${plantSetup.reason})` : ''} · üretim yok: ${silent.producing} baca · bir tesis üretti: ${smoking.producing} baca, ${smoking.puffs} puf`,
  );

  // İnşaat animasyonu: bina yerden yükseliyor mu.
  //
  // Oyun ÖNCE durduruluyor. Rakipler sürekli dükkân açıyor ve her yeni
  // bina animasyonu yeniden tetikliyor; duraklatılmadan "animasyon bitti"
  // kontrolü rakiplerin inşaat temposunu ölçerdi, bizim animasyonumuzu
  // değil.
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  const grewTile = await page.evaluate(() => {
    const engine = window.__capital.engine;
    const state = engine.getState();
    for (const tile of state.map.tiles) {
      if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
      if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
      if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) return tile.id;
    }
    return null;
  });
  await page.waitForTimeout(120);
  const during = await page.evaluate(() => window.__capital.renderInfo());
  check('Yeni bina yerden yükseliyor', grewTile !== null && during.buildingsGrowing, 'animasyon sürüyor');
  await page.waitForTimeout(1400);
  const settled = await page.evaluate(() => window.__capital.renderInfo());
  check('Animasyon bitiyor, takılı kalmıyor', !settled.buildingsGrowing, 'tamamlandı');

  // ---------- Kalite kademeleri ----------
  section('Kalite kademeleri');
  const quality = await page.evaluate(() => window.__capital.renderInfo());
  check(
    'Kalite kademesi bildiriliyor',
    typeof quality.qualityTier === 'number' && typeof quality.qualityName === 'string',
    `${quality.qualityTier} · "${quality.qualityName}" · piksel oranı ${quality.pixelRatio} · gölge ${quality.shadowMapSize}`,
  );
  check(
    'Yazılım rasterizasyonunda kademe indi',
    quality.qualityTier > 0,
    `bu ortamda GPU yok; kademe ${quality.qualityTier}`,
  );
  check(
    'İnen kademede gölge haritası küçülüyor ya da gölge kapanıyor',
    quality.shadowMapSize <= 1024,
    `gölge haritası ${quality.shadowMapSize}`,
  );

  // Üst kademeler bu ortamda kendiliğinden HİÇ çalışmaz — GPU yok,
  // uyarlama saniyeler içinde en ucuza iniyor. Sabitlemeden test edilseydi
  // bloom zinciri ve 2048'lik gölge hiçbir zaman sınanmamış olurdu.
  await page.evaluate(() => window.__capital.setQuality(0));
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => window.__capital.renderInfo());
  check('En üst kademede bloom zinciri kuruluyor', top.postProcessing === true, top.qualityName);
  check('En üst kademede gölge haritası 2048', top.shadowMapSize === 2048, `${top.shadowMapSize}`);
  await page.screenshot({ path: `${OUT}/city-bloom.png` });

  await page.evaluate(() => window.__capital.setQuality(3));
  await page.waitForTimeout(900);
  const bottom = await page.evaluate(() => window.__capital.renderInfo());
  check('En alt kademede bloom sökülüyor', bottom.postProcessing === false, bottom.qualityName);
  check('En alt kademede piksel oranı 1', bottom.pixelRatio === 1, `${bottom.pixelRatio}`);
  check(
    'Kademeler arası geçiş konsolu kirletmiyor',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | '),
  );

  // ---------- Dönem, sözleşme ve oyun sonu ----------
  //
  // Tur 13'ün üç yüzü: mevsim çipi, sözleşme teklifi ve kaybedilebilir
  // oyunun ekranı. Üçü de state'i elle kurup ARAYÜZDE doğrulanıyor —
  // "runDay dinleyici uyarmaz" dersi (Tur 11) burada baştan uygulanıyor:
  // her kurulumdan sonra bir uyarı tetikleniyor ve DOM bekleniyor.
  section('Dönem, sözleşme ve oyun sonu');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.era = { defId: 'era_genisleme', startedDay: s.time.day, remainingDays: 200 };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  const eraChip = await page
    .waitForFunction(() => document.querySelector('.era-chip')?.textContent ?? null, null, { timeout: 5000 })
    .then((h) => h.jsonValue())
    .catch(() => null);
  check('Dönem çipi ekranda', Boolean(eraChip), String(eraChip));

  await page.evaluate(() => {
    const s = window.__capital.getState();
    const district = s.districts[0];
    s.contractOffer = {
      kind: 'build',
      title: `${district.name} bölgesine 2 Market işletmesi`,
      districtId: district.id,
      category: 'grocery',
      targetCount: 2,
      targetShare: 0,
      durationDays: 120,
      reward: 44000,
      penalty: 17600,
      offeredDay: s.time.day,
      acceptedDay: s.time.day,
      deadlineDay: s.time.day + 120,
    };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForSelector('.contract-chip', { timeout: 5000 }).catch(() => null);
  check('Sözleşme teklifi çipte görünüyor',
    (await page.locator('.contract-chip').count()) === 1 &&
      (await page.locator('.contract-chip button:has-text("Kabul")').count()) === 1,
    (await page.locator('.contract-chip').textContent().catch(() => '')) ?? '');

  await page.locator('.contract-chip button:has-text("Kabul")').click();
  const accepted = await page
    .waitForFunction(() => document.querySelector('.contract-chip.active') !== null, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check('Kabul, teklifi aktif sözleşmeye çeviriyor', accepted,
    accepted ? 'çip ilerleme moduna geçti' : 'aktif çip yok');
  await page.evaluate(() => {
    // Sonraki bölümler sözleşme cezasıyla kirlenmesin.
    delete window.__capital.getState().contract;
  });

  // Oyun sonu: state kur, ekran insin; sonra temizle, oyun devam etsin.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    const rival = Object.values(s.companies).find((c) => !c.isPlayer);
    s.gameOver = { day: s.time.day, byCompanyId: rival.id };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  const overShown = await page
    .waitForFunction(() => document.querySelector('.gameover') !== null, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check('Oyun sonu ekranı iniyor', overShown, overShown ? 'ekran görünür' : 'ekran yok');
  check('Oyun sonu devralanın yüzünü gösteriyor',
    (await page.locator('.gameover .ceo-portrait, .gameover svg').count()) > 0,
    `${await page.locator('.gameover svg').count()} portre`);
  const frozen = await page.evaluate(async () => {
    const cap = window.__capital;
    const before = cap.getState().time.day;
    cap.engine.dispatch({ type: 'SET_SPEED', speed: 3 });
    await new Promise((r) => setTimeout(r, 700));
    cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    return { before, after: cap.getState().time.day };
  });
  check('Kaybedilmiş oyunda takvim akmıyor', frozen.before === frozen.after,
    `gün ${frozen.before} → ${frozen.after}`);
  await page.evaluate(() => {
    delete window.__capital.getState().gameOver;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  await page.waitForFunction(() => document.querySelector('.gameover') === null, null, { timeout: 5000 }).catch(() => null);

  // Zafer: ekran insin, "devam" serbest oyuna döndürsün.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    s.victory = { day: s.time.day, kind: 'tycoon' };
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });
  const victoryShown = await page
    .waitForFunction(() => document.querySelector('.gameover.victory') !== null, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check('Zafer ekranı iniyor', victoryShown);
  if (victoryShown) {
    await page.locator('.gameover.victory button:has-text("Serbest oyuna devam")').click();
    await page.waitForTimeout(300);
    const resumed = await page.evaluate(() => {
      const s = window.__capital.getState();
      return { gone: document.querySelector('.gameover.victory') === null, dismissed: s.victory?.dismissed === true, speed: s.time.speed };
    });
    check('Zaferden sonra serbest oyun sürüyor', resumed.gone && resumed.dismissed && resumed.speed === 1,
      `ekran ${resumed.gone ? 'kapandı' : 'açık'} · hız ${resumed.speed}`);
  }
  await page.evaluate(() => {
    // Silmek yerine "görüldü": koşul hâlâ sağlanıyor, silinse ertesi gün
    // yeniden ilan edilirdi.
    window.__capital.getState().victory.dismissed = true;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });

  // ---------- Tohum Ligi ----------
  //
  // Ayrı bir bağlamda: lig yeni oyun ekranından başlıyor ve ana sayfanın
  // kayıtlarına dokunmamalı. Koşu GERÇEK — 360 gün motorun kendi gün
  // adımıyla koşturuluyor (arayüzün hızıyla üç dakika sürerdi), komutlar
  // arayüzden veriliyor, doğrulama tarayıcıda baştan tekrar oynuyor.
  // Buradan sonraki bölümler kendi bağlamlarında yeni sayfa açıyor; ana
  // sayfa bir daha kullanılmıyor ama çizim döngüsü, WebGL bağlamı ve
  // büyük çizim hedefleri (gölge haritası, bloom zinciri) duruyordu. GPU'suz
  // ortamda bunlar aynı yazılımsal GPU sürecini paylaşıyor; Tur 24'te sahne
  // biraz ağırlaşınca Dil bölümündeki yenileme 20 sn'yi aştı (tek başına
  // koşunca 8,5 sn). Ana sayfa kapatılıyor: konsol hataları zaten toplandı,
  // uygulamanın davranışı değişmiyor, yalnızca düzeneğin kendi yükü kalkıyor.
  await page.close();

  section('Tohum Ligi');
  {
    const leagueContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await leagueContext.addInitScript(veteran, TUTORIAL_KEY);
    const lp = await leagueContext.newPage();
    const leagueErrors = [];
    lp.on('pageerror', (e) => leagueErrors.push(e.message));
    lp.on('console', (m) => { if (m.type() === 'error') leagueErrors.push(m.text()); });
    await lp.goto('http://127.0.0.1:8811/');
    await lp.waitForSelector('.newgame', { timeout: 20000 });
    await lp.locator('.mode-picker [data-mode="league"]').click();
    check('Kurulumda Tohum Ligi seçilebiliyor', (await lp.locator('.mode-picker [data-mode="league"][aria-checked="true"]').count()) === 1,
      ((await lp.locator('.mode-picker [data-mode="league"]').textContent()) ?? '').trim());
    check('Ligde zorluk seçimi kalkıyor', (await lp.locator('.difficulty-option[data-difficulty]').count()) === 0);
    check('Ligde şehir boyutu seçimi kalkıyor', (await lp.locator('[data-city-size]').count()) === 0);
    // Tur 53: haftanın kuralı ve gelecek haftanınki kurulumda yazıyor. Test gerçek
    // tarihle koşuyor: kurallar 2026-W44'te başlıyor, o haftadan önce bu haftanın kuralı yok.
    const ruleShown = await lp.evaluate(() => {
      const rule = document.querySelector('[data-detail="league"] [data-league-rule]');
      return {
        rule: rule?.getAttribute('data-league-rule') ?? null,
        text: rule?.textContent ?? '',
        next: document.querySelector('[data-detail="league"] [data-league-next-rule]')?.getAttribute('data-league-next-rule') ?? null,
      };
    });
    check('Kurulumda gelecek haftanın kuralı yazıyor; bu haftanınki de, kurallar başladıysa (Tur 53)',
      Boolean(ruleShown.next) && ruleShown.rule !== ruleShown.next && (ruleShown.rule === null || /Haftanın kuralı/.test(ruleShown.text)),
      `${ruleShown.rule ? ruleShown.text.slice(0, 80) : 'bu hafta kuralsız'} · sonra ${ruleShown.next}`);
    await lp.fill('.newgame-field input[type="text"]', 'Lig Holding');
    await lp.locator('button:has-text("Şirketi kur")').click();
    await lp.waitForSelector('.topbar', { timeout: 20000 });
    const leagueBoot = await lp.evaluate(() => {
      const s = window.__capital.getState();
      return { week: s.league?.weekId, log: s.commandLog?.length ?? -1, modifiers: s.modifiers ?? null };
    });
    check('Lig koşusu haftanın kimliğiyle başlıyor', /^\d{4}-W\d{2}$/.test(leagueBoot.week ?? ''), leagueBoot.week);
    check('Lig koşusu haftanın kuralıyla başlıyor (Tur 53)', JSON.stringify(leagueBoot.modifiers) === JSON.stringify(ruleShown.rule ? [ruleShown.rule] : null),
      `${JSON.stringify(leagueBoot.modifiers)} · kurulumda ${ruleShown.rule}`);
    check('Gündemde lig geri sayıyor', (await lp.locator('.agenda [data-agenda="league"]').count()) === 1);
    const silent = await lp.evaluate(() => window.__capital.audio?.().context ?? 'kanca yok');
    check('Oyun açılınca dokunuşa kadar ses yok', silent === 'none', `bağlam: ${silent}`);

    // Arayüzden bir hamle: parsel al + dükkân kur → günlüğe düşmeli.
    const leagueTile = await lp.evaluate(() => {
      const s = window.__capital.getState();
      const t = s.map.tiles.find((x) => {
        const d = s.districts[x.districtId];
        return x.kind === 'plot' && !x.ownerId && !x.structureId && (d.opensOnDay === undefined || d.opensOnDay <= s.time.day);
      });
      window.__capital.engine.dispatch({ type: 'BUY_TILE', tileId: t.id });
      window.__capital.engine.dispatch({ type: 'BUILD', tileId: t.id, defId: 'corner_shop' });
      return t.id;
    });
    const logged = await lp.evaluate(() => window.__capital.getState().commandLog.length);
    check('Lig hamleleri günlüğe yazılıyor', logged === 2, `${logged} kayıt (kare ${leagueTile})`);

    const finished = await lp.evaluate(() => {
      const cap = window.__capital;
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      let guard = 0;
      while (cap.getState().league.finishedDay === undefined && guard++ < 400) cap.engine.runDay();
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const l = cap.getState().league;
      return { day: l.finishedDay, score: l.score, outcome: l.outcome };
    });
    check('360. günde lig koşusu bitiyor', finished.day === 360, `${finished.day}. gün · ${finished.outcome} · ${finished.score}`);
    const resultShown = await lp
      .waitForFunction(() => document.querySelector('.league-result') !== null, null, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check('Lig sonucu ekranı iniyor', resultShown);
    if (resultShown) {
      check('Lig sonucu ekranında şehir kartı düğmesi (Tur 64)', (await lp.locator('.league-result [data-city-card-open]').count()) === 1);
      await lp.locator('.league-result button:has-text("Tabloya")').click();
      await lp.waitForTimeout(300);
      await lp.locator('.league-result button:has-text("Tabloyu aç")').click();
      await lp.waitForSelector('[data-league-row]', { timeout: 5000 }).catch(() => null);
      const rows = await lp.locator('[data-league-row]').count();
      check('Skor tabloya yazılıyor', rows === 1, `${rows} satır`);
      check('Lig panelinde haftanın kuralı yazıyor, kuralsız haftada satır yok (Tur 53)',
        (await lp.locator('.league [data-league-rule]').count()) === (ruleShown.rule ? 1 : 0) &&
          (!ruleShown.rule || (await lp.locator(`.league [data-league-rule="${ruleShown.rule}"]`).count()) === 1),
        ruleShown.rule ?? 'bu hafta kuralsız');
      // Tur 31: düğme yok — panel açılınca satır bu tarayıcıda kendiliğinden
      // yeniden oynanıyor ve doğrulanınca sıralamaya giriyor.
      const autoVerified = await lp
        .waitForFunction(
          () => (document.querySelector('[data-league-row="ranked"] .league-verdict')?.textContent ?? '').includes('doğrulandı') || null,
          null,
          { timeout: 90000 },
        )
        .then(() => true)
        .catch(() => false);
      check('Koşu kendiliğinden yeniden oynanıp doğrulanıyor, sıralamaya giriyor', autoVerified,
        ((await lp.locator('[data-league-row]').first().textContent()) ?? '').trim().slice(0, 90));

      // Koşu kodunu çöz/kodla: sahte ve kopya satırlar bunlardan yapılıyor.
      const codes = await lp.evaluate(() => {
        const entries = JSON.parse(localStorage.getItem('capitalforge.league.local') ?? '[]');
        const code = entries.at(-1)?.code;
        if (!code) return null;
        const decode = (c) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(c.slice(4)), (ch) => ch.charCodeAt(0))));
        const encode = (run) => {
          let binary = '';
          for (const b of new TextEncoder().encode(JSON.stringify(run))) binary += String.fromCharCode(b);
          return 'CF1.' + btoa(binary);
        };
        const forged = decode(code);
        forged.score += 5_000_000;
        const copy = decode(code);
        copy.companyName = 'Kopya AŞ';
        return { forged: encode(forged), copy: encode(copy) };
      });
      const forgedCode = codes?.forged ?? null;

      // Sahte kod: skoru şişirilmiş bir koşu tekrarda tutmamalı.
      if (forgedCode) {
        await lp.locator('.league-paste textarea').fill(forgedCode);
        await lp.locator('.league-paste button:has-text("Tekrar oynat")').click();
        const forgedVerdict = await lp
          .waitForFunction(
            () => {
              const text = document.querySelector('.league-paste .manual-actions')?.textContent ?? '';
              return text.includes('doğrulandı') || text.includes('tutmadı') ? text : null;
            },
            null,
            { timeout: 90000 },
          )
          .then((h) => h.jsonValue())
          .catch(() => 'zaman aşımı');
        check('Şişirilmiş skorlu kod doğrulamadan geçemiyor', forgedVerdict.includes('tutmadı'), forgedVerdict.slice(0, 90));
      }

      /*
       * Tur 31: tabloda sahte ve kopya satır. Sahte satır (kodla birlikte
       * şişirilmiş skor) sıralamaya girmiyor, nedeniyle ayrı listede. Kopya
       * (aynı koşu, başka ad — ad simülasyonu değiştirmiyor) doğrulanıyor
       * ama bir kez sayılıyor.
       */
      if (codes) {
        await lp.evaluate(({ forged, copy }) => {
          const entries = JSON.parse(localStorage.getItem('capitalforge.league.local') ?? '[]');
          const honest = entries.at(-1);
          const later = new Date(Date.parse(honest.submittedAt) + 60_000).toISOString();
          entries.push({ ...honest, id: 'local-sahte', score: honest.score + 5_000_000, code: forged, submittedAt: later });
          entries.push({ ...honest, id: 'local-kopya', companyName: 'Kopya AŞ', code: copy, submittedAt: later });
          localStorage.setItem('capitalforge.league.local', JSON.stringify(entries));
          // Başka sekmeden gelmiş gibi: `storage` olayı yalnızca öteki sekmelerde kendiliğinden çıkıyor.
          window.dispatchEvent(new StorageEvent('storage', { key: 'capitalforge.league.local' }));
        }, codes);
        // Paneli kapatıp biten koşunun gündem çipinden yeniden aç.
        await lp.keyboard.press('Escape');
        await lp.waitForTimeout(200);
        const doneChip = await lp.locator('.agenda [data-agenda="league"]').count();
        check('Biten lig koşusunda tabloya gündemden dönülüyor', doneChip === 1, `${doneChip} çip`);
        if (doneChip === 1) await lp.locator('.agenda [data-agenda="league"] button').first().click();
        const settled = await lp
          .waitForFunction(
            () => document.querySelectorAll('[data-league-row="pending"]').length === 0 &&
              document.querySelectorAll('[data-league-row="copy"]').length + document.querySelectorAll('[data-league-table="rejected"]').length >= 2 || null,
            null,
            { timeout: 200000 },
          )
          .then(() => true)
          .catch(() => false);
        const table = await lp.evaluate(() => ({
          ranked: document.querySelectorAll('[data-league-row="ranked"]').length,
          copies: document.querySelectorAll('[data-league-row="copy"]').length,
          rejectedToggle: document.querySelector('[data-league-table="rejected"] button')?.textContent ?? '',
          topScore: document.querySelector('[data-league-row="ranked"] .league-score')?.textContent ?? '',
        }));
        check('Sahte satır sıralamaya girmiyor, nedeniyle ayrı listede', settled && table.ranked === 1 && table.rejectedToggle.includes('1'),
          `${table.ranked} sıralı · ${table.rejectedToggle} · tepe ${table.topScore}`);
        if (table.rejectedToggle) {
          await lp.locator('[data-league-table="rejected"] button').first().click();
          await lp.waitForTimeout(150);
        }
        const rejected = await lp.evaluate(() => ({
          kind: document.querySelector('[data-league-row="rejected"]')?.getAttribute('data-reject') ?? null,
          text: document.querySelector('[data-league-row="rejected"] .league-verdict')?.textContent ?? '',
        }));
        check('Sahte satırın nedeni: tekrar tutmadı, tekrarın skoru yazıyor', rejected.kind === 'replay' && rejected.text.includes('beyan'),
          `${rejected.kind} · ${rejected.text.slice(0, 90)}`);
        check('Kopya satır doğrulanıyor ama bir kez sayılıyor', table.copies === 1 && table.ranked === 1,
          `${table.copies} kopya · ${table.ranked} sıralı`);
      }
    }
    check('Lig akışında konsol temiz', leagueErrors.length === 0, leagueErrors.slice(0, 2).join(' | '));
    await leagueContext.close();
  }

  // ---------- Tohum Ligi: lig sunucusu (Tur 51) ----------
  //
  // Pages'teki oyun tabloyu Lite'ın sunucusundan okuyor. Burada yerel lig
  // sunucusu: aynı işleyici, bellekte SQLite. Beş tarayıcı: biri oynayıp
  // gönderiyor, biri aynı tabloyu görüyor, biri bağlantısızken gönderiyor,
  // biri sunucuya önce ulaşamıyor, sonra ulaşıyor, biri art arda iki oyun
  // açıyor. Koşular gerçek (360 gün motorun gün adımıyla).
  section('Tohum Ligi: lig sunucusu');
  {
    const LEAGUE_PORT = 8789;
    const leagueUrl = `http://127.0.0.1:${LEAGUE_PORT}`;
    let leagueServer = null;
    try {
      leagueServer = await startLeagueServer(LEAGUE_PORT);
    } catch (error) {
      check('Yerel lig sunucusu açılıyor', false, String(error));
    }
    // Bağlantısızlık ve kapalı adres tarayıcının kendi kaydına düşüyor; oyunun hatası değil.
    const network = (text) => /Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED/.test(text);
    const errors = [];
    const contexts = [];
    // Satır kodunun indirilmesi (Tur 52: sunucunun doğruladığı satırın kodu inmemeli).
    const codeRequests = [];
    // Bağlamın kaydı varsa oyun kurulum yerine kayıttan açılıyor (A'nın ikinci sayfası).
    const page = async (context, label, search = '') => {
      const p = await context.newPage();
      p.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
      p.on('request', (r) => {
        if (r.url().includes('/v1/seed/codes/')) codeRequests.push(label);
      });
      p.on('console', (m) => {
        if (m.type() === 'error' && !network(m.text())) errors.push(`${label}: ${m.text()}`);
      });
      await p.goto(`http://127.0.0.1:8811/${search}`);
      await p.waitForSelector('.newgame, .topbar', { timeout: 30000 });
      return p;
    };
    const open = async (url, label, search = '') => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      contexts.push(context);
      await context.addInitScript(veteran, TUTORIAL_KEY);
      await context.addInitScript((u) => {
        window.__capitalLeagueUrl = u;
      }, url);
      // Pencerenin bağlantı dinleyicileri (E: yeni oyunda eski tablo bırakılıyor mu).
      await context.addInitScript(() => {
        const listeners = new Set();
        window.__onlineListeners = listeners;
        const add = window.addEventListener;
        const remove = window.removeEventListener;
        window.addEventListener = function (type, listener, ...rest) {
          if (type === 'online') listeners.add(listener);
          return add.call(this, type, listener, ...rest);
        };
        window.removeEventListener = function (type, listener, ...rest) {
          if (type === 'online') listeners.delete(listener);
          return remove.call(this, type, listener, ...rest);
        };
      });
      return { context, p: await page(context, label, search) };
    };
    // Oyun sunucuyu 10 ve 30 sn sonra yeniden deniyor (her deneme en çok 10 sn):
    // yük altında üçüncü deneme ~70. saniyede.
    const serverBoard = (p) =>
      p
        .waitForSelector('[data-league-board="server"]', { timeout: 90000 })
        .then(() => 'server')
        .catch(() => 'yok');
    const startLeague = async (p, name) => {
      await p.locator('.mode-picker [data-mode="league"]').click();
      await p.fill('.newgame-field input[type="text"]', name);
      await p.locator('button:has-text("Şirketi kur")').click();
      await p.waitForSelector('.topbar', { timeout: 20000 });
    };
    // `nth`: kaçıncı boş arsa. Her tarayıcı başka bir oyun oynuyor: aynı hamleler
    // aynı skoru ve eğriyi verir, sunucu da onu başkasının kopyası sayar (Tur 52).
    const playLeague = (p, nth) =>
      p.evaluate((nth) => {
        const cap = window.__capital;
        const s = cap.getState();
        const t = s.map.tiles.filter((x) => {
          const d = s.districts[x.districtId];
          return x.kind === 'plot' && !x.ownerId && !x.structureId && (d.opensOnDay === undefined || d.opensOnDay <= s.time.day);
        })[nth];
        cap.engine.dispatch({ type: 'BUY_TILE', tileId: t.id });
        cap.engine.dispatch({ type: 'BUILD', tileId: t.id, defId: 'corner_shop' });
        cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        let guard = 0;
        while (cap.getState().league.finishedDay === undefined && guard++ < 400) cap.engine.runDay();
        cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        return { week: cap.getState().league.weekId, score: cap.getState().league.score };
      }, nth);
    const table = async (week) => {
      try {
        const response = await fetch(`${leagueUrl}/v1/seed/weeks/${week}`);
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    };
    const until = async (probe, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const value = await probe();
        if (value) return value;
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    };
    const verified = (p, timeout = 90000) =>
      p
        .waitForFunction(
          () => document.querySelectorAll('[data-league-row="ranked"]').length > 0 && document.querySelectorAll('[data-league-row="pending"]').length === 0 || null,
          null,
          { timeout },
        )
        .then(() => true)
        .catch(() => false);

    // Oyun sunucuyu açılışta tanıyor; sonuç ekranının düğmesi ona göre.
    const serverReady = (p) =>
      p
        .waitForFunction(() => (document.querySelector('.league-result .primary')?.textContent ?? '').includes('Lig tablosuna') || null, null, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);

    // Aynı anda tek sahne: GPU'suz ortamda açık her sahne aynı yazılımsal
    // GPU'yu ve dört çekirdeği paylaşıyor. İki sahne açıkken yerel sunucunun
    // cevabı da 10 sn'yi aşıyordu (tam koşuda). A'nın sayfası işi bitince
    // kapanıyor; hesabı silmek için aynı bağlamda (aynı anahtar) yeni sayfa.
    if (leagueServer) try {
      // A: oynuyor, sonuç ekranından sunucuya gönderiyor.
      const a = await open(leagueUrl, 'A');
      await startLeague(a.p, 'Sunucu Holding');
      const runA = await playLeague(a.p, 0);
      await a.p.waitForSelector('.league-result', { timeout: 5000 }).catch(() => null);
      await serverReady(a.p);
      const result = await a.p.evaluate(() => ({
        button: document.querySelector('.league-result .primary')?.textContent ?? '',
        note: document.querySelector('.league-server-note')?.textContent ?? '',
      }));
      check('Sonuç ekranı lig sunucusuna gönderiyor ve neyin paylaşıldığını yazıyor',
        result.button.includes('Lig tablosuna gönder') && /herkese açık/.test(result.note) && /e-posta/.test(result.note),
        `${result.button} · ${result.note.slice(0, 70)}`);
      await a.p.locator('.league-result .primary').click();
      // Sunucu koşuyu yeniden oynatıyor (Tur 52, ~2 sn; yük altında daha uzun): gönderimin zaman aşımı kadar.
      const sent = await a.p.waitForSelector('[data-league-sent]', { timeout: 30000 }).then((h) => h.textContent()).catch(() => '');
      const onServer = await until(async () => {
        const t = await table(runA.week);
        return t?.total === 1 ? t : null;
      });
      check('Koşu lig sunucusunda: şirket adı, skor, sunucunun saati',
        /lig tablosuna yazıldı/.test(sent ?? '') && onServer?.entries[0]?.companyName === 'Sunucu Holding' && onServer?.entries[0]?.score === runA.score,
        `${sent} · ${JSON.stringify(onServer?.entries[0] ?? null).slice(0, 120)}`);
      check('Tabloda oyuncunun kimliği yok, kodun yerine özeti var',
        onServer !== null && !('code' in onServer.entries[0]) && /^[0-9a-f]{64}$/.test(onServer.entries[0].codeKey ?? ''));

      // Tur 52: sunucu koşuyu yeniden oynatıyor; skoru şişirilmiş kod tabloya girmiyor.
      const forged = await (async () => {
        try {
          const { code } = await (await fetch(`${leagueUrl}/v1/seed/codes/${onServer.entries[0].codeKey}`)).json();
          const run = JSON.parse(Buffer.from(code.slice(4), 'base64').toString('utf8'));
          run.score *= 10;
          run.companyName = 'Şişik Holding';
          const forgedCode = `CF1.${Buffer.from(JSON.stringify(run), 'utf8').toString('base64')}`;
          const account = await (await fetch(`${leagueUrl}/v1/seed/players`, { method: 'POST' })).json();
          const reply = await fetch(`${leagueUrl}/v1/seed/runs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${account.id}.${account.token}` },
            body: JSON.stringify({ code: forgedCode }),
          });
          return { status: reply.status, body: await reply.json(), total: (await table(runA.week))?.total };
        } catch (error) {
          return { status: 0, body: String(error) };
        }
      })();
      check('Sunucu koşuyu yeniden oynatıyor: skoru şişirilmiş kod tabloya girmiyor (Tur 52)',
        forged.status === 422 && forged.body?.error === 'replay' && forged.total === 1, JSON.stringify(forged).slice(0, 120));

      await a.p.locator('.league-result button:has-text("Tabloyu aç")').click();
      const boardA = await a.p.locator('[data-league-board]').first().getAttribute('data-league-board').catch(() => null);
      const okA = await verified(a.p);
      const rowA = await a.p.evaluate(() => ({
        text: document.querySelector('[data-league-row="ranked"]')?.textContent ?? '',
        mine: document.querySelector('[data-league-row="ranked"]')?.classList.contains('mine') ?? false,
      }));
      // Tur 52: satır sunucuda doğrulanmış; tarayıcı kodu indirip yeniden oynatmıyor.
      rowA.codes = codeRequests.filter((label) => label === 'A').length;
      check('Tablo sunucunun; satır sunucuda doğrulanmış, tarayıcı yeniden oynatmıyor (kod inmiyor)',
        boardA === 'server' && okA && rowA.text.includes('doğrulandı') && rowA.mine && rowA.codes === 0,
        `${boardA} · ${rowA.text.trim().slice(0, 80)} · ${rowA.codes} kod indi`);

      // Tur 55: arkadaş ligi. A lig kuruyor; ligin tablosunda kendi koşusu, kodu ekranda.
      await a.p.fill('[data-league-friend-form="create"] input', 'Kuzey Ligi');
      await a.p.locator('[data-league-friend-form="create"] button').click();
      // Sunucu yanıtı ve ligin tablosu: yük altında (dört tarayıcı, yerel sunucu, yazılımsal GPU) 15 sn yetmeyebiliyor.
      const friendA = await a.p
        .waitForSelector('[data-league-row="friend"]', { timeout: 30000 })
        .then(() => a.p.evaluate(() => ({
          code: document.querySelector('.league-friend-code code')?.textContent ?? '',
          tab: document.querySelector('[data-league-friend][aria-selected="true"]')?.textContent ?? '',
          row: document.querySelector('[data-league-row="friend"]')?.textContent ?? '',
          mine: document.querySelector('[data-league-row="friend"]')?.classList.contains('mine') ?? false,
          message: document.querySelector('[data-league-friend-message]')?.textContent ?? '',
        })))
        .catch(() => null);
      check('Arkadaş ligi kuruluyor: kodu ekranda, ligin tablosunda kendi koşusu (Tur 55)',
        friendA !== null && /^[A-Z2-9]{6}$/.test(friendA.code) && friendA.tab.includes('Kuzey Ligi') && friendA.row.includes('Sunucu Holding') && friendA.mine && /kuruldu/.test(friendA.message),
        JSON.stringify(friendA).slice(0, 200));
      const friendCode = friendA?.code ?? '';
      await a.p.close();

      // B: başka bir tarayıcı aynı haftada: tablo aynı, satır onun değil, hayalet o.
      // B davet bağlantısıyla geliyor (Tur 55): kurulum Tohum Ligi'yle açılıyor, davet yazıyor.
      const b = await open(leagueUrl, 'B', friendCode ? `?lig=${friendCode}` : '');
      const inviteSetup = await b.p.evaluate(() => ({
        mode: document.querySelector('.mode-picker [data-mode="league"]')?.getAttribute('aria-checked') ?? '',
        invite: document.querySelector('.newgame [data-league-invite]')?.textContent ?? '',
      }));
      check('Davet bağlantısıyla kurulum Tohum Ligi\'yle açılıyor ve daveti yazıyor (Tur 55)',
        inviteSetup.mode === 'true' && inviteSetup.invite.includes(friendCode), JSON.stringify(inviteSetup));
      await startLeague(b.p, 'İkinci Holding');
      // Takvim dursun: panel açılırken oyun ilerlemesin.
      await b.p.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
      await b.p.locator('.agenda [data-agenda="league"] button').first().click();
      const boardB = await serverBoard(b.p);
      const okB = boardB === 'server' && (await verified(b.p));
      const rowB = await b.p.evaluate(() => ({
        text: document.querySelector('[data-league-row="ranked"]')?.textContent ?? '',
        mine: document.querySelector('[data-league-row="ranked"]')?.classList.contains('mine') ?? true,
        legend: document.querySelector('.league-legend')?.textContent ?? '',
        account: document.querySelector('[data-league-account]') !== null,
      }));
      check('Başka tarayıcı aynı tabloyu görüyor; satır onun değil, hayaleti o koşu',
        okB && rowB.text.includes('Sunucu Holding') && !rowB.mine && rowB.legend.includes('Sunucu Holding'), `${boardB} · ${rowB.text.trim().slice(0, 60)} · ${rowB.legend.trim().slice(0, 60)}`);
      check('Göndermeyen tarayıcıda lig hesabı açılmıyor', !rowB.account);

      // Tur 54: hayalet eğri. Liderin çizgisi grafikte; kart liderin hamlelerini
      // koşu kodundan okuyor (kod bir kez iniyor); grafikte gün seçilebiliyor.
      const movesReady = await b.p.waitForSelector('[data-league-moves="ready"]', { timeout: 20000 }).then(() => true).catch(() => false);
      // B'nin bugünü 0 ya da 1 (takvim durdurulana kadar bir gün geçebiliyor): liderin ilk günleri için kart 0. güne sabitleniyor.
      const todayB = await b.p.evaluate(() => window.__capital.getState().time.day);
      await b.p.locator('.league-sparks').focus();
      // Klavye ve fare sonrası 8 sn bekleniyor: yazılımsal GPU'da bir kare bir saniyeye yaklaşıyor,
      // tepki birkaç kare sürüyor (3 sn yetmiyordu).
      await b.p.keyboard.press('Home');
      await b.p.waitForSelector('[data-league-moves-day="0"][data-league-moves="ready"]', { timeout: 8000 }).catch(() => null);
      const curves = await b.p.evaluate(() => ({
        lines: [...document.querySelectorAll('[data-league-line]')].map((el) => el.getAttribute('data-league-line')),
        title: document.querySelector('.league-moves h4')?.textContent ?? '',
        moves: [...document.querySelectorAll('[data-league-move]')].map((el) => el.textContent ?? ''),
      }));
      check('Hayalet eğri: liderin çizgisi grafikte, kart liderin ilk günlerdeki hamlelerini koşu kodundan okuyor',
        movesReady && curves.lines.includes('ghost') && curves.title.includes('Sunucu Holding') && curves.moves.some((m) => m.includes('Arsa aldı')) && curves.moves.some((m) => m.includes('Bakkal kurdu')),
        `${curves.lines.join(',')} · ${curves.title} · ${curves.moves.join(' | ')}`);
      // Sabitleme bırakılıyor: kart yeniden bugünü anlatıyor.
      await b.p.keyboard.press('Escape');
      const chartBox = await b.p.locator('.league-sparks').boundingBox();
      const middle = { x: chartBox.x + chartBox.width * 0.5, y: chartBox.y + chartBox.height * 0.5 };
      await b.p.mouse.move(middle.x, middle.y);
      const tip = await b.p.waitForSelector('[data-league-tip]', { timeout: 8000 }).then((h) => h.textContent()).catch(() => '');
      check('Grafiğin üzerine gelince o günün değerleri: liderin 180. günü', /Gün 180/.test(tip ?? '') && (tip ?? '').includes('Sunucu Holding'), tip ?? '');
      await b.p.mouse.click(middle.x, middle.y);
      const pinned = await b.p
        .waitForSelector('[data-league-moves-day="180"]', { timeout: 8000 })
        .then(() => b.p.evaluate(() => ({
          title: document.querySelector('.league-moves h4')?.textContent ?? '',
          body: document.querySelector('.league-moves')?.textContent ?? '',
          tally: document.querySelector('[data-league-tally]')?.textContent ?? '',
          reset: document.querySelector('[data-league-focus-reset]') !== null,
        })))
        .catch(() => null);
      check('Grafikte gün seçilince kart o günleri anlatıyor: liderin o güne kadarki sayısı, ileride sen yoksun',
        pinned !== null && /gün 180–209/.test(pinned.title) && /hamle yok/.test(pinned.body) && /Sunucu Holding: 1 bina · 1 arsa · 0 kredi/.test(pinned.tally) && !/Sen:/.test(pinned.tally) && pinned.reset,
        JSON.stringify(pinned).slice(0, 220));
      await b.p.locator('[data-league-focus-reset]').click();
      await b.p.locator('.league-sparks').focus();
      await b.p.keyboard.press('ArrowRight');
      const byKey = await b.p.waitForSelector('[data-league-moves-day="10"]', { timeout: 8000 }).then(() => true).catch(() => false);
      // Gün seçiliyken Escape bugüne dönüyor, pencere açık kalıyor; ikinci Escape pencereyi kapatıyor.
      await b.p.keyboard.press('Escape');
      const back = await b.p.waitForSelector(`[data-league-moves-day="${todayB}"]`, { timeout: 8000 }).then(() => true).catch(() => false);
      await b.p.keyboard.press('Escape');
      const closed = await b.p.waitForSelector('.league-moves', { state: 'detached', timeout: 8000 }).then(() => true).catch(() => false);
      const codesB = codeRequests.filter((label) => label === 'B').length;
      check('Klavyeyle gün değişiyor; Escape önce bugüne dönüyor, sonra pencereyi kapatıyor; liderin kodu bir kez indi',
        byKey && back && closed && codesB === 1, `ok ${byKey}/${back}/${closed} · ${codesB} kod indi`);
      // Pencere yeniden açık: B davetle gelen koda katılıyor (alan dolu geliyor).
      await b.p.locator('.agenda [data-agenda="league"] button').first().click();
      await b.p.waitForSelector('[data-league-moves="ready"]', { timeout: 10000 }).catch(() => null);
      const prefilled = await b.p.inputValue('[data-league-friend-form="join"] input').catch(() => '');
      const invitedNote = await b.p.locator('.league-friends [data-league-invite]').textContent().catch(() => '');
      await b.p.locator('[data-league-friend-form="join"] button').click();
      const friendB = await b.p
        .waitForSelector('[data-league-row="friend"]', { timeout: 15000 })
        .then(() => b.p.evaluate(() => ({
          tab: document.querySelector('[data-league-friend][aria-selected="true"]')?.textContent ?? '',
          rows: [...document.querySelectorAll('[data-league-row="friend"]')].map((row) => row.textContent ?? ''),
          played: document.querySelector('.league-friend')?.textContent ?? '',
          search: location.search,
          account: document.querySelector('[data-league-account]') !== null,
        })))
        .catch(() => null);
      check('Davetle gelen koda katılıyor: ligin tablosunda arkadaşın koşusu; kod adresten kalkıyor (Tur 55)',
        prefilled === friendCode && (invitedNote ?? '').includes(friendCode) && friendB !== null && friendB.tab.includes('Kuzey Ligi') && friendB.tab.includes('2') &&
          friendB.rows.length === 1 && friendB.rows[0].includes('Sunucu Holding') && /2 üyeden 1 kişi/.test(friendB.played) && !friendB.search.includes('lig=') && friendB.account,
        JSON.stringify({ prefilled, note: (invitedNote ?? '').slice(0, 30), tab: friendB?.tab, rows: friendB?.rows.length, search: friendB?.search, account: friendB?.account }));
      // Codex #84: üye sayısı ligin tablosuyla tazeleniyor. Üçüncü oyuncu sunucudan katılıyor; B ligin sekmesine dokunuyor.
      const third = await (async () => {
        try {
          const account = await (await fetch(`${leagueUrl}/v1/seed/players`, { method: 'POST' })).json();
          const reply = await fetch(`${leagueUrl}/v1/seed/leagues/join`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${account.id}.${account.token}` },
            body: JSON.stringify({ code: friendCode }),
          });
          return reply.status;
        } catch {
          return 0;
        }
      })();
      await b.p.locator(`[data-league-friend="${friendCode}"]`).click();
      const fresh = await b.p
        .waitForFunction((code) => {
          const tab = document.querySelector(`[data-league-friend="${code}"]`)?.textContent ?? '';
          const box = document.querySelector('.league-friend')?.textContent ?? '';
          return tab.includes('· 3') && box.includes('3 üye') && /3 üyeden 1 kişi/.test(box) ? { tab, box: box.slice(0, 80) } : null;
        }, friendCode, { timeout: 10000 })
        .then((handle) => handle.jsonValue())
        .catch(() => null);
      const staleView = fresh ?? (await b.p.evaluate(() => (document.querySelector('.league-friend')?.textContent ?? '').slice(0, 120)));
      check('Üye sayısı ligin tablosuyla tazeleniyor: üçüncü üye katılınca sekme ve başlık 3 diyor (Codex #84)', third === 200 && fresh !== null,
        `${third} · ${JSON.stringify(staleView)}`);
      await b.p.screenshot({ path: path.join(OUT, 'playtest-lig-sunucu.png') });
      await b.context.close();

      // C: sonuç ekranında bağlantı yok: gönderim bekliyor, bağlantı gelince gidiyor.
      const c = await open(leagueUrl, 'C');
      await startLeague(c.p, 'Bekleyen Holding');
      const runC = await playLeague(c.p, 1);
      await c.p.waitForSelector('.league-result', { timeout: 5000 }).catch(() => null);
      await serverReady(c.p);
      await c.context.setOffline(true);
      await c.p.locator('.league-result .primary').click();
      const queued = await c.p.waitForSelector('[data-league-sent]', { timeout: 15000 }).then((h) => h.textContent()).catch(() => '');
      const notYet = await table(runC.week);
      check('Bağlantı yokken gönderim bekliyor ve oyuncuya söyleniyor', /bağlantı gelince/.test(queued ?? '') && notYet?.total === 1, `${queued} · sunucuda ${notYet?.total}`);
      await c.context.setOffline(false);
      const arrived = await until(async () => {
        const t = await table(runC.week);
        return t?.total === 2 ? t : null;
      }, 20000);
      check('Bağlantı gelince bekleyen koşu kendiliğinden gidiyor', arrived?.entries.some((e) => e.companyName === 'Bekleyen Holding') === true,
        `sunucuda ${arrived?.total ?? '?'} koşu`);
      await c.context.close();

      // A: lig hesabını siliyor; koşusu tablodan gidiyor, öbürü kalıyor. Aynı
      // tarayıcı (bağlam), yeni sayfa ve yeni bir lig koşusu: anahtar yerinde.
      a.p = await page(a.context, 'A2');
      if ((await a.p.locator('.newgame').count()) > 0) await startLeague(a.p, 'Sunucu Holding');
      await a.p.waitForSelector('.agenda [data-agenda="league"]', { timeout: 30000 });
      await a.p.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
      // Geri yüklenen bitmiş koşu (360. gün, ~175 bina): yazılımsal GPU'da bir kare bir saniyeye
      // yaklaşıyor, bu tıklama 9–10 sn sürebiliyor (ana dalda da).
      await a.p.locator('.agenda [data-agenda="league"] button').first().click({ timeout: 60000 });
      await serverBoard(a.p);
      // Tur 55: A'nın arkadaş ligi panelde (B de üyesi).
      const friendsBefore = await a.p.waitForSelector('[data-league-friend-table]', { timeout: 15000 }).then(() => true).catch(() => false);
      await a.p.waitForSelector('[data-league-forget="ask"]', { timeout: 10000 }).catch(() => null);
      await a.p.locator('[data-league-forget="ask"]').click();
      await a.p.locator('[data-league-forget="confirm"]').click();
      const left = await until(async () => {
        const t = await table(runA.week);
        return t?.total === 1 ? t : null;
      });
      const accountGone = await a.p.waitForFunction(() => document.querySelector('[data-league-account]') === null || null, null, { timeout: 5000 }).then(() => true).catch(() => false);
      // Hesap gidince arkadaş ligleri bölümü baştan: eski lig listesi kalmıyor; sunucuda lig B ile duruyor.
      const friendsAfter = await a.p.waitForSelector('[data-league-friends="0"]', { timeout: 15000 }).then(() => true).catch(() => false);
      check('Hesap silinince arkadaş ligleri panelden gidiyor (Tur 55)', friendsBefore && friendsAfter, `önce ${friendsBefore} · sonra ${friendsAfter}`);
      check('Lig hesabı siliniyor: koşusu sunucudan gidiyor, anahtar tarayıcıdan', left?.entries[0]?.companyName === 'Bekleyen Holding' && accountGone,
        `${left?.total ?? '?'} koşu kaldı`);
      await a.context.close();

      // D: sunucuya ulaşılamıyor: oyun yerel tabloyla açılıyor, sonuç ekranı
      // yerel tabloya yazıyor. Sunucu sonradan bulununca aynı ekrandan sunucuya
      // da gönderilebiliyor (Codex #80).
      const d = await open(`http://127.0.0.1:${LEAGUE_PORT + 1}`, 'D');
      await startLeague(d.p, 'Yerel Holding');
      await d.p.locator('.agenda [data-agenda="league"] button').first().click();
      const boardD = await d.p.locator('[data-league-board]').first().getAttribute('data-league-board').catch(() => null);
      check('Sunucuya ulaşılamayınca yerel tablo', boardD === 'local', String(boardD));
      await d.p.keyboard.press('Escape');
      const runD = await playLeague(d.p, 2);
      await d.p.waitForSelector('.league-result', { timeout: 5000 }).catch(() => null);
      await d.p.locator('.league-result .primary:has-text("Tabloya yaz")').click();
      const localSent = await d.p.waitForSelector('[data-league-sent]', { timeout: 10000 }).then((h) => h.textContent()).catch(() => '');
      const closedD = await d.p.locator('.league-result .primary').isDisabled();
      // Sunucu bulunuyor: adres değişiyor, bağlantı olayı tabloyu yeniden seçtiriyor.
      // İlk seçim kapalı adresi ~40 sn deniyor; o bitene kadar olay boşa düşüyor.
      let reopened = false;
      for (const end = Date.now() + 90000; !reopened && Date.now() < end; ) {
        reopened = await d.p.evaluate((u) => {
          window.__capitalLeagueUrl = u;
          window.dispatchEvent(new Event('online'));
          const button = document.querySelector('.league-result .primary');
          return Boolean(button && !button.disabled && (button.textContent ?? '').includes('Lig tablosuna gönder'));
        }, leagueUrl);
        if (!reopened) await new Promise((r) => setTimeout(r, 2000));
      }
      check('Yerel tabloya yazan sonuç ekranı sunucu bulununca yeniden gönderebiliyor',
        /bu tarayıcının tablosuna/.test(localSent ?? '') && closedD && reopened, `${localSent} · kapalı ${closedD} · açıldı ${reopened}`);
      let serverSent = '';
      if (reopened) {
        await d.p.locator('.league-result .primary').click();
        serverSent = await d.p
          .waitForFunction(() => /lig tablosuna yazıldı/.test(document.querySelector('[data-league-sent]')?.textContent ?? '') || null, null, { timeout: 15000 })
          .then(() => d.p.locator('[data-league-sent]').textContent())
          .catch(() => '');
      }
      const reachedD = await until(async () => {
        const t = await table(runD.week);
        return t?.entries.some((e) => e.companyName === 'Yerel Holding') ? t : null;
      });
      check('Aynı koşu sunucuda da', /lig tablosuna yazıldı/.test(serverSent ?? '') && reachedD !== null, `${serverSent} · sunucuda ${reachedD?.total ?? '?'} koşu`);
      await d.context.close();

      // E: oyun ekranı her açılışta yeni tablo kuruyor. Menüye dönülünce eski
      // tablo bırakılıyor; bırakılmazsa bağlantı dinleyicisi her oyunda birikiyor
      // ve her biri aynı bekleyen kuyruğu göndermeye kalkıyordu (Codex #80).
      const e = await open(leagueUrl, 'E');
      const freshGame = async (name) => {
        await startLeague(e.p, name);
        await e.p.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
        await e.p.locator('.agenda [data-agenda="league"] button').first().click();
        const kind = await serverBoard(e.p);
        await e.p.waitForTimeout(1000);
        const count = await e.p.evaluate(() => window.__onlineListeners.size);
        await e.p.keyboard.press('Escape');
        return { kind, count };
      };
      const firstE = await freshGame('Birinci Oyun Holding');
      await e.p.locator('.topbar-actions [data-panel="saves"]').click();
      await e.p.locator('.modal button', { hasText: 'Yeni oyun' }).click();
      await e.p.waitForSelector('.newgame', { timeout: 10000 });
      const secondE = await freshGame('İkinci Oyun Holding');
      check('Yeni oyunda eski tablo bırakılıyor: bağlantı dinleyicileri birikmiyor',
        firstE.kind === 'server' && secondE.kind === 'server' && secondE.count === firstE.count,
        `${firstE.kind} ${firstE.count} → ${secondE.kind} ${secondE.count}`);
      await e.context.close();
    } catch (error) {
      // Bölüm yarıda kalırsa koşunun geri kalanı sürsün; kalan bir kontrol olarak yazılıyor.
      check('Lig sunucusu bölümü sonuna kadar koşuyor', false, String(error).split('\n')[0]);
    }
    check('Lig sunucusu akışında konsol temiz', errors.length === 0, errors.slice(0, 2).join(' | '));
    for (const context of contexts) await context.close().catch(() => undefined);
    if (leagueServer) stopChild(leagueServer);
  }

  // ---------- Günün koşusu (Tur 53) ----------
  //
  // Kurulumun dördüncü türü: bugünün şehri, 90 gün, kuralsız. Koşu yerel lig
  // sunucusunun gün tablosuna gidiyor; sunucu yeniden oynatıyor.
  section('Günün koşusu');
  {
    const DAILY_PORT = 8793;
    const dailyUrl = `http://127.0.0.1:${DAILY_PORT}`;
    let dailyServer = null;
    try {
      dailyServer = await startLeagueServer(DAILY_PORT);
    } catch (error) {
      check('Yerel lig sunucusu açılıyor (günün koşusu)', false, String(error));
    }
    const dailyErrors = [];
    const network = (text) => /Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED/.test(text);
    const dailyContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await dailyContext.addInitScript(veteran, TUTORIAL_KEY);
    await dailyContext.addInitScript((u) => {
      window.__capitalLeagueUrl = u;
    }, dailyUrl);
    const dp = await dailyContext.newPage();
    dp.on('pageerror', (e) => dailyErrors.push(e.message));
    dp.on('console', (m) => { if (m.type() === 'error' && !network(m.text())) dailyErrors.push(m.text()); });
    if (dailyServer) try {
      await dp.goto('http://127.0.0.1:8811/');
      await dp.waitForSelector('.newgame', { timeout: 30000 });
      await dp.locator('.mode-picker [data-mode="daily"]').click();
      const setup = await dp.evaluate(() => ({
        label: document.querySelector('.mode-picker [data-mode="daily"]')?.textContent ?? '',
        detail: document.querySelector('[data-detail="daily"]')?.textContent ?? '',
        difficulty: document.querySelectorAll('.difficulty-option[data-difficulty]').length,
        modifiers: document.querySelectorAll('[data-modifier]').length,
      }));
      check('Kurulumda günün koşusu seçilebiliyor: 90 gün, zorluk ve ek kural seçimi yok',
        /Günün koşusu/.test(setup.label) && /90 gün/.test(setup.detail) && setup.difficulty === 0 && setup.modifiers === 0,
        `${setup.label} · ${setup.detail.slice(0, 70)}`);
      await dp.fill('.newgame-field input[type="text"]', 'Günlük Holding');
      await dp.locator('button:has-text("Şirketi kur")').click();
      await dp.waitForSelector('.topbar', { timeout: 20000 });
      const boot = await dp.evaluate(() => {
        const s = window.__capital.getState();
        return { id: s.league?.weekId, endDay: s.league?.endDay, modifiers: s.modifiers ?? null, today: new Date().toISOString().slice(0, 10) };
      });
      check('Günün koşusu bugünün kimliğiyle, 90 gün ve kuralsız başlıyor',
        boot.id === boot.today && boot.endDay === 90 && boot.modifiers === null, JSON.stringify(boot));
      const run = await dp.evaluate(() => {
        const cap = window.__capital;
        const s = cap.getState();
        const t = s.map.tiles.find((x) => {
          const d = s.districts[x.districtId];
          return x.kind === 'plot' && !x.ownerId && !x.structureId && (d.opensOnDay === undefined || d.opensOnDay <= s.time.day);
        });
        cap.engine.dispatch({ type: 'BUY_TILE', tileId: t.id });
        cap.engine.dispatch({ type: 'BUILD', tileId: t.id, defId: 'corner_shop' });
        cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        let guard = 0;
        while (cap.getState().league.finishedDay === undefined && guard++ < 200) cap.engine.runDay();
        cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        const l = cap.getState().league;
        return { day: l.finishedDay, score: l.score, curve: l.curve.length };
      });
      check('Günün koşusu 90. günde bitiyor', run.day === 90 && run.curve === 10, `${run.day}. gün · ${run.curve} örnek · ${run.score}`);
      await dp.waitForSelector('.league-result', { timeout: 5000 }).catch(() => null);
      const ready = await dp
        .waitForFunction(() => (document.querySelector('.league-result .primary')?.textContent ?? '').includes('Lig tablosuna') || null, null, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      check('Günün koşusunun sonucu lig sunucusuna gönderiliyor', ready);
      if (ready) {
        await dp.locator('.league-result .primary').click();
        const sent = await dp.waitForSelector('[data-league-sent]', { timeout: 30000 }).then((h) => h.textContent()).catch(() => '');
        const day = await (async () => {
          try {
            const response = await fetch(`${dailyUrl}/v1/seed/days/${boot.today}`);
            return response.ok ? await response.json() : null;
          } catch {
            return null;
          }
        })();
        const weekTable = await fetch(`${dailyUrl}/v1/seed/weeks/${encodeURIComponent(boot.today)}`).then((r) => r.status).catch(() => 0);
        check('Koşu sunucunun gün tablosunda, doğrulanmış; hafta ucu gün kimliğini almıyor',
          /lig tablosuna yazıldı/.test(sent ?? '') && day?.total === 1 && day.entries[0].score === run.score && day.entries[0].verified === true && weekTable === 400,
          `${sent} · ${JSON.stringify(day?.entries?.[0] ?? null).slice(0, 100)} · hafta ucu ${weekTable}`);
        await dp.locator('.league-result button:has-text("Tabloyu aç")').click();
        await dp.waitForSelector('[data-league-row="ranked"]', { timeout: 30000 }).catch(() => null);
        const panel = await dp.evaluate(() => ({
          title: document.querySelector('.league h3')?.textContent ?? '',
          ranked: document.querySelectorAll('[data-league-row="ranked"]').length,
          rule: document.querySelectorAll('.league [data-league-rule]').length,
        }));
        check('Panel bugünün tablosunu gösteriyor, kural satırı yok', /Bugünün tablosu/.test(panel.title) && panel.ranked === 1 && panel.rule === 0,
          `${panel.title} · ${panel.ranked} sıralı · kural ${panel.rule}`);
      }
    } catch (error) {
      check('Günün koşusu bölümü sonuna kadar koşuyor', false, String(error).split('\n')[0]);
    }
    check('Günün koşusu akışında konsol temiz', dailyErrors.length === 0, dailyErrors.slice(0, 2).join(' | '));
    await dailyContext.close().catch(() => undefined);
    if (dailyServer) stopChild(dailyServer);
  }

  // ---------- Senaryo modu (Tur 39) ----------
  section('Senaryo modu');
  {
    const scenarioContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await scenarioContext.addInitScript(veteran, TUTORIAL_KEY);
    const sp = await scenarioContext.newPage();
    const scenarioErrors = [];
    sp.on('pageerror', (e) => scenarioErrors.push(e.message));
    sp.on('console', (m) => { if (m.type() === 'error') scenarioErrors.push(m.text()); });
    await sp.goto('http://127.0.0.1:8811/');
    await sp.waitForSelector('.newgame', { timeout: 20000 });
    await sp.locator('.mode-picker [data-mode="scenario"]').click();
    const cards = await sp.locator('[data-scenario]').count();
    check('Kurulumda senaryo listesi: her senaryo bir kart, hepsi "Denenmedi"',
      cards >= 2 && (await sp.locator('[data-scenario-status]:has-text("Denenmedi")').count()) === cards, `${cards} kart`);
    check('Senaryoda zorluk, şehir boyutu ve rehber seçimi kalkıyor',
      (await sp.locator('.difficulty-option[data-difficulty]').count()) === 0
        && (await sp.locator('[data-city-size]').count()) === 0
        && (await sp.locator('[data-newgame-tutorial]').count()) === 0);
    await sp.locator('[data-scenario="crisis"]').click();
    const detail = ((await sp.locator('[data-detail="scenario"] .scenario-detail').textContent()) ?? '').trim();
    check('Seçilen senaryonun durumu, hedefi ve yıldız eşikleri yazıyor',
      /Kriz bittiğinde/.test(detail) && /üç yıldız: ×1,40/.test(detail) && /200\. günde başlıyor/.test(detail), detail.slice(0, 120));
    await sp.fill('.newgame-field input[type="text"]', 'Senaryo Holding');
    await sp.locator('[data-newgame-start]').click();
    await sp.waitForSelector('[data-scenario-brief="crisis"]', { timeout: 60000 });
    const brief = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return { day: s.time.day, speed: s.time.speed, crisis: s.crisis?.phase, tutorial: document.querySelector('.coach') !== null };
    });
    check('Ön tarihten sonra açılış ekranı: 200. gün, oyun duraklamış, durgunluk uyarıda',
      brief.day === 200 && brief.speed === 0 && brief.crisis === 'warning', JSON.stringify(brief));
    // Codex #66: boşluk tuşu açılış ekranının arkasında takvimi yürütmüyor.
    await sp.keyboard.press('Space');
    await sp.waitForTimeout(400);
    const held = await sp.evaluate(() => ({ speed: window.__capital.getState().time.speed, day: window.__capital.getState().time.day }));
    check('Açılış ekranı açıkken boşluk tuşu takvimi yürütmüyor', held.speed === 0 && held.day === 200, JSON.stringify(held));
    await sp.locator('[data-scenario-begin]').click();
    await sp.waitForTimeout(300);
    const begun = await sp.evaluate(() => {
      const c = window.__capital;
      const speed = c.getState().time.speed;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const locked = c.engine.dispatch({ type: 'SET_FLAG', flag: 'crises', value: false });
      return { speed, locked: locked.ok, reason: locked.reason ?? '' };
    });
    check('"Başla" takvimi yürütüyor; senaryoda kurallar kilitli', begun.speed === 1 && !begun.locked, `hız ${begun.speed} · ${begun.reason}`);
    await sp.waitForTimeout(300);
    const chip = ((await sp.locator('.agenda [data-agenda="scenario"]').textContent().catch(() => '')) ?? '').trim();
    check('Gündemde senaryo çipi: ad, öndelik ve geri sayım', /Krizin ortasında/.test(chip) && /150g/.test(chip), chip);
    await sp.locator('.agenda [data-agenda="scenario"] button').click();
    await sp.waitForTimeout(300);
    check('Senaryo çipi hedef panelini açıyor, senaryo bölümü başta',
      (await sp.locator('.modal [data-scenario-goals="crisis"]').count()) === 1);
    await sp.keyboard.press('Escape');

    // Bitiş: kriz bitiminde en değerli şirket — test parayı değil akışı ölçüyor.
    // Kazanılan senaryoda sonuç ekranı havai fişeklerden sonra (Tur 63, Codex #93):
    // bitişten ekrana geçen süre ve o sırada havai fişek sayfanın içinden ölçülüyor.
    const won = await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const trace = { finished: null, shown: null, fireworks: null };
      window.__scenarioTrace = trace;
      const observer = new MutationObserver(() => {
        if (trace.finished === null || !document.querySelector('[data-scenario-result="won"]')) return;
        trace.shown = Math.round(performance.now() - trace.finished);
        trace.fireworks = c.renderInfo().moments.fireworks.active;
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Üç yıldızın üstü ama zafer eşiğinin altı: zafer ekranı araya girmesin.
      s.companies[s.playerCompanyId].cash += 40_000_000;
      let guard = 0;
      while (s.scenario.finishedDay === undefined && guard++ < 200) c.engine.runDay();
      trace.finished = performance.now();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { day: s.scenario.finishedDay, outcome: s.scenario.outcome, stars: s.scenario.stars, crisis: s.crisis?.phase ?? 'bitti' };
    });
    check('Kriz bittiği gün senaryo bitiyor', won.day === 350 && won.crisis === 'bitti', JSON.stringify(won));
    await sp.waitForSelector('[data-scenario-result="won"]', { timeout: 12000 }).catch(() => null);
    const scenarioTrace = await sp.evaluate(() => window.__scenarioTrace);
    check('Kazanılan senaryoda sonuç ekranı havai fişeklerden sonra (~2,4 sn) iniyor (Codex #93)',
      scenarioTrace.shown !== null && scenarioTrace.shown >= 2200 && scenarioTrace.fireworks === true, JSON.stringify(scenarioTrace));
    const stars = await sp.locator('[data-scenario-result] [data-stars]').getAttribute('data-stars').catch(() => null);
    check('Sonuç ekranı: kazanıldı, üç yıldız, cihazdaki en iyi', stars === '3'
      && /en iyi sonucun/.test((await sp.locator('[data-scenario-best]').textContent().catch(() => '')) ?? ''), `yıldız ${stars}`);
    check('Sonuç beklerken zafer ve oyun sonu ekranı çıkmıyor', (await sp.locator('.gameover:not(.scenario-result)').count()) === 0);
    check('Senaryo sonucu ekranında şehir kartı düğmesi (Tur 64)', (await sp.locator('[data-scenario-result] [data-city-card-open]').count()) === 1);
    await sp.keyboard.press('Space');
    await sp.waitForTimeout(400);
    const resultHeld = await sp.evaluate(() => ({ speed: window.__capital.getState().time.speed, day: window.__capital.getState().time.day }));
    check('Sonuç ekranı açıkken boşluk tuşu takvimi yürütmüyor', resultHeld.speed === 0 && resultHeld.day === 350, JSON.stringify(resultHeld));
    const stored = await sp.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.scenarios.v1') ?? '{}'));
    check('En iyi sonuç bu cihazda saklanıyor', stored.crisis?.best?.stars === 3 && stored.crisis.attempts === 1, JSON.stringify(stored.crisis ?? null));
    await sp.reload();
    await sp.waitForSelector('[data-scenario-result="won"]', { timeout: 30000 }).catch(() => null);
    const again = await sp.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.scenarios.v1') ?? '{}').crisis?.attempts);
    check('Yenilenen sayfada sonuç ekranı geri geliyor (bitişte kayıt), koşu ikinci kez sayılmıyor',
      (await sp.locator('[data-scenario-result="won"]').count()) === 1 && again === 1, `${again} deneme`);
    await sp.locator('[data-scenario-continue]').click();
    await sp.waitForTimeout(300);
    const free = await sp.evaluate(() => {
      const c = window.__capital;
      const speed = c.getState().time.speed;
      const flag = c.engine.dispatch({ type: 'SET_FLAG', flag: 'crises', value: true }).ok;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { speed, flag, chip: document.querySelector('.agenda [data-agenda="scenario"]') !== null };
    });
    check('"Serbest oyuna devam": takvim yürüyor, kurallar açık, gündem çipi düşüyor', free.speed === 1 && free.flag && !free.chip, JSON.stringify(free));

    // Kayıp: Kurtarma'da baskıncı kontrolü alıyor.
    await sp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await sp.locator('.topbar-actions [data-panel="saves"]').click();
    await sp.waitForTimeout(300);
    await sp.locator('button:has-text("Yeni oyun")').first().click();
    await sp.waitForSelector('.newgame', { timeout: 10000 });
    check('Senaryodan dönen oyuncu listeye düşüyor, sonucu kartta',
      (await sp.locator('.mode-picker [data-mode="scenario"][aria-checked="true"]').count()) === 1
        && /★★★/.test((await sp.locator('[data-scenario="crisis"] [data-scenario-status]').textContent()) ?? ''));
    await sp.locator('[data-scenario="rescue"]').click();
    await sp.locator('[data-newgame-start]').click();
    await sp.waitForSelector('[data-scenario-brief="rescue"]', { timeout: 60000 });
    const rescue = await sp.evaluate(() => {
      const s = window.__capital.getState();
      const own = Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId).length;
      const raider = s.scenario.rivalId;
      return { day: s.time.day, own, stake: s.companies[raider]?.shares[s.playerCompanyId] ?? 0, debt: s.companies[s.playerCompanyId].debt };
    });
    check('Kurtarma: 150. gün, sekiz bina, baskıncı %30, kredi', rescue.day === 150 && rescue.own === 8 && rescue.stake === 3000 && rescue.debt > 0,
      JSON.stringify(rescue));
    await sp.locator('[data-scenario-begin]').click();
    await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      s.companies[s.scenario.rivalId].shares[s.playerCompanyId] = 5001;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await sp.waitForSelector('[data-scenario-result="lost"]', { timeout: 5000 }).catch(() => null);
    check('Devralınan oyuncu: kayıp ekranı, oyun sonu ekranı arkada bekliyor, devam düğmesi yok',
      (await sp.locator('[data-scenario-result="lost"]').count()) === 1
        && (await sp.locator('.gameover:not(.scenario-result)').count()) === 0
        && (await sp.locator('[data-scenario-continue]').count()) === 0);
    const lostAs = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return { name: s.companies[s.playerCompanyId].name, ceo: s.companies[s.playerCompanyId].ceoId };
    });
    await sp.locator('[data-scenario-replay]').click();
    await sp.waitForSelector('[data-scenario-brief="rescue"]', { timeout: 60000 }).catch(() => null);
    const replay = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return { day: s.time.day, over: s.gameOver !== undefined, name: s.companies[s.playerCompanyId].name, ceo: s.companies[s.playerCompanyId].ceoId };
    });
    check('"Baştan oyna" aynı senaryoyu aynı ad ve CEO ile yeniden kuruyor',
      replay.day === 150 && !replay.over && replay.name === lostAs.name && replay.ceo === lostAs.ceo, JSON.stringify(replay));
    // Tur 39b: Konsorsiyuma karşı, Zincir ustası, Şehrin sponsoru.
    // Bekleyen bir sonuç (kazanılan senaryoda havai fişekten sonra) ekrana gelsin.
    const pendingResult = (pg) => pg.waitForFunction(() => {
      const run = window.__capital?.getState()?.scenario;
      const pending = run !== undefined && run.finishedDay !== undefined && !run.resultSeen;
      return !pending || document.querySelector('[data-scenario-result]') !== null;
    }, null, { timeout: 12000 }).catch(() => null);
    const openScenario = async (id) => {
      await sp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
      await pendingResult(sp);
      if ((await sp.locator('[data-scenario-result]').count()) > 0) {
        // Sonuç ekranı açıksa listeye onun "Senaryolar" düğmesiyle.
        await sp.locator('[data-scenario-result] .gameover-actions button').last().click();
      } else {
        await sp.locator('.topbar-actions [data-panel="saves"]').click();
        await sp.waitForTimeout(300);
        await sp.locator('button:has-text("Yeni oyun")').first().click();
      }
      await sp.waitForSelector('.newgame', { timeout: 10000 });
      await sp.locator(`[data-scenario="${id}"]`).click();
      await sp.locator('[data-newgame-start]').click();
      await sp.waitForSelector(`[data-scenario-brief="${id}"]`, { timeout: 60000 });
    };
    await sp.locator('[data-scenario-begin]').click();
    await openScenario('consortium');
    const consortiumBrief = ((await sp.locator('[data-scenario-brief="consortium"]').textContent()) ?? '').trim();
    const consortiumState = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return {
        day: s.time.day,
        own: Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId).length,
        members: s.consortium?.memberIds.length ?? 0,
      };
    });
    check('Konsorsiyuma karşı: 200. gün, on iki şube, konsorsiyum kurulmuş; açılış ekranı önderi ve takvimi yazıyor',
      consortiumState.day === 200 && consortiumState.own === 12 && consortiumState.members >= 2
        && /Konsorsiyum: .+ ortak; ortak alım 30 gün sonra başlıyor/.test(consortiumBrief),
      `${JSON.stringify(consortiumState)} · ${consortiumBrief.slice(-90)}`);
    await sp.screenshot({ path: `${OUT}/scenario-consortium-brief.png` });
    await sp.locator('[data-scenario-begin]').click();
    const consortiumWon = await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      s.companies[s.playerCompanyId].cash += 2_000_000_000;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { outcome: s.scenario.outcome, stars: s.scenario.stars, victory: s.victory !== undefined, dismissed: s.victory?.dismissed === true };
    });
    await sp.waitForSelector('[data-scenario-result="won"]', { timeout: 12000 }).catch(() => null);
    check('Zafer hedefi: zafer günü senaryo kazanılıyor, zafer ekranı ayrıca çıkmıyor',
      consortiumWon.outcome === 'won' && consortiumWon.stars === 3 && consortiumWon.victory && consortiumWon.dismissed
        && (await sp.locator('.gameover:not(.scenario-result)').count()) === 0, JSON.stringify(consortiumWon));
    await sp.locator('[data-scenario-continue]').click();
    await sp.waitForTimeout(300);
    check('"Serbest oyuna devam"dan sonra da zafer ekranı araya girmiyor', (await sp.locator('.gameover').count()) === 0);

    await openScenario('chain');
    await sp.locator('[data-scenario-begin]').click();
    await sp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await sp.locator('.agenda [data-agenda="scenario"] button').click();
    await sp.waitForTimeout(300);
    const chainItems = await sp.locator('.modal [data-scenario-goals="chain"] [data-chain-item]').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-chain-item')}:${el.getAttribute('data-done')}:${(el.textContent ?? '').trim()}`));
    check('Zincir ustası: hedef panelinde beş koşul (üç halka, maliyet, pay), başta hiçbiri sağlanmamış',
      chainItems.length === 5 && chainItems.every((item) => item.split(':')[1] === '0')
        && /üretimi/.test(chainItems[0] ?? '') && /rafta/.test(chainItems[2] ?? '') && /payı %\d+ · hedef %40/.test(chainItems[4] ?? ''),
      chainItems.join(' | '));
    await sp.locator('.modal [data-scenario-goals="chain"]').screenshot({ path: `${OUT}/scenario-chain-goals.png` });
    await sp.keyboard.press('Escape');

    await openScenario('sponsor');
    const sponsorBrief = ((await sp.locator('[data-scenario-brief="sponsor"]').textContent()) ?? '').trim();
    check('Şehrin sponsoru: açılış ekranı ilk ihalenin gününü yazıyor', /İlk ihale 10 gün sonra açılıyor/.test(sponsorBrief), sponsorBrief.slice(-90));
    await sp.locator('[data-scenario-begin]').click();
    const dropped = await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (const rival of Object.values(s.companies).filter((x) => !x.isPlayer).slice(0, 2)) rival.cash += 200_000_000;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { out: s.scenario.outOfRankDay !== undefined, finished: s.scenario.finishedDay ?? null };
    });
    await sp.locator('.agenda [data-agenda="scenario"] button').click();
    await sp.waitForTimeout(300);
    const sponsorDetail = ((await sp.locator('.modal [data-scenario-goals="sponsor"] .goal-detail').textContent().catch(() => '')) ?? '').trim();
    check('İlk ikiden düşünce senaryo sürüyor; hedef paneli geri dönüş süresini yazıyor',
      dropped.out && dropped.finished === null && /ilk 2 arasına dönmek için 20 gün/.test(sponsorDetail), `${JSON.stringify(dropped)} · ${sponsorDetail}`);
    await sp.keyboard.press('Escape');
    // Kaybedildiği gün normal bir zafer de geliyor (Codex #93): kutlama zaferin, kayıp ekranı
    // da havai fişeklerden sonra; bitişten ekrana süre ve o sırada havai fişek sayfanın içinden.
    await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const trace = { finished: null, shown: null, fireworks: null };
      window.__scenarioTrace = trace;
      const observer = new MutationObserver(() => {
        if (trace.finished === null || !document.querySelector('[data-scenario-result="lost"]')) return;
        trace.shown = Math.round(performance.now() - trace.finished);
        trace.fireworks = c.renderInfo().moments.fireworks.active;
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      let guard = 0;
      while (s.scenario.finishedDay === undefined && guard++ < 40) c.engine.runDay();
      s.victory = { day: s.time.day, kind: 'tycoon', path: 'retail', shares: { retail: 1, realestate: 0, energy: 0, freight: 0 }, acquisitions: 0 };
      trace.finished = performance.now();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await sp.waitForSelector('[data-scenario-result="lost"]', { timeout: 12000 }).catch(() => null);
    const lostTrace = await sp.evaluate(() => window.__scenarioTrace);
    check('Aynı gün zafer gelen kayıpta sonuç ekranı havai fişeklerden sonra iniyor (Codex #93)',
      lostTrace.shown !== null && lostTrace.shown >= 2200 && lostTrace.fireworks === true, JSON.stringify(lostTrace));
    // Denemenin zaferi kapanıyor: sonraki senaryoyu açarken zafer ekranı araya girmesin.
    await sp.evaluate(() => {
      const s = window.__capital.getState();
      if (s.victory) s.victory.dismissed = true;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const sponsorReason = await sp.locator('[data-scenario-reason]').getAttribute('data-scenario-reason').catch(() => null);
    const sponsorText = ((await sp.locator('[data-scenario-reason]').textContent().catch(() => '')) ?? '').trim();
    check('20 gün içinde dönmeyen kaybediyor; sonuç ekranı nedeni yazıyor',
      sponsorReason === 'rank' && /ilk 2 şirketin dışına düştü ve 20 gün içinde geri dönemedi/.test(sponsorText), `${sponsorReason} · ${sponsorText}`);
    await sp.screenshot({ path: `${OUT}/scenario-sponsor-lost.png` });
    // Tur 39c: Büyük şehir fethi, Holding: iki şehir.
    const preludeStart = Date.now();
    await openScenario('conquest');
    const preludeMs = Date.now() - preludeStart;
    const conquestBrief = ((await sp.locator('[data-scenario-brief="conquest"]').textContent()) ?? '').trim();
    const conquestState = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return {
        size: s.citySize,
        day: s.time.day,
        rivals: Object.values(s.companies).filter((c) => !c.isPlayer).length,
        entry: s.flags.rivalEntry,
        issuance: s.flags.issuance,
      };
    });
    check('Büyük şehir fethi: büyük şehirde 200. gün, sekiz rakip; ruhsat ve ihraç dondurulmuş, açılış ekranı yazıyor',
      conquestState.size === 'large' && conquestState.day === 200 && conquestState.rivals === 8 && conquestState.entry === false
        && conquestState.issuance === false && /8 rakip var; yeni şirket ruhsatı ve hisse ihracı donduruldu/.test(conquestBrief),
      `${JSON.stringify(conquestState)} · ön tarih ${preludeMs} ms`);
    check('Büyük şehrin 200 günlük ön tarihi bir dakikadan kısa', preludeMs < 60_000, `${preludeMs} ms`);
    await sp.locator('[data-scenario-begin]').click();
    const deferred = await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
      s.companies[s.playerCompanyId].cash += 2_000_000_000;
      c.engine.runDay();
      const out = { victory: s.victory?.kind ?? null, dismissed: s.victory?.dismissed === true, speed: s.time.speed, finished: s.scenario.finishedDay ?? null };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return out;
    });
    await sp.waitForTimeout(300);
    const conquestChip = ((await sp.locator('.agenda [data-agenda="scenario"]').textContent().catch(() => '')) ?? '').trim();
    check('Tekel beklenirken değer zaferi oyunu durdurmuyor, zafer ekranı açılmıyor; gündem kalan rakibi yazıyor',
      deferred.victory === 'tycoon' && deferred.dismissed && deferred.speed === 1 && deferred.finished === null
        && (await sp.locator('.gameover').count()) === 0 && /0\/8 · 8 rakip kaldı/.test(conquestChip),
      `${JSON.stringify(deferred)} · ${conquestChip}`);

    await openScenario('holding');
    const holdingBrief = ((await sp.locator('[data-scenario-brief="holding"]').textContent()) ?? '').trim();
    const holdingState = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return { day: s.time.day, city: s.cityName, away: s.holding?.dormant.map((d) => d.state.cityName) ?? [], awayDay: s.holding?.dormant[0]?.state.time.day };
    });
    check('Holding: iki şehir — yeni şehrin ilk günü, kurucu şehir 150. günde uzakta; açılış ekranı ikisini de yazıyor',
      holdingState.day === 0 && holdingState.away.length === 1 && holdingState.awayDay === 150
        && holdingBrief.includes(`yeni şehir ${holdingState.city}`) && new RegExp(`Kurucu şehir ${holdingState.away[0]} uzakta: değer .+, \\d\\. sırada`).test(holdingBrief),
      `${JSON.stringify(holdingState)} · ${holdingBrief.slice(-110)}`);
    await sp.screenshot({ path: `${OUT}/scenario-holding-brief.png` });
    await sp.locator('[data-scenario-begin]').click();
    await sp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 5; i++) c.engine.runDay();
    });
    await sp.locator('.agenda [data-agenda="scenario"] button').click();
    await sp.waitForTimeout(300);
    const cityItems = await sp.locator('.modal [data-scenario-goals="holding"] [data-holding-city]').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-holding-city')}:${(el.textContent ?? '').trim()}`));
    check('Hedef panelinde iki şehrin zafer durumu, oynanan şehir başta',
      cityItems.length === 2 && cityItems[0].startsWith('active:') && cityItems[0].includes(holdingState.city) && cityItems[1].startsWith('away:'),
      cityItems.join(' | '));
    await sp.locator('.modal [data-scenario-goals="holding"]').screenshot({ path: `${OUT}/scenario-holding-goals.png` });
    await sp.keyboard.press('Escape');
    const leftBefore = await sp.evaluate(() => window.__capital.getState().scenario.endDay - window.__capital.getState().time.day);
    await sp.locator('[data-city-chip]').click();
    await sp.waitForTimeout(300);
    await sp.locator('.city-row:not(.current) .city-switch').first().click();
    await sp.waitForTimeout(900);
    const switched = await sp.evaluate(() => {
      const s = window.__capital.getState();
      return {
        city: s.cityName,
        scenario: s.scenario?.id ?? null,
        left: s.scenario ? s.scenario.endDay - s.time.day : null,
        awayScenario: s.holding?.dormant[0]?.state.scenario?.id ?? null,
        chip: document.querySelector('.agenda [data-agenda="scenario"]') !== null,
      };
    });
    check('Şehir değişince senaryo oyuncuyla geliyor: kalan süre aynı, gündem çipi yerinde',
      switched.city === holdingState.away[0] && switched.scenario === 'holding' && switched.left === leftBefore && switched.awayScenario === null && switched.chip,
      JSON.stringify(switched));
    await sp.keyboard.press('Escape');
    await sp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory = { day: s.time.day, kind: 'tycoon', dismissed: true };
      s.holding.dormant[0].state.victory = { day: s.holding.dormant[0].state.time.day, kind: 'tycoon' };
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await sp.waitForSelector('[data-scenario-result="won"]', { timeout: 12000 }).catch(() => null);
    check('İki şehirde de zafer: senaryo kazanılıyor, zafer ekranı araya girmiyor',
      (await sp.locator('[data-scenario-result="won"]').count()) === 1 && (await sp.locator('.gameover:not(.scenario-result)').count()) === 0);
    // Tur 39c: uzun açılış telefonda ekrana sığmıyordu; katman kaymıyor, "Başla" düğmesine ulaşılamıyordu.
    {
      const phoneContext = await browser.newContext({ ...devices['iPhone 13'] });
      await phoneContext.addInitScript(veteran, TUTORIAL_KEY);
      const pp = await phoneContext.newPage();
      pp.on('pageerror', (e) => scenarioErrors.push(e.message));
      await pp.goto('http://127.0.0.1:8811/');
      await pp.waitForSelector('.newgame', { timeout: 20000 });
      await pp.locator('.mode-picker [data-mode="scenario"]').click();
      await pp.locator('[data-scenario="holding"]').click();
      await pp.locator('[data-newgame-start]').click();
      await pp.waitForSelector('[data-scenario-brief="holding"]', { timeout: 60000 });
      await pp.waitForTimeout(500);
      const overflow = await pp.evaluate(() => {
        const layer = document.querySelector('[data-scenario-brief]');
        const card = layer.querySelector('.gameover-card');
        return { layer: layer.clientHeight, card: card.scrollHeight, top: card.getBoundingClientRect().top };
      });
      await pp.locator('[data-scenario-begin]').scrollIntoViewIfNeeded();
      await pp.locator('[data-scenario-begin]').click();
      await pp.waitForTimeout(300);
      const begun = await pp.evaluate(() => window.__capital.getState().scenario.briefSeen === true);
      check('Telefonda ekrana sığmayan açılışın başı görünüyor, katman kayıyor, "Başla" düğmesine ulaşılıyor',
        overflow.card > overflow.layer && overflow.top >= 0 && begun, JSON.stringify(overflow));
      await phoneContext.close();
    }
    check('Senaryo akışında konsol temiz', scenarioErrors.length === 0, scenarioErrors.slice(0, 2).join(' | '));
    await scenarioContext.close();
  }

  // ---------- Cila (Tur 40) ----------
  section('Cila: glifler, konsol, telefon taraması, senaryo sonları');
  {
    const appWarnings = [];
    const polishErrors = [];
    const phone = await browser.newContext({ ...devices['iPhone SE'] });
    await phone.addInitScript(veteran, TUTORIAL_KEY);
    const pp = await phone.newPage();
    pp.on('pageerror', (e) => polishErrors.push(e.message));
    pp.on('console', (m) => {
      if (m.type() === 'error') polishErrors.push(m.text());
      // Sürücü mesajları (yazılımsal GPU) ortamın; uygulamanın kendi uyarıları sayılıyor.
      // Playwright'ın kendi uyarısı sayılmıyor: hizmet çalışanı bu bağlamda
      // kapalı (Tur 48), kaydı engellerken konsola kendisi yazıyor.
      if (m.type() === 'warning' && !m.text().includes('GL Driver Message') && !m.text().includes('Service Worker registration blocked by Playwright')) {
        appWarnings.push(m.text());
      }
    });
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    // Fredoka Türkçe'nin beş harfini taşımıyordu; harf Nunito'ya düşüyordu.
    const glyphs = await pp.evaluate(async () => {
      await document.fonts.load("700 40px 'Fredoka'", 'ŞşĞğİ');
      const ctx = document.createElement('canvas').getContext('2d');
      return [...'ŞşĞğİ'].filter((ch) => {
        ctx.font = "700 40px 'Fredoka', monospace";
        const own = ctx.measureText(ch).width;
        ctx.font = '700 40px monospace';
        return Math.abs(own - ctx.measureText(ch).width) < 0.01;
      });
    });
    check('Başlık yazı tipinde Türkçe harfler var (Ş ş Ğ ğ İ yedek yazı tipine düşmüyor)', glyphs.length === 0, glyphs.length ? `eksik: ${glyphs.join(' ')}` : '');
    const setup = await reachable(pp, '.newgame');
    await pp.locator('.mode-picker [data-mode="scenario"]').click();
    const list = await reachable(pp, '.newgame');
    check('iPhone SE: kurulumun ve senaryo listesinin her düğmesine ulaşılıyor', setup.bad.length === 0 && list.bad.length === 0,
      `${setup.count + list.count} düğme · ${[...setup.bad, ...list.bad].join(', ')}`);
    await pp.locator('.mode-picker [data-mode="free"]').click();
    await pp.locator('button:has-text("Şirketi kur")').click();
    await pp.waitForSelector('.topbar', { timeout: 30000 });
    await pp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const s = c.getState();
      const tile = s.map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.ownerId && !t.buildingId && s.districts[t.districtId].opensOnDay === undefined);
      c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
      c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'grocery' });
      for (let i = 0; i < 20; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const panelBad = [];
    let panelCount = 0;
    for (const panel of ['chain', 'rivalry', 'bourse', 'council', 'company', 'rivals', 'saves', 'help']) {
      await pp.locator(`[data-panel="${panel}"]`).click();
      await pp.waitForTimeout(250);
      const r = await reachable(pp, '.modal');
      panelCount += r.count;
      panelBad.push(...r.bad.map((b) => `${panel}: ${b}`));
      await pp.keyboard.press('Escape');
      await pp.waitForTimeout(150);
    }
    check('iPhone SE: sekiz panelin her düğmesine ulaşılıyor', panelBad.length === 0, `${panelCount} düğme · ${panelBad.slice(0, 3).join(', ')}`);
    await pp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.card = { defId: 'viral_video', offeredDay: s.time.day, deadlineDay: s.time.day + 10, amount: 20000, category: 'grocery' };
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await pp.waitForTimeout(300);
    const card = await reachable(pp, '.decision-card');
    await pp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      delete s.card;
      s.victory = { day: s.time.day, kind: 'tycoon' };
      // Komut arayüzü yeniden çizdiriyor (durumu elle değiştirmek çizdirmiyor).
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    // Zafer ekranı havai fişeklerden sonra açılıyor (Tur 63).
    await pp.waitForSelector('.gameover.victory', { timeout: 6000 }).catch(() => {});
    const victory = await reachable(pp, '.gameover.victory');
    await pp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'DISMISS_VICTORY' });
      const s = c.getState();
      s.gameOver = { day: s.time.day, byCompanyId: Object.keys(s.companies).find((id) => id !== s.playerCompanyId) };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await pp.waitForTimeout(400);
    const over = await reachable(pp, '.gameover');
    check('iPhone SE: karar kartı, zafer ve oyun sonu ekranının her düğmesine ulaşılıyor',
      card.count > 0 && victory.count > 0 && over.count > 0 && [...card.bad, ...victory.bad, ...over.bad].length === 0,
      `${card.count}/${victory.count}/${over.count} düğme · ${[...card.bad, ...victory.bad, ...over.bad].join(', ')}`);

    // Yedi senaryo: açılış ve sonuç telefonda erişilebilir; koşu tarayıcıda sonuna kadar akıyor.
    const runs = [];
    for (const id of ['rescue', 'crisis', 'consortium', 'chain', 'sponsor', 'conquest', 'holding']) {
      await pp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
      // Oyun sonu ya da senaryo sonucu açık: son düğmesi kuruluma döndürüyor ("Yeni şirket", "Senaryolar").
      await pp.locator('.gameover .gameover-actions button').last().click();
      await pp.waitForSelector('.newgame', { timeout: 20000 });
      await pp.locator('.mode-picker [data-mode="scenario"]').click();
      await pp.locator(`[data-scenario="${id}"]`).click();
      await pp.locator('[data-newgame-start]').click();
      await pp.waitForSelector(`[data-scenario-brief="${id}"]`, { timeout: 120000 });
      await pp.waitForTimeout(300);
      const brief = await reachable(pp, `[data-scenario-brief="${id}"]`);
      await pp.locator('[data-scenario-begin]').click();
      const run = await pp.evaluate(() => {
        const c = window.__capital;
        c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        const start = c.getState().scenario.startDay;
        const t0 = performance.now();
        let days = 0;
        while (c.getState().scenario.finishedDay === undefined && days < 700) {
          c.engine.runDay();
          days++;
        }
        const s = c.getState();
        return { days, ms: (performance.now() - t0) / Math.max(1, days), outcome: s.scenario.outcome, reason: s.scenario.lostReason ?? null, day: s.scenario.finishedDay - start };
      });
      await pp.waitForSelector('[data-scenario-result]', { timeout: 10000 }).catch(() => null);
      await pp.waitForTimeout(300);
      const result = await reachable(pp, '[data-scenario-result]');
      runs.push({ id, ...run, brief: brief.bad.length === 0 && brief.count > 0, result: result.bad.length === 0 && result.count > 0 });
    }
    const line = runs.map((r) => `${r.id} ${r.outcome}${r.reason ? `/${r.reason}` : ''} ${r.day}g ${r.ms.toFixed(0)}ms/g`).join(' · ');
    check('Yedi senaryo tarayıcıda sonuna kadar akıyor; el sürmeyen her senaryoyu kaybediyor', runs.every((r) => r.outcome === 'lost' && r.days < 700), line);
    check('iPhone SE: yedi senaryonun açılış ve sonuç ekranının her düğmesine ulaşılıyor', runs.every((r) => r.brief && r.result),
      runs.filter((r) => !r.brief || !r.result).map((r) => r.id).join(', '));
    check('Senaryo günleri tarayıcıda akıcı (gün başına 120 ms altında)', runs.every((r) => r.ms < 120), line);
    check('Uygulamanın kendi konsol uyarısı yok (three.js dahil)', appWarnings.length === 0, appWarnings.slice(0, 2).join(' | '));
    check('Cila akışında konsol temiz', polishErrors.length === 0, polishErrors.slice(0, 2).join(' | '));
    await phone.close();
  }

  // ---------- Kariyer (Tur 41) ----------
  section('Kariyer: rozetler, bildirim, kalıcılık, telefon');
  {
    const careerErrors = [];
    const watch = (page) => {
      page.on('pageerror', (e) => careerErrors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') careerErrors.push(m.text());
      });
    };
    /*
     * Bildirimler 3,6 sn yaşıyor; oyun yeni açılmışken yazılımsal GPU ana
     * iş parçacığını tutunca yoklama onu kaçırabiliyordu. Sayfaya eklenen
     * her bildirim bir günlüğe yazılıyor, kontrol günlüğe bakıyor.
     */
    const toastLog = () => {
      window.__toastLog = [];
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1 && node.classList.contains('toast')) window.__toastLog.push(node.textContent);
          }
        }
      }).observe(document, { childList: true, subtree: true });
    };
    const toastSeen = (page, text) =>
      page
        .waitForFunction((t) => window.__toastLog?.find((line) => line.includes(t)), text, { timeout: 8000 })
        .then((handle) => handle.jsonValue())
        .catch(() => '');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(veteran, TUTORIAL_KEY);
    await ctx.addInitScript(toastLog);
    const cp = await ctx.newPage();
    watch(cp);
    await cp.goto('http://127.0.0.1:8811/');
    await cp.waitForSelector('.newgame', { timeout: 20000 });
    const setupButton = (await cp.locator('.newgame [data-career-open]').textContent()) ?? '';
    await cp.locator('.newgame [data-career-open]').click();
    await cp.waitForSelector('.career-overlay [data-career]');
    const empty = await cp.evaluate(() => ({
      total: document.querySelectorAll('[data-achievement]').length,
      done: document.querySelectorAll('[data-achievement][data-done="true"]').length,
      runs: document.querySelectorAll('.career-run').length,
    }));
    check('Kurulumda Kariyer açılıyor: 29 rozet, hiçbiri kazanılmamış, koşu yok',
      setupButton.includes('0/29') && empty.total === 29 && empty.done === 0 && empty.runs === 0, `${setupButton} · ${JSON.stringify(empty)}`);
    await cp.locator('.career-overlay .modal-head button.icon').click();

    await cp.locator('[data-newgame-start]').click();
    await cp.waitForFunction(() => window.__capital?.getState?.().time.day >= 0, null, { timeout: 60000 });
    // İlk devralma: sayaç günün sonunda okunuyor, bildirim hemen.
    await cp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const s = c.getState();
      s.companies[s.playerCompanyId].acquisitions = 1;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const toastText = await toastSeen(cp, 'İlk devralma');
    const stored = await cp.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}'));
    check('Rozet açılınca bildirim çıkıyor ve hemen cihaza yazılıyor',
      (toastText ?? '').includes('Rozet kazandın') && Boolean(stored.unlocked?.first_takeover) && stored.runs?.length === 1,
      `${toastText} · ${Object.keys(stored.unlocked ?? {}).join(',')}`);

    // Duraklatılmış oyunda aynı gün: halka arz günü değiştirmiyor, rozet yine hemen (Codex #70).
    await cp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.companies[s.playerCompanyId].issues = 1;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const sameDay = await toastSeen(cp, 'Borsada');
    const dayNow = await cp.evaluate(() => window.__capital.getState().time.day);
    check('Duraklatılmış oyunda aynı gün açılan rozet de hemen bildiriliyor', (sameDay ?? '').includes('Borsada') && dayNow === 1, `${sameDay} · gün ${dayNow}`);

    await cp.locator('.goal-chip').first().click();
    const goalsButton = (await cp.locator('.goals [data-career-open]').textContent()) ?? '';
    await cp.locator('.goals [data-career-open]').click();
    await cp.waitForSelector('.modal [data-career]');
    const badge = await cp.evaluate(() => {
      const el = document.querySelector('[data-achievement="first_takeover"]');
      return { done: el?.getAttribute('data-done'), when: el?.querySelector('.career-badge-when')?.textContent ?? '', runs: document.querySelectorAll('.career-run').length };
    });
    check('Hedefler panelinden Kariyer açılıyor; kazanılan rozet, açıldığı gün ve koşu satırı',
      goalsButton.includes('2/29') && badge.done === 'true' && badge.when.includes('1. gün') && badge.runs === 1, `${goalsButton} · ${JSON.stringify(badge)}`);
    await cp.locator('.modal-head button.icon').click();

    // Zafer: ekran bu koşuda kazanılan rozetleri yazıyor (zaferin kendisi dahil).
    await cp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory = { day: s.time.day, kind: 'tycoon' };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const runLine = await cp
      .waitForSelector('.gameover.victory [data-career-run-line]', { timeout: 8000 })
      .then((el) => el.textContent())
      .catch(() => '');
    check('Zafer ekranı bu koşunun rozetlerini yazıyor', (runLine ?? '').includes('Şehrin sahibi') && (runLine ?? '').includes('İlk devralma'), runLine ?? '');
    await cp.locator('.gameover.victory .gameover-actions button.primary').click();
    await cp.reload();
    await cp.waitForFunction(() => window.__capital?.getState?.() || document.querySelector('.newgame'), null, { timeout: 60000 });
    const kept = await cp.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}').unlocked ?? {}));
    check('Rozetler sayfa yenilenince yerinde', kept.includes('first_takeover') && kept.includes('first_victory'), kept.join(','));
    await ctx.close();

    // İngilizce kurulum: düğme ve rozet adları çevrilmiş.
    const enCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await enCtx.addInitScript(veteran, TUTORIAL_KEY);
    const ep = await enCtx.newPage();
    watch(ep);
    await ep.goto('http://127.0.0.1:8811/?lang=en');
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    const enButton = (await ep.locator('.newgame [data-career-open]').textContent()) ?? '';
    await ep.locator('.newgame [data-career-open]').click();
    await ep.waitForSelector('.career-overlay [data-career]');
    const enTexts = await ep.evaluate(() => ({
      first: document.querySelector('[data-achievement="public_company"] .career-badge-title')?.textContent ?? '',
      title: document.querySelector('.career-overlay .modal-head h2')?.textContent ?? '',
    }));
    check('İngilizcede Kariyer çevrilmiş', enButton.includes('Career') && enButton.includes('0/29 badges') && enTexts.first === 'Going public' && enTexts.title === 'Career',
      `${enButton} · ${JSON.stringify(enTexts)}`);
    await enCtx.close();

    // iPhone SE: kurulumdaki ve oyundaki Kariyer sayfasının her düğmesi ulaşılabilir, yana taşma yok.
    const phoneCtx = await browser.newContext({ ...devices['iPhone SE'] });
    await phoneCtx.addInitScript(veteran, TUTORIAL_KEY);
    const pp = await phoneCtx.newPage();
    watch(pp);
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    await pp.locator('.newgame [data-career-open]').click();
    await pp.waitForSelector('.career-overlay [data-career]');
    const overlay = await reachable(pp, '.career-overlay');
    const overlayWide = await pp.evaluate(() => {
      const body = document.querySelector('.career-overlay .modal-body');
      return body ? body.scrollWidth - body.clientWidth : -1;
    });
    await pp.locator('.career-overlay .modal-head button.icon').click();
    await pp.locator('[data-newgame-start]').click();
    await pp.waitForFunction(() => window.__capital?.getState?.().time.day >= 0, null, { timeout: 60000 });
    await pp.locator('.goal-chip').first().click();
    await pp.locator('.goals [data-career-open]').click();
    await pp.waitForSelector('.modal [data-career]');
    const inGame = await reachable(pp, '.modal');
    const inGameWide = await pp.evaluate(() => {
      const body = document.querySelector('.modal .modal-body');
      return body ? body.scrollWidth - body.clientWidth : -1;
    });
    check('iPhone SE: Kariyer sayfasının her düğmesine ulaşılıyor, yana taşmıyor',
      overlay.bad.length === 0 && overlay.count > 0 && inGame.bad.length === 0 && inGame.count > 0 && overlayWide === 0 && inGameWide === 0,
      `kurulum ${overlay.count} düğme ${overlay.bad.join(',')} taşma ${overlayWide} · oyun ${inGame.count} düğme ${inGame.bad.join(',')} taşma ${inGameWide}`);
    await phoneCtx.close();
    check('Kariyer akışında konsol temiz', careerErrors.length === 0, careerErrors.slice(0, 2).join(' | '));
  }

  // ---------- Açılış (Tur 42) ----------
  section('Açılış: gölgelendiriciler');
  {
    const openErrors = [];
    const qualityLog = [];
    /*
     * Derlenen her program sayfada sayılıyor: WebGL'in `linkProgram`'ı
     * sarılıyor, three'nin yazdığı gölgelendirici adı ve kaynağı tutuluyor.
     * Canlı program sayısı (`renderInfo().programs`) yetmiyor: kademe inince
     * eski programlar siliniyor, iki kez derlenen açılış görünmez olurdu.
     */
    const programLog = () => {
      window.__programLog = [];
      for (const Ctx of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const proto = Ctx.prototype;
        const source = proto.shaderSource;
        const attach = proto.attachShader;
        const link = proto.linkProgram;
        proto.shaderSource = function (shader, text) {
          shader.__source = text;
          return source.call(this, shader, text);
        };
        proto.attachShader = function (program, shader) {
          (program.__shaders ??= []).push(shader);
          return attach.call(this, program, shader);
        };
        proto.linkProgram = function (program) {
          const text = (program.__shaders ?? []).map((shader) => shader.__source ?? '').join('\n//--\n');
          const name = /#define SHADER_NAME (\S+)/.exec(text)?.[1] ?? /#define SHADER_TYPE (\S+)/.exec(text)?.[1] ?? '';
          window.__programLog.push({ name, text, at: Math.round(performance.now()) });
          return link.call(this, program);
        };
      }
    };
    /*
     * Paralel derleme (`KHR_parallel_shader_compile`) gerçek GPU'larda var,
     * buradaki yazılımsal GPU'da yok: ön derleme eşzamanlı bitiyor, çizim
     * döngüsünün beklediği yol hiç koşmuyordu. İkinci açılışta uzantı
     * taklit ediliyor: her program bağlandıktan `delay` ms sonra hazır.
     * Hazır olmadan kullanılan programlar `__usedEarly`'de: gerçek GPU'da
     * bunlar çizimi derleme bitene dek bekletir.
     */
    const parallelCompile = (delay) => {
      const COMPLETION_STATUS_KHR = 0x91b1;
      const extension = { COMPLETION_STATUS_KHR };
      window.__usedEarly = [];
      for (const Ctx of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const proto = Ctx.prototype;
        const getExtension = proto.getExtension;
        const getProgramParameter = proto.getProgramParameter;
        const link = proto.linkProgram;
        const use = proto.useProgram;
        proto.getExtension = function (name) {
          return name === 'KHR_parallel_shader_compile' ? extension : getExtension.call(this, name);
        };
        proto.linkProgram = function (program) {
          program.__readyAt = performance.now() + delay;
          const text = (this.getAttachedShaders(program) ?? []).map((shader) => this.getShaderSource(shader) ?? '').join('\n');
          program.__name = /#define SHADER_NAME (\S+)/.exec(text)?.[1] ?? /#define SHADER_TYPE (\S+)/.exec(text)?.[1] ?? '?';
          return link.call(this, program);
        };
        proto.useProgram = function (program) {
          if (program && performance.now() < (program.__readyAt ?? 0)) window.__usedEarly.push(program.__name);
          return use.call(this, program);
        };
        proto.getProgramParameter = function (program, pname) {
          if (pname === COMPLETION_STATUS_KHR) return performance.now() >= (program.__readyAt ?? 0);
          return getProgramParameter.call(this, program, pname);
        };
      }
    };
    /*
     * İlk kareden önce ekranı silen her çağrının rengi tutuluyor: ön derleme
     * sürerken tuval siyah kalmamalı. Yalnız ekrana yapılan silmeler; ara
     * hedeflere (bloom, gölge, ortam haritası) yapılanlar sayılmıyor.
     */
    const clearLog = () => {
      window.__screenClears = [];
      window.__screenDrawn = false;
      const DRAW_FRAMEBUFFER = 0x8ca9;
      for (const Ctx of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const proto = Ctx.prototype;
        const bind = proto.bindFramebuffer;
        const clear = proto.clear;
        proto.bindFramebuffer = function (target, framebuffer) {
          if (target === this.FRAMEBUFFER || target === DRAW_FRAMEBUFFER) this.__toScreen = framebuffer === null;
          return bind.call(this, target, framebuffer);
        };
        proto.clear = function (mask) {
          if ((this.__toScreen ?? true) && !window.__screenDrawn && mask & this.COLOR_BUFFER_BIT) {
            window.__screenClears.push([...this.getParameter(this.COLOR_CLEAR_VALUE)].map((c) => Math.round(c * 100) / 100));
          }
          return clear.call(this, mask);
        };
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          const draw = proto[name];
          if (!draw) continue;
          proto[name] = function (...args) {
            if (this.__toScreen ?? true) window.__screenDrawn = true;
            return draw.apply(this, args);
          };
        }
      }
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(veteran, TUTORIAL_KEY);
    await ctx.addInitScript(programLog);
    const op = await ctx.newPage();
    op.on('pageerror', (e) => openErrors.push(e.message));
    op.on('console', (m) => {
      if (m.type() === 'error') openErrors.push(m.text());
      if (m.text().includes('kademesine')) qualityLog.push(m.text());
    });
    await op.goto('http://127.0.0.1:8811/');
    await op.waitForSelector('.newgame', { timeout: 20000 });
    await op.evaluate(() => (window.__programLog = []));
    await op.locator('button:has-text("Şirketi kur")').click();
    await op.waitForSelector('.topbar', { timeout: 60000 });
    await op.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    // Uyarlama 2,5 sn'lik pencereyle karar veriyor: bir pencere daha bekle.
    await op.waitForTimeout(3500);
    const opened = await op.evaluate(() => {
      const info = window.__capital.renderInfo();
      return { info, created: window.__programLog.length, names: window.__programLog.map((p) => p.name) };
    });
    check('Yazılımsal GPU tanınıyor, açılış en ucuz kademede',
      opened.info.softwareRenderer === true && opened.info.qualityTier === 3,
      `yazılımsal ${opened.info.softwareRenderer} · kademe ${opened.info.qualityTier}`);
    check('Açılışta kademe inmiyor: sahne ikinci kez derlenmiyor', qualityLog.length === 0, qualityLog.slice(0, 2).join(' | '));
    check('Gölgelendiriciler ilk kareden önce derleniyor',
      typeof opened.info.shaderWarmupMs === 'number' && opened.info.frameCount >= 4,
      `ön derleme ${opened.info.shaderWarmupMs} ms · kare ${opened.info.frameCount}`);
    // Tur 41'in sonunda bu açılış 44 program derliyordu (en pahalı kademe, sonra iniş).
    check('Açılışta derlenen program sayısı 20 ya da az',
      opened.created <= 20,
      `${opened.created} program (canlı ${opened.info.programs}) · ${[...new Set(opened.names)].join(', ')}`);

    /*
     * En üst kademe: bloom zinciri, gölgeler, ortam haritası. Yazılımsal
     * GPU'da paralel derleme yok; yeni kademenin programları tek, uzun bir
     * karede eşzamanlı derleniyor. O karenin süresi bir sonraki karede oyun
     * saatine yazılmamalı (Codex #71): oyuncu o süre boyunca şehri görmedi.
     * Derlemenin ağırlığı JS'te değil GPU sürecinde; iki kare arasındaki
     * sürede görünüyor. Oyun bu yüzden kısa bir süre akıyor ve derleme
     * karesinden sonra şehri çizen kareler kaydediliyor. Derleme karesinin
     * kendisi zaten sıradaydı, sarmalanmıyor.
     */
    const cold = await op.evaluate(() => new Promise((resolve) => {
      const cap = window.__capital;
      const raf = window.requestAnimationFrame;
      const frames = [];
      let previous = performance.now();
      window.requestAnimationFrame = (callback) => raf.call(window, (time) => {
        const drawn = cap.renderInfo().frameCount;
        const played = cap.engine.getState().meta.playTimeMs;
        callback(time);
        if (cap.renderInfo().frameCount !== drawn) {
          frames.push({ wait: Math.round(time - previous), played: cap.engine.getState().meta.playTimeMs - played });
          previous = time;
        }
      });
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
      cap.setQuality(0);
      const poll = setInterval(() => {
        if (frames.length < 2) return;
        clearInterval(poll);
        window.requestAnimationFrame = raf;
        cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        resolve(frames.slice(0, 2));
      }, 20);
    }));
    check('Eşzamanlı derleme karesinin süresi oyun saatine yazılmıyor',
      cold[0].wait >= 100 && cold[0].played === 0 && cold[1].played > 0,
      `derlemeden sonraki kare ${cold[0].wait} ms sonra, oyun saati +${Math.round(cold[0].played)} ms · ` +
        `bir sonraki ${cold[1].wait} ms sonra, +${Math.round(cold[1].played)} ms`);
    const framesAt = await op.evaluate(() => window.__capital.renderInfo().frameCount);
    await op.waitForFunction((n) => window.__capital.renderInfo().frameCount >= n + 4, framesAt, { timeout: 90000 });
    const top = await op.evaluate(() => {
      const log = window.__programLog;
      const seen = new Map();
      for (const program of log) seen.set(program.text, (seen.get(program.text) ?? 0) + 1);
      const duplicates = [...seen.entries()]
        .filter(([, n]) => n > 1)
        .map(([text]) => /#define SHADER_(?:NAME|TYPE) (\S+)/.exec(text)?.[1] ?? '?');
      return {
        info: window.__capital.renderInfo(),
        blur: log.filter((program) => program.text.includes('gaussianCoefficients')).length,
        duplicates,
      };
    });
    check('En üst kademede bloom tek bulanıklık programıyla',
      top.info.postProcessing === true && top.blur === 1,
      `bloom ${top.info.postProcessing} · bulanıklık programı ${top.blur}`);
    check('Hiçbir gölgelendirici aynı kaynakla iki kez derlenmiyor (açılış ve kademe değişimi)',
      top.duplicates.length === 0,
      top.duplicates.length ? `iki kez: ${top.duplicates.join(', ')}` : `${top.info.programs} canlı program`);
    await ctx.close();

    // Paralel derleme: çizim döngüsü programları bekliyor, tuval o sırada gökyüzü renginde.
    const PARALLEL_DELAY_MS = 600;
    const pctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await pctx.addInitScript(veteran, TUTORIAL_KEY);
    await pctx.addInitScript(parallelCompile, PARALLEL_DELAY_MS);
    await pctx.addInitScript(clearLog);
    const pp = await pctx.newPage();
    pp.on('pageerror', (e) => openErrors.push(e.message));
    pp.on('console', (m) => {
      if (m.type() === 'error') openErrors.push(m.text());
    });
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    await pp.locator('button:has-text("Şirketi kur")').click();
    await pp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 2, null, { timeout: 60000 });
    const parallel = await pp.evaluate(() => ({ info: window.__capital.renderInfo(), clears: window.__screenClears }));
    check('Paralel derlemede çizim döngüsü programların hazır olmasını bekliyor',
      (parallel.info.shaderWarmupMs ?? 0) >= PARALLEL_DELAY_MS - 50,
      `ön derleme ${parallel.info.shaderWarmupMs} ms · kare ${parallel.info.frameCount}`);
    // three'nin silme rengi sahne çizilene dek siyah; bekleyen döngü rengi kendisi vermeli.
    const dark = parallel.clears.filter(([r, g, b]) => Math.max(r, g, b) < 0.05);
    check('İlk kare beklenirken tuval siyah değil, gökyüzü renginde',
      parallel.clears.length > 0 && dark.length === 0,
      `${parallel.clears.length} silme · ilki ${JSON.stringify(parallel.clears[0] ?? null)} · siyah ${dark.length}`);
    /*
     * En üst kademe: bloom ve çıkış geçişlerinin malzemeleri sahnede değil, ön
     * derleme onları ayrıca derlemeli. Oyun bu sırada akıyor: kareler
     * beklerken oyun saati de beklemeli (Codex #71), yoksa oyuncu görmediği
     * günleri kaçırır.
     */
    const held = await pp.evaluate(() => new Promise((resolve) => {
      const cap = window.__capital;
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
      window.__usedEarly = [];
      const frames = cap.renderInfo().frameCount;
      cap.setQuality(0);
      const start = cap.engine.getState().meta.playTimeMs;
      let last = start;
      let samples = 0;
      const poll = setInterval(() => {
        if (cap.renderInfo().frameCount !== frames) {
          clearInterval(poll);
          cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
          resolve({ advanced: last - start, samples });
          return;
        }
        last = cap.engine.getState().meta.playTimeMs;
        samples++;
      }, 20);
    }));
    check('Ön derleme kareleri beklettikçe oyun saati de bekliyor',
      held.samples >= 5 && held.advanced === 0,
      `bekleme ${held.samples * 20} ms · ilerleyen oyun saati ${Math.round(held.advanced)} ms`);
    const pFramesAt = await pp.evaluate(() => window.__capital.renderInfo().frameCount);
    await pp.waitForFunction((n) => window.__capital.renderInfo().frameCount >= n + 4, pFramesAt, { timeout: 90000 });
    const early = await pp.evaluate(() => ({ names: window.__usedEarly, info: window.__capital.renderInfo() }));
    // Gölge derinliği ve ortam haritası (PMREM) programlarını three çizimin içinde kuruyor; onlar ayrı.
    const postEarly = early.names.filter((name) => name === 'ShaderMaterial' || name === 'OutputShader');
    check('Paralel derlemede bloom ve çıkış programları ilk karelerinden önce hazır',
      early.info.postProcessing === true && postEarly.length === 0,
      `bloom ${early.info.postProcessing} · hazır olmadan kullanılan: ${[...new Set(early.names)].join(', ') || 'yok'}`);
    await pctx.close();
    check('Açılış ölçümünde konsol temiz', openErrors.length === 0, openErrors.slice(0, 2).join(' | '));
  }

  // ---------- Akıcılık (Tur 43) ----------
  section('Akıcılık: kare ve gün');
  {
    const flowErrors = [];
    /*
     * Kare başına GPU'ya yüklenen tampon verisi: WebGL'in `bufferSubData`'sı
     * sarılıyor. Örnek tamponları en kalabalık hâle göre ayrılmış; yalnız
     * çizilen kısım yüklenmeli.
     */
    const uploadLog = () => {
      window.__uploaded = 0;
      const proto = WebGL2RenderingContext.prototype;
      const sub = proto.bufferSubData;
      proto.bufferSubData = function (target, offset, data, srcOffset, length) {
        const bytes = data?.BYTES_PER_ELEMENT ?? 1;
        window.__uploaded += length ? length * bytes : (data?.byteLength ?? 0) - (srcOffset ?? 0) * bytes;
        return sub.apply(this, arguments);
      };
    };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(veteran, TUTORIAL_KEY);
    await ctx.addInitScript(uploadLog);
    const fp = await ctx.newPage();
    fp.on('pageerror', (e) => flowErrors.push(e.message));
    fp.on('console', (m) => {
      if (m.type() === 'error') flowErrors.push(m.text());
    });
    await fp.goto('http://127.0.0.1:8811/');
    await fp.waitForSelector('.newgame', { timeout: 20000 });
    await fp.locator('button:has-text("Şirketi kur")').click();
    await fp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });

    // Oyun duruyor, araçlar ve yayalar yürüyor: her kare yalnız onların konumunu yüklüyor.
    await fp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await fp.waitForTimeout(1000);
    const upload = await fp.evaluate(() => new Promise((resolve) => {
      const frames = window.__capital.renderInfo().frameCount;
      const bytes = window.__uploaded;
      setTimeout(() => {
        const drawn = window.__capital.renderInfo().frameCount - frames;
        resolve({ frames: drawn, perFrame: Math.round((window.__uploaded - bytes) / Math.max(1, drawn)) });
      }, 6000);
    }));
    // Tur 42'nin sonunda bu açılış kare başına 44.928 bayt yüklüyordu; 4.608'i çizilen yuvalardı.
    check('Araç ve yaya tamponlarından yalnız çizilen kısım yükleniyor',
      upload.frames >= 3 && upload.perFrame < 20000,
      `${upload.frames} kare · kare başına ${upload.perFrame.toLocaleString('tr-TR')} bayt`);

    // Oyun akıyor: doku yalnız değiştiği günlerde yeniden yerleşiyor, çizilen doku kalıyor.
    const before = await fp.evaluate(() => {
      const info = window.__capital.renderInfo();
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 3 });
      return { day: window.__capital.getState().time.day, stateSyncs: info.stateSyncs, fabricSyncs: info.fabricSyncs };
    });
    // Yirmi eşitleme bekleniyor, yirmi gün değil: yavaş makinede React iki
    // günü tek çizimde birleştirince 20 günde 19 eşitleme kalıyor (o zaman
    // ana dalda da düşüyordu). Ölçülen şey eşitleme başına doku.
    await fp.waitForFunction((count) => (window.__capital.renderInfo().stateSyncs ?? 0) >= count + 20, before.stateSyncs ?? 0, { timeout: 120000 });
    const after = await fp.evaluate(() => {
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { ...window.__capital.renderInfo(), day: window.__capital.getState().time.day };
    });
    const syncs = (after.stateSyncs ?? 0) - (before.stateSyncs ?? 0);
    const fabricSyncs = (after.fabricSyncs ?? 0) - (before.fabricSyncs ?? 0);
    check('Şehir dokusu yalnız değiştiği günlerde yeniden yerleşiyor',
      syncs >= 20 && fabricSyncs < syncs && (after.fabricInstances ?? 0) > 0,
      `${after.day - before.day} gün · ${syncs} eşitleme · dokuyu ${fabricSyncs} kez yerleştirdi · ${after.fabricInstances} doku örneği`);
    await ctx.close();
    check('Akıcılık ölçümünde konsol temiz', flowErrors.length === 0, flowErrors.slice(0, 2).join(' | '));
  }

  // ---------- Değerlendirme (Tur 44) ----------
  section('Değerlendirme: yardım, sayılar, İngilizce ekranlar');
  {
    const evalErrors = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(veteran, TUTORIAL_KEY);
    const ep = await ctx.newPage();
    ep.on('pageerror', (e) => evalErrors.push(e.message));
    ep.on('console', (m) => {
      if (m.type() === 'error') evalErrors.push(m.text());
    });
    await ep.goto('http://127.0.0.1:8811/');
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    await ep.locator('button:has-text("Şirketi kur")').click();
    await ep.waitForSelector('.topbar', { timeout: 20000 });

    // Yardım her sistemi bir maddede anlatıyor: meclis, sözleşme, ihale, lig ve senaryo eksikti.
    await ep.locator('.topbar-actions [data-panel="help"]').click();
    await ep.waitForSelector('.help');
    const steps = await ep.locator('.help [data-help-step]').evaluateAll((items) => items.map((item) => item.getAttribute('data-help-step')));
    const wanted = ['auction', 'council', 'contracts', 'league', 'scenario', 'paths'];
    check('Yardım meclisi, sözleşmeyi, ihaleyi, ligi, senaryoyu ve zaferin yollarını anlatıyor',
      wanted.every((id) => steps.includes(id)),
      `${steps.length} madde · eksik: ${wanted.filter((id) => !steps.includes(id)).join(', ') || 'yok'}`);
    await ep.keyboard.press('Escape');

    /*
     * Türkçede ondalık virgül, binlik nokta. Para "1.23 M ₺" yazıyordu;
     * yanındaki "1.616 ₺" bin altı yüz on altı demek. Çarpanlar (×1.05),
     * kalite ve zincirin birim fiyatı ("₺2.80") de noktalıydı.
     */
    await ep.evaluate(() => {
      const { engine, getState } = window.__capital;
      const s = getState();
      // Milyonlu tutar görünsün: serbest oyun 250 B ₺ kasayla açılıyor.
      s.companies[s.playerCompanyId].cash = 3_456_000;
      let built = 0;
      for (const t of s.map.tiles) {
        if (built >= 3) break;
        if (t.kind !== 'plot' || t.ownerId || t.structureId || t.buildingId) continue;
        if (!engine.dispatch({ type: 'BUY_TILE', tileId: t.id }).ok) continue;
        if (engine.dispatch({ type: 'BUILD', tileId: t.id, defId: 'corner_shop' }).ok) built++;
      }
      for (let i = 0; i < 40; i++) engine.runDay();
      engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await ep.waitForTimeout(300);
    const DOT_DECIMAL = /\d\.\d{1,2}(?!\d)/;
    const texts = { topbar: ((await ep.locator('.topbar').textContent()) ?? '').trim() };
    for (const panel of ['chain', 'rivalry', 'company', 'bourse']) {
      await ep.locator(`.topbar-actions [data-panel="${panel}"]`).click();
      await ep.waitForTimeout(300);
      texts[panel] = ((await ep.locator('.modal').textContent()) ?? '').trim();
      await ep.keyboard.press('Escape');
      await ep.waitForTimeout(150);
    }
    const dotted = Object.entries(texts)
      .map(([name, text]) => [name, text.match(DOT_DECIMAL)?.[0]])
      .filter(([, hit]) => hit);
    check('Türkçede para, çarpan ve birim fiyat virgüllü',
      dotted.length === 0 && /\d,\d{2} M ₺/.test(texts.topbar),
      dotted.map(([name, hit]) => `${name}: ${hit}`).join(' · ') || texts.topbar.slice(0, 60));
    await ctx.close();

    /*
     * İngilizce: "Dil" bölümü altı paneli tarıyor. Tur 39–41'in ekranları
     * (senaryo seçimi ve açılışı, kariyer, hedefler) da taransın. Kişi adları
     * (CEO'lar) Türkçe kalıyor; aranan arayüz sözcükleri.
     */
    const enCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await enCtx.addInitScript(veteran, TUTORIAL_KEY);
    await enCtx.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const en = await enCtx.newPage();
    en.on('pageerror', (e) => evalErrors.push(e.message));
    en.on('console', (m) => {
      if (m.type() === 'error') evalErrors.push(m.text());
    });
    const TURKISH_UI = /\b(Şirket|Nakit|Kapat|bölge|Mağaza|Rakip|Hisse|Kredi|günlük|Kâr|Meclis|Senaryo|Hedef|Rozet|Kariyer|gün içinde|yıldız|Başla|Henüz)/;
    const leftovers = {};
    await en.goto('http://127.0.0.1:8811/');
    await en.waitForSelector('.newgame', { timeout: 20000 });
    await en.locator('.mode-picker [data-mode="scenario"]').click();
    leftovers.scenarios = ((await en.locator('.newgame').textContent()) ?? '').match(TURKISH_UI)?.[0];
    await en.locator('.newgame [data-career-open]').first().click();
    await en.waitForSelector('[data-career]');
    leftovers.career = ((await en.locator('[data-career]').textContent()) ?? '').match(TURKISH_UI)?.[0];
    // Oyun içindeki paneller gibi kurulumdaki Kariyer de Escape ile kapanıyor.
    await en.keyboard.press('Escape');
    await en.waitForTimeout(200);
    const careerOpen = await en.locator('.career-overlay').count();
    check('Kurulumdaki Kariyer Escape ile kapanıyor', careerOpen === 0, `${careerOpen} katman açık`);
    if (careerOpen > 0) await en.locator('.career-overlay .modal-head button.icon').click();
    await en.locator('[data-scenario="rescue"]').click();
    await en.locator('[data-newgame-start]').click();
    await en.waitForSelector('[data-scenario-begin]', { timeout: 120000 });
    leftovers.brief = ((await en.locator('[data-scenario-brief]').textContent()) ?? '').match(TURKISH_UI)?.[0];
    await en.locator('[data-scenario-begin]').click();
    await en.waitForTimeout(500);
    await en.locator('[data-agenda="scenario"] button').first().click();
    await en.waitForTimeout(300);
    leftovers.goals = ((await en.locator('.modal').textContent()) ?? '').match(TURKISH_UI)?.[0];
    await en.keyboard.press('Escape');
    await en.locator('.topbar-actions [data-panel="help"]').click();
    await en.waitForTimeout(300);
    leftovers.help = ((await en.locator('.help').textContent()) ?? '').match(TURKISH_UI)?.[0];
    const found = Object.entries(leftovers).filter(([, hit]) => hit);
    check('İngilizce senaryo, kariyer, hedefler ve yardımda Türkçe kalıntı yok',
      Object.keys(leftovers).length === 5 && found.length === 0,
      found.map(([name, hit]) => `${name}: ${hit}`).join(' · ') || Object.keys(leftovers).join(', '));
    await enCtx.close();
    check('Değerlendirme bölümünde konsol temiz', evalErrors.length === 0, evalErrors.slice(0, 2).join(' | '));
  }

  // ---------- Ek kurallar (Tur 45) ----------
  section('Ek kurallar: kurulum, oyun, zafer, kariyer');
  {
    const ruleErrors = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(veteran, TUTORIAL_KEY);
    const rp = await ctx.newPage();
    rp.on('pageerror', (e) => ruleErrors.push(e.message));
    rp.on('console', (m) => {
      if (m.type() === 'error') ruleErrors.push(m.text());
    });
    await rp.goto('http://127.0.0.1:8811/');
    await rp.waitForSelector('.newgame', { timeout: 20000 });
    const empty = ((await rp.locator('[data-detail="modifiers"]').textContent()) ?? '').trim();
    await rp.locator('[data-modifier="storms"]').click();
    await rp.locator('[data-modifier="scarce_land"]').click();
    const picked = await rp.evaluate(() => ({
      options: document.querySelectorAll('[data-modifier]').length,
      pressed: [...document.querySelectorAll('[data-modifier][aria-pressed="true"]')].map((el) => el.getAttribute('data-modifier')),
      facts: [...document.querySelectorAll('[data-modifier-facts]')].map((el) => el.getAttribute('data-modifier-facts')),
      multiplier: document.querySelector('[data-modifier-multiplier]')?.textContent ?? '',
    }));
    check('Kurulumda dört ek kural; seçilenin etkisi ve zorluk çarpanı yazıyor',
      picked.options === 4 && empty.includes('İsteğe bağlı') && picked.pressed.join() === 'storms,scarce_land' &&
        picked.facts.join() === 'storms,scarce_land' && picked.multiplier.includes('×1,10'),
      `${picked.options} kural · ${picked.pressed.join(', ')} · ${picked.multiplier}`);

    // Lig ve senaryoda kural yok: seçici görünmüyor, seçim oyuna geçmiyor.
    await rp.locator('.mode-picker [data-mode="scenario"]').click();
    const inScenario = await rp.locator('[data-modifiers]').count();
    await rp.locator('.mode-picker [data-mode="league"]').click();
    const inLeague = await rp.locator('[data-modifiers]').count();
    await rp.locator('.mode-picker [data-mode="daily"]').click();
    const inDaily = await rp.locator('[data-modifiers]').count();
    await rp.locator('.mode-picker [data-mode="free"]').click();
    check('Lig, günün koşusu ve senaryo kipinde ek kural seçicisi yok', inScenario === 0 && inLeague === 0 && inDaily === 0,
      `senaryo ${inScenario} · lig ${inLeague} · gün ${inDaily}`);

    await rp.locator('[data-newgame-start]').click();
    await rp.waitForSelector('.topbar', { timeout: 20000 });
    const started = await rp.evaluate(() => window.__capital.getState().modifiers ?? null);
    await rp.locator('.goal-chip').first().click();
    await rp.waitForSelector('.goals');
    const goalsLine = (await rp.locator('.goals [data-modifier-line]').getAttribute('data-modifier-line')) ?? '';
    const goalsText = ((await rp.locator('.goals [data-modifier-line]').textContent()) ?? '').trim();
    check('Seçilen kurallar oyunda; Hedefler paneli kuralları ve çarpanı yazıyor',
      JSON.stringify(started) === '["storms","scarce_land"]' && goalsLine === 'storms scarce_land' && goalsText.includes('Fırtınalı yıllar') && goalsText.includes('×1,10'),
      `${JSON.stringify(started)} · ${goalsText}`);
    await rp.keyboard.press('Escape');

    // Zafer: ekran kuralları yazıyor; Dengeli + iki kural "Kendi kuralların"ı açıyor.
    await rp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory = { day: s.time.day, kind: 'tycoon' };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await rp.waitForSelector('.victory [data-modifier-line]', { timeout: 10000 });
    const victoryLine = ((await rp.locator('.victory [data-modifier-line]').textContent()) ?? '').trim();
    await rp.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}').unlocked?.house_rules), null, { timeout: 10000 }).catch(() => {});
    const career = await rp.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}'));
    const run = career.runs?.[0];
    check('Zafer ekranı kuralları yazıyor; iki kuralla Dengeli zafer "Kendi kuralların" rozetini açıyor',
      victoryLine.includes('Kıt arsa') && Boolean(career.unlocked?.house_rules) && !career.unlocked?.all_rules && JSON.stringify(run?.modifiers) === '["storms","scarce_land"]',
      `${victoryLine} · ${Object.keys(career.unlocked ?? {}).join(',')} · ${JSON.stringify(run?.modifiers)}`);
    await ctx.close();

    // Telefon ve İngilizce: dört kural iki sütunda, taşma yok, adlar çevrilmiş.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phone.addInitScript(veteran, TUTORIAL_KEY);
    await phone.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const pp = await phone.newPage();
    pp.on('pageerror', (e) => ruleErrors.push(e.message));
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    await pp.locator('[data-modifier="tight_credit"]').tap();
    const phoneView = await pp.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const boxes = [...document.querySelectorAll('[data-modifier]')].map((el) => el.getBoundingClientRect());
      return {
        inside: boxes.every((box) => box.left >= 0 && box.right <= vw + 1),
        rows: new Set(boxes.map((box) => Math.round(box.top))).size,
        names: [...document.querySelectorAll('[data-modifier]')].map((el) => el.textContent?.trim()).join(', '),
        detail: document.querySelector('[data-detail="modifiers"]')?.textContent ?? '',
      };
    });
    check('Telefonda kurallar iki satırda, taşma yok; İngilizce adlar ve etki',
      phoneView.inside && phoneView.rows === 2 && phoneView.names === 'Stormy years, Hungry rivals, Tight bank, Scarce land' &&
        phoneView.detail.includes('360-day loan') && phoneView.detail.includes('×1.20'),
      `${phoneView.rows} satır · ${phoneView.names} · ${phoneView.detail.slice(-40)}`);
    await phone.close();
    check('Ek kurallar bölümünde konsol temiz', ruleErrors.length === 0, ruleErrors.slice(0, 2).join(' | '));
  }

  // ---------- Mobil ----------
  //
  // Bu bölüm eskiden tek satırdı: "dar ekranda yatay taşma yok". O kontrol
  // HİÇBİR ZAMAN başarısız olamıyordu, çünkü `body`'de `overflow: hidden`
  // varken `scrollWidth − clientWidth` her koşulda 0 çıkar. Oysa üst bar
  // 1002px genişliğinde takılı kalıyordu ve telefonda hiçbir panel
  // düğmesine ulaşılamıyordu. Şimdi eleman kutuları görüntü alanına karşı
  // ölçülüyor ve jestler gerçek dokunuş olaylarıyla sürülüyor.
  //
  // ---------- Büyük şehir (Tur 21) ----------
  section('Büyük şehir');
  {
    const bigContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await bigContext.addInitScript(veteran, TUTORIAL_KEY);
    const bp = await bigContext.newPage();
    const bigErrors = [];
    bp.on('pageerror', (e) => bigErrors.push(e.message));
    bp.on('console', (m) => { if (m.type() === 'error') bigErrors.push(m.text()); });
    await bp.goto('http://127.0.0.1:8811/');
    await bp.waitForSelector('.newgame', { timeout: 20000 });
    await bp.locator('[data-city-size="large"]').click();
    check('Kurulumda büyük şehir seçilebiliyor', (await bp.locator('[data-city-size="large"][aria-checked="true"]').count()) === 1);
    const sizeDetail = ((await bp.locator('.difficulty-detail[data-detail="city-size"]').textContent()) ?? '').trim();
    check('Şehir boyutu açıklaması farkları yazıyor', sizeDetail.includes('5×5') && sizeDetail.includes('8 rakip'), sizeDetail.slice(0, 90));
    await bp.fill('.newgame-field input[type="text"]', 'Büyük Holding');
    await bp.locator('button:has-text("Şirketi kur")').click();
    await bp.waitForSelector('.topbar', { timeout: 20000 });
    await bp.waitForTimeout(800);
    const big = await bp.evaluate(() => {
      const s = window.__capital.getState();
      const info = window.__capital.renderInfo();
      return {
        width: s.map.width,
        districts: s.districts.length,
        locked: s.districts.filter((d) => d.opensOnDay !== undefined).length,
        rivals: Object.values(s.companies).filter((c) => !c.isPlayer).length,
        plots: s.map.tiles.filter((t) => t.kind === 'plot').length,
        drawn: info ? info.plotInstances : -1,
      };
    });
    check('Büyük şehir 5×5 kuruluyor', big.width === 50 && big.districts === 25 && big.rivals === 8,
      `${big.width}×${big.width} · ${big.districts} bölge · ${big.rivals} rakip`);
    check('Dış halka kilitli başlıyor', big.locked === 16, `${big.locked} kilitli bölge`);
    check('Sahne büyük haritayı çiziyor', big.drawn >= big.plots, `${big.drawn} parsel örneği / ${big.plots} parsel`);
    // Bir ay oynat: büyük şehirde günler takılmadan akmalı.
    const flow = await bp.evaluate(async () => {
      const { engine, getState } = window.__capital;
      const day0 = getState().time.day;
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) engine.runDay();
      return { days: getState().time.day - day0, ms: (performance.now() - t0) / 30 };
    });
    check('Büyük şehirde gün akıyor', flow.days === 30 && flow.ms < 480, `${flow.days} gün · ${flow.ms.toFixed(0)} ms/gün`);
    // Farklı boyutta yeni oyun: sahne yeniden kurulmalı (aynı motor, `replaceState`).
    await bp.locator('.topbar-actions [data-panel="saves"]').click();
    await bp.waitForTimeout(300);
    await bp.locator('button:has-text("Yeni oyun")').first().click();
    await bp.waitForSelector('.newgame', { timeout: 20000 });
    await bp.locator('[data-city-size="standard"]').click();
    await bp.locator('button:has-text("Şirketi kur")').click();
    await bp.waitForSelector('.topbar', { timeout: 20000 });
    await bp.waitForTimeout(800);
    const back = await bp.evaluate(() => {
      const s = window.__capital.getState();
      const info = window.__capital.renderInfo();
      return { width: s.map.width, drawn: info ? info.plotInstances : -1, plots: s.map.tiles.filter((t) => t.kind === 'plot').length };
    });
    check('Standart şehre dönünce sahne yeniden kuruluyor', back.width === 30 && back.drawn >= back.plots && back.drawn < big.plots,
      `${back.width}×${back.width} · ${back.drawn} parsel örneği`);
    await bp.screenshot({ path: `${OUT}/big-city.png` });
    check('Büyük şehir akışında konsol temiz', bigErrors.length === 0, bigErrors.slice(0, 2).join(' | '));
    await bigContext.close();
  }

  //
  // ---------- Holding: birden çok şehir (Tur 22) ----------
  section('Holding');
  {
    const hContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await hContext.addInitScript(veteran, TUTORIAL_KEY);
    const hp = await hContext.newPage();
    const hErrors = [];
    hp.on('pageerror', (e) => hErrors.push(e.message));
    hp.on('console', (m) => { if (m.type() === 'error') hErrors.push(m.text()); });
    await hp.goto('http://127.0.0.1:8811/');
    await hp.waitForSelector('.newgame', { timeout: 20000 });
    await hp.fill('.newgame-field input[type="text"]', 'Holding AŞ');
    await hp.locator('button:has-text("Şirketi kur")').click();
    await hp.waitForSelector('.topbar', { timeout: 20000 });
    check('Holding yokken üst barda şehir çipi yok', (await hp.locator('[data-city-chip]').count()) === 0);
    // Bir mağaza kurup bir ay oynat, sonra zaferi ve kasayı elle ver: zafere
    // gerçekten oynayarak varmak bu testin konusu değil (denge testi ölçüyor).
    await hp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const s = c.getState();
      const tile = s.map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.ownerId && !t.buildingId && s.districts[t.districtId].opensOnDay === undefined);
      c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
      c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'grocery' });
      for (let i = 0; i < 30; i++) c.engine.runDay();
      const live = c.getState();
      live.companies.player.cash = 30_000_000;
      live.victory = { day: live.time.day, kind: 'tycoon' };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    // Zafer ekranı havai fişeklerden sonra (Tur 63).
    await hp.waitForSelector('[data-victory-open-city]', { timeout: 8000 }).catch(() => {});
    check('Zafer ekranında "Yeni şehre açıl"', (await hp.locator('[data-victory-open-city]').count()) === 1);
    await hp.evaluate(() => document.querySelector('[data-victory-open-city]').click());
    await hp.waitForTimeout(300);
    const openText = ((await hp.locator('.holding-open').textContent()) ?? '').trim();
    check('Şehirler paneli açılıyor, yeni şehir formu hazır', (await hp.locator('[data-open-city="open"]').count()) === 1 && openText.includes('Sermaye'),
      openText.slice(0, 80));
    const founding = await hp.evaluate(() => ({ seed: window.__capital.getState().meta.seed, day: window.__capital.getState().time.day }));
    await hp.locator('[data-holding-size="standard"]').click();
    await hp.locator('[data-open-city-go]').click();
    await hp.waitForTimeout(900);
    const opened = await hp.evaluate(() => {
      const s = window.__capital.getState();
      const info = window.__capital.renderInfo();
      return {
        city: s.cityName,
        day: s.time.day,
        seed: s.meta.seed,
        cash: s.companies.player.cash,
        imported: s.importedCapital,
        dormant: s.holding?.dormant.map((d) => d.state.cityName) ?? [],
        rivals: Object.values(s.companies).filter((c) => !c.isPlayer).map((c) => c.profileId),
        plots: s.map.tiles.filter((t) => t.kind === 'plot').length,
        drawn: info ? info.plotInstances : -1,
      };
    });
    check('Yeni şehir açılıyor: sermaye taşınıyor, kurucu şehir uzaktan yönetiliyor',
      opened.day === 0 && opened.seed !== founding.seed && opened.dormant.length === 1 && opened.cash === opened.imported && opened.cash >= 2_000_000,
      `${opened.city} · ${opened.cash.toLocaleString('tr-TR')} ₺ · bekleyen ${opened.dormant.join(', ')}`);
    check('Yeni şehirde rakip kadrosu farklı', !opened.rivals.includes('nova_holding'), opened.rivals.join(', '));
    check('Yeni şehrin sahnesi kuruluyor', opened.drawn >= opened.plots, `${opened.drawn} parsel örneği / ${opened.plots}`);
    const chip = ((await hp.locator('[data-city-chip]').textContent()) ?? '').trim();
    check('Üst barda şehir adı', chip === opened.city, chip);
    await hp.evaluate(() => { const c = window.__capital; for (let i = 0; i < 20; i++) c.engine.runDay(); c.engine.dispatch({ type: 'SET_SPEED', speed: 0 }); });
    await hp.locator('[data-city-chip]').click();
    await hp.waitForTimeout(300);
    const rows = await hp.locator('.city-row').count();
    check('Panelde iki şehir: oynanan ve bekleyen', rows === 2, `${rows} satır`);
    // Tur 30: uzaktaki şehir yaşıyor — satır durumu ve dünkü gerçek kâr payı.
    const remoteRow = ((await hp.locator('.city-row:not(.current)').first().textContent()) ?? '').trim();
    check('Uzaktaki şehir satırı: uzaktan yönetiliyor, 20 gün yaşamış, dünkü kâr payı', remoteRow.includes('Uzaktan yönetiliyor') &&
      remoteRow.includes(`${founding.day + 20}. gün`) && remoteRow.includes('dün kasaya'), remoteRow.slice(0, 120));

    // Tur 32: holding hedefleri ve uzaktaki şehrin talimatı — geçiş yapmadan.
    const ladder = await hp.evaluate(() => ({
      done: document.querySelector('[data-holding-ladder]')?.getAttribute('data-holding-ladder'),
      second: document.querySelector('[data-step="second"]')?.getAttribute('data-done'),
      next: document.querySelector('[data-step="secondWin"]')?.textContent ?? '',
    }));
    check('Holding hedefleri: ikinci şehir basamağı tamam, sıradaki iki şehirde zafer', ladder.done === '1' && ladder.second === 'yes' && ladder.next.includes('1 / 2'),
      `${ladder.done} · ${ladder.second} · ${ladder.next}`);
    await hp.locator('[data-city-directive="0"] [data-payout="all"]').click();
    await hp.waitForTimeout(150);
    const payout = await hp.evaluate(() => ({
      state: window.__capital.getState().holding.dormant[0].state.remote?.payout,
      checked: document.querySelector('[data-city-directive="0"] [data-payout="all"]')?.getAttribute('aria-checked'),
      hint: document.querySelector('[data-city-directive="0"] p')?.textContent ?? '',
    }));
    check('Uzak şehrin kâr payı talimatı panelden: hepsi kasaya, uyarısıyla', payout.state === 'all' && payout.checked === 'true' && payout.hint.includes('baskın kolaylaşır'),
      `${payout.state} · ${payout.hint.slice(0, 70)}`);
    await hp.locator('[data-defend="0"]').check();
    await hp.waitForTimeout(150);
    // Uzaktaki şehirde %24'lük bir baskın: savunma açık, ertesi gün yerel müdür geri alıyor.
    await hp.evaluate(() => {
      const c = window.__capital;
      const away = c.getState().holding.dormant[0].state;
      const raider = Object.values(away.companies).find((x) => !x.isPlayer);
      raider.shares[away.playerCompanyId] = 2_400;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await hp.waitForTimeout(300);
    const defense = await hp.evaluate(() => {
      const away = window.__capital.getState().holding.dormant[0];
      const me = away.state.companies[away.state.playerCompanyId];
      return {
        defend: away.state.remote?.defend,
        treasuryShares: me.shares[me.id] ?? 0,
        line: document.querySelector('[data-city-directive="0"] [data-defense-line]')?.textContent ?? '',
      };
    });
    check('Savunma talimatı: yerel müdür baskında geri alıyor, satır ne yaptığını yazıyor', defense.defend === true && defense.treasuryShares > 0 &&
      defense.line.includes('geri alındı') && defense.line.includes('Kilide kalan'), `${defense.treasuryShares} hisse · ${defense.line.slice(0, 90)}`);
    await hp.screenshot({ path: `${OUT}/holding-panel.png` });

    // Kasadan uzaktaki şehre para: hedef seçiliyor, tutar o şehrin kasasına.
    await hp.evaluate(() => {
      window.__capital.getState().holding.treasury = 5_000_000;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await hp.waitForTimeout(150);
    await hp.locator('[data-transfer-target="0"]').click();
    await hp.waitForTimeout(150);
    const remoteCash = await hp.evaluate(() => window.__capital.getState().holding.dormant[0].state.companies.player.cash);
    await hp.evaluate(() => {
      const input = document.querySelector('.holding-transfer input[type="range"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1000000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await hp.waitForTimeout(100);
    const toCityLabel = ((await hp.locator('[data-transfer="to-city"]').textContent()) ?? '').trim();
    await hp.locator('[data-transfer="to-city"]').click();
    await hp.waitForTimeout(200);
    const sent = await hp.evaluate((before) => {
      const s = window.__capital.getState();
      return { treasury: s.holding.treasury, gained: s.holding.dormant[0].state.companies.player.cash - before };
    }, remoteCash);
    check('Kasadan uzaktaki şehre aktarım: para o şehrin kasasına', sent.gained > 0 && Math.abs(5_000_000 - sent.treasury - sent.gained) < 1 &&
      toCityLabel.includes(opened.dormant[0]), `${toCityLabel} · ${sent.gained.toLocaleString('tr-TR')} ₺`);
    // Yeni şehirde bir kare seç: şehir değişince bu seçim eski şehrin
    // karesine işaret etmemeli.
    await hp.locator('.modal-head button.icon').click();
    await hp.waitForTimeout(200);
    const emptyInspector = ((await hp.locator('.inspector').textContent()) ?? '').trim();
    await hp.evaluate(() => window.__capital.selectTile(40));
    await hp.waitForTimeout(200);
    const selectedInspector = ((await hp.locator('.inspector').textContent()) ?? '').trim();
    await hp.locator('[data-city-chip]').click();
    await hp.waitForTimeout(300);
    await hp.locator('.city-switch').first().click();
    await hp.waitForTimeout(900);
    const back = await hp.evaluate(() => {
      const s = window.__capital.getState();
      return { seed: s.meta.seed, day: s.time.day, dormantDay: s.holding?.dormant[0]?.state.time.day };
    });
    // Tur 30: şehirler eşzamanlı — kurucu şehir de 21 gün yaşadı (20 + savunma
    // denemesinin günü, Tur 32).
    check('Kurucu şehre dönülüyor; o da yaşamış (takvimler birlikte)', back.seed === founding.seed && back.day === founding.day + 21 && back.dormantDay === 21,
      `gün ${back.day} (ayrılış ${founding.day}) · öbür şehir ${back.dormantDay}. günde`);
    const afterSwitch = ((await hp.locator('.inspector').textContent()) ?? '').trim();
    check('Şehir değişince seçim temizleniyor', selectedInspector !== emptyInspector && afterSwitch === emptyInspector,
      afterSwitch.slice(0, 60));
    // Kaybedilen şehir kapatılınca yeri boşalıyor (Tur 32).
    await hp.evaluate(() => {
      const c = window.__capital;
      const away = c.getState().holding.dormant[0].state;
      const rival = Object.values(away.companies).find((x) => !x.isPlayer);
      away.gameOver = { day: away.time.day, byCompanyId: rival.id };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    // Panel şehir değişiminden beri açık olabilir.
    if ((await hp.locator('.holding').count()) === 0) await hp.locator('[data-city-chip]').click();
    await hp.waitForTimeout(300);
    const lostRow = ((await hp.locator('.city-row.lost').textContent()) ?? '').trim();
    await hp.locator('[data-close-city="0"]').click();
    await hp.waitForTimeout(200);
    const closed = await hp.evaluate(() => ({
      dormant: window.__capital.getState().holding.dormant.length,
      rows: document.querySelectorAll('.city-row').length,
    }));
    check('Kaybedilen şehir kapatılıyor, yeri boşalıyor', lostRow.includes('Kaybedildi') && lostRow.includes('yeri boşalır') && closed.dormant === 0 && closed.rows === 1,
      `${closed.dormant} bekleyen · ${closed.rows} satır · ${lostRow.slice(0, 60)}`);
    check('Holding akışında konsol temiz', hErrors.length === 0, hErrors.slice(0, 2).join(' | '));
    await hContext.close();
  }

  // ---------- Açılış paketi (Tur 46) ----------
  // Kurulum ekranı küçük bir parçayla geliyor; oyun ekranı (three, HUD,
  // paneller) kurulum açıkken iniyor, İngilizce sözlük yalnız seçilince.
  section('Açılış paketi: geç parçalar');
  {
    const bContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await bContext.addInitScript(veteran, TUTORIAL_KEY);
    const bp = await bContext.newPage();
    const fetched = [];
    bp.on('request', (r) => fetched.push(new URL(r.url()).pathname.replace(/^.*\//, '')));
    const bErrors = [];
    bp.on('pageerror', (e) => bErrors.push(e.message));
    await bp.goto('http://127.0.0.1:8811/');
    await bp.waitForSelector('.newgame', { timeout: 20000 });
    const scripts = () => fetched.filter((f) => f.endsWith('.js'));
    for (let i = 0; i < 100 && !scripts().some((f) => /^three-/.test(f)); i++) await bp.waitForTimeout(100);
    check('Türkçe açılış İngilizce sözlüğü indirmiyor; oyun ekranı ve şehir sahnesi kurulum açıkken iniyor',
      !scripts().some((f) => /^locale-en-/.test(f)) && scripts().some((f) => /^GameRoot-/.test(f)) && scripts().some((f) => /^three-/.test(f)),
      scripts().join(' '));
    await bp.locator('.newgame [data-locale="en"]').click();
    await bp.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 });
    const english = scripts().filter((f) => /^locale-en-/.test(f));
    check('İngilizceye geçince sözlük tek parça olarak iniyor, kurulum İngilizce',
      english.length === 1 && (await bp.locator('button:has-text("Found the company")').count()) === 1, english.join(' '));
    check('Geç parçalarda yakalanmamış hata yok', bErrors.length === 0, bErrors.slice(0, 2).join(' | '));
    await bContext.close();
  }
  {
    // Bağlantıyla İngilizce: ilk çizim İngilizce, Türkçe kurulum bir an bile görünmüyor.
    const fContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await fContext.addInitScript(veteran, TUTORIAL_KEY);
    await fContext.addInitScript(() => {
      new MutationObserver((_records, observer) => {
        const setup = document.querySelector('.newgame');
        if (!setup) return;
        window.__firstSetup = setup.textContent ?? '';
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    const fp = await fContext.newPage();
    await fp.goto('http://127.0.0.1:8811/?lang=en');
    await fp.waitForSelector('.newgame', { timeout: 20000 });
    const first = await fp.evaluate(() => window.__firstSetup ?? '');
    check('?lang=en ile kurulumun ilk çizimi İngilizce', first.includes('Found the company') && !first.includes('Şirketi kur'), first.slice(0, 60));
    await fContext.close();
  }
  {
    // Oyun parçası inmezse (yayından sonra eski sayfa, kopan bağlantı): kurulum
    // açılıyor, başlatınca açık bir mesaj ve yenile düğmesi; bağlantı dönünce oyun açılıyor.
    const xContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await xContext.addInitScript(veteran, TUTORIAL_KEY);
    const block = /\/GameRoot-[^/]*\.js$/;
    await xContext.route(block, (route) => route.abort());
    const xp = await xContext.newPage();
    const xErrors = [];
    xp.on('pageerror', (e) => xErrors.push(e.message));
    await xp.goto('http://127.0.0.1:8811/');
    await xp.waitForSelector('.newgame', { timeout: 20000 });
    await xp.locator('button:has-text("Şirketi kur")').click();
    await xp.waitForSelector('[data-boot-failed]', { timeout: 20000 });
    const message = ((await xp.locator('[data-boot-failed]').textContent()) ?? '').trim();
    check('Oyun parçası inmezse kurulum açılıyor, başlatınca açık mesaj ve yenile düğmesi',
      message.includes('inmedi') && (await xp.locator('[data-boot-failed] button').count()) === 1 && xErrors.length === 0,
      `${message.slice(0, 70)}${xErrors.length ? ` · ${xErrors[0]}` : ''}`);
    await xContext.unroute(block);
    await xp.locator('[data-boot-failed] button').click();
    await xp.waitForSelector('.newgame', { timeout: 20000 });
    await xp.locator('button:has-text("Şirketi kur")').click();
    await xp.waitForSelector('.topbar', { timeout: 30000 });
    check('Bağlantı dönünce yenile düğmesi oyunu açıyor', (await xp.locator('.topbar').count()) === 1 && xErrors.length === 0, xErrors.slice(0, 2).join(' | '));
    await xContext.close();
  }

  // ---------- Dil (Tur 23) ----------
  // Kendi bağlamında: seçim tarayıcıda hatırlanıyor, diğer bölümler Türkçe kalmalı.
  section('Dil');
  {
    const lContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await lContext.addInitScript(veteran, TUTORIAL_KEY);
    const lp = await lContext.newPage();
    const lErrors = [];
    lp.on('pageerror', (e) => lErrors.push(e.message));
    lp.on('console', (m) => { if (m.type() === 'error') lErrors.push(m.text()); });
    // Ham anahtar, doldurulmamış yer tutucu ve sık Türkçe arayüz sözcükleri.
    const RAW_KEY = /\b(core|content|panels|hud|finance|app)\.[a-z]+\.[a-zA-Z]/;
    const PLACEHOLDER = /\{[a-zA-Z]+\}/;
    const TURKISH_WORDS = /\b(Şirket|Nakit|Borç|Kapat|bölge|Mağaza|Rakip|Hisse|Kredi|günlük|Kâr|İşgücü|Meclis)/;
    const leftovers = (text) => [RAW_KEY, PLACEHOLDER, TURKISH_WORDS].map((re) => text.match(re)?.[0]).filter(Boolean);
    await lp.goto('http://127.0.0.1:8811/');
    await lp.waitForSelector('.newgame', { timeout: 20000 });
    // Üç dil (Tur 69): Türkçe, English, Deutsch.
    check('Kurulumda dil seçici var, Türkçe seçili',
      (await lp.locator('.newgame .locale-option').count()) === 3 &&
        (await lp.locator('.newgame [data-locale="tr"][aria-pressed="true"]').count()) === 1);
    await lp.locator('.newgame [data-locale="en"]').click();
    // İngilizce sözlük seçilince iniyor (Tur 46): dil değişene kadar bekle.
    await lp.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 });
    const setupText = ((await lp.locator('.newgame').textContent()) ?? '').trim();
    const setupLang = await lp.evaluate(() => document.documentElement.lang);
    check('İngilizceye geçince kurulum ekranı İngilizce',
      setupLang === 'en' && setupText.includes('Found the company') && leftovers(setupText.replace('Türkçe', '')).length === 0,
      `lang=${setupLang} · ${leftovers(setupText.replace('Türkçe', '')).join(', ') || setupText.slice(0, 60)}`);
    await lp.fill('.newgame-field input[type="text"]', 'Lingo Ltd');
    await lp.locator('button:has-text("Found the company")').click();
    await lp.waitForSelector('.topbar', { timeout: 20000 });
    await lp.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 90; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await lp.waitForTimeout(400);
    const topbar = ((await lp.locator('.topbar').textContent()) ?? '').trim();
    check('Üst bar İngilizce, para ₺ önde', topbar.includes('Cash') && /₺\d/.test(topbar) && leftovers(topbar).length === 0,
      leftovers(topbar).join(', ') || topbar.slice(0, 80));
    const news = await lp.evaluate(() => window.__capital.getState().news.slice(0, 40).map((n) => `${n.title} ${n.body}`).join(' \n '));
    check('Haberler İngilizce üretiliyor', news.length > 0 && leftovers(news).length === 0, leftovers(news).join(', ') || news.slice(0, 80));
    for (const panel of ['chain', 'rivalry', 'bourse', 'council', 'company', 'rivals']) {
      await lp.locator(`.topbar-actions [data-panel="${panel}"]`).click();
      await lp.waitForTimeout(300);
      const body = ((await lp.locator('.modal').textContent()) ?? '').trim();
      const found = leftovers(body);
      check(`İngilizce "${panel}" panelinde Türkçe kalıntı yok`, body.length > 20 && found.length === 0, found.join(', ') || body.slice(0, 60));
      await lp.keyboard.press('Escape');
      await lp.waitForTimeout(150);
    }
    await lp.screenshot({ path: `${OUT}/locale-en.png` });
    // Yardım panelinden Türkçeye dönüş: oyun sürüyor, metinler anında değişiyor.
    const dayBefore = await lp.evaluate(() => window.__capital.getState().time.day);
    // Tur 47'den beri dil Ayarlar'da; Yardım oraya yönlendiriyor.
    await lp.locator('.speeds [data-panel="settings"]').click();
    await lp.waitForTimeout(300);
    check('Ayarlar panelinde dil seçici', (await lp.locator('.settings .locale-option').count()) === 3);
    await lp.locator('.settings [data-locale="tr"]').click();
    await lp.waitForFunction(() => document.documentElement.lang === 'tr', null, { timeout: 10000 });
    await lp.waitForTimeout(300);
    await lp.keyboard.press('Escape');
    const topbarTr = ((await lp.locator('.topbar').textContent()) ?? '').trim();
    const dayAfter = await lp.evaluate(() => window.__capital.getState().time.day);
    check('Türkçeye dönünce üst bar Türkçe, oyun yerinde', topbarTr.includes('Nakit') && dayAfter === dayBefore,
      `${topbarTr.slice(0, 60)} · gün ${dayBefore}→${dayAfter}`);
    // Bağlantıyla İngilizce: ?lang=en seçimi bir kez geçersiz kılıyor, hatırlanan Türkçe kalıyor.
    const reloadStart = Date.now();
    await lp.goto('http://127.0.0.1:8811/?lang=en');
    await lp.waitForSelector('.topbar', { timeout: 20000 });
    const viaLink = ((await lp.locator('.topbar').textContent()) ?? '').trim();
    const linkSeconds = (Date.now() - reloadStart) / 1000;
    const rememberStart = Date.now();
    await lp.goto('http://127.0.0.1:8811/');
    await lp.waitForSelector('.topbar', { timeout: 20000 });
    const remembered = ((await lp.locator('.topbar').textContent()) ?? '').trim();
    const rememberSeconds = (Date.now() - rememberStart) / 1000;
    check('?lang=en bağlantısı İngilizce açıyor, seçim Türkçe hatırlanıyor',
      viaLink.includes('Cash') && remembered.includes('Nakit'),
      `${viaLink.slice(0, 24)} | ${remembered.slice(0, 24)} · yenileme ${linkSeconds.toFixed(1)} / ${rememberSeconds.toFixed(1)} sn`);
    check('Dil akışında konsol temiz', lErrors.length === 0, lErrors.slice(0, 2).join(' | '));
    await lContext.close();
  }

  // ---------- Üçüncü dil: Almanca (Tur 69) ----------
  // Bağlantıyla açılış, kurulum, üst bar, haberler, paneller, lens adları,
  // sayı biçimi ve telefon. Kalıntı: ham anahtar, doldurulmamış yer tutucu,
  // Türkçe ya da İngilizce arayüz sözcüğü.
  section('Üçüncü dil: Almanca');
  {
    const gContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await gContext.addInitScript(veteran, TUTORIAL_KEY);
    const gp = await gContext.newPage();
    const gErrors = [];
    gp.on('pageerror', (e) => gErrors.push(e.message));
    gp.on('console', (m) => { if (m.type() === 'error') gErrors.push(m.text()); });
    const RAW_KEY = /\b(core|content|panels|hud|finance|app)\.[a-z]+\.[a-zA-Z]/;
    const PLACEHOLDER = /\{[a-zA-Z]+\}/;
    // Harf sınırıyla: Almanca "Kredit"in içindeki "Kredi" Türkçe değil.
    const TURKISH_WORDS = /(?<!\p{L})(Şirket|Nakit|Borç|Kapat|bölge|Mağaza|Rakip|Hisse|Kredi|günlük|Kâr|İşgücü|Meclis)(?!\p{L})/u;
    const ENGLISH_WORDS = /\b(Found the company|Company name|Difficulty|Free play|Cash|Debt|Close|Settings|Rivals|Shares|Loan|Council|daily|Store)\b/;
    // Dil adları kendi dillerinde yazıyor; seçicinin "Türkçe" ve "English"i kalıntı değil.
    const leftovers = (text) =>
      [RAW_KEY, PLACEHOLDER, TURKISH_WORDS, ENGLISH_WORDS].map((re) => text.replace(/Türkçe|English/g, '').match(re)?.[0]).filter(Boolean);
    await gp.goto('http://127.0.0.1:8811/?lang=de');
    await gp.waitForSelector('.newgame', { timeout: 20000 });
    await gp.waitForFunction(() => document.documentElement.lang === 'de', null, { timeout: 10000 });
    const setupText = ((await gp.locator('.newgame').textContent()) ?? '').trim();
    const order = await gp.evaluate(() => [...document.querySelectorAll('.newgame .locale-option')].map((el) => `${el.dataset.locale}${el.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(','));
    check('?lang=de kurulumu Almanca açıyor; seçici üç dil, sıra sabit, Deutsch seçili',
      setupText.includes('Unternehmen gründen') && leftovers(setupText).length === 0 && order === 'tr,en,de*',
      `${order} · ${leftovers(setupText).join(', ') || setupText.slice(0, 50)}`);
    await gp.fill('.newgame-field input[type="text"]', 'Sprachwerk GmbH');
    await gp.locator('button:has-text("Unternehmen gründen")').click();
    await gp.waitForSelector('.topbar', { timeout: 20000 });
    await gp.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 120; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await gp.waitForTimeout(400);
    const topbar = ((await gp.locator('.topbar').textContent()) ?? '').trim();
    check('Üst bar Almanca, para tutarın arkasında: „Tsd. ₺“, „Mio. ₺“',
      topbar.includes('Kasse') && /\d (Tsd\.|Mio\.) ₺/.test(topbar) && !/₺\d/.test(topbar) && leftovers(topbar).length === 0,
      leftovers(topbar).join(', ') || topbar.slice(0, 90));
    const news = await gp.evaluate(() => window.__capital.getState().news.slice(0, 40).map((n) => `${n.title} ${n.body}`).join(' \n '));
    check('Haberler Almanca üretiliyor', news.length > 0 && leftovers(news).length === 0, leftovers(news).join(', ') || news.slice(0, 80));
    // Panellerde kalıntı yok; kırpılmış düğme ya da etiket yok.
    const clipped = () =>
      gp.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('.modal button, .modal th, .modal .chip, .modal label')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          const clips = cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis';
          if (clips && el.scrollWidth - el.clientWidth > 1) out.push(el.textContent.trim().slice(0, 30));
        }
        return out;
      });
    const panelIssues = [];
    let percentSeen = false;
    for (const panel of ['chain', 'rivalry', 'bourse', 'council', 'company', 'rivals', 'saves', 'help']) {
      await gp.locator(`.topbar-actions [data-panel="${panel}"]`).click();
      await gp.waitForTimeout(300);
      // Metin düğüm düğüm: `textContent` yan yana öğeleri boşluksuz birleştiriyor ("100 %" + "3" = "%3").
      const texts = await gp.evaluate(() => {
        const out = [];
        const walker = document.createTreeWalker(document.querySelector('.modal'), NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) out.push(walker.currentNode.textContent);
        return out;
      });
      const body = texts.join(' ').trim();
      const found = leftovers(body);
      const cut = await clipped();
      if (body.length < 20 || found.length || cut.length) panelIssues.push(`${panel}: ${[...found, ...cut.map((c) => `kesik „${c}“`)].join(', ') || 'boş'}`);
      // Yüzde Almancada bölünmeyen boşlukla arkada ("45 %"); Türkçe biçim ("%45") yok.
      if (texts.some((text) => /\d\u00a0%/.test(text))) percentSeen = true;
      const turkishPercent = texts.find((text) => /%\d/.test(text));
      if (turkishPercent) panelIssues.push(`${panel}: Türkçe yüzde „${turkishPercent.trim().slice(0, 30)}“`);
      await gp.keyboard.press('Escape');
      await gp.waitForTimeout(150);
    }
    check('Sekiz panelde Türkçe/İngilizce kalıntı ve kesik etiket yok; yüzde „45 %“', panelIssues.length === 0 && percentSeen,
      panelIssues.slice(0, 3).join(' | ') || (percentSeen ? '8 panel temiz' : 'yüzde görülmedi'));
    // Lens adları: masaüstünde iki sütun (Tur 69), en büyük metin boyunda da kesilmiyor.
    const lensCut = [];
    for (const size of ['normal', 'xlarge']) {
      await gp.locator('.topbar [data-panel="settings"]').click();
      await gp.locator(`[data-setting="text"][data-choice="${size}"]`).click();
      await gp.keyboard.press('Escape');
      await gp.waitForTimeout(300);
      const cut = await gp.evaluate(() => {
        const range = document.createRange();
        return [...document.querySelectorAll('.lens-name')]
          .filter((el) => {
            range.selectNodeContents(el);
            return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01;
          })
          .map((el) => el.textContent);
      });
      if (cut.length) lensCut.push(`${size}: ${cut.join(', ')}`);
    }
    check('Lens adları kesilmiyor (Almanca, normal ve en büyük metin)', lensCut.length === 0, lensCut.join(' | ') || '6 lens');
    await gp.locator('.topbar [data-panel="settings"]').click();
    await gp.locator('[data-setting="text"][data-choice="normal"]').click();
    await gp.keyboard.press('Escape');
    await gp.screenshot({ path: `${OUT}/locale-de.png` });
    // Telefon: kurulum ve oyun ekranı yana taşmıyor.
    await gp.setViewportSize({ width: 390, height: 844 });
    await gp.waitForTimeout(500);
    const phoneWide = await gp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const offscreen = await gp.evaluate(() =>
      [...document.querySelectorAll('.topbar button, .topbar-actions button, .agenda button')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); })
        .map((el) => el.textContent.trim().slice(0, 20)));
    await gp.screenshot({ path: `${OUT}/locale-de-phone.png` });
    check('Telefonda Almanca oyun ekranı yana taşmıyor, düğmeler ekranda', phoneWide <= 0 && offscreen.length === 0,
      `taşma ${phoneWide} px${offscreen.length ? ` · dışarıda: ${offscreen.join(', ')}` : ''}`);
    check('Almanca akışta konsol temiz', gErrors.length === 0, gErrors.slice(0, 2).join(' | '));
    await gContext.close();
  }

  // ---------- Görünüm (Tur 35) ----------
  // Kendi bağlamında: seçim tarayıcıda hatırlanıyor, diğer bölümler Otomatik kalmalı.
  section('Görünüm');
  {
    const aContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
    await aContext.addInitScript(veteran, TUTORIAL_KEY);
    const ap = await aContext.newPage();
    const aErrors = [];
    ap.on('pageerror', (e) => aErrors.push(e.message));
    ap.on('console', (m) => { if (m.type() === 'error') aErrors.push(m.text()); });
    const look = () => ap.evaluate(() => document.documentElement.dataset.appearance ?? '');
    // Görünüm 500 ms'lik döngüyle izleniyor; sabit bekleme yerine değişimi bekle.
    const lookBecomes = (want, ms = 4000) =>
      ap.waitForFunction((w) => document.documentElement.dataset.appearance === w, want, { timeout: ms })
        .then(() => true, () => false);
    // Renk 0,9 sn'lik geçişin SONUNDA okunuyor: geçiş sürerken hesaplanan
    // değer eski renkte kalıyor (ilk sürüm tam bunu okuyup kırmızı yandı).
    const panelColor = async () => {
      await ap.waitForFunction(() => !document.documentElement.hasAttribute('data-appearance-shift'), null, { timeout: 4000 })
        .catch(() => null);
      return ap.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
    };
    await ap.goto('http://127.0.0.1:8811/');
    await ap.waitForSelector('.newgame', { timeout: 20000 });
    check('Açık modlu cihazda kurulum gündüz camı', (await look()) === 'day', await look());
    await ap.fill('.newgame-field input[type="text"]', 'Cam Holding');
    await ap.locator('button:has-text("Şirketi kur")').click();
    await ap.waitForSelector('.topbar', { timeout: 20000 });
    await ap.evaluate(() => window.__capital.setTimeOfDay(0.28));
    check('Gündüz şehirde arayüz gündüz', await lookBecomes('day'), await look());
    const dayColor = await panelColor();
    await ap.evaluate(() => window.__capital.setTimeOfDay(0.75));
    // Yazılım GL'de (CI) bir kare 0,5–2 sn sürüyor, en uzunu ilk gece karesi
    // (gece malzemeleri ilk kez derleniyor). 500 ms'lik döngü karelerin
    // arasında geç uyanıyor: ölçümde ilk dönüş 3,9 sn, ikincisi 2,0 sn.
    // Yüklü makinede 4 sn'yi aşıyordu (main'de bu yüzden kırmızıydı).
    const wentNight = await lookBecomes('night', 20000);
    const nightColor = await panelColor();
    check('Otomatik: şehirde gece olunca arayüz gece camına dönüyor', wentNight && nightColor !== dayColor,
      `${await look()} · üst bar ${dayColor} → ${nightColor}`);
    await ap.evaluate(() => window.__capital.setTimeOfDay(0.28));
    check('Sabah olunca arayüz gündüze dönüyor', await lookBecomes('day'), await look());

    // Tur 47'den beri görünüm Ayarlar'da.
    await ap.locator('.speeds [data-panel="settings"]').click();
    await ap.waitForTimeout(300);
    check('Ayarlar panelinde görünüm seçici, Otomatik seçili',
      (await ap.locator('.settings .appearance-option').count()) === 3 &&
        (await ap.locator('.settings [data-appearance-choice="auto"][aria-pressed="true"]').count()) === 1);
    await ap.locator('.settings [data-appearance-choice="day"]').click();
    await ap.keyboard.press('Escape');
    await ap.evaluate(() => window.__capital.setTimeOfDay(0.75));
    // Otomatik olsaydı bu sürede geceye dönerdi (yukarıdaki kontrol).
    check('Gündüz sabitlenince şehir gecesi arayüzü değiştirmiyor', !(await lookBecomes('night', 2000)), await look());
    await ap.locator('.speeds [data-panel="settings"]').click();
    await ap.locator('.settings [data-appearance-choice="night"]').click();
    check('Gece seçilince arayüz hemen gece', (await look()) === 'night', await look());
    await ap.keyboard.press('Escape');
    // Yenileme oyuna ya da kuruluma açılabilir: otomatik kayıt 30 sn'de bir
    // yazılıyor, daha önce yenilenirse kurulum geliyor (ilk sürüm `.topbar`
    // bekleyip zaman aşımına düştü). Seçim iki ekranda da geçerli.
    await ap.reload();
    await ap.waitForSelector('.topbar, .newgame', { timeout: 20000 });
    check('Gece seçimi yenilemeden sonra hatırlanıyor', !(await lookBecomes('day', 1500)) && (await look()) === 'night', await look());
    await ap.screenshot({ path: `${OUT}/appearance-night.png` });
    check('Görünüm akışında konsol temiz', aErrors.length === 0, aErrors.slice(0, 2).join(' | '));
    await aContext.close();

    // Koyu modlu cihaz: Otomatik, kurulum ekranından başlayarak gece.
    const dContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
    await dContext.addInitScript(veteran, TUTORIAL_KEY);
    const dp = await dContext.newPage();
    await dp.goto('http://127.0.0.1:8811/');
    await dp.waitForSelector('.newgame', { timeout: 20000 });
    const darkLook = await dp.evaluate(() => document.documentElement.dataset.appearance ?? '');
    check('Koyu modlu cihazda Otomatik gece camı', darkLook === 'night', darkLook);
    await dContext.close();
  }

  // ---------- Ayarlar ve erişilebilirlik (Tur 47) ----------
  // Kendi bağlamında: seçimler tarayıcıda hatırlanıyor, diğer bölümler varsayılanda kalmalı.
  section('Ayarlar ve erişilebilirlik');
  {
    const sContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await sContext.addInitScript(veteran, TUTORIAL_KEY);
    const sp = await sContext.newPage();
    const sErrors = [];
    sp.on('pageerror', (e) => sErrors.push(e.message));
    sp.on('console', (m) => { if (m.type() === 'error') sErrors.push(m.text()); });
    await sp.goto('http://127.0.0.1:8811/?appearance=day');
    await sp.waitForSelector('.newgame', { timeout: 20000 });
    await sp.locator('[data-settings-open]').focus();
    await sp.keyboard.press('Enter');
    await sp.waitForSelector('.settings-overlay .settings', { timeout: 5000 });
    const setupFocus = await sp.evaluate(() => Boolean(document.activeElement?.closest('.settings-overlay')));
    await sp.keyboard.press('Escape');
    await sp.waitForTimeout(150);
    const backOnButton = await sp.evaluate(() => document.activeElement?.hasAttribute('data-settings-open') ?? false);
    check('Kurulumda Ayarlar açılıyor; odak pencerede, Escape kapatıp odağı düğmeye veriyor',
      setupFocus && backOnButton && (await sp.locator('.settings-overlay').count()) === 0, `odak ${setupFocus} · geri ${backOnButton}`);

    await sp.locator('button:has-text("Şirketi kur")').click();
    await sp.waitForSelector('.topbar', { timeout: 30000 });
    await sp.waitForFunction(() => (window.__capital?.renderInfo?.()?.frameCount ?? 0) >= 2, null, { timeout: 60000 });
    await sp.evaluate(() => {
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      document.activeElement?.blur?.();
    });
    await sp.keyboard.press('Digit2');
    const speedTwo = await sp.evaluate(() => window.__capital.getState().time.speed);
    await sp.keyboard.press('Digit3');
    const speedThree = await sp.evaluate(() => window.__capital.getState().time.speed);
    await sp.keyboard.press('Digit1');
    const speedOne = await sp.evaluate(() => window.__capital.getState().time.speed);
    await sp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    check('1, 2 ve 3 tuşları hızı seçiyor', speedTwo === 2 && speedThree === 3 && speedOne === 1, `${speedTwo} · ${speedThree} · ${speedOne}`);

    // Üst bardaki dişli: pencere odağı alıyor, Tab ve Shift+Tab içeride dönüyor.
    await sp.locator('.speeds [data-panel="settings"]').focus();
    await sp.keyboard.press('Enter');
    await sp.waitForSelector('.modal .settings', { timeout: 5000 });
    const opened = await sp.evaluate(() => ({
      inside: Boolean(document.activeElement?.closest('.modal')),
      // Uygulama bölümü (Tur 48) yalnız hizmet çalışanı olan sayfada; burada kapalı.
      groups: document.querySelectorAll('.settings .settings-group:not([data-settings-app])').length,
      title: document.getElementById(document.querySelector('.modal')?.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
    }));
    await sp.keyboard.press('Tab');
    await sp.keyboard.press('Shift+Tab');
    const wrappedBack = await sp.evaluate(() => document.activeElement?.getAttribute('data-settings-page-open') ?? document.activeElement?.getAttribute('data-volume') ?? document.activeElement?.className ?? '');
    await sp.keyboard.press('Tab');
    const wrappedForward = await sp.evaluate(() => Boolean(document.activeElement?.closest('.modal-head')));
    // Sekizinci bölüm Sürüm (Tur 74), pencerenin sonunda: son düğmesi "Hata bildir".
    check('Ayarlar penceresi: sekiz bölüm, odak içeride, Tab ve Shift+Tab pencerede dönüyor',
      opened.inside && opened.groups === 8 && opened.title === 'Ayarlar' && wrappedBack === 'report' && wrappedForward,
      `${JSON.stringify(opened)} · geri ${wrappedBack} · ileri ${wrappedForward}`);

    const headSize = () => sp.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.settings-group h3')).fontSize));
    const before = await headSize();
    await sp.locator('[data-setting="text"][data-choice="xlarge"]').click();
    const after = await headSize();
    check('Çok büyük metin: yazılar %130', Math.abs(after / before - 1.3) < 0.02, `${before} → ${after} px`);

    await sp.locator('[data-setting="palette"][data-choice="safe"]').click();
    await sp.waitForTimeout(200);
    const palette = await sp.evaluate(() => ({
      good: getComputedStyle(document.documentElement).getPropertyValue('--good').trim(),
      bad: getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(),
      scene: window.__capital.renderInfo().palette,
    }));
    check('Renk körlüğüne uygun palet: yükseliş camgöbeği, düşüş turuncu, şehir de değişiyor',
      palette.good === '#0b7f86' && palette.bad === '#c2410c' && palette.scene === 'safe', JSON.stringify(palette));

    await sp.locator('[data-setting="motion"][data-choice="reduced"]').click();
    await sp.waitForTimeout(100);
    const motion = await sp.evaluate(() => ({
      root: document.documentElement.dataset.motion ?? '',
      transition: getComputedStyle(document.querySelector('.settings-option')).transitionDuration,
      scene: window.__capital.renderInfo().reducedMotion,
    }));
    check('Azaltılmış hareket: geçişler kapalı, sahne biliyor', motion.root === 'reduced' && /^0s(, 0s)*$/.test(motion.transition) && motion.scene, JSON.stringify(motion));

    // Ses düzeyleri klavyeyle: ok tuşu adımı %5.
    await sp.locator('[data-volume="effects"]').focus();
    for (let i = 0; i < 12; i++) await sp.keyboard.press('ArrowLeft');
    await sp.locator('[data-volume="master"]').focus();
    for (let i = 0; i < 10; i++) await sp.keyboard.press('ArrowLeft');
    const buses = await sp.evaluate(() => window.__capital.audio().buses);
    const effectsText = ((await sp.locator('[data-volume="effects"] + output').textContent()) ?? '').trim();
    check('Ses düzeyleri klavyeyle iniyor; ses yolları ayarı izliyor',
      Math.abs(buses.effects - 0.4) < 1e-9 && Math.abs(buses.master - 0.55 * 0.5) < 1e-9 && buses.ambience === 1 && effectsText === '%40',
      `${JSON.stringify(buses)} · ${effectsText}`);
    await sp.locator('[data-settings-sound]').click();
    const mutedState = await sp.evaluate(() => ({
      muted: window.__capital.audio().muted,
      master: window.__capital.audio().buses.master,
      toggle: document.querySelector('.sound-toggle')?.getAttribute('aria-pressed'),
      disabled: document.querySelector('[data-volume="master"]')?.disabled,
    }));
    check('Ses kapatılınca üst bardaki düğme de kapalı, kaydırıcılar pasif',
      mutedState.muted && mutedState.master === 0 && mutedState.toggle === 'false' && mutedState.disabled === true, JSON.stringify(mutedState));
    await sp.locator('[data-settings-sound]').click();

    // Odak onay kutusundayken de Escape kapatıyor (ilk sürümde kısayol
    // işleyicisi alanları atlıyordu, pencere açık kalıyordu).
    await sp.keyboard.press('Escape');
    await sp.waitForTimeout(150);
    const gearFocused = await sp.evaluate(() => document.activeElement?.getAttribute('data-panel') === 'settings');
    // Olay yerine gitmek: azaltılmış harekette kamera atlıyor, Tam'da süzülüyor.
    const jump = async (fx, fz) => sp.evaluate(([x, z]) => {
      window.__capital.focusWorld(x, z);
      const now = window.__capital.renderInfo().cameraCurrent;
      const goal = window.__capital.cameraTarget();
      return Math.hypot(now.x - goal.x, now.z - goal.z);
    }, [fx, fz]);
    const size = await sp.evaluate(() => ({ w: window.__capital.getState().map.width, h: window.__capital.getState().map.height }));
    const reducedGap = await jump(3, 3);
    await sp.waitForTimeout(300);
    await sp.locator('.speeds [data-panel="settings"]').click();
    await sp.locator('[data-setting="motion"][data-choice="full"]').click();
    await sp.keyboard.press('Escape');
    await sp.waitForTimeout(150);
    const fullGap = await jump(size.w - 4, size.h - 4);
    check('Onay kutusundan Escape kapatıyor, odak dişliye dönüyor; azaltılmış harekette kamera atlıyor, Tam\'da süzülüyor',
      gearFocused && reducedGap < 0.01 && fullGap > 1, `odak ${gearFocused} · atlama ${reducedGap.toFixed(3)} · süzülme ${fullGap.toFixed(2)}`);

    await sp.locator('.topbar-actions [data-panel="help"]').click();
    await sp.locator('[data-open-settings]').click();
    await sp.waitForTimeout(200);
    const redirected = (await sp.locator('.modal .settings').count()) === 1 && (await sp.locator('.help .locale-option').count()) === 0;
    await sp.keyboard.press('Escape');
    await sp.waitForTimeout(150);
    // Yardım'ın içindeki düğme pencereyle birlikte gidiyor; odak yine Yardım'ı
    // açan rıhtım düğmesine dönmeli, sayfanın başına düşmemeli (Codex #76).
    const backTo = await sp.evaluate(() => document.activeElement?.getAttribute('data-panel') ?? document.activeElement?.tagName);
    check('Yardım, dil ve görünümü Ayarlar\'a yönlendiriyor; Ayarlar kapanınca odak Yardım düğmesinde',
      redirected && backTo === 'help', `odak ${backTo}`);

    // Yenilemeden sonra: seçimler yerinde (oyun ya da kurulum, otomatik kayda göre).
    await sp.goto('http://127.0.0.1:8811/?appearance=day&lang=en');
    await sp.waitForSelector('.topbar, .newgame', { timeout: 30000 });
    const kept = await sp.evaluate(() => ({
      size: document.documentElement.dataset.textSize,
      palette: document.documentElement.dataset.palette,
      motion: document.documentElement.dataset.motion ?? '',
      stored: JSON.parse(localStorage.getItem('capitalforge.settings.v1') ?? '{}'),
    }));
    check('Seçimler yenilemeden sonra hatırlanıyor',
      kept.size === 'xlarge' && kept.palette === 'safe' && kept.motion === '' && kept.stored.volume?.effects === 0.4 && kept.stored.motion === 'full',
      JSON.stringify({ ...kept, stored: undefined }));
    const opener = (await sp.locator('.newgame').count()) > 0 ? '[data-settings-open]' : '.speeds [data-panel="settings"]';
    await sp.locator(opener).click();
    await sp.waitForSelector('.settings', { timeout: 5000 });
    const english = ((await sp.locator('.settings').textContent()) ?? '').replace('Türkçe', '');
    const turkish = english.match(/\b(Ayarlar|Metin|Renkler|Hareket|Genel|Şehir|Olaylar|Kamerayı|Duraklat|Yükseliş|Düşüş|Azaltılmış)\b/g) ?? [];
    check('İngilizce Ayarlar\'da Türkçe kalıntı yok', english.includes('Text size') && english.includes('Color-blind friendly') && turkish.length === 0,
      turkish.join(', ') || english.slice(0, 60));
    check('Ayarlar akışında konsol temiz', sErrors.length === 0, sErrors.slice(0, 2).join(' | '));
    await sContext.close();
  }
  {
    // Telefon, Çok büyük yazı: kurulum, oyun ve Ayarlar yana taşmıyor.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(veteran, TUTORIAL_KEY);
    await phone.addInitScript(() => localStorage.setItem('capitalforge.settings.v1', JSON.stringify({ textSize: 'xlarge' })));
    const pp = await phone.newPage();
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    const overflow = () => pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const setupOverflow = await overflow();
    await pp.locator('button:has-text("Şirketi kur")').click();
    await pp.waitForSelector('.topbar', { timeout: 30000 });
    await pp.waitForTimeout(500);
    const gameOverflow = await overflow();
    // Dar telefonda ses düğmesi Ayarlar'da: dişliyle hız grubu ikinci satıra
    // sığıyor (ilk sürümde üst bar üç satıra bölündü, Mobil bölümü yakaladı).
    const soundShown = await pp.locator('.sound-toggle').isVisible();
    await pp.locator('.speeds [data-panel="settings"]').click();
    await pp.waitForSelector('.modal .settings', { timeout: 5000 });
    const modalOverflow = await pp.evaluate(() => {
      const body = document.querySelector('.modal-body');
      return body ? body.scrollWidth - body.clientWidth : -1;
    });
    const soundSwitch = await pp.locator('.modal [data-settings-sound]').count();
    check('Telefonda ses düğmesi Ayarlar\'da: üst barda dişli var, ses anahtarı pencerede', !soundShown && soundSwitch === 1,
      `üst barda ses ${soundShown} · pencerede ${soundSwitch}`);
    await pp.screenshot({ path: `${OUT}/settings-phone-xlarge.png` });
    check('Telefonda Çok büyük yazı: kurulum, oyun ve Ayarlar yana taşmıyor', setupOverflow <= 0 && gameOverflow <= 0 && modalOverflow === 0,
      `kurulum ${setupOverflow} · oyun ${gameOverflow} · pencere ${modalOverflow}`);
    await phone.close();
  }

  // ---------- Kurulabilir ve çevrimdışı oyun (Tur 48) ----------
  // Tek bölüm hizmet çalışanıyla koşuyor (varsayılan kapalı, yukarıda):
  // manifest ve simgeler, önbellek, çevrimdışı açılış ve yeni sürüm akışı.
  section('Kurulabilir ve çevrimdışı oyun');
  {
    const wContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'allow' });
    await wContext.addInitScript(veteran, TUTORIAL_KEY);
    const wp = await wContext.newPage();
    const wErrors = [];
    wp.on('pageerror', (e) => wErrors.push(e.message));
    // Çevrimdışıyken tarayıcının kendi "ağ yok" kayıtları sayılmıyor; oyunun hatası sayılıyor.
    wp.on('console', (m) => { if (m.type() === 'error' && !/ERR_(INTERNET_DISCONNECTED|CONNECTION|EMPTY_RESPONSE)|Failed to load resource|Failed to update a ServiceWorker/.test(m.text())) wErrors.push(m.text()); });
    await wp.goto('http://127.0.0.1:8811/');
    await wp.waitForSelector('.newgame', { timeout: 20000 });
    const app = await wp.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const manifest = await (await fetch(link.href)).json();
      const sizes = await Promise.all(manifest.icons.map((icon) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`);
        img.onerror = () => resolve('inmedi');
        img.src = new URL(icon.src, link.href).href;
      })));
      return {
        name: manifest.short_name,
        display: manifest.display,
        sizes,
        declared: manifest.icons.map((icon) => icon.sizes),
        apple: document.querySelector('link[rel="apple-touch-icon"]') !== null,
      };
    });
    check('Manifest ve simgeler: kurulabilir, tam ekran, simgeler beyan edilen boyutta',
      app.name === 'CapitalForge' && app.display === 'standalone' && app.sizes.join() === app.declared.join() && app.apple,
      `${app.sizes.join(' ')}`);

    // İlk açılış: çalışan sayfa yüklenince kuruluyor ve sayfayı devralıyor.
    const controlled = await wp.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).then(() => true, () => false);
    const cached = await wp.evaluate(async () => {
      const mine = (await caches.keys()).filter((key) => key.startsWith('capitalforge-') && key !== 'capitalforge-meta');
      const paths = mine.length ? (await (await caches.open(mine[mine.length - 1])).keys()).map((r) => new URL(r.url).pathname) : [];
      return { caches: mine, paths };
    });
    const has = (re) => cached.paths.some((p) => re.test(p));
    check('Hizmet çalışanı sayfayı devralıyor; kabuk, oyun ekranı, şehir sahnesi, İngilizce ve yazı tipleri önbellekte',
      controlled && cached.caches.length === 1 && has(/\/index\.html$/) && has(/GameRoot-/) && has(/three-/) && has(/locale-en-/) && has(/\.woff2$/) && !has(/\.map$/),
      `${cached.caches.join(', ')} · ${cached.paths.length} dosya`);
    await wp.locator('[data-settings-open]').click();
    await wp.waitForSelector('.settings [data-settings-app]', { timeout: 5000 });
    const appSection = await wp.evaluate(() => ({
      ready: document.querySelector('[data-offline-ready]')?.getAttribute('data-offline-ready'),
      text: document.querySelector('[data-settings-app]')?.textContent ?? '',
    }));
    check('Ayarlar\'da Uygulama bölümü: çevrimdışı hazır, kurma yolu yazıyor', appSection.ready === 'true' && /Çevrimdışı hazır/.test(appSection.text) && /kur/i.test(appSection.text),
      appSection.text.slice(0, 90));
    await wp.keyboard.press('Escape');

    // Bağlantı yok: oyun yine açılıyor, İngilizce ve oyun ekranı önbellekten geliyor.
    serverDown = true;
    await wp.reload();
    await wp.waitForSelector('.newgame', { timeout: 20000 });
    await wp.locator('.newgame [data-locale="en"]').click();
    const english = await wp.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 }).then(() => true, () => false);
    await wp.fill('.newgame-field input[type="text"]', 'Offline Ltd');
    await wp.locator('button:has-text("Found the company")').click();
    const started = await wp.waitForSelector('.topbar', { timeout: 30000 }).then(() => true, () => false);
    check('Sunucuya ulaşılamıyor: kurulum açılıyor, İngilizceye geçiliyor, şirket kuruluyor ve şehir çiziliyor',
      english && started && (await wp.evaluate(() => window.__capital.getState().companies[window.__capital.getState().playerCompanyId]?.name)) === 'Offline Ltd');
    serverDown = false;

    // Yeni sürüm: sunucu çalışanın baytlarını değiştiriyor, tarayıcı arka planda kuruyor.
    await wp.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 40; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const dayBefore = await wp.evaluate(() => window.__capital.getState().time.day);
    swBump = 'yeni';
    await wp.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const noticed = await wp.waitForSelector('[data-update-ready]', { timeout: 30000 }).then(() => true, () => false);
    const waiting = await wp.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { waiting: registration.waiting !== null, day: window.__capital.getState().time.day, text: document.querySelector('[data-update-ready]')?.textContent ?? '' };
    });
    check('Yeni sürüm arka planda iniyor ve bekliyor; "yeni sürüm hazır" görünüyor, oyun sürüyor',
      noticed && waiting.waiting && waiting.day === dayBefore && /new version/i.test(waiting.text), waiting.text.slice(0, 60));
    await wp.screenshot({ path: `${OUT}/update-ready.png` });
    await Promise.all([
      wp.waitForNavigation({ timeout: 30000 }),
      wp.locator('[data-update-apply]').click(),
    ]);
    await wp.waitForSelector('.topbar', { timeout: 30000 });
    const after = await wp.evaluate(async () => ({
      day: window.__capital.getState().time.day,
      name: window.__capital.getState().companies[window.__capital.getState().playerCompanyId]?.name,
      caches: (await caches.keys()).filter((key) => key.startsWith('capitalforge-') && key !== 'capitalforge-meta'),
      notice: document.querySelector('[data-update-ready]') !== null,
    }));
    check('Yenile: oyun kaydediliyor, yeni sürüm devralıyor, oyun kaldığı günden açılıyor; önceki sürümün önbelleği duruyor',
      after.day === dayBefore && after.name === 'Offline Ltd' && after.caches.length === 2 && after.caches[1].endsWith('-yeni') && !after.notice,
      `gün ${dayBefore} → ${after.day} · ${after.caches.join(', ')}`);
    swBump = '';
    check('Kurulabilir oyun akışında konsol temiz', wErrors.length === 0, wErrors.slice(0, 2).join(' | '));
    await wContext.close();
  }

  // ---------- Müzik (Tur 49) ----------
  // Dosyasız, üretilmiş müzik: ruh hâlini şehir seçiyor, ölçü başında dönüyor.
  section('Müzik');
  {
    const mContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await mContext.addInitScript(veteran, TUTORIAL_KEY);
    const mp = await mContext.newPage();
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(e.message));
    mp.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
    await mp.goto('http://127.0.0.1:8811/');
    await mp.waitForSelector('.newgame', { timeout: 20000 });
    await mp.fill('.newgame-field input[type="text"]', 'Nota AŞ');
    await mp.locator('button:has-text("Şirketi kur")').click();
    await mp.waitForSelector('.topbar', { timeout: 30000 });
    // İlk dokunuş ses bağlamını (ve müziği) açıyor; haritaya tıklamadan.
    await mp.keyboard.press('Shift');
    await mp.evaluate(() => {
      window.__capital.setTimeOfDay(0.28);
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
    });
    const music = () => mp.evaluate(() => window.__capital.audio()?.music ?? null);
    /** Müzik koşulu sağlanana kadar bekle (ölçü 2,5–3,5 sn; yazılımsal GPU'da gün de yavaş). */
    const until = async (predicate, ms) => {
      const end = Date.now() + ms;
      let last = await music();
      while (Date.now() < end) {
        if (last && predicate(last)) return { ok: true, last };
        await mp.waitForTimeout(400);
        last = await music();
      }
      return { ok: Boolean(last && predicate(last)), last };
    };
    const brief = (m) => (m ? `${m.mood} · ölçü ${m.bar} · ${JSON.stringify(m.played)}` : 'müzik yok');

    const day = await until((m) => m.mood === 'day' && m.played.pad >= 3 && m.played.bass >= 1 && m.played.arp >= 2, 10000);
    check('Müzik ilk dokunuştan sonra başlıyor; gündüz pad, bas ve arpej çalıyor', day.ok, brief(day.last));

    await mp.evaluate(() => window.__capital.setTimeOfDay(0.75));
    const night = await until((m) => m.mood === 'night', 15000);
    check('Şehirde gece olunca müzik ölçü başında geceye dönüyor', night.ok, brief(night.last));

    const pulseBefore = night.last?.played.pulse ?? 0;
    await mp.evaluate(() => {
      const s = window.__capital.getState();
      s.crisis = { defId: 'rate_shock', phase: 'warning', activeDay: s.time.day + 30, endDay: s.time.day + 150 };
    });
    const warned = await until((m) => m.played.pulse > pulseBefore, 10000);
    check('Kriz uyarısında günün müziği sürüyor, altında kalp atışı', warned.ok && warned.last.mood === 'night', brief(warned.last));

    await mp.evaluate(() => {
      const s = window.__capital.getState();
      s.crisis = { defId: 'deep_recession', phase: 'active', activeDay: s.time.day, endDay: s.time.day + 400 };
    });
    const crisis = await until((m) => m.mood === 'crisis', 12000);
    check('Kriz başlayınca müzik krize dönüyor (Si minör, kalp atışı bas)', crisis.ok, brief(crisis.last));
    await mp.evaluate(() => {
      delete window.__capital.getState().crisis;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });

    // Katmanlar sönene dek (yavaş makinede 2,5 sn'den uzun sürebiliyor; yük
    // altında kalp atışı 8 sn'de %2,7'deydi, Tur 66'nın tam koşusu).
    const paused = await until((m) => m.layers.pad > 0.3 && m.layers.bass > 0.3 && m.layers.arp < 0.02 && m.layers.lead < 0.02 && m.layers.pulse < 0.02, 20000);
    check('Duraklayınca yalnız pad ve bas kalıyor', paused.ok, paused.last ? JSON.stringify(paused.last.layers) : 'müzik yok');

    await mp.locator('.speeds [data-panel="settings"]').click();
    await mp.locator('[data-volume="music"]').focus();
    await mp.keyboard.press('Home');
    const levels = await mp.evaluate(() => ({
      buses: window.__capital.audio().buses,
      sliders: [...document.querySelectorAll('[data-volume]')].map((el) => el.getAttribute('data-volume')),
      output: document.querySelector('[data-volume="music"] + output')?.textContent?.trim(),
    }));
    check('Ayarlar\'da Müzik düzeyi: sıfırlanınca müzik yolu susuyor, şehir ve olaylar yerinde',
      levels.buses.music === 0 && levels.buses.ambience === 1 && levels.buses.effects === 1 && levels.sliders.join() === 'master,music,ambience,effects' && levels.output === '%0',
      JSON.stringify(levels));
    await mp.keyboard.press('Escape');

    // Yeni oyun menüsüne dönünce şehir sesi ve müzik susuyor (Tur 49'a kadar
    // şehir sesi menüde son düzeyinde çalmaya devam ediyordu).
    // Köprü oyun ekranıyla gidiyor; ses manzarasının kancası önceden tutuluyor.
    await mp.evaluate(() => {
      window.__soundProbe = window.__capital.audio;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
    });
    await mp.locator('.topbar-actions [data-panel="saves"]').click();
    await mp.locator('.modal button', { hasText: 'Yeni oyun' }).click();
    await mp.waitForSelector('.newgame', { timeout: 10000 });
    await mp.waitForTimeout(500);
    const afterMenu = await mp.evaluate(() => window.__soundProbe?.() ?? null);
    check('Yeni oyun menüsüne dönünce şehir sesi ve müzik susuyor', afterMenu !== null && afterMenu.context === 'none' && afterMenu.music === null,
      afterMenu ? `bağlam ${afterMenu.context} · müzik ${afterMenu.music ? afterMenu.music.mood : 'yok'}` : 'kanca yok');
    check('Müzik akışında konsol temiz', mErrors.length === 0, mErrors.slice(0, 2).join(' | '));
    await mContext.close();
  }

  // ---------- Değerlendirme: Faz 1 sonu (Tur 50) ----------
  // Yeni oyuncunun gözünden telefon: dört genişlik, üç dil (Tur 69), dört metin boyutu.
  section('Değerlendirme: Faz 1 sonu');
  {
    const cut = [];
    const eErrors = [];
    /*
     * Tur 51: aynı kontrol bir de harf genişliklerinin piksele yuvarlandığı
     * tarayıcıda (`--font-render-hinting=full`). CI'nin Chromium'u öyle çiziyor:
     * genişlik yazı küçüldükçe basamak basamak iniyor ve Tur 50'nin üç geçişi
     * İngilizce 320 px'te "Company"yi 0,25 px taşırıyordu (main kırmızısı). Bu
     * makinenin tarayıcısında görünmüyordu. En dar ekranda, iki dilde.
     */
    // Bayrak yalnız Playwright'ın başsız kabuğunda geçiyor (CI'nin tarayıcısı o);
    // tam Chromium onu yok sayıyor. Kabuk kurulu değilse elimizdeki tarayıcı.
    const hintedArgs = ['--font-render-hinting=full', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'];
    const hinted = await chromium
      .launch({ args: hintedArgs })
      .catch(() => chromium.launch({ ...(CHROMIUM ? { executablePath: CHROMIUM } : {}), args: hintedArgs }));
    const runs = [
      // Almanca (Tur 69): etiketler en uzun onda.
      ...['tr', 'en', 'de'].flatMap((locale) => [320, 360, 390, 412].map((width) => ({ locale, width, on: browser, tag: '' }))),
      ...['tr', 'en', 'de'].map((locale) => ({ locale, width: 320, on: hinted, tag: ' (yuvarlanan yazı)' })),
    ];
    for (const { locale, width: viewportWidth, on, tag } of runs) {
      {
        const width = viewportWidth;
        const eContext = await on.newContext({ viewport: { width, height: 760 }, hasTouch: true, serviceWorkers: 'block' });
        await eContext.addInitScript(veteran, TUTORIAL_KEY);
        await eContext.addInitScript((loc) => localStorage.setItem('capitalforge.locale', loc), locale);
        const ep = await eContext.newPage();
        ep.on('pageerror', (e) => eErrors.push(e.message));
        ep.on('console', (m) => { if (m.type() === 'error') eErrors.push(m.text()); });
        await ep.goto('http://127.0.0.1:8811/');
        await ep.waitForSelector('[data-newgame-start]', { timeout: 20000 });
        await ep.locator('[data-newgame-start]').click();
        await ep.waitForSelector('.topbar-actions .dock-label', { timeout: 30000 });
        await ep.evaluate(() => document.fonts.ready);
        const cutLabels = () =>
          ep.evaluate(async () => {
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const labels = [...document.querySelectorAll('.topbar-actions .dock-label')];
            const sizes = new Set(labels.map((el) => getComputedStyle(el).fontSize));
            // Kesirli genişlik: `scrollWidth` yuvarlıyor, yarım piksellik taşma da üç nokta demek.
            const range = document.createRange();
            const cut = labels
              .filter((el) => {
                range.selectNodeContents(el);
                return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01;
              })
              .map((el) => el.textContent);
            // Etiketler tek boyda: sığmayan varsa hepsi birlikte küçülüyor.
            if (sizes.size > 1) cut.push(`boylar karışık (${[...sizes].join(' ')})`);
            return cut;
          });
        // İlk açılış: yazı tipi geç gelse de etiketler yeniden ölçülmüş olmalı.
        await ep.waitForTimeout(600);
        const first = await cutLabels();
        if (first.length) cut.push(`${locale} ${width}px${tag} açılışta: ${first.join(', ')}`);
        // Metin boyutu oyuncunun yolundan: Ayarlar.
        for (const size of ['small', 'normal', 'large', 'xlarge']) {
          await ep.locator('.topbar [data-panel="settings"]').click();
          await ep.locator(`[data-setting="text"][data-choice="${size}"]`).click();
          await ep.keyboard.press('Escape');
          const labels = await cutLabels();
          if (labels.length) cut.push(`${locale} ${width}px${tag} ${size}: ${labels.join(', ')}`);
        }
        // Ekran daralınca (telefon döndü, pencere küçüldü) yeniden ölçülüyor.
        if (width === 412 && !tag) {
          await ep.setViewportSize({ width: 320, height: 760 });
          const labels = await cutLabels();
          if (labels.length) cut.push(`${locale} 412→320px xlarge: ${labels.join(', ')}`);
        }
        await eContext.close();
      }
    }
    await hinted.close();
    check('Telefonda rıhtım etiketleri kesilmiyor ve tek boyda: 320–412 px, Türkçe, İngilizce ve Almanca, açılışta, dört metin boyutunda, ekran daralınca, yuvarlanan yazıda da',
      cut.length === 0, cut.length ? `${cut.length} durumda — ${cut.slice(0, 3).join(' | ')}` : '78 durum');
    check('Değerlendirme akışında konsol temiz', eErrors.length === 0, eErrors.slice(0, 2).join(' | '));
  }

  // ---------- Lojistik (Tur 56) ----------
  // Nakliye terminali rakip mağazalarına taşıma sözleşmesiyle taşıyor. Sınanan
  // akış oyuncunun yolu: terminal kurulur, teklif gündemde çıkar, çip
  // terminalin paneline götürür, kabul sözleşmeyi açar, ücret deftere düşer,
  // kamyonlar rakibin vitrinine gider, iki adımda bitirmek cayma bedelini keser.
  section('Lojistik: nakliye terminali ve taşıma sözleşmeleri');
  {
    const fContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await fContext.addInitScript(veteran, TUTORIAL_KEY);
    const fp = await fContext.newPage();
    const fErrors = [];
    fp.on('pageerror', (e) => fErrors.push(e.message));
    fp.on('console', (m) => { if (m.type() === 'error') fErrors.push(m.text()); });
    await fp.goto('http://127.0.0.1:8811/');
    await fp.waitForSelector('.newgame', { timeout: 20000 });
    await fp.fill('.newgame-field input[type="text"]', 'Nakliye AŞ');
    await fp.locator('button:has-text("Şirketi kur")').click();
    await fp.waitForSelector('.topbar', { timeout: 30000 });

    // Rakipler 150 gün büyüsün; sonra oyuncuya terminali açacak değer ve nakit.
    const site = await fp.evaluate(() => {
      const api = window.__capital;
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 150; i++) api.engine.runDay();
      const state = api.getState();
      const me = state.companies[state.playerCompanyId];
      me.cash += 5_000_000;
      me.netWorth += 5_000_000;
      const rivals = Object.values(state.buildings).filter((b) => b.companyId !== me.id && api.buildingRole(b.defId) === 'outlet');
      const sites = [];
      for (const tile of state.map.tiles) {
        if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId) continue;
        const count = rivals.filter((o) => {
          const at = state.map.tiles[o.tileId];
          return Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= 10;
        }).length;
        sites.push({ id: tile.id, count });
      }
      // En yoğun parsel o an ihalede olabiliyor ve oyun ihaledeki parseli
      // satmıyor (Tur 71'in tam koşusu: 12 şehrin birinde). Satın alınabilen
      // en yoğun parsel; sıralama kararlı, eşitlikte haritadaki ilk parsel.
      sites.sort((a, b) => b.count - a.count);
      const best = sites.find((site) => api.engine.dispatch({ type: 'BUY_TILE', tileId: site.id }).ok);
      const built = best !== undefined && api.engine.dispatch({ type: 'BUILD', tileId: best.id, defId: 'freight_terminal' }).ok;
      return { ...best, built, skipped: best ? sites.indexOf(best) : sites.length, day: state.time.day };
    });
    check('Terminal rakip mağazalarının yoğun olduğu parsele kuruluyor', site.built && site.count >= 4, `${site.count} rakip mağazası menzilde, ${site.day}. gün${site.skipped ? ` · daha yoğun ${site.skipped} parsel satılmıyordu` : ''}`);

    const offer = await fp.evaluate(() => {
      const api = window.__capital;
      for (let i = 0; i < 80 && !api.getState().freight?.offers.length; i++) api.engine.runDay();
      // `runDay` arayüze haber vermiyor; bir komut veriyor.
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const o = api.getState().freight?.offers[0];
      return o ? { id: o.id, company: api.getState().companies[o.companyId].name, outlets: o.outletIds.length, estimate: o.estimate } : null;
    });
    check('Taşıma teklifi geliyor', offer !== null, offer ? `${offer.company}: ${offer.outlets} mağaza, günde ~${offer.estimate}` : 'teklif yok');

    if (offer) {
      const chip = fp.locator(`[data-agenda-freight="freight:${offer.id}"]`);
      await chip.waitFor({ timeout: 5000 }).catch(() => {});
      const chipText = await chip.textContent().catch(() => '');
      check('Teklif gündemde, şirketin adıyla', chipText.includes(offer.company), chipText);
      await chip.click().catch(() => {});
      const desk = fp.locator('[data-freight-desk]');
      await desk.waitFor({ timeout: 5000 }).catch(() => {});
      check('Çip terminalin paneline götürüyor: masada teklif', (await fp.locator(`[data-freight-offer="${offer.id}"]`).count()) === 1);
      await fp.screenshot({ path: `${OUT}/freight-offer.png` });

      await fp.locator(`[data-freight-accept="${offer.id}"]`).click();
      await fp.waitForSelector('[data-freight-contract]', { timeout: 5000 }).catch(() => {});
      const fleet = await fp.locator('[data-freight-fleet]').getAttribute('data-freight-fleet').catch(() => null);
      check('Kabul sözleşmeyi açıyor, filo doluyor', (await fp.locator('[data-freight-contract]').count()) === 1 && fleet === `${offer.outlets}/16`, `filo ${fleet}`);

      const after = await fp.evaluate(() => {
        const api = window.__capital;
        api.engine.runDay();
        api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        const state = api.getState();
        const deal = state.freight.contracts[0];
        const terminal = state.buildings[deal.terminalId];
        const legs = api.routeSignature().split('|');
        const reach = deal.outletIds.filter((id) => legs.includes(`player:${terminal.tileId}>${state.buildings[id].tileId}`)).length;
        const firstOutlet = state.buildings[deal.outletIds[0]];
        return { fee: deal.lastFee, revenue: terminal.last.revenue, reach, outlets: deal.outletIds.length, first: firstOutlet.tileId, firstFee: Math.round(firstOutlet.last.freight ?? 0), earned: Math.round(terminal.freightEarned ?? 0) };
      });
      check('Ücret terminalin defterine düşüyor', after.fee > 0 && Math.abs(after.revenue - after.fee) < 1e-6, `bugün ${Math.round(after.fee)} ₺`);
      check('Kamyonlar terminalden rakibin mağazalarına gidiyor', after.reach === after.outlets, `${after.reach}/${after.outlets} mağaza`);
      await fp.waitForTimeout(300);
      const ledgerText = await fp.locator('.building .ledger').first().textContent();
      check('Terminalin defteri taşıma ücretini yazıyor', ledgerText.includes('Taşıma ücreti'), ledgerText.slice(0, 80));
      await fp.screenshot({ path: `${OUT}/freight-desk.png` });

      // Rakip mağazasının paneli: dağıtımını senin terminalin yapıyor.
      await fp.evaluate((tile) => window.__capital.selectTile(tile), after.first);
      await fp.waitForTimeout(200);
      // Not o mağazanın kendi ücretini yazıyor, sözleşmenin toplamını değil (Codex #86).
      const noteFee = Number(await fp.locator('[data-freight-client]').getAttribute('data-freight-fee').catch(() => NaN));
      check('Rakip mağazasının panelinde taşıma notu, o mağazanın ücretiyle', noteFee === after.firstFee && noteFee > 0 && (after.outlets === 1 || noteFee < Math.round(after.fee)), `mağaza ${noteFee} ₺ · sözleşme ${Math.round(after.fee)} ₺`);

      // İki adımda bitir: ilk tık bedeli gösteriyor, ikincisi kesiyor.
      const terminalTile = site.id;
      await fp.evaluate((tile) => window.__capital.selectTile(tile), terminalTile);
      await fp.waitForSelector('[data-freight-cancel="ask"]', { timeout: 5000 });
      check('Yıkma düğmesinin üstünde cayma uyarısı', (await fp.locator('[data-freight-demolish]').count()) === 1);
      await fp.locator('[data-freight-cancel="ask"]').click();
      const confirmText = await fp.locator('[data-freight-cancel="confirm"]').textContent();
      const before = await fp.evaluate(() => window.__capital.getState().companies.player.cash);
      await fp.locator('[data-freight-cancel="confirm"]').click();
      await fp.waitForTimeout(200);
      const ended = await fp.evaluate(() => ({ cash: window.__capital.getState().companies.player.cash, contracts: window.__capital.getState().freight.contracts.length }));
      check('Bitirmek iki adımda; cayma bedeli düğmede yazıyor ve kesiliyor', confirmText.includes('cayma bedeli') && ended.contracts === 0 && ended.cash < before, `${confirmText.trim()} · ${Math.round(before - ended.cash)} ₺`);
      check('Sözleşme kalmayınca masa menzili söylüyor', (await fp.locator('[data-freight-prospects]').count()) === 1);
      const kept = Number(await fp.locator('[data-freight-earned]').getAttribute('data-freight-earned').catch(() => NaN));
      check('Terminalin topladığı ücret sözleşme bitince de duruyor (Codex #86)', kept === after.earned && kept > 0, `${kept} ₺`);
    }
    check('Lojistik akışında konsol temiz', fErrors.length === 0, fErrors.slice(0, 2).join(' | '));
    await fContext.close();
  }

  section('Enerji: santraller, şebeke fiyatı ve yakıt sabitleme');
  {
    const eContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await eContext.addInitScript(veteran, TUTORIAL_KEY);
    const ep = await eContext.newPage();
    const eErrors = [];
    ep.on('pageerror', (e) => eErrors.push(e.message));
    ep.on('console', (m) => { if (m.type() === 'error') eErrors.push(m.text()); });
    await ep.goto('http://127.0.0.1:8811/');
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    await ep.fill('.newgame-field input[type="text"]', 'Enerji AŞ');
    await ep.locator('button:has-text("Şirketi kur")').click();
    await ep.waitForSelector('.topbar', { timeout: 30000 });

    // Şehir 150 gün büyüsün; oyuncuya santrali açacak değer ve nakit, sanayi/limanda
    // menziline en çok bina giren boş parsel.
    const site = await ep.evaluate(() => {
      const api = window.__capital;
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 150; i++) api.engine.runDay();
      const state = api.getState();
      delete state.crisis;
      state.activeEvents = [];
      delete state.era;
      const me = state.companies[state.playerCompanyId];
      me.cash += 5_000_000;
      me.netWorth += 5_000_000;
      const sites = [];
      for (const tile of state.map.tiles) {
        if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId) continue;
        const archetype = state.districts[tile.districtId].archetype;
        if (archetype !== 'industrial' && archetype !== 'port') continue;
        let count = 0;
        for (const b of Object.values(state.buildings)) {
          const at = state.map.tiles[b.tileId];
          if (Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= 12) count++;
        }
        sites.push({ id: tile.id, count });
      }
      // Lojistikteki gibi: satın alınabilen en yoğun parsel (ihaledeki satılmıyor).
      sites.sort((a, b) => b.count - a.count);
      const best = sites.find((site) => api.engine.dispatch({ type: 'BUY_TILE', tileId: site.id }).ok);
      return { ...best, bought: best !== undefined, day: state.time.day };
    });
    check('Sanayide menziline bina giren boş parsel alınıyor', site.bought && site.count >= 4, `${site.count} bina menzilde, ${site.day}. gün`);

    // Yapı menüsü: santralin tahmini parsele göre, kazanç-satış-yakıt kırılımıyla.
    await ep.evaluate((tile) => window.__capital.selectTile(tile), site.id);
    await ep.waitForTimeout(300);
    const card = ep.locator('.buildcard:has(.buildcard-name:text-is("Doğalgaz Santrali"))');
    const cardText = (await card.textContent().catch(() => '')) ?? '';
    const potential = Number(await card.locator('[data-energy-potential]').getAttribute('data-energy-potential').catch(() => NaN));
    check('Yapı menüsünde santralin tahmini: menzildeki binalar, kazanç, satış, yakıt', potential > 0 && cardText.includes('yakıt'), cardText.replace(/\s+/g, ' ').slice(0, 140));
    await card.click();
    await ep.waitForTimeout(200);
    await ep.locator('button:has-text("Seçili arsaya inşa et")').click();
    await ep.waitForTimeout(300);
    const plantId = await ep.evaluate((tile) => window.__capital.getState().map.tiles[tile].buildingId, site.id);
    check('Doğalgaz santrali kuruluyor', Boolean(plantId), plantId ?? 'yok');
    // Menzile bir de oyuncunun bakkalı: güç önce sahibinin binasına gidiyor.
    await ep.evaluate((plantTile) => {
      const api = window.__capital;
      const state = api.getState();
      const at = state.map.tiles[plantTile];
      const near = state.map.tiles
        .filter((tile) => tile.kind === 'plot' && !tile.ownerId && !tile.buildingId && !tile.structureId && Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y) <= 8)
        .sort((a, b) => Math.abs(a.x - at.x) + Math.abs(a.y - at.y) - (Math.abs(b.x - at.x) + Math.abs(b.y - at.y)));
      for (const tile of near) {
        if (!api.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (api.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) return tile.id;
      }
      return null;
    }, site.id);

    const day = await ep.evaluate((id) => {
      const api = window.__capital;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const state = api.getState();
      const plant = state.buildings[id];
      const served = Object.values(state.buildings).filter((b) => b.last.power?.plantId === id);
      const own = served.find((b) => b.companyId === state.playerCompanyId);
      const rival = served.find((b) => b.companyId !== state.playerCompanyId);
      return {
        used: (plant.last.plant?.ownMwh ?? 0) + (plant.last.plant?.rivalMwh ?? 0),
        buildings: plant.last.plant?.buildings ?? 0,
        sold: plant.last.revenue,
        fuel: plant.last.cogs,
        own: own ? { tile: own.tileId, saved: Math.round(own.last.power.saved) } : null,
        rival: rival ? { tile: rival.tileId, bill: Math.round(rival.last.power.bill) } : null,
      };
    }, plantId);
    check('Santral menzilindeki binalara enerji veriyor, yakıtını ödüyor', day.used > 0 && day.buildings > 0 && day.fuel > 0, `${day.buildings} bina, ${day.used.toFixed(1)} MWh, yakıt ${Math.round(day.fuel)} ₺`);
    await ep.waitForTimeout(300);
    const used = await ep.locator('[data-power-used]').getAttribute('data-power-used').catch(() => null);
    check('Santralin masası gücü yazıyor', used !== null && Number(used.split('/')[0]) > 0, used ?? 'masa yok');
    const ledger = (await ep.locator('.building .ledger').first().textContent().catch(() => '')) ?? '';
    check('Santralin defteri rakiplere satışı ve yakıtı yazıyor', ledger.includes('Rakiplere enerji satışı') && ledger.includes('Yakıt'), ledger.slice(0, 90));
    await ep.screenshot({ path: `${OUT}/energy-desk.png` });

    if (day.own) {
      await ep.evaluate((tile) => window.__capital.selectTile(tile), day.own.tile);
      await ep.waitForTimeout(200);
      const saved = Number(await ep.locator('[data-power-from]').getAttribute('data-power-saved').catch(() => NaN));
      check('Kendi binasının panelinde enerjinin santralden geldiği ve kazancı', saved === day.own.saved && saved > 0, `${saved} ₺`);
    } else check('Kendi binasının panelinde enerjinin santralden geldiği ve kazancı', false, 'menzilde kendi binası yok');
    if (day.rival) {
      await ep.evaluate((tile) => window.__capital.selectTile(tile), day.rival.tile);
      await ep.waitForTimeout(200);
      const bill = Number(await ep.locator('[data-power-client]').getAttribute('data-power-bill').catch(() => NaN));
      check('Rakip binasının panelinde santraline ödediği', bill === day.rival.bill && bill > 0, `${bill} ₺`);
    } else check('Rakip binasının panelinde santraline ödediği', true, 'güç kendi binalarına yetti (rakip almıyor)');

    // Enerji krizi uyarısı: gündemde yakıt çipi, çip santrale götürüyor.
    const shockId = await ep.evaluate(() => {
      const api = window.__capital;
      const state = api.getState();
      state.crisis = { defId: 'energy_shock', phase: 'warning', activeDay: state.time.day + 20, endDay: state.time.day + 120 };
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return state.crisis.defId;
    });
    const fuelChip = ep.locator('[data-agenda-fuel]');
    await fuelChip.waitFor({ timeout: 5000 }).catch(() => {});
    check('Enerji krizi uyarısında gündemde yakıt çipi', (await fuelChip.count()) === 1, shockId);
    await ep.evaluate(() => window.__capital.selectTile(null));
    await fuelChip.click().catch(() => {});
    await ep.waitForSelector('[data-fuel-lock]', { timeout: 5000 }).catch(() => {});
    check('Çip santralin paneline götürüyor: sabitleme düğmesi', (await ep.locator('[data-fuel-lock]').count()) === 1);
    const calmFuel = await ep.evaluate((id) => window.__capital.getState().buildings[id].last.cogs, plantId);
    await ep.locator('[data-fuel-lock]').click();
    await ep.waitForSelector('[data-fuel-locked]', { timeout: 5000 }).catch(() => {});
    check('Sabitleme masada görünüyor, çip gündemden kalkıyor', (await ep.locator('[data-fuel-locked]').count()) === 1 && (await ep.locator('[data-agenda-fuel]').count()) === 0);

    // Kriz başlıyor: şebeke iki katı, sabit yakıt yerinde.
    const shock = await ep.evaluate((id) => {
      const api = window.__capital;
      const state = api.getState();
      state.crisis.phase = 'active';
      state.crisis.activeDay = state.time.day;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const plant = state.buildings[id];
      return { fuel: plant.last.cogs, sold: plant.last.revenue };
    }, plantId);
    await ep.waitForTimeout(300);
    const price = await ep.locator('[data-energy-price]').getAttribute('data-energy-price').catch(() => null);
    const ratio = shock.fuel / Math.max(1, calmFuel);
    check('Krizde şebeke fiyatı iki katı, yakıt sabit fiyatla (×1,08)', price === '2.00' && Math.abs(ratio - 1.08) < 0.1, `fiyat ×${price} · yakıt ×${ratio.toFixed(2)}`);
    check('Krizde rakiplere satış büyüyor', shock.sold >= day.sold, `${Math.round(day.sold)} → ${Math.round(shock.sold)} ₺`);
    await ep.screenshot({ path: `${OUT}/energy-shock.png` });
    // Yakın plan: santral ve yanına bir güneş tarlası (görsel kayıt).
    await ep.evaluate((tile) => {
      const api = window.__capital;
      const state = api.getState();
      const at = state.map.tiles[tile];
      const spot = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.buildingId && !t.structureId && t.districtId === at.districtId && Math.abs(t.x - at.x) + Math.abs(t.y - at.y) <= 3);
      if (spot && api.engine.dispatch({ type: 'BUY_TILE', tileId: spot.id }).ok) api.engine.dispatch({ type: 'BUILD', tileId: spot.id, defId: 'solar_farm' });
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      api.selectTile(null);
      api.setTimeOfDay(0.3);
      api.setView({ x: at.x, z: at.y, distance: 14 });
    }, site.id);
    await ep.waitForTimeout(1500);
    await ep.screenshot({ path: `${OUT}/energy-plant.png` });
    check('Enerji akışında konsol temiz', eErrors.length === 0, eErrors.slice(0, 2).join(' | '));
    await eContext.close();
  }

  section('Gayrimenkul: proje, kira ve kentsel dönüşüm');
  {
    const rContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await rContext.addInitScript(veteran, TUTORIAL_KEY);
    const rp = await rContext.newPage();
    const rErrors = [];
    rp.on('pageerror', (e) => rErrors.push(e.message));
    rp.on('console', (m) => { if (m.type() === 'error') rErrors.push(m.text()); });
    await rp.goto('http://127.0.0.1:8811/');
    await rp.waitForSelector('.newgame', { timeout: 20000 });
    await rp.fill('.newgame-field input[type="text"]', 'Gayrimenkul AŞ');
    await rp.locator('button:has-text("Şirketi kur")').click();
    await rp.waitForSelector('.topbar', { timeout: 30000 });

    // Şehir 150 gün büyüsün; projeyi açacak değer ve nakit, en kalabalık konut bölgesinde boş parsel.
    const ESTATE_ZONES = ['downtown', 'retail_strip', 'lux_residential', 'mid_residential', 'student', 'tourism'];
    const site = await rp.evaluate((zones) => {
      const api = window.__capital;
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 150; i++) api.engine.runDay();
      const state = api.getState();
      delete state.crisis;
      state.activeEvents = [];
      delete state.era;
      const me = state.companies[state.playerCompanyId];
      me.cash += 60_000_000;
      me.netWorth += 20_000_000;
      const sites = [];
      for (const tile of state.map.tiles) {
        if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId) continue;
        const district = state.districts[tile.districtId];
        if (!zones.includes(district.archetype) || (district.opensOnDay ?? 0) > state.time.day) continue;
        sites.push({ id: tile.id, population: district.population });
      }
      // Lojistikteki gibi: satın alınabilen en kalabalık parsel (ihaledeki satılmıyor).
      sites.sort((a, b) => b.population - a.population);
      const best = sites.find((site) => api.engine.dispatch({ type: 'BUY_TILE', tileId: site.id }).ok);
      return { ...best, bought: best !== undefined, day: state.time.day };
    }, ESTATE_ZONES);
    check('Konut bölgesinde boş parsel alınıyor', site.bought, `${Math.round(site.population)} nüfus, ${site.day}. gün`);

    // Yapı menüsü: proje kartı inşaat süresini ve dolmuş projenin tahminini söylüyor.
    await rp.evaluate((tile) => window.__capital.selectTile(tile), site.id);
    await rp.waitForTimeout(300);
    const card = rp.locator('.buildcard:has(.buildcard-name:text-is("Konut Sitesi"))');
    const cardText = (await card.textContent().catch(() => '')) ?? '';
    const projected = Number(await card.locator('[data-project-estimate]').getAttribute('data-project-estimate').catch(() => NaN));
    check('Yapı menüsünde proje: inşaat süresi ve dolunca tahmin', cardText.includes('inşaat 75 gün') && projected > 0, cardText.replace(/\s+/g, ' ').slice(0, 150));
    await card.click();
    await rp.waitForTimeout(200);
    await rp.locator('button:has-text("Seçili arsaya inşa et")').click();
    await rp.waitForTimeout(300);
    const projectId = await rp.evaluate((tile) => window.__capital.getState().map.tiles[tile].buildingId, site.id);
    check('Konut Sitesi kuruluyor', Boolean(projectId), projectId ?? 'yok');

    // Şantiye: bir gün; kira yok, ücret yok, masa açılışa kalan günü yazıyor.
    const siteDay = await rp.evaluate((id) => {
      const api = window.__capital;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const b = api.getState().buildings[id];
      return { revenue: b.last.revenue, wages: b.last.wages, upkeep: b.last.upkeep, opens: b.development.opensOnDay };
    }, projectId);
    await rp.waitForTimeout(300);
    const opensIn = Number(await rp.locator('[data-opens-in]').getAttribute('data-opens-in').catch(() => NaN));
    check('Şantiye: kira ve ücret yok, bakımın payı; masa açılışa kalan günü yazıyor', siteDay.revenue === 0 && siteDay.wages === 0 && siteDay.upkeep > 0 && opensIn === 74, `açılışa ${opensIn} gün, gider ${Math.round(siteDay.upkeep)} ₺`);
    // Yakın plan: inşaatın ortasında iskelet ve vinç (görsel kayıt).
    await rp.evaluate((tile) => {
      const api = window.__capital;
      const state = api.getState();
      const at = state.map.tiles[tile];
      state.time.day += 38;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      api.selectTile(null);
      api.setTimeOfDay(0.3);
      api.setView({ x: at.x, z: at.y, distance: 8 });
    }, site.id);
    await rp.waitForTimeout(1500);
    await rp.screenshot({ path: `${OUT}/realestate-site.png` });

    // Açılış: ön kiralamayla, kiracılar gün gün geliyor.
    const opened = await rp.evaluate((id) => {
      const api = window.__capital;
      const state = api.getState();
      const b = state.buildings[id];
      const seq = state.newsSeq ?? 0;
      state.time.day = b.development.opensOnDay - 1;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { occupancy: b.development.occupancy, news: state.news.some((n) => n.id > seq && n.title.includes('Konut Sitesi')) };
    }, projectId);
    await rp.evaluate((tile) => window.__capital.selectTile(tile), site.id);
    await rp.waitForTimeout(300);
    const occ = Number(await rp.locator('[data-occupancy]').getAttribute('data-occupancy').catch(() => NaN));
    const target = Number(await rp.locator('[data-occupancy-target]').getAttribute('data-occupancy-target').catch(() => NaN));
    check('Proje açılıyor: haber, ön kiralamayla doluluk, hedef üstte', opened.news && occ === Math.round(opened.occupancy * 100) && target > occ && (await rp.locator('[data-lease-days]').count()) === 1, `%${occ} → hedef %${target}`);
    await rp.screenshot({ path: `${OUT}/realestate-desk.png` });

    // Kira: yukarı hedefi düşürüyor, aşağı yükseltiyor.
    await rp.locator('[data-rent-up]').click();
    await rp.waitForTimeout(200);
    const upLevel = await rp.locator('[data-rent-level]').getAttribute('data-rent-level').catch(() => null);
    const upTarget = Number(await rp.locator('[data-occupancy-target]').getAttribute('data-occupancy-target').catch(() => NaN));
    await rp.locator('[data-rent-down]').click();
    await rp.waitForTimeout(150);
    await rp.locator('[data-rent-down]').click();
    await rp.waitForTimeout(200);
    const downLevel = await rp.locator('[data-rent-level]').getAttribute('data-rent-level').catch(() => null);
    const downTarget = Number(await rp.locator('[data-occupancy-target]').getAttribute('data-occupancy-target').catch(() => NaN));
    check('Kira düğmeleri: ×1,05 hedefi düşürüyor, ×0,95 yükseltiyor', upLevel === '1.05' && downLevel === '0.95' && upTarget < target && downTarget > target, `×1,05 %${upTarget} · ×0,95 %${downTarget} (piyasa %${target})`);
    const filled = await rp.evaluate((id) => {
      const api = window.__capital;
      for (let i = 0; i < 30; i++) api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const b = api.getState().buildings[id];
      return { occupancy: b.development.occupancy, rent: b.rent, revenue: b.last.revenue };
    }, projectId);
    check('Kiracılar geliyor: 30 günde doluluk artıyor, kira ×0,95 defterde', filled.occupancy > opened.occupancy + 0.2 && filled.rent === 0.95 && filled.revenue > 0, `%${Math.round(opened.occupancy * 100)} → %${Math.round(filled.occupancy * 100)}`);

    // Kentsel dönüşüm: şehrin konut yapısına başvuru, sıradaki ihale o parsel.
    const plot = await rp.evaluate((zones) => {
      const state = window.__capital.getState();
      const residential = ['row_houses', 'apartment_block', 'tower_block'];
      const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.buildingId && residential.includes(t.structureId) && zones.includes(state.districts[t.districtId].archetype) && (state.districts[t.districtId].opensOnDay ?? 0) <= state.time.day && state.auction?.tileId !== t.id);
      return tile?.id ?? null;
    }, ESTATE_ZONES);
    await rp.evaluate((tile) => window.__capital.selectTile(tile), plot);
    await rp.waitForTimeout(300);
    const requestButton = rp.locator('[data-renewal-request]');
    check('Şehir yapısının panelinde dönüşüm başvurusu düğmesi', (await requestButton.count()) === 1, (await requestButton.textContent().catch(() => '')) ?? '');
    await requestButton.click().catch(() => {});
    await rp.waitForTimeout(300);
    const pending = (await rp.locator('[data-renewal-pending]').count()) === 1;
    const chip = (await rp.locator('[data-agenda-renewal="renewal:request"]').count()) === 1;
    const blocked = await rp.evaluate((tile) => !window.__capital.engine.dispatch({ type: 'BUYOUT_TILE', tileId: tile }).ok, plot);
    check('Başvuru belediyede: panelde bekliyor, gündemde çip, parsel satılmıyor', pending && chip && blocked, `panel ${pending} · çip ${chip} · satış kapalı ${blocked}`);

    // İhale günü: açılan ihale başvurunun parseli; panelde dönüşüm hakkı notu; oyuncu kazanıyor.
    const auction = await rp.evaluate((tile) => {
      const api = window.__capital;
      const state = api.getState();
      state.auction = null;
      while (state.time.day % 30 !== 29) api.engine.runDay();
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { tileId: state.auction?.tileId ?? null, reserve: state.auction?.reserve ?? 0 };
    }, plot);
    check('Sıradaki ihale başvurunun parseli', auction.tileId === plot, `parsel ${auction.tileId} (başvuru ${plot})`);
    await rp.evaluate(() => window.__capital.selectTile(null));
    await rp.locator('.auction-chip').click().catch(() => {});
    await rp.waitForTimeout(300);
    check('İhale panelinde dönüşüm hakkı notu', (await rp.locator('[data-auction-renewal]').count()) === 1);
    const won = await rp.evaluate((tile) => {
      const api = window.__capital;
      const state = api.getState();
      api.engine.dispatch({ type: 'PLACE_BID', amount: Math.ceil(state.auction.reserve * 40) });
      for (let i = 0; i < 4 && state.auction; i++) api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const t = state.map.tiles[tile];
      return { owner: t.ownerId === state.playerCompanyId, renewal: Boolean(t.renewal), structure: t.structureId };
    }, plot);
    check('Dönüşüm ihalesini kazanan parseli hakla alıyor, yapı yıkılıyor', won.owner && won.renewal && won.structure === null, JSON.stringify(won));
    await rp.keyboard.press('Escape').catch(() => {});
    await rp.waitForTimeout(200);
    check('Gündemde boş dönüşüm parseli çipi', (await rp.locator(`[data-agenda-renewal="renewal:${plot}"]`).count()) === 1);
    await rp.evaluate((tile) => window.__capital.selectTile(tile), plot);
    await rp.waitForTimeout(300);
    check('Parselin panelinde dönüşüm hakkı notu', (await rp.locator(`[data-renewal-right="${plot}"]`).count()) >= 1);

    // Dönüşüm projesi: imar artışıyla, hak sahipleri kirasız.
    const renewed = await rp.evaluate((tile) => {
      const api = window.__capital;
      const state = api.getState();
      const ok = api.engine.dispatch({ type: 'BUILD', tileId: tile, defId: 'housing_estate' }).ok;
      const b = state.buildings[state.map.tiles[tile].buildingId];
      state.time.day = b.development.opensOnDay - 1;
      api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { ok, renewal: b.development.renewal === true, occupancy: b.development.occupancy };
    }, plot);
    await rp.evaluate(() => window.__capital.selectTile(null));
    await rp.evaluate((tile) => window.__capital.selectTile(tile), plot);
    await rp.waitForTimeout(300);
    const holders = Number(await rp.locator('[data-right-holders]').getAttribute('data-right-holders').catch(() => NaN));
    const units = Number(await rp.locator('[data-rent-units]').getAttribute('data-rent-units').catch(() => NaN));
    check('Dönüşüm projesi: imar artışıyla daha çok birim, hak sahipleri kirasız', renewed.ok && renewed.renewal && units > 400 && holders > 0, `${units} kiralık + ${holders} hak sahibi`);
    await rp.evaluate((tile) => {
      const api = window.__capital;
      const at = api.getState().map.tiles[tile];
      api.selectTile(null);
      api.setTimeOfDay(0.3);
      api.setView({ x: at.x, z: at.y, distance: 9 });
    }, plot);
    await rp.waitForTimeout(1500);
    await rp.screenshot({ path: `${OUT}/realestate-estate.png` });
    check('Gayrimenkul akışında konsol temiz', rErrors.length === 0, rErrors.slice(0, 2).join(' | '));
    await rContext.close();
  }

  section('Rakipler 2.0: husumet, ittifak ve tepkiler');
  {
    const vContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await vContext.addInitScript(veteran, TUTORIAL_KEY);
    const vp = await vContext.newPage();
    const vErrors = [];
    vp.on('pageerror', (e) => vErrors.push(e.message));
    vp.on('console', (m) => { if (m.type() === 'error') vErrors.push(m.text()); });
    await vp.goto('http://127.0.0.1:8811/');
    await vp.waitForSelector('.newgame', { timeout: 20000 });
    await vp.fill('.newgame-field input[type="text"]', 'Hafıza AŞ');
    await vp.locator('button:has-text("Şirketi kur")').click();
    await vp.waitForSelector('.topbar', { timeout: 30000 });

    // Şehir 150 gün büyüsün; oyuncunun güçlü kategorisinde rafı olan rakip hedef.
    const setup = await vp.evaluate(() => {
      const api = window.__capital;
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 150; i++) api.engine.runDay();
      const state = api.getState();
      delete state.crisis;
      state.activeEvents = [];
      delete state.era;
      delete state.campaign;
      delete state.campaignEndedDay;
      state.nextCampaignDay = state.time.day + 400;
      const me = state.companies[state.playerCompanyId];
      me.cash += 40_000_000;
      me.netWorth += 20_000_000;
      for (const c of Object.values(state.companies)) {
        delete c.lockedUntilDay;
        delete c.playerLockedUntilDay;
      }
      // Rövanş ortak rafta: oyuncu, mağazası en çok olan rakibin kategorisinde onun bölgelerine üç mağaza açıyor.
      const rivals = Object.values(state.companies).filter((c) => !c.isPlayer && c.profileId);
      const outletsOf = (c) => Object.values(state.buildings).filter((b) => b.companyId === c.id && api.buildingRole(b.defId) === 'outlet');
      const foe = rivals.slice().sort((a, b) => outletsOf(b).length - outletsOf(a).length)[0];
      const friend = rivals.find((c) => c.id !== foe.id);
      // Rakibin payının en büyük olduğu raflardan, oyuncunun altı mağaza açabildiği ilki: az satıcı, pay eşiğin üstünde.
      const ranked = [...new Set(outletsOf(foe).map((b) => api.buildingCategory(b.defId)))].sort((a, b) => (foe.marketShare[b] ?? 0) - (foe.marketShare[a] ?? 0));
      let category = ranked[0];
      let opened = 0;
      for (const candidate of ranked) {
        const defId = outletsOf(foe).find((b) => api.buildingCategory(b.defId) === candidate).defId;
        opened = 0;
        for (const plot of state.map.tiles) {
          if (opened >= 6) break;
          if (plot.kind !== 'plot' || plot.ownerId || plot.buildingId || plot.structureId || (state.districts[plot.districtId].opensOnDay ?? 0) > state.time.day) continue;
          if (!api.engine.dispatch({ type: 'BUY_TILE', tileId: plot.id }).ok) continue;
          if (api.engine.dispatch({ type: 'BUILD', tileId: plot.id, defId }).ok) opened++;
          else api.engine.dispatch({ type: 'SELL_TILE', tileId: plot.id });
        }
        category = candidate;
        if (opened >= 3) break;
      }
      for (let i = 0; i < 10; i++) api.engine.runDay();
      // Dört gün, günde %4 hisse (günlük alım tavanının altı): her mizaçta husumet eşiğinin altına.
      const outstanding = foe.shareCount ?? 10_000;
      const seq = state.newsSeq ?? 0;
      let bought = true;
      for (let i = 0; i < 4; i++) {
        bought = api.engine.dispatch({ type: 'BUY_SHARES', companyId: foe.id, count: Math.floor(outstanding * 0.04) }).ok && bought;
        api.engine.runDay();
      }
      const news = state.news.filter((n) => n.id > seq).map((n) => n.title);
      return { foe: foe.id, foeName: foe.name, friend: friend.id, friendName: friend.name, bought, stance: foe.relation?.stance ?? null, score: foe.relation?.score ?? 0, news, opened, category, share: me.marketShare[category] ?? 0 };
    });
    check(
      'Hisse toplamak husumet getiriyor: haber ve duruş',
      setup.bought && setup.stance === 'hostile' && setup.news.some((t) => t.includes('husumet')),
      `${setup.foeName}: ${setup.score} puan · ${setup.opened} mağaza, ${setup.category} payı ${setup.share.toFixed(2)} · ${setup.news.slice(0, 2).join(' | ')}`,
    );
    await vp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await vp.waitForTimeout(300);
    check('Gündemde husumet çipi', (await vp.locator(`[data-agenda-rival="rival:${setup.foe}"]`).count()) === 1);

    // Rakipler paneli: ilişki sütunu ve husumetlinin dosyası.
    await vp.locator('[data-panel="rivals"]').click();
    await vp.waitForTimeout(300);
    const chip = await vp.locator(`[data-relation-chip="${setup.foe}"]`).first().getAttribute('data-stance').catch(() => null);
    check('Rakipler tablosunda ilişki: husumet', chip === 'hostile', String(chip));
    const dossier = vp.locator(`[data-rival-dossier="${setup.foe}"]`);
    const temperament = await dossier.locator('[data-temperament]').getAttribute('data-temperament').catch(() => null);
    const memory = await dossier.locator('[data-memory-kind]').first().getAttribute('data-memory-kind').catch(() => null);
    const effects = await dossier.locator('[data-relation-effects]').getAttribute('data-relation-effects').catch(() => null);
    const dossierText = ((await dossier.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
    check(
      'Dosya: CEO, mizaç, hatırladıkları ve sana karşı tepkiler',
      Boolean(temperament) && memory === 'shares' && effects === 'hostile' && dossierText.includes('Hisselerini topladın') && dossierText.includes('Fiyat savaşını'),
      `${temperament} · ${memory} · ${dossierText.slice(0, 120)}`,
    );
    await vp.screenshot({ path: `${OUT}/rivals-dossier.png` });

    // Rövanş: husumetin başlamasından 20 gün sonra fiyat savaşı; gündemde "rövanşı".
    const revenge = await vp.evaluate(() => {
      const api = window.__capital;
      const state = api.getState();
      for (let i = 0; i < 21 && !state.campaign; i++) api.engine.runDay();
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const foe = Object.values(state.companies).find((c) => c.relation?.stance === 'hostile');
      const me = state.companies[state.playerCompanyId];
      const shelves = foe
        ? [...new Set(Object.values(state.buildings).filter((b) => b.companyId === foe.id && api.buildingRole(b.defId) === 'outlet').map((b) => api.buildingCategory(b.defId)))]
            .map((c) => `${c}:${(me.marketShare[c] ?? 0).toFixed(2)}/${(foe.marketShare[c] ?? 0).toFixed(2)}`)
            .join(' ')
        : '-';
      const why = `gün ${state.time.day}, husumet ${foe?.relation?.since}, son kampanya ${state.campaignEndedDay}, sıradaki ${state.nextCampaignDay}, raflar ${shelves}, bayraklar ${JSON.stringify({ s: state.flags.rivalStories, n: state.flags.npcCompetition })}`;
      return state.campaign ? { by: state.campaign.companyId, revenge: state.campaign.revenge === true, cut: state.campaign.cut ?? null, category: state.campaign.category, why } : { why };
    });
    await vp.waitForTimeout(300);
    const agendaText = ((await vp.locator('.topbar').textContent().catch(() => '')) ?? '') + ((await vp.locator('body').textContent().catch(() => '')) ?? '');
    check(
      'Rövanş: husumetli rakip ortak rafta fiyat savaşı açıyor, gündemde',
      revenge.by === setup.foe && revenge.revenge && agendaText.includes('rövanşı'),
      revenge.by ? `${revenge.category} ×${revenge.cut}` : `kampanya yok (${revenge.why})`,
    );

    // Uzlaşma: bedel kasadan, puan yükseliyor, hafızada, düğme bekleme süresinde.
    if ((await vp.locator(`[data-rival-dossier="${setup.foe}"]`).count()) === 0) {
      await vp.keyboard.press('Escape');
      await vp.locator('[data-panel="rivals"]').click();
    }
    await vp.waitForTimeout(300);
    const amendsButton = vp.locator(`[data-amends="${setup.foe}"]`);
    const cost = Number(await amendsButton.getAttribute('data-amends-cost').catch(() => NaN));
    const before = await vp.evaluate((id) => {
      const state = window.__capital.getState();
      return { cash: state.companies[state.playerCompanyId].cash, score: state.companies[id].relation.score };
    }, setup.foe);
    await amendsButton.click();
    await vp.waitForTimeout(300);
    const after = await vp.evaluate((id) => {
      const state = window.__capital.getState();
      const r = state.companies[id].relation;
      return { cash: state.companies[state.playerCompanyId].cash, score: r.score, first: r.memory[0]?.kind };
    }, setup.foe);
    const disabled = await amendsButton.isDisabled().catch(() => false);
    check(
      'Uzlaşma: bedel kasadan, puan yükseliyor, hafızada; düğme 90 gün kapalı',
      Math.abs(before.cash - after.cash - cost) < 1 && after.score > before.score && after.first === 'amends' && disabled,
      `bedel ${cost}, puan ${before.score.toFixed(1)} → ${after.score.toFixed(1)}, düğme ${disabled ? 'kapalı' : 'açık'}`,
    );

    // İttifak: müttefikin dosyası ve ihale panelinde iki not (husumetli inadına, müttefik çekiliyor).
    await vp.evaluate(({ friend, foe }) => {
      const api = window.__capital;
      const state = api.getState();
      state.companies[friend].relation = { score: 60, stance: 'allied', since: state.time.day, memory: [{ day: state.time.day, kind: 'freight', delta: 60 }] };
      const f = state.companies[foe].relation;
      f.score = -80;
      f.stance = 'hostile';
      const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.buildingId && !t.structureId && (state.districts[t.districtId].opensOnDay ?? 0) <= state.time.day);
      state.auction = { tileId: tile.id, endsOnDay: state.time.day + 3, reserve: 1000, bid: 0, bidderId: null, rounds: 0 };
      api.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    }, { friend: setup.friend, foe: setup.foe });
    await vp.waitForTimeout(300);
    await vp.locator(`[data-rival-row="${setup.friend}"] button`).click().catch(() => {});
    await vp.waitForTimeout(300);
    const ally = vp.locator(`[data-rival-dossier="${setup.friend}"]`);
    const allyEffects = await ally.locator('[data-relation-effects]').getAttribute('data-relation-effects').catch(() => null);
    const allyBlocked = await ally.locator('[data-amends-blocker]').textContent().catch(() => '');
    check('Müttefikin dosyası: ittifak tepkileri, uzlaşma gereksiz', allyEffects === 'allied' && /müttefik/i.test(allyBlocked ?? ''), `${allyEffects} · ${allyBlocked}`);
    // Rakipler paneli (pencere) kapansın; ihale çipi ihale panelini açıyor.
    await vp.keyboard.press('Escape');
    await vp.waitForTimeout(200);
    // Yazılımsal GPU'da bir kare yarım saniyeyi aşabiliyor: tıklama ve panel bekleniyor.
    await vp.locator('.auction-chip').first().click({ timeout: 15000 }).catch(() => {});
    await vp.waitForSelector('[data-auction-allies]', { timeout: 10000 }).catch(() => null);
    const spite = (await vp.locator('[data-auction-spite]').textContent().catch(() => '')) ?? '';
    const allies = (await vp.locator('[data-auction-allies]').textContent().catch(() => '')) ?? '';
    check('İhale panelinde husumetli ve müttefik notu', spite.includes(setup.foeName) && allies.includes(setup.friendName), `${spite.slice(0, 60)} | ${allies.slice(0, 60)}`);

    check('Rakipler akışında konsol temiz', vErrors.length === 0, vErrors.slice(0, 2).join(' | '));
    await vContext.close();
  }

  section('Senaryo paketi II: nakliye, enerji ve dönüşüm');
  {
    const xContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await xContext.addInitScript(veteran, TUTORIAL_KEY);
    const xp = await xContext.newPage();
    const xErrors = [];
    xp.on('pageerror', (e) => xErrors.push(e.message));
    xp.on('console', (m) => { if (m.type() === 'error') xErrors.push(m.text()); });
    await xp.goto('http://127.0.0.1:8811/');
    await xp.waitForSelector('.newgame', { timeout: 20000 });
    await xp.locator('.mode-picker [data-mode="scenario"]').click();
    const cards = await xp.locator('[data-scenario]').count();
    const rules = await xp.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-scenario-rules]')].map((el) => [el.closest('[data-scenario]')?.getAttribute('data-scenario'), el.textContent])));
    check('Listede on senaryo; yeni üçünün kartında ek kuralı',
      cards === 10 && /Aç gözlü/.test(rules.haulage ?? '') && /Sıkı banka/.test(rules.blackout ?? '') && /Kıt arsa/.test(rules.renewal ?? '') && Object.keys(rules).length === 3,
      `${cards} kart · ${JSON.stringify(rules)}`);
    await xp.locator('[data-scenario="haulage"]').click();
    const detail = ((await xp.locator('[data-detail="scenario"] .scenario-detail').textContent()) ?? '').trim();
    check('Seçilen senaryoda hedef ve ek kuralın açıklaması',
      /en az 2 rakibin toplam 40 mağazasını/.test(detail) && /Ek kural/.test(detail) && /baskına daha erken/.test(detail), detail.slice(0, 140));

    const open = async (id) => {
      await xp.evaluate(() => window.__capital?.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
      // Bekleyen bir sonuç (kazanılan senaryoda havai fişekten sonra) ekrana gelsin.
      await xp.waitForFunction(() => {
        const run = window.__capital?.getState()?.scenario;
        const pending = run !== undefined && run.finishedDay !== undefined && !run.resultSeen;
        return !pending || document.querySelector('[data-scenario-result]') !== null;
      }, null, { timeout: 12000 }).catch(() => null);
      if ((await xp.locator('.newgame').count()) === 0) {
        if ((await xp.locator('[data-scenario-result]').count()) > 0) {
          await xp.locator('[data-scenario-result] .gameover-actions button').last().click();
        } else {
          await xp.locator('.topbar-actions [data-panel="saves"]').click();
          await xp.waitForTimeout(300);
          await xp.locator('button:has-text("Yeni oyun")').first().click();
        }
        await xp.waitForSelector('.newgame', { timeout: 10000 });
      }
      await xp.locator(`[data-scenario="${id}"]`).click();
      await xp.locator('[data-newgame-start]').click();
      await xp.waitForSelector(`[data-scenario-brief="${id}"]`, { timeout: 90000 });
    };

    // Herkesin nakliyecisi: iki büyük rakip kinli başlıyor; açılış yazıyor.
    await open('haulage');
    const hBrief = ((await xp.locator('[data-scenario-brief="haulage"]').textContent()) ?? '').trim();
    const hState = await xp.evaluate(() => {
      const s = window.__capital.getState();
      const hostile = Object.values(s.companies).filter((c) => !c.isPlayer && c.relation?.stance === 'hostile');
      return { day: s.time.day, modifiers: s.modifiers ?? [], hostile: hostile.map((c) => c.name), memory: hostile.map((c) => c.relation.memory[0]?.kind) };
    });
    check('Nakliyeci: 240. gün, aç gözlü rakipler; iki rakip kinli, hafızada önceki yönetimin fiyat savaşı; açılış ikisini ve kuralı yazıyor',
      hState.day === 240 && hState.modifiers.join() === 'hungry_rivals' && hState.hostile.length === 2 && hState.memory.every((k) => k === 'feud')
        && hState.hostile.every((name) => hBrief.includes(name)) && /Ek kural: Aç gözlü rakipler/.test(hBrief),
      `${JSON.stringify(hState)} · ${hBrief.slice(-120)}`);
    await xp.screenshot({ path: `${OUT}/scenario-haulage-brief.png` });
    await xp.locator('[data-scenario-begin]').click();
    await xp.waitForTimeout(300);
    await xp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await xp.locator('.agenda [data-agenda="scenario"] button').click();
    await xp.waitForTimeout(300);
    const freightRows = await xp.evaluate(() => [...document.querySelectorAll('.modal [data-freight-rival]')].map((el) => ({ hostile: el.getAttribute('data-hostile'), text: el.textContent })));
    check('Hedef panelinde rakip rakip taşınan mağaza; kinli rakip "teklif getirmiyor"',
      freightRows.length >= 3 && freightRows.filter((row) => row.hostile === '1').length === 2 && freightRows.filter((row) => row.hostile === '1').every((row) => /kinli, teklif getirmiyor/.test(row.text)),
      JSON.stringify(freightRows).slice(0, 200));
    await xp.keyboard.press('Escape');
    // Sözleşmeler panele işleniyor: iki rakibin kırk mağazası (kazanma kuralı birim testinde).
    await xp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const byCompany = {};
      for (const b of Object.values(s.buildings)) {
        if (b.companyId === s.playerCompanyId || c.buildingRole(b.defId) !== 'outlet') continue;
        (byCompany[b.companyId] ??= []).push(b.id);
      }
      const [a, b] = Object.entries(byCompany).sort((x, y) => y[1].length - x[1].length);
      const first = Math.min(a[1].length, 40);
      const deal = (companyId, ids, n) => ({ id: `fr-${companyId}`, companyId, terminalId: 'yok', outletIds: ids.slice(0, n), durationDays: 120, offeredDay: s.time.day, estimate: 100, rate: 0.2 });
      s.freight = { offers: [], contracts: [deal(a[0], a[1], first), deal(b[0], b[1], 40 - first)], nextId: 3, lastOfferDay: s.time.day, declined: {}, earnedTotal: 0 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await xp.locator('.agenda [data-agenda="scenario"] button').click();
    await xp.waitForTimeout(300);
    const served = await xp.evaluate(() => ({
      done: document.querySelectorAll('.modal [data-freight-rival][data-done="1"]').length,
      detail: document.querySelector('.modal [data-scenario-goals="haulage"] .goal-detail')?.textContent ?? '',
    }));
    check('Hedef panelinde taşınan mağazalar rakip rakip sayılıyor: iki rakip, kırk mağaza',
      served.done === 2 && /2\/2 rakip · 40\/40 mağaza/.test(served.detail), JSON.stringify(served));
    await xp.keyboard.press('Escape');

    // Karanlık kış: kriz uyarıda, sıkı banka; santral rakiplere satıyor.
    await open('blackout');
    const bBrief = ((await xp.locator('[data-scenario-brief="blackout"]').textContent()) ?? '').trim();
    await xp.locator('[data-scenario-begin]').click();
    await xp.waitForTimeout(200);
    const bState = await xp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const s = c.getState();
      const me = s.companies[s.playerCompanyId];
      // Santral: rakip binalarının en yoğun olduğu boş sanayi ya da liman parseli.
      const rivals = Object.values(s.buildings).filter((b) => b.companyId !== me.id);
      const sites = [];
      for (const t of s.map.tiles) {
        if (t.kind !== 'plot' || t.ownerId || t.buildingId || t.structureId) continue;
        const d = s.districts[t.districtId];
        if (!['industrial', 'port'].includes(d.archetype) || (d.opensOnDay ?? 0) > s.time.day) continue;
        const n = rivals.filter((b) => { const at = s.map.tiles[b.tileId]; return Math.abs(at.x - t.x) + Math.abs(at.y - t.y) <= 12; }).length;
        sites.push({ id: t.id, n });
      }
      // Lojistikteki gibi: satın alınabilen en yoğun parsel (ihaledeki satılmıyor).
      sites.sort((a, b) => b.n - a.n);
      const best = sites.find((site) => c.engine.dispatch({ type: 'BUY_TILE', tileId: site.id }).ok);
      const bought = best !== undefined;
      const built = bought ? c.engine.dispatch({ type: 'BUILD', tileId: best.id, defId: 'gas_plant' }) : { ok: false };
      for (let i = 0; i < 40; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { day: s.time.day - s.scenario.startDay, modifiers: s.modifiers ?? [], crisis: s.crisis?.phase, bought, built: built.ok, sold: s.scenario.powerSold ?? 0 };
    });
    check('Karanlık kış: sıkı banka, kriz bir ay sonra; santral rakiplere satıyor, satış birikiyor',
      bState.modifiers.join() === 'tight_credit' && /Ek kural: Sıkı banka/.test(bBrief) && bState.crisis === 'active' && bState.built && bState.sold > 0,
      `${JSON.stringify(bState)} · ${bBrief.slice(-80)}`);
    await xp.locator('.agenda [data-agenda="scenario"] button').click();
    await xp.waitForTimeout(300);
    const bDetail = ((await xp.locator('.modal [data-scenario-goals="blackout"] .goal-detail').textContent().catch(() => '')) ?? '').trim();
    check('Hedef panelinde rakiplere satılan elektrik / hedef', /^rakiplere .+ \/ 4,00 M ₺ elektrik$/.test(bDetail), bDetail);
    await xp.keyboard.press('Escape');

    // Kentsel dönüşüm: kıt arsa; panelde dolu birim ve dönüşüm; süre dolunca kayıp.
    await open('renewal');
    const rBrief = ((await xp.locator('[data-scenario-brief="renewal"]').textContent()) ?? '').trim();
    await xp.locator('[data-scenario-begin]').click();
    await xp.waitForTimeout(200);
    await xp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await xp.locator('.agenda [data-agenda="scenario"] button').click();
    await xp.waitForTimeout(300);
    const rItems = await xp.evaluate(() => Object.fromEntries([...document.querySelectorAll('.modal [data-rental-item]')].map((el) => [el.getAttribute('data-rental-item'), { done: el.getAttribute('data-done'), text: el.textContent }])));
    check('Kentsel dönüşüm: kıt arsa; hedef panelinde dolu birim ve açılmış dönüşüm projesi, ikisi de eksik',
      /Ek kural: Kıt arsa/.test(rBrief) && rItems.units?.done === '0' && /\/ 1\.500/.test(rItems.units?.text ?? '') && rItems.renewals?.done === '0' && /0 \/ 2/.test(rItems.renewals?.text ?? ''),
      `${JSON.stringify(rItems)} · ${rBrief.slice(-60)}`);
    await xp.screenshot({ path: `${OUT}/scenario-renewal-goals.png` });
    await xp.keyboard.press('Escape');
    const rLost = await xp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.time.day = s.scenario.endDay - 1;
      c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { outcome: s.scenario.outcome, reason: s.scenario.lostReason };
    });
    await xp.waitForSelector('[data-scenario-result="lost"]', { timeout: 5000 }).catch(() => null);
    const reason = ((await xp.locator('[data-scenario-reason]').textContent().catch(() => '')) ?? '').trim();
    check('Süre dolunca kayıp: sonuç dolu birimin hedefe oranını yazıyor', rLost.outcome === 'lost' && rLost.reason === 'time' && /dolu birim hedefin %\d+ kadarında kaldı/.test(reason), `${JSON.stringify(rLost)} · ${reason}`);

    check('Senaryo paketi II akışında konsol temiz', xErrors.length === 0, xErrors.slice(0, 2).join(' | '));
    await xContext.close();
  }

  // ---------- Değerlendirme: şirketin yolu (Tur 61) ----------
  section('Değerlendirme: şirketin yolu');
  {
    const yContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await yContext.addInitScript(veteran, TUTORIAL_KEY);
    const yp = await yContext.newPage();
    const yErrors = [];
    yp.on('pageerror', (e) => yErrors.push(e.message));
    yp.on('console', (m) => { if (m.type() === 'error') yErrors.push(m.text()); });
    await yp.goto('http://127.0.0.1:8811/');
    await yp.waitForSelector('.newgame', { timeout: 20000 });
    await yp.fill('.newgame-field input[type="text"]', 'Yol AŞ');
    await yp.locator('button:has-text("Şirketi kur")').click();
    await yp.waitForSelector('.topbar', { timeout: 30000 });
    await yp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));

    const goals = async () => {
      await yp.locator('.goal-chip').first().click();
      await yp.waitForSelector('.goals .path-summary', { timeout: 5000 });
      return yp.evaluate(() => {
        const el = document.querySelector('.goals .path-summary');
        return {
          path: el?.getAttribute('data-path'),
          name: el?.querySelector('[data-path-name]')?.textContent ?? '',
          text: el?.textContent ?? '',
          shares: Object.fromEntries([...(el?.querySelectorAll('[data-path-source]') ?? [])].map((li) => [li.getAttribute('data-path-source'), Number(li.getAttribute('data-share'))])),
        };
      });
    };
    const empty = await goals();
    check('Hedefler panelinde şirketin yolu: kâr yokken "henüz kâr yok", eşikler yazıyor',
      empty.path === 'retail' && /Henüz kâr yok/.test(empty.text) && /kira %15, enerji %6, nakliye ücreti %2 ya da 2 devralma/.test(empty.text), empty.text.slice(0, 160));
    await yp.keyboard.press('Escape');

    // Şehir büyüsün; defter gayrimenkulü gösterecek kadar kira yazsın.
    await yp.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 90; i++) c.engine.runDay();
      const s = c.getState();
      s.sources = { retail: 70_000, realestate: 30_000 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    const live = await goals();
    check('Defter kira payını gösterince yol "Gayrimenkul"; çubuklar kârın payı',
      live.path === 'realestate' && live.name === 'Gayrimenkul' && live.shares.retail === 70 && live.shares.realestate === 30 && live.shares.energy === 0 && live.shares.freight === 0,
      JSON.stringify(live));
    await yp.keyboard.press('Escape');

    // Zafer: ekran zaferin yolunu yazıyor; kariyerde koşunun yolu ve Üç yol rozeti.
    await yp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory = { day: s.time.day, kind: 'tycoon', path: 'realestate' };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await yp.waitForSelector('.victory .path-summary', { timeout: 10000 });
    const won = await yp.evaluate(() => {
      const el = document.querySelector('.victory .path-summary');
      return { path: el?.getAttribute('data-path'), head: el?.querySelector('.path-head')?.textContent ?? '' };
    });
    await yp.screenshot({ path: `${OUT}/victory-path.png` });
    await yp.waitForFunction(() => JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}').runs?.[0]?.wins?.length > 0, null, { timeout: 10000 }).catch(() => {});
    const careerWins = await yp.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{}').runs?.[0]?.wins ?? []);
    check('Zafer ekranında "Zafere giden yol: Gayrimenkul"; kariyer koşunun zaferini yoluyla saklıyor',
      won.path === 'realestate' && /Zafere giden yol: Gayrimenkul/.test(won.head) && careerWins[0]?.path === 'realestate', `${won.head} · ${JSON.stringify(careerWins)}`);
    await yp.locator('.gameover.victory .gameover-actions button.primary').click();
    await yp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await yp.locator('.goal-chip').first().click();
    await yp.locator('.goals [data-career-open]').click();
    await yp.waitForSelector('[data-career]', { timeout: 5000 });
    const career = await yp.evaluate(() => ({
      badge: document.querySelector('[data-achievement="three_paths"] .career-badge-progress')?.textContent ?? '',
      done: document.querySelector('[data-achievement="three_paths"]')?.getAttribute('data-done'),
      runPaths: document.querySelector('[data-career-runs] [data-run-paths]')?.getAttribute('data-run-paths'),
      runText: document.querySelector('[data-career-runs] [data-run-paths]')?.textContent ?? '',
    }));
    check('Kariyerde Üç yol 1 / 3; koşunun satırında yol', career.done === 'false' && career.badge.trim() === '1 / 3' && career.runPaths === 'realestate' && /yol: Gayrimenkul/.test(career.runText),
      JSON.stringify(career));
    await yp.keyboard.press('Escape');

    // Taşıma teklifi: müşterinin yarıştaki yeri; en yakın rakipse çip ve masa söylüyor.
    const setup = await yp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const me = s.companies[s.playerCompanyId];
      me.cash += 5_000_000;
      me.netWorth += 5_000_000;
      let tile = null;
      for (const t of s.map.tiles) {
        if (t.kind !== 'plot' || t.ownerId || t.buildingId || t.structureId || (s.districts[t.districtId].opensOnDay ?? 0) > s.time.day) continue;
        tile = t;
        break;
      }
      const built = c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok && c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'freight_terminal' }).ok;
      const terminal = s.buildings[s.map.tiles[tile.id].buildingId];
      const rivals = Object.values(s.companies).filter((x) => !x.isPlayer).sort((a, b) => b.netWorth - a.netWorth);
      rivals[0].netWorth = me.netWorth * 0.9;
      const outlets = Object.values(s.buildings).filter((b) => b.companyId === rivals[0].id && c.buildingRole(b.defId) === 'outlet').slice(0, 2).map((b) => b.id);
      s.freight = { offers: [{ id: 'o61', companyId: rivals[0].id, terminalId: terminal.id, outletIds: outlets, durationDays: 120, offeredDay: s.time.day, estimate: 600, rate: 0.21 }], contracts: [], nextId: 2, lastOfferDay: s.time.day, declined: {}, earnedTotal: 0 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { built, rival: rivals[0].name, small: rivals[rivals.length - 1].id, tile: tile.id };
    });
    const chip = yp.locator('[data-agenda-freight="freight:o61"]');
    await chip.waitFor({ timeout: 5000 }).catch(() => {});
    const chipText = ((await chip.textContent().catch(() => '')) ?? '').trim();
    await chip.click().catch(() => {});
    await yp.waitForSelector('[data-freight-standing]', { timeout: 5000 }).catch(() => {});
    const standing = await yp.evaluate(() => ({
      kind: document.querySelector('[data-freight-standing]')?.getAttribute('data-freight-standing'),
      text: document.querySelector('[data-freight-standing]')?.textContent ?? '',
    }));
    check('Teklifin müşterisi en yakın rakipse gündem çipi ve terminalin masası söylüyor; tasarrufu yazıyor',
      setup.built && /en yakın rakibin/.test(chipText) && standing.kind === 'challenger' && /^En yakın rakibin: şehrin \d\. şirketi/.test(standing.text) && /günde ~.+ kazandırır/.test(standing.text),
      `${chipText} · ${standing.text}`);
    await yp.screenshot({ path: `${OUT}/freight-standing.png` });
    await yp.evaluate((small) => {
      const c = window.__capital;
      c.getState().freight.offers[0].companyId = small;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    }, setup.small);
    await yp.waitForTimeout(200);
    const other = await yp.evaluate(() => ({ kind: document.querySelector('[data-freight-standing]')?.getAttribute('data-freight-standing'), text: document.querySelector('[data-freight-standing]')?.textContent ?? '' }));
    check('Küçük rakibin teklifi uyarısız: yalnız sırası, değeri ve tasarrufu', other.kind === 'other' && /^Şehrin \d\. şirketi/.test(other.text), other.text);

    check('Şirketin yolu akışında konsol temiz', yErrors.length === 0, yErrors.slice(0, 2).join(' | '));
    await yContext.close();

    // Telefon ve İngilizce: kutu taşmıyor, metin çevrilmiş.
    const yPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await yPhone.addInitScript(veteran, TUTORIAL_KEY);
    await yPhone.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const ym = await yPhone.newPage();
    const ymErrors = [];
    ym.on('pageerror', (e) => ymErrors.push(e.message));
    ym.on('console', (m) => { if (m.type() === 'error') ymErrors.push(m.text()); });
    await ym.goto('http://127.0.0.1:8811/');
    await ym.waitForSelector('.newgame', { timeout: 20000 });
    await ym.locator('[data-newgame-start]').click();
    await ym.waitForSelector('.topbar', { timeout: 30000 });
    await ym.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    // Gündem dolunca telefonda çip katlanıyor: panel önce açılıyor, defter sonra.
    await ym.locator('.goal-chip').first().click();
    await ym.waitForSelector('.goals .path-summary', { timeout: 5000 });
    await ym.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 60; i++) c.engine.runDay();
      c.getState().sources = { retail: 88_000, energy: 12_000 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await ym.waitForSelector('.goals .path-summary[data-path="energy"]', { timeout: 5000 }).catch(() => {});
    const phone = await ym.evaluate(() => {
      const el = document.querySelector('.goals .path-summary');
      const rows = [...el.querySelectorAll('.path-source')];
      return {
        path: el.getAttribute('data-path'),
        head: el.querySelector('.path-head')?.textContent ?? '',
        overflow: rows.some((row) => row.scrollWidth > row.clientWidth + 1) || el.scrollWidth > el.clientWidth + 1,
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    await ym.screenshot({ path: `${OUT}/path-phone-en.png` });
    check('Telefonda İngilizce: "Your company\'s path: Energy", kutu ve sayfa taşmıyor', phone.path === 'energy' && /Your company's path: Energy/.test(phone.head) && !phone.overflow && !phone.page,
      JSON.stringify(phone));
    // Rakipler tablosu 320 px'te İngilizce de sığıyor: bina, arsa ve sektör adın altında (Tur 61).
    await ym.keyboard.press('Escape');
    await ym.setViewportSize({ width: 320, height: 568 });
    await ym.waitForTimeout(300);
    await ym.locator('[data-panel="rivals"]').first().click();
    await ym.waitForSelector('.rivals-table', { timeout: 5000 }).catch(() => {});
    const rivalsFit = await ym.evaluate(() => {
      const body = document.querySelector('.modal-body');
      const table = document.querySelector('.rivals-table');
      if (!body || !table) return null;
      const visible = (el) => el.getClientRects().length > 0;
      return {
        columns: [...table.querySelectorAll('thead th')].filter(visible).length,
        facts: [...table.querySelectorAll('.rival-facts')].filter(visible).length,
        rows: table.querySelectorAll('tbody tr').length,
        sample: table.querySelector('tbody .rival-facts')?.textContent ?? '',
        hidden: [...body.querySelectorAll('*')].filter((el) => el.scrollWidth - el.clientWidth > 2).map((el) => String(el.className).split(' ')[0] || el.tagName),
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check('320 px\'te İngilizce rakipler tablosu sığıyor: dört sütun, bina ve arsa adın altında, gizli kaydırıcı yok',
      Boolean(rivalsFit && rivalsFit.columns === 4 && rivalsFit.facts === rivalsFit.rows && /^Buildings \d+ · Lots \d+/.test(rivalsFit.sample) && rivalsFit.hidden.length === 0 && !rivalsFit.page),
      JSON.stringify(rivalsFit));
    await ym.screenshot({ path: `${OUT}/rivals-phone-en.png` });
    await ym.setViewportSize({ width: 1280, height: 860 });
    await ym.waitForTimeout(300);
    const rivalsWide = await ym.evaluate(() => {
      const table = document.querySelector('.rivals-table');
      const visible = (el) => el.getClientRects().length > 0;
      return table ? {
        columns: [...table.querySelectorAll('thead th')].filter(visible).length,
        facts: [...table.querySelectorAll('.rival-facts')].filter(visible).length,
      } : null;
    });
    check('Geniş ekranda rakipler tablosunun yedi sütunu yerinde, adın altındaki satır gizli',
      Boolean(rivalsWide && rivalsWide.columns === 7 && rivalsWide.facts === 0), JSON.stringify(rivalsWide));
    check('Telefonda konsol temiz', ymErrors.length === 0, ymErrors.slice(0, 2).join(' | '));
    await yPhone.close();
  }

  // ---------- Mevsim ve hava (Tur 62) ----------
  section('Mevsim ve hava');
  {
    const wContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await wContext.addInitScript(veteran, TUTORIAL_KEY);
    const wp = await wContext.newPage();
    const wErrors = [];
    wp.on('pageerror', (e) => wErrors.push(e.message));
    wp.on('console', (m) => { if (m.type() === 'error') wErrors.push(m.text()); });
    await wp.goto('http://127.0.0.1:8811/');
    await wp.waitForSelector('.newgame', { timeout: 20000 });
    await wp.locator('button:has-text("Şirketi kur")').click();
    await wp.waitForSelector('.topbar', { timeout: 30000 });
    await wp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    await wp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      c.setTimeOfDay(0.3);
      const s = c.getState();
      c.setView({ x: s.map.width / 2, z: s.map.height / 2, distance: 26 });
    });

    // İstenen mevsimde, iki gün üst üste istenen havanın günü; şehir o güne atlıyor.
    const goTo = (season, weather, events = []) => wp.evaluate(({ season, weather, events }) => {
      const c = window.__capital;
      const s = c.getState();
      const months = { winter: [11, 0, 1], spring: [2, 3, 4], summer: [5, 6, 7], autumn: [8, 9, 10] }[season];
      let day = -1;
      for (let d = s.time.day + 1; d < s.time.day + 3000; d++) {
        const month = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).getUTCMonth();
        if (months.includes(month) && c.weatherOn(s.meta.seed, d) === weather && c.weatherOn(s.meta.seed, d - 1) === weather) { day = d; break; }
      }
      s.time.day = day;
      s.activeEvents = events.map((defId) => ({ defId, startedDay: day, remainingDays: 5 }));
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return day;
    }, { season, weather, events });
    const look = async (frames = 3) => {
      const start = await wp.evaluate(() => window.__capital.renderInfo().frameCount);
      await wp.waitForFunction((n) => window.__capital.renderInfo().frameCount >= n, start + frames, { timeout: 30000 });
      return wp.evaluate(() => {
        const chip = document.querySelector('.brand-weather');
        return {
          ...window.__capital.renderInfo().weather,
          programs: window.__capital.renderInfo().programs,
          chip: chip?.textContent ?? '',
          chipSeason: chip?.getAttribute('data-season'),
          chipWeather: chip?.getAttribute('data-weather'),
          chipTitle: chip?.getAttribute('title') ?? '',
          chipEvent: chip?.getAttribute('data-weather-event') ?? null,
        };
      });
    };
    const hue = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return ((h * 60) + 360) % 360;
    };

    const opening = await look();
    check('Üst barda mevsim ve hava tarihin yanında; şehirle aynı mevsim', opening.chipSeason === opening.season && opening.chipWeather === opening.id && /^(Kış|İlkbahar|Yaz|Sonbahar) · /.test(opening.chip),
      `${opening.chip} · ${opening.season}/${opening.id}`);

    await goTo('summer', 'clear');
    const summer = await look();
    await goTo('autumn', 'clear');
    const autumn = await look();
    await wp.screenshot({ path: `${OUT}/season-autumn.png` });
    check('Sonbaharda ağaçlar turuncu-kızıl, yazın yeşil; üst bar "Sonbahar · Açık"',
      summer.season === 'summer' && hue(summer.countrysideTree) > 70 && hue(summer.countrysideTree) < 160 && autumn.season === 'autumn' && hue(autumn.countrysideTree) < 50 && autumn.chip === 'Sonbahar · Açık',
      `yaz ${summer.countrysideTree} · sonbahar ${autumn.countrysideTree} · ${autumn.chip}`);

    await goTo('winter', 'snow');
    const snow1 = await look();
    const snow2 = await look(6);
    await wp.screenshot({ path: `${OUT}/season-winter-snow.png` });
    check('Karlı kış: kar yağıyor, taneler iniyor, yer ve ağaçlar beyaz',
      snow1.id === 'snow' && snow1.snow > 0 && snow1.rain === 0 && snow1.snowCover === 1 && snow2.fallSum !== snow1.fallSum && snow1.chip === 'Kış · Karlı',
      `${snow1.snow} tane · örtü ${snow1.snowCover} · ağaç ${snow1.countrysideTree} · ${snow1.chip}`);
    check('Yağış programları açılışta derlendi: ilk karda yeni program yok', snow1.programs === opening.programs, `${opening.programs} → ${snow1.programs}`);

    await goTo('autumn', 'rain');
    const rain = await look();
    check('Yağmurlu gün: damlalar, bulut güneşi kısıyor, sis yaklaşıyor', rain.id === 'rain' && rain.rain > 0 && rain.snow === 0 && rain.sunScale < 0.9 && rain.fogFar < 195,
      `${rain.rain} damla · güneş ×${rain.sunScale.toFixed(2)} · sis ${Math.round(rain.fogFar)}`);

    // Olayın havası: sahilde fırtına sürerken şehirde fırtına, ipucu olayı söylüyor.
    await goTo('spring', 'clear', ['coastal_storm']);
    const storm = await look();
    await wp.screenshot({ path: `${OUT}/weather-storm.png` });
    check('Sahilde fırtına sürerken şehirde fırtına; üst bar olayı söylüyor',
      storm.id === 'storm' && storm.eventId === 'coastal_storm' && storm.rain > rain.rain && storm.chipEvent === 'coastal_storm' && /Sahilde Fırtına/.test(storm.chipTitle),
      `${storm.id} · ${storm.rain} damla · ${storm.chipTitle}`);

    // Ayar: yağmur ve kar kapalıyken damla yok, bulut ve mevsim yerinde.
    await wp.locator('.speeds [data-panel="settings"]').click();
    await wp.waitForSelector('[data-settings-weather]', { timeout: 5000 });
    await wp.locator('[data-settings-weather]').uncheck();
    await wp.keyboard.press('Escape');
    const off = await look();
    check('Ayarlarda "Yağmur ve kar" kapalı: damla yok, fırtınanın göğü ve mevsim duruyor', off.rain === 0 && off.effects === false && off.id === 'storm' && off.sunScale < 0.7,
      `${off.rain} damla · güneş ×${off.sunScale.toFixed(2)}`);
    await wp.locator('.speeds [data-panel="settings"]').click();
    await wp.locator('[data-settings-weather]').check();
    // Azaltılmış hareket de yağışı durduruyor.
    await wp.locator('[data-setting="motion"][data-choice="reduced"]').click();
    await wp.keyboard.press('Escape');
    const reduced = await look();
    const reducedScene = await wp.evaluate(() => window.__capital.renderInfo().reducedMotion);
    check('Azaltılmış harekette yağış çizilmiyor', reduced.rain === 0 && reducedScene === true && reduced.effects === true, `${reduced.rain} damla`);
    await wp.locator('.speeds [data-panel="settings"]').click();
    await wp.locator('[data-setting="motion"][data-choice="full"]').click();
    await wp.keyboard.press('Escape');

    // Veri lensinde yağış susuyor.
    await wp.evaluate(() => window.__capital.setLens('opportunity'));
    const lens = await look();
    await wp.evaluate(() => window.__capital.setLens('none'));
    const back = await look();
    check('Veri lensinde yağış susuyor, lens kapanınca dönüyor', lens.rain === 0 && back.rain > 0, `lens ${lens.rain} · şehir ${back.rain}`);
    check('Mevsim ve hava akışında konsol temiz', wErrors.length === 0, wErrors.slice(0, 2).join(' | '));
    await wContext.close();

    // Telefonda İngilizce: ikon kalıyor, ad ipucunda ve ekran okuyucuda.
    const wPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await wPhone.addInitScript(veteran, TUTORIAL_KEY);
    await wPhone.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const wm = await wPhone.newPage();
    const wmErrors = [];
    wm.on('pageerror', (e) => wmErrors.push(e.message));
    await wm.goto('http://127.0.0.1:8811/');
    await wm.waitForSelector('.newgame', { timeout: 20000 });
    await wm.locator('[data-newgame-start]').click();
    await wm.waitForSelector('.topbar .brand-weather', { timeout: 30000 });
    const phone = await wm.evaluate(() => {
      const chip = document.querySelector('.brand-weather');
      const label = chip.querySelector('.brand-weather-label');
      return {
        title: chip.getAttribute('title') ?? '',
        text: label?.textContent ?? '',
        labelWidth: Math.round(label.getBoundingClientRect().width),
        icon: Boolean(chip.querySelector('svg')),
        page: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    check('Telefonda İngilizce: hava ikonu, adı ipucunda ("Winter · …"), sayfa taşmıyor',
      phone.icon && /^(Winter|Spring|Summer|Autumn) · (Clear|Cloudy|Rainy|Stormy|Snowy|Foggy)$/.test(phone.title) && phone.text === phone.title && phone.labelWidth <= 1 && !phone.page && wmErrors.length === 0,
      JSON.stringify(phone));
    await wPhone.close();
  }

  section('Önemli anlar');
  {
    const mContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await mContext.addInitScript(veteran, TUTORIAL_KEY);
    const mp = await mContext.newPage();
    const mErrors = [];
    mp.on('pageerror', (e) => mErrors.push(e.message));
    mp.on('console', (m) => { if (m.type() === 'error') mErrors.push(m.text()); });
    await mp.goto('http://127.0.0.1:8811/');
    await mp.waitForSelector('.newgame', { timeout: 20000 });
    await mp.locator('button:has-text("Şirketi kur")').click();
    await mp.waitForSelector('.topbar', { timeout: 30000 });
    await mp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    // Rakipler birkaç gün kursun; sonra şehir durur, anları test sürüyor.
    await mp.evaluate(() => {
      const c = window.__capital;
      for (let d = 0; d < 12; d++) c.engine.runDay();
      const s = c.getState();
      s.companies[s.playerCompanyId].cash += 8_000_000;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      c.setTimeOfDay(0.45);
    });
    const moments = () => mp.evaluate(() => window.__capital.renderInfo().moments);
    const settle = (fn, timeout = 6000) => mp.waitForFunction(fn, null, { timeout }).then(() => true).catch(() => false);
    // Oyuncuya bir dükkân: boş parsel, al ve kur; kamera oraya.
    const buildShop = () => mp.evaluate(() => {
      const c = window.__capital;
      const engine = c.engine;
      for (const tile of engine.getState().map.tiles) {
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) {
          c.setView({ x: tile.x, z: tile.y, distance: 22 });
          return tile.id;
        }
      }
      return null;
    });

    // İnşaat: temel atılırken toz, yükseliş bitince halka. Halka her karede sayfanın
    // içinden izleniyor: yavaş makinede 1,15 sn'lik halka iki üç karede bitiyor.
    await mp.evaluate(() => {
      const watch = { grew: false, ringAfterRise: false };
      window.__buildWatch = watch;
      const started = performance.now();
      const tick = () => {
        const m = window.__capital.renderInfo().moments;
        if (m.rising >= 1) watch.grew = true;
        if (watch.grew && m.rising === 0 && m.rings >= 1) watch.ringAfterRise = true;
        if (!watch.ringAfterRise && performance.now() - started < 20000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const built = await buildShop();
    await mp.waitForTimeout(160);
    const rising = await moments();
    await mp.waitForTimeout(220);
    await mp.screenshot({ path: `${OUT}/moment-build.png` });
    check('İnşaat: temel atılırken toz kalkıyor, bina yerden yükseliyor', built !== null && rising.dust >= 1 && rising.rising >= 1, JSON.stringify(rising));
    await settle(() => window.__capital.renderInfo().buildingsGrowing === false);
    await settle(() => window.__buildWatch.ringAfterRise === true, 6000);
    const finished = { ...(await moments()), watch: await mp.evaluate(() => window.__buildWatch) };
    check('Yükseliş bitince yerde halka açılıyor', finished.watch.ringAfterRise && finished.rising === 0, JSON.stringify(finished));
    const calm = await settle(() => {
      const m = window.__capital.renderInfo().moments;
      return m.dust === 0 && m.rings === 0;
    }, 4000);
    check('Toz dağılıyor, halka sönüyor: takılı kalmıyor', calm, JSON.stringify(await moments()));

    // Proje açılışı: şantiyenin beton iskeleti açılış günü binanın boyuna yükseliyor, tozuyla.
    await mp.evaluate((tileId) => {
      const c = window.__capital;
      const s = c.getState();
      const b = s.buildings[s.map.tiles[tileId].buildingId];
      b.development = { opensOnDay: s.time.day + 10 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    }, built);
    await mp.waitForTimeout(200);
    await mp.evaluate((tileId) => {
      const c = window.__capital;
      const s = c.getState();
      s.buildings[s.map.tiles[tileId].buildingId].development.occupancy = 0.4;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    }, built);
    await mp.waitForTimeout(120);
    const opening = await moments();
    check('Proje açılınca bina iskeletin boyundan yükseliyor, toz kalkıyor', opening.rising >= 1 && opening.dust >= 1, JSON.stringify(opening));
    await mp.evaluate((tileId) => {
      const c = window.__capital;
      const s = c.getState();
      delete s.buildings[s.map.tiles[tileId].buildingId].development;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    }, built);
    await settle(() => window.__capital.renderInfo().buildingsGrowing === false);

    // Yıkım: yapısı olan parseli satın alıp boşaltınca toz.
    const razed = await mp.evaluate(() => {
      const c = window.__capital;
      const engine = c.engine;
      for (const tile of engine.getState().map.tiles) {
        if (tile.kind !== 'plot' || !tile.structureId || tile.ownerId) continue;
        if (engine.dispatch({ type: 'BUYOUT_TILE', tileId: tile.id }).ok) return tile.id;
      }
      return null;
    });
    await mp.waitForTimeout(120);
    const dust = await moments();
    check('Yıkım: satın alınıp boşaltılan arsada toz kalkıyor', razed !== null && dust.dust >= 1, `${razed} · ${dust.dust} bulut`);

    // Para akışı: üç dükkân daha; günün defteri sabitleniyor (üçü kazanmış, biri çok kaybetmiş).
    await buildShop();
    await buildShop();
    await buildShop();
    await settle(() => window.__capital.renderInfo().buildingsGrowing === false);
    const dayOf = (profits) => mp.evaluate((profits) => {
      const c = window.__capital;
      c.engine.runDay();
      const s = c.getState();
      const own = Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId);
      own.forEach((b, i) => { b.last.profit = profits[i] ?? 0; });
      const first = s.map.tiles[own[0].tileId];
      c.setView({ x: first.x, z: first.y, distance: 30 });
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return own.map((b) => b.id);
    }, profits);
    const owned = await dayOf([4200, 1800, -2600, 900]);
    // Etiketler çatıya yerleşene dek (kamera o binaya kayıyor; yavaş karede birkaç yüz ms).
    await settle(() => {
      const tags = [...document.querySelectorAll('.money-tag')];
      return tags.length === 4 && tags.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      });
    }, 1500);
    const tags = await mp.evaluate(() => [...document.querySelectorAll('.money-tag')].map((el) => {
      const r = el.getBoundingClientRect();
      const shown = getComputedStyle(el.parentElement).visibility !== 'hidden';
      return { id: el.getAttribute('data-money-tag'), text: el.textContent, loss: el.classList.contains('money-tag-loss'), shown, at: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], inside: !shown || (r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth) };
    }));
    const delta = await mp.evaluate(() => {
      const el = document.querySelector('.metric-delta');
      return el ? { sign: el.getAttribute('data-delta-sign'), text: el.textContent } : null;
    });
    await mp.screenshot({ path: `${OUT}/moment-money.png` });
    check('Para akışı: en çok kazandıran üç bina çatısından kârını yükseltiyor, çok zarar eden kırmızı',
      tags.length === 4 && tags.filter((t) => !t.loss).map((t) => t.id).join() === [owned[0], owned[1], owned[3]].join() && tags.find((t) => t.loss)?.id === owned[2] && tags.some((t) => t.shown) && tags.every((t) => t.inside) && /^\+/.test(tags[0].text),
      JSON.stringify(tags));
    check('Kasanın altında son değişim', delta !== null && /^(gain|loss)$/.test(delta.sign ?? '') && /\d/.test(delta.text ?? ''), JSON.stringify(delta));
    await mp.waitForTimeout(900);
    const cash = await mp.evaluate(() => {
      const el = document.querySelector('.metric-accent .metric-value');
      return { text: el?.textContent ?? '', label: el?.getAttribute('aria-label') ?? '' };
    });
    check('Kasa sayarak yeni tutara varıyor', cash.label.endsWith(cash.text) && cash.text.length > 0, JSON.stringify(cash));

    // Ayar kapalıyken etiket yok.
    await mp.waitForTimeout(1400);
    await mp.locator('.speeds [data-panel="settings"]').click();
    await mp.waitForSelector('[data-settings-money-tags]', { timeout: 5000 });
    await mp.locator('[data-settings-money-tags]').uncheck();
    await mp.keyboard.press('Escape');
    await dayOf([4200, 1800, -2600, 900]);
    await mp.waitForTimeout(450);
    const hidden = await mp.evaluate(() => document.querySelectorAll('.money-tag').length);
    check('Ayarlarda "Şehirde kazanç etiketleri" kapalı: etiket yok', hidden === 0, `${hidden} etiket`);
    await mp.locator('.speeds [data-panel="settings"]').click();
    await mp.locator('[data-settings-money-tags]').check();
    await mp.keyboard.press('Escape');

    // Devralma: bir rakip yutuluyor (motorun devralmasıyla aynı iz: binalar ve parseller oyuncuya, şirket listeden düşüyor).
    const programsBefore = (await mp.evaluate(() => window.__capital.renderInfo().programs));
    const absorb = () => mp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const player = s.companies[s.playerCompanyId];
      const counts = (id) => Object.values(s.buildings).filter((b) => b.companyId === id).length;
      const target = Object.values(s.companies).filter((co) => !co.isPlayer).sort((a, b) => counts(b.id) - counts(a.id))[0];
      if (!target || counts(target.id) === 0) return null;
      const ids = Object.values(s.buildings).filter((b) => b.companyId === target.id).map((b) => b.id);
      for (const id of ids) s.buildings[id].companyId = player.id;
      for (const tile of s.map.tiles) if (tile.ownerId === target.id) tile.ownerId = player.id;
      delete s.companies[target.id];
      player.acquisitions = (player.acquisitions ?? 0) + 1;
      const at = s.map.tiles[s.buildings[ids[0]].tileId];
      c.setView({ x: at.x, z: at.y, distance: 34 });
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return { name: target.name, ids };
    });
    // Zaferi ilan eden ve bandın, ekranın ne zaman geldiğini sayfanın içinden ölçen işlev.
    // Ölçüm DOM değişikliğinde (gözlemci), kareye bağlı değil: yavaş makinede bir kare bir
    // saniyeyi aşabiliyor, test adımları da yüzlerce ms sürüyor.
    await mp.evaluate(() => {
      window.__declareVictory = (kind, dayShift) => {
        const c = window.__capital;
        const s = c.getState();
        const trace = { set: performance.now(), banner: null, bannerText: '', screen: null, raced: false };
        window.__momentTrace = trace;
        const observer = new MutationObserver(() => {
          const now = performance.now();
          const banner = document.querySelector('.moment-banner[data-moment="victory"]');
          if (trace.banner === null && banner) {
            trace.banner = Math.round(now - trace.set);
            trace.bannerText = banner.textContent ?? '';
          }
          if (trace.screen === null && document.querySelector('.gameover.victory')) trace.screen = Math.round(now - trace.set);
          if (trace.screen !== null && trace.banner !== null) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 15000);
        s.victory = { day: s.time.day + dayShift, kind, path: 'retail', shares: { retail: 1, realestate: 0, energy: 0, freight: 0 }, acquisitions: 1 };
        c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        return trace;
      };
      // İlk zafer devralma bandının süresi (4,6 sn) dolmadan hemen önce, 4,56. sn'de ilan
      // ediliyor: eski bandın zamanlayıcısı zafer bandını silmemeli (tam koşu bunu yakaladı).
      // Zamanlayıcı bandın geldiği an sayfanın içinde kuruluyor; test adımları ne kadar
      // yavaş olursa olsun yarış her koşuda sınanıyor.
      window.__takeoverBannerAt = null;
      const seen = new MutationObserver(() => {
        if (!document.querySelector('.moment-banner[data-moment="takeover"]')) return;
        seen.disconnect();
        window.__takeoverBannerAt = performance.now();
        setTimeout(() => {
          window.__declareVictory('tycoon', 0).raced = true;
        }, 4560);
      });
      seen.observe(document.body, { childList: true, subtree: true });
    });
    const taken = await absorb();
    await mp.waitForTimeout(200);
    const wave = await moments();
    const banner = await mp.evaluate((ids) => {
      const el = document.querySelector('.moment-banner[data-moment="takeover"]');
      if (!el) return null;
      const swatches = [...el.querySelectorAll('.moment-swatch')].map((sw) => getComputedStyle(sw).backgroundColor);
      const hex = window.__capital.buildingAccent(ids[0])?.target ?? '';
      const n = parseInt(hex.slice(1), 16);
      const roof = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      return { text: el.textContent ?? '', role: el.getAttribute('role'), swatch: swatches[1] ?? '', roof };
    }, taken?.ids ?? []);
    await mp.waitForTimeout(500);
    await mp.screenshot({ path: `${OUT}/moment-takeover.png` });
    check('Devralma: çatılar dalga hâlinde oyuncunun rengine dönüyor, her binada yerde halka',
      taken !== null && wave.shifting >= 1 && wave.rings >= Math.min(taken.ids.length, 24) - 1, `${taken?.ids.length} bina · ${JSON.stringify(wave)}`);
    check('Devralma bandı: "… artık senin", kaç binanın döndüğü; bandın rengi çatıların döndüğü renk (Codex #93)',
      banner !== null && banner.text.includes(`${taken?.name} artık senin`) && banner.text.includes(`${taken?.ids.length} bina`) && banner.role === 'status' && banner.swatch === banner.roof,
      banner ? `${banner.text} · bant ${banner.swatch} · çatı ${banner.roof}` : 'bant yok');

    // Zafer: havai fişek ve bant önce, zafer ekranı sonra.
    await mp.evaluate(() => {
      const c = window.__capital;
      c.setTimeOfDay(0.93);
      const s = c.getState();
      c.setView({ x: s.map.width / 2, z: s.map.height / 2, distance: 40 });
    });
    await mp.waitForTimeout(400);
    const declare = (kind, dayShift) => mp.evaluate(({ kind, dayShift }) => {
      window.__declareVictory(kind, dayShift);
    }, { kind, dayShift });
    const trace = () => mp.evaluate(() => window.__momentTrace);
    // İlk zafer sayfanın zamanlayıcısıyla, devralma bandı kalkmak üzereyken (yukarıda).
    await settle(() => window.__momentTrace?.raced === true, 15000);
    await mp.waitForTimeout(900);
    await mp.screenshot({ path: `${OUT}/moment-victory.png` });
    const party = await mp.evaluate(() => {
      const m = window.__capital.renderInfo().moments;
      return { fireworks: m.fireworks, bursts: m.fireworkScreen, trace: window.__momentTrace };
    });
    check('Zafer: şehrin üstünde havai fişek, hemen zafer bandı (devralma bandı tam o an kalkarken bile)',
      party.trace.raced && party.fireworks.active && party.fireworks.shells >= 1 && party.fireworks.height > 0 && party.trace.banner !== null && party.trace.banner < 1500 && party.trace.bannerText.includes('Şehrin sahibi'),
      JSON.stringify({ ...party, bursts: undefined }));
    check('Patlamalar ekranın içinde, üst üçte ikide', party.bursts.length >= 1 && party.bursts.every((b) => b.visible && b.y < 860 * 0.66),
      JSON.stringify(party.bursts));
    await settle(() => window.__momentTrace.screen !== null, 8000);
    const landed = (await trace()).screen;
    // Üst sınır geniş: yavaş makinede zamanlayıcı bir karenin (1–1,7 sn) bitmesini bekleyebiliyor.
    check('Zafer ekranı havai fişeklerden sonra iniyor (~2,4 sn)', landed !== null && landed >= 2200 && landed < 6500, `${landed} ms`);
    // Dalga zafer gelmeden çoktan bitti: devralınan her çatı oyuncunun renginde.
    await settle(() => window.__capital.renderInfo().moments.shifting === 0, 6000);
    const accents = await mp.evaluate((ids) => ids.map((id) => window.__capital.buildingAccent(id)), [...(taken?.ids ?? []), owned[0]]);
    const playerAccent = accents.at(-1)?.target;
    check('Dalga bitince devralınan her bina oyuncunun renginde', accents.length > 1 && accents.every((a) => a && a.target === playerAccent && a.drawn === playerAccent),
      `${playerAccent} · ${[...new Set(accents.map((a) => a?.drawn))].join(', ')}`);
    const programsAfter = await mp.evaluate(() => window.__capital.renderInfo().programs);
    check('Halka ve havai fişek açılışta derlenmiş: anlarda yeni program yok', programsAfter === programsBefore, `${programsBefore} → ${programsAfter}`);
    await mp.locator('.gameover.victory .gameover-actions button.primary').click();
    await mp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      c.setTimeOfDay(0.45);
    });

    // Azaltılmış hareket: bina yerinde beliriyor, toz ve halka yok, dalga yok; bant ve zafer ekranı hemen.
    // Toz sürerken açılınca süren toz da hemen kalkıyor (Codex #93).
    // Kurma, tıklama ve ölçme sayfanın içinde tek adımda: toz 1,5 sn sürüyor, test adımları ondan yavaş.
    await mp.locator('.speeds [data-panel="settings"]').click();
    await mp.waitForSelector('[data-setting="motion"][data-choice="reduced"]', { timeout: 15000 });
    const dustSwitch = await mp.evaluate(async () => {
      // Dükkân sayfanın içinde kuruluyor ve toz bekleniyor (toz 1,5 sn; yavaş makinede iki kare bunu aşıyor).
      const c = window.__capital;
      const engine = c.engine;
      for (const tile of engine.getState().map.tiles) {
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) {
          c.setView({ x: tile.x, z: tile.y, distance: 22 });
          break;
        }
      }
      const waited = performance.now();
      while (c.renderInfo().moments.dust < 1 && performance.now() - waited < 4000) await new Promise((resolve) => requestAnimationFrame(resolve));
      const before = c.renderInfo().moments.dust;
      // Kasa da tam o an sayıyor (Codex #93): büyük bir giriş. Kasanın etiketi yeni tutara
      // geçtiği an (React çizdi, sayım başladı; gözlemci araya kare girmeden çalışıyor)
      // azaltılmış harekete geçiliyor; tutar da yine araya kare girmeden okunuyor.
      const metric = () => [...document.querySelectorAll('.metric-value')].find((el) => el.querySelector('.tween-money'));
      const label = () => metric()?.getAttribute('aria-label') ?? '';
      const tween = () => metric()?.querySelector('.tween-money')?.textContent ?? '';
      const labelBefore = label();
      const microtask = () => new Promise((resolve) => queueMicrotask(resolve));
      const cash = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          resolve({ counting: false, target: '', shown: 'etiket değişmedi' });
        }, 8000);
        const observer = new MutationObserver(async () => {
          if (label() === labelBefore) return;
          observer.disconnect();
          clearTimeout(timeout);
          const target = label().slice(label().lastIndexOf(': ') + 2);
          const counting = tween() !== target;
          document.querySelector('[data-setting="motion"][data-choice="reduced"]').click();
          for (let i = 0; i < 4; i++) await microtask();
          resolve({ counting, target, shown: tween() });
        });
        observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-label'] });
        const s = c.getState();
        s.companies[s.playerCompanyId].cash += 7654321;
        engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { before, after: window.__capital.renderInfo().moments.dust, reduced: window.__capital.renderInfo().reducedMotion, cash };
    });
    await mp.keyboard.press('Escape');
    check('Azaltılmış harekete geçince süren toz hemen kalkıyor', dustSwitch.before >= 1 && dustSwitch.after === 0 && dustSwitch.reduced, JSON.stringify({ ...dustSwitch, cash: undefined }));
    check('Kasa sayarken azaltılmış harekete geçince sayım kesiliyor, tutar hemen (Codex #93)',
      dustSwitch.cash.counting && dustSwitch.cash.shown === dustSwitch.cash.target, JSON.stringify(dustSwitch.cash));
    await settle(() => window.__capital.renderInfo().moments.fireworks.active === false, 8000);
    await buildShop();
    await mp.waitForTimeout(120);
    const still = { info: await mp.evaluate(() => window.__capital.renderInfo()) };
    const second = await absorb();
    await mp.waitForTimeout(200);
    const quiet = await moments();
    const quietBanner = await mp.evaluate(() => document.querySelector('.moment-banner[data-moment="takeover"]') !== null);
    check('Azaltılmış harekette bina yükselmeden beliriyor, toz yok',
      still.info.buildingsGrowing === false && still.info.moments.dust === 0 && still.info.moments.rising === 0, JSON.stringify(still.info.moments));
    check('Azaltılmış harekette devralmada dalga ve halka yok, bant yine geliyor',
      second !== null && quiet.shifting === 0 && quiet.rings === 0 && quietBanner, `${JSON.stringify(quiet)} · bant ${quietBanner}`);
    await declare('monopoly', 1);
    await settle(() => window.__momentTrace.screen !== null, 5000);
    const quick = (await trace()).screen;
    const noFire = await moments();
    check('Azaltılmış harekette zafer ekranı beklemeden iniyor, havai fişek yok', quick !== null && quick < 800 && noFire.fireworks.active === false, `ekran ${quick} ms · ${JSON.stringify(noFire.fireworks)}`);
    await mp.locator('.gameover.victory .gameover-actions button.primary').click();
    await mp.locator('.speeds [data-panel="settings"]').click();
    await mp.locator('[data-setting="motion"][data-choice="auto"]').click();
    await mp.keyboard.press('Escape');

    // Zafer ekranı beklerken cihaz azaltılmış harekete geçiyor (hareket seçimi
    // "cihaza göre"): bekleme kesiliyor, ekran hemen; havai fişek de duruyor (Codex #93).
    // Geçiş ilan edilir edilmez: eski derlemede ekran yine 2,4 sn'yi bekliyor; yenisinde
    // tercihin geldiği karede iniyor.
    await settle(() => document.querySelector('.gameover.victory') === null, 5000);
    // (Gün kaydın zaferinden ayrı: kayıt kontrolü kendi anahtarıyla sınansın.)
    await declare('tycoon', 3);
    await mp.emulateMedia({ reducedMotion: 'reduce' });
    const switched = await mp.evaluate(() => Math.round(performance.now() - window.__momentTrace.set));
    await settle(() => window.__momentTrace.screen !== null, 8000);
    const midway = await mp.evaluate((at) => ({ switched: at, screen: window.__momentTrace.screen, fireworks: window.__capital.renderInfo().moments.fireworks.active }), switched);
    check('Zafer beklerken cihaz azaltılmış harekete geçince ekran beklemeden iniyor, havai fişek duruyor (Codex #93)',
      midway.switched < 1500 && midway.screen !== null && midway.screen < 2300 && midway.fireworks === false, JSON.stringify(midway));
    await mp.locator('.gameover.victory .gameover-actions button.primary').click();
    await mp.emulateMedia({ reducedMotion: 'no-preference' });
    // Tercih değişikliği bir sonraki karede bildiriliyor (yavaş makinede bir saniyeyi aşabiliyor).
    await settle(() => window.__capital.renderInfo().reducedMotion === false, 8000);

    // Veri lensinde anlar çizilmiyor.
    await mp.evaluate(() => {
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      window.__capital.setLens('opportunity');
    });
    await settle(() => window.__capital.renderInfo().dataLens === true, 5000);
    const lensMoments = await moments();
    // Lens şehri (ve havai fişeği) gizlerken zafer ekranı beklemiyor (Codex #93).
    await declare('monopoly', 4);
    await settle(() => window.__momentTrace.screen !== null, 8000);
    const lensVictory = (await trace()).screen;
    await mp.locator('.gameover.victory .gameover-actions button.primary').click();
    await mp.evaluate(() => window.__capital.setLens('none'));
    check('Veri lensinde halka ve havai fişek katmanı gizli', lensMoments.visible === false, JSON.stringify(lensMoments));
    check('Veri lensindeyken zafer ekranı beklemeden iniyor (Codex #93)', lensVictory !== null && lensVictory < 1200, `${lensVictory} ms`);

    // Kayıt açılınca (aynı şehir, aynı sahne kalıyor): kayıttaki zafer kutlanmıyor, ekranı beklemeden
    // iniyor; kayıtla bugün arasındaki fark (sahibi başka bina, kalkmış yapı) bir an değil (Codex #93).
    await mp.waitForTimeout(400);
    // Kayıttan hemen önce bir devralma: bandı yeni durumun üstünde kalmamalı.
    const lastTaken = await absorb();
    await mp.waitForTimeout(300);
    const restored = await mp.evaluate(async () => {
      const c = window.__capital;
      const bannerBefore = document.querySelector('.moment-banner[data-moment="takeover"]') !== null;
      // Toz sürerken kayıt açılıyor: eski şehrin tozu yeni durumun üstünde kalmamalı (Codex #93).
      // Toz karede yaşlanıyor (en çok 0,5 sn/kare); sayım ve kayıt kareler arasında, sayfanın içinde.
      const engine = c.engine;
      for (const tile of engine.getState().map.tiles) {
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) break;
      }
      const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
      for (let i = 0; i < 800 && c.renderInfo().moments.dust < 1; i++) await tick();
      const dustBefore = c.renderInfo().moments.dust;
      const syncsBefore = c.renderInfo().stateSyncs;
      const copy = JSON.parse(JSON.stringify(c.getState()));
      copy.victory = { day: copy.time.day + 2, kind: 'tycoon', path: 'retail', shares: { retail: 1, realestate: 0, energy: 0, freight: 0 }, acquisitions: 1 };
      let rival = Object.values(copy.buildings).find((b) => b.companyId !== copy.playerCompanyId);
      if (rival) rival.companyId = copy.playerCompanyId;
      else {
        // Bu ana kadar rakiplerin bütün binaları devralınmış olabiliyor (Tur 66'nın tam
        // koşusu): sahibi değişen bina ters yönde kuruluyor, fark aynı.
        const other = Object.keys(copy.companies).find((id) => id !== copy.playerCompanyId);
        rival = Object.values(copy.buildings).find((b) => b.companyId === copy.playerCompanyId);
        if (rival && other) rival.companyId = other;
        else rival = undefined;
      }
      const razed = copy.map.tiles.find((t) => t.kind === 'plot' && t.structureId && !t.ownerId);
      if (razed) razed.structureId = null;
      // Ekranın geldiği an DOM değişikliğinden (kareye bağlı değil); 1,5 sn ve en az iki kare beklenip anlara bakılıyor.
      const started = performance.now();
      let screen = null;
      const observer = new MutationObserver(() => {
        if (screen === null && document.querySelector('.gameover.victory')) screen = Math.round(performance.now() - started);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      c.engine.replaceState(copy);
      if (screen === null && document.querySelector('.gameover.victory')) screen = Math.round(performance.now() - started);
      for (let i = 0; i < 800 && c.renderInfo().stateSyncs === syncsBefore; i++) await tick();
      const dustOnReplace = c.renderInfo().moments.dust;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      for (let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
      observer.disconnect();
      const m = c.renderInfo().moments;
      const bannerAfter = document.querySelector('.moment-banner[data-moment="takeover"]') !== null;
      return { screen, fireworks: m.fireworks.active, shifting: m.shifting, rings: m.rings, dust: m.dust, rising: m.rising, rival: Boolean(rival), razed: Boolean(razed), bannerBefore, bannerAfter, dustBefore, dustOnReplace };
    });
    check('Kayıt açılınca kayıttaki zafer kutlanmıyor, ekranı beklemeden iniyor; kaydın farkı dalga, toz ya da yükseliş değil',
      restored.screen !== null && restored.screen < 1000 && !restored.fireworks && restored.shifting === 0 && restored.rings === 0 && restored.dust === 0 && restored.rising === 0 && restored.rival && restored.razed,
      JSON.stringify(restored));
    check('Toz sürerken kayıt açılınca eski şehrin tozu kalkıyor (Codex #93)', restored.dustBefore >= 1 && restored.dustOnReplace === 0,
      `önce ${restored.dustBefore} · kayıt açılınca ${restored.dustOnReplace}`);
    check('Kayıt açılınca önceki durumun devralma bandı kalkıyor (Codex #93)', lastTaken !== null && restored.bannerBefore && !restored.bannerAfter,
      `${lastTaken?.name ?? 'devralınacak rakip yok'} · önce ${restored.bannerBefore} · sonra ${restored.bannerAfter}`);
    check('Önemli anlar akışında konsol temiz', mErrors.length === 0, mErrors.slice(0, 2).join(' | '));
    await mContext.close();

    // Telefon: kasa farkı üst barı büyütmüyor; bant ekrana sığıyor.
    const mPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mPhone.addInitScript(veteran, TUTORIAL_KEY);
    await mPhone.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const pm = await mPhone.newPage();
    const pmErrors = [];
    pm.on('pageerror', (e) => pmErrors.push(e.message));
    await pm.goto('http://127.0.0.1:8811/');
    await pm.waitForSelector('.newgame', { timeout: 20000 });
    await pm.locator('[data-newgame-start]').click();
    await pm.waitForSelector('.topbar', { timeout: 30000 });
    await pm.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    const barBefore = await pm.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height));
    await pm.evaluate(() => {
      const c = window.__capital;
      for (let d = 0; d < 10; d++) c.engine.runDay();
      const s = c.getState();
      s.companies[s.playerCompanyId].cash += 50_000;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await pm.waitForTimeout(200);
    const barDelta = await pm.evaluate(() => ({
      height: Math.round(document.querySelector('.topbar').getBoundingClientRect().height),
      delta: document.querySelector('.metric-delta')?.textContent ?? null,
    }));
    const pmTaken = await pm.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const player = s.companies[s.playerCompanyId];
      const target = Object.values(s.companies).find((co) => !co.isPlayer);
      for (const b of Object.values(s.buildings)) if (b.companyId === target.id) b.companyId = player.id;
      delete s.companies[target.id];
      player.acquisitions = (player.acquisitions ?? 0) + 1;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      return target.name;
    });
    await pm.waitForTimeout(500);
    const pmBanner = await pm.evaluate(() => {
      const el = document.querySelector('.moment-banner');
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { text: el.textContent ?? '', left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), barBottom: Math.round(bar.bottom), page: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await pm.screenshot({ path: `${OUT}/moment-phone.png` });
    check('Telefonda kasa farkı üst barı büyütmüyor', barDelta.delta !== null && barDelta.height === barBefore, `${barBefore} → ${barDelta.height} px · ${barDelta.delta}`);
    check('Telefonda İngilizce bant ekrana sığıyor, üst barın altında',
      pmBanner !== null && pmBanner.text.includes(`${pmTaken} is yours now`) && pmBanner.left >= 16 && pmBanner.right <= 374 && pmBanner.top >= pmBanner.barBottom && !pmBanner.page && pmErrors.length === 0,
      JSON.stringify(pmBanner));
    await mPhone.close();
  }

  section('Şehir kartı');
  {
    const kContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    await kContext.addInitScript(veteran, TUTORIAL_KEY);
    const kp = await kContext.newPage();
    const kErrors = [];
    kp.on('pageerror', (e) => kErrors.push(e.message));
    kp.on('console', (m) => { if (m.type() === 'error') kErrors.push(m.text()); });
    await kp.goto('http://127.0.0.1:8811/');
    await kp.waitForSelector('.newgame', { timeout: 20000 });
    await kp.fill('.newgame-field input[type="text"]', 'Kart AŞ');
    await kp.locator('button:has-text("Şirketi kur")').click();
    await kp.waitForSelector('.topbar', { timeout: 30000 });
    await kp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    // Rakipler kursun, oyuncunun da birkaç dükkânı olsun; sonra şehir durur.
    await kp.evaluate(() => {
      const c = window.__capital;
      for (let d = 0; d < 25; d++) c.engine.runDay();
      const s = c.getState();
      s.companies[s.playerCompanyId].cash += 20_000_000;
      let built = 0;
      for (const tile of s.map.tiles) {
        if (built >= 7) break;
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        if (!c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) built++;
      }
      for (let d = 0; d < 12; d++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      c.setTimeOfDay(0.3);
    });
    await kp.waitForFunction(() => window.__capital.renderInfo().buildingsGrowing === false, null, { timeout: 30000 }).catch(() => {});

    // Kartın görselini sayfanın içinde ölçen işlev: panel açık renk, şirketin adı koyu, şehir düz değil.
    const cardPixels = () => kp.evaluate(async () => {
      const img = document.querySelector('[data-city-card-image]');
      if (!img) return null;
      await img.decode().catch(() => {});
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const region = (x0, y0, x1, y1) => {
        const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let sum = 0;
        let sq = 0;
        let dark = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += l;
          sq += l * l;
          if (l < 90) dark++;
        }
        const mean = sum / n;
        return { mean: Math.round(mean), sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))), dark };
      };
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: img.alt,
        panel: region(60, 60, 560, 580),
        name: region(110, 110, 560, 180),
        city: region(640, 60, 1160, 560),
      };
    });
    const sceneNow = () => kp.evaluate(() => {
      const canvas = document.querySelector('canvas.scene');
      const info = window.__capital.renderInfo();
      return { programs: info.programs, width: canvas.width, height: canvas.height, target: window.__capital.cameraTarget(), frames: info.frameCount, lens: info.activeLens };
    });

    // Oyun sürerken Hedefler'den.
    const day = await kp.evaluate(() => window.__capital.getState().time.day);
    const before = await sceneNow();
    await kp.locator('.goal-chip').first().click();
    await kp.locator('.goals [data-city-card-open]').click();
    await kp.waitForSelector('[data-city-card="ready"]', { timeout: 60000 });
    const live = await cardPixels();
    const after = await sceneNow();
    await kp.screenshot({ path: `${OUT}/city-card-dialog.png` });
    check('Şehir kartı 1200 × 630: panel açık, şirketin adı koyu, şehir düz bir renk değil',
      live !== null && live.width === 1200 && live.height === 630 && live.panel.mean > 200 && live.name.dark > 300 && live.city.sd > 12,
      JSON.stringify(live && { panel: live.panel, name: live.name, city: live.city }));
    check('Kartın metni koşuyu söylüyor (ekran okuyucu ve paylaşım)', live !== null && live.alt.includes('Kart AŞ') && live.alt.includes('Koşu sürüyor') && live.alt.includes(`${day}. gün`),
      live?.alt ?? 'görsel yok');
    check('Kart yeni program derletmiyor; tuval, kamera geri geliyor, şehir çizilmeye devam ediyor',
      after.programs === before.programs && after.width === before.width && after.height === before.height
        && after.target.x === before.target.x && after.target.z === before.target.z && after.frames > before.frames,
      `program ${before.programs} → ${after.programs} · tuval ${before.width}×${before.height} → ${after.width}×${after.height} · kare ${before.frames} → ${after.frames}`);

    // İndirme: dosya adı ASCII, içi 1200 × 630 PNG.
    const download = kp.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await kp.locator('[data-city-card-download]').click();
    const file = await download;
    let png = null;
    if (file) {
      const bytes = fs.readFileSync(await file.path());
      png = { signature: bytes.subarray(0, 8).toString('hex'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), size: bytes.length };
    }
    const note = await kp.locator('[data-city-card-note]').textContent({ timeout: 5000 }).catch(() => '');
    check('Kart indiriliyor: adı capitalforge-Kart-AS-gun….png, içi 1200 × 630 PNG; pencere sonucu söylüyor',
      file !== null && file.suggestedFilename() === `capitalforge-Kart-AS-gun${day}.png` && png?.signature === '89504e470d0a1a0a' && png.width === 1200 && png.height === 630 && note.includes('indiriliyor'),
      `${file?.suggestedFilename() ?? 'indirme yok'} · ${JSON.stringify(png)} · ${note}`);
    await kp.keyboard.press('Escape');
    const closed = await kp.waitForSelector('[data-city-card]', { state: 'detached', timeout: 5000 }).then(() => true).catch(() => false);
    const goalsKept = (await kp.locator('.goals').count()) === 1;
    check('Escape yalnız kartı kapatıyor, Hedefler açık kalıyor', closed && goalsKept, `kart kapandı ${closed} · Hedefler ${goalsKept}`);
    await kp.keyboard.press('Escape');

    // Veri lensinde: kart şehrin kendisini çekiyor, lens sonra geri geliyor.
    await kp.evaluate(() => window.__capital.setLens('ownership'));
    await kp.waitForFunction(() => window.__capital.renderInfo().activeLens === 'ownership', null, { timeout: 15000 });
    await kp.evaluate(() => {
      const seen = [];
      window.__lensWatch = seen;
      const tick = () => {
        const lens = window.__capital.renderInfo().activeLens;
        if (seen[seen.length - 1] !== lens) seen.push(lens);
        if (seen.length < 4 && document.querySelector('[data-city-card="ready"]') === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await kp.locator('.goal-chip').first().click();
    await kp.locator('.goals [data-city-card-open]').click();
    await kp.waitForSelector('[data-city-card="ready"]', { timeout: 60000 });
    await kp.waitForFunction(() => window.__capital.renderInfo().activeLens === 'ownership', null, { timeout: 15000 }).catch(() => {});
    const lensSeen = await kp.evaluate(() => [...window.__lensWatch, window.__capital.renderInfo().activeLens]);
    check('Veri lensi açıkken kart şehrin kendisini çekiyor, lens sonra geri geliyor', lensSeen.includes('none') && lensSeen[lensSeen.length - 1] === 'ownership', lensSeen.join(' → '));
    await kp.locator('[data-city-card-close]').click();
    await kp.evaluate(() => window.__capital.setLens('none'));

    // Gölgelendiriciler derlenirken (açılışta, kalite değişince) sahne çizilmiyor: o an açılan
    // kart şehri bekliyor, şehirsiz bir gökle "hazır" olmuyor (Codex #94). Kademe aynı: yeni
    // program yok, yalnız yeniden derleme; düğme aynı görevde tıklanıyor.
    await kp.evaluate(() => {
      const c = window.__capital;
      c.setQuality(c.renderInfo().qualityTier);
      document.querySelector('.goals [data-city-card-open]').click();
    });
    await kp.waitForSelector('[data-city-card="ready"], [data-city-card="failed"]', { timeout: 60000 });
    const rewarmed = await cardPixels();
    check('Gölgelendiriciler derlenirken açılan kart şehri bekliyor, boş gök değil (Codex #94)',
      rewarmed !== null && rewarmed.city.dark > 5000 && rewarmed.city.sd > 12, JSON.stringify(rewarmed?.city ?? 'görsel yok'));
    await kp.locator('[data-city-card-close]').click();

    // Zafer ekranında.
    await kp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory = { day: s.time.day, kind: 'monopoly', path: 'retail', shares: { retail: 0.8, realestate: 0.2, energy: 0, freight: 0 }, acquisitions: 0 };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await kp.waitForSelector('.gameover.victory [data-city-card-open]', { timeout: 15000 });
    await kp.locator('.gameover.victory [data-city-card-open]').click();
    await kp.waitForSelector('[data-city-card="ready"]', { timeout: 60000 });
    const won = await cardPixels();
    // Pencere zafer ekranının üstünde: ortasındaki öğe pencerenin.
    const onTop = await kp.evaluate(() => {
      const body = document.querySelector('.card-dialog-body');
      const r = body.getBoundingClientRect();
      return body.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    await kp.screenshot({ path: `${OUT}/city-card-victory.png` });
    check('Zafer ekranından kart: "Tekel kuruldu" ve zaferin yolu; pencere zafer ekranının üstünde',
      won !== null && won.alt.includes('Tekel kuruldu') && won.alt.includes('Perakende ve zincir') && onTop, `${won?.alt ?? 'görsel yok'} · üstte ${onTop}`);
    await kp.locator('[data-city-card-close]').click();

    // Oyun sonunda.
    await kp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      s.victory.dismissed = true;
      s.gameOver = { day: s.time.day, byCompanyId: Object.keys(s.companies).find((id) => id !== s.playerCompanyId) };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await kp.waitForSelector('.gameover:not(.victory) [data-city-card-open]', { timeout: 15000 });
    await kp.locator('.gameover:not(.victory) [data-city-card-open]').click();
    await kp.waitForSelector('[data-city-card="ready"]', { timeout: 60000 });
    const lost = await cardPixels();
    check('Oyun sonundan kart: devralınan koşu', lost !== null && lost.alt.includes('İmparatorluk el değiştirdi'), lost?.alt ?? 'görsel yok');
    check('Şehir kartı akışında konsol temiz', kErrors.length === 0, kErrors.slice(0, 2).join(' | '));
    await kContext.close();

    // Telefonda İngilizce: pencere ekrana sığıyor, kart İngilizce.
    const kPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await kPhone.addInitScript(veteran, TUTORIAL_KEY);
    await kPhone.addInitScript(() => localStorage.setItem('capitalforge.locale', 'en'));
    const pk = await kPhone.newPage();
    const pkErrors = [];
    pk.on('pageerror', (e) => pkErrors.push(e.message));
    await pk.goto('http://127.0.0.1:8811/');
    await pk.waitForSelector('.newgame', { timeout: 20000 });
    await pk.locator('[data-newgame-start]').click();
    await pk.waitForSelector('.topbar', { timeout: 30000 });
    await pk.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    await pk.evaluate(() => {
      const c = window.__capital;
      for (let d = 0; d < 8; d++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await pk.locator('.goal-chip').first().click();
    await pk.locator('.goals [data-city-card-open]').click();
    await pk.waitForSelector('[data-city-card="ready"]', { timeout: 60000 });
    const phone = await pk.evaluate(() => {
      const body = document.querySelector('.card-dialog-body').getBoundingClientRect();
      const img = document.querySelector('[data-city-card-image]');
      const shown = img.getBoundingClientRect();
      return {
        left: Math.round(body.left),
        right: Math.round(body.right),
        imgWidth: Math.round(shown.width),
        ratio: Math.round((shown.width / shown.height) * 100) / 100,
        alt: img.alt,
        download: document.querySelector('[data-city-card-download]')?.textContent ?? '',
        page: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    await pk.screenshot({ path: `${OUT}/city-card-phone.png` });
    check('Telefonda İngilizce kart: pencere ekrana sığıyor, görsel oranını koruyor',
      phone.left >= 0 && phone.right <= 390 && phone.imgWidth <= 366 && Math.abs(phone.ratio - 1.9) < 0.05 && !phone.page
        && phone.alt.includes('Run in progress') && phone.download === 'Download image' && pkErrors.length === 0,
      JSON.stringify(phone));
    await kPhone.close();
  }

  section('Değerlendirme: Faz 4 sonu');
  {
    const eContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await eContext.addInitScript(veteran, TUTORIAL_KEY);
    // Tuvalin yerinin kaç kez okunduğu: sahnenin tuvalinde `getBoundingClientRect` sayacı.
    await eContext.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getBoundingClientRect;
      window.__rectReads = 0;
      HTMLCanvasElement.prototype.getBoundingClientRect = function () {
        if (this.classList.contains('scene')) window.__rectReads++;
        return original.call(this);
      };
    });
    const ep = await eContext.newPage();
    const eErrors = [];
    ep.on('pageerror', (e) => eErrors.push(e.message));
    ep.on('console', (m) => { if (m.type() === 'error') eErrors.push(m.text()); });
    await ep.goto('http://127.0.0.1:8811/');
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    await ep.locator('button:has-text("Şirketi kur")').click();
    await ep.waitForSelector('.topbar', { timeout: 30000 });
    await ep.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 4, null, { timeout: 60000 });
    // Kazanç etiketleri için kâr eden dükkânlar; şehir 1. hızda yürüyor.
    await ep.evaluate(() => {
      const c = window.__capital;
      for (let d = 0; d < 20; d++) c.engine.runDay();
      const s = c.getState();
      s.companies[s.playerCompanyId].cash += 20_000_000;
      let built = 0;
      for (const tile of s.map.tiles) {
        if (built >= 6) break;
        if (tile.kind !== 'plot' || tile.structureId || tile.ownerId) continue;
        if (!c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
        if (c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) built++;
      }
      for (let d = 0; d < 6; d++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
    });
    const tagged = await ep.waitForFunction(() => document.querySelectorAll('.money-tags > *').length >= 1, null, { timeout: 30000 }).then(() => true).catch(() => false);
    // Etiketler çatıdayken on kare boyunca tuvalin yeri kaç kez okunuyor (kare sayacı sayfanın içinde).
    const reads = await ep.evaluate(async () => {
      const startFrames = window.__capital.renderInfo().frameCount;
      const start = window.__rectReads;
      const tags = document.querySelectorAll('.money-tags > *').length;
      while (window.__capital.renderInfo().frameCount - startFrames < 10) await new Promise((resolve) => requestAnimationFrame(resolve));
      return { reads: window.__rectReads - start, frames: window.__capital.renderInfo().frameCount - startFrames, tags };
    });
    check('Kazanç etiketleri her karede tuvalin yerini okumuyor (Tur 65)', tagged && reads.tags >= 1 && reads.reads <= 1,
      `${reads.frames} karede ${reads.reads} okuma, ${reads.tags} etiket`);

    // Pencere boyutu değişince izdüşüm yeni yeri okuyor: kameranın baktığı nokta ekranın ortasında.
    await ep.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    // Kamera ortadaki bir sokak karesine (binasız: izdüşüm yerin hemen üstü).
    const road = await ep.evaluate(() => {
      const s = window.__capital.getState();
      const mid = { x: s.map.width / 2, y: s.map.height / 2 };
      const roads = s.map.tiles.filter((t) => t.kind === 'road');
      roads.sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y));
      const tile = roads[0];
      window.__capital.setView({ x: tile.x, z: tile.y, distance: 30 });
      return { id: tile.id, x: tile.x, z: tile.y };
    });
    const settled = () => ep.waitForFunction((r) => {
      const at = window.__capital.renderInfo().cameraCurrent;
      return Math.abs(at.x - r.x) < 0.05 && Math.abs(at.z - r.z) < 0.05;
    }, road, { timeout: 20000 }).catch(() => null);
    const centre = async () => ep.evaluate((id) => {
      const at = window.__capital.screenOfTile(id);
      return at && { dx: Math.abs(at.x - innerWidth / 2), dy: Math.abs(at.y - innerHeight / 2), w: innerWidth, h: innerHeight };
    }, road.id);
    await settled();
    const before = await centre();
    await ep.setViewportSize({ width: 900, height: 700 });
    await ep.waitForFunction(() => innerWidth === 900, null, { timeout: 5000 });
    // Boyut değişimi sahneye bir karede iniyor (pencerenin `resize`'ı ve tuvalin boyut gözlemcisi).
    await ep.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settled();
    const after = await centre();
    check('Pencere boyutu değişince ekrandaki yer yeni boyuttan (önbellek bayatlamıyor)',
      before !== null && after !== null && before.dx < 20 && before.dy < 20 && after.w === 900 && after.dx < 20 && after.dy < 20,
      JSON.stringify({ before, after }));
    check('Değerlendirme akışında konsol temiz', eErrors.length === 0, eErrors.slice(0, 2).join(' | '));
    await eContext.close();
  }

  section('İçerik paketleri');
  {
    const pContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await pContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8811' });
    await pContext.addInitScript(veteran, TUTORIAL_KEY);
    const pp = await pContext.newPage();
    const pErrors = [];
    pp.on('pageerror', (e) => pErrors.push(e.message));
    pp.on('console', (m) => { if (m.type() === 'error') pErrors.push(m.text()); });
    await pp.goto('http://127.0.0.1:8811/');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    await pp.locator('.mode-picker [data-mode="scenario"]').click();
    await pp.waitForSelector('[data-pack-shelf]', { timeout: 10000 });
    const empty = await pp.evaluate(() => ({
      shelf: document.querySelector('[data-pack-shelf]')?.getAttribute('data-pack-shelf'),
      text: document.querySelector('.pack-empty')?.textContent ?? '',
      builtin: document.querySelectorAll('.scenario-list [data-scenario]').length,
    }));
    check('Senaryo sekmesinde "Kendi senaryoların" rafı: boş, nasıl ekleneceği yazıyor; hazır on senaryo yerinde',
      empty.shelf === '0' && /paylaştığı kodu/.test(empty.text) && empty.builtin === 10, JSON.stringify(empty));

    // Seçili hazır senaryo (Kurtarma) örnek paket olarak kutuya; oyuncu onu değiştiriyor.
    await pp.locator('[data-pack-add] summary').click();
    await pp.locator('[data-pack-example]').click();
    const example = await pp.locator('[data-pack-input]').inputValue();
    const exampleDoc = JSON.parse(example);
    check('Örnekle doldur: seçili hazır senaryo paket biçiminde kutuda',
      exampleDoc.format === 'capitalforge-pack' && exampleDoc.version === 1 && exampleDoc.scenarios[0].id === 'rescue', example.slice(0, 80));
    const custom = {
      ...exampleDoc,
      id: 'deneme',
      name: { tr: 'Deneme paketi', en: 'Test pack' },
      author: 'Conforcus',
      rules: [{ id: 'sert-kis', base: 'storms', name: { tr: 'Sert kış', en: 'Hard winter' }, blurb: 'Krizler erken ve sık geliyor.', params: { firstDay: 40, gapDays: [60, 90] } }],
      scenarios: [{ ...exampleDoc.scenarios[0], id: 'sert-kurtarma', title: { tr: 'Sert kurtarma', en: 'Hard rescue' }, rules: ['sert-kis'] }],
    };
    const broken = JSON.parse(JSON.stringify(custom));
    broken.scenarios[0].goal.target = 10;
    broken.scenarios[0].stars.three = broken.scenarios[0].stars.two + 10;
    await pp.fill('[data-pack-input]', JSON.stringify(broken, null, 2));
    await pp.locator('[data-pack-submit]').click();
    await pp.waitForSelector('[data-pack-notice="bad"]', { timeout: 10000 });
    const rejected = await pp.evaluate(() => ({
      text: document.querySelector('[data-pack-notice="bad"]')?.textContent ?? '',
      issues: [...document.querySelectorAll('[data-pack-issue]')].map((el) => el.getAttribute('data-pack-issue')),
      shelf: document.querySelector('[data-pack-shelf]')?.getAttribute('data-pack-shelf'),
    }));
    check('Hatalı paket eklenmiyor; her sorun yeriyle ve nedeniyle',
      rejected.shelf === '0' && /eklenmedi; 2 sorun/.test(rejected.text) && /scenarios\[0\]\.goal\.target/.test(rejected.text) && /arasında olmalı/.test(rejected.text)
        && rejected.issues.includes('range') && rejected.issues.includes('starsOrder'),
      `${rejected.text.slice(0, 160)} · ${rejected.issues.join(',')}`);

    await pp.fill('[data-pack-input]', JSON.stringify(custom, null, 2));
    await pp.locator('[data-pack-submit]').click();
    await pp.waitForSelector('[data-pack-notice="good"]', { timeout: 10000 });
    const packId = 'deneme/sert-kurtarma';
    const added = await pp.evaluate((id) => {
      const card = document.querySelector(`[data-scenario="${id}"]`);
      return {
        notice: document.querySelector('[data-pack-notice="good"]')?.textContent ?? '',
        selected: card?.getAttribute('aria-checked'),
        card: card?.textContent ?? '',
        detail: document.querySelector('[data-detail="scenario"] .scenario-detail')?.textContent ?? '',
        source: document.querySelector('[data-scenario-source]')?.textContent ?? '',
        stored: JSON.parse(localStorage.getItem('capitalforge.packs.v1') ?? '[]').map((pack) => pack.id),
        box: document.querySelector('[data-pack-input]')?.value,
      };
    }, packId);
    check('Geçerli paket eklendi: kartı rafta ve seçili; kutu boşaldı; tarayıcıda kalıcı',
      /"Deneme paketi" eklendi: 1 senaryo/.test(added.notice) && added.selected === 'true' && /Sert kurtarma/.test(added.card) && /Paket: Deneme paketi/.test(added.card)
        && added.box === '' && added.stored.join() === 'deneme',
      `${added.notice} · ${added.card.slice(0, 80)} · ${added.stored}`);
    check('Ayrıntıda paketin kendi kuralı kendi adıyla; künye: paket, yazar, kariyere sayılmadığı',
      /Sert kış: Krizler erken ve sık geliyor\./.test(added.detail) && /Sert kış/.test(added.card)
        && /Paket: Deneme paketi, yazan Conforcus · kariyere ve başarımlara sayılmıyor/.test(added.source),
      `${added.source} · ${added.detail.slice(0, 120)}`);
    // Yeni sürüm aynı kimlikle: ayrıntı yeni hedefi gösteriyor (Codex #97: kimlik değişmeyince çizilmiyordu).
    const updated = JSON.parse(JSON.stringify(custom));
    updated.scenarios[0].goal.target = 9_000_000;
    await pp.fill('[data-pack-input]', JSON.stringify(updated));
    await pp.locator('[data-pack-submit]').click();
    await pp.waitForFunction(() => /güncellendi/.test(document.querySelector('[data-pack-add] [data-pack-notice]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => null);
    const refreshed = await pp.evaluate(() => ({
      notice: document.querySelector('[data-pack-add] [data-pack-notice]')?.textContent ?? '',
      goal: document.querySelector('[data-detail="scenario"] .scenario-goal')?.textContent ?? '',
      shelf: document.querySelector('[data-pack-shelf]')?.getAttribute('data-pack-shelf'),
    }));
    check('Aynı paketin yeni sürümü yerine geçiyor; seçili senaryonun ayrıntısı yeni hedefle',
      /"Deneme paketi" güncellendi: 1 senaryo/.test(refreshed.notice) && /9,00 M ₺/.test(refreshed.goal) && refreshed.shelf === '1',
      JSON.stringify(refreshed));
    await pp.waitForSelector('[data-pack-actions] [data-pack-copy="code"]', { timeout: 5000 }).catch(() => null);
    const actionsAt = await pp.evaluate(() => document.querySelector('[data-pack-actions]')?.getBoundingClientRect().height ?? 0);
    check('Seçili paket senaryosunda paylaş ve kaldır düğmeleri', actionsAt > 20, `${actionsAt} px`);
    await pp.screenshot({ path: `${OUT}/packs-shelf.png` });

    // Paylaşım kodu ve bağlantısı panoya.
    await pp.locator('[data-pack-copy="code"]').click();
    await pp.waitForFunction(() => /Kopyalandı/.test(document.querySelector('[data-pack-actions] [data-pack-notice]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    const code = await pp.evaluate(() => navigator.clipboard.readText());
    await pp.locator('[data-pack-copy="link"]').click();
    await pp.waitForFunction(() => /Bağlantı kopyalandı/.test(document.querySelector('[data-pack-actions] [data-pack-notice]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    const link = await pp.evaluate(() => navigator.clipboard.readText());
    check('Kodu kopyala: CF1. ile başlayan kısa kod; bağlantı ?paket= ile',
      /^CF1\.[A-Za-z0-9_-]+$/.test(code) && code.length < example.length && link === `http://127.0.0.1:8811/?paket=${code}`,
      `kod ${code.length} karakter (JSON ${example.length}) · ${link.slice(0, 60)}`);

    // Paketin senaryosu oynanıyor: ön tarih, açılış, kural ayarı.
    await pp.locator('[data-newgame-start]').click();
    await pp.waitForSelector(`[data-scenario-brief="${packId}"]`, { timeout: 90000 });
    const brief = ((await pp.locator(`[data-scenario-brief="${packId}"]`).textContent()) ?? '').trim();
    const run = await pp.evaluate(() => {
      const s = window.__capital.getState();
      return { id: s.scenario?.id, pack: s.scenario?.pack?.id, modifiers: s.modifiers ?? [], storms: s.ruleOverrides?.storms ?? null };
    });
    check('Paketin senaryosu açılıyor: açılışta adı ve kuralı; kayıtta paket ve kural ayarı',
      /Sert kurtarma/.test(brief) && /Ek kural: Sert kış/.test(brief) && run.id === packId && run.pack === 'deneme'
        && run.modifiers.join() === 'storms' && run.storms?.firstDay === 40 && run.storms?.gapDays?.join() === '60,90',
      `${JSON.stringify(run)} · ${brief.slice(-80)}`);
    await pp.locator('[data-scenario-begin]').click();
    await pp.waitForTimeout(300);
    await pp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    const goalsLine = async () => {
      await pp.locator('.agenda [data-agenda="scenario"] button').click();
      await pp.waitForSelector('.modal [data-modifier-line]', { timeout: 5000 }).catch(() => null);
      const text = (await pp.locator('.modal [data-modifier-line]').first().textContent().catch(() => '')) ?? '';
      await pp.keyboard.press('Escape');
      return text;
    };
    const line = await goalsLine();
    check('Hedef panelinin kural satırında paketin adlı kuralı', /Sert kış/.test(line), line);

    // Başka cihaz: paket yüklü değil. Kayıt kendi tanımıyla açılıyor; koşu kariyere girmemiş.
    await pp.waitForTimeout(1500);
    await pp.evaluate(() => localStorage.removeItem('capitalforge.packs.v1'));
    await pp.reload();
    await pp.waitForSelector('.topbar', { timeout: 30000 });
    await pp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    const resumed = await pp.evaluate(() => {
      const s = window.__capital.getState();
      const career = JSON.parse(localStorage.getItem('capitalforge.career.v1') ?? '{"runs":[]}');
      return { id: s.scenario?.id, briefSeen: s.scenario?.briefSeen, inCareer: (career.runs ?? []).some((r) => r.scenarioId === s.scenario?.id) };
    });
    const resumedLine = await goalsLine();
    check('Paket silinmiş cihazda kayıt açılıyor, koşu kendi tanımıyla (kuralın adı yerinde); kariyerde değil',
      resumed.id === packId && resumed.briefSeen === true && /Sert kış/.test(resumedLine) && resumed.inCareer === false,
      `${JSON.stringify(resumed)} · ${resumedLine}`);
    // Kayıtta bir sürüm, tarayıcıda başka bir sürüm (aynı kimlik): açılışta motor kayıttakini
    // tanıtıyor, raf sonra yüklü sürümü; ayrıntı yüklü sürümü göstermeli (Codex #97).
    const installedVersion = JSON.parse(JSON.stringify(custom));
    installedVersion.scenarios[0].goal.target = 7_000_000;
    await pp.evaluate((doc) => localStorage.setItem('capitalforge.packs.v1', JSON.stringify([doc])), installedVersion);
    await pp.reload();
    await pp.waitForSelector('.topbar', { timeout: 30000 });
    await pp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await pp.locator('.topbar-actions [data-panel="saves"]').click();
    await pp.waitForTimeout(300);
    await pp.locator('button:has-text("Yeni oyun")').first().click();
    await pp.waitForSelector('[data-pack-shelf]', { timeout: 10000 });
    await pp.waitForFunction(() => /7,00 M ₺/.test(document.querySelector('[data-detail="scenario"] .scenario-goal')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    const shownGoal = await pp.evaluate(() => document.querySelector('[data-detail="scenario"] .scenario-goal')?.textContent ?? '');
    check('Kayıtta başka sürüm varken raf açılınca ayrıntı yüklü sürümün hedefiyle', /7,00 M ₺/.test(shownGoal), shownGoal);
    check('Paket akışında konsol temiz', pErrors.length === 0, pErrors.slice(0, 2).join(' | '));
    await pContext.close();

    // Bağlantıyla gelen arkadaş: senaryo sekmesi açık, kod kutuda; ekliyor, sonra kaldırıyor.
    const lContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await lContext.addInitScript(veteran, TUTORIAL_KEY);
    const lp = await lContext.newPage();
    const lErrors = [];
    lp.on('pageerror', (e) => lErrors.push(e.message));
    lp.on('console', (m) => { if (m.type() === 'error') lErrors.push(m.text()); });
    await lp.goto(link);
    await lp.waitForSelector('[data-pack-add][open]', { timeout: 20000 });
    const arrived = await lp.evaluate(() => ({
      mode: document.querySelector('.mode-picker [data-mode="scenario"]')?.getAttribute('aria-checked'),
      box: document.querySelector('[data-pack-input]')?.value ?? '',
      notice: document.querySelector('[data-pack-add] [data-pack-notice]')?.textContent ?? '',
      search: location.search,
    }));
    check('Bağlantı senaryo sekmesini açıyor, kod ekleme kutusunda; adresten kalkıyor',
      arrived.mode === 'true' && arrived.box === code && /Bağlantıyla gelen/.test(arrived.notice) && arrived.search === '',
      JSON.stringify({ ...arrived, box: arrived.box.slice(0, 20) }));
    await lp.locator('[data-pack-submit]').click();
    await lp.waitForSelector(`[data-scenario="${packId}"][aria-checked="true"]`, { timeout: 10000 });
    // Dosyadan: ikinci paket.
    const second = { ...custom, id: 'dosyadan', name: 'Dosyadan gelen', scenarios: [{ ...custom.scenarios[0], id: 'ikinci', title: 'Dosyadaki senaryo' }] };
    await lp.locator('[data-pack-file-input]').setInputFiles({ name: 'paket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(second)) });
    await lp.waitForSelector('[data-scenario="dosyadan/ikinci"][aria-checked="true"]', { timeout: 10000 });
    const shelfCount = await lp.locator('[data-pack-shelf]').getAttribute('data-pack-shelf');
    // Kaldır: onay, sonra raf bir eksik, seçim ilk hazır senaryoya.
    await lp.locator('[data-pack-remove]').click();
    await lp.locator('[data-pack-remove-yes]').click();
    await lp.waitForFunction(() => document.querySelector('[data-scenario="dosyadan/ikinci"]') === null, null, { timeout: 5000 }).catch(() => null);
    const removed = await lp.evaluate(() => ({
      shelf: document.querySelector('[data-pack-shelf]')?.getAttribute('data-pack-shelf'),
      selected: document.querySelector('[data-scenario][aria-checked="true"]')?.getAttribute('data-scenario'),
      stored: JSON.parse(localStorage.getItem('capitalforge.packs.v1') ?? '[]').map((pack) => pack.id),
    }));
    check('Bağlantıdan ve dosyadan eklendi; kaldırılan paket raftan ve depodan çıktı, seçim ilk hazır senaryoda',
      shelfCount === '2' && removed.shelf === '1' && removed.selected === 'rescue' && removed.stored.join() === 'deneme',
      `${shelfCount} → ${JSON.stringify(removed)}`);

    // İngilizce: rafın metinleri ve paketin dil başına adları.
    await lp.locator('.newgame-locale [data-locale="en"]').click();
    await lp.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 }).catch(() => null);
    const english = await lp.evaluate((id) => ({
      title: document.querySelector('.pack-shelf-title')?.textContent ?? '',
      card: document.querySelector(`[data-scenario="${id}"]`)?.textContent ?? '',
      add: document.querySelector('[data-pack-add] summary')?.textContent ?? '',
    }), packId);
    check('İngilizcede raf ve paketin İngilizce adları', english.title === 'Your scenarios' && /Hard rescue/.test(english.card) && /Pack: Test pack/.test(english.card) && english.add === 'Add a scenario',
      JSON.stringify(english));
    await lp.locator('.newgame-locale [data-locale="tr"]').click();
    await lp.waitForFunction(() => document.documentElement.lang === 'tr', null, { timeout: 10000 }).catch(() => null);

    // Telefon: raf ve ekleme kutusu taşmıyor.
    await lp.setViewportSize({ width: 390, height: 844 });
    await lp.waitForTimeout(300);
    const narrow = await lp.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: innerWidth }));
    await lp.locator('[data-pack-shelf]').scrollIntoViewIfNeeded();
    await lp.screenshot({ path: `${OUT}/packs-phone.png` });
    check('Telefonda raf yatay taşmıyor', narrow.scroll <= narrow.width + 1, JSON.stringify(narrow));
    check('Bağlantı akışında konsol temiz', lErrors.length === 0, lErrors.slice(0, 2).join(' | '));
    await lContext.close();
  }

  section('Senaryo editörü');
  {
    const eContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    await eContext.addInitScript(veteran, TUTORIAL_KEY);
    const ep = await eContext.newPage();
    const eErrors = [];
    ep.on('pageerror', (e) => eErrors.push(e.message));
    ep.on('console', (m) => { if (m.type() === 'error') eErrors.push(m.text()); });
    await ep.goto('http://127.0.0.1:8811/');
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    await ep.locator('.mode-picker [data-mode="scenario"]').click();
    await ep.waitForSelector('[data-editor-open]', { timeout: 10000 });
    const launcher = (await ep.locator('[data-editor-open]').textContent()) ?? '';
    await ep.locator('[data-editor-open]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    const opened = await ep.evaluate(() => ({
      sections: [...document.querySelectorAll('[data-editor-section]')].map((el) => el.getAttribute('data-editor-section')),
      status: document.querySelector('[data-editor-status]')?.getAttribute('data-editor-status'),
      preview: document.querySelector('[data-editor-preview]')?.getAttribute('data-editor-preview'),
      card: document.querySelector('[data-editor-preview] .scenario-card-title')?.textContent ?? '',
      title: document.querySelector('[data-edit-path="scenarios[0].title"]')?.value,
      target: document.querySelector('[data-edit-path="scenarios[0].goal.target"]')?.closest('.editor-field')?.querySelector('.editor-aside')?.textContent ?? '',
      days: document.querySelector('[data-edit-path="scenarios[0].days"]')?.closest('.editor-field')?.querySelector('.editor-aside')?.textContent ?? '',
    }));
    check('"Senaryo yaz" editörü seçili hazır senaryoyla açıyor: bütün bölümler, sınırlar alanın yanında, ön izleme, durum hazır',
      launcher === 'Senaryo yaz' && opened.sections.join() === 'pack,scenarios,texts,city,goal,rules,setup,packRules' && opened.status === 'ok'
        && opened.preview === 'live' && opened.card === 'Kurtarma' && opened.title === 'Kurtarma'
        && opened.target === '100 B ₺ – 100,00 Mr ₺' && /^30 – 1000 gün$/.test(opened.days),
      JSON.stringify(opened));
    await ep.screenshot({ path: `${OUT}/editor.png` });

    // Aralık dışı hedef: sorun alanın altında ve listede; dene ve kaydet kapalı; ön izleme son geçerli hâlde.
    await ep.fill('[data-edit-path="scenarios[0].goal.target"]', '10');
    await ep.waitForSelector('[data-editor-status="1"]', { timeout: 5000 }).catch(() => null);
    const broken = await ep.evaluate(() => ({
      field: document.querySelector('[data-edit-path="scenarios[0].goal.target"]')?.closest('.editor-field')?.querySelector('.editor-issue')?.textContent ?? '',
      list: document.querySelector('.editor-issue-list')?.textContent ?? '',
      tryOff: document.querySelector('[data-editor-try]')?.disabled,
      saveOff: document.querySelector('[data-editor-save]')?.disabled,
      preview: document.querySelector('[data-editor-preview]')?.getAttribute('data-editor-preview'),
      badge: document.querySelector('[data-editor-tab="0"] .editor-badge')?.textContent,
    }));
    check('Aralık dışı değer: sorun alanın altında ve listede (alan adıyla); dene ve kaydet kapalı; sekmede sayı; ön izleme son geçerli hâli',
      /arasında olmalı/.test(broken.field) && /Kurtarma · Hedef tutar: .*arasında olmalı/.test(broken.list) && broken.tryOff === true && broken.saveOff === true
        && broken.preview === 'stale' && broken.badge === '1',
      JSON.stringify(broken));
    // "Alana git": odak alanda.
    await ep.fill('[data-edit-path="scenarios[0].seed"]', '5');
    await ep.locator('[data-editor-goto="scenarios[0].goal.target"]').click();
    await ep.waitForTimeout(200);
    const focused = await ep.evaluate(() => document.activeElement?.getAttribute('data-edit-path'));
    check('Sorun listesinden "alana git" o alana odaklanıyor', focused === 'scenarios[0].goal.target', String(focused));
    await ep.fill('[data-edit-path="scenarios[0].goal.target"]', '12000000');

    // İkinci dil: her metin iki dilde; eksik İngilizceler sorun; doldurulunca hazır.
    await ep.locator('[data-edit-toggle="locale-en"]').check();
    await ep.waitForTimeout(200);
    const twoLang = await ep.evaluate(() => ({
      status: Number(document.querySelector('[data-editor-status]')?.getAttribute('data-editor-status')),
      inputs: document.querySelectorAll('[data-edit-path="scenarios[0].title.en"]').length,
    }));
    for (const [path, text] of [['name.en', 'Editor pack'], ['scenarios[0].title.en', 'Editor rescue'], ['scenarios[0].tagline.en', 'A short one.'], ['scenarios[0].brief.en', 'A brief.'], ['scenarios[0].goalText.en', 'Reach the target.']]) {
      await ep.fill(`[data-edit-path="${path}"]`, text);
    }
    for (let j = 0; j < 6; j++) {
      const fact = ep.locator(`[data-edit-path="scenarios[0].facts[${j}].en"]`);
      if ((await fact.count()) === 0) break;
      await fact.fill(`Fact ${j + 1}`);
    }
    await ep.fill('[data-edit-path="scenarios[0].title.tr"]', 'Editör kurtarma');
    await ep.waitForTimeout(200);
    const filled = await ep.evaluate(() => document.querySelector('[data-editor-status]')?.getAttribute('data-editor-status'));
    check('İkinci dil: her metnin İngilizcesi ayrı girdi, boşlar sorun; doldurulunca hazır',
      twoLang.status >= 5 && twoLang.inputs === 1 && filled === 'ok', `${JSON.stringify(twoLang)} → ${filled}`);

    // Hedef türü: bitişte en değerli → yıldız ölçüsü öndelik; devirde kriz; paketin kuralı.
    await ep.selectOption('[data-edit-path="scenarios[0].goal.kind"]', 'leadAtEnd');
    await ep.locator('[data-edit-toggle="part-crisis"]').check();
    await ep.locator('[data-editor-rule-add]').click();
    await ep.fill('[data-edit-path="rules[0].id"]', 'sert-kis');
    await ep.fill('[data-edit-path="rules[0].name.tr"]', 'Sert kış');
    await ep.fill('[data-edit-path="rules[0].name.en"]', 'Hard winter');
    await ep.fill('[data-edit-path="rules[0].params.firstDay"]', '40');
    await ep.selectOption('[data-edit-rule="storms"]', 'sert-kis');
    // İkinci kural, ilkinin kimliğiyle: belgeye gitmiyor, alan söylüyor; alandan çıkınca gerçek kimlik.
    await ep.locator('[data-editor-rule-add]').click();
    await ep.fill('[data-edit-path="rules[1].id"]', 'sert-kis');
    await ep.waitForTimeout(700);
    const clash = await ep.evaluate(() => ({
      note: !!document.querySelector('[data-editor-rule="storms-ayar"] [data-edit-issue="ruleIdTaken"]'),
      stored: JSON.parse(localStorage.getItem('capitalforge.pack-draft.v1') ?? 'null')?.doc?.rules?.map((rule) => rule.id) ?? [],
    }));
    await ep.locator('[data-edit-path="rules[1].name.en"]').focus();
    const reverted = await ep.locator('[data-edit-path="rules[1].id"]').inputValue();
    check('Başka kuralın kimliği yazılmıyor: alan söylüyor, kural eski kimliğiyle; alandan çıkınca gerçek kimlik',
      clash.note && clash.stored.join() === 'sert-kis,storms-ayar' && reverted === 'storms-ayar', `${JSON.stringify(clash)} · ${reverted}`);
    // Kural silinince yerine kayan kuralın kriz arası kendi değeri (Codex #98: alan silinenin değerini gösteriyordu).
    const gap = (id) => ep.locator(`[data-editor-rule="${id}"] .editor-pair input`);
    await gap('storms-ayar').nth(0).fill('100');
    await gap('storms-ayar').nth(1).fill('200');
    await ep.locator('[data-editor-rule-add]').click();
    await gap('storms-ayar-2').nth(0).fill('300');
    await gap('storms-ayar-2').nth(1).fill('400');
    await ep.locator('[data-editor-rule-remove="storms-ayar"]').click();
    await ep.waitForTimeout(700);
    const shifted = {
      shown: [await gap('storms-ayar-2').nth(0).inputValue(), await gap('storms-ayar-2').nth(1).inputValue()],
      stored: await ep.evaluate(() => JSON.parse(localStorage.getItem('capitalforge.pack-draft.v1') ?? 'null')?.doc?.rules?.[1]?.params?.gapDays ?? null),
    };
    check('Kural silinince yerine kayan kuralın alanları kendi değerini gösteriyor', shifted.shown.join() === '300,400' && shifted.stored?.join() === '300,400', JSON.stringify(shifted));
    await ep.locator('[data-editor-rule-remove="storms-ayar-2"]').click();
    await ep.fill('[data-edit-path="scenarios[0].days"]', '200');
    await ep.fill('[data-edit-path="scenarios[0].stars.two"]', '1.2');
    await ep.fill('[data-edit-path="scenarios[0].stars.three"]', '1,6');
    await ep.fill('[data-edit-path="id"]', 'editor-paket');
    await ep.waitForTimeout(700);
    const shaped = await ep.evaluate(() => ({
      status: document.querySelector('[data-editor-status]')?.getAttribute('data-editor-status'),
      stars: document.querySelector('[data-editor-stars]')?.getAttribute('data-editor-stars'),
      crisis: !!document.querySelector('[data-edit-path="scenarios[0].setup.crisis.id"]'),
      card: document.querySelector('[data-editor-preview] .scenario-card')?.textContent ?? '',
      goal: document.querySelector('[data-editor-preview] .scenario-goal')?.textContent ?? '',
      issues: document.querySelector('.editor-issue-list')?.textContent ?? '',
      draft: JSON.parse(localStorage.getItem('capitalforge.pack-draft.v1') ?? 'null')?.doc?.scenarios?.[0]?.stars ?? null,
    }));
    check('Hedef türü değişince yıldız ölçüsü ve hedef cümlesi hedefe göre; kriz parçası, paketin ayarlı kuralı; ön izlemede kuralın adı; taslak saklanıyor',
      shaped.status === 'ok' && shaped.stars === 'lead' && shaped.crisis && /Sert kış/.test(shaped.card) && /en değerli şirketi ol/.test(shaped.goal) && !/[{}]/.test(shaped.goal)
        && shaped.draft?.metric === 'lead' && shaped.draft?.three === 1.6,
      JSON.stringify(shaped));

    // Taslak sayfa yenilense de: "Taslağa devam et".
    await ep.reload();
    await ep.waitForSelector('.newgame', { timeout: 20000 });
    await ep.locator('.mode-picker [data-mode="scenario"]').click();
    await ep.waitForSelector('[data-editor-open]', { timeout: 10000 });
    const resume = (await ep.locator('[data-editor-open]').textContent()) ?? '';
    await ep.locator('[data-editor-open]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    const kept = await ep.evaluate(() => ({
      id: document.querySelector('[data-edit-path="id"]')?.value,
      title: document.querySelector('[data-edit-path="scenarios[0].title.en"]')?.value,
      rule: document.querySelector('[data-edit-rule="storms"]')?.value,
    }));
    check('Taslak bu cihazda: sayfa yenilense de "Taslağa devam et" kaldığı yerden açıyor',
      resume === 'Taslağa devam et' && kept.id === 'editor-paket' && kept.title === 'Editor rescue' && kept.rule === 'sert-kis', `${resume} · ${JSON.stringify(kept)}`);

    // Dosya olarak indir.
    const [download] = await Promise.all([ep.waitForEvent('download', { timeout: 10000 }), ep.locator('[data-editor-download]').click()]);
    const downloadPath = await download.path();
    const downloaded = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    check('Dosya olarak indir: paketin JSON\'u, kimliğiyle adlanmış',
      download.suggestedFilename() === 'editor-paket.capitalforge.json' && downloaded.format === 'capitalforge-pack' && downloaded.rules?.[0]?.id === 'sert-kis',
      download.suggestedFilename());

    // Rafa kaydet: rafta ve seçili.
    await ep.locator('[data-editor-save]').click();
    await ep.waitForSelector('[data-editor-notice="good"]', { timeout: 5000 });
    const savedNotice = (await ep.locator('[data-editor-notice]').textContent()) ?? '';
    await ep.locator('[data-editor-close]').click();
    await ep.waitForTimeout(300);
    const shelf = await ep.evaluate(() => ({
      selected: document.querySelector('[data-pack-shelf] [data-scenario][aria-checked="true"]')?.getAttribute('data-scenario'),
      stored: JSON.parse(localStorage.getItem('capitalforge.packs.v1') ?? '[]').map((pack) => pack.id),
      launcher: document.querySelector('[data-editor-open]')?.textContent,
    }));
    check('Rafa kaydet: paket rafta ve seçili; taslak kaydedilmiş sayılıyor',
      /rafa kaydedildi/.test(savedNotice) && shelf.selected === 'editor-paket/rescue' && shelf.stored.join() === 'editor-paket',
      `${savedNotice} · ${JSON.stringify(shelf)}`);

    // Dene: taslak kaydedilmeden başlıyor (raftaki sürüm değil); menüye dönünce editör açık.
    await ep.locator('[data-editor-open]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    await ep.fill('[data-edit-path="scenarios[0].days"]', '150');
    await ep.waitForSelector('[data-editor-status="ok"]', { timeout: 5000 });
    await ep.locator('[data-editor-try]').click();
    await ep.waitForSelector('[data-scenario-brief="editor-paket/rescue"]', { timeout: 90000 });
    const trial = await ep.evaluate(() => {
      const s = window.__capital.getState();
      return { length: s.scenario.endDay - s.scenario.startDay, pack: s.scenario.pack?.id, storms: s.ruleOverrides?.storms?.firstDay, shelfDays: JSON.parse(localStorage.getItem('capitalforge.packs.v1'))[0].scenarios[0].days };
    });
    check('Dene: taslak kaydetmeden oynanıyor (süre taslağınki, raftaki değil), paket ve kural ayarı kayıtta',
      trial.length === 150 && trial.shelfDays === 200 && trial.pack === 'editor-paket' && trial.storms === 40, JSON.stringify(trial));
    await ep.locator('[data-scenario-begin]').click();
    await ep.waitForTimeout(300);
    await ep.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    await ep.locator('.topbar-actions [data-panel="saves"]').click();
    await ep.waitForTimeout(300);
    await ep.locator('.modal button:has-text("Yeni oyun")').first().click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 }).catch(() => null);
    const back = await ep.evaluate(() => ({ editor: !!document.querySelector('[data-pack-editor]'), days: document.querySelector('[data-edit-path="scenarios[0].days"]')?.value }));
    check('Denemeden menüye dönen oyuncu editörü kaldığı yerde buluyor', back.editor && back.days === '150', JSON.stringify(back));

    // Düzenle: kaydedilmemiş taslak varken önce soruyor, sonra raftaki sürümü açıyor.
    await ep.locator('[data-editor-close]').click();
    await ep.locator('[data-scenario="editor-paket/rescue"]').click();
    await ep.locator('[data-pack-edit]').click();
    const asked = await ep.locator('[data-pack-edit-yes]').count();
    await ep.locator('[data-pack-edit-yes]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    const editing = await ep.locator('[data-edit-path="scenarios[0].days"]').inputValue();
    check('Düzenle: kaydedilmemiş taslak varken soruyor; raftaki sürüm açılıyor', asked === 1 && editing === '200', `${asked} · ${editing}`);

    // İngilizce.
    await ep.locator('[data-editor-close]').click();
    await ep.locator('.newgame-locale [data-locale="en"]').click();
    await ep.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 10000 }).catch(() => null);
    await ep.locator('[data-editor-open]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    const english = await ep.evaluate(() => ({
      title: document.querySelector('#pack-editor-title')?.textContent,
      goal: document.querySelector('[data-editor-section="goal"] legend')?.textContent,
      save: document.querySelector('[data-editor-save]')?.textContent,
    }));
    check('İngilizcede editör', english.title === 'Scenario editor' && english.goal === 'Goal and stars' && english.save === 'Save to shelf', JSON.stringify(english));
    await ep.locator('[data-editor-close]').click();
    await ep.locator('.newgame-locale [data-locale="tr"]').click();
    await ep.waitForFunction(() => document.documentElement.lang === 'tr', null, { timeout: 10000 }).catch(() => null);

    // Telefon: tek sütun, yatay taşma yok, alt şerit görünür.
    await ep.setViewportSize({ width: 390, height: 844 });
    await ep.locator('[data-editor-open]').click();
    await ep.waitForSelector('[data-pack-editor]', { timeout: 10000 });
    await ep.waitForTimeout(300);
    const phone = await ep.evaluate(() => {
      const modal = document.querySelector('.editor-modal');
      const footer = document.querySelector('.editor-footer')?.getBoundingClientRect();
      return { scroll: modal.scrollWidth, width: modal.clientWidth, footerBottom: Math.round(footer?.bottom ?? 0), height: innerHeight };
    });
    await ep.screenshot({ path: `${OUT}/editor-phone.png` });
    check('Telefonda editör: yatay taşma yok, durum ve düğmeler ekranda', phone.scroll <= phone.width + 1 && phone.footerBottom <= phone.height + 1 && phone.footerBottom > phone.height - 40,
      JSON.stringify(phone));
    check('Editör akışında konsol temiz', eErrors.length === 0, eErrors.slice(0, 2).join(' | '));
    await eContext.close();
  }

  section('Pencere boyları ve Steam Deck');
  {
    /*
     * Masaüstünün pencereleri (Tur 71). 1100 pikselin altında paneller tek
     * sütuna iniyor ve üst üste biniyordu: masaüstünün en küçük penceresi
     * (960 × 600) ve 125 % ölçekli 1366 × 768 dizüstü (1093 × 614) o
     * aralıkta. Steam Deck 1280 × 800'de metin "çok büyük" açılıyor: Valve'ın
     * okunabilirlik ölçüsü en küçük yazı 12 piksel, bütün paneller açıkken.
     */
    const SIZES = [
      { width: 960, height: 600, lang: 'de' },
      { width: 1093, height: 614, lang: 'tr' },
      { width: 1280, height: 800, lang: 'en', textSize: 'xlarge' },
      { width: 1920, height: 1080, lang: 'tr' },
    ];
    // Görünen (örtülmemiş) metnin en küçük yazı boyu; örnek olarak en küçük üçü.
    const smallestText = (page) => page.evaluate(() => {
      const rows = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || !node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden') continue;
        let opacity = 1;
        for (let a = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
        if (opacity < 0.05) continue;
        const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
        if (top && !(top === el || el.contains(top) || top.contains(el))) continue;
        rows.push({ size: parseFloat(cs.fontSize), text: node.textContent.trim().slice(0, 24) });
      }
      rows.sort((a, b) => a.size - b.size);
      return { min: rows[0]?.size ?? 0, count: rows.length, smallest: rows.slice(0, 3) };
    });
    for (const size of SIZES) {
      const label = `${size.width} × ${size.height} (${size.lang}${size.textSize ? ', metin çok büyük' : ''})`;
      const wContext = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await wContext.addInitScript(veteran, TUTORIAL_KEY);
      if (size.textSize) {
        await wContext.addInitScript((textSize) => {
          try {
            localStorage.setItem('capitalforge.settings.v1', JSON.stringify({ textSize }));
          } catch {
            /* depo kapalı */
          }
        }, size.textSize);
      }
      const wp = await wContext.newPage();
      const wErrors = [];
      wp.on('pageerror', (e) => wErrors.push(e.message));
      wp.on('console', (m) => { if (m.type() === 'error') wErrors.push(m.text()); });
      await wp.goto(`http://127.0.0.1:8811/?lang=${size.lang}`);
      await wp.waitForSelector('.newgame', { timeout: 20000 });
      const setupText = size.textSize ? await smallestText(wp) : null;
      await wp.locator('[data-newgame-start]').click();
      await wp.waitForSelector('.topbar', { timeout: 30000 });
      await wp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 3, null, { timeout: 60000 });
      await wp.evaluate(() => {
        const c = window.__capital;
        c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
        for (let i = 0; i < 20; i++) c.engine.runDay();
      });
      const vacant = await findTile(wp, 'vacant');
      await wp.evaluate((id) => window.__capital.selectTile(id), vacant);
      await wp.waitForTimeout(600);
      const layout = await wp.evaluate(() => {
        const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
        const panels = ['.topbar', '.leftcol', '.inspector', '.news', '.active-events']
          .map((sel) => [sel, box(sel)])
          .filter(([, r]) => r && r.width > 0 && r.height > 0);
        const overlaps = [];
        for (let i = 0; i < panels.length; i++) {
          for (let j = i + 1; j < panels.length; j++) {
            const [a, ra] = panels[i];
            const [b, rb] = panels[j];
            const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (x > 1 && y > 1) overlaps.push(`${a} × ${b}`);
          }
        }
        // Sol sütunun panelleri sütundan taşmıyor (taşan, alttakinin üstüne biniyordu).
        const column = box('.leftcol');
        const spill = [...document.querySelector('.leftcol').children]
          .filter((child) => child.getBoundingClientRect().bottom > column.bottom + 1)
          .map((child) => child.className.split(' ')[0]);
        // Şehir ortada açık ve tıklanabilir: sol sütunla parsel kartı arasının ortası tuval.
        const left = box('.leftcol');
        const right = box('.inspector');
        const top = box('.topbar');
        const x = (left.right + right.left) / 2;
        const y = top.bottom + (innerHeight - top.bottom) * 0.35;
        const hit = document.elementFromPoint(x, y);
        const doc = document.documentElement;
        return {
          overlaps,
          spill,
          city: hit?.tagName === 'CANVAS',
          cityWidth: Math.round(right.left - left.right),
          scroll: doc.scrollWidth > doc.clientWidth + 1 || doc.scrollHeight > doc.clientHeight + 1,
        };
      });
      check(`${label}: paneller üst üste binmiyor, sol sütun taşmıyor, şehir ortada tıklanabilir`,
        layout.overlaps.length === 0 && layout.spill.length === 0 && layout.city && !layout.scroll, JSON.stringify(layout));
      await wp.screenshot({ path: `${OUT}/window-${size.width}x${size.height}.png` });
      if (size.textSize) {
        // Steam Deck: kurulum, oyun ve parsel, sonra rıhtımın her paneli ve Ayarlar.
        const seen = [['kurulum', setupText], ['parsel', await smallestText(wp)]];
        await wp.evaluate(() => window.__capital.selectTile(null));
        for (const panel of ['chain', 'rivalry', 'bourse', 'council', 'company', 'rivals', 'saves', 'help', 'settings']) {
          await wp.locator(`[data-panel="${panel}"]`).first().click();
          await wp.waitForTimeout(500);
          seen.push([panel, await smallestText(wp)]);
          await wp.keyboard.press('Escape');
          await wp.waitForTimeout(200);
        }
        const min = Math.min(...seen.map(([, text]) => text.min));
        const worst = seen.find(([, text]) => text.min === min);
        check("Steam Deck (1280 × 800, metin çok büyük): her ekranda en küçük yazı en az 12 piksel",
          min >= 12 && seen.every(([, text]) => text.count > 0), `en küçük ${min} px (${worst[0]}: ${JSON.stringify(worst[1].smallest)})`);
      }
      check(`${label}: konsol temiz`, wErrors.length === 0, wErrors.slice(0, 2).join(' | '));
      await wContext.close();
    }
  }

  section('Kumanda ve yalnız klavye');
  {
    /*
     * Steam Deck ve kumanda (Tur 72). Oyun fare olmadan oynanıyor: kumandada
     * yön tuşu arayüzde geziyor, A basıyor, B geri dönüyor; haritada
     * imleç kameranın ortasındaki parsel. Klavyede Enter ortadaki parseli
     * seçiyor, Q/E döndürüyor, +/− yakınlaştırıyor. Kumanda sahte
     * (`navigator.getGamepads`, standart düzen); kumandanın döngüsü karede
     * bir okuyor, bu makinede kare yavaş, basış iki kare sürüyor.
     */
    const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
    const SONY = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
    const NINTENDO = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';
    const BUTTON = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, up: 12, down: 13, left: 14, right: 15 };
    const frames = (page, n) => page.evaluate((count) => new Promise((resolve) => {
      const step = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
      step(count);
    }), n);
    const tap = async (page, name) => {
      await page.evaluate((index) => window.__fakePad.set(index, true), BUTTON[name]);
      await frames(page, 2);
      await page.evaluate((index) => window.__fakePad.set(index, false), BUTTON[name]);
      await frames(page, 3);
    };
    const active = (page) => page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName.toLowerCase() ?? '',
        cls: typeof el?.className === 'string' ? el.className : '',
        text: (el?.textContent ?? '').trim().slice(0, 40),
        start: el?.hasAttribute('data-newgame-start') ?? false,
        inInspector: !!el?.closest('.inspector'),
        inLeftcol: !!el?.closest('.leftcol'),
        inModal: !!el?.closest('[aria-modal="true"]'),
      };
    });
    const hints = (page) => page.evaluate(() => {
      const bar = document.querySelector('.pad-hints');
      return bar ? { layer: bar.dataset.layer, text: bar.textContent, shown: getComputedStyle(bar).display !== 'none', glyphs: [...bar.querySelectorAll('.pad-glyph')].map((g) => g.textContent) } : null;
    });
    // Kuşbakışı ve parselin ortası: binalar ortadaki parseli örtmesin; parsel tam sayıda ortalanıyor.
    const centerOn = async (page, tileId) => {
      for (let i = 0; i < 3; i++) {
        await page.evaluate((id) => {
          const cap = window.__capital;
          const tile = cap.getState().map.tiles[id];
          const target = cap.cameraTarget();
          const ground = cap.groundAt(0, 0);
          const at = ground ? { x: target.x - (ground.x - tile.x), z: target.z - (ground.z - tile.y) } : { x: tile.x, z: tile.y };
          cap.setView({ ...at, distance: 14, polar: 0.12 });
        }, tileId);
        await frames(page, 6);
      }
    };
    const buyable = (page) => page.evaluate(() => {
      const s = window.__capital.getState();
      const open = (t) => { const d = s.districts[t.districtId]; return !d || d.opensOnDay === undefined || s.time.day >= d.opensOnDay; };
      return s.map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.ownerId && !t.buildingId && open(t) && s.auction?.tileId !== t.id)?.id ?? null;
    });
    const start = async (page) => {
      await page.waitForSelector('.topbar', { timeout: 30000 });
      await page.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 3, null, { timeout: 60000 });
      await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
    };

    // ---------------------------------------------------------- kumanda
    const fakePad = (id) => {
      const state = { id, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: 0 };
      const pad = { index: 0, connected: true, mapping: 'standard', get id() { return state.id; }, get buttons() { return state.buttons; }, get axes() { return state.axes; }, get timestamp() { return state.timestamp; } };
      window.__fakePad = {
        connected: false,
        set(index, down) { state.buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 }; state.timestamp = performance.now(); },
        axis(index, value) { state.axes[index] = value; state.timestamp = performance.now(); },
        rename(next) { state.id = next; },
        remap(next) { pad.mapping = next; },
      };
      navigator.getGamepads = () => (window.__fakePad.connected ? [pad, null, null, null] : [null, null, null, null]);
      // Başsız tarayıcıda sayfa odakta sayılmıyor; kumanda odaksız pencerede susuyor.
      document.hasFocus = () => true;
      window.addEventListener('capitalforge:text-input', (event) => { window.__textInput = event.detail; });
    };
    const pContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await pContext.addInitScript(veteran, TUTORIAL_KEY);
    await pContext.addInitScript(fakePad, XBOX);
    const pp = await pContext.newPage();
    const pErrors = [];
    pp.on('pageerror', (e) => pErrors.push(e.message));
    pp.on('console', (m) => { if (m.type() === 'error') pErrors.push(m.text()); });
    await pp.goto('http://127.0.0.1:8811/?lang=tr');
    await pp.waitForSelector('.newgame', { timeout: 20000 });
    // Kumandanın modülü ayrı parça (giriş paketinde yok; bütçeyi `bundle-check` sınıyor). Oyun ekranının
    // parçası arka planda iniyor ama kumandanınkini getirmiyor: kumanda bağlanınca iniyor (Codex #102).
    await pp.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/GameRoot-[\w-]+\.js/.test(r.name)), null, { timeout: 20000 }).catch(() => {});
    const early = await pp.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name.split('/').pop()).filter((name) => /^(GameRoot|pad)-/.test(name)));
    check('Kumandanın modülü kumanda bağlanmadan inmiyor; oyun ekranının parçası onu getirmiyor',
      early.some((name) => name.startsWith('GameRoot-')) && !early.some((name) => name.startsWith('pad-')), early.join(', '));
    await pp.evaluate(() => { window.__fakePad.connected = true; window.dispatchEvent(new Event('gamepadconnected')); });
    await pp.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/pad-[\w-]+\.js/.test(r.name)), null, { timeout: 10000 }).catch(() => {});
    await frames(pp, 3);

    // Kurulum: şirket adı alanı açılışta odakta; A ekran klavyesini istiyor (Steam Deck).
    await tap(pp, 'a');
    const field = await pp.evaluate(() => window.__textInput ?? null);
    check('Yazı alanında A ekran klavyesini istiyor: alanın yeri ve tek satırlı olduğu masaüstü kabuğuna gidiyor',
      field !== null && field.width > 0 && field.height > 0 && field.multiline === false, JSON.stringify(field));
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await tap(pp, 'down');
      reached = (await active(pp)).start;
    }
    const setupHints = await hints(pp);
    check('Kurulumda yön tuşu odağı gezdiriyor, "Şirketi kur"a varılıyor; ipucu şeridi açık',
      reached && setupHints?.shown && setupHints.glyphs.includes('A') && setupHints.glyphs.includes('B'), JSON.stringify({ reached, setupHints }));
    await tap(pp, 'a');
    await start(pp);
    check('Kurulum yalnız kumandayla bitiyor: A "Şirketi kur"a basıyor', (await pp.locator('.topbar').count()) === 1);

    const mapState = await pp.evaluate(() => ({ input: document.documentElement.dataset.input, reticle: getComputedStyle(document.querySelector('.map-reticle')).display }));
    const mapHints = await hints(pp);
    check('Haritada nişangâh ve ipuçları: A parseli seç, yön tuşu düğmeler, LB RB paneller, Y durdur, X hız, ☰ Ayarlar',
      mapState.input === 'pad' && mapState.reticle !== 'none' && mapHints?.layer === 'map' && ['A', 'LB RB', 'Y', 'X', '☰'].every((g) => mapHints.glyphs.includes(g)),
      JSON.stringify({ mapState, mapHints }));

    // A ortadaki parseli seçiyor, ikinci A satın alıyor.
    const plot = await buyable(pp);
    await centerOn(pp, plot);
    await tap(pp, 'a');
    await frames(pp, 4);
    const picked = await pp.evaluate(() => window.__capital.selectedTile());
    const onBuy = await active(pp);
    check('A ortadaki parseli seçiyor; odak detayın ilk eyleminde (satın al)', picked === plot && onBuy.inInspector && onBuy.tag === 'button', `${picked} / ${plot} · ${onBuy.text}`);
    await tap(pp, 'a');
    await frames(pp, 4);
    const bought = await pp.evaluate((id) => { const s = window.__capital.getState(); return s.map.tiles[id].ownerId === s.playerCompanyId; }, plot);
    const afterBuy = await active(pp);
    check('A satın alıyor; odak detayın kendisinde, yerine gelen "Parseli sat" düğmesinde değil',
      bought && afterBuy.tag === 'aside' && afterBuy.inInspector, JSON.stringify(afterBuy));
    await tap(pp, 'b');
    const back = await active(pp);
    check('B haritaya döndürüyor, seçim duruyor', back.tag === 'body' && (await pp.evaluate(() => window.__capital.selectedTile())) === plot, JSON.stringify(back));

    // Haritadan sola: sol sütundaki yapı kartı (hizadaki kart üst bardaki sekmeden önce).
    await tap(pp, 'left');
    const card = await active(pp);
    check('Haritadan sola: sol sütundaki yapı kartı, üst bardaki sekme değil', card.inLeftcol && card.cls.includes('buildcard'), JSON.stringify(card));
    await tap(pp, 'a');
    await frames(pp, 3);
    const placing = await hints(pp);
    check('A yapıyı seçiyor: yerleştirme kipi, odak haritada, ipucu "Buraya kur"',
      (await active(pp)).tag === 'body' && placing?.text.includes('Buraya kur'), JSON.stringify(placing));
    await centerOn(pp, plot);
    await tap(pp, 'a');
    await frames(pp, 6);
    const built = await pp.evaluate((id) => window.__capital.getState().map.tiles[id].buildingId ?? null, plot);
    check('A ortadaki parsele kuruyor', built !== null, String(built));
    await tap(pp, 'b');
    await tap(pp, 'b');

    // Çubuklar ve tetikler: kamera.
    const camera = () => pp.evaluate(() => ({ ...window.__capital.cameraPose(), ...window.__capital.cameraTarget() }));
    const c0 = await camera();
    await pp.evaluate(() => window.__fakePad.axis(0, 1));
    await frames(pp, 6);
    await pp.evaluate(() => { window.__fakePad.axis(0, 0); window.__fakePad.axis(2, 1); });
    await frames(pp, 6);
    await pp.evaluate(() => { window.__fakePad.axis(2, 0); window.__fakePad.set(7, true); });
    await frames(pp, 6);
    await pp.evaluate(() => window.__fakePad.set(7, false));
    await frames(pp, 3);
    const c1 = await camera();
    check('Çubuklar kamerayı sürüyor: sol kaydırıyor, sağ döndürüyor, RT yakınlaştırıyor',
      Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.5 && Math.abs(c1.azimuth - c0.azimuth) > 0.2 && c1.distance < c0.distance, `${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);

    // Y durdur, X hız.
    const speed = () => pp.evaluate(() => window.__capital.getState().time.speed);
    const speeds = [await speed()];
    await tap(pp, 'y');
    speeds.push(await speed());
    await tap(pp, 'y');
    speeds.push(await speed());
    await tap(pp, 'x');
    speeds.push(await speed());
    check('Y duraklatıyor ve sürdürüyor, X hızı değiştiriyor', speeds[1] === (speeds[0] === 0 ? 1 : 0) && speeds[2] === speeds[0] && speeds[3] !== speeds[2], speeds.join(' → '));
    await pp.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));

    // LB / RB paneller arasında, B kapatıyor.
    const openPanel = () => pp.evaluate(() => document.querySelector('[aria-modal="true"] #modal-title')?.textContent ?? null);
    await tap(pp, 'rb');
    const first = await openPanel();
    await tap(pp, 'rb');
    const second = await openPanel();
    await tap(pp, 'lb');
    const again = await openPanel();
    const panelHints = await hints(pp);
    await tap(pp, 'b');
    check('RB sonraki, LB önceki panel; pencerede ipuçları "Kapat"; B kapatıyor',
      first && second && first !== second && again === first && panelHints?.layer === 'modal' && (await openPanel()) === null,
      `${first} → ${second} → ${again} · ${panelHints?.text}`);

    // Menü: Ayarlar ve kumandanın listesi; kaydırıcı yönle değişiyor.
    await tap(pp, 'menu');
    await frames(pp, 4);
    const list = await pp.evaluate(() => document.querySelector('[data-pad-controls]')?.innerText ?? '');
    check('☰ Ayarlar\'ı açıyor; kumandanın düğmeleri listede (A, B, LB · RB, LT · RT, Y, X)',
      ['A', 'B', 'LB · RB', 'LT · RT', 'Y', 'X', 'Sol çubuk', 'Sağ çubuk'].every((label) => list.includes(label)), list.replace(/\n/g, ' · ').slice(0, 160));
    const slider = await pp.evaluate(() => {
      const range = [...document.querySelectorAll('[aria-modal="true"] input[type="range"]')].find((el) => el.getClientRects().length > 0 && Number(el.value) < Number(el.max));
      if (!range) return null;
      range.focus();
      return Number(range.value);
    });
    await tap(pp, 'right');
    const moved = await pp.evaluate(() => Number(document.activeElement?.value));
    check('Kaydırıcıda yön tuşu değeri değiştiriyor', slider !== null && moved > slider, `${slider} → ${moved}`);
    await tap(pp, 'b');
    check('B Ayarlar\'ı kapatıyor', (await openPanel()) === null);

    // Karar ekranı (zafer, senaryo sonucu, iflas) kapatılmıyor, B'nin Escape'ini dinlemiyor:
    // şerit orada B'yi "Kapat" diye göstermiyor. Kumandanın öbür düğmeleri de susuyor:
    // omuzlar ve ☰ altta panel açıp karar verilince ortaya çıkarıyordu (Codex #102).
    await pp.evaluate(() => {
      const screen = document.createElement('div');
      screen.setAttribute('role', 'alertdialog');
      screen.dataset.fakeDecision = '';
      screen.innerHTML = '<button type="button">Yeni oyun</button>';
      document.body.append(screen);
    });
    await frames(pp, 3);
    const decision = await hints(pp);
    const beneath = () => pp.evaluate(() => ({
      panel: document.querySelector('[aria-modal="true"] #modal-title') !== null,
      speed: window.__capital.getState().time.speed,
      lens: document.querySelector('[data-lens][aria-pressed="true"]')?.getAttribute('data-lens') ?? null,
      onScreen: document.activeElement?.closest('[data-fake-decision]') !== null,
    }));
    await tap(pp, 'a');
    const calm = await beneath();
    const pressedOnDecision = [];
    for (const name of ['rb', 'lb', 'menu', 'y', 'x', 'view', 'b']) {
      await tap(pp, name);
      pressedOnDecision.push({ name, ...(await beneath()) });
    }
    await pp.evaluate(() => document.querySelector('[data-fake-decision]')?.remove());
    await frames(pp, 2);
    check('Karar ekranında şerit B\'yi "Kapat" diye göstermiyor; A ve yön tuşu yerinde',
      decision?.layer === 'decision' && !decision.glyphs.includes('B') && decision.glyphs.includes('A') && decision.glyphs.includes('✚'), JSON.stringify(decision));
    const stirred = pressedOnDecision.filter((after) => after.panel || after.speed !== calm.speed || after.lens !== calm.lens || !after.onScreen);
    check('Karar ekranında LB/RB, ☰, Y, X, ⧉ ve B bir şey yapmıyor: altta panel açılmıyor, oyun ve görünüm aynı, odak ekranda',
      calm.onScreen && !calm.panel && stirred.length === 0, JSON.stringify({ calm, stirred }));

    // Görünüm: sonraki lens.
    const lens = () => pp.evaluate(() => document.querySelector('[data-lens][aria-pressed="true"]')?.getAttribute('data-lens') ?? null);
    const lens0 = await lens();
    await tap(pp, 'view');
    check('Görünüm düğmesi sonraki lense geçiyor', (await lens()) !== lens0, `${lens0} → ${await lens()}`);

    // İpucu şeridi panellerin üstüne binmiyor (HUD altta ona yer ayırıyor).
    const overlap = await pp.evaluate(() => {
      const bar = document.querySelector('.pad-hints').getBoundingClientRect();
      return ['.news', '.leftcol', '.inspector', '.topbar'].filter((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r && r.width > 0 && Math.min(r.right, bar.right) - Math.max(r.left, bar.left) > 1 && Math.min(r.bottom, bar.bottom) - Math.max(r.top, bar.top) > 1;
      });
    });
    check('İpucu şeridi panellerin üstüne binmiyor', overlap.length === 0, overlap.join(', ') || 'boş');
    await pp.screenshot({ path: `${OUT}/pad-1280x800.png` });

    // Sony kumandası: düğme yazıları şekil.
    await pp.evaluate((id) => window.__fakePad.rename(id), SONY);
    await tap(pp, 'up');
    await tap(pp, 'b');
    const sony = await hints(pp);
    check('DualSense\'te düğme yazıları ✕ ○ □ △', sony?.glyphs.includes('✕') && !sony.glyphs.includes('A'), sony?.glyphs.join(' '));

    // Nintendo kumandası (Steam Input'suz): eylemler bütün kumandalarda konuma göre; yazılar
    // Nintendo'nun, alttaki B, sağdaki A. Xbox'ın renkleri yok (Codex #102).
    await pp.evaluate((id) => window.__fakePad.rename(id), NINTENDO);
    await tap(pp, 'up');
    await tap(pp, 'b');
    const nintendo = await hints(pp);
    const pickColor = await pp.evaluate(() => getComputedStyle(document.querySelector('.pad-hints .pad-glyph[data-button="a"]')).backgroundColor);
    await pp.evaluate((id) => window.__fakePad.rename(id), XBOX);
    check('Nintendo kumandasında yazılar konuma göre: seç alttaki B, paneller L R, Ayarlar +; Xbox renkleri yok',
      nintendo?.layer === 'map' && nintendo.glyphs[0] === 'B' && nintendo.glyphs.includes('L R') && nintendo.glyphs.includes('+') && pickColor !== 'rgb(31, 143, 58)',
      `${nintendo?.glyphs.join(' ')} · ${pickColor}`);

    // Fare oynayınca ipuçları ve nişangâh kalkıyor.
    await pp.mouse.move(400, 300);
    await pp.mouse.move(420, 320);
    const pointer = await pp.evaluate(() => ({ input: document.documentElement.dataset.input, hints: getComputedStyle(document.querySelector('.pad-hints')).display, reticle: getComputedStyle(document.querySelector('.map-reticle')).display }));
    check('Fare oynayınca kip fareye dönüyor: ipuçları ve nişangâh kalkıyor', pointer.input === 'pointer' && pointer.hints === 'none' && pointer.reticle === 'none', JSON.stringify(pointer));

    // Standart düzende olmayan kumanda okunmuyor (düğme sırası belli değil); kumanda
    // çıkarılınca ipuçları ve kumanda kipi kalkıyor (Codex #102).
    const lensNow = () => pp.evaluate(() => document.querySelector('[data-lens][aria-pressed="true"]')?.getAttribute('data-lens') ?? null);
    const inputNow = () => pp.evaluate(() => ({ input: document.documentElement.dataset.input, hints: getComputedStyle(document.querySelector('.pad-hints')).display }));
    await tap(pp, 'up');
    const padBefore = (await inputNow()).input;
    await pp.evaluate(() => window.__fakePad.remap(''));
    const lensBefore = await lensNow();
    await tap(pp, 'view');
    const odd = { lens: await lensNow(), ...(await inputNow()) };
    check('Standart düzende olmayan kumanda okunmuyor: düğmesi bir şey yapmıyor, kumanda kipi kalkıyor',
      padBefore === 'pad' && odd.lens === lensBefore && odd.input === 'pointer' && odd.hints === 'none', JSON.stringify({ padBefore, lensBefore, ...odd }));
    await pp.evaluate(() => window.__fakePad.remap('standard'));
    await tap(pp, 'up');
    const replugged = await inputNow();
    await pp.evaluate(() => { window.__fakePad.connected = false; });
    await frames(pp, 3);
    const unplugged = await inputNow();
    check('Kumanda çıkarılınca ipuçları ve kumanda kipi kalkıyor', replugged.input === 'pad' && unplugged.input === 'pointer' && unplugged.hints === 'none', JSON.stringify({ replugged, unplugged }));
    await pContext.close();

    // Ayarlar kumandadan önce açıktı: kumandaya uzanınca liste kapatıp açmadan geliyor,
    // başka kumandaya geçince düğme yazıları da değişiyor (Codex #102). Ayrı bağlam: kayıt yok, kurulum ekranı.
    const sContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await sContext.addInitScript(veteran, TUTORIAL_KEY);
    await sContext.addInitScript(fakePad, XBOX);
    const sp2 = await sContext.newPage();
    sp2.on('pageerror', (e) => pErrors.push(e.message));
    sp2.on('console', (m) => { if (m.type() === 'error') pErrors.push(m.text()); });
    await sp2.goto('http://127.0.0.1:8811/?lang=tr');
    await sp2.waitForSelector('.newgame', { timeout: 20000 });
    await sp2.locator('[data-settings-open]').click();
    await sp2.waitForSelector('.settings', { timeout: 5000 });
    const listBefore = await sp2.locator('[data-pad-controls]').count();
    await sp2.evaluate(() => { window.__fakePad.connected = true; window.dispatchEvent(new Event('gamepadconnected')); });
    await sp2.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/pad-[\w-]+\.js/.test(r.name)), null, { timeout: 10000 }).catch(() => {});
    await frames(sp2, 3);
    const padKeys = (glyph) => sp2.waitForFunction((g) => [...document.querySelectorAll('[data-pad-controls] kbd')].some((k) => k.textContent === g), glyph, { timeout: 10000 })
      .catch(() => {})
      .then(() => sp2.evaluate(() => [...document.querySelectorAll('[data-pad-controls] kbd')].map((k) => k.textContent)));
    await tap(sp2, 'down');
    const xboxKeys = await padKeys('A');
    await sp2.evaluate((id) => window.__fakePad.rename(id), SONY);
    await tap(sp2, 'down');
    const sonyKeys = await padKeys('✕');
    check('Ayarlar kumandadan önce açıktı: kumanda kullanılınca listesi kapatıp açmadan geliyor, kumanda değişince yazıları da',
      listBefore === 0 && xboxKeys.includes('A') && sonyKeys.includes('✕') && !sonyKeys.includes('A'), JSON.stringify({ listBefore, xboxKeys, sonyKeys }));
    await sContext.close();

    // Açılır bölüm (`<details>`): yön tuşu başlığına gidiyor, A açıyor, içine iniliyor. Senaryo
    // kurulumundaki "Senaryo ekle" böyle, editörün JSON bölümü de (Codex #102).
    const dContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await dContext.addInitScript(veteran, TUTORIAL_KEY);
    await dContext.addInitScript(fakePad, XBOX);
    const dp = await dContext.newPage();
    dp.on('pageerror', (e) => pErrors.push(e.message));
    dp.on('console', (m) => { if (m.type() === 'error') pErrors.push(m.text()); });
    await dp.goto('http://127.0.0.1:8811/?lang=tr');
    await dp.waitForSelector('.newgame', { timeout: 20000 });
    await dp.locator('[data-mode="scenario"]').click();
    await dp.waitForSelector('[data-pack-add] > summary', { timeout: 20000 });
    await dp.evaluate(() => { window.__fakePad.connected = true; window.dispatchEvent(new Event('gamepadconnected')); });
    await dp.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/pad-[\w-]+\.js/.test(r.name)), null, { timeout: 10000 }).catch(() => {});
    await frames(dp, 3);
    await dp.evaluate(() => document.querySelector('[data-newgame-start]')?.focus());
    const onSummary = () => dp.evaluate(() => document.activeElement?.matches('[data-pack-add] > summary') ?? false);
    const climb = [];
    for (let i = 0; i < 8 && !(await onSummary()); i++) {
      await tap(dp, 'up');
      climb.push(await dp.evaluate(() => (document.activeElement?.textContent ?? '').trim().slice(0, 24)));
    }
    const reachedSummary = await onSummary();
    await tap(dp, 'a');
    const opened = await dp.evaluate(() => document.querySelector('[data-pack-add]')?.open ?? false);
    await tap(dp, 'down');
    const inside = await dp.evaluate(() => document.activeElement?.hasAttribute('data-pack-input') ?? false);
    check('Açılır bölümün başlığına yön tuşuyla gidiliyor, A açıyor, içine iniliyor ("Senaryo ekle")',
      reachedSummary && opened && inside, JSON.stringify({ climb, reachedSummary, opened, inside }));
    await dContext.close();
    check('Kumandayla oyun: konsol temiz', pErrors.length === 0, pErrors.slice(0, 2).join(' | '));

    // ---------------------------------------------------------- klavye
    const kContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await kContext.addInitScript(veteran, TUTORIAL_KEY);
    const kp = await kContext.newPage();
    const kErrors = [];
    kp.on('pageerror', (e) => kErrors.push(e.message));
    kp.on('console', (m) => { if (m.type() === 'error') kErrors.push(m.text()); });
    await kp.goto('http://127.0.0.1:8811/?lang=tr');
    await kp.waitForSelector('.newgame', { timeout: 20000 });
    let tabs = 0;
    while (tabs < 60 && !(await active(kp)).start) {
      await kp.keyboard.press('Tab');
      tabs++;
    }
    await kp.keyboard.press('Enter');
    await start(kp);
    check('Kurulum yalnız klavyeyle bitiyor (Tab ile "Şirketi kur", Enter)', (await kp.locator('.topbar').count()) === 1, `${tabs} Tab`);

    const kPlot = await buyable(kp);
    await centerOn(kp, kPlot);
    await kp.keyboard.press('Enter');
    await frames(kp, 4);
    const kPicked = await kp.evaluate(() => window.__capital.selectedTile());
    const kFocus = await active(kp);
    const kMode = await kp.evaluate(() => ({ input: document.documentElement.dataset.input, reticle: getComputedStyle(document.querySelector('.map-reticle')).display }));
    check('Enter ortadaki parseli seçiyor; odak detayda, nişangâh görünüyor', kPicked === kPlot && kFocus.tag === 'aside' && kMode.input === 'keyboard' && kMode.reticle !== 'none',
      `${kPicked} / ${kPlot} · ${JSON.stringify({ kFocus, kMode })}`);
    // Tab detayın içine: kapat, sonra satın al.
    let buy = false;
    for (let i = 0; i < 4 && !buy; i++) {
      await kp.keyboard.press('Tab');
      buy = (await active(kp)).text.startsWith('Parseli satın al');
    }
    await kp.keyboard.press('Enter');
    await frames(kp, 4);
    const kBought = await kp.evaluate((id) => { const s = window.__capital.getState(); return s.map.tiles[id].ownerId === s.playerCompanyId; }, kPlot);
    check('Tab detayın düğmelerine giriyor, Enter satın alıyor', buy && kBought);
    await kp.keyboard.press('Escape');
    const kBlur = await active(kp);
    await kp.keyboard.press('Escape');
    const kDeselect = await kp.evaluate(() => window.__capital.selectedTile());
    check('Escape önce odağı haritaya veriyor, sonra seçimi bırakıyor', kBlur.tag === 'body' && kDeselect === null, `${kBlur.tag} · ${kDeselect}`);

    // Yerleştirme: yapı kartında Enter, haritada Enter.
    await kp.evaluate((id) => window.__capital.selectTile(id), kPlot);
    await frames(kp, 3);
    await kp.evaluate(() => document.querySelector('.leftcol .buildcard:not([disabled]):not(.locked)')?.focus());
    await kp.keyboard.press('Enter');
    await frames(kp, 3);
    const kPlacing = await active(kp);
    await centerOn(kp, kPlot);
    await kp.keyboard.press('Enter');
    await frames(kp, 6);
    const kBuilt = await kp.evaluate((id) => window.__capital.getState().map.tiles[id].buildingId ?? null, kPlot);
    check('Yapı kartında Enter yerleştirmeyi açıyor (odak haritaya), haritada Enter ortadaki parsele kuruyor', kPlacing.tag === 'body' && kBuilt !== null, `${kPlacing.tag} · ${kBuilt}`);
    await kp.keyboard.press('Escape');
    await kp.keyboard.press('Escape');

    // Kamera: Q/E döndür, +/− yakınlaş, WASD kaydır.
    const kCamera = () => kp.evaluate(() => ({ ...window.__capital.cameraPose(), ...window.__capital.cameraTarget() }));
    const hold = async (code) => {
      await kp.keyboard.down(code);
      await frames(kp, 5);
      await kp.keyboard.up(code);
      await frames(kp, 2);
    };
    const k0 = await kCamera();
    await hold('KeyQ');
    const k1 = await kCamera();
    await hold('Minus');
    const k2 = await kCamera();
    await hold('Equal');
    await hold('Equal');
    const k3 = await kCamera();
    await hold('KeyD');
    const k4 = await kCamera();
    check('Q/E döndürüyor, +/− yakınlaştırıyor, WASD kaydırıyor',
      Math.abs(k1.azimuth - k0.azimuth) > 0.2 && k2.distance > k1.distance && k3.distance < k2.distance && Math.hypot(k4.x - k3.x, k4.z - k3.z) > 0.3,
      [k0, k1, k2, k3, k4].map((k) => `${k.azimuth.toFixed(2)}/${k.distance.toFixed(1)}/${k.x.toFixed(1)},${k.z.toFixed(1)}`).join(' → '));
    check('Klavyeyle oyun: konsol temiz', kErrors.length === 0, kErrors.slice(0, 2).join(' | '));
    await kContext.close();
  }

  section('Steam: Workshop ve skor tabloları');
  {
    /*
     * Masaüstü paketi (Tur 73) sahte bir kabukla: `window.__TAURI__`'nin
     * komutları bellekte, Steam açık. Abone olunan paket rafta salt okunur,
     * oyuncunun paketi Workshop'a yükleniyor, lig panelinde Steam
     * arkadaşları, lig puanı Steam'in tablosuna da gidiyor. Gerçek Steam'le
     * deneme: `docs/STEAM.md`.
     *
     * Paket her koşuda yeniden derleniyor (eski kodu sınamasın); elde
     * derlenmiş paketle `DESKTOP_DIST=apps/web/dist-desktop`.
     */
    const desktopRoot = process.env.DESKTOP_DIST
      ? path.resolve(process.env.DESKTOP_DIST)
      : await new Promise((resolve, reject) => {
          const child = spawn('pnpm', ['--filter', '@capital/web', 'build:desktop'], { stdio: ['ignore', 'ignore', 'pipe'] });
          let errors = '';
          child.stderr.on('data', (chunk) => { errors += chunk; });
          child.on('exit', (code) => (code === 0 ? resolve(new URL('../apps/web/dist-desktop', import.meta.url).pathname) : reject(new Error(`build:desktop ${code}: ${errors.slice(-2000)}`))));
        });
    const desktopServer = http.createServer((req, res) => {
      const bare = req.url.split('?')[0];
      const file = path.join(desktopRoot, bare === '/' ? '/index.html' : bare);
      if (!file.startsWith(desktopRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('nf');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => desktopServer.listen(8812, resolve));

    const sContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await sContext.addInitScript(veteran, TUTORIAL_KEY);
    await sContext.addInitScript(({ pack }) => {
      const calls = [];
      window.__steamCalls = calls;
      // Oturumdaki Steam hesabı; aynı bilgisayarda ikinci hesap bu anahtarla (Codex #103).
      const account = localStorage.getItem('__fakeSteamAccount') ?? '76561198000000001';
      // İndirilenler klasörüne yazılan dosyalar (Tur 74, hata raporu).
      const exports = [];
      window.__exports = exports;
      const second = JSON.stringify({ ...JSON.parse(pack), id: 'ikinci-kis', name: { tr: 'İkinci kış', en: 'Second winter' } });
      const third = JSON.stringify({ ...JSON.parse(pack), id: 'ucuncu-kis', name: { tr: 'Üçüncü kış', en: 'Third winter' } });
      const handlers = {
        profile_read_all: () => ({}),
        profile_set: () => null,
        profile_remove: () => null,
        shell_info: () => ({ deck: false }),
        fullscreen_toggle: () => false,
        save_list: () => [],
        save_read: () => null,
        save_write: () => null,
        save_remove: () => null,
        export_file: () => 'x',
        quit: () => null,
        // Geç bağlanan Steam (`__fakeSteamLate`, Codex #104): yanıt `__steamConnect()` çağrılınca.
        steam_status: () => {
          const status = { available: true, detail: 'sahte Steam', account };
          if (localStorage.getItem('__fakeSteamLate') !== '1') return status;
          return new Promise((resolve) => { window.__steamConnect = () => resolve(status); });
        },
        steam_unlock: () => null,
        steam_keyboard: () => false,
        // Bir öğe kurulu (iki dosyası var, biri bozuk), biri iniyor; `__workshopReady` olunca o da kurulu.
        // Steam katmanında abone olunan öğe (`__workshopSubscribed`) hemen kurulu, inen yok (Bugbot #103).
        steam_workshop_list: () => {
          if (!window.__workshopReady) return { items: [{ id: '7001', packs: [pack, '{bozuk'] }], downloading: 1 };
          const items = [{ id: '7001', packs: [pack, '{bozuk'] }, { id: '7002', packs: [second] }];
          if (window.__workshopSubscribed) items.push({ id: '7003', packs: [third] });
          return { items, downloading: 0 };
        },
        // Birinci hesapta yeni öğe açılıyor ama paket gitmiyor (Codex #103): kimlik yine
        // dönüyor. Oyuncu sözleşmeyi Steam'de açana kadar kabul etmemiş. İkinci hesabın
        // ilk yüklemesi tamam.
        steam_workshop_publish: ({ request }) => {
          const reply = () => {
            if (request.item) return { id: request.item, agreement: !window.__workshopAgreed };
            return account === '76561198000000001'
              ? { id: '9001', agreement: true, failed: 'yüklenemedi: Steam yanıt vermedi' }
              : { id: '9002', agreement: false };
          };
          // Yavaş yükleme (`__workshopSlow`, Codex #103): yanıt 1,5 sn sonra.
          return window.__workshopSlow ? new Promise((resolve) => setTimeout(() => resolve(reply()), 1500)) : reply();
        },
        steam_workshop_open: ({ target }) => {
          if (target === 'agreement') window.__workshopAgreed = true;
          return true;
        },
        steam_leaderboard_upload: ({ score }) => ({ score: Math.round(score), changed: true, rank: 7 }),
        steam_leaderboard_friends: () => [
          { name: 'Ada', score: 1, rank: 9, me: false },
          { name: 'Deniz', score: 2_500_000, rank: 3, me: false },
          { name: 'Oyuncu', score: 2_000_000, rank: 7, me: true },
        ],
      };
      window.__TAURI__ = {
        core: {
          invoke: async (command, args, options) => {
            if (command.startsWith('steam_')) calls.push([command, args ?? null]);
            if (command === 'export_file') exports.push({ filename: options?.headers?.filename ?? '', text: new TextDecoder().decode(args) });
            const handler = handlers[command];
            if (!handler) throw new Error(`sahte kabukta yok: ${command}`);
            return handler(args ?? {});
          },
        },
        event: { listen: async () => () => undefined },
      };
    }, { pack: fs.readFileSync(new URL('../docs/ornek-paket.json', import.meta.url), 'utf8') });
    const sp = await sContext.newPage();
    const sErrors = [];
    sp.on('pageerror', (e) => sErrors.push(e.message));
    sp.on('console', (m) => { if (m.type() === 'error') sErrors.push(m.text()); });
    const calls = (prefix) => sp.evaluate((p) => window.__steamCalls.filter(([command]) => command.startsWith(p)), prefix);

    await sp.goto('http://127.0.0.1:8812/');
    await sp.waitForSelector('.newgame', { timeout: 30000 });
    check('Masaüstü paketi sahte kabukla açılıyor; Steam açık', (await sp.evaluate(() => document.documentElement.dataset.shell)) === 'desktop'
      && (await calls('steam_status')).length === 1);

    // Sürüm (Tur 74): Ayarlar'da "masaüstü, Steam"; hata raporu İndirilenler'e, e-posta bağlantısı yok (pencere açamıyor), adres kopyalanıyor.
    await sp.locator('[data-settings-open]').click();
    await sp.waitForSelector('.settings-overlay [data-app-version]', { timeout: 5000 });
    const versionLine = ((await sp.locator('.settings-overlay [data-app-version]').textContent()) ?? '').trim();
    await sp.locator('.settings-overlay [data-settings-page-open="report"]').click();
    await sp.waitForSelector('[data-bug-report] [data-report-save-state="none"]', { timeout: 10000 }).catch(() => null);
    await sp.locator('[data-report-download]').click();
    await sp.waitForFunction(() => /İndirilenler/.test(document.querySelector('[data-report-notice]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => null);
    const desk = await sp.evaluate(() => ({
      email: document.querySelectorAll('[data-report-email]').length,
      copy: document.querySelectorAll('[data-report-copy-address]').length,
      notice: document.querySelector('[data-report-notice]')?.textContent ?? '',
      exports: window.__exports.map((file) => ({ filename: file.filename, report: (() => { try { return JSON.parse(file.text); } catch { return null; } })() })),
    }));
    const deskReport = desk.exports[0]?.report;
    check('Masaüstünde sürüm "masaüstü, Steam"; hata raporu İndirilenler klasörüne, raporda Steam; e-posta bağlantısı yok, adres kopyalanıyor',
      /^CapitalForge \d+\.\d+\.\d+ · masaüstü, Steam$/.test(versionLine) && desk.email === 0 && desk.copy === 1
        && /^Rapor İndirilenler klasöründe: capitalforge-hata-raporu-[\d-]+\.json\./.test(desk.notice)
        && desk.exports.length === 1 && /^capitalforge-hata-raporu-[\d-]+\.json$/.test(desk.exports[0].filename)
        && deskReport?.app?.edition === 'steam' && deskReport?.save === null,
      `${versionLine} · ${JSON.stringify({ ...desk, exports: desk.exports.map((file) => `${file.filename}:${file.report?.app?.edition}`) })}`);
    // Alt sayfada Escape önce Ayarlar'a dönüyor (Tur 75), ikincisi pencereyi kapatıyor.
    await sp.keyboard.press('Escape');
    await sp.waitForSelector('.settings-overlay [data-settings-page]', { state: 'detached', timeout: 5000 }).catch(() => null);
    await sp.keyboard.press('Escape');
    await sp.waitForSelector('.settings-overlay', { state: 'detached', timeout: 5000 }).catch(() => null);

    // Steam geç bağlanıyor (Codex #104): açılış onu beklemiyor. Ayarlar ya da hata raporu
    // açıkken bağlanınca sürüm satırı ve rapor Steam'i biliyor, panel kapanıp açılmadan.
    // Ayrı sekmede; yerel depo ortak, bayrak sonunda kalkıyor.
    await sp.evaluate(() => localStorage.setItem('__fakeSteamLate', '1'));
    const lp = await sContext.newPage();
    lp.on('pageerror', (e) => sErrors.push(e.message));
    lp.on('console', (m) => { if (m.type() === 'error') sErrors.push(m.text()); });
    const lateSettings = async () => {
      await lp.waitForSelector('.newgame', { timeout: 30000 });
      await lp.waitForFunction(() => typeof window.__steamConnect === 'function', null, { timeout: 10000 });
      await lp.locator('[data-settings-open]').click();
      await lp.waitForSelector('.settings-overlay [data-app-version]', { timeout: 5000 });
    };
    const lateLine = () => lp.evaluate(() => (document.querySelector('.settings-overlay [data-app-version]')?.textContent ?? '').trim());
    await lp.goto('http://127.0.0.1:8812/');
    await lateSettings();
    const lineBefore = await lateLine();
    await lp.evaluate(() => window.__steamConnect());
    await lp.waitForFunction(() => /, Steam$/.test((document.querySelector('.settings-overlay [data-app-version]')?.textContent ?? '').trim()), null, { timeout: 5000 }).catch(() => null);
    const lineAfter = await lateLine();
    check('Steam Ayarlar açıkken bağlanınca sürüm satırı "masaüstü"nden "masaüstü, Steam"e geçiyor (Codex #104)',
      /^CapitalForge \d+\.\d+\.\d+ · masaüstü$/.test(lineBefore) && /^CapitalForge \d+\.\d+\.\d+ · masaüstü, Steam$/.test(lineAfter),
      `${lineBefore} → ${lineAfter}`);
    await lp.reload();
    await lateSettings();
    await lp.locator('.settings-overlay [data-settings-page-open="report"]').click();
    await lp.waitForSelector('[data-bug-report] [data-report-save-state="none"]', { timeout: 10000 }).catch(() => null);
    const previewEdition = () => lp.evaluate(() => /"edition": "(\w+)"/.exec(document.querySelector('[data-report-preview] pre')?.textContent ?? '')?.[1] ?? null);
    const editionBefore = await previewEdition();
    await lp.evaluate(() => window.__steamConnect());
    await lp.waitForFunction(() => /"edition": "steam"/.test(document.querySelector('[data-report-preview] pre')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    await lp.locator('[data-report-download]').click();
    await lp.waitForFunction(() => window.__exports.length > 0, null, { timeout: 10000 }).catch(() => null);
    const lateReport = await lp.evaluate(() => { try { return JSON.parse(window.__exports[0]?.text ?? 'null'); } catch { return null; } });
    check('Hata raporu açıkken Steam bağlanınca rapor "steam" diyor (Codex #104)',
      editionBefore === 'desktop' && lateReport?.app?.edition === 'steam',
      `${editionBefore} → ${lateReport?.app?.edition}`);
    await lp.close();
    await sp.evaluate(() => localStorage.removeItem('__fakeSteamLate'));

    // Raf: abone olunan öğenin paketi Workshop künyesiyle; bozuk dosya atlandı, inen öğe yazıyor.
    await sp.locator('.mode-picker [data-mode="scenario"]').click();
    await sp.waitForSelector('[data-pack-workshop="7001"]', { timeout: 10000 }).catch(() => null);
    const shelf = await sp.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-pack-workshop="7001"] [data-scenario]')].map((el) => el.getAttribute('data-scenario')),
      note: document.querySelector('[data-pack-workshop="7001"] .scenario-card-source')?.textContent ?? '',
      count: document.querySelector('[data-pack-shelf]')?.getAttribute('data-pack-shelf'),
      downloading: document.querySelector('[data-pack-downloading]')?.textContent ?? '',
      browse: document.querySelector('[data-pack-workshop-browse]')?.textContent ?? '',
    }));
    check('Workshop paketi rafta: iki senaryosu "Workshop: Zor kış" künyesiyle; bozuk dosya atlandı; inen öğe yazıyor; "Workshop\'a göz at"',
      shelf.cards.join() === 'zor-kis/kista-kurtarma,zor-kis/karanlik-ve-pahali' && shelf.note === 'Workshop: Zor kış' && shelf.count === '2'
        && /1 öğe iniyor/.test(shelf.downloading) && /göz at/.test(shelf.browse),
      JSON.stringify(shelf));
    // Steam inen öğeyi bitirince raf kendiliğinden yenileniyor; pencere odakta kalıyor, odak olayı yok (Codex #103).
    await sp.evaluate(() => { window.__workshopReady = true; });
    await sp.waitForSelector('[data-pack-workshop="7002"]', { timeout: 12000 }).catch(() => null);
    const polled = await sp.evaluate(() => ({
      cards: document.querySelectorAll('[data-pack-workshop="7002"] [data-scenario]').length,
      note: document.querySelector('[data-pack-workshop="7002"] .scenario-card-source')?.textContent ?? '',
      downloading: document.querySelectorAll('[data-pack-downloading]').length,
    }));
    const listed = (await calls('steam_workshop_list')).length;
    await sp.waitForTimeout(5600);
    const listedLater = (await calls('steam_workshop_list')).length;
    check('İnen öğe bitince raf kendiliğinden yenileniyor (odak olayı olmadan); "iniyor" notu kalkıyor, liste istemek de duruyor',
      polled.cards === 2 && polled.note === 'Workshop: İkinci kış' && polled.downloading === 0 && listedLater === listed,
      `${JSON.stringify(polled)} · liste ${listed} → ${listedLater}`);
    await sp.locator('[data-pack-workshop-browse]').click();
    // Oyuncu Steam katmanında bir öğeye abone oluyor (Bugbot #103): Steam onu hemen kuruyor, inen öğe
    // yok; katman pencerenin odağını almadığı için odak olayı da yok. Raf, sayfa açıldığından yokluyor.
    await sp.evaluate(() => { window.__workshopSubscribed = true; });
    const subscribed = await sp.waitForSelector('[data-pack-workshop="7003"]', { timeout: 12000 }).then(() => true).catch(() => false);
    check('Steam katmanında abone olunan öğe rafa geliyor: inen öğe ve odak olayı yok, Workshop sayfası açıldıktan sonra',
      subscribed, `${(await calls('steam_workshop_list')).length} liste`);
    await sp.locator('[data-pack-workshop="7001"] [data-scenario]').first().click();
    await sp.waitForSelector('[data-pack-actions] [data-pack-workshop-open]', { timeout: 5000 }).catch(() => null);
    const shop = await sp.evaluate(() => ({
      open: document.querySelectorAll('[data-pack-actions] [data-pack-workshop-open]').length,
      note: document.querySelector('[data-pack-workshop-note]')?.textContent ?? '',
      remove: document.querySelectorAll('[data-pack-actions] [data-pack-remove]').length,
      publish: document.querySelectorAll('[data-pack-actions] [data-pack-publish]').length,
    }));
    check('Workshop paketinde "Steam\'de aç" ve abonelik notu; kaldırma ve yükleme yok',
      shop.open === 1 && /Aboneliği Steam'de bırakınca/.test(shop.note) && shop.remove === 0 && shop.publish === 0, JSON.stringify(shop));
    await sp.locator('[data-pack-actions] [data-pack-workshop-open]').click();
    await sp.waitForTimeout(200);
    const opened = (await calls('steam_workshop_open')).map(([, args]) => args.target);
    check('Steam\'de açılan sayfalar: oyunun Workshop\'u, sonra öğenin kendisi', opened.join() === 'workshop,7001', opened.join());

    // Oyuncunun kendi paketi: Workshop'a yükleme ve onay. İlk deneme yarıda kalıyor (öğe açıldı,
    // paket gitmedi): kimlik saklanıyor, yeniden deneme aynı öğeyi güncelliyor (Codex #103). Sonra sözleşme.
    await sp.locator('[data-pack-add] summary').click();
    await sp.locator('[data-pack-example]').click();
    await sp.locator('[data-pack-submit]').click();
    await sp.waitForSelector('[data-pack-actions] [data-pack-publish="new"]', { timeout: 10000 }).catch(() => null);
    const ownName = await sp.evaluate(() => document.querySelector('.scenario-card.selected .scenario-card-title')?.textContent ?? '');
    await sp.locator('[data-pack-actions] [data-pack-publish="new"]').click();
    const confirm = (await sp.locator('[data-pack-actions] .pack-confirm').textContent().catch(() => '')) ?? '';
    check('Yüklemeden önce onay: herkese açık, yazar Steam adı', /herkese açık yayımlansın mı/.test(confirm) && /Steam'deki adın/.test(confirm), confirm.slice(0, 120));
    await sp.locator('[data-pack-publish-yes]').click();
    /** n. yüklemenin yanıtı gelip duyuru kalıba uyana kadar. */
    const settled = (n, pattern) => sp.waitForFunction(({ n, source }) =>
      window.__steamCalls.filter(([command]) => command === 'steam_workshop_publish').length === n
        && new RegExp(source).test(document.querySelector('[data-pack-actions] [data-pack-notice]')?.textContent ?? ''), { n, source: pattern.source }, { timeout: 10000 }).catch(() => null);
    const shelfState = () => sp.evaluate(() => ({
      notice: document.querySelector('[data-pack-actions] [data-pack-notice]')?.textContent ?? '',
      agreement: document.querySelectorAll('[data-pack-workshop-agreement]').length,
      update: document.querySelectorAll('[data-pack-publish="update"]').length,
      stored: localStorage.getItem('capitalforge.workshop.v1'),
    }));
    await settled(1, /paket yüklenemedi/);
    const half = await shelfState();
    const [first] = (await calls('steam_workshop_publish')).map(([, args]) => args.request);
    const firstPack = first ? JSON.parse(first.pack) : null;
    check('İlk yükleme yarıda kalınca öğenin kimliği saklanıyor: düğme "güncelle", oyuncuya söyleniyor; istekte paketin kendisi, adı ve senaryo listesi',
      first && first.item === undefined && first.title === ownName && firstPack?.id === 'ornek' && first.description.startsWith(`• ${ownName} — `)
        && /açıldı ama paket yüklenemedi/.test(half.notice) && half.update === 1 && half.agreement === 0 && half.stored === '{"76561198000000001":{"ornek":"9001"}}',
      `${JSON.stringify({ ...first, pack: firstPack?.id })} · ${JSON.stringify(half)}`);
    await sp.locator('[data-pack-actions] [data-pack-publish="update"]').click();
    await sp.locator('[data-pack-publish-yes]').click();
    await settled(2, /güncellendi/);
    const retried = await shelfState();
    const second = (await calls('steam_workshop_publish')).map(([, args]) => args.request)[1];
    check('Yeniden deneyince aynı öğe güncelleniyor, yeni öğe açılmıyor; sözleşme uyarısı ve düğmesi',
      second?.item === '9001' && /güncellendi/.test(retried.notice) && /sözleşmesini kabul edene kadar/.test(retried.notice)
        && retried.agreement === 1 && retried.stored === '{"76561198000000001":{"ornek":"9001"}}',
      `${second?.item ?? 'yeni'} · ${JSON.stringify(retried)}`);
    await sp.locator('[data-pack-workshop-agreement]').click();
    await sp.locator('[data-pack-actions] [data-pack-publish="update"]').click();
    await sp.locator('[data-pack-publish-yes]').click();
    await settled(3, /güncellendi/);
    const requests = (await calls('steam_workshop_publish')).map(([, args]) => args.request);
    const targets = (await calls('steam_workshop_open')).map(([, args]) => args.target);
    const agreed = await shelfState();
    check('Sözleşme Steam\'de açılıyor; sonraki yükleme de aynı öğe, uyarı kalkmış',
      requests.length === 3 && requests[2].item === '9001' && targets.at(-1) === 'agreement'
        && /güncellendi/.test(agreed.notice) && !/sözleşmesini/.test(agreed.notice) && agreed.agreement === 0,
      `${requests.map((r) => r.item ?? 'yeni').join(',')} · ${targets.join(',')} · ${agreed.notice}`);
    await sp.screenshot({ path: `${OUT}/steam-workshop.png` });

    // Yükleme sürerken oyuncu başka bir senaryoya geçiyor (Codex #103): yanıt yükleyen paketin.
    // Yeni seçilen Workshop paketinin ekranına "güncellendi" ya da ikinci bir "Steam'de aç" yazılmıyor.
    await sp.evaluate(() => { window.__workshopSlow = true; });
    await sp.locator('[data-pack-actions] [data-pack-publish="update"]').click();
    await sp.locator('[data-pack-publish-yes]').click();
    await sp.locator('[data-pack-workshop="7002"] [data-scenario]').first().click();
    await sp.waitForFunction(() => window.__steamCalls.filter(([command]) => command === 'steam_workshop_publish').length === 4, null, { timeout: 5000 }).catch(() => null);
    await sp.waitForTimeout(2500);
    const switched = await sp.evaluate(() => ({
      notice: document.querySelector('[data-pack-actions] [data-pack-notice]')?.textContent ?? '',
      open: document.querySelectorAll('[data-pack-actions] [data-pack-workshop-open]').length,
      agreement: document.querySelectorAll('[data-pack-workshop-agreement]').length,
      stored: localStorage.getItem('capitalforge.workshop.v1'),
    }));
    await sp.evaluate(() => { window.__workshopSlow = false; });
    check('Yükleme sürerken başka senaryoya geçilince sonuç yeni seçilenin ekranına yazılmıyor; öğenin kimliği yine paketin',
      switched.notice === '' && switched.open === 1 && switched.agreement === 0 && switched.stored === '{"76561198000000001":{"ornek":"9001"}}',
      JSON.stringify(switched));

    // Aynı bilgisayarda başka bir Steam hesabı (Codex #103): paket aynı cihazda, öğesi
    // birincinin. Steam o öğenin güncellemesini reddederdi; ikinci hesap kendi öğesini açıyor.
    await sp.evaluate(() => localStorage.setItem('__fakeSteamAccount', '76561198000000002'));
    await sp.reload();
    await sp.waitForSelector('.newgame', { timeout: 30000 });
    await sp.locator('.mode-picker [data-mode="scenario"]').click();
    await sp.locator('[data-scenario^="ornek/"]').first().click();
    await sp.waitForSelector('[data-pack-actions] [data-pack-publish]', { timeout: 10000 }).catch(() => null);
    const otherButton = await sp.locator('[data-pack-actions] [data-pack-publish]').getAttribute('data-pack-publish').catch(() => null);
    await sp.locator('[data-pack-actions] [data-pack-publish]').click();
    await sp.locator('[data-pack-publish-yes]').click();
    await settled(1, /yayımlandı/);
    const other = await shelfState();
    const [otherRequest] = (await calls('steam_workshop_publish')).map(([, args]) => args.request);
    check('Aynı bilgisayarda başka bir Steam hesabı birincinin öğesini güncellemeye kalkmıyor: kendi öğesini açıyor, iki hesabın kaydı ayrı',
      otherButton === 'new' && otherRequest !== undefined && otherRequest.item === undefined && /yayımlandı/.test(other.notice) && other.update === 1
        && other.stored === '{"76561198000000001":{"ornek":"9001"},"76561198000000002":{"ornek":"9002"}}',
      `${otherButton} · ${otherRequest ? (otherRequest.item ?? 'yeni') : 'istek yok'} · ${JSON.stringify(other)}`);

    // Tohum Ligi: panelde Steam arkadaşları, bitince puan Steam'in tablosuna da.
    await sp.locator('.mode-picker [data-mode="league"]').click();
    await sp.fill('.newgame-field input[type="text"]', 'Steam Holding');
    await sp.locator('button:has-text("Şirketi kur")').click();
    await sp.waitForSelector('.topbar', { timeout: 30000 });
    const weekId = await sp.evaluate(() => window.__capital.getState().league.weekId);
    await sp.locator('.agenda [data-agenda="league"] button').first().click();
    await sp.waitForSelector('[data-league-table="steam"]', { timeout: 10000 }).catch(() => null);
    const friends = await sp.evaluate(() => ({
      state: document.querySelector('[data-league-steam]')?.getAttribute('data-league-steam'),
      title: document.querySelector('[data-league-steam] h3')?.textContent ?? '',
      rows: [...document.querySelectorAll('[data-league-row="steam"]')].map((row) => ({
        text: row.textContent ?? '',
        mine: row.classList.contains('mine'),
      })),
    }));
    check('Lig panelinde Steam arkadaşları: puan sırasıyla, oyuncu "(sen)" ve vurgulu; o haftanın tablosu',
      friends.state === '3' && friends.title === 'Steam arkadaşların' && /^1Deniz/.test(friends.rows[0]?.text ?? '') && /^2Oyuncu \(sen\)/.test(friends.rows[1]?.text ?? '')
        && friends.rows[1]?.mine === true && /^3Ada/.test(friends.rows[2]?.text ?? '')
        && (await calls('steam_leaderboard_friends')).every(([, args]) => args.weekId === weekId),
      `${JSON.stringify(friends)} · ${weekId}`);
    // Hamlesiz şirket batıyor (gönderilecek koşu yok): Tohum Ligi bölümündeki gibi bir dükkân.
    const score = await sp.evaluate(() => {
      const cap = window.__capital;
      const s = cap.getState();
      const tile = s.map.tiles.find((x) => {
        const d = s.districts[x.districtId];
        return x.kind === 'plot' && !x.ownerId && !x.structureId && (d.opensOnDay === undefined || d.opensOnDay <= s.time.day);
      });
      cap.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
      cap.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      let guard = 0;
      while (cap.getState().league.finishedDay === undefined && guard++ < 400) cap.engine.runDay();
      return cap.getState().league.outcome === 'lost' ? null : cap.getState().league.score;
    });
    await sp.waitForSelector('.league-result', { timeout: 10000 }).catch(() => null);
    await sp.locator('.league-result button:has-text("Tabloya")').click();
    await sp.waitForSelector('[data-league-steam-rank]', { timeout: 10000 }).catch(() => null);
    const uploads = (await calls('steam_leaderboard_upload')).map(([, args]) => args);
    const rankLine = (await sp.locator('[data-league-steam-rank]').textContent().catch(() => '')) ?? '';
    check('Lig koşusu gönderilince puan Steam\'in o haftaki tablosuna da gidiyor; sonuç ekranında Steam\'deki sırası',
      uploads.length === 1 && uploads[0].weekId === weekId && uploads[0].score === score && /7\. sıradasın/.test(rankLine),
      `${JSON.stringify(uploads)} · skor ${score} · ${rankLine}`);
    // Oyunun içinden başka bir koşu açılıyor (Codex #103): ekran yerinde kalıyor (`replaceState`).
    // Önceki koşunun Steam sırası ve gönderimi yok, bu koşu tabloya yeniden gönderilebiliyor.
    await sp.evaluate(() => {
      const cap = window.__capital;
      const next = structuredClone(cap.getState());
      next.meta.createdAtIso = new Date(Date.parse(next.meta.createdAtIso) + 60_000).toISOString();
      cap.engine.replaceState(next);
    });
    await sp.waitForTimeout(500);
    const otherRun = await sp.evaluate(() => {
      const button = document.querySelector('.league-result .primary');
      return {
        result: document.querySelectorAll('.league-result').length,
        rank: document.querySelectorAll('[data-league-steam-rank]').length,
        sent: document.querySelectorAll('[data-league-sent]').length,
        button: button ? { text: button.textContent, disabled: button.disabled } : null,
      };
    });
    check('Oyunun içinden başka bir koşu açılınca sonuç ekranı o koşunun: önceki Steam sırası ve gönderim yok, tabloya gönderilebiliyor',
      otherRun.result === 1 && otherRun.rank === 0 && otherRun.sent === 0 && otherRun.button?.disabled === false, JSON.stringify(otherRun));
    check('Steam bölümünde konsol temiz', sErrors.length === 0, sErrors.slice(0, 3).join(' | '));
    await sContext.close();
    desktopServer.close();
  }

  // ---------- Sürüm 1.0 (Tur 74) ----------
  // Yeni oyuncuya duyuru yok; eski sürümden gelende Ayarlar düğmesinde nokta,
  // Ayarlar'ın başında duyuru, "Yenilikler" açılınca kalkıyor. Hata raporu:
  // not, kayıt ve günlük; ön izleme, dosya, adres. Oyunun Türkçe sözlükleri
  // (komutlar, piyasalar, finans) oyun ekranıyla iniyor: panellerde ham anahtar yok.
  section('Sürüm 1.0: yenilikler, hata bildirme, sözlükler');
  {
    const appVersion = JSON.parse(fs.readFileSync(new URL('../apps/web/package.json', import.meta.url), 'utf8')).version;
    const WHATS_NEW_KEY = 'capitalforge.whatsnew.v1';
    const vErrors = [];
    const watch = (page) => {
      page.on('pageerror', (e) => vErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') vErrors.push(m.text()); });
    };

    // Yeni oyuncu: depoda hiçbir şey yok.
    const nContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const np = await nContext.newPage();
    watch(np);
    await np.goto('http://127.0.0.1:8811/');
    await np.waitForSelector('.newgame', { timeout: 20000 });
    const fresh = await np.evaluate((key) => ({
      marked: document.querySelector('[data-settings-open]')?.hasAttribute('data-whats-new') ?? null,
      stored: localStorage.getItem(key),
    }), WHATS_NEW_KEY);
    await np.locator('[data-settings-open]').click();
    await np.waitForSelector('.settings-overlay [data-settings-version]', { timeout: 5000 });
    const freshSettings = await np.evaluate(() => ({
      banner: document.querySelectorAll('[data-whats-new-banner]').length,
      line: (document.querySelector('[data-app-version]')?.textContent ?? '').trim(),
    }));
    check(`Yeni oyuncuya duyuru yok: Ayarlar'da nokta yok, sürüm görülmüş sayılıyor; sürüm bölümü "CapitalForge ${appVersion} · tarayıcı"`,
      fresh.marked === false && fresh.stored === appVersion && freshSettings.banner === 0 && freshSettings.line === `CapitalForge ${appVersion} · tarayıcı`,
      `${JSON.stringify(fresh)} · ${JSON.stringify(freshSettings)}`);
    await nContext.close();

    // Eski sürümden gelen oyuncu: rehberi görmüş, "Yenilikler" işareti hiç yok (işaret 1.0'la geldi).
    const rContext = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    await rContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8811' });
    await rContext.addInitScript((key) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ seen: true, games: {} }));
    }, TUTORIAL_KEY);
    const rp = await rContext.newPage();
    watch(rp);
    await rp.goto('http://127.0.0.1:8811/');
    await rp.waitForSelector('.newgame', { timeout: 20000 });
    const marked = await rp.evaluate(() => {
      const button = document.querySelector('[data-settings-open]');
      return { dots: button?.querySelectorAll('.whats-new-dot').length ?? 0, label: button?.getAttribute('aria-label') ?? '' };
    });
    await rp.locator('[data-settings-open]').click();
    await rp.waitForSelector('.settings-overlay [data-whats-new-banner]', { timeout: 5000 }).catch(() => null);
    const banner = await rp.evaluate(() => ({
      text: document.querySelector('[data-whats-new-banner] span')?.textContent ?? '',
      dots: document.querySelectorAll('.settings-overlay .whats-new-dot').length,
    }));
    check("Eski sürümden gelen oyuncu: Ayarlar düğmesinde nokta (\"yeni sürüm\"), Ayarlar'ın başında duyuru, \"Yenilikler\"de nokta",
      marked.dots === 1 && marked.label === 'Ayarlar (yeni sürüm)' && banner.text === `Oyun ${appVersion} sürümüne güncellendi.` && banner.dots === 1,
      `${JSON.stringify(marked)} · ${JSON.stringify(banner)}`);
    await rp.locator('[data-whats-new-banner] button').click();
    await rp.waitForSelector('[data-whats-new] [data-release]', { timeout: 10000 }).catch(() => null);
    const notes = await rp.evaluate(() => ({
      releases: [...document.querySelectorAll('[data-whats-new] [data-release]')].map((el) => el.getAttribute('data-release')),
      items: document.querySelector('[data-whats-new] [data-release]')?.querySelectorAll('li').length ?? 0,
      current: document.querySelector('[data-whats-new] .whats-new-current')?.textContent ?? '',
      heading: document.querySelector('[data-whats-new] h4')?.textContent ?? '',
      focus: document.activeElement?.hasAttribute('data-settings-back') ?? false,
    }));
    await rp.screenshot({ path: `${OUT}/surum-yenilikler.png` });
    // Eski sürümler de listede, en yenisi başta (1.0.1, Tur 75: ilk yama).
    check('"Yenilikler": en yeni sürüm başta, günüyle ve maddeleriyle, eskiler altında; "oynadığın sürüm"; odak geri düğmesinde',
      notes.releases[0] === appVersion && notes.releases.includes('1.0.0') && notes.items >= 1 && notes.current === 'oynadığın sürüm'
        && notes.heading.startsWith(`Sürüm ${appVersion} · `) && /\d{4}/.test(notes.heading) && notes.focus,
      JSON.stringify(notes));
    await rp.locator('[data-settings-back]').click();
    await rp.waitForSelector('.settings-overlay [data-settings-version]', { timeout: 5000 });
    const seen = await rp.evaluate((key) => ({
      banner: document.querySelectorAll('[data-whats-new-banner]').length,
      dots: document.querySelectorAll('.whats-new-dot').length,
      focus: document.activeElement?.getAttribute('data-settings-page-open') ?? '',
      stored: localStorage.getItem(key),
    }), WHATS_NEW_KEY);
    check('Geri dönünce duyuru ve noktalar kalkmış, odak "Yenilikler" düğmesinde; görülen sürüm cihazda',
      seen.banner === 0 && seen.dots === 0 && seen.focus === 'whatsNew' && seen.stored === appVersion, JSON.stringify(seen));
    await rp.keyboard.press('Escape');
    await rp.reload();
    await rp.waitForSelector('.newgame', { timeout: 20000 });
    check('Sayfa yenilenince nokta yok', (await rp.locator('[data-settings-open] .whats-new-dot').count()) === 0);

    // Hata bildir, oyunun içinden: kayıt o anki durum, günlükte oyunun uyarısı.
    await rp.fill('.newgame-field input[type="text"]', 'Rapor Holding');
    await rp.locator('button:has-text("Şirketi kur")').click();
    await rp.waitForSelector('.topbar', { timeout: 30000 });
    const day = await rp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 120; i++) c.engine.runDay();
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      console.warn('oyun testinin uyarısı', { gün: c.getState().time.day });
      return c.getState().time.day;
    });
    await rp.waitForTimeout(300);
    await rp.locator('.speeds [data-panel="settings"]').click();
    await rp.waitForSelector('.modal [data-settings-version]', { timeout: 5000 });
    await rp.locator('.modal [data-settings-page-open="report"]').click();
    await rp.waitForSelector('[data-bug-report] [data-report-save-state="ready"]', { timeout: 10000 }).catch(() => null);
    const form = await rp.evaluate(() => ({
      save: document.querySelector('[data-report-save-state]')?.getAttribute('data-report-save-state') ?? '',
      saveChecked: document.querySelector('[data-report-save]')?.checked ?? null,
      log: document.querySelector('[data-report-log]')?.parentElement?.textContent ?? '',
      preview: document.querySelector('[data-report-preview] pre')?.textContent ?? '',
      email: document.querySelector('[data-report-email]')?.getAttribute('href') ?? '',
      focus: document.activeElement?.hasAttribute('data-settings-back') ?? false,
    }));
    check('Hata bildir: açık oyunun kaydı hazır ve seçili; uyarı günlüğü sayılıyor; ön izlemede sürüm, uyarı ve kaydın boyu; e-posta destek adresine',
      form.save === 'ready' && form.saveChecked === true && /Uyarı günlüğünü ekle \(\d+ satır\)/.test(form.log)
        && form.preview.includes('"kind": "capitalforge-bug-report"') && form.preview.includes(`"version": "${appVersion}"`)
        && form.preview.includes('oyun testinin uyarısı') && /"save": "\(kayıt, [\d.,]+ KB\)"/.test(form.preview)
        && form.email.startsWith('mailto:info@conforcus.com?subject=') && form.focus,
      JSON.stringify({ ...form, preview: `${form.preview.length} karakter` }));
    await rp.fill('[data-report-note]', 'Kasa ekranında bir tuhaflık var.');
    await rp.screenshot({ path: `${OUT}/surum-hata-raporu.png` });
    const [reportFile] = await Promise.all([rp.waitForEvent('download', { timeout: 15000 }), rp.locator('[data-report-download]').click()]);
    const report = JSON.parse(fs.readFileSync(await reportFile.path(), 'utf8'));
    const notice = ((await rp.locator('[data-report-notice]').textContent().catch(() => '')) ?? '').trim();
    check('Rapor indiriliyor: sürüm, tarayıcı, not, günlükteki uyarı, oyunun o anki kaydı; dosya adı tarihli; oyuncuya ne yapacağı yazıyor',
      /^capitalforge-hata-raporu-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(reportFile.suggestedFilename())
        && report.kind === 'capitalforge-bug-report' && report.app?.version === appVersion && report.app?.edition === 'web'
        && report.note === 'Kasa ekranında bir tuhaflık var.' && (report.log ?? []).some((line) => line.text.includes('oyun testinin uyarısı'))
        && report.save?.state?.time?.day === day && JSON.stringify(report.save).includes('Rapor Holding')
        && Object.keys(report).at(-1) === 'save' && /^İndirme başladı: capitalforge-hata-raporu-/.test(notice),
      `${reportFile.suggestedFilename()} · ${notice} · gün ${report.save?.state?.time?.day}/${day}`);
    await rp.locator('[data-report-save]').uncheck();
    await rp.locator('[data-report-log]').uncheck();
    const [bareFile] = await Promise.all([rp.waitForEvent('download', { timeout: 15000 }), rp.locator('[data-report-download]').click()]);
    const bare = JSON.parse(fs.readFileSync(await bareFile.path(), 'utf8'));
    check('Kayıt ve günlük çıkarılınca raporda yoklar; not duruyor',
      bare.save === null && bare.log === null && bare.note === 'Kasa ekranında bir tuhaflık var.', JSON.stringify({ save: bare.save, log: bare.log }));
    await rp.locator('[data-report-copy-address]').click();
    await rp.waitForFunction(() => /panoya kopyalandı/.test(document.querySelector('[data-report-notice]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    const clip = await rp.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('"Adresi kopyala" destek adresini panoya koyuyor', clip === 'info@conforcus.com', clip);
    await rp.locator('[data-settings-back]').click();
    await rp.keyboard.press('Escape');

    // Komut, piyasa ve finans metinleri oyun ekranıyla iniyor (Tur 74): Türkçe oyunda yerindeler.
    const RAW_KEY = /\b(core|finance|panels|hud|app)\.[a-z]+\.[a-zA-Z]/;
    const rawIn = [];
    for (const panel of ['bourse', 'council', 'company', 'chain', 'rivalry']) {
      await rp.locator(`.topbar-actions [data-panel="${panel}"]`).click();
      await rp.waitForTimeout(300);
      const text = ((await rp.locator('.modal').textContent().catch(() => '')) ?? '').trim();
      if (text.length < 20 || RAW_KEY.test(text)) rawIn.push(`${panel}: ${text.match(RAW_KEY)?.[0] ?? (text.slice(0, 30) || 'boş')}`);
      await rp.keyboard.press('Escape');
    }
    const refusal = await rp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const tile = s.map.tiles.find((x) => x.kind === 'plot' && !x.ownerId && !x.structureId);
      return c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
    });
    const topbar = ((await rp.locator('.topbar').textContent()) ?? '').trim();
    check('Türkçe oyunda komut, piyasa ve finans metinleri yerinde: panellerde ham anahtar yok, komutun reddi Türkçe',
      rawIn.length === 0 && refusal.ok === false && typeof refusal.reason === 'string' && !RAW_KEY.test(refusal.reason)
        && /[çğıöşü]/i.test(refusal.reason) && !RAW_KEY.test(topbar),
      `${rawIn.join(' | ') || 'paneller temiz'} · ret: ${refusal.reason}`);
    await rContext.close();

    // Telefonda iki sayfa da ekrana sığıyor (kutular görüntü alanına karşı ölçülüyor).
    const vPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await vPhone.addInitScript(veteran, TUTORIAL_KEY);
    const vp = await vPhone.newPage();
    watch(vp);
    await vp.goto('http://127.0.0.1:8811/');
    await vp.waitForSelector('.newgame', { timeout: 20000 });
    await vp.locator('[data-settings-open]').click();
    const spill = () => vp.evaluate(() => [...document.querySelectorAll('.settings-overlay .settings *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`).slice(0, 4));
    await vp.locator('.settings-overlay [data-settings-page-open="whatsNew"]').click();
    await vp.waitForSelector('[data-whats-new] [data-release]', { timeout: 10000 }).catch(() => null);
    const whatsNewSpill = await spill();
    await vp.locator('[data-settings-back]').click();
    await vp.locator('.settings-overlay [data-settings-page-open="report"]').click();
    await vp.waitForSelector('[data-bug-report]', { timeout: 10000 }).catch(() => null);
    await vp.locator('[data-report-preview] summary').click();
    const reportSpill = await spill();
    check('Telefonda (390 px) "Yenilikler" ve "Hata bildir" ekrana sığıyor, ön izleme açıkken de',
      (await vp.locator('[data-bug-report]').count()) === 1 && whatsNewSpill.length === 0 && reportSpill.length === 0,
      `${whatsNewSpill.join(', ')} · ${reportSpill.join(', ')}`);
    await vPhone.close();
    check('Sürüm bölümünde konsol temiz', vErrors.length === 0, vErrors.slice(0, 3).join(' | '));
  }

  section('Değerlendirme: Faz 6 sonu');
  {
    /*
     * Tur 75. Faz 6'nın ekranları klavyeyle ve kumandayla: Ayarlar'ın alt
     * sayfasında Escape ve B bir adım geri (bütün pencere kapanıyordu, hata
     * raporunun notu da gidiyordu), ipucu "Geri" diyor. Hata raporu
     * Kayıtlar'dan oyuna geri açılıyor. Kaydın neden açılmadığı oyuncunun
     * dilinde. Oyunun daha yeni bir sürümünün otomatik kaydı (Steam'in beta
     * dalı, Steam Cloud) açılışta söyleniyor, üstüne yazılmıyor.
     */
    const fErrors = [];
    const watch = (page) => {
      page.on('pageerror', (e) => fErrors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') fErrors.push(m.text()); });
    };
    const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('.toasts .toast')].map((el) => (el.textContent ?? '').trim()));
    const untilToast = (page, text) => page.waitForFunction(
      (wanted) => [...document.querySelectorAll('.toasts .toast')].some((el) => (el.textContent ?? '').includes(wanted)),
      text, { timeout: 10000 }).then(() => true, () => false);
    const BUTTON = { a: 0, b: 1, menu: 9 };
    const frames = (page, n) => page.evaluate((count) => new Promise((resolve) => {
      const step = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
      step(count);
    }), n);
    // Basış tek okumalık: kumandanın döngüsü onu bir kez basılı, sonraki okumada bırakılmış
    // görüyor. Bu makinede kareler yavaş; iki karelik basış tekrar eşiğini geçip iki basış sayılabiliyor.
    const fakePad = () => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
      let timestamp = 0;
      const pad = { index: 0, connected: true, mapping: 'standard', id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', axes: [0, 0, 0, 0], get buttons() { return buttons; }, get timestamp() { return timestamp; } };
      const pending = new Set();
      let shown = new Set();
      const set = (index, down) => { buttons[index] = { pressed: down, touched: down, value: down ? 1 : 0 }; timestamp = performance.now(); };
      window.__fakePad = { connected: false, pulse: (index) => pending.add(index), get waiting() { return pending.size; } };
      navigator.getGamepads = () => {
        if (!window.__fakePad.connected) return [null, null, null, null];
        for (const index of shown) set(index, false);
        shown = new Set(pending);
        for (const index of pending) set(index, true);
        pending.clear();
        return [pad, null, null, null];
      };
      document.hasFocus = () => true;
    };
    const tap = async (page, name) => {
      await page.evaluate((index) => window.__fakePad.pulse(index), BUTTON[name]);
      await page.waitForFunction(() => window.__fakePad.waiting === 0, null, { timeout: 10000 });
      await frames(page, 3);
    };

    const fContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    await fContext.addInitScript(veteran, TUTORIAL_KEY);
    await fContext.addInitScript(fakePad);
    const fp = await fContext.newPage();
    watch(fp);
    await fp.goto('http://127.0.0.1:8811/?lang=tr');
    await fp.waitForSelector('.newgame', { timeout: 20000 });
    await fp.fill('.newgame-field input[type="text"]', 'Faz Altı');
    await fp.locator('button:has-text("Şirketi kur")').click();
    await fp.waitForSelector('.topbar', { timeout: 30000 });
    await fp.waitForFunction(() => (window.__capital?.renderInfo()?.frameCount ?? 0) >= 3, null, { timeout: 60000 });
    const day = await fp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      for (let i = 0; i < 30; i++) c.engine.runDay();
      return c.getState().time.day;
    });

    // Klavye: alt sayfada Escape bir adım geri.
    const settings = () => fp.evaluate(() => ({
      open: !!document.querySelector('.modal [data-settings]'),
      page: document.querySelector('.modal [data-settings-page]')?.getAttribute('data-settings-page') ?? null,
      focus: document.activeElement?.getAttribute('data-settings-page-open') ?? document.activeElement?.tagName.toLowerCase() ?? '',
      note: document.querySelector('[data-report-note]')?.value ?? null,
    }));
    const openSettings = async () => {
      await fp.locator('.speeds [data-panel="settings"]').click();
      await fp.waitForSelector('.modal [data-settings-version]', { timeout: 5000 });
    };
    const settled = (open) => fp.waitForFunction((wanted) => !!document.querySelector('.modal [data-settings]') === wanted, open, { timeout: 3000 }).catch(() => null);
    const onMain = () => fp.waitForFunction(() => !!document.querySelector('.modal [data-settings]') && !document.querySelector('.modal [data-settings-page]'), null, { timeout: 3000 }).catch(() => null);
    await openSettings();
    await fp.locator('.modal [data-settings-page-open="whatsNew"]').first().click();
    await fp.waitForSelector('[data-whats-new] [data-release]', { timeout: 10000 });
    await fp.keyboard.press('Escape');
    await onMain();
    const firstEscape = await settings();
    await fp.keyboard.press('Escape');
    await settled(false);
    const secondEscape = await settings();
    check("Ayarlar'ın alt sayfasında Escape bir adım geri: Ayarlar'a dönüyor, odak sayfayı açan düğmede; ikinci Escape pencereyi kapatıyor",
      firstEscape.open && firstEscape.page === null && firstEscape.focus === 'whatsNew' && !secondEscape.open,
      `${JSON.stringify(firstEscape)} → ${JSON.stringify(secondEscape)}`);

    await openSettings();
    await fp.locator('.modal [data-settings-page-open="report"]').click();
    await fp.waitForSelector('[data-bug-report] [data-report-save-state="ready"]', { timeout: 10000 }).catch(() => null);
    const NOTE = 'Kasa ekranında bir tuhaflık var.';
    await fp.locator('[data-report-note]').fill(NOTE);
    await fp.keyboard.press('Escape');
    await frames(fp, 2);
    const inNote = await settings();
    check('Hata raporunun notunda Escape notu silmiyor: yalnız alandan çıkıyor, sayfa açık kalıyor',
      inNote.open && inNote.page === 'report' && inNote.note === NOTE && inNote.focus !== 'textarea', JSON.stringify(inNote));
    const [reportFile] = await Promise.all([fp.waitForEvent('download', { timeout: 15000 }), fp.locator('[data-report-download]').click()]);
    const reportText = fs.readFileSync(await reportFile.path(), 'utf8');
    await fp.keyboard.press('Escape');
    await onMain();
    await fp.keyboard.press('Escape');
    await settled(false);

    // Hata raporu oyuna geri: Kayıtlar → "JSON içe aktar". Önce oyun ilerliyor ki kaydın günü geri gelsin.
    const later = await fp.evaluate(() => {
      const c = window.__capital;
      for (let i = 0; i < 5; i++) c.engine.runDay();
      return c.getState().time.day;
    });
    const importFile = async (name, text) => {
      if ((await fp.locator('.saverow-actions input[type="file"]').count()) === 0) await fp.locator('.topbar-actions [data-panel="saves"]').click();
      await fp.waitForSelector('.saverow-actions input[type="file"]', { state: 'attached', timeout: 5000 });
      await fp.locator('.saverow-actions input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    };
    await importFile(reportFile.suggestedFilename(), reportText);
    const reopened = await untilToast(fp, 'Kayıt içe aktarıldı');
    const back = await fp.evaluate(() => {
      const s = window.__capital.getState();
      return { day: s.time.day, company: s.companies[s.playerCompanyId].name };
    });
    check('Hata raporu Kayıtlar → "JSON içe aktar" ile açılıyor: içindeki kayıt yükleniyor ("dosya bozuk" deniyordu)',
      reopened && later === day + 5 && back.day === day && back.company === 'Faz Altı', `${later}. gün → ${back.day}. gün · ${back.company}`);
    await importFile('rapor.json', JSON.stringify({ kind: 'capitalforge-bug-report', format: 1, note: '', save: null }));
    const bare = await untilToast(fp, 'Bu hata raporunda kayıt yok');
    check('Kaydı çıkarılmış rapor nedeniyle reddediliyor, oyun yerinde',
      bare && (await fp.evaluate(() => window.__capital.getState().time.day)) === day, (await toasts(fp)).join(' | '));
    await fp.keyboard.press('Escape');

    // Kumanda: B alt sayfada bir adım geri, ipucu "Geri"; yazı alanında önce alandan çıkıyor.
    await fp.evaluate(() => {
      window.__fakePad.connected = true;
      window.dispatchEvent(new Event('gamepadconnected'));
      document.activeElement?.blur?.();
    });
    await fp.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /\/pad-[\w-]+\.js/.test(r.name)), null, { timeout: 10000 }).catch(() => {});
    await frames(fp, 3);
    const padHint = () => fp.evaluate(() => {
      const bar = document.querySelector('.pad-hints');
      return { layer: bar?.dataset.layer ?? null, b: bar?.querySelector('.pad-glyph[data-button="b"]')?.parentElement?.textContent ?? null };
    });
    await tap(fp, 'menu');
    await fp.waitForSelector('.modal [data-settings-version]', { timeout: 5000 }).catch(() => null);
    await fp.evaluate(() => document.querySelector('.modal [data-settings-page-open="report"]')?.focus());
    await tap(fp, 'a');
    await fp.waitForSelector('[data-bug-report]', { timeout: 10000 }).catch(() => null);
    await frames(fp, 2);
    const onPage = { ...(await settings()), hint: await padHint() };
    await fp.locator('[data-report-note]').fill('Kumandayla not.');
    await tap(fp, 'b');
    const padNote = await settings();
    await tap(fp, 'b');
    await onMain();
    await frames(fp, 2);
    const padBack = { ...(await settings()), hint: await padHint() };
    await tap(fp, 'b');
    await settled(false);
    const padClosed = await settings();
    check('Kumandada B alt sayfada bir adım geri, ipucu "Geri"; notta önce alandan çıkıyor; Ayarlar\'da ipucu "Kapat", sonraki B pencereyi kapatıyor',
      onPage.page === 'report' && onPage.hint.layer === 'modal' && /Geri$/.test(onPage.hint.b ?? '')
        && padNote.page === 'report' && padNote.note === 'Kumandayla not.' && padNote.focus !== 'textarea'
        && padBack.open && padBack.page === null && padBack.focus === 'report' && /Kapat$/.test(padBack.hint.b ?? '') && !padClosed.open,
      JSON.stringify({ onPage, padNote, padBack, padClosed }));

    // İngilizce oyunda kaydın neden açılmadığı İngilizce (Türkçe gerekçe görünüyordu).
    const saved = JSON.parse(reportText).save;
    const NEWER = saved.state.meta.schemaVersion + 1;
    const future = { meta: { ...saved.meta, slot: 0, name: 'Otomatik kayıt', schemaVersion: NEWER }, state: { ...saved.state, meta: { ...saved.state.meta, schemaVersion: NEWER } } };
    await openSettings();
    await fp.locator('.settings [data-locale="en"]').click();
    await fp.keyboard.press('Escape');
    await settled(false);
    await importFile('half.json', '{ "meta": ');
    const enBroken = await untilToast(fp, 'The file is not valid JSON.');
    await importFile('future.json', JSON.stringify({ meta: future.meta, state: future.state }));
    const enNewer = await untilToast(fp, `This save is from a newer version of the game (save format v${NEWER}). Update the game.`);
    check('İngilizce oyunda içe aktarmanın reddi İngilizce: geçersiz dosya, yeni sürümün kaydı (kayıt biçimiyle)', enBroken && enNewer, (await toasts(fp)).join(' | '));
    await fContext.close();

    // Yeni sürümün otomatik kaydı: açılışta söyleniyor, yeni oyun üstüne yazmıyor.
    // Otomatik kaydın 30 sn'si bu sekmede 1,5 sn; bildirimler sayılıyor (kısa ömürlüler).
    const nContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await nContext.addInitScript(veteran, TUTORIAL_KEY);
    await nContext.addInitScript(() => {
      const interval = window.setInterval;
      window.setInterval = (fn, ms, ...rest) => interval(fn, ms === 30_000 ? 1500 : ms, ...rest);
      window.__toastLog = [];
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.classList.contains('toast')) window.__toastLog.push(node.textContent ?? '');
          }
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const idb = (page, op, value) => page.evaluate(([kind, arg]) => new Promise((resolve) => {
      const req = indexedDB.open('capital-game', 1);
      req.onsuccess = () => {
        const store = req.result.transaction('saves', kind === 'put' ? 'readwrite' : 'readonly').objectStore('saves');
        const action = kind === 'put' ? store.put(arg) : store.get(arg);
        action.onsuccess = () => {
          const r = action.result;
          resolve(kind === 'put' ? true : r ? { slot: r.meta?.slot, company: r.meta?.companyName, schema: r.state?.meta?.schemaVersion, day: r.state?.time?.day } : null);
        };
        action.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    }), [op, value]);
    const np = await nContext.newPage();
    watch(np);
    await np.goto('http://127.0.0.1:8811/?lang=tr');
    await np.waitForSelector('.newgame', { timeout: 20000 });
    await idb(np, 'put', future);
    await np.reload();
    await np.waitForSelector('.newgame', { timeout: 20000 });
    const bootNotice = ((await np.waitForSelector('[data-boot-notice]', { timeout: 10000 }).then((el) => el.textContent(), () => '')) ?? '').trim();
    check(`Daha yeni sürümün otomatik kaydı açılışta söyleniyor: menüde neden ve kayıt biçimi (v${NEWER}); oyun açılmıyor`,
      bootNotice === `Otomatik kayıt oyunun daha yeni bir sürümünden (kayıt biçimi v${NEWER}). Bu sürüm onu açamıyor, üstüne de yazmıyor. Oyunu güncelle.`
        && (await np.locator('.topbar').count()) === 0, bootNotice);
    await np.locator('.newgame [data-locale="en"]').click();
    await np.waitForFunction(() => /newer version/.test(document.querySelector('[data-boot-notice]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => null);
    const bootNoticeEn = ((await np.locator('[data-boot-notice]').textContent().catch(() => '')) ?? '').trim();
    check('Dil değişince açılışın uyarısı da o dilde',
      bootNoticeEn === `The autosave is from a newer version of the game (save format v${NEWER}). This version can’t open it and won’t write over it. Update the game.`, bootNoticeEn);
    await np.locator('.newgame [data-locale="tr"]').click();
    await np.fill('.newgame-field input[type="text"]', 'Eski Sürüm');
    await np.locator('button:has-text("Şirketi kur")').click();
    await np.waitForSelector('.topbar', { timeout: 30000 });
    const told = await untilToast(np, 'Otomatik kayıt yapılmıyor');
    // Üç aralık daha: kayıt hâlâ yeni sürümün, uyarı bir kez.
    await np.waitForTimeout(4500);
    const kept = await idb(np, 'get', 0);
    const warned = await np.evaluate(() => window.__toastLog.filter((text) => text.includes('Otomatik kayıt yapılmıyor')).length);
    check('Yeni oyun o kaydın üstüne yazmıyor: otomatik kayıt duruyor, oyuncuya bir kez söyleniyor',
      told && warned === 1 && kept?.schema === NEWER && kept.day === saved.state.time.day && kept.company === 'Faz Altı', `${warned} uyarı · ${JSON.stringify(kept)}`);
    await np.locator('.topbar-actions [data-panel="saves"]').click();
    await np.locator('.slot').nth(1).locator('button:has-text("Kaydet")').click();
    await np.waitForFunction(() => [...document.querySelectorAll('.toasts .toast')].some((el) => /kaydedildi/i.test(el.textContent ?? '')), null, { timeout: 5000 }).catch(() => null);
    const other = await idb(np, 'get', 1);
    await idb(np, 'put', { meta: { ...future.meta, slot: 2, name: 'Kayıt 2' }, state: future.state });
    await np.locator('.slot').nth(2).locator('button:has-text("Kaydet")').click();
    const refused = await untilToast(np, 'Slot 2: oyunun daha yeni bir sürümünün kaydı var');
    const slotTwo = await idb(np, 'get', 2);
    check("Kayıtlar'dan başka slota kayıt yazılıyor; yeni sürümün kaydı olan slota elle kayıt da yazmıyor, nedenini söylüyor",
      other?.schema === saved.state.meta.schemaVersion && other.company === 'Eski Sürüm' && refused && slotTwo?.schema === NEWER,
      `${JSON.stringify(other)} · ${JSON.stringify(slotTwo)} · ${(await toasts(np)).join(' | ')}`);
    await nContext.close();
    check('Faz 6 değerlendirme bölümünde konsol temiz', fErrors.length === 0, fErrors.slice(0, 3).join(' | '));
  }

  section('Şehrin kimliği');
  {
    /*
     * Tur 76. Şehrin türü: kurulumda dört tür ve ayrıntısı (ligde seçici
     * yok), liman kentinde üst barda rozet, üç üretim bölgesi, ucuz kahve ve
     * limanın tüccarları; kayıt türü taşıyor; holding'in yeni şehri türüyle
     * açılıyor ve haberi türünü söylüyor; dengeli şehirde rozet yok; üç dil.
     */
    const tContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await tContext.addInitScript(veteran, TUTORIAL_KEY);
    const tp = await tContext.newPage();
    const tErrors = [];
    tp.on('pageerror', (e) => tErrors.push(e.message));
    tp.on('console', (m) => { if (m.type() === 'error') tErrors.push(m.text()); });
    await tp.goto('http://127.0.0.1:8811/');
    await tp.waitForSelector('.newgame', { timeout: 20000 });
    const picker = await tp.evaluate(() => ({
      types: [...document.querySelectorAll('.newgame [data-city-type]')].map((el) => el.getAttribute('data-city-type')),
      labels: [...document.querySelectorAll('.newgame [data-city-type]')].map((el) => el.textContent.trim()),
      checked: document.querySelector('.newgame [data-city-type][aria-checked="true"]')?.getAttribute('data-city-type'),
      detail: document.querySelector('[data-detail="city-type"]')?.textContent ?? '',
    }));
    check('Kurulumda şehrin türü: dört tür, dengeli seçili, ayrıntısı yazıyor',
      picker.types.join() === 'balanced,port,industrial,capital' && picker.labels.join() === 'Dengeli,Liman kenti,Sanayi kenti,Başkent' &&
        picker.checked === 'balanced' && picker.detail.includes('kalibre'),
      JSON.stringify(picker).slice(0, 200));
    await tp.locator('.newgame [data-city-type="port"]').click();
    const portDetail = ((await tp.locator('[data-detail="city-type"]').textContent()) ?? '').trim();
    check('Liman kenti seçilince ayrıntı onun: liman bölgeleri, ucuz kahve ve pamuk, nakliye',
      portDetail.includes('Liman bölgesi çok') && portDetail.includes('Kahve çekirdeği %20') && portDetail.includes('Nakliye terminali'),
      portDetail.slice(0, 160));
    // Ligde seçici yok: herkes dengeli şehirde. Serbest şehre dönünce seçim yerinde.
    await tp.locator('.mode-picker [data-mode="league"]').click();
    const inLeague = await tp.locator('.newgame [data-city-type]').count();
    await tp.locator('.mode-picker [data-mode="free"]').click();
    const kept = await tp.locator('.newgame [data-city-type="port"][aria-checked="true"]').count();
    check('Tohum Ligi’nde tür seçilmiyor; serbest şehre dönünce seçim yerinde', inLeague === 0 && kept === 1, `ligde ${inLeague} düğme · seçili ${kept}`);
    // Üç dil: seçicinin adları dilin.
    const labelsIn = async (locale) => {
      await tp.locator(`.newgame [data-locale="${locale}"]`).click();
      await tp.waitForTimeout(150);
      return tp.evaluate(() => [...document.querySelectorAll('.newgame [data-city-type]')].map((el) => el.textContent.trim()).join(','));
    };
    const en = await labelsIn('en');
    const de = await labelsIn('de');
    await labelsIn('tr');
    check('Türlerin adı üç dilde', en === 'Balanced,Port city,Industrial city,Capital' && de === 'Ausgewogen,Hafenstadt,Industriestadt,Hauptstadt', `${en} · ${de}`);

    await tp.fill('.newgame-field input[type="text"]', 'Liman AŞ');
    await tp.locator('button:has-text("Şirketi kur")').click();
    await tp.waitForSelector('.topbar', { timeout: 30000 });
    const port = await tp.evaluate(() => {
      const c = window.__capital;
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      const s = c.getState();
      const chip = document.querySelector('[data-city-type-chip]');
      return {
        type: s.cityType,
        chip: chip?.textContent?.trim() ?? null,
        chipType: chip?.getAttribute('data-city-type-chip') ?? null,
        title: chip?.getAttribute('title') ?? '',
        production: s.districts.filter((d) => d.archetype === 'port' || d.archetype === 'industrial').length,
        coffee: s.market.spot.coffee_bean / c.basePrice('coffee_bean'),
        roasted: s.market.spot.roasted_coffee / c.basePrice('roasted_coffee'),
        rivals: Object.values(s.companies).filter((co) => !co.isPlayer).map((co) => co.profileId),
      };
    });
    check('Liman kenti kuruluyor: üst barda rozet (adı ve açıklaması), üç üretim bölgesi',
      port.type === 'port' && port.chip === 'Liman kenti' && port.chipType === 'port' && port.title.includes('denizden') && port.production === 3,
      JSON.stringify({ ...port, rivals: undefined }).slice(0, 200));
    check('Limanda kahve çekirdeği %20 ucuz, kavrulmuş kahve referansta; kadro limanın tüccarları',
      Math.abs(port.coffee - 0.8) < 1e-6 && Math.abs(port.roasted - 1) < 1e-6 && port.rivals.join() === 'meridyen,anadolu_gida,veri_sanayi,atlas_yapi',
      `kahve ×${port.coffee.toFixed(3)} · kavrulmuş ×${port.roasted.toFixed(3)} · ${port.rivals.join(', ')}`);
    // Kayıt türü taşıyor.
    await tp.locator('.topbar-actions [data-panel="saves"]').click();
    await tp.waitForTimeout(300);
    await tp.locator('.slot').nth(1).locator('button:has-text("Kaydet")').click();
    await tp.waitForTimeout(700);
    const savedType = await tp.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('capital-game', 1);
          req.onsuccess = () => {
            const get = req.result.transaction('saves', 'readonly').objectStore('saves').get(1);
            get.onsuccess = () => resolve(get.result ? { type: get.result.state?.cityType ?? null, schema: get.result.meta?.schemaVersion } : null);
            get.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
        }),
    );
    check('Kayıt şehrin türünü taşıyor (kayıt biçimi v7)', savedType?.type === 'port' && savedType?.schema === 7, JSON.stringify(savedType));
    await tp.keyboard.press('Escape');

    // Holding'in yeni şehri türüyle: zaferi ve kasayı elle ver (Holding bölümündeki gibi).
    await tp.evaluate(() => {
      const c = window.__capital;
      const s = c.getState();
      const tile = s.map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.ownerId && !t.buildingId && s.districts[t.districtId].opensOnDay === undefined);
      c.engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
      c.engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
      for (let i = 0; i < 20; i++) c.engine.runDay();
      const live = c.getState();
      live.companies.player.cash = 30_000_000;
      live.victory = { day: live.time.day, kind: 'tycoon' };
      c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    await tp.waitForSelector('[data-victory-open-city]', { timeout: 8000 }).catch(() => {});
    await tp.evaluate(() => document.querySelector('[data-victory-open-city]')?.click());
    await tp.waitForTimeout(300);
    const form = await tp.evaluate(() => ({
      types: [...document.querySelectorAll('[data-holding-type]')].map((el) => el.getAttribute('data-holding-type')),
      checked: document.querySelector('[data-holding-type][aria-checked="true"]')?.getAttribute('data-holding-type'),
    }));
    await tp.locator('[data-holding-type="capital"]').click();
    const blurb = ((await tp.locator('[data-holding-type-blurb]').textContent()) ?? '').trim();
    await tp.locator('[data-holding-size="standard"]').click();
    await tp.locator('[data-open-city-go]').click();
    await tp.waitForTimeout(900);
    const opened = await tp.evaluate(() => {
      const s = window.__capital.getState();
      return {
        type: s.cityType,
        chip: document.querySelector('[data-city-type-chip]')?.textContent?.trim() ?? null,
        founder: s.holding?.dormant[0]?.state.cityType ?? null,
        news: s.news[0]?.body ?? '',
        rivals: Object.values(s.companies).filter((co) => !co.isPlayer).map((co) => co.profileId),
      };
    });
    check('Holding’in yeni şehir formunda tür seçiliyor: dört tür, dengeli seçili, açıklaması',
      form.types.join() === 'balanced,port,industrial,capital' && form.checked === 'balanced' && blurb.includes('Bakanlıklar'),
      `${JSON.stringify(form)} · ${blurb.slice(0, 60)}`);
    check('Yeni şehir başkent: rozet, kurucu şehir liman, haber türünü söylüyor, kadro başkentin',
      opened.type === 'capital' && opened.chip === 'Başkent' && opened.founder === 'port' && opened.news.includes('Şehrin türü: Başkent') &&
        opened.rivals.join() === 'meridyen,kule_gayrimenkul,atlas_yapi,veri_sanayi',
      JSON.stringify({ ...opened, news: opened.news.slice(-60) }).slice(0, 220));
    await tContext.close();

    // Dengeli şehirde rozet yok: üst bar bugünkü gibi.
    const bContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await bContext.addInitScript(veteran, TUTORIAL_KEY);
    const bp = await bContext.newPage();
    bp.on('pageerror', (e) => tErrors.push(e.message));
    await bp.goto('http://127.0.0.1:8811/');
    await bp.waitForSelector('.newgame', { timeout: 20000 });
    await bp.fill('.newgame-field input[type="text"]', 'Dengeli AŞ');
    await bp.locator('button:has-text("Şirketi kur")').click();
    await bp.waitForSelector('.topbar', { timeout: 30000 });
    const plain = await bp.evaluate(() => ({ chip: document.querySelectorAll('[data-city-type-chip]').length, type: window.__capital.getState().cityType ?? null }));
    check('Dengeli şehirde rozet yok, kayıtta tür alanı yok', plain.chip === 0 && plain.type === null, JSON.stringify(plain));
    await bContext.close();
    check('Şehrin kimliği bölümünde konsol temiz', tErrors.length === 0, tErrors.slice(0, 3).join(' | '));
  }

  section('Mobil');
  for (const deviceName of ['iPhone 13', 'Pixel 7']) {
    const mobileContext = await browser.newContext({ ...devices[deviceName] });
    await mobileContext.addInitScript(veteran, TUTORIAL_KEY);
    const m = await mobileContext.newPage();
    const mobileErrors = [];
    m.on('console', (msg) => {
      if (msg.type() === 'error') mobileErrors.push(msg.text());
    });
    m.on('pageerror', (e) => mobileErrors.push('pageerror: ' + e.message));

    await m.goto('http://127.0.0.1:8811/');
    await m.waitForSelector('.newgame', { timeout: 20000 });
    await m.fill('.newgame-field input[type="text"]', 'Mobil Holding');
    await m.locator('button:has-text("Şirketi kur")').click();
    await m.waitForSelector('.topbar', { timeout: 20000 });
    await m.waitForTimeout(1200);

    // Ulaşılabilirlik: kaydırılabilir bir şeridin içinde ekran dışında
    // kalan düğme ULAŞILABİLİR sayılır; başka türlü taşma hatadır.
    const reach = await m.evaluate(() => {
      const vw = window.innerWidth;
      const scrollableAncestor = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth - p.clientWidth > 2) return true;
        }
        return false;
      };
      const stranded = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right - vw <= 4) continue;
        if (scrollableAncestor(el)) continue;
        stranded.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)} +${Math.round(r.right - vw)}px`);
      }
      return stranded.slice(0, 5);
    });
    check(`${deviceName}: ulaşılamayan taşma yok`, reach.length === 0, reach.join(', ') || 'temiz');

    // RIHTIM: HER DÜĞME EKRANDA MI?
    //
    // Bu kontrol uzun süre `scrollIntoViewIfNeeded()` çağırıyordu ve tam
    // da yakalaması gereken hatayı gizliyordu: yedi düğme 516 px istiyor,
    // ekran 390 px, son ikisi ekranın dışında kalıyordu. Test onları
    // önce görünür yapıp sonra tıklıyor ve yeşil yanıyordu — oysa gerçek
    // oyuncu için o iki panele ulaşmanın görünür bir yolu yoktu.
    //
    // Artık önce KONUM ölçülüyor, sonra kaydırmadan tıklanıyor.
    const dock = await m.evaluate(() => {
      const nav = document.querySelector('.topbar-actions');
      if (!nav) return null;
      const vw = innerWidth;
      const vh = innerHeight;
      const buttons = [...nav.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          panel: b.dataset.panel ?? '?',
          inside: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1,
          width: Math.round(r.width),
          height: Math.round(r.height),
          right: Math.round(r.right),
        };
      });
      return { vw, vh, bottom: Math.round(nav.getBoundingClientRect().bottom), overflow: nav.scrollWidth - nav.clientWidth, buttons };
    });
    // Karar kartı (Tur 37b) rıhtımın ÜSTÜNDE ve ekranda; ölçümden sonra masadan kalkıyor.
    const mobileCard = await m.evaluate(async () => {
      const s = window.__capital.getState();
      s.card = { defId: 'inspection', offeredDay: s.time.day, deadlineDay: s.time.day + 12, amount: 50000, category: 'retail' };
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const card = document.querySelector('.decision-card')?.getBoundingClientRect();
      const nav = document.querySelector('.topbar-actions')?.getBoundingClientRect();
      const result = card && nav ? { top: Math.round(card.top), bottom: Math.round(card.bottom), dock: Math.round(nav.top), vw: innerWidth, right: Math.round(card.right), left: Math.round(card.left) } : null;
      delete s.card;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return result;
    });
    check(
      `${deviceName}: karar kartı rıhtımın üstünde ve ekranda`,
      Boolean(mobileCard) && mobileCard.bottom <= mobileCard.dock && mobileCard.top >= 0 && mobileCard.left >= 0 && mobileCard.right <= mobileCard.vw,
      mobileCard ? `kart ${mobileCard.top}–${mobileCard.bottom} · rıhtım ${mobileCard.dock}` : 'kart yok',
    );
    // Fırsat balonu (Tur 37c): bina nerede olursa olsun balon ekranda ve rıhtımın üstünde.
    const mobileBubble = await m.evaluate(async () => {
      const cap = window.__capital;
      const s = cap.getState();
      // Telefon oyunu yeni kurulmuş olabilir: balon herhangi bir kareye bağlanabiliyor, köşeden uzak bir kare.
      // Kamera yerinde kalıyor (sonraki dokunma kontrolleri ona bağlı): balon karede de olsa kenara
      // yapışmış da olsa ekranda ve rıhtımın üstünde olmalı.
      const tile = s.map.tiles[(s.map.height - 2) * s.map.width + (s.map.width - 2)];
      s.bubble = { kind: 'parcel', tileId: tile.id, offeredDay: s.time.day, untilDay: s.time.day + 5, amount: 96000 };
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const r = document.querySelector('.opportunity-bubble')?.getBoundingClientRect();
      const nav = document.querySelector('.topbar-actions')?.getBoundingClientRect();
      const result = r && nav ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), dock: Math.round(nav.top), vw: innerWidth } : null;
      delete s.bubble;
      cap.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return result;
    });
    check(
      `${deviceName}: fırsat balonu ekranda ve rıhtımın üstünde`,
      Boolean(mobileBubble) && mobileBubble.left >= 0 && mobileBubble.right <= mobileBubble.vw && mobileBubble.top >= 0 && mobileBubble.bottom <= mobileBubble.dock,
      mobileBubble ? `balon ${mobileBubble.left}–${mobileBubble.right} × ${mobileBubble.top}–${mobileBubble.bottom} · rıhtım ${mobileBubble.dock}` : 'balon yok',
    );
    // KATLANABİLİR PANELLER — dar ekranın dikey bütçesi.
    //
    // Ölçüm: lens çubuğu 104 px, yapı menüsü 292 px, haber akışı 102 px.
    // HUD içeriği 967 px olduğu için 664 px'lik ekranda 303 px kaydırma
    // gerekiyordu ve haritaya kesintisiz kalan pay %38'e düşüyordu.
    //
    // Kontrol üç şeyi birden tutuyor: paneller katlanabiliyor, katlıyken
    // kaydırma gerekmiyor, ve harita ekranın yarısına yakınını alıyor.
    const hud = await m.evaluate(() => {
      const el = document.querySelector('.hud');
      const vh = innerHeight;
      const vw = innerWidth;
      const heads = [...document.querySelectorAll('.collapse-head')].map((b) => ({
        kind: b.dataset.collapse,
        h: Math.round(b.getBoundingClientRect().height),
        expanded: b.getAttribute('aria-expanded') === 'true',
        labelled: b.textContent.trim().length > 0,
      }));
      // Haritanın görünen payı: opak kutuların kaplamadığı ALAN.
      //
      // Bu ölçüt önce satır bazlıydı ve paneller tam genişlikteyken
      // doğru cevabı veriyordu. Kapalı paneller 44 px'lik ikonlara
      // inince yanlış oldu: 44 px genişliğindeki bir ikon, bulunduğu
      // satırın TAMAMINI kapalı sayıyor ve harita payını %68 yerine %5
      // gösteriyordu. Genişlik önemli hale geldiği anda ölçüt de
      // genişliği görmek zorunda.
      const STEP = 4;
      const cols = Math.ceil(vw / STEP);
      const rowCount = Math.ceil(vh / STEP);
      const grid = new Array(cols * rowCount).fill(false);
      for (const box of document.querySelectorAll(
        '.topbar, .lensbar, .buildpanel, .news, .inspector.has-selection, .topbar-actions',
      )) {
        const r = box.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        for (let y = Math.max(0, Math.floor(r.top / STEP)); y < Math.min(rowCount, Math.ceil(r.bottom / STEP)); y++) {
          for (let x = Math.max(0, Math.floor(r.left / STEP)); x < Math.min(cols, Math.ceil(r.right / STEP)); x++) {
            grid[y * cols + x] = true;
          }
        }
      }
      const free = grid.filter((on) => !on).length;
      return {
        scrollNeeded: Math.round(el.scrollHeight - el.clientHeight),
        heads,
        mapShare: free / grid.length,
      };
    });

    check(
      `${deviceName}: lens, yapı ve haber panelleri katlanabiliyor`,
      hud.heads.length === 3 && hud.heads.every((h) => !h.expanded && h.labelled),
      hud.heads.map((h) => `${h.kind}${h.expanded ? ' AÇIK' : ''}`).join(', ') || 'başlık yok',
    );
    check(
      `${deviceName}: katlı panellerin dokunma hedefi yeterli`,
      hud.heads.every((h) => h.h >= 44),
      `en kısa başlık ${Math.min(...hud.heads.map((h) => h.h))}px`,
    );
    check(
      `${deviceName}: paneller katlıyken HUD kaydırma istemiyor`,
      hud.scrollNeeded <= 8,
      `gereken kaydırma ${hud.scrollNeeded}px`,
    );
    check(
      `${deviceName}: harita ekranın en az %60'ını alıyor`,
      hud.mapShare >= 0.6,
      `harita payı %${Math.round(hud.mapShare * 100)}`,
    );

    // ---- Üst bar: kaç satır, kaç piksel ----
    //
    // Ölçüm, ilk turda neyi optimize etmediğimizi gösterdi: bar 128 px ve
    // bunun yalnızca 18 px'i metriklerdi. Kalanı marka bloğu (boyunu CEO
    // portresi belirliyordu) ve hız düğmeleriydi — üç ayrı satır.
    //
    // Kontrol satır SAYISINI de tutuyor, çünkü asıl kural o: iki satır.
    // Yalnız yüksekliğe bakan bir eşik, satırlardan biri sessizce üçe
    // bölünüp diğeri kısalınca aynı sayıyı vermeye devam ederdi.
    const barRows = () =>
      m.evaluate(() => {
        const el = document.querySelector('.topbar');
        const kids = [...el.children].filter((c) => !c.classList.contains('topbar-actions'));
        // Satırları ÜST KENARA göre saymak yanlış olur.
        //
        // Aynı satırdaki öğeler dikeyde ortalandığı için boyları farklıysa
        // üst kenarları da farklı çıkıyor: 34 px'lik hız düğmeleri 48'de,
        // 22 px'lik portre 54'te başlıyor. Üst kenarları sayan ilk sürüm
        // bu yüzden tek satıra "3 satır" dedi. Doğru ölçüt kenar değil,
        // dikey aralıkların ÇAKIŞMASI.
        const spans = [...kids]
          .map((c) => c.getBoundingClientRect())
          .filter((r) => r.height > 0)
          .map((r) => [r.top, r.bottom])
          .sort((a, b) => a[0] - b[0]);
        let rows = 0;
        let end = -Infinity;
        for (const [top, bottom] of spans) {
          if (top >= end) rows++;
          end = Math.max(end, bottom);
        }
        return { h: Math.round(el.getBoundingClientRect().height), rows };
      });

    const bar = await barRows();
    check(`${deviceName}: üst bar iki satır`, bar.rows === 2, `${bar.rows} satır`);
    check(`${deviceName}: üst bar 80px'i geçmiyor`, bar.h <= 80, `${bar.h}px`);

    // ---- En kötü durum: milyarder ve borçlu ----
    //
    // "Bar hiç uzamasın" TUTULAMAZ bir söz: para dizgeleri oyun ilerledikçe
    // uzuyor ("250 B ₺" 7 karakter, "999.99 Mr ₺" 11) ve beş metrik en geniş
    // hâlleriyle 390 px'lik bir ekrana tek satıra sığmıyor. Sığdırmaya
    // çalışmak ya yazıyı okunmaz küçültmek ya da rakamı kırpmak olurdu.
    //
    // Tutulabilir söz şu: metrikler EN FAZLA iki satıra çıkar, yani bar üç
    // satırlık bir bloğa dönüşmez. Kontrol de tam bunu sınıyor.
    const rich = await m.evaluate(async () => {
      const s = window.__capital.getState();
      // Bu sondaj yalnızca rakamların genişliğini ölçüyor; 999 milyar ₺
      // gerçek bir zafer koşulu ve zafer kartı alttaki her şeyi örterdi.
      // Zafer "görülmüş" sayılıyor ki ekran inmesin.
      s.victory = { day: s.time.day, kind: 'tycoon', dismissed: true };
      s.companies.player.cash = 999_000_000_000;
      s.companies.player.netWorth = 999_000_000_000;
      s.companies.player.debt = 123_000_000_000;
      // DURAKLAT, oynatma değil. Burada hız 1 vardı ve 600 ms'de bir gün
      // dönerse kredili hesap (Tur 18) borcu kasadan kapatıyordu: "Borç"
      // metriği kayboluyor, kontrol 5 yerine 4 metrik sayıp kırmızı
      // yanıyordu (main'de 10da3af). Komut zaten yeniden çizdiriyor.
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
      await new Promise((r) => setTimeout(r, 600));
      const el = document.querySelector('.topbar');
      return {
        h: Math.round(el.getBoundingClientRect().height),
        metrics: document.querySelectorAll('.metric').length,
        widest: [...document.querySelectorAll('.metric-value')]
          .map((v) => v.textContent.trim())
          .sort((a, b) => b.length - a.length)[0],
      };
    });
    const richRows = await barRows();
    check(
      `${deviceName}: en geniş rakamlarda bile bar iki satır`,
      rich.metrics === 5 && richRows.rows === 2,
      `${rich.metrics} metrik, ${richRows.rows} satır, en uzun değer "${rich.widest}"`,
    );
    // Eşik 100, ölçülen 96 — arada bilerek pay var. İki metrik satırının
    // geometrisi 96 px veriyor (6 dolgu + 18 + 6 + 18 metrik + 6 + 34 hız
    // + 6 dolgu + 2 kenarlık); üçüncü bir satır çıksaydı ~118 px olurdu.
    // Tam 96'ya kurulmuş bir eşik, font metriği bir piksel oynadığında
    // gerçek bir bozulma olmadan kırmızı yanardı — kontrolün işi şekli
    // korumak, pikseli değil.
    check(
      `${deviceName}: en geniş rakamlarda bar 100px'i geçmiyor`,
      rich.h <= 100,
      `${rich.h}px (normalde ${bar.h}px)`,
    );
    await m.evaluate(() => {
      const s = window.__capital.getState();
      s.companies.player.debt = 0;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });

    // Katlama gerçekten açıyor mu — ve açılan içerik ekranda mı?
    const lensHead = m.locator('.collapse-head[data-collapse="lens"]');
    await lensHead.click();
    const lensOpen = await m.evaluate(() => {
      const body = document.querySelector('.lens-body');
      if (!body) return null;
      const r = body.getBoundingClientRect();
      return {
        visible: r.height > 0,
        onScreen: r.top >= 0 && r.bottom <= innerHeight + 1,
        buttons: document.querySelectorAll('.lens-buttons .lens').length,
      };
    });
    check(
      `${deviceName}: lens katmanı açılıyor ve ekranda kalıyor`,
      Boolean(lensOpen && lensOpen.visible && lensOpen.onScreen && lensOpen.buttons === 6),
      lensOpen ? `${lensOpen.buttons} lens, ${lensOpen.onScreen ? 'ekranda' : 'TAŞIYOR'}` : 'açılmadı',
    );

    // Lens seçince katman kendini kapatmalı: seçtikten sonra elle
    // kapatmak zorunda bırakmak fazladan bir dokunuş.
    await m.locator('.lens-buttons .lens').nth(1).click();
    const afterPick = await m.evaluate(() => ({
      closed: document.querySelector('.lensbar')?.classList.contains('closed') ?? false,
      title: document.querySelector('[data-collapse="lens"] .collapse-title')?.textContent ?? '',
    }));
    check(
      `${deviceName}: lens seçilince katman kapanıyor ve seçimi yazıyor`,
      afterPick.closed && afterPick.title.includes('Fırsat'),
      `${afterPick.closed ? 'kapandı' : 'AÇIK KALDI'} · başlık "${afterPick.title.trim()}"`,
    );
    await m.evaluate(() => {
      document.querySelector('.lens-buttons .lens')?.click();
    });

    const outside = dock.buttons.filter((b) => !b.inside);
    check(
      `${deviceName}: rıhtımdaki her düğme ekranda`,
      outside.length === 0 && dock.buttons.length > 0,
      outside.length
        ? outside.map((b) => `${b.panel} sağ kenarı ${b.right} > ${dock.vw}`).join(', ')
        : `${dock.buttons.length} düğme, taşma ${dock.overflow}px`,
    );
    // Cam panellerin `backdrop-filter`'ı sabit konumlu rıhtıma kapsayıcı
    // blok olursa rıhtım üst bara yapışıyor — düğmeler yine "ekranda"
    // sayılırdı (Tur 35 önizlemesinde tam olarak bu oldu).
    check(
      `${deviceName}: rıhtım ekranın altında`,
      Math.abs(dock.bottom - dock.vh) <= 2,
      `alt kenar ${dock.bottom} / ekran ${dock.vh}`,
    );
    const smallest = Math.min(...dock.buttons.map((b) => b.height));
    check(
      `${deviceName}: rıhtım dokunma hedefleri yeterli`,
      smallest >= 44,
      `en kısa düğme ${smallest}px`,
    );

    // Her panel düğmesi gerçekten bir panel açıyor mu — KAYDIRMADAN.
    const buttonCount = dock.buttons.length;
    let opened = 0;
    for (let i = 0; i < buttonCount; i++) {
      const button = m.locator('.topbar-actions button').nth(i);
      await button.click();
      if (await m.locator('.modal').count()) {
        opened++;
        await m.locator('.modal-head button.icon').click();
      }
    }
    check(`${deviceName}: bütün panel düğmeleri açılıyor`, opened === buttonCount && buttonCount > 0,
      `${opened}/${buttonCount}`);

    // Açılan panel görünen ekranda mı? Kullanıcının istediği tam buydu:
    // "ekranın görünen kısmında açılsın".
    await m.locator('.topbar-actions [data-panel="bourse"]').click();
    const openSheet = await m.evaluate(() => {
      const modal = document.querySelector('.modal');
      if (!modal) return null;
      const r = modal.getBoundingClientRect();
      const head = modal.querySelector('.modal-head')?.getBoundingClientRect();
      return {
        visible: Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, r.height),
        headInside: Boolean(head && head.top >= 0 && head.bottom <= innerHeight),
      };
    });
    check(
      `${deviceName}: açılan panel görünen ekranda`,
      Boolean(openSheet && openSheet.visible > 0.95 && openSheet.headInside),
      openSheet ? `görünür %${Math.round(openSheet.visible * 100)}, başlık ${openSheet.headInside ? 'ekranda' : 'DIŞARIDA'}` : 'panel açılmadı',
    );
    // PANEL GERÇEKTEN KAPANDI MI — jestlerden önce zorunlu.
    //
    // Kapatmaya tıklamak yetmiyor: React yeniden çizene kadar alt sayfa
    // hâlâ DOM'da ve ekranın büyük kısmını kaplıyor. Sürükleme o aralıkta
    // başlarsa ilk dokunuş paneli kapatmakla harcanıyor, kamera hiç
    // hareket etmiyor ve ölçüm "kaydırma bozuk" diyor. Sapma iki koşumda
    // da tam 6,75 çıkmıştı — rastgele değil, testin kendi bıraktığı durum.
    await m.locator('.modal-head button.icon').click();
    await m.locator('.modal').waitFor({ state: 'detached' });

    // Jestler: CDP ile GERÇEK dokunuş olayları. Sentetik PointerEvent
    // üretmek yerine tarayıcının kendi dokunuş → pointer çevirisini
    // kullanıyoruz, yani test edilen şey gerçek akışın aynısı.
    const cdp = await mobileContext.newCDPSession(m);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([x, y], i) => ({ x, y, id: i })),
      });
    const info = () => m.evaluate(() => window.__capital.renderInfo());
    const canvasBox = await m.locator('canvas.scene').boundingBox();
    const mx = canvasBox.x + canvasBox.width / 2;
    const my = canvasBox.y + canvasBox.height * 0.42;

    // Kaydırma YÖNÜ. Doğru kaydırmanın tanımı: parmağın tuttuğu zemin
    // noktası, sürükleme boyunca parmağın altında kalır. Kameranın ne
    // kadar hareket ettiğine bakmak yönü doğrulamaz — eski formül
    // hareket ediyordu ama yanlış yöne, 120px'lik sürüklemede tutulan
    // nokta 7,7–8,4 birim kayıyordu.
    //
    // BU KONTROL PINCH'TEN ÖNCE. Yakınlaştırma sonrası kamera 9 birime
    // iniyor ve eğimle birlikte ekranın üstü ufka yaklaşıyor; orada
    // zemin izdüşümü kötü koşullu (ışın yere neredeyse paralel) ve
    // ölçüm kaydırmayı değil ufku ölçüyor. Kameranın merkezli ve
    // varsayılan uzaklıktaki hali, jestin doğruluğunu sınamak için
    // gereken iyi koşullu durum.
    const groundAt = (x, y) =>
      m.evaluate(([px, py]) => {
        const c = document.querySelector('canvas.scene');
        const r = c.getBoundingClientRect();
        return window.__capital.groundAt(
          ((px - r.left) / r.width) * 2 - 1,
          -((py - r.top) / r.height) * 2 + 1,
        );
      }, [x, y]);

    //
    // KAMERANIN DURMASINI BEKLE, SABİT SÜREYİ DEĞİL.
    //
    // Burada `waitForTimeout(700)` vardı ve bu ortamda arada sırada
    // kırmızı yanıyordu: kamera hedefe yumuşatılarak gidiyor, 4 FPS'te
    // 700 ms yalnızca üç kare demek ve hareket henüz bitmemiş oluyor.
    // Ölçüm o zaman kaydırmanın doğruluğunu değil, yumuşatmanın ortasını
    // okuyor. Koşul zamanla değil DURUMLA kurulmalı.
    const cameraSettled = async () => {
      let previous = null;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const target = await m.evaluate(() => window.__capital.renderInfo()?.cameraTarget ?? null);
        if (previous && target && Math.abs(target.x - previous.x) < 1e-4 && Math.abs(target.z - previous.z) < 1e-4) {
          return true;
        }
        previous = target;
        await m.waitForTimeout(120);
      }
      return false;
    };

    /**
     * Sürüklemenin başladığı noktada ne var?
     *
     * Bu ölçüm iki kez kırmızı yandı ve iki kez "kamera hiç hareket
     * etmedi" anlamına gelen aynı sayıyı verdi (6,75). Birincisinde sebep
     * açık kalmış bir paneldi. Sebebi her seferinde elle aramak yerine
     * sondaj artık çarptığı şeyi rapor ediyor: bir daha kırmızı yanarsa
     * hangi öğenin dokunuşu yediğini kendisi söyleyecek.
     */
    const hitAt = (x, y) =>
      m.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return 'yok';
        return `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '-'}`;
      }, [x, y]);

    const dragDrift = async (fromX, fromY, toX, toY) => {
      await cameraSettled();
      const hit = await hitAt(fromX, fromY);
      if (!hit.startsWith('canvas')) {
        return { drift: null, hit };
      }
      const before = await groundAt(fromX, fromY);
      await touch('touchStart', [[fromX, fromY]]);
      for (let i = 1; i <= 6; i++) {
        await touch('touchMove', [[fromX + ((toX - fromX) * i) / 6, fromY + ((toY - fromY) * i) / 6]]);
      }
      await touch('touchEnd', []);
      await cameraSettled();
      const after = await groundAt(toX, toY);
      if (!before || !after) return { drift: null, hit };
      return { drift: Math.hypot(after.x - before.x, after.z - before.z), hit };
    };

    // Harita bandının içinde kal: üst bar ve paneller dışında bir şerit.
    const py = canvasBox.y + canvasBox.height * 0.3;
    const rightDrift = await dragDrift(mx - 55, py, mx + 55, py);
    const downDrift = await dragDrift(mx, py - 40, mx, py + 40);
    check(
      `${deviceName}: yatay sürüklemede tutulan kare kaymıyor`,
      rightDrift.drift !== null && rightDrift.drift < 0.5,
      `sapma ${rightDrift.drift?.toFixed(2) ?? '—'} birim · dokunulan: ${rightDrift.hit}`,
    );
    check(
      `${deviceName}: dikey sürüklemede tutulan kare kaymıyor`,
      downDrift.drift !== null && downDrift.drift < 0.5,
      `sapma ${downDrift.drift?.toFixed(2) ?? '—'} birim · dokunulan: ${downDrift.hit}`,
    );

    const zoomBefore = await info();
    await touch('touchStart', [[mx - 50, my], [mx + 50, my]]);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [[mx - 50 - i * 14, my], [mx + 50 + i * 14, my]]);
    }
    await touch('touchEnd', []);
    await m.waitForTimeout(400);
    const zoomAfter = await info();
    check(`${deviceName}: pinch yakınlaştırıyor`,
      zoomAfter.cameraDistance < zoomBefore.cameraDistance - 0.5,
      `uzaklık ${zoomBefore.cameraDistance.toFixed(1)} → ${zoomAfter.cameraDistance.toFixed(1)}`);

    const spinBefore = await info();
    await touch('touchStart', [[mx - 60, my], [mx + 60, my]]);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [[mx - 60 + i * 10, my], [mx + 60 + i * 10, my]]);
    }
    await touch('touchEnd', []);
    await m.waitForTimeout(400);
    const spinAfter = await info();
    check(`${deviceName}: iki parmak kamerayı döndürüyor`,
      Math.abs(spinAfter.cameraAzimuth - spinBefore.cameraAzimuth) > 0.05,
      `azimut ${spinBefore.cameraAzimuth.toFixed(3)} → ${spinAfter.cameraAzimuth.toFixed(3)}`);

    // Tek dokunuşla seçim. Bu eskiden çalışmıyordu: seçim `hoveredTile`'a
    // bakıyor, o da yalnızca `pointermove`'da güncelleniyordu — parmakla
    // dokunmakta hareket olmadığı için hep boş kalıyordu.
    const inspectorBefore = (await m.locator('.inspector').textContent()) ?? '';
    await touch('touchStart', [[mx, my]]);
    await touch('touchEnd', []);
    await m.waitForTimeout(400);
    const inspectorAfter = (await m.locator('.inspector').textContent()) ?? '';
    check(`${deviceName}: dokunmak parsel seçiyor`,
      inspectorAfter !== inspectorBefore && /Arsa \d+-\d+/.test(inspectorAfter),
      (/Arsa \d+-\d+/.exec(inspectorAfter) ?? ['seçim yok'])[0]);

    // Çift dokunuş: saat bağımsız iki yönlü kontrol. Yazılım
    // rasterizasyonunda ana iş parçacığı kare başına yüzlerce ms bloke
    // olduğu için iki dokunuş arası 1 saniyeyi bulabiliyor; o yüzden
    // GÖZLENEN aralığa göre doğru davranışı bekliyoruz. İki dal da sert
    // bir iddia — hiçbiri kontrolü sessizce kapatmıyor.
    const fx = canvasBox.x + canvasBox.width * 0.3;
    const fy = canvasBox.y + canvasBox.height * 0.52;
    // Kameranın çift dokunuştan ÖNCEKİ hedefi. Negatif dalın ölçütü bu:
    // "odaklanmadı" demek "kamera kareden uzak" değil, "kamera HAREKET
    // ETMEDİ" demek. Kamera zaten tesadüfen o karenin üstündeyse uzaklığa
    // bakan bir kontrol yanlış kırmızı yakar.
    const beforeTapTarget = (await info()).cameraTarget;
    await touch('touchStart', [[fx, fy]]);
    await touch('touchEnd', []);
    await touch('touchStart', [[fx, fy]]);
    await touch('touchEnd', []);
    await m.waitForTimeout(800);
    const tapped = (await m.locator('.inspector').textContent()) ?? '';
    const coords = /Arsa (\d+)-(\d+)/.exec(tapped);
    const focusInfo = await info();
    if (!coords) {
      check(`${deviceName}: çift dokunuş`, false, 'dokunulan nokta haritaya düşmedi');
    } else {
      const off = Math.hypot(
        focusInfo.cameraTarget.x - Number(coords[1]),
        focusInfo.cameraTarget.z - Number(coords[2]),
      );
      const gap = focusInfo.lastTapGapMs;
      const windowMs = focusInfo.doubleTapWindowMs;
      if (gap < windowMs) {
        check(`${deviceName}: pencere içinde çift dokunuş odaklanıyor`, off < 0.6,
          `ara ${Math.round(gap)}ms < ${windowMs}ms · sapma ${off.toFixed(2)}`);
      } else {
        const moved = Math.hypot(
          focusInfo.cameraTarget.x - beforeTapTarget.x,
          focusInfo.cameraTarget.z - beforeTapTarget.z,
        );
        check(`${deviceName}: pencere dışında ikinci dokunuş kamerayı oynatmıyor`, moved < 0.2,
          `ara ${Math.round(gap)}ms ≥ ${windowMs}ms · kamera ${moved.toFixed(2)} birim oynadı`);
      }
    }

    // Parsel detayı ve satın alma butonu ekrana geliyor mu.
    //
    // Bildirilen hata: "arsaya tıklayınca detayını görüp alamıyorsun, o
    // butonun olduğu yer gelmiyor bile ekrana". Ölçüldüğünde panel
    // 664px'lik bir ekranda 913px'te başlıyordu ve butona ulaşmak için
    // HUD'u ~645px kaydırmak gerekiyordu.
    const vacantTile = await m.evaluate(() => {
      const state = window.__capital.getState();
      // Açık bölge şartı — masaüstündeki findTile ile aynı gerekçe.
      const tile = state.map.tiles.find((t) => {
        if (t.kind !== 'plot' || t.structureId || t.ownerId) return false;
        const district = state.districts[t.districtId];
        return !district || district.opensOnDay === undefined || state.time.day >= district.opensOnDay;
      });
      if (tile) window.__capital.selectTile(tile.id);
      return tile ? tile.id : null;
    });
    await m.waitForTimeout(500);
    const sheet = await m.evaluate(() => {
      const vh = window.innerHeight;
      const onScreen = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= vh && r.height > 0;
      };
      const buy = [...document.querySelectorAll('button')].find((b) =>
        /Parseli satın al/.test(b.textContent || ''),
      );
      const close = document.querySelector('.inspector .inspector-head button.icon');
      const closeRect = close?.getBoundingClientRect();
      return {
        buyExists: Boolean(buy),
        buyOnScreen: onScreen(buy),
        headOnScreen: onScreen(document.querySelector('.inspector .inspector-head')),
        // Kapatma düğmesi olmadan alt sayfa haritayı kilitler.
        closeBigEnough: Boolean(closeRect && closeRect.width >= 40 && closeRect.height >= 40),
        scrollNeeded: buy ? Math.max(0, Math.round(buy.getBoundingClientRect().bottom - vh)) : -1,
      };
    });
    check(`${deviceName}: boş parselde satın alma butonu çıkıyor`, sheet.buyExists,
      `kare ${vacantTile}`);
    check(`${deviceName}: satın alma butonu KAYDIRMADAN görünüyor`, sheet.buyOnScreen,
      `gereken kaydırma ${sheet.scrollNeeded}px`);
    check(`${deviceName}: detay başlığı ve kapatma düğmesi erişilebilir`,
      sheet.headOnScreen && sheet.closeBigEnough, '44px dokunma hedefi');
    await m.evaluate(() => window.__capital.selectTile(null));
    await m.waitForTimeout(300);

    check(`${deviceName}: konsol temiz`, mobileErrors.length === 0, mobileErrors.slice(0, 2).join(' | '));
    await m.screenshot({ path: `${OUT}/mobile-${deviceName.replace(/\W+/g, '')}.png` });
    await mobileContext.close();
  }

  // Rehber telefonda: kart üst barın altında; parsel detayı açıkken yapı
  // listesi "Buraya ne kurulur?" ile öne geliyor (Tur 26'nın bulduğu boşluk).
  {
    const phone = await browser.newContext({ ...devices['iPhone 13'] });
    const { p: tp } = await tutorialWalk(phone, 'iPhone 13');
    /*
     * Yenileme burada, ana sayfa kapandıktan SONRA: yazılımsal GPU'da iki
     * canlı WebGL bağlamıyla yenilemek açılışı 20 saniyenin ötesine
     * itiyordu (Tur 24'ün "Dil" dersi).
     */
    await tp.locator('[data-panel="help"]').click();
    await tp.locator('[data-coach-restart]').click();
    await tp.waitForSelector('.coach[data-coach-step="welcome"]', { timeout: 5000 });
    await tp.locator('[data-coach="next"]').click();
    /*
     * Oyuncu zaten mağaza kurmuş: yeniden başlayan rehber tamamlanmış
     * adımları atlıyor ve "zamanı başlat"ta duruyor (karşılama zamanı
     * durdurdu). Beklenen adım sabit bir ad değil, yenilemeden ÖNCEKİ adım.
     * Açılış otomatik kayıttan dönüyor (30 sn aralık); yeniden başlatmadan
     * sonra bir kayıt düşsün ki yenilenen oyun da durmuş olsun.
     */
    await tp.waitForTimeout(500);
    const beforeReload = await tp.evaluate(() => window.__capital.tutorialStep());
    await tp.waitForTimeout(31_000);
    await tp.reload();
    await tp.waitForSelector('.topbar', { timeout: 30000 });
    await tp.waitForTimeout(800);
    const afterReload = await tp.evaluate(() => window.__capital.tutorialStep());
    check('Sayfa yenilenince rehber kaldığı adımdan sürüyor',
      beforeReload !== null && afterReload === beforeReload, `${beforeReload} → ${afterReload}`);
    await tp.close();
    await phone.close();
  }

  await finish(browser, consoleErrors);
})().catch((e) => {
  console.error('TEST ÇÖKTÜ:', e);
  process.exit(2);
});
