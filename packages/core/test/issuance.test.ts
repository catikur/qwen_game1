import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT, ISSUANCE } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { recomputeNetWorth } from '../src/systems/city';
import {
  TOTAL_SHARES,
  buyShares,
  controllerOf,
  freeFloat,
  ownerFraction,
  sharePrice,
  sharesOutstanding,
} from '../src/systems/equity';
import { issueNetWorthEffect, issueQuote, issueShares } from '../src/systems/issuance';
import { loanQuote, runCreditTick, takeLoan } from '../src/systems/credit';
import type { GameState } from '../src/types';

/** Halka arza yetecek büyüklükte (defter > 1 M ₺) bir oyuncu. */
function listed(seed = 4): GameState {
  const state = createNewGame({ seed });
  state.companies.player!.cash = 3_000_000;
  recomputeNetWorth(state);
  return state;
}

describe('sermaye artırımı', () => {
  test('küçük şirket halka arz olamıyor', () => {
    const state = createNewGame({ seed: 4 });
    const quote = issueQuote(state, 'player');
    assert.equal(quote.ok, false);
    assert.match(quote.reason ?? '', /en az/);
  });

  test('ihraç hisse adedini, yatırımcı payını ve nakdi büyütüyor', () => {
    const state = listed();
    const player = state.companies.player!;
    const quote = issueQuote(state, 'player');
    assert.equal(quote.ok, true);
    assert.equal(quote.ipo, true);
    assert.equal(quote.maxShares, TOTAL_SHARES * ISSUANCE.maxPerIssue);
    assert.ok(Math.abs(quote.price - sharePrice(state, 'player') * (1 - ISSUANCE.discount)) < 1e-9);

    const cash = player.cash;
    assert.equal(issueShares(state, 'player', 2000).ok, true);
    assert.equal(sharesOutstanding(state, 'player'), 12_000);
    assert.equal(player.investorShares, 2000);
    assert.ok(Math.abs(player.cash - cash - 2000 * quote.price) < 1e-6);
    assert.ok(Math.abs(ownerFraction(player) - 10_000 / 12_000) < 1e-12);
    // Kurumsal yatırımcı payı dolaşımda değil: baskıncı yalnızca eski 10.000'i alabilir.
    assert.equal(freeFloat(state, 'player'), 10_000);
    assert.match(state.news[0]!.title, /Halka arz/);
  });

  test('net değer kurucu payı kadar; ihraç günü etkisi tahminle aynı', () => {
    const state = listed();
    const player = state.companies.player!;
    const before = player.netWorth;
    const predicted = issueNetWorthEffect(state, 'player', 2500);
    issueShares(state, 'player', 2500);
    recomputeNetWorth(state);
    assert.ok(Math.abs(player.netWorth - before - predicted) < 1, `${player.netWorth - before} ≈ ${predicted}`);
  });

  test('soğuma, ihraç başı tavan ve kurucu payı tabanı', () => {
    const state = listed();
    issueShares(state, 'player', 2500);
    const again = issueQuote(state, 'player');
    assert.equal(again.ok, false);
    assert.match(again.reason ?? '', /bekle/);
    assert.equal(issueShares(state, 'player', 100).ok, false);

    // Kurucu payı %51'in altına inmesin: yatırımcılar zaten %45'teyse kalan küçük.
    const player = state.companies.player!;
    player.shareCount = 20_000;
    player.investorShares = 9_000;
    delete player.lastIssueDay;
    const quote = issueQuote(state, 'player');
    const after = 1 - (9_000 + quote.maxShares) / (20_000 + quote.maxShares);
    assert.ok(quote.maxShares > 0 && after >= ISSUANCE.minFounderShare - 1e-9, `kurucu ${after}`);
  });

  test('ihraç baskıncının payını sulandırıyor ve kontrol eşiğini büyütüyor', () => {
    const state = listed();
    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    rival.shares.player = 4_800;
    assert.equal(controllerOf(state, 'player'), null);
    issueShares(state, 'player', 2500);
    // 4.800 / 12.500 = %38,4 — kontrolü almak için artık 6.251 hisse gerekiyor.
    rival.shares.player = 6_000;
    assert.equal(controllerOf(state, 'player'), null, '6.000 / 12.500 kontrol değil');
    rival.shares.player = 6_300;
    assert.equal(controllerOf(state, 'player'), rival.id);
  });

  test('geri alım önce yatırımcı payını geri alıyor', () => {
    const state = listed();
    const player = state.companies.player!;
    issueShares(state, 'player', 1000);
    player.cash = 100_000_000;
    assert.equal(buyShares(state, 'player', 'player', 400).ok, true);
    assert.equal(player.investorShares, 600);
    assert.equal(buyShares(state, 'player', 'player', 800).ok, true);
    assert.equal(player.investorShares, undefined);
    assert.equal(ownerFraction(player), 1);
  });

  test('ihraç yapmamış şirketin net değeri eski formülle birebir', () => {
    const state = createNewGame({ seed: 8 });
    const player = state.companies.player!;
    recomputeNetWorth(state);
    assert.equal(player.netWorth, player.cash - player.debt);
    assert.equal(ownerFraction(player), 1);
  });

  test('komut motordan geçiyor', () => {
    const engine = new GameEngine(listed());
    assert.equal(engine.dispatch({ type: 'ISSUE_SHARES', count: 1500 }).ok, true);
    assert.equal(engine.getState().companies.player!.issues, 1);
  });

  test('kapalıyken ihraç yok', () => {
    const state = listed();
    state.flags.issuance = false;
    assert.equal(issueQuote(state, 'player').ok, false);
  });
});

describe('tahvil', () => {
  test('yalnızca kupon öder, anapara vadede tek seferde', () => {
    const state = listed();
    const player = state.companies.player!;
    player.cash = 20_000_000;
    recomputeNetWorth(state);
    const quote = loanQuote(state, 'player', 'bond', 360);
    assert.equal(quote.ok, true);
    assert.ok(quote.rate < loanQuote(state, 'player', 'term', 360).rate, 'tahvil bankadan ucuz');
    assert.equal(takeLoan(state, 'player', 'bond', 2_000_000, 360).ok, true);
    const bond = player.credit!.loans[0]!;
    assert.ok(Math.abs(bond.payment - (2_000_000 * bond.rate) / 365) < 1e-9);

    for (let day = 1; day < 360; day++) {
      state.time.day += 1;
      runCreditTick(state);
    }
    assert.equal(bond.balance, 2_000_000, 'vadeden önce anapara düşmüyor');
    const cash = player.cash;
    state.time.day += 1;
    runCreditTick(state);
    assert.equal(player.credit!.loans.length, 0);
    assert.ok(Math.abs(cash - player.cash - 2_000_000) < 1);
    assert.match(state.news[0]!.title, /Tahvil vadesi geldi/);
  });

  test('vade duvarı: kasada yoksa anapara kredili hesaba', () => {
    const state = listed();
    const player = state.companies.player!;
    player.cash = 20_000_000;
    recomputeNetWorth(state);
    takeLoan(state, 'player', 'bond', 2_000_000, 360);
    player.cash = 300_000;
    state.time.day += 360;
    runCreditTick(state);
    assert.equal(player.cash, 0);
    assert.ok(player.debt > 1_600_000, `kredili hesap ${player.debt}`);
  });

  test('küçük şirket ve düşük not tahvil çıkaramıyor', () => {
    const small = createNewGame({ seed: 4 });
    recomputeNetWorth(small);
    assert.equal(loanQuote(small, 'player', 'bond', 720).ok, false);

    const state = listed();
    state.companies.player!.credit = { loans: [], rating: 'C', overdraftDays: 0 };
    const quote = loanQuote(state, 'player', 'bond', 720);
    assert.equal(quote.ok, false);
    assert.match(quote.reason ?? '', /en az B/);
    assert.ok(CREDIT.bond.minAmount >= 1_000_000);
  });
});
