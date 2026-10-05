import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { isDistrictOpen, recomputeNetWorth } from '../src/systems/city';
import {
  annuityPayment,
  dailyInterest,
  isPledged,
  loanQuote,
  overdraftLimit,
  overdraftOf,
  ratingOf,
  runCreditTick,
  takeLoan,
} from '../src/systems/credit';
import type { GameState } from '../src/types';

function fresh(seed = 6): GameState {
  const state = createNewGame({ seed });
  recomputeNetWorth(state);
  return state;
}

function ownLand(state: GameState, companyId: string, count: number, value = 100_000): number[] {
  const tiles = state.map.tiles
    .filter((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && isDistrictOpen(state, t.districtId))
    .slice(0, count);
  for (const tile of tiles) {
    tile.ownerId = companyId;
    tile.landValue = value;
  }
  recomputeNetWorth(state);
  return tiles.map((t) => t.id);
}

describe('kredili hesap', () => {
  test('eksi kasa borca yazılıyor, kasaya para girince ÖNCE borç kapanıyor', () => {
    const state = fresh();
    const player = state.companies.player!;
    player.cash = -40_000;
    runCreditTick(state);
    assert.equal(player.cash, 0);
    assert.equal(player.debt, 40_000);
    assert.equal(overdraftOf(player), 40_000);

    // Tur 17'deki hata: borç hiç geri ödenmiyordu.
    player.cash = 25_000;
    runCreditTick(state);
    assert.equal(player.cash, 0);
    assert.equal(player.debt, 15_000);
    player.cash = 100_000;
    runCreditTick(state);
    assert.equal(player.debt, 0);
    assert.equal(player.cash, 85_000);
  });

  test('banka ürünleri kapalıyken de borç kasadan kapanıyor, faiz eski %8', () => {
    const state = fresh();
    state.flags.credit = false;
    const player = state.companies.player!;
    player.cash = -36_500;
    runCreditTick(state);
    assert.ok(Math.abs(dailyInterest(state, player) - 36_500 * CREDIT.baseRate / 365) < 1e-9);
    assert.equal(loanQuote(state, 'player', 'term', 360).ok, false);
    player.cash = 50_000;
    runCreditTick(state);
    assert.equal(player.debt, 0);
  });
});

describe('vadeli kredi', () => {
  test('nakit ve borç birlikte artıyor, net değer değişmiyor', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    const player = state.companies.player!;
    const before = { cash: player.cash, worth: player.netWorth };
    assert.equal(engine.dispatch({ type: 'TAKE_LOAN', kind: 'term', amount: 100_000, termDays: 360 }).ok, true);
    assert.equal(player.cash, before.cash + 100_000);
    assert.equal(player.debt, 100_000);
    recomputeNetWorth(state);
    assert.ok(Math.abs(player.netWorth - before.worth) < 1);
    assert.equal(overdraftOf(player), 0, 'kredi kredili hesap sayılmıyor');
  });

  test('taksitler vadede borcu sıfırlıyor (anüite)', () => {
    const state = fresh();
    const player = state.companies.player!;
    assert.equal(takeLoan(state, 'player', 'term', 120_000, 180).ok, true);
    const loan = player.credit!.loans[0]!;
    assert.ok(Math.abs(loan.payment - annuityPayment(120_000, loan.rate, 180)) < 1e-9);
    player.cash = 10_000_000;
    let paid = 0;
    for (let day = 1; day <= 180; day++) {
      state.time.day += 1;
      const interest = dailyInterest(state, player);
      const cashBefore = player.cash;
      runCreditTick(state);
      paid += cashBefore - player.cash + interest;
    }
    assert.equal(player.credit!.loans.length, 0);
    assert.ok(player.debt < 1);
    assert.ok(Math.abs(paid - loan.payment * 180) < 5, `ödenen ${paid.toFixed(0)} ≈ ${(loan.payment * 180).toFixed(0)}`);
  });

  test('limit, sert tavan ve başvuru soğuması', () => {
    const state = fresh();
    const quote = loanQuote(state, 'player', 'term', 360);
    assert.equal(quote.ok, true);
    assert.equal(quote.max, CREDIT.baseLimit, 'yeni şirket taban limiti alıyor');
    assert.equal(takeLoan(state, 'player', 'term', quote.max + 1000, 360).ok, false);
    assert.equal(takeLoan(state, 'player', 'term', quote.max, 360).ok, true);
    const again = loanQuote(state, 'player', 'term', 360);
    assert.equal(again.ok, false);
    assert.match(again.reason ?? '', /bekle/);
    state.time.day += CREDIT.applyCooldownDays;
    assert.equal(loanQuote(state, 'player', 'term', 360).ok, false, 'limit dolu');
  });

  test('dosya masrafı bir kez faiz giderine yazılıyor', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    engine.dispatch({ type: 'TAKE_LOAN', kind: 'term', amount: 100_000, termDays: 360 });
    engine.runDay();
    const player = state.companies.player!;
    const loanInterest = (100_000 * player.credit!.loans[0]!.rate) / 365;
    assert.ok(player.today.interest > 100_000 * CREDIT.originationFee, 'masraf + faiz');
    engine.runDay();
    assert.ok(player.today.interest < loanInterest * 1.01, 'ertesi gün yalnızca faiz');
  });
});

describe('teminat ve not', () => {
  test('teminatlı kredi arsa rehin ediyor, rehinli arsa satılamıyor', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    const tiles = ownLand(state, 'player', 3, 200_000);
    const quote = loanQuote(state, 'player', 'secured', 720);
    assert.equal(quote.ok, true);
    assert.equal(quote.collateralValue, 600_000);
    assert.ok(quote.rate < loanQuote(state, 'player', 'term', 720).rate, 'teminatlı daha ucuz');
    assert.equal(engine.dispatch({ type: 'TAKE_LOAN', kind: 'secured', amount: 100_000, termDays: 720 }).ok, true);
    const pledged = state.companies.player!.credit!.loans[0]!.collateral!;
    assert.equal(pledged.length, 1, 'yetecek kadar arsa');
    assert.ok(isPledged(state, pledged[0]!));
    assert.equal(engine.dispatch({ type: 'SELL_TILE', tileId: pledged[0]! }).ok, false);
    const free = tiles.find((id) => id !== pledged[0])!;
    assert.equal(engine.dispatch({ type: 'SELL_TILE', tileId: free }).ok, true);
  });

  test('kaldıraç notu düşürüyor; D yeni kredi vermiyor', () => {
    const state = fresh();
    const player = state.companies.player!;
    player.cash = 1_000_000;
    player.credit = { loans: [], rating: 'A', overdraftDays: 0 };
    recomputeNetWorth(state);
    runCreditTick(state);
    assert.equal(ratingOf(player), 'A');
    // Kredi (kredili hesap değil: o kasadan hemen kapanırdı). Brüt ~3M, kaldıraç ~%67.
    player.credit!.loans.push({
      id: 'x', kind: 'term', principal: 2_000_000, balance: 2_000_000, rate: 0.1, termDays: 720, startDay: 0, payment: 0,
    });
    player.debt = 2_000_000;
    player.cash = 3_000_000;
    recomputeNetWorth(state);
    runCreditTick(state);
    assert.equal(ratingOf(player), 'D');
    assert.equal(loanQuote(state, 'player', 'term', 180).ok, false);
  });
});

describe('muacceliyet', () => {
  test('not D\'ye düşen şirketin kredisi kredili hesaba geçiyor', () => {
    const state = fresh();
    const player = state.companies.player!;
    assert.equal(takeLoan(state, 'player', 'term', 100_000, 360).ok, true);
    assert.equal(overdraftOf(player), 0);
    // Varlık eriyor: kaldıraç %50'yi geçiyor.
    player.cash = 20_000;
    recomputeNetWorth(state);
    state.time.day += 1;
    runCreditTick(state);
    assert.equal(ratingOf(player), 'D');
    assert.equal(player.credit!.loans.length, 0);
    assert.ok(overdraftOf(player) > 90_000, `kredili hesap ${overdraftOf(player)}`);
    assert.match(state.news[0]!.title, /muaccel/);
  });
});

describe('ihtar ve haciz', () => {
  test('limit üstü kredili hesap ihtar, süre dolunca haciz', () => {
    const state = fresh();
    const player = state.companies.player!;
    ownLand(state, 'player', 6, 150_000);
    const landBefore = state.map.tiles.filter((t) => t.ownerId === 'player').length;
    player.cash = -(overdraftLimit(player) + 200_000);
    runCreditTick(state);
    assert.equal(player.credit?.arrearsDays, 1);
    assert.match(state.news[0]!.title, /ihtar/);

    for (let i = 0; i < CREDIT.graceDays; i++) {
      state.time.day += 1;
      runCreditTick(state);
    }
    const landAfter = state.map.tiles.filter((t) => t.ownerId === 'player').length;
    assert.ok(landAfter < landBefore, `arsa ${landBefore} → ${landAfter}`);
    assert.ok(overdraftOf(player) <= overdraftLimit(player));
    assert.equal(player.credit?.lastDefaultDay, state.time.day);
    assert.equal(ratingOf(player), 'D');
    assert.match(state.news[0]!.title, /Haciz/);
  });
});
