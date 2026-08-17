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

/** Gövde bu yükseklikten sonra kademeli (setback) kütleye geçer. */
const SETBACK_MIN_BODY = 1.6;
/** Korniş bandı bu gövde yüksekliğinden sonra görülebilir. */
const CORNICE_MIN_BODY = 0.7;
/** Çatı ekipmanı bu toplam yükseklikten sonra çıkar. */
const ROOF_GEAR_MIN_TOTAL = 1.3;

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

    // Kapasiteler parça başına farklı: kademeli bina 2 gövde örneği,
    // çatı katmanı ise kapak + korniş/teras + 2 ekipman kutusuna kadar
    // çıkabiliyor. Örnek sayısı artıyor, ÇİZİM ÇAĞRISI artmıyor — üç
    // mesh üç çağrı; zenginleşme bütçeye örnek matrisi olarak giriyor.
    this.body = new THREE.InstancedMesh(unit, bodyMaterial, capacity * 2);
    // Taban ve çatı aynı malzemeyi paylaşıyor ama AYRI mesh olmak
    // zorundalar: örnek matrisi tek bir mesh içinde parça başına
    // değişemez.
    this.base = new THREE.InstancedMesh(unit.clone(), trimMaterial, capacity);
    this.cap = new THREE.InstancedMesh(unit.clone(), trimMaterial, capacity * 5);

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

  /** Bir kutu örneği yerleştirir — üç parça da aynı yolu kullanır. */
  private put(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color,
  ): void {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.rotation.y = 0;
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    mesh.setColorAt(index, color);
  }

  place(placement: MassPlacement): void {
    const growth = placement.growth ?? 1;
    const total = Math.max(0.04, placement.height * growth);
    const width = placement.width;
    const { x, z } = placement;

    /*
     * Konumdan türeyen deterministik varyasyon.
     *
     * Aynı yükseklikteki iki bina artık aynı siluet değil: kademe oranı,
     * korniş var/yok ve çatı ekipmanının yeri bu zardan geliyor. Zar
     * KONUMDAN türetiliyor (ayrı bir tohum alanı değil) çünkü kütle her
     * karede yeniden yerleştiriliyor — durum taşımadan aynı binanın hep
     * aynı görünmesinin tek yolu, kimliği koordinattan okumak.
     */
    const seed = ((x * 151 + z * 73 + 1) * 2654435761) >>> 0;
    const pick = (slot: number): number => ((seed >>> (slot * 4)) & 15) / 15;

    // Taban ve çatı payları toplam yükseklikten alınıyor; çok alçak
    // yapılarda ikisi de kısalıyor ki bina "şapkalı bir kutu" olmasın.
    const baseHeight = Math.min(Math.max(total * 0.16, 0.05), 0.3);
    const capHeight = Math.min(Math.max(total * 0.07, 0.035), 0.16);
    const bodyHeight = Math.max(0.05, total - baseHeight - capHeight);

    let y = placement.groundY;

    // --- taban ---
    this.put(
      this.base,
      this.baseCount++,
      x,
      y + baseHeight / 2,
      z,
      width * BASE_SPREAD,
      baseHeight,
      width * BASE_SPREAD,
      this.shade.copy(placement.color).multiplyScalar(BASE_SHADE),
    );
    y += baseHeight;

    // `trim` tek karalama rengin (this.shade) takma adı. setColorAt
    // değeri çağrı anında tampona kopyaladığı için bu güvenli — ama
    // ancak SIRAYLA: trim tabandan sonra hesaplanmalı (yoksa taban
    // rengi onu ezer) ve tüm trim kullanıcıları ekipman renginden önce
    // gelmeli.
    const trim = this.shade.copy(placement.color).multiplyScalar(CAP_SHADE);

    // --- gövde: yüksek binada kademeli, alçakta tek blok ---
    //
    // Kademe (setback) gökdelen siluetinin asıl imzası: alt blok geniş,
    // üst blok dar. Aradaki teras kapağı iki iş görüyor — silueti çiziyor
    // VE alt bloğun açığa çıkan üst yüzünü örtüyor (pencere dokusu örnek
    // ölçeğine döşendiği için o yüze de pencere düşerdi; Tur 6'daki çatı
    // kapağı dersinin aynısı).
    let topWidth = width;
    if (bodyHeight > SETBACK_MIN_BODY) {
      const lowerHeight = bodyHeight * (0.5 + pick(0) * 0.2);
      const upperHeight = bodyHeight - lowerHeight;
      const upperWidth = width * (0.66 + pick(1) * 0.14);

      this.put(this.body, this.bodyCount++, x, y + lowerHeight / 2, z, width, lowerHeight, width, placement.color);
      y += lowerHeight;

      const terraceHeight = Math.min(0.05, upperHeight * 0.2);
      this.put(this.cap, this.capCount++, x, y + terraceHeight / 2, z, width * 1.03, terraceHeight, width * 1.03, trim);
      y += terraceHeight;

      this.put(this.body, this.bodyCount++, x, y + upperHeight / 2, z, upperWidth, upperHeight, upperWidth, placement.color);
      y += upperHeight;
      topWidth = upperWidth;
    } else {
      this.put(this.body, this.bodyCount++, x, y + bodyHeight / 2, z, width, bodyHeight, width, placement.color);
      y += bodyHeight;

      // Korniş: orta boy binaların bir kısmında çatı altına ince bant.
      // Hepsine koysak yeni bir tekdüzelik olurdu; zar %60'ına koyuyor.
      if (bodyHeight > CORNICE_MIN_BODY && pick(2) > 0.4) {
        const corniceHeight = 0.035;
        this.put(this.cap, this.capCount++, x, y + corniceHeight / 2, z, width * 1.07, corniceHeight, width * 1.07, trim);
        y += corniceHeight;
      }
    }

    // --- çatı ---
    const capWidth = topWidth * CAP_SPREAD;
    this.put(this.cap, this.capCount++, x, y + capHeight / 2, z, capWidth, capHeight, capWidth, trim);
    y += capHeight;

    // --- çatı ekipmanı: klima/asansör dairesi kutuları ---
    //
    // Düz çatı boş bir kapaktı; bir-iki küçük kutu onu "bakılan" bir
    // yüzeye çeviriyor. Yükseklikler toplamdan oranlanıyor ki inşaat
    // animasyonunda bina ekipmanıyla birlikte yükselsin.
    if (total > ROOF_GEAR_MIN_TOTAL) {
      const gearCount = pick(3) > 0.55 ? 2 : 1;
      const gearShade = this.shade.copy(trim).multiplyScalar(0.85);
      for (let i = 0; i < gearCount; i++) {
        const gearWidth = capWidth * (0.14 + pick(4 + i) * 0.1);
        const gearHeight = Math.min(0.09, total * 0.05);
        const offsetRange = capWidth * 0.3;
        const gx = x + (pick(6 + i) - 0.5) * 2 * offsetRange;
        const gz = z + (pick(5 - i) - 0.5) * 2 * offsetRange;
        this.put(this.cap, this.capCount++, gx, y + gearHeight / 2, gz, gearWidth, gearHeight, gearWidth, gearShade);
      }
    }
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
