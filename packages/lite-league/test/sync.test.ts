import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_IDS, SYNC, SyncedGame, applyOffline, newGame, starFree, step, weekId, weekStart, type LiteState } from '../../lite-model/src/index';
import { handle, type Options } from '../src/app';
import type { Db } from '../src/db';
import { weekShare } from '../src/saves';
import { fakePki } from './fake-attest';
import { memoryDb } from './sqlite';

/** 2026-W42'nin perşembesi, öğlen. */
const THURSDAY = Date.UTC(2026, 9, 15, 12);
const PKI = fakePki('TEAM123456.com.test.lite', THURSDAY);
const OPTIONS: Options = { attest: PKI.config };

interface Account {
  id: string;
  token: string;
}

async function call(db: Db, now: number, method: string, path: string, body?: unknown, who?: Account, headers: Record<string, string> = {}, options = OPTIONS) {
  const all: Record<string, string> = { 'content-type': 'application/json', ...headers };
  if (who) all.authorization = `Bearer ${who.id}.${who.token}`;
  const response = await handle(
    new Request(`https://lig.test${path}`, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) }),
    db,
    now,
    options,
  );
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: (text ? JSON.parse(text) : null) as Record<string, any> };
}

/** Web istemcisi: hesap, oyun ve gönderim. */
async function webPlayer(db: Db, now: number, name?: string) {
  const r = await call(db, now, 'POST', '/v1/players', { platform: 'web', ...(name ? { name } : {}) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.save.version, 0);
  const account: Account = { id: r.body.id, token: r.body.token };
  const game = new SyncedGame(r.body.save.state as LiteState);
  let version = 0;
  let batches = 0;
  return {
    account,
    game,
    get version() {
      return version;
    },
    /** Günlüğü gönder; sunucu kabul ederse durumu onunkine eşitle. */
    async push(at: number, rest = 0) {
      const ops = game.journal.take();
      const sent = await call(db, at, 'POST', '/v1/sync', { base: version, batch: `batch-${account.id.slice(0, 8)}-${batches++}`, ops, rest }, account);
      if (sent.status === 200) {
        version = sent.body.version;
        game.accepted(sent.body.state);
      } else if (sent.status === 409) {
        version = sent.body.version;
        game.replaced(sent.body.state);
      } else {
        game.journal.release();
      }
      return sent;
    },
  };
}

/** Fırını kurup on dakika oynayan dürüst oyuncu. */
function play(game: SyncedGame, seconds: number): void {
  for (let k = 0; k < seconds; k++) {
    game.tick(1);
    for (const stage of [0, 1, 2] as const) game.act(['b', 'bakery', stage, 1]);
    if (game.state.deal) game.act(['d']);
  }
}

test('web: adsız hesap, oyun sunucuda; dürüst gönderim sunucuyla bit bit aynı, puan sunucunun', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY);
  const league = await call(db, THURSDAY, 'GET', '/v1/league', undefined, web.account);
  assert.deepEqual(league.body.group, [], 'adsız oyuncu lige girmiyor');
  play(web.game, 300);
  const local = structuredClone(web.game.state);
  const sent = await web.push(THURSDAY + 301_000);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.skipped, 0);
  assert.equal(sent.body.clipped, 0);
  assert.deepEqual(sent.body.state, local);
  assert.deepEqual(web.game.state, local);
  assert.ok(Math.abs(sent.body.score - starFree(local.totalEarned, 0)) < 1e-6);
  const saved = await call(db, THURSDAY + 302_000, 'GET', '/v1/save', undefined, web.account);
  assert.deepEqual(saved.body.state, local);
  assert.equal(saved.body.version, 1);
  // Adını verince (lige katılınca) hemen haftalık grupta, bu haftaki puanı ve platform işaretiyle.
  await call(db, THURSDAY + 302_000, 'PATCH', '/v1/players/me', { name: 'Ağ Fırını' }, web.account);
  const named = await call(db, THURSDAY + 303_000, 'GET', '/v1/league', undefined, web.account);
  assert.equal(named.body.group.length, 1);
  assert.ok(Math.abs(named.body.group[0].score - sent.body.score) < 1e-9);
  play(web.game, 60);
  assert.equal((await web.push(THURSDAY + 363_000)).status, 200);
  const joined = await call(db, THURSDAY + 364_000, 'GET', '/v1/league', undefined, web.account);
  assert.equal(joined.body.group.length, 1);
  assert.equal(joined.body.group[0].platform, 'web');
  assert.ok(joined.body.group[0].score > 0);
});

test('web: saat ileri alınsa ve kasa elle değiştirilse de sunucunun durumu geçerli', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY);
  // Yeni hesabın açılıştan önce oynanmış süre payı bir saat; fazlası kırpılıyor.
  web.game.away(10 * 86_400);
  play(web.game, 10);
  const first = await web.push(THURSDAY + 3_000);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.clipped > 9 * 86_400, `kırpılan ${first.body.clipped}`);
  // Kasayı elle şişirip pahalı alım: sunucuda para yok, alım atlanıyor.
  web.game.state.cash = 1e30;
  assert.ok(web.game.act(['b', 'bakery', 2, 60]).ok);
  const cheat = await web.push(THURSDAY + 5_000);
  assert.equal(cheat.status, 200);
  assert.equal(cheat.body.skipped, 1);
  assert.ok(web.game.state.cash < 1e9, 'istemci sunucunun kasasına döndü');
  assert.ok(web.game.state.chains.bakery.levels[2] < 60);
  // İncelemeye not düşülüyor.
  const rejects = await db.all<{ reason: string }>('SELECT reason FROM rejects WHERE player_id = ?', web.account.id);
  assert.ok(rejects.some((r) => r.reason.startsWith('sync:')));
});

test('web: günlük tamken kullanılmayan süre birikmiyor; biriktirip "çevrimiçiydim" demek işe yaramıyor', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY);
  play(web.game, 30);
  assert.equal((await web.push(THURSDAY + 31_000, 0)).status, 200);
  // Bir saat sonra 10 dakikalık çevrimiçi oyun gönderiyor ama arada ayrılış (o) yok:
  // dürüst istemci bir saati "o" ile yazardı. Saat bankası rest=0 ile sıfırlandığından
  // bütçe ~1 saat; 600 adım sığıyor. Ama 2. kez aynı numarayı yaparsa bütçe yok.
  web.game.tick(600);
  const first = await web.push(THURSDAY + 3_631_000, 0);
  assert.equal(first.body.clipped, 0);
  web.game.tick(600);
  const second = await web.push(THURSDAY + 3_640_000, 0);
  // Bütçe yalnızca aradaki 9 sn ve iki kez saat payı (önceki gönderimin imleci şimdi − 10 sn).
  assert.ok(second.body.clipped >= 600 - 9 - 2 * 10 - 1, `kırpılan ${second.body.clipped}`);
});

test('web: "bekleyen var" (rest > 0) diyerek günler biriktirip çevrimiçi diye harcamak işe yaramıyor; ağsız son gün sayılıyor', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY);
  play(web.game, 30);
  assert.equal((await web.push(THURSDAY + 31_000, 1)).status, 200);
  // Üç gün hiç göndermiyor, sonra o üç günü 600'lük çevrimiçi adımlarla doldurmaya çalışıyor.
  let at = THURSDAY + 31_000 + 3 * 86_400_000;
  let counted = 0;
  const batches = 12;
  for (let k = 0; k < batches; k++) {
    web.game.tick(SYNC.maxSteps);
    // Son gönderimde "tam" diyor: kayıtları şimdiye yerleşiyor.
    const sent = await web.push(at, k === batches - 1 ? 0 : 1);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    counted += SYNC.maxSteps - sent.body.clipped;
    at += 2_100;
  }
  // 12 × 600 sn gönderildi; yalnızca "şimdide biten" son gönderim sayılıyor.
  assert.ok(counted <= SYNC.maxSteps + 1, `sayılan ${counted}`);

  // Dürüst istemci aynı üç günü "yoktum" diye yazar: çevrimdışı kazanç tavanıyla tam alınıyor.
  const honest = await webPlayer(db, THURSDAY);
  play(honest.game, 30);
  assert.equal((await honest.push(THURSDAY + 31_000, 0)).status, 200);
  const before = honest.game.state;
  honest.game.away(3 * 86_400);
  const back = await honest.push(THURSDAY + 31_000 + 3 * 86_400_000, 0);
  assert.equal(back.status, 200);
  assert.ok(back.body.clipped <= SYNC.slack, `kırpılan ${back.body.clipped}`);
  assert.equal(JSON.stringify(honest.game.state), JSON.stringify(applyOffline(before, 3 * 86_400).state));

  // Ağsız yarım saat oynayan dürüst istemci bağlanınca üç gönderimde hepsi sayılıyor.
  const offline = await webPlayer(db, THURSDAY);
  play(offline.game, 30);
  assert.equal((await offline.push(THURSDAY + 31_000, 0)).status, 200);
  offline.game.tick(1_800);
  let clipped = 0;
  for (const [k, rest] of [2, 1, 0].entries()) {
    const sent = await offline.push(THURSDAY + 31_000 + 1_800_000 + k * 2_100, rest);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    clipped += sent.body.clipped;
  }
  assert.equal(clipped, 0);
  assert.equal(offline.game.journal.pending, 0);
});

test('web ve Android: internetsiz açık oynanan beş saat bağlanınca gönderim gönderim hepsi sayılıyor', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY);
  play(web.game, 30);
  assert.equal((await web.push(THURSDAY + 31_000, 0)).status, 200);
  const before = web.game.state.clock;
  web.game.tick(5 * 3_600);
  const expected = JSON.stringify(web.game.state);
  const batches = (5 * 3_600) / SYNC.maxSteps;
  const back = THURSDAY + 31_000 + 5 * 3_600_000;
  let clipped = 0;
  for (let k = 0; k < batches; k++) {
    const sent = await web.push(back + k * 2_100, batches - 1 - k);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    clipped += sent.body.clipped;
  }
  assert.equal(clipped, 0);
  assert.equal(web.game.journal.pending, 0);
  assert.equal(web.game.state.clock, before + 5 * 3_600);
  assert.equal(JSON.stringify(web.game.state), expected, 'cihazda oynanan neyse sunucuda da o');
});

test('web: uzun ayrılışı kayıtlara ya da gönderimlere bölmek tek ayrılıştan fazla kazandırmıyor', async () => {
  const db = memoryDb();
  const back = THURSDAY + 31_000 + 3 * 86_400_000;
  const fresh = async () => {
    const p = await webPlayer(db, THURSDAY);
    play(p.game, 30);
    assert.equal((await p.push(THURSDAY + 31_000, 0)).status, 200);
    return p;
  };
  // Dürüst: üç gün tek ayrılış.
  const honest = await fresh();
  honest.game.away(3 * 86_400);
  assert.equal((await honest.push(back, 0)).status, 200);
  // Hileci: aynı üç gün 36 ayrı iki saatlik kayıtta.
  const split = await fresh();
  for (let k = 0; k < 36; k++) split.game.journal.push(['o', 7_200]);
  const sent = await split.push(back, 0);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.state.cash, honest.game.state.cash);
  assert.equal(sent.body.state.totalEarned, honest.game.state.totalEarned);
  // Hileci: her gönderimde bir kayıt ("sırada başka var" deyip); tavan gönderimler arasında da sürüyor.
  const batches = await fresh();
  let at = back - 3 * 86_400_000 + 7_200_000;
  for (let k = 0; k < 6; k++) {
    batches.game.journal.push(['o', 7_200]);
    assert.equal((await batches.push(at, 1)).status, 200);
    at += 2_100;
  }
  const once = await fresh();
  once.game.away(6 * 7_200);
  assert.equal((await once.push(at, 1)).status, 200);
  assert.equal(batches.game.state.cash, once.game.state.cash);
});

test('iki cihaz: eski sürümün üstüne gönderim 409 ve güncel durum; kaybolan yanıtın tekrarı zararsız', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY, 'Çift Cihaz');
  const link = await call(db, THURSDAY, 'POST', '/v1/link', {}, web.account);
  assert.equal(link.status, 201);
  assert.match(link.body.code, /^[A-Z0-9]{6}$/);
  const claim = await call(db, THURSDAY + 1_000, 'POST', '/v1/link/claim', { code: link.body.code.toLowerCase(), platform: 'android' });
  assert.equal(claim.status, 201, JSON.stringify(claim.body));
  assert.equal(claim.body.id, web.account.id);
  assert.equal(claim.body.name, 'Çift Cihaz');
  assert.equal(claim.body.save.version, 0);
  // Hafta ve puan da (iOS haftalık sayacını bundan sürdürüyor).
  assert.equal(claim.body.save.week, weekId(THURSDAY + 1_000));
  assert.equal(typeof claim.body.save.score, 'number');
  // Kod tek seferlik.
  assert.equal((await call(db, THURSDAY + 2_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'web' })).status, 404);
  const phone: Account = { id: claim.body.id, token: claim.body.token };
  const phoneGame = new SyncedGame(claim.body.save.state);

  // Telefon önce gönderiyor.
  play(phoneGame, 40);
  const phoneOps = phoneGame.journal.take();
  const fromPhone = await call(db, THURSDAY + 45_000, 'POST', '/v1/sync', { base: 0, batch: 'phone-batch-0001', ops: phoneOps, rest: 0 }, phone);
  assert.equal(fromPhone.status, 200);
  // Yanıt kayboldu, telefon aynı gönderimi yineliyor: yeniden uygulanmıyor.
  const again = await call(db, THURSDAY + 50_000, 'POST', '/v1/sync', { base: 0, batch: 'phone-batch-0001', ops: phoneOps, rest: 0 }, phone);
  assert.equal(again.status, 200);
  assert.equal(again.body.version, 1);
  assert.deepEqual(again.body.state, fromPhone.body.state);
  // Web eski sürümün üstüne oynamıştı: 409, telefonun durumuna dönüyor.
  play(web.game, 20);
  const stale = await web.push(THURSDAY + 60_000);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale');
  assert.deepEqual(web.game.state, fromPhone.body.state);
  assert.equal(web.version, 1);
  // Tablolarda son gönderen cihazın platformu.
  const board = await call(db, THURSDAY + 61_000, 'GET', '/v1/stars', undefined, web.account);
  assert.equal(board.body.me.platform, 'android');
  // Süresi geçen kod.
  const old = await call(db, THURSDAY, 'POST', '/v1/link', {}, web.account);
  assert.equal((await call(db, THURSDAY + 11 * 60_000, 'POST', '/v1/link/claim', { code: old.body.code, platform: 'web' })).status, 404);
  // Aynı kodla aynı anda iki istek: yalnızca biri hesabı alıyor.
  const twice = await call(db, THURSDAY + 62_000, 'POST', '/v1/link', {}, web.account);
  const both = await Promise.all(
    ['web', 'android'].map((platform) => call(db, THURSDAY + 63_000, 'POST', '/v1/link/claim', { code: twice.body.code, platform })),
  );
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 404]);
});

/** Her sorgudan önce zamanlayıcı turu: aynı anda gelen istekler gerçekten iç içe geçsin (D1'de ağ gecikmesi gibi). */
function laggy(db: Db): Db {
  const lag = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    run: async (sql, ...args) => (await lag(), db.run(sql, ...args)),
    first: async (sql, ...args) => (await lag(), db.first(sql, ...args)),
    all: async (sql, ...args) => (await lag(), db.all(sql, ...args)),
    batch: async (statements) => (await lag(), db.batch(statements)),
  };
}

test('kaybolan yanıt: arada başka cihaz eşitlese de tekrar tanınıyor; aynı anda iki kopya puanı bir kez ekliyor', async () => {
  const db = laggy(memoryDb());
  const web = await webPlayer(db, THURSDAY, 'Kayıp Yanıt');
  play(web.game, 30);
  assert.equal((await web.push(THURSDAY + 31_000, 0)).status, 200);
  const base = web.version;
  // Telefon aynı hesabı alıyor.
  const link = await call(db, THURSDAY + 32_000, 'POST', '/v1/link', {}, web.account);
  const claim = await call(db, THURSDAY + 33_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'android' });
  const phone: Account = { id: claim.body.id, token: claim.body.token };
  // Web bir alım gönderiyor; sunucu işliyor ama yanıt kayboluyor.
  web.game.tick(20);
  web.game.act(['b', 'bakery', 0, 1]);
  const ops = web.game.journal.take();
  const lost = await call(db, THURSDAY + 55_000, 'POST', '/v1/sync', { base, batch: 'web-lost-batch-01', ops, rest: 0 }, web.account);
  assert.equal(lost.status, 200);
  const levels = lost.body.state.chains.bakery.levels[0];
  // Arada telefon eşitliyor (sürüm bir daha artıyor).
  const phoneGame = new SyncedGame(lost.body.state);
  phoneGame.tick(5);
  const fromPhone = await call(db, THURSDAY + 60_000, 'POST', '/v1/sync', { base: lost.body.version, batch: 'phone-after-lost', ops: phoneGame.journal.take(), rest: 0 }, phone);
  assert.equal(fromPhone.status, 200);
  // Web aynı gönderimi aynı kimlikle yineliyor: 409 değil, uygulanmış sayılıyor; alım iki kez yok.
  const retry = await call(db, THURSDAY + 65_000, 'POST', '/v1/sync', { base, batch: 'web-lost-batch-01', ops, rest: 0 }, web.account);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.applied, 0);
  assert.equal(retry.body.version, fromPhone.body.version);
  assert.equal(retry.body.state.chains.bakery.levels[0], levels);

  // Aynı gönderimin iki kopyası aynı anda: biri uygulanıyor, öbürü tanınıyor; puan bir kez.
  const twin = new SyncedGame(retry.body.state);
  twin.tick(30);
  const twinOps = twin.journal.take();
  const before = (await call(db, THURSDAY + 99_000, 'GET', '/v1/save', undefined, web.account)).body.score;
  const both = await Promise.all(
    [0, 1].map(() => call(db, THURSDAY + 100_000, 'POST', '/v1/sync', { base: retry.body.version, batch: 'web-twin-batch-1', ops: twinOps, rest: 0 }, web.account)),
  );
  assert.deepEqual(both.map((r) => r.status), [200, 200], JSON.stringify(both.map((r) => r.body)));
  assert.deepEqual(both.map((r) => r.body.applied).sort(), [0, both[0].body.applied || both[1].body.applied].sort());
  const after = (await call(db, THURSDAY + 101_000, 'GET', '/v1/save', undefined, web.account)).body;
  assert.equal(after.version, retry.body.version + 1, 'tek sürüm');
  const single = Math.max(both[0].body.score, both[1].body.score);
  assert.equal(after.score, single);
  assert.ok(after.score > before, `puan eklendi (${before} → ${after.score})`);
});

test('aynı anda katılım: haftalık grup 30\'u aşmıyor, özel ligin son yerine tek kişi giriyor', async () => {
  const db = laggy(memoryDb());
  const players = [];
  for (let k = 0; k < 35; k++) players.push(await webPlayer(db, THURSDAY));
  const renamed = await Promise.all(players.map((p, k) => call(db, THURSDAY + 1_000, 'PATCH', '/v1/players/me', { name: `Oyuncu ${k}` }, p.account)));
  assert.ok(renamed.every((r) => r.status === 200));
  const groups = await db.all<{ group_no: number; n: number }>('SELECT group_no, COUNT(*) AS n FROM groups GROUP BY group_no ORDER BY group_no');
  assert.deepEqual(groups.map((g) => g.n), [30, 5]);

  // Özel lig: kurucu + 48 kişi, son yer için iki kişi aynı anda.
  const owner = players[0]!;
  const league = await call(db, THURSDAY + 2_000, 'POST', '/v1/leagues', { name: 'Kalabalık' }, owner.account);
  const extra = [];
  for (let k = 0; k < 20; k++) extra.push(await webPlayer(db, THURSDAY, `Ek ${k}`));
  const members = [...players.slice(1), ...extra];
  for (const p of members.slice(0, 48)) assert.equal((await call(db, THURSDAY + 3_000, 'POST', '/v1/leagues/join', { code: league.body.code }, p.account)).status, 200);
  const last = await Promise.all(members.slice(48, 50).map((p) => call(db, THURSDAY + 4_000, 'POST', '/v1/leagues/join', { code: league.body.code }, p.account)));
  assert.deepEqual(last.map((r) => r.status).sort(), [200, 409]);
  assert.equal(last.find((r) => r.status === 409)!.body.error, 'full');
  const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE code = ?', league.body.code);
  assert.equal(count!.n, 50);

  // Oyuncu başına sınır: dokuz ligdeyken bağlı iki cihazdan aynı anda iki lig kurma; yalnızca biri.
  const busy = extra[19]!;
  for (let k = 0; k < 9; k++) assert.equal((await call(db, THURSDAY + 5_000, 'POST', '/v1/leagues', { name: `Lig ${k}` }, busy.account)).status, 201);
  const created = await Promise.all([0, 1].map((k) => call(db, THURSDAY + 6_000, 'POST', '/v1/leagues', { name: `Son ${k}` }, busy.account)));
  assert.deepEqual(created.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE player_id = ?', busy.account.id))!.n, 10);

  // Son üye ayrılırken biri katılıyor: sahipsiz üyelik kalmıyor.
  const lonely = await call(db, THURSDAY + 7_000, 'POST', '/v1/leagues', { name: 'Yalnız' }, extra[18]!.account);
  await Promise.all([
    call(db, THURSDAY + 8_000, 'DELETE', `/v1/leagues/${lonely.body.code}`, undefined, extra[18]!.account),
    call(db, THURSDAY + 8_000, 'POST', '/v1/leagues/join', { code: lonely.body.code }, extra[17]!.account),
  ]);
  const orphans = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members m WHERE NOT EXISTS (SELECT 1 FROM leagues l WHERE l.code = m.code)');
  assert.equal(orphans!.n, 0);
});

test('yıldız tablosu: bütün platformlar, adsızlar yok, sıram ve arkadaşlar', async () => {
  const db = memoryDb();
  const ios = await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Elma Holding' });
  await db.run('UPDATE profiles SET stars = 40 WHERE player_id = ?', ios.body.id);
  const web = await webPlayer(db, THURSDAY, 'Ağ Holding');
  await db.run('UPDATE profiles SET stars = 25 WHERE player_id = ?', web.account.id);
  const anon = await webPlayer(db, THURSDAY);
  await db.run('UPDATE profiles SET stars = 99 WHERE player_id = ?', anon.account.id);
  const board = await call(db, THURSDAY, 'GET', '/v1/stars', undefined, web.account);
  assert.deepEqual(
    board.body.top.map((r: any) => [r.name, r.stars, r.platform, r.me]),
    [
      ['Elma Holding', 40, 'ios', false],
      ['Ağ Holding', 25, 'web', true],
    ],
  );
  assert.deepEqual(board.body.me, { rank: 2, stars: 25, platform: 'web' });
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/stars', undefined, anon.account)).body.me.rank, null);
  // Arkadaşlar: özel lig üyeleri.
  const iosAccount: Account = { id: ios.body.id, token: ios.body.token };
  const league = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Kuzenler' }, iosAccount);
  await call(db, THURSDAY, 'POST', '/v1/leagues/join', { code: league.body.code }, web.account);
  const friends = await call(db, THURSDAY, 'GET', '/v1/stars', undefined, iosAccount);
  assert.deepEqual(friends.body.friends.map((r: any) => r.name), ['Elma Holding', 'Ağ Holding']);
  // Adsız hesap özel lig kuramıyor ve katılamıyor.
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/leagues/join', { code: league.body.code }, anon.account)).body.error, 'unnamed');
  // Eşit yıldızda sıram listedeki sırayla aynı: önce katılan önde.
  const early = await webPlayer(db, THURSDAY + 1_000, 'Erken');
  const late = await webPlayer(db, THURSDAY + 2_000, 'Geç');
  const ranks = await Promise.all([early, late].map(async (p) => (await call(db, THURSDAY + 3_000, 'GET', '/v1/stars', undefined, p.account)).body));
  const listed = ranks[1].top.map((r: any) => r.name);
  assert.deepEqual([ranks[0].me.rank, ranks[1].me.rank], [listed.indexOf('Erken') + 1, listed.indexOf('Geç') + 1]);
  assert.deepEqual([ranks[0].me.rank, ranks[1].me.rank], [3, 4]);
});

test('haftalık pay: pazartesiyi aşan dilim süresiyle bölünüyor, geçen haftanınki sayılmıyor', () => {
  const week = weekId(THURSDAY);
  const monday = weekStart(week);
  // Pazar 23:00'ten başlayan iki saatlik dilim: yarısı bu hafta.
  assert.equal(weekShare([{ seconds: 7_200, score: 100 }], monday - 3_600_000, week), 50);
  // Tamamen geçen hafta.
  assert.equal(weekShare([{ seconds: 600, score: 100 }], monday - 3_600_000, week), 0);
  // Art arda dilimler: ikincisi birincinin bittiği yerden.
  assert.equal(weekShare([{ seconds: 3_600, score: 10 }, { seconds: 3_600, score: 20 }], monday - 3_600_000, week), 20);
});

test('tarayıcı: yalnızca oyunun adresleri (CORS); ön uçuş', async () => {
  const db = memoryDb();
  const pre = await handle(
    new Request('https://lig.test/v1/sync', { method: 'OPTIONS', headers: { origin: 'https://catikur.github.io', 'access-control-request-method': 'POST' } }),
    db,
    THURSDAY,
    OPTIONS,
  );
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://catikur.github.io');
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /authorization/);
  const evil = await handle(new Request('https://lig.test/v1/sync', { method: 'OPTIONS', headers: { origin: 'https://kotu.example' } }), db, THURSDAY, OPTIONS);
  assert.equal(evil.status, 403);
  const health = await call(db, THURSDAY, 'GET', '/v1/health', undefined, undefined, { origin: 'https://localhost' });
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://localhost');
  const plain = await call(db, THURSDAY, 'GET', '/v1/health');
  assert.equal(plain.headers.get('access-control-allow-origin'), null);
});

test('Turnstile: açıksa web ve Android hesabı jetonsuz açılmıyor; iOS etkilenmiyor', async () => {
  const db = memoryDb();
  const seen: string[] = [];
  const options: Options = { attest: PKI.config, turnstile: async (token) => (seen.push(token), token === 'iyi') };
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { platform: 'web' }, undefined, {}, options)).body.error, 'turnstile');
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { platform: 'android', turnstile: 'kötü' }, undefined, {}, options)).status, 403);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { platform: 'web', turnstile: 'iyi' }, undefined, {}, options)).status, 201);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Elma' }, undefined, {}, options)).status, 201);
  assert.deepEqual(seen, ['kötü', 'iyi']);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { platform: 'tv' })).body.error, 'platform');
});

test('kaybolan yanıtın tekrarı: kimlik listede durdukça tanınıyor; düştüyse 409 "bilinmiyor"; hiç uygulanmamışsa düz 409', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY, 'Uzun Kayıp');
  play(web.game, 5);
  assert.equal((await web.push(THURSDAY + 6_000)).status, 200);
  const base = web.version;
  const link = await call(db, THURSDAY + 7_000, 'POST', '/v1/link', {}, web.account);
  const claim = await call(db, THURSDAY + 8_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'android' });
  const phone: Account = { id: claim.body.id, token: claim.body.token };
  // Web'in gönderimi işleniyor, yanıtı kayboluyor.
  web.game.tick(3);
  const ops = web.game.journal.take();
  const retry = (at: number) => call(db, at, 'POST', '/v1/sync', { base, batch: 'long-lost-batch', ops, rest: 0 }, web.account);
  const lost = await retry(THURSDAY + 10_000);
  assert.equal(lost.status, 200);
  // Telefon art arda eşitliyor.
  let phoneBase = lost.body.version as number;
  let phoneState = lost.body.state as LiteState;
  let at = THURSDAY + 13_000;
  const phoneSync = async () => {
    const game = new SyncedGame(phoneState);
    game.tick(1);
    const sent = await call(db, at, 'POST', '/v1/sync', { base: phoneBase, batch: `phone-${at}`, ops: game.journal.take(), rest: 0 }, phone);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    phoneBase = sent.body.version;
    phoneState = sent.body.state;
    at += 3_000;
  };
  for (let k = 0; k < 15; k++) await phoneSync();
  // Arada 15 gönderim: kimlik hâlâ listede, uygulanmış sayılıyor.
  const known = await retry(at);
  assert.equal(known.status, 200);
  assert.equal(known.body.applied, 0);
  // Bir gönderim daha: kimlik listeden düştü; sunucu bilemiyor, istemci kayıtları yeniden uygulamasın.
  await phoneSync();
  const unknown = await retry(at);
  assert.equal(unknown.status, 409);
  assert.equal(unknown.body.uncertain, true);
  // Hiç uygulanmamış gönderim, arada birkaç sürüm: kesin uygulanmadı, düz 409 (istemci yeniden uygular).
  const never = await call(db, at, 'POST', '/v1/sync', { base: phoneBase - 3, batch: 'never-applied-1', ops: [['t', 1]], rest: 0 }, web.account);
  assert.equal(never.status, 409);
  assert.equal(never.body.uncertain, undefined);
});

test('hesabı sil: kayıt, cihazlar, tablo satırı ve taşıma kodu da gidiyor', async () => {
  const db = memoryDb();
  const web = await webPlayer(db, THURSDAY, 'Silinecek');
  await call(db, THURSDAY, 'POST', '/v1/link', {}, web.account);
  play(web.game, 10);
  await web.push(THURSDAY + 11_000);
  assert.equal((await call(db, THURSDAY + 12_000, 'DELETE', '/v1/players/me', undefined, web.account)).status, 200);
  for (const table of ['saves', 'tokens', 'profiles', 'links', 'reports']) {
    const left = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`, web.account.id);
    assert.equal(left?.n, 0, table);
  }
  assert.equal((await call(db, THURSDAY + 13_000, 'GET', '/v1/save', undefined, web.account)).status, 401);
});

test('hesabı sil: kurduğu dolu ligin kuruculuğu en eski üyeye geçiyor, kimliği hiçbir satırda kalmıyor', async () => {
  const db = memoryDb();
  const founder = await webPlayer(db, THURSDAY, 'Kurucu');
  const league = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Aile' }, founder.account);
  const first = await webPlayer(db, THURSDAY, 'İlk Üye');
  const second = await webPlayer(db, THURSDAY, 'İkinci Üye');
  assert.equal((await call(db, THURSDAY + 1_000, 'POST', '/v1/leagues/join', { code: league.body.code }, first.account)).status, 200);
  assert.equal((await call(db, THURSDAY + 2_000, 'POST', '/v1/leagues/join', { code: league.body.code }, second.account)).status, 200);
  assert.equal((await call(db, THURSDAY + 3_000, 'DELETE', '/v1/players/me', undefined, founder.account)).status, 200);
  const row = await db.first<{ owner: string }>('SELECT owner FROM leagues WHERE code = ?', league.body.code);
  assert.equal(row?.owner, first.account.id);
  // Haftalık temizlik de (silmeyle aynı anda kalmış kuruculuk için yedek).
  await db.run('UPDATE leagues SET owner = ? WHERE code = ?', founder.account.id, league.body.code);
  assert.equal((await call(db, THURSDAY + 7 * 86_400_000, 'GET', '/v1/league', undefined, second.account)).status, 200);
  assert.equal((await db.first<{ owner: string }>('SELECT owner FROM leagues WHERE code = ?', league.body.code))?.owner, first.account.id);
});

test('hesap silinirken bağlı cihazdan gelen katılım ve eşitleme lig ya da grup yeri tutmuyor; kalan artık haftalık temizlikte gidiyor', async () => {
  const db = laggy(memoryDb());
  const owner = await webPlayer(db, THURSDAY, 'Kurucu');
  const league = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Aile' }, owner.account);
  for (let round = 0; round < 8; round++) {
    const web = await webPlayer(db, THURSDAY, `Giden ${round}`);
    play(web.game, 5);
    assert.equal((await web.push(THURSDAY + 6_000)).status, 200);
    const link = await call(db, THURSDAY + 7_000, 'POST', '/v1/link', {}, web.account);
    const claim = await call(db, THURSDAY + 8_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'android' });
    const phone: Account = { id: claim.body.id, token: claim.body.token };
    const phoneGame = new SyncedGame(claim.body.save.state as LiteState);
    phoneGame.tick(3);
    // Silme, katılım ve eşitleme aynı anda; katılım ve eşitleme her turda biraz daha geç başlıyor.
    const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const results = await Promise.all([
      call(db, THURSDAY + 12_000, 'DELETE', '/v1/players/me', undefined, web.account),
      later(round).then(() => call(db, THURSDAY + 12_000, 'POST', '/v1/leagues/join', { code: league.body.code }, phone)),
      later(round).then(() =>
        call(db, THURSDAY + 12_000, 'POST', '/v1/sync', { base: claim.body.save.version, batch: `phone-del-${round}`, ops: phoneGame.journal.take(), rest: 0 }, phone),
      ),
    ]);
    assert.equal(results[0].status, 200);
    // Silmeden önce yetişen 200, sonra gelen 401 (eşitleme kaydı silinmiş bulursa 404).
    for (const r of results.slice(1)) assert.ok([200, 401, 404].includes(r.status), `${round}: ${r.status} ${JSON.stringify(r.body)}`);
    for (const table of ['league_members', 'groups']) {
      const left = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`, web.account.id);
      assert.equal(left?.n, 0, `${round}: ${table}`);
    }
  }
  const members = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE code = ?', league.body.code);
  assert.equal(members!.n, 1);


  // Silmeyle aynı anda yazılıp kalmış artıklar (örneğin yanıtı yolda olan bir eşitlemenin profili):
  // bir sonraki haftanın ilk isteğinde temizleniyor; boşalan lig de gidiyor, dolu lig kalıyor.
  const ghost = '00000000-0000-4000-8000-000000000000';
  await db.run("INSERT INTO reports (player_id, week, score, city, stars, city_earned, levels, at) VALUES (?, ?, 1, 0, 0, 1, '[]', 0)", ghost, weekId(THURSDAY));
  await db.run("INSERT INTO saves (player_id, version, state, cursor, batch, at) VALUES (?, 1, '{}', 0, NULL, 0)", ghost);
  await db.run('INSERT INTO groups (week, player_id, division, group_no) VALUES (?, ?, 0, 0)', weekId(THURSDAY), ghost);
  await db.run('INSERT INTO league_members (code, player_id, joined_at) VALUES (?, ?, 0)', league.body.code, ghost);
  await db.run("INSERT INTO leagues (code, name, owner, created_at) VALUES ('HAYALT', 'Hayalet', ?, 0)", ghost);
  await db.run("INSERT INTO league_members (code, player_id, joined_at) VALUES ('HAYALT', ?, 0)", ghost);
  const nextWeek = THURSDAY + 7 * 86_400_000;
  assert.equal((await call(db, nextWeek, 'GET', '/v1/league', undefined, owner.account)).status, 200);
  for (const table of ['reports', 'saves', 'groups', 'league_members']) {
    const left = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`, ghost);
    assert.equal(left?.n, 0, table);
  }
  assert.equal(await db.first("SELECT 1 AS x FROM leagues WHERE code = 'HAYALT'"), null);
  assert.ok(await db.first('SELECT 1 AS x FROM leagues WHERE code = ?', league.body.code));
  assert.ok(await db.first('SELECT 1 AS x FROM saves WHERE player_id = ?', owner.account.id));
});

test('hesap silinirken süren istek bitince kendi yazdıklarını da siliyor', async () => {
  // Profil yazımı yavaş: eşitleme kimlik denetiminden geçtikten sonra silme araya girip bitebilsin.
  const base = laggy(memoryDb());
  const db: Db = {
    ...base,
    run: async (sql, ...args) => (/^INSERT INTO profiles/.test(sql) && (await new Promise((resolve) => setTimeout(resolve, 40))), base.run(sql, ...args)),
  };
  const tables = ['league_members', 'groups', 'reports', 'rejects', 'attest_keys', 'attest_challenges', 'tokens', 'saves', 'profiles', 'links'];
  for (let round = 0; round < 6; round++) {
    const web = await webPlayer(db, THURSDAY, `Süren ${round}`);
    play(web.game, 3);
    assert.equal((await web.push(THURSDAY + 4_000)).status, 200);
    const link = await call(db, THURSDAY + 5_000, 'POST', '/v1/link', {}, web.account);
    const claim = await call(db, THURSDAY + 6_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'android' });
    const phone: Account = { id: claim.body.id, token: claim.body.token };
    const phoneGame = new SyncedGame(claim.body.save.state as LiteState);
    phoneGame.tick(3);
    const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const [synced, gone] = await Promise.all([
      call(db, THURSDAY + 12_000, 'POST', '/v1/sync', { base: claim.body.save.version, batch: `fence-${round}-sync`, ops: phoneGame.journal.take(), rest: 0 }, phone),
      later(round * 2).then(() => call(db, THURSDAY + 12_000, 'DELETE', '/v1/players/me', undefined, web.account)),
    ]);
    assert.equal(gone.status, 200);
    assert.ok([200, 401, 404].includes(synced.status), `${round}: ${synced.status}`);
    for (const table of tables) {
      const left = await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE player_id = ?`, web.account.id);
      assert.equal(left?.n, 0, `${round}: ${table}`);
    }
  }
});

test('taşıma kodu silmeyle aynı anda: ya hesap kaydıyla geliyor ya kod geçersiz; silinen hesaba token kalmıyor', async () => {
  // Token yazımı yavaş: oyuncu okunduktan sonra silme araya girebilsin.
  const base = laggy(memoryDb());
  const db: Db = {
    ...base,
    run: async (sql, ...args) => (/^INSERT INTO tokens/.test(sql) && (await new Promise((resolve) => setTimeout(resolve, 40))), base.run(sql, ...args)),
  };
  for (let round = 0; round < 8; round++) {
    const web = await webPlayer(db, THURSDAY, `Taşınan ${round}`);
    play(web.game, 3);
    assert.equal((await web.push(THURSDAY + 4_000)).status, 200);
    const link = await call(db, THURSDAY + 5_000, 'POST', '/v1/link', {}, web.account);
    const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const [gone, claim] = await Promise.all([
      call(db, THURSDAY + 6_000, 'DELETE', '/v1/players/me', undefined, web.account),
      later(round).then(() => call(db, THURSDAY + 6_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'android' })),
    ]);
    assert.equal(gone.status, 200);
    assert.ok([201, 404].includes(claim.status), `${round}: ${claim.status}`);
    if (claim.status === 201) assert.ok(claim.body.save, `${round}: kayıtsız hesap`);
    const tokens = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM tokens WHERE player_id = ?', web.account.id);
    assert.equal(tokens?.n, 0, `${round}: silinen hesaba token kaldı`);
  }
});

/** Swift'in kodladığı biçim: zincirler dizi, boş isteğe bağlı alanlar yok. */
function swiftShape(state: LiteState): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...state, chains: CHAIN_IDS.map((id) => state.chains[id]) };
  for (const key of ['event', 'policy', 'deal', 'council']) if (raw[key] === null) delete raw[key];
  for (const key of ['event', 'deal']) {
    const value = raw[key] as Record<string, unknown> | undefined;
    if (value && value.chain === null) {
      const { chain: _, ...rest } = value;
      raw[key] = rest;
    }
  }
  return raw;
}

test('iOS: cihazdaki oyunu App Attest onayıyla yüklüyor, kodla web\'e taşıyor; web ilerleyince iOS 409 alıp dönüyor', async () => {
  const db = memoryDb();
  const ios = await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Elma Holding' });
  const account: Account = { id: ios.body.id, token: ios.body.token };
  const device = PKI.device();
  const challenge = await call(db, THURSDAY, 'POST', '/v1/attest/challenge', {}, account);
  const attested = await call(db, THURSDAY, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(challenge.body.challenge), challenge: challenge.body.challenge }, account);
  assert.equal(attested.status, 200);
  // Kayıt yokken taşıma kodu yok.
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/link', {}, account)).body.error, 'save');
  const upload = async (at: number, base: number | null, state: LiteState, signed = true) => {
    const text = JSON.stringify({ base, state: swiftShape(state) });
    const headers: Record<string, string> = signed ? { 'x-attest-key': device.keyId, 'x-attest-assertion': device.assert(text) } : {};
    const response = await handle(
      new Request('https://lig.test/v1/save', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${account.id}.${account.token}`, ...headers }, body: text }),
      db,
      at,
      OPTIONS,
    );
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  // Swift'in zinciri yazmadığı alanlar: yatırımcı fırsatı ve turizm olayı.
  const phoneState = { ...step(newGame(), 120), deal: { kind: 'investor' as const, chain: null, until: 128 }, event: { kind: 'tourism' as const, chain: null, until: 300 } };
  assert.equal((await upload(THURSDAY + 1_000, null, phoneState, false)).status, 403, 'onaysız yükleme yok');
  const first = await upload(THURSDAY + 2_000, null, phoneState);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.version, 1);
  const saved = await call(db, THURSDAY + 3_000, 'GET', '/v1/save', undefined, account);
  assert.deepEqual(saved.body.state, phoneState);
  assert.equal(saved.body.week, weekId(THURSDAY));

  // Web'e taşı: kod, al, oyna, eşitle.
  const link = await call(db, THURSDAY + 4_000, 'POST', '/v1/link', {}, account);
  const claim = await call(db, THURSDAY + 5_000, 'POST', '/v1/link/claim', { code: link.body.code, platform: 'web' });
  assert.equal(claim.status, 201);
  assert.deepEqual(claim.body.save.state, phoneState);
  const web: Account = { id: claim.body.id, token: claim.body.token };
  const webGame = new SyncedGame(claim.body.save.state);
  webGame.tick(60);
  const synced = await call(db, THURSDAY + 66_000, 'POST', '/v1/sync', { base: 1, batch: 'web-after-link-01', ops: webGame.journal.take(), rest: 0 }, web);
  assert.equal(synced.status, 200, JSON.stringify(synced.body));
  assert.deepEqual(synced.body.state, webGame.state);
  // Web'in token'ı iOS kaydı yükleyemiyor.
  assert.equal((await call(db, THURSDAY + 67_000, 'POST', '/v1/save', { base: 2, state: webGame.state }, web)).body.error, 'platform');

  // iPhone eski sürümün üstüne yüklüyor: 409 ve web'in durumu; ona dönüp yeniden yüklüyor.
  const stale = await upload(THURSDAY + 70_000, 1, step(phoneState, 30));
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body.state, webGame.state);
  // Haftalık sayaç sunucunun puanından sürsün: yanıtta hafta ve puan.
  const current = await call(db, THURSDAY + 70_500, 'GET', '/v1/save', undefined, web);
  assert.equal(stale.body.week, weekId(THURSDAY + 70_000));
  assert.equal(typeof stale.body.score, 'number');
  assert.equal(stale.body.score, current.body.score);
  const back = await upload(THURSDAY + 71_000, stale.body.version, step(stale.body.state, 5));
  assert.equal(back.status, 200);
  assert.equal(back.body.version, 3);
  // Bozuk kayıt reddediliyor.
  const broken = { ...phoneState, cash: -5 };
  assert.equal((await upload(THURSDAY + 72_000, 3, broken)).body.error, 'body');
});
