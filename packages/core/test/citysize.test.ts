import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_UNLOCK_DAYS, createNewGame } from '../src/worldgen';
import { accessWeight } from '../src/systems/market';
import { victoryNetWorth } from '../src/systems/goals';
import { getDifficulty } from '@capital/content';

describe('şehir boyutu', () => {
  test('standart şehir varsayılan, yeni alan yazmıyor', () => {
    const a = createNewGame({ seed: 9 });
    const b = createNewGame({ seed: 9, citySize: 'standard' });
    assert.equal(a.map.width, 30);
    assert.equal(a.districts.length, 9);
    assert.equal(a.citySize, undefined);
    assert.equal(a.rivalTempo, undefined);
    const strip = (s: typeof a) => JSON.stringify({ ...s, meta: undefined });
    assert.equal(strip(a), strip(b));
  });

  test('büyük şehir: 5×5, dış halka dört dalgada, sekiz rakip, tempo 2', () => {
    const state = createNewGame({ seed: 9, citySize: 'large' });
    assert.equal(state.map.width, 50);
    assert.equal(state.districts.length, 25);
    assert.equal(state.citySize, 'large');
    assert.equal(state.rivalTempo, 2);
    assert.equal(Object.values(state.companies).filter((c) => !c.isPlayer).length, 8);
    const locked = state.districts.filter((d) => d.opensOnDay !== undefined);
    assert.equal(locked.length, 16);
    for (const d of locked) {
      const dx = d.x0 / 10;
      const dy = d.y0 / 10;
      assert.ok(dx === 0 || dy === 0 || dx === 4 || dy === 4, `${d.id} halkada`);
    }
    for (const day of DISTRICT_UNLOCK_DAYS) {
      assert.equal(locked.filter((d) => d.opensOnDay === day).length, 4, `${day}. gün dört bölge`);
    }
  });

  test('lig her zaman standart şehirde', () => {
    const state = createNewGame({ league: { weekId: '2026-W41' }, citySize: 'large' });
    assert.equal(state.districts.length, 9);
    assert.equal(state.citySize, undefined);
  });

  test('zafer eşiği büyük şehirde 1,5 katı', () => {
    const base = getDifficulty('normal').victoryNetWorth;
    assert.equal(victoryNetWorth(createNewGame({ seed: 1 })), base);
    assert.equal(victoryNetWorth(createNewGame({ seed: 1, citySize: 'large' })), base * 1.5);
  });
});

describe('bölgeler arası erişim (Tur 8–21 hatası)', () => {
  test('3×3 komşuluk ızgaraya uyuyor', () => {
    const state = createNewGame({ seed: 2 });
    // 0 1 2 / 3 4 5 / 6 7 8
    assert.equal(accessWeight(state, 3, 6), 0.3, 'Çarşı ↔ Öğrenci alt komşu');
    assert.equal(accessWeight(state, 3, 0), 0.3);
    assert.equal(accessWeight(state, 3, 4), 0.3);
    assert.equal(accessWeight(state, 3, 7), 0.14, 'çapraz');
    assert.equal(accessWeight(state, 3, 2), 0, 'Teknopark uzak (eski hata: komşu sayılıyordu)');
    assert.equal(accessWeight(state, 0, 8), 0);
    assert.equal(accessWeight(state, 4, 4), 1);
  });

  test('5×5 komşuluk', () => {
    const state = createNewGame({ seed: 2, citySize: 'large' });
    assert.equal(accessWeight(state, 12, 13), 0.3);
    assert.equal(accessWeight(state, 12, 18), 0.14);
    assert.equal(accessWeight(state, 12, 14), 0);
    assert.equal(accessWeight(state, 4, 5), 0, 'satır sonu sarılmıyor');
  });
});
