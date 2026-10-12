import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILDINGS, STRUCTURES } from '@capital/content';
import type { DecorLayer, DecorPart } from '../src/decor';
import type { MassFootprint } from '../src/mass';
import { decorateBuilding, decorateStructure, placeStreetTrees, streetSide } from '../src/recipes';

/** Parça çağrılarını toplayan sahte katman — dokuya ve WebGL'e gerek yok. */
function recorder(): { layer: DecorLayer; calls: { part: DecorPart; x: number; y: number; z: number }[] } {
  const calls: { part: DecorPart; x: number; y: number; z: number }[] = [];
  const layer = {
    begin() {},
    end() {},
    add(part: DecorPart, x: number, y: number, z: number) {
      calls.push({ part, x, y, z });
    },
  } as unknown as DecorLayer;
  return { layer, calls };
}

function footprint(form: MassFootprint['form'], height: number): MassFootprint {
  return { form, bodyWidth: 0.68, bodyBottom: 0.1, bodyTop: 0.1 + height, roofY: 0.12 + height, roofWidth: 0.6, roofHeight: 0.2 };
}

const FORM_OF: Record<string, MassFootprint['form']> = { extract: 'field', process: 'shed', logistics: 'shed' };

describe('detay reçeteleri', () => {
  test('her bina türü en az bir detay taşıyor', () => {
    const bare: string[] = [];
    for (const def of BUILDINGS) {
      const { layer, calls } = recorder();
      const form = FORM_OF[def.role] ?? (def.role === 'outlet' && def.height < 0.8 ? 'house' : 'block');
      decorateBuilding(layer, def, footprint(form, def.height), 10, 10, streetSide(11, 12, 5), new THREE.Color('#888888'), new THREE.Color('#3ba55d'));
      if (calls.length === 0) bare.push(def.id);
    }
    assert.deepEqual(bare, [], 'detayı olmayan bina türleri');
  });

  test('detaylar kendi parselinin içinde kalıyor', () => {
    for (const def of BUILDINGS) {
      const { layer, calls } = recorder();
      const form = FORM_OF[def.role] ?? (def.role === 'outlet' && def.height < 0.8 ? 'house' : 'block');
      decorateBuilding(layer, def, footprint(form, def.height), 10, 10, streetSide(11, 12, 5), new THREE.Color('#888888'), new THREE.Color('#3ba55d'));
      for (const call of calls) {
        assert.ok(Math.abs(call.x - 10) < 0.62 && Math.abs(call.z - 10) < 0.62, `${def.id}: ${call.part} parselin dışında (${call.x.toFixed(2)}, ${call.z.toFixed(2)})`);
        assert.ok(call.y >= 0, `${def.id}: ${call.part} zeminin altında`);
      }
    }
    for (const structure of STRUCTURES) {
      const { layer, calls } = recorder();
      decorateStructure(layer, structure, footprint(structure.form, 0.6), 10, 10, streetSide(11, 12, 5));
      for (const call of calls) {
        assert.ok(Math.abs(call.x - 10) < 0.62 && Math.abs(call.z - 10) < 0.62, `${structure.id}: ${call.part} parselin dışında`);
      }
    }
  });

  test('sokak tarafı en yakın yola bakıyor', () => {
    // Bloklar 5 karelik: x=1 kare soldaki yola (x=0) komşu.
    assert.deepEqual(streetSide(1, 2, 5), { d: 1, yaw: -Math.PI / 2, nx: -1, nz: 0 });
    assert.equal(streetSide(4, 2, 5).nx, 1);
    assert.equal(streetSide(2, 1, 5).nz, -1);
    assert.equal(streetSide(2, 4, 5).nz, 1);
  });

  test('sokak ağaçları kavşağa ve parsele düşmüyor', () => {
    const tiles: { x: number; y: number; kind: string }[] = [];
    for (let y = 0; y <= 10; y++) for (let x = 0; x <= 10; x++) tiles.push({ x, y, kind: x % 5 === 0 || y % 5 === 0 ? 'road' : 'plot' });
    const { layer, calls } = recorder();
    placeStreetTrees(layer, tiles, 5);
    const trees = calls.filter((call) => call.part === 'tree');
    assert.ok(trees.length > 20, `${trees.length} ağaç`);
    for (const tree of trees) {
      const tx = Math.round(tree.x);
      const tz = Math.round(tree.z);
      const onRoad = tx % 5 === 0 || tz % 5 === 0;
      assert.ok(onRoad, `ağaç yol karesinde değil: ${tree.x}, ${tree.z}`);
      assert.ok(!(tx % 5 === 0 && tz % 5 === 0), `ağaç kavşakta: ${tree.x}, ${tree.z}`);
    }
  });
});
