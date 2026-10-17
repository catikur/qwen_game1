import { localizeList } from './localize';

/**
 * Fırsat balonları ve görev panosu (Tur 37c).
 *
 * İki sistem de "ekrana bakmayı ödüllendirmek" için var. Kart, kampanya
 * ve kriz şehre bir şey YAPIYOR; oyuncu yalnızca karşılık veriyor. Balon
 * ve görev ise oyuncunun dikkatini ve kısa vadeli hamlesini ödüllendiriyor:
 * şehrin üstünde beliren bir sipariş, "bu ay iki arsa al" gibi bir hedef.
 *
 * Balon Lite'taki dokun-yakala balonunun ana oyundaki karşılığı. Lite'ta
 * süre saniyeyle ölçülüyordu; burada simülasyon günle ilerlediği (ve lig
 * tekrarı günü tekrarladığı) için ömür de gün. Duraklatınca balon bekliyor.
 */

// ---------------------------------------------------------------- balonlar

export type BubbleKind = 'order' | 'vip' | 'rush' | 'investor' | 'parcel';

export type BubbleReward =
  /** Bağlandığı mağazanın günlük cirosunun katı (yatırımcıda şirketin kâr eğilimi). */
  | { kind: 'cash'; days: number }
  /** Bağlandığı mağazanın kategorisinde süreli çekicilik. */
  | { kind: 'boost'; multiplier: number; days: number }
  /** Balonun durduğu parsel indirimli satın alınıyor. */
  | { kind: 'parcel'; discount: number };

export interface BubbleDef {
  id: BubbleKind;
  /** Balonun üstündeki kısa ad. */
  title: string;
  /** Yakalanınca çıkan cümle; {amount}, {category}, {days} yer tutucuları. */
  caught: string;
  /** Balon nereye bağlanıyor: oyuncunun bir mağazası, merkezi ya da boş bir parsel. */
  anchor: 'outlet' | 'hq' | 'tile';
  weight: number;
  reward: BubbleReward;
}

export const BUBBLES: BubbleDef[] = [
  {
    id: 'order',
    title: 'Toplu sipariş',
    caught: 'Toplu sipariş teslim edildi: {amount}',
    anchor: 'outlet',
    weight: 5,
    reward: { kind: 'cash', days: 2 },
  },
  {
    id: 'vip',
    title: 'VIP müşteri',
    caught: 'VIP müşteri bütün rafı aldı: {amount}',
    anchor: 'outlet',
    weight: 2,
    reward: { kind: 'cash', days: 4 },
  },
  {
    id: 'rush',
    title: 'Kapıda kuyruk',
    caught: 'Kuyruk sokağa taştı: {category} çekiciliği {days} gün +%20',
    anchor: 'outlet',
    weight: 3,
    reward: { kind: 'boost', multiplier: 1.2, days: 6 },
  },
  {
    id: 'investor',
    title: 'Yatırımcı',
    caught: 'Melek yatırımcı kasaya koydu: {amount}',
    anchor: 'hq',
    weight: 2,
    reward: { kind: 'cash', days: 3 },
  },
  {
    id: 'parcel',
    title: 'İndirimli arsa',
    caught: 'Arsa %30 indirimle senin: {amount} ödendi',
    anchor: 'tile',
    weight: 2,
    reward: { kind: 'parcel', discount: 0.3 },
  },
];

export const BUBBLE_BY_ID: Record<BubbleKind, BubbleDef> = Object.fromEntries(
  BUBBLES.map((bubble) => [bubble.id, bubble]),
) as Record<BubbleKind, BubbleDef>;

export const BUBBLE_TIMING = {
  /** İlk balon: oyuncu ilk mağazasını açmış, rehber bitmiş olsun. */
  firstDay: 24,
  /** İki balon arası (bir öncekinin kapandığı günden). */
  gapDays: [18, 32] as const,
  /**
   * Ömür. Normal hızda (2,6 sn/gün) ~21 sn, en hızlıda ~4 sn — hızlı
   * oynayan küçük ödülü kaçırmayı kabul ediyor; duraklatınca balon bekliyor.
   */
  lifetimeDays: 8,
  /** Nakit ödülün tabanı ve tavanı; bine yuvarlı. */
  amountMin: 15_000,
  amountMax: 1_500_000,
  /** İndirimli arsa: oyuncunun binalarına en çok bu kadar kare uzakta. */
  parcelReach: 3,
  /** İlk üç balonda "dokun" ipucu. */
  hintCount: 3,
};

localizeList(BUBBLES, 'bubble', ['title', 'caught']);

// ---------------------------------------------------------------- görev panosu

/**
 * Görev türleri. Her biri ölçülebilir bir şehir durumu: pano kurulurken
 * taban okunuyor, hedef tabandan türetiliyor ("şu an %18, hedef %23").
 */
export type QuestKind = 'outlets' | 'producer' | 'parcels' | 'share' | 'revenue' | 'cash' | 'overtake' | 'bubble';

export interface QuestDef {
  id: QuestKind;
  /** Panodaki satır; {n}, {category}, {target}, {amount}, {rival} yer tutucuları. */
  title: string;
  /** Satırın altındaki kısa açıklama. */
  hint: string;
  weight: number;
  /** Ödül: kâr eğiliminin bu kadar günü (taban ve tavanla). */
  rewardDays: number;
  /** Kategori görevlerinde ek marka. */
  brand?: number;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'outlets',
    title: '{n} yeni mağaza aç',
    hint: 'Bu ay açılan mağazalar sayılıyor.',
    weight: 4,
    rewardDays: 0.5,
  },
  {
    id: 'producer',
    title: 'Bir üretim tesisi kur',
    hint: 'Çiftlik, maden, fabrika, depo, Ar-Ge ya da pazarlama — mağaza dışında her bina.',
    weight: 3,
    rewardDays: 0.5,
  },
  {
    id: 'parcels',
    title: '{n} arsa satın al',
    hint: 'Boş parsel, ihale ya da devralma — sahip olduğun parsel sayısı artmalı.',
    weight: 3,
    rewardDays: 0.4,
  },
  {
    id: 'share',
    title: '{category} pazarında %{target} paya ulaş',
    hint: 'Pay her gün ölçülüyor; hedefe bir gün dokunman yeter.',
    weight: 4,
    rewardDays: 0.75,
    brand: 0.03,
  },
  {
    id: 'revenue',
    title: 'Günlük ciroyu {amount} üstüne çıkar',
    hint: 'Bütün binaların bir günlük cirosu.',
    weight: 3,
    rewardDays: 0.5,
  },
  {
    id: 'cash',
    title: 'Kasada {amount} biriktir',
    hint: 'Harcamadan biriktirmek de bir hamle: büyük arsa, ihale, savunma.',
    weight: 2,
    rewardDays: 0.4,
  },
  {
    id: 'overtake',
    title: 'Net değerde {rival} şirketini geç',
    hint: 'Sıralamada hemen önündeki rakip.',
    weight: 3,
    rewardDays: 0.75,
  },
  {
    id: 'bubble',
    title: 'Bir fırsat balonu yakala',
    hint: 'Şehrin üstünde beliren balona dokun.',
    weight: 2,
    rewardDays: 0.4,
  },
];

export const QUEST_BY_ID: Record<QuestKind, QuestDef> = Object.fromEntries(
  QUESTS.map((quest) => [quest.id, quest]),
) as Record<QuestKind, QuestDef>;

export const QUEST_TIMING = {
  /**
   * Pano takvim ayıyla dönüyor (tarih çubuğundaki ay). İlk pano bu günden
   * sonraki ilk ay başında kuruluyor: ilk ay rehberin ve hedef merdiveninin.
   */
  firstDay: 20,
  /** Panodaki görev sayısı. */
  slots: 3,
  rewardMin: 10_000,
  rewardMax: 2_500_000,
  /** Pay görevi: şimdiki paya eklenen puan ve üst sınır. */
  shareStep: 0.05,
  shareCap: 0.8,
  /** Ciro görevi: bugünkü cironun katı. */
  revenueStep: 1.2,
  /** Biriktirme görevi: kasaya kâr eğiliminin bu kadar günü eklenmeli. */
  cashDays: 15,
  /** Geçme görevi: rakip en çok bu oranda öndeyse (ulaşılabilir hedef). */
  overtakeGap: 0.3,
};

localizeList(QUESTS, 'quest', ['title', 'hint']);
