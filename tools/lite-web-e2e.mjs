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
// - yanıtı kaybolan eşitleme aynı kimlikle yineleniyor (ikinci kez uygulanmıyor).
// Ardından senaryo kareleri (SHOTS dizinine).
//
// Çalıştırma: node tools/lite-web-e2e.mjs [--shots-only] [--only=<kare adı öneki>]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

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
  await tab.goto(WEB);
  // Eski sekmenin geç kalan son yazımı (kilide bakmasıyla yazması arasında devralındı):
  // yeni sekme henüz hamle yapmadıysa ve göndermediyse o kayıttan sürüyor.
  const lateSeen = await page.evaluate(() => {
    const file = JSON.parse(localStorage.getItem('lite.save'));
    file.prices = [...file.prices, 4242];
    file.lastSeen = Date.now();
    localStorage.setItem('lite.save', JSON.stringify(file));
    return file.lastSeen;
  });
  await page.locator('[data-testid="superseded"]').waitFor({ timeout: 10_000 });
  await wait(async () => (await local(tab)).lastSeen > lateSeen, 'yeni sekme kaydediyor');
  check((await local(tab)).prices.includes(4242), 'yeni sekme eski sekmenin geç yazımından sürüyor');
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
  check(errors.length === 0, `sayfada hata yok${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await other.close();
  await context.close();
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
  if (!shotsOnly) await e2e(browser);
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
