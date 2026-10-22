import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAIN_IDS, LEAGUE, advance, buy, divisionMoves, newGame, weekId, weekStart, type LeagueReport, type LiteState } from '../../lite-model/src/index';
import { cleanName, handle, offensiveName, rollover } from '../src/app';
import type { Db } from '../src/db';
import { fakePki, type FakeDevice } from './fake-attest';
import { memoryDb } from './sqlite';

/** 2026-W42'nin perşembesi, öğlen. */
const THURSDAY = Date.UTC(2026, 9, 15, 12);
const PKI = fakePki('TEAM123456.com.test.lite', THURSDAY);

interface Account {
  id: string;
  token: string;
  /** Kanıtlanmış cihaz: gönderimler bununla onaylanıyor. */
  device?: FakeDevice;
}

async function call(db: Db, now: number, method: string, path: string, body?: unknown, who?: Account, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${who.id}.${who.token}`;
  const text = body === undefined ? undefined : JSON.stringify(body);
  // Uygulama gibi: her gönderim gövdenin tam baytları üstüne onaylı.
  if (who?.device && method === 'POST' && path === '/v1/reports' && text !== undefined && !('x-attest-key' in extra)) {
    headers['x-attest-key'] = who.device.keyId;
    headers['x-attest-assertion'] = who.device.assert(text);
  }
  const response = await handle(new Request(`https://lig.test${path}`, { method, headers, body: text }), db, now, { attest: PKI.config });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

/** Kanıtla: challenge → kanıt → kayıtlı anahtar. */
async function attest(db: Db, now: number, who: Account, device: FakeDevice = PKI.device()): Promise<Account> {
  const challenge = await call(db, now, 'POST', '/v1/attest/challenge', {}, who);
  assert.equal(challenge.status, 200, JSON.stringify(challenge.body));
  const attested = await call(db, now, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(challenge.body.challenge), challenge: challenge.body.challenge }, who);
  assert.equal(attested.status, 200, JSON.stringify(attested.body));
  return { ...who, device };
}

async function signUp(db: Db, now: number, name: string): Promise<Account> {
  const r = await call(db, now, 'POST', '/v1/players', { name });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return attest(db, now, { id: r.body.id, token: r.body.token });
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

test('küfür süzgeci: tek sözcük ve kök, rakamlı yazım; masum adlar geçiyor', async () => {
  for (const bad of ['Orospu Holding', 'Kral_0r0spu', 'Sik AŞ', 'AMK', 'F-U-C-K', 'Bitch Co', 'Siktir Git', 'Hitler Ltd', 'S-İ-K', 'si k Holding', 'A M K', 'p_i_ç Ltd']) {
    assert.equal(offensiveName(bad), true, bad);
  }
  for (const fine of ['Sikke Holding', 'Atilla Holding', 'Amazon Kahve', 'Ambar', 'Gotham', 'Picasso Moda', 'Malatya Gıda', 'Mal Holding', 'Ocak Fırın', 'S İ Kahve', 'A Market']) {
    assert.equal(offensiveName(fine), false, fine);
  }
  const db = memoryDb();
  assert.deepEqual((await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Orospu AŞ' })).body, { error: 'name-blocked' });
  const me = await signUp(db, THURSDAY, 'Atilla');
  assert.equal((await call(db, THURSDAY, 'PATCH', '/v1/players/me', { name: 'yarrak' }, me)).body.error, 'name-blocked');
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Fuck Ligi' }, me)).body.error, 'name-blocked');
});

test('kayıt ve kimlik: token olmadan, yanlış tokenla girilmiyor', async () => {
  const db = memoryDb();
  const health = await call(db, THURSDAY, 'GET', '/v1/health');
  assert.deepEqual(health.body, { ok: true, week: '2026-W42', seed: 1, verify: 1, daily: 1, friends: 1 });
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
  assert.deepEqual(first.body.group[0], { rank: 1, name: 'Atilla', score: state.earned, me: true, move: 1, platform: 'ios' });

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

test('hafta dönümü yarıda kalırsa hiçbir şey yazılmıyor; sonraki istek baştan yapıyor', async () => {
  const db = memoryDb();
  const state = played();
  const accounts: Account[] = [];
  for (let i = 0; i < 12; i++) {
    const who = await signUp(db, THURSDAY, `Oyuncu ${i}`);
    accounts.push(who);
    await db.run('UPDATE players SET division = 1 WHERE id = ?', who.id);
    await call(db, THURSDAY + i, 'POST', '/v1/reports', report(state, THURSDAY, (12 - i) * 100), who);
  }
  const nextMonday = weekStart('2026-W43') + 3_600_000;
  // Son bölüm değişikliği düşüyor (ör. D1 bağlantısı koptu).
  const flaky: Db = {
    ...db,
    batch: (statements) => db.batch([...statements.slice(0, -1), ['UPDATE yok SET x = 1']]),
  };
  await assert.rejects(rollover(flaky, nextMonday));
  assert.equal((await db.all("SELECT * FROM rollovers WHERE week = '2026-W42'")).length, 0, 'işaret de geri alınmalı');
  const untouched = await db.all<{ division: number }>('SELECT division FROM players');
  assert.ok(untouched.every((p) => p.division === 1), 'hiçbir bölüm değişmemeli');
  // Sonraki istek dönümü baştan ve bir kez yapıyor.
  assert.equal(await rollover(db, nextMonday), true);
  assert.equal(await rollover(db, nextMonday), false);
  const moved = await db.all<{ division: number }>('SELECT division FROM players');
  assert.equal(moved.filter((p) => p.division === 2).length, 5);
  assert.equal(moved.filter((p) => p.division === 0).length, 5);
});

test('hafta dönümü büyük ligde de birkaç sorgu; sonuç divisionMoves ile aynı', async () => {
  const db = memoryDb();
  // Tohumlu rastgele: eşit puanlar ve sıfırlar da çıksın.
  let seed = 42;
  const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
  // Bölüm başına grup boyları: orta bölümde beş dolu grup (tek tek güncellemede 50 sorguyu aşıyordu).
  const layout: number[][] = [[30, 7], [30, 30, 30, 30, 30], [12], [10]];
  const expected = new Map<string, number>();
  let serial = 0;
  for (const [division, sizes] of layout.entries()) {
    for (const [groupNo, size] of sizes.entries()) {
      const rows: Array<{ id: string; score: number; created: number }> = [];
      for (let i = 0; i < size; i++) {
        const id = `p${String(serial++).padStart(4, '0')}`;
        const created = THURSDAY - Math.floor(random() * 5) * 1000;
        const roll = random();
        const score = roll < 0.15 ? 0 : Math.floor(roll * 20) * 100;
        await db.run('INSERT INTO players (id, name, token_hash, division, created_at) VALUES (?, ?, ?, ?, ?)', id, id, '-', division, created);
        await db.run('INSERT INTO groups (week, player_id, division, group_no) VALUES (?, ?, ?, ?)', '2026-W42', id, division, groupNo);
        // Bazıları hiç göndermedi (puan 0).
        if (score > 0 || random() < 0.5) {
          await db.run(
            'INSERT INTO reports (player_id, week, score, city, stars, city_earned, levels, at) VALUES (?, ?, ?, 0, 0, 0, ?, ?)',
            id, '2026-W42', score, '[]', THURSDAY,
          );
        }
        rows.push({ id, score, created });
      }
      // groupRows sırası: puan, sonra kayıt anı, sonra kimlik.
      rows.sort((a, b) => b.score - a.score || a.created - b.created || (a.id < b.id ? -1 : 1));
      const moves = divisionMoves(rows.map((r) => r.score), division);
      rows.forEach((r, i) => expected.set(r.id, Math.max(0, Math.min(LEAGUE.divisions - 1, division + (moves[i] ?? 0)))));
    }
  }
  let queries = 0;
  const counted: Db = {
    run: (...a) => (queries++, db.run(...a)),
    first: (...a) => (queries++, db.first(...a)),
    all: (...a) => (queries++, db.all(...a)),
    batch: (statements) => ((queries += statements.length), db.batch(statements)),
  };
  assert.equal(await rollover(counted, weekStart('2026-W43') + 60_000), true);
  assert.ok(queries <= 4, `${queries} sorgu`);
  const actual = await db.all<{ id: string; division: number }>('SELECT id, division FROM players');
  assert.equal(actual.length, expected.size);
  for (const row of actual) assert.equal(row.division, expected.get(row.id), row.id);
  // Gerçekten hareket oldu: dokuz grubun çoğunda beş çıkan, beş inen.
  const moved = (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM players p JOIN groups g ON g.player_id = p.id WHERE p.division <> g.division"))[0]!.n;
  assert.ok(moved > 50, `${moved} oyuncu bölüm değiştirdi`);
});

test('oyunu sıfırlamak: şehir ve yıldız geri gidiyor, gönderim kabul', async () => {
  const db = memoryDb();
  const me = await signUp(db, THURSDAY, 'Atilla');
  const veteran = { ...report(played(), THURSDAY, 500), city: 3, stars: 9 };
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/reports', veteran, me)).status, 200);
  const fresh = report(newGame(), THURSDAY + 60_000, 500);
  const after = await call(db, THURSDAY + 60_000, 'POST', '/v1/reports', fresh, me);
  assert.equal(after.status, 200, JSON.stringify(after.body));
});

test('App Attest: onaysız, yeniden oynatılan, değiştirilmiş gönderim ve sahte kanıt reddediliyor', async () => {
  const db = memoryDb();
  const state = played();
  const reg = await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Atilla' });
  const bare: Account = { id: reg.body.id, token: reg.body.token };
  const body = report(state, THURSDAY, 500);
  // Kanıtsız hesap: puan gönderemiyor (uygulama önce kanıtlıyor).
  assert.deepEqual((await call(db, THURSDAY, 'POST', '/v1/reports', body, bare)).body, { error: 'attest' });

  // Challenge tek seferlik ve süreli; başkasının challenge'ı geçmiyor.
  const device = PKI.device();
  const first = await call(db, THURSDAY, 'POST', '/v1/attest/challenge', {}, bare);
  const wrong = await call(db, THURSDAY, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(first.body.challenge), challenge: 'AAAA' }, bare);
  assert.equal(wrong.body.error, 'challenge');
  const reused = await call(db, THURSDAY, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(first.body.challenge), challenge: first.body.challenge }, bare);
  assert.equal(reused.body.error, 'challenge', 'yanlış denemeden sonra challenge yanmış olmalı');
  const late = await call(db, THURSDAY, 'POST', '/v1/attest/challenge', {}, bare);
  const expired = await call(db, THURSDAY + 31 * 60_000, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(late.body.challenge), challenge: late.body.challenge }, bare);
  assert.equal(expired.body.error, 'challenge');
  // Başka uygulamanın (başka takımın) kanıtı.
  const stranger = PKI.device({ appId: 'OTHERTEAM1.com.other.app' });
  const c = await call(db, THURSDAY, 'POST', '/v1/attest/challenge', {}, bare);
  const foreign = await call(db, THURSDAY, 'POST', '/v1/attest', { keyId: stranger.keyId, attestation: stranger.attest(c.body.challenge), challenge: c.body.challenge }, bare);
  assert.deepEqual(foreign.body, { error: 'attest', reason: 'app' });

  const me = await attest(db, THURSDAY, bare, device);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/reports', body, me)).status, 200);
  // Aynı istek yeniden: sayaç ilerlemiyor.
  const text = JSON.stringify(report(state, THURSDAY, 600));
  const headers = { 'x-attest-key': device.keyId, 'x-attest-assertion': device.assert(text) };
  assert.equal((await call(db, THURSDAY + 60_000, 'POST', '/v1/reports', JSON.parse(text), me, headers)).status, 200);
  const replay = await call(db, THURSDAY + 120_000, 'POST', '/v1/reports', JSON.parse(text), me, headers);
  assert.deepEqual(replay.body, { error: 'assertion', reason: 'counter' });
  // Onay başka gövde için: puan şişirilemiyor.
  const tampered = await call(db, THURSDAY + 180_000, 'POST', '/v1/reports', report(state, THURSDAY, 9e9), me, {
    'x-attest-key': device.keyId,
    'x-attest-assertion': device.assert(JSON.stringify(report(state, THURSDAY, 700))),
  });
  assert.deepEqual(tampered.body, { error: 'assertion', reason: 'signature' });
  const reasons = (await db.all<{ reason: string }>('SELECT reason FROM rejects WHERE player_id = ? ORDER BY at', me.id)).map((r) => r.reason);
  assert.deepEqual(reasons, ['attest:app', 'assertion:counter', 'assertion:signature']);

  // Aynı anahtar başka hesaba bağlanamıyor.
  const other = await call(db, THURSDAY, 'POST', '/v1/players', { name: 'Deniz' });
  const otherAccount: Account = { id: other.body.id, token: other.body.token };
  const oc = await call(db, THURSDAY, 'POST', '/v1/attest/challenge', {}, otherAccount);
  const stolen = await call(db, THURSDAY, 'POST', '/v1/attest', { keyId: device.keyId, attestation: device.attest(oc.body.challenge), challenge: oc.body.challenge }, otherAccount);
  assert.equal(stolen.body.error, 'attest-key');

  // Yeni kurulum: yeni anahtar eskisinin yerini alıyor; eski anahtarla gönderim geçmiyor.
  const fresh = await attest(db, THURSDAY, me);
  const old = await call(db, THURSDAY + 240_000, 'POST', '/v1/reports', report(state, THURSDAY, 800), me, {
    'x-attest-key': device.keyId,
    'x-attest-assertion': device.assert(JSON.stringify(report(state, THURSDAY, 800))),
  });
  assert.deepEqual(old.body, { error: 'attest' });
  assert.equal((await call(db, THURSDAY + 300_000, 'POST', '/v1/reports', report(state, THURSDAY, 800), fresh)).status, 200);
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

test('hesabı sil: oyuncunun her izi gidiyor, token artık geçmiyor', async () => {
  const db = memoryDb();
  const state = played();
  const me = await signUp(db, THURSDAY, 'Atilla');
  const friend = await signUp(db, THURSDAY, 'Deniz');
  const mine = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Yalnız' }, me);
  const shared = await call(db, THURSDAY, 'POST', '/v1/leagues', { name: 'Ofis' }, friend);
  await call(db, THURSDAY, 'POST', '/v1/leagues/join', { code: shared.body.code }, me);
  assert.equal((await call(db, THURSDAY, 'POST', '/v1/reports', report(state, THURSDAY, 500), me)).status, 200);
  assert.deepEqual((await call(db, THURSDAY + 1, 'DELETE', '/v1/players/me', undefined, me)).body, { ok: true });
  assert.equal((await call(db, THURSDAY + 2, 'GET', '/v1/league', undefined, me)).status, 401);
  for (const table of ['players', 'reports', 'groups', 'rejects', 'league_members', 'attest_keys', 'attest_challenges']) {
    const column = table === 'players' ? 'id' : 'player_id';
    assert.equal((await db.all(`SELECT * FROM ${table} WHERE ${column} = ?`, me.id)).length, 0, table);
  }
  const codes = (await db.all<{ code: string }>('SELECT code FROM leagues')).map((l) => l.code);
  assert.deepEqual(codes, [shared.body.code], `boşalan lig (${mine.body.code}) silinmeli, arkadaşınki kalmalı`);
  assert.equal((await call(db, THURSDAY + 2, 'GET', '/v1/league', undefined, friend)).status, 200);
});
