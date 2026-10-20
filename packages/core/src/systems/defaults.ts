import { CONSUMER_CATEGORIES, GOODS } from '@capital/content';
import type { CategoryId } from '@capital/content';

/*
 * Boş sözlükler ve referans fiyatlar (Tur 46'da `supply.ts` ve `focus.ts`'ten
 * ayrıldı): yeni oyun da, kayıt taşıma (`@capital/persistence`) da kullanıyor.
 * Kayıt okuma açılışın ilk işi; pazarın ve odak sisteminin geri kalanını
 * taşımasın.
 */

/** Ürün kimliği → 0 sözlüğü. */
export function zeroByGood(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const good of GOODS) out[good.id] = 0;
  return out;
}

/** Spot fiyatları referans değerleriyle tohumlar (yeni oyun ve migration). */
export function seedSpotPrices(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const good of GOODS) out[good.id] = good.basePrice;
  return out;
}

/** Kategori → 0 sözlüğü. */
export function zeroByCategoryRecord(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const category of CONSUMER_CATEGORIES) out[category] = 0;
  return out;
}
