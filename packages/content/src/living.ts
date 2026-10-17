import type { CategoryId } from './types';
import { localizeList } from './localize';

/**
 * Canlı pazar (Tur 37d): kategori eğilimleri, ürün modaları ve mevsimler.
 *
 * Talep bugüne kadar yalnızca nüfus, olay, dönem ve krizle değişiyordu;
 * gelir düzeyi, arketip ağırlıkları ve ürün payları sabitti. Bir kategoriyi
 * bir kez doğru seçen oyuncu oyunun sonuna kadar haklı kalıyordu. Üç
 * katman pazarı yavaş, orta ve hızlı ritimde oynatıyor:
 *
 * - **Eğilim** (yavaş): her kategori 120–240 günde bir yeni bir hedefe
 *   doğru kayıyor (±%12). Yönü ve hedefi önceden belli — erken okuyan
 *   kazanıyor.
 * - **Mevsim** (orta): takvim ayına göre. Yıl boyunca ortalaması 1, yani
 *   toplam talebi değiştirmiyor; yalnızca hangi kategorinin hangi ayda
 *   öne çıktığını.
 * - **Moda** (hızlı): tek bir ürüne 30–60 gün ek talep payı. Kategorinin
 *   içinde yeniden dağılıyor (rafında o ürün olan kazanıyor) ve kategoriye
 *   küçük bir ek talep getiriyor.
 *
 * Üçünün zarı da dışsal (tohum, gün): aynı tohum aynı pazarı yaşıyor, lig
 * tekrarı ve parmak izi etkilenmiyor.
 */

// ---------------------------------------------------------------- mevsim

export type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn';

export interface SeasonDef {
  id: SeasonId;
  name: string;
  /** Mevsim başlarken çıkan haber. */
  news: string;
  /** Takvim ayları (0 = Ocak). */
  months: readonly number[];
  /** Kategori çarpanları — her kategori için dört mevsimin ortalaması 1. */
  demand: Partial<Record<CategoryId, number>>;
}

export const SEASONS: SeasonDef[] = [
  {
    id: 'winter',
    name: 'Kış',
    news: 'Kış geldi: giyim ve elektronik vitrinleri canlanıyor, sokak sakinleşiyor.',
    months: [11, 0, 1],
    demand: { retail: 1.06, electronics: 1.05, grocery: 1.02, dining: 0.95, services: 0.97 },
  },
  {
    id: 'spring',
    name: 'İlkbahar',
    news: 'İlkbahar: hizmet ve giyim talebi hafifçe artıyor.',
    months: [2, 3, 4],
    demand: { retail: 1.02, electronics: 0.98, grocery: 0.99, dining: 1.01, services: 1.02 },
  },
  {
    id: 'summer',
    name: 'Yaz',
    news: 'Yaz geldi: kafeler ve hizmetler dolu, giyim ve elektronik durgun.',
    months: [5, 6, 7],
    demand: { retail: 0.95, electronics: 0.96, grocery: 0.98, dining: 1.07, services: 1.04 },
  },
  {
    id: 'autumn',
    name: 'Sonbahar',
    news: 'Sonbahar: okul dönemi elektronik ve market alışverişini artırıyor.',
    months: [8, 9, 10],
    demand: { retail: 0.97, electronics: 1.01, grocery: 1.01, dining: 0.97, services: 0.97 },
  },
];

export const SEASON_BY_ID: Record<SeasonId, SeasonDef> = Object.fromEntries(
  SEASONS.map((season) => [season.id, season]),
) as Record<SeasonId, SeasonDef>;

localizeList(SEASONS, 'season', ['name', 'news']);

// ---------------------------------------------------------------- eğilim ve moda

export const TREND = {
  /** Bir eğilim parçasının süresi (gün). */
  segmentDays: [120, 240] as const,
  /** Parçanın hedef çarpanı bu aralıktan. */
  range: [0.88, 1.12] as const,
  /** Pazar panelinde "yükseliyor/düşüyor" demek için gereken fark. */
  arrowThreshold: 0.02,
};

export const FAD = {
  /** İlk moda bu günden önce başlamıyor. */
  firstDay: [60, 100] as const,
  /** İki moda arası (bir öncekinin bitişinden). */
  gapDays: [70, 130] as const,
  durationDays: [30, 60] as const,
  /** Moda ürününün kategori içindeki ağırlık çarpanı. */
  weight: 1.6,
  /** Moda süresince kategorinin talebine ek. */
  categoryBoost: 1.05,
};
