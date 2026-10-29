import { useSyncExternalStore } from 'react';
import type { PadGlyphs } from './padGlyphs';

/**
 * Kullanılan kumanda (Tur 72): düğme yazıları Xbox'unki mi Sony'ninki mi.
 * Kumanda modülü kumanda kullanılınca söylüyor; kumanda hiç kullanılmadıysa
 * yok. Ayarlar'daki kumanda listesi buna abone: Ayarlar açıkken kumandaya
 * uzanan oyuncu listeyi kapatıp açmadan görüyor, kumanda değişince düğme
 * yazıları da değişiyor. Kökteki işareti okumak yetmiyordu, o yeniden
 * çizdirmiyor (Codex #102). Ayrı küçük modül: Ayarlar giriş paketinde,
 * girdi kipinin dinleyicileri oraya girmesin.
 */
let glyphs: PadGlyphs | null = null;
const listeners = new Set<() => void>();

export function padGlyphsInUse(): PadGlyphs {
  return glyphs ?? 'xbox';
}

export function setPadGlyphsInUse(next: PadGlyphs): void {
  if (next === glyphs) return;
  glyphs = next;
  if (typeof document !== 'undefined') document.documentElement.dataset['padGlyphs'] = next;
  for (const listener of listeners) listener();
}

/** Kumanda ilk kez kullanılınca ya da başka bir kumandaya geçilince haber. */
export function onPadGlyphs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const seen = (): PadGlyphs | null => glyphs;

export function usePadGlyphs(): PadGlyphs | null {
  return useSyncExternalStore(onPadGlyphs, seen, seen);
}
