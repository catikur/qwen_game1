import { useSyncExternalStore } from 'react';

declare const __CF_VERSION__: string | undefined;

/**
 * Oyunun sürümü (Tur 74). Derlemeye `apps/web/package.json`'dan giriyor
 * (vite `define`); birim testlerinde tanımlı değil, orada "0.0.0".
 * Ayarlar'da yazıyor, hata raporunda ve "Yenilikler"in yeni sürüm
 * işaretinde kullanılıyor.
 */
export const APP_VERSION: string = typeof __CF_VERSION__ === 'string' ? __CF_VERSION__ : '0.0.0';

/** "1.2.3" biçimindeki iki sürümün sırası: eksi, sıfır ya da artı. Bozuk parça 0 sayılıyor. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** Oyunun hangi sürümü: tarayıcı, masaüstü ya da Steam'le açılmış masaüstü. */
export type Edition = 'web' | 'desktop' | 'steam';

let edition: Edition = 'web';
const listeners = new Set<() => void>();

/**
 * Masaüstü kabuğu açılışta "desktop", Steam'e bağlanınca "steam" diyor
 * (`apps/web/src/desktop/index.ts`). Kök de işaretleniyor: `data-shell="desktop"`
 * (masaüstünün stilleri), Steam açıksa `data-steam="on"`. Açılış Steam'i
 * beklemiyor; Ayarlar ya da hata raporu açıkken bağlanırsa onlar da
 * yenileniyor (Codex #104).
 */
export function setAppEdition(next: Edition): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (next === 'web') delete root.dataset['shell'];
    else root.dataset['shell'] = 'desktop';
    if (next === 'steam') root.dataset['steam'] = 'on';
    else delete root.dataset['steam'];
  }
  if (next === edition) return;
  edition = next;
  for (const listener of listeners) listener();
}

export function appEdition(): Edition {
  return edition;
}

export function subscribeAppEdition(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppEdition(): Edition {
  return useSyncExternalStore(subscribeAppEdition, appEdition, appEdition);
}
