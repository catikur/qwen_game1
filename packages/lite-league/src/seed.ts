/**
 * Tohum Ligi (Tur 51): ana oyunun haftalık koşuları da bu sunucuda.
 *
 * GitHub Pages'teki oyun tabloyu buradan okuyor ve koşusunu buraya
 * gönderiyor. Hesap anonim: kimlik ve anahtar oyuncunun tarayıcısında, ad
 * yok (tabloda şirket adı görünüyor). Hesaplar Lite'ınkilerle aynı tabloda
 * ama ayrı türde (`tokens.platform = 'capital'`); biri ötekinin uçlarını
 * kullanamıyor (`app.ts`).
 *
 * GÜVEN. Sunucu bu turda koşuyu yeniden OYNATMIYOR (Tur 52'nin işi). Kodu
 * oyunun kendi çözücüsüyle açıp yapısını denetliyor (`decodeRunChecked`),
 * haftayı ve şirket adını denetliyor, gönderim zamanını kendi saatiyle
 * yazıyor. Sıralamayı hâlâ her tarayıcı kendi tekrarıyla kuruyor (Tur 31).
 * Kazanılan: tablo herkese açık ve tek; "aynı koşuyu kim önce gönderdi"
 * artık satırın beyanı değil sunucunun saati.
 *
 * Uç noktalar (JSON):
 * - `POST /v1/seed/players`        → anonim hesap: {id, token}
 * - `POST /v1/seed/runs {code}`    → koşu gönder; oyuncunun o haftaki en iyisi kalıyor
 * - `GET  /v1/seed/weeks/:week`    → haftanın tablosu, herkese açık (kimlikle gelince `mine`)
 * - `GET  /v1/seed/codes/:key`     → bir satırın koşu kodu (tabloda yalnız özeti var)
 * - `DELETE /v1/players/me`        → hesabı ve koşularını sil (Lite ile aynı uç)
 */
import { RUN_LIMITS, decodeRunChecked } from '../../core/src/league';
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
  /** IP başına saatlik sınırlar (IP'nin kendisi değil, saatle birlikte özeti). */
  accountsPerHour: 10,
  runsPerHour: 30,
} as const;

/** Gönderim gövdesi sınırı (bayt): oyunun kendi kod sınırı ve zarf. */
export const MAX_RUN_BODY = RUN_LIMITS.codeLength + 1_024;

const HOUR = 3_600_000;
const WEEK_ID = /^\d{4}-W\d{2}$/;
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
}

/** Gönderim kabul eden haftalar: bu hafta, ilk saatlerinde geçen hafta da. */
export function openWeeks(now: number): string[] {
  const current = weekId(now);
  const previous = weekId(now - SEED.graceMs);
  return previous === current ? [current] : [current, previous];
}

/**
 * Tabloda herkese görünen şirket adı. Oyun adı serbest bırakıyor (noktalama,
 * "&" da olur); burada yalnız denetim karakterleri, yön değiştiren işaretler
 * ve küfür süzgeci (`offensiveName`, Lite ile aynı).
 */
export function publicCompanyName(name: string): boolean {
  // En az bir görünen harf ya da rakam: yalnız biçim karakterinden (U+200B gibi) ibaret ad tabloda boş görünürdü (Codex #80).
  if (!/[\p{L}\p{N}]/u.test(name.normalize('NFKC'))) return false;
  if (/[\p{Cc}‎‏‪-‮⁦-⁩]/u.test(name)) return false;
  return !offensiveName(name);
}

/**
 * IP başına saatlik sayaç. Anahtar IP ile saatin özeti: satır o saati aşıp
 * kimseyi izlemiyor, bir saatten eskisi her yazımda siliniyor. Cloudflare
 * her isteğe `cf-connecting-ip` koyuyor; başlık yoksa (yerel sunucu) sınır yok.
 */
async function limit(db: Db, request: Request, kind: 'account' | 'run', cap: number, now: number): Promise<void> {
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
  };
}

const ROW_COLUMNS = 'id, player_id, company, ceo, score, curve, code_key, length(code) AS size, at';

/**
 * Koşu gönder. Kod oyunun kendi çözücüsünden geçiyor (sınırlar, komut
 * türleri, gün aralığı, CEO); hafta açık olmalı, şirket adı herkese
 * gösterilebilir olmalı. Oyuncunun o haftaki satırı yalnız daha iyi skorla
 * değişiyor; satırın kimliği aynı kalıyor (hayalet seçimi kopmasın).
 */
export async function submitRun(request: Request, db: Db, playerId: string, now: number): Promise<Response> {
  await limit(db, request, 'run', SEED.runsPerHour, now);
  const body = await readJson(request, MAX_RUN_BODY);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const decoded = decodeRunChecked(code);
  if ('error' in decoded) throw new HttpError(400, 'run', { reason: decoded.error });
  const run = decoded.run;
  // Parmak izsiz eski kod (Tur 17) hangi sürümde oynandığını söylemiyor.
  if (run.version !== 2 || run.sim === undefined) throw new HttpError(400, 'run', { reason: 'version' });
  const open = openWeeks(now);
  if (!open.includes(run.weekId)) throw new HttpError(409, 'week', { week: open[0] });
  if (!publicCompanyName(run.companyName)) throw new HttpError(400, 'name-blocked');

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
  const existing = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_runs WHERE player_id = ? AND week = ?`, playerId, run.weekId);
  if (existing && existing.score >= run.score) return json({ outcome: 'kept-better', entry: toEntry(existing, run.weekId, playerId) });

  const key = await sha256(code);
  // Yazım koşullu: aynı anda gelen daha kötü gönderim iyisini ezmesin; hesap bu
  // arada silindiyse satır yazılmasın (`deleteAccount`).
  const changed = await db.run(
    `INSERT INTO seed_runs (player_id, week, id, company, ceo, score, curve, code, code_key, at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM players WHERE id = ?)
     ON CONFLICT (player_id, week) DO UPDATE SET
       company = excluded.company, ceo = excluded.ceo, score = excluded.score, curve = excluded.curve,
       code = excluded.code, code_key = excluded.code_key, at = excluded.at
     WHERE excluded.score > seed_runs.score`,
    playerId,
    run.weekId,
    crypto.randomUUID(),
    run.companyName,
    run.ceoId,
    run.score,
    JSON.stringify(run.curve),
    code,
    key,
    now,
    playerId,
  );
  const row = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_runs WHERE player_id = ? AND week = ?`, playerId, run.weekId);
  if (!row) throw new HttpError(401, 'auth');
  return json({ outcome: changed > 0 && row.code_key === key ? 'saved' : 'kept-better', entry: toEntry(row, run.weekId, playerId) }, changed > 0 ? 201 : 200);
}

/** Haftanın tablosu: en iyi `tableSize` satır, skor sonra gönderim sırası; oyuncunun satırı dışarıdaysa o da. */
export async function weekTable(db: Db, week: string, me: string | null, now: number) {
  if (!WEEK_ID.test(week)) throw new HttpError(400, 'week');
  const rows = await db.all<SeedRow>(
    `SELECT ${ROW_COLUMNS} FROM seed_runs WHERE week = ? ORDER BY score DESC, at ASC, id ASC LIMIT ?`,
    week,
    SEED.tableSize,
  );
  if (me && !rows.some((row) => row.player_id === me)) {
    const mine = await db.first<SeedRow>(`SELECT ${ROW_COLUMNS} FROM seed_runs WHERE week = ? AND player_id = ?`, week, me);
    if (mine) rows.push(mine);
  }
  const total = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_runs WHERE week = ?', week))?.n ?? 0;
  return { week, open: openWeeks(now).includes(week), total, entries: rows.map((row) => toEntry(row, week, me)) };
}

/**
 * Bir satırın koşu kodu. Özetle adresleniyor, içerik değişmiyor: tarayıcı
 * bir gün saklayabiliyor. Daha uzun değil: silinen hesabın kodu başkasının
 * tarayıcısında aylarca kalmasın (her tarayıcı bir kodu zaten bir kez
 * doğruluyor, sonucu kendi önbelleğinde).
 */
export async function runCode(db: Db, key: string): Promise<Response> {
  if (!CODE_KEY.test(key)) throw new HttpError(400, 'code');
  const row = await db.first<{ code: string }>('SELECT code FROM seed_runs WHERE code_key = ? LIMIT 1', key);
  if (!row) throw new HttpError(404, 'code');
  const response = json({ code: row.code });
  response.headers.set('cache-control', 'public, max-age=86400');
  return response;
}

/** Haftalık temizlik (`purgeOrphans` ile aynı işlemde): eski haftaların koşuları, eski sayaçlar. */
export function seedPurge(now: number): Array<[string, number]> {
  return [
    ['DELETE FROM seed_runs WHERE at < ?', now - SEED.keepWeeks * 7 * 86_400_000],
    ['DELETE FROM seed_limits WHERE hour < ?', Math.floor(now / HOUR) - 1],
    // Aralık 30 sn; bir günden eski deneme saati bir şey ayırmıyor.
    ['DELETE FROM seed_gaps WHERE at < ?', now - 86_400_000],
  ];
}
