import { localizeRecord } from './localize';
import { translate } from './messages';

/**
 * Rakipler 2.0 (Tur 59): CEO'nun mizacı, oyuncuya karşı hafıza, tepkiler.
 *
 * Rakiplerin bir doktrini (`trait`: ne yaptıkları) vardı, ama oyuncunun
 * ne yaptığını hatırlamıyorlardı. Hisselerini toplayan, ihalede onları
 * geçen, mecliste karşılarında duran oyuncu ile mağazalarını taşıyan
 * oyuncu aynı muameleyi görüyordu.
 *
 * Şimdi her rakibin oyuncuya karşı bir İLİŞKİ puanı var (−100..100):
 *   - oyuncunun hamleleri (aşağıdaki olaylar) puanı kaydırıyor;
 *   - puan zamanla sıfıra doğru sönüyor;
 *   - kaydırmanın ve sönümün hızını CEO'nun mizacı belirliyor.
 *
 * Puan eşiği geçince rakip oyuncuya özel davranıyor:
 *   - HUSUMET: fiyat savaşını (kampanya) sana açıyor ve erkenden; mecliste
 *     senin bağışına karşı bağış yapıyor; ihalede senin teklifini
 *     inadına, değerlemesinin üstüne kadar geçiyor.
 *   - İTTİFAK: sana kampanya açmıyor, konsorsiyuma katılmıyor; mecliste
 *     senin yanında bağış yapıyor; ihalede senin teklifinin üstüne
 *     çıkmıyor.
 *
 * Görünmez zar yok: puan, olaylar ve eşikler rakibin dosyasında yazıyor.
 */

export type TemperamentId = 'vindictive' | 'pragmatic' | 'loyal' | 'proud';

export interface TemperamentDef {
  id: TemperamentId;
  name: string;
  description: string;
  /** Düşmanca olayların çarpanı. */
  hostile: number;
  /** Dostça olayların çarpanı. */
  friendly: number;
  /** Günlük sönüm (puan): eksi puan sıfıra doğru bu kadar. */
  fadeHostile: number;
  /** Günlük sönüm (puan): artı puan sıfıra doğru bu kadar. */
  fadeFriendly: number;
  /** Gurur: ihalede geçilmek ve kampanyası geri püskürtülmek bu katıyla. */
  pride: number;
}

export const TEMPERAMENTS: Record<TemperamentId, TemperamentDef> = {
  vindictive: {
    id: 'vindictive',
    name: 'Kindar',
    description: 'Unutmaz. Düşmanca hamle ona daha ağır gelir, kini zor söner; dostluğu geç kazanılır.',
    hostile: 1.5,
    friendly: 0.75,
    fadeHostile: 0.05,
    fadeFriendly: 0.2,
    pride: 1,
  },
  pragmatic: {
    id: 'pragmatic',
    name: 'Pragmatik',
    description: 'İş iştir. Ne kini ne dostluğu uzun sürer; puanı hızla sıfıra döner.',
    hostile: 1,
    friendly: 1,
    fadeHostile: 0.2,
    fadeFriendly: 0.2,
    pride: 1,
  },
  loyal: {
    id: 'loyal',
    name: 'Vefalı',
    description: 'İyiliği unutmaz. Dostça hamle ona daha çok dokunur, dostluğu zor söner.',
    hostile: 0.8,
    friendly: 1.5,
    fadeHostile: 0.15,
    fadeFriendly: 0.05,
    pride: 1,
  },
  proud: {
    id: 'proud',
    name: 'Gururlu',
    description: 'Yenilgiyi kişisel alır. İhalede geçilmek ve kampanyasının geri püskürtülmesi iki kat ağır.',
    hostile: 1.2,
    friendly: 1,
    fadeHostile: 0.1,
    fadeFriendly: 0.1,
    pride: 2,
  },
};

export const TEMPERAMENT_IDS: readonly TemperamentId[] = ['vindictive', 'pragmatic', 'loyal', 'proud'];

/** Oyuncunun bir rakibe karşı hamlesi: hafızaya giren olay. */
export type RelationEventKind =
  | 'shares'
  | 'sold'
  | 'outbid'
  | 'lobbyAgainst'
  | 'lobbyWith'
  | 'freight'
  | 'freightCancel'
  | 'undercut'
  | 'campaignHeld'
  | 'settled'
  | 'amends';

export const RELATION = {
  min: -100,
  max: 100,
  /** Bu puana inen rakip husumetli. Husumet −30'un üstüne çıkınca bitiyor. */
  hostileAt: -40,
  hostileEndsAt: -30,
  /** Bu puana çıkan rakip müttefik. İttifak +30'un altına inince bitiyor. */
  allyAt: 40,
  allyEndsAt: 30,
  /** Dosyada gösterilen son olay sayısı. Aynı türden olay bir hafta içinde birleşiyor. */
  memorySize: 6,
  mergeDays: 7,
  /**
   * Olayların ham değeri (mizaçtan önce).
   *   - hisse: aldığın her %1 hisse −4 (yüzde beşlik bir alım −20);
   *     sattığın her %1 +2 (alıp satmak puan kazandırmıyor);
   *   - ihale: teklif verdiği ihaleyi sen kazandın;
   *   - meclis: oylamada aynı önergede karşı ya da aynı taraftasınız;
   *   - nakliye: mağazalarını taşıyorsun; sözleşmeden caydın;
   *   - fiyat kırma: aynı bölgede, aynı kategoride ondan ucuz satıyorsun
   *     (fiyat çarpanın en çok ×0,90); haftada bir;
   *   - kampanya: açtığı fiyat savaşını geri püskürttün; rövanşını
   *     kazandıysa "hesap görüldü" (oyuncunun hamlesi değil, ama husumet
   *     bir yere varıyor: kazanan rövanş kini yumuşatıyor).
   */
  events: {
    shares: -4,
    sold: 2,
    outbid: -10,
    lobbyAgainst: -8,
    lobbyWith: 6,
    freight: 12,
    freightCancel: -15,
    undercut: -3,
    campaignHeld: -8,
    settled: 15,
    amends: 25,
  } satisfies Record<RelationEventKind, number>,
  /** Fiyat kırma sayılan çarpan: oyuncunun mağazası en çok bu. */
  undercutPrice: 0.9,
  undercutEveryDays: 7,
  /**
   * Husumete düşen rakip fiyat savaşını en geç bu kadar gün sonra açıyor
   * (sıradaki kampanya daha erkense o gün). Kampanya sürüyorsa sırası
   * bitişten sonra.
   */
  revengeDays: 20,
  /**
   * Rövanş gerçek bir fiyat savaşı: rakip kategoride oyuncunun en ucuz
   * mağazasının bu kadar altına iniyor (kampanyanın olağan indirimi
   * yetmiyorsa), ama kendi fiyatının ×0,70'inden aşağı değil. Kin pahalı:
   * marjından o veriyor. İlk ölçümde rövanş olağan indirimdeydi; zaten ucuz
   * satan oyuncuya bir şey yapmıyor, oyuncu kampanyayı "geri püskürtüp"
   * marka kazanıyordu.
   */
  revengeUndercut: 0.05,
  revengeFloor: 0.7,
  /** Husumetli rakip varken iki kampanya arası en çok bu (normalde 150–260 gün). */
  revengeGapDays: 90,
  /**
   * Meclis: husumetli rakip senin bağışının bu payı kadar karşı tarafa,
   * müttefik bu payı kadar senin tarafına bağış yapıyor. Tavan kendi
   * lobi bütçesinin iki katı; kendi çıkarı aksini söylüyorsa yapmıyor.
   */
  counterLobby: 0.5,
  allyLobby: 0.35,
  lobbyBudgetMultiple: 2,
  /**
   * Meclis, kendiliğinden: rakibin önergeye çıkarına oyuncunun çıkarı
   * eklenip çıkıyor. Husumetli oyuncunun çıkarına tam ağırlıkla karşı
   * (oyuncunun en güçlü kategorisine vergiyi o istiyor), müttefik yarım
   * ağırlıkla yanında. Husumetlinin bütçesi de iki kat. İlk ölçümde tepki
   * yalnız oyuncunun bağışına karşılıktı; bağış yapmayan oyuncuya mecliste
   * hiçbir şey olmuyordu.
   */
  spiteInterest: 1,
  allyInterest: 0.5,
  /**
   * Genişleme: husumetli rakip yeni mağazasını oyuncunun mağazası olan
   * bölge ve kategoriye yöneltiyor (fırsat puanı bu katı), müttefik oradan
   * kaçınıyor. Rövanş 45 gün; şube kalıcı. İlk ölçümde tepkiler yalnız
   * kampanya ve meclisti: aynı saldırgan hamlelerle hafızalı ve hafızasız
   * oyunun değeri ortalamada aynıydı.
   */
  spiteExpansion: 1.6,
  allyExpansion: 0.6,
  /** İhale: husumetli rakip, öndeki sensen, değerlemesinin bu katına kadar artırıyor. */
  spite: 1.2,
  /**
   * Uzlaşma: rakibin CEO'sunun vakfına bağış. Bedel rakibin net değerinin
   * %1'i, en az 50 B ₺; para kimseye geçmiyor. Rakip başına 90 günde bir.
   */
  amends: { share: 0.01, min: 50_000, cooldownDays: 90 },
} as const;

/**
 * Katalog rakiplerinin CEO'su: mizaç ve bir satırlık geçmiş. Üretilen
 * rakiplerde mizaç zarla, geçmiş doktrinin şablonundan.
 */
export const RIVAL_CEOS: Record<string, { temperament: TemperamentId; bio: string }> = {
  nova_holding: { temperament: 'proud', bio: 'Yirmi yılda üç şirket kurdu, üçünü de büyütüp sattı. Kaybetmeye alışık değil.' },
  kilit_market: { temperament: 'vindictive', bio: 'Mahalle bakkalından zincire. Her indirimin kime karşı yapıldığını hatırlar.' },
  meridyen: { temperament: 'pragmatic', bio: 'Yatırım bankacılığından geldi. Tabloya bakar, kişiye değil.' },
  atlas_yapi: { temperament: 'loyal', bio: 'Babasından kalan üç arsayla başladı. Ortaklarını kırk yıldır değiştirmedi.' },
  veri_sanayi: { temperament: 'pragmatic', bio: 'Mühendis. Kararlarını modele bırakır; modelde kin diye bir değişken yok.' },
  anadolu_gida: { temperament: 'loyal', bio: 'Kooperatiften yetişti. Tedarikçisine de rakibine de verdiği sözü tutar.' },
  kule_gayrimenkul: { temperament: 'vindictive', bio: 'İhalelerin adamı. Kaybettiği her parseli adıyla sayar.' },
  firuze_grup: { temperament: 'proud', bio: 'Moda evinden perakendeye geçti. Markasının ikinci olmasına tahammülü yok.' },
};

/** Üretilen rakibin CEO geçmişi: doktrine göre. */
export const RIVAL_BIO_BY_TRAIT: Record<string, { bio: string }> = {
  expansionist: { bio: 'Şehre yeni geldi. Her boş köşeyi bir fırsat sayıyor.' },
  price_cutter: { bio: 'İndirim zincirlerinde yetişti. Etiketin dilinden anlar.' },
  premium: { bio: 'Lüks markaların bölge müdürlüğünden geldi. Vitrinine özen gösterir.' },
  landlord: { bio: 'Arsa ofisinden yetişti. Tapuyu binadan önce görür.' },
  tech: { bio: 'Bir girişimden ayrıldı. Şehri bir veri seti gibi okuyor.' },
};

/** İlişkinin bir eşiği geçtiği ve tepkinin göründüğü anlar. */
export type RelationBeat = 'hostile' | 'allied' | 'amends' | 'revenge' | 'counterLobby' | 'allyLobby';

export const RELATION_LINES: Record<TemperamentId, Record<RelationBeat, readonly string[]>> = {
  vindictive: {
    hostile: ['Bunu unutmayacağız. Hiçbirini.', 'Defterimize yazıldı. Silgimiz yok.'],
    allied: ['Kolay güvenmem. Sana güveniyorum.', 'Dostluğun bedelini ödedin. Bunu bilirim.'],
    amends: ['Bağışını gördüm. Unutmadım ama dinliyorum.', 'Bir jest. Yetmez, ama başlangıç.'],
    revenge: ['Sıra bizde. {category} fiyatlarını sen düşün.', 'Hesap soruyoruz: {category} rafları bizim.'],
    counterLobby: ['Senin istediğin her şeyin karşısındayız.', 'Mecliste de karşındayız.'],
    allyLobby: ['Bu önergede yanındayız.', 'Sözümüz söz: bağışımız senin tarafında.'],
  },
  pragmatic: {
    hostile: ['Kişisel değil. Ama artık karşı taraftayız.', 'Rakamlar seni rakip gösteriyor. Öyle davranacağız.'],
    allied: ['Birlikte çalışmak ikimize de kazandırıyor.', 'Mantıklı bir ortaklık. Sürdürelim.'],
    amends: ['Teklifin makul. Sayfa yenilendi.', 'Kabul. İş iştir.'],
    revenge: ['{category} pazarında hesap yapma zamanı.', '{category} fiyatlarını yeniden hesapladık.'],
    counterLobby: ['Bu önergede çıkarlarımız ayrışıyor.', 'Karşı tarafa yatırım yapıyoruz.'],
    allyLobby: ['Bu önergede çıkarımız ortak.', 'Destekliyoruz; hesabı tutuyor.'],
  },
  loyal: {
    hostile: ['Bize bunu yapmamalıydın.', 'Güvenimiz sarsıldı. Artık bekleme.'],
    allied: ['İyiliği unutmayız. Kapımız sana açık.', 'Dostlarımızın yanında dururuz.'],
    amends: ['Özrünü kabul ediyoruz. Yeniden başlayalım.', 'Uzattığın eli sıkıyoruz.'],
    revenge: ['İstemezdik, ama {category} pazarında karşındayız.', 'Kırıldık. {category} fiyatları düşüyor.'],
    counterLobby: ['Bu kez karşı taraftayız.', 'Mecliste yolumuz ayrıldı.'],
    allyLobby: ['Dostumuzun yanındayız.', 'Bu oylamada sana güveniyoruz; bağışımız da yanında.'],
  },
  proud: {
    hostile: ['Bizi küçümsedin. Bedelini göreceksin.', 'Kimse bizi ikinci sıraya itemez.'],
    allied: ['Saygı karşılıklıdır. Seni görüyoruz.', 'Seviyemizde bir ortak bulduk.'],
    amends: ['Jestin yerinde. Gururumuz da öyle.', 'Kabul ediyoruz. Bir kereliğine.'],
    revenge: ['{category} pazarında kimin önde olduğunu herkes görecek.', 'Şimdi {category} sahnesi bizim.'],
    counterLobby: ['Mecliste de seni geçeceğiz.', 'Senin önergen, bizim sınavımız.'],
    allyLobby: ['Bu önergede güçlerimizi birleştiriyoruz.', 'Yanındayız; kazanan taraf biz olalım.'],
  },
};

/** Etkin dilde bir ilişki sözünün varyantları. */
export function relationLines(temperament: TemperamentId, beat: RelationBeat): string[] {
  return RELATION_LINES[temperament][beat].map((line, index) =>
    translate(`content.relationLine.${temperament}.${beat}.${index}`, undefined, line),
  );
}

/** Etkin dilde bir CEO geçmişi. */
export function rivalBio(profileId: string, trait: string): string {
  const own = RIVAL_CEOS[profileId];
  if (own) return translate(`content.rivalCeo.${profileId}.bio`, undefined, own.bio);
  const fallback = RIVAL_BIO_BY_TRAIT[trait]?.bio ?? '';
  return translate(`content.rivalBio.${trait}.bio`, undefined, fallback);
}

// Metin alanları etkin dile bağlı; Türkçe yedek nesnenin kendi metni.
localizeRecord(TEMPERAMENTS, 'temperament', ['name', 'description']);
