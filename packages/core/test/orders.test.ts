import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getDifficulty } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { freeFloat, sharesHeld, sharesOutstanding } from '../src/systems/equity';
import {
  capRemaining,
  dailyBuyCap,
  findOrder,
  orderEstimate,
  placeTakeoverOrder,
  playerBuy,
  runOrderTick,
} from '../src/systems/orders';
import { runNpcTick } from '../src/systems/npc';
import type { GameState } from '../src/types';

/** Kilidi açılmış bir rakip ve parası bol bir oyuncu. */
function market(seed = 5): { state: GameState; rivalId: string } {
  const state = createNewGame({ seed });
  state.companies.player!.cash = 200_000_000;
  const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
  delete rival.lockedUntilDay;
  return { state, rivalId: rival.id };
}

describe('günlük alım tavanı', () => {
  test('tavan zorluğun baskın tavanı, hisse adediyle ölçekli', () => {
    const { state, rivalId } = market();
    assert.equal(dailyBuyCap(state, rivalId), getDifficulty(state.difficulty).raidDailyCap);
    state.companies[rivalId]!.shareCount = 12_000;
    assert.equal(dailyBuyCap(state, rivalId), Math.floor(getDifficulty(state.difficulty).raidDailyCap * 1.2));
  });

  test('tavanın üstü reddediliyor, ertesi gün sıfırlanıyor', () => {
    const { state, rivalId } = market();
    const cap = dailyBuyCap(state, rivalId);
    assert.equal(playerBuy(state, 'player', rivalId, cap + 1).ok, false);
    assert.equal(playerBuy(state, 'player', rivalId, cap - 50).ok, true);
    const over = playerBuy(state, 'player', rivalId, 51);
    assert.equal(over.ok, false);
    assert.match(over.reason ?? '', /en fazla 50/);
    assert.equal(playerBuy(state, 'player', rivalId, 50).ok, true);
    assert.equal(capRemaining(state, 'player', rivalId), 0);
    assert.match(playerBuy(state, 'player', rivalId, 1).reason ?? '', /tavanı doldu/);

    state.time.day += 1;
    assert.equal(capRemaining(state, 'player', rivalId), cap);
    assert.equal(sharesHeld(state, 'player', rivalId), cap);
  });

  test('tavan şirket başına; geri alım da tavanlı', () => {
    const { state, rivalId } = market();
    const cap = dailyBuyCap(state, rivalId);
    assert.equal(playerBuy(state, 'player', rivalId, cap).ok, true);
    assert.equal(playerBuy(state, 'player', 'player', cap).ok, true, 'başka şirketin tavanı ayrı');
    assert.equal(playerBuy(state, 'player', 'player', 1).ok, false);
  });

  test('komut motordan tavanla geçiyor', () => {
    const { state, rivalId } = market();
    const engine = new GameEngine(state);
    assert.equal(engine.dispatch({ type: 'BUY_SHARES', companyId: rivalId, count: 5_100 }).ok, false);
  });
});

describe('devralma emri', () => {
  test('kilitli rakibe ve kendine emir verilmiyor', () => {
    const state = createNewGame({ seed: 5 });
    state.companies.player!.cash = 200_000_000;
    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    assert.match(placeTakeoverOrder(state, 'player', rival.id).reason ?? '', /kurucu kilidinde/);
    assert.equal(placeTakeoverOrder(state, 'player', 'player').ok, false);
  });

  test('emir her gün tavan kadar alıyor ve devralmayla bitiyor', () => {
    const { state, rivalId } = market();
    state.flags.npcCompetition = false; // savunmasız hedef: süre tahmine eşit olmalı
    const engine = new GameEngine(state);
    const estimate = orderEstimate(state, 'player', rivalId);
    assert.equal(estimate.need, 5_001);
    assert.equal(estimate.days, Math.ceil(5_001 / estimate.cap));

    assert.equal(engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: rivalId }).ok, true);
    assert.equal(sharesHeld(state, 'player', rivalId), estimate.cap, 'ilk gün hemen alıyor');
    assert.equal(engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: rivalId }).ok, false, 'çift emir yok');

    let days = 0;
    while (state.companies[rivalId] && days < 60) {
      engine.runDay();
      days += 1;
      if (state.companies[rivalId]) {
        assert.ok(sharesHeld(state, 'player', rivalId) <= Math.min(5_001, (days + 1) * estimate.cap));
      }
    }
    assert.equal(state.companies[rivalId], undefined, 'devralındı');
    assert.equal(days + 1, estimate.days, `${days + 1} gün`);
    engine.runDay();
    assert.equal(state.companies.player!.orders, undefined, 'emir kapandı');
  });

  test('dolaşım kontrole yetmezse emir düşüyor (savunma kazandı)', () => {
    const { state, rivalId } = market();
    assert.equal(placeTakeoverOrder(state, 'player', rivalId).ok, true);
    // Hedef hisselerinin çoğunu hazinesine çekti.
    state.companies[rivalId]!.shares[rivalId] = 6_000;
    state.time.day += 1;
    const before = sharesHeld(state, 'player', rivalId);
    runOrderTick(state);
    assert.equal(findOrder(state, 'player', rivalId), undefined);
    assert.equal(sharesHeld(state, 'player', rivalId), before, 'boşuna alım yok');
    assert.match(state.news[0]!.title, /savuşturdu/);
  });

  test('dolaşım yetmiyorsa emir baştan reddediliyor', () => {
    const { state, rivalId } = market();
    state.companies[rivalId]!.shares[rivalId] = 5_500;
    assert.match(placeTakeoverOrder(state, 'player', rivalId).reason ?? '', /Dolaşımda/);
  });

  test('nakit bekliyor: kasada işletme payı kalıyor, haberi bir kez, para gelince devam', () => {
    const { state, rivalId } = market();
    const player = state.companies.player!;
    player.cash = 90_000;
    assert.equal(placeTakeoverOrder(state, 'player', rivalId).ok, true);
    assert.equal(sharesHeld(state, 'player', rivalId), 0);
    assert.equal(player.cash, 90_000);
    const order = findOrder(state, 'player', rivalId)!;
    assert.equal(order.waitingCash, true);
    const news = state.news.length;
    assert.match(state.news[0]!.title, /nakit bekliyor/);
    for (let i = 0; i < 3; i++) {
      state.time.day += 1;
      runOrderTick(state);
    }
    assert.equal(state.news.length, news, 'tek haber');

    player.cash = 50_000_000;
    state.time.day += 1;
    runOrderTick(state);
    assert.equal(sharesHeld(state, 'player', rivalId), dailyBuyCap(state, rivalId));
    assert.equal(order.waitingCash, undefined);
    player.cash = 90_000;
    state.time.day += 1;
    runOrderTick(state);
    assert.equal(state.news.length, news, 'aynı emirde ikinci bekleme haber olmuyor');
  });

  test('fiyat yükselince emir durmuyor', () => {
    const { state, rivalId } = market();
    placeTakeoverOrder(state, 'player', rivalId);
    const held = sharesHeld(state, 'player', rivalId);
    // Güven tavana: fiyat neredeyse üç katı.
    state.companies[rivalId]!.today.profit = 1e9;
    state.time.day += 1;
    runOrderTick(state);
    assert.equal(sharesHeld(state, 'player', rivalId), held + dailyBuyCap(state, rivalId));
  });

  test('elle alım ve emir aynı tavanı paylaşıyor', () => {
    const { state, rivalId } = market();
    const cap = dailyBuyCap(state, rivalId);
    playerBuy(state, 'player', rivalId, cap - 100);
    placeTakeoverOrder(state, 'player', rivalId);
    assert.equal(sharesHeld(state, 'player', rivalId), cap);
  });

  test('iptal', () => {
    const { state, rivalId } = market();
    const engine = new GameEngine(state);
    engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: rivalId });
    assert.equal(engine.dispatch({ type: 'CANCEL_TAKEOVER_ORDER', companyId: rivalId }).ok, true);
    assert.equal(state.companies.player!.orders, undefined);
    assert.equal(engine.dispatch({ type: 'CANCEL_TAKEOVER_ORDER', companyId: rivalId }).ok, false);
  });

  test('saldıran oyuncuysa rakibin geri alımı haber oluyor, ayda bir', () => {
    const { state, rivalId } = market();
    const rival = state.companies[rivalId]!;
    rival.cash = 50_000_000;
    state.companies.player!.shares[rivalId] = 3_500;
    const titles = () => state.news.filter((n) => n.title.includes('kendi hissesini topluyor')).length;
    const float = freeFloat(state, rivalId);
    runNpcTick(state);
    assert.ok(freeFloat(state, rivalId) < float, 'geri alım yaptı');
    assert.equal(titles(), 1);
    state.time.day += 1;
    runNpcTick(state);
    assert.equal(titles(), 1, 'ertesi gün yeni haber yok');
    state.time.day += 30;
    runNpcTick(state);
    assert.equal(titles(), 2);
    assert.ok(sharesOutstanding(state, rivalId) >= 10_000);
  });
});
