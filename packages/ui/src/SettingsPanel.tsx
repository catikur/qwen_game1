import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { AppearancePicker } from './AppearancePicker';
import { installApp, useAppShell } from './appShell';
import type { AppShellState } from './appShell';
import { LocalePicker } from './LocalePicker';
import { t, type MessageKey } from './i18n';
import { usePadGlyphs } from './padInUse';
import {
  MOTION_CHOICES,
  PALETTES,
  TEXT_SCALE,
  TEXT_SIZES,
  VOLUME_CHANNELS,
  updateSettings,
  useSettings,
} from './settings';
import type { MotionChoice, Palette, TextSize, VolumeChannel } from './settings';
import { APP_VERSION, appEdition } from './version';
import type { Edition } from './version';
import { useWhatsNewUnseen } from './whatsNew';

const TEXT_LABELS: Record<TextSize, MessageKey> = {
  small: 'panels.settings.text.small',
  normal: 'panels.settings.text.normal',
  large: 'panels.settings.text.large',
  xlarge: 'panels.settings.text.xlarge',
};
const PALETTE_LABELS: Record<Palette, MessageKey> = {
  standard: 'panels.settings.palette.standard',
  safe: 'panels.settings.palette.safe',
};
const MOTION_LABELS: Record<MotionChoice, MessageKey> = {
  auto: 'panels.settings.motion.auto',
  reduced: 'panels.settings.motion.reduced',
  full: 'panels.settings.motion.full',
};
const VOLUME_LABELS: Record<VolumeChannel, MessageKey> = {
  master: 'panels.settings.volume.master',
  music: 'panels.settings.volume.music',
  ambience: 'panels.settings.volume.ambience',
  effects: 'panels.settings.volume.effects',
};
/** Kısayollar: tuş ve ne yaptığı. Tuş adları da sözlükte (İngilizcede "Space"). */
const SHORTCUTS: Array<[MessageKey, MessageKey]> = [
  ['panels.settings.keys.pan.key', 'panels.settings.keys.pan'],
  ['panels.settings.keys.select.key', 'panels.settings.keys.select'],
  ['panels.settings.keys.drag.key', 'panels.settings.keys.drag'],
  ['panels.settings.keys.rotate.key', 'panels.settings.keys.rotate'],
  ['panels.settings.keys.zoom.key', 'panels.settings.keys.zoom'],
  ['panels.settings.keys.pause.key', 'panels.settings.keys.pause'],
  ['panels.settings.keys.speed.key', 'panels.settings.keys.speed'],
  ['panels.settings.keys.close.key', 'panels.settings.keys.close'],
  ['panels.settings.keys.tab.key', 'panels.settings.keys.tab'],
];
/** Yalnız masaüstü sürümünde (Tur 71): kabuk kökü `data-shell="desktop"` diye işaretliyor. */
const DESKTOP_SHORTCUTS: Array<[MessageKey, MessageKey]> = [['panels.settings.keys.fullscreen.key', 'panels.settings.keys.fullscreen']];

/**
 * Kumandanın düğmeleri (Tur 72): ayrı parça, kumanda kullanılınca iniyor
 * (`usePadGlyphs`; kumanda modülü haber veriyor). Listenin yazıları da
 * onunla (`padMessages.ts`); giriş paketine girmiyorlar.
 */
const PadControls = lazy(() => import('./PadControls'));

/*
 * Sürüm (Tur 74): "Yenilikler" ve "Hata bildir" Ayarlar'ın içinde açılan
 * sayfalar, ikisi de geç inen parça; metinleri de onlarla (`releaseMessages.ts`).
 */
const WhatsNewPage = lazy(() => import('./WhatsNewPage'));
const BugReportPage = lazy(() => import('./BugReportPage'));
type SettingsPage = 'main' | 'whatsNew' | 'report';

const EDITION_LABELS: Record<Edition, MessageKey> = {
  web: 'panels.settings.version.web',
  desktop: 'panels.settings.version.desktop',
  steam: 'panels.settings.version.steam',
};

function Choices<T extends string>({
  name,
  options,
  value,
  labels,
  onPick,
}: {
  name: string;
  options: readonly T[];
  value: T;
  labels: Record<T, MessageKey>;
  onPick: (next: T) => void;
}): ReactElement {
  return (
    <div className="settings-choices" role="group" aria-labelledby={`settings-${name}`}>
      {options.map((id) => (
        <button
          key={id}
          type="button"
          className={id === value ? 'settings-option selected' : 'settings-option'}
          aria-pressed={id === value}
          data-setting={name}
          data-choice={id}
          onClick={() => onPick(id)}
        >
          {t(labels[id])}
        </button>
      ))}
    </div>
  );
}

/**
 * Uygulama (Tur 48): cihaza kurma ve çevrimdışı hazırlık. Hizmet çalışanı
 * olmayan sayfada (tek dosyalık sayfa, geliştirme sunucusu) bölüm yok.
 */
function AppSection({ shell }: { shell: AppShellState }): ReactElement {
  let install: ReactElement;
  if (shell.installed) install = <p>{t('panels.settings.app.installed')}</p>;
  else if (shell.installable) {
    install = (
      <>
        <button type="button" data-install-app onClick={() => void installApp()}>
          {t('panels.settings.app.install')}
        </button>
        <p className="muted">{t('panels.settings.app.install.hint')}</p>
      </>
    );
  } else install = <p className="muted">{t(shell.platform === 'ios' ? 'panels.settings.app.ios' : 'panels.settings.app.browser')}</p>;
  return (
    <section className="settings-group settings-app" data-settings-app>
      <h3 id="settings-app">{t('panels.settings.app')}</h3>
      {install}
      <p data-offline-ready={shell.offlineReady}>
        {t(shell.offlineReady ? 'panels.settings.app.offline.ready' : 'panels.settings.app.offline.pending')}
      </p>
    </section>
  );
}

/**
 * Ayarlar (Tur 47): dil, görünüm, metin boyutu, renkler, hareket, ses,
 * uygulama (Tur 48) ve kısayollar tek yerde. Oyun bağlamına ihtiyacı yok;
 * kurulum ekranında da açılıyor (ses düzeyleri depoda, ses manzarası oyun
 * başlayınca okuyor).
 */
export function SettingsPanel(): ReactElement {
  const settings = useSettings();
  const shell = useAppShell();
  const padGlyphs = usePadGlyphs();
  const unseen = useWhatsNewUnseen();
  const [page, setPage] = useState<SettingsPage>('main');
  // Sayfa açılınca odak geri düğmesinde, dönünce sayfayı açan düğmede (klavye ve kumanda).
  const opener = useRef<SettingsPage>('main');
  const back = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (page !== 'main') back.current?.focus();
    else if (opener.current !== 'main') main.current?.querySelector<HTMLElement>(`[data-settings-page-open="${opener.current}"]`)?.focus();
  }, [page]);
  const open = (next: SettingsPage) => {
    opener.current = next;
    setPage(next);
  };
  if (page !== 'main') {
    return (
      <div className="settings settings-page" data-settings data-settings-page={page}>
        <button type="button" ref={back} className="settings-back" data-settings-back onClick={() => setPage('main')}>
          {t('panels.settings.version.back')}
        </button>
        <Suspense fallback={<p className="muted">…</p>}>{page === 'whatsNew' ? <WhatsNewPage /> : <BugReportPage />}</Suspense>
      </div>
    );
  }
  return (
    <div className="settings" data-settings ref={main}>
      {unseen && (
        <p className="settings-new" data-whats-new-banner role="status">
          <span>{t('panels.settings.version.new', { version: APP_VERSION })}</span>
          <button type="button" className="primary" data-settings-page-open="whatsNew" onClick={() => open('whatsNew')}>
            {t('panels.settings.version.whatsNew')}
          </button>
        </p>
      )}
      <section className="settings-group">
        <h3 id="settings-language">{t('panels.settings.language')}</h3>
        <LocalePicker />
      </section>
      <section className="settings-group">
        <h3 id="settings-appearance">{t('panels.settings.appearance')}</h3>
        <AppearancePicker />
      </section>
      <section className="settings-group">
        <h3 id="settings-text">{t('panels.settings.text')}</h3>
        <Choices name="text" options={TEXT_SIZES} value={settings.textSize} labels={TEXT_LABELS} onPick={(textSize) => updateSettings({ textSize })} />
        <p className="muted">{t('panels.settings.text.hint', { percent: Math.round(TEXT_SCALE[settings.textSize] * 100) })}</p>
      </section>
      <section className="settings-group">
        <h3 id="settings-palette">{t('panels.settings.palette')}</h3>
        <Choices name="palette" options={PALETTES} value={settings.palette} labels={PALETTE_LABELS} onPick={(palette) => updateSettings({ palette })} />
        <p className="muted">{t('panels.settings.palette.hint')}</p>
        <p className="settings-swatches" aria-hidden="true">
          <span className="settings-swatch good">{t('panels.settings.palette.good')}</span>
          <span className="settings-swatch bad">{t('panels.settings.palette.bad')}</span>
          <span className="settings-swatch warn">{t('panels.settings.palette.warn')}</span>
        </p>
      </section>
      <section className="settings-group">
        <h3 id="settings-motion">{t('panels.settings.motion')}</h3>
        <Choices name="motion" options={MOTION_CHOICES} value={settings.motion} labels={MOTION_LABELS} onPick={(motion) => updateSettings({ motion })} />
        <p className="muted">{t('panels.settings.motion.hint')}</p>
        <label className="settings-check">
          <input type="checkbox" checked={settings.weather} data-settings-weather onChange={(e) => updateSettings({ weather: e.target.checked })} />
          {t('panels.settings.weather')}
        </label>
        <p className="muted">{t('panels.settings.weather.hint')}</p>
        <label className="settings-check">
          <input type="checkbox" checked={settings.moneyTags} data-settings-money-tags onChange={(e) => updateSettings({ moneyTags: e.target.checked })} />
          {t('panels.settings.moneyTags')}
        </label>
        <p className="muted">{t('panels.settings.moneyTags.hint')}</p>
      </section>
      <section className="settings-group">
        <h3 id="settings-sound">{t('panels.settings.sound')}</h3>
        <label className="settings-check">
          <input type="checkbox" checked={!settings.muted} data-settings-sound onChange={(e) => updateSettings({ muted: !e.target.checked })} />
          {t('panels.settings.sound.on')}
        </label>
        {VOLUME_CHANNELS.map((channel) => {
          const percent = Math.round(settings.volume[channel] * 100);
          return (
            <label key={channel} className="settings-volume">
              <span>{t(VOLUME_LABELS[channel])}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                disabled={settings.muted}
                data-volume={channel}
                aria-valuetext={`${percent}%`}
                onChange={(e) => updateSettings({ volume: { [channel]: Number(e.target.value) / 100 } })}
              />
              <output>{t('panels.settings.volume.value', { percent })}</output>
            </label>
          );
        })}
      </section>
      {shell.supported && <AppSection shell={shell} />}
      <section className="settings-group">
        <h3 id="settings-keys">{t('panels.settings.keys')}</h3>
        <dl className="settings-keys">
          {[...SHORTCUTS, ...(appEdition() !== 'web' ? DESKTOP_SHORTCUTS : [])].map(([key, what]) => (
            <div key={what}>
              <dt>
                <kbd>{t(key)}</kbd>
              </dt>
              <dd>{t(what)}</dd>
            </div>
          ))}
        </dl>
      </section>
      {padGlyphs !== null && (
        <Suspense fallback={null}>
          <PadControls glyphs={padGlyphs} />
        </Suspense>
      )}
      <section className="settings-group" data-settings-version>
        <h3 id="settings-version">{t('panels.settings.version')}</h3>
        <p data-app-version={APP_VERSION}>{t('panels.settings.version.line', { version: APP_VERSION, edition: t(EDITION_LABELS[appEdition()]) })}</p>
        <div className="settings-choices">
          <button type="button" className="settings-option" data-settings-page-open="whatsNew" onClick={() => open('whatsNew')}>
            {t('panels.settings.version.whatsNew')}
            {unseen && <span className="whats-new-dot" aria-hidden="true" />}
          </button>
          <button type="button" className="settings-option" data-settings-page-open="report" onClick={() => open('report')}>
            {t('panels.settings.version.report')}
          </button>
        </div>
      </section>
    </div>
  );
}
