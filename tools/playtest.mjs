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
      total: tiles.length,
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
  check('Şehir mevcut yapılarla dolu', fabric.occupied / plots > 0.5, `${fabric.occupied}/${plots} parsel dolu`);
  check(
    'Boş parsel kıt ama var',
    vacantShare > 0.2 && vacantShare < 0.55,
    `${fabric.vacant}/${plots} parsel boş — %${Math.round(vacantShare * 100)}`,
  );

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
        const before = window.__capital.renderInfo()?.frameCount ?? 0;
        window.__capital.setLens(l);
        window.__capital.setTimeOfDay(0.75); // güneşin en alçak olduğu an
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const info = window.__capital.renderInfo();
          if (info && info.activeLens === l && info.frameCount > before + 1) return info;
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
  section('Zincir kartı');

  // Oyuncuya zinciri kurabilecek sermaye ver; test parayı değil arayüzü ölçüyor.
  await page.evaluate(() => {
    const s = window.__capital.getState();
    const p = s.companies[s.playerCompanyId];
    p.cash = 50_000_000;
    p.netWorth = 50_000_000;
    window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
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

  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 2 }));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 0 }));
  await page.waitForTimeout(400);

  const flow = await page.evaluate(() => {
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

    return {
      shoppers: info.shopperCount,
      stores: flows.length,
      playerId: state.playerCompanyId,
      playerUnits: unitsBy[state.playerCompanyId] ?? 0,
      playerCars: carsBy[state.playerCompanyId] ?? 0,
      unitLeader: rank(unitsBy)[0],
      carLeader: rank(carsBy)[0],
      companies: Object.keys(carsBy).length,
    };
  });

  check('Satan mağaza için müşteri yola çıkıyor', flow.shoppers > 0,
    `${flow.shoppers} araç / ${flow.stores} mağaza`);
  check(
    'Oyuncunun mağazasına kendi renginde müşteri geliyor',
    flow.playerUnits > 0 ? flow.playerCars > 0 : true,
    `oyuncu ${flow.playerUnits.toFixed(0)} birim → ${flow.playerCars} araç`,
  );
  // Asıl kontrol bu: en çok satan şirketin kapısı en kalabalık olmalı.
  // Bu tutmazsa akış "canlı görünen ama yalan söyleyen" bir süse dönüşür.
  check(
    'En çok satanın kapısı en kalabalık',
    flow.unitLeader === flow.carLeader,
    `birimde ${flow.unitLeader}, araçta ${flow.carLeader}`,
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
    const before = cap.getState().news.length;

    // Sonra rakibi oyuncunun üstüne çıkar.
    cap.getState().companies[rival.id].cash = 400_000_000;
    cap.engine.runDay();
    const after = cap.getState();
    const fresh = after.news.slice(0, after.news.length - before);
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
    const before = cap.getState().news.length;
    cap.getState().companies[cap.getState().playerCompanyId].cash = 900_000_000;
    cap.engine.runDay();
    const after = cap.getState();
    const fresh = after.news.slice(0, after.news.length - before);
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
    const next = getState();
    return {
      name: target.name,
      gone: next.companies[target.id] === undefined,
      mine,
      theirs,
      after: Object.values(next.buildings).filter((b) => b.companyId === next.playerCompanyId).length,
      orphans: Object.values(next.buildings).filter((b) => b.companyId === target.id).length,
    };
  });
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
      s.companies.player.cash = 999_000_000_000;
      s.companies.player.netWorth = 999_000_000_000;
      s.companies.player.debt = 123_000_000_000;
      window.__capital.engine.dispatch({ type: 'SET_SPEED', speed: 1 });
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
      const tile = window.__capital
        .getState()
        .map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.ownerId);
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
