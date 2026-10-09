import type { NpcTrait } from './types';

/**
 * Sermaye piyasası: halka arz ve bedelli sermaye artırımı.
 *
 * Tur 18 krediyi getirdi: sabit taksit, not, haciz riski. Sermaye
 * artırımı bunun karşıtı. Taksit yok, risk yok; bedeli KALICI ORTAKLIK.
 * Yeni hisseler dışarıdaki yatırımcıların olur ve şirket değerinin o payı
 * artık oyuncunun net değerine girmez. Bugün alınan nakit yarının bütün
 * büyümesinden pay vererek ödenir.
 *
 * Zamanlama gerçek bir karar: piyasa şirketi defter değerinin üstünde
 * fiyatlıyorsa (güven çarpanı), ihraç pahalıdan satmak demek ve net değer
 * ihraç günü artabilir. Prim düşükken ihraç, şirketin bir parçasını ucuza
 * vermek.
 *
 * Savunma yanı da var: yeni hisse baskıncının payını sulandırır, kontrol
 * eşiği büyür. Geri alımdan farkı yönü: geri alım nakit harcar, ihraç
 * nakit getirir; bedeli ortaklık.
 */
export const ISSUANCE = {
  /** Halka arz için en az bu kadar defter değeri. */
  minBook: 1_000_000,
  /** Bir ihraçta en fazla mevcut hisse adedinin bu oranı. */
  maxPerIssue: 0.25,
  /** En az bu kadar hisse. */
  minShares: 100,
  /** İhraç fiyatı piyasa fiyatının bu kadar altında (yatırımcının payı). */
  discount: 0.1,
  /** İki ihraç arasında en az bu kadar gün. */
  cooldownDays: 180,
  /**
   * Savunma ihracı (Tur 21): tek bir hissedarın payı bu eşiği geçmişse
   * bekleme süresi aranmaz. Kurucu tabanı ve ihraç başına tavan geçerli.
   */
  defenseAt: 0.3,
  /** Kurucu payı bunun altına inemez — yatırımcılar şirketin çoğunluğu olamaz. */
  minFounderShare: 0.51,
} as const;

export interface NpcIssuanceDoctrine {
  /** Büyüme ihracı: piyasa primliyken ve nakit sıkışıkken. */
  growth: { size: number; minConfidence: number; cashTight: number } | null;
  /** Baskına karşı ihraç: payı bu eşiği geçen baskıncı varsa. */
  defenseAt: number | null;
}

/**
 * Rakiplerin ihraç doktrini.
 *
 * Ölçüm halka arzın bu ekonomide bir BÜYÜME aracı olmadığını gösterdi:
 * nakit nadiren bağlayıcı, kalıcı ortaklık pahalı. Ama bir KONTROL aracı:
 * kurumsal yatırımcı payı dolaşımda olmadığı için baskına karşı geri
 * alımdan güçlü bir kalkan. Bağımsızlığına düşkün iki kişilik (premium,
 * teknoloji) baskına ihraçla cevap veriyor; diğerleri geri alımla.
 * Büyüme ihracı yalnızca genişlemeci ve teknolojide, nadiren.
 */
export const NPC_ISSUANCE: Record<NpcTrait, NpcIssuanceDoctrine> = {
  expansionist: { growth: { size: 0.15, minConfidence: 1.4, cashTight: 0.2 }, defenseAt: null },
  tech: { growth: { size: 0.15, minConfidence: 1.5, cashTight: 0.2 }, defenseAt: 0.3 },
  premium: { growth: null, defenseAt: 0.3 },
  landlord: { growth: null, defenseAt: null },
  price_cutter: { growth: null, defenseAt: null },
};
