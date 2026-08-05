/**
 * Deterministik rastgelelik.
 *
 * Simülasyonun tekrar üretilebilir olması için `Math.random` çekirdekte
 * kullanılmaz. RNG durumu tek bir sayıdır, dolayısıyla save dosyasına
 * doğrudan yazılabilir: aynı seed + aynı komut dizisi = aynı sonuç.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  // Seed'i 32-bit'e sıkıştır, sıfır olmasın.
  const s = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 0x1a2b3c4d;
  return { s };
}

/** mulberry32 — küçük, hızlı, tek sayıda durum tutar. */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [min, max) aralığında tam sayı. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min));
}

export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  return items[nextInt(rng, 0, items.length)] as T;
}

/** Ağırlıklı seçim; ağırlık toplamı 0 ise ilk elemanı döndürür. */
export function pickWeighted<T>(rng: RngState, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return items[0] as T;

  let roll = nextFloat(rng) * total;
  for (const item of items) {
    roll -= Math.max(0, weight(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1] as T;
}
