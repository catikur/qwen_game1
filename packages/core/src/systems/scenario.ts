import { SCENARIO_BY_ID, fillTemplate, formatDecimal } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import type { GameState, ScenarioState } from '../types';

/**
 * Senaryo modu (Tur 39): günlük hedef, süre ve yıldız. Kurulum
 * `scenario.ts`te; bu dosya yalnızca okuyor ve koşuyu bitiriyor — zar
 * atmıyor, simülasyonun gidişatını değiştirmiyor.
 */

/** Senaryo sürüyor mu (bitmemiş)? */
export function scenarioActive(state: GameState): boolean {
  return state.scenario !== undefined && state.scenario.finishedDay === undefined;
}

export function scenarioDefOf(state: GameState): ScenarioDef | null {
  return state.scenario ? (SCENARIO_BY_ID[state.scenario.id] ?? null) : null;
}

/**
 * Oyuncunun net değerinin en güçlü rakibinkine oranı. Rakip kalmadıysa
 * tavan (99): oran JSON'a yazılıyor, sonsuz yazılamaz.
 */
export function leadRatio(state: GameState): number {
  const player = state.companies[state.playerCompanyId];
  if (!player) return 0;
  let best = 0;
  for (const company of Object.values(state.companies)) {
    if (!company.isPlayer) best = Math.max(best, company.netWorth);
  }
  if (best <= 0) return 99;
  return Math.max(0, player.netWorth / best);
}

/** Bir skorun yıldızı (hedefe ulaşılmışsa en az bir). */
export function starsFor(def: ScenarioDef, score: number): number {
  const { metric, two, three } = def.stars;
  if (metric === 'days') return score <= three ? 3 : score <= two ? 2 : 1;
  return score >= three ? 3 : score >= two ? 2 : 1;
}

/** Hedef cümlesi, sayılar doldurulmuş. */
export function scenarioGoalText(def: ScenarioDef): string {
  return fillTemplate(def.goalText, {
    days: def.days,
    target: def.goal.kind === 'netWorth' ? formatMoney(def.goal.target) : '',
  });
}

/** Skorun okunur hâli: "212 gün" ya da "×1,34". */
export function scenarioScoreText(def: ScenarioDef, score: number): string {
  return def.stars.metric === 'days' ? tc('core.scenario.scoreDays', { days: score }) : tc('core.scenario.scoreLead', { ratio: formatDecimal(score, 2) });
}

export interface ScenarioProgress {
  /** 0..1: net değer hedefinde hedefe oran; öndelik hedefinde geçen süre. */
  progress: number;
  /** Kısa durum ("4,2 M ₺ / 12 M ₺", "önde ×1,12"). */
  detail: string;
  daysLeft: number;
  /** Öndelik hedefinde şu an önde mi. */
  ahead?: boolean;
}

/** Hedefin bugünkü durumu; arayüz (gündem, hedef paneli) okuyor. */
export function scenarioProgress(state: GameState): ScenarioProgress | null {
  const run = state.scenario;
  const def = scenarioDefOf(state);
  const player = state.companies[state.playerCompanyId];
  if (!run || !def || !player) return null;
  const day = state.time.day;
  const daysLeft = Math.max(0, run.endDay - day);
  if (def.goal.kind === 'netWorth') {
    return {
      progress: Math.max(0, Math.min(1, player.netWorth / def.goal.target)),
      detail: tc('core.scenario.progressMoney', { value: formatMoney(Math.max(0, player.netWorth)), target: formatMoney(def.goal.target) }),
      daysLeft,
    };
  }
  const lead = leadRatio(state);
  const span = Math.max(1, run.endDay - run.startDay);
  return {
    progress: Math.max(0, Math.min(1, (day - run.startDay) / span)),
    detail: lead > 1 ? tc('core.scenario.progressAhead', { ratio: formatDecimal(Math.min(lead, 9.99), 2) }) : tc('core.scenario.progressBehind', { percent: Math.round(lead * 100) }),
    daysLeft,
    ahead: lead > 1,
  };
}

function finish(state: GameState, run: ScenarioState, def: ScenarioDef, won: boolean, score: number): void {
  run.finishedDay = state.time.day;
  run.outcome = won ? 'won' : 'lost';
  run.score = Math.round(score * 1000) / 1000;
  run.stars = won ? starsFor(def, run.score) : 0;
  state.time.speed = 0;
  pushNews(
    state,
    won ? 'good' : 'bad',
    won ? tc('core.scenario.wonTitle', { title: def.title, stars: run.stars }) : tc('core.scenario.lostTitle', { title: def.title }),
    won
      ? tc('core.scenario.wonBody', { score: scenarioScoreText(def, run.score) })
      : state.gameOver
        ? tc('core.scenario.lostTakeover')
        : tc('core.scenario.lostTime'),
  );
}

/**
 * Günlük senaryo adımı, günün sonunda (net değer ve devralma kesinleşmiş).
 * Devralınan oyuncu kaybediyor; hedefe ulaşan ya da süresi dolan koşu
 * bitiyor ve oyun duraklıyor. Sonra şehir serbest oyuna açık.
 */
export function runScenarioTick(state: GameState): void {
  const run = state.scenario;
  if (!run || run.finishedDay !== undefined) return;
  const def = SCENARIO_BY_ID[run.id];
  const player = state.companies[state.playerCompanyId];
  if (!def || !player) return;
  const day = state.time.day;

  if (state.gameOver) {
    finish(state, run, def, false, 0);
    return;
  }

  if (def.goal.kind === 'netWorth') {
    if (player.netWorth >= def.goal.target) finish(state, run, def, true, day - run.startDay);
    else if (day >= run.endDay) finish(state, run, def, false, player.netWorth / def.goal.target);
    return;
  }

  if (day < run.endDay) return;
  const lead = leadRatio(state);
  finish(state, run, def, lead > 1, lead);
}
