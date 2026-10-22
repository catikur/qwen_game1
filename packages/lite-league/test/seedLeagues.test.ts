import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRun, type LeagueRun } from '../../core/src/index';
import { handle, weekly } from '../src/app';
import type { Db } from '../src/db';
import { SEED_LEAGUE } from '../src/seedLeagues';
import { memoryDb } from './sqlite';
import { TEST_SIM, TRUSTING } from './trust';

/** Davetli ligler (Tur 55). 2026-W42'nin perşembesi, öğlen. */
const THURSDAY = Date.UTC(2026, 9, 15, 12);
const WEEK = '2026-W42';
const DAY = '2026-10-15';

interface Account {
  id: string;
  token: string;
}

async function call(db: Db, now: number, method: string, path: string, body?: unknown, who?: Account, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${who.id}.${who.token}`;
  const response = await handle(
    new Request(`https://lig.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    db,
    now,
    TRUSTING,
  );
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, any> };
}

async function account(db: Db): Promise<Account> {
  const r = await call(db, THURSDAY, 'POST', '/v1/seed/players');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.id, token: r.body.token };
}

/** Her oyuncunun koşusu başka (aynı skor ve eğri sunucuda kopya sayılıyor). */
function run(company: string, score: number, weekId: string = WEEK): LeagueRun {
  return {
    version: 2,
    weekId,
    ceoId: null,
    companyName: company,
    score,
    curve: [100_000, score / 2, score],
    log: [[1, { type: 'SET_FOCUS', focus: 'growth' } as never]],
    sim: TEST_SIM,
  };
}

async function submit(db: Db, who: Account, value: LeagueRun) {
  const r = await call(db, THURSDAY, 'POST', '/v1/seed/runs', { code: encodeRun(value) }, who);
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

async function create(db: Db, who: Account, name: string) {
  return call(db, THURSDAY, 'POST', '/v1/seed/leagues', { name }, who);
}

test('davetli lig: kur, kodla katıl; tablo yalnız üyelerin koşuları, yalnız üyelere', async () => {
  const db = memoryDb();
  const [a, b, c] = [await account(db), await account(db), await account(db)];
  const made = await create(db, a, 'Kuzey Ligi');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.match(made.body.code, /^[A-Z2-9]{6}$/);
  assert.deepEqual({ name: made.body.name, members: made.body.members }, { name: 'Kuzey Ligi', members: 1 });

  // Kod küçük harfle ve boşlukla da geçiyor.
  const joined = await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: ` ${made.body.code.toLowerCase()} ` }, b);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.deepEqual(joined.body, { code: made.body.code, name: 'Kuzey Ligi', members: 2 });
  // İkinci kez katılmak bir şey değiştirmiyor.
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: made.body.code }, b)).body.members, 2);

  await submit(db, a, run('Atilla Holding', 1_200_000));
  await submit(db, b, run('Deniz Ticaret', 1_500_000));
  await submit(db, c, run('Dışarıdan AŞ', 9_000_000));

  const table = await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${made.body.code}/weeks/${WEEK}`, undefined, a);
  assert.equal(table.status, 200, JSON.stringify(table.body));
  assert.equal(table.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    table.body.entries.map((e: { companyName: string; score: number; mine: boolean; verified: boolean }) => [e.companyName, e.score, e.mine, e.verified]),
    [
      ['Deniz Ticaret', 1_500_000, false, true],
      ['Atilla Holding', 1_200_000, true, true],
    ],
    'üye olmayanın koşusu yok; skora göre',
  );
  assert.deepEqual(
    { name: table.body.name, members: table.body.members, total: table.body.total, open: table.body.open },
    { name: 'Kuzey Ligi', members: 2, total: 2, open: true },
  );

  // Üye olmayan ve kimliksiz göremiyor; ligin varlığı da kodla söylenmiyor.
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${made.body.code}/weeks/${WEEK}`, undefined, c)).status, 403);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${made.body.code}/weeks/${WEEK}`)).status, 401);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/leagues/ZZZZZZ/weeks/${WEEK}`, undefined, a)).status, 404);

  // Liglerim.
  const mine = await call(db, THURSDAY, 'GET', '/v1/seed/leagues', undefined, b);
  assert.deepEqual(mine.body, { leagues: [{ code: made.body.code, name: 'Kuzey Ligi', members: 2 }] });
  assert.deepEqual((await call(db, THURSDAY, 'GET', '/v1/seed/leagues', undefined, c)).body, { leagues: [] });
});

test('davetli lig: günün koşusunun tablosu ayrı; uç kimliğin türünü istiyor', async () => {
  const db = memoryDb();
  const [a, b] = [await account(db), await account(db)];
  const { code } = (await create(db, a, 'Gün Ligi')).body;
  await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code }, b);
  await submit(db, a, run('Atilla Holding', 1_200_000));
  await submit(db, b, run('Deniz Ticaret', 800_000, DAY));

  const day = await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${code}/days/${DAY}`, undefined, a);
  assert.equal(day.status, 200, JSON.stringify(day.body));
  assert.deepEqual(
    day.body.entries.map((e: { companyName: string }) => e.companyName),
    ['Deniz Ticaret'],
  );
  const week = await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${code}/weeks/${WEEK}`, undefined, a);
  assert.deepEqual(
    week.body.entries.map((e: { companyName: string }) => e.companyName),
    ['Atilla Holding'],
  );
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${code}/days/${WEEK}`, undefined, a)).status, 400);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/leagues/${code}/weeks/${DAY}`, undefined, a)).status, 400);
});

test('davetli lig: ad kuralları, bilinmeyen kod, sınırlar (oyuncu başına ve lig başına)', async () => {
  const db = memoryDb();
  const a = await account(db);
  assert.deepEqual((await create(db, a, 'x')).body, { error: 'name' });
  assert.deepEqual((await create(db, a, 'Orospu Ligi')).body, { error: 'name-blocked' });
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: 'ZZZZZZ' }, a)).status, 404);

  const codes: string[] = [];
  for (let i = 0; i < SEED_LEAGUE.perPlayer; i++) codes.push((await create(db, a, `Lig ${i + 1}`)).body.code);
  assert.deepEqual((await create(db, a, 'Bir fazla')).body, { error: 'limit' });
  const other = await account(db);
  const extra = (await create(db, other, 'Başkasının Ligi')).body.code;
  assert.deepEqual((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: extra }, a)).body, { error: 'limit' });
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/seed/leagues', undefined, a)).body.leagues.length, SEED_LEAGUE.perPlayer);

  // Lig dolunca.
  for (let i = 1; i < SEED_LEAGUE.members; i++) {
    const member = await account(db);
    assert.equal((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: codes[0] }, member)).status, 200);
  }
  const late = await account(db);
  assert.deepEqual((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: codes[0] }, late)).body, { error: 'full' });
});

test('davetli lig: IP başına saatlik deneme sınırı (kodları deneyerek liglere girilmesin)', async () => {
  const db = memoryDb();
  const a = await account(db);
  const ip = { 'cf-connecting-ip': '203.0.113.7' };
  for (let i = 0; i < SEED_LEAGUE.attemptsPerHour; i++) {
    assert.equal((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: `AAAA${i}` }, a, ip)).status, 404);
  }
  const busy = await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: 'AAAAAA' }, a, ip);
  assert.equal(busy.status, 429);
  assert.equal(busy.body.error, 'busy');
});

test('davetli lig: ayrılan son üyeyle lig gidiyor; hesap silinince üyelikler ve boş ligler de', async () => {
  const db = memoryDb();
  const [a, b] = [await account(db), await account(db)];
  const solo = (await create(db, a, 'Tek Kişilik')).body.code;
  const shared = (await create(db, a, 'Ortak Lig')).body.code;
  await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: shared }, b);

  assert.deepEqual((await call(db, THURSDAY, 'DELETE', `/v1/seed/leagues/${solo.toLowerCase()}`, undefined, a)).body, { ok: true });
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/seed/leagues/join', { code: solo }, b)).status, 404, 'boş lig silindi');

  // A hesabını siliyor: ortak lig B ile kalıyor, A'nın üyeliği gidiyor.
  assert.equal((await call(db, THURSDAY, 'DELETE', '/v1/players/me', undefined, a)).status, 200);
  assert.deepEqual((await call(db, THURSDAY, 'GET', '/v1/seed/leagues', undefined, b)).body.leagues, [{ code: shared, name: 'Ortak Lig', members: 1 }]);
  // B de siliyor: lig boşaldı, gitti.
  assert.equal((await call(db, THURSDAY, 'DELETE', '/v1/players/me', undefined, b)).status, 200);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_leagues'))?.n, 0);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_league_members'))?.n, 0);
});

test('davetli lig: haftalık temizlik hesabı silinmiş üyeleri ve boş ligleri siliyor', async () => {
  const db = memoryDb();
  const a = await account(db);
  const { code } = (await create(db, a, 'Kalıntı Ligi')).body;
  // Hesap satırı başka yoldan gitti (eski sürüm, yarım kalmış silme).
  await db.run('DELETE FROM players WHERE id = ?', a.id);
  await weekly(db, THURSDAY + 7 * 86_400_000);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_league_members WHERE code = ?', code))?.n, 0);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_leagues WHERE code = ?', code))?.n, 0);
});

test('davetli lig: Lite hesabı ana oyunun liglerini kullanamıyor', async () => {
  const db = memoryDb();
  const lite = await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Atilla' });
  assert.equal(lite.status, 201, JSON.stringify(lite.body));
  const who = { id: lite.body.id, token: lite.body.token };
  const r = await call(db, THURSDAY, 'POST', '/v1/seed/leagues', { name: 'Lite Ligi' }, who);
  assert.ok(r.status === 403 || r.status === 404, `${r.status}`);
  assert.equal((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_leagues'))?.n, 0);
});

test('davetli lig: şema henüz yoksa sağlık ucu friends 0, uçlar 503; hesap silme ve haftalık temizlik bozulmuyor', async () => {
  const db = memoryDb();
  await db.run('DROP TABLE seed_league_members');
  await db.run('DROP TABLE seed_leagues');
  const health = await call(db, THURSDAY, 'GET', '/v1/health');
  assert.equal(health.body.friends, 0);
  assert.equal(health.body.daily, 1);
  const a = await account(db);
  assert.deepEqual((await create(db, a, 'Erken Lig')).body, { error: 'schema' });
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/seed/leagues', undefined, a)).status, 503);
  await weekly(db, THURSDAY + 7 * 86_400_000);
  assert.equal((await call(db, THURSDAY, 'DELETE', '/v1/players/me', undefined, a)).status, 200);

  // Şemayla: friends 1.
  assert.equal((await call(memoryDb(), THURSDAY, 'GET', '/v1/health')).body.friends, 1);
});
