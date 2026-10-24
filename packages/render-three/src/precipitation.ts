import * as THREE from 'three';

/**
 * Yağmur ve kar (Tur 62).
 *
 * Kameranın baktığı noktanın çevresinde, kamera uzaklığıyla büyüyen bir
 * kutuda düşen parçacıklar. Kutunun dışına çıkan tane karşı kenardan geri
 * giriyor: kamera kaydıkça yağış onunla birlikte geliyor, şehrin
 * tamamına yağdırmanın maliyeti yok.
 *
 * İki çizim, iki sabit dizi:
 *   - yağmur kısa, hafif eğik çizgiler (`LineSegments`): çizgi
 *     malzemesinin programı sahnede zaten var (tedarik rotaları);
 *   - kar noktalar (`Points`): tek yeni program.
 * Konumlar işlemcide güncelleniyor; en üst kademede bile birkaç bin sayı.
 * Bütçe kademeyle kısılıyor (`setBudget`), azaltılmış harekette ve veri
 * lensinde yağış hiç çizilmiyor.
 */

export const MAX_RAIN = 1600;
export const MAX_SNOW = 1800;
const HEIGHT = 16;
const RAIN_SPEED = 14;
const RAIN_STREAK = 0.55;
const SNOW_SPEED = 1.1;

export class Precipitation {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private rainPositions: Float32Array;
  private snowPositions: Float32Array;
  /** Tanelerin kutu içindeki konumu (x, y, z), merkezden bağımsız. */
  private rainDrops: Float32Array;
  private snowFlakes: Float32Array;
  private rainMaterial: THREE.LineBasicMaterial;
  private snowMaterial: THREE.PointsMaterial;
  private budget = 1;
  private time = 0;
  private rainCount = 0;
  private snowCount = 0;

  constructor() {
    this.rainDrops = scatter(MAX_RAIN, 1);
    this.snowFlakes = scatter(MAX_SNOW, 2);
    this.rainPositions = new Float32Array(MAX_RAIN * 6);
    this.snowPositions = new Float32Array(MAX_SNOW * 3);

    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    rainGeometry.setDrawRange(0, 0);
    this.rainMaterial = new THREE.LineBasicMaterial({ color: '#b9c9d9', transparent: true, opacity: 0.5, depthWrite: false });
    this.rain = new THREE.LineSegments(rainGeometry, this.rainMaterial);

    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    snowGeometry.setDrawRange(0, 0);
    this.snowMaterial = new THREE.PointsMaterial({ color: '#ffffff', size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
    this.snow = new THREE.Points(snowGeometry, this.snowMaterial);

    for (const object of [this.rain, this.snow]) {
      // Kutu kamerayla geziyor; sınır küresi hesaplanmadan kırpılmasın.
      object.frustumCulled = false;
      object.renderOrder = 2;
      this.group.add(object);
    }
  }

  /** Kalite kademesinin payı (0..1). */
  setBudget(fraction: number): void {
    this.budget = Math.max(0, Math.min(1, fraction));
  }

  /**
   * Bir kare: `rain` ve `snowfall` havanın payı (0..1), `extent` kutunun
   * yarı kenarı. `enabled` kapalıysa (azaltılmış hareket, ayar, veri
   * lensi) hiçbir şey çizilmiyor.
   */
  update(dt: number, center: { x: number; z: number }, extent: number, rain: number, snowfall: number, daylight: number, enabled: boolean): void {
    this.rainCount = enabled ? Math.round(MAX_RAIN * Math.max(0, Math.min(1, rain)) * this.budget) : 0;
    this.snowCount = enabled ? Math.round(MAX_SNOW * Math.max(0, Math.min(1, snowfall)) * this.budget) : 0;
    this.rain.visible = this.rainCount > 0;
    this.snow.visible = this.snowCount > 0;
    if (!this.rain.visible && !this.snow.visible) return;
    const step = Math.min(dt, 0.1);
    this.time += step;
    const span = extent * 2;
    // Gece yağmur çizgileri söner; kar ay ışığında da beyaz.
    this.rainMaterial.opacity = 0.22 + daylight * 0.33;
    this.snowMaterial.opacity = 0.65 + daylight * 0.3;

    for (let i = 0; i < this.rainCount; i++) {
      const k = i * 3;
      let y = this.rainDrops[k + 1]! - RAIN_SPEED * step;
      if (y < 0) y += HEIGHT;
      this.rainDrops[k + 1] = y;
      const x = center.x + wrap(this.rainDrops[k]! - center.x, span);
      const z = center.z + wrap(this.rainDrops[k + 2]! - center.z, span);
      const p = i * 6;
      this.rainPositions[p] = x;
      this.rainPositions[p + 1] = y;
      this.rainPositions[p + 2] = z;
      // Rüzgâr hafifçe eğiyor: çizginin üst ucu biraz geride.
      this.rainPositions[p + 3] = x - 0.12;
      this.rainPositions[p + 4] = y + RAIN_STREAK;
      this.rainPositions[p + 5] = z - 0.05;
    }
    for (let i = 0; i < this.snowCount; i++) {
      const k = i * 3;
      let y = this.snowFlakes[k + 1]! - SNOW_SPEED * step;
      if (y < 0) y += HEIGHT;
      this.snowFlakes[k + 1] = y;
      // Kar savrularak iniyor: tanenin kendi evresiyle küçük bir salınım.
      const sway = Math.sin(this.time * 1.3 + i * 0.37) * 0.35;
      this.snowPositions[k] = center.x + wrap(this.snowFlakes[k]! + sway - center.x, span);
      this.snowPositions[k + 1] = y;
      this.snowPositions[k + 2] = center.z + wrap(this.snowFlakes[k + 2]! - center.z + Math.cos(this.time * 0.9 + i) * 0.2, span);
    }
    flush(this.rain.geometry, this.rainCount * 2, this.rainCount * 6);
    flush(this.snow.geometry, this.snowCount, this.snowCount * 3);
  }

  /** Testler için: çizilen yağmur damlası ve kar tanesi sayısı. */
  stats(): { rain: number; snow: number } {
    return { rain: this.rain.visible ? this.rainCount : 0, snow: this.snow.visible ? this.snowCount : 0 };
  }

  /** Testler için: tanelerin yüksekliklerinin toplamı (düştüklerini ölçmek için). */
  heightSum(): number {
    let sum = 0;
    for (let i = 0; i < this.rainCount; i++) sum += this.rainDrops[i * 3 + 1]!;
    for (let i = 0; i < this.snowCount; i++) sum += this.snowFlakes[i * 3 + 1]!;
    return sum;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    this.snow.geometry.dispose();
    this.rainMaterial.dispose();
    this.snowMaterial.dispose();
  }
}

/** Kutunun içine dağılmış başlangıç konumları; tohumlu, her açılışta aynı. */
function scatter(count: number, salt: number): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    out[i * 3] = noise(i * 3.1 + salt) * 200;
    out[i * 3 + 1] = noise(i * 7.3 + salt * 1.7) * HEIGHT;
    out[i * 3 + 2] = noise(i * 11.9 + salt * 2.3) * 200;
  }
  return out;
}

function noise(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** `value`ı [-span/2, span/2) aralığına sarar. */
function wrap(value: number, span: number): number {
  const half = span / 2;
  return ((((value + half) % span) + span) % span) - half;
}

function flush(geometry: THREE.BufferGeometry, vertices: number, floats: number): void {
  geometry.setDrawRange(0, vertices);
  const attribute = geometry.attributes['position'] as THREE.BufferAttribute;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, floats);
  attribute.needsUpdate = true;
}
