import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSUMER_CATEGORIES, CRISIS_BY_ID, CRISIS_TIMING, LATE_COSTS } from '@capital/content';
import { buildCost } from '../src/actions';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { getPlayer } from '../src/selectors';
import { collectEventModifiers } from '../src/systems/events';
import { overdraftRate } from '../src/systems/credit';
import {
  annualWealthTax,
  dailyWealthTax,
  macroRateDelta,
  overheadRate,
  runCrisisTick,
} from '../src/systems/economy';
import type { BuildingInstance, GameState } from '../src/types';

/** Oyuncuya `count` tane sahte bina verir (yalnızca sayım için). */
function giveBuildings(state: GameState, count: number): void {
  const player = getPlayer(state);
  const template = Object.values(state.buildings)[0];
  for (let i = 0; i < count; i++) {
    const id = `test-${i}`;
    state.buildings[id] = {
      ...(template ?? ({} as BuildingInstance)),
      id,
      companyId: player.id,
      defId: 'corner_shop',
      tileId: 0,
      districtId: 0,
    } as BuildingInstance;
  }
}

describe('yönetim yükü', () => {
  test('eşiğe kadar yok, sonra bina başına artıyor, tavanda duruyor', () => {
    const state = createNewGame({ seed: 3 });
    const player = getPlayer(state);
    for (const id of Object.keys(state.buildings)) if (state.buildings[id]!.companyId === player.id) delete state.buildings[id];

    giveBuildings(state, LATE_COSTS.overheadFreeBuildings);
    state.time.day = 10;
    assert.equal(overheadRate(state, player.id), 0);

    giveBuildings(state, LATE_COSTS.overheadFreeBuildings + 50);
    state.time.day = 11; // sayım gün başına
    assert.ok(Math.abs(overheadRate(state, player.id) - 50 * LATE_COSTS.overheadPerBuilding) < 1e-9);

    giveBuildings(state, 1000);
    state.time.day = 12;
    assert.equal(overheadRate(state, player.id), LATE_COSTS.overheadCap);

    state.flags.lateCosts = false;
    assert.equal(overheadRate(state, player.id), 0);
  });
});

describe('servet vergisi', () => {
  test('kademeli: her dilim yalnızca kendi aralığına', () => {
    assert.equal(annualWealthTax(20_000_000), 0);
    assert.equal(annualWealthTax(50_000_000), 250_000);
    assert.equal(annualWealthTax(150_000_000), 750_000 + 1_000_000);
    assert.equal(annualWealthTax(400_000_000), 750_000 + 4_000_000 + 3_000_000);
  });

  test('günlük vergi kâra giriyor; bayrak kapalıyken yok', () => {
    const engine = new GameEngine(createNewGame({ seed: 4 }));
    const player = getPlayer(engine.getState());
    player.cash = 200_000_000;
    player.netWorth = 200_000_000;
    const expected = annualWealthTax(200_000_000) / 365;
    assert.ok(Math.abs(dailyWealthTax(engine.getState(), player) - expected) < 1e-6);
    engine.runDay();
    assert.ok((getPlayer(engine.getState()).today.tax ?? 0) > 0);

    engine.getState().flags.lateCosts = false;
    assert.equal(dailyWealthTax(engine.getState(), getPlayer(engine.getState())), 0);
  });
});

describe('kriz', () => {
  function runTo(day: number, seed = 9): GameState {
    const state = createNewGame({ seed });
    state.flags.npcCompetition = false;
    while (state.time.day < day) {
      state.time.day += 1;
      runCrisisTick(state);
    }
    return state;
  }

  test('ilk uyarı takvimde, kriz bir ay sonra başlıyor ve bitiyor', () => {
    const state = createNewGame({ seed: 9 });
    let warnedOn: number | null = null;
    let activeOn: number | null = null;
    let endedOn: number | null = null;
    for (let day = 1; day <= 1200 && endedOn === null; day++) {
      state.time.day = day;
      runCrisisTick(state);
      if (warnedOn === null && state.crisis?.phase === 'warning') warnedOn = day;
      if (activeOn === null && state.crisis?.phase === 'active') activeOn = day;
      if (activeOn !== null && !state.crisis) endedOn = day;
    }
    assert.ok(warnedOn !== null && warnedOn >= CRISIS_TIMING.firstDay && warnedOn <= CRISIS_TIMING.firstDay + CRISIS_TIMING.firstSpread);
    assert.equal(activeOn, warnedOn + CRISIS_TIMING.warningDays);
    assert.ok(endedOn !== null && endedOn > activeOn!);
    // Bir sonraki uyarının günü kuruldu.
    assert.ok((state.nextCrisisDay ?? 0) >= endedOn! + CRISIS_TIMING.gapDays[0]);
  });

  test('takvim dışsal: aynı tohumda oyuncunun kararları kriz günlerini değiştirmiyor', () => {
    const schedule = (busy: boolean): string => {
      const engine = new GameEngine(createNewGame({ seed: 21 }));
      const marks: string[] = [];
      let last = '';
      for (let day = 1; day <= 700; day++) {
        if (busy && day % 7 === 0) engine.dispatch({ type: 'SET_SPEED', speed: 2 });
        if (busy && day === 30) {
          const tile = engine.getState().map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId);
          if (tile) engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
        }
        engine.runDay();
        const crisis = engine.getState().crisis;
        const now = crisis ? `${crisis.defId}:${crisis.phase}` : '-';
        if (now !== last) marks.push(`${day}:${now}`);
        last = now;
      }
      return marks.join(' ');
    };
    assert.equal(schedule(true), schedule(false));
  });

  test('kriz sürerken talep, faiz ve inşaat maliyeti etkileniyor; uyarıda etkilemiyor', () => {
    // 1. gün: dönem ve olay yok, çarpanların tek kaynağı kriz.
    const state = runTo(1);
    const player = getPlayer(state);
    const baseRate = overdraftRate(state, player);
    const baseBuild = buildCost(state, player.id, 'corner_shop');

    state.crisis = { defId: 'rate_shock', phase: 'warning', activeDay: 50, endDay: 150 };
    assert.equal(macroRateDelta(state), 0);
    assert.equal(overdraftRate(state, player), baseRate);

    state.crisis.phase = 'active';
    const shock = CRISIS_BY_ID['rate_shock']!;
    assert.ok(Math.abs(overdraftRate(state, player) - (baseRate + shock.effects.rateDelta!)) < 1e-9);

    state.crisis = { defId: 'deep_recession', phase: 'active', activeDay: 50, endDay: 150 };
    const recession = CRISIS_BY_ID['deep_recession']!;
    const mods = collectEventModifiers(state);
    for (const category of CONSUMER_CATEGORIES) {
      assert.ok(Math.abs((mods.demand[category] ?? 1) - recession.effects.demand!) < 1e-9);
    }
    assert.ok(mods.landValueDrift < 0);
    assert.ok(buildCost(state, player.id, 'corner_shop') < baseBuild);
  });

  test('olaylar kapalıyken (laboratuvar) ya da bayrak kapalıyken kriz yok', () => {
    const off = createNewGame({ seed: 9 });
    off.flags.randomEvents = false;
    const flagged = createNewGame({ seed: 9 });
    flagged.flags.crises = false;
    for (let day = 1; day <= 900; day++) {
      off.time.day = day;
      flagged.time.day = day;
      runCrisisTick(off);
      runCrisisTick(flagged);
    }
    assert.equal(off.crisis, undefined);
    assert.equal(flagged.crisis, undefined);
  });
});
