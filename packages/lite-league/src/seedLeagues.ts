/**
 * Ana oyunun davetli ligleri (Tur 55): arkadaşlar kendi tablolarında.
 *
 * Lite'ta var olan davet kodlu ligin ana oyundaki karşılığı. Lig bir ad ve
 * altı harflik bir kod; koda sahip olan katılıyor. Ligin tablosu ayrı bir
 * skor tutmuyor: üyelerin genel tablodaki doğrulanmış koşuları (`seed_verified`),
 * o hafta ya da o gün için. Kim hangi ligde, yalnız üyeler görüyor; tablonun
 * satırları zaten herkese açık tablodan (şirket adı, CEO, skor, eğri).
 *
 * Lite'ın liglerinden ayrı tablolarda (`seed_leagues`, `seed_league_members`):
 * Lite'ın haftalık puanı ile Tohum Ligi'nin skoru aynı tabloya girmesin.
 *
 * ŞEMA SONRA GELEBİLİR. Kod canlıya şemadan önce giderse (sıra şema, kod ama
 * insan işi) uçlar 503 `schema` diyor, sağlık ucu `friends: 0`; hesap silme
 * ve haftalık temizlik yeni tabloları yoksa atlıyor (Lite'ın akışı bozulmasın).
 *
 * Uç noktalar (ana oyunun hesabıyla):
 * - `GET    /v1/seed/leagues`                    → liglerim: {leagues: [{code, name, members}]}
 * - `POST   /v1/seed/leagues {name}`             → lig kur: {code, name}
 * - `POST   /v1/seed/leagues/join {code}`        → koda katıl: {code, name}
 * - `DELETE /v1/seed/leagues/:code`              → ligden ayrıl (son üyeyle lig gidiyor)
 * - `GET    /v1/seed/leagues/:code/weeks/:week`  → ligin haftalık tablosu (yalnız üyeler)
 * - `GET    /v1/seed/leagues/:code/days/:day`    → ligin günlük tablosu (yalnız üyeler)
 */
import type { Db, Statement } from './db';
import { HttpError, json, readJson, shortCode } from './http';
import { cleanName, offensiveName } from './names';
import { limit, memberTable } from './seed';

export const SEED_LEAGUE = {
  /** Oyuncu başına lig (kurduğu ve katıldığı birlikte). */
  perPlayer: 5,
  /** Lig başına üye: tablo tek sayfada. */
  members: 50,
  nameLength: 24,
  /** IP başına saatte kurma ve katılma denemesi: kodları deneyerek liglere girilmesin. */
  attemptsPerHour: 30,
} as const;

const TABLES = ['seed_leagues', 'seed_league_members'] as const;

/** Yeni tablolar veritabanında mı (şema uygulandı mı). */
export async function seedLeaguesReady(db: Db): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${TABLES.map(() => '?').join(', ')})`,
    ...TABLES,
  );
  return rows.length === TABLES.length;
}

async function requireSchema(db: Db): Promise<void> {
  if (!(await seedLeaguesReady(db))) throw new HttpError(503, 'schema');
}

function acceptLeagueName(raw: unknown): string {
  const name = cleanName(raw, SEED_LEAGUE.nameLength);
  if (!name) throw new HttpError(400, 'name');
  if (offensiveName(name)) throw new HttpError(400, 'name-blocked');
  return name;
}

function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

async function memberCount(db: Db, code: string): Promise<number> {
  return (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM seed_league_members WHERE code = ?', code))?.n ?? 0;
}

/** Hesap bu arada silindiyse (bağlı başka sekmeden) yer tutulmuyor. */
async function requireAccount(db: Db, me: string): Promise<void> {
  if (!(await db.first('SELECT 1 AS x FROM players WHERE id = ?', me))) throw new HttpError(401, 'auth');
}

export async function createSeedLeague(request: Request, db: Db, me: string, now: number): Promise<Response> {
  await requireSchema(db);
  const name = acceptLeagueName((await readJson(request)).name);
  await limit(db, request, 'league', SEED_LEAGUE.attemptsPerHour, now);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = shortCode();
    if ((await db.run('INSERT OR IGNORE INTO seed_leagues (code, name, created_at) VALUES (?, ?, ?)', code, name, now)) === 0) continue;
    // Oyuncu başına sınır yerleşmeyle tek ifadede: iki sekmeden aynı anda kurulsa da aşılmasın.
    const joined = await db.run(
      `INSERT INTO seed_league_members (code, player_id, joined_at)
       SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM seed_league_members WHERE player_id = ?) < ?
                        AND EXISTS (SELECT 1 FROM players WHERE id = ?)`,
      code,
      me,
      now,
      me,
      SEED_LEAGUE.perPlayer,
      me,
    );
    if (joined === 0) {
      await db.run('DELETE FROM seed_leagues WHERE code = ?', code);
      await requireAccount(db, me);
      throw new HttpError(409, 'limit');
    }
    return json({ code, name, members: 1 }, 201);
  }
  throw new HttpError(503, 'code');
}

export async function joinSeedLeague(request: Request, db: Db, me: string, now: number): Promise<Response> {
  await requireSchema(db);
  const code = normalizeCode((await readJson(request)).code);
  await limit(db, request, 'league', SEED_LEAGUE.attemptsPerHour, now);
  const league = await db.first<{ code: string; name: string }>('SELECT code, name FROM seed_leagues WHERE code = ?', code);
  if (!league) throw new HttpError(404, 'code');
  const already = await db.first('SELECT 1 AS x FROM seed_league_members WHERE code = ? AND player_id = ?', code, me);
  if (!already) {
    // Sınırlar ve yerleşme tek ifadede: son boş yere ya da oyuncunun son hakkına aynı anda iki katılım sığmasın.
    const joined = await db.run(
      `INSERT OR IGNORE INTO seed_league_members (code, player_id, joined_at)
       SELECT ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM seed_leagues WHERE code = ?)
          AND (SELECT COUNT(*) FROM seed_league_members WHERE code = ?) < ?
          AND (SELECT COUNT(*) FROM seed_league_members WHERE player_id = ?) < ?
          AND EXISTS (SELECT 1 FROM players WHERE id = ?)`,
      code,
      me,
      now,
      code,
      code,
      SEED_LEAGUE.members,
      me,
      SEED_LEAGUE.perPlayer,
      me,
    );
    if (joined === 0) {
      await requireAccount(db, me);
      if (!(await db.first('SELECT 1 AS x FROM seed_league_members WHERE code = ? AND player_id = ?', code, me))) {
        // Bu arada son üye ayrılıp lig silindi.
        if (!(await db.first('SELECT 1 AS x FROM seed_leagues WHERE code = ?', code))) throw new HttpError(404, 'code');
        throw new HttpError(409, (await memberCount(db, code)) >= SEED_LEAGUE.members ? 'full' : 'limit');
      }
    }
  }
  return json({ ...league, members: await memberCount(db, code) });
}

export async function leaveSeedLeague(db: Db, me: string, code: string): Promise<Response> {
  await requireSchema(db);
  await db.run('DELETE FROM seed_league_members WHERE code = ? AND player_id = ?', normalizeCode(code), me);
  await dropIfEmpty(db, normalizeCode(code));
  return json({ ok: true });
}

/** Boşalan lig siliniyor; sayım ve silme tek ifadede (bu arada katılan olduysa lig kalıyor). */
async function dropIfEmpty(db: Db, code: string): Promise<void> {
  await db.run('DELETE FROM seed_leagues WHERE code = ? AND NOT EXISTS (SELECT 1 FROM seed_league_members WHERE code = ?)', code, code);
}

export async function mySeedLeagues(db: Db, me: string): Promise<Response> {
  await requireSchema(db);
  const leagues = await db.all<{ code: string; name: string; members: number }>(
    `SELECT l.code AS code, l.name AS name,
            (SELECT COUNT(*) FROM seed_league_members x WHERE x.code = l.code) AS members
       FROM seed_league_members m JOIN seed_leagues l ON l.code = m.code
      WHERE m.player_id = ?
      ORDER BY m.joined_at, l.code`,
    me,
  );
  return json({ leagues });
}

/** Ligin tablosu: yalnız üyeler görüyor (kim hangi ligde, dışarıdan görünmesin). */
export async function seedLeagueTable(db: Db, kind: 'week' | 'day', code: string, board: string, me: string, now: number): Promise<Response> {
  await requireSchema(db);
  const league = await db.first<{ code: string; name: string }>('SELECT code, name FROM seed_leagues WHERE code = ?', normalizeCode(code));
  if (!league) throw new HttpError(404, 'code');
  if (!(await db.first('SELECT 1 AS x FROM seed_league_members WHERE code = ? AND player_id = ?', league.code, me))) throw new HttpError(403, 'member');
  const table = await memberTable(db, kind, board, league.code, me, now);
  const response = json({ ...table, code: league.code, name: league.name, members: await memberCount(db, league.code) });
  response.headers.set('cache-control', 'no-store');
  return response;
}

/** Hesap silinince: üyelikler gidiyor, boşalan ligler de. Şema yoksa yapacak bir şey yok. */
export async function removeSeedMemberships(db: Db, id: string): Promise<void> {
  if (!(await seedLeaguesReady(db))) return;
  const left = await db.all<{ code: string }>('DELETE FROM seed_league_members WHERE player_id = ? RETURNING code', id);
  for (const { code } of left) await dropIfEmpty(db, code);
}

/**
 * Haftalık temizlik (`purgeOrphans` ile aynı işlemde): hesabı silinmiş
 * üyeler ve boş ligler. Yeni kurulan lig kurucusu yerleşene kadar bir an boş:
 * bir dakikadan yeni liglere dokunulmuyor. Şema yoksa boş.
 */
export async function seedLeaguePurge(db: Db, now: number): Promise<Statement[]> {
  if (!(await seedLeaguesReady(db))) return [];
  return [
    ['DELETE FROM seed_league_members WHERE player_id NOT IN (SELECT id FROM players)'],
    ['DELETE FROM seed_leagues WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM seed_league_members m WHERE m.code = seed_leagues.code)', now - 60_000],
  ];
}
