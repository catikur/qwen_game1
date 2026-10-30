import type { ReactElement, ReactNode } from 'react';
import { getCitySize, getCityType, getDifficulty, ruleBlurb, ruleName } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { formatMoney, scenarioGoalText } from '@capital/core';
import { t } from './i18n';
import { starThresholds } from './stars';

/**
 * Kurulumun sayılarla özeti: şehir, zorluk, başlangıç günü, süre, kasa.
 * İkinci şehirle başlayan senaryoda oyuncu yeni şehrin ilk gününde,
 * sermayeyle; kurucu şehrin günü ve kasası ayrı.
 */
function scenarioSetupLine(def: ScenarioDef): string {
  const second = def.setup.secondCity;
  if (second) {
    return t('hud.scenario.setupLineHolding', {
      size: getCitySize(second.citySize).name,
      difficulty: getDifficulty(def.difficulty).name,
      days: def.days,
      capital: formatMoney(second.capital),
      day: def.preludeDays,
      cash: formatMoney(def.setup.cash),
    });
  }
  return t('hud.scenario.setupLine', {
    size: getCitySize(def.citySize).name,
    difficulty: getDifficulty(def.difficulty).name,
    day: def.preludeDays,
    days: def.days,
    cash: formatMoney(def.setup.cash),
  });
}

/**
 * Şehirlerin türü (Tur 79): ticaret senaryosunun farkı türlerden. Türsüz
 * senaryoda (dengeli) satır yok.
 */
function scenarioTypesLine(def: ScenarioDef): string | null {
  const second = def.setup.secondCity;
  if (second && (def.cityType || second.cityType)) {
    return t('hud.scenario.cityTypes', { from: getCityType(def.cityType).name, to: getCityType(second.cityType).name });
  }
  return def.cityType ? t('hud.scenario.cityType', { type: getCityType(def.cityType).name }) : null;
}

/** Paketten gelen senaryonun künyesi: paket, yazarı, kariyere sayılmadığı. */
function scenarioSourceLine(def: ScenarioDef): string | null {
  const source = def.source;
  if (!source) return null;
  return source.author ? t('hud.scenario.packSourceAuthor', { pack: source.packName, author: source.author }) : t('hud.scenario.packSource', { pack: source.packName });
}

/**
 * Seçili senaryonun ayrıntısı: kurulum ekranında ve editörün ön izlemesinde
 * (Tur 68) aynı. Paketten gelende künyenin altında raf düğmeleri (`children`).
 */
export function ScenarioDetail({ def, children }: { def: ScenarioDef; children?: ReactNode }): ReactElement {
  return (
    <div className="difficulty-detail scenario-detail">
      <p>{def.brief}</p>
      <p className="scenario-goal">
        <span className="tag good">{t('hud.scenario.goal')}</span> {scenarioGoalText(def)}
      </p>
      <ul>
        {def.facts.map((fact, index) => (
          <li key={`${index}:${fact}`}>{fact}</li>
        ))}
      </ul>
      {def.modifiers && def.modifiers.length > 0 && (
        <p className="scenario-rules" data-scenario-rules-detail>
          <span className="tag warn">{t('hud.scenario.rules')}</span>{' '}
          {def.modifiers.map((id) => `${ruleName(def, id)}: ${ruleBlurb(def, id)}`).join(' ')}
        </p>
      )}
      <p className="muted scenario-setup">{scenarioSetupLine(def)}</p>
      {scenarioTypesLine(def) && (
        <p className="muted scenario-types" data-scenario-types>
          {scenarioTypesLine(def)}
        </p>
      )}
      <p className="muted scenario-stars">{starThresholds(def)}</p>
      {def.source && (
        <>
          <p className="muted scenario-source" data-scenario-source={def.source.packId}>
            {scenarioSourceLine(def)}
          </p>
          {children}
        </>
      )}
    </div>
  );
}
