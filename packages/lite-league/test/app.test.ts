import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_IDS, advance, buy, newGame, weekId, weekStart, type LeagueReport, type LiteState } from '../../lite-model/src/index';
import { cleanName, handle, rollover } from '../src/app';
import type { Db } from '../src/db';
import { memoryDb } from './sqlite';

/** 2026-W42'nin perşembesi, öğlen. */
const THURSDAY = Date.UTC(2026, 9, 15, 12);

interface Account {
  id: string;
  token: string;
}

async function call(db: Db, now: number, method: string, path: string, body?: unknown, who?: Account) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (who) headers.authorization = `Bearer ${who.id}.${who.token}`;
  const response = await handle(
    new Request(`https://lig.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    db,
    now,
  );
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function signUp(db: Db, now: number, name: string): Promise<Account> {
  const r = await call(db, now, 'POST', '/v1/players', { name });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.id, token: r.body.token };
}

function played(seconds = 600): LiteState {
  let s = newGame();
  s.cash = 1e5;
  for (const stage of [0, 1, 2] as const) {
    const r = buy(s, 'bakery', stage, 20);
    assert.ok(r.ok);
    s = r.state;
  }
  return advance(s, seconds);
}

function report(state: LiteState, now: number, score: number): LeagueReport {
  return {
    week: weekId(now),
    score,
    city: state.city,
    stars: state.stars,
    cityEarned: state.earned,
    levels: CHAIN_IDS.map((id) => [...state.chains[id].levels]),
  };
}

test('ad kuralları', () => {
  assert.equal(cleanName('  Atilla   Holding '), 'Atilla Holding');
  assert.equal(cleanName('Şehir_42-Çay'), 'Şehir_42-Çay');
  assert.equal(cleanName('ab'), null);
  assert.equal(cleanName('x'.repeat(17)), null);
  assert.equal(cleanName('<script>'), null);
  assert.equal(cleanName(42), null);
});

test('kayıt ve kimlik: token olmadan, yanlış tokenla girilmiyor', async () => {
  const db = memoryDb();
  const health = await call(db, THURSDAY, 'GET', '/v1/health');
  assert.deepEqual(health.body, { ok: true, week: '2026-W42' });
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/players', { name: 'x' })).status, 400);
  const me = await signUp(db, THURSDAY, 'Atilla');
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/league')).status, 401);
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/league', undefined, { id: me.id, token: '0'.repeat(64) })).status, 401);
  const league = await call(db, THURSDAY, 'GET', '/v1/league', undefined, me);
  assert.equal(league.status, 200);
  assert.equal(league.body.divisionKey, 'bronze');
  assert.deepEqual(league.body.group, []);
  assert.equal(league.body.endsAt, weekStart('2026-W42') + 7 * 86_400_000);
  const renamed = await call(db, THURSDAY, 'PATCH', '/v1/players/me', { name: 'Atilla Holding' }, me);
  assert.equal(renamed.body.name, 'Atilla Holding');
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/nope', undefined, me)).status, 404);
});

test('gönderim: gerçek oyun kabul, sık gönderim, yanlış hafta ve hile reddediliyor', async () => {
  const db = memoryDb();
  const me = await signUp(db, THURSDAY, 'Atilla');
  let state = played();
  const first = await call(db, THURSDAY, 'POST', '/v1/reports', report(state, THURSDAY, state.earned), me);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.group.length, 1);
  assert.deepEqual(first.body.group[0], { rank: 1, name: 'Atilla', score: state.earned, me: true, move: 1 });

  assert.equal((await call(db, THURSDAY + 10_000, 'POST', '/v1/reports', report(state, THURSDAY, state.earned), me)).status, 429);

  const wrongWeek = { ...report(state, THURSDAY, state.earned), week: '2026-W41' };
  const stale = await call(db, THURSDAY + 60_000, 'POST', '/v1/reports', wrongWeek, me);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.week, '2026-W42');

  // Beş dakika sonra: gerçekten beş dakika oynanmış durum kabul.
  state = advance(state, 300);
  const second = await call(db, THURSDAY + 300_000, 'POST', '/v1/reports', report(state, THURSDAY, state.earned), me);
  assert.equal(second.status, 200, JSON.stringify(second.body));

  // Telefon saati ileri: bir günlük kazanç, sunucuya göre beş dakika.
  const day = advance(state, 86_400);
  const cheat = await call(db, THURSDAY + 600_000, 'POST', '/v1/reports', report(day, THURSDAY, day.earned), me);
  assert.equal(cheat.status, 422);
  assert.equal(cheat.body.reason, 'rate');
  const rejects = await db.all<{ reason: string }>('SELECT reason FROM rejects');
  assert.deepEqual(rejects, [{ reason: 'rate' }]);
});

test('gruplar: bölüm başına en çok 30 kişi', async () => {
  const db = memoryDb();
  const state = played();
  for (let i = 0; i < 31; i++) {
    const who = await signUp(db, THURSDAY, `Oyuncu ${i}`);
    const r = await call(db, THURSDAY + i, 'POST', '/v1/reports', report(state, THURSDAY, i * 10), who);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const groups = await db.all<{ group_no: number; n: number }>('SELECT group_no, COUNT(*) AS n FROM groups GROUP BY group_no ORDER BY group_no');
  assert.deepEqual(groups, [
    { group_no: 0, n: 30 },
    { group_no: 1, n: 1 },
  ]);
});

test('hafta dönümü: ilk beş çıkıyor, son beş iniyor, bir kez', async () => {
  const db = memoryDb();
  const state = played();
  const accounts: Account[] = [];
  for (let i = 0; i < 12; i++) {
    const who = await signUp(db, THURSDAY, `Oyuncu ${i}`);
    accounts.push(who);
    await db.run('UPDATE players SET division = 1 WHERE id = ?', who.id);
    const r = await call(db, THURSDAY + i, 'POST', '/v1/reports', report(state, THURSDAY, (12 - i) * 100), who);
    assert.equal(r.status, 200);
  }
  const nextMonday = weekStart('2026-W43') + 3_600_000;
  // İlk istek geçen haftanın dönümünü yapıyor; ikinci kez yapılmıyor.
  const league = await call(db, nextMonday, 'GET', '/v1/league', undefined, accounts[0]);
  assert.equal(league.body.week, '2026-W43');
  assert.equal(league.body.divisionKey, 'gold');
  assert.equal(await rollover(db, nextMonday), false);
  const divisions = await db.all<{ name: string; division: number }>('SELECT name, division FROM players ORDER BY created_at, name');
  const byName = Object.fromEntries(divisions.map((d) => [d.name, d.division]));
  for (let i = 0; i < 5; i++) assert.equal(byName[`Oyuncu ${i}`], 2, `Oyuncu ${i} çıkmalıydı`);
  for (let i = 5; i < 7; i++) assert.equal(byName[`Oyuncu ${i}`], 1);
  for (let i = 7; i < 12; i++) assert.equal(byName[`Oyuncu ${i}`], 0, `Oyuncu ${i} inmeliydi`);
});

test('özel lig: kur, koda katıl, sırala, ayrıl', async () => {
  const db = memoryDb();
  const state = played();
  const owner = await signUp(db, THURSDAY, 'Atilla');
  const friend = await signUp(db, THURSDAY, 'Deniz');
  const created = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Ofis Ligi' }, owner);
  assert.equal(created.status, 201);
  assert.match(created.body.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/leagues/join', { code: 'ZZZZZZ' }, friend)).status, 404);
  const joined = await call(db, THURSDAY, 'POST', '/v1/leagues/join', { code: created.body.code.toLowerCase() }, friend);
  assert.deepEqual(joined.body, { code: created.body.code, name: 'Ofis Ligi' });
  await call(db, THURSDAY, 'POST', '/v1/reports', report(state, THURSDAY, 500), owner);
  await call(db, THURSDAY + 1, 'POST', '/v1/reports', report(state, THURSDAY, 900), friend);
  const mine = await call(db, THURSDAY + 2, 'GET', '/v1/leagues', undefined, owner);
  assert.equal(mine.body.leagues.length, 1);
  assert.deepEqual(
    mine.body.leagues[0].members.map((m: { name: string; score: number; me: boolean }) => [m.name, m.score, m.me]),
    [
      ['Deniz', 900, false],
      ['Atilla', 500, true],
    ],
  );
  await call(db, THURSDAY + 3, 'DELETE', `/v1/leagues/${created.body.code}`, undefined, owner);
  await call(db, THURSDAY + 3, 'DELETE', `/v1/leagues/${created.body.code}`, undefined, friend);
  assert.equal((await db.all('SELECT * FROM leagues')).length, 0, 'son üye ayrılınca lig silinmeli');
});
