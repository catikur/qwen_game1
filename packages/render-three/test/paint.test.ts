import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { paint } from '../src/paint';

/** Ayrıştırılmış renk (Tur 65): sonuç `set` ile aynı, dizgi bir kez ayrıştırılıyor. */
describe('renk dizgisi', () => {
  test('sonuç three\'nin kendi ayrıştırmasıyla birebir aynı', () => {
    for (const css of ['#12171f', '#7f9468', '#3fd39a', '#fff36b', '#abc', 'rgb(250, 10, 0)', 'hsl(120, 50%, 40%)', 'skyblue']) {
      const expected = new THREE.Color().set(css);
      const actual = paint(new THREE.Color(), css);
      assert.deepEqual([actual.r, actual.g, actual.b], [expected.r, expected.g, expected.b], css);
    }
  });

  test('aynı dizgi ikinci kez ayrıştırılmıyor; hedef her seferinde baştan yazılıyor', () => {
    const original = THREE.Color.prototype.setStyle;
    let parsed = 0;
    THREE.Color.prototype.setStyle = function (this: THREE.Color, ...args: Parameters<typeof original>) {
      parsed++;
      return original.apply(this, args);
    };
    try {
      const target = new THREE.Color();
      for (let i = 0; i < 50; i++) paint(target, '#2a3446').offsetHSL(0, 0, 0.1);
      assert.equal(parsed, 1, `${parsed} kez ayrıştırıldı`);
      // Önceki çağrının değişikliği (offsetHSL) taşınmıyor.
      const expected = new THREE.Color('#2a3446');
      paint(target, '#2a3446');
      assert.deepEqual([target.r, target.g, target.b], [expected.r, expected.g, expected.b]);
    } finally {
      THREE.Color.prototype.setStyle = original;
    }
  });
});
