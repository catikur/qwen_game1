/**
 * Sunucu yetkili kayıt (L10): web ve Android hesaplarının oyunu sunucuda.
 *
 * İstemci son eşitlemeden beri yaptıklarını günlük olarak gönderiyor
 * (`packages/lite-model/src/sync.ts`); sunucu aynı modeli kendi durumundan
 * oynatıyor ve haftalık puanı kendisi hesaplıyor. Süre sunucunun saatinden:
 * `cursor` günlüğün kullandığı gerçek zaman, şimdiyi geçemiyor.
 *
 * Sürüm (`version`) iyimser kilit: istemci hangi sürümün üstüne oynadığını
 * söylüyor; arada başka cihaz eşitlediyse 409 `stale` ve güncel durum.
 */
import {
  CHAIN_IDS,
  SYNC,
  newGame,
  normalizeState,
  replay,
  validOp,
  validState,
  weekId,
  weekStart,
  type LiteState,
  type SyncOp,
} from '../../lite-model/src/index';
import type { Db } from './db';
import { HttpError } from './http';

const WEEK_MS = 7 * 86_400_000;
/** Eşitleme gövdesi sınırı (bayt): en çok `SYNC.maxOps` kayıt. */
export const MAX_SYNC_BODY = 65_536;
/** İki eşitleme arası en az (ms). */
const MIN_SYNC_GAP = 2_000;

export type Platform = 'ios' | 'web' | 'android';
export const PLATFORMS: readonly Platform[] = ['ios', 'web', 'android'];

interface SaveRow {
  player_id: string;
  version: number;
  state: string;
  cursor: number;
  batch: string | null;
  at: number;
}

export interface SaveView {
  version: number;
  state: LiteState;
  /** Günlüğün kullandığı gerçek zaman (ms, sunucu saati). */
  cursor: number;
}

function view(row: SaveRow): SaveView {
  return { version: row.version, state: JSON.parse(row.state) as LiteState, cursor: row.cursor };
}

/** Yeni hesabın oyunu: sıfırdan, açılıştan önce oynanmış süre için biraz pay. */
export async function createSave(db: Db, playerId: string, now: number): Promise<SaveView> {
  const row: SaveRow = { player_id: playerId, version: 0, state: JSON.stringify(newGame()), cursor: now - SYNC.headStart * 1000, batch: null, at: now };
  await db.run(
    'INSERT INTO saves (player_id, version, state, cursor, batch, at) VALUES (?, ?, ?, ?, ?, ?)',
    row.player_id,
    row.version,
    row.state,
    row.cursor,
    row.batch,
    row.at,
  );
  return view(row);
}

export async function loadSave(db: Db, playerId: string): Promise<SaveView | null> {
  const row = await db.first<SaveRow>('SELECT * FROM saves WHERE player_id = ?', playerId);
  return row ? view(row) : null;
}

/**
 * Cihazın kendi kaydını yüklemesi (iOS: oyun cihazda, App Attest onaylı).
 * Başka cihazın eşitlemesinden sonra eski sürümün üstüne yükleme 409 `stale`.
 * Süre sayacı (`cursor`) şimdiye: buradan sonra web ya da Android eşitlerse
 * süre bu andan sayılıyor.
 */
export async function uploadSave(db: Db, playerId: string, now: number, body: Record<string, unknown>): Promise<SaveView> {
  const state = normalizeState(body.state);
  if (!validState(state) || !(body.base === null || Number.isInteger(body.base))) throw new HttpError(400, 'body');
  const row = await db.first<SaveRow>('SELECT * FROM saves WHERE player_id = ?', playerId);
  if (!row) {
    if (body.base !== null) throw new HttpError(409, 'stale', { version: null });
    await db.run('INSERT INTO saves (player_id, version, state, cursor, batch, at) VALUES (?, 1, ?, ?, NULL, ?)', playerId, JSON.stringify(state), now, now);
    return { version: 1, state, cursor: now };
  }
  if (body.base !== row.version) throw await staleSave(db, playerId, now, row);
  const changed = await db.run(
    'UPDATE saves SET version = ?, state = ?, cursor = ?, batch = NULL, at = ? WHERE player_id = ? AND version = ?',
    row.version + 1,
    JSON.stringify(state),
    Math.max(row.cursor, now),
    now,
    playerId,
    row.version,
  );
  if (changed === 0) throw await staleSave(db, playerId, now, row);
  return { version: row.version + 1, state, cursor: Math.max(row.cursor, now) };
}

/**
 * iOS'un eski sürümün üstüne yüklemesi: güncel kayıt ve bu haftanın puanı
 * (cihaz haftalık sayacını sunucunun puanından sürdürsün; yoksa sonraki
 * gönderimleri sunucudakinden düşük kalıp "azalma" diye reddedilirdi).
 */
async function staleSave(db: Db, playerId: string, now: number, row: SaveRow): Promise<HttpError> {
  const current = (await saveWithScore(db, playerId, now)) ?? { ...view(row), week: weekId(now), score: await weekScore(db, playerId, weekId(now)) };
  return new HttpError(409, 'stale', { ...current });
}

/** Kayıt ve bu haftanın puanı (cihaz değişince haftalık sayaç buradan sürüyor). */
export async function saveWithScore(db: Db, playerId: string, now: number): Promise<(SaveView & { week: string; score: number }) | null> {
  const save = await loadSave(db, playerId);
  if (!save) return null;
  const week = weekId(now);
  return { ...save, week, score: await weekScore(db, playerId, week) };
}

/**
 * Zaman dilimlerinin bu haftaya düşen puanı. Dilimler `cursor`'dan başlayıp
 * art arda gerçek zamana yerleşiyor; haftanın dışında kalan pay (geçen hafta
 * çoktan kapandı) sayılmıyor, sınırı aşan dilim süresiyle orantılı bölünüyor.
 */
export function weekShare(spans: ReadonlyArray<{ seconds: number; score: number }>, cursor: number, week: string): number {
  const from = weekStart(week);
  const to = from + WEEK_MS;
  let at = cursor;
  let score = 0;
  for (const span of spans) {
    const end = at + span.seconds * 1000;
    if (end > at) {
      const overlap = Math.max(0, Math.min(end, to) - Math.max(at, from));
      score += (span.score * overlap) / (end - at);
    }
    at = end;
  }
  return score;
}

export interface SyncResult extends SaveView {
  applied: number;
  skipped: number;
  /** Sunucunun saatine sığmayan süre (sn): istemci saati ileri ya da hile. */
  clipped: number;
  /** Bu haftanın puanı. */
  score: number;
}

/**
 * Günlüğü oynat, kaydı ve bu haftanın puanını yaz. Gövde:
 * `{base, batch, ops, rest}`; `rest` istemcide bekleyen başka kayıt sayısı
 * (0 ise günlük şimdiye kadar tam: kullanılmayan süre bankada kalmıyor).
 */
export async function sync(db: Db, playerId: string, now: number, body: Record<string, unknown>): Promise<SyncResult> {
  const row = await db.first<SaveRow>('SELECT * FROM saves WHERE player_id = ?', playerId);
  if (!row) throw new HttpError(404, 'save');
  const batch = typeof body.batch === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(body.batch) ? body.batch : null;
  const ops = body.ops;
  if (!batch || !Number.isInteger(body.base) || !Array.isArray(ops) || ops.length > SYNC.maxOps || !ops.every(validOp)) {
    throw new HttpError(400, 'body');
  }
  const current = view(row);
  const week = weekId(now);
  if (body.base !== row.version) {
    // Yanıtı kaybolan gönderimin tekrarı: aynısı zaten uygulandı.
    if (body.base === row.version - 1 && batch === row.batch) {
      return { ...current, applied: 0, skipped: 0, clipped: 0, score: await weekScore(db, playerId, week) };
    }
    throw new HttpError(409, 'stale', { ...current });
  }
  if (now - row.at < MIN_SYNC_GAP && ops.length > 0) throw new HttpError(429, 'slow');

  const budget = Math.max(0, (now - row.cursor) / 1000 + SYNC.slack);
  const result = replay(current.state, ops as SyncOp[], budget, body.rest === 0);
  let cursor = row.cursor + result.seconds * 1000;
  // Günlük şimdiye kadar tamsa kullanılmayan süre birikmiyor (sonra "çevrimiçi
  // oynadım" diye harcanamasın).
  if (body.rest === 0) cursor = Math.max(cursor, now - SYNC.slack * 1000);
  const gained = weekShare(result.spans, row.cursor, week);
  const state = JSON.stringify(result.state);
  const changed = await db.run(
    'UPDATE saves SET version = ?, state = ?, cursor = ?, batch = ?, at = ? WHERE player_id = ? AND version = ?',
    row.version + 1,
    state,
    cursor,
    batch,
    now,
    playerId,
    row.version,
  );
  // Aynı anda gelen iki gönderimden biri: öbürü kazandı.
  if (changed === 0) {
    const fresh = await loadSave(db, playerId);
    throw new HttpError(409, 'stale', { ...(fresh ?? current) });
  }
  const score = await addWeekScore(db, playerId, week, gained, result.state, now);
  if (result.skipped > 0 || result.clipped > SYNC.slack) {
    await db.run(
      'INSERT INTO rejects (player_id, week, reason, at) VALUES (?, ?, ?, ?)',
      playerId,
      week,
      `sync:skipped=${result.skipped},clipped=${Math.round(result.clipped)}`,
      now,
    );
  }
  return {
    version: row.version + 1,
    state: result.state,
    cursor,
    applied: result.applied,
    skipped: result.skipped,
    clipped: result.clipped,
    score,
  };
}

async function weekScore(db: Db, playerId: string, week: string): Promise<number> {
  return (await db.first<{ score: number }>('SELECT score FROM reports WHERE player_id = ? AND week = ?', playerId, week))?.score ?? 0;
}

/** Haftalık satırı (iOS gönderimiyle aynı tablo) sunucunun hesapladığı puanla güncelle. */
async function addWeekScore(db: Db, playerId: string, week: string, gained: number, state: LiteState, now: number): Promise<number> {
  const score = (await weekScore(db, playerId, week)) + gained;
  await db.run(
    `INSERT INTO reports (player_id, week, score, city, stars, city_earned, levels, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id, week) DO UPDATE SET score = excluded.score, city = excluded.city, stars = excluded.stars,
       city_earned = excluded.city_earned, levels = excluded.levels, at = excluded.at`,
    playerId,
    week,
    score,
    state.city,
    state.stars,
    state.earned,
    JSON.stringify(CHAIN_IDS.map((id) => [...state.chains[id].levels])),
    now,
  );
  return score;
}

/** Genel tablo için oyuncunun son yıldızı ve platformu. */
export async function touchProfile(db: Db, playerId: string, platform: Platform, stars: number, city: number, now: number): Promise<void> {
  await db.run(
    `INSERT INTO profiles (player_id, platform, stars, city, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET platform = excluded.platform, stars = excluded.stars, city = excluded.city, at = excluded.at`,
    playerId,
    platform,
    Math.max(0, Math.floor(stars)),
    Math.max(0, Math.floor(city)),
    now,
  );
}
