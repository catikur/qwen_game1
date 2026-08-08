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

  //
  // SABİT `sleep` KULLANMA. Bu ortamda kare süresi sahnenin ağırlığına
  // göre 20 ms ile 1 sn arasında değişiyor; sabit bir bekleme yavaş
  // koşumda bir adım geriden okur ve ÇALIŞAN bir özelliği hatalı
  // raporlar. `timeOfDay` her karede biraz ilerlediği için 0,75'in
  // üstüne çıkmış olması en az bir karenin çizildiğinin kanıtı.
  //
  const atNight = async (lens) =>
    page.evaluate(
      async (l) => {
        window.__capital.setLens(l);
        window.__capital.setTimeOfDay(0.75); // güneşin en alçak olduğu an
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const info = window.__capital.renderInfo();
          if (info && info.activeLens === l && info.timeOfDay > 0.75) return info;
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
  await page.locator('.topbar-actions button', { hasText: 'Rakipler' }).click();
  await page.waitForTimeout(300);
  check('Rakip tablosu doluyor', (await page.locator('.modal .table tbody tr').count()) >= 5);
  await page.keyboard.press('Escape');

  await page.locator('.topbar-actions button', { hasText: 'Şirket' }).click();
  await page.waitForTimeout(300);
  check('Şirket paneli açılıyor', (await page.locator('.company').count()) === 1);
  await page.keyboard.press('Escape');

  // ---------- Zincir kartı ----------
  // Motor katmanı A parçasında doğrulandı; burada bakılan şey oyuncunun
  // gerçekten görüp kullanabildiği mi.
  section('Zincir kartı');

  // Oyuncuya zinciri kurabilecek sermaye ver; test parayı değil arayüzü ölçüyor.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies[s.playerCompanyId];
    p.cash = 50_000_000;
    p.netWorth = 50_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });

  await page.locator('.topbar-actions button', { hasText: 'Zincir' }).click();
  await page.waitForTimeout(400);
  check('Zincir paneli açılıyor', (await page.locator('.modal').count()) === 1);

  const cardCount = await page.locator('.chain').count();
  check('Satılan ürün için zincir kartı çıkıyor', cardCount >= 1, `${cardCount} kart`);

  const slots = await page.locator('.chain').first().locator('.chain-slot').count();
  check('Kartta dört yuva var', slots === 4, `${slots} yuva`);

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

  // ---------- Rekabet kartı ----------
  // Kollar A parçasında motorda çalışıyordu ama oyuncunun göreceği bir
  // yüzü yoktu. Burada bakılan şey kartın DOĞRU şeyi söyleyip söylemediği
  // ve hamlenin gerçekten çalışması.
  section('Rekabet kartı');

  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies[s.playerCompanyId];
    p.cash = 50_000_000;
    p.netWorth = 50_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
  });

  await page.locator('.topbar-actions button', { hasText: 'Rekabet' }).click();
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

  await page.locator('.topbar-actions button', { hasText: 'Borsa' }).click();
  await page.waitForTimeout(400);
  check('Borsa paneli açılıyor', (await page.locator('.bourse').count()) === 1);

  const listings = await page.locator('.bourse-row').count();
  check('Rakipler listeleniyor', listings >= 3, `${listings} şirket`);

  const trust = await page.locator('.bourse-trust').first().textContent();
  check('Hisse fiyatının yanında güven yazıyor', /primli|iskontolu/.test(trust || ''), (trust || '').trim());

  const stakeText = await page.locator('.bourse-stake-text').first().textContent();
  check('Kontrole ne kadar kaldığı yazıyor', /kontrol için/.test(stakeText || ''),
    (stakeText || '').trim().slice(0, 60));

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

  // Devralma: haritada gerçekten karşılığı var mı?
  const takeover = await page.evaluate(() => {
    const { engine, getState } = window.__capital;
    const s = getState();
    const rows = Object.values(s.companies).filter((c) => c.id !== s.playerCompanyId);
    const target = rows[0];
    const mine = Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId).length;
    const theirs = Object.values(s.buildings).filter((b) => b.companyId === target.id).length;
    engine.dispatch({ type: 'BUY_SHARES', companyId: target.id, count: 5100 });
    engine.runDay();
    return {
      name: target.name,
      gone: getState().companies[target.id] === undefined,
      mine,
      theirs,
      after: Object.values(getState().buildings).filter((b) => b.companyId === getState().playerCompanyId).length,
    };
  });
  check('Devralınan şirket oyundan çıkıyor', takeover.gone, takeover.name);
  check('Devralınan binalar haritada el değiştiriyor',
    takeover.after === takeover.mine + takeover.theirs,
    `${takeover.mine} → ${takeover.after} (+${takeover.theirs})`);

  await page.waitForTimeout(400);
  const remaining = await page.locator('.bourse-row').count();
  check('Devralınan şirket listeden düşüyor', remaining === listings - 1,
    `${listings} → ${remaining}`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 }));

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
  check(
    'Sokak ve parsel toplamı haritayı kapatıyor',
    visual.roadInstances + visual.plotInstances ===
      (await page.evaluate(() => window.__capital.getState().map.tiles.length)),
    'kayıp kare yok',
  );

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

  // ---------- Mobil ----------
  //
  // Bu bölüm eskiden tek satırdı: "dar ekranda yatay taşma yok". O kontrol
  // HİÇBİR ZAMAN başarısız olamıyordu, çünkü `body`'de `overflow: hidden`
  // varken `scrollWidth − clientWidth` her koşulda 0 çıkar. Oysa üst bar
  // 1002px genişliğinde takılı kalıyordu ve telefonda hiçbir panel
  // düğmesine ulaşılamıyordu. Şimdi eleman kutuları görüntü alanına karşı
  // ölçülüyor ve jestler gerçek dokunuş olaylarıyla sürülüyor.
  //
  section('Mobil');
  for (const deviceName of ['iPhone 13', 'Pixel 7']) {
    const mobileContext = await browser.newContext({ ...devices[deviceName] });
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

    // Her panel düğmesi gerçekten bir panel açıyor mu.
    const buttonCount = await m.locator('.topbar-actions button').count();
    let opened = 0;
    for (let i = 0; i < buttonCount; i++) {
      const button = m.locator('.topbar-actions button').nth(i);
      await button.scrollIntoViewIfNeeded();
      await button.click();
      if (await m.locator('.modal').count()) {
        opened++;
        await m.locator('.modal-head button.icon').click();
      }
    }
    check(`${deviceName}: bütün panel düğmeleri açılıyor`, opened === buttonCount && buttonCount > 0,
      `${opened}/${buttonCount}`);

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
        check(`${deviceName}: pencere dışında ikinci dokunuş odaklanmıyor`, off > 0.6,
          `ara ${Math.round(gap)}ms ≥ ${windowMs}ms · kamera yerinde`);
      }
    }

    check(`${deviceName}: konsol temiz`, mobileErrors.length === 0, mobileErrors.slice(0, 2).join(' | '));
    await m.screenshot({ path: `${OUT}/mobile-${deviceName.replace(/\W+/g, '')}.png` });
    await mobileContext.close();
  }

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
