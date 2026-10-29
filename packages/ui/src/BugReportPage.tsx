import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { currentLocale, formatDecimal } from '@capital/content';
import { currentAppearance, useAppearanceChoice } from './appearance';
import { MAILTO_NOTE_LIMIT, NOTE_LIMIT, SUPPORT_EMAIL, buildReport, reportFilename, reportMailto } from './bugReport';
import type { ReportInput } from './bugReport';
import { logLines } from './errorLog';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { rt } from './releaseMessages';
import type { ReleaseMessageKey } from './releaseMessages';
import { reportHost } from './reportHost';
import { useSettings } from './settings';
import type { ExportOutcome } from './useGame';
import { APP_VERSION, useAppEdition } from './version';
import type { Edition } from './version';

const EDITION_LABELS: Record<Edition, MessageKey> = {
  web: 'panels.settings.version.web',
  desktop: 'panels.settings.version.desktop',
  steam: 'panels.settings.version.steam',
};

const OUTCOME_TEXT: Record<ExportOutcome, ReleaseMessageKey> = {
  saved: 'panels.release.report.saved',
  downloads: 'panels.release.report.downloads',
  started: 'panels.release.report.started',
  copied: 'panels.release.report.copied',
  declined: 'panels.release.report.declined',
  blocked: 'panels.release.report.blocked',
};

interface Notice {
  tone: 'good' | 'bad' | 'info';
  text: string;
}

/** Ekran kartının adı (WebGL); bağlam açılamazsa yok. Rapor açılınca bir kez. */
function gpuName(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' && name ? name : null;
  } catch {
    return null;
  }
}

/** Tarayıcının ve ekranın ölçüleri; sunucuda çizilirken (testler) sıfır. */
function device(): Pick<ReportInput, 'userAgent' | 'screen' | 'viewport'> {
  const view = typeof window === 'undefined' ? undefined : window;
  return {
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    screen: { width: view?.screen?.width ?? 0, height: view?.screen?.height ?? 0, pixelRatio: view?.devicePixelRatio ?? 1 },
    viewport: { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
  };
}

/** "412,5 KB" */
function sizeText(text: string): string {
  return `${formatDecimal(new TextEncoder().encode(text).length / 1024, 1)} KB`;
}

/**
 * Hata bildirme (Tur 74): Ayarlar'dan açılan sayfa. Oyuncu ne olduğunu
 * yazıyor, kaydı ve uyarı günlüğünü ekleyip eklemeyeceğini seçiyor,
 * raporun içini görüyor, dosyayı kaydediyor ve destek adresine kendisi
 * gönderiyor. Sayfa hiçbir yere bağlanmıyor. Raporun biçimi `bugReport.ts`'te,
 * dosyayı kaydetmek ve kaydı okumak kabuğun işi (`reportHost.ts`).
 */
export default function BugReportPage(): ReactElement {
  const settings = useSettings();
  const appearanceChoice = useAppearanceChoice();
  const host = reportHost();
  const edition = useAppEdition();
  const gpu = useMemo(gpuName, []);
  const [lines] = useState(() => [...logLines()]);
  const [note, setNote] = useState('');
  const [withSave, setWithSave] = useState(true);
  const [withLog, setWithLog] = useState(true);
  /** undefined: kayıt okunuyor; null: kayıt yok. */
  const [save, setSave] = useState<string | null | undefined>(host ? undefined : null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!host) return;
    let live = true;
    host
      .save()
      .catch((error: unknown) => {
        console.warn('Hata raporu için kayıt okunamadı:', error);
        return null;
      })
      .then((text) => {
        if (live) setSave(text);
      });
    return () => {
      live = false;
    };
  }, [host]);

  const input = (createdAt: Date, includeSave: boolean): ReportInput => ({
    version: APP_VERSION,
    edition,
    locale: currentLocale(),
    createdAt,
    ...device(),
    gpu,
    settings: { ...settings, appearance: appearanceChoice, appearanceNow: currentAppearance() },
    note,
    log: withLog ? lines : null,
    save: includeSave && withSave ? (save ?? null) : null,
  });

  // Ön izleme kaydın kendisini göstermiyor, yerine boyunu yazıyor. Kayıtsız rapor küçük: her çizimde yeniden.
  const draft = buildReport(input(new Date(), false));
  const preview =
    withSave && save ? draft.replace(/"save": null\n\}$/, `"save": ${JSON.stringify(rt('panels.release.report.previewSave', { size: sizeText(save) }))}\n}`) : draft;

  const download = async () => {
    if (!host || busy) return;
    setBusy(true);
    setNotice({ tone: 'info', text: rt('panels.release.report.preparing') });
    const createdAt = new Date();
    const filename = reportFilename(createdAt);
    try {
      const outcome = await host.deliver(filename, buildReport(input(createdAt, true)));
      setNotice({
        tone: outcome === 'blocked' ? 'bad' : outcome === 'declined' ? 'info' : 'good',
        text: rt(OUTCOME_TEXT[outcome], { filename }),
      });
    } catch (error) {
      console.warn('Hata raporu kaydedilemedi:', error);
      setNotice({ tone: 'bad', text: rt('panels.release.report.blocked') });
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setNotice({ tone: 'good', text: rt('panels.release.report.addressCopied', { email: SUPPORT_EMAIL }) });
    } catch {
      setNotice({ tone: 'info', text: rt('panels.release.report.addressFailed', { email: SUPPORT_EMAIL }) });
    }
  };

  const editionText = t(EDITION_LABELS[edition]);
  const mailto = reportMailto(
    rt('panels.release.report.emailSubject', { version: APP_VERSION, edition: editionText }),
    rt('panels.release.report.emailBody', { version: APP_VERSION, edition: editionText, note: note.trim().slice(0, MAILTO_NOTE_LIMIT) }),
  );

  return (
    <section className="bug-report" data-bug-report aria-labelledby="bug-report-title">
      <h3 id="bug-report-title">{rt('panels.release.report.title')}</h3>
      <p>{rt('panels.release.report.lead', { email: SUPPORT_EMAIL })}</p>
      <label className="bug-report-note">
        <span>{rt('panels.release.report.note')}</span>
        <textarea
          data-report-note
          rows={5}
          maxLength={NOTE_LIMIT}
          value={note}
          placeholder={rt('panels.release.report.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <label className="settings-check">
        <input type="checkbox" data-report-save checked={withSave && Boolean(save)} disabled={!save} onChange={(event) => setWithSave(event.target.checked)} />
        {rt('panels.release.report.save')}
      </label>
      <p className="muted" data-report-save-state={save === undefined ? 'loading' : save ? 'ready' : 'none'}>
        {save === null ? rt('panels.release.report.saveNone') : rt('panels.release.report.saveHint')}
      </p>
      {lines.length > 0 ? (
        <label className="settings-check">
          <input type="checkbox" data-report-log checked={withLog} onChange={(event) => setWithLog(event.target.checked)} />
          {rt('panels.release.report.log', { count: lines.length })}
        </label>
      ) : (
        <p className="muted" data-report-log-empty>
          {rt('panels.release.report.logEmpty')}
        </p>
      )}
      <details className="bug-report-preview" data-report-preview>
        <summary>{rt('panels.release.report.preview')}</summary>
        <pre>{preview}</pre>
      </details>
      <div className="settings-choices">
        <button type="button" className="primary" data-report-download disabled={!host || busy || save === undefined} onClick={() => void download()}>
          {rt('panels.release.report.download')}
        </button>
        {/* Masaüstü penceresi e-posta bağlantısını açamıyor: orada adres kopyalanıyor. */}
        {edition === 'web' && (
          <a className="link-button" data-report-email href={mailto}>
            {rt('panels.release.report.email')}
          </a>
        )}
        <button type="button" data-report-copy-address onClick={() => void copyAddress()}>
          {rt('panels.release.report.copyAddress')}
        </button>
      </div>
      {notice && (
        <p className={`bug-report-notice ${notice.tone}`} data-report-notice role="status">
          {notice.text}
        </p>
      )}
    </section>
  );
}
