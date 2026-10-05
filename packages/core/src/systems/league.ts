import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import type { GameCommand, GameState } from '../types';

/**
 * Tohum Ligi.
 *
 * Herkes aynı hafta aynı şehirde oynuyor: tohum ISO haftasından türüyor,
 * zorluk sabit (Dengeli), süre 360 gün. Skor 360. gündeki şirket değeri.
 *
 * DOĞRULAMA TEKRARLA. Simülasyon belirlenimci (aynı tohum + aynı komut
 * dizisi = aynı dünya), yani bir skoru kanıtlamanın yolu onu YENİDEN
 * OYNAMAK: koşu kodu tohumu, CEO'yu ve oyuncunun gün gün komutlarını
 * taşıyor; herhangi bir tarayıcı onu baştan koşturup aynı skoru bulursa
 * skor gerçek. Durumu elle değiştiren biri (konsoldan nakit eklemek
 * gibi) tekrarda o nakdi bulamaz — skor tutmaz.
 */
export const LEAGUE_DAYS = 360;
export const LEAGUE_SAMPLE_DAYS = 10;

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

/**
 * Simülasyonu değiştiren komutlar günlüğe girer; hız, duraklatma ve zafer
 * ekranı girmez — tekrar onları bilmeden aynı dünyayı üretir.
 */
export function isLoggable(command: GameCommand): boolean {
  return (
    command.type !== 'SET_SPEED' &&
    command.type !== 'TOGGLE_PAUSE' &&
    command.type !== 'DISMISS_VICTORY' &&
    command.type !== 'DISMISS_LEAGUE'
  );
}

/** Lig koşusu sürüyor mu (bitmemiş)? */
export function leagueActive(state: GameState): boolean {
  return state.league !== undefined && state.league.finishedDay === undefined;
}

/**
 * Günlük lig adımı: eğri örneği, bitiş. Gün sonunda koşuyor — skor o
 * günün son net değeri.
 */
export function runLeagueTick(state: GameState): void {
  const league = state.league;
  if (!league || league.finishedDay !== undefined) return;
  const player = state.companies[state.playerCompanyId];
  if (!player) return;

  if (state.time.day % LEAGUE_SAMPLE_DAYS === 0) league.curve.push(Math.round(player.netWorth));

  const lost = state.gameOver !== undefined;
  if (!lost && state.time.day < league.endDay) return;

  league.finishedDay = state.time.day;
  league.outcome = lost ? 'lost' : 'finished';
  league.score = lost ? 0 : Math.round(player.netWorth);
  state.time.speed = 0;
  pushNews(
    state,
    lost ? 'bad' : 'good',
    lost ? 'Lig koşusu bitti: devralındın' : `Lig koşusu bitti: ${formatMoney(league.score)}`,
    lost
      ? 'Bu haftanın skoru sıfır. Yeni bir koşu aynı şehirde baştan başlar.'
      : `${league.endDay} gün doldu. Skorun ${formatMoney(league.score)} — koşu kodunu paylaş ya da tabloya gönder.`,
  );
}
