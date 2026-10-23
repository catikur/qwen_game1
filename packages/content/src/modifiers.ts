import { localizeList } from './localize';
import { getDifficulty } from './difficulty';
import type { DifficultyDef, DifficultyId } from './difficulty';

/**
 * Zorluk değiştiricileri (Tur 45): serbest oyunda isteğe bağlı kurallar.
 *
 * Zorluk kademesi gibi açıkça yazılı birkaç ayar; kurulum ekranında
 * hepsinin etkisi söyleniyor. Kademeye eklenir, onun yerine geçmez:
 * Dengeli + Fırtınalı yıllar, Dengeli'nin bütün ayarları ve iki kat sık
 * kriz demek. Senaryoda oyuncu seçmiyor: senaryo kuralıyla geliyor (Tur 60,
 * `ScenarioDef.modifiers`; yıldızları kuralla ölçüldü). Tohum Ligi'nde de
 * seçmiyor: her hafta biri, herkese aynı (haftanın kuralı, Tur 53, `leagueRule`).
 *
 * `weight` kuralın zorluk çarpanına katkısı (zafer ekranı ve kariyer):
 * çarpan 1 + ağırlıkların toplamı. Ağırlıklar ölçümden (Dengeli, 8 tohum,
 * DURUM Tur 45): bilgili vekilin zaferinin gecikmesiyle savunmasız yavaş
 * vekilin erken düşüşünün ortalaması, 0,05'e yuvarlanmış. Dördü birlikte
 * ölçülen ~%23, ağırlıkların toplamı %35: kurallar üst üste binmiyor.
 */
export type ModifierId = 'storms' | 'hungry_rivals' | 'tight_credit' | 'scarce_land';

export interface ModifierDef {
  id: ModifierId;
  name: string;
  blurb: string;
  /** Kurulum ekranında gösterilen, oyuncunun bileceği farklar. */
  facts: string[];
  weight: number;
}

/** Kural değerleri: oyun bunları okuyor, metinler bunları yazıyor. */
export const MODIFIER_RULES = {
  /**
   * Fırtınalı yıllar: kriz takvimi yarıya ve durgunlukta inşaat ucuzlamıyor.
   * Yalnız sıklık oyunu kolaylaştırıyordu: nakdi olan oyuncu ucuz inşaatla
   * büyüyor, ilk ölçümde bilgili vekil daha erken kazandı (DURUM Tur 45).
   */
  storms: { firstDay: 160, firstSpread: 60, gapDays: [150, 240] as const, buildDiscount: false },
  /** Aç gözlü rakipler: yatırım cesareti ve baskının erken başlaması. */
  hungryRivals: { budgetMultiplier: 1.3, raidWarmupMultiplier: 0.65 },
  /**
   * Sıkı banka: yalnız oyuncuya. Kuruluş sermayesinin yarısı 360 günlük
   * krediden; faiz farkı ve kredi limiti sonraki kredilerde de. Yalnız faiz
   * ve limit kredi çekmeyen oyuncuya hiç dokunmuyordu (DURUM Tur 45).
   */
  tightCredit: { rateDelta: 0.04, limitMultiplier: 0.6, startingLoanShare: 0.5, startingLoanDays: 360 },
  /**
   * Kıt arsa: arsanın satın alma fiyatı ve kilitli bölgelerin imar günü
   * (herkese). Yalnız fiyat hem oyuncuyu hem arsa toplayan rakipleri
   * yavaşlatıyordu; etkisi gürültüde kalıyordu (DURUM Tur 45).
   */
  scarceLand: { priceMultiplier: 1.7, unlockDelay: 1.5 },
} as const;

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'storms',
    name: 'Fırtınalı yıllar',
    blurb: 'Krizler iki kat sık gelir, ilki erken; durgunluk ucuz inşaat getirmez.',
    facts: ['İlk kriz uyarısı 160–220. gün', 'Kriz bitince yenisi 150–240 gün sonra', 'Durgunlukta inşaat ucuzlamaz'],
    weight: 0.05,
  },
  {
    id: 'hungry_rivals',
    name: 'Aç gözlü rakipler',
    blurb: 'Rakipler daha cesur yatırır ve baskına daha erken başlar.',
    facts: ['Rakipler %30 daha cesur yatırır', 'Baskınlar üçte bir erken başlar'],
    weight: 0.05,
  },
  {
    id: 'tight_credit',
    name: 'Sıkı banka',
    blurb: 'Sermayenin yarısı bankadan; banka sana temkinli. Rakiplerin kredisi aynı.',
    facts: ['Kuruluş sermayesinin yarısı 360 günlük kredi', 'Kredi ve kredili hesap faizi 4 puan yüksek', 'Kredi limitleri %40 düşük'],
    weight: 0.2,
  },
  {
    id: 'scarce_land',
    name: 'Kıt arsa',
    blurb: 'Arsa herkes için pahalı ve az; her parsel daha uzun düşünülür.',
    facts: ['Arsa fiyatları %70 yüksek, ihale taban fiyatı da', 'Kilitli bölgeler %50 geç imara açılır'],
    weight: 0.05,
  },
];

export const MODIFIER_BY_ID: Record<ModifierId, ModifierDef> = Object.fromEntries(
  MODIFIERS.map((modifier) => [modifier.id, modifier]),
) as Record<ModifierId, ModifierDef>;

/** Katalog sırasıyla, tekrarsız ve bilinen kurallar (kayıttan ya da kurulumdan gelen liste). */
export function normalizeModifiers(ids: readonly string[] | undefined): ModifierId[] {
  if (!ids || ids.length === 0) return [];
  return MODIFIERS.filter((modifier) => ids.includes(modifier.id)).map((modifier) => modifier.id);
}

export function hasModifier(modifiers: readonly ModifierId[] | undefined, id: ModifierId): boolean {
  return modifiers?.includes(id) ?? false;
}

/** Zorluk çarpanı: 1 + kuralların ağırlığı. Kural yoksa 1. */
export function modifierMultiplier(modifiers: readonly ModifierId[] | undefined): number {
  let total = 1;
  for (const id of normalizeModifiers(modifiers)) total += MODIFIER_BY_ID[id].weight;
  return Math.round(total * 100) / 100;
}

/**
 * Kademenin kurallarla düzeltilmiş hâli. Kural yoksa kademenin kendisi
 * (aynı nesne): değiştiricisiz oyunda hiçbir sayı değişmiyor.
 */
export function difficultyWith(id: DifficultyId | undefined, modifiers: readonly ModifierId[] | undefined): DifficultyDef {
  const base = getDifficulty(id);
  if (!hasModifier(modifiers, 'hungry_rivals')) return base;
  const rules = MODIFIER_RULES.hungryRivals;
  return {
    ...base,
    rivalBudgetMultiplier: base.rivalBudgetMultiplier * rules.budgetMultiplier,
    raidWarmupDays: Math.round(base.raidWarmupDays * rules.raidWarmupMultiplier),
  };
}

// Metin alanları etkin dile bağlı (Tur 23); Türkçe yedek nesnenin kendi metni.
localizeList(MODIFIERS, 'modifier', ['name', 'blurb', 'facts']);
