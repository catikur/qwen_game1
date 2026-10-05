import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import type { GameState } from '../src/types';

/** Bir state'in karşılaştırılabilir özeti: para, sahiplik, rng. */
function digest(state: GameState) {
  return {
    day: state.time.day,
    rng: state.rng.s,
    companies: Object.values(state.companies)
      .map((c) => [c.id, Math.round(c.cash), Math.round(c.netWorth)])
      .sort(),
    owned: state.map.tiles.filter((t) => t.ownerId !== null).length,
    structures: state.map.tiles.filter((t) => t.structureId !== null).length,
    buildings: Object.keys(state.buildings).length,
  };
}

function run(seed: number, days: number): GameState {
  const engine = new GameEngine(createNewGame({ seed }));
  for (let i = 0; i < days; i++) engine.runDay();
  return engine.getState();
}

describe('belirlenimcilik', () => {
  test('aynı tohum 150 gün sonra birebir aynı dünyayı verir', () => {
    assert.deepEqual(digest(run(424242, 150)), digest(run(424242, 150)));
  });

  test('farklı tohumlar farklı dünyalar verir', () => {
    assert.notDeepEqual(digest(run(1, 30)), digest(run(2, 30)));
  });

  test('state JSON gidiş-dönüşünden sonra simülasyon aynı devam eder', () => {
    const engine = new GameEngine(createNewGame({ seed: 77 }));
    for (let i = 0; i < 60; i++) engine.runDay();
    const copy = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    for (let i = 0; i < 60; i++) {
      engine.runDay();
      copy.runDay();
    }
    assert.deepEqual(digest(copy.getState()), digest(engine.getState()));
  });
});
