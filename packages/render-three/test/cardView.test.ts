import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameEngine, createNewGame, getPlayer } from '@capital/core';
import { CARD_VIEW, cardBounds, cardView, placeCardCamera, projectedExtent } from '../src/cardView';
import type { CardBounds } from '../src/cardView';

/** Şehir kartının kadrajı (Tur 64): WebGL'siz, yalnız izdüşüm. */
const ASPECT = 1200 / 630;

function extentOf(bounds: CardBounds) {
  const pose = cardView(bounds, ASPECT);
  const camera = new THREE.PerspectiveCamera(CARD_VIEW.fov, ASPECT, 0.5, 400);
  camera.updateProjectionMatrix();
  placeCardCamera(camera, pose);
  return { pose, extent: projectedExtent(camera, bounds) };
}

describe('şehir kartının kadrajı', () => {
  test('kadraj kartın sağ bandına sığıyor, yazı panelinin altına girmiyor', () => {
    const cases: CardBounds[] = [
      { minX: 10, maxX: 10, minZ: 12, maxZ: 12 },
      { minX: 4, maxX: 14, minZ: 6, maxZ: 16 },
      { minX: 0, maxX: 31, minZ: 0, maxZ: 31 },
      { minX: 2, maxX: 40, minZ: 20, maxZ: 26 },
      { minX: 0, maxX: 47, minZ: 0, maxZ: 47 },
    ];
    const eps = 0.02;
    for (const bounds of cases) {
      const { pose, extent } = extentOf(bounds);
      const label = JSON.stringify(bounds);
      assert.ok(pose.distance >= CARD_VIEW.minDistance && pose.distance <= CARD_VIEW.maxDistance, `${label}: uzaklık ${pose.distance}`);
      if (pose.distance >= CARD_VIEW.maxDistance) continue;
      assert.ok(extent.minX >= CARD_VIEW.left - eps, `${label}: sol ${extent.minX}`);
      assert.ok(extent.maxX <= CARD_VIEW.right + eps, `${label}: sağ ${extent.maxX}`);
      assert.ok(extent.minY >= CARD_VIEW.bottom - eps, `${label}: alt ${extent.minY}`);
      assert.ok(extent.maxY <= CARD_VIEW.top + eps, `${label}: üst ${extent.maxY}`);
      // Kadrajın ortası bandın ortasında: şehir ne panelin dibinde ne kartın kenarında.
      const middle = (extent.minX + extent.maxX) / 2;
      assert.ok(Math.abs(middle - (CARD_VIEW.left + CARD_VIEW.right) / 2) < 0.05, `${label}: orta ${middle}`);
    }
  });

  test('küçük şehir yakından, büyük şehir uzaktan', () => {
    const small = cardView({ minX: 10, maxX: 13, minZ: 10, maxZ: 13 }, ASPECT).distance;
    const large = cardView({ minX: 0, maxX: 40, minZ: 0, maxZ: 40 }, ASPECT).distance;
    assert.ok(small < large, `${small} < ${large}`);
    // Tek binada bile kamera en yakın sınırın altına inmiyor.
    assert.ok(cardView({ minX: 5, maxX: 5, minZ: 5, maxZ: 5 }, ASPECT).distance >= CARD_VIEW.minDistance);
  });

  test('kadraj şirketin binaları; yoksa şehrin binaları, o da yoksa harita', () => {
    const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Kart AŞ' }));
    for (let day = 0; day < 40 && Object.keys(engine.getState().buildings).length < 6; day++) engine.runDay();
    const state = engine.getState();
    const player = getPlayer(state);
    const rival = Object.values(state.buildings).find((b) => b.companyId !== player.id);
    assert.ok(rival, 'şehirde rakip binası var');

    // Oyuncunun tek binası: kadraj o kare.
    const ownTile = state.map.tiles.find((tile) => !tile.buildingId && tile.x > 2 && tile.y > 2)!;
    const own = { ...structuredClone(rival), id: 'kart-b1', tileId: ownTile.id, companyId: player.id };
    const withOwn = structuredClone(state);
    for (const building of Object.values(withOwn.buildings)) if (building.companyId === player.id) delete withOwn.buildings[building.id];
    withOwn.buildings[own.id] = own;
    assert.deepEqual(cardBounds(withOwn, player.id), { minX: ownTile.x, maxX: ownTile.x, minZ: ownTile.y, maxZ: ownTile.y });

    // Oyuncunun binası yok (devralındı): şehrin bütün binaları.
    const without = structuredClone(state);
    for (const building of Object.values(without.buildings)) if (building.companyId === player.id) delete without.buildings[building.id];
    const all = Object.values(without.buildings).map((b) => without.map.tiles[b.tileId]!);
    assert.deepEqual(cardBounds(without, player.id), {
      minX: Math.min(...all.map((t) => t.x)),
      maxX: Math.max(...all.map((t) => t.x)),
      minZ: Math.min(...all.map((t) => t.y)),
      maxZ: Math.max(...all.map((t) => t.y)),
    });

    // Hiç bina yok: harita.
    const empty = structuredClone(state);
    empty.buildings = {};
    assert.deepEqual(cardBounds(empty, player.id), { minX: 0, maxX: state.map.width - 1, minZ: 0, maxZ: state.map.height - 1 });
  });
});
