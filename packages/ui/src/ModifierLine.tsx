import type { ReactElement } from 'react';
import { formatDecimal, modifierMultiplier, normalizeModifiers, ruleName } from '@capital/content';
import type { ModifierId, ScenarioDef } from '@capital/content';
import { t } from './i18n';

/**
 * Koşunun ek kuralları ve zorluk çarpanı (Tur 45); kural yoksa satır yok.
 * Senaryonun kuralı (Tur 60) çarpana girmiyor: yıldızları kuralla ölçüldü.
 * Paketten gelen senaryonun kendi adlı kuralı (Tur 67) kendi adıyla.
 */
export function ModifierLine({
  modifiers,
  scenario = false,
  def = null,
}: {
  modifiers: readonly ModifierId[] | undefined;
  scenario?: boolean;
  def?: ScenarioDef | null;
}): ReactElement | null {
  const ids = normalizeModifiers(modifiers);
  if (ids.length === 0) return null;
  const list = ids.map((id) => ruleName(def, id)).join(' · ');
  return (
    <p className="muted modifier-line" data-modifier-line={ids.join(' ')}>
      {scenario ? t('hud.modifiers.scenarioLine', { list }) : t('hud.modifiers.line', { list, value: formatDecimal(modifierMultiplier(ids), 2) })}
    </p>
  );
}
