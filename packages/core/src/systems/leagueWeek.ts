// Yalnız tür: modül çalışırken bağımlılıksız kalıyor.
import type { ModifierId } from '@capital/content';

/*
 * Tohum Ligi'nin haftası (Tur 46'da `league.ts`'ten ayrıldı): kurulum ekranı
 * haftayı gösteriyor, ligin geri kalanı (haber, skor) oyun parçasında. Tur
 * 53'ten beri günün koşusu ve haftanın kuralı da burada.
 */

/** ISO 8601 hafta kimliği: "2026-W40". */
export function leagueWeekId(date: Date = new Date()): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Hafta kimliğinden tohum (FNV-1a, 31 bit). */
export function leagueSeed(weekId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < weekId.length; i++) {
    hash ^= weekId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash & 0x7fffffff;
}

// ---------------------------------------------------------------- Tur 53

/**
 * Günün koşusu (Tur 53): UTC günü, "2026-10-22". Kısa (90 gün), her gün yeni
 * şehir, kendi tablosu. Koşu kodunda haftanın yerinde bu duruyor.
 */
export function leagueDayId(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Tablonun türü: haftanın tohumu ya da günün koşusu. */
export type LeagueBoardKind = 'week' | 'day';

const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Kimlik hangi tablonun? Tanınmıyorsa (takvimde olmayan gün de) null. */
export function leagueBoardKind(id: string): LeagueBoardKind | null {
  const week = WEEK_PATTERN.exec(id);
  if (week) {
    const n = Number(week[2]);
    return n >= 1 && n <= 53 ? 'week' : null;
  }
  if (DAY_PATTERN.test(id)) {
    const date = new Date(`${id}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && leagueDayId(date) === id ? 'day' : null;
  }
  return null;
}

/**
 * Haftanın kuralı (Tur 53): Tur 45'in ek kurallarından biri, her hafta
 * sıradaki. Herkes aynı hafta aynı kuralla oynuyor; sıra sabit, gelecek
 * haftanınki de belli. Kuraldan önceki haftalar kuralsız (eski koşular
 * eskisi gibi oynanıyor); günün koşusu kuralsız.
 */
export const LEAGUE_RULE_ROTATION: readonly ModifierId[] = ['scarce_land', 'hungry_rivals', 'storms', 'tight_credit'];
/** Kuralların başladığı hafta. */
export const LEAGUE_RULES_FROM = '2026-W43';

/** ISO haftasının pazartesisi (UTC, ms). */
function weekMonday(weekId: string): number | null {
  const match = WEEK_PATTERN.exec(weekId);
  if (!match || leagueBoardKind(weekId) !== 'week') return null;
  const jan4 = Date.UTC(Number(match[1]), 0, 4);
  const weekday = new Date(jan4).getUTCDay() || 7;
  return jan4 - (weekday - 1) * 86_400_000 + (Number(match[2]) - 1) * 7 * 86_400_000;
}

export function leagueRule(id: string): ModifierId | null {
  const monday = weekMonday(id);
  const from = weekMonday(LEAGUE_RULES_FROM)!;
  if (monday === null || monday < from) return null;
  const index = Math.round((monday - from) / (7 * 86_400_000));
  return LEAGUE_RULE_ROTATION[index % LEAGUE_RULE_ROTATION.length]!;
}
