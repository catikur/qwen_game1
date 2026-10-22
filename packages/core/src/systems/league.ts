import { tc } from '../i18n';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import type { GameCommand, GameState } from '../types';
import { leagueBoardKind } from './leagueWeek';

/**
 * Tohum Ligi.
 *
 * Herkes aynı hafta aynı şehirde oynuyor: tohum ISO haftasından türüyor,
 * zorluk sabit (Dengeli), süre 360 gün. Skor 360. gündeki şirket değeri.
 * Tur 53: her hafta Tur 45'in ek kurallarından biri (`leagueRule`, herkese
 * aynı); bir de günün koşusu (tohum UTC gününden, 90 gün, kuralsız).
 *
 * DOĞRULAMA TEKRARLA. Simülasyon belirlenimci (aynı tohum + aynı komut
 * dizisi = aynı dünya), yani bir skoru kanıtlamanın yolu onu YENİDEN
 * OYNAMAK: koşu kodu tohumu, CEO'yu ve oyuncunun gün gün komutlarını
 * taşıyor; herhangi bir tarayıcı onu baştan koşturup aynı skoru bulursa
 * skor gerçek. Durumu elle değiştiren biri (konsoldan nakit eklemek
 * gibi) tekrarda o nakdi bulamaz — skor tutmaz.
 */
export const LEAGUE_DAYS = 360;
/** Günün koşusu (Tur 53): kısa, aynı kurallar. */
export const LEAGUE_DAILY_DAYS = 90;
export const LEAGUE_SAMPLE_DAYS = 10;

// Hafta kimliği ve tohumu kurulum ekranında da okunuyor; bağımlılıksız modülde (Tur 46).
export { LEAGUE_RULES_FROM, LEAGUE_RULE_ROTATION, leagueBoardKind, leagueDayId, leagueRule, leagueSeed, leagueWeekId } from './leagueWeek';
export type { LeagueBoardKind } from './leagueWeek';

/** Tablonun koşu uzunluğu: hafta 360, gün 90 gün. */
export function leagueLength(id: string): number {
  return leagueBoardKind(id) === 'day' ? LEAGUE_DAILY_DAYS : LEAGUE_DAYS;
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
    lost ? tc('core.league.lostTitle') : tc('core.league.finishedTitle', { score: formatMoney(league.score) }),
    lost
      ? tc('core.league.lostBody')
      : tc('core.league.finishedBody', { days: league.endDay, score: formatMoney(league.score) }),
  );
}
