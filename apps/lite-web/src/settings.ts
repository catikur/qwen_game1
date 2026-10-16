/** Oyuncu tercihleri: tarayıcıda (localStorage). Senaryo modunda hiçbir şey okunmuyor ve yazılmıyor. */
import { deviceLang, setLang, type Lang } from './l10n';

export type LanguageChoice = 'system' | 'tr' | 'en';
export type AppearanceChoice = 'system' | 'day' | 'night';

export interface Settings {
  language: LanguageChoice;
  appearance: AppearanceChoice;
  sound: boolean;
  haptics: boolean;
  /** Android: yerel bildirimler (kasa doldu, meclis, rakip). */
  notifications: boolean;
  /** Bildirim izni oyunda bir kez önerildi mi. */
  notificationsOffered: boolean;
}

const KEY = 'lite.settings';
export const DEFAULT_SETTINGS: Settings = { language: 'system', appearance: 'system', sound: true, haptics: true, notifications: false, notificationsOffered: false };

export function loadSettings(ephemeral: boolean): Settings {
  if (ephemeral) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, ephemeral: boolean): void {
  if (ephemeral) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // özel pencere: tercih bu oturumla sınırlı
  }
}

export function langOf(choice: LanguageChoice): Lang {
  return choice === 'system' ? deviceLang() : choice;
}

/** Görünüm ve dili belgeye uygula. */
export function applySettings(settings: Settings): void {
  setLang(langOf(settings.language));
  const root = document.documentElement;
  if (settings.appearance === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.appearance);
}

/** Şu an gece mi (şehir çizimi ve tuval renkleri için). */
export function isNight(settings: Settings): boolean {
  if (settings.appearance !== 'system') return settings.appearance === 'night';
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}
