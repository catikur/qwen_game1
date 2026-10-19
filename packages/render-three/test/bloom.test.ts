import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BLOOM_MAX_KERNEL_RADIUS, SharedKernelBloomPass, postProcessingMaterials } from '../src/bloom';

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

/** Sahnedeki zincirin aynısı, WebGL'siz: geçişler kurulurken çizici yalnız piksel oranını soruyor. */
function silentRenderer(): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 1,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.05,
    setRenderTarget() {},
    clear() {},
    render() {},
  } as unknown as THREE.WebGLRenderer;
}

function cityChain(renderer: THREE.WebGLRenderer) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera()));
  const bloom = new SharedKernelBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.8);
  const output = new OutputPass();
  composer.addPass(bloom);
  composer.addPass(output);
  return { composer, bloom, output };
}

describe('son işlem malzemeleri: ön derleme (Codex #71)', () => {
  test('bloom malzemeleri ara hedefe, çıkış ekrana derleniyor', () => {
    const renderer = silentRenderer();
    const { composer, bloom, output } = cityChain(renderer);
    const materials = postProcessingMaterials(composer, renderer);
    const expected = [bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial];
    assert.deepEqual(materials.slice(0, expected.length).map((m) => m.material), expected);
    assert.ok(materials.slice(0, expected.length).every((m) => m.toScreen === false), 'bloom zincirin sonunda değil');
    assert.equal(materials.at(-1)!.material, output.material);
    assert.equal(materials.at(-1)!.toScreen, true);
    assert.equal(materials.length, expected.length + 1);
  });

  test('çıkış geçişinin tanımları önceden kuruluyor; ilk çizim programı yenilemiyor', () => {
    const renderer = silentRenderer();
    const { composer, output } = cityChain(renderer);
    postProcessingMaterials(composer, renderer);
    assert.ok('SRGB_TRANSFER' in output.material.defines);
    assert.ok('ACES_FILMIC_TONE_MAPPING' in output.material.defines);
    const version = output.material.version;
    output.render(renderer, composer.writeBuffer, composer.readBuffer, 0, false);
    assert.equal(output.material.version, version, 'ilk çizim tanımları yeniden kurarsa ön derlenen program boşa gider');
  });
});
