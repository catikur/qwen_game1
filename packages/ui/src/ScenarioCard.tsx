import type { ReactElement } from 'react';
import { ruleName } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { scenarioScoreText } from '@capital/core';
import { t } from './i18n';
import { scenarioRecord } from './scenarioBest';
import { starRow } from './stars';

/** Listede senaryonun cihazdaki durumu. */
function scenarioStatus(def: ScenarioDef): string {
  const record = scenarioRecord(def.id, def);
  if (record.best) return `${starRow(record.best.stars)} · ${scenarioScoreText(def, record.best.score)}`;
  if (record.attempts > 0) return t('hud.scenario.statusTried', { count: record.attempts });
  return t('hud.scenario.statusNew');
}

/**
 * Kurulum ekranındaki senaryo kartı (Tur 67'de `NewGame.tsx`'ten ayrıldı):
 * paketten gelen senaryoların rafı da aynı kartı kullanıyor.
 */
export function ScenarioCard({ def, selected, onSelect, note }: { def: ScenarioDef; selected: boolean; onSelect: (id: string) => void; note?: string }): ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`scenario-card${selected ? ' selected' : ''}`}
      data-scenario={def.id}
      onClick={() => onSelect(def.id)}
    >
      <span className="scenario-card-title">{def.title}</span>
      <span className="scenario-card-tagline">{def.tagline}</span>
      {note && <span className="scenario-card-source">{note}</span>}
      {def.modifiers && def.modifiers.length > 0 && (
        <span className="scenario-card-rules" data-scenario-rules={def.modifiers.join(',')}>
          {def.modifiers.map((id) => ruleName(def, id)).join(' · ')}
        </span>
      )}
      <span className="scenario-card-status" data-scenario-status>
        {scenarioStatus(def)}
      </span>
    </button>
  );
}
