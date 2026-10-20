import { formatDecimal } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { t } from './i18n';

/*
 * Senaryonun yıldız gösterimi (Tur 46'da `ScenarioScreens.tsx`'ten ayrıldı):
 * kurulum ekranındaki senaryo kartı da okuyor; senaryo ekranları ise oyunun
 * zincir ve holding modüllerini içe aktarıyor.
 */

/** "★★☆" — yıldızlar okunur metin değil, yanında sayısı yazıyor. */
export function starRow(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
}

/**
 * İki ve üç yıldızın eşikleri, senaryonun ölçüsünde. Öndelik ölçüsünde
 * bir yıldız ya en değerli şirket olmak (hedef o) ya da hedefin kendisi
 * (Şehrin sponsoru: iki sponsorluk; öndelik yalnızca yıldızın ölçüsü).
 */
export function starThresholds(def: ScenarioDef): string {
  const { metric, two, three } = def.stars;
  if (metric === 'days') return t('hud.scenario.thresholdsDays', { two, three });
  const values = { two: formatDecimal(two, 2), three: formatDecimal(three, 2) };
  return def.goal.kind === 'leadAtEnd' ? t('hud.scenario.thresholdsLead', values) : t('hud.scenario.thresholdsLeadGoal', values);
}
