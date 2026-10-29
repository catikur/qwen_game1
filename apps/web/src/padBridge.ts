import type { Stick } from '@capital/ui';

/**
 * Kumandayla oyun ekranının ortak ucu (Tur 72). Oyun ekranı (`GameRoot`)
 * harita işleyicisini buraya kaydediyor, odağı buradan veriyor; kumandanın
 * kendisi (`pad.ts`) yalnız kumanda bağlanınca iniyor. Oyun ekranı `pad.ts`'i
 * içe aktarsaydı kumandanın kodu oyun ekranıyla birlikte inerdi (Codex #102).
 */

/** Oyun ekranının kumandaya açtığı işler. */
export interface MapHandler {
  /** Her karede: sol çubuk kaydır, sağ çubuk döndür ve eğ, RT − LT yakınlaş. */
  drive(pan: Stick, orbit: Stick, zoom: number): void;
  /** A haritada: ortadaki parseli seç; yerleştirmedeyse oraya kur. */
  select(): void;
  panel(step: 1 | -1): void;
  pause(): void;
  speed(): void;
  lens(): void;
  settings(): void;
  /** Yerleştirme kipinde mi: ipucu şeridi A'yı "kur" diye yazıyor. */
  placing(): boolean;
}

let handler: MapHandler | null = null;

export function setMapHandler(next: MapHandler | null): void {
  handler = next;
}

export function mapHandler(): MapHandler | null {
  return handler;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function shown(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
}

/** Kapsamdaki odaklanabilir, görünen denetimler (belge sırasıyla). */
export function focusables(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.closest('[inert], [aria-hidden="true"]') && shown(element));
}

export function focusOn(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Kapsamın ilk denetimine odaklan; `skip` eşleşenler atlanıyor (detayın kapatma düğmesi). */
export function focusFirst(scope: Element | null, skip?: string): boolean {
  if (!scope) return false;
  const first = focusables(scope).find((element) => !skip || !element.matches(skip));
  if (!first) return false;
  focusOn(first);
  return true;
}
