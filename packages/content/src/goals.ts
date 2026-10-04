/**
 * Hedef merdiveni.
 *
 * Değerlendirmenin en zayıf notu "uzun vadeli eğlence"ydi: oyunun
 * kaybetme koşulu vardı (düşmanca devralma) ama kazanma koşulu yoktu, ve
 * ilk yüz günden sonra "sıradaki ne?" sorusunun cevabı tahmin oyunuydu.
 * Merdiven bunu cevaplıyor — her basamak oyunun zaten var olan bir
 * mekaniğini öğretiyor (mağaza, zincir, borsa, devralma) ve son basamak
 * zafer.
 *
 * Basamaklar sırayla GÖSTERİLİR ama sırayla tamamlanmak zorunda değil:
 * bilgili oyuncu 31. günde bir numara olabiliyor (ölçüldü), bunu
 * "henüz sırası gelmedi" diye saymamak haksızlık olurdu. Her basamak
 * tamamlandığı gün kaydediliyor.
 *
 * Ödül yok — bilinçli. Para ödülü dengeyi oynatır ve hedefi bir
 * yükseltme mağazasına çevirir; basamak kendi başına ölçek açıyor.
 */
export type GoalKind = 'outlets' | 'units' | 'netWorth' | 'rank' | 'rivalStake' | 'acquisitions' | 'victory';

export interface GoalDef {
  id: string;
  title: string;
  /** Nasıl yapılır — oyuncunun bir sonraki hamlesi. */
  hint: string;
  kind: GoalKind;
  /** Hedef değer; `victory` için zorluktan okunur, burada yok sayılır. */
  target: number;
}

export const GOALS: GoalDef[] = [
  {
    id: 'first_shop',
    title: 'İlk dükkân',
    hint: 'Boş bir parsel seç, satın al ve bir mağaza kur.',
    kind: 'outlets',
    target: 1,
  },
  {
    id: 'five_shops',
    title: 'Beş şube',
    hint: 'Fırsat lensinin parlattığı bölgelere yayıl.',
    kind: 'outlets',
    target: 5,
  },
  {
    id: 'millionaire',
    title: 'Milyoner',
    hint: 'Şirket değerini 1M ₺ üstüne çıkar.',
    kind: 'netWorth',
    target: 1_000_000,
  },
  {
    id: 'own_supply',
    title: 'Kendi tedarikin',
    hint: 'Zincir kartının önerdiği iki üretim ünitesini kur.',
    kind: 'units',
    target: 2,
  },
  {
    id: 'number_one',
    title: 'Şehrin bir numarası',
    hint: 'Net değerde bütün rakipleri geç.',
    kind: 'rank',
    target: 1,
  },
  {
    id: 'ten_million',
    title: 'On milyon',
    hint: 'Ölçek büyüdükçe büyük mağazalar ve fabrikalar açılır.',
    kind: 'netWorth',
    target: 10_000_000,
  },
  {
    id: 'stakeholder',
    title: 'Hissedar',
    hint: 'Borsadan bir rakibin hisselerinin dörtte birini topla.',
    kind: 'rivalStake',
    target: 0.25,
  },
  {
    id: 'fifty_million',
    title: 'Elli milyon',
    hint: 'Zincirini kapat, rafını doğru ürünle doldur.',
    kind: 'netWorth',
    target: 50_000_000,
  },
  {
    id: 'acquirer',
    title: 'Devralma',
    hint: 'Bir rakibin hisselerinin yarısından fazlasını topla — şirketi senin olur.',
    kind: 'acquisitions',
    target: 1,
  },
  {
    id: 'tycoon',
    title: 'Şehrin sahibi',
    hint: 'Zafer: zorluğun hedef değerine ulaş ve bir numara ol — ya da bütün rakipleri devral.',
    kind: 'victory',
    target: 0,
  },
];

export const GOAL_BY_ID: Record<string, GoalDef> = Object.fromEntries(GOALS.map((g) => [g.id, g]));
