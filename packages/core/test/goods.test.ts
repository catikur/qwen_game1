import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_ARCHETYPES, GOOD_BY_ID } from '@capital/content';
import type { DistrictArchetypeId } from '@capital/content';
import { goodShares } from '../src/systems/demand';

/*
 * Ayakkabı perakendeye EK talep olarak geldi (Tur 29).
 *
 * Kategori talebi ürünler arasında normalize ediliyor; üçüncü ürün payını
 * öbür ikisinden kesmesin diye her arketipin perakende ağırlığı ayakkabının
 * payı kadar büyütüldü. Ölçü: giyim ve ev tekstilinin mutlak talebi
 * (arketip ağırlığı × ürün payı) Tur 29'dan önceki iki ürünlü formülle
 * her arketipte aynı.
 */

/** Tur 29'dan önceki perakende ağırlıkları (districts.ts yorumunda da yazıyor). */
const BEFORE: Record<DistrictArchetypeId, number> = {
  downtown: 1.3,
  retail_strip: 1.6,
  industrial: 0.4,
  port: 0.5,
  tech_park: 0.9,
  lux_residential: 1.7,
  mid_residential: 0.9,
  student: 0.7,
  tourism: 1.5,
};

function weight(goodId: string, archetype: DistrictArchetypeId): number {
  const good = GOOD_BY_ID[goodId]!;
  return good.demandShare * (good.archetypeWeights?.[archetype] ?? 1);
}

describe('ayakkabı perakendeye ek talep', () => {
  test('giyim ve ev tekstilinin mutlak talebi her arketipte aynı', () => {
    for (const archetype of Object.keys(BEFORE) as DistrictArchetypeId[]) {
      const now = DISTRICT_ARCHETYPES[archetype].demandWeights.retail ?? 1;
      const shares = goodShares(archetype, 'retail');
      const pair = weight('apparel', archetype) + weight('home_textile', archetype);
      for (const id of ['apparel', 'home_textile']) {
        const after = now * shares.find((s) => s.good.id === id)!.share;
        const before = BEFORE[archetype] * (weight(id, archetype) / pair);
        // Ağırlıklar üç ondalığa yuvarlandı: binde bir pay.
        assert.ok(Math.abs(after / before - 1) < 0.001, `${archetype} ${id}: ${before.toFixed(4)} → ${after.toFixed(4)}`);
      }
    }
  });

  test('ayakkabı en az bir arketipte rafın en iyisi (tek raflı dükkânın seçimi gerçek)', () => {
    const wins = (Object.keys(BEFORE) as DistrictArchetypeId[]).filter((archetype) => {
      const rows = goodShares(archetype, 'retail').slice().sort((a, b) => b.share - a.share);
      return rows[0]!.good.id === 'footwear';
    });
    assert.ok(wins.length >= 1, 'ayakkabı hiçbir arketipte önde değil');
    assert.deepEqual(wins.sort(), ['retail_strip', 'student']);
  });
});
