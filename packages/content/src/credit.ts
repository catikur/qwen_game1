import type { NpcTrait } from './types';

/**
 * Banka: kredili hesap, ticari kredi, arsa teminatlı kredi.
 *
 * Tur 17'ye kadar tek bir "otomatik kredi" vardı: nakit eksiye düşünce
 * açık borca yazılıyor, %8 faiz işliyor ve borç HİÇ geri ödenmiyordu
 * (kasaya para girse bile). Ölçüm ikinci sorunu gösterdi: kimse krediye
 * ihtiyaç duymuyor — vekil nakdinin en fazla yarısını harcıyor ve 240.
 * günde 2 M ₺ nakitle oturuyor. Kredinin anlamlı olduğu tek yer erken
 * oyun: ilk 250 bin ₺'yi ikiye katlamak bileşik büyümeyi öne çeker.
 *
 * Bu yüzden kredi bir hızlandırıcı, ama bedeli gerçek:
 *   - Taksit sabit, ciro değil. Durgunlukta ya da kötü bir yatırımda
 *     taksit kasadan çıkmaya devam eder.
 *   - Kasa eksiye düşerse kredili hesap devreye girer: pahalı ve kasaya
 *     giren her kuruşla ÖNCE o kapanır.
 *   - Kredili hesap limiti aşılırsa banka ihtar çeker; süre dolarsa haciz:
 *     önce boş arsalar, sonra zarar eden binalar, en son teminat satılır.
 *   - Kredi notu (A–D) kaldıraçtan ve kredili hesapta geçen günlerden
 *     hesaplanır; faiz farkını ve limiti o belirler. Not D'ye düşerse
 *     banka kredileri muaccel kılar: kalan anapara kredili hesaba geçer.
 */
export type CreditRating = 'A' | 'B' | 'C' | 'D';
export type LoanKind = 'term' | 'secured';

export interface CreditRatingDef {
  id: CreditRating;
  /** Taban faizin üstüne eklenen yıllık fark. */
  spread: number;
  /** Toplam borç limiti: brüt varlığın bu oranı (taban limitle birlikte). */
  limitRatio: number;
  /** Kredili hesap limiti: brüt varlığın bu oranı. */
  overdraftRatio: number;
  blurb: string;
}

/*
 * Limitler ilk sürümde iki katıydı (A %50, sert tavan %70) ve ölçüm
 * krediyi BASKIN strateji yaptı: her beş günde limitin boşluğunu çeken
 * vekil 720. günde %36 önde bitti, rakiplerin toplam değeri yarıya indi.
 * Sebep ekonominin kendisi: mağaza 60–150 günde dönüyor, yıllık %10'luk
 * para bedava. Kaldıraç payını sınırlamak (A %30, tavan %45), başvuru
 * soğuması ve dosya masrafı krediyi bir hızlandırıcıya indiriyor.
 */
export const CREDIT_RATINGS: Record<CreditRating, CreditRatingDef> = {
  A: { id: 'A', spread: 0.01, limitRatio: 0.3, overdraftRatio: 0.15, blurb: 'Banka kapıda bekliyor.' },
  B: { id: 'B', spread: 0.03, limitRatio: 0.2, overdraftRatio: 0.1, blurb: 'Sağlam ama dikkatle izleniyor.' },
  C: { id: 'C', spread: 0.06, limitRatio: 0.1, overdraftRatio: 0.06, blurb: 'Kredi pahalı ve az.' },
  D: { id: 'D', spread: 0.12, limitRatio: 0, overdraftRatio: 0.03, blurb: 'Yeni kredi yok, krediler muaccel. Kredili hesap dar.' },
};

export const CREDIT = {
  /** Merkez bankası taban faizi (yıllık). Eski otomatik kredinin oranı. */
  baseRate: 0.08,
  /** Kredili hesap primi — en pahalı para. */
  overdraftPremium: 0.1,
  /** Vade primi (gün → ek yıllık faiz). */
  terms: [
    { days: 180, premium: 0 },
    { days: 360, premium: 0.005 },
    { days: 720, premium: 0.01 },
  ],
  /** Teminatlı kredi: faiz farkı yarıya iner, ayrıca indirim. */
  securedDiscount: 0.015,
  /** Teminatlı kredide arsa değerinin karşılık oranı. */
  loanToValue: 0.6,
  /** Her şirketin, varlığı ne olursa olsun alabildiği taban limit. */
  baseLimit: 150_000,
  baseOverdraft: 100_000,
  /** Toplam borç, brüt varlığın bu oranını hiçbir koşulda aşamaz. */
  hardLeverage: 0.45,
  minLoan: 20_000,
  /** Dosya masrafı: anaparanın bu oranı, çekildiği gün faiz giderine. */
  originationFee: 0.01,
  /** İki kredi başvurusu arasında en az bu kadar gün. */
  applyCooldownDays: 30,
  /**
   * Not eşikleri. Kaldıraç = borç / brüt varlık; kredili hesap günü,
   * son ~90 günün üstel sayacı.
   */
  ratingA: { leverage: 0.15, overdraftDays: 5 },
  ratingB: { leverage: 0.3, overdraftDays: 20 },
  ratingC: { leverage: 0.5 },
  overdraftMemoryDays: 90,
  /** Kredili hesap limit üstündeyken ihtar süresi; dolarsa haciz. */
  graceDays: 15,
  /** Haciz kredili hesabı limitin bu oranına indirene kadar satar. */
  seizeTarget: 0.8,
  /** Hacizde satış iskontosu (piyasa satışının üstüne). */
  seizeHaircut: 0.85,
  /** Hacizden sonra not bu kadar gün D kalır. */
  defaultMemoryDays: 180,
} as const;

/**
 * Rakiplerin borç doktrini. `maxLeverage` sıfırsa hiç borçlanmaz.
 * Borçlanma yalnızca A/B notunda ve nakit sıkışıkken (kasa brüt
 * varlığın `cashTight` oranının altında).
 */
export const NPC_CREDIT: Record<NpcTrait, { maxLeverage: number; kind: LoanKind; termDays: number; cashTight: number }> = {
  expansionist: { maxLeverage: 0.35, kind: 'term', termDays: 360, cashTight: 0.25 },
  landlord: { maxLeverage: 0.4, kind: 'secured', termDays: 720, cashTight: 0.2 },
  tech: { maxLeverage: 0.2, kind: 'term', termDays: 360, cashTight: 0.15 },
  premium: { maxLeverage: 0.15, kind: 'term', termDays: 180, cashTight: 0.15 },
  price_cutter: { maxLeverage: 0, kind: 'term', termDays: 180, cashTight: 0 },
};
