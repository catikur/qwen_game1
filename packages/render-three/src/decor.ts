import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeAwningTexture, makeContactShadowTexture } from './textures';

/**
 * Temas gölgeleri (Tur 24).
 *
 * Bina zemine oturmuyordu: gölge haritası olan kademelerde bile güneşin
 * düşürdüğü gölge binanın bir yanına kayıyor, tabanın çevresi aydınlık
 * kalıyordu — kutular parselin üstünde süzülüyor gibiydi. Her binanın
 * altına konan yumuşak bir leke bu boşluğu dolduruyor. Tek bir örnek ağı,
 * tek çizim çağrısı; gölge haritası OLMAYAN kademelerde de çalıştığı için
 * telefonda şehrin derinliğini taşıyan şey o.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private dummy = new THREE.Object3D();

  constructor(capacity: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(),
      color: '#000000',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    // Saydam yüzeyler arasında önce çizilsin: kamyon ve müşteri işaretleri üstünde kalır.
    this.mesh.renderOrder = -1;
  }

  begin(): void {
    this.count = 0;
  }

  /** Bir binanın altına leke koyar; `size` taban genişliği, `strength` 0..1. */
  place(x: number, y: number, z: number, size: number, strength = 1): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    this.dummy.position.set(x, y + 0.004, z);
    const scale = size * (1.5 + 0.25 * strength);
    this.dummy.scale.set(scale, 1, scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.count++, this.dummy.matrix);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.map?.dispose();
    material.dispose();
  }
}

/**
 * Detay parçaları (Tur 24) — her bina türü ne olduğunu söylesin diye.
 *
 * Kütle (taban, gövde, çatı) bir binanın ne kadar büyük olduğunu
 * anlatıyordu ama NE olduğunu anlatmıyordu: bakkal, kafe ve spor salonu
 * aynı kutuydu. Detay katmanı yedi parça türüyle bunu söylüyor:
 *
 *   roof    — kırma çatı (ev formu): kiremit sıraları uzaktan mahalle okutur
 *   box     — küçük kutular: klima, güneş paneli, yükleme rampası, anten
 *   cylinder— silo, su deposu, tank, yuvarlak baca
 *   glass   — cam: sera, çatı feneri, atrium
 *   awning  — çizgili tente, dükkânın sokağa bakan yüzünde
 *   sign    — tabela; ışıktan bağımsız, gece de okunuyor
 *   tree    — ağaç: sokak kenarı, park, ev bahçesi
 *   lamp    — sokak lambası başı; gece yanıyor, gündüz sönük
 *
 * Her parça kendi InstancedMesh'inde: parça başına bir çizim çağrısı, bina
 * sayısından bağımsız. Boş kalan parça hiç çizilmiyor.
 */
export type DecorPart = 'roof' | 'box' | 'cylinder' | 'glass' | 'awning' | 'sign' | 'tree' | 'lamp';

const PARTS: DecorPart[] = ['roof', 'box', 'cylinder', 'glass', 'awning', 'sign', 'tree', 'lamp'];

/** Gölge düşüren parçalar — tente ve tabela çok ince, gölgeleri titreşir. */
const CASTS_SHADOW: Record<DecorPart, boolean> = {
  roof: true,
  box: true,
  cylinder: true,
  glass: true,
  awning: false,
  sign: false,
  tree: true,
  lamp: false,
};

/**
 * Kırma çatı: 1×1 taban, 1 yükseklik, mahya x ekseninde. Dizinsiz
 * geometri: her üçgenin kendi normali var, eğik yüzler güneşle ayrı ayrı
 * aydınlanıyor ve çatının biçimi uzaktan okunuyor.
 */
function hipRoofGeometry(): THREE.BufferGeometry {
  const r = 0.22;
  const v = {
    a: [-0.5, 0, -0.5],
    b: [0.5, 0, -0.5],
    c: [0.5, 0, 0.5],
    d: [-0.5, 0, 0.5],
    p: [-r, 1, 0],
    q: [r, 1, 0],
  } as const;
  const tris: (keyof typeof v)[][] = [
    ['a', 'p', 'q'], ['a', 'q', 'b'], // arka yamaç
    ['d', 'c', 'q'], ['d', 'q', 'p'], // ön yamaç
    ['b', 'q', 'c'], // sağ kalkan
    ['a', 'd', 'p'], // sol kalkan
  ];
  const positions: number[] = [];
  for (const tri of tris) for (const key of tri) positions.push(...v[key]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Üçgen sarımı dışa baksın diye her üçgen kontrol ediliyor.
  const p = geometry.attributes['position'] as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    centroid.y -= 0.3;
    if (normal.dot(centroid) < 0) {
      p.setXYZ(i + 1, c.x, c.y, c.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Ağaç: gövde + düşük çokgenli taç, köşe renkleri birleşik tek geometride. */
function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.34, 5).toNonIndexed();
  trunk.translate(0, 0.17, 0);
  const crown = new THREE.IcosahedronGeometry(0.3, 0);
  crown.scale(1, 1.15, 1);
  crown.translate(0, 0.58, 0);
  const paint = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const count = geometry.attributes['position']!.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  };
  const merged = mergeGeometries([
    paint(trunk, new THREE.Color('#6b4f36')),
    paint(crown, new THREE.Color('#ffffff')),
  ]);
  merged.computeVertexNormals();
  return merged;
}

/** Parça geometrileri ve malzemeleri — bütün katmanlar paylaşıyor. */
export class DecorKit {
  readonly geometry: Record<DecorPart, THREE.BufferGeometry>;
  readonly material: Record<DecorPart, THREE.Material>;
  /** Cam ve tabela gece parlıyor; gün döngüsü bunları ayarlıyor. */
  readonly glassMaterial: THREE.MeshStandardMaterial;
  readonly lampMaterial: THREE.MeshStandardMaterial;

  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geometry = {
      roof: hipRoofGeometry(),
      box,
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      glass: box,
      awning: box,
      sign: box,
      tree: treeGeometry(),
      lamp: box,
    };
    this.glassMaterial = new THREE.MeshStandardMaterial({
      color: '#b9d4e6',
      roughness: 0.12,
      metalness: 0.65,
      emissive: new THREE.Color('#ffd79a'),
      emissiveIntensity: 0,
    });
    this.lampMaterial = new THREE.MeshStandardMaterial({
      color: '#e9e4d8',
      roughness: 0.5,
      metalness: 0.1,
      emissive: new THREE.Color('#ffcf86'),
      emissiveIntensity: 0,
    });
    this.material = {
      // Geometri dizinsiz: köşe normalleri zaten yüz normali, yani düz
      // gölgeleme `flatShading` olmadan geliyor (o seçenek her pikselde
      // türev hesaplatır — yazılımsal GPU'da karenin hissedilir bir payı).
      roof: new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.02 }),
      box: new THREE.MeshStandardMaterial({ roughness: 0.66, metalness: 0.12 }),
      cylinder: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }),
      glass: this.glassMaterial,
      awning: new THREE.MeshStandardMaterial({ map: makeAwningTexture(), roughness: 0.85, metalness: 0 }),
      // Tabela ışıktan bağımsız: gündüz düz renk, gece ışıklı pano. Ton
      // eşlemeden geçiyor ki gündüz neon gibi bağırmasın.
      sign: new THREE.MeshBasicMaterial(),
      tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
      lamp: this.lampMaterial,
    };
  }

  /** Gece camların içi yanıyor (sera, atrium, çatı feneri). */
  setNightGlow(glow: number): void {
    this.glassMaterial.emissiveIntensity = glow * 0.45;
    this.lampMaterial.emissiveIntensity = glow * 2.4;
  }

  dispose(): void {
    const geometries = new Set(Object.values(this.geometry));
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(this.material)) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  }
}

/** Bir parçalar takımı: binalar için bir, şehir dokusu için bir, sokak ağaçları için bir. */
export class DecorLayer {
  readonly meshes: Record<DecorPart, THREE.InstancedMesh>;
  readonly group = new THREE.Group();
  private counts: Record<DecorPart, number>;
  private dummy = new THREE.Object3D();

  constructor(kit: DecorKit, capacity: Record<DecorPart, number>) {
    this.counts = { roof: 0, box: 0, cylinder: 0, glass: 0, awning: 0, sign: 0, tree: 0, lamp: 0 };
    this.meshes = {} as Record<DecorPart, THREE.InstancedMesh>;
    for (const part of PARTS) {
      const mesh = new THREE.InstancedMesh(kit.geometry[part], kit.material[part], Math.max(1, capacity[part]));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = CASTS_SHADOW[part];
      mesh.receiveShadow = part !== 'sign';
      // Örnekler haritanın her yerine dağılıyor; tek bir sınır küresiyle
      // kırpılmak bazılarını yanlışlıkla gizlerdi.
      mesh.frustumCulled = false;
      this.meshes[part] = mesh;
      this.group.add(mesh);
    }
  }

  begin(): void {
    for (const part of PARTS) this.counts[part] = 0;
  }

  /**
   * Bir parça örneği koyar. `y` parçanın TABANI (merkezi değil): çatıya ve
   * zemine oturtmak böyle daha az hata yapıyor. `yaw` y ekseni etrafında,
   * `tilt` parçanın kendi x ekseni etrafında (tente eğimi).
   */
  add(
    part: DecorPart,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color,
    yaw = 0,
    tilt = 0,
  ): void {
    const mesh = this.meshes[part];
    const index = this.counts[part];
    if (index >= mesh.instanceMatrix.count) return;
    const baseOffset = part === 'roof' || part === 'tree' ? 0 : sy / 2;
    this.dummy.position.set(x, y + baseOffset, z);
    this.dummy.rotation.set(tilt, yaw, 0, 'YXZ');
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
    mesh.setColorAt(index, color);
    this.counts[part] = index + 1;
  }

  end(): void {
    for (const part of PARTS) {
      const mesh = this.meshes[part];
      mesh.count = this.counts[part];
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  setShadows(cast: boolean, receive: boolean): void {
    for (const part of PARTS) {
      this.meshes[part].castShadow = cast && CASTS_SHADOW[part];
      this.meshes[part].receiveShadow = receive && part !== 'sign';
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Testler için: parça başına örnek sayısı. */
  stats(): Record<DecorPart, number> {
    return { ...this.counts };
  }
}
