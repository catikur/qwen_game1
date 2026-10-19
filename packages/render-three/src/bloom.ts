import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Bloom geçişi, tek bulanıklık programıyla (Tur 42).
 *
 * three'nin `UnrealBloomPass`'i beş mip düzeyinin her biri için çekirdek
 * yarıçapını (`KERNEL_RADIUS` 6, 10, 14, 18, 22) bir `#define` olarak
 * yazıyor: aynı bulanıklık beş ayrı gölgelendirici programı olarak
 * derleniyor. Burada yarıçap bir uniform; döngü en büyük yarıçapa kadar
 * sabit sınırla dönüyor ve kendi yarıçapında duruyor. Katsayılar ve
 * toplama sırası aynı: görüntü birebir aynı, derlenen program dört
 * eksik.
 *
 * Üst sınıfın kurucusu `_getSeparableBlurMaterial`'ı her mip için çağırıyor;
 * three bu yöntemin adını değiştirirse `bloom.test.ts` kalır.
 */
export const BLOOM_MAX_KERNEL_RADIUS = 22;

export class SharedKernelBloomPass extends UnrealBloomPass {
  _getSeparableBlurMaterial(kernelRadius: number): THREE.ShaderMaterial {
    const coefficients: number[] = [];
    const sigma = kernelRadius / 3;
    for (let i = 0; i < BLOOM_MAX_KERNEL_RADIUS; i++) {
      coefficients.push(i < kernelRadius ? (0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma : 0);
    }

    return new THREE.ShaderMaterial({
      defines: { MAX_KERNEL_RADIUS: BLOOM_MAX_KERNEL_RADIUS },
      uniforms: {
        colorTexture: { value: null },
        invSize: { value: new THREE.Vector2(0.5, 0.5) },
        direction: { value: new THREE.Vector2(0.5, 0.5) },
        gaussianCoefficients: { value: coefficients },
        kernelRadius: { value: kernelRadius },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        #include <common>

        varying vec2 vUv;

        uniform sampler2D colorTexture;
        uniform vec2 invSize;
        uniform vec2 direction;
        uniform float gaussianCoefficients[MAX_KERNEL_RADIUS];
        uniform int kernelRadius;

        void main() {
          float weightSum = gaussianCoefficients[0];
          vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;

          for ( int i = 1; i < MAX_KERNEL_RADIUS; i ++ ) {
            if ( i >= kernelRadius ) break;
            float x = float( i );
            float w = gaussianCoefficients[i];
            vec2 uvOffset = direction * invSize * x;
            vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
            vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
            diffuseSum += ( sample1 + sample2 ) * w;
          }

          gl_FragColor = vec4( diffuseSum, 1.0 );
        }`,
    });
  }
}
