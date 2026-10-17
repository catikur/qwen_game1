import type { NpcTrait } from './types';
import { localizeList } from './localize';
import { translate } from './messages';

/**
 * Karar kartları ve rakip hikâyeleri (Tur 37b).
 *
 * Olaylar piyasayı değiştiriyor ama oyuncuya bir şey SORMUYORDU: "Tüketim
 * Patlaması" gelir, geçer; oyuncu yalnızca okur. Sendika talebi ve
 * sözleşme teklifi oyunun iki gerçek "karar anı"ydı ve ikisi de en çok
 * konuşulan sistemlerdi. Karar kartı bu kalıbı genişletiyor: masaya bir
 * durum gelir, iki-üç seçenek, her birinin bedeli ve getirisi açıkça
 * yazılı. Hiçbiri açıkça doğru değil — bedel ve risk farklı.
 *
 * Casual kuralı yerinde: kart oyunu durdurmaz, cevap verilmezse süre
 * dolunca "hiçbir şey yapma" seçeneği uygulanır.
 */

/** Kartın süreli çarpanının hedefi. */
export type CardBoostTarget = 'attraction' | 'upkeep' | 'wages' | 'cogs';

export type CardEffect =
  /** Kartın tutarının katı: eksi ödeme, artı kazanç. */
  | { kind: 'cash'; times: number }
  /** Süreli çarpan; `category` ise yalnızca kartın kategorisinde. */
  | { kind: 'boost'; target: CardBoostTarget; multiplier: number; days: number; category?: boolean }
  /** Sendika baskısına ekleme (eksi rahatlatır). */
  | { kind: 'pressure'; delta: number };

export interface CardChoiceDef {
  id: string;
  label: string;
  /** Seçeneğin tek cümlelik tarifi (kartta, etkilerin üstünde). */
  flavor: string;
  effects: CardEffect[];
  /** Şanslı seçenek: `odds` olasılıkla `effects`, kalanında `fail`. */
  odds?: number;
  fail?: CardEffect[];
  /** Sonuç haberinin metni; şans tutmazsa `failResult`. */
  result: string;
  failResult?: string;
}

export interface CardDef {
  id: string;
  title: string;
  /** Durum. `{category}`, `{rival}`, `{ceo}` yer tutucuları dolduruluyor. */
  body: string;
  weight: number;
  requires: {
    /** En az bu kadar mağaza. */
    outlets?: number;
    /** En az bu kadar bina (her tür). */
    buildings?: number;
    /** Sendika baskısı en az bu (işgücü açıkken). */
    pressure?: number;
    /** Kartın kategorisi: oyuncunun en çok kazandıran mağaza kategorisi. */
    category?: boolean;
    /** Kartın bir rakip yüzü var: en büyük rakip. */
    rival?: boolean;
  };
  choices: CardChoiceDef[];
  /** Süre dolarsa uygulanan seçenek — her kartta "hiçbir şey yapma". */
  fallback: string;
}

export const CARDS: CardDef[] = [
  {
    id: 'viral_video',
    title: 'Mağazan sosyal medyada patladı',
    body: 'Bir müşterinin {category} şubende çektiği video bir gecede iki milyon izlendi. Dalga sönmeden ne yapacaksın?',
    weight: 10,
    requires: { outlets: 1, category: true },
    choices: [
      {
        id: 'campaign',
        label: 'Reklama dönüştür',
        flavor: 'Videoyu kampanyaya çevir, şehrin her yerinde göster.',
        effects: [
          { kind: 'cash', times: -1 },
          { kind: 'boost', target: 'attraction', multiplier: 1.2, days: 30, category: true },
        ],
        result: 'Kampanya tuttu: {category} şubelerinin önünde kuyruk var.',
      },
      {
        id: 'ride',
        label: 'Kendi haline bırak',
        flavor: 'Bedava ilgi; birkaç gün sonra unutulur.',
        effects: [{ kind: 'boost', target: 'attraction', multiplier: 1.07, days: 12, category: true }],
        result: 'Video birkaç gün konuşuldu, sonra gündem değişti.',
      },
    ],
    fallback: 'ride',
  },
  {
    id: 'bulk_supplier',
    title: 'Toplu alım teklifi',
    body: 'Bir toptancı, peşin ödersen üç ay boyunca bütün raflarına indirimli mal vermeyi öneriyor.',
    weight: 9,
    requires: { outlets: 3 },
    choices: [
      {
        id: 'sign',
        label: 'Peşin öde, imzala',
        flavor: 'Kasadan bugün çıkar, satış maliyetinde geri döner.',
        effects: [
          { kind: 'cash', times: -1.5 },
          { kind: 'boost', target: 'cogs', multiplier: 0.93, days: 90 },
        ],
        result: 'Toptancıyla anlaşma imzalandı; raflar üç ay indirimli doluyor.',
      },
      {
        id: 'pass',
        label: 'Nakdi elde tut',
        flavor: 'Bağlanmadan, bugünkü fiyatlarla devam.',
        effects: [],
        result: 'Teklif geri çevrildi; tedarik her zamanki gibi.',
      },
    ],
    fallback: 'pass',
  },
  {
    id: 'inspection',
    title: 'Denetim haftası',
    body: 'Belediye müfettişleri önümüzdeki hafta {category} şubelerini habersiz denetleyecek.',
    weight: 9,
    requires: { outlets: 2, category: true },
    choices: [
      {
        id: 'renovate',
        label: 'Şubeleri elden geçir',
        flavor: 'Mutfaktan depoya her şey yenilensin; temiz belgesi garanti.',
        effects: [
          { kind: 'cash', times: -0.6 },
          { kind: 'boost', target: 'attraction', multiplier: 1.05, days: 20, category: true },
        ],
        result: 'Denetimden tam not: vitrinlere "temiz işletme" belgesi asıldı.',
      },
      {
        id: 'chance',
        label: 'Olduğu gibi bırak',
        flavor: 'Büyük ihtimalle sorun çıkmaz. Çıkarsa ceza ve kötü şöhret.',
        effects: [{ kind: 'boost', target: 'attraction', multiplier: 1.05, days: 20, category: true }],
        odds: 0.65,
        fail: [
          { kind: 'cash', times: -0.8 },
          { kind: 'boost', target: 'attraction', multiplier: 0.85, days: 20, category: true },
        ],
        result: 'Müfettişler kusur bulamadı; belge kendiliğinden geldi.',
        failResult: 'Denetimde eksik çıktı: para cezası ve yerel basında kötü bir haber.',
      },
    ],
    fallback: 'chance',
  },
  {
    id: 'union_lunch',
    title: 'Sendika temsilcisi masada',
    body: 'İşçi temsilcisi seninle öğle yemeği istiyor. Örgütlenme hızlanıyor; bugün atılacak adım yarınki talebi belirleyebilir.',
    weight: 8,
    requires: { buildings: 4, pressure: 0.35 },
    choices: [
      {
        id: 'bonus',
        label: 'Prim dağıt',
        flavor: 'Tek seferlik prim; baskı belirgin düşer.',
        effects: [
          { kind: 'cash', times: -0.8 },
          { kind: 'pressure', delta: -0.35 },
        ],
        result: 'Prim herkesin hesabına yattı; atölyelerde hava yumuşadı.',
      },
      {
        id: 'listen',
        label: 'Dinle, söz verme',
        flavor: 'Bedava, ama etkisi sınırlı.',
        effects: [{ kind: 'pressure', delta: -0.1 }],
        result: 'Uzun bir yemek oldu; temsilci bir şey koparamadı ama dinlendiğini söyledi.',
      },
      {
        id: 'ignore',
        label: 'Yemeğe gitme',
        flavor: 'Mesaj net olur — ama örgütlenmeyi hızlandırır.',
        effects: [{ kind: 'pressure', delta: 0.15 }],
        result: 'Davet karşılıksız kaldı; işyerlerinde imza toplanıyor.',
      },
    ],
    fallback: 'ignore',
  },
  {
    id: 'festival_sponsor',
    title: 'Şehir festivali sponsor arıyor',
    body: 'Belediyenin üç haftalık sokak festivali ana sponsor arıyor. Afişlerde, sahnede, her yerde senin adın olabilir.',
    weight: 8,
    requires: { outlets: 3 },
    choices: [
      {
        id: 'sponsor',
        label: 'Ana sponsor ol',
        flavor: 'Bütün mağazalar festival boyunca daha çekici.',
        effects: [
          { kind: 'cash', times: -0.9 },
          { kind: 'boost', target: 'attraction', multiplier: 1.1, days: 21 },
        ],
        result: 'Festival afişlerinde adın var; mağazalar festival kalabalığıyla dolu.',
      },
      {
        id: 'decline',
        label: 'Bu yıl geç',
        flavor: 'Bütçe başka işe.',
        effects: [],
        result: 'Festivalin sponsoru başka bir şirket oldu.',
      },
    ],
    fallback: 'decline',
  },
  {
    id: 'pos_system',
    title: 'Yeni kasa ve stok sistemi',
    body: 'Bir yazılım firması bütün şubelerine ortak kasa ve stok sistemi kurmayı öneriyor. Kurulumu pahalı, ama işletmeyi ucuzlatıyor.',
    weight: 7,
    requires: { buildings: 8 },
    choices: [
      {
        id: 'install',
        label: 'Kur',
        flavor: 'Bugün büyük bir ödeme, beş ay boyunca daha düşük bakım.',
        effects: [
          { kind: 'cash', times: -2 },
          { kind: 'boost', target: 'upkeep', multiplier: 0.88, days: 150 },
        ],
        result: 'Yeni sistem devrede; şubelerin bakım faturası düştü.',
      },
      {
        id: 'later',
        label: 'Sonra bakarız',
        flavor: 'Eski sistem çalışıyor.',
        effects: [],
        result: 'Kurulum ertelendi.',
      },
    ],
    fallback: 'later',
  },
  {
    id: 'poached_manager',
    title: '{rival} bölge müdürünü istiyor',
    body: '{ceo}, en iyi bölge müdürüne iki katı maaş teklif etti. Müdür kararını bekliyor.',
    weight: 7,
    requires: { outlets: 6, rival: true },
    choices: [
      {
        id: 'counter',
        label: 'Maaşını eşitle',
        flavor: 'Müdür kalır; ücret bütçesi dört ay biraz şişer.',
        effects: [{ kind: 'boost', target: 'wages', multiplier: 1.04, days: 120 }],
        result: 'Müdür kaldı. {ceo} teklifini geri çekti.',
      },
      {
        id: 'release',
        label: 'Gitmesine izin ver',
        flavor: 'Bedava, ama yerine gelen alışana kadar mağazalar aksar.',
        effects: [{ kind: 'boost', target: 'attraction', multiplier: 0.93, days: 30 }],
        result: 'Müdür {rival} yönetimine geçti; şubeler yeni düzene alışıyor.',
      },
    ],
    fallback: 'release',
  },
  {
    id: 'press_story',
    title: 'Gazeteci kapıda',
    body: 'Bir araştırmacı gazeteci şirketindeki çalışma koşulları üzerine dosya hazırlıyor ve senden görüş istiyor.',
    weight: 7,
    requires: { buildings: 6 },
    choices: [
      {
        id: 'open',
        label: 'Kapıları aç',
        flavor: 'Küçük iyileştirmeler, dürüst bir röportaj.',
        effects: [
          { kind: 'cash', times: -0.5 },
          { kind: 'pressure', delta: -0.15 },
          { kind: 'boost', target: 'attraction', multiplier: 1.04, days: 20 },
        ],
        result: 'Dosya olumlu çıktı: "Şehrin örnek işvereni".',
      },
      {
        id: 'silent',
        label: 'Yorum yok',
        flavor: 'Belki haber hiç çıkmaz. Çıkarsa can yakar.',
        effects: [],
        odds: 0.5,
        fail: [{ kind: 'boost', target: 'attraction', multiplier: 0.9, days: 25 }],
        result: 'Dosya yayımlanmadı; gazeteci başka bir konuya geçti.',
        failResult: 'Dosya manşet oldu; müşteriler bir süre mesafeli.',
      },
    ],
    fallback: 'silent',
  },
  {
    id: 'charity_drive',
    title: 'Mahalle okulu yardım istiyor',
    body: 'Mahalledeki okulun çatısı akıyor. Veli derneği şehrin büyük şirketlerinden bağış istiyor.',
    weight: 6,
    requires: { outlets: 2 },
    choices: [
      {
        id: 'donate',
        label: 'Bağış yap',
        flavor: 'Mahalle unutmaz: mağazalara uzun süreli bir sıcaklık.',
        effects: [
          { kind: 'cash', times: -0.5 },
          { kind: 'boost', target: 'attraction', multiplier: 1.04, days: 45 },
        ],
        result: 'Okulun çatısı onarıldı; açılışta adın anıldı.',
      },
      {
        id: 'decline',
        label: 'Kibarca reddet',
        flavor: 'Bu ay olmaz.',
        effects: [],
        result: 'Bağışı başka şirketler topladı.',
      },
    ],
    fallback: 'decline',
  },
  {
    id: 'storm_warning',
    title: 'Fırtına uyarısı',
    body: 'Meteoroloji iki gün içinde sert fırtına bekliyor. Sigortacı ek poliçe öneriyor.',
    weight: 7,
    requires: { buildings: 5 },
    choices: [
      {
        id: 'insure',
        label: 'Ek poliçe yaptır',
        flavor: 'Küçük, kesin bir bedel.',
        effects: [{ kind: 'cash', times: -0.4 }],
        result: 'Fırtına geçti; poliçe hazırdı.',
      },
      {
        id: 'risk',
        label: 'Riski üstlen',
        flavor: 'Çoğu fırtına zarar vermeden geçer.',
        effects: [],
        odds: 0.7,
        fail: [
          { kind: 'cash', times: -1.6 },
          { kind: 'boost', target: 'upkeep', multiplier: 1.12, days: 20 },
        ],
        result: 'Fırtına şehri teğet geçti.',
        failResult: 'Fırtına çatıları uçurdu: onarım faturası ve birkaç hafta yüksek bakım.',
      },
    ],
    fallback: 'risk',
  },
  {
    id: 'energy_deal',
    title: 'Sabit fiyatlı enerji',
    body: 'Enerji şirketi dört aylık sabit fiyat öneriyor. Piyasa fiyatı ne yöne gider, kimse bilmiyor.',
    weight: 6,
    requires: { buildings: 10 },
    choices: [
      {
        id: 'lock',
        label: 'Fiyatı sabitle',
        flavor: 'Peşin ödeme, dört ay boyunca daha düşük bakım.',
        effects: [
          { kind: 'cash', times: -1.2 },
          { kind: 'boost', target: 'upkeep', multiplier: 0.9, days: 120 },
        ],
        result: 'Enerji faturası dört ay sabit.',
      },
      {
        id: 'float',
        label: 'Piyasada kal',
        flavor: 'Fiyat düşerse kazanırsın, yükselirse kaybedersin.',
        effects: [{ kind: 'boost', target: 'upkeep', multiplier: 0.95, days: 60 }],
        odds: 0.5,
        fail: [{ kind: 'boost', target: 'upkeep', multiplier: 1.08, days: 60 }],
        result: 'Enerji fiyatları geriledi; faturalar biraz hafifledi.',
        failResult: 'Enerji fiyatları tırmandı; faturalar iki ay kabarık.',
      },
    ],
    fallback: 'float',
  },
  {
    id: 'influencer',
    title: 'Fenomen tanıtım öneriyor',
    body: 'Şehrin tanınan bir fenomeni ücret karşılığında {category} şubelerini tanıtmayı öneriyor.',
    weight: 7,
    requires: { outlets: 2, category: true },
    choices: [
      {
        id: 'hire',
        label: 'Anlaşmayı yap',
        flavor: 'Tutarsa büyük ilgi; tutmazsa para gitti.',
        effects: [
          { kind: 'cash', times: -0.7 },
          { kind: 'boost', target: 'attraction', multiplier: 1.18, days: 25, category: true },
        ],
        odds: 0.6,
        fail: [{ kind: 'cash', times: -0.7 }],
        result: 'Tanıtım videoları tuttu; {category} şubeleri gençlerle dolu.',
        failResult: 'Videolar ilgi görmedi; ödenen ücret boşa gitti.',
      },
      {
        id: 'decline',
        label: 'Gerek yok',
        flavor: 'Reklam bütçesi yerinde kalsın.',
        effects: [],
        result: 'Fenomen bir rakiple anlaştı.',
      },
    ],
    fallback: 'decline',
  },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((card) => [card.id, card]));

/**
 * Kart takvimi ve ölçeği.
 *
 * TUTAR KÂR EĞİLİMİNDEN: kartın bedeli şirketin günlük kâr eğiliminin
 * katı (taban ve tavanla). Net değere bağlansaydı geç oyunda servetin
 * %90'ı nakit olduğu için kart bedeli kârın günlerce üstüne çıkardı;
 * sabit olsaydı erken oyunda yıkıcı, geç oyunda önemsiz olurdu.
 */
export const CARD_TIMING = {
  /** İlk kart bu günden önce gelmez — oyuncu önce kendi düzenini kursun. */
  firstDay: 45,
  /** İki kart arası (kartın kapandığı günden). */
  gapDays: [22, 46] as const,
  /** Kartın masada kaldığı süre; dolunca `fallback`. */
  lifetimeDays: 12,
  /** Tutar = günlük kâr eğilimi × bu (taban/tavan arası). */
  amountDays: 1.2,
  amountMin: 30_000,
  amountMax: 2_500_000,
  /** Son bu kadar kart tekrar gelmez. */
  memory: 4,
} as const;

localizeList(CARDS, 'card', ['title', 'body']);
for (const card of CARDS) localizeList(card.choices, `card.${card.id}.choice`, ['label', 'flavor', 'result', 'failResult']);

// ---------------------------------------------------------------- rakip hikâyeleri

/**
 * Rakibin konuştuğu anlar.
 *
 * Rakip haberleri bugüne kadar bir şirket adı ve bir fiil taşıyordu
 * ("Nova Holding genişliyor"). Yüzleri vardı (portre) ama sesleri
 * yoktu. Her rakibin bir kişiliği (`trait`) var ve sözler ona göre:
 * genişlemeci kendinden emin, fiyat kıran alaycı, premium soğuk.
 */
export type RivalBeat =
  | 'overtook'
  | 'passed'
  | 'leadLost'
  | 'campaignStart'
  | 'campaignWon'
  | 'campaignLost'
  | 'crisis';

export const RIVAL_LINES: Record<NpcTrait, Record<RivalBeat, readonly string[]>> = {
  expansionist: {
    overtook: ['Şehrin her köşesinde biz varız. Sıradaki köşe de bizim.', 'Durmak yok. Bir sonraki hedefimiz zaten belli.'],
    passed: ['Bir tur kaybettik, yarışı değil.', 'Hızlı büyüyenler bazen tökezler. Biz kalkmasını biliriz.'],
    leadLost: ['{district} artık bizim mahallemiz.', '{district} müşterisi yeni adresini buldu.'],
    campaignStart: ['{category} pazarında senin olan her bölgeye şube açacağız.', '{category} bizim büyüme alanımız. Yer açın.'],
    campaignWon: ['{category} pazarı artık bizim haritamızda.', 'Söz verdik, yaptık: {category} bizim.'],
    campaignLost: ['{category} şimdilik sende kalsın. Şimdilik.', 'Bu kez geri çekiliyoruz; haritayı yeniden çiziyoruz.'],
    crisis: ['Kriz mi? Biz buna indirimli arsa diyoruz.', 'Herkes dururken biz kuracağız.'],
  },
  price_cutter: {
    overtook: ['Ucuz olan kazanır. Hep böyleydi.', 'Müşteri etikete bakar, logoya değil.'],
    passed: ['Pahalı satarak öne geçtiler. Bakalım ne kadar sürecek.', 'Kâr marjı yüksek olanın düşüşü de yüksek olur.'],
    leadLost: ['{district} halkı ucuzu buldu.', '{district} raflarında artık bizim fiyatlarımız konuşuluyor.'],
    campaignStart: ['{category} fiyatlarını kırıyoruz. Takip edebilen etsin.', '{category} müşterisine söz: şehrin en ucuzu biziz.'],
    campaignWon: ['Fiyat savaşı bitti. {category} müşterisi bizimle.', 'Kim pahalı satıyordu, hatırlayan var mı?'],
    campaignLost: ['Bu fiyatlarla sonsuza dek gidilmez. Şimdilik ateşkes.', 'Müşteri sadık çıktı. Not aldık.'],
    crisis: ['Kriz dönemi ucuzun dönemidir.', 'Cüzdanlar daralınca kapımız çalınır.'],
  },
  premium: {
    overtook: ['Kalite er geç kazanır.', 'Biz acele etmeyiz; sadece en iyisini yaparız.'],
    passed: ['Hacim bir şey değildir. Bizim müşterimiz başkadır.', 'Sayılarla değil itibarla ölçeriz.'],
    leadLost: ['{district} seçkin bir adres arıyordu.', "{district}'de standardı biz belirliyoruz."],
    campaignStart: ['{category} müşterisine gerçek kaliteyi göstermenin zamanı.', '{category} vitrinlerini yeniden tanımlıyoruz.'],
    campaignWon: ['{category} müşterisi farkı gördü.', 'Kalite tartışmaya açık değildi. Şimdi herkes biliyor.'],
    campaignLost: ['Her müşteri bizim müşterimiz olamaz. Bunu kabul ediyoruz.', 'Kampanyayı kapatıyoruz; standardımızdan taviz yok.'],
    crisis: ['Zor zamanda insanlar güvendiğine döner.', 'Krizler kalitesizleri ayıklar.'],
  },
  landlord: {
    overtook: ['Toprak sahibi olan sonunda kazanır.', 'Biz binaları değil arsaları sayarız.'],
    passed: ['Arsalar yerinde duruyor. Değerleri de artacak.', 'Sabırlı olan kazanır; acelemiz yok.'],
    leadLost: ['{district} arsalarını yıllar önce aldık.', "{district}'de kiralar bizim takvimimize göre işliyor."],
    campaignStart: ['{category} için en iyi köşeler bizde. Şimdi kullanma zamanı.', '{category} pazarına arsalarımızla giriyoruz.'],
    campaignWon: ['Doğru köşe her şeydir. {category} bunu kanıtladı.', 'Arsa kazandı, her zamanki gibi.'],
    campaignLost: ['Arsalar bekler. Biz de bekleriz.', 'Bu sefer olmadı; köşeler yine de bizim.'],
    crisis: ['Arsa fiyatları düşüyorsa alım zamanıdır.', 'Kriz geçer, toprak kalır.'],
  },
  tech: {
    overtook: ['Veri yalan söylemez: öndeyiz.', 'Algoritmamız bu sonucu üç ay önce tahmin etti.'],
    passed: ['Kısa vadeli bir sapma. Model güncelleniyor.', 'Veriler ilginç. İnceliyoruz.'],
    leadLost: ['{district} talebini modelimiz çoktan görmüştü.', "{district}'de verimlilik kazandı."],
    campaignStart: ['{category} pazarını optimize etmeye başlıyoruz.', '{category} için yeni modelimiz devrede.'],
    campaignWon: ['Model doğru çıktı. {category} artık verimli.', 'Optimizasyon tamamlandı.'],
    campaignLost: ['Modelde bir değişken eksikmiş: müşteri sadakati.', 'Veri seti genişliyor. Döneceğiz.'],
    crisis: ['Belirsizlik, iyi veriye sahip olanın avantajıdır.', 'Kriz senaryosu modelimizde vardı.'],
  },
};

/** Etkin dilde bir rakip sözünün varyantları. */
export function rivalLines(trait: NpcTrait, beat: RivalBeat): string[] {
  return RIVAL_LINES[trait][beat].map((line, index) => translate(`content.rivalLine.${trait}.${beat}.${index}`, undefined, line));
}

/**
 * Rakip kampanyası (Tur 37b): bir rakip oyuncunun en güçlü kategorisine
 * süreli bir saldırı açıyor. Başı (duyuru), ortası (gündemde geri sayım)
 * ve sonu (kazanan ilan ediliyor) olan bir hikâye.
 */
export const CAMPAIGN = {
  /** İlk kampanya bu günden önce gelmez. */
  firstDay: 170,
  /** İki kampanya arası (bitişten). */
  gapDays: [150, 260] as const,
  durationDays: 45,
  /** Kampanya fiyat çarpanı: fiyat kıran derin, diğerleri hafif. */
  priceCut: { price_cutter: 0.86, default: 0.93 } as const,
  /** Rakibin genişleme puanında hedef kategoriye çarpan. */
  expansionBias: 1.8,
  /** Oyuncunun payı bu kadardan fazla düşmediyse kampanya geri tepmiş sayılır. */
  holdMargin: 0.02,
  /** Kampanya ancak oyuncunun bu kadar payı olan kategoriye açılır. */
  minPlayerShare: 0.15,
  /** Geri püskürtülen kampanyanın ödülü: kategoride marka (0..1) artışı. */
  loyaltyBrand: 0.04,
} as const;

