import type { CategoryId, DistrictArchetypeId } from '@capital/content';
import type { RngState } from './rng';

/**
 * Oyun durumu.
 *
 * KURAL: Bu ağacın içinde fonksiyon, Map, Set veya class örneği bulunamaz.
 * State doğrudan `JSON.stringify` ile kaydedilebilir olmalıdır; davranış
 * içerik tanımlarında (`@capital/content`) ve sistem fonksiyonlarında durur,
 * state'te sadece kimlik ve sayı taşınır.
 */

export const SCHEMA_VERSION = 6;

/**
 * Bir karenin şehirdeki rolü.
 *
 * `road` ve `civic` hiçbir zaman satılmaz; `plot` satılabilir ama üzerinde
 * mevcut bir yapı varsa önce sahibinden primli devralınmalıdır. Gerçek
 * şehirlerdeki "istediğin yeri alamazsın" kısıtı bu ayrımdan doğuyor.
 */
export type TileKind = 'road' | 'plot' | 'civic';

export type GameSpeed = 0 | 1 | 2 | 3;

/** Her hız kademesinde bir oyun gününün gerçek süresi (ms). */
export const SPEED_MS: Record<Exclude<GameSpeed, 0>, number> = {
  1: 2600,
  2: 1200,
  3: 480,
};

export interface Tile {
  id: number;
  x: number;
  y: number;
  districtId: number;
  kind: TileKind;
  /** Sahip şirket kimliği; null = sahipsiz. */
  ownerId: string | null;
  /** Üzerindeki bina örneğinin kimliği (oyuncu/rakip yapısı). */
  buildingId: string | null;
  /** Şehrin mevcut yapısı (oyuna ait değil); doluysa parsel satılık değildir. */
  structureId: string | null;
  /** Mevcut yapının görsel yüksekliği. */
  structureHeight: number;
  /** Arsanın güncel değeri. Satış fiyatı bunun üzerinden hesaplanır. */
  landValue: number;
}

export interface DistrictState {
  id: number;
  name: string;
  archetype: DistrictArchetypeId;
  /** Tile sınırları (dahil). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  population: number;
  incomeLevel: number;
  /** Günlük talep (birim), son tick'te hesaplanan. */
  demand: Record<CategoryId, number>;
  /** Karşılanamayan talep oranı 0..1 — NPC ve oyuncu için ana sinyal. */
  unmet: Record<CategoryId, number>;
  /** Bölgedeki ortalama fiyat / taban fiyat oranı. */
  priceIndex: Record<CategoryId, number>;
  /** Bu bölgede kaç rakip outlet var (kategori bazlı). */
  outletCount: Record<CategoryId, number>;
}

export interface BuildingLedger {
  unitsSold: number;
  capacityUsed: number;
  revenue: number;
  cogs: number;
  upkeep: number;
  wages: number;
  profit: number;
  /** Bulunduğu district+kategoride aldığı pazar payı 0..1. */
  share: number;
  /** Üretim üniteleri: bugün ürettiği birim. */
  producedUnits: number;
  /** Üretim üniteleri: pazara satılan fazla üretim. */
  soldToMarket: number;
}

export interface BuildingInstance {
  id: string;
  defId: string;
  tileId: number;
  districtId: number;
  companyId: string;
  /** Taban fiyata uygulanan çarpan. */
  priceMultiplier: number;
  /** Açıkken motor fiyatı kendi ayarlar (casual mod). */
  autoPrice: boolean;
  builtDay: number;
  /**
   * Outlet: raflarındaki tüketici ürünleri. Kapasite bu ürünler arasında
   * çekicilik oranında paylaşılır. Üretim ünitelerinde boştur — onların
   * çıktısı bina tanımından gelir.
   */
  stocked: string[];
  /**
   * `research` / `marketing`: hangi kategoriye çalıştığı. Diğer rollerde
   * null.
   *
   * Bina tanımındaki `category` bu iki rol için anlamsız — menüde nerede
   * göründüğünü belirlemekten başka işi yok. Asıl karar bu alanda ve
   * oyuncu istediği zaman değiştirebiliyor.
   */
  focus: CategoryId | null;
  last: BuildingLedger;
}

export interface CompanyLedger {
  revenue: number;
  cogs: number;
  upkeep: number;
  wages: number;
  interest: number;
  profit: number;
}

export interface CompanyState {
  id: string;
  name: string;
  isPlayer: boolean;
  /** NPC ise hangi profilden geldiği. */
  profileId: string | null;
  /** Oyuncu ise seçtiği CEO; etkileri içerik tanımından okunur. */
  ceoId: string | null;
  color: string;
  cash: number;
  debt: number;
  /** Kategori bazlı marka gücü 0..1; pazar payında çarpan. */
  brand: Record<CategoryId, number>;
  /**
   * Kategori bazlı birikmiş Ar-Ge kalite primi 0..0,30.
   *
   * Atanmış Ar-Ge merkezlerinin belirlediği tavana doğru yavaşça ilerler,
   * merkez yıkılınca aynı hızla geri erir. Çekicilik formülünde
   * `def.quality` üstüne TOPLAMSAL girer — sıfırken ekonomi Tur 1 ile
   * birebir aynı kalır.
   */
  research: Record<CategoryId, number>;
  /**
   * Şirket kimliği → elindeki hisse adedi (toplam 10.000).
   *
   * Kendi hisseleri burada TUTULMAZ; serbest dolaşım
   * `10.000 − başkalarının elindeki` olarak türetilir. Hiç hisse
   * almamış bir şirkette bu sözlük boştur ve net değer formülü Tur 3'teki
   * haline birebir indirgenir.
   */
  shares: Record<string, number>;
  netWorth: number;
  /** Kategori bazlı şehir geneli pazar payı 0..1. */
  marketShare: Record<CategoryId, number>;
  today: CompanyLedger;
  /** Son 90 günün net değeri — grafikler için. */
  netWorthHistory: number[];
  /**
   * Ürün → ihtiyacının kendi üretiminden karşılanan oranı 0..1.
   * Zincir kartındaki "Sende / Darboğaz / Pazardan" durumu buradan okunur.
   */
  supplyRatio: Record<string, number>;
  /**
   * Ürün → bir birimin şirkete harmanlanmış maliyeti.
   * Kendi ürettiğin oran kadar kendi maliyetin, kalanı spot fiyat.
   * Tüketici ürünlerinde perakende işleme maliyeti de dahildir.
   */
  unitCost: Record<string, number>;
}

/**
 * Şehir geneli spot pazar.
 *
 * Sahip olmadığın her halkayı buradan alırsın; fazla ürettiğini buraya
 * satarsın. Fiyat, şirketlerin yarattığı arz fazlasıyla hareket eder —
 * kimse üretmiyorsa referans fiyattadır, herkes üretiyorsa çöker.
 */
export interface MarketState {
  /** Ürün → güncel spot fiyat. */
  spot: Record<string, number>;
  /** Ürün → dünkü şehir geneli üretim. */
  produced: Record<string, number>;
  /** Ürün → dünkü şehir geneli tüketim. */
  consumed: Record<string, number>;
  /**
   * Ürün → şehrin taban işlem hacmi. Fazla üretimin fiyatı ne kadar
   * kırdığı buna göre ölçeklenir; harita büyüdükçe kendi kendine büyür.
   */
  reference: Record<string, number>;
}

export interface ActiveEvent {
  defId: string;
  startedDay: number;
  remainingDays: number;
}

export type NewsTone = 'good' | 'bad' | 'neutral' | 'rival';

export interface NewsItem {
  id: number;
  day: number;
  tone: NewsTone;
  title: string;
  body: string;
}

/** Sistemleri kademeli açmak için — plandaki feature flag katmanı. */
export interface FeatureFlags {
  npcCompetition: boolean;
  randomEvents: boolean;
  manualPricing: boolean;
  landValueDrift: boolean;
  /** Belediye periyodik olarak parsel ihalesine çıkarsın mı. */
  landAuctions: boolean;
}

/**
 * Açık parsel ihalesi.
 *
 * Bugüne kadar parsel alımı "ilk gelen alır"dı ve bu, arazi rekabetini
 * fiilen yok ediyordu: rakip haftada bir karar veriyor, oyuncu istediği
 * an alabiliyordu. İhale araziyi gerçekten çekişmeli hale getiriyor.
 *
 * Açık artırma seçildi (kapalı zarf değil) çünkü kapalı zarf oyuncuya
 * GERİ BİLDİRİM vermez: kaybettiğinde neden kaybettiğini bilmez. Açık
 * artırma rakibin değerlemesini öğretiyor — bir sayı tablosu vermeden
 * rakibin kafasının içini göstermenin en ucuz yolu.
 */
export interface AuctionState {
  tileId: number;
  /** Bu günün sonunda ihale kapanır. */
  endsOnDay: number;
  /** Taban fiyat; kimse geçmezse parsel normal satışa döner. */
  reserve: number;
  /** Şu anki en yüksek teklif. */
  bid: number;
  bidderId: string | null;
  /** Kaç kez artırıldı — oyuncuya çekişmenin sertliğini gösterir. */
  rounds: number;
}

export interface GameMeta {
  schemaVersion: number;
  contentVersion: number;
  gameVersion: string;
  seed: number;
  createdAtIso: string;
  playTimeMs: number;
}

export interface GameTime {
  /** Oyun başından bu yana geçen gün. 0 = kuruluş günü. */
  day: number;
  speed: GameSpeed;
  /** Bir sonraki güne kalan gerçek süre (ms). */
  accumulatorMs: number;
}

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[];
}

export interface GameState {
  meta: GameMeta;
  time: GameTime;
  rng: RngState;
  map: MapState;
  districts: DistrictState[];
  companies: Record<string, CompanyState>;
  playerCompanyId: string;
  buildings: Record<string, BuildingInstance>;
  market: MarketState;
  activeEvents: ActiveEvent[];
  news: NewsItem[];
  nextId: number;
  flags: FeatureFlags;
  /** Açık ihale; yoksa null. */
  auction: AuctionState | null;
}

/** UI'nin çekirdeğe gönderdiği tek yönlü niyet bildirimleri. */
export type GameCommand =
  | { type: 'SET_SPEED'; speed: GameSpeed }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'BUY_TILE'; tileId: number }
  /** Mevcut yapıyı sahibinden primli devralıp yıkar. */
  | { type: 'BUYOUT_TILE'; tileId: number }
  | { type: 'SELL_TILE'; tileId: number }
  | { type: 'BUILD'; tileId: number; defId: string }
  | { type: 'DEMOLISH'; tileId: number }
  | { type: 'SET_PRICE_MULTIPLIER'; buildingId: string; multiplier: number }
  | { type: 'SET_AUTO_PRICE'; buildingId: string; auto: boolean }
  /** Bir outlet'in raflarındaki ürünleri değiştirir. */
  | { type: 'SET_STOCK'; buildingId: string; goodIds: string[] }
  /** Bir Ar-Ge merkezinin veya pazarlama ofisinin çalıştığı kategoriyi değiştirir. */
  | { type: 'SET_FOCUS'; buildingId: string; category: CategoryId }
  /** Açık ihaleye teklif verir. */
  | { type: 'PLACE_BID'; amount: number }
  /** Bir rakibin hisselerini alır. */
  | { type: 'BUY_SHARES'; companyId: string; count: number }
  /** Elindeki hisseleri satar. */
  | { type: 'SELL_SHARES'; companyId: string; count: number }
  | { type: 'RENAME_COMPANY'; name: string }
  | { type: 'SET_FLAG'; flag: keyof FeatureFlags; value: boolean };

/** Komut reddedildiğinde UI'ye dönen açıklama. */
export interface CommandResult {
  ok: boolean;
  reason?: string;
}
