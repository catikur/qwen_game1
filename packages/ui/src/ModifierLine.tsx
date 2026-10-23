import type { ReactElement } from 'react';
import { MODIFIER_BY_ID, formatDecimal, modifierMultiplier, normalizeModifiers } from '@capital/content';
import type { ModifierId } from '@capital/content';
import { t } from './i18n';

/**
 * Koşunun ek kuralları ve zorluk çarpanı (Tur 45); kural yoksa satır yok.
 * Senaryonun kuralı (Tur 60) çarpana girmiyor: yıldızları kuralla ölçüldü.
 */
export function ModifierLine({ modifiers, scenario = false }: { modifiers: readonly ModifierId[] | undefined; scenario?: boolean }): ReactElement | null {
  const ids = normalizeModifiers(modifiers);
  if (ids.length === 0) return null;
  const list = ids.map((id) => MODIFIER_BY_ID[id].name).join(' · ');
  return (
    <p className="muted modifier-line" data-modifier-line={ids.join(' ')}>
      {scenario ? t('hud.modifiers.scenarioLine', { list }) : t('hud.modifiers.line', { list, value: formatDecimal(modifierMultiplier(ids), 2) })}
    </p>
  );
}
