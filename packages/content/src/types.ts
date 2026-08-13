/**
 * İçerik tanımlarının tipleri.
 *
 * Bu paket saf veridir: ne simülasyonu ne de render'ı bilir. Core bu tanımları
 * okur, render sadece görsel alanlarını kullanır.
 */

/** Tüketici talebinin toplandığı sektörler. */
import type { CeoPortrait } from './ceos';

export type CategoryId =
  | 'grocery'
  | 'dining'
  | 'retail'
  | 'electronics'
  | 'services'
  | 'housing'
  | 'office';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  /** Birim taban fiyat (oyun para birimi). */
  basePrice: number;
  /** Satılan birim başına maliyet oranı (0..1). */
  costRatio: number;
  /**
   * Fiyat esnekliği. Yüksek değer = fiyat artınca talep hızla düşer.
   * Lüks kategorilerde düşük, temel ihtiyaçta yüksektir.
   */
  elasticity: number;
  /** Kişi başı günlük talep birimi (gelir çarpanı uygulanmadan önce). */
  demandPerCapita: number;
  /** Gelir seviyesinin talebe etkisi (0 = etkisiz, 1 = doğrusal). */
  incomeSensitivity: number;
  /** UI ve lens renkleri. */
  color: string;
}

/** Tedarik zincirindeki kademe. */
export type GoodTier = 'raw' | 'intermediate' | 'consumer';

/**
 * Bir ürün.
 *
 * Zincir sabit üç kademedir: hammadde → ara mal → tüketici ürünü.
 * Hammadde ve ara mallar şirketler arası spot pazarda işlem görür
 * (`basePrice` onların referans fiyatıdır); tüketici ürünleri görmez,
 * onların fiyatı kategorinin `basePrice`'ından gelir.
 */
export interface GoodDef {
  id: string;
  name: string;
  tier: GoodTier;
  /** Yalnızca `consumer`: hangi kategoride yarışır. */
  category: CategoryId | null;
  /** Bir alt kademedeki girdi ürünü; `raw` ve zincirsiz üründe null. */
  inputGoodId: string | null;
  /** Spot pazar referans fiyatı. Tüketici ürünlerinde 0 (işlem görmez). */
  basePrice: number;
  /**
   * Yalnızca `consumer`: zincirden bağımsız perakende işleme maliyeti.
   * Ambalaj, fire, raf işçiliği — zincire sahip olmak bunu ucuzlatmaz,
   * yalnızca depo menzili kısmen hafifletir.
   */
  retailCost: number;
  /** Kategori talebinin bu ürüne düşen taban payı; aynı kategoride toplam 1. */
  demandShare: number;
  /**
   * Yalnızca `consumer`: bölge arketipine göre talep ağırlığı.
   *
   * Aynı kategorideki iki ürün, denge kimliği yüzünden AYNI birim
   * maliyete sahiptir — yani tek başına "hangisini satayım" diye bir
   * karar doğmaz. Kararı doğuran şey bu: ekmek orta gelir mahallesinde,
   * bisküvi turizm bölgesinde daha çok satar. Raf seçimi böylece bir
   * KONUM kararına dönüşür.
   *
   * Verilmeyen arketipte 1 kabul edilir. Paylar bölge içinde
   * normalize edilir, yani kategorinin toplam talebi değişmez.
   */
  archetypeWeights?: Partial<Record<DistrictArchetypeId, number>>;
  color: string;
}

/** Bir binanın hangi ekonomik rolü oynadığı. */
export type BuildingRole =
  /** Tüketiciye satış yapar; pazar payı yarışına girer. */
  | 'outlet'
  /** Kira geliri üretir; pazar payı yarışına girmez. */
  | 'rental'
  /** Menzilindeki kendi outlet'lerinin dağıtım maliyetini düşürür. */
  | 'logistics'
  /** Hammadde üretir; girdisi yoktur. */
  | 'extract'
  /** Hammaddeyi ara mala dönüştürür. */
  | 'process'
  /** Atandığı kategorideki kendi outlet'lerinin kalitesini yükseltir. */
  | 'research'
  /** Atandığı kategorideki marka hedefini payının üstüne çeker. */
  | 'marketing';

export interface BuildingDef {
  id: string;
  name: string;
  role: BuildingRole;
  category: CategoryId;
  /** Aynı ailenin kaçıncı kademesi; yükseltme zinciri için. */
  tier: number;
  cost: number;
  upkeepPerDay: number;
  /** Günlük hizmet kapasitesi (outlet) veya birim üretimi (production). */
  capacity: number;
  /** Ürün/hizmet kalitesi 0..1; pazar payında çarpan. */
  quality: number;
  /** İstihdam ettiği kişi; ücret gideri ve district istihdamı. */
  jobs: number;
  /** Etki yarıçapı (tile). Logistics ve rental için anlamlı. */
  radius: number;
  /** Görsel: taban rengi ve bina yüksekliği (tile birimi). */
  color: string;
  height: number;
  /** Bu binanın açılması için gereken şirket değeri. */
  unlockNetWorth: number;
  description: string;
  /** `extract` / `process`: günde ürettiği ürün. Diğer rollerde tanımsız. */
  outputGoodId?: string;
  /** `outlet`: rafında kaç farklı ürün taşıyabilir (varsayılan 1). */
  slots?: number;
  /**
   * `research` / `marketing`: atandığı kategoriye kattığı tavan.
   *
   * `def.category` bu binalar için ANLAMSIZDIR — hangi kategoriye
   * çalıştığını bina örneğinin `focus` alanı söyler. Kataloğa yine de bir
   * kategori yazıyoruz çünkü `CategoryId` zorunlu; menüde nerede
   * görüneceğini o belirliyor.
   */
  focusPotency?: number;
  /**
   * Kurulabileceği district arketipleri. Verilmezse her yere kurulur.
   *
   * Üretim üniteleri yalnızca sanayi ve limana kurulabilir: şehir
   * haritasında merkeze çiftlik dikmek hem tuhaf hem de kolay olurdu.
   * Kısıt yeni bir gerilim üretiyor — sanayi bölgesi, en düşük arsa
   * değerine ve en az tüketici talebine sahip olmasına rağmen şehrin en
   * çekişmeli arazisi haline geliyor.
   */
  zones?: DistrictArchetypeId[];
}

export type DistrictArchetypeId =
  | 'downtown'
  | 'retail_strip'
  | 'industrial'
  | 'port'
  | 'tech_park'
  | 'lux_residential'
  | 'mid_residential'
  | 'student'
  | 'tourism';

export interface DistrictArchetypeDef {
  id: DistrictArchetypeId;
  name: string;
  /** Başlangıç nüfusu. */
  population: number;
  /** Gelir seviyesi 0..1. */
  incomeLevel: number;
  /** Arsa taban değeri (tile başına). */
  baseLandValue: number;
  /** Kategori bazlı talep ağırlıkları; 1 = nötr. */
  demandWeights: Partial<Record<CategoryId, number>>;
  /** Zemin rengi. */
  color: string;
}

export type NpcTrait =
  | 'expansionist'
  | 'price_cutter'
  | 'premium'
  | 'tech'
  | 'landlord';

export interface NpcProfileDef {
  id: string;
  name: string;
  trait: NpcTrait;
  startingCash: number;
  /** Karar verirken kâr marjına verdiği ağırlık. */
  marginWeight: number;
  /** Karşılanmamış talebe verdiği ağırlık. */
  demandWeight: number;
  /** Fiyatı taban fiyata göre çarpanı. */
  priceMultiplier: number;
  /** Haftalık yatırım için nakdinin kullanmaya razı olduğu oran. */
  aggression: number;
  color: string;
  description: string;
  /**
   * Rakibin yüzü ve adı.
   *
   * Bugüne kadar rakiplerin `ceoId`'si null'dı: adları, renkleri, hatta
   * karakter tarifleri vardı ama BİR YÜZLERİ YOKTU. Seni geçtiklerinde
   * ekranda beliren şey bir şirket adıydı; kaybettiğin kişinin kim
   * olduğunu göremiyordun.
   *
   * `ceoId` yerine doğrudan portre tutuluyor, çünkü CEO tanımları
   * oyuncunun seçtiği PERK'leri de taşıyor — rakiplere ceoId vermek
   * onlara görünmez avantajlar dağıtmak olurdu. Rakipler oyuncuyla aynı
   * kurallara tabi; değişen tek şey artık bir yüzlerinin olması.
   */
  ceoName: string;
  portrait: CeoPortrait;
}
