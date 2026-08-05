import { SCHEMA_VERSION } from '@capital/core';
import type { GameState } from '@capital/core';

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

export type LoadOutcome =
  | { ok: true; state: GameState; migratedFrom?: number }
  | { ok: false; reason: string };

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
};

function migrate(raw: Record<string, unknown>): LoadOutcome {
  const meta = raw['meta'] as { schemaVersion?: number } | undefined;
  let version = meta?.schemaVersion;

  if (typeof version !== 'number') {
    return { ok: false, reason: 'Kayıt sürümü okunamadı — dosya bozuk görünüyor.' };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Bu kayıt oyunun daha yeni bir sürümünden (v${version}). Oyunu güncelleyin.`,
    };
  }

  const from = version;
  let current = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      return { ok: false, reason: `v${version} kaydını taşıyacak bir göç adımı yok.` };
    }
    current = step(current);
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
    return { ok: false, reason: `Kayıt eksik veya bozuk: ${problems.join(', ')}.` };
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

// ---------------------------------------------------------------- IndexedDB

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'meta.slot' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('IndexedDB açılamadı, localStorage kullanılacak.', request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ------------------------------------------------------------- Genel API

export async function saveGame(state: GameState, slot: number, name?: string): Promise<SaveMeta> {
  const meta = buildMeta(state, slot, name ?? (slot === AUTOSAVE_SLOT ? 'Otomatik kayıt' : `Kayıt ${slot}`));
  const record: SaveRecord = { meta, state };

  const db = await openDb();
  if (db) {
    await tx(db, 'readwrite', (store) => store.put(record));
  } else {
    localStorage.setItem(LS_PREFIX + slot, JSON.stringify(record));
  }
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const db = await openDb();
  let records: SaveRecord[] = [];

  if (db) {
    records = await tx<SaveRecord[]>(db, 'readonly', (store) => store.getAll() as IDBRequest<SaveRecord[]>);
  } else {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const raw = localStorage.getItem(LS_PREFIX + slot);
      if (!raw) continue;
      try {
        records.push(JSON.parse(raw) as SaveRecord);
      } catch {
        /* bozuk kaydı listeye alma */
      }
    }
  }

  return records
    .map((record) => record.meta)
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot);
}

export async function loadGame(slot: number): Promise<LoadOutcome> {
  const db = await openDb();
  let record: SaveRecord | undefined;

  try {
    if (db) {
      record = await tx<SaveRecord>(db, 'readonly', (store) => store.get(slot) as IDBRequest<SaveRecord>);
    } else {
      const raw = localStorage.getItem(LS_PREFIX + slot);
      if (raw) record = JSON.parse(raw) as SaveRecord;
    }
  } catch (error) {
    return { ok: false, reason: `Kayıt okunamadı: ${(error as Error).message}` };
  }

  if (!record?.state) return { ok: false, reason: 'Bu slotta kayıt yok.' };
  return migrate(record.state as unknown as Record<string, unknown>);
}

export async function deleteSave(slot: number): Promise<void> {
  const db = await openDb();
  if (db) await tx(db, 'readwrite', (store) => store.delete(slot));
  else localStorage.removeItem(LS_PREFIX + slot);
}

export function exportToJson(state: GameState): string {
  return JSON.stringify({ meta: buildMeta(state, -1, 'Dışa aktarım'), state }, null, 2);
}

export function importFromJson(text: string): LoadOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Dosya geçerli JSON değil.' };
  }

  const record = parsed as { state?: unknown };
  const candidate = (record.state ?? parsed) as Record<string, unknown>;
  return migrate(candidate);
}
