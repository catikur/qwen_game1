/**
 * CapitalForge Lite — online lig kuralları (L8).
 *
 * Hem uygulama (Swift karşılığı `League.swift`) hem lig sunucusu
 * (`packages/lite-league`) bu dosyayı kullanıyor: hafta kimliği, haftalık
 * puan ve "bu sürede en fazla bu kadar kazanılabilir" sınırı aynı modelden.
 *
 * Puan: hafta içinde kazanılan para, yıldız çarpanı hariç. Yoksa eski
 * oyuncu her hafta kazanırdı; bölümler (Bronz → Elmas) zaten deneyimi ayırıyor.
 */
import {
  CHAIN_IDS,
  EXPORT_BOOM_MULTIPLIER,
  FASHION_WEEK_MULTIPLIER,
  POLICY,
  STAGES,
  STAR_BONUS,
  TOURISM_MULTIPLIER,
} from './content';
import { incomePerSecond, newGame, upgradeCost } from './model';

export const LEAGUE = {
  /** Bronz, Gümüş, Altın, Elmas. */
  divisions: 4,
  groupSize: 30,
  /** Haftanın ilk beşi üst bölüme çıkıyor, son beşi iniyor. */
  promote: 5,
  demote: 5,
  /** Bundan küçük grupta kimse düşmüyor (yeni oyuncular azken lig cezalandırmasın). */
  minGroupForDemotion: 10,
  /** Özel lig: en çok üye ve oyuncu başına en çok lig. */
  privateMembers: 50,
  privatePerPlayer: 10,
  /** İki gönderim arası en az (sn). */
  minReportGap: 30,
  /** Seviyelerin maliyeti, şehirde kazanılanın bu katını geçemez (görev ödülü, halka arz payı). */
  spendSlack: 3,
  spendFloor: 1e7,
  /** Hız sınırına güvenlik payı. */
  rateSlack: 1.2,
  /** Ad: 3–16 karakter, harf, rakam, boşluk, alt çizgi, tire. */
  nameMin: 3,
  nameMax: 16,
} as const;

/**
 * Anlık çarpanların üst sınırı: kampanya fonuyla kampanya (×3) ve tek zincire
 * en çok vuran olay (moda haftası ×2,5). Politika tek seferde bir tane:
 * kampanya fonu varken başka politika yok, yokken kampanya ×2 × en iyi politika
 * (×1,3) = ×2,6 < ×3.
 */
export const LEAGUE_BOOST =
  POLICY.campaignFund * Math.max(FASHION_WEEK_MULTIPLIER, TOURISM_MULTIPLIER, EXPORT_BOOM_MULTIPLIER);

const DAY = 86_400_000;

/** ISO 8601 hafta kimliği (UTC), ör. "2026-W42". Hafta pazartesi 00:00 UTC'de başlıyor. */
export function weekId(epochMs: number): string {
  const day = Math.floor(epochMs / DAY);
  // 1970-01-01 perşembe: (gün + 3) mod 7 → pazartesi 0.
  const weekday = (((day + 3) % 7) + 7) % 7;
  const thursday = day - weekday + 3;
  const year = new Date(thursday * DAY).getUTCFullYear();
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Haftanın başlangıcı (pazartesi 00:00 UTC, ms). */
export function weekStart(id: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) return NaN;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = Math.floor(Date.UTC(year, 0, 4) / DAY);
  const weekday = (((jan4 + 3) % 7) + 7) % 7;
  return (jan4 - weekday + (week - 1) * 7) * DAY;
}

/** Bir kazancın yıldızsız karşılığı (haftalık puana giden). */
export function starFree(amount: number, stars: number): number {
  return amount / (1 + STAR_BONUS * stars);
}

/** Uygulamanın sunucuya gönderdiği durum. */
export interface LeagueReport {
  week: string;
  /** Haftalık puan: bu hafta kazanılan, yıldızsız. */
  score: number;
  city: number;
  stars: number;
  /** Şu anki şehirde ömür boyu kazanç. */
  cityEarned: number;
  /** CHAIN_IDS sırasıyla [ham, işleme, satış]. */
  levels: number[][];
}

export type Verdict = { ok: true } | { ok: false; reason: 'shape' | 'week' | 'decrease' | 'spend' | 'rate' };

/** Seviyelerin sıfırdan toplam maliyeti. */
export function levelSpend(levels: readonly (readonly number[])[]): number {
  let total = 0;
  CHAIN_IDS.forEach((id, index) => {
    for (const stage of STAGES) {
      const level = levels[index]?.[stage] ?? 0;
      if (level > 0) total += upgradeCost(id, stage, 0, level);
    }
  });
  return total;
}

/**
 * Bildirilen şehrin en yüksek olası yıldızsız geliri (₺/sn): rakip yok (pay 1),
 * şehir bonusu, ticaret yolu, mahalleler ve şebeke dahil, üstüne anlık
 * çarpanların üst sınırı.
 */
export function maxRate(report: LeagueReport): number {
  const state = newGame(report.city, 0);
  state.earned = report.cityEarned;
  CHAIN_IDS.forEach((id, index) => {
    const row = report.levels[index] ?? [0, 0, 0];
    state.chains[id].levels = [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0];
  });
  return incomePerSecond(state) * LEAGUE_BOOST;
}

function wellFormed(report: LeagueReport): boolean {
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const whole = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
  if (typeof report.week !== 'string' || !finite(report.score) || !finite(report.cityEarned)) return false;
  if (!whole(report.city) || !whole(report.stars) || report.city > 10_000 || report.stars > 1e9) return false;
  if (!Array.isArray(report.levels) || report.levels.length !== CHAIN_IDS.length) return false;
  return report.levels.every((row) => Array.isArray(row) && row.length === 3 && row.every((l) => whole(l) && l <= 10_000));
}

/**
 * Gönderim akla yatkın mı? `elapsed`: sunucu saatine göre önceki kabul edilen
 * gönderimden (yoksa haftanın ya da hesabın başından) bu yana geçen saniye.
 * Telefonun saatini ileri almak işe yaramıyor: süre sunucunun.
 *
 * - Puan hafta içinde azalmıyor. Şehir ve yıldız geri gidebiliyor (oyunu
 *   sıfırlamak); ikisi de hız sınırını büyütmüyor, şehir değişince iki
 *   durumdan hızlısı geçerli.
 * - Seviyelerin maliyeti şehirde kazanılanla uyumlu (sahte seviye sahte kazanç ister).
 * - Puan artışı, o seviyelerle en iyi koşullarda kazanılabilecek olanı geçmiyor.
 *   Arada şehir satıldıysa eski şehrin hızı da sayılıyor.
 */
export function checkReport(prev: LeagueReport | null, next: LeagueReport, elapsed: number): Verdict {
  if (!wellFormed(next)) return { ok: false, reason: 'shape' };
  if (Number.isNaN(weekStart(next.week))) return { ok: false, reason: 'week' };
  const sameWeek = prev !== null && prev.week === next.week;
  if (sameWeek && next.score < prev!.score) return { ok: false, reason: 'decrease' };
  if (levelSpend(next.levels) > LEAGUE.spendSlack * next.cityEarned + LEAGUE.spendFloor) return { ok: false, reason: 'spend' };
  const gained = next.score - (sameWeek ? prev!.score : 0);
  let rate = maxRate(next);
  if (prev !== null && prev.city !== next.city) rate = Math.max(rate, maxRate(prev));
  const allowed = rate * Math.max(1, elapsed) * LEAGUE.rateSlack + 1_000;
  if (gained > allowed) return { ok: false, reason: 'rate' };
  return { ok: true };
}

/** Bölüm adı anahtarı (uygulama ve sunucu aynı sırayı kullanıyor). */
export const DIVISION_KEYS = ['bronze', 'silver', 'gold', 'diamond'] as const;

/** Haftalık grubun sıralamasından bölüm değişimi: +1 çıkış, -1 iniş, 0 kalış. */
export function divisionMoves(scores: readonly number[], division: number): number[] {
  const order = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || a.index - b.index);
  const moves = scores.map(() => 0);
  const n = scores.length;
  order.forEach((entry, rank) => {
    if (rank < LEAGUE.promote && entry.score > 0 && division < LEAGUE.divisions - 1) moves[entry.index] = 1;
    else if (n >= LEAGUE.minGroupForDemotion && rank >= n - LEAGUE.demote && division > 0) moves[entry.index] = -1;
  });
  return moves;
}
