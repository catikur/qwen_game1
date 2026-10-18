// CapitalForge Lite web sürümü: uçtan uca test ve senaryo kareleri.
//
// Yerel lig sunucusu (packages/lite-league/test/local-server.ts, bellekte
// SQLite) açılıyor, web sürümü ona bağlı derleniyor, Chromium'da:
// - sessiz hesap açılıyor, oyuncu alım yapıyor, eşitlemeden sonra
//   tarayıcıdaki durum sunucunun oynattığıyla bit bit aynı;
// - lige adla katılınca haftalık grupta görünüyor;
// - taşıma koduyla ikinci tarayıcı aynı oyunu alıyor;
// - kasayı elle şişiren istemci sunucunun durumuna dönüyor;
// - aynı tarayıcıda ikinci sekme açılınca eskisi duruyor (tek örnek);
// - yanıtı kaybolan eşitleme aynı kimlikle yineleniyor (ikinci kez uygulanmıyor);
// - oyuncunun tarayıcısındaki hizmet çalışanı güncellenince çevrimdışı açılış
//   sürüyor, adresi sabit değişen dosyalar (yazı tipleri) tazeleniyor.
// Ardından senaryo kareleri (SHOTS dizinine).
//
// Çalıştırma: node tools/lite-web-e2e.mjs [--shots-only] [--only=<kare adı öneki>]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try {
      return require(id);
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error('Playwright bulunamadı. Kurulum: npm i -g playwright');
}
const { chromium } = loadPlaywright();

const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS || join(ROOT, 'apps/lite-web/shots');
const LEAGUE_PORT = 8788;
const WEB_PORT = 4174;
const WORKER_PORT = 4176;
const LEAGUE = `http://127.0.0.1:${LEAGUE_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}/`;
const shotsOnly = process.argv.includes('--shots-only');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length) ?? '';
const children = [];

function start(command, args, env = {}) {
  // Ayrı süreç grubu: pnpm'in altındaki vite de birlikte kapansın.
  const child = spawn(command, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      if (/http:\/\/127\.0\.0\.1/.test(String(data))) resolve(child);
    });
    child.on('exit', (code) => reject(new Error(`${command} çıktı: ${code}`)));
  });
}

function stopAll() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* zaten kapanmış */
    }
  }
}
process.on('exit', stopAll);

async function wait(test, label, timeout = 15_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await test();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`zaman aşımı: ${label}`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✔ ${message}`);
}

async function server(path, account) {
  const response = await fetch(`${LEAGUE}/${path}`, { headers: { authorization: `Bearer ${account.id}.${account.token}` } });
  return response.json();
}

/** Sekmeyi gizle: oyun duruyor ve eşitliyor (pagehide/visibilitychange). */
async function hide(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Sekmeyi yeniden göster. */
async function show(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const local = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('lite.save') ?? 'null'));
const accountOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('lite.league.account') ?? 'null'));

async function e2e(browser) {
  // Hizmet çalışanı kapalı: Playwright onun üstünden giden istekleri yakalayamıyor (kaybolan yanıt denemesi).
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1, locale: 'tr-TR', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(WEB);
  await page.waitForTimeout(2_500);
  check((await accountOf(page)) === null, 'bir bakıp çıkana hesap açılmıyor');
  // Lig penceresi açılınca (ya da bir dakika oynanınca) sessiz, adsız hesap.
  await page.click('[data-testid="league"]');
  const account = await wait(() => accountOf(page), 'sessiz hesap');
  check(account.name === '', 'lig açılınca adsız hesap açıldı');
  await page.keyboard.press('Escape');
  // Fırının üç kademesine sırayla alım (parası yettikçe).
  for (let round = 0; round < 40; round++) {
    for (const stage of [2, 0, 1]) await page.click(`[data-testid="stage-bakery-${stage}"]`).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await hide(page);
  await page.waitForTimeout(1_000);
  const save = await server('v1/save', account);
  const mine = await local(page);
  check(save.version >= 1, `sunucu eşitlemeyi aldı (sürüm ${save.version})`);
  check(JSON.stringify(save.state) === JSON.stringify(mine.state), 'tarayıcıdaki durum sunucununkiyle bit bit aynı');
  const levels = save.state.chains.bakery.levels;
  check(levels[2] > 0 && levels[0] > 0, `fırın alındı (seviyeler ${levels.join('/')})`);
  check(mine.ops.length === 0, 'günlükte bekleyen kayıt yok');

  // Yanıtı kaybolan eşitleme: sunucu işliyor, tarayıcı duymuyor. Yineleme aynı kimlikle;
  // sunucu tanıyıp ikinci kez uygulamıyor (yeni kimlikle gitse 409 sonrası yeniden uygulanırdı).
  await show(page);
  await page.waitForTimeout(1_500);
  const batches = [];
  let lose = true;
  await page.route('**/v1/sync', async (route) => {
    batches.push(JSON.parse(route.request().postData() ?? '{}').batch);
    if (lose) {
      lose = false;
      await route.fetch();
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  const committed = (await server('v1/save', account)).version + 1;
  await hide(page);
  await wait(() => batches.length >= 1, 'kaybolan eşitleme');
  await page.waitForTimeout(500);
  check((await server('v1/save', account)).version === committed, 'sunucu kaybolan gönderimi işledi');
  await show(page);
  await wait(async () => batches.length >= 2 && (await local(page))?.base === committed, 'yineleme');
  check(batches[1] === batches[0], 'yineleme aynı kimlikle');
  check((await server('v1/save', account)).version === committed, 'sunucu ikinci kez uygulamadı');
  await page.unroute('**/v1/sync');
  await hide(page);
  await wait(async () => (await local(page))?.ops.length === 0, 'son eşitleme');
  check(JSON.stringify((await server('v1/save', account)).state) === JSON.stringify((await local(page)).state), 'sonra yine bit bit aynı');

  // Yanıtı kaybolan gönderimin tekrarına sunucu "bilinmiyor" derse (arada başka cihazdan çok gönderim
  // geçmiş, kimlik listeden düşmüş): istemci o kayıtları yeniden uygulamıyor, sonraki gönderimde yok.
  await show(page);
  await page.waitForTimeout(8_000);
  const sent = [];
  await page.route('**/v1/sync', async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? '{}'));
    if (sent.length === 1) {
      await route.fetch();
      await route.abort('failed');
    } else if (sent.length === 2) {
      const now = await server('v1/save', account);
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'stale', ...now, uncertain: true }) });
    } else {
      await route.continue();
    }
  });
  await hide(page);
  await wait(() => sent.length >= 1, 'kaybolan eşitleme (bilinmiyor)');
  await page.waitForTimeout(500);
  await show(page);
  await wait(() => sent.length >= 2, 'yineleme (bilinmiyor)');
  await page.waitForTimeout(2_500);
  await hide(page);
  await wait(() => sent.length >= 3, 'bilinmiyor sonrası gönderim');
  const steps = (ops) => ops.reduce((n, op) => n + (op[0] === 't' ? op[1] : 0), 0);
  check(sent[1].batch === sent[0].batch, 'yineleme aynı kimlikle (bilinmiyor)');
  check(steps(sent[2].ops) < steps(sent[0].ops), `"bilinmiyor" sonrası kaybolan gönderimin kayıtları yeniden gönderilmedi (${steps(sent[2].ops)} < ${steps(sent[0].ops)} adım)`);
  await wait(async () => (await local(page))?.ops.length === 0, 'son eşitleme (bilinmiyor)');
  await page.unroute('**/v1/sync');
  check(JSON.stringify((await server('v1/save', account)).state) === JSON.stringify((await local(page)).state), '"bilinmiyor" sonrası da bit bit aynı');

  // Çevrimdışı oyun: gösterge çıkıyor, oyun cihazda sürüp kaydediliyor; internet gelince hemen
  // eşitleniyor, çevrimdışı oynanan süre sunucuda da sayılıyor.
  await show(page);
  await context.setOffline(true);
  await page.locator('[data-testid="offline"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(6_000);
  const offlineSave = await local(page);
  check(offlineSave.ops.length > 0, 'çevrimdışı oyun cihaza kaydediliyor');
  await page.screenshot({ path: join(SHOTS, 'web-offline.png') });
  await context.setOffline(false);
  await page.locator('[data-testid="offline"]').waitFor({ state: 'detached', timeout: 15_000 });
  check((await page.getByText(/İnternet geldi|Back online/).count()) > 0, 'internet gelince "eşitlendi" bildirimi');
  await hide(page);
  await wait(async () => (await local(page))?.ops.length === 0, 'çevrimdışı oyun eşitlendi');
  const synced = await server('v1/save', account);
  check(synced.state.clock >= offlineSave.state.clock, `çevrimdışı oynanan süre sunucuda sayıldı (${synced.state.clock} ≥ ${offlineSave.state.clock})`);
  check(JSON.stringify(synced.state) === JSON.stringify((await local(page)).state), 'çevrimdışı oyundan sonra da bit bit aynı');

  // İnternet, yolda kalmış bir eşitleme sürerken geri gelirse: o isteğin sonradan düşmesi göstergeyi
  // geri açmıyor ve gönderim beklemeden yineleniyor (30 sn'lik olağan aralığı beklemiyor).
  await show(page);
  await page.waitForTimeout(2_500);
  let releaseHeld;
  const held = new Promise((resolve) => (releaseHeld = resolve));
  let attempts = 0;
  await page.route('**/v1/sync', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await held;
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await hide(page);
  await wait(() => attempts >= 1, 'yolda kalan eşitleme');
  await context.setOffline(true);
  await page.locator('[data-testid="offline"]').waitFor({ timeout: 10_000 });
  await context.setOffline(false);
  await page.waitForTimeout(300);
  releaseHeld();
  await wait(() => attempts >= 2, 'internet gelince yineleme', 8_000);
  await page.locator('[data-testid="offline"]').waitFor({ state: 'detached', timeout: 8_000 });
  await wait(async () => (await local(page))?.ops.length === 0, 'yineleme eşitlendi', 8_000);
  await page.unroute('**/v1/sync');
  // İnternet gelince gönderilecek bir şey yoksa da sunucuya bakılıyor: şerit kapanıyor (sekme arka planda, günlük boş).
  await context.setOffline(true);
  await page.locator('[data-testid="offline"]').waitFor({ timeout: 10_000 });
  await context.setOffline(false);
  await page.locator('[data-testid="offline"]').waitFor({ state: 'detached', timeout: 8_000 });
  check((await local(page)).ops.length === 0, 'gönderilecek bir şey yokken de şerit kapandı');

  // Lige katıl.
  await show(page);
  await page.click('[data-testid="league"]');
  await page.fill('[data-testid="league-name"]', 'Uçtan Uca');
  await page.click('[data-testid="league-join"]');
  await wait(async () => (await accountOf(page))?.name === 'Uçtan Uca', 'lige katılma');
  await page.waitForTimeout(500);
  const standings = await server('v1/league', account);
  check(standings.group.some((row) => row.name === 'Uçtan Uca' && row.platform === 'web'), 'haftalık grupta adı ve platformuyla görünüyor');

  // Taşıma kodu: ikinci tarayıcı aynı oyunu alıyor.
  await page.click('[data-testid="link-create"]');
  const code = (await page.locator('[data-testid="link-code"]').textContent({ timeout: 10_000 })).trim();
  check(/^[A-Z0-9]{6}$/.test(code), `taşıma kodu: ${code}`);
  const other = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'tr-TR' });
  const second = await other.newPage();
  await second.goto(WEB);
  await second.click('[data-testid="league"]');
  await wait(() => accountOf(second), 'ikinci tarayıcıda sessiz hesap');
  await second.fill('[data-testid="link-claim-code"]', code);
  await second.click('[data-testid="link-claim"]');
  await wait(async () => (await accountOf(second))?.id === account.id, 'kodla hesap alındı');
  const moved = await server('v1/save', account);
  const secondSave = await local(second);
  check(secondSave.state.chains.bakery.levels.join() === moved.state.chains.bakery.levels.join(), 'ikinci tarayıcıda aynı oyun');

  // Hile: kasayı elle şişir, pahalı alım yap, eşitle → sunucunun kasasına dönüyor.
  // Önce sekme arka planda ve eşitlemiş (oyun her saniye kaydediyor; değiştirilen kaydın üstüne yazmasın).
  await hide(second);
  await wait(async () => (await local(second))?.ops.length === 0, 'ikinci tarayıcı eşitledi');
  await second.evaluate(() => {
    const file = JSON.parse(localStorage.getItem('lite.save'));
    file.state.cash = 1e30;
    file.ops.push(['b', 'bakery', 2, 60]);
    file.state.chains.bakery.levels[2] += 60;
    localStorage.setItem('lite.save', JSON.stringify(file));
  });
  await second.reload();
  await second.waitForTimeout(800);
  await hide(second);
  await wait(async () => (await local(second))?.state.cash < 1e20, 'şişirilmiş kasa geri alındı');
  const after = await server('v1/save', account);
  check(after.state.chains.bakery.levels[2] < 60, 'sunucu sahte alımı uygulamadı');
  // Aynı tarayıcıda ikinci sekme: eskisi duruyor, kayda yazmıyor; "burada devam et" geri alıyor.
  // Oynayan sekme her saniye kaydediyor: devralan sekme en çok bir saniyelik eski kayıt okuyor.
  const savedAt = (await local(page)).lastSeen;
  await wait(async () => (await local(page)).lastSeen > savedAt, 'oynayan sekme kaydediyor');
  await page.waitForTimeout(3_500);
  const age = await page.evaluate(() => Date.now() - JSON.parse(localStorage.getItem('lite.save')).lastSeen);
  check(age < 2_000, `devralınacak kayıt taze (${age} ms)`);
  const tab = await context.newPage();
  tab.on('pageerror', (error) => errors.push(String(error)));
  // Yeni sekmenin sunucu istekleri geç yazım gelene kadar bekliyor: gerçekte geç yazım anında geliyor,
  // burada iki sekme arası iki gidiş dönüş; açılıştaki yenileme ondan önce dönüp eşitleme başlatmasın.
  let openGate;
  const gate = new Promise((resolve) => (openGate = resolve));
  await tab.route('**/v1/**', async (route) => {
    await gate;
    await route.continue();
  });
  // Eski sekmenin geç kalan son yazımı (kilide bakmasıyla yazması arasında devralındı): yeni sekme
  // kilidi alıp kaydı okuduktan hemen sonra geliyor. Yeni sekme henüz hamle yapmadıysa ve
  // göndermediyse o kayıttan sürüyor (ilk eşitlemesi bir saniye sonra; yazım ondan önce).
  await page.evaluate(() => {
    addEventListener('storage', function late(event) {
      if (event.key !== 'lite.owner') return;
      removeEventListener('storage', late);
      const file = JSON.parse(localStorage.getItem('lite.save'));
      file.prices = [...file.prices, 4242];
      file.lastSeen = Date.now();
      localStorage.setItem('lite.save', JSON.stringify(file));
      window.lateSeen = file.lastSeen;
    });
  });
  await tab.goto(WEB);
  await page.locator('[data-testid="superseded"]').waitFor({ timeout: 10_000 });
  const lateSeen = await page.evaluate(() => window.lateSeen);
  await wait(async () => (await local(tab)).lastSeen > lateSeen, 'yeni sekme kaydediyor');
  check((await local(tab)).prices.includes(4242), 'yeni sekme eski sekmenin geç yazımından sürüyor');
  openGate();
  const before = (await local(page)).lastSeen;
  await page.waitForTimeout(6_000);
  check((await local(page)).lastSeen > before, 'yeni sekme oynuyor ve kaydediyor');
  // Yeni sekme arka planda (kaydetmiyor): eski sekme de yazmıyorsa kayıt yerinde duruyor.
  await hide(tab);
  await page.waitForTimeout(500);
  const still = (await local(page)).lastSeen;
  await page.waitForTimeout(6_000);
  check((await local(page)).lastSeen === still, 'eski sekme durdu, kayda yazmıyor');
  await page.click('[data-testid="superseded-resume"]');
  await tab.locator('[data-testid="superseded"]').waitFor({ timeout: 10_000 });
  check((await page.locator('[data-testid="superseded"]').count()) === 0, 'eski sekme "burada devam et" ile oyunu geri aldı');
  await tab.close();

  // Hesapsız oyunda devir: yeni sekme hemen sessiz hesap açmayı deniyor (günlük göndermiyor),
  // yine de eski sekmenin geç yazımını alıyor. Hesap açılışı ağda düşüyor; ikisi de hesapsız kalıyor.
  const quiet = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'tr-TR', serviceWorkers: 'block' });
  let registrations = 0;
  await quiet.route('**/v1/players', (route) => (registrations++, route.abort('failed')));
  // Bir dakikadan uzun oynanmış hesapsız oyun: açılınca hemen hesap açılmaya çalışılıyor.
  const seeded = await local(page);
  const seed = { ...seeded, state: { ...seeded.state, clock: Math.max(seeded.state.clock, 120) }, base: null, ops: [], inflight: null, lastSeen: Date.now() };
  const early = await quiet.newPage();
  early.on('pageerror', (error) => errors.push(String(error)));
  await early.addInitScript((file) => {
    if (!localStorage.getItem('lite.save')) localStorage.setItem('lite.save', JSON.stringify(file));
  }, seed);
  await early.goto(WEB);
  await wait(() => registrations >= 1, 'eski sekme hesap açmayı denedi');
  const fresh = await quiet.newPage();
  fresh.on('pageerror', (error) => errors.push(String(error)));
  await fresh.goto(WEB);
  const lateQuiet = await early.evaluate(() => {
    const file = JSON.parse(localStorage.getItem('lite.save'));
    file.prices = [...file.prices, 4343];
    file.lastSeen = Date.now();
    localStorage.setItem('lite.save', JSON.stringify(file));
    return file.lastSeen;
  });
  await early.locator('[data-testid="superseded"]').waitFor({ timeout: 10_000 });
  await wait(async () => (await local(fresh)).lastSeen > lateQuiet, 'yeni sekme kaydediyor (hesapsız)');
  check(registrations >= 2, `yeni sekme de hesap açmayı denedi (${registrations})`);
  check((await local(fresh)).prices.includes(4343), 'hesap açmayı denese de eski sekmenin geç yazımından sürüyor');
  // Yeni sekme hemen taşıma koduyla başka hesabı alıyor: eski sekmenin bundan sonra gelen yazımı
  // (eski oyun) alınan hesabın üstüne kurulmuyor.
  const linked = await fetch(`${LEAGUE}/v1/link`, {
    method: 'POST',
    headers: { authorization: `Bearer ${account.id}.${account.token}`, 'content-type': 'application/json' },
    body: '{}',
  }).then((r) => r.json());
  await fresh.click('[data-testid="league"]');
  await fresh.fill('[data-testid="link-claim-code"]', linked.code);
  await fresh.click('[data-testid="link-claim"]');
  await wait(async () => (await accountOf(fresh))?.id === account.id, 'yeni sekme hesabı aldı');
  const afterClaim = await early.evaluate(() => {
    const file = JSON.parse(localStorage.getItem('lite.save'));
    file.prices = [...file.prices, 4444];
    file.base = null;
    file.lastSeen = Date.now();
    localStorage.setItem('lite.save', JSON.stringify(file));
    return file.lastSeen;
  });
  await wait(async () => (await local(fresh)).lastSeen > afterClaim, 'yeni sekme kaydediyor (hesap alındı)');
  const claimed = await local(fresh);
  check(!claimed.prices.includes(4444) && claimed.base !== null, 'hesap alındıktan sonra eski sekmenin geç yazımı alınmıyor');
  // Hesap başka cihazdan siliniyor; bu sekme arka plana geçerken eşitlemesi 401 alıyor: sıfırlanan oyun
  // hemen kayda yazılıyor (arka planda tik yok; uygulama kapanırsa silinen hesabın oyunu geri gelmesin).
  await wait(async () => (await local(fresh)).ops.length > 0, 'eşitlenecek kayıt');
  const removed = await fetch(`${LEAGUE}/v1/players/me`, { method: 'DELETE', headers: { authorization: `Bearer ${account.id}.${account.token}` } });
  check(removed.status === 200, 'hesap başka cihazdan silindi');
  await hide(fresh);
  await wait(async () => {
    const file = await local(fresh);
    return file.base === null && file.ops.length === 0 && file.state.clock < 5;
  }, 'silinen hesabın oyunu kayıtta sıfırlandı');
  check((await accountOf(fresh)) === null, 'silinen hesap bu cihazdan da unutuldu');
  await quiet.close();
  check(errors.length === 0, `sayfada hata yok${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await other.close();
  await context.close();
}

/**
 * Hizmet çalışanının güncellenmesi. Oyuncunun tarayıcısında Tur 40'tan önceki
 * çalışan (tools/fixtures/lite-sw-v1.js) ve onun önbelleği var. Yeni çalışan
 * gelince oyun yine çevrimdışı açılmalı ve adresi sabit olup içeriği değişen
 * yazı tipleri önbellekte tazelenmeli. Vite'ın önizleme sunucusu çalışanı
 * değiştiremediği için paket burada küçük bir sunucudan veriliyor.
 */
async function workerUpdate(browser) {
  const dist = join(ROOT, 'apps/lite-web/dist');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  let worker = readFileSync(join(ROOT, 'tools/fixtures/lite-sw-v1.js'));
  // Önceki sürümde yazı tiplerinin eski hâli: içerik farklı olsun yeter.
  let staleFonts = true;
  // Çevrimdışı: sunucu bağlantıyı kesiyor. Playwright'ın setOffline'ı hizmet
  // çalışanının isteklerine uygulanmıyor; çalışan ağdan alıp geçiyordu.
  let down = false;
  const site = createServer((request, response) => {
    if (down) return request.socket.destroy();
    const path = decodeURIComponent(new URL(request.url, WEB).pathname);
    let file = join(dist, path === '/' ? 'index.html' : path);
    if (staleFonts && /\/fonts\/Fredoka-\w+\.ttf$/.test(path)) file = join(dist, 'fonts/Nunito-Bold.ttf');
    if (path !== '/sw.js' && (!existsSync(file) || statSync(file).isDirectory())) return response.writeHead(404).end();
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    response.end(path === '/sw.js' ? worker : readFileSync(file));
  });
  await new Promise((resolve) => site.listen(WORKER_PORT, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${WORKER_PORT}/`;
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'tr-TR', serviceWorkers: 'allow' });
  const page = await context.newPage();
  const opens = async () => {
    try {
      await page.reload();
      await page.locator('[data-testid="cash"]').waitFor({ timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  };
  try {
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Çalışan sayfayı ele aldıktan sonraki açılış: sayfa ve paket önbelleğe giriyor.
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    down = true;
    check(await opens(), 'önceki çalışanla oyun çevrimdışı açılıyor');
    down = false;

    worker = readFileSync(join(dist, 'sw.js'));
    staleFonts = false;
    const updated = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true }));
      await registration.update();
      return Promise.race([changed, new Promise((resolve) => setTimeout(() => resolve(false), 15_000))]);
    });
    check(updated, 'yeni çalışan kuruldu ve sayfayı aldı');
    down = true;
    check(await opens(), 'çalışan güncellendikten sonra da oyun çevrimdışı açılıyor');
    const fonts = await page.evaluate(async () => {
      const sizes = {};
      for (const weight of ['Medium', 'SemiBold', 'Bold']) {
        const cached = await caches.match(`fonts/Fredoka-${weight}.ttf`);
        sizes[weight] = cached ? (await cached.arrayBuffer()).byteLength : 0;
      }
      return sizes;
    });
    const fresh = Object.entries(fonts).every(([weight, size]) => size === statSync(join(dist, `fonts/Fredoka-${weight}.ttf`)).size);
    check(fresh, `önbellekteki yazı tipleri yeni dosyalar (${JSON.stringify(fonts)})`);
  } finally {
    await context.close();
    site.close();
  }
}

/** Senaryo kareleri: [ad, adres, [genişlik, yükseklik]]. */
const SCENES = [
  ['tr-start', '?scenario=start&lang=tr'],
  ['tr-mid', '?scenario=mid&lang=tr'],
  ['tr-council', '?scenario=council&lang=tr'],
  ['tr-late', '?scenario=late&lang=tr'],
  ['tr-offline', '?scenario=mid&lang=tr&offline=9000'],
  ['tr-ipo', '?scenario=ipo&lang=tr'],
  ['tr-listed', '?scenario=listed&lang=tr&scroll=market'],
  ['tr-city2', '?scenario=city2&lang=tr'],
  ['tr-settings', '?scenario=mid&lang=tr&sheet=settings'],
  ['tr-islands', '?scenario=islands&lang=tr'],
  ['tr-island3', '?scenario=islands&lang=tr&island=3'],
  ['tr-skyline', '?scenario=skyline&lang=tr'],
  ['tr-desert', '?scenario=desert&lang=tr'],
  ['tr-snow', '?scenario=snow&lang=tr'],
  ['tr-map', '?scenario=snow&lang=tr&sheet=map'],
  ['tr-league', '?scenario=mid&lang=tr&league&sheet=league'],
  ['tr-league-private', '?scenario=mid&lang=tr&league&sheet=league&private'],
  ['tr-league-stars', '?scenario=mid&lang=tr&league&sheet=league&stars'],
  ['tr-deal', '?scenario=mid&lang=tr&deal=order'],
  ['tr-deal-caught', '?scenario=mid&lang=tr&deal=investor&caught'],
  ['en-mid', '?scenario=mid&lang=en'],
  ['en-deal', '?scenario=mid&lang=en&deal=order'],
  ['night-mid', '?scenario=mid&lang=tr&theme=night'],
  ['night-islands', '?scenario=islands&lang=tr&theme=night'],
  ['night-league', '?scenario=mid&lang=tr&theme=night&league&sheet=league'],
  ['night-deal', '?scenario=islands&lang=tr&theme=night&deal=investor'],
  ['desktop-mid', '?scenario=mid&lang=tr', [1440, 900]],
  ['desktop-islands', '?scenario=islands&lang=tr&theme=night', [1440, 900]],
  ['tablet-mid', '?scenario=mid&lang=tr', [1024, 1366]],
  // Play Store telefon kareleri: 1080 × 1920 (Play en çok 2:1 istiyor).
  ...[['tr', 'mid'], ['tr', 'deal'], ['tr', 'islands'], ['tr', 'league'], ['en', 'mid'], ['en', 'deal'], ['en', 'islands'], ['en', 'league']].map(([lang, shot]) => [
    `play-${lang}-${shot}`,
    shot === 'deal'
      ? `?scenario=mid&lang=${lang}&deal=order`
      : shot === 'league'
        ? `?scenario=mid&lang=${lang}&league&sheet=league`
        : `?scenario=${shot}&lang=${lang}`,
    [432, 768],
    2.5,
  ]),
];

async function shots(browser) {
  mkdirSync(SHOTS, { recursive: true });
  for (const [name, query, size, scale] of SCENES.filter(([name]) => name.startsWith(only))) {
    const [width, height] = size ?? [430, 932];
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale ?? 2 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(WEB + query);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    if (errors.length) throw new Error(`${name}: ${errors.join(' | ')}`);
    console.log(`kare: ${name}`);
    await page.close();
  }
}

let browser = null;
try {
  await start(process.execPath, ['tools/run-node-script.mjs', 'packages/lite-league/test/local-server.ts', String(LEAGUE_PORT)]);
  execFileSync('pnpm', ['--filter', '@capital/lite-web', 'build'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_LEAGUE_URL: LEAGUE } });
  await start('pnpm', ['--filter', '@capital/lite-web', 'exec', 'vite', 'preview', '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1']);
  browser = await chromium.launch();
  if (!shotsOnly) {
    await e2e(browser);
    await workerUpdate(browser);
  }
  await shots(browser);
  console.log('Lite web: uçtan uca test ve kareler tamam.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopAll();
  // Açık kalan bir boru ya da zamanlayıcı CI işini bekletmesin.
  process.exit(process.exitCode ?? 0);
}
