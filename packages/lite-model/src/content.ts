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

// ------------------------------------------------------------ L3: olaylar

/**
 * Şehir olayları: belirli aralıklarla iki dakikalık bir olay. Ana oyundaki
 * şehir ve sektör olaylarının idle karşılığı. Hammadde krizi felsefenin
 * dersi: pazardan alınan girdi pahalanıyor, kendi zincirini kuran etkilenmiyor.
 */
export type EventKind = 'tourism' | 'crisis' | 'strike' | 'fashionWeek' | 'exportBoom' | 'rivalPush';
/** Sıra sabit: seçim bu sırayla süzülen listeden yapılıyor (Swift aynı sırayı kullanıyor). */
export const EVENT_KINDS: readonly EventKind[] = ['tourism', 'crisis', 'strike', 'fashionWeek', 'exportBoom', 'rivalPush'];
/** İlk olay bu saniyede; sonrakiler başlangıçtan başlangıca EVENT_GAP arayla. */
export const EVENT_FIRST = 240;
export const EVENT_GAP = 330;
export const EVENT_DURATION = 120;
export const TOURISM_MULTIPLIER = 2;
export const FASHION_WEEK_MULTIPLIER = 2.5;
export const EXPORT_BOOM_MULTIPLIER = 1.5;
export const STRIKE_MULTIPLIER = 0.5;
export const RIVAL_PUSH_MULTIPLIER = 1.6;
/** Krizde pazardan alınan malın ve hammaddenin marjı. Tam entegrasyon değişmiyor. */
export const CRISIS_MARGIN = { bought: 0.05, processed: 0.4 } as const;

// ------------------------------------------------------------ L3: meclis

/**
 * Belediye meclisi: belirli aralıklarla iki seçenekli bir karar. Seçilen
 * politika bir saat geçerli. Seçilmezse bir sonraki oturuma kadar açık kalıyor.
 */
export type PolicyKind =
  | 'industryGrant'
  | 'pedestrian'
  | 'taxCut'
  | 'competitionBoard'
  | 'techGrant'
  | 'tourismPromo'
  | 'campaignFund'
  | 'exportFair';
export const COUNCIL_PAIRS: ReadonlyArray<readonly [PolicyKind, PolicyKind]> = [
  ['industryGrant', 'pedestrian'],
  ['taxCut', 'competitionBoard'],
  ['techGrant', 'tourismPromo'],
  ['campaignFund', 'exportFair'],
];
export const COUNCIL_FIRST = 600;
export const COUNCIL_GAP = 3600;
export const POLICY_DURATION = 3600;
export const POLICY = {
  /** Ham kademe hızı. */
  industryGrant: 1.3,
  /** Satış kademesi hızı. */
  pedestrian: 1.2,
  /** Bütün gelir. */
  taxCut: 1.15,
  /** Rakibin kovalama hedefi. */
  competitionBoard: 0.6,
  /** İşleme kademesi hızı. */
  techGrant: 1.3,
  /** Fırın, kahve ve moda geliri. */
  tourismPromo: 1.25,
  /** Kampanya çarpanı (×2 yerine). */
  campaignFund: 3,
  /** Bütün gelir. */
  exportFair: 1.1,
} as const;

// ------------------------------------------------------------ L3: görevler

/**
 * Görev merdiveni: şehir başına sırayla. Ödül, alındığı andaki gelirin
 * `rewardSeconds` saniyesi (en az `minReward`): erken görev küçük, geç görev
 * büyük ama hep "anlamlı" bir dilim.
 */
export type GoalKind =
  | 'bakeryRetail'
  | 'bakeryProcess'
  | 'bakeryChain'
  | 'firstCampaign'
  | 'coffeeRetail'
  | 'level25'
  | 'center'
  | 'manager'
  | 'council'
  | 'share75'
  | 'industry'
  | 'ipo'
  | 'port'
  | 'technopark'
  | 'firstStar';

export interface GoalDef {
  kind: GoalKind;
  rewardSeconds: number;
  minReward: number;
}

export const GOALS: readonly GoalDef[] = [
  { kind: 'bakeryRetail', rewardSeconds: 30, minReward: 10 },
  { kind: 'bakeryProcess', rewardSeconds: 30, minReward: 20 },
  { kind: 'bakeryChain', rewardSeconds: 60, minReward: 40 },
  { kind: 'firstCampaign', rewardSeconds: 45, minReward: 50 },
  { kind: 'coffeeRetail', rewardSeconds: 60, minReward: 100 },
  { kind: 'level25', rewardSeconds: 90, minReward: 200 },
  { kind: 'center', rewardSeconds: 120, minReward: 1_000 },
  { kind: 'manager', rewardSeconds: 120, minReward: 2_000 },
  { kind: 'council', rewardSeconds: 120, minReward: 2_000 },
  { kind: 'share75', rewardSeconds: 150, minReward: 5_000 },
  { kind: 'industry', rewardSeconds: 180, minReward: 50_000 },
  { kind: 'ipo', rewardSeconds: 180, minReward: 500_000 },
  { kind: 'port', rewardSeconds: 240, minReward: 1_000_000 },
  { kind: 'technopark', rewardSeconds: 300, minReward: 5_000_000 },
  { kind: 'firstStar', rewardSeconds: 300, minReward: 10_000_000 },
];

/** L4'te eklenen "halka arz" görevinin sırası: L3 kayıtları bu sıradan sonrasını bir kaydırıyor. */
export const GOAL_IPO_INDEX = GOALS.findIndex((goal) => goal.kind === 'ipo');

// ------------------------------------------------------------ L4: halka arz

/**
 * Halka arz: şehirde bir kez. Hissenin bir kısmı satılıyor, karşılığı kasaya
 * giriyor. Değerleme SÜREKLİ gelirden (kampanya, olay ve politika hariç):
 * yoksa halka arz her seferinde kampanya ve ihracat atağının üstüne denk
 * getirilirdi ve tek doğru hamle o olurdu.
 *
 * Kalıcı etkisi şehri satarken görünüyor: halka açık şirket daha yüksek
 * değerlemeyle satılıyor, yıldız ×1,2. (İlk taslaktaki "temettü" düştü:
 * oyuncu şirketin kendisi; kendine temettü ödemesi bir şey anlatmıyordu.)
 */
export const IPO_UNLOCK = 1_000_000_000;
/** Satılan hisse payı. */
export const IPO_SHARE = 0.25;
/** Şirket değeri: sürekli gelirin bu kadar saniyesi. */
export const IPO_VALUATION_SECONDS = 3600;
/** Borsadaki hisse adedi (fiyat = değer / adet). */
export const IPO_SHARES = 1_000_000;
/** Halka açık şirket satılırken kazanılan yıldıza çarpan. */
export const LISTED_STAR_MULTIPLIER = 1.2;

// ------------------------------------------------------------ L4: şehir bonusu

/**
 * Her yeni şehrin bir öne çıkan zinciri var: geliri ×2. İlk şehirde yok;
 * ikinciden başlayarak bu sırayla dönüyor. Holding'in her turu aynı yolu
 * yürümesin, açılış sırası her şehirde başka bir zincire ağırlık versin.
 */
export const CITY_FEATURED: readonly ChainId[] = ['coffee', 'fashion', 'leather', 'tech', 'bakery'];
export const CITY_BONUS = 2;

// ------------------------------------------------------------ L4: bildirim

/** "Rakip seni geçti" eşiği: pay bunun altına inince. */
export const OVERTAKE_SHARE = 0.5;
