import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { uploadDrawn } from '../src/instances';

/** Örnek tamponunun yalnız çizilen kısmını yüklemek (Tur 43). WebGL'siz: yükleme isteği öznitelikte. */
describe('örnek tamponu: yalnız çizilen kısım', () => {
  test('aralık çizilen örnek sayısı kadar; tamponun geri kalanı yüklenmiyor', () => {
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(400 * 16), 16);
    const version = matrices.version;
    uploadDrawn(matrices, 37);
    assert.deepEqual(matrices.updateRanges, [{ start: 0, count: 37 * 16 }]);
    assert.equal(matrices.version, version + 1, 'yükleme istendi');
  });

  test('her yükleme önceki aralığı siliyor: çağıran ilk `count` yuvanın hepsini yeniden yazıyor', () => {
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(50 * 3), 3);
    uploadDrawn(colors, 20);
    uploadDrawn(colors, 8);
    assert.deepEqual(colors.updateRanges, [{ start: 0, count: 8 * 3 }]);
  });

  test('çizilen yoksa hiçbir şey yüklenmiyor: sıfır uzunluklu aralık WebGL\'de tamponun tamamı demek', () => {
    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(10 * 16), 16);
    const version = matrices.version;
    uploadDrawn(matrices, 0);
    assert.equal(matrices.updateRanges.length, 0);
    assert.equal(matrices.version, version, 'yükleme istenmedi');
  });
});
