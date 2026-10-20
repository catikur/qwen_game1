/*
 * Tohum Ligi'nin haftası (Tur 46'da `league.ts`'ten ayrıldı): kurulum ekranı
 * haftayı gösteriyor, ligin geri kalanı (haber, skor) oyun parçasında.
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
