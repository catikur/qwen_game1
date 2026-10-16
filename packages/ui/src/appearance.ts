import { useSyncExternalStore } from 'react';

/**
 * Görünüm: gündüz camı ya da gece camı (Tur 35).
 *
 * Arayüz Lite'ın iki temasını taşıyor: gündüz "Cam & Bulut", gece "Gece
 * camı". Kurallar ortak, yalnızca belirteçler değişiyor
 * (`:root[data-appearance='night']`, styles.css).
 *
 * "Otomatik" (varsayılan) iki şeye bakıyor: cihaz koyu moddaysa hep gece;
 * değilse şehrin gün döngüsü — şehirde gece olunca arayüz de geceye
 * dönüyor. Oyuncu Gündüz ya da Gece diye sabitleyebilir; seçim dil gibi
 * tarayıcıda hatırlanıyor (kişisel bir kolaylık, oyunun kaydı değil).
 *
 * Şehrin gecesi için iki eşik var: gün ışığı 0,15'in altına inince gece,
 * 0,35'in üstüne çıkınca gündüz. Tek eşik olsaydı alacakaranlıkta gün ışığı
 * eşiğin iki yanında gidip gelirken arayüz yanıp sönerdi.
 *
 * Adres çubuğundaki `?appearance=night` seçimi bir kez geçersiz kılıyor
 * (kareler ve testler için); hatırlanmıyor.
 */
export type AppearanceChoice = 'auto' | 'day' | 'night';
export type Appearance = 'day' | 'night';

export const APPEARANCE_CHOICES: readonly AppearanceChoice[] = ['auto', 'day', 'night'];

const STORAGE_KEY = 'capitalforge.appearance';
const NIGHT_BELOW = 0.15;
const DAY_ABOVE = 0.35;
/** Geçişin süresi; styles.css'teki `data-appearance-shift` geçişiyle aynı. */
const SHIFT_MS = 900;

let choice: AppearanceChoice = 'auto';
let systemDark = false;
let cityNight = false;
let applied: Appearance | null = null;
let shiftTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function isChoice(value: string | null): value is AppearanceChoice {
  return value !== null && (APPEARANCE_CHOICES as readonly string[]).includes(value);
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: AppearanceChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* depolama yok: seçim bu oturumla sınırlı */
  }
}

function resolve(): Appearance {
  if (choice !== 'auto') return choice;
  return systemDark || cityNight ? 'night' : 'day';
}

function notify(): void {
  for (const listener of listeners) listener();
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const next = resolve();
  if (next === applied) return;
  const root = document.documentElement;
  // İlk boyama geçişsiz: açılışta gündüzden geceye kayan bir sayfa görülmesin.
  if (applied !== null) {
    root.setAttribute('data-appearance-shift', '');
    clearTimeout(shiftTimer);
    shiftTimer = setTimeout(() => root.removeAttribute('data-appearance-shift'), SHIFT_MS);
  }
  applied = next;
  root.dataset['appearance'] = next;
  notify();
}

/** Açılışta bir kez, ilk çizimden önce: adres parametresi, sonra hatırlanan seçim. */
export function initAppearance(): void {
  if (typeof window === 'undefined') return;
  let wanted: string | null = null;
  try {
    wanted = new URLSearchParams(window.location.search).get('appearance');
  } catch {
    wanted = null;
  }
  wanted ??= readStored();
  if (isChoice(wanted)) choice = wanted;
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (media) {
    systemDark = media.matches;
    media.addEventListener('change', (event) => {
      systemDark = event.matches;
      apply();
    });
  }
  apply();
}

/** Oyuncunun seçimi: hemen uygulanır ve hatırlanır. */
export function chooseAppearance(next: AppearanceChoice): void {
  if (!isChoice(next)) return;
  choice = next;
  writeStored(next);
  apply();
  notify();
}

/**
 * Şehrin gün ışığı (0..1). Sahne yokken (kurulum ekranı) `null`: şehir
 * gecesi yok sayılır, Otomatik yalnızca cihaza bakar.
 */
export function setCityDaylight(daylight: number | null): void {
  const night = daylight === null ? false : cityNight ? daylight < DAY_ABOVE : daylight < NIGHT_BELOW;
  if (night === cityNight) return;
  cityNight = night;
  apply();
}

/** Etkin görünüm (gündüz/gece). */
export function currentAppearance(): Appearance {
  return applied ?? resolve();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const readChoice = (): AppearanceChoice => choice;

/** Seçili görünüm; değişince bileşeni yeniden çizer. */
export function useAppearanceChoice(): AppearanceChoice {
  return useSyncExternalStore(subscribe, readChoice, readChoice);
}
