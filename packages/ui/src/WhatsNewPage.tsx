import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { currentLocale, numberLocale } from '@capital/content';
import { CHANGELOG, changelogNotes } from './changelog';
import { rt } from './releaseMessages';
import { APP_VERSION } from './version';
import { markWhatsNewSeen } from './whatsNew';

/** "2026-10-29" → oyuncunun dilinde gün; saat dilimi kaydırmasın diye UTC. */
function releaseDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return date;
  return day.toLocaleDateString(numberLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Yenilikler (Tur 74): Ayarlar'dan açılan sayfa, değişiklik günlüğü en
 * yeni sürüm başta. Açılınca yeni sürüm işareti kalkıyor. Geç inen parça:
 * günlük de metinleri de yalnız sayfa açılınca iniyor.
 */
export default function WhatsNewPage(): ReactElement {
  useEffect(() => markWhatsNewSeen(), []);
  const locale = currentLocale();
  return (
    <section className="whats-new" data-whats-new aria-labelledby="whats-new-title">
      <h3 id="whats-new-title">{rt('panels.release.whatsNew.title')}</h3>
      {CHANGELOG.map((entry) => (
        <article key={entry.version} className="whats-new-entry" data-release={entry.version}>
          <h4>
            {rt('panels.release.whatsNew.entry', { version: entry.version })}
            <span className="muted"> · {releaseDay(entry.date)}</span>
            {entry.version === APP_VERSION && <span className="whats-new-current">{rt('panels.release.whatsNew.current')}</span>}
          </h4>
          <ul>
            {changelogNotes(entry, locale).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
