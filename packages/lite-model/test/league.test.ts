import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_IDS,
  LEAGUE,
  LEAGUE_BOOST,
  advance,
  buy,
  checkReport,
  divisionMoves,
  incomePerSecond,
  levelSpend,
  maxRate,
  newGame,
  starFree,
  weekId,
  weekStart,
  type LeagueReport,
  type LiteState,
} from '../src/index';

function report(state: LiteState, week: string, score: number): LeagueReport {
  return {
    week,
    score,
    city: state.city,
    stars: state.stars,
    cityEarned: state.earned,
    levels: CHAIN_IDS.map((id) => [...state.chains[id].levels]),
  };
}

/** Bakery'si kurulmuş, bir süre oynanmış şehir. */
function played(): LiteState {
  let s = newGame();
  s.cash = 1e5;
  for (const stage of [0, 1, 2] as const) {
    const r = buy(s, 'bakery', stage, 20);
    assert.ok(r.ok);
    s = r.state;
  }
  return advance(s, 600);
}

test('hafta kimliği ISO 8601 (UTC): pazartesi başlıyor, yıl sınırı doğru', () => {
  assert.equal(weekId(Date.UTC(2026, 9, 15, 12)), '2026-W42');
  assert.equal(weekId(Date.UTC(2026, 9, 12, 0, 0, 0)), '2026-W42');
  assert.equal(weekId(Date.UTC(2026, 9, 11, 23, 59, 59)), '2026-W41');
  // 1 Ocak 2027 cuma: 2026'nın 53. haftası. 4 Ocak 2027 pazartesi: 2027-W01.
  assert.equal(weekId(Date.UTC(2027, 0, 1)), '2026-W53');
  assert.equal(weekId(Date.UTC(2027, 0, 4)), '2027-W01');
  assert.equal(weekId(Date.UTC(2024, 11, 30)), '2025-W01');
  assert.equal(weekStart('2026-W42'), Date.UTC(2026, 9, 12));
  assert.equal(weekStart('2027-W01'), Date.UTC(2027, 0, 4));
  assert.ok(Number.isNaN(weekStart('2026-42')));
  for (const ms of [Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 17, 8), Date.UTC(2028, 11, 31, 23)]) {
    const start = weekStart(weekId(ms));
    assert.ok(start <= ms && ms < start + 7 * 86_400_000, `${weekId(ms)} ${ms}`);
  }
});

test('haftalık puan yıldızsız: 50 yıldız ×2 gelir, puan aynı', () => {
  assert.equal(starFree(200, 50), 100);
  assert.equal(starFree(100, 0), 100);
});

test('gerçek oyun gönderimi kabul ediliyor', () => {
  const s = played();
  const week = weekId(Date.UTC(2026, 9, 15));
  const first = report(s, week, s.earned);
  assert.deepEqual(checkReport(null, first, 3600), { ok: true });
  const later = advance(s, 300);
  const second = report(later, week, later.earned);
  assert.deepEqual(checkReport(first, second, 300), { ok: true });
});

test('hile: hızlı saat, sahte seviye, azalan puan, bozuk biçim reddediliyor', () => {
  const s = played();
  const week = '2026-W42';
  const base = report(s, week, s.earned);
  // Telefonun saati bir gün ileri: puan bir günde kazanılacak kadar, sunucuya göre 5 dakika geçti.
  const day = advance(s, 86_400);
  assert.deepEqual(checkReport(base, report(day, week, day.earned), 300), { ok: false, reason: 'rate' });
  // Sahte seviye: kazanç yokken yüz seviye fırın.
  const fake = report(s, week, s.earned);
  fake.levels[0] = [100, 100, 100];
  assert.deepEqual(checkReport(null, fake, 3600), { ok: false, reason: 'spend' });
  // Puan geri gitmiyor.
  assert.deepEqual(checkReport(base, { ...base, score: base.score - 1 }, 60), { ok: false, reason: 'decrease' });
  // Biçim.
  assert.deepEqual(checkReport(null, { ...base, levels: [[1, 2, 3]] }, 60), { ok: false, reason: 'shape' });
  assert.deepEqual(checkReport(null, { ...base, score: Number.NaN }, 60), { ok: false, reason: 'shape' });
  assert.deepEqual(checkReport(null, { ...base, week: '2026-42' }, 60), { ok: false, reason: 'week' });
});

test('hız sınırı: en iyi koşullarda kazanılabilecek kadar, fazlası değil', () => {
  const s = played();
  const r = report(s, '2026-W42', 0);
  const rate = maxRate(r);
  assert.ok(rate >= incomePerSecond(s) * LEAGUE_BOOST * 0.999);
  const ok = { ...r, score: rate * 60 };
  const tooMuch = { ...r, score: rate * 60 * LEAGUE.rateSlack * 1.05 + 2_000 };
  assert.deepEqual(checkReport(null, ok, 60), { ok: true });
  assert.deepEqual(checkReport(null, tooMuch, 60), { ok: false, reason: 'rate' });
  assert.ok(levelSpend(r.levels) > 0);
});

test('bölüm değişimi: ilk beş çıkıyor, küçük grupta kimse düşmüyor, sınırlar', () => {
  const scores = Array.from({ length: 12 }, (_, i) => (12 - i) * 100);
  const moves = divisionMoves(scores, 1);
  assert.deepEqual(moves, [1, 1, 1, 1, 1, 0, 0, -1, -1, -1, -1, -1]);
  // Dokuz kişilik grupta düşen yok.
  assert.deepEqual(divisionMoves(scores.slice(0, 9), 1).filter((m) => m < 0), []);
  // Elmas en üst, Bronz en alt.
  assert.ok(divisionMoves(scores, LEAGUE.divisions - 1).every((m) => m <= 0));
  assert.ok(divisionMoves(scores, 0).every((m) => m >= 0));
  // Puanı sıfır olan çıkmıyor.
  assert.deepEqual(divisionMoves([0, 0, 0], 0), [0, 0, 0]);
});
