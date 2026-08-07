import { CATEGORIES, CATEGORY_LIST, DISTRICT_ARCHETYPES } from '@capital/content';
import type { CategoryId } from '@capital/content';

/**
 * Talep tabanları ve kategori biçimli sözlükler.
 *
 * Kendi modülünde duruyor çünkü hem `worldgen` (dünya kurulurken spot
 * pazarın referans hacmini buradan türetir) hem de `systems/market`
 * (her gün talebi buradan okur) ihtiyaç duyuyor. İkisinden birine
 * koymak çevrimsel bir import zinciri yaratıyordu.
 */

/** Her kategori için 0 değerli sözlük. */
export function zeroByCategory(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const category of CATEGORY_LIST) out[category.id] = 0;
  return out;
}

/**
 * Bir bölgenin bir kategorideki taban talebi.
 *
 * Henüz hiç tick koşmadıysa `district.demand` sıfır görünür; yatırım
 * tahmini ve spot pazar referansı o boşlukta bu kaba tabanı kullanır.
 */
export function estimateBaselineDemand(
  district: { population: number; incomeLevel: number; archetype: string },
  categoryId: CategoryId,
): number {
  const category = CATEGORIES[categoryId];
  const archetype = DISTRICT_ARCHETYPES[district.archetype as keyof typeof DISTRICT_ARCHETYPES];
  const weight = archetype?.demandWeights[categoryId] ?? 1;
  const incomeFactor = 1 + (district.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
  return district.population * category.demandPerCapita * weight * Math.max(0.2, incomeFactor);
}
