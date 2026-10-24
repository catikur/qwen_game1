import * as THREE from 'three';

/**
 * Önemli anlar (Tur 63): şehrin kendi başına anlattığı kısa sahneler.
 *
 * Simülasyon binayı kurduğu, rakibi yuttuğu, zaferi ilan ettiği gün yalnız
 * sayıları değiştiriyordu; şehirde bir kutu beliriyor, çatıların rengi bir
 * karede dönüyor, zafer ekranı boş bir şehrin üstüne açılıyordu. Bu modül
 * o anların görünümünü veriyor:
 *
 *   - halka: yerde genişleyip sönen ince bir çember (inşaat bitince,
 *     proje açılınca, devralınan her binada);
 *   - havai fişek: zafer gecesi kameranın baktığı yerin üstünde;
 *   - zamanlama: devralmada renk dalgasının binaya varma anı, havai
 *     fişeğin takvimi.
 *
 * Toz (inşaat, açılış, yıkım) sokak hayatının duman pufları (`street.ts`).
 *
 * Programlar: halka seçim işaretiyle, havai fişek kar noktalarıyla aynı
 * malzeme ayarında; yeni gölgelendirici programı yok. Hepsi görünüm:
 * simülasyon bunları okumuyor, azaltılmış harekette hiçbiri çizilmiyor.
 */

export const MOMENT = {
  /** Halkanın genişleyip sönmesi (sn). */
  ringLife: 1.15,
  /** Devralmada çatının eski renkten yenisine dönmesi (sn). */
  shiftSeconds: 0.9,
  /** Dalga: devralanın merkezinden birim uzaklık başına gecikme (sn). */
  wavePerUnit: 0.05,
  /** Dalganın en uzak binaya varması en fazla bu kadar sürüyor (sn). */
  waveMax: 1.6,
  /** Zafer gecesi havai fişekleri (sn). */
  fireworkSeconds: 6.5,
  fireworkBursts: 9,
} as const;

/** Yumuşak giriş-çıkış. */
export function smooth(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

/** Devralmada renk dalgasının binaya varma gecikmesi (sn): merkezden uzaklaştıkça geç. */
export function waveDelay(distance: number): number {
  return Math.min(MOMENT.waveMax, Math.max(0, distance) * MOMENT.wavePerUnit);
}

/** Kutlanacak durumun okunan kısmı: zafer ve senaryonun sonucu. */
export interface CelebrationSource {
  time: { day: number };
  victory?: { day: number; dismissed?: boolean };
  scenario?: { outcome?: 'won' | 'lost'; finishedDay?: number };
}

/**
 * Kutlanmış anların kaydı (Tur 63): zafer gecesi bir kez.
 *
 * Her zafer (ve kazanılan senaryo) bir kimlikle yazılıyor; kimlik bir kez
 * görülünce bir daha kutlanmıyor. Aynı gün senaryo da zafer de gelirse tek
 * kutlama; zafer kapatılınca senaryonun kimliği "yeni" sanılmıyor (Codex
 * #93). İlk senkronda görülenler (kayıttaki zafer) kutlanmadan yazılıyor.
 */
export class CelebrationLog {
  private seen: Set<string> | null = null;

  /**
   * Durumu kaydeder; yeni bir kutlama varsa (ilk senkron değilse) true.
   * Kapatılmış zafer kutlanmıyor ama kaydediliyor.
   */
  note(state: CelebrationSource): boolean {
    const entries: Array<[key: string, celebrate: boolean]> = [];
    if (state.victory) entries.push([`victory:${state.victory.day}`, !state.victory.dismissed]);
    if (state.scenario?.outcome === 'won') entries.push([`scenario:${state.scenario.finishedDay ?? state.time.day}`, true]);
    if (this.seen === null) {
      this.seen = new Set(entries.map(([key]) => key));
      return false;
    }
    let fresh = false;
    for (const [key, celebrate] of entries) {
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (celebrate) fresh = true;
    }
    return fresh;
  }

  /** Başka bir durum geldi (kayıt açıldı): bir sonraki not ilk senkron. */
  reset(): void {
    this.seen = null;
  }
}

/** Patlamanın kameranın önünde en az kalacağı uzaklık: kıvılcımlar açıldığında da önünde. */
const AIM_DEPTH = 4;
const AIM_POINT = new THREE.Vector3();

/**
 * Havai fişeğin yüksekliği (Tur 63): (x, z) üstündeki patlama ekranda `goal`
 * (NDC y) yüksekliğine gelsin; varamıyorsa kameranın önünde varabildiği en
 * yüksek yer. Noktanın kameraya derinliği yükseklikle doğrusal değişiyor:
 * önce noktanın kameranın en az `AIM_DEPTH` önünde kaldığı en yüksek yer
 * bulunuyor, arama o dilimde (orada ekrandaki y yükseklikle tekdüze). Sabit
 * 0,5..80 araması en yakın zoomda kameranın arkasına geçiyordu: iz düşüm
 * ters dönüyor, patlama kameranın arkasında kalıyordu (Codex #93).
 */
export function aimHeight(camera: THREE.Camera, x: number, z: number, goal: number): number {
  const depthAt = (y: number): number => -AIM_POINT.set(x, y, z).applyMatrix4(camera.matrixWorldInverse).z;
  let low = 0.5;
  let high = 80;
  const ground = depthAt(0);
  const slope = depthAt(1) - ground;
  if (slope < 0) high = Math.min(high, (AIM_DEPTH - ground) / slope);
  else if (slope > 0) low = Math.max(low, (AIM_DEPTH - ground) / slope);
  if (high <= low) return Math.max(0, high);
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    AIM_POINT.set(x, mid, z).project(camera);
    if (AIM_POINT.y > goal) high = mid;
    else low = mid;
  }
  return low;
}

const RING_POOL = 24;

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Halkanın başlayacağı an (sn, `clock`), bitene dek dolu. */
  start: number;
  active: boolean;
  size: number;
}

/**
 * Yerde genişleyip sönen halkalar. Havuz sabit: aynı anda en çok
 * `RING_POOL` halka; dolunca en eskisi yeniden kullanılıyor (büyük bir
 * devralmada dalganın sonu ilk halkaları siliyor, sahne şişmiyor).
 */
export class RingPulses {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];
  private clock = 0;
  private next = 0;

  constructor() {
    const geometry = new THREE.RingGeometry(0.42, 0.52, 32);
    for (let i = 0; i < RING_POOL; i++) {
      // Seçim işaretiyle aynı ayar: program paylaşılıyor.
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.rings.push({ mesh, material, start: 0, active: false, size: 1 });
    }
  }

  /** Bir halka: `delay` sn sonra `x, z`de, `color` renginde. */
  pulse(x: number, z: number, color: THREE.ColorRepresentation, delay = 0, size = 1): void {
    const ring = this.rings[this.next]!;
    this.next = (this.next + 1) % RING_POOL;
    ring.mesh.position.set(x, 0.11, z);
    ring.material.color.set(color);
    ring.start = this.clock + Math.max(0, delay);
    ring.size = size;
    ring.active = true;
    ring.mesh.visible = false;
  }

  update(dt: number): void {
    this.clock += Math.min(dt, 0.1);
    for (const ring of this.rings) {
      if (!ring.active) continue;
      const age = (this.clock - ring.start) / MOMENT.ringLife;
      if (age < 0) {
        ring.mesh.visible = false;
        continue;
      }
      if (age >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      // Hızlı açılıyor, yavaş sönüyor: çember yere çarpan bir dalga gibi.
      const spread = 1 - (1 - age) * (1 - age);
      ring.mesh.scale.setScalar(ring.size * (0.7 + spread * 1.5));
      ring.material.opacity = 0.85 * (1 - age);
      ring.mesh.visible = true;
    }
  }

  /** Hepsini söndür (veri lensi, azaltılmış hareket). */
  clear(): void {
    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
  }

  /** Testler için: süren (bekleyen dahil) halka sayısı. */
  stats(): { rings: number; visible: number } {
    let rings = 0;
    let visible = 0;
    for (const ring of this.rings) {
      if (ring.active) rings++;
      if (ring.mesh.visible) visible++;
    }
    return { rings, visible };
  }

  dispose(): void {
    this.rings[0]?.mesh.geometry.dispose();
    for (const ring of this.rings) ring.material.dispose();
  }
}

/** Havai fişeğin bir patlaması: takvimden. */
export interface FireworkBurst {
  /** Başlangıçtan sonra fırlatıldığı an (sn). */
  at: number;
  /** Merkeze göre konum, kutunun yarı kenarı cinsinden (-1..1). */
  dx: number;
  dz: number;
  /** Patladığı yükseklik. */
  height: number;
  /** Renk sırası (`FIREWORK_COLORS`). */
  color: number;
}

/** Zaferin renkleri; ilki oyuncunun rengiyle değiştiriliyor. */
export const FIREWORK_COLORS = ['#ffd166', '#ffffff', '#7ee0a4', '#ff8fa3', '#8fd3ff'];

/**
 * Havai fişeğin takvimi: tohumlu, her zaferde aynı ritim. Patlamalar
 * `fireworkSeconds`ın ilk dörtte üçüne yayılıyor; son patlama da sönecek
 * vakit buluyor. İkişer ikişer geliyor, arada nefes.
 */
export function fireworkSchedule(seed: number, count: number = MOMENT.fireworkBursts): FireworkBurst[] {
  let s = (seed >>> 0) || 1;
  const random = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
  const span = MOMENT.fireworkSeconds * 0.72;
  const bursts: FireworkBurst[] = [];
  for (let i = 0; i < count; i++) {
    const pair = Math.floor(i / 2);
    const pairs = Math.ceil(count / 2);
    bursts.push({
      at: (pair / Math.max(1, pairs - 1)) * span + (i % 2) * 0.28 + random() * 0.12,
      dx: random() * 2 - 1,
      dz: random() * 2 - 1,
      height: 5 + random() * 3.5,
      color: i % FIREWORK_COLORS.length,
    });
  }
  return bursts;
}

const PARTICLES = 140;
const ROCKET_SECONDS = 0.6;
const SPARK_SECONDS = 1.7;
const GRAVITY = 2.4;
const POOL = 6;

interface Shell {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  positions: Float32Array;
  burst: FireworkBurst | null;
  /** Fırlatma noktası (dünya). */
  x: number;
  z: number;
  launched: number;
  /** Patlama yüksekliği (dünya). */
  height: number;
  /** Kameranın uzaklığına göre boy: uzaktan bakınca da patlama görünsün. */
  scale: number;
}

/**
 * Patlamanın dünyadaki yeri. Sahne bunu kameradan veriyor: patlama ekranın
 * üst yarısına düşsün, kameranın arkasına ya da ekranın üstüne değil.
 */
export type FireworkAim = (burst: FireworkBurst, out: { x: number; y: number; z: number }) => void;

/**
 * Zafer gecesinin havai fişekleri.
 *
 * Her patlama bir `Points` (140 kıvılcım), havuzda altı tane; renk
 * malzemenin rengi. Kar noktalarıyla aynı malzeme ayarı (boy kameraya
 * göre, saydam, derinlik yazmıyor): program paylaşılıyor, ilk zaferde
 * derleme takılması yok. Kıvılcımın yolu kapalı biçimde hesaplanıyor
 * (fırlatmadan beri geçen süreden), karede biriken hata yok.
 */
export class Fireworks {
  readonly group = new THREE.Group();
  private shells: Shell[] = [];
  private directions = new Float32Array(PARTICLES * 3);
  private schedule: FireworkBurst[] = [];
  private fired = 0;
  private elapsed = 0;
  private running = false;
  private extent = 12;
  private center = { x: 0, z: 0 };
  private scale = 1;
  private aimed = { x: 0, y: 0, z: 0 };
  /** Patlamanın yerini seçen (sahne); yoksa merkezin çevresinde, takvimin yüksekliğinde. */
  aim: FireworkAim | null = null;
  private accent = new THREE.Color(FIREWORK_COLORS[0]);

  constructor() {
    // Küre üstüne eşit dağılmış yönler (Fibonacci), her kıvılcımın kendi hızıyla.
    for (let i = 0; i < PARTICLES; i++) {
      const y = 1 - ((i + 0.5) / PARTICLES) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.399963;
      const speed = 2.1 + ((i * 7) % 5) * 0.16;
      this.directions[i * 3] = Math.cos(a) * r * speed;
      this.directions[i * 3 + 1] = y * speed;
      this.directions[i * 3 + 2] = Math.sin(a) * r * speed;
    }
    for (let i = 0; i < POOL; i++) {
      const positions = new Float32Array(PARTICLES * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      const material = new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.visible = false;
      points.renderOrder = 3;
      this.group.add(points);
      this.shells.push({ points, material, positions, burst: null, x: 0, z: 0, launched: 0, height: 0, scale: 1 });
    }
  }

  /** Zafer: `seed` takvimi seçiyor, `accent` ilk rengin yerini alıyor (oyuncunun rengi). */
  start(seed: number, accent: THREE.ColorRepresentation): void {
    this.schedule = fireworkSchedule(seed);
    this.fired = 0;
    this.elapsed = 0;
    this.running = true;
    this.accent.set(accent);
    for (const shell of this.shells) {
      shell.burst = null;
      shell.points.visible = false;
    }
  }

  stop(): void {
    this.running = false;
    for (const shell of this.shells) {
      shell.burst = null;
      shell.points.visible = false;
    }
  }

  get active(): boolean {
    return this.running;
  }

  /**
   * Bir kare: patlamalar kameranın baktığı yerin çevresinde (`extent` yarı
   * kenar); `scale` patlamanın boyu (kamera uzaklaştıkça büyüyor, yoksa
   * şehri uzaktan seyreden oyuncu bir iki benek görüyordu).
   */
  update(dt: number, center: { x: number; z: number }, extent: number, scale = 1): void {
    if (!this.running) return;
    this.center = center;
    this.extent = extent;
    this.scale = scale;
    this.elapsed += Math.min(dt, 0.1);
    while (this.fired < this.schedule.length && this.schedule[this.fired]!.at <= this.elapsed) {
      this.launch(this.schedule[this.fired]!);
      this.fired++;
    }
    let live = 0;
    for (const shell of this.shells) {
      if (!shell.burst) continue;
      const age = this.elapsed - shell.launched;
      if (age >= ROCKET_SECONDS + SPARK_SECONDS) {
        shell.burst = null;
        shell.points.visible = false;
        continue;
      }
      live++;
      this.place(shell, age);
    }
    if (live === 0 && this.fired >= this.schedule.length) this.running = false;
  }

  private launch(burst: FireworkBurst): void {
    // Boş kabuk yoksa en eskisi: takvim havuzdan büyük olsa da sahne şişmiyor.
    let shell = this.shells.find((candidate) => !candidate.burst);
    if (!shell) shell = this.shells.reduce((oldest, candidate) => (candidate.launched < oldest.launched ? candidate : oldest));
    shell.burst = burst;
    shell.launched = this.elapsed;
    shell.scale = this.scale;
    if (this.aim) {
      this.aim(burst, this.aimed);
      shell.x = this.aimed.x;
      shell.z = this.aimed.z;
      shell.height = this.aimed.y;
    } else {
      shell.x = this.center.x + burst.dx * this.extent * 0.55;
      shell.z = this.center.z + burst.dz * this.extent * 0.55;
      shell.height = burst.height * this.scale;
    }
    shell.material.color.set(burst.color === 0 ? this.accent : FIREWORK_COLORS[burst.color]!);
    shell.points.visible = true;
  }

  private place(shell: Shell, age: number): void {
    const p = shell.positions;
    const scale = shell.scale;
    const height = shell.height;
    if (age < ROCKET_SECONDS) {
      // Fırlatma: kıvılcımlar tek bir izde, yerden patlama yüksekliğine.
      const k = age / ROCKET_SECONDS;
      const top = height * (1 - (1 - k) * (1 - k));
      for (let i = 0; i < PARTICLES; i++) {
        const trail = (i % 12) / 12;
        p[i * 3] = shell.x;
        p[i * 3 + 1] = Math.max(0, top - trail * 0.9 * scale);
        p[i * 3 + 2] = shell.z;
      }
      shell.material.opacity = 0.9;
      shell.material.size = 0.16 * scale;
    } else {
      // Patlama: yönüne fırlıyor, havada yavaşlıyor, yerçekimiyle düşüyor.
      const t = age - ROCKET_SECONDS;
      const drag = ((1 - Math.exp(-2.2 * t)) / 2.2) * scale;
      const fall = 0.5 * GRAVITY * scale * t * t;
      for (let i = 0; i < PARTICLES; i++) {
        p[i * 3] = shell.x + this.directions[i * 3]! * drag;
        p[i * 3 + 1] = Math.max(0.05, height + this.directions[i * 3 + 1]! * drag - fall);
        p[i * 3 + 2] = shell.z + this.directions[i * 3 + 2]! * drag;
      }
      const fade = t / SPARK_SECONDS;
      shell.material.opacity = Math.max(0, 1 - fade * fade);
      shell.material.size = 0.3 * scale * (1 - fade * 0.4);
    }
    const attribute = shell.points.geometry.attributes['position'] as THREE.BufferAttribute;
    attribute.needsUpdate = true;
  }

  /** Testler için: havadaki patlamaların merkezi (dünya). */
  centers(): Array<{ x: number; y: number; z: number }> {
    return this.shells.filter((shell) => shell.points.visible).map((shell) => ({ x: shell.x, y: shell.height, z: shell.z }));
  }

  /** Testler için: kaç patlama havada, kaç kıvılcım çiziliyor, takvimin ne kadarı atıldı. */
  stats(): { active: boolean; shells: number; sparks: number; fired: number; scheduled: number; height: number } {
    let shells = 0;
    let height = 0;
    for (const shell of this.shells) {
      if (!shell.points.visible) continue;
      shells++;
      for (let i = 0; i < PARTICLES; i++) height += shell.positions[i * 3 + 1]!;
    }
    return { active: this.running, shells, sparks: shells * PARTICLES, fired: this.fired, scheduled: this.schedule.length, height };
  }

  dispose(): void {
    for (const shell of this.shells) {
      shell.points.geometry.dispose();
      shell.material.dispose();
    }
  }
}
