import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { build, buyTile, purchaseBlocker } from '../src/actions';
import { qualityEdge } from '../src/systems/market';

describe('taban kalite fiyata dönüyor', () => {
  test('kategorinin en düşük kaliteli mağazasında katkı sıfır', () => {
    assert.equal(qualityEdge('corner_shop'), 0);
    assert.equal(qualityEdge('cafe'), 0);
    assert.equal(qualityEdge('boutique'), 0);
    assert.equal(qualityEdge('gym'), 0);
    assert.equal(qualityEdge('electronics_store'), 0);
    // Kira ve üretim binalarında yok.
    assert.equal(qualityEdge('apartment'), 0);
    assert.equal(qualityEdge('flour_mill'), 0);
  });

  test('üst kademede kalite farkının yarısı', () => {
    assert.ok(Math.abs(qualityEdge('supermarket') - 0.115) < 1e-9);
    assert.ok(Math.abs(qualityEdge('restaurant') - 0.115) < 1e-9);
    assert.ok(Math.abs(qualityEdge('department_store') - 0.1) < 1e-9);
  });

  test('aynı bölgede süpermarket bakkaldan pahalı satıyor', () => {
    const state = createNewGame({ seed: 11 });
    state.flags.npcCompetition = false;
    const player = state.companies.player!;
    player.cash = 50_000_000;
    player.netWorth = 50_000_000;
    const district = state.districts.find((d) => d.archetype === 'mid_residential')!;
    const tiles = state.map.tiles.filter(
      (t) => t.districtId === district.id && t.kind === 'plot' && !t.structureId && !t.buildingId && !purchaseBlocker(state, t.id),
    );
    for (const [tile, defId] of [[tiles[0]!, 'corner_shop'], [tiles[1]!, 'supermarket']] as const) {
      assert.equal(buyTile(state, 'player', tile.id).ok, true);
      assert.equal(build(state, 'player', tile.id, defId).ok, true, defId);
    }
    const engine = new GameEngine(state);
    for (let day = 0; day < 30; day++) engine.runDay();
    const shop = Object.values(state.buildings).find((b) => b.defId === 'corner_shop' && b.companyId === 'player')!;
    const market = Object.values(state.buildings).find((b) => b.defId === 'supermarket' && b.companyId === 'player')!;
    const unmet = district.unmet.grocery ?? 0;
    if (unmet > 0.01) {
      assert.ok(market.priceMultiplier > shop.priceMultiplier, `${market.priceMultiplier} > ${shop.priceMultiplier} (boş talep ${unmet})`);
    } else {
      assert.ok(Math.abs(market.priceMultiplier - shop.priceMultiplier) < 1e-6, 'doymuş bölgede fark yok');
    }
  });
});
