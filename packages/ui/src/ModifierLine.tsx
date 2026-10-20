import type { ReactElement } from 'react';
import { MODIFIER_BY_ID, formatDecimal, modifierMultiplier, normalizeModifiers } from '@capital/content';
import type { ModifierId } from '@capital/content';
import { t } from './i18n';

/** Koşunun ek kuralları ve zorluk çarpanı (Tur 45); kural yoksa satır yok. */
export function ModifierLine({ modifiers }: { modifiers: readonly ModifierId[] | undefined }): ReactElement | null {
  const ids = normalizeModifiers(modifiers);
  if (ids.length === 0) return null;
  return (
    <p className="muted modifier-line" data-modifier-line={ids.join(' ')}>
      {t('hud.modifiers.line', {
        list: ids.map((id) => MODIFIER_BY_ID[id].name).join(' · '),
        value: formatDecimal(modifierMultiplier(ids), 2),
      })}
    </p>
  );
}
