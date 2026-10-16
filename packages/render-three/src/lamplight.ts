import * as THREE from 'three';

/**
 * Sokak lambalarının ışık havuzu (Tur 36).
 *
 * Lambaların başı gece yanıyordu ama zemine ışık düşmüyordu: sokak gece
 * yalnızca pencerelerle aydınlanıyor, kaldırım karanlık kalıyordu. Gerçek
 * ışık kaynağı (her lambaya bir PointLight) mobil GPU'da düşünülemez;
 * havuz zemine yatırılmış yumuşak bir leke, toplamalı karışımla çiziliyor.
 * Bütün lambalar tek örneklenmiş ağda: tek çizim çağrısı.
 *
 * Gündüz ve veri lensinde görünmüyor; parlaklık pencere ışığıyla aynı
 * eğriden (`setGlow`).
 */
export class LampLight {
  readonly mesh: THREE.InstancedMesh;
  private material: THREE.MeshBasicMaterial;
  private texture: THREE.CanvasTexture;

  constructor(capacity: number) {
    this.texture = makePoolTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: '#ffc477',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, this.material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    // Parselin üst yüzü 0,07'de; havuz onun hemen üstünde, yol üstünde de
    // aynı kotta (aradaki 5 cm üstten bakışta okunmuyor).
    this.mesh.renderOrder = 2;
  }

  place(positions: readonly { x: number; z: number }[]): void {
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const at of positions) {
      if (index >= this.mesh.instanceMatrix.count) break;
      dummy.position.set(at.x, 0.074, at.z);
      dummy.scale.set(1.7, 1, 1.7);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index++, dummy.matrix);
    }
    this.mesh.count = index;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 0 gündüz, ~1,15 gece yarısı — pencere ışığıyla aynı eğri. */
  setGlow(glow: number): void {
    this.material.opacity = Math.min(1, glow) * 0.5;
    this.mesh.visible = this.mesh.count > 0 && glow > 0.02;
  }

  /** Testler için: havuz sayısı, parlaklık, görünürlük. */
  info(): { count: number; opacity: number; visible: boolean } {
    return { count: this.mesh.count, opacity: this.material.opacity, visible: this.mesh.visible };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Ortası dolgun, kenara doğru karesel sönen yuvarlak leke. */
function makePoolTexture(): THREE.CanvasTexture {
  const size = 64;
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D bağlamı alınamadı — doku üretilemez.');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const v = Math.pow(1 - d, 1.6);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(v * 255);
      image.data[i + 1] = Math.round(v * 255);
      image.data[i + 2] = Math.round(v * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
