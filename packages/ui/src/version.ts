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

/**
 * Masaüstü kabuğu kökü `data-shell="desktop"` diye işaretliyor
 * (`apps/web/src/desktop/index.ts`), Steam açıksa `data-steam="on"`.
 */
export function appEdition(root: { dataset: DOMStringMap } | undefined = typeof document === 'undefined' ? undefined : document.documentElement): Edition {
  if (root?.dataset['shell'] !== 'desktop') return 'web';
  return root.dataset['steam'] === 'on' ? 'steam' : 'desktop';
}
