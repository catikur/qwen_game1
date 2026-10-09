import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { STRUCTURE_BY_ID } from '@capital/content';
import { createNewGame } from '../src/worldgen';
import { placeBid, runAuctionTick } from '../src/systems/auction';
import { tilePrice } from '../src/systems/city';
import type { GameState } from '../src/types';

/** Boş parseli kalmamış bir şehir: her boş parsel belediyenin elinde (sahipli). */
function fullCity(): { state: GameState; occupied: number } {
  const state = createNewGame({ seed: 6 });
  state.flags.landAuctions = true;
  for (const district of state.districts) delete district.opensOnDay;
  const buyable = Object.entries(STRUCTURE_BY_ID).find(([, def]) => def.buyoutMultiplier !== null)![0];
  let occupied = -1;
  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.buildingId) continue;
    if (tile.structureId) continue;
    if (occupied < 0) {
      tile.structureId = buyable;
      tile.structureHeight = 1;
      occupied = tile.id;
    } else {
      tile.ownerId = 'player';
    }
  }
  // Önceden var olan şehir yapılarını devredilemez say: tek aday bizimki.
  for (const tile of state.map.tiles) {
    if (tile.structureId && tile.id !== occupied) tile.ownerId = 'player';
  }
  state.time.day = 30;
  return { state, occupied };
}

describe('dolu parsel ihalesi', () => {
  test('boş parsel yoksa yapılı parsel ihaleye çıkıyor, taban devralma bedeli', () => {
    const { state, occupied } = fullCity();
    runAuctionTick(state);
    assert.equal(state.auction?.tileId, occupied);
    assert.equal(state.auction!.reserve, tilePrice(state, occupied));
    assert.match(state.news[0]!.title, /kentsel dönüşüm/);
  });

  test('kazanan parseli boş alıyor, yapı yıkılıyor', () => {
    const { state, occupied } = fullCity();
    state.flags.npcCompetition = false;
    runAuctionTick(state);
    const player = state.companies.player!;
    player.cash = 1e9;
    assert.equal(placeBid(state, 'player', state.auction!.reserve).ok, true);
    // Rakipler teklif vermesin: nakitleri sıfır.
    for (const company of Object.values(state.companies)) if (!company.isPlayer) company.cash = 0;
    state.time.day = state.auction!.endsOnDay;
    runAuctionTick(state);
    const tile = state.map.tiles[occupied]!;
    assert.equal(tile.ownerId, 'player');
    assert.equal(tile.structureId, null);
    assert.match(state.news[0]!.body, /yıkılıyor/);
  });

  test('teklif gelmezse yapı yerinde kalıyor', () => {
    const { state, occupied } = fullCity();
    runAuctionTick(state);
    for (const company of Object.values(state.companies)) company.cash = 0;
    state.time.day = state.auction!.endsOnDay;
    runAuctionTick(state);
    assert.ok(state.map.tiles[occupied]!.structureId);
    assert.match(state.news[0]!.body, /yapı yerinde kaldı/);
  });

  test('boş parsel varken ve dolu parsel iki kat değerli değilken eski davranış', () => {
    const state = createNewGame({ seed: 6 });
    state.flags.landAuctions = true;
    state.time.day = 30;
    runAuctionTick(state);
    const tile = state.map.tiles[state.auction!.tileId]!;
    assert.equal(tile.structureId, null);
  });
});
