/**
 * CapitalForge Lite lig sunucusu: istek işleyici.
 *
 * Saf bir fonksiyon: istek, veritabanı ve "şimdi" girip yanıt çıkıyor.
 * Cloudflare Worker (`worker.ts`) ve testler aynı işleyiciyi çağırıyor.
 *
 * Uç noktalar (JSON):
 * - `GET  /v1/health`                → hafta
 * - `POST /v1/players {name, platform?, turnstile?}` → anonim hesap: {id, token}.
 *   Web ve Android'de ad isteğe bağlı (lige katılınca veriliyor) ve hesabın
 *   oyunu sunucuda (`/v1/sync`).
 * - `PATCH /v1/players/me {name}`    → ad değiştir
 * - `DELETE /v1/players/me`        → hesabı ve tüm izlerini sil
 * - `POST /v1/attest/challenge`      → App Attest için tek seferlik challenge
 * - `POST /v1/attest {keyId, attestation, challenge}` → cihaz anahtarını kanıtla
 * - `POST /v1/reports <LeagueReport>`→ haftalık puan; App Attest onayı
 *   (`X-Attest-Key`, `X-Attest-Assertion`) ve akla yatkınlık denetimi
 * - `GET  /v1/league`                → bu haftaki 30 kişilik grup
 * - `GET  /v1/leagues`               → özel liglerim ve sıralamaları
 * - `POST /v1/leagues {name}`        → davet kodlu lig kur
 * - `POST /v1/leagues/join {code}`   → koda katıl
 * - `DELETE /v1/leagues/:code`       → ligden ayrıl
 * - `GET  /v1/save`                  → sunucudaki oyun ve bu haftanın puanı
 * - `POST /v1/save {base, state}`    → iOS: cihazdaki oyunu yükle (App Attest onaylı)
 * - `POST /v1/sync {base, batch, ops, rest}` → günlüğü oynat (`saves.ts`)
 * - `POST /v1/link`                  → başka cihaza taşıma kodu (10 dakika)
 * - `POST /v1/link/claim {code, platform}` → kodla hesabı bu cihaza al
 * - `GET  /v1/stars`                 → bütün platformların yıldız tablosu
 *
 * Kimlik: `Authorization: Bearer <id>.<token>`. Token yalnızca özetiyle
 * saklanıyor; bir hesabın birden çok cihazı olabiliyor (`tokens`).
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
import { APPLE_ATTEST, AttestError, fromBase64, toBase64, verifyAssertion, verifyAttestation, type AttestConfig } from './attest';
import type { Db } from './db';
import { HttpError, base64, json, preflight, randomToken, readBody, readJson, sha256, shortCode, withCors } from './http';
import { MAX_SYNC_BODY, PLATFORMS, createSave, loadSave, saveWithScore, sync, touchProfile, uploadSave, type Platform } from './saves';

export interface Options {
  /** App Attest: uygulama kimliği ve güvenilen kök (testler kendi kökünü veriyor). */
  attest: AttestConfig;
  /**
   * Cloudflare Turnstile (bot karşı): web ve Android hesabı açarken. Yoksa
   * (sır tanımlı değil) denetim yok.
   */
  turnstile?: (token: string, ip: string | null) => Promise<boolean>;
}

const DEFAULTS: Options = { attest: APPLE_ATTEST };
/**
 * Challenge geçerliliği (ms). Apple'a ulaşılamazsa uygulama kanıtı aynı
 * challenge ile sonraki turda (5 dakika sonra) yeniden deniyor; ona yetsin.
 */
const CHALLENGE_TTL = 30 * 60_000;

const WEEK_MS = 7 * 86_400_000;
/** Cihaz taşıma kodunun geçerliliği (ms). */
const LINK_TTL = 10 * 60_000;

interface Player {
  id: string;
  /** Boş: web ve Android'de lige henüz katılmamış (tablolarda görünmüyor). */
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

/** Ad: harf, rakam, boşluk, alt çizgi, tire; baştaki/sondaki boşluk kırpılıyor. */
export function cleanName(raw: unknown, max: number = LEAGUE.nameMax): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < LEAGUE.nameMin || name.length > max) return null;
  return /^[\p{L}\p{N} _-]+$/u.test(name) ? name : null;
}

/**
 * Herkesin gördüğü adlarda küfür ve hakaret yok (App Store 1.2). Kısa ve
 * belirsiz kökler yalnızca tek başına sözcükken ("sik" değil ama "Sikke"
 * geçiyor), uzun ve tek anlamlılar ad içinde de yakalanıyor. Rakamla yazılmış
 * harfler (0→o, 1→i, 3→e, 4→a, 5→s, 7→t) ve araya konan boşluk, _ ve -
 * çözülüyor.
 */
const BLOCKED_WORDS = new Set([
  'am', 'amk', 'aq', 'göt', 'got', 'piç', 'pic', 'sik', 'sikik', 'ibne', 'kahpe', 'şerefsiz', 'serefsiz', 'yavşak', 'yavsak',
  'oç', 'oc', 'gerizekalı', 'salak', 'fuck', 'shit', 'dick', 'cock', 'slut', 'sex', 'seks', 'porn', 'porno', 'rape', 'nazi',
]);
const BLOCKED_ROOTS = [
  'orospu', 'yarrak', 'yarak', 'amcık', 'amcik', 'sikiş', 'sikis', 'siktir', 'sikerim', 'pezevenk', 'gavat', 'ananı', 'anani',
  'fuck', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'asshole', 'pussy', 'hitler', 'porn',
];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export function offensiveName(name: string): boolean {
  const lower = name.toLocaleLowerCase('tr').replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);
  const words = lower.split(/[\s_-]+/).filter(Boolean);
  // Kısa sözcükler tek başınayken; araya işaret konmuşsa ("S-İ-K", "si k")
  // yan yana sözcüklerin birleşimi de. Alt dizgi değil: "Sikke" geçiyor.
  for (let start = 0; start < words.length; start++) {
    let joined = '';
    for (let end = start; end < Math.min(words.length, start + 6); end++) {
      joined += words[end];
      if (BLOCKED_WORDS.has(joined)) return true;
    }
  }
  const compact = words.join('');
  return BLOCKED_ROOTS.some((root) => compact.includes(root));
}

/** Ad kuralları ve küfür süzgeci: 400 `name` ya da 400 `name-blocked`. */
function acceptName(raw: unknown, max?: number): string {
  const name = cleanName(raw, max);
  if (!name) throw new HttpError(400, 'name');
  if (offensiveName(name)) throw new HttpError(400, 'name-blocked');
  return name;
}

interface Session {
  player: Player;
  /** Bu cihazın platformu (ilk cihaz iOS uygulaması: `players.token_hash`). */
  platform: Platform;
}

async function authenticate(request: Request, db: Db): Promise<Session | null> {
  const match = /^Bearer ([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const player = await db.first<Player>('SELECT * FROM players WHERE id = ?', match[1]!);
  if (!player) return null;
  const hash = await sha256(match[2]!);
  if (player.token_hash === hash) {
    const first = await db.first<{ platform: Platform }>('SELECT platform FROM tokens WHERE token_hash = ?', hash);
    return { player, platform: first?.platform ?? 'ios' };
  }
  const device = await db.first<{ platform: Platform }>('SELECT platform FROM tokens WHERE token_hash = ? AND player_id = ?', hash, player.id);
  return device ? { player, platform: device.platform } : null;
}

function toReport(row: ReportRow): LeagueReport {
  return { week: row.week, score: row.score, city: row.city, stars: row.stars, cityEarned: row.city_earned, levels: JSON.parse(row.levels) as number[][] };
}

export async function handle(request: Request, db: Db, now: number, options: Options = DEFAULTS): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return preflight(origin);
  return withCors(await route(request, db, now, options), origin);
}

async function route(request: Request, db: Db, now: number, options: Options): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = `${request.method} ${path}`;
  try {
    if (route === 'GET /v1/health') return json({ ok: true, week: weekId(now) });
    if (route === 'POST /v1/players') return await register(request, db, now, options);
    if (route === 'POST /v1/link/claim') return await claimLink(request, db, now);
    const session = await authenticate(request, db);
    if (!session) throw new HttpError(401, 'auth');
    // Geçen haftanın bölüm değişimi henüz yapılmadıysa şimdi (cron kaçarsa da doğru kalsın).
    await rollover(db, now);
    const me = (await db.first<Player>('SELECT * FROM players WHERE id = ?', session.player.id))!;
    switch (route) {
      case 'PATCH /v1/players/me':
        return await rename(request, db, me, now);
      case 'DELETE /v1/players/me':
        return await deleteAccount(db, me);
      case 'POST /v1/attest/challenge':
        return await attestChallenge(db, me, now);
      case 'POST /v1/attest':
        return await attestKey(request, db, me, now, options.attest);
      case 'POST /v1/reports':
        return await submit(request, db, me, now, options.attest);
      case 'GET /v1/league':
        return json(await standings(db, me, now));
      case 'GET /v1/leagues':
        return json(await myLeagues(db, me, now));
      case 'POST /v1/leagues':
        return await createLeague(request, db, me, now);
      case 'POST /v1/leagues/join':
        return await joinLeague(request, db, me, now);
      case 'GET /v1/save': {
        const save = await saveWithScore(db, me.id, now);
        if (!save) throw new HttpError(404, 'save');
        return json(save);
      }
      case 'POST /v1/save':
        return await uploadDeviceSave(request, db, me, session.platform, now, options.attest);
      case 'POST /v1/sync':
        return await syncSave(request, db, me, session.platform, now);
      case 'POST /v1/link':
        return await createLink(db, me, now);
      case 'GET /v1/stars':
        return json(await starsBoard(db, me));
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

function platformOf(raw: unknown): Platform {
  if (raw === undefined) return 'ios';
  if (typeof raw === 'string' && (PLATFORMS as readonly string[]).includes(raw)) return raw as Platform;
  throw new HttpError(400, 'platform');
}

/**
 * Hesap aç. iOS (eski uygulama da): ad zorunlu, oyun cihazda. Web ve
 * Android: ad isteğe bağlı, oyun sunucuda sıfırdan başlıyor; Turnstile açıksa
 * bot denetimi.
 */
async function register(request: Request, db: Db, now: number, options: Options): Promise<Response> {
  const body = await readJson(request);
  const platform = platformOf(body.platform);
  const name = platform === 'ios' || (body.name !== undefined && body.name !== '') ? acceptName(body.name) : '';
  if (platform !== 'ios' && options.turnstile) {
    const token = typeof body.turnstile === 'string' ? body.turnstile : '';
    if (!token || !(await options.turnstile(token, request.headers.get('cf-connecting-ip')))) throw new HttpError(403, 'turnstile');
  }
  const id = crypto.randomUUID();
  const token = randomToken();
  const hash = await sha256(token);
  await db.batch([
    ['INSERT INTO players (id, name, token_hash, division, created_at) VALUES (?, ?, ?, 0, ?)', id, name, hash, now],
    ['INSERT INTO tokens (token_hash, player_id, platform, created_at) VALUES (?, ?, ?, ?)', hash, id, platform, now],
  ]);
  await touchProfile(db, id, platform, 0, 0, now);
  const save = platform === 'ios' ? null : await createSave(db, id, now);
  return json({ id, token, name, division: 0, ...(save ? { save } : {}) }, 201);
}

async function rename(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  const name = acceptName((await readJson(request)).name);
  await db.run('UPDATE players SET name = ? WHERE id = ?', name, me.id);
  // Web ve Android: ad verince (lige katılınca) hemen bu haftanın grubunda; puanı zaten sunucuda.
  if (me.name === '' && (await loadSave(db, me.id))) await joinGroup(db, { ...me, name }, weekId(now));
  return json({ name, division: me.division });
}

// ------------------------------------------------------------ sunucu yetkili kayıt (L10)

async function syncSave(request: Request, db: Db, me: Player, platform: Platform, now: number): Promise<Response> {
  const body = await readJson(request, MAX_SYNC_BODY);
  const result = await sync(db, me.id, now, body);
  await touchProfile(db, me.id, platform, result.state.stars, result.state.city, now);
  // Lige katılmış (adı olan) oyuncu bu haftanın grubunda.
  if (me.name !== '') await joinGroup(db, me, weekId(now));
  return json(result);
}

/**
 * iOS: cihazdaki oyunu sunucuya yükle (App Attest onaylı, gövdenin tam baytları
 * üstüne). Başka cihaza taşımadan önce ve her gönderimde.
 */
async function uploadDeviceSave(request: Request, db: Db, me: Player, platform: Platform, now: number, config: AttestConfig): Promise<Response> {
  if (platform !== 'ios') throw new HttpError(403, 'platform');
  const { bytes, value } = await readBody(request, MAX_SYNC_BODY);
  await checkAssertion(request, db, me, bytes, now, config);
  const save = await uploadSave(db, me.id, now, value);
  await touchProfile(db, me.id, 'ios', save.state.stars, save.state.city, now);
  return json({ version: save.version, cursor: save.cursor });
}

/** Başka cihaza taşıma: tek seferlik 6 harfli kod; öncekini geçersiz kılıyor. Kayıt sunucuda olmalı (iOS önce yüklüyor). */
async function createLink(db: Db, me: Player, now: number): Promise<Response> {
  if (!(await loadSave(db, me.id))) throw new HttpError(409, 'save');
  await db.run('DELETE FROM links WHERE player_id = ? OR expires_at < ?', me.id, now);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = shortCode();
    if ((await db.run('INSERT OR IGNORE INTO links (code, player_id, expires_at) VALUES (?, ?, ?)', code, me.id, now + LINK_TTL)) === 0) continue;
    return json({ code, expiresAt: now + LINK_TTL }, 201);
  }
  throw new HttpError(503, 'code');
}

/** Kodu giren cihaz hesaba yeni bir token alıyor; öbür cihazlar da çalışmayı sürdürüyor. */
async function claimLink(request: Request, db: Db, now: number): Promise<Response> {
  const body = await readJson(request);
  const platform = platformOf(body.platform);
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  // Tek seferlik ve tek adımda: süresi geçmiş olsa da siliniyor; aynı kodla aynı anda
  // gelen iki istekten yalnızca biri satırı alıyor.
  const link = /^[A-Z0-9]{6}$/.test(code)
    ? await db.first<{ player_id: string; expires_at: number }>('DELETE FROM links WHERE code = ? RETURNING player_id, expires_at', code)
    : null;
  if (!link || link.expires_at < now) throw new HttpError(404, 'code');
  const player = await db.first<Player>('SELECT * FROM players WHERE id = ?', link.player_id);
  if (!player) throw new HttpError(404, 'code');
  const token = randomToken();
  await db.run('INSERT INTO tokens (token_hash, player_id, platform, created_at) VALUES (?, ?, ?, ?)', await sha256(token), player.id, platform, now);
  // Hafta ve puan da: iOS haftalık sayacını alınan hesabın puanından sürdürsün (yoksa sonraki gönderim "azalma").
  const save = await saveWithScore(db, player.id, now);
  return json({ id: player.id, token, name: player.name, division: player.division, ...(save ? { save } : {}) }, 201);
}

/** Holding yıldızı tablosu: bütün platformlar, dünya ilk 50 ve özel lig arkadaşları. */
async function starsBoard(db: Db, me: Player) {
  const top = await db.all<{ id: string; name: string; stars: number; platform: string }>(
    `SELECT p.id AS id, p.name AS name, f.stars AS stars, f.platform AS platform
       FROM profiles f JOIN players p ON p.id = f.player_id
      WHERE p.name <> ''
      ORDER BY f.stars DESC, p.created_at ASC, p.id ASC
      LIMIT 50`,
  );
  const mine = await db.first<{ stars: number; platform: string }>('SELECT stars, platform FROM profiles WHERE player_id = ?', me.id);
  const stars = mine?.stars ?? 0;
  // Sıram: listedeki sırayla aynı (eşit yıldızda önce katılan, sonra kimlik).
  const above = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM profiles f JOIN players p ON p.id = f.player_id
      WHERE p.name <> '' AND p.id <> ?
        AND (f.stars > ? OR (f.stars = ? AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))))`,
    me.id,
    stars,
    stars,
    me.created_at,
    me.created_at,
    me.id,
  );
  const friends = await db.all<{ id: string; name: string; stars: number | null; platform: string | null }>(
    `SELECT DISTINCT p.id AS id, p.name AS name, f.stars AS stars, f.platform AS platform
       FROM league_members a
       JOIN league_members b ON b.code = a.code
       JOIN players p ON p.id = b.player_id
       LEFT JOIN profiles f ON f.player_id = p.id
      WHERE a.player_id = ? AND p.name <> ''
      ORDER BY COALESCE(f.stars, 0) DESC, p.created_at ASC
      LIMIT 100`,
    me.id,
  );
  const row = (r: { id: string; name: string; stars: number | null; platform: string | null }, index: number) => ({
    rank: index + 1,
    name: r.name,
    stars: r.stars ?? 0,
    platform: r.platform ?? 'ios',
    me: r.id === me.id,
  });
  return {
    top: top.map(row),
    me: { rank: me.name === '' ? null : (above?.n ?? 0) + 1, stars, platform: mine?.platform ?? 'ios' },
    friends: friends.map(row),
  };
}

// ------------------------------------------------------------ haftalık lig

async function submit(request: Request, db: Db, me: Player, now: number, config: AttestConfig): Promise<Response> {
  const { bytes, value } = await readBody(request);
  await checkAssertion(request, db, me, bytes, now, config);
  const body = value as unknown as LeagueReport;
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
  await touchProfile(db, me.id, 'ios', body.stars, body.city, now);
  await joinGroup(db, me, week);
  return json(await standings(db, me, now));
}

/** Bu haftanın grubuna yerleş: bölümündeki ilk dolmamış grup, yoksa yenisi. */
async function joinGroup(db: Db, me: Player, week: string): Promise<void> {
  if (me.name === '') return;
  if (await db.first('SELECT 1 AS x FROM groups WHERE week = ? AND player_id = ?', week, me.id)) return;
  // Grup seçimi ve yerleşme tek ifadede: aynı anda katılanlar aynı boş yeri görüp grubu taşırmasın.
  await db.run(
    `INSERT OR IGNORE INTO groups (week, player_id, division, group_no)
     SELECT ?, ?, ?, COALESCE(
       (SELECT group_no FROM groups WHERE week = ? AND division = ? GROUP BY group_no HAVING COUNT(*) < ? ORDER BY group_no LIMIT 1),
       (SELECT COALESCE(MAX(group_no), -1) + 1 FROM groups WHERE week = ? AND division = ?))`,
    week,
    me.id,
    me.division,
    week,
    me.division,
    LEAGUE.groupSize,
    week,
    me.division,
  );
}

interface Row {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

async function groupRows(db: Db, week: string, division: number, groupNo: number): Promise<Array<{ id: string; name: string; score: number; platform: string | null }>> {
  return db.all(
    `SELECT p.id AS id, p.name AS name, COALESCE(r.score, 0) AS score, f.platform AS platform
       FROM groups g JOIN players p ON p.id = g.player_id
       LEFT JOIN reports r ON r.player_id = g.player_id AND r.week = g.week
       LEFT JOIN profiles f ON f.player_id = g.player_id
      WHERE g.week = ? AND g.division = ? AND g.group_no = ?
      ORDER BY score DESC, p.created_at ASC, p.id ASC`,
    week,
    division,
    groupNo,
  );
}

/**
 * Hafta dönümünün bütün bölüm değişiklikleri tek ifadede: her grup kendi
 * içinde sıralanıyor (`groupRows` ile aynı sıra), kurallar `divisionMoves`
 * ile aynı. Oyuncu sayısı ne olursa olsun tek sorgu (D1 ücretsiz katmanında
 * istek başına en çok 50 sorgu; toplu yazımdaki her ifade de sayılıyor).
 * Değerler: hafta, çıkan, en üst bölüm, inme için en küçük grup, inen.
 */
const ROLLOVER_MOVES = `
  WITH ranked AS (
    SELECT g.player_id AS player_id, g.division AS division, COALESCE(r.score, 0) AS score,
           ROW_NUMBER() OVER (
             PARTITION BY g.division, g.group_no
             ORDER BY COALESCE(r.score, 0) DESC, p.created_at ASC, p.id ASC
           ) - 1 AS rank,
           COUNT(*) OVER (PARTITION BY g.division, g.group_no) AS size
      FROM groups g
      JOIN players p ON p.id = g.player_id
      LEFT JOIN reports r ON r.player_id = g.player_id AND r.week = g.week
     WHERE g.week = ?
  ),
  moves AS (
    SELECT player_id,
           CASE
             WHEN rank < ? AND score > 0 AND division < ? THEN division + 1
             WHEN size >= ? AND rank >= size - ? AND division > 0 THEN division - 1
             ELSE division
           END AS target,
           division
      FROM ranked
  )
  UPDATE players
     SET division = (SELECT target FROM moves WHERE moves.player_id = players.id)
   WHERE id IN (SELECT player_id FROM moves WHERE target <> division)`;

export async function standings(db: Db, me: Player, now: number) {
  const week = weekId(now);
  const endsAt = weekStart(week) + WEEK_MS;
  const mine = await db.first<{ division: number; group_no: number }>('SELECT division, group_no FROM groups WHERE week = ? AND player_id = ?', week, me.id);
  const division = mine?.division ?? me.division;
  const base = { week, endsAt, division, divisionKey: DIVISION_KEYS[division], promote: LEAGUE.promote, demote: LEAGUE.demote, name: me.name };
  if (!mine) return { ...base, group: [] as Array<Row & { move: number; platform: string }> };
  const rows = await groupRows(db, week, mine.division, mine.group_no);
  const moves = divisionMoves(
    rows.map((row) => row.score),
    mine.division,
  );
  return {
    ...base,
    group: rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      score: row.score,
      me: row.id === me.id,
      move: moves[index] ?? 0,
      platform: row.platform ?? 'ios',
    })),
  };
}

/** Geçen haftanın bölüm değişimi; hafta başına bir kez (tablo satırıyla kilitli). */
export async function rollover(db: Db, now: number): Promise<boolean> {
  const previous = weekId(weekStart(weekId(now)) - 1);
  if (await db.first('SELECT 1 AS x FROM rollovers WHERE week = ?', previous)) return false;
  // İşaret ve bütün bölüm değişiklikleri tek işlemde, iki ifadede. Yarıda kalırsa hiçbiri
  // yazılmıyor ve sonraki istek baştan deniyor; aynı anda iki istek gelirse işareti ikinci
  // kez yazamayan (birincil anahtar) bütün işlemiyle geri alınıyor. Geçen haftanın grupları
  // artık değişmiyor (gönderim yalnızca bu haftaya).
  try {
    await db.batch([
      ['INSERT INTO rollovers (week, at) VALUES (?, ?)', previous, now],
      [ROLLOVER_MOVES, previous, LEAGUE.promote, LEAGUE.divisions - 1, LEAGUE.minGroupForDemotion, LEAGUE.demote],
    ]);
  } catch (error) {
    if (await db.first('SELECT 1 AS x FROM rollovers WHERE week = ?', previous)) return false;
    throw error;
  }
  return true;
}

// ------------------------------------------------------------ App Attest

async function attestChallenge(db: Db, me: Player, now: number): Promise<Response> {
  const challenge = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  await db.run(
    `INSERT INTO attest_challenges (player_id, challenge, expires_at) VALUES (?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET challenge = excluded.challenge, expires_at = excluded.expires_at`,
    me.id,
    challenge,
    now + CHALLENGE_TTL,
  );
  return json({ challenge });
}

/** Cihaz anahtarını kanıtla; oyuncunun önceki anahtarı (eski kurulum) siliniyor. */
async function attestKey(request: Request, db: Db, me: Player, now: number, config: AttestConfig): Promise<Response> {
  const body = await readJson(request);
  const attestation = base64(body.attestation);
  const keyId = typeof body.keyId === 'string' && base64(body.keyId)?.length === 32 ? body.keyId : null;
  if (!attestation || !keyId || typeof body.challenge !== 'string') throw new HttpError(400, 'body');
  const stored = await db.first<{ challenge: string; expires_at: number }>('SELECT challenge, expires_at FROM attest_challenges WHERE player_id = ?', me.id);
  // Tek seferlik: tutsa da tutmasa da siliniyor.
  await db.run('DELETE FROM attest_challenges WHERE player_id = ?', me.id);
  if (!stored || stored.challenge !== body.challenge || stored.expires_at < now) throw new HttpError(400, 'challenge');
  let attested;
  try {
    attested = await verifyAttestation({ attestation, keyId, challenge: fromBase64(stored.challenge), now, config });
  } catch (error) {
    if (!(error instanceof AttestError)) throw error;
    await reject(db, me, now, `attest:${error.reason}`);
    throw new HttpError(422, 'attest', { reason: error.reason });
  }
  // Apple: aynı anahtar başka bir kullanıcıya bağlı olmamalı.
  const owner = await db.first<{ player_id: string }>('SELECT player_id FROM attest_keys WHERE key_id = ?', keyId);
  if (owner && owner.player_id !== me.id) throw new HttpError(409, 'attest-key');
  await db.batch([
    ['DELETE FROM attest_keys WHERE player_id = ?', me.id],
    [
      'INSERT INTO attest_keys (key_id, player_id, public_key, environment, counter, at) VALUES (?, ?, ?, ?, 0, ?)',
      keyId,
      me.id,
      attested.publicKey,
      attested.environment,
      now,
    ],
  ]);
  return json({ ok: true, environment: attested.environment });
}

/**
 * Gönderimin onayı: gövdenin tam baytları üstüne imza ve artan sayaç.
 * Anahtar yoksa `attest` (uygulama yeniden kanıtlıyor), onay tutmazsa `assertion`.
 */
async function checkAssertion(request: Request, db: Db, me: Player, body: Uint8Array<ArrayBuffer>, now: number, config: AttestConfig): Promise<void> {
  const keyId = request.headers.get('x-attest-key');
  const assertion = base64(request.headers.get('x-attest-assertion'));
  const key = keyId
    ? await db.first<{ public_key: string; counter: number }>('SELECT public_key, counter FROM attest_keys WHERE key_id = ? AND player_id = ?', keyId, me.id)
    : null;
  if (!key) throw new HttpError(403, 'attest');
  if (!assertion) throw new HttpError(403, 'assertion', { reason: 'format' });
  let counter: number;
  try {
    ({ counter } = await verifyAssertion({ assertion, clientData: body, publicKey: key.public_key, counter: key.counter, config }));
  } catch (error) {
    if (!(error instanceof AttestError)) throw error;
    await reject(db, me, now, `assertion:${error.reason}`);
    throw new HttpError(403, 'assertion', { reason: error.reason });
  }
  // Aynı anda gelen iki istekten yalnızca biri sayacı ilerletebiliyor.
  if ((await db.run('UPDATE attest_keys SET counter = ? WHERE key_id = ? AND counter < ?', counter, keyId, counter)) === 0) {
    throw new HttpError(403, 'assertion', { reason: 'counter' });
  }
}

async function reject(db: Db, me: Player, now: number, reason: string): Promise<void> {
  await db.run('INSERT INTO rejects (player_id, week, reason, at) VALUES (?, ?, ?, ?)', me.id, weekId(now), reason, now);
}

// ------------------------------------------------------------ özel ligler

async function leagueCount(db: Db, me: Player): Promise<number> {
  return (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE player_id = ?', me.id))?.n ?? 0;
}

/** Özel ligde herkes adıyla görünüyor: lige katılmamış (adsız) hesap kuramıyor ve katılamıyor. */
function requireName(me: Player): void {
  if (me.name === '') throw new HttpError(409, 'unnamed');
}

async function createLeague(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  requireName(me);
  const name = acceptName((await readJson(request)).name, 24);
  if ((await leagueCount(db, me)) >= LEAGUE.privatePerPlayer) throw new HttpError(409, 'limit');
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = shortCode();
    if ((await db.run('INSERT OR IGNORE INTO leagues (code, name, owner, created_at) VALUES (?, ?, ?, ?)', code, name, me.id, now)) === 0) continue;
    await db.run('INSERT INTO league_members (code, player_id, joined_at) VALUES (?, ?, ?)', code, me.id, now);
    return json({ code, name }, 201);
  }
  throw new HttpError(503, 'code');
}

async function joinLeague(request: Request, db: Db, me: Player, now: number): Promise<Response> {
  requireName(me);
  const raw = (await readJson(request)).code;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  const league = await db.first<{ code: string; name: string }>('SELECT code, name FROM leagues WHERE code = ?', code);
  if (!league) throw new HttpError(404, 'code');
  if (await db.first('SELECT 1 AS x FROM league_members WHERE code = ? AND player_id = ?', code, me.id)) return json(league);
  // Sınırlar ve yerleşme tek ifadede: son boş yere ya da oyuncunun son hakkına aynı anda iki katılım sığmasın.
  const joined = await db.run(
    `INSERT OR IGNORE INTO league_members (code, player_id, joined_at)
     SELECT ?, ?, ?
      WHERE (SELECT COUNT(*) FROM league_members WHERE code = ?) < ?
        AND (SELECT COUNT(*) FROM league_members WHERE player_id = ?) < ?`,
    code,
    me.id,
    now,
    code,
    LEAGUE.privateMembers,
    me.id,
    LEAGUE.privatePerPlayer,
  );
  if (joined === 0) {
    if (await db.first('SELECT 1 AS x FROM league_members WHERE code = ? AND player_id = ?', code, me.id)) return json(league);
    const members = (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM league_members WHERE code = ?', code))?.n ?? 0;
    throw new HttpError(409, members >= LEAGUE.privateMembers ? 'full' : 'limit');
  }
  return json(league);
}

/** Hesabı sil (App Store 5.1.1(v)): oyuncunun her izi gidiyor; boşalan özel ligler de. */
async function deleteAccount(db: Db, me: Player): Promise<Response> {
  const codes = await db.all<{ code: string }>('SELECT code FROM league_members WHERE player_id = ?', me.id);
  for (const { code } of codes) await leaveLeague(db, me, code);
  for (const table of ['groups', 'reports', 'rejects', 'attest_keys', 'attest_challenges', 'tokens', 'saves', 'profiles', 'links']) {
    await db.run(`DELETE FROM ${table} WHERE player_id = ?`, me.id);
  }
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
  const result: Array<{ code: string; name: string; members: Array<Row & { platform: string }> }> = [];
  for (const league of leagues) {
    const rows = await db.all<{ id: string; name: string; score: number; platform: string | null }>(
      `SELECT p.id AS id, p.name AS name, COALESCE(r.score, 0) AS score, f.platform AS platform
         FROM league_members m JOIN players p ON p.id = m.player_id
         LEFT JOIN reports r ON r.player_id = m.player_id AND r.week = ?
         LEFT JOIN profiles f ON f.player_id = m.player_id
        WHERE m.code = ?
        ORDER BY score DESC, m.joined_at ASC`,
      week,
      league.code,
    );
    result.push({
      ...league,
      members: rows.map((row, index) => ({ rank: index + 1, name: row.name, score: row.score, me: row.id === me.id, platform: row.platform ?? 'ios' })),
    });
  }
  return { week, leagues: result };
}
