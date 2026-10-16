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
/** Son uygulanan gönderimlerin kimlikleri: yanıtı kaybolanın tekrarı (arada başka cihaz eşitlese de) tanınıyor. */
const RECENT_BATCHES = 16;

/**
 * `saves.batch`: `{ids, nonce, away}` (JSON). `ids` son gönderim kimlikleri
 * (yeniden eskiye); `nonce` kaydı yazan isteğe özgü (puan yalnızca kayıt o
 * isteğin yazdığı haldeyse ekleniyor); `away` günlük bir ayrılışla bittiyse o
 * ayrılışın kalan kazanç tavanı (sonraki gönderim aynı ayrılışla sürerse).
 */
function marker(raw: string | null): { ids: string[]; away: number | null } {
  if (!raw) return { ids: [], away: null };
  try {
    const parsed = JSON.parse(raw) as { ids?: unknown; away?: unknown };
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string') : [raw];
    const away = typeof parsed?.away === 'number' && Number.isFinite(parsed.away) && parsed.away >= 0 ? parsed.away : null;
    return { ids, away };
  } catch {
    return { ids: [raw], away: null };
  }
}

const recentBatches = (raw: string | null): string[] => marker(raw).ids;

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
    // Gönderim kimlikleri korunuyor (web ya da Android'in yanıtı kaybolan gönderimi iOS yüklemesinden sonra da
    // tanınsın); açık ayrılış kapanıyor (kayıt iOS'un, ayrılışı orada sayıldı).
    `UPDATE saves SET version = ?, state = ?, cursor = ?, at = ?,
       batch = CASE WHEN json_valid(batch) THEN json_set(batch, '$.away', NULL) ELSE batch END
     WHERE player_id = ? AND version = ?`,
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
  const recent = recentBatches(row.batch);
  if (body.base !== row.version) {
    // Yanıtı kaybolan gönderimin tekrarı (arada başka cihaz eşitlemiş olabilir): zaten uygulandı.
    if ((body.base as number) < row.version && recent.includes(batch)) {
      return { ...current, applied: 0, skipped: 0, clipped: 0, score: await weekScore(db, playerId, week) };
    }
    throw new HttpError(409, 'stale', { ...current });
  }
  if (now - row.at < MIN_SYNC_GAP && ops.length > 0) throw new HttpError(429, 'slow');

  const budget = Math.max(0, (now - row.cursor) / 1000 + SYNC.slack);
  const result = replay(current.state, ops as SyncOp[], budget, body.rest === 0, marker(row.batch).away);
  let cursor = row.cursor + result.seconds * 1000;
  // Günlük şimdiye kadar tamsa kullanılmayan süre birikmiyor (sonra "çevrimiçi
  // oynadım" diye harcanamasın).
  if (body.rest === 0) cursor = Math.max(cursor, now - SYNC.slack * 1000);
  const gained = weekShare(result.spans, row.cursor, week);
  const next = row.version + 1;
  const written = JSON.stringify({
    ids: [batch, ...recent.filter((id) => id !== batch)].slice(0, RECENT_BATCHES),
    nonce: crypto.randomUUID(),
    away: result.awayLeft,
  });
  const done = result.state;
  // Kayıt ve haftalık puan tek işlemde: biri yazılıp öbürü düşerse tekrar "zaten uygulandı"
  // diye dönüp puanı kaybederdi. Puan yalnızca kayıt bu isteğin yazdığı haldeyse (işareti)
  // ekleniyor: yarışı kaybeden istek ya da aynı anda gelen kopya puan eklemiyor.
  await db.batch([
    [
      'UPDATE saves SET version = ?, state = ?, cursor = ?, batch = ?, at = ? WHERE player_id = ? AND version = ?',
      next,
      JSON.stringify(done),
      cursor,
      written,
      now,
      playerId,
      row.version,
    ],
    [
      `INSERT INTO reports (player_id, week, score, city, stars, city_earned, levels, at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM saves WHERE player_id = ? AND version = ? AND batch = ?)
       ON CONFLICT (player_id, week) DO UPDATE SET score = reports.score + excluded.score, city = excluded.city,
         stars = excluded.stars, city_earned = excluded.city_earned, levels = excluded.levels, at = excluded.at`,
      playerId,
      week,
      gained,
      done.city,
      done.stars,
      done.earned,
      JSON.stringify(CHAIN_IDS.map((id) => [...done.chains[id].levels])),
      now,
      playerId,
      next,
      written,
    ],
  ]);
  const after = await db.first<{ batch: string | null }>('SELECT batch FROM saves WHERE player_id = ?', playerId);
  if (after?.batch !== written) {
    // Aynı anda gelen başka bir gönderim kazandı; aynı kimlikli kopyaysa o zaten uygulandı.
    const fresh = await loadSave(db, playerId);
    if (fresh && recentBatches(after?.batch ?? null).includes(batch)) {
      return { ...fresh, applied: 0, skipped: 0, clipped: 0, score: await weekScore(db, playerId, week) };
    }
    throw new HttpError(409, 'stale', { ...(fresh ?? current) });
  }
  const score = await weekScore(db, playerId, week);
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
