import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BLOOM_MAX_KERNEL_RADIUS, SharedKernelBloomPass } from '../src/bloom';

/**
 * Bloom'un tek bulanıklık programı (Tur 42). Geçiş WebGL'siz kuruluyor:
 * kurucu yalnızca hedefleri ve malzemeleri hazırlıyor, çizmiyor.
 */
type BlurMaterial = THREE.ShaderMaterial & { uniforms: { gaussianCoefficients: { value: number[] }; kernelRadius?: { value: number } } };

function blurMaterials(pass: UnrealBloomPass): BlurMaterial[] {
  return pass.separableBlurMaterials as BlurMaterial[];
}

describe('bloom: tek bulanıklık programı', () => {
  test('beş mip düzeyinin bulanıklığı aynı gölgelendiriciyi ve tanımları paylaşıyor', () => {
    const pass = new SharedKernelBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.8);
    const materials = blurMaterials(pass);
    assert.equal(materials.length, 5);
    // three programı gölgelendirici metni ve tanımlarla anahtarlıyor: hepsi aynıysa tek program.
    const keys = new Set(materials.map((m) => `${m.vertexShader}|${m.fragmentShader}|${JSON.stringify(m.defines)}`));
    assert.equal(keys.size, 1, 'üst sınıfın yöntemi yeniden adlandırıldıysa KERNEL_RADIUS tanımları geri gelir');
    pass.dispose();
  });

  test('çekirdek yarıçapları ve katsayılar three\'ninkiyle aynı', () => {
    const pass = new SharedKernelBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.8);
    const reference = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.8);
    const ours = blurMaterials(pass);
    const theirs = blurMaterials(reference);
    for (let i = 0; i < theirs.length; i++) {
      const radius = Number(theirs[i]!.defines.KERNEL_RADIUS);
      assert.equal(ours[i]!.uniforms.kernelRadius!.value, radius, `mip ${i}`);
      assert.ok(radius <= BLOOM_MAX_KERNEL_RADIUS, `mip ${i}: ${radius} sınırın altında`);
      const coefficients = ours[i]!.uniforms.gaussianCoefficients.value;
      assert.equal(coefficients.length, BLOOM_MAX_KERNEL_RADIUS);
      assert.deepEqual(coefficients.slice(0, radius), theirs[i]!.uniforms.gaussianCoefficients.value);
      assert.ok(coefficients.slice(radius).every((c) => c === 0), 'yarıçapın ötesi sıfır');
    }
    pass.dispose();
    reference.dispose();
  });
});
