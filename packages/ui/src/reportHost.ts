import type { ExportOutcome } from './useGame';

/**
 * Hata raporunun kabuğu (Tur 74). Arayüz paketi dosya kaydetmeyi ve kayıt
 * okumayı bilmiyor; oyunun kabuğu açılışta veriyor (`apps/web/src/report.ts`).
 * Rapor bir yere gönderilmiyor: oyuncu dosyayı kaydedip kendisi yolluyor.
 */
export interface ReportHost {
  /** Rapor dosyası: tarayıcıda indirme, masaüstünde kaydetme penceresi. */
  deliver(filename: string, text: string): Promise<ExportOutcome>;
  /** Kaydın JSON metni: oyun açıksa o anki, değilse son otomatik kayıt; ikisi de yoksa null. */
  save(): Promise<string | null>;
}

let host: ReportHost | null = null;

export function setReportHost(next: ReportHost | null): void {
  host = next;
}

export function reportHost(): ReportHost | null {
  return host;
}
