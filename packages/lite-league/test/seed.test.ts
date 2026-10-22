import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRun, leagueWeekId, type LeagueRun } from '../../core/src/index';
import { weekId, weekStart } from '../../lite-model/src/index';
import { handle, weekly } from '../src/app';
import type { Db } from '../src/db';
import { SEED, openWeeks, publicCompanyName } from '../src/seed';
import { memoryDb } from './sqlite';

/** 2026-W42'nin perşembesi, öğlen. */
const THURSDAY = Date.UTC(2026, 9, 15, 12);
const WEEK = '2026-W42';
const HOUR = 3_600_000;

interface Account {
  id: string;
  token: string;
}

async function call(db: Db, now: number, method: string, path: string, body?: unknown, who?: Account, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
  if (who) headers.authorization = `Bearer ${who.id}.${who.token}`;
  const text = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const response = await handle(new Request(`https://lig.test${path}`, { method, headers, body: text }), db, now);
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, any> };
}

async function seedAccount(db: Db, now: number = THURSDAY, ip?: string): Promise<Account> {
  const r = await call(db, now, 'POST', '/v1/seed/players', undefined, undefined, ip ? { 'cf-connecting-ip': ip } : {});
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.id, token: r.body.token };
}

function run(overrides: Partial<LeagueRun> = {}): LeagueRun {
  return {
    version: 2,
    weekId: WEEK,
    ceoId: 'bakkal_ciragi',
    companyName: 'Atilla Holding',
    score: 1_250_000,
    curve: [100_000, 180_000, 260_000],
    log: [[1, { type: 'SET_FOCUS', focus: 'growth' } as never]],
    sim: 'abcdef0123456789',
    ...overrides,
  };
}

async function submit(db: Db, now: number, who: Account, value: LeagueRun | string, extra: Record<string, string> = {}) {
  return call(db, now, 'POST', '/v1/seed/runs', { code: typeof value === 'string' ? value : encodeRun(value) }, who, extra);
}

test('Tohum Ligi: anonim hesap, gönderim, herkese açık tablo ve kod', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  const player = await db.first<{ name: string }>('SELECT name FROM players WHERE id = ?', me.id);
  assert.equal(player?.name, '', 'ana oyunun hesabında ad yok');
  assert.equal((await db.first<{ platform: string }>('SELECT platform FROM tokens WHERE player_id = ?', me.id))?.platform, 'capital');

  const code = encodeRun(run());
  const sent = await submit(db, THURSDAY, me, code);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.outcome, 'saved');
  assert.equal(sent.body.entry.mine, true);

  // Tablo kimliksiz okunuyor; oyuncunun kimliği tabloda yok, kod yerine özeti ve boyu.
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`);
  assert.equal(table.status, 200);
  assert.equal(table.headers.get('cache-control'), 'no-store');
  assert.equal(table.body.total, 1);
  assert.equal(table.body.open, true);
  const [entry] = table.body.entries;
  assert.deepEqual(
    { ...entry, id: typeof entry.id, codeKey: typeof entry.codeKey },
    {
      id: 'string',
      weekId: WEEK,
      companyName: 'Atilla Holding',
      ceoId: 'bakkal_ciragi',
      score: 1_250_000,
      curve: [100_000, 180_000, 260_000],
      submittedAt: new Date(THURSDAY).toISOString(),
      codeKey: 'string',
      codeSize: code.length,
      mine: false,
    },
  );
  assert.notEqual(entry.id, me.id);
  assert.ok(!JSON.stringify(table.body).includes(me.id), 'oyuncunun kimliği tablodan sızmıyor');
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`, undefined, me)).body.entries[0].mine, true);

  const fetched = await call(db, THURSDAY, 'GET', `/v1/seed/codes/${entry.codeKey}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.code, code);
  assert.equal(fetched.headers.get('cache-control'), 'public, max-age=86400', 'bir gün: silinen hesabın kodu tarayıcılarda uzun kalmasın');
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/codes/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/seed/codes/xyz')).status, 400);
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/seed/weeks/a%2F..')).status, 400);
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/seed/weeks/2026-42')).status, 400);
});

test('Tohum Ligi: haftanın en iyisi kalıyor, satırın kimliği değişmiyor; gönderim aralığı', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  const first = await submit(db, THURSDAY, me, run({ score: 1_000_000 }));
  assert.equal(first.body.outcome, 'saved');

  assert.deepEqual((await submit(db, THURSDAY + 10_000, me, run({ score: 2_000_000 }))).body, { error: 'slow' });
  const worse = await submit(db, THURSDAY + SEED.minGapMs, me, run({ score: 900_000, companyName: 'Daha Kötü' }));
  assert.equal(worse.status, 200);
  assert.equal(worse.body.outcome, 'kept-better');
  assert.equal(worse.body.entry.score, 1_000_000);
  assert.equal(worse.body.entry.companyName, 'Atilla Holding');

  const better = await submit(db, THURSDAY + SEED.minGapMs * 2, me, run({ score: 3_000_000, companyName: 'Daha İyi' }));
  assert.equal(better.status, 201);
  assert.equal(better.body.outcome, 'saved');
  assert.equal(better.body.entry.id, first.body.entry.id, 'hayalet seçimi kopmasın: satırın kimliği aynı');
  assert.notEqual(better.body.entry.codeKey, first.body.entry.codeKey);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/codes/${first.body.entry.codeKey}`)).status, 404, 'eski kod gitti');
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`);
  assert.equal(table.body.total, 1);
  assert.equal(table.body.entries[0].companyName, 'Daha İyi');
  assert.equal(table.body.entries[0].submittedAt, new Date(THURSDAY + SEED.minGapMs * 2).toISOString());
});

test('Tohum Ligi: daha kötü gönderim de aralığı dolduruyor; satırın saati değişmiyor (Codex #80)', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  assert.equal((await submit(db, THURSDAY, me, run({ score: 1_000_000 }))).body.outcome, 'saved');

  // Aralık geçti; daha kötü koşu satırı değiştirmiyor ama aralığı dolduruyor.
  const worse = await submit(db, THURSDAY + SEED.minGapMs, me, run({ score: 900_000 }));
  assert.equal(worse.body.outcome, 'kept-better');
  assert.deepEqual((await submit(db, THURSDAY + SEED.minGapMs + 1000, me, run({ score: 800_000 }))).body, { error: 'slow' });
  assert.deepEqual((await submit(db, THURSDAY + SEED.minGapMs + 2000, me, run({ score: 2_000_000 }))).body, { error: 'slow' });

  // Eşit skorda "önce gönderen" satırın saati: daha kötü gönderimler onu ileri almıyor.
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`);
  assert.equal(table.body.entries[0].score, 1_000_000);
  assert.equal(table.body.entries[0].submittedAt, new Date(THURSDAY).toISOString());

  const better = await submit(db, THURSDAY + SEED.minGapMs * 2, me, run({ score: 2_000_000 }));
  assert.equal(better.body.outcome, 'saved');
});

test('Tohum Ligi: bozuk, eski ve sınır dışı kodlar reddediliyor', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  let now = THURSDAY;
  const next = () => (now += SEED.minGapMs);
  assert.deepEqual((await submit(db, next(), me, 'merhaba')).body, { error: 'run', reason: 'unreadable' });
  assert.deepEqual((await submit(db, next(), me, `CF1.${btoa('{"version":2}')}`)).body, { error: 'run', reason: 'malformed' });
  const unknownCommand = run({ log: [[1, { type: 'GIVE_CASH', amount: 1e9 } as never]] });
  assert.deepEqual((await submit(db, next(), me, unknownCommand)).body, { error: 'run', reason: 'malformed' });
  assert.deepEqual((await submit(db, next(), me, run({ version: 1, sim: undefined }))).body, { error: 'run', reason: 'version' });
  assert.deepEqual((await submit(db, next(), me, run({ sim: undefined }))).body, { error: 'run', reason: 'version' });
  assert.deepEqual((await call(db, next(), 'POST', '/v1/seed/runs', { code: 42 }, me)).body, { error: 'run', reason: 'unreadable' });
  const huge = await call(db, next(), 'POST', '/v1/seed/runs', { code: `CF1.${'A'.repeat(1_300_000)}` }, me);
  assert.equal(huge.status, 413);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`)).body.total, 0);
});

test('Tohum Ligi: hafta açık olmalı; geçen hafta ilk saatlerde de kabul', async () => {
  const db = memoryDb();
  const monday = weekStart('2026-W43');
  assert.deepEqual(openWeeks(THURSDAY), [WEEK]);
  assert.deepEqual(openWeeks(monday + HOUR), ['2026-W43', WEEK]);
  assert.deepEqual(openWeeks(monday + SEED.graceMs), ['2026-W43']);

  const late = await seedAccount(db);
  const sent = await submit(db, monday + HOUR, late, run());
  assert.equal(sent.status, 201, 'pazar gecesi biten koşu pazartesi sabahı gönderilebiliyor');
  const tooLate = await seedAccount(db);
  assert.deepEqual((await submit(db, monday + SEED.graceMs, tooLate, run())).body, { error: 'week', week: '2026-W43' });
  const future = await seedAccount(db);
  assert.deepEqual((await submit(db, THURSDAY, future, run({ weekId: '2026-W43' }))).body, { error: 'week', week: WEEK });
  const table = await call(db, monday + SEED.graceMs, 'GET', `/v1/seed/weeks/${WEEK}`);
  assert.equal(table.body.open, false);
  assert.equal(table.body.total, 1);
});

test('Tohum Ligi: herkese görünen şirket adı süzgeçten geçiyor', async () => {
  assert.equal(publicCompanyName('Ayşe & Ortakları A.Ş.'), true, 'noktalama serbest');
  assert.equal(publicCompanyName('Sikke Holding'), true);
  assert.equal(publicCompanyName('Orospu AŞ'), false);
  assert.equal(publicCompanyName('   '), false);
  assert.equal(publicCompanyName('Kötü‮AŞ'), false, 'yön değiştiren işaret');
  assert.equal(publicCompanyName('Satır\nSonu'), false);
  // Noktalama ayırıcı sayılıyor: ana oyun adda noktalamaya izin veriyor (Codex #80).
  for (const bad of ['F.U.C.K Ltd', 'F*U*C*K', 'S.İ.K AŞ', 'Oro.spu Holding', 'A.M.K', 'sh!t.co']) {
    assert.equal(publicCompanyName(bad), false, bad);
  }
  for (const fine of ['A.Ş. Holding', 'Ayşe & Ortakları A.Ş.', "O'Brien Ltd", 'Amazon.Kahve', 'S. İ. Kara Ltd']) {
    assert.equal(publicCompanyName(fine), true, fine);
  }
  const db = memoryDb();
  const me = await seedAccount(db);
  assert.deepEqual((await submit(db, THURSDAY, me, run({ companyName: 'F-U-C-K Ltd' }))).body, { error: 'name-blocked' });
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`)).body.total, 0);
});

test('Tohum Ligi: tablo en iyi 50 ve benim satırım; eşit skorda önce gönderen', async () => {
  const db = memoryDb();
  const accounts: Account[] = [];
  for (let i = 0; i < SEED.tableSize + 2; i++) {
    const who = await seedAccount(db);
    accounts.push(who);
    // İlk ikisi en düşük skorlu; 3. ve 4. aynı skor, 3. önce.
    const score = i < 2 ? 1_000 + i : i === 3 ? 500_000 + 2 : 500_000 + i;
    const sent = await submit(db, THURSDAY + i * 1000, who, run({ score, companyName: `Şirket ${i}` }));
    assert.equal(sent.status, 201);
  }
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`, undefined, accounts[0]);
  assert.equal(table.body.total, SEED.tableSize + 2);
  assert.equal(table.body.entries.length, SEED.tableSize + 1, 'en iyi 50 ve en sondaki benim satırım');
  assert.equal(table.body.entries.at(-1).companyName, 'Şirket 0');
  assert.equal(table.body.entries.at(-1).mine, true);
  const scores = table.body.entries.slice(0, SEED.tableSize).map((e: { score: number }) => e.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const tied = table.body.entries.filter((e: { score: number }) => e.score === 500_002).map((e: { companyName: string }) => e.companyName);
  assert.deepEqual(tied, ['Şirket 2', 'Şirket 3'], 'eşit skorda sunucunun saatine göre önce gönderen');
  assert.ok(!table.body.entries.some((e: { companyName: string }) => e.companyName === 'Şirket 1'));
});

test('Tohum Ligi: Lite ve ana oyun hesapları birbirinin uçlarını kullanamıyor', async () => {
  const db = memoryDb();
  const capital = await seedAccount(db);
  for (const [method, path] of [
    ['GET', '/v1/league'],
    ['GET', '/v1/save'],
    ['POST', '/v1/sync'],
    ['POST', '/v1/link'],
    ['PATCH', '/v1/players/me'],
    ['POST', '/v1/leagues'],
    ['GET', '/v1/stars'],
  ] as const) {
    assert.deepEqual((await call(db, THURSDAY, method, path, method === 'GET' ? undefined : {}, capital)).body, { error: 'platform' }, `${method} ${path}`);
  }
  const lite = await call(db, THURSDAY, 'POST', '/v1/players', { platform: 'web' });
  assert.equal(lite.status, 201);
  const liteAccount = { id: lite.body.id, token: lite.body.token };
  assert.deepEqual((await submit(db, THURSDAY, liteAccount, run())).body, { error: 'platform' });
  // Lite hesabıyla tablo okunuyor ama hiçbir satır "benim" değil.
  await submit(db, THURSDAY, capital, run());
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`, undefined, liteAccount);
  assert.equal(table.body.entries[0].mine, false);
  // Lite'ın yıldız tablosu ana oyunun hesaplarını görmüyor.
  const stars = await call(db, THURSDAY, 'GET', '/v1/stars', undefined, liteAccount);
  assert.equal(stars.body.top.length, 0);
});

test('Tohum Ligi: hesap silinince koşuları da gidiyor', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  const sent = await submit(db, THURSDAY, me, run());
  assert.deepEqual((await call(db, THURSDAY, 'DELETE', '/v1/players/me', undefined, me)).body, { ok: true });
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`)).body.total, 0);
  assert.equal((await call(db, THURSDAY, 'GET', `/v1/seed/codes/${sent.body.entry.codeKey}`)).status, 404);
  assert.equal((await submit(db, THURSDAY + SEED.minGapMs, me, run())).status, 401);
});

test('Tohum Ligi: IP başına saatlik sınır; IP saklanmıyor, eski sayaç siliniyor', async () => {
  const db = memoryDb();
  for (let i = 0; i < SEED.accountsPerHour; i++) await seedAccount(db, THURSDAY, '203.0.113.7');
  const blocked = await call(db, THURSDAY, 'POST', '/v1/seed/players', undefined, undefined, { 'cf-connecting-ip': '203.0.113.7' });
  assert.deepEqual(blocked.body, { error: 'busy' });
  assert.equal(blocked.status, 429);
  await seedAccount(db, THURSDAY, '203.0.113.8');
  await seedAccount(db, THURSDAY + HOUR, '203.0.113.7');
  const rows = await db.all<{ key: string; hour: number }>('SELECT key, hour FROM seed_limits');
  assert.ok(rows.every((row) => !row.key.includes('203.0.113')), 'IP açık yazılmıyor');
  assert.ok(rows.every((row) => row.hour === Math.floor((THURSDAY + HOUR) / HOUR)), 'geçen saatin sayaçları silindi');

  const me = await seedAccount(db, THURSDAY + HOUR, '198.51.100.1');
  const hourStart = (Math.floor(THURSDAY / HOUR) + 2) * HOUR;
  for (let i = 0; i < SEED.runsPerHour; i++) {
    const r = await submit(db, hourStart + i * SEED.minGapMs, me, run(), { 'cf-connecting-ip': '198.51.100.1' });
    assert.ok(r.status === 200 || r.status === 201, `${i}. gönderim: ${JSON.stringify(r.body)}`);
  }
  const over = await submit(db, hourStart + SEED.runsPerHour * SEED.minGapMs, me, run(), { 'cf-connecting-ip': '198.51.100.1' });
  assert.deepEqual(over.body, { error: 'busy' });
});

test('Tohum Ligi: haftalık temizlik eski haftaları siliyor; sunucu sürümü sağlıkta', async () => {
  const db = memoryDb();
  const me = await seedAccount(db);
  await submit(db, THURSDAY, me, run());
  const later = THURSDAY + (SEED.keepWeeks + 1) * 7 * 86_400_000;
  await weekly(db, later);
  assert.equal((await call(db, later, 'GET', `/v1/seed/weeks/${WEEK}`)).body.total, 0);
  assert.equal((await call(db, THURSDAY, 'GET', '/v1/health')).body.seed, 1);
});

test('Tohum Ligi: sunucunun haftası oyunun haftasıyla aynı (ISO 8601)', () => {
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 8); t += 5 * HOUR + 17 * 60_000) {
    assert.equal(weekId(t), leagueWeekId(new Date(t)), new Date(t).toISOString());
  }
});

test('Tohum Ligi: Pages kökeninden okunuyor (CORS)', async () => {
  const db = memoryDb();
  const table = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`, undefined, undefined, { origin: 'https://catikur.github.io' });
  assert.equal(table.headers.get('access-control-allow-origin'), 'https://catikur.github.io');
  const foreign = await call(db, THURSDAY, 'GET', `/v1/seed/weeks/${WEEK}`, undefined, undefined, { origin: 'https://evil.test' });
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);
});
