import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { uploadDrawn } from './instances';

/**
 * Sokak hayatı (Tur 34): kaldırımda yürüyen insanlar ve tüten bacalar.
 *
 * Kullanıcının Tur 33 sonrası sözü "hayat yok" oldu. Araçlar sokağı
 * dolduruyordu ama şehirde kimse yürümüyordu ve fabrikalar ölü
 * kutulardı. Bu dosya iki şey ekliyor:
 *
 * YAYALAR süs. Simülasyonla bağları yok; parsellerin sokağa bakan
 * kenarında, kaldırım şeridinde yürüyorlar. Gece azalıyorlar (sokak
 * boşalır), veri lensinde susuyorlar, kalite kademesiyle seyreliyorlar.
 *
 * DUMAN BİLGİ. Yalnızca iki yerden çıkıyor: o gün gerçekten üretim
 * yapmış bir tesisin (rakip ya da oyuncu, `last.producedUnits > 0`)
 * bacasından ve şehrin "Fabrika" yapılarından ("bacası tütüyorsa sahibi
 * kolay bırakmaz"). Girdisi kesilen tesisin bacası susuyor: zincirin
 * nerede durduğu tablo açmadan görülüyor. Eski depo atıl olduğu için
 * tütmüyor.
 */

/** Kaldırım şeridi: sokak ekseninden parsele doğru uzaklık. */
const SIDEWALK_OFFSET = 0.54;
/** Parsel bloklarının üst kotu; yaya bunun üstünde yürüyor. */
const PARCEL_TOP = 0.07;
/** Yol yüzeyi: karşıya geçerken yaya buraya iniyor. */
const ROAD_TOP = 0.02;

const SHIRT_COLORS = ['#3a5a8c', '#b84a3e', '#e8e4d8', '#4f6b45', '#d2a54a', '#6d4a7a', '#2f3338', '#c77d5a', '#8fa3b5', '#a33d5c'];
const SKIN_COLORS = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3b', '#e8b991'];

/** Bir kutuyu tek renge boyar; dizinsiz, UV'siz. */
function paintedBox(w: number, h: number, d: number, x: number, y: number, z: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  const color = new THREE.Color(hex);
  const count = g.attributes['position']!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * Yaya gövdesi: bacak + gövde, önü +x. Gövde beyaz (gömlek rengi örnek
 * renginden), bacak koyu. Baş ayrı ağda, çünkü örnek rengi bütün
 * geometriyi boyuyor: tek ağda kırmızı gömlekli birinin yüzü de kızarırdı.
 */
function bodyGeometry(): THREE.BufferGeometry {
  const merged = mergeGeometries([
    paintedBox(0.026, 0.058, 0.036, 0, 0.029, 0, '#3b3f47'),
    paintedBox(0.034, 0.058, 0.05, 0, 0.087, 0, '#ffffff'),
  ]);
  merged.computeVertexNormals();
  return merged;
}

function headGeometry(): THREE.BufferGeometry {
  const head = new THREE.BoxGeometry(0.03, 0.03, 0.03);
  head.translate(0, 0.133, 0);
  return head;
}

interface Walker {
  axis: 0 | 1;
  /** Kaldırımın sabit koordinatı (sokak ekseni + şerit). */
  line: number;
  position: number;
  direction: 1 | -1;
  speed: number;
  phase: number;
}

/** Bacanın tepesi: duman buradan çıkıyor. */
export interface SmokeEmitter {
  x: number;
  y: number;
  z: number;
  /** Bacanın eni; puf boyu buna göre. */
  size: number;
}

/** Bir bacadan aynı anda yükselen puf. */
const PUFFS_PER_STACK = 6;
/** Aynı anda tütebilecek en fazla baca. */
const MAX_STACKS = 48;
/** Bir pufun doğup dağılması (sn). */
const PUFF_LIFE = 3.4;
/** Pufun dağılana kadar yükseldiği yükseklik. */
const PUFF_RISE = 1.1;
/**
 * Yaya ölçeği. İlk denemede gerçek orana göre (araba boyunun biraz
 * üstü) kurulmuştu ve sokak görünümünde bile bir iki piksellik noktaya
 * iniyordu; biraz abartılı boy, yürüyenin insan olduğunu okutuyor.
 */
const WALKER_SCALE = 1.3;
/** Rüzgâr: duman hep aynı yana yatıyor, şehir tek bir hava altında. */
const WIND = new THREE.Vector2(0.34, -0.14);
/**
 * Tek seferlik toz (Tur 63): inşaatın başladığı, projenin açıldığı, bir
 * yapının yıkıldığı an. Bacanın pufuyla aynı örnek dizisinde (aynı
 * program), yerde halka gibi açılıp sönüyor.
 */
const DUST_PUFFS = 9;
const MAX_DUST = 14;
const DUST_LIFE = 1.5;

interface Dust {
  x: number;
  z: number;
  size: number;
  start: number;
}

export class StreetLife {
  readonly group = new THREE.Group();

  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private walkers: Walker[] = [];
  private smoke: THREE.InstancedMesh;
  private emitters: Record<'fabric' | 'buildings', SmokeEmitter[]> = { fabric: [], buildings: [] };
  private dummy = new THREE.Object3D();
  private scratch = new THREE.Color();
  private young = new THREE.Color('#8f918f');
  private old = new THREE.Color('#e9e9e5');
  private dustNew = new THREE.Color('#b9ab92');
  private dustOld = new THREE.Color('#e4dccd');
  private dust: Dust[] = [];
  private clock = 0;
  private budget = 1;
  private night = 0;
  private lens = false;
  private drawnWalkers = 0;

  constructor(
    private width: number,
    private height: number,
    private blockSize: number,
    walkerCount: number,
  ) {
    const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), personMaterial, walkerCount);
    this.heads = new THREE.InstancedMesh(headGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.75 }), walkerCount);

    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.smoke = new THREE.InstancedMesh(
      puff,
      // Işıklı ve yarı saydam: duman gün ışığıyla aynı tonda kalsın, gece
      // kararsın. Derinlik yazmıyor ki puflar birbirini kesip delik açmasın.
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, opacity: 0.78, depthWrite: false }),
      MAX_STACKS * PUFFS_PER_STACK + MAX_DUST * DUST_PUFFS,
    );

    for (const mesh of [this.bodies, this.heads, this.smoke]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    this.smoke.setColorAt(0, this.young);
    this.group.add(this.bodies, this.heads, this.smoke);

    const rows: number[] = [];
    for (let y = 0; y < height; y += blockSize) rows.push(y);
    const columns: number[] = [];
    for (let x = 0; x < width; x += blockSize) columns.push(x);

    for (let i = 0; i < walkerCount; i++) {
      const axis: 0 | 1 = i % 2 === 0 ? 0 : 1;
      const lanes = axis === 0 ? rows : columns;
      const span = axis === 0 ? height : width;
      const lane = lanes[Math.floor(i / 2 + i * 0.37) % lanes.length] ?? 0;
      let side = i % 4 < 2 ? 1 : -1;
      // Harita kenarındaki sokakta dışarıdaki kaldırım yok.
      if (lane + side * SIDEWALK_OFFSET < -0.5 || lane + side * SIDEWALK_OFFSET > span - 0.5) side = -side;
      this.walkers.push({
        axis,
        line: lane + side * SIDEWALK_OFFSET,
        position: ((i * 5.7) % (axis === 0 ? width : height)) - 0.5,
        direction: (i * 7) % 3 === 0 ? -1 : 1,
        speed: 0.2 + ((i * 11) % 7) * 0.035,
        phase: (i * 1.7) % (Math.PI * 2),
      });
      this.bodies.setColorAt(i, this.scratch.set(SHIRT_COLORS[(i * 3) % SHIRT_COLORS.length]!));
      this.heads.setColorAt(i, this.scratch.set(SKIN_COLORS[(i * 7) % SKIN_COLORS.length]!));
    }
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    this.applyWalkerCount();
  }

  /** Bacalar: şehir dokusu ve şirket tesisleri ayrı ayrı yazıyor (ayrı anlarda senkronlanıyorlar). */
  setEmitters(group: 'fabric' | 'buildings', emitters: SmokeEmitter[]): void {
    this.emitters[group] = emitters;
  }

  /**
   * Bir toz bulutu (Tur 63): `x, z`de, binanın boyuna göre `size`. Aynı
   * anda en çok `MAX_DUST`; fazlası en eskisini siliyor. Veri lensindeyken
   * toz yok: saat duruyor, lens kapanınca eski bir an oynamasın (Codex #93).
   */
  burst(x: number, z: number, size = 1): void {
    if (this.lens) return;
    if (this.dust.length >= MAX_DUST) this.dust.shift();
    this.dust.push({ x, z, size, start: this.clock });
  }

  /** Süren toz bulutlarını kaldırır (azaltılmış harekete geçilince). */
  clearDust(): void {
    this.dust.length = 0;
  }

  /** Kalite kademesi: yayalar ve tüten bacalar aynı oranda seyreliyor. */
  setBudget(ratio: number): void {
    this.budget = Math.max(0, Math.min(1, ratio));
    this.applyWalkerCount();
  }

  /** Gün ışığı 0..1: gece sokak boşalıyor, yayaların üçte biri kalıyor. */
  setDaylight(daylight: number): void {
    const night = Math.max(0, Math.min(1, (0.55 - daylight) / 0.35));
    if (Math.abs(night - this.night) < 0.02) return;
    this.night = night;
    this.applyWalkerCount();
  }

  /**
   * Veri lensinde manzara susuyor: yaya da duman da. Süren toz bitiyor:
   * lensteyken saat ilerlemiyor, yoksa lens kapanınca dakikalar önceki
   * inşaatın tozu yeniden kalkıyordu (Codex #93).
   */
  setDataLens(active: boolean): void {
    if (active) this.dust.length = 0;
    this.lens = active;
    this.group.visible = !active;
  }

  private applyWalkerCount(): void {
    const drawn = Math.round(this.walkers.length * this.budget * (1 - this.night * 0.65));
    this.drawnWalkers = drawn;
    this.bodies.count = drawn;
    this.heads.count = drawn;
  }

  update(dt: number): void {
    if (this.lens) return;
    this.clock += dt;
    this.updateWalkers(dt);
    this.updateSmoke();
  }

  private updateWalkers(dt: number): void {
    const bs = this.blockSize;
    for (let i = 0; i < this.drawnWalkers; i++) {
      const walker = this.walkers[i]!;
      const span = walker.axis === 0 ? this.width : this.height;
      walker.position += walker.speed * walker.direction * dt;
      if (walker.position > span - 0.5) walker.position = -0.5;
      else if (walker.position < -0.5) walker.position = span - 0.5;
      walker.phase += dt * walker.speed * 38;

      // Karşı sokağı geçerken yol kotuna iniyor; parselin üstünde kaldırımda.
      const cross = Math.abs(walker.position - Math.round(walker.position / bs) * bs) < 0.5;
      const y = (cross ? ROAD_TOP : PARCEL_TOP) + Math.abs(Math.sin(walker.phase)) * 0.008;
      if (walker.axis === 0) {
        this.dummy.position.set(walker.position, y, walker.line);
        this.dummy.rotation.set(0, walker.direction === 1 ? 0 : Math.PI, 0);
      } else {
        this.dummy.position.set(walker.line, y, walker.position);
        this.dummy.rotation.set(0, walker.direction === 1 ? -Math.PI / 2 : Math.PI / 2, 0);
      }
      this.dummy.scale.setScalar(WALKER_SCALE);
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);
      this.heads.setMatrixAt(i, this.dummy.matrix);
    }
    uploadDrawn(this.bodies.instanceMatrix, this.drawnWalkers);
    uploadDrawn(this.heads.instanceMatrix, this.drawnWalkers);
  }

  private updateSmoke(): void {
    const all = [...this.emitters.buildings, ...this.emitters.fabric];
    const stacks = Math.min(all.length, Math.round(MAX_STACKS * Math.max(0.3, this.budget)));
    let index = 0;
    for (let s = 0; s < stacks; s++) {
      const stack = all[s]!;
      const size = Math.max(0.7, Math.min(1.35, stack.size / 0.12));
      // Bacalar aynı ritimde tütmesin: her birinin evresi konumundan.
      const offset = ((stack.x * 0.37 + stack.z * 0.61) % 1 + 1) % 1;
      for (let p = 0; p < PUFFS_PER_STACK; p++) {
        const age = ((this.clock / PUFF_LIFE + offset + p / PUFFS_PER_STACK) % 1 + 1) % 1;
        // Puf bacadan küçük çıkıyor, yükseldikçe şişip dağılıyor. İlk
        // denemede en büyüğü 0,15 idi ve duman yerine havada asılı beyaz
        // çakıl gibi okunuyordu; şimdi komşu puflar birbirine değiyor.
        const grow = Math.min(1, age / 0.12);
        const fade = age > 0.72 ? Math.max(0, (1 - age) / 0.28) : 1;
        const scale = (0.06 + age * 0.2) * size * grow * fade;
        const sway = Math.sin(age * 7 + offset * 6.28) * 0.025;
        this.dummy.position.set(
          stack.x + WIND.x * age + sway,
          stack.y + 0.03 + PUFF_RISE * age * (0.85 + size * 0.15),
          stack.z + WIND.y * age - sway * 0.5,
        );
        this.dummy.rotation.set(age * 2.1, offset * 6.28 + age, 0);
        this.dummy.scale.setScalar(Math.max(0.0001, scale));
        this.dummy.updateMatrix();
        this.smoke.setMatrixAt(index, this.dummy.matrix);
        this.smoke.setColorAt(index, this.scratch.copy(this.young).lerp(this.old, Math.min(1, age * 1.4)));
        index++;
      }
    }
    index = this.placeDust(index);
    this.smoke.count = index;
    uploadDrawn(this.smoke.instanceMatrix, index);
    if (this.smoke.instanceColor) uploadDrawn(this.smoke.instanceColor, index);
  }

  /** Toz bulutları: yerde dışa açılan, biraz yükselip dağılan puflar. */
  private placeDust(start: number): number {
    let index = start;
    this.dust = this.dust.filter((dust) => this.clock - dust.start < DUST_LIFE);
    for (const dust of this.dust) {
      const age = (this.clock - dust.start) / DUST_LIFE;
      const grow = Math.min(1, age / 0.1);
      const fade = age > 0.55 ? Math.max(0, (1 - age) / 0.45) : 1;
      const spread = 1 - (1 - age) * (1 - age);
      for (let p = 0; p < DUST_PUFFS; p++) {
        const angle = (p / DUST_PUFFS) * Math.PI * 2 + dust.x * 0.7 + dust.z * 0.3;
        const radius = (0.28 + spread * 0.5) * dust.size;
        this.dummy.position.set(
          dust.x + Math.cos(angle) * radius + WIND.x * age * 0.4,
          0.1 + spread * 0.22 * dust.size,
          dust.z + Math.sin(angle) * radius + WIND.y * age * 0.4,
        );
        this.dummy.rotation.set(age * 1.7, angle, 0);
        this.dummy.scale.setScalar(Math.max(0.0001, (0.06 + spread * 0.12) * dust.size * grow * fade));
        this.dummy.updateMatrix();
        this.smoke.setMatrixAt(index, this.dummy.matrix);
        this.smoke.setColorAt(index, this.scratch.copy(this.dustNew).lerp(this.dustOld, age));
        index++;
      }
    }
    return index;
  }

  /**
   * Testler için: çizilen yaya, tüten baca (toplam ve yalnızca üretim
   * yapan şirket tesisleri), puf ve süren toz bulutu sayısı.
   */
  get stats(): { walkers: number; stacks: number; producing: number; puffs: number; dust: number; visible: boolean } {
    return {
      walkers: this.bodies.count,
      stacks: this.emitters.buildings.length + this.emitters.fabric.length,
      producing: this.emitters.buildings.length,
      puffs: this.smoke.count,
      dust: this.dust.length,
      visible: this.group.visible,
    };
  }

  dispose(): void {
    for (const mesh of [this.bodies, this.heads, this.smoke]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
