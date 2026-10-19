import { localizeList } from './localize';
import type { CitySizeId } from './districts';
import type { DifficultyId } from './difficulty';

/**
 * Kariyer rozetleri (Tur 41).
 *
 * Hedef merdiveni bir koşunun içinde yön veriyor; rozetler koşuların
 * üstünde duruyor: oyunun her köşesini (devralma, kriz, konsorsiyum,
 * meclis, holding, senaryo, lig) en az bir kez yaşatmak ve zor olanı
 * (Zor'da zafer, 500. günden önce zafer, tekel) ölçülebilir kılmak.
 *
 * Ödül yok — merdivendeki gerekçeyle aynı: rozet dengeyi oynatmıyor.
 * Rozetler bu cihazda saklanıyor (`packages/ui/src/career.ts`); lig ve
 * senaryo tablolarına dokunmuyor.
 *
 * İki kapsam var. Koşu rozeti tek bir koşuda kazanılıyor (holding'in
 * bütün şehirleri bir koşu). Kariyer rozeti (`total`, senaryo, CEO)
 * bütün koşuların toplamından geliyor.
 *
 * Senaryo kendi yıldızlarını veriyor; büyüme ve zafer rozetleri senaryoda
 * sayılmıyor (`freePlayOnly`): kurulum hazır servet ve şehir veriyor.
 * Rekabet ve şehir rozetleri her oyunda sayılıyor; senaryo onların sahnesini
 * kuruyor, işi oyuncu yapıyor. Sayaçlar devir gününden başlıyor.
 *
 * Eşikler ölçümden (`pnpm longrun`, üç tohum, Dengeli): vekil 625–730.
 * günde kazanıyor, 1.440. günde ~300 M ₺'de. Çeyrek milyar uzun oyunun
 * rozeti; yarım milyar holding'in toplamıyla; Yıldırım vekilin en iyisinden
 * %20 hızlı.
 */
export type AchievementGroup = 'growth' | 'victory' | 'rivalry' | 'city' | 'career';

export type AchievementKind =
  /** Koşunun değeri (holding'in toplamı) ≥ hedef. */
  | 'worth'
  /** Tek bir şehirdeki şirketin değeri ≥ hedef. */
  | 'companyWorth'
  /** Bir şehirde zafer; `victory` süzgeciyle. */
  | 'victory'
  /** Bir şehirde hiç rakip kalmadı. */
  | 'monopoly'
  /** Koşuda devralınan şirket ≥ hedef. */
  | 'acquisitions'
  /** Halka arz. */
  | 'ipo'
  /** Holding'in açtığı şehir ≥ hedef. */
  | 'cities'
  /** Holding hedefleri tamam: üç şehirde zafer. */
  | 'holding'
  /** Bitmiş bir şehir projesinin ana sponsoru. */
  | 'sponsor'
  /** Koşunun sayacı (`feat`) ≥ hedef. */
  | 'feat'
  /** Bütün koşuların toplamı (`total`) ≥ hedef. */
  | 'total'
  /** Her senaryoda en az bir yıldız. */
  | 'scenarioEvery'
  /** Senaryo yıldızlarının toplamı ≥ hedef. */
  | 'scenarioStars'
  /** Zafer kazanılan farklı CEO ≥ hedef. */
  | 'ceoVictories';

/** Koşu sayaçları — çekirdeğin `RunFeats` alanları. */
export type AchievementFeat = 'crisesWeathered' | 'crisesGrown' | 'consortiumsBroken' | 'raidsRepelled';

/** Koşuların toplamı. */
export type AchievementTotal = 'motionsWon' | 'contractsDone' | 'auctionsWon' | 'bubbles' | 'quests' | 'leagueRuns';

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  title: string;
  /** Nasıl kazanılır. */
  hint: string;
  kind: AchievementKind;
  target: number;
  feat?: AchievementFeat;
  total?: AchievementTotal;
  /** Zafer süzgeci: en geç gün (şehrin kendi takvimi), en az zorluk, şehir boyutu. */
  victory?: { maxDay?: number; minDifficulty?: DifficultyId; citySize?: CitySizeId };
  /** Senaryoda sayılmıyor. */
  freePlayOnly?: boolean;
}

export const ACHIEVEMENT_GROUPS: AchievementGroup[] = ['growth', 'victory', 'rivalry', 'city', 'career'];

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- Büyüme
  {
    id: 'public_company',
    group: 'growth',
    title: 'Borsada',
    hint: 'Şirketini halka arz et.',
    kind: 'ipo',
    target: 1,
    // Kurtarma'da halka arz açık ve öneriliyor; büyüme rozeti senaryoda sayılmıyor (Codex #70).
    freePlayOnly: true,
  },
  {
    id: 'quarter_billion',
    group: 'growth',
    title: 'Çeyrek milyar',
    hint: "Şirketinin değerini 250 M ₺'ye çıkar.",
    kind: 'companyWorth',
    target: 250_000_000,
    freePlayOnly: true,
  },
  {
    id: 'half_billion',
    group: 'growth',
    title: 'Yarım milyar',
    hint: "Holding'in toplam değerini 500 M ₺'ye çıkar: bütün şehirler ve kasa.",
    kind: 'worth',
    target: 500_000_000,
    freePlayOnly: true,
  },
  {
    id: 'second_city',
    group: 'growth',
    title: 'İkinci şehir',
    hint: 'Holding kur: başka bir şehirde de şirket aç.',
    kind: 'cities',
    target: 2,
    freePlayOnly: true,
  },
  {
    id: 'empire',
    group: 'growth',
    title: 'İmparatorluk',
    hint: "Holding'in üç şehrinde zafer kazan.",
    kind: 'holding',
    target: 1,
    freePlayOnly: true,
  },
  // ---- Zafer
  {
    id: 'first_victory',
    group: 'victory',
    title: 'Şehrin sahibi',
    hint: 'Bir şehirde zafer kazan: zorluğun hedef değeri ve birincilik ya da bütün rakipleri devralmak.',
    kind: 'victory',
    target: 1,
    victory: {},
    freePlayOnly: true,
  },
  {
    id: 'blitz',
    group: 'victory',
    title: 'Yıldırım',
    hint: "Dengeli ya da Zor'da, şehrin 500. gününden önce zafer kazan.",
    kind: 'victory',
    target: 1,
    victory: { maxDay: 500, minDifficulty: 'normal' },
    freePlayOnly: true,
  },
  {
    id: 'hard_victory',
    group: 'victory',
    title: 'Zor yoldan',
    hint: "Zor'da zafer kazan.",
    kind: 'victory',
    target: 1,
    victory: { minDifficulty: 'hard' },
    freePlayOnly: true,
  },
  {
    id: 'big_city',
    group: 'victory',
    title: 'Büyük şehrin sahibi',
    hint: 'Büyük şehirde zafer kazan.',
    kind: 'victory',
    target: 1,
    victory: { citySize: 'large' },
    freePlayOnly: true,
  },
  {
    id: 'three_ceos',
    group: 'victory',
    title: 'Üç CEO',
    hint: 'Üç farklı CEO ile zafer kazan.',
    kind: 'ceoVictories',
    target: 3,
    freePlayOnly: true,
  },
  // ---- Rekabet
  {
    id: 'first_takeover',
    group: 'rivalry',
    title: 'İlk devralma',
    hint: 'Bir rakibin hisselerinin yarısından fazlasını topla: şirketi senin olur.',
    kind: 'acquisitions',
    target: 1,
  },
  {
    id: 'serial_acquirer',
    group: 'rivalry',
    title: 'Seri alıcı',
    hint: 'Tek bir koşuda beş şirket devral.',
    kind: 'acquisitions',
    target: 5,
  },
  {
    id: 'monopoly',
    group: 'rivalry',
    title: 'Tekel',
    hint: 'Bir şehirde tek şirket kal: bütün rakipleri devral.',
    kind: 'monopoly',
    target: 1,
  },
  {
    id: 'shield',
    group: 'rivalry',
    title: 'Kalkan',
    hint: "Hisselerinin %25'ini toplayan bir baskıncıyı %10'un altına geri it.",
    kind: 'feat',
    feat: 'raidsRepelled',
    target: 1,
  },
  {
    id: 'consortium_broken',
    group: 'rivalry',
    title: 'Konsorsiyumu dağıt',
    hint: 'Sana karşı kurulan rakip ortaklığını dağıt: değerinle, yatırımınla ya da kalkanla.',
    kind: 'feat',
    feat: 'consortiumsBroken',
    target: 1,
  },
  // ---- Şehir
  {
    id: 'weathered',
    group: 'city',
    title: 'Fırtınayı atlat',
    hint: 'Bir krizi ayakta bitir.',
    kind: 'feat',
    feat: 'crisesWeathered',
    target: 1,
  },
  {
    id: 'storm_grower',
    group: 'city',
    title: 'Fırtınada büyü',
    hint: 'Bir krizi, başladığı günden daha değerli bitir.',
    kind: 'feat',
    feat: 'crisesGrown',
    target: 1,
  },
  {
    id: 'city_sponsor',
    group: 'city',
    title: 'Şehrin sponsoru',
    hint: 'Bir şehir projesinin ana sponsoru ol.',
    kind: 'sponsor',
    target: 1,
  },
  {
    id: 'council_voice',
    group: 'city',
    title: 'Meclisin sesi',
    hint: 'Lobi yaptığın taraf beş oylamada kazansın (bütün koşular).',
    kind: 'total',
    total: 'motionsWon',
    target: 5,
  },
  {
    id: 'trusted_contractor',
    group: 'city',
    title: 'Belediyenin güvendiği',
    hint: 'Beş belediye sözleşmesi teslim et (bütün koşular).',
    kind: 'total',
    total: 'contractsDone',
    target: 5,
  },
  {
    id: 'auctioneer',
    group: 'city',
    title: 'Açık artırma',
    hint: 'On parsel ihalesi kazan (bütün koşular).',
    kind: 'total',
    total: 'auctionsWon',
    target: 10,
  },
  {
    id: 'bubble_hunter',
    group: 'city',
    title: 'Balon avcısı',
    hint: 'Elli fırsat balonu yakala (bütün koşular).',
    kind: 'total',
    total: 'bubbles',
    target: 50,
  },
  {
    id: 'quest_master',
    group: 'city',
    title: 'Görev adamı',
    hint: 'Yirmi beş aylık görev tamamla (bütün koşular).',
    kind: 'total',
    total: 'quests',
    target: 25,
  },
  // ---- Kariyer
  {
    id: 'scenario_tour',
    group: 'career',
    title: 'Senaryo turu',
    hint: 'Her senaryodan en az bir yıldız al.',
    kind: 'scenarioEvery',
    target: 1,
  },
  {
    id: 'scenario_perfect',
    group: 'career',
    title: 'Kusursuz',
    hint: 'Senaryoların bütün yıldızlarını topla.',
    kind: 'scenarioStars',
    target: 21,
  },
  {
    id: 'league_player',
    group: 'career',
    title: 'Ligde',
    hint: "Tohum Ligi'nde bir haftayı sonuna kadar oyna.",
    kind: 'total',
    total: 'leagueRuns',
    target: 1,
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// Metin alanları etkin dile bağlı; Türkçe yedek nesnenin kendi metni.
localizeList(ACHIEVEMENTS, 'achievement', ['title', 'hint']);
