import { useSyncExternalStore } from 'react';
import { availableLocales, currentLocale, loadLocale, onLocaleChange, setLocale } from '@capital/content';

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

export const LOCALE_NAMES: Record<string, string> = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };

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

/**
 * Açılışta bir kez, ilk çizimden önce: adres parametresi, sonra hatırlanan
 * seçim. Türkçe dışı dilin sözlüğü ayrı parçada (Tur 46); çizim onu
 * bekliyor. İnmezse oyun Türkçe açılıyor, açılış durmuyor.
 */
export async function initLocale(): Promise<void> {
  if (typeof window === 'undefined') return;
  let wanted: string | null = null;
  try {
    wanted = new URLSearchParams(window.location.search).get('lang');
  } catch {
    wanted = null;
  }
  wanted ??= readStored();
  if (wanted && availableLocales().includes(wanted)) {
    try {
      if (await loadLocale(wanted)) setLocale(wanted);
    } catch {
      /* sözlük inmedi: Türkçe */
    }
  }
  applyDocumentLang(currentLocale());
}

let latestChoice = 0;

/**
 * Kullanıcının seçimi: sözlük iner, etkin dil değişir ve hatırlanır.
 * İnmezse dil değişmiyor; sonuç `false`. Sözlük inerken başka bir dil
 * seçildiyse geç inen eski seçim uygulanmıyor: son seçim geçerli (Codex #75).
 */
export async function chooseLocale(locale: string): Promise<boolean> {
  const choice = ++latestChoice;
  try {
    if (!(await loadLocale(locale))) return false;
  } catch {
    return false;
  }
  if (choice !== latestChoice) return false;
  if (!setLocale(locale)) return false;
  writeStored(locale);
  applyDocumentLang(locale);
  return true;
}

/** Etkin dil; değişince bileşeni yeniden çizer. Uygulama kökünde bir kez yeter. */
export function useLocale(): string {
  return useSyncExternalStore(onLocaleChange, currentLocale, currentLocale);
}
