/**
 * Kumanda bir yazı alanını seçti (Tur 72): `pad.ts` haber veriyor, masaüstü
 * kabuğu Steam'in ekran klavyesini alanın yanında açıyor (`desktop/steam.ts`).
 * İki modül de geç yükleniyor; ortak ad bu küçük modülde.
 */
export const TEXT_INPUT_EVENT = 'capitalforge:text-input';

/** Alanın yeri, sayfanın CSS pikselinde. */
export interface TextField {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Çok satırlı alan (yazı kutusu, düzenlenebilir içerik): klavyenin Enter'ı satır başı (Codex #102). */
  readonly multiline: boolean;
}
