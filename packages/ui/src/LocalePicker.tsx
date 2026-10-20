import type { ReactElement } from 'react';
import { availableLocales } from '@capital/content';
import { LOCALE_NAMES, chooseLocale, useLocale } from './i18n/locale';

/**
 * Dil seçici (Tur 23). Dil adları kendi dillerinde yazıyor ("English",
 * "Türkçe"): dili bilmeyen biri de kendi dilini bulabilmeli.
 */
export function LocalePicker(): ReactElement {
  const locale = useLocale();
  return (
    <div className="locale-picker" role="group" aria-label="Dil · Language">
      {availableLocales().map((id) => (
        <button
          key={id}
          type="button"
          lang={id}
          className={id === locale ? 'locale-option selected' : 'locale-option'}
          aria-pressed={id === locale}
          data-locale={id}
          onClick={() => void chooseLocale(id)}
        >
          {LOCALE_NAMES[id] ?? id}
        </button>
      ))}
    </div>
  );
}
