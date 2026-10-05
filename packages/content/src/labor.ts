import type { NpcTrait } from './types';

/**
 * İşgücü: bölgenin iş piyasası, şirketin ücret politikası, sendika.
 *
 * Ücret giderin %12–15'i ve Tur 17'ye kadar sabit bir satırdı: bölgenin
 * gelir düzeyiyle çarpılıp her gün aynı yazılıyordu. Ölçüm üç şey
 * gösterdi: (1) sanayi bölgelerinde iş/nüfus oranı 0,5–0,74'e çıkıyor ve
 * bunun hiçbir bedeli yok, (2) oyuncu 360. günde 2.000, 900. günde 4.400
 * kişi çalıştırıyor ama bu kalabalığın bir sesi yok, (3) zam tek başına
 * hafif bir etki — oyunu değiştiren şey grev ve birikerek büyüyen toplu
 * sözleşme.
 *
 * İki ilke:
 *   - GÖRÜNÜR BASKI: sendika talebi bir zarla gelmiyor. Baskı göstergesi
 *     her gün dolar ve dolduğunda talep masaya gelir; oyuncu yaklaştığını
 *     görür. Zar yalnızca talebin küçük oynamasında ve masadaki cevabın
 *     sonucunda, o da dışsal (tohum ^ gün).
 *   - HERKES AYNI KURALLA: rakiplerin de sendikası var, doktrinlerine göre
 *     cevap veriyorlar ve grevleri haber oluyor.
 */
export type WagePolicy = 'low' | 'market' | 'high';
export type UnionResponse = 'accept' | 'compromise' | 'reject';

export interface WagePolicyDef {
  id: WagePolicy;
  name: string;
  /** Ücret çarpanı. */
  wage: number;
  /** Mağazalarda hizmet kalitesi: çekiciliğe çarpan. */
  service: number;
  /** Sendika baskısının birikme hızı. */
  pressure: number;
  /** Uzlaşma teklifinin kabul edilme ihtimaline eklenen. */
  trust: number;
  /** Bu politikadayken talebe eklenen zam. */
  demandBonus: number;
  blurb: string;
}

export const WAGE_POLICIES: Record<WagePolicy, WagePolicyDef> = {
  low: {
    id: 'low',
    name: 'Düşük',
    wage: 0.88,
    service: 0.96,
    pressure: 1.4,
    trust: -0.2,
    demandBonus: 0.01,
    blurb: 'Ücret %12 düşük. Mağaza hizmeti zayıflar, sendika baskısı hızlı birikir.',
  },
  market: {
    id: 'market',
    name: 'Piyasa',
    wage: 1,
    service: 1,
    pressure: 1,
    trust: 0,
    demandBonus: 0,
    blurb: 'Bölgenin ödediği kadar.',
  },
  high: {
    id: 'high',
    name: 'Yüksek',
    wage: 1.1,
    service: 1.04,
    pressure: 0.5,
    trust: 0.15,
    demandBonus: 0,
    blurb: 'Ücret %10 yüksek. Mağaza hizmeti iyileşir, sendika yavaş ve uzlaşmaya açık.',
  },
};

export const LABOR = {
  /**
   * Bölge ücret endeksi: iş/nüfus oranı `densityFree`'nin üstüne çıktıkça
   * `densitySlope` hızıyla artar, `indexCap`'te durur. 30 günlük üstel
   * ortalamayla yürür — fabrika açıldığı gün ücretler zıplamaz.
   */
  densityFree: 0.25,
  densitySlope: 0.5,
  indexCap: 1.35,
  indexSmoothingDays: 30,
  /** Bu kadar çalışanın altında sendika yok. */
  minEmployees: 150,
  /** Günlük baskı artışı (1.000 çalışan, piyasa ücreti, gevşek piyasada). */
  pressurePerDay: 0.004,
  pressureFullAt: 1000,
  /** Sıkışık iş piyasası baskıyı hızlandırır: (endeks − 1) başına. */
  tightnessPressure: 2,
  /** Talep: taban + kâr marjına bağlı pay (marj `marginFull`'da tam). */
  demandBase: 0.05,
  demandMargin: 0.04,
  marginFull: 0.2,
  demandJitter: 0.01,
  /** Cevap süresi; süre dolarsa cevap "Ret" sayılır. */
  deadlineDays: 10,
  /** Uzlaşmada teklif edilen oran ve sendikanın kabul ihtimali. */
  compromiseShare: 0.5,
  compromiseOdds: 0.6,
  /** Son cevabı "Ret" olan şirkete güven azalır (bir yıl). */
  hardlinePenalty: 0.15,
  hardlineMemoryDays: 360,
  /** Yüksek ücretin güven primi ancak bu kadar gün tutulunca işler. */
  trustAfterDays: 90,
  /** Ret sonrası grev ihtimali, politikaya göre. */
  strikeOdds: { low: 0.9, market: 0.7, high: 0.5 } as Record<WagePolicy, number>,
  /** Grev: süre, çalışan kapasite oranı, sonunda imzalanan zam oranı. */
  strikeDays: 12,
  strikeCapacity: 0.35,
  strikeSettlement: 0.6,
  /** Grev olmadan atlatılan ret baskıyı bu orana indirir. */
  rejectPressureKeep: 0.5,
  /** Uzlaşmadan sonra kalan baskı. */
  compromisePressureKeep: 0.2,
  /** Politika değişikliği soğuması. */
  policyCooldownDays: 30,
} as const;

/** Rakiplerin ücret doktrini: politika ve masadaki cevap. */
export const NPC_LABOR: Record<NpcTrait, { policy: WagePolicy; response: UnionResponse }> = {
  price_cutter: { policy: 'low', response: 'reject' },
  premium: { policy: 'high', response: 'accept' },
  tech: { policy: 'high', response: 'accept' },
  expansionist: { policy: 'market', response: 'compromise' },
  landlord: { policy: 'market', response: 'compromise' },
};
