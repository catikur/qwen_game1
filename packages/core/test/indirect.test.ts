import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { purchaseBlocker } from '../src/actions';
import { rankedBuildOptions } from '../src/selectors';
import { indirectEstimate } from '../src/systems/indirect';
import { projectBuilding } from '../src/projection';
import { playerStrategy } from './proxy';
import type { GameState } from '../src/types';

/** Birkaç mağazası olan bir oyuncu (vekil 120 gün). */
function grown(seed = 3): GameState {
  const engine = new GameEngine(createNewGame({ seed }));
  for (let day = 1; day <= 120; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine.getState();
}

function outletTiles(state: GameState): number[] {
  return Object.values(state.buildings)
    .filter((b) => b.companyId === 'player' && BUILDING_BY_ID[b.defId]?.role === 'outlet')
    .map((b) => b.tileId);
}

function freeTile(state: GameState, near?: number): number {
  const anchor = near !== undefined ? state.map.tiles[near]! : null;
  const free = state.map.tiles.filter((t) => t.kind === 'plot' && !t.buildingId && !t.structureId && !purchaseBlocker(state, t.id));
  if (anchor) free.sort((a, b) => Math.abs(a.x - anchor.x) + Math.abs(a.y - anchor.y) - (Math.abs(b.x - anchor.x) + Math.abs(b.y - anchor.y)));
  return free[0]!.id;
}

describe('dolaylı binaların tahmini', () => {
  const state = grown();
  const near = freeTile(state, outletTiles(state)[0]);
  const district = state.map.tiles[near]!.districtId;

  test('doğrudan binada tahmin yok', () => {
    assert.equal(indirectEstimate(state, 'player', 'corner_shop', district), null);
  });

  test('depo menzilindeki deposuz mağazaların maliyetini sayıyor', () => {
    const estimate = indirectEstimate(state, 'player', 'warehouse', district, near)!;
    assert.ok(estimate.covered! > 0, `${estimate.covered} mağaza`);
    assert.ok(estimate.dailyGain > 0, `katkı ${estimate.dailyGain}`);
    assert.equal(estimate.rampDays, 0);
  });

  test('Ar-Ge ve pazarlama mağazası olan kategoride katkı veriyor', () => {
    for (const defId of ['research_center', 'marketing_office']) {
      const estimate = indirectEstimate(state, 'player', defId, district)!;
      assert.ok(estimate.focus, defId);
      assert.ok(estimate.dailyGain > 0, `${defId} katkı ${estimate.dailyGain}`);
      assert.ok(estimate.rampDays > 30, `${defId} oturma ${estimate.rampDays}`);
    }
  });

  test('mağazası olmayan şirkette sıfır ve sebebi', () => {
    const fresh = createNewGame({ seed: 3 });
    const estimate = indirectEstimate(fresh, 'player', 'research_center', 0)!;
    assert.equal(estimate.dailyGain, 0);
    assert.match(estimate.none ?? '', /mağazan yok/);
  });

  test('tahmin durumu değiştirmiyor ve haftalık önbellekten geliyor', () => {
    const before = JSON.stringify(state);
    const a = indirectEstimate(state, 'player', 'marketing_office', district);
    const b = indirectEstimate(state, 'player', 'marketing_office', district);
    assert.equal(a, b, 'aynı nesne');
    assert.equal(JSON.stringify(state), before);
  });

  test('yapı menüsü dolaylı tahmini taşıyor, sıralama doğrudan kâra göre', () => {
    const rows = rankedBuildOptions(state, district, near);
    const depot = rows.find((r) => r.def.id === 'warehouse')!;
    assert.ok(!depot.unlocked || depot.indirect, 'depo tahmini');
    assert.ok(!rows.find((r) => r.bestPick && !r.estimate?.direct), 'en iyi seçim doğrudan bir bina');
  });

  test('projeksiyon iki kopyada oynuyor, durumu değiştirmiyor', () => {
    const before = JSON.stringify(state);
    const projection = projectBuilding(state, 'player', 'research_center', freeTile(state), 40)!;
    assert.equal(projection.series.length, 4);
    // Ar-Ge primi birikiyor: katkı büyüyor.
    assert.ok(projection.series[3]! > projection.series[0]!, projection.series.join(' '));
    assert.equal(JSON.stringify(state), before);
  });
});
