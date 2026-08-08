import * as THREE from 'three';

/**
 * Bina kütlesi.
 *
 * Şehirdeki her yapı tek bir kutunun ölçeklenmiş haliydi — 221 yapı, 3
 * geometri, hepsi kutu. Ölçüm bu görüntünün performanstan değil
 * SAHNEDEKİ AZLIKTAN geldiğini gösterdi: kare başına 5 çizim çağrısı ve
 * 10,5 K üçgen, bir orta seviye telefon bütçesinin yirmide biri.
 *
 * Burada bir bina üç parçaya ayrılıyor:
 *
 *   çatı   — gövdeden dar, koyu bir kapak
 *   gövde  — asıl kütle; pencere dokusunu taşıyan tek parça
 *   taban  — gövdeden geniş, kısa bir podyum
 *
 * Her parça KENDİ InstancedMesh'inde, yani üç parça toplam üç çizim
 * çağrısı ekliyor — bina sayısından bağımsız. Bütçe hâlâ fazlasıyla
 * yetiyor.
 *
 * Çatı kapağının ikinci bir işi var: gövdenin üst yüzünü örtüyor. Pencere
 * dokusu örnek ölçeğine göre döşendiği için gövdenin ÜST yüzüne de pencere
 * düşerdi; kapak o yüzü hiç göstermiyor ve sorun geometriyle çözülüyor,
 * shader'da özel durumla değil.
 */

/** Taban ve çatının gövdeye göre taban alanı oranı. */
const BASE_SPREAD = 1.16;
const CAP_SPREAD = 0.82;

/** Renk kaydırmaları: taban biraz koyu, çatı daha koyu. */
const BASE_SHADE = 0.82;
const CAP_SHADE = 0.66;

export interface MassPlacement {
  x: number;
  z: number;
  /** Zemin üstündeki toplam yükseklik. */
  height: number;
  /** Gövdenin taban genişliği. */
  width: number;
  color: THREE.Color;
  /** Zemin kotu — binalar biraz yükseltilmiş bir platform üzerinde. */
  groundY: number;
  /**
   * 0..1 arası inşaat ilerlemesi. 1 tamamlanmış demek; küçük değerlerde
   * bina yerden yükseliyor.
   */
  growth?: number;
}

export class BuildingMass {
  readonly body: THREE.InstancedMesh;
  readonly base: THREE.InstancedMesh;
  readonly cap: THREE.InstancedMesh;

  private bodyCount = 0;
  private baseCount = 0;
  private capCount = 0;
  private dummy = new THREE.Object3D();
  private shade = new THREE.Color();

  constructor(
    capacity: number,
    bodyMaterial: THREE.Material,
    trimMaterial: THREE.Material,
  ) {
    const unit = new THREE.BoxGeometry(1, 1, 1);

    this.body = new THREE.InstancedMesh(unit, bodyMaterial, capacity);
    // Taban ve çatı aynı malzemeyi paylaşıyor ama AYRI mesh olmak
    // zorundalar: örnek matrisi tek bir mesh içinde parça başına
    // değişemez.
    this.base = new THREE.InstancedMesh(unit.clone(), trimMaterial, capacity);
    this.cap = new THREE.InstancedMesh(unit.clone(), trimMaterial, capacity);

    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

  get meshes(): THREE.InstancedMesh[] {
    return [this.base, this.body, this.cap];
  }

  begin(): void {
    this.bodyCount = 0;
    this.baseCount = 0;
    this.capCount = 0;
  }

  place(placement: MassPlacement): void {
    const growth = placement.growth ?? 1;
    const total = Math.max(0.04, placement.height * growth);
    const width = placement.width;

    // Taban ve çatı payları toplam yükseklikten alınıyor; çok alçak
    // yapılarda ikisi de kısalıyor ki bina "şapkalı bir kutu" olmasın.
    const baseHeight = Math.min(Math.max(total * 0.16, 0.05), 0.3);
    const capHeight = Math.min(Math.max(total * 0.07, 0.035), 0.16);
    const bodyHeight = Math.max(0.05, total - baseHeight - capHeight);

    let y = placement.groundY;

    // --- taban ---
    this.dummy.position.set(placement.x, y + baseHeight / 2, placement.z);
    this.dummy.scale.set(width * BASE_SPREAD, baseHeight, width * BASE_SPREAD);
    this.dummy.rotation.y = 0;
    this.dummy.updateMatrix();
    this.base.setMatrixAt(this.baseCount, this.dummy.matrix);
    this.base.setColorAt(this.baseCount, this.shade.copy(placement.color).multiplyScalar(BASE_SHADE));
    this.baseCount++;
    y += baseHeight;

    // --- gövde ---
    this.dummy.position.set(placement.x, y + bodyHeight / 2, placement.z);
    this.dummy.scale.set(width, bodyHeight, width);
    this.dummy.updateMatrix();
    this.body.setMatrixAt(this.bodyCount, this.dummy.matrix);
    this.body.setColorAt(this.bodyCount, placement.color);
    this.bodyCount++;
    y += bodyHeight;

    // --- çatı ---
    this.dummy.position.set(placement.x, y + capHeight / 2, placement.z);
    this.dummy.scale.set(width * CAP_SPREAD, capHeight, width * CAP_SPREAD);
    this.dummy.updateMatrix();
    this.cap.setMatrixAt(this.capCount, this.dummy.matrix);
    this.cap.setColorAt(this.capCount, this.shade.copy(placement.color).multiplyScalar(CAP_SHADE));
    this.capCount++;
  }

  end(): void {
    this.base.count = this.baseCount;
    this.body.count = this.bodyCount;
    this.cap.count = this.capCount;
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Veri lensinde siluete inerken üç parça birlikte davranır. */
  setShadows(cast: boolean, receive: boolean): void {
    for (const mesh of this.meshes) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

/**
 * Pencere/cephe dokusunu örnek ÖLÇEĞİNE göre döşer.
 *
 * Sorun şu: InstancedMesh'te bütün örnekler aynı UV'yi paylaşır, ama
 * binalar farklı boyutlarda ölçekleniyor. Dokuyu olduğu gibi bıraksak
 * 4 katlı bir binada da 20 katlı bir binada da tam 4 sıra pencere olurdu
 * — yani kat yüksekliği binaya göre değişir ve ölçek duygusu kaybolurdu.
 *
 * Vertex shader'da örnek matrisinin ölçeğini okuyup UV'yi onunla
 * çarpıyoruz: bir doku tekrarı artık sabit bir DÜNYA ölçüsüne karşılık
 * geliyor, yani her binada kat yüksekliği aynı ve yükseklik farkı kat
 * sayısı olarak okunuyor.
 */
export function tileByInstanceScale(material: THREE.Material, tilesPerUnit: number): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTilesPerUnit = { value: tilesPerUnit };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTilesPerUnit;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         #ifdef USE_INSTANCING
           vec2 instanceTiling = vec2(
             length(instanceMatrix[0].xyz),
             length(instanceMatrix[1].xyz)
           ) * uTilesPerUnit;
           #ifdef USE_MAP
             vMapUv = vMapUv * instanceTiling;
           #endif
           #ifdef USE_EMISSIVEMAP
             vEmissiveMapUv = vEmissiveMapUv * instanceTiling;
           #endif
         #endif`,
      );
  };
  // Aynı shader'ı paylaşan malzemeler yeniden derlensin.
  material.customProgramCacheKey = () => `tiled-${tilesPerUnit}`;
}
