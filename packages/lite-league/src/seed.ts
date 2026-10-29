/**
 * Tohum Ligi (Tur 51): ana oyunun haftalık koşuları da bu sunucuda.
 *
 * GitHub Pages'teki oyun tabloyu buradan okuyor ve koşusunu buraya
 * gönderiyor. Hesap anonim: kimlik ve anahtar oyuncunun tarayıcısında, ad
 * yok (tabloda şirket adı görünüyor). Hesaplar Lite'ınkilerle aynı tabloda
 * ama ayrı türde (`tokens.platform = 'capital'`); biri ötekinin uçlarını
 * kullanamıyor (`app.ts`).
 *
 * GÜVEN (Tur 52). Sunucu koşuyu gönderimde baştan oynatıyor (`replayRun`,
 * oyunun kendi motoru); skor ve eğri tutmazsa koşu tabloya girmiyor. Tabloya
 * yalnız doğrulanmış koşu giriyor, en iyi 50 de doğrulanmış skorla kesiliyor;
 * tarayıcılar sunucunun satırlarını yeniden oynatmıyor (`verified`). Tekrar
 * pahalı (koşu başına ~1–2 sn CPU, Workers Paid): ucuz denetimler önce, tekrar
 * en son. Koşu sunucununkinden başka bir simülasyon sürümünde oynanmışsa
 * sunucu yargılayamıyor (409 `sim`): oyun koşuyu bekletiyor, sürümler
 * eşleşince gidiyor. Başka bir oyuncunun koşusunun aynısı (skor ve eğri)
 * kabul edilmiyor (409 `copy`): ilk gönderen sayılıyor, sunucunun saatiyle.
 *
 * İKİ TÜR TABLO (Tur 53). Haftanın tohumu (360 gün, haftanın kuralıyla) ve
 * günün koşusu (90 gün, UTC günü). Koşunun kodu hangisi olduğunu kimliğinden
 * söylüyor (`2026-W43` ya da `2026-10-22`); ikisi aynı tabloda, kimlik
 * `week` sütununda. Oyuncu başına tablo başına tek satır.
 *
 * Uç noktalar (JSON):
 * - `POST /v1/seed/players`        → anonim hesap: {id, token}
 * - `POST /v1/seed/runs {code}`    → koşu gönder; oyuncunun o tablodaki en iyisi kalıyor
 * - `GET  /v1/seed/weeks/:week`    → haftanın tablosu, herkese açık (kimlikle gelince `mine`)
 * - `GET  /v1/seed/days/:day`      → günün koşusunun tablosu (Tur 53), aynı biçim
 * - `GET  /v1/seed/codes/:key`     → bir satırın koşu kodu (tabloda yalnız özeti var)
 * - `GET  /v1/seed/sim`            → sunucunun simülasyon izi (Tur 71, canlı denetim)
 * - `DELETE /v1/players/me`        → hesabı ve koşularını sil (Lite ile aynı uç)
 * - `…/v1/seed/leagues…`           → davetli ligler (Tur 55, `seedLeagues.ts`)
 */
import { RUN_LIMITS, decodeRunChecked, replayRun, simFingerprint, type LeagueRun, type ReplayResult } from '../../core/src/league';
import { leagueBoardKind, leagueDayId, type LeagueBoardKind } from '../../core/src/systems/leagueWeek';
import { weekId } from '../../lite-model/src/index';
import type { Db } from './db';
import { HttpError, allowedOrigin, json, randomToken, readJson, sha256 } from './http';
import { offensiveName } from './names';

export const SEED = {
  /**
   * Hafta dönünce geçen haftanın koşusu bu kadar süre daha kabul (ms): pazar
   * gecesi başlayıp pazartesi biten dürüst koşu kaybolmasın.
   */
  graceMs: 6 * 3_600_000,
  /** Aynı hesabın iki gönderimi arası en az (ms). */
  minGapMs: 30_000,
  /** Tablo: en iyi bu kadar satır (oyuncunun kendisi dışarıda kalsa da ekleniyor). */
  tableSize: 50,
  /** Koşular bu kadar hafta saklanıyor (`weekly` temizliği). */
  keepWeeks: 12,
  /** Günün koşuları bu kadar gün (Tur 53): her gün yeni tablo, eskisine bakılmıyor. */
  keepDays: 14,
  /** IP başına saatlik sınırlar (IP'nin kendisi değil, saatle birlikte özeti). */
  accountsPerHour: 10,
  runsPerHour: 30,
} as const;

/**
 * Sunucunun tekrarı. Testler kendi izini ve tekrarını veriyor (sahte koşularla
 * istemciyi denemek için); canlı sunucu her zaman oyunun motoru.
 */
export interface SeedReplay {
  /** Sunucunun simülasyon izi (`simFingerprint`, ilk ihtiyaçta ~0,5 sn). */
  sim(): string;
  replay(run: LeagueRun): Promise<ReplayResult>;
}

export const SERVER_REPLAY: SeedReplay = { sim: simFingerprint, replay: (run) => replayRun(run) };

/** Gönderim gövdesi sınırı (bayt): oyunun kendi kod sınırı ve zarf. */
export const MAX_RUN_BODY = RUN_LIMITS.codeLength + 1_024;

const HOUR = 3_600_000;
const CODE_KEY = /^[0-9a-f]{64}$/;

interface SeedRow {
  id: string;
  player_id: string;
  company: string;
  ceo: string | null;
  score: number;
  curve: string;
  code_key: string;
  size: number;
  idle: number;
  at: number;
}

/** Tablodaki satır: oyuncunun kimliği değil satırın kendi kimliği; kod yerine özeti ve boyu. */
export interface SeedEntry {
  id: string;
  weekId: string;
  companyName: string;
  ceoId: string | null;
  score: number;
  curve: number[];
  submittedAt: string;
  codeKey: string;
  codeSize: number;
  mine: boolean;
  /** Sunucu yeniden oynattı, skor ve eğri tuttu (Tur 52; tablodaki her satır). */
  verified: true;
  /** Günlük boş (hiç oynanmamış): kopya denetimi bunları ayırmıyor. */
  idle: boolean;
}

/** Gönderim kabul eden haftalar: bu hafta, ilk saatlerinde geçen hafta da. */
export function openWeeks(now: number): string[] {
  const current = weekId(now);
  const previous = weekId(now - SEED.graceMs);
  return previous === current ? [current] : [current, previous];
}

/** Gönderim kabul eden günler (Tur 53): bugün (UTC), ilk saatlerinde dün de. */
export function openDays(now: number): string[] {
  const current = leagueDayId(new Date(now));
  const previous = leagueDayId(new Date(now - SEED.graceMs));
  return previous === current ? [current] : [current, previous];
}

/** Türün açık tabloları. */
export function openBoards(now: number, kind: LeagueBoardKind): string[] {
  return kind === 'day' ? openDays(now) : openWeeks(now);
}

/**
 * Tabloda herkese görünen şirket adı. Oyun adı serbest bırakıyor (noktalama,
 * "&" da olur); burada yalnız denetim karakterleri, yön değiştiren işaretler
 * ve küfür süzgeci (`offensiveName`, Lite ile aynı).
 */
export function publicCompanyName(name: string): boolean {
  // En az bir görünen harf ya da rakam: yalnız biçim karakterinden (U+200B gibi) ibaret ad tabloda boş görünürdü (Codex #80).
  // Görünmez sayılan karakterler (Hangul dolgu harfleri U+3164, U+1160 gibi: Unicode'da harf ama boş) sayılmıyor.
  if (!/[\p{L}\p{N}]/u.test(name.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, ''))) return false;
  if (/[\p{Cc}‎‏‪-‮⁦-⁩]/u.test(name)) return false;
  return !offensiveName(name);
}

/**
 * IP başına saatlik sayaç. Anahtar IP ile saatin özeti: satır o saati aşıp
 * kimseyi izlemiyor, bir saatten eskisi her yazımda siliniyor. Cloudflare
 * her isteğe `cf-connecting-ip` koyuyor; başlık yoksa (yerel sunucu) sınır yok.
 */
export async function limit(db: Db, request: Request, kind: 'account' | 'run' | 'league', cap: number, now: number): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return;
  const hour = Math.floor(now / HOUR);
  await db.run('DELETE FROM seed_limits WHERE hour < ?', hour);
  const key = `${kind}:${await sha256(`${ip}|${hour}`)}`;
  const row = await db.first<{ count: number }>(
    `INSERT INTO seed_limits (key, hour, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET count = count + 1
     RETURNING count`,
    key,
    hour,
  );
  // Sayaç saat başında sıfırlanıyor: istemci ne zaman yeniden deneyeceğini bilsin (Codex #80).
  if ((row?.count ?? 0) > cap) throw new HttpError(429, 'busy', { retryAfter: Math.ceil((HOUR - (now % HOUR)) / 1000) });
}

/** Anonim hesap: ad yok, Lite'ın oyunu yok. */
export async function registerSeed(request: Request, db: Db, now: number): Promise<Response> {
  // Gövdesiz POST ön uçuşsuz gidiyor: başka bir site oyuncunun tarayıcısından
  // hesap açıp IP'nin saatlik hesap kotasını tüketemesin (Codex #80). Origin
  // göndermeyen istemci (uygulama, denetim) etkilenmiyor.
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigin(origin)) throw new HttpError(403, 'origin');
  await limit(db, request, 'account', SEED.accountsPerHour, now);
  const id = crypto.randomUUID();
  const token = randomToken();
  const hash = await sha256(token);
  await db.batch([
    ['INSERT INTO players (id, name, token_hash, division, created_at) VALUES (?, ?, ?, 0, ?)', id, '', hash, now],
    ['INSERT INTO tokens (token_hash, player_id, platform, created_at) VALUES (?, ?, ?, ?)', hash, id, 'capital', now],
  ]);
  return json({ id, token }, 201);
}

function toEntry(row: SeedRow, week: string, me: string | null): SeedEntry {
  return {
    id: row.id,
    weekId: week,
    companyName: row.company,
    ceoId: row.ceo,
    score: row.score,
    curve: JSON.parse(row.curve) as number[],
    submittedAt: new Date(row.at).toISOString(),
    codeKey: row.code_key,
    codeSize: row.size,
    mine: row.player_id === me,
    verified: true,
    idle: row.idle === 1,
  };
}

const ROW_COLUMNS = 'id, player_id, company, ceo, score, curve, code_key, length(code) AS size, idle, at';

/**
 * Sunucunun simülasyon izi (Tur 71). Canlı denetim bunu deponun iziyle
 * karşılaştırıyor (`scripts/simCheck.ts`). Tur 56–70 boyunca canlı sunucu
 * Tur 55'te kaldı ve denetim fark etmedi: hiçbir uç sürümü söylemiyordu.
 * İz sağlık ucunda değil, çünkü ilk ihtiyaçta ~0,5 sn CPU tutuyor ve oyun
 * her açılışta sağlık ucuna soruyor.
 */
export function simReply(verifier: SeedReplay = SERVER_REPLAY): Response {
  const response = json({ sim: verifier.sim() });
  response.headers.set('cache-control', 'no-store');
  return response;
}

/**
 * Koşu gönder. Kod oyunun kendi çözücüsünden geçiyor (sınırlar, komut
 * türleri, gün aralığı, CEO); hafta açık olmalı, şirket adı herkese
 * gösterilebilir olmalı. Oyuncunun o haftaki satırı yalnız daha iyi skorla
 * değişiyor; satırın kimliği aynı kalıyor (hayalet seçimi kopmasın).
 *
 * Sıra (Tur 52): ucuz denetimler, aralık, "daha iyisi var mı", kopya, en son
 * tekrar. Daha kötü ya da aynı skor tekrar edilmiyor: yazılmayacak.
 */
export async function submitRun(request: Request, db: Db, playerId: string, now: number, verifier: SeedReplay = SERVER_REPLAY): Promise<Response> {
  await limit(db, request, 'run', SEED.runsPerHour, now);
  const body = await readJson(request, MAX_RUN_BODY);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const decoded = decodeRunChecked(code);
  if ('error' in decoded) throw new HttpError(400, 'run', { reason: decoded.error });
  const run = decoded.run;
  // Parmak izsiz eski kod (Tur 17) hangi sürümde oynandığını söylemiyor.
  if (run.version !== 2 || run.sim === undefined) throw new HttpError(400, 'run', { reason: 'version' });
  // Hafta ya da gün: çözücü kimliği tanıdı (Tur 53).
  const open = openBoards(now, leagueBoardKind(run.weekId)!);
  if (!open.includes(run.weekId)) throw new HttpError(409, 'week', { week: open[0] });
  if (!publicCompanyName(run.companyName)) throw new HttpError(400, 'name-blocked');
  // Başka sürümde oynanmış koşuyu sunucu yargılayamıyor (sahte değil): oyun bekletiyor.
  // Aralığa sayılmıyor; sunucu güncellenince ilk denemede geçsin.
  if (run.sim !== verifier.sim()) throw new HttpError(409, 'sim');

  // Aralık tek koşullu yazımla ayrılıyor: aynı anda gelen iki istekten yalnız
  // biri geçiyor; daha kötü gönderim de aralığı dolduruyor (Codex #80).
  const reserved = await db.run(
    `INSERT INTO seed_gaps (player_id, at) VALUES (?, ?)
     ON CONFLICT (player_id) DO UPDATE SET at = excluded.at WHERE excluded.at - seed_gaps.at >= ?`,
    playerId,
    now,
    SEED.minGapMs,
  );
  if (reserved === 0) {
    const gap = await db.first<{ at: number }>('SELECT at FROM seed_gaps WHERE player_id = ?', playerId);
    throw new HttpError(429, 'slow', { retryAfter: Math.max(1, Math.ceil(((gap?.at ?? now) + SEED.minGapMs - now) / 1000)) });
  }
  const existing = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_verified WHERE player_id = ? AND week = ?`, playerId, run.weekId);
  if (existing && existing.score >= run.score) return json({ outcome: 'kept-better', entry: toEntry(existing, run.weekId, playerId) });

  // Başka bir oyuncunun koşusunun aynısı (skor ve eğri; boş koşular hariç):
  // tabloyu kopyalarla doldurup dürüst satırları dışarıda bırakmasın. Burada
  // erken ret (tekrar pahalı); kesin denetim yazımın kendisinde (Codex #81).
  const idle = run.log.length === 0;
  const curve = JSON.stringify(run.curve);
  const copied = async () =>
    !idle &&
    (await db.first<{ id: string }>(
      'SELECT id FROM seed_verified WHERE week = ? AND score = ? AND curve = ? AND idle = 0 AND player_id != ? LIMIT 1',
      run.weekId,
      run.score,
      curve,
      playerId,
    )) !== null;
  if (await copied()) throw new HttpError(409, 'copy');

  // Tekrar: skor ve eğri sunucunun kendi oynatışından.
  let replayed: ReplayResult;
  try {
    replayed = await verifier.replay(run);
  } catch {
    throw new HttpError(422, 'replay', { reason: 'error' });
  }
  if (!replayed.ok) throw new HttpError(422, 'replay', { reason: replayed.score === run.score ? 'curve' : 'score' });

  const key = await sha256(code);
  // Yazım koşullu: aynı anda gelen daha kötü gönderim iyisini ezmesin; hesap bu
  // arada silindiyse satır yazılmasın (`deleteAccount`); tekrar sürerken başka
  // oyuncu aynı koşuyu yazdıysa bu yazılmasın (tek ifade, Codex #81).
  const changed = await db.run(
    `INSERT INTO seed_verified (player_id, week, id, company, ceo, score, curve, code, code_key, idle, at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM players WHERE id = ?)
       AND (? = 1 OR NOT EXISTS (
         SELECT 1 FROM seed_verified WHERE week = ? AND score = ? AND curve = ? AND idle = 0 AND player_id != ?))
     ON CONFLICT (player_id, week) DO UPDATE SET
       company = excluded.company, ceo = excluded.ceo, score = excluded.score, curve = excluded.curve,
       code = excluded.code, code_key = excluded.code_key, idle = excluded.idle, at = excluded.at
     WHERE excluded.score > seed_verified.score`,
    playerId,
    run.weekId,
    crypto.randomUUID(),
    run.companyName,
    run.ceoId,
    replayed.score,
    JSON.stringify(replayed.curve),
    code,
    key,
    idle ? 1 : 0,
    now,
    playerId,
    idle ? 1 : 0,
    run.weekId,
    replayed.score,
    JSON.stringify(replayed.curve),
    playerId,
  );
  if (changed === 0 && (await copied())) throw new HttpError(409, 'copy');
  const row = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_verified WHERE player_id = ? AND week = ?`, playerId, run.weekId);
  if (!row) throw new HttpError(401, 'auth');
  return json({ outcome: changed > 0 && row.code_key === key ? 'saved' : 'kept-better', entry: toEntry(row, run.weekId, playerId) }, changed > 0 ? 201 : 200);
}

/**
 * Bir tablo (hafta ya da gün, `kind` uca göre): en iyi `tableSize` satır, skor
 * sonra gönderim sırası; oyuncunun satırı dışarıdaysa o da.
 */
export async function boardTable(db: Db, kind: LeagueBoardKind, week: string, me: string | null, now: number) {
  if (leagueBoardKind(week) !== kind) throw new HttpError(400, kind);
  const rows = await db.all<SeedRow>(
    `SELECT ${ROW_COLUMNS} FROM seed_verified WHERE week = ? ORDER BY score DESC, at ASC, id ASC LIMIT ?`,
    week,
    SEED.tableSize,
  );
  if (me && !rows.some((row) => row.player_id === me)) {
    const mine = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_verified WHERE week = ? AND player_id = ?`, week, me);
    if (mine) rows.push(mine);
  }
  const total = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_verified WHERE week = ?', week))?.n ?? 0;
  return { week, open: openBoards(now, kind).includes(week), total, entries: rows.map((row) => toEntry(row, week, me)) };
}

/**
 * Davetli ligin tablosu (Tur 55, `seedLeagues.ts`): yalnız üyelerin
 * doğrulanmış koşuları, genel tablonun sırasıyla. Üye sayısı sınırlı
 * (`SEED_LEAGUE.members`), hepsi sığıyor.
 */
export async function memberTable(db: Db, kind: LeagueBoardKind, week: string, code: string, me: string, now: number) {
  if (leagueBoardKind(week) !== kind) throw new HttpError(400, kind);
  const rows = await db.all<SeedRow>(
    `SELECT ${ROW_COLUMNS} FROM seed_verified
      WHERE week = ? AND player_id IN (SELECT player_id FROM seed_league_members WHERE code = ?)
      ORDER BY score DESC, at ASC, id ASC`,
    week,
    code,
  );
  return { week, open: openBoards(now, kind).includes(week), total: rows.length, entries: rows.map((row) => toEntry(row, week, me)) };
}

/**
 * Bir satırın koşu kodu. Özetle adresleniyor, içerik değişmiyor: tarayıcı
 * bir gün saklayabiliyor. Daha uzun değil: silinen hesabın kodu başkasının
 * tarayıcısında aylarca kalmasın (her tarayıcı bir kodu zaten bir kez
 * doğruluyor, sonucu kendi önbelleğinde).
 */
export async function runCode(db: Db, key: string): Promise<Response> {
  if (!CODE_KEY.test(key)) throw new HttpError(400, 'code');
  const row = await db.first<{ code: string }>('SELECT code FROM seed_verified WHERE code_key = ? LIMIT 1', key);
  if (!row) throw new HttpError(404, 'code');
  const response = json({ code: row.code });
  response.headers.set('cache-control', 'public, max-age=86400');
  return response;
}

/** Haftalık temizlik (`purgeOrphans` ile aynı işlemde): eski haftaların ve günlerin koşuları, eski sayaçlar. */
export function seedPurge(now: number): Array<[string, number]> {
  return [
    ['DELETE FROM seed_verified WHERE at < ?', now - SEED.keepWeeks * 7 * 86_400_000],
    // Gün kimliği 10 karakter ("2026-10-22"), hafta 8 ("2026-W43").
    ['DELETE FROM seed_verified WHERE length(week) = 10 AND at < ?', now - SEED.keepDays * 86_400_000],
    ['DELETE FROM seed_limits WHERE hour < ?', Math.floor(now / HOUR) - 1],
    // Aralık 30 sn; bir günden eski deneme saati bir şey ayırmıyor.
    ['DELETE FROM seed_gaps WHERE at < ?', now - 86_400_000],
  ];
}
