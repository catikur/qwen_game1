/**
 * Görsel dil (iOS `Theme.swift` ile aynı): "Cam & Bulut". Gündüz parlak
 * gökyüzü, gece yıldızlı lacivert. Arayüz renkleri CSS jetonlarında
 * (`styles.css`); burada tuval (şehir çizimi) ve bileşenlerin JS'te
 * ihtiyaç duyduğu renkler.
 */
import type { ChainId } from '@capital/lite-model';

export type Rgb = number;

/** 0xRRGGBB → "rgb(...)" / "rgba(...)". */
export function css(hex: Rgb, alpha = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Gündüz ve gece değerli renk. */
export interface Dual {
  light: Rgb;
  dark: Rgb;
}

export const pick = (color: Dual, night: boolean): Rgb => (night ? color.dark : color.light);

const CHAIN: Record<ChainId, [Dual, Dual]> = {
  bakery: [{ light: 0xffd25e, dark: 0xf2c24e }, { light: 0xffb020, dark: 0xd99a1c }],
  coffee: [{ light: 0xb47a4f, dark: 0xa06e48 }, { light: 0x8c5632, dark: 0x7a4e2e }],
  fashion: [{ light: 0xda8bf0, dark: 0xc77ee3 }, { light: 0xb85dd6, dark: 0x9d52c2 }],
  leather: [{ light: 0xff7a7a, dark: 0xf06a6a }, { light: 0xe04848, dark: 0xc43e44 }],
  tech: [{ light: 0x5cc8ff, dark: 0x4db6f0 }, { light: 0x2e9ce8, dark: 0x2a88d4 }],
  energy: [{ light: 0x8ee06a, dark: 0x7fd25e }, { light: 0x46bf55, dark: 0x3da84b }],
  auto: [{ light: 0x5ed6c8, dark: 0x4fc6b8 }, { light: 0x22afa2, dark: 0x1f9a8f }],
  aviation: [{ light: 0xff8fb8, dark: 0xf07faa }, { light: 0xf25d92, dark: 0xd95283 }],
};

/** Zincirin iki tonlu rengi (ikon karosu, çatı, pay çubuğu): [açık, koyu]. */
export function chainColors(id: ChainId, night: boolean): [Rgb, Rgb] {
  const [a, b] = CHAIN[id];
  return [pick(a, night), pick(b, night)];
}

/** Gökyüzü degradesi (yukarıdan aşağı). */
export function skyStops(night: boolean): Array<[Rgb, number]> {
  const colors = night ? [0x0a1433, 0x142659, 0x1b2f66, 0x20356f] : [0x7ccbff, 0xa9deff, 0xd3eeff, 0xe8f6ff];
  const at = [0, 0.36, 0.66, 1];
  return colors.map((c, i) => [c, at[i]!]);
}

/** Parlak düğme boyaları: üst yarı, alt yarı, alt kenar. */
export const GLOSS = {
  orange: { top: [0xffa65c, 0xff8a3d], bottom: [0xff7a2a, 0xff8b3a], edge: { light: 0xd45f1c, dark: 0xa9480f } },
  green: { top: [0x4fd88c, 0x2dc26f], bottom: [0x22b262, 0x2dbf6c], edge: { light: 0x189150, dark: 0x12723f } },
  blue: { top: [0x7db4ff, 0x5c98f5], bottom: [0x4683e8, 0x4f8cee], edge: { light: 0x2e62bc, dark: 0x1f4890 } },
  gold: { top: [0xffe08a, 0xffcb4f], bottom: [0xffb938, 0xffc24a], edge: { light: 0xc98a1c, dark: 0x9a6610 } },
  red: { top: [0xff8a8a, 0xf26464], bottom: [0xe54b4b, 0xee5a5a], edge: { light: 0xb33232, dark: 0x8e2424 } },
} as const;

export type GlossName = keyof typeof GLOSS;

/** Renk karıştırma: tuvalde gölge ve ışık. */
export function shade(hex: Rgb, factor: number): Rgb {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return (f((hex >> 16) & 0xff) << 16) | (f((hex >> 8) & 0xff) << 8) | f(hex & 0xff);
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const m = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return (m((a >> 16) & 0xff, (b >> 16) & 0xff) << 16) | (m((a >> 8) & 0xff, (b >> 8) & 0xff) << 8) | m(a & 0xff, b & 0xff);
}
