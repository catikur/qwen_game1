import { useSyncExternalStore } from 'react';
import { availableLocales, currentLocale, onLocaleChange, setLocale } from '@capital/content';

/**
 * Dil seçimi (Tur 23).
 *
 * Seçim tarayıcıda hatırlanıyor (kişisel bir kolaylık, oyunun kaydı
 * değil). Adres çubuğundaki `?lang=en` seçimi bir kez geçersiz kılıyor —
 * bir bağlantıyı İngilizce paylaşabilmek için. Varsayılan Türkçe: oyunun
 * dili ve bütün testlerin varsaydığı dil o.
 *
 * Depolama her ortamda yok (gizli sekme, kapalı site verisi); her okuma ve
 * yazma try/catch içinde, yoksa seçim yalnızca bu oturumda geçerli.
 */
const STORAGE_KEY = 'capitalforge.locale';

export const LOCALE_NAMES: Record<string, string> = { tr: 'Türkçe', en: 'English' };

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(locale: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* depolama yok: seçim bu oturumla sınırlı */
  }
}

function applyDocumentLang(locale: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

/** Açılışta bir kez: adres parametresi, sonra hatırlanan seçim. */
export function initLocale(): void {
  if (typeof window === 'undefined') return;
  let wanted: string | null = null;
  try {
    wanted = new URLSearchParams(window.location.search).get('lang');
  } catch {
    wanted = null;
  }
  wanted ??= readStored();
  if (wanted && availableLocales().includes(wanted)) setLocale(wanted);
  applyDocumentLang(currentLocale());
}

/** Kullanıcının seçimi: etkin dil değişir ve hatırlanır. */
export function chooseLocale(locale: string): void {
  if (!setLocale(locale)) return;
  writeStored(locale);
  applyDocumentLang(locale);
}

/** Etkin dil; değişince bileşeni yeniden çizer. Uygulama kökünde bir kez yeter. */
export function useLocale(): string {
  return useSyncExternalStore(onLocaleChange, currentLocale, currentLocale);
}
