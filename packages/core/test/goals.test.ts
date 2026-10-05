import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, getDifficulty } from '@capital/content';
import { GameEngine } from '../src/engine';
import { STARTING_CASH, createNewGame } from '../src/worldgen';
import { goalLadder, nextGoal, victoryReached } from '../src/systems/goals';

describe('zorluk', () => {
  test('Dengeli kayda alan yazmaz, diğerleri yazar', () => {
    assert.equal(createNewGame({ seed: 1 }).difficulty, undefined);
    assert.equal(createNewGame({ seed: 1, difficulty: 'normal' }).difficulty, undefined);
    assert.equal(createNewGame({ seed: 1, difficulty: 'hard' }).difficulty, 'hard');
  });

  test('başlangıç sermayesi kademeyle ölçekleniyor', () => {
    const cash = (difficulty: 'easy' | 'normal' | 'hard') =>
      createNewGame({ seed: 1, difficulty, ceoId: null }).companies['player']!.cash;
    assert.equal(cash('normal'), STARTING_CASH);
    assert.equal(cash('easy'), Math.round(STARTING_CASH * getDifficulty('easy').startingCashMultiplier));
    assert.ok(cash('hard') < cash('normal') && cash('normal') < cash('easy'));
  });

  test('zafer hedefi kademeyle artıyor', () => {
    assert.ok(getDifficulty('easy').victoryNetWorth < getDifficulty('normal').victoryNetWorth);
    assert.ok(getDifficulty('normal').victoryNetWorth < getDifficulty('hard').victoryNetWorth);
  });
});

describe('hedef merdiveni', () => {
  test('yeni oyunda hiçbir basamak tamam değil, sıradaki ilk basamak', () => {
    const state = createNewGame({ seed: 3 });
    assert.equal(goalLadder(state).filter((g) => g.completedDay !== null).length, 0);
    assert.equal(nextGoal(state)?.def.id, GOALS[0]!.id);
  });

  test('ilk mağaza kurulunca basamak o günle kaydediliyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 3 }));
    const state = engine.getState();
    const tile = state.map.tiles.find((t) => {
      const district = state.districts[t.districtId]!;
      return t.kind === 'plot' && !t.ownerId && !t.structureId && district.opensOnDay === undefined;
    })!;
    assert.ok(engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok);
    assert.ok(engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok);
    engine.runDay();
    assert.equal(engine.getState().goals?.['first_shop'], 1);
    assert.notEqual(nextGoal(engine.getState())?.def.id, 'first_shop');
  });
});

describe('zafer', () => {
  test('hedef değer ve birincilik birlikte zafer; biri eksikse değil', () => {
    const state = createNewGame({ seed: 5 });
    const player = state.companies['player']!;
    const target = getDifficulty(undefined).victoryNetWorth;
    for (const company of Object.values(state.companies)) company.netWorth = 1_000_000;

    player.netWorth = target - 1;
    assert.equal(victoryReached(state), null);
    player.netWorth = target;
    assert.equal(victoryReached(state), 'tycoon');

    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    rival.netWorth = target * 2;
    assert.equal(victoryReached(state), null, 'zengin ama ikinci: zafer yok');
  });

  test('rakip kalmayınca tekel zaferi', () => {
    const state = createNewGame({ seed: 5 });
    for (const company of Object.values(state.companies)) if (!company.isPlayer) delete state.companies[company.id];
    assert.equal(victoryReached(state), 'monopoly');
  });

  test('zafer oyunu duraklatıyor, kapatınca serbest oyun sürüyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 5 }));
    const state = engine.getState();
    for (const company of Object.values(state.companies)) if (!company.isPlayer) delete state.companies[company.id];
    engine.runDay();
    assert.equal(state.victory?.kind, 'monopoly');
    assert.equal(state.time.speed, 0);
    assert.ok(engine.dispatch({ type: 'DISMISS_VICTORY' }).ok);
    assert.equal(state.victory?.dismissed, true);
    const day = state.time.day;
    engine.runDay();
    assert.equal(state.time.day, day + 1, 'zafer bir son değil — takvim yürüyor');
  });

  test('devralınan oyuncu zafer kazanamaz', () => {
    const state = createNewGame({ seed: 5 });
    state.gameOver = { day: 10, byCompanyId: 'x' };
    for (const company of Object.values(state.companies)) if (!company.isPlayer) delete state.companies[company.id];
    assert.equal(victoryReached(state), null);
  });
});
