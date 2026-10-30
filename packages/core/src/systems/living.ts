import { CATEGORIES, CONSUMER_CATEGORIES, FAD, GOODS, GOOD_BY_ID, SEASONS, TREND } from '@capital/content';
import type { CategoryId, SeasonDef } from '@capital/content';
import { tc } from '../i18n';
import '../i18n/gameTr';
import { pushNews } from '../news';
import { createRng, nextFloat } from '../rng';
import { monthOf } from '../selectors';
import type { GameState } from '../types';

/**
 * Canlı pazar (Tur 37d) — içerik ve gerekçe `@capital/content` living.ts'te.
 *
 * Üç katmanın üçü de DURUMSUZ: tohumdan ve günden hesaplanıyor, kayda yeni
 * alan girmiyor. Eğilim ve moda takvimi gün 0'dan parça parça yürünerek
 * bulunuyor (birkaç düzine adım); aynı tohum her makinede aynı pazarı
 * yaşıyor ve `state.rng` hiç çekilmiyor.
 */

/**
 * Bayrağın yokluğu AÇIK. `randomEvents` kapalıyken de kapalı: laboratuvar
 * (denge sınavının düellosu) dışsal talep oynamasını olaylarla birlikte
 * kapatıyor — bir mekanizmanın etkisi ölçülürken 60 günde mevsim değişirse
 * ölçülen şey mevsim olurdu.
 */
export function livingEnabled(state: GameState): boolean {
  return state.flags.livingMarket !== false && state.flags.randomEvents !== false;
}

function dice(seed: number, base: number, salt: number): ReturnType<typeof createRng> {
  return createRng(((seed ^ base) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

function rangeInt(die: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(die) * (max - min + 1));
}

// ------------------------------------------------------------ mevsim

export function seasonOf(day: number): SeasonDef {
  const month = monthOf(day);
  return SEASONS.find((season) => season.months.includes(month)) ?? SEASONS[0]!;
}

export function seasonMultiplier(day: number, category: CategoryId): number {
  return seasonOf(day).demand[category] ?? 1;
}

// ------------------------------------------------------------ eğilim

export interface TrendPoint {
  /** Bugünkü çarpan. */
  value: number;
  /** Parçanın sonunda varılacak çarpan — yön buradan okunuyor. */
  target: number;
  startDay: number;
  endDay: number;
}

/**
 * Kategorinin eğilimi: gün 0'da 1'den başlayan, parça parça doğrusal bir
 * yol. Her parçanın uzunluğu ve hedefi (tohum, kategori, parça sırası)
 * zarından.
 */
export function trendAt(seed: number, category: CategoryId, day: number): TrendPoint {
  const salt = 0x6a09e667 ^ Math.imul(CONSUMER_CATEGORIES.indexOf(category) + 1, 0x01000193);
  let start = 0;
  let from = 1;
  for (let index = 0; index < 10_000; index++) {
    const die = dice(seed, salt, index);
    const length = rangeInt(die, TREND.segmentDays);
    const to = TREND.range[0] + nextFloat(die) * (TREND.range[1] - TREND.range[0]);
    if (day < start + length) {
      const t = Math.max(0, (day - start) / length);
      return { value: from + (to - from) * t, target: to, startDay: start, endDay: start + length };
    }
    start += length;
    from = to;
  }
  return { value: 1, target: 1, startDay: day, endDay: day + 1 };
}

// ------------------------------------------------------------ moda

export interface FadWindow {
  goodId: string;
  startDay: number;
  /** Bu gün dahil değil: moda `endDay`'de bitmiş. */
  endDay: number;
}

/** Modaya girebilen ürünler: aynı kategoride en az iki tüketici ürünü olanlar (tek ürünlü kategoride pay zaten tam). */
const FAD_GOODS: string[] = GOODS.filter(
  (good) =>
    good.tier === 'consumer' &&
    good.category !== undefined &&
    GOODS.filter((other) => other.tier === 'consumer' && other.category === good.category).length > 1,
).map((good) => good.id);

/**
 * `day` günü süren ya da sıradaki moda. Takvim gün 0'dan yürünüyor:
 * ilk moda `firstDay`'de, sonrakiler bir öncekinin bitişinden `gapDays`
 * sonra. Aynı ürün üst üste moda olmuyor.
 */
export function fadSchedule(seed: number, day: number): { active: FadWindow | null; next: FadWindow } {
  let start = rangeInt(dice(seed, 0x3c6ef372, 0), FAD.firstDay);
  let last = '';
  for (let index = 0; index < 10_000; index++) {
    const die = dice(seed, 0xbb67ae85, index);
    const duration = rangeInt(die, FAD.durationDays);
    const choices = FAD_GOODS.filter((id) => id !== last);
    const goodId = choices[Math.floor(nextFloat(die) * choices.length)] ?? FAD_GOODS[0]!;
    const window: FadWindow = { goodId, startDay: start, endDay: start + duration };
    if (day < window.startDay) return { active: null, next: window };
    if (day < window.endDay) return { active: window, next: window };
    last = goodId;
    start = window.endDay + rangeInt(die, FAD.gapDays);
  }
  return { active: null, next: { goodId: FAD_GOODS[0]!, startDay: day + 1, endDay: day + 2 } };
}

/** Bugün moda olan ürün (yoksa null). */
export function activeFad(state: GameState): FadWindow | null {
  if (!livingEnabled(state)) return null;
  return fadSchedule(state.meta.seed, state.time.day).active;
}

// ------------------------------------------------------------ birleşik

/** Kategorinin bugünkü canlı pazar çarpanı: eğilim × mevsim × (moda varsa) küçük ek. */
export function livingDemand(state: GameState, category: CategoryId, fad: FadWindow | null = activeFad(state)): number {
  if (!livingEnabled(state)) return 1;
  const day = state.time.day;
  const fadBoost = fad && GOOD_BY_ID[fad.goodId]?.category === category ? FAD.categoryBoost : 1;
  return trendAt(state.meta.seed, category, day).value * seasonMultiplier(day, category) * fadBoost;
}

/**
 * Günlük canlı pazar adımı: yalnızca haber. Çarpanlar durumsuz olduğu için
 * burada bir şey güncellenmiyor; mevsim dönümü, başlayan moda ve büyük bir
 * eğilim dönüşü şehir haberlerine düşüyor.
 */
export function runLivingTick(state: GameState): void {
  if (!livingEnabled(state)) return;
  const day = state.time.day;
  if (day <= 0) return;

  const season = seasonOf(day);
  if (season.id !== seasonOf(day - 1).id) {
    pushNews(state, 'neutral', tc('core.living.seasonTitle', { season: season.name }), season.news);
  }

  const fad = fadSchedule(state.meta.seed, day).active;
  if (fad && fad.startDay === day) {
    const good = GOOD_BY_ID[fad.goodId];
    if (good) {
      pushNews(
        state,
        'good',
        tc('core.living.fadTitle', { good: good.name }),
        tc('core.living.fadBody', { good: good.name, days: fad.endDay - fad.startDay }),
      );
    }
  }

  for (const category of CONSUMER_CATEGORIES) {
    const trend = trendAt(state.meta.seed, category, day);
    if (trend.startDay !== day) continue;
    const swing = trend.target - trend.value;
    if (Math.abs(swing) < 0.06) continue;
    pushNews(
      state,
      'neutral',
      tc(swing > 0 ? 'core.living.trendUpTitle' : 'core.living.trendDownTitle', { category: CATEGORIES[category].name }),
      tc('core.living.trendBody', {
        category: CATEGORIES[category].name,
        days: trend.endDay - trend.startDay,
      }),
    );
  }
}
