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
const section = (t) => console.log(`\n=== ${t} ===`);

const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (rel === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    res.writeHead(404);
    res.end('nf');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

/** Belirli türde bir kare bulur: 'vacant' | 'occupied' | 'road' | 'civic'. */
const findTile = (page, kind) =>
  page.evaluate((want) => {
    const tiles = window.__capital.getState().map.tiles;
    const match = tiles.find((t) => {
      if (want === 'road') return t.kind === 'road';
      if (want === 'civic') return t.kind === 'civic';
      if (want === 'occupied') return t.kind === 'plot' && t.structureId && !t.ownerId;
      return t.kind === 'plot' && !t.structureId && !t.ownerId;
    });
    return match ? match.id : null;
  }, kind);

(async () => {
  await new Promise((r) => server.listen(8811, r));
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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
  check('CEO seçenekleri listeleniyor', (await page.locator('.ceo-card').count()) === 6);
  check('CEO portreleri çiziliyor', (await page.locator('.ceo-card svg').count()) === 6);

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

  await page.screenshot({ path: `${OUT}/newgame.png` });

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

  // ---------- Sahne ----------
  section('Şehir sahnesi');
  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.scene');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return { ok: Boolean(gl), w: canvas?.width, h: canvas?.height };
  });
  check('WebGL bağlamı canlı', webgl.ok, `canvas ${webgl.w}×${webgl.h}`);

  const fabric = await page.evaluate(() => {
    const tiles = window.__capital.getState().map.tiles;
    return {
      roads: tiles.filter((t) => t.kind === 'road').length,
      civic: tiles.filter((t) => t.kind === 'civic').length,
      occupied: tiles.filter((t) => t.kind === 'plot' && t.structureId).length,
      vacant: tiles.filter((t) => t.kind === 'plot' && !t.structureId).length,
    };
  });
  check('Şehirde sokak ızgarası var', fabric.roads > 200, `${fabric.roads} sokak karesi`);
  check('Şehir mevcut yapılarla dolu', fabric.occupied > 120, `${fabric.occupied} dolu parsel`);
  check('Boş parsel kıt ama var', fabric.vacant > 60 && fabric.vacant < 200, `${fabric.vacant} boş parsel`);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/city-day.png` });

  // ---------- Simülasyon ----------
  section('Simülasyon döngüsü');
  const day0 = await page.evaluate(() => window.__capital.getState().time.day);
  await page.waitForTimeout(6000);
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

  // ---------- Satın alma ve inşa ----------
  section('Satın alma, devralma, inşa');
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

  await page.locator('.buildcard').first().click();
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

  const atNight = async (lens) =>
    page.evaluate(
      async (l) => {
        window.__capital.setLens(l);
        window.__capital.setTimeOfDay(0.75); // güneşin en alçak olduğu an
        await new Promise((r) => setTimeout(r, 400));
        return window.__capital.renderInfo();
      },
      lens,
    );

  const darkest = await atNight('none');
  check('Gecenin en karanlık anında güneş sönmüyor', darkest.sunIntensity >= 0.6,
    `güneş ${darkest.sunIntensity.toFixed(2)}`);
  check('Gecenin en karanlık anında ortam ışığı yeterli', darkest.hemisphereIntensity >= 0.7,
    `ortam ${darkest.hemisphereIntensity.toFixed(2)}`);
  // Pencere parıltısı binanın tüm yüzeyine düz uygulanıyor; yüksek olursa
  // gece bütün şehir tek parça altın bir kütleye dönüşüyor.
  check('Pencere parıltısı binaların rengini bastırmıyor', darkest.fabricEmissive <= 0.05,
    `emissive ${darkest.fabricEmissive.toFixed(3)}`);
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
  await page.locator('.topbar-actions button', { hasText: 'Rakipler' }).click();
  await page.waitForTimeout(300);
  check('Rakip tablosu doluyor', (await page.locator('.modal .table tbody tr').count()) >= 5);
  await page.keyboard.press('Escape');

  await page.locator('.topbar-actions button', { hasText: 'Şirket' }).click();
  await page.waitForTimeout(300);
  check('Şirket paneli açılıyor', (await page.locator('.company').count()) === 1);
  await page.keyboard.press('Escape');

  // ---------- Kayıt ----------
  section('Kayıt sistemi');
  await page.locator('.topbar-actions button', { hasText: 'Kayıt' }).click();
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
  // ve SwiftShader tavanı 6-8 FPS. Asıl korunması gereken şey zaten kare
  // hızı değil — OYUN SAATİNİN GERÇEK ZAMANLA UYUMU. Düşük kare hızında
  // simülasyon sessizce yavaşlarsa seçilen hız kademesi yalan söyler;
  // motorun dt üst sınırı tam olarak bunu engellemek için var.
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

  // ---------- Responsive ----------
  section('Responsive');
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('Dar ekranda yatay taşma yok', overflow <= 0, `taşma ${overflow}px`);
  await page.screenshot({ path: `${OUT}/city-mobile.png` });

  console.log('\n================================');
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
