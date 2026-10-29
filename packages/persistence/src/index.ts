import { SCHEMA_VERSION, seedSpotPrices, zeroByCategoryRecord, zeroByGood } from '@capital/core';
import type { GameState } from '@capital/core';
import { BUILDING_BY_ID, GOODS, GOOD_BY_ID, defaultGoodFor } from '@capital/content';

/**
 * Kalıcılık katmanı.
 *
 * Önceki projede save sistemi oyunu kırmıştı: state içinde fonksiyon
 * taşındığı için JSON onları sessizce atıyordu. Burada bu sınıf mimari
 * olarak engelleniyor — `GameState` yalnızca veri taşır — ve üstüne
 * şu güvenceler ekleniyor:
 *   - şema sürümü ve migration zinciri,
 *   - her slot için okunabilir metadata,
 *   - bozuk kayıtta sessizce yeni oyuna düşme yerine NET hata,
 *   - JSON dışa/içe aktarma.
 */

const DB_NAME = 'capital-game';
const DB_VERSION = 1;
const STORE = 'saves';
const LS_PREFIX = 'capital-game:save:';

export const AUTOSAVE_SLOT = 0;
export const MAX_SLOTS = 6;

export interface SaveMeta {
  slot: number;
  name: string;
  companyName: string;
  day: number;
  netWorth: number;
  updatedAtIso: string;
  schemaVersion: number;
  gameVersion: string;
  playTimeMs: number;
}

export interface SaveRecord {
  meta: SaveMeta;
  state: GameState;
}

/**
 * Kaydın neden açılmadığı (Tur 75). Arayüz bunu oyuncunun dilinde söylüyor
 * (`app.load.problem.*`); `reason` geliştiricinin Türkçe açıklaması (günlük,
 * testler). İngilizce ve Almanca oyunda da Türkçe gerekçe görünüyordu.
 */
export type LoadProblem = 'notJson' | 'noVersion' | 'newer' | 'noMigration' | 'broken' | 'unreadable' | 'empty' | 'reportWithoutSave';

export type LoadOutcome =
  | { ok: true; state: GameState; migratedFrom?: number }
  | { ok: false; problem: LoadProblem; reason: string; version?: number };

/** Hata raporunun türü (`packages/ui/src/bugReport.ts`): içe aktarma raporun içindeki kaydı açıyor. */
export const BUG_REPORT_KIND = 'capitalforge-bug-report';

/**
 * Şema göçleri. Anahtar = kaynağın sürümü, değer = bir üst sürüme taşıyan
 * fonksiyon. Yeni bir alan eklendiğinde buraya bir adım eklenir; eski
 * kayıtlar kaybolmaz.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  /**
   * v1 → v2: parsel sistemi ve CEO seçimi eklendi.
   *
   * Eski şehirlerde sokak ızgarası ve mevcut yapı dokusu yoktu. Kaydı
   * yeniden üretmek ilerlemeyi silerdi; bunun yerine her kareyi boş parsel
   * sayıyoruz. Eski şehir yolsuz görünmeye devam eder ama oynanır kalır.
   */
  1: (raw) => {
    const tiles = (raw['map'] as { tiles?: Array<Record<string, unknown>> } | undefined)?.tiles;
    if (Array.isArray(tiles)) {
      for (const tile of tiles) {
        tile['kind'] = 'plot';
        tile['structureId'] = null;
        tile['structureHeight'] = 0;
      }
    }

    const companies = raw['companies'] as Record<string, Record<string, unknown>> | undefined;
    if (companies) {
      for (const company of Object.values(companies)) {
        if (company['ceoId'] === undefined) company['ceoId'] = null;
      }
    }
    return raw;
  },

  /**
   * v2 → v3: tedarik zinciri eklendi.
   *
   * Eski kayıtlarda ürün, spot pazar ve raf kavramı yoktu. Hiçbiri
   * ilerlemeyi etkilemiyor, hepsi türetilebilir:
   *   - her outlet kategorisinin varsayılan ürününü rafına alır,
   *   - spot fiyatlar referans değerleriyle başlar (yani eski kayıt
   *     "hiç üretimi olmayan oyuncu" olarak devam eder — ekonomisi
   *     birebir aynı kalır),
   *   - referans hacimler bölgelerin nüfusundan yeniden türetilir,
   *   - eski `factory` binası artık kumaş üreten dokuma fabrikasıdır.
   */
  2: (raw) => {
    const buildings = raw['buildings'] as Record<string, Record<string, unknown>> | undefined;
    if (buildings) {
      for (const building of Object.values(buildings)) {
        if (building['defId'] === 'factory') building['defId'] = 'textile_mill';

        const def = BUILDING_BY_ID[String(building['defId'])];
        const good = def?.role === 'outlet' ? defaultGoodFor(def.category) : null;
        building['stocked'] = good ? [good] : [];

        const ledger = building['last'] as Record<string, unknown> | undefined;
        if (ledger) {
          ledger['producedUnits'] = 0;
          ledger['soldToMarket'] = 0;
        }
      }
    }

    const companies = raw['companies'] as Record<string, Record<string, unknown>> | undefined;
    if (companies) {
      for (const company of Object.values(companies)) {
        company['supplyRatio'] = zeroByGood();
        company['unitCost'] = seedSpotPrices();
      }
    }

    raw['market'] = {
      spot: seedSpotPrices(),
      produced: zeroByGood(),
      consumed: zeroByGood(),
      reference: legacyReferenceVolumes(raw),
    };

    return raw;
  },

  /**
   * v3 → v4: rekabet kolları eklendi.
   *
   * Ar-Ge primi ve odak alanı, eski kayıtta karşılığı olmayan iki yeni
   * alan. İkisi de SIFIRDAN başlıyor ve bu bilinçli: Ar-Ge primi
   * toplamsal, tabanı sıfır olduğu için eski kayıt "hiç Ar-Ge yapmamış
   * oyuncu" olarak devam ediyor ve ekonomisi birebir aynı kalıyor —
   * v2 → v3 göçünde spot fiyatlar için kurduğumuz mantığın aynısı.
   */
  3: (raw) => {
    const companies = raw['companies'] as Record<string, Record<string, unknown>> | undefined;
    if (companies) {
      for (const company of Object.values(companies)) {
        company['research'] = zeroByCategoryRecord();
      }
    }

    const buildings = raw['buildings'] as Record<string, Record<string, unknown>> | undefined;
    if (buildings) {
      for (const building of Object.values(buildings)) building['focus'] = null;
    }

    return raw;
  },

  /**
   * v4 → v5: parsel ihalesi eklendi.
   *
   * Eski kayıtta açık ihale olamaz; `auction: null` ile başlıyorlar ve
   * bir sonraki periyotta ilk ihale kendiliğinden açılıyor. Bayrak
   * varsayılan olarak açık — mekanik yeni oyunla eski kayıtta aynı
   * davransın.
   */
  4: (raw) => {
    raw['auction'] = null;
    const flags = raw['flags'] as Record<string, unknown> | undefined;
    if (flags && flags['landAuctions'] === undefined) flags['landAuctions'] = true;
    return raw;
  },

  /**
   * v5 → v6: borsa eklendi.
   *
   * Eski kayıtta hisse portföyü olamaz; boş sözlükle başlıyorlar. Portföy
   * değeri net değere TOPLAMSAL girdiği ve boşken sıfır olduğu için eski
   * kaydın ekonomisi birebir aynı kalıyor — v3 → v4 göçündeki Ar-Ge primi
   * için kurduğumuz mantığın aynısı.
   */
  5: (raw) => {
    const companies = raw['companies'] as Record<string, Record<string, unknown>> | undefined;
    if (companies) {
      for (const company of Object.values(companies)) company['shares'] = {};
    }
    return raw;
  },
};

/**
 * v2 kaydından spot pazar referans hacimlerini türetir.
 *
 * `worldgen` bunu talep modelinden hesaplıyor; burada kaydın kendi
 * nüfusundan kaba bir karşılığını üretiyoruz. Referans yalnızca fazla
 * üretimin fiyatı ne kadar kırdığını ölçekler, bu yüzden yaklaşık olması
 * yeterli — ve göç anında hiç üretim olmadığı için etkisi sıfırdır.
 */
function legacyReferenceVolumes(raw: Record<string, unknown>): Record<string, number> {
  const districts = (raw['districts'] as Array<{ population?: number }> | undefined) ?? [];
  let population = 0;
  for (const district of districts) population += district.population ?? 0;

  const reference = zeroByGood();
  for (const good of GOODS) {
    if (good.tier !== 'consumer' || !good.category) continue;

    // Kategorinin kişi başı talebi içerikte; burada kaba bir taban yeter.
    const cityDemand = population * 0.15 * good.demandShare;
    let current = GOOD_BY_ID[good.inputGoodId ?? ''];
    while (current) {
      reference[current.id] = (reference[current.id] ?? 0) + cityDemand;
      current = GOOD_BY_ID[current.inputGoodId ?? ''];
    }
  }
  return reference;
}

function migrate(raw: Record<string, unknown>): LoadOutcome {
  const meta = raw['meta'] as { schemaVersion?: number } | undefined;
  let version = meta?.schemaVersion;

  if (typeof version !== 'number') {
    return { ok: false, problem: 'noVersion', reason: 'Kayıt sürümü okunamadı — dosya bozuk görünüyor.' };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      problem: 'newer',
      version,
      reason: `Bu kayıt oyunun daha yeni bir sürümünden (v${version}). Oyunu güncelleyin.`,
    };
  }

  const from = version;
  let current = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      return { ok: false, problem: 'noMigration', version, reason: `v${version} kaydını taşıyacak bir göç adımı yok.` };
    }
    // Bozuk eski kayıt adımı düşürebiliyor (şirketin yerinde null gibi): açılış
    // ve içe aktarma hata fırlatmasın, kaydın bozuk olduğunu söylesin (Tur 75).
    try {
      current = step(current);
    } catch (error) {
      return { ok: false, problem: 'broken', reason: `Kayıt eksik veya bozuk: v${version} göçü düştü (${(error as Error).message}).` };
    }
    version += 1;
    (current['meta'] as { schemaVersion: number }).schemaVersion = version;
  }

  const validation = validate(current);
  if (!validation.ok) return validation;

  return from < SCHEMA_VERSION
    ? { ok: true, state: current as unknown as GameState, migratedFrom: from }
    : { ok: true, state: current as unknown as GameState };
}

/** Yükleme öncesi yapısal doğrulama — çöp veri motora girmesin. */
function validate(raw: Record<string, unknown>): LoadOutcome {
  const state = raw as unknown as GameState;
  const problems: string[] = [];

  if (!state.map || !Array.isArray(state.map.tiles)) problems.push('harita');
  else if (state.map.tiles.length !== state.map.width * state.map.height) problems.push('harita boyutu');
  if (!Array.isArray(state.districts) || state.districts.length === 0) problems.push('bölgeler');
  if (!state.companies || !state.companies[state.playerCompanyId]) problems.push('oyuncu şirketi');
  if (!state.time || typeof state.time.day !== 'number') problems.push('zaman');
  if (!state.buildings || typeof state.buildings !== 'object') problems.push('binalar');

  if (problems.length > 0) {
    return { ok: false, problem: 'broken', reason: `Kayıt eksik veya bozuk: ${problems.join(', ')}.` };
  }
  return { ok: true, state };
}

export function buildMeta(state: GameState, slot: number, name: string): SaveMeta {
  const player = state.companies[state.playerCompanyId]!;
  return {
    slot,
    name,
    companyName: player.name,
    day: state.time.day,
    netWorth: Math.round(player.netWorth),
    updatedAtIso: new Date().toISOString(),
    schemaVersion: state.meta.schemaVersion,
    gameVersion: state.meta.gameVersion,
    playTimeMs: state.meta.playTimeMs,
  };
}

// ------------------------------------------------------------- Depolar

/**
 * Kaydın yazıldığı yer (Tur 66).
 *
 * Tarayıcıda IndexedDB, olmazsa yerel depolama, o da olmazsa bellek.
 * Masaüstü sürümü (`apps/desktop`) açılışta kendi deposunu veriyor: her
 * slot bir dosya, oyuncu kaydını görüp yedekleyebiliyor, Steam Cloud
 * eşitleyebiliyor. Kaydın biçimi ve göçler iki yerde de aynı; depo yalnız
 * kaydı taşıyor.
 */
export interface SaveBackend {
  put(record: SaveRecord): Promise<void>;
  get(slot: number): Promise<SaveRecord | undefined>;
  /** Yalnız künyeler: listeyi açmak bütün şehirleri okumasın. */
  list(): Promise<SaveMeta[]>;
  remove(slot: number): Promise<void>;
}

let installed: SaveBackend | null = null;

/** Masaüstü kabuğu açılışta çağırıyor; `null` tarayıcının deposuna döner. */
export function setSaveBackend(backend: SaveBackend | null): void {
  installed = backend;
  writable.clear();
}

function backend(): SaveBackend {
  return installed ?? browserBackend;
}

// ---------------------------------------------------------------- IndexedDB

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    // `indexedDB.open` gizli sekmede ve bölümlenmiş (partitioned) bir
    // çerçevede SENKRON SecurityError atar — onerror'a hiç gelmez. Bu
    // yüzden çağrının kendisi de sarmalanmalı, yoksa açılıştaki
    // `loadGame` yakalanmamış bir reddetmeye düşer ve oyun boot olmaz.
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      console.warn('IndexedDB açılamadı, yerel depolamaya düşülüyor.', error);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'meta.slot' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('IndexedDB açılamadı, yerel depolamaya düşülüyor.', request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

// ------------------------------------------------------- Yerel depolama

/**
 * `localStorage` da her ortamda yok: gizli sekme kotayı sıfırlar,
 * bölümlenmiş çerçevede erişimin kendisi hata atar. İkisi de olmadığında
 * kayıt sessizce ölmesin diye bellek içi son bir kademe var — o oturum
 * boyunca kaydet/yükle çalışır, sekme kapanınca gider.
 */
const memoryStore = new Map<string, string>();
let localStorageOk: boolean | null = null;

function hasLocalStorage(): boolean {
  if (localStorageOk !== null) return localStorageOk;
  try {
    const probe = LS_PREFIX + 'probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    localStorageOk = true;
  } catch {
    console.warn('Yerel depolama kullanılamıyor; kayıtlar yalnızca bu oturumda tutulacak.');
    localStorageOk = false;
  }
  return localStorageOk;
}

function storeWrite(key: string, value: string): void {
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      // kota doldu — bellek kademesine düş
      localStorageOk = false;
    }
  }
  memoryStore.set(key, value);
}

function storeRead(key: string): string | null {
  if (hasLocalStorage()) return localStorage.getItem(key);
  return memoryStore.get(key) ?? null;
}

function storeRemove(key: string): void {
  if (hasLocalStorage()) localStorage.removeItem(key);
  else memoryStore.delete(key);
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ----------------------------------------------------- Tarayıcının deposu

const browserBackend: SaveBackend = {
  async put(record) {
    const db = await openDb();
    if (db) await tx(db, 'readwrite', (store) => store.put(record));
    else storeWrite(LS_PREFIX + record.meta.slot, JSON.stringify(record));
  },

  async get(slot) {
    const db = await openDb();
    if (db) return tx<SaveRecord | undefined>(db, 'readonly', (store) => store.get(slot) as IDBRequest<SaveRecord | undefined>);
    const raw = storeRead(LS_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveRecord) : undefined;
  },

  async list() {
    const db = await openDb();
    let records: SaveRecord[] = [];
    if (db) {
      records = await tx<SaveRecord[]>(db, 'readonly', (store) => store.getAll() as IDBRequest<SaveRecord[]>);
    } else {
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const raw = storeRead(LS_PREFIX + slot);
        if (!raw) continue;
        try {
          records.push(JSON.parse(raw) as SaveRecord);
        } catch {
          /* bozuk kaydı listeye alma */
        }
      }
    }
    return records.map((record) => record.meta);
  },

  async remove(slot) {
    const db = await openDb();
    if (db) await tx(db, 'readwrite', (store) => store.delete(slot));
    else storeRemove(LS_PREFIX + slot);
  },
};

// ------------------------------------------------------------- Genel API

/**
 * Slotta oyunun daha yeni bir sürümünün kaydı var; üstüne yazılmadı (Tur 75).
 *
 * Steam Cloud kaydı cihazlar arasında taşıyor. Steam'in beta dalındaki ya da
 * güncellenmiş öbür cihazdaki oyunun kaydı bu sürüme gelince bu sürüm onu
 * açamıyor (`newer`). Yeni oyunun otomatik kaydı onun üstüne yazıyordu;
 * eşitlenince ilerleme iki cihazda birden gidiyordu.
 */
export class NewerSaveError extends Error {
  constructor(
    readonly slot: number,
    readonly schemaVersion: number,
  ) {
    super(`Slot ${slot}: oyunun daha yeni bir sürümünün kaydı var (v${schemaVersion}), üstüne yazılmadı.`);
    this.name = 'NewerSaveError';
  }
}

/** Bu oturumda üstüne yazılabildiği bilinen slotlar: slot ilk yazılışta bir kez okunuyor. */
const writable = new Set<number>();

function savedSchemaVersion(record: SaveRecord | undefined): number | undefined {
  const version = record?.state?.meta?.schemaVersion ?? record?.meta?.schemaVersion;
  return typeof version === 'number' ? version : undefined;
}

export async function saveGame(state: GameState, slot: number, name?: string): Promise<SaveMeta> {
  if (!writable.has(slot)) {
    let existing: SaveRecord | undefined;
    let read = true;
    try {
      existing = await backend().get(slot);
    } catch {
      read = false;
    }
    const version = savedSchemaVersion(existing);
    if (version !== undefined && version > SCHEMA_VERSION) throw new NewerSaveError(slot, version);
    // Okunamayan kayıt kurtarılamıyor, üstüne yazılıyor (eskisi gibi); slot sonraki yazışta yine okunuyor.
    if (read) writable.add(slot);
  }
  const meta = buildMeta(state, slot, name ?? (slot === AUTOSAVE_SLOT ? 'Otomatik kayıt' : `Kayıt ${slot}`));
  await backend().put({ meta, state });
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const metas = await backend().list();
  return metas.filter(Boolean).sort((a, b) => a.slot - b.slot);
}

export async function loadGame(slot: number): Promise<LoadOutcome> {
  let record: SaveRecord | undefined;
  try {
    record = await backend().get(slot);
  } catch (error) {
    return { ok: false, problem: 'unreadable', reason: `Kayıt okunamadı: ${(error as Error).message}` };
  }

  if (!record?.state) return { ok: false, problem: 'empty', reason: 'Bu slotta kayıt yok.' };
  const outcome = migrate(record.state as unknown as Record<string, unknown>);
  // Bu sürümün açtığı kayıt bu sürümün yazabileceği kayıt.
  if (outcome.ok) writable.add(slot);
  return outcome;
}

export async function deleteSave(slot: number): Promise<void> {
  await backend().remove(slot);
  writable.add(slot);
}

export function exportToJson(state: GameState): string {
  return JSON.stringify({ meta: buildMeta(state, -1, 'Dışa aktarım'), state }, null, 2);
}

export function importFromJson(text: string): LoadOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'notJson', reason: 'Dosya geçerli JSON değil.' };
  }

  let record = (parsed && typeof parsed === 'object' ? parsed : {}) as { state?: unknown; kind?: unknown; save?: unknown };
  // Hata raporu da içe aktarılıyor (Tur 75): raporun kaydı dışa aktarılanla aynı
  // biçimde. Raporun kendisi "dosya bozuk" diye reddediliyordu.
  if (record.kind === BUG_REPORT_KIND) {
    if (!record.save || typeof record.save !== 'object') {
      return { ok: false, problem: 'reportWithoutSave', reason: 'Bu hata raporunda kayıt yok.' };
    }
    record = record.save as { state?: unknown };
  }
  const candidate = (record.state ?? record) as Record<string, unknown>;
  return migrate(candidate);
}
