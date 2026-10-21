import { useState } from 'react';
import type { ReactElement } from 'react';
import { applyUpdate, setAppShell, useAppShell } from './appShell';
import { t } from './i18n';
import { useLocale } from './i18n/locale';

/**
 * "Yeni sürüm hazır" (Tur 48). Kurulum ekranında da oyunda da aynı yerde.
 * Yenile: oyun kaydediliyor, yeni sürüm devralıyor, sayfa yeniden açılıyor.
 * Sonra: bildirim bu açılış için kapanıyor; yeni sürüm oyun bir dahaki
 * açılışında kendiliğinden geliyor.
 */
export function UpdateNotice(): ReactElement | null {
  // Uygulamanın kardeşi, onun dil aboneliğini paylaşmıyor.
  useLocale();
  const shell = useAppShell();
  const [busy, setBusy] = useState(false);
  if (!shell.updateReady) return null;
  return (
    <div className="update-notice" role="status" data-update-ready>
      <p>{t('hud.update.ready')}</p>
      <div className="update-notice-actions">
        <button
          type="button"
          className="primary"
          data-update-apply
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void applyUpdate().catch(() => setBusy(false));
          }}
        >
          {busy ? t('hud.update.applying') : t('hud.update.apply')}
        </button>
        <button type="button" className="ghost" data-update-later disabled={busy} onClick={() => setAppShell({ updateReady: false })}>
          {t('hud.update.later')}
        </button>
      </div>
    </div>
  );
}
