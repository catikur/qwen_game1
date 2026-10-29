import { BUG_REPORT_KIND } from '@capital/persistence';
import type { LogLine } from './errorLog';
import type { Edition } from './version';

/**
 * Hata raporu (Tur 74): oyuncunun kaydedip destek adresine yolladığı tek
 * bir JSON dosyası. Baştaki künye okunaklı (oyuncu açıp neyin gittiğini
 * görebilsin), kayıt sıkışık ve en sonda. Saf işlev: sayfadan bağımsız,
 * birim testli (`packages/ui/test/report.test.ts`). Kayıtlar → "JSON içe
 * aktar" raporu da açıyor, içindeki kaydı yüklüyor (Tur 75): tür kalıcılıkta.
 */
export const REPORT_KIND = BUG_REPORT_KIND;
export const REPORT_FORMAT = 1;
export const SUPPORT_EMAIL = 'info@conforcus.com';
export const NOTE_LIMIT = 4000;

export interface ReportInput {
  version: string;
  edition: Edition;
  locale: string;
  createdAt: Date;
  userAgent: string;
  screen: { width: number; height: number; pixelRatio: number };
  viewport: { width: number; height: number };
  gpu: string | null;
  settings: unknown;
  note: string;
  /** null: oyuncu günlüğü rapordan çıkardı. */
  log: readonly LogLine[] | null;
  /** Kaydın JSON metni; null: kayıt yok ya da oyuncu çıkardı. */
  save: string | null;
}

const SAVE_SLOT = '"__capitalforge_save__"';

export function buildReport(input: ReportInput): string {
  const head = {
    kind: REPORT_KIND,
    format: REPORT_FORMAT,
    createdAt: input.createdAt.toISOString(),
    app: { version: input.version, edition: input.edition },
    environment: { locale: input.locale, userAgent: input.userAgent, screen: input.screen, viewport: input.viewport, gpu: input.gpu },
    note: input.note.trim().slice(0, NOTE_LIMIT),
    settings: input.settings,
    log: input.log === null ? null : input.log.map((line) => ({ at: Math.round(line.at), level: line.level, text: line.text })),
    save: SAVE_SLOT.slice(1, -1),
  };
  const text = JSON.stringify(head, null, 2);
  // Kayıt son alan: yer tutucunun son geçtiği yer onun yeri (not ve günlük kaçışlı).
  const at = text.lastIndexOf(SAVE_SLOT);
  return `${text.slice(0, at)}${compactSave(input.save)}${text.slice(at + SAVE_SLOT.length)}`;
}

/** Kayıt geçerli JSON'sa sıkıştırılmış hâli; değilse metin olarak; yoksa null. */
function compactSave(save: string | null): string {
  if (save === null) return 'null';
  try {
    return JSON.stringify(JSON.parse(save));
  } catch {
    return JSON.stringify(save);
  }
}

/** capitalforge-hata-raporu-2026-10-29-1630.json */
export function reportFilename(createdAt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())}`;
  return `capitalforge-hata-raporu-${day}-${pad(createdAt.getHours())}${pad(createdAt.getMinutes())}.json`;
}

/** E-postanın gövdesinde notun en çok bu kadarı: uzun bağlantıyı bazı e-posta programları kesiyor. */
export const MAILTO_NOTE_LIMIT = 1000;

/** E-posta bağlantısı: konu ve kısa bir gövde; rapor dosyasını oyuncu ekliyor. */
export function reportMailto(subject: string, body: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
