import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN,
  CHAIN_IDS,
  OFFLINE_CAP_BASE,
  STARTING_CASH,
  advance,
  applyOffline,
  bestMove,
  buy,
  chainReport,
  incomePerSecond,
  maxAffordable,
  newGame,
  prestige,
  stageRate,
  startCampaign,
  upgradeCost,
  type LiteState,
} from '../src/index';

function must(result: ReturnType<typeof buy>): LiteState {
  assert.ok(result.ok, 'eylem başarısız');
  return result.ok ? result.state : (null as never);
}

function rich(): LiteState {
  const s = newGame();
  s.cash = 1e6;
  return s;
}

test('yeni oyun: başlangıç kasası, gelir yok, ilk hamle fırın satışı', () => {
  const s = newGame();
  assert.equal(s.cash, STARTING_CASH);
  assert.equal(incomePerSecond(s), 0);
  const move = bestMove(s);
  assert.deepEqual(move && { chain: move.chain, stage: move.stage }, { chain: 'bakery', stage: 2 });
});

test('yukarı kademeyi almak geliri hiçbir zaman düşürmüyor (entegrasyon)', () => {
  let s = must(buy(rich(), 'bakery', 2, 20));
  const sellingOnly = incomePerSecond(s);
  s = must(buy(s, 'bakery', 1, 1));
  const withMill = incomePerSecond(s);
  s = must(buy(s, 'bakery', 0, 1));
  const integrated = incomePerSecond(s);
  assert.ok(withMill > sellingOnly, `değirmen geliri artırmalı: ${sellingOnly} → ${withMill}`);
  assert.ok(integrated > withMill, `tarla geliri artırmalı: ${withMill} → ${integrated}`);
});

test('tam entegre zincirde marj %85, yalnızca satışta %20', () => {
  let s = must(buy(rich(), 'bakery', 2, 5));
  assert.equal(chainReport(s, 'bakery').margin.toFixed(2), '0.20');
  s = must(buy(s, 'bakery', 1, 30));
  s = must(buy(s, 'bakery', 0, 30));
  assert.equal(chainReport(s, 'bakery').margin.toFixed(2), '0.85');
});

test('kilometre taşı hızı ikiye katlıyor', () => {
  assert.equal(stageRate(2, 25) / stageRate(2, 24), (25 / 24) * 2);
  assert.equal(stageRate(2, 0), 0);
});

test('en fazla alım maliyetle tutarlı', () => {
  for (const cash of [3, 4, 50, 1234, 9e5, 7.7e9]) {
    for (const level of [0, 3, 40]) {
      const n = maxAffordable(cash, 'coffee', 1, level);
      if (n > 0) assert.ok(upgradeCost('coffee', 1, level, n) <= cash);
      assert.ok(upgradeCost('coffee', 1, level, n + 1) > cash);
    }
  }
});

test('kilitli zincir alınamıyor', () => {
  const r = buy(rich(), 'tech', 2, 1);
  assert.equal(r.ok, false);
});

test('kampanya tam 30 saniye ×2', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  s = advance(s, 5);
  const base = incomePerSecond(s);
  const started = startCampaign(s);
  assert.ok(started.ok);
  s = started.ok ? started.state : s;
  assert.equal(incomePerSecond(s) / base, CAMPAIGN.multiplier);
  s = advance(s, CAMPAIGN.duration - 1e-6);
  assert.ok(incomePerSecond(s) > base * 1.5, 'süre bitmeden kampanya sürmeli');
  s = advance(s, 1e-3);
  assert.ok(incomePerSecond(s) < base * 1.5, 'süre bitince kampanya kapanmalı');
  assert.equal(startCampaign(s).ok, false, 'bekleme süresi dolmadan yeniden açılmamalı');
});

test('rakip kovalıyor: büyütmeyi bırakınca pay düşüyor ama tabanın altına inmiyor', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  const fresh = chainReport(s, 'bakery').share;
  s = advance(s, 3600);
  const later = chainReport(s, 'bakery').share;
  assert.ok(fresh > 0.99, `başta pay tam olmalı: ${fresh}`);
  assert.ok(later < 0.7 && later >= 0.15, `rakip yetişmeli: ${later}`);
});

test('çevrimdışı: tavanla kırpılıyor, yarı verim', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  s = advance(s, 3600); // rakip dengeye otursun
  const r = applyOffline(s, 10 * 3600);
  assert.equal(r.seconds, OFFLINE_CAP_BASE);
  const perSecond = r.earned / r.seconds;
  const online = incomePerSecond(s);
  assert.ok(perSecond > online * 0.4 && perSecond < online * 0.6, `${perSecond} / ${online}`);
});

test('holding: yıldız korunuyor, şehir sıfırlanıyor, rakip sertleşiyor', () => {
  const s = rich();
  s.earned = 4e12;
  const r = prestige(s);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.city, 1);
  assert.equal(r.state.stars, 63);
  assert.equal(r.state.cash, STARTING_CASH);
  for (const id of CHAIN_IDS) assert.deepEqual(r.state.chains[id].levels, [0, 0, 0]);
  assert.equal(prestige(newGame()).ok, false, 'kazançsız şehir satılamaz');
});

test('advance deterministik ve adım bölmesinden bağımsız değil ama tekrarlanabilir', () => {
  const s = must(buy(rich(), 'bakery', 2, 12));
  const a = advance(s, 123.5);
  const b = advance(s, 123.5);
  assert.deepEqual(a, b);
});
