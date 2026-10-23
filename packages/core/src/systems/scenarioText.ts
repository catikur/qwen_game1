import { fillTemplate, formatDecimal, formatNumber } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { tc } from '../i18n';
import { formatMoney } from '../format';

/*
 * Senaryonun yıldızı ve okunur metinleri (Tur 46'da `scenario.ts`'ten
 * ayrıldı): kurulum ekranı hedefi ve en iyi skoru yazıyor, senaryonun
 * işleyişi oyun parçasında.
 */

/** Bir skorun yıldızı (hedefe ulaşılmışsa en az bir). */
export function starsFor(def: ScenarioDef, score: number): number {
  const { metric, two, three } = def.stars;
  if (metric === 'days') return score <= three ? 3 : score <= two ? 2 : 1;
  return score >= three ? 3 : score >= two ? 2 : 1;
}

/** Hedef cümlesi, sayılar doldurulmuş. */
export function scenarioGoalText(def: ScenarioDef): string {
  const goal = def.goal;
  return fillTemplate(def.goalText, {
    days: def.days,
    target: goal.kind === 'netWorth' || goal.kind === 'power' ? formatMoney(goal.target) : '',
    share: goal.kind === 'chain' ? Math.round(goal.share * 100) : '',
    rivals: goal.kind === 'freight' ? goal.rivals : '',
    outlets: goal.kind === 'freight' ? goal.outlets : '',
    units: goal.kind === 'rental' ? formatNumber(goal.units) : '',
    renewals: goal.kind === 'rental' ? goal.renewals : '',
  });
}

/**
 * Aşağı yuvarlama, kayan noktanın ×1,29'u ×1,2899… diye okumasına karşı
 * küçük bir payla. Öndelik hiçbir yerde yukarı yuvarlanmıyor: eşiğin
 * altındaki skor eşikte görünmesin.
 */
export function floorTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.floor(value * scale + 1e-6) / scale;
}

/** Skorun okunur hâli: "212 gün" ya da "×1,34". */
export function scenarioScoreText(def: ScenarioDef, score: number): string {
  return def.stars.metric === 'days'
    ? tc('core.scenario.scoreDays', { days: score })
    : tc('core.scenario.scoreLead', { ratio: formatDecimal(floorTo(score, 2), 2) });
}
