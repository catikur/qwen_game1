import { localizeList } from './localize';
import type { CitySizeId } from './districts';
import type { DifficultyId } from './difficulty';
import type { ModifierId } from './modifiers';
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
 *
 * Senaryo paketi II (Tur 60): Faz 3'ün sektörleriyle üç senaryo —
 * nakliye, enerji ve kentsel dönüşüm. Her biri bir ek kuralla (Tur 45)
 * oynanıyor: kural ön tarihte de geçerli, şehir onunla büyüdü.
 */
export type ScenarioId =
  | 'rescue'
  | 'crisis'
  | 'consortium'
  | 'chain'
  | 'sponsor'
  | 'conquest'
  | 'holding'
  | 'haulage'
  | 'blackout'
  | 'renewal';

/**
 * Devirde oyuncunun şirketi. Parçalar birleşebiliyor: her senaryo
 * yalnızca kendi durumunu kuran parçaları yazıyor.
 */
export interface ScenarioSetup {
  /** Kasadaki nakit. */
  cash: number;
  /** Önceki yönetimin şubeleri: rakibin o kategoride en az mağazası olan bölgelerde, kâr ediyorlar. */
  outlets?: readonly string[];
  /**
   * Boşa çalışan destek binaları: şirketin hiç mağazası olmayan bir
   * kategoriye odaklı Ar-Ge ve pazarlama. Her gün gider, getirisi yok.
   * (Ölçüm: bu ekonomide mağaza her bölgede kâr ediyor; zararın yeri
   * yanlış yatırım ve borç servisi.)
   */
  idle?: { defIds: readonly string[]; focus: CategoryId };
  /**
   * Devralınan binaların yaşı (gün). Konsorsiyum "yatırıma dönüş"ü
   * kuruluştan sonra kurulan binalarla sayıyor; devralınan binalar o
   * sayıma girmesin. Yoksa devir günü.
   */
  builtDaysAgo?: number;
  /** Şubeler için alınmış vadeli kredi: kalan anapara ve vade. */
  loan?: { amount: number; termDays: number };
  /** En güçlü baskıncının topladığı pay (0..1). */
  raiderStake?: number;
  /** Uyarıda başlayan kriz; senaryonun son günü bitiyor. */
  crisis?: { id: string; warningDays: number };
  /** Devir günü kurulan rakip konsorsiyumu: ortak alıma kalan gün. */
  consortium?: { warningDays: number };
  /**
   * Şehir projesi takvimi: ilk proje devirden bu kadar gün sonra açılıyor,
   * biri bitince sonraki bu kadar gün sonra (serbest oyunda 260–380).
   */
  projects?: { firstInDays: number; gapDays: number };
  /**
   * Senaryo boyunca dondurulan kurallar; senaryo bitince kalkıyor.
   * `entrants`: belediye yeni şirket ruhsatını donduruyor, boşalan rakip
   * koltuğuna kimse girmiyor (yoksa büyük şehirde 60 günde bir yeni rakip,
   * kurucu kilidiyle). `issuance`: SPK yeni hisse ihracını donduruyor.
   * Ölçüm (Büyük şehir fethi): premium ve teknoloji doktrinli rakip,
   * baskıncı %30'u geçtiği gün kurucu payının tabanına kadar ihraç ediyor;
   * yatırımcının hissesi dolaşıma girmiyor, geri alımla birlikte kontrol
   * bir hisse farkla kilitleniyor ve şirket bir daha alınamıyordu. İhraç
   * kapalıyken geri alım savunması sürüyor ama kilide yetmiyor.
   */
  freeze?: { entrants?: boolean; issuance?: boolean };
  /**
   * Holding: kurulan şehir kurucu şehir olup uzağa geçiyor, oyuncu bu
   * sermayeyle açılan yeni şehirde başlıyor. Kurucu şehrin kasası `cash`;
   * sermaye ondan düşülmüyor ve kurucu şehrin zafer ölçüsüne eklenmiyor.
   */
  secondCity?: { capital: number; citySize: CitySizeId };
  /**
   * Devralınan husumet (Tur 60): net değeri en yüksek bu kadar rakip
   * oyuncuya kinli başlıyor (Rakipler 2.0'ın `feud` olayı, mizaçla).
   * Önceki yönetimin fiyat savaşları; kinli rakip taşıma teklifi getirmiyor.
   */
  feud?: number;
}

export type ScenarioGoal =
  /** Süre içinde net değeri hedefe çıkar (devralınmadan). */
  | { kind: 'netWorth'; target: number }
  /** Sürenin sonunda şehrin en değerli şirketi ol. */
  | { kind: 'leadAtEnd' }
  /** Süre içinde zafere ulaş (şirket değeri ve birincilik ya da bütün rakipler). */
  | { kind: 'victory' }
  /**
   * Bir ürünün bütün zinciri: hammadde ve işleme ünitesi sende, ara malın
   * birim maliyeti piyasanın altında, ürünün kategorisinde en az `share` pay.
   */
  | { kind: 'chain'; goodId: string; share: number }
  /**
   * Arka arkaya `projects` şehir projesinin sponsoru ol; bu sırada ilk
   * `maxRank` içinde kal. Sıranın dışına düşen şirketin geri dönmek için
   * `graceDays` günü var: bina kurmak da katkı da net değeri bir an düşürüyor.
   */
  | { kind: 'sponsor'; projects: number; maxRank: number; graceDays: number }
  /** Bütün rakipleri devral (tekel). */
  | { kind: 'monopoly' }
  /** Holding'in bütün şehirlerinde zafer; hiçbir şehir kaybedilmeden. */
  | { kind: 'holding' }
  /**
   * Nakliye (Tur 60): aynı gün en az `rivals` ayrı rakibin toplam en az
   * `outlets` mağazası terminallerinin taşıma sözleşmesinde.
   */
  | { kind: 'freight'; rivals: number; outlets: number }
  /** Enerji (Tur 60): senaryo boyunca santrallerinden rakiplere toplam `target` ₺ elektrik sat. */
  | { kind: 'power'; target: number }
  /**
   * Gayrimenkul (Tur 60): kiralıklarında aynı gün en az `units` dolu birim
   * (hak sahipleri sayılmıyor) ve dönüşüm parselinde açılmış en az
   * `renewals` proje.
   */
  | { kind: 'rental'; units: number; renewals: number };

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
  /** Hedef cümlesi; `{target}`, `{days}` ve `{share}` arayüzde dolduruluyor. */
  goalText: string;
  /** Kurulumun açık maddeleri (zorluk ekranındaki gibi). */
  facts: string[];
  seed: number;
  citySize: CitySizeId;
  difficulty: DifficultyId;
  preludeDays: number;
  /**
   * Ek kurallar (Tur 45) ön tarihle birlikte: şehir onlarla kuruldu ve
   * büyüdü. Kurulum ekranında ve açılışta yazıyor; zorluk çarpanına
   * girmiyor (yıldızlar kuralla ölçüldü).
   */
  modifiers?: readonly ModifierId[];
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
      cash: 5_000_000,
      crisis: { id: 'deep_recession', warningDays: 30 },
    },
  },
  /*
   * KONSORSİYUMA KARŞI (seed 7, 200 gün ön tarih). Konsorsiyum devir günü
   * kuruluyor, 30 gün sonra hisse toplamaya başlıyor. Devralınan on iki
   * mağaza 150 günlük: dağılma sayacı kuruluştan sonra kurulan binaları
   * sayıyor. Ölçüm: 300 günlük ön tarihte rakipler oyuncuyu geçiyor ve
   * arsa azalıyor; atıl kasa işe koşulamıyor, hiçbir vekil zafere
   * ulaşamıyordu.
   *
   * Vekil (35 M ₺ kasa, 550 gün): hiçbir şey yapmayan 109. günde
   * devralınıyor. 15 günde bir kuran konsorsiyumu dağıtıyor ama süreyi
   * dolduruyor (değer hedefte, sıra ikinci). Beş günde bir kuran 435.,
   * üç günde bir kuran 415., atıl kasayı aynı gün işe koşan 413. günde
   * zaferde.
   */
  {
    id: 'consortium',
    title: 'Konsorsiyuma karşı',
    tagline: 'Şehrin en değerli şirketisin ama paran kasada yatıyor; rakipler birleşti.',
    brief:
      'Şirket şehrin açık ara en değerlisi, ama değerinin çoğu kasada duruyor ve aylardır yeni bina kurulmadı. En büyük rakipler güç birliği yaptı: savunma penceresi bitince hisselerini her gün birlikte toplayacaklar.',
    goalText: '{days} gün içinde zafere ulaş; devralınma.',
    facts: [
      'Konsorsiyum dağılıyor: üç yeni bina kurarsan, kasa net değerin %20\'sinin altına inerse ya da öndeliğin 1,1 katın altına düşerse.',
      'Kontrolü kilitlemek de bir yol: kendi hisseni geri al (borsa paneli). Kalan her hisseyi alsalar da yarıyı geçemiyorlarsa dağılırlar.',
      'Zafer: şirket değeri hedefin üstünde ve şehrin bir numarası, ya da bütün rakipleri devralmak.',
    ],
    seed: 7,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 200,
    days: 550,
    goal: { kind: 'victory' },
    stars: { metric: 'days', two: 420, three: 380 },
    setup: {
      cash: 35_000_000,
      outlets: ['supermarket', 'supermarket', 'restaurant', 'restaurant', 'department_store', 'cafe', 'cafe', 'boutique', 'boutique', 'electronics_store', 'gym', 'clinic'],
      builtDaysAgo: 150,
      consortium: { warningDays: 30 },
    },
  },
  /*
   * ZİNCİR USTASI (seed 42, 300 gün ön tarih). Ölçüm: giyim ve ekmekte
   * pay 4–49 günde %40'ı geçiyordu (hammadde ve işleme ucuz, kilitleri
   * düşük). Elektronikte iki kapı var: Silikon Ocağı 6 M ₺ şirket
   * değeriyle açılıyor (kasa 3 M ₺) ve 300 günlük şehirde elektroniği
   * rakipler paylaşıyor; pay yavaş birikiyor. Kilit açılmadan alınan
   * sanayi arsası boş bekliyor (ilk vekil hatası: kendi arsasını görmüyor,
   * limanın açıldığı 390. güne kadar sanayi doluyordu).
   *
   * Vekil (250 gün): zinciri kurmayan büyüme kazanamıyor (üç günde bir
   * kuran 223. günde devralınıyor: yeni şirket büyük rakiplerin baskın
   * hedefi); büyümeden yalnızca zinciri kuran süreyi dolduruyor. Zinciri
   * öne alıp üç günde bir kuran 97., beş günde bir kuran 101., 15 günde
   * bir kuran 196. günde hedefte.
   */
  {
    id: 'chain',
    title: 'Zincir ustası',
    tagline: 'Silikondan vitrine: elektroniğin bütün zincirini kur, rafı ele geçir.',
    brief:
      'Şehir kurulmuş, elektroniği rakipler paylaşıyor; mağazaları çipi piyasadan alıyor. Sen elinde nakitle yeni bir şirketsin. Silikon ocağı ve çip fabrikası büyük yatırım ister; ama kendi çipini piyasadan ucuza üretirsen raf da senin olur.',
    goalText:
      '{days} gün içinde elektroniğin bütün zincirini kur (silikon ocağı, çip fabrikası, telefon satan mağaza), çipin birim maliyetini piyasanın altına indir ve elektronikte %{share} paya ulaş.',
    facts: [
      'Silikon Ocağı 6 M ₺, Çip Fabrikası 5 M ₺ şirket değeriyle açılıyor; ikisi de yalnızca sanayi bölgesine ve limana kuruluyor.',
      'Sanayide boş arsa kalmadı: üstünde yapı olan arsayı yapısıyla satın alabilirsin. Liman 90 gün sonra imara açılıyor.',
      'Pay, şehirdeki elektronik satışlarının senin mağazalarından geçen kısmı.',
      'Üç koşul aynı gün sağlanmalı: zincir, maliyet ve pay. Hedef panelindeki senaryo bölümü üçünü de gösteriyor.',
    ],
    seed: 42,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 300,
    days: 250,
    goal: { kind: 'chain', goodId: 'phone', share: 0.4 },
    stars: { metric: 'days', two: 150, three: 90 },
    setup: {
      cash: 3_000_000,
    },
  },
  /*
   * ŞEHRİN SPONSORU (seed 1, 180 gün ön tarih). İlk proje devirden 10 gün
   * sonra açılıyor, ikincisi birincinin bitişinden 30 gün sonra; ikinci
   * ihale 260. günde kapanıyor. Ölçüm: ilk inşaat net değeri bir an
   * düşürüyor ve oyuncu ilk gün üçüncülüğe iniyordu; sıradan düşen
   * şirketin geri dönmek için 20 günü var. Rakipler bu evrede hızlı
   * büyüyor: 4 M ₺ kasayla bütün vekiller ilk ayda sıradan düşüyordu.
   *
   * Vekil (5 M ₺ kasa): hiçbir şey yapmayan ve yalnızca katkı veren
   * 86. günde sıradan düşüyor; 15 günde bir kuran ya projeyi kaptırıyor
   * ya da ilk projeden sonra sıradan düşüyor. Beş günde bir kurup son
   * haftada lideri %10 geçen ×1,25, üç günde bir kurup son üç günde %5
   * geçen ×1,57 ile kazanıyor (katkılar ~0,7 ve ~1,8 M ₺).
   */
  {
    id: 'sponsor',
    title: 'Şehrin sponsoru',
    tagline: 'Belediye iki büyük proje açıyor; ikisine de adını ver, ilk ikiden düşme.',
    brief:
      'Belediye arka arkaya iki şehir projesi ihalesine çıkıyor. En büyük katkı projeye adını veriyor, sponsorun o bölgedeki binalarına kalıcı ayrıcalık getiriyor. Şirket şehrin en değerlisi ama farkı az; iki rakip hızlı büyüyor ve katkı geri dönmüyor.',
    goalText: 'Arka arkaya iki şehir projesinin sponsoru ol; bu sırada şehrin ilk iki şirketinden biri kal.',
    facts: [
      'Katkı tablosu açık: proje panelinden kimin ne verdiğini görürsün. Rakipler haftada bir katkı veriyor, bölgede mağazası olan daha istekli.',
      'Bir projeyi rakip kaparsa senaryo biter. İlk ikiden düşersen geri dönmek için 20 günün var.',
      'Yıldız: ikinci projenin ihalesi kapandığında en güçlü rakibe oranın.',
    ],
    seed: 1,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 180,
    days: 300,
    goal: { kind: 'sponsor', projects: 2, maxRank: 2, graceDays: 20 },
    stars: { metric: 'lead', two: 1.35, three: 1.65 },
    setup: {
      cash: 5_000_000,
      outlets: ['supermarket', 'restaurant', 'cafe', 'boutique', 'electronics_store', 'gym'],
      projects: { firstInDays: 10, gapDays: 30 },
    },
  },
  /*
   * BÜYÜK ŞEHİR FETHİ (seed 7, büyük şehir, 200 gün ön tarih). Hedef
   * tekel: şehirde rakip kalmamalı. Ölçüm iki dondurma getirdi:
   *   - yeni rakip ruhsatı: büyük şehirde boşalan koltuk 60 günde bir
   *     doluyor, gelen kurucu kilidiyle;
   *   - ihraç: premium ve teknoloji doktrinli rakip (Meridyen, Veri,
   *     Firuze) %30 baskıncı görünce kurucu payının tabanına kadar ihraç
   *     ediyor, geri alımla birlikte kontrol bir hisse farkla kilitleniyor.
   *     İhraç açıkken üç rakip hiçbir vekille alınamıyordu (1.200 gün,
   *     500 M ₺ net değerle de).
   * İhraç kapalıyken 40 M ₺ kasayla her avcı vekil 44–176 günde
   * kazanıyordu; kasa 12 M ₺. Geç kalan avcının karşısında rakipler
   * birbirini yutup büyüyor (Meridyen ve Firuze 150–280 M ₺).
   *
   * Vekil (400 gün): hiçbir şey yapmayan, yalnızca büyüyen, kasasını
   * hedefe saklayan avcılar ve 15 günde bir oynayan süreyi dolduruyor.
   * Emirle avlanan 311. günde; her rakipte payı %29'da toplayıp en
   * ucuzdan vuran 241–245. günde, bunu yaparken kasasını hedefe saklayan
   * 155–169. günde tekelde.
   */
  {
    id: 'conquest',
    title: 'Büyük şehir fethi',
    tagline: 'Sekiz rakipli büyük şehirde hepsini devral: tekel, süre sınırıyla.',
    brief:
      'Büyük şehir iki yüz gündür sekiz şirketin elinde. Belediye yeni şirket ruhsatını, SPK yeni hisse ihracını dondurdu: boşalan koltuğa kimse girmeyecek, rakipler de savunmak için hisse basamayacak. Şehirde tek şirket kalana kadar rakipleri tek tek devral.',
    goalText: '{days} gün içinde şehirdeki bütün rakipleri devral.',
    facts: [
      'Devralma bir süreç: emir her gün tavan kadar hisse alıyor; hedef %30\'u görünce kendi hissesini geri alıyor. Payı %30\'un altında sessizce toplayıp sonra emir vermek savunmaya az gün bırakır.',
      'Dolaşımdaki hisse kontrole yetmezse emir düşer. Devraldığın şirketin elindeki başka şirket hisseleri sana geçer.',
      'Bekleyen rakipler birbirini de devralıp büyüyor: geç kalan hedef pahalılaşır.',
      'İki dondurma senaryo boyunca sürüyor; senaryo bitince kalkıyor (senin ihracın da kapalı).',
    ],
    seed: 7,
    citySize: 'large',
    difficulty: 'normal',
    preludeDays: 200,
    days: 400,
    goal: { kind: 'monopoly' },
    stars: { metric: 'days', two: 250, three: 150 },
    setup: {
      cash: 12_000_000,
      outlets: ['supermarket', 'supermarket', 'restaurant', 'restaurant', 'department_store', 'cafe', 'boutique', 'electronics_store'],
      builtDaysAgo: 120,
      freeze: { entrants: true, issuance: true },
    },
  },
  /*
   * HOLDİNG: İKİ ŞEHİR (seed 11, Rahat, kurucu şehirde 150 gün ön tarih).
   * Kurucu şehir uzakta yaşıyor, oyuncu 4 M ₺'yle açılan yeni şehirde
   * başlıyor. Ölçüm: 300 günlük kurucu şehirde rakiplerin ivmesi
   * oyuncuyu üçüncülüğe itiyordu; değer hedefi geçse de (84/60 M ₺)
   * birincilik gelmiyor, hiçbir vekil kazanamıyordu.
   *
   * Vekil (550 gün): hiçbir şey yapmayan ve yalnızca yeni şehri oynayan
   * süreyi dolduruyor (kurucu şehir üçüncülüğe düşüyor). Önce yeni şehri
   * bitirip dönen de: ihmal edilen kurucu şehir 400. günde üçüncü. 15
   * günde bir oynayan ve kârın yarısını kasaya akıtıp savunmasız bırakan
   * da (kurucu şehir ikinciliğe düşüyor). Şehirler arasında gidip gelen,
   * talimatı "şehirde tut + savun" olan: beş günde bir oynayınca 419–427.,
   * üç günde bir oynayınca 356–389. günde.
   */
  {
    id: 'holding',
    title: 'Holding: iki şehir',
    tagline: 'Yeni şehirde sıfırdan başla, kurucu şehir uzakta yaşıyor: ikisinde de zafer.',
    brief:
      'Kurucu şehirde şirket öne geçti ama zafere ulaşmadı. Holding ikinci şehre açılıyor: sen yeni şehirde sıfırdan başlıyorsun, kurucu şehir uzakta kendi kendine yaşıyor. Rakipler orada da büyüyor ve baskın yapıyor.',
    goalText: '{days} gün içinde iki şehirde de zafere ulaş; hiçbir şehri kaybetme.',
    facts: [
      'Holding panelinden şehirler arasında geçebilirsin; senaryo seninle gelir. Uzaktaki şehre talimat verebilir (kârın ne kadarı kasaya aksın, baskına karşı geri alım) ve para gönderebilirsin.',
      'Uzaktaki şehir yeni yatırım yapmıyor: rakipleri büyürken o yerinde sayar. Bir şehri uzun süre bırakırsan sırası düşer.',
      'Zafer şehirde yaratılan değerle ölçülüyor: şehre gönderilen para sayılmıyor, kasaya akan kâr şehrin değerinden düşüyor.',
    ],
    seed: 11,
    citySize: 'standard',
    difficulty: 'easy',
    preludeDays: 150,
    days: 550,
    goal: { kind: 'holding' },
    stars: { metric: 'days', two: 400, three: 350 },
    setup: {
      cash: 10_000_000,
      outlets: ['supermarket', 'supermarket', 'restaurant', 'restaurant', 'department_store', 'cafe', 'cafe', 'boutique', 'electronics_store', 'gym'],
      builtDaysAgo: 120,
      secondCity: { capital: 4_000_000, citySize: 'standard' },
    },
  },
  /*
   * HERKESİN NAKLİYECİSİ (Tur 60; seed 1, 240 gün ön tarih, Aç gözlü
   * rakipler). Lojistik ve Rakipler 2.0: taşıma teklifi rakipten geliyor,
   * kinli rakip getirmiyor. Şehrin mağazalarının çoğu en büyük iki rakipte
   * ve ikisi kinli başlıyor (gururlu −72, pragmatik −60); küçük rakiplerin
   * mağazası hedefe yetmiyor. Kırk mağaza ancak kinli biriyle barışınca.
   *
   * Vekil (beş günde bir kuran, üç günde bir savunan): taşımayan süreyi
   * dolduruyor; her teklifi kabul edip terminal kuran ama uzlaşmayan da
   * (pragmatiğin kini ancak 150 günde söner; 240. günde hedefin %70'i).
   * Uzlaşan 121. günde, 15 günde bir oynayan 181. günde hedefte. Aç gözlü
   * rakipler işi kolaylaştırıyor: kural kapalıyken uzlaşan 145. günde.
   */
  {
    id: 'haulage',
    title: 'Herkesin nakliyecisi',
    tagline: 'Rakiplerin mallarını sen taşı; ama ikisi sana kinli ve hepsi aç gözlü.',
    brief:
      'Şehrin şirketleri hızla büyüyor, mağazaları her bölgede. Önceki yönetim en büyük iki rakiple fiyat savaşına girdi; onlar hâlâ kin besliyor. Elinde birkaç mağaza ve nakit var. Kamyon filosu kurup rakiplerin dağıtımını üstlenirsen hem kazanırsın hem barışırsın.',
    goalText: '{days} gün içinde aynı gün en az {rivals} rakibin toplam {outlets} mağazasını taşı.',
    facts: [
      'Taşıma teklifi rakipten gelir; kinli rakip teklif getirmez. Uzlaşma (Rakipler paneli) ve her taşıma sözleşmesi ilişkiyi düzeltir.',
      'Nakliye Terminali 1,5 M ₺ şirket değeriyle açılıyor: filosu 16 mağaza, menzili 10 parsel.',
      'Aç gözlü rakipler: daha cesur yatırıyor (taşınacak mağaza çok) ve baskına erken başlıyor.',
    ],
    seed: 1,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 240,
    modifiers: ['hungry_rivals'],
    days: 240,
    goal: { kind: 'freight', rivals: 2, outlets: 40 },
    stars: { metric: 'days', two: 160, three: 110 },
    setup: {
      cash: 2_500_000,
      outlets: ['supermarket', 'restaurant', 'cafe', 'boutique'],
      builtDaysAgo: 120,
      feud: 2,
    },
  },
  /*
   * KARANLIK KIŞ (Tur 60; seed 5, 200 gün ön tarih, Sıkı banka). Enerji
   * krizi bir ay sonra başlıyor ve senaryonun son günü bitiyor: şebeke
   * fiyatı iki katı. Santralin menzilindeki rakip binası santrale fatura
   * ödüyor. Seed 5: liman 160. günde açılmış, sanayi ve limanda boş parsel
   * var (seed 42'de 200. günde sanayi doluydu, santral kurulamıyordu).
   * Doğalgaz santrali 2,5 M ₺ şirket değeriyle açılıyor; devirde değer
   * onun biraz üstünde.
   *
   * Vekil: santral kurmayan, dört santralle yetinen ve 15 günde bir oynayan
   * süreyi dolduruyor (%92–96). Sekiz santralli 157., en keskinler (daha
   * az mağaza kuran ya da on iki santrale izin veren) 152. günde. Kendi
   * mağazası santralin gücünü önce alıyor: santralin yanına mağaza kurmak
   * rakibe satılacak elektriği azaltıyor.
   *
   * Sıkı banka yalnız kredi çekene dokunuyor: devirde limit 492 B ₺ %13,5
   * (kuralsız 821 B ₺ %9,5). Vekillerin kredisiz sonucu kuralla aynı;
   * kredi çeken vekilin günü kuralla kuralsız arasında gürültüde (±5 gün).
   * Kıt arsa da denendi: santral parseli kıtlaşıyor ama vekiller birbirine
   * yaklaşıyor (dört santralli 15 günde bir oynayan sekiz santralliyle
   * aynı yerde); senaryo ayırt etmiyordu.
   */
  {
    id: 'blackout',
    title: 'Karanlık kış',
    tagline: 'Enerji krizi geliyor; santrali olan kazanır, ama banka sana sıkı.',
    brief:
      'Doğalgaz arzında tıkanma bekleniyor: bir ay sonra şebeke fiyatı ikiye katlanacak ve kriz kış boyu sürecek. Şirketin sekiz mağazası var ama kasası ince ve banka temkinli. Rakiplerin binaları şebekeye bağlı: santralinin menzilindeki her rakip binası krizde faturasını sana öder.',
    goalText: '{days} gün içinde santrallerinden rakiplere toplam {target} değerinde elektrik sat.',
    facts: [
      'Santral önce kendi binalarına, artan gücü menzilindeki rakip binalarına veriyor; rakip şebeke fiyatının %5 altından ödüyor.',
      'Doğalgaz Santrali 2,5 M ₺ şirket değeriyle açılıyor, sanayi bölgesine ve limana kuruluyor. Yakıtını sabitlersen kriz fiyatı santralinin kârına döner.',
      'Kendi binaların santralin gücünü önce alır: santrali rakiplerin binalarının arasına kur.',
      'Sıkı banka: kredi ve kredili hesap faizi 4 puan yüksek, kredi limitleri %40 düşük.',
    ],
    seed: 5,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 200,
    modifiers: ['tight_credit'],
    days: 180,
    goal: { kind: 'power', target: 4_000_000 },
    stars: { metric: 'days', two: 155, three: 140 },
    setup: {
      cash: 1_400_000,
      outlets: ['supermarket', 'supermarket', 'restaurant', 'restaurant', 'cafe', 'boutique', 'electronics_store', 'gym'],
      builtDaysAgo: 120,
      crisis: { id: 'energy_shock', warningDays: 30 },
    },
  },
  /*
   * KENTSEL DÖNÜŞÜM (Tur 60; seed 7, 250 gün ön tarih, Kıt arsa).
   * Gayrimenkul: arsa pahalı, dönüşüm ihalesinin parseli imar artışıyla
   * büyük proje veriyor. Hedef iki koşul: dolu birim ve açılmış iki
   * dönüşüm projesi. Yalnız birimle hiçbir vekil dönüşüme girmeden
   * kazanıyordu (ihale yavaş, boş parsel yetiyordu).
   *
   * Vekil: proje kurmayan, dört projeyle yetinen, dönüşüme girmeyen ve
   * yalnız dönüşümle büyüyen ya devralınıyor ya süreyi dolduruyor (proje
   * nakdi yiyor, geri alım kasası kalmıyor). Sekiz projeli geliştirici
   * 243., ihalede tabanın altı katına çıkan 215. günde hedefte. 420 günlük
   * ön tarih denendi: şehir doluyor ama rakipler 27–33 M ₺ oluyor, her
   * vekil 190. gün dolayında devralınıyordu.
   */
  {
    id: 'renewal',
    title: 'Kentsel dönüşüm',
    tagline: 'Arsa kıt ve pahalı: eski yapıları dönüştür, projeleri kiracıyla doldur.',
    brief:
      'Şehirde boş arsa az ve pahalı; kilitli bölgeler geç açılıyor. Belediye eski yapıların yerine kentsel dönüşüm ihalesine çıkıyor: kazanan, imar artışıyla büyük bir proje kurar. Şirketin elinde nakit ve iki kiralık bina var.',
    goalText: '{days} gün içinde kiralıklarında {units} dolu birime ulaş; en az {renewals} dönüşüm projesi açılmış olsun.',
    facts: [
      'Konut Sitesi ve Ofis Kampüsü bir parsele en çok birimi sığdırıyor; inşaatı 75–100 gün sürüyor, kiracı zamanla geliyor.',
      'Dönüşüm başvurusu (şehir yapısının panelinde): sıradaki ihale o parsel. Dönüşüm parselindeki proje 1,6 kat birimle; hak sahipleri hedefe sayılmıyor.',
      'Kira: pahalı kira doluluğu düşürür, ucuz kira doldurur.',
      'Kıt arsa: arsa fiyatları %70 yüksek, ihale taban fiyatı da; kilitli bölgeler %50 geç açılır.',
    ],
    seed: 7,
    citySize: 'standard',
    difficulty: 'normal',
    preludeDays: 250,
    modifiers: ['scarce_land'],
    days: 360,
    goal: { kind: 'rental', units: 1_500, renewals: 2 },
    stars: { metric: 'days', two: 250, three: 200 },
    setup: {
      cash: 6_000_000,
      outlets: ['residence', 'office_tower'],
      builtDaysAgo: 120,
    },
  },
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario]));

localizeList(SCENARIOS, 'scenario', ['title', 'tagline', 'brief', 'goalText', 'facts']);
