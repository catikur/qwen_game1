import type { BuildingRole } from './types';

/**
 * Enerji (Tur 57).
 *
 * Her binanın bakımının bir kısmı enerji faturası. Şebeke fiyatı normalde
 * 1 (taban); krizler ve olaylar onu oynatıyor: enerji krizi iki katına
 * çıkarıyor, durgunluk biraz düşürüyor. Fiyat 1'ken fatura bakımın içinde
 * eskisi gibi; santrali olmayan oyunda yalnızca şok günleri değişiyor.
 *
 * Santral menzilindeki binalara enerji veriyor (`systems/energy.ts`):
 *   - sahibinin binası faturayı ödemiyor, santral yakıtını ödüyor;
 *   - rakibin binası şebeke fiyatının biraz altından santrale ödüyor.
 * Güç önce sahibinin binalarına gidiyor: kendi faturası rakibe satıştan
 * daha değerli (yakıt aynı, kazanç tam fiyat).
 */
export const ENERGY = {
  /** 1 MWh'nin taban fiyatı (₺); şebeke fiyatı bunun katı. */
  unitPrice: 100,
  /** Bakımın enerjiye giden payı, role göre; verilmeyen rol `default`. */
  share: { process: 0.4, extract: 0.35, outlet: 0.3, default: 0.25 } as Partial<Record<BuildingRole, number>> & { default: number },
  /** Santralin rakip binalara tarifesi: şebeke fiyatından indirim. */
  rivalDiscount: 0.05,
  /** Güneş tarlasının mevsime göre üretimi (ortalaması ~1). */
  solarSeason: { winter: 0.6, spring: 1.05, summer: 1.35, autumn: 0.95 } as Record<string, number>,
  /**
   * Yakıt sabitleme: doğalgaz santrallerinin yakıtı bu kadar gün bugünkü
   * şebeke fiyatının `lockPremium` fazlasıyla. Krizin uyarısı gelince
   * sabitleyen şoku santralin kârına çeviriyor; fiyat düşerse pahalı öder.
   */
  lockDays: 120,
  lockPremium: 0.08,
} as const;
