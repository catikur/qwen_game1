import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { setLocale } from '@capital/content';
import { MAILTO_NOTE_LIMIT, NOTE_LIMIT, REPORT_KIND, SUPPORT_EMAIL, buildReport, reportFilename, reportMailto } from '../src/bugReport';
import type { ReportInput } from '../src/bugReport';
import { LOG_LIMIT, LOG_TEXT_LIMIT, installErrorLog, logLines, recordLog } from '../src/errorLog';
import { initWhatsNew, markWhatsNewSeen, whatsNewUnseen } from '../src/whatsNew';
import { releaseEn, releaseTr } from '../src/releaseMessages';
import { releaseDe } from '../src/releaseMessages.de';
import { setReportHost } from '../src/reportHost';
import { SettingsPanel } from '../src/SettingsPanel';
import WhatsNewPage from '../src/WhatsNewPage';
import BugReportPage from '../src/BugReportPage';
import { CHANGELOG } from '../src/changelog';
import { appEdition } from '../src/version';

/**
 * Sürüm 1.0 (Tur 74): hata raporunun biçimi, uyarı günlüğü, yeni sürüm
 * işareti, Ayarlar'ın sürüm bölümü ve iki sayfa. Testte tarayıcı yok:
 * depo sahte, sayfalar sunucuda çiziliyor.
 */
function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    version: '1.0.0',
    edition: 'web',
    locale: 'tr',
    createdAt: new Date(Date.UTC(2026, 9, 29, 13, 30)),
    userAgent: 'Testçi/1.0',
    screen: { width: 1920, height: 1080, pixelRatio: 2 },
    viewport: { width: 1280, height: 860 },
    gpu: null,
    settings: { textSize: 'normal' },
    note: '  Kasa eksiye düştü.  ',
    log: [{ at: 1234.6, level: 'warn', text: 'bir uyarı' }],
    save: JSON.stringify({ meta: { slot: -1 }, state: { day: 12 } }, null, 2),
    ...overrides,
  };
}

/** Bellekte sahte yerel depo. */
function memoryStorage(entries: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, String(value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  };
}

describe('hata raporu', () => {
  test('tek JSON: künye okunaklı, not kırpılmış, günlük yuvarlanmış, kayıt sıkışık ve en sonda', () => {
    const text = buildReport(input());
    const report = JSON.parse(text) as Record<string, unknown>;
    assert.equal(report['kind'], REPORT_KIND);
    assert.deepEqual(report['app'], { version: '1.0.0', edition: 'web' });
    assert.equal(report['createdAt'], '2026-10-29T13:30:00.000Z');
    assert.equal(report['note'], 'Kasa eksiye düştü.');
    assert.deepEqual(report['log'], [{ at: 1235, level: 'warn', text: 'bir uyarı' }]);
    assert.deepEqual(report['save'], { meta: { slot: -1 }, state: { day: 12 } });
    assert.deepEqual(Object.keys(report).at(-1), 'save');
    assert.ok(text.endsWith('"save": {"meta":{"slot":-1},"state":{"day":12}}\n}'), text.slice(-80));
    assert.ok(text.includes('\n  "note": "Kasa eksiye düştü.",\n'), 'künye girintili');
  });

  test('kayıt ve günlük çıkarılabiliyor; bozuk kayıt metin olarak; notun içindeki yer tutucu dokunulmuyor', () => {
    const bare = JSON.parse(buildReport(input({ save: null, log: null }))) as Record<string, unknown>;
    assert.equal(bare['save'], null);
    assert.equal(bare['log'], null);
    assert.equal((JSON.parse(buildReport(input({ save: '{yarım' }))) as Record<string, unknown>)['save'], '{yarım');
    const sly = JSON.parse(buildReport(input({ note: 'şunu yazdım: "__capitalforge_save__"' }))) as Record<string, unknown>;
    assert.equal(sly['note'], 'şunu yazdım: "__capitalforge_save__"');
    assert.deepEqual(sly['save'], { meta: { slot: -1 }, state: { day: 12 } });
    const long = JSON.parse(buildReport(input({ note: 'ş'.repeat(NOTE_LIMIT + 50) }))) as Record<string, unknown>;
    assert.equal((long['note'] as string).length, NOTE_LIMIT);
  });

  test('dosya adı yerel saatle; e-posta bağlantısı destek adresine, konu ve gövde kodlanmış', () => {
    assert.equal(reportFilename(new Date(2026, 9, 29, 9, 5)), 'capitalforge-hata-raporu-2026-10-29-0905.json');
    const link = reportMailto('CapitalForge 1.0.0 (tarayıcı): hata raporu', 'Merhaba,\nşöyle & böyle');
    assert.ok(link.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`), link);
    assert.equal(decodeURIComponent(new URL(link).searchParams.get('body') ?? ''), 'Merhaba,\nşöyle & böyle');
    assert.equal(new URL(link).searchParams.get('subject'), 'CapitalForge 1.0.0 (tarayıcı): hata raporu');
    assert.ok(MAILTO_NOTE_LIMIT < NOTE_LIMIT);
  });
});

describe('uyarı günlüğü', () => {
  test('uzun satır kırpılıyor, en çok son altmış satır kalıyor; hata yığınının başı satırda', () => {
    recordLog('warn', ['x'.repeat(LOG_TEXT_LIMIT + 10)]);
    assert.equal(logLines().at(-1)!.text.length, LOG_TEXT_LIMIT + 1);
    const error = new Error('patladı');
    recordLog('error', ['Yükleme:', error, { kod: 7 }]);
    assert.match(logLines().at(-1)!.text, /^Yükleme: Error: patladı \(.+\) \{"kod":7\}$/);
    for (let i = 0; i < LOG_LIMIT + 5; i++) recordLog('warn', [`satır ${i}`]);
    assert.equal(logLines().length, LOG_LIMIT);
    assert.equal(logLines().at(-1)!.text, `satır ${LOG_LIMIT + 4}`);
  });

  test('konsolun hata ve uyarısı ile yakalanmamış hatalar yazılıyor; asılları yine çağrılıyor; bir kez kuruluyor', () => {
    const printed: string[] = [];
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      console: { error: (...args: unknown[]) => printed.push(`E ${args.join(' ')}`), warn: (...args: unknown[]) => printed.push(`W ${args.join(' ')}`) },
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    };
    installErrorLog(target as unknown as Window & typeof globalThis);
    installErrorLog(target as unknown as Window & typeof globalThis);
    target.console.warn('dikkat', 3);
    target.console.error('olmadı');
    listeners.get('error')!({ error: new TypeError('tanımsız'), message: '', filename: 'http://x/assets/GameRoot-abc.js', lineno: 42 });
    listeners.get('unhandledrejection')!({ reason: 'zaman aşımı' });
    assert.deepEqual(printed, ['W dikkat 3', 'E olmadı']);
    const last = logLines().slice(-4).map((line) => `${line.level} ${line.text}`);
    assert.equal(last[0], 'warn dikkat 3');
    assert.equal(last[1], 'error olmadı');
    assert.match(last[2]!, /^error TypeError: tanımsız .*GameRoot-abc\.js:42$/);
    assert.equal(last[3], 'error unhandledrejection: zaman aşımı');
    assert.equal(listeners.size, 2);
  });
});

describe('yeni sürüm işareti', () => {
  test('yeni oyuncuya yok: ilk açılışta sürüm görülmüş sayılıyor', () => {
    const store = memoryStorage();
    initWhatsNew(store, '1.0.0');
    assert.equal(whatsNewUnseen(), false);
    assert.equal(store.getItem('capitalforge.whatsnew.v1'), '1.0.0');
  });

  test('işaretsiz eski sürümden gelen oyuncuya var; açınca kalkıyor ve bir daha çıkmıyor', () => {
    const store = memoryStorage({ 'capitalforge.settings.v1': '{}' });
    initWhatsNew(store, '1.0.0');
    assert.equal(whatsNewUnseen(), true);
    markWhatsNewSeen();
    assert.equal(whatsNewUnseen(), false);
    initWhatsNew(store, '1.0.0');
    assert.equal(whatsNewUnseen(), false);
  });

  test('görülen sürüm eskiyse var, aynı ya da yeniyse yok; depo hata atarsa yok', () => {
    initWhatsNew(memoryStorage({ 'capitalforge.whatsnew.v1': '0.9.3' }), '1.0.0');
    assert.equal(whatsNewUnseen(), true);
    initWhatsNew(memoryStorage({ 'capitalforge.whatsnew.v1': '1.0.0' }), '1.0.0');
    assert.equal(whatsNewUnseen(), false);
    initWhatsNew(memoryStorage({ 'capitalforge.whatsnew.v1': '1.2.0' }), '1.0.0');
    assert.equal(whatsNewUnseen(), false);
    const broken = { ...memoryStorage(), getItem: () => { throw new Error('izin yok'); } } as Storage;
    initWhatsNew(broken, '1.0.0');
    assert.equal(whatsNewUnseen(), false);
    initWhatsNew(null, '1.0.0');
    assert.equal(whatsNewUnseen(), false);
  });
});

describe('Ayarlar: sürüm', () => {
  afterEach(() => {
    initWhatsNew(null);
    setReportHost(null);
    setLocale('tr');
  });

  test('sürüm bölümü: sürüm ve sürümün türü, "Yenilikler" ve "Hata bildir"; yeni sürümde başta duyuru ve nokta', () => {
    const plain = renderToStaticMarkup(createElement(SettingsPanel));
    assert.match(plain, /data-settings-version/);
    assert.match(plain, /CapitalForge 0\.0\.0 · tarayıcı/);
    assert.match(plain, /data-settings-page-open="whatsNew"[^>]*>Yenilikler</);
    assert.match(plain, /data-settings-page-open="report"[^>]*>Hata bildir</);
    assert.ok(!plain.includes('data-whats-new-banner') && !plain.includes('whats-new-dot'));
    initWhatsNew(memoryStorage({ 'capitalforge.whatsnew.v1': '0.2.0' }), '1.0.0');
    const fresh = renderToStaticMarkup(createElement(SettingsPanel));
    assert.match(fresh, /data-whats-new-banner[^>]*><span>Oyun 0\.0\.0 sürümüne güncellendi\.<\/span>/);
    assert.equal(fresh.match(/whats-new-dot/g)?.length, 1);
  });

  test('sürümün türü kökten: masaüstü, Steam\'le masaüstü', () => {
    assert.equal(appEdition({ dataset: {} }), 'web');
    assert.equal(appEdition({ dataset: { shell: 'desktop' } }), 'desktop');
    assert.equal(appEdition({ dataset: { shell: 'desktop', steam: 'on' } }), 'steam');
    assert.equal(appEdition({ dataset: { steam: 'on' } }), 'web');
    assert.equal(appEdition(undefined), 'web');
  });

  test('Yenilikler: her sürüm başlığıyla, günüyle ve maddeleriyle; İngilizcesi İngilizce', () => {
    const page = renderToStaticMarkup(createElement(WhatsNewPage));
    for (const entry of CHANGELOG) assert.match(page, new RegExp(`data-release="${entry.version.replace(/\./g, '\\.')}"`));
    assert.match(page, /Sürüm 1\.0\.0<span class="muted"> · 29 Ekim 2026<\/span>/);
    assert.equal(page.match(/<li>/g)?.length, CHANGELOG.reduce((sum, entry) => sum + entry.notes.tr.length, 0));
    setLocale('en');
    const en = renderToStaticMarkup(createElement(WhatsNewPage));
    assert.match(en, /Version 1\.0\.0<span class="muted"> · October 29, 2026<\/span>/);
    assert.ok(en.includes(CHANGELOG[0]!.notes.en[0]!.replace(/'/g, '&#x27;')));
  });

  test('Hata bildir: not, kayıt ve günlük seçimi, ön izleme, adres; kabuk yoksa kaydetme kapalı, e-posta bağlantısı tarayıcıda', () => {
    recordLog('warn', ['ön izlemede görünen uyarı']);
    const page = renderToStaticMarkup(createElement(BugReportPage));
    assert.match(page, /data-report-note/);
    assert.match(page, new RegExp(SUPPORT_EMAIL.replace(/\./g, '\\.')));
    assert.match(page, /data-report-save-state="none"/);
    assert.match(page, /data-report-log[^-]/);
    assert.match(page, /Uyarı günlüğünü ekle \(\d+ satır\)/);
    assert.match(page, /data-report-download[^>]*disabled/);
    assert.match(page, /data-report-email[^>]*href="mailto:info@conforcus\.com\?subject=CapitalForge%200\.0\.0%20\(tar/);
    const preview = /<pre>([\s\S]*)<\/pre>/.exec(page)?.[1] ?? '';
    assert.match(preview, /&quot;kind&quot;: &quot;capitalforge-bug-report&quot;/);
    assert.match(preview, /ön izlemede görünen uyarı/);
    // Kabuk varken kayıt okunana kadar kaydetme bekliyor.
    setReportHost({ deliver: async () => 'started', save: async () => null });
    assert.match(renderToStaticMarkup(createElement(BugReportPage)), /data-report-save-state="loading"/);
  });

  test('sayfaların metinleri üç dilde, aynı yer tutucularla', () => {
    const holes = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join();
    const keys = Object.keys(releaseTr) as Array<keyof typeof releaseTr>;
    assert.ok(keys.length >= 25, String(keys.length));
    assert.deepEqual(Object.keys(releaseEn).sort(), [...keys].sort());
    assert.deepEqual(Object.keys(releaseDe).sort(), [...keys].sort());
    for (const key of keys) {
      assert.equal(holes(releaseEn[key]), holes(releaseTr[key]), `İngilizce ${key}`);
      assert.equal(holes(releaseDe[key]), holes(releaseTr[key]), `Almanca ${key}`);
    }
  });
});
