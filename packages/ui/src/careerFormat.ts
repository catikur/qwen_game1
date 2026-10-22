import { t } from './i18n';
import type { CareerRun } from './career';

/** Senaryo yıldızları: dolu ve boş, üç üzerinden. */
export function stars(count: number): string {
  return '★'.repeat(count) + '☆'.repeat(Math.max(0, 3 - count));
}

/** Kariyer geçmişinde koşunun sonucu (Tur 41). */
export function careerRunResult(run: CareerRun): string {
  if (run.mode === 'scenario') {
    if (run.scenario?.outcome === 'won') return `${stars(run.scenario.stars)} ${t('hud.career.result.scenarioWon')}`;
    if (run.scenario?.outcome === 'lost') return t('hud.career.result.scenarioLost');
    return t('hud.career.result.playing', { day: run.day });
  }
  if (run.league === 'finished') return t(run.leagueKind === 'day' ? 'hud.career.result.dailyFinished' : 'hud.career.result.leagueFinished');
  const firstWin = run.wins.reduce<number | null>((best, win) => (best === null || win.day < best ? win.day : best), null);
  if (firstWin !== null) return t('hud.career.result.victory', { day: firstWin });
  // Zaferi yalnız kapatılan şehirde kalan holding: günü bilinmiyor (Codex #70).
  if (run.closedWins > 0) return t('hud.career.result.victoryNoDay');
  if (run.lost) return t('hud.career.result.lost', { day: run.day });
  return t('hud.career.result.playing', { day: run.day });
}
