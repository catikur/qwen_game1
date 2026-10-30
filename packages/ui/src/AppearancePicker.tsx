import type { ReactElement } from 'react';
import { APPEARANCE_CHOICES, chooseAppearance, useAppearanceChoice } from './appearance';
import { t, type MessageKey } from './i18n';

const LABELS: Record<(typeof APPEARANCE_CHOICES)[number], MessageKey> = {
  auto: 'panels.appearance.auto',
  day: 'panels.appearance.day',
  night: 'panels.appearance.night',
};

/** Görünüm seçici (Tur 35): Otomatik, Gündüz, Gece. */
export function AppearancePicker(): ReactElement {
  const choice = useAppearanceChoice();
  return (
    <div className="appearance-picker" role="group" aria-label={t('panels.appearance')}>
      {APPEARANCE_CHOICES.map((id) => (
        <button
          key={id}
          type="button"
          className={id === choice ? 'appearance-option selected' : 'appearance-option'}
          aria-pressed={id === choice}
          data-appearance-choice={id}
          title={id === 'auto' ? t('panels.appearance.hint') : undefined}
          onClick={() => chooseAppearance(id)}
        >
          {t(LABELS[id])}
        </button>
      ))}
    </div>
  );
}
