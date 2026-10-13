import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_ARCHETYPES } from '@capital/content';
import type { DistrictArchetypeId } from '@capital/content';
import { defaultShelf, goodShares, shelfReach } from '../src/systems/demand';

/*
 * Ayakkabı perakendenin üçüncü ürünü (Tur 29).
 *
 * Kategori talebi ürünler arasında bölünüyor: ilk sürüm ayakkabıyı ek
 * harcama yapmıştı ve oyun kolaylaştı (goods.ts). Burada sınanan, bölünen
 * talebin bir karar olarak kalması: her arketipte paylar toplamı bir, tek
 * raflı butik bir ürün seçiyor, dört raflı mağaza üçünü de taşıyor ve
 * ayakkabı en az bir arketipte rafın en iyisi.
 */

const ARCHETYPES = Object.keys(DISTRICT_ARCHETYPES) as DistrictArchetypeId[];

describe('ayakkabı perakendenin üçüncü ürünü', () => {
  test('perakende talebi korunuyor: her arketipte paylar toplamı bir', () => {
    for (const archetype of ARCHETYPES) {
      const shares = goodShares(archetype, 'retail');
      assert.equal(shares.length, 3);
      const total = shares.reduce((sum, s) => sum + s.share, 0);
      assert.ok(Math.abs(total - 1) < 1e-12, `${archetype}: ${total}`);
    }
  });

  test('butik bir ürün, Mağazalar Zinciri üç ürün taşıyor', () => {
    for (const archetype of ARCHETYPES) {
      const boutique = defaultShelf(archetype, 'retail', 1);
      const department = defaultShelf(archetype, 'retail', 4);
      assert.equal(boutique.length, 1);
      assert.deepEqual(department.slice().sort(), ['apparel', 'footwear', 'home_textile']);
      assert.ok(Math.abs(shelfReach(archetype, 'retail', department) - 1) < 1e-12);
    }
  });

  test('ayakkabı öğrenci ve çarşı bölgelerinde rafın en iyisi (tek raflı dükkânın seçimi gerçek)', () => {
    const wins = ARCHETYPES.filter((archetype) => defaultShelf(archetype, 'retail', 1)[0] === 'footwear');
    assert.deepEqual(wins.sort(), ['retail_strip', 'student']);
  });
});
