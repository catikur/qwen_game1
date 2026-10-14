// Tarayıcıda uçtan uca oynanabilirlik testi.
// Çalıştırma: pnpm build && node tools/playtest.mjs [--smoke]
//
// --smoke (ya da PLAYTEST=smoke): yalnızca açılış, şehir, döngü, parsel,
// inşa, harita, görünüm ve panel bölümleri — birkaç dakikada "oyun açılıyor
// ve oynanıyor" cevabı. Tam koşu birleştirmeden önce; duman her değişiklikte.
import http from 'node:http';
import fs from 'node:fs';
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
};

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
const startedAt = Date.now();
const section = (t) => console.log(`\n=== ${t} === (${Math.round((Date.now() - startedAt) / 1000)} sn)`);
const SMOKE = process.argv.includes('--smoke') || process.env.PLAYTEST === 'smoke';

// Kapta önceden kurulmuş Chromium varsa o; yoksa (CI) Playwright'ın kendi
// indirdiği tarayıcı. Yol elle de verilebilir.
const CHROMIUM = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = http.createServer((req, res) => {
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
  } catch {
    /* depo kapalı: rehber zaten hatırlanmaz */
  }
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
  process.exit(fail ? 1 : 0);
}

(async () => {
  await new Promise((r) => server.listen(8811, r));
  const browser = await chromium.launch({
    ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
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
  const unlockProbe = await page.evaluate(() => {
    const s = window.__capital.getState();
    const district = s.districts.find((d) => d.opensOnDay !== undefined && d.opensOnDay > s.time.day);
    if (!district) return null;
    window.__capital.unlockProbe = { id: district.id, was: district.opensOnDay };
    district.opensOnDay = s.time.day + 12;
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
  await page.waitForTimeout(1200);
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
    stored: localStorage.getItem('capitalforge.audio.muted'),
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
  // ±1 araç toleransı bilinçli: dağıtım MAĞAZA başına dürüst ve görsel
  // tavanlı (bir kapıya en fazla N araç). Satışı az sayıda büyük mağazada
  // yoğunlaşan lider o tavana çarpınca şirket toplamında 1 araçla
  // geçilebiliyor — akış yalan söylemiyor, kuantalanıyor. Gerçek bir
  // yalan çok araçlık farkla görünür ve hâlâ kırmızı yakar.
  //
  // Beş ayrı anın çoğunluğu (Tur 24). Tek an kırılgandı: oyun gerçek
  // zamanda aktığı için her koşu başka bir güne denk geliyor ve iki şirket
  // birimde başa baş giderken o an 2–3 araçlık bir kuanta farkı çıkabiliyor.
  // 15 anlık ölçümde main 12/15 geçti, kalanlarda fark 2–3 araç. Akış
  // satışı izlemeseydi beş anın hiçbiri geçmezdi; çoğunluk o yalanı hâlâ
  // yakalıyor ama tek bir talihsiz anı yalan saymıyor.
  const flowSamples = [flow];
  for (let i = 0; i < 4; i++) {
    await runBriefly(700);
    flowSamples.push(await sampleFlow());
  }
  const honest = flowSamples.filter((f) => f.unitLeader === f.carLeader || f.unitLeaderCars >= f.carLeaderCars - 1);
  const worst = flowSamples.find((f) => !honest.includes(f)) ?? flow;
  check(
    'En çok satanın kapısı en kalabalık (±1 araç, 5 anın çoğunluğu)',
    honest.length >= 3,
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
    const hit = fresh.find((n) => n.title.includes('geçtin'));
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
  const organicVictory = await page
    .waitForFunction(() => document.querySelector('.gameover.victory') !== null, null, { timeout: 4000 })
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
  const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await exportButton.click();
  const downloaded = await download;
  check('Dışa aktarma tarayıcıda gerçek bir indirme başlatıyor', downloaded !== null,
    downloaded ? downloaded.suggestedFilename() : 'indirme olayı yok');
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
  check('Bozuk kayıtta kurulum ekranına düşüyor', true);
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
  await page.evaluate(() => window.__capital.setLens('opportunity'));
  await page.waitForTimeout(300);
  const lensDecor = await page.evaluate(() => window.__capital.renderInfo());
  await page.evaluate(() => window.__capital.setLens('none'));
  await page.waitForTimeout(300);
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
    .waitForFunction(() => document.querySelector('.gameover.victory') !== null, null, { timeout: 5000 })
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
    await lp.fill('.newgame-field input[type="text"]', 'Lig Holding');
    await lp.locator('button:has-text("Şirketi kur")').click();
    await lp.waitForSelector('.topbar', { timeout: 20000 });
    const leagueBoot = await lp.evaluate(() => {
      const s = window.__capital.getState();
      return { week: s.league?.weekId, log: s.commandLog?.length ?? -1 };
    });
    check('Lig koşusu haftanın kimliğiyle başlıyor', /^\d{4}-W\d{2}$/.test(leagueBoot.week ?? ''), leagueBoot.week);
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
      await lp.locator('.league-result button:has-text("Tabloya")').click();
      await lp.waitForTimeout(300);
      await lp.locator('.league-result button:has-text("Tabloyu aç")').click();
      await lp.waitForSelector('[data-league-row]', { timeout: 5000 }).catch(() => null);
      const rows = await lp.locator('[data-league-row]').count();
      check('Skor tabloya yazılıyor', rows === 1, `${rows} satır`);
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
    await hp.waitForTimeout(500);
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
    check('Kurulumda dil seçici var, Türkçe seçili',
      (await lp.locator('.newgame .locale-option').count()) === 2 &&
        (await lp.locator('.newgame [data-locale="tr"][aria-pressed="true"]').count()) === 1);
    await lp.locator('.newgame [data-locale="en"]').click();
    await lp.waitForTimeout(200);
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
    await lp.locator('.topbar-actions [data-panel="help"]').click();
    await lp.waitForTimeout(300);
    check('Yardım panelinde dil seçici', (await lp.locator('.help .locale-option').count()) === 2);
    await lp.locator('.help [data-locale="tr"]').click();
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
      return { vw, overflow: nav.scrollWidth - nav.clientWidth, buttons };
    });
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
