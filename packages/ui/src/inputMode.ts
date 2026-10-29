import type { PadGlyphs } from './padGlyphs';

/**
 * Oyuncunun son kullandığı girdi (Tur 72): fare ya da dokunuş, klavye,
 * kumanda. Kökte `data-input` olarak duruyor; haritanın nişangâhı ve
 * kumandanın düğme ipuçları ona bakıyor. Fare oynayınca ikisi de kalkıyor,
 * klavye ya da kumanda kullanılınca geri geliyor.
 */
export type InputMode = 'pointer' | 'keyboard' | 'pad';

let mode: InputMode = 'pointer';
let glyphs: PadGlyphs = 'xbox';
const listeners = new Set<(mode: InputMode) => void>();

export function inputMode(): InputMode {
  return mode;
}

export function setInputMode(next: InputMode): void {
  if (next === mode) return;
  mode = next;
  if (typeof document !== 'undefined') document.documentElement.dataset['input'] = next;
  for (const listener of listeners) listener(next);
}

export function onInputMode(listener: (mode: InputMode) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function padGlyphsInUse(): PadGlyphs {
  return glyphs;
}

export function setPadGlyphsInUse(next: PadGlyphs): void {
  glyphs = next;
  if (typeof document !== 'undefined') document.documentElement.dataset['padGlyphs'] = next;
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'OS']);

const watched = new WeakSet<Window>();

/**
 * Fare ve klavye dinleyicileri. Yalnız gerçek olaylar sayılıyor: kumandanın
 * B'si Escape olayı gönderiyor, o olay kipi klavyeye çevirmemeli. Fare
 * yerinde dururken de (yerleşim değişince) olay gelebiliyor; konumu
 * değişmeyen hareket sayılmıyor.
 */
export function watchInputMode(target: Window): () => void {
  // Oyun ekranı da kumanda modülü de istiyor; bir pencereye bir kez.
  if (watched.has(target)) return () => undefined;
  watched.add(target);
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  const onPointer = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    if (event.type === 'pointermove' && event.clientX === lastX && event.clientY === lastY) return;
    lastX = event.clientX;
    lastY = event.clientY;
    setInputMode('pointer');
  };
  const onKey = (event: KeyboardEvent) => {
    if (!event.isTrusted || MODIFIERS.has(event.key)) return;
    setInputMode('keyboard');
  };
  target.addEventListener('pointermove', onPointer, true);
  target.addEventListener('pointerdown', onPointer, true);
  target.addEventListener('keydown', onKey, true);
  return () => {
    watched.delete(target);
    target.removeEventListener('pointermove', onPointer, true);
    target.removeEventListener('pointerdown', onPointer, true);
    target.removeEventListener('keydown', onKey, true);
  };
}
