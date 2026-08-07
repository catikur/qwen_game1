import {
  CATEGORIES,
  CATEGORY_LIST,
  DISTRICT_ARCHETYPES,
  GOODS_BY_CATEGORY,
} from '@capital/content';
import type { CategoryId, DistrictArchetypeId, GoodDef } from '@capital/content';

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

/**
 * Bir kategorinin talebinin, o bölgede ürünler arasında nasıl bölündüğü.
 *
 * Denge kimliği yüzünden aynı kategorideki iki ürünün birim maliyeti
 * AYNIDIR; ayrıştıkları tek yer burası. Ekmek orta gelir mahallesinde,
 * bisküvi turizm bölgesinde daha çok satar — yani "hangi ürünü rafa
 * koyayım" sorusu bir konum sorusuna dönüşür.
 *
 * Paylar bölge içinde normalize edilir: kategorinin TOPLAM talebi
 * değişmez, yalnızca ürünler arasında farklı dağılır. Bu sayede ikinci
 * ürün eklemek mevcut kalibrasyonu bozmaz.
 */
export function goodShares(
  archetype: DistrictArchetypeId,
  categoryId: CategoryId,
): Array<{ good: GoodDef; share: number }> {
  const goods = GOODS_BY_CATEGORY[categoryId] ?? [];
  if (goods.length === 0) return [];
  if (goods.length === 1) return [{ good: goods[0]!, share: 1 }];

  const weighted = goods.map((good) => ({
    good,
    weight: good.demandShare * (good.archetypeWeights?.[archetype] ?? 1),
  }));

  let total = 0;
  for (const entry of weighted) total += entry.weight;
  if (total <= 0) return goods.map((good) => ({ good, share: 1 / goods.length }));

  return weighted.map((entry) => ({ good: entry.good, share: entry.weight / total }));
}

/** Bir bölgede o kategorinin en çok satan ürünü. */
export function bestGoodFor(
  archetype: DistrictArchetypeId,
  categoryId: CategoryId,
): string | null {
  return defaultShelf(archetype, categoryId, 1)[0] ?? null;
}

/**
 * Yeni bir outlet'in varsayılan rafı: bölgede en çok satan ürünler,
 * yuva sayısı kadar.
 *
 * Yuva sayısı burada gerçek bir kısıt: tek yuvalı bakkal kategorinin
 * yalnızca bir ürününü taşır ve diğerinin talebini rakibe bırakır; üç
 * yuvalı süpermarket kategorinin tamamını toplar. "Küçük dükkân uzmanlaşır,
 * büyük mağaza her şeyi satar" ayrımı buradan çıkıyor.
 */
export function defaultShelf(
  archetype: DistrictArchetypeId,
  categoryId: CategoryId,
  slots: number,
): string[] {
  return goodShares(archetype, categoryId)
    .slice()
    .sort((a, b) => b.share - a.share)
    .slice(0, Math.max(1, slots))
    .map((entry) => entry.good.id);
}

/** Bir raf dizisinin o bölgede yakalayabildiği kategori talebi oranı. */
export function shelfReach(
  archetype: DistrictArchetypeId,
  categoryId: CategoryId,
  stocked: readonly string[],
): number {
  let reach = 0;
  for (const entry of goodShares(archetype, categoryId)) {
    if (stocked.includes(entry.good.id)) reach += entry.share;
  }
  return reach;
}
