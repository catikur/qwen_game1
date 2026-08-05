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

export const SCHEMA_VERSION = 1;

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
  /** Sahip şirket kimliği; null = satılık. */
  ownerId: string | null;
  /** Üzerindeki bina örneğinin kimliği. */
  buildingId: string | null;
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
  color: string;
  cash: number;
  debt: number;
  /** Kategori bazlı marka gücü 0..1; pazar payında çarpan. */
  brand: Record<CategoryId, number>;
  netWorth: number;
  /** Kategori bazlı şehir geneli pazar payı 0..1. */
  marketShare: Record<CategoryId, number>;
  today: CompanyLedger;
  /** Son 90 günün net değeri — grafikler için. */
  netWorthHistory: number[];
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
  activeEvents: ActiveEvent[];
  news: NewsItem[];
  nextId: number;
  flags: FeatureFlags;
}

/** UI'nin çekirdeğe gönderdiği tek yönlü niyet bildirimleri. */
export type GameCommand =
  | { type: 'SET_SPEED'; speed: GameSpeed }
  | { type: 'TOGGLE_PAUSE' }
  | { type: 'BUY_TILE'; tileId: number }
  | { type: 'SELL_TILE'; tileId: number }
  | { type: 'BUILD'; tileId: number; defId: string }
  | { type: 'DEMOLISH'; tileId: number }
  | { type: 'SET_PRICE_MULTIPLIER'; buildingId: string; multiplier: number }
  | { type: 'SET_AUTO_PRICE'; buildingId: string; auto: boolean }
  | { type: 'RENAME_COMPANY'; name: string }
  | { type: 'SET_FLAG'; flag: keyof FeatureFlags; value: boolean };

/** Komut reddedildiğinde UI'ye dönen açıklama. */
export interface CommandResult {
  ok: boolean;
  reason?: string;
}
