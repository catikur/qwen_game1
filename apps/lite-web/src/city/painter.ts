/**
 * İzometrik şehir çizeri (iOS `IsoPainter` ile bire bir): gökyüzünde süzülen
 * bir ada. 7×7 karelik ızgara, ortada iki yol. Her zincirin üç kademesi bir
 * sıra parsel (ham → işleme → satış); işleme tesisinin bacası tütüyor,
 * yollarda araçlar akıyor. Gündüz bulutlar, gece yıldızlar, ay, yanan
 * pencereler, sokak lambaları ve farlar. Hiçbir görsel dosya yok.
 *
 * L7: bina kademeleri (dükkân → orta kat → kule → simge yapı), köprüyle bağlı
 * uydu adalar ve şehir teması (sahil, dağ, çöl, kar).
 *
 * Bütün ölçüler CSS pikseli (iOS'ta nokta); tuvalin devicePixelRatio ölçeği
 * çağıranda.
 */
import {
  buildingTier,
  chainUnlocked,
  districtUnlocked,
  islandUnlocked,
  type ChainId,
  type LiteState,
  type Stage,
} from '@capital/lite-model';
import { css, mix, shade, type Rgb } from '../theme';
import { CityLayout, IslandLayout, islandChain } from './layout';
import { cssRgba, type CityPalette } from './palette';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Bina biçimi kademeye göre (L7): yükseklik, kenar payı, pencere sırası. */
export interface Massing {
  height: number;
  margin: number;
  rows: number;
}

type Ctx = CanvasRenderingContext2D;
type Shading = string | CanvasGradient;

interface Item {
  depth: number;
  draw: (ctx: Ctx) => void;
}

interface Car {
  c: number;
  r: number;
  horizontal: boolean;
  forward: boolean;
  color: Rgb;
}

interface StrokeStyle {
  width: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  dash?: number[];
}

const TAU = Math.PI * 2;
const STAGES: readonly Stage[] = [0, 1, 2];
const GOLD = 0xffd44f;
const GOLD_SIDE = 0xe0a825;
const WHITE = 0xffffff;

// ------------------------------------------------------------ yol yardımcıları

/** CGRect içine elips (Swift `Path(ellipseIn:)`). */
function addEllipse(path: Path2D, x: number, y: number, w: number, h: number): void {
  const rx = Math.max(0, w / 2);
  const ry = Math.max(0, h / 2);
  path.moveTo(x + w / 2 + rx, y + h / 2);
  path.ellipse(x + w / 2, y + h / 2, rx, ry, 0, 0, TAU);
}

function ellipse(x: number, y: number, w: number, h: number): Path2D {
  const path = new Path2D();
  addEllipse(path, x, y, w, h);
  return path;
}

function rect(x: number, y: number, w: number, h: number): Path2D {
  const path = new Path2D();
  path.rect(x, y, w, h);
  return path;
}

/** Yuvarlak köşeli dikdörtgen; köşe yarıçapı kısa kenarın yarısıyla sınırlı (SwiftUI gibi). */
function roundedRect(x: number, y: number, w: number, h: number, radius: number): Path2D {
  const path = new Path2D();
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const k = Math.max(0, Math.min(radius, w / 2, h / 2));
  path.moveTo(x + k, y);
  path.lineTo(x + w - k, y);
  path.arcTo(x + w, y, x + w, y + k, k);
  path.lineTo(x + w, y + h - k);
  path.arcTo(x + w, y + h, x + w - k, y + h, k);
  path.lineTo(x + k, y + h);
  path.arcTo(x, y + h, x, y + h - k, k);
  path.lineTo(x, y + k);
  path.arcTo(x, y, x + k, y, k);
  path.closePath();
  return path;
}

/** Kapalı çokgen (Swift `addLines` + `closeSubpath`). */
function addPolygon(path: Path2D, points: readonly Point[], close = true): void {
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  if (close) path.closePath();
}

function polygon(points: readonly Point[], close = true): Path2D {
  const path = new Path2D();
  addPolygon(path, points, close);
  return path;
}

function fill(ctx: Ctx, path: Path2D, style: Shading): void {
  ctx.fillStyle = style;
  ctx.fill(path);
}

function stroke(ctx: Ctx, path: Path2D, style: Shading, { width, cap = 'butt', join = 'miter', dash = [] }: StrokeStyle): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.setLineDash(dash);
  ctx.stroke(path);
  if (dash.length > 0) ctx.setLineDash([]);
}

function linear(ctx: Ctx, from: Point, to: Point, stops: ReadonlyArray<readonly [string, number]>): CanvasGradient {
  const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
  for (const [color, at] of stops) gradient.addColorStop(at, color);
  return gradient;
}

/** İki renkli doğrusal degrade. */
function linear2(ctx: Ctx, from: Point, to: Point, a: string, b: string): CanvasGradient {
  return linear(ctx, from, to, [[a, 0], [b, 1]]);
}

function radial(ctx: Ctx, center: Point, startRadius: number, endRadius: number, a: string, b: string): CanvasGradient {
  const gradient = ctx.createRadialGradient(center.x, center.y, Math.max(0, startRadius), center.x, center.y, Math.max(0, endRadius));
  gradient.addColorStop(0, a);
  gradient.addColorStop(1, b);
  return gradient;
}

/** Swift `truncatingRemainder(dividingBy:)`: JS `%` ile aynı (işaret bölünenin). */
const rem = (value: number, divisor: number) => value % divisor;

// ------------------------------------------------------------ yıldızlar

interface Star {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

const starCache = new Map<number, Star[]>();

/**
 * Gece yıldızları sabit tohumla (iOS'takiyle aynı 64 bit LCG). Konumlar
 * tuval boyutunun kesri; göz kırpma çizerken.
 */
function starField(island: number): Star[] {
  const cached = starCache.get(island);
  if (cached) return cached;
  let seed = BigInt.asUintN(64, 7n + BigInt(island) * 31n);
  const next = (): number => {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1442695040888963407n);
    return Number(seed >> 33n) / 2 ** 31;
  };
  const stars: Star[] = [];
  for (let i = 0; i < 46; i++) {
    const x = next();
    const y = next();
    const r = 0.4 + next() * 0.9;
    const alpha = 0.3 + next() * 0.5;
    stars.push({ x, y, r, alpha });
  }
  starCache.set(island, stars);
  return stars;
}

// ------------------------------------------------------------ çizer

export class IsoPainter {
  readonly size: Size;
  readonly palette: CityPalette;
  /** 0 ana ada; 1–3 köprüyle bağlı adalar. */
  readonly island: number;
  readonly grid: number;
  readonly tileWidth: number;
  readonly origin: Point;

  constructor(size: Size, palette: CityPalette, island: number, state: LiteState) {
    this.size = size;
    this.palette = palette;
    this.island = island;
    this.grid = island === 0 ? CityLayout.size : IslandLayout.size;
    // Binalar uzadıkça kamera geri çekiliyor: kule ve simge yapı kadraja sığsın.
    const tallest = IsoPainter.tallestTier(state, island);
    const zoom = tallest >= 4 ? 0.8 : tallest === 3 ? 0.9 : 1;
    if (island === 0) {
      // 7 kare enine sığsın; altta adanın yanlarına, üstte binalara yer kalsın.
      this.tileWidth = Math.min(size.width / 7.4, size.height / 3.95) * zoom;
      // Yüksek kutuda (tablet yatay) ada dikeyde ortalanıyor; telefonda ilk değer büyük kalıyor.
      const above = 0.55 + (1 - zoom) * 5;
      const centered = (size.height - this.tileWidth * (3.25 + above)) / 2 + this.tileWidth * above;
      this.origin = { x: size.width / 2, y: Math.max(size.height * (0.21 + (1 - zoom) * 0.55), centered) };
    } else {
      this.tileWidth = Math.min(size.width / 4.8, size.height / 2.75) * zoom;
      const above = 0.35 + (1 - zoom) * 5;
      const centered = (size.height - this.tileWidth * (1.85 + above)) / 2 + this.tileWidth * above;
      // Sol üstteki ada haritası arka binanın çatısını örtmesin: ada biraz aşağıda.
      this.origin = { x: size.width / 2, y: Math.max(size.height * (0.3 + (1 - zoom) * 0.6), centered) };
    }
  }

  /** Adadaki en yüksek bina kademesi (tarlalar sayılmıyor). */
  static tallestTier(state: LiteState, island: number): number {
    const own = islandChain(island);
    const chains: readonly ChainId[] = island === 0 ? CityLayout.mainChains : own ? [own] : [];
    let tallest = 0;
    for (const chain of chains) {
      if (!chainUnlocked(state, chain)) continue;
      const levels = state.chains[chain].levels;
      tallest = Math.max(tallest, buildingTier(levels[1]), buildingTier(levels[2]));
    }
    return tallest;
  }

  /** Bina biçimi: kademe içinde de hafif büyüme (bir sonraki eşiğe yaklaştıkça). */
  static shape(stage: Stage, level: number): Massing {
    const tier = buildingTier(level);
    const bounds: [number, number] = tier === 1 ? [1, 25] : tier === 2 ? [25, 50] : tier === 3 ? [50, 100] : [100, 300];
    const progress = Math.min(1, Math.max(0, level - bounds[0]) / (bounds[1] - bounds[0]));
    if (stage === 1) {
      switch (tier) {
        case 1:
          return { height: 0.62 + 0.2 * progress, margin: 0.15, rows: 2 };
        case 2:
          return { height: 0.92 + 0.12 * progress, margin: 0.1, rows: 2 };
        case 3:
          return { height: 1.12 + 0.14 * progress, margin: 0.1, rows: 3 };
        default:
          return { height: 1.32 + 0.14 * progress, margin: 0.08, rows: 3 };
      }
    }
    switch (tier) {
      case 1:
        return { height: 0.55 + 0.25 * progress, margin: 0.15, rows: 2 };
      case 2:
        return { height: 0.98 + 0.17 * progress, margin: 0.15, rows: 4 };
      case 3:
        return { height: 1.35 + 0.25 * progress, margin: 0.2, rows: 5 };
      default:
        return { height: 1.85 + 0.3 * progress, margin: 0.2, rows: 6 };
    }
  }

  get tileHeight(): number {
    return this.tileWidth / 2;
  }

  /** Karenin (c, r) köşesinin ekran konumu; `z` kare birimiyle yükseklik. */
  point(c: number, r: number, z = 0): Point {
    return {
      x: this.origin.x + ((c - r) * this.tileWidth) / 2,
      y: this.origin.y + ((c + r) * this.tileHeight) / 2 - z * this.tileWidth * 0.62,
    };
  }

  /** Ölçek: çizim ayrıntıları (pencere, araç) kare genişliğine göre. */
  private get unit(): number {
    return this.tileWidth / 52;
  }

  /** Bütün sahne. `time` saniye (iOS'ta `timeIntervalSinceReferenceDate`). */
  draw(ctx: Ctx, state: LiteState, time: number): void {
    this.drawSky(ctx, time);
    this.drawBackdrop(ctx);
    if (this.island === 0) this.drawMain(ctx, state, time);
    else this.drawSatellite(ctx, state, time);
    if (this.palette.theme === 'snow') this.drawSnow(ctx, time);
  }

  // ------------------------------------------------------------ ana ada

  private drawMain(ctx: Ctx, state: LiteState, time: number): void {
    // Takımada: arka kenardan bir sonraki adaya köprü (sayfa kenarında bulutlara karışıyor).
    if (islandUnlocked(state, 1)) this.drawBridge(ctx, 3, 0, -6, -4.2);
    this.drawIsland(ctx);
    this.drawGround(ctx, state);

    const items: Item[] = [];
    for (const chain of CityLayout.mainChains) {
      const unlocked = chainUnlocked(state, chain);
      const levels = state.chains[chain].levels;
      CityLayout.tiles(chain).forEach((tile, index) => {
        const stage = STAGES[index]!;
        const level = levels[stage];
        const [c, r] = tile;
        items.push({ depth: c + r, draw: (g) => this.drawBuilding(g, chain, stage, level, unlocked, c, r, time) });
      });
    }
    // Ağaçlar: boş parsellerin yarısında, üçerli kümeler.
    let empty = 0;
    for (let r = 0; r < CityLayout.size; r++) {
      for (let c = 0; c < CityLayout.size; c++) {
        if (CityLayout.isRoad(c, r) || CityLayout.isClaimed(c, r)) continue;
        empty += 1;
        if (empty % 2 !== 1) continue;
        for (let k = 0; k < 3; k++) {
          items.push({ depth: c + r + 0.05 * k, draw: (g) => this.drawTree(g, c, r, k) });
        }
      }
    }
    if (districtUnlocked(state, 'port')) {
      CityLayout.port.forEach(([c, r], index) => {
        items.push({ depth: c + r + 0.3, draw: (g) => this.drawCrane(g, c, r, index) });
      });
    }
    for (const car of this.cars(state, time)) {
      items.push({ depth: car.c + car.r + 0.5, draw: (g) => this.drawCar(g, car) });
    }
    // Array.sort kararlı: eşit derinlikte ekleme sırası (Swift'teki gibi).
    for (const item of items.sort((a, b) => a.depth - b.depth)) item.draw(ctx);
    if (this.palette.night) {
      this.drawLamps(ctx, [[3, 1], [3, 5], [1, 3], [5, 3], [3, 0.1], [0.1, 3], [6.2, 3]]);
    }
  }

  // ------------------------------------------------------------ uydu ada (L7)

  private drawSatellite(ctx: Ctx, state: LiteState, time: number): void {
    const chain = islandChain(this.island);
    if (!chain) return;
    // Önceki adadan gelen köprü (önde, sol alttan) ve açıksa sıradakine giden (arkada, sağ üste).
    if (islandUnlocked(state, this.island + 1)) this.drawBridge(ctx, 1, 0, -6, -3.4);
    this.drawIsland(ctx);
    this.drawGround(ctx, state);

    const unlocked = chainUnlocked(state, chain);
    const levels = state.chains[chain].levels;
    const items: Item[] = [];
    IslandLayout.tiles.forEach(([c, r], index) => {
      const stage = STAGES[index]!;
      const level = levels[stage];
      items.push({
        depth: c + r,
        draw: (g) => {
          if (stage === 0 && level > 0) this.drawIslandRaw(g, chain, level, c, r, time);
          else this.drawBuilding(g, chain, stage, level, unlocked, c, r, time);
        },
      });
    });
    IslandLayout.decor.forEach(([c, r], index) => {
      items.push({ depth: c + r + 0.1, draw: (g) => this.drawDecor(g, chain, index, c, r) });
    });
    items.push({ depth: 4.6, draw: (g) => this.drawBridge(g, 1, 3, 9, 6.4) });
    for (const item of items.sort((a, b) => a.depth - b.depth)) item.draw(ctx);
    if (chain === 'aviation' && levels[2] > 0) this.drawPlane(ctx, time);
    if (this.palette.night) this.drawLamps(ctx, [[1, 0.1], [1, 2.9], [1.9, 1.5]]);
  }

  // ------------------------------------------------------------ gökyüzü ve ada

  private drawSky(ctx: Ctx, time: number): void {
    const { size, unit } = this;
    if (this.palette.night) {
      // Yıldızlar sabit tohumla; hafif göz kırpma.
      starField(this.island).forEach((star, i) => {
        const x = star.x * size.width;
        const y = star.y * size.height * 0.5;
        const twinkle = 0.5 + 0.5 * Math.sin(time * (0.8 + (i % 5) * 0.3) + i);
        const alpha = star.alpha * (0.6 + 0.4 * twinkle);
        fill(ctx, ellipse(x - star.r, y - star.r, star.r * 2, star.r * 2), css(0xfffff0, alpha));
      });
      if (this.island === 0) {
        const moon = { x: size.width * 0.86, y: size.height * 0.13 };
        const halo = 46 * unit;
        fill(ctx, ellipse(moon.x - halo, moon.y - halo, halo * 2, halo * 2), radial(ctx, moon, 4, halo, css(0xfff0c8, 0.35), css(0xfff0c8, 0)));
        const m = 11 * unit;
        fill(ctx, ellipse(moon.x - m, moon.y - m, m * 2, m * 2), css(0xfff2cc));
        fill(ctx, ellipse(moon.x - m + 5 * unit, moon.y - m - 3 * unit, m * 1.75, m * 1.75), css(0x15275a));
      }
      this.drawClouds(ctx, css(0x7896e6, 0.2), time);
    } else {
      this.drawClouds(ctx, css(0xffffff, 0.85), time);
    }
  }

  private drawClouds(ctx: Ctx, color: string, time: number): void {
    const { size, unit } = this;
    const clouds: Array<[number, number, number]> =
      this.island === 0
        ? [[0.08, 0.2, 1], [0.8, 0.12, 0.8], [0.74, 0.56, 0.6]]
        : [[0.12, 0.16, 0.8], [0.86, 0.3, 0.9], [0.2, 0.72, 0.6]];
    clouds.forEach((cloud, index) => {
      // Bulutlar çok yavaş sürükleniyor.
      const drift = Math.sin(time / 40 + index * 2) * 8 * unit;
      const x = size.width * cloud[0] + drift;
      const y = size.height * cloud[1];
      const s = cloud[2] * unit;
      const path = new Path2D();
      addEllipse(path, x - 12 * s, y - 12 * s, 24 * s, 24 * s);
      addEllipse(path, x - 1 * s, y - 21 * s, 30 * s, 30 * s);
      addEllipse(path, x + 19 * s, y - 11 * s, 22 * s, 22 * s);
      fill(ctx, path, color);
    });
  }

  /** Temanın uzak siluetleri: dağda karlı tepeler, çölde düz tepeli kayalar. */
  private drawBackdrop(ctx: Ctx): void {
    const { size, palette } = this;
    const far = cssRgba(palette.far);
    const clear = cssRgba(palette.far, 0);
    switch (palette.theme) {
      case 'mountain': {
        const base = size.height * 0.62;
        const peaks: Array<[number, number, number]> = [[0.1, 0.34, 0.22], [0.3, 0.2, 0.3], [0.62, 0.3, 0.24], [0.9, 0.16, 0.3]];
        for (const [x, top, half] of peaks) {
          const cx = size.width * x;
          const ty = size.height * top;
          const hw = (size.width * half) / 2;
          const hill = polygon([{ x: cx - hw, y: base }, { x: cx, y: ty }, { x: cx + hw, y: base }]);
          fill(ctx, hill, linear2(ctx, { x: cx, y: ty }, { x: cx, y: base }, far, clear));
          // Karlı tepe.
          const cap = (base - ty) * 0.22;
          const snow = polygon([
            { x: cx, y: ty },
            { x: cx + (hw * cap) / (base - ty), y: ty + cap },
            { x: cx, y: ty + cap * 0.7 },
            { x: cx - (hw * cap) / (base - ty), y: ty + cap },
          ]);
          fill(ctx, snow, palette.night ? css(0xc9d6f5, 0.5) : css(WHITE, 0.9));
        }
        break;
      }
      case 'desert': {
        const base = size.height * 0.6;
        const mesas: Array<[number, number, number]> = [[0.12, 0.38, 0.2], [0.86, 0.3, 0.24], [0.66, 0.44, 0.14]];
        for (const [x, top, width] of mesas) {
          const cx = size.width * x;
          const ty = size.height * top;
          const w = size.width * width;
          const rock = polygon([
            { x: cx - w / 2, y: base },
            { x: cx - w * 0.32, y: ty },
            { x: cx + w * 0.32, y: ty },
            { x: cx + w / 2, y: base },
          ]);
          fill(ctx, rock, linear2(ctx, { x: cx, y: ty }, { x: cx, y: base }, far, clear));
        }
        break;
      }
      default:
        break;
    }
  }

  /** Kar teması: yavaş düşen taneler. */
  private drawSnow(ctx: Ctx, time: number): void {
    const { size, unit } = this;
    const flakes = new Path2D();
    for (let i = 0; i < 36; i++) {
      const seed = i * 12.9898;
      const x0 = rem(Math.sin(seed) * 43758.5453, 1);
      const speed = 0.05 + 0.04 * (i % 4);
      const fall = rem(time * speed + i * 0.137, 1);
      const sway = Math.sin(time * 0.8 + i) * 0.012;
      const x = size.width * (Math.abs(x0) + sway);
      const y = size.height * fall;
      const r = (1 + (i % 3) * 0.5) * unit;
      addEllipse(flakes, x - r, y - r, r * 2, r * 2);
    }
    fill(ctx, flakes, css(WHITE, this.palette.night ? 0.55 : 0.9));
  }

  private drawIsland(ctx: Ctx): void {
    const { palette, tileWidth, tileHeight, unit } = this;
    const n = this.grid;
    const center = this.point(n / 2, n / 2);
    fill(
      ctx,
      ellipse(center.x - tileWidth * n * 0.57, center.y + 40 * unit - tileHeight * n * 0.3, tileWidth * n * 1.14, tileHeight * n * 0.6),
      palette.night ? css(0x000014, 0.35) : css(0x285078, 0.14),
    );

    const g1 = this.point(n, 0);
    const g2 = this.point(n, n);
    const g3 = this.point(0, n);
    const depth = 15 * unit;
    const left = polygon([g3, g2, { x: g2.x, y: g2.y + depth }, { x: g3.x, y: g3.y + depth }]);
    fill(ctx, left, linear2(ctx, g3, { x: g3.x, y: g3.y + depth }, css(palette.side[0]), css(shade(palette.side[0], 0.88))));
    const right = polygon([g2, g1, { x: g1.x, y: g1.y + depth }, { x: g2.x, y: g2.y + depth }]);
    fill(ctx, right, linear2(ctx, g2, { x: g2.x, y: g2.y + depth }, css(palette.side[1]), css(shade(palette.side[1], 0.88))));
    const lip = polygon([{ x: g3.x, y: g3.y + 1.5 }, { x: g2.x, y: g2.y + 1.5 }, { x: g1.x, y: g1.y + 1.5 }], false);
    stroke(ctx, lip, css(palette.lip), { width: 3 * unit, join: 'round' });
  }

  private diamond(c: number, r: number, inset = 0, z = 0): Path2D {
    return polygon([
      this.point(c + inset, r + inset, z),
      this.point(c + 1 - inset, r + inset, z),
      this.point(c + 1 - inset, r + 1 - inset, z),
      this.point(c + inset, r + 1 - inset, z),
    ]);
  }

  private isRoad(c: number, r: number): boolean {
    return this.island === 0 ? CityLayout.isRoad(c, r) : c === IslandLayout.road;
  }

  private drawGround(ctx: Ctx, state: LiteState): void {
    const { palette, unit } = this;
    const port = this.island === 0 && districtUnlocked(state, 'port');
    for (let r = 0; r < this.grid; r++) {
      for (let c = 0; c < this.grid; c++) {
        const portTile = this.island === 0 && CityLayout.isPort(c, r);
        if (this.isRoad(c, r)) {
          fill(ctx, this.diamond(c, r), css(palette.road));
        } else if (port && portTile) {
          fill(ctx, this.diamond(c, r), linear2(ctx, this.point(c, r), this.point(c + 1, r + 1), css(palette.water[0]), css(palette.water[1])));
        } else {
          fill(ctx, this.diamond(c, r), css((c + r) % 2 === 0 ? palette.grass[0] : palette.grass[1]));
          if (portTile) stroke(ctx, this.diamond(c, r, 0.12), cssRgba(palette.empty), { width: 1.2, dash: [3, 3] });
        }
      }
    }
    if (port) {
      // Suda ışık çizgileri (gece ay ışığı).
      const glints = new Path2D();
      const spots: Array<[number, number, number]> = [[4.5, 6.5, 4], [5.4, 6.4, 6], [6.2, 6.6, 4]];
      for (const [c, r, w] of spots) {
        const p = this.point(c, r);
        glints.moveTo(p.x - w * unit, p.y);
        glints.lineTo(p.x + w * unit, p.y);
      }
      stroke(ctx, glints, palette.night ? css(0xfff0c8, 0.45) : css(WHITE, 0.7), { width: 1.3, cap: 'round' });
    }
    const dashes = new Path2D();
    const line = (a: Point, b: Point) => {
      dashes.moveTo(a.x, a.y);
      dashes.lineTo(b.x, b.y);
    };
    if (this.island === 0) {
      for (let i = 0; i < CityLayout.size; i++) {
        if (i === 3) continue;
        line(this.point(i + 0.3, 3.5), this.point(i + 0.7, 3.5));
        line(this.point(3.5, i + 0.3), this.point(3.5, i + 0.7));
      }
    } else {
      for (let i = 0; i < IslandLayout.size; i++) line(this.point(1.5, i + 0.3), this.point(1.5, i + 0.7));
    }
    stroke(ctx, dashes, css(palette.dash), { width: 1.6 * unit, cap: 'round' });
  }

  /**
   * Köprü: `column` sütununun yolu adanın dışına uzuyor; `fadeTo`'dan sonra
   * bulutlara karışıp kayboluyor (sayfa kenarındaki kesik görünmesin).
   */
  private drawBridge(ctx: Ctx, column: number, from: number, to: number, fadeTo: number): void {
    const { palette, unit } = this;
    const c0 = column + 0.12;
    const c1 = column + 0.88;
    const near = this.point(column + 0.5, from);
    const far = this.point(column + 0.5, fadeTo);
    const fading = (color: Rgb) =>
      linear(ctx, near, far, [
        [css(color), 0],
        [css(color), 0.55],
        [css(color, 0), 1],
      ]);
    const deckColor = palette.night ? 0x4a5684 : 0xc9d5e3;
    const edge = palette.night ? 0x2e365a : 0x9aa9bd;
    // Alt kenar (kalınlık) ve güverte.
    const side = polygon([this.point(c1, from), this.point(c1, to), this.point(c1, to, -0.12), this.point(c1, from, -0.12)]);
    fill(ctx, side, fading(edge));
    const deck = polygon([this.point(c0, from), this.point(c1, from), this.point(c1, to), this.point(c0, to)]);
    fill(ctx, deck, fading(deckColor));
    // Korkuluk direkleri ve tırabzan.
    const step = to > from ? 0.5 : -0.5;
    const posts = new Path2D();
    const rails = new Path2D();
    for (const rail of [c0, c1]) {
      const a = this.point(rail, from, 0.16);
      const b = this.point(rail, to, 0.16);
      rails.moveTo(a.x, a.y);
      rails.lineTo(b.x, b.y);
      let t = from + step;
      while ((step > 0 && t < to) || (step < 0 && t > to)) {
        const foot = this.point(rail, t);
        const head = this.point(rail, t, 0.16);
        posts.moveTo(foot.x, foot.y);
        posts.lineTo(head.x, head.y);
        t += step;
      }
    }
    const railColor = palette.night ? 0xc9d6f5 : WHITE;
    stroke(ctx, posts, fading(railColor), { width: 1.4 * unit, cap: 'round' });
    stroke(ctx, rails, fading(railColor), { width: 1.6 * unit, cap: 'round' });
  }

  // ------------------------------------------------------------ binalar

  /** Kutu: (c, r) karesinin içinde, kenar payı m, z0'dan h yüksekliğe. Üst yüzün üç köşesini döndürüyor. */
  private box(
    ctx: Ctx,
    c: number,
    r: number,
    m: number,
    z0: number,
    h: number,
    top: Shading,
    left: Shading,
    right: Shading,
  ): { a: Point; b: Point; d: Point } {
    const c0 = c + m;
    const c1 = c + 1 - m;
    const r0 = r + m;
    const r1 = r + 1 - m;
    const leftFace = polygon([this.point(c0, r1, z0), this.point(c1, r1, z0), this.point(c1, r1, z0 + h), this.point(c0, r1, z0 + h)]);
    const rightFace = polygon([this.point(c1, r1, z0), this.point(c1, r0, z0), this.point(c1, r0, z0 + h), this.point(c1, r1, z0 + h)]);
    const topFace = polygon([this.point(c0, r0, z0 + h), this.point(c1, r0, z0 + h), this.point(c1, r1, z0 + h), this.point(c0, r1, z0 + h)]);
    fill(ctx, leftFace, left);
    fill(ctx, rightFace, right);
    fill(ctx, topFace, top);
    return { a: this.point(c0, r1, z0 + h), b: this.point(c1, r1, z0 + h), d: this.point(c1, r0, z0 + h) };
  }

  private drawBuilding(ctx: Ctx, chain: ChainId, stage: Stage, level: number, unlocked: boolean, c: number, r: number, time: number): void {
    const { palette, tileWidth, tileHeight, unit } = this;
    if (!unlocked) {
      stroke(ctx, this.diamond(c, r, 0.12), cssRgba(palette.empty), { width: 1.2, dash: [3, 3] });
      return;
    }
    const [roofTop, roofSide] = palette.chain(chain);
    if (level <= 0) {
      stroke(ctx, this.diamond(c, r, 0.12), css(roofSide, 0.8), { width: 1.4, dash: [4, 3] });
      return;
    }
    const tier = buildingTier(level);
    if (stage === 0) {
      this.drawField(ctx, c, r, [roofTop, roofSide], tier);
      return;
    }
    const shape = IsoPainter.shape(stage, level);
    const m = shape.margin;
    const h = shape.height;
    // Yumuşak gölge.
    const base = this.point(c + 0.55, r + 0.62);
    const spread = 1 + 0.12 * (tier - 1);
    fill(
      ctx,
      ellipse(base.x - tileWidth * 0.46 * spread, base.y - tileHeight * 0.44, tileWidth * 0.96 * spread, tileHeight * 0.92),
      cssRgba(palette.shadow),
    );
    // Gövde: açık duvarlar, aşağı doğru hafif koyulaşan.
    this.box(
      ctx,
      c,
      r,
      m,
      0,
      h,
      css(palette.wall[0]),
      linear2(ctx, this.point(c, r + 1, h), this.point(c, r + 1, 0), css(palette.wall[1]), css(shade(palette.wall[1], 0.94))),
      linear2(ctx, this.point(c + 1, r, h), this.point(c + 1, r, 0), css(palette.wall[2]), css(shade(palette.wall[2], 0.92))),
    );
    // Simge yapı: çatı altında zincir renginde ışıklı bant.
    if (tier >= 4 && stage === 2) {
      this.box(ctx, c, r, m - 0.01, h - 0.16, 0.1, css(roofTop), css(shade(roofTop, palette.night ? 1.15 : 1.05)), css(roofSide));
    }
    // Çatı plakası: zincir rengi, biraz taşkın; üst kenarında ışık çizgisi.
    const roof = this.box(ctx, c, r, m - 0.035, h, 0.17, css(shade(roofTop, 1.08)), css(roofTop), css(roofSide));
    const rim = polygon([roof.a, roof.b, roof.d], false);
    stroke(ctx, rim, tier >= 4 ? css(GOLD) : css(WHITE, 0.55), { width: tier >= 4 ? 1.6 : 1 });
    this.drawWindows(ctx, c, r, m, h, shape.rows);
    if (stage === 1) {
      // Baca sayısı kademeyle: kule ve simge yapıda iki baca.
      const stacks: Array<[number, number]> = tier >= 3 ? [[0.62, 0.3], [0.38, 0.3]] : [[0.66, 0.32]];
      const tall = tier >= 2 ? 0.8 : 0.65;
      stacks.forEach((spot, index) => {
        const foot = this.point(c + spot[0], r + spot[1], h + 0.17);
        const head = this.point(c + spot[0], r + spot[1], h + tall);
        const w = 6.4 * unit;
        fill(ctx, roundedRect(foot.x - w / 2, head.y, w, foot.y - head.y, 1.5), css(shade(roofSide, 0.85)));
        fill(ctx, rect(foot.x - w / 2, head.y, w, 2 * unit), tier >= 4 ? css(GOLD) : css(shade(roofTop, 1.15)));
        // Enerji temiz: şebeke tütmüyor.
        if (chain !== 'energy') this.drawSmoke(ctx, head, time, c * 0.37 + r * 0.61 + index * 0.5);
      });
    } else {
      this.drawAwning(ctx, c, r, m, roofTop);
      if (tier === 2) {
        // Orta kat: çatıda küçük bir makine dairesi.
        this.box(ctx, c + 0.18, r + 0.12, 0.3, h + 0.17, 0.12, css(palette.wall[0]), css(palette.wall[1]), css(palette.wall[2]));
      }
      if (tier >= 3) {
        // Kule: geri çekilmiş tepe; simge yapıda altın tepe ve anten.
        const crownTop = tier >= 4 ? GOLD : roofTop;
        const crownSide = tier >= 4 ? GOLD_SIDE : roofSide;
        this.box(ctx, c, r, m + 0.1, h + 0.17, 0.22, css(shade(crownTop, 1.08)), css(crownTop), css(crownSide));
        if (tier >= 4) {
          const foot = this.point(c + 0.5, r + 0.5, h + 0.39);
          const tip = this.point(c + 0.5, r + 0.5, h + 0.85);
          stroke(ctx, polygon([foot, tip], false), palette.night ? css(0xc9d6f5) : css(0x8c9bb5), { width: 1.6 * unit });
          const blink = 0.5 + 0.5 * Math.sin(time * 3 + c + r);
          const dot = 2.2 * unit;
          fill(ctx, ellipse(tip.x - dot, tip.y - dot, dot * 2, dot * 2), css(0xff4d5e, 0.45 + 0.55 * blink));
        }
      }
    }
  }

  /** Ham kademe tarlası; orta kattan itibaren arkada bir silo, simge yapıda altın kubbeli. */
  private drawField(ctx: Ctx, c: number, r: number, colors: [Rgb, Rgb], tier: number): void {
    const { palette, unit } = this;
    fill(
      ctx,
      this.diamond(c, r, 0.08),
      linear2(ctx, this.point(c, r), this.point(c + 1, r + 1), css(mix(colors[0], WHITE, 0.35)), css(mix(colors[0], WHITE, 0.15))),
    );
    const rows = new Path2D();
    for (let k = 1; k <= 4; k++) {
      const t = k * 0.2;
      const a = this.point(c + 0.16, r + t);
      const b = this.point(c + 0.84, r + t);
      rows.moveTo(a.x, a.y);
      rows.lineTo(b.x, b.y);
    }
    stroke(ctx, rows, css(colors[1]), { width: 1.6 * unit, cap: 'round' });
    if (tier < 2) return;
    const height = tier >= 4 ? 0.62 : tier === 3 ? 0.5 : 0.36;
    this.box(ctx, c + 0.28, r - 0.22, 0.36, 0, height, css(palette.wall[0]), css(palette.wall[1]), css(palette.wall[2]));
    const top = this.point(c + 0.5 + 0.28, r + 0.5 - 0.22, height);
    const dome = 6.2 * unit;
    fill(ctx, ellipse(top.x - dome, top.y - dome * 0.75, dome * 2, dome * 1.3), css(tier >= 4 ? GOLD : colors[1]));
  }

  private drawWindows(ctx: Ctx, c: number, r: number, m: number, h: number, rows: number): void {
    const { palette, unit } = this;
    const w = 4.8 * unit;
    const hh = 5 * unit;
    for (let row = 0; row < rows; row++) {
      const z = (h * (row + 0.5)) / (rows + 0.3);
      for (let j = 0; j < 3; j++) {
        const u = c + m + (j + 0.62) * ((1 - 2 * m) / 3.35);
        const p = this.point(u, r + 1 - m, z);
        const lit = !palette.night || (row * 3 + j + Math.trunc(c) * 5 + Math.trunc(r) * 3) % 4 !== 0;
        if (palette.night && lit) {
          const glow = 7 * unit;
          const center = { x: p.x, y: p.y - 1 };
          fill(ctx, ellipse(p.x - glow, p.y - 1 - glow, glow * 2, glow * 2), radial(ctx, center, 0, glow, css(0xffcd6e, 0.45), css(0xffcd6e, 0)));
        }
        fill(ctx, roundedRect(p.x - w / 2, p.y - hh * 0.7, w, hh, 1.6 * unit), css(lit ? palette.window : palette.windowOff));
        if (lit) fill(ctx, rect(p.x - w / 2 + 0.8 * unit, p.y - hh * 0.58, 1.4 * unit, 1.6 * unit), css(palette.glint));
      }
      // Sağ yüzde tek pencere.
      const q = this.point(c + 1 - m, r + 0.5, z);
      const side = palette.night ? (row % 2 === 0 ? 0xe8b85a : 0x2b3c6c) : shade(palette.window, 0.9);
      fill(ctx, roundedRect(q.x + 2 * unit, q.y - hh * 0.72, w, hh, 1.6 * unit), css(side));
    }
  }

  private drawAwning(ctx: Ctx, c: number, r: number, m: number, color: Rgb): void {
    const { palette, unit } = this;
    const a = this.point(c + m, r + 1 - m, 0.4);
    const b = this.point(c + 1 - m, r + 1 - m, 0.4);
    const a3 = { x: a.x - 2.5 * unit, y: a.y + 5 * unit };
    const b3 = { x: b.x - 2.5 * unit, y: b.y + 5 * unit };
    if (palette.night) {
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 10 * unit };
      const glow = 22 * unit;
      fill(ctx, ellipse(center.x - glow, center.y - glow, glow * 2, glow * 2), radial(ctx, center, 0, glow, css(0xffd278, 0.35), css(0xffd278, 0)));
    }
    fill(ctx, polygon([a, b, b3, a3]), css(color));
    const stripes = new Path2D();
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      stripes.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      stripes.lineTo(a3.x + (b3.x - a3.x) * t, a3.y + (b3.y - a3.y) * t);
    }
    stroke(ctx, stripes, css(WHITE, 0.85), { width: 1.6 * unit });
  }

  private drawSmoke(ctx: Ctx, head: Point, time: number, seed: number): void {
    const { palette, unit } = this;
    const phase = rem(seed, 1);
    for (let k = 0; k < 4; k++) {
      const age = rem(time / 3.2 + phase + k / 4, 1);
      const x = head.x + age * 16 * unit;
      const y = head.y - age * 22 * unit - 3 * unit;
      const radius = (3 + age * 6) * unit;
      const alpha = age < 0.7 ? 1 : (1 - age) / 0.3;
      fill(ctx, ellipse(x - radius, y - radius, radius * 2, radius * 2), cssRgba(palette.smoke, alpha));
    }
  }

  // ------------------------------------------------------------ adaların kendi yapıları (L7)

  /** Ada zincirlerinin ham kademesi: rüzgâr türbinleri, maden ocağı, malzeme laboratuvarı. */
  private drawIslandRaw(ctx: Ctx, chain: ChainId, level: number, c: number, r: number, time: number): void {
    const { palette, unit } = this;
    const [top, side] = palette.chain(chain);
    const tier = buildingTier(level);
    switch (chain) {
      case 'energy': {
        fill(ctx, this.diamond(c, r, 0.08), css(mix(palette.grass[0], top, 0.18)));
        const spots: Array<[number, number]> = [[0.3, 0.3], [0.72, 0.42], [0.36, 0.76], [0.76, 0.8]];
        for (const spot of spots.slice(0, tier)) {
          this.drawTurbine(ctx, [c + spot[0], r + spot[1]], 0.9, time, spot[0] * 3 + spot[1]);
        }
        break;
      }
      case 'auto': {
        // Basamaklı ocak: içe doğru koyulaşan halkalar, kenarda kamyon.
        for (let step = 0; step < 3; step++) {
          const inset = 0.08 + step * 0.11;
          const tone = palette.night ? 0x5a5f7a : 0xb9a58e;
          fill(ctx, this.diamond(c, r, inset, -0.04 * step), css(shade(tone, 1 - 0.1 * step)));
        }
        for (let k = 0; k < Math.min(3, tier); k++) {
          const p = this.point(c + 0.25 + k * 0.22, r + 0.82);
          fill(ctx, roundedRect(p.x - 5 * unit, p.y - 6 * unit, 10 * unit, 5 * unit, 1.2 * unit), css(0xffc23a));
          fill(ctx, roundedRect(p.x + 2 * unit, p.y - 8 * unit, 4 * unit, 3 * unit, 1 * unit), css(0x3a4a6b));
        }
        break;
      }
      default: {
        // Laboratuvar: alçak taban ve kubbe; kademe büyüdükçe kubbe büyüyor.
        this.box(ctx, c, r, 0.18, 0, 0.28, css(palette.wall[0]), css(palette.wall[1]), css(palette.wall[2]));
        const center = this.point(c + 0.5, r + 0.5, 0.28);
        const radius = (12 + 2.5 * tier) * unit;
        fill(
          ctx,
          ellipse(center.x - radius, center.y - radius * 0.95, radius * 2, radius * 1.5),
          linear2(ctx, { x: center.x - radius, y: center.y - radius }, { x: center.x + radius, y: center.y }, css(palette.wall[0]), css(palette.wall[2])),
        );
        const ring = ellipse(center.x - radius * 0.9, center.y - radius * 0.3, radius * 1.8, radius * 0.5);
        stroke(ctx, ring, css(side), { width: 2 * unit });
        fill(ctx, ellipse(center.x - 2.5 * unit, center.y - radius * 0.95 - 1.5 * unit, 5 * unit, 4 * unit), css(top));
        break;
      }
    }
  }

  private drawTurbine(ctx: Ctx, spot: [number, number], height: number, time: number, seed: number): void {
    const { palette, unit } = this;
    const foot = this.point(spot[0], spot[1]);
    const hub = this.point(spot[0], spot[1], height);
    stroke(ctx, polygon([foot, hub], false), palette.night ? css(0xc9d6f5) : css(WHITE), { width: 2.4 * unit, cap: 'round' });
    const angle = time * 1.6 + seed;
    const blades = new Path2D();
    for (let k = 0; k < 3; k++) {
      const a = angle + (k * 2 * Math.PI) / 3;
      blades.moveTo(hub.x, hub.y);
      blades.lineTo(hub.x + Math.cos(a) * 13 * unit, hub.y + Math.sin(a) * 13 * unit);
    }
    stroke(ctx, blades, palette.night ? css(0xe3eaff) : css(WHITE), { width: 2 * unit, cap: 'round' });
    fill(ctx, ellipse(hub.x - 2 * unit, hub.y - 2 * unit, 4 * unit, 4 * unit), css(0x8c9bb5));
  }

  /** Ada süsleri: güneş panelleri ve direkler; kamyon parkı; kontrol kulesi ve apron. */
  private drawDecor(ctx: Ctx, chain: ChainId, index: number, c: number, r: number): void {
    const { palette, unit } = this;
    if (chain === 'energy' && (index === 0 || index === 2)) {
      // Güneş paneli dizileri.
      for (let k = 0; k < 3; k++) {
        const t = 0.2 + k * 0.26;
        const panel = polygon([
          this.point(c + 0.15, r + t, 0.08),
          this.point(c + 0.85, r + t, 0.08),
          this.point(c + 0.85, r + t + 0.16, 0.02),
          this.point(c + 0.15, r + t + 0.16, 0.02),
        ]);
        fill(ctx, panel, linear2(ctx, this.point(c, r + t), this.point(c + 1, r + t), css(0x3d6fd6), css(0x2a4fa8)));
        stroke(ctx, panel, css(WHITE, 0.6), { width: 0.8 });
      }
    } else if (chain === 'energy') {
      // Şebeke direği.
      const foot = this.point(c + 0.5, r + 0.5);
      const head = this.point(c + 0.5, r + 0.5, 1.0);
      const pylon = new Path2D();
      pylon.moveTo(foot.x - 5 * unit, foot.y);
      pylon.lineTo(head.x, head.y);
      pylon.lineTo(foot.x + 5 * unit, foot.y);
      pylon.moveTo(head.x - 9 * unit, head.y + 6 * unit);
      pylon.lineTo(head.x + 9 * unit, head.y + 6 * unit);
      stroke(ctx, pylon, palette.night ? css(0xa9b7dd) : css(0x8c9bb5), { width: 1.6 * unit, join: 'round' });
    } else if (chain === 'auto' && index === 1) {
      // Bayi önünde sergilenen araçlar.
      const colors = [0xff5e6c, 0x3d8bff, 0xffd23f, 0x2ec27e];
      for (let k = 0; k < 4; k++) {
        const p = this.point(c + 0.28 + (k % 2) * 0.44, r + 0.3 + Math.floor(k / 2) * 0.4);
        fill(ctx, roundedRect(p.x - 6 * unit, p.y - 3.5 * unit, 12 * unit, 6 * unit, 3 * unit), css(colors[k]!));
        fill(ctx, rect(p.x - 2 * unit, p.y - 2.8 * unit, 4 * unit, 2 * unit), css(WHITE, 0.65));
      }
    } else if (chain === 'aviation' && index === 1) {
      // Apron: park etmiş uçak.
      this.drawPlaneShape(ctx, this.point(c + 0.5, r + 0.5), 1, 0);
    } else if (chain === 'aviation' && index === 0) {
      // Kontrol kulesi.
      const foot = this.point(c + 0.5, r + 0.5);
      const head = this.point(c + 0.5, r + 0.5, 1.1);
      fill(ctx, roundedRect(foot.x - 3.5 * unit, head.y, 7 * unit, foot.y - head.y, 2), css(palette.wall[1]));
      fill(ctx, roundedRect(head.x - 9 * unit, head.y - 7 * unit, 18 * unit, 8 * unit, 3 * unit), css(palette.window));
      fill(ctx, roundedRect(head.x - 10 * unit, head.y - 10 * unit, 20 * unit, 3.5 * unit, 1.5 * unit), css(palette.chain('aviation')[1]));
    } else {
      for (let k = 0; k < 3; k++) this.drawTree(ctx, c, r, k);
    }
  }

  private drawPlaneShape(ctx: Ctx, center: Point, scale: number, heading: number): void {
    const { unit } = this;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(heading);
    ctx.scale(scale, scale);
    const body = WHITE;
    const accent = this.palette.chain('aviation')[1];
    fill(ctx, roundedRect(-14 * unit, -2.6 * unit, 28 * unit, 5.2 * unit, 2.6 * unit), css(body));
    const wings = new Path2D();
    addPolygon(wings, [
      { x: -2 * unit, y: -2 * unit },
      { x: 4 * unit, y: -2 * unit },
      { x: -4 * unit, y: -13 * unit },
      { x: -8 * unit, y: -13 * unit },
    ]);
    addPolygon(wings, [
      { x: -2 * unit, y: 2 * unit },
      { x: 4 * unit, y: 2 * unit },
      { x: -4 * unit, y: 13 * unit },
      { x: -8 * unit, y: 13 * unit },
    ]);
    fill(ctx, wings, css(shade(body, 0.92)));
    const tail = polygon([
      { x: -14 * unit, y: -1 * unit },
      { x: -10 * unit, y: -1 * unit },
      { x: -14 * unit, y: -7 * unit },
    ]);
    fill(ctx, tail, css(accent));
    fill(ctx, rect(-6 * unit, -0.8 * unit, 16 * unit, 1.6 * unit), css(accent));
    ctx.restore();
  }

  /** Havayolu açıkken gökyüzünden ara ara bir uçak geçiyor. */
  private drawPlane(ctx: Ctx, time: number): void {
    const { size, unit } = this;
    const cycle = 14;
    const t = rem(time / cycle, 1);
    if (t >= 0.6) return;
    const progress = t / 0.6;
    const start = { x: -40 * unit, y: size.height * 0.42 };
    const end = { x: size.width + 40 * unit, y: size.height * 0.08 };
    const p = { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress };
    const heading = Math.atan2(end.y - start.y, end.x - start.x);
    this.drawPlaneShape(ctx, p, 0.7, heading);
  }

  // ------------------------------------------------------------ ağaç, vinç, lamba

  private drawTree(ctx: Ctx, c: number, r: number, k: number): void {
    const { palette, unit } = this;
    const p = this.point(c + 0.3 + (k % 2) * 0.42, r + 0.33 + (k > 1 ? 0.38 : 0));
    fill(ctx, ellipse(p.x - 5 * unit, p.y - 1.6 * unit, 12 * unit, 5 * unit), cssRgba(palette.shadow));
    switch (palette.flora) {
      case 'round': {
        fill(ctx, rect(p.x - 1.2 * unit, p.y - 6 * unit, 2.4 * unit, 6 * unit), css(0x8a5a3b));
        const crown = { x: p.x, y: p.y - 10.5 * unit };
        const radius = 6.8 * unit;
        fill(
          ctx,
          ellipse(crown.x - radius, crown.y - radius, radius * 2, radius * 2),
          radial(ctx, { x: crown.x - 2 * unit, y: crown.y - 2.5 * unit }, 1, radius * 1.2, css(palette.tree[1]), css(palette.tree[0])),
        );
        break;
      }
      case 'pine':
      case 'snowPine': {
        fill(ctx, rect(p.x - 1.2 * unit, p.y - 4 * unit, 2.4 * unit, 4 * unit), css(0x7a4e33));
        for (let layer = 0; layer < 3; layer++) {
          const w = (8 - layer * 2) * unit;
          const base = p.y - (4 + layer * 5) * unit;
          const cone = polygon([
            { x: p.x - w, y: base },
            { x: p.x, y: base - 8 * unit },
            { x: p.x + w, y: base },
          ]);
          fill(ctx, cone, css(layer === 1 ? palette.tree[1] : palette.tree[0]));
          if (palette.flora === 'snowPine') {
            const cap = polygon([
              { x: p.x - w * 0.45, y: base - 4.4 * unit },
              { x: p.x, y: base - 8 * unit },
              { x: p.x + w * 0.45, y: base - 4.4 * unit },
            ]);
            fill(ctx, cap, css(WHITE, palette.night ? 0.7 : 0.95));
          }
        }
        break;
      }
      case 'cactus': {
        const green = css(palette.tree[0]);
        const light = css(palette.tree[1]);
        fill(ctx, roundedRect(p.x - 2.4 * unit, p.y - 15 * unit, 4.8 * unit, 15 * unit, 2.4 * unit), green);
        fill(ctx, roundedRect(p.x - 7 * unit, p.y - 11 * unit, 3.6 * unit, 6 * unit, 1.8 * unit), green);
        fill(ctx, roundedRect(p.x - 7 * unit, p.y - 7 * unit, 6 * unit, 2.6 * unit, 1.3 * unit), green);
        fill(ctx, roundedRect(p.x + 3.6 * unit, p.y - 13 * unit, 3.4 * unit, 5 * unit, 1.7 * unit), green);
        fill(ctx, roundedRect(p.x + 1 * unit, p.y - 9.4 * unit, 6 * unit, 2.4 * unit, 1.2 * unit), green);
        fill(ctx, roundedRect(p.x - 1.2 * unit, p.y - 14 * unit, 1.2 * unit, 10 * unit, 0.6 * unit), light);
        break;
      }
    }
  }

  private drawCrane(ctx: Ctx, c: number, r: number, index: number): void {
    const { palette, unit } = this;
    const foot = this.point(c + 0.5, r + 0.22);
    const arm = polygon(
      [
        foot,
        { x: foot.x, y: foot.y - 26 * unit },
        { x: foot.x + 15 * unit, y: foot.y - 30 * unit },
      ],
      false,
    );
    stroke(ctx, arm, palette.night ? css(0xd9a23a) : css(0xf2a93b), { width: 2.6 * unit, cap: 'round', join: 'round' });
    const cargo = [0xe35d5d, 0x3d8bff, 0xe35d5d][index % 3]!;
    fill(ctx, roundedRect(foot.x + 8 * unit, foot.y - 22 * unit, 7 * unit, 6 * unit, 1.5), css(cargo));
  }

  private drawLamps(ctx: Ctx, spots: ReadonlyArray<readonly [number, number]>): void {
    const { unit } = this;
    for (const [c, r] of spots) {
      const p = this.point(c + 0.04, r + 0.04);
      stroke(ctx, polygon([p, { x: p.x, y: p.y - 10 * unit }], false), css(0x55638f), { width: 1.2 });
      const bulb = { x: p.x, y: p.y - 11 * unit };
      const glow = 18 * unit;
      fill(ctx, ellipse(bulb.x - glow, bulb.y - glow, glow * 2, glow * 2), radial(ctx, bulb, 0, glow, css(0xffd68c, 0.55), css(0xffd68c, 0)));
      fill(ctx, ellipse(bulb.x - 1.8, bulb.y - 1.8, 3.6, 3.6), css(0xffe7b0));
    }
  }

  // ------------------------------------------------------------ araçlar

  private cars(state: LiteState, time: number): Car[] {
    const selling = CityLayout.mainChains.filter((chain) => chainUnlocked(state, chain) && state.chains[chain].levels[2] > 0);
    const count = Math.min(10, 2 + selling.length * 2);
    const colors = this.palette.night ? [0x3d5ba8, 0xc94d58, 0xd9a63a, 0x9fb0d9] : [0xff5e6c, 0x3d8bff, 0xffd23f, 0xffffff, 0x2ec27e];
    const cars: Car[] = [];
    for (let i = 0; i < count; i++) {
      const horizontal = i % 2 === 0;
      const speed = 0.35 + (i % 3) * 0.12;
      const forward = i % 4 < 2;
      let t = rem(time * speed + i * 1.7, 7.6);
      if (!forward) t = 7.6 - t;
      const along = t - 0.3;
      const lane = 3.5 + (forward ? 0.18 : -0.18);
      cars.push({ c: horizontal ? along : lane, r: horizontal ? lane : along, horizontal, forward, color: colors[i % colors.length]! });
    }
    return cars;
  }

  private drawCar(ctx: Ctx, car: Car): void {
    // Adanın dışına taşan araç çizilmiyor (yol kenarında beliriyor).
    if (!(car.c > -0.1 && car.c < 7.1 && car.r > -0.1 && car.r < 7.1)) return;
    const { palette, unit } = this;
    const p = this.point(car.c, car.r);
    ctx.save();
    ctx.translate(p.x, p.y);
    // Yol yönü ekranda ±26,6°; geri giden araç ters yöne bakıyor.
    const angle = Math.atan2(this.tileHeight, this.tileWidth);
    const heading = car.horizontal ? angle : Math.PI - angle;
    ctx.rotate(car.forward ? heading : heading + Math.PI);
    const w = 11 * unit;
    const h = 6 * unit;
    fill(ctx, roundedRect(-w / 2, -h / 2 + 2 * unit, w, h, h / 2), css(0x000000, 0.12));
    fill(ctx, roundedRect(-w / 2, -h / 2, w, h, h / 2), css(car.color));
    fill(ctx, rect(-1.5 * unit, -h / 2 + 0.6 * unit, 3.5 * unit, 2 * unit), css(WHITE, 0.6));
    if (palette.night) {
      fill(
        ctx,
        ellipse(w / 2 - 1 * unit, -5 * unit, 22 * unit, 10 * unit),
        radial(ctx, { x: w / 2, y: 0 }, 0, 12 * unit, css(0xfff0be, 0.55), css(0xfff0be, 0)),
      );
      fill(ctx, ellipse(w / 2 - 1.6 * unit, -h / 2 + 0.4 * unit, 2.2 * unit, 2.2 * unit), css(0xfff4c8));
      fill(ctx, ellipse(w / 2 - 1.6 * unit, h / 2 - 2.6 * unit, 2.2 * unit, 2.2 * unit), css(0xfff4c8));
    }
    ctx.restore();
  }
}

/** iOS'taki `timeIntervalSinceReferenceDate` (2001-01-01'den beri saniye): animasyon evreleri aynı. */
export function referenceTime(now = Date.now()): number {
  return now / 1000 - 978_307_200;
}
