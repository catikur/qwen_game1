/**
 * CapitalForge Lite — içerik (zincirler, mahalleler, sabitler).
 *
 * Bu dosyanın Swift karşılığı `ios-lite/Kit/Sources/CapitalForgeLiteKit/Content.swift`.
 * İkisi aynı sayıları taşımak ZORUNDA: eşitlik testi (fikstürler) ayrışmayı
 * yakalıyor ama sebebi en çok burada olur.
 */

export type ChainId = 'bakery' | 'coffee' | 'fashion' | 'leather' | 'tech';
export type DistrictId = 'bazaar' | 'center' | 'industry' | 'port' | 'technopark';

/** Kademe sırası: 0 ham, 1 işleme, 2 satış. */
export type Stage = 0 | 1 | 2;
export const STAGES: readonly Stage[] = [0, 1, 2];

export interface ChainDef {
  id: ChainId;
  district: DistrictId;
  /** Satılan birimin fiyatı (₺). */
  price: number;
  /** Kademe başına ilk seviyenin maliyeti: [ham, işleme, satış]. */
  baseCost: readonly [number, number, number];
  /** Zincir şu ömür boyu kazançta açılıyor (mahallesi açık olsa bile). */
  unlockAt: number;
}

export const CHAINS: readonly ChainDef[] = [
  { id: 'bakery', district: 'bazaar', price: 1, baseCost: [6, 8, 4], unlockAt: 0 },
  { id: 'coffee', district: 'bazaar', price: 14, baseCost: [84, 112, 56], unlockAt: 3_000 },
  { id: 'fashion', district: 'center', price: 200, baseCost: [1_200, 1_600, 800], unlockAt: 400_000 },
  { id: 'leather', district: 'industry', price: 3_000, baseCost: [18_000, 24_000, 12_000], unlockAt: 60_000_000 },
  { id: 'tech', district: 'technopark', price: 45_000, baseCost: [270_000, 360_000, 180_000], unlockAt: 9_000_000_000 },
];

export const CHAIN_IDS: readonly ChainId[] = CHAINS.map((chain) => chain.id);

export const CHAIN_BY_ID: Record<ChainId, ChainDef> = Object.fromEntries(CHAINS.map((c) => [c.id, c])) as Record<
  ChainId,
  ChainDef
>;

export interface DistrictDef {
  id: DistrictId;
  /** Mahalle şu ömür boyu kazançta açılıyor. */
  unlockAt: number;
  /** Bütün satışlara çarpan (yalnızca Liman'da 1'den büyük). */
  incomeMultiplier: number;
}

export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'bazaar', unlockAt: 0, incomeMultiplier: 1 },
  { id: 'center', unlockAt: 400_000, incomeMultiplier: 1 },
  { id: 'industry', unlockAt: 60_000_000, incomeMultiplier: 1 },
  { id: 'port', unlockAt: 1_500_000_000, incomeMultiplier: 1.5 },
  { id: 'technopark', unlockAt: 9_000_000_000, incomeMultiplier: 1 },
];

/** İlk seviyenin hızı (birim/sn): [ham, işleme, satış]. */
export const BASE_RATE: readonly [number, number, number] = [1.5, 1.2, 1];

/** Seviye başına maliyet büyümesi: [ham, işleme, satış]. */
export const COST_GROWTH: readonly [number, number, number] = [1.13, 1.15, 1.14];

/** Bu seviyelerin her birinde kademenin hızı ikiye katlanıyor. */
export const MILESTONES: readonly number[] = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];

/**
 * Marj — dikey entegrasyonun karşılığı (ana oyunun felsefesi).
 *
 * Satışın ne kadarını kendi işlemenden karşılıyorsan o kısım `processed`,
 * onun da ne kadarını kendi hammaddenden karşılıyorsan o kısım `integrated`
 * marjıyla satılıyor. Kalanı pazardan alınan malla `bought` marjıyla.
 * Yukarı kademeyi almak hiçbir zaman zarar ettirmiyor: en kötü ihtimalle
 * karşıladığı kısım kadar kazandırıyor.
 */
export const MARGIN = { bought: 0.2, processed: 0.55, integrated: 0.85 } as const;

/** Rakip: oyuncunun akışının bu katına doğru kovalıyor (şehir sırası arttıkça sertleşiyor). */
export const RIVAL_AGGRESSION_BASE = 0.6;
export const RIVAL_AGGRESSION_PER_CITY = 0.15;
/** Rakibin hedefe yaklaşma zaman sabiti (sn). Çevrimdışı iki katı. */
export const RIVAL_LAG = 600;
/** Pay hiçbir zaman bunun altına inmiyor: hiç kazanamamak yok. */
export const SHARE_FLOOR = 0.15;

/** Kampanya: süreli çarpan ve bekleme. */
export const CAMPAIGN = { multiplier: 2, duration: 30, cooldown: 180 } as const;

/** Çevrimdışı kazanç tavanı: taban + Genel Müdür seviyesi başına (sn). */
export const OFFLINE_CAP_BASE = 2 * 3600;
/** Çevrimdışı verim: kapalıyken gelirin yarısı. Tam hız olunca gündelik oyuncu bir günde her şeyi açıyordu. */
export const OFFLINE_EFFICIENCY = 0.5;
export const OFFLINE_CAP_PER_MANAGER = 3600;
export const MANAGER_MAX = 10;
export const MANAGER_BASE_COST = 5_000;
export const MANAGER_COST_GROWTH = 14;

/** Holding Yıldızı: bütün gelire kalıcı +%2. */
export const STAR_BONUS = 0.02;
/** Yıldız = floor(STAR_SCALE × √(şehirdeki ömür boyu kazanç / STAR_UNIT)). */
export const STAR_SCALE = 1;
export const STAR_UNIT = 1e9;

/** Başlangıç kasası. */
export const STARTING_CASH = 10;
