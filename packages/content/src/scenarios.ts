import { localizeList } from './localize';
import type { CitySizeId } from './districts';
import type { DifficultyId } from './difficulty';
import type { CategoryId } from './types';

/**
 * Senaryo modu (Tur 39): hazır bir başlangıç, tek hedef, süre ve yıldız.
 *
 * Serbest oyun hep aynı yerden başlıyor: boş şehir, 250 bin ₺, dört rakip.
 * Krizler, baskınlar, kredi ve borsa oyunun ortasında anlam kazanıyor;
 * senaryo oyuncuyu doğrudan o ortaya bırakıyor.
 *
 * ŞEHİR KENDİ KENDİNE YAŞAYARAK HAZIRLANIYOR. Her senaryonun sabit bir
 * tohumu ve bir ön tarihi var: rakipler `preludeDays` gün boyunca şehri
 * kuruyor, oyuncu sahnede değil (kurucu kilidiyle korunuyor, bina yok).
 * Sonra kurulum oyuncunun şirketini senaryonun durumuna getiriyor. Aynı
 * senaryo her seferinde aynı şehirde, aynı rakiplerle başlıyor; yıldızlar
 * bu yüzden karşılaştırılabilir.
 *
 * Yıldızlar ya hedefe ulaşma gününden (`days`: az iyi) ya bitişteki
 * öndelikten (`lead`: oyuncunun net değeri / en güçlü rakibinki) geliyor.
 * Eşikler vekil ölçümünden (`packages/core/test/balance.ts`, "Senaryolar").
 */
export type ScenarioId = 'rescue' | 'crisis';

export type ScenarioSetup =
  | {
      kind: 'rescue';
      /** Kasada kalan nakit. */
      cash: number;
      /** Önceki yönetimin şubeleri: rakibin o kategoride en az mağazası olan bölgelerde, kâr ediyorlar. */
      outlets: readonly string[];
      /**
       * Boşa çalışan destek binaları: şirketin hiç mağazası olmayan bir
       * kategoriye odaklı Ar-Ge ve pazarlama. Her gün gider, getirisi yok.
       * (Ölçüm: bu ekonomide mağaza her bölgede kâr ediyor; zararın yeri
       * yanlış yatırım ve borç servisi.)
       */
      idle: { defIds: readonly string[]; focus: CategoryId };
      /** Şubeler için alınmış vadeli kredi: kalan anapara ve vade. */
      loan: { amount: number; termDays: number };
      /** En güçlü baskıncının topladığı pay (0..1). */
      raiderStake: number;
    }
  | {
      kind: 'crisis';
      /** Kasadaki nakit — şirketin bütün varlığı. */
      cash: number;
      crisisId: string;
      /** Uyarıdan krizin başlamasına. Kriz senaryonun son gününde bitiyor. */
      warningDays: number;
    };

export type ScenarioGoal =
  /** Süre içinde net değeri hedefe çıkar (devralınmadan). */
  | { kind: 'netWorth'; target: number }
  /** Sürenin sonunda şehrin en değerli şirketi ol. */
  | { kind: 'leadAtEnd' };

export interface ScenarioStars {
  /** `days`: hedefe kaç günde ulaşıldı (az iyi) · `lead`: bitişte en güçlü rakibe oran (çok iyi). */
  metric: 'days' | 'lead';
  /** İki ve üç yıldızın eşikleri. Bir yıldız: hedefe ulaşmak. */
  two: number;
  three: number;
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  /** Listede başlığın altındaki tek cümle. */
  tagline: string;
  /** Durum: oyuncu neyin ortasına düşüyor. */
  brief: string;
  /** Hedef cümlesi; `{target}` ve `{days}` arayüzde dolduruluyor. */
  goalText: string;
  /** Kurulumun açık maddeleri (zorluk ekranındaki gibi). */
  facts: string[];
  seed: number;
  citySize: CitySizeId;
  difficulty: DifficultyId;
  preludeDays: number;
  /** Süre: senaryonun başladığı günden. */
  days: number;
  goal: ScenarioGoal;
  stars: ScenarioStars;
  setup: ScenarioSetup;
}

export const SCENARIOS: ScenarioDef[] = [
  /*
   * KURTARMA (seed 7, 150 gün ön tarih). Ölçüm: bu ekonomide mağaza her
   * bölgede kâr ediyor (yoklama: 6 mağaza türü × 6 bölge, 150. ve 300.
   * günde hepsi artıda); zararın yeri boşa çalışan destek binaları
   * (Ar-Ge, pazarlama: günde ~2 bin ₺ gider) ve borç. Kredi kaldıracı C
   * notunun sınırında (%40; %50'de not D, kredi çağrılır).
   *
   * Vekil (400 gün, hedef 12 M ₺): hiçbir şey yapmayan, yalnızca
   * savunan ve yalnızca büyüyen 130. günde devralınıyor. Savunup büyüyen
   * 348. günde, boşa çalışan binaları da yıkan 259. günde, her gün
   * savunan ve üç günde bir kuran 243. günde hedefte. 15 günde bir
   * kuran süreyi dolduruyor (7,3 M ₺).
   */
  {
    id: 'rescue',
    title: 'Kurtarma',
    tagline: 'Borçlu, zarar eden, baskın altında bir şirketin başına geç.',
    brief:
      'Önceki yönetim şirketin hiç mağazası olmayan elektronik için iki Ar-Ge merkezi ve iki pazarlama ofisi kurdu; parasını krediyle buldu. Dört küçük şubenin kârı bu yükü taşımıyor ve şehrin en güçlü rakibi hisselerin %30\'unu toplamış.',
    goalText: '{days} gün içinde net değerini {target} değerine çıkar; devralınma.',
    facts: [
      'Binanın penceresinde günlük kârı görünüyor: boşa çalışan binayı yık ya da odağını mağazası olan bir kategoriye çevir.',
      'Baskıncı %50\'yi geçerse şirket gider: kendi hisseni geri al (borsa paneli). Şirket büyüyünce halka arzla yatırımcı da getirebilirsin.',
      'Kredinin vadesi kısa; borç varlıkların yarısını geçerse not D\'ye düşer ve banka krediyi çağırır.',
    ],
    seed: 7,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 150,
    days: 400,
    goal: { kind: 'netWorth', target: 12_000_000 },
    stars: { metric: 'days', two: 300, three: 230 },
    setup: {
      kind: 'rescue',
      cash: 300_000,
      outlets: ['cafe', 'boutique', 'corner_shop', 'barber_shop'],
      idle: { defIds: ['research_center', 'research_center', 'marketing_office', 'marketing_office'], focus: 'electronics' },
      loan: { amount: 450_000, termDays: 180 },
      raiderStake: 0.3,
    },
  },
  /*
   * KRİZİN ORTASINDA (seed 42, 200 gün ön tarih). Ölçüm: durgunluk
   * rakipleri yavaşlatmıyor (mağazalar kapasitede, talep düşüşü satışa
   * inmiyor; liderin net değeri 150 günde 5,9 → ~20 M ₺), fırsatı ucuz
   * inşaat ve gerileyen arsa. Kriz olmadan beş günde bir kuran vekil
   * geride kalıyor (×0,94), krizle önde (×1,05).
   *
   * Vekil (5 M ₺ kasa): kasada bekleyen ×0,28; 15 günde bir kuran ×0,70;
   * beş günde bir kuran ×1,05; üç günde bir kuran ×1,10; buna krizde
   * rakip hissesi alan ×1,14–1,22.
   */
  {
    id: 'crisis',
    title: 'Krizin ortasında',
    tagline: 'Durgunluk bir ay sonra başlıyor; kasan dolu, şirketin yok.',
    brief:
      'Şehir iki yüz gündür büyüyor; rakiplerin zincirleri kurulu. Ekonomistler durgunluk uyarısı veriyor. Sen yeni kurulmuş bir şirketin başındasın: binan yok, kasan dolu.',
    goalText: 'Kriz bittiğinde ({days} gün sonra) şehrin en değerli şirketi ol.',
    facts: [
      'Durgunlukta inşaat %15 ucuzluyor ve arsa her gün biraz geriliyor: nakdi olan için alım zamanı.',
      'Rakipler büyümeyi sürdürüyor; kasada bekleyen para geride kalır.',
      'Bitişte net değerin en güçlü rakibinkini geçmeli.',
    ],
    seed: 42,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 200,
    days: 150,
    goal: { kind: 'leadAtEnd' },
    stars: { metric: 'lead', two: 1.2, three: 1.4 },
    setup: {
      kind: 'crisis',
      cash: 5_000_000,
      crisisId: 'deep_recession',
      warningDays: 30,
    },
  },
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]));

localizeList(SCENARIOS, 'scenario', ['title', 'tagline', 'brief', 'goalText', 'facts']);
