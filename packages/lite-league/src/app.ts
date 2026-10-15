/**
 * CapitalForge Lite lig sunucusu: istek işleyici.
 *
 * Saf bir fonksiyon: istek, veritabanı ve "şimdi" girip yanıt çıkıyor.
 * Cloudflare Worker (`worker.ts`) ve testler aynı işleyiciyi çağırıyor.
 *
 * Uç noktalar (JSON):
 * - `GET  /v1/health`                → hafta
 * - `POST /v1/players {name}`        → anonim hesap: {id, token}
 * - `PATCH /v1/players/me {name}`    → ad değiştir
 * - `DELETE /v1/players/me`        → hesabı ve tüm izlerini sil
 * - `POST /v1/reports <LeagueReport>`→ haftalık puan; akla yatkınlık denetimi
 * - `GET  /v1/league`                → bu haftaki 30 kişilik grup
 * - `GET  /v1/leagues`               → özel liglerim ve sıralamaları
 * - `POST /v1/leagues {name}`        → davet kodlu lig kur
 * - `POST /v1/leagues/join {code}`   → koda katıl
 * - `DELETE /v1/leagues/:code`       → ligden ayrıl
 *
 * Kimlik: `Authorization: Bearer <id>.<token>`. Token yalnızca özetiyle saklanıyor.
 */
import {
  CHAIN_IDS,
  DIVISION_KEYS,
  LEAGUE,
  checkReport,
  divisionMoves,
  weekId,
  weekStart,
  type LeagueReport,
} from '../../lite-model/src/index';
import type { Db, Statement } from './db';

const WEEK_MS = 7 * 86_400_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_BODY = 8_192;

interface Player {
  id: string;
  name: string;
  token_hash: string;
  division: number;
  created_at: number;
}

interface ReportRow {
  week: string;
  score: number;
  city: number;
  stars: number;
  city_earned: number;
  levels: string;
  at: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'body');
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // aşağıda
  }
  throw new HttpError(400, 'body');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

function inviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Ad: harf, rakam, boşluk, alt çizgi, tire; baştaki/sondaki boşluk kırpılıyor. */
export function cleanName(raw: unknown, max: number = LEAGUE.nameMax): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < LEAGUE.nameMin || name.length > max) return null;
  return /^[\p{L}\p{N} _-]+$/u.test(name) ? name : null;
}

async function authenticate(request: Request, db: Db): Promise<Player | null> {
  const match = /^Bearer ([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const player = await db.first<Player>('SELECT * FROM players WHERE id = ?', match[1]!);
  if (!player) return null;
  return player.token_hash === (await sha256(match[2]!)) ? player : null;
}

function toReport(row: ReportRow): LeagueReport {
  return { week: row.week, score: row.score, city: row.city, stars: row.stars, cityEarned: row.city_earned, levels: JSON.parse(row.levels) as number[][] };
}

export async function handle(request: Request, db: Db, now: number): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = `${request.method} ${path}`;
  try {
    if (route === 'GET /v1/health') return json({ ok: true, week: weekId(now) });
    if (route === 'POST /v1/players') return await register(request, db, now);
    const player = await authenticate(request, db);
    if (!player) throw new HttpError(401, 'auth');
    // Geçen haftanın bölüm değişimi henüz yapılmadıysa şimdi (cron kaçarsa da doğru kalsın).
    await rollover(db, now);
    const me = (await db.first<Player>('SELECT * FROM players WHERE id = ?', player.id))!;
    switch (route) {
      case 'PATCH /v1/players/me':
        return await rename(request, db, me);
      case 'DELETE /v1/players/me':
        return await deleteAccount(db, me);
      case 'POST /v1/reports':
        return await submit(request, db, me, now);
      case 'GET /v1/league':
        return json(await standings(db, me, now));
      case 'GET /v1/leagues':
        return json(await myLeagues(db, me, now));
      case 'POST /v1/leagues':
        return await createLeague(request, db, me, now);
      case 'POST /v1/leagues/join':
        return await joinLeague(request, db, me, now);
    }
    const leave = /^DELETE \/v1\/leagues\/([A-Z0-9]{6})$/.exec(route);
    if (leave) return await leaveLeague(db, me, leave[1]!);
    throw new HttpError(404, 'route');
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code, ...error.extra }, error.status);
    throw error;
  }
}

// ------------------------------------------------------------ hesap

async function register(request: Request, db: Db, now: number): Promise<Response> {
  const body = await readJson(request);
  const name = cleanName(body.name);
  if (!name) throw new HttpError(400, 'name');
  const id = crypto.randomUUID();
  const token = randomToken();
  await db.run('INSERT INTO players (id, name, token_hash, division, created_at) VALUES (?, ?, ?, 0, ?)', id, name, await sha256(token), now);
  return json({ id, token, name, division: 0 }, 201);
}

async function rename(request: Request, db: Db, me: Player): Promise<Response> {
  const name = cleanName((await readJson(request)).name);
  if (!name) throw new HttpError(400, 'name');
  await db.run('UPDATE players SET name = ? WHERE id = ?', name, me.id);
  return json({ name, division: me.division });
}

// ------------------------------------------------------------ haftalık lig

async function submit(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  const body = (await readJson(request)) as unknown as LeagueReport;
  const week = weekId(now);
  if (body.week !== week) throw new HttpError(409, 'week', { week });
  const last = await db.first<ReportRow>('SELECT * FROM reports WHERE player_id = ? ORDER BY at DESC LIMIT 1', me.id);
  if (last && now - last.at < LEAGUE.minReportGap * 1000) throw new HttpError(429, 'slow');
  const prev = last ? toReport(last) : null;
  // Süre sunucunun saatiyle: aynı haftada önceki gönderimden, yoksa haftanın başından.
  const since = prev && prev.week === week ? last!.at : weekStart(week);
  const verdict = checkReport(prev, body, (now - since) / 1000);
  if (!verdict.ok) {
    await db.run('INSERT INTO rejects (player_id, week, reason, at) VALUES (?, ?, ?, ?)', me.id, week, verdict.reason, now);
    throw new HttpError(422, 'rejected', { reason: verdict.reason });
  }
  await db.run(
    `INSERT INTO reports (player_id, week, score, city, stars, city_earned, levels, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id, week) DO UPDATE SET score = excluded.score, city = excluded.city, stars = excluded.stars,
       city_earned = excluded.city_earned, levels = excluded.levels, at = excluded.at`,
    me.id,
    week,
    body.score,
    body.city,
    body.stars,
    body.cityEarned,
    JSON.stringify(body.levels.slice(0, CHAIN_IDS.length)),
    now,
  );
  await joinGroup(db, me, week);
  return json(await standings(db, me, now));
}

/** Bu haftanın grubuna yerleş: bölümündeki ilk dolmamış grup, yoksa yenisi. */
async function joinGroup(db: Db, me: Player, week: string): Promise<void> {
  if (await db.first('SELECT 1 AS x FROM groups WHERE week = ? AND player_id = ?', week, me.id)) return;
  const open = await db.first<{ group_no: number }>(
    'SELECT group_no FROM groups WHERE week = ? AND division = ? GROUP BY group_no HAVING COUNT(*) < ? ORDER BY group_no LIMIT 1',
    week,
    me.division,
    LEAGUE.groupSize,
  );
  let groupNo = open?.group_no;
  if (groupNo === undefined) {
    const last = await db.first<{ n: number | null }>('SELECT MAX(group_no) AS n FROM groups WHERE week = ? AND division = ?', week, me.division);
    groupNo = (last?.n ?? -1) + 1;
  }
  await db.run('INSERT OR IGNORE INTO groups (week, player_id, division, group_no) VALUES (?, ?, ?, ?)', week, me.id, me.division, groupNo);
}

interface Row {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

async function groupRows(db: Db, week: string, division: number, groupNo: number): Promise<Array<{ id: string; name: string; score: number }>> {
  return db.all(
    `SELECT p.id AS id, p.name AS name, COALESCE(r.score, 0) AS score
       FROM groups g JOIN players p ON p.id = g.player_id
       LEFT JOIN reports r ON r.player_id = g.player_id AND r.week = g.week
      WHERE g.week = ? AND g.division = ? AND g.group_no = ?
      ORDER BY score DESC, p.created_at ASC`,
    week,
    division,
    groupNo,
  );
}

export async function standings(db: Db, me: Player, now: number) {
  const week = weekId(now);
  const endsAt = weekStart(week) + WEEK_MS;
  const mine = await db.first<{ division: number; group_no: number }>('SELECT division, group_no FROM groups WHERE week = ? AND player_id = ?', week, me.id);
  const division = mine?.division ?? me.division;
  const base = { week, endsAt, division, divisionKey: DIVISION_KEYS[division], promote: LEAGUE.promote, demote: LEAGUE.demote, name: me.name };
  if (!mine) return { ...base, group: [] as Array<Row & { move: number }> };
  const rows = await groupRows(db, week, mine.division, mine.group_no);
  const moves = divisionMoves(
    rows.map((row) => row.score),
    mine.division,
  );
  return {
    ...base,
    group: rows.map((row, index) => ({ rank: index + 1, name: row.name, score: row.score, me: row.id === me.id, move: moves[index] ?? 0 })),
  };
}

/** Geçen haftanın bölüm değişimi; hafta başına bir kez (tablo satırıyla kilitli). */
export async function rollover(db: Db, now: number): Promise<boolean> {
  const previous = weekId(weekStart(weekId(now)) - 1);
  if (await db.first('SELECT 1 AS x FROM rollovers WHERE week = ?', previous)) return false;
  // Geçen haftanın grupları artık değişmiyor (gönderim yalnızca bu haftaya): önce oku, sonra
  // işareti ve bütün bölüm değişikliklerini tek işlemde yaz. Yarıda kalırsa hiçbiri yazılmıyor
  // ve sonraki istek baştan deniyor; aynı anda iki istek gelirse işareti ikinci kez yazamayan
  // (birincil anahtar) bütün işlemiyle geri alınıyor.
  const writes: Statement[] = [['INSERT INTO rollovers (week, at) VALUES (?, ?)', previous, now]];
  const groups = await db.all<{ division: number; group_no: number }>(
    'SELECT DISTINCT division, group_no FROM groups WHERE week = ? ORDER BY division, group_no',
    previous,
  );
  for (const group of groups) {
    const rows = await groupRows(db, previous, group.division, group.group_no);
    const moves = divisionMoves(
      rows.map((row) => row.score),
      group.division,
    );
    for (const [index, row] of rows.entries()) {
      const move = moves[index] ?? 0;
      if (move === 0) continue;
      const next = Math.max(0, Math.min(LEAGUE.divisions - 1, group.division + move));
      writes.push(['UPDATE players SET division = ? WHERE id = ?', next, row.id]);
    }
  }
  try {
    await db.batch(writes);
  } catch (error) {
    if (await db.first('SELECT 1 AS x FROM rollovers WHERE week = ?', previous)) return false;
    throw error;
  }
  return true;
}

// ------------------------------------------------------------ özel ligler

async function leagueCount(db: Db, me: Player): Promise<number> {
  return (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE player_id = ?', me.id))?.n ?? 0;
}

async function createLeague(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  const name = cleanName((await readJson(request)).name, 24);
  if (!name) throw new HttpError(400, 'name');
  if ((await leagueCount(db, me)) >= LEAGUE.privatePerPlayer) throw new HttpError(409, 'limit');
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = inviteCode();
    if ((await db.run('INSERT OR IGNORE INTO leagues (code, name, owner, created_at) VALUES (?, ?, ?, ?)', code, name, me.id, now)) === 0) continue;
    await db.run('INSERT INTO league_members (code, player_id, joined_at) VALUES (?, ?, ?)', code, me.id, now);
    return json({ code, name }, 201);
  }
  throw new HttpError(503, 'code');
}

async function joinLeague(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  const raw = (await readJson(request)).code;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  const league = await db.first<{ code: string; name: string }>('SELECT code, name FROM leagues WHERE code = ?', code);
  if (!league) throw new HttpError(404, 'code');
  if (await db.first('SELECT 1 AS x FROM league_members WHERE code = ? AND player_id = ?', code, me.id)) return json(league);
  const members = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE code = ?', code))?.n ?? 0;
  if (members >= LEAGUE.privateMembers) throw new HttpError(409, 'full');
  if ((await leagueCount(db, me)) >= LEAGUE.privatePerPlayer) throw new HttpError(409, 'limit');
  await db.run('INSERT OR IGNORE INTO league_members (code, player_id, joined_at) VALUES (?, ?, ?)', code, me.id, now);
  return json(league);
}

/** Hesabı sil (App Store 5.1.1(v)): oyuncunun her izi gidiyor; boşalan özel ligler de. */
async function deleteAccount(db: Db, me: Player): Promise<Response> {
  const codes = await db.all<{ code: string }>('SELECT code FROM league_members WHERE player_id = ?', me.id);
  for (const { code } of codes) await leaveLeague(db, me, code);
  for (const table of ['groups', 'reports', 'rejects']) await db.run(`DELETE FROM ${table} WHERE player_id = ?`, me.id);
  await db.run('DELETE FROM players WHERE id = ?', me.id);
  return json({ ok: true });
}

async function leaveLeague(db: Db, me: Player, code: string): Promise<Response> {
  await db.run('DELETE FROM league_members WHERE code = ? AND player_id = ?', code, me.id);
  const left = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE code = ?', code))?.n ?? 0;
  if (left === 0) await db.run('DELETE FROM leagues WHERE code = ?', code);
  return json({ ok: true });
}

async function myLeagues(db: Db, me: Player, now: number) {
  const week = weekId(now);
  const leagues = await db.all<{ code: string; name: string }>(
    'SELECT l.code AS code, l.name AS name FROM league_members m JOIN leagues l ON l.code = m.code WHERE m.player_id = ? ORDER BY m.joined_at',
    me.id,
  );
  const result: Array<{ code: string; name: string; members: Row[] }> = [];
  for (const league of leagues) {
    const rows = await db.all<{ id: string; name: string; score: number }>(
      `SELECT p.id AS id, p.name AS name, COALESCE(r.score, 0) AS score
         FROM league_members m JOIN players p ON p.id = m.player_id
         LEFT JOIN reports r ON r.player_id = m.player_id AND r.week = ?
        WHERE m.code = ?
        ORDER BY score DESC, m.joined_at ASC`,
      week,
      league.code,
    );
    result.push({ ...league, members: rows.map((row, index) => ({ rank: index + 1, name: row.name, score: row.score, me: row.id === me.id })) });
  }
  return { week, leagues: result };
}
