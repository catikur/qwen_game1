import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, nextFloat, nextInt, pickWeighted } from '../src/rng';

describe('rng', () => {
  test('aynı tohum aynı diziyi verir', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 50 }, () => nextFloat(a));
    const seqB = Array.from({ length: 50 }, () => nextFloat(b));
    assert.deepEqual(seqA, seqB);
  });

  test('farklı tohum farklı dizi verir', () => {
    const a = createRng(1);
    const b = createRng(2);
    assert.notDeepEqual(
      Array.from({ length: 5 }, () => nextFloat(a)),
      Array.from({ length: 5 }, () => nextFloat(b)),
    );
  });

  test('sıfır tohum da çalışan bir durum üretir', () => {
    const rng = createRng(0);
    assert.notEqual(rng.s, 0);
    const value = nextFloat(rng);
    assert.ok(value >= 0 && value < 1);
  });

  test('nextFloat [0, 1) içinde kalır', () => {
    const rng = createRng(99);
    for (let i = 0; i < 5000; i++) {
      const value = nextFloat(rng);
      assert.ok(value >= 0 && value < 1, `aralık dışı: ${value}`);
    }
  });

  // PR #21'de yakalanan hata: nextInt(2, 3) "2 ya da 3" sanıldı, oysa
  // aralık yarı açık ve hep 2 döndürüyordu. Bu test sözleşmeyi sabitliyor.
  test('nextInt yarı açık: [min, max) — üst sınır hiç çıkmaz, alt sınır çıkar', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(nextInt(rng, 2, 4));
    assert.deepEqual([...seen].sort(), [2, 3]);
  });

  test('nextInt tek elemanlı aralıkta sabit', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) assert.equal(nextInt(rng, 5, 6), 5);
  });

  test('pickWeighted sıfır ağırlığı asla seçmez', () => {
    const rng = createRng(3);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 2000; i++) {
      assert.notEqual(pickWeighted(rng, items, (item) => (item === 'b' ? 0 : 1)), 'b');
    }
  });

  test('pickWeighted toplam ağırlık sıfırsa ilk elemanı döndürür', () => {
    const rng = createRng(3);
    assert.equal(pickWeighted(rng, ['x', 'y'], () => 0), 'x');
  });
});
