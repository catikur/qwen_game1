/**
 * Şehrin ışığı ve coğrafyası (iOS `CityPalette` ile aynı): gündüz/gece ×
 * sahil/dağ/çöl/kar. Tuvalde dinamik renk yok; her renk düz 0xRRGGBB.
 * Saydam renkler (gölge, duman, boş parsel, uzak siluet) `Rgba` olarak.
 */
import type { ChainId, CityTheme } from '@capital/lite-model';
import { chainColors, css, type Rgb } from '../theme';

/** Saydamlığı olan renk. */
export interface Rgba {
  hex: Rgb;
  alpha: number;
}

export const rgba = (hex: Rgb, alpha: number): Rgba => ({ hex, alpha });

/** Rgba → CSS; `opacity` Swift'teki `.opacity(_:)` gibi saydamlığı çarpıyor. */
export const cssRgba = (color: Rgba, opacity = 1): string => css(color.hex, color.alpha * opacity);

/** Ağaç türü: sahilde yuvarlak, dağda çam, çölde kaktüs, karda karlı çam. */
export type Flora = 'round' | 'pine' | 'cactus' | 'snowPine';

export class CityPalette {
  readonly night: boolean;
  readonly theme: CityTheme;
  readonly grass: readonly [Rgb, Rgb];
  readonly road: Rgb;
  readonly dash: Rgb;
  readonly side: readonly [Rgb, Rgb];
  readonly lip: Rgb;
  readonly wall: readonly [Rgb, Rgb, Rgb];
  readonly window: Rgb;
  readonly windowOff: Rgb;
  readonly glint: Rgb;
  readonly water: readonly [Rgb, Rgb];
  readonly tree: readonly [Rgb, Rgb];
  readonly shadow: Rgba;
  readonly smoke: Rgba;
  readonly empty: Rgba;
  readonly flora: Flora;
  /** Arka plan siluetleri (dağ, kaya) için. */
  readonly far: Rgba;

  constructor(night: boolean, theme: CityTheme = 'coast') {
    this.night = night;
    this.theme = theme;
    if (night) {
      this.road = 0x28345a;
      this.dash = 0xffd37a;
      this.wall = [0xc3cff0, 0x8f9fcc, 0x6f80b2];
      this.window = 0xffd37a;
      this.windowOff = 0x33467a;
      this.glint = 0xfff4cc;
      this.water = [0x1e4c8e, 0x143a72];
      this.shadow = rgba(0x000010, 0.38);
      this.smoke = rgba(0xbecdf0, 0.35);
      this.empty = rgba(0x9fb6e0, 0.35);
    } else {
      this.road = 0xb5c3d3;
      this.dash = 0xffffff;
      this.wall = [0xffffff, 0xf1f5fa, 0xdde6f0];
      this.window = 0x7fd0ff;
      this.windowOff = 0x7fd0ff;
      this.glint = 0xffffff;
      this.water = [0x6fd4ff, 0x3eb6f2];
      this.shadow = rgba(0x1d3557, 0.18);
      this.smoke = rgba(0xffffff, 0.92);
      this.empty = rgba(0x507850, 0.45);
    }
    const look = LOOKS[theme][night ? 1 : 0];
    this.grass = look.grass;
    this.side = look.side;
    this.lip = look.lip;
    this.tree = look.tree;
    this.flora = look.flora;
    this.far = look.far;
  }

  /** Zincirin çatı rengi: üst (açık) ve yan (koyu). */
  chain(id: ChainId): [Rgb, Rgb] {
    return chainColors(id, this.night);
  }
}

interface Look {
  grass: [Rgb, Rgb];
  side: [Rgb, Rgb];
  lip: Rgb;
  tree: [Rgb, Rgb];
  flora: Flora;
  far: Rgba;
}

/** Tema başına [gündüz, gece]. */
const LOOKS: Record<CityTheme, [Look, Look]> = {
  coast: [
    { grass: [0xa6e58e, 0x98dc7f], side: [0xb9875a, 0x9b6c43], lip: 0x86cf6c, tree: [0x43b05a, 0x6ed36e], flora: 'round', far: rgba(0xffffff, 0) },
    { grass: [0x2c6a58, 0x286150], side: [0x3c3358, 0x2f2848], lip: 0x3a8c6e, tree: [0x1e5a47, 0x2f7c60], flora: 'round', far: rgba(0x000000, 0) },
  ],
  mountain: [
    { grass: [0x9bd68c, 0x8ccb7e], side: [0x9da6b8, 0x7f889c], lip: 0x7cc26e, tree: [0x2f8a57, 0x46a86a], flora: 'pine', far: rgba(0xa9c4e8, 1) },
    { grass: [0x2a6152, 0x26594b], side: [0x464e68, 0x3a4159], lip: 0x37806a, tree: [0x1a4f3e, 0x276b53], flora: 'pine', far: rgba(0x2b3d72, 1) },
  ],
  desert: [
    { grass: [0xf4d9a0, 0xedcd8e], side: [0xd38e58, 0xb47040], lip: 0xe9bc74, tree: [0x4fa35e, 0x6dc27a], flora: 'cactus', far: rgba(0xf3c9a2, 1) },
    { grass: [0x6e5e52, 0x66574c], side: [0x5e4140, 0x4c3434], lip: 0x8a7058, tree: [0x2f6a48, 0x3f8559], flora: 'cactus', far: rgba(0x3f3a6e, 1) },
  ],
  snow: [
    { grass: [0xeef6ff, 0xe1edfa], side: [0xa3b7d3, 0x869bbc], lip: 0xffffff, tree: [0x2e7d5b, 0x3f9670], flora: 'snowPine', far: rgba(0xffffff, 0) },
    { grass: [0x5c6d98, 0x55658e], side: [0x46537a, 0x3a466b], lip: 0x8fa3d0, tree: [0x1c4e44, 0x28655a], flora: 'snowPine', far: rgba(0x000000, 0) },
  ],
};
