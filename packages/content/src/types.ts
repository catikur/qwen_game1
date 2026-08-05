/**
 * İçerik tanımlarının tipleri.
 *
 * Bu paket saf veridir: ne simülasyonu ne de render'ı bilir. Core bu tanımları
 * okur, render sadece görsel alanlarını kullanır.
 */

/** Tüketici talebinin toplandığı sektörler. */
export type CategoryId =
  | 'grocery'
  | 'dining'
  | 'retail'
  | 'electronics'
  | 'services'
  | 'housing'
  | 'office';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  /** Birim taban fiyat (oyun para birimi). */
  basePrice: number;
  /** Satılan birim başına maliyet oranı (0..1). */
  costRatio: number;
  /**
   * Fiyat esnekliği. Yüksek değer = fiyat artınca talep hızla düşer.
   * Lüks kategorilerde düşük, temel ihtiyaçta yüksektir.
   */
  elasticity: number;
  /** Kişi başı günlük talep birimi (gelir çarpanı uygulanmadan önce). */
  demandPerCapita: number;
  /** Gelir seviyesinin talebe etkisi (0 = etkisiz, 1 = doğrusal). */
  incomeSensitivity: number;
  /** UI ve lens renkleri. */
  color: string;
}

/** Bir binanın hangi ekonomik rolü oynadığı. */
export type BuildingRole =
  /** Tüketiciye satış yapar; pazar payı yarışına girer. */
  | 'outlet'
  /** Kira geliri üretir; pazar payı yarışına girmez. */
  | 'rental'
  /** Yakındaki kendi outlet'lerinin maliyetini düşürür. */
  | 'logistics'
  /** Kendi outlet'lerine ucuz mal sağlar. */
  | 'production';

export interface BuildingDef {
  id: string;
  name: string;
  role: BuildingRole;
  category: CategoryId;
  /** Aynı ailenin kaçıncı kademesi; yükseltme zinciri için. */
  tier: number;
  cost: number;
  upkeepPerDay: number;
  /** Günlük hizmet kapasitesi (outlet) veya birim üretimi (production). */
  capacity: number;
  /** Ürün/hizmet kalitesi 0..1; pazar payında çarpan. */
  quality: number;
  /** İstihdam ettiği kişi; ücret gideri ve district istihdamı. */
  jobs: number;
  /** Etki yarıçapı (tile). Logistics ve rental için anlamlı. */
  radius: number;
  /** Görsel: taban rengi ve bina yüksekliği (tile birimi). */
  color: string;
  height: number;
  /** Bu binanın açılması için gereken şirket değeri. */
  unlockNetWorth: number;
  description: string;
}

export type DistrictArchetypeId =
  | 'downtown'
  | 'retail_strip'
  | 'industrial'
  | 'port'
  | 'tech_park'
  | 'lux_residential'
  | 'mid_residential'
  | 'student'
  | 'tourism';

export interface DistrictArchetypeDef {
  id: DistrictArchetypeId;
  name: string;
  /** Başlangıç nüfusu. */
  population: number;
  /** Gelir seviyesi 0..1. */
  incomeLevel: number;
  /** Arsa taban değeri (tile başına). */
  baseLandValue: number;
  /** Kategori bazlı talep ağırlıkları; 1 = nötr. */
  demandWeights: Partial<Record<CategoryId, number>>;
  /** Zemin rengi. */
  color: string;
}

export type NpcTrait =
  | 'expansionist'
  | 'price_cutter'
  | 'premium'
  | 'tech'
  | 'landlord';

export interface NpcProfileDef {
  id: string;
  name: string;
  trait: NpcTrait;
  startingCash: number;
  /** Karar verirken kâr marjına verdiği ağırlık. */
  marginWeight: number;
  /** Karşılanmamış talebe verdiği ağırlık. */
  demandWeight: number;
  /** Fiyatı taban fiyata göre çarpanı. */
  priceMultiplier: number;
  /** Haftalık yatırım için nakdinin kullanmaya razı olduğu oran. */
  aggression: number;
  color: string;
  description: string;
}
