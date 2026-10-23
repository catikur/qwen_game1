import { useSyncExternalStore } from 'react';

/**
 * Ayarlar (Tur 47): metin boyutu, renk paleti, hareket, ses düzeyleri.
 *
 * Dil (`i18n/locale.ts`) ve görünüm (`appearance.ts`) kendi modüllerinde ve
 * kendi anahtarlarında kalıyor; panel hepsini bir arada gösteriyor. Seçimler
 * tarayıcıda hatırlanıyor (kişisel bir kolaylık, oyunun kaydı değil). Depo
 * her ortamda yok (gizli sekme, kapalı site verisi); her okuma ve yazma
 * try/catch içinde, yoksa seçim yalnızca bu oturumda geçerli.
 *
 * Kök etiketleri ilk çizimden önce yazılıyor (`initSettings`): metin
 * boyutu `--text-scale`, palet `data-palette`, azaltılmış hareket
 * `data-motion` (styles.css). Ses düzeyleri ses manzarasının işi; o bu
 * depoya abone oluyor (apps/web `audio.ts`). Müzik kanalı Tur 49'da geldi;
 * eski depoda yoksa varsayılanına düşüyor.
 */
export type TextSize = 'small' | 'normal' | 'large' | 'xlarge';
/** Standart ya da renk körlüğünde ayrışan palet (iyi/kötü/uyarı ve oyuncunun rengi). */
export type Palette = 'standard' | 'safe';
/** Otomatik cihazın "hareketi azalt" tercihine uyuyor. */
export type MotionChoice = 'auto' | 'reduced' | 'full';
export type VolumeChannel = 'master' | 'music' | 'ambience' | 'effects';

export interface Settings {
  textSize: TextSize;
  palette: Palette;
  motion: MotionChoice;
  /** 0..1; 1 Tur 46'ya kadarki sabit düzey. */
  volume: Record<VolumeChannel, number>;
  muted: boolean;
  /** Şehirde yağmur ve kar taneleri (Tur 62); mevsimin rengi ve bulutun ışığı her durumda. */
  weather: boolean;
}

export const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large', 'xlarge'];
/** Metin boyutunun çarpanı; arayüzün bütün `font-size` değerleri bununla çarpılıyor. */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, normal: 1, large: 1.15, xlarge: 1.3 };
export const PALETTES: readonly Palette[] = ['standard', 'safe'];
export const MOTION_CHOICES: readonly MotionChoice[] = ['auto', 'reduced', 'full'];
export const VOLUME_CHANNELS: readonly VolumeChannel[] = ['master', 'music', 'ambience', 'effects'];

export const DEFAULT_SETTINGS: Settings = {
  textSize: 'normal',
  palette: 'standard',
  motion: 'auto',
  // Müzik (Tur 49) biraz geride başlıyor: şehrin sesi ve olaylar önde kalsın.
  volume: { master: 1, music: 0.7, ambience: 1, effects: 1 },
  muted: false,
  weather: true,
};

const STORAGE_KEY = 'capitalforge.settings.v1';
/** Tur 47'den önceki sessize alma anahtarı: ilk açılışta okunup ayarlara taşınıyor. */
const LEGACY_MUTE_KEY = 'capitalforge.audio.muted';

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const level = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Depodan gelen her şeyi geçerli bir ayara çevirir; bilinmeyen değer varsayılana düşer. */
export function sanitizeSettings(raw: unknown, legacyMuted = false): Settings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const volume = source['volume'] && typeof source['volume'] === 'object' ? (source['volume'] as Record<string, unknown>) : {};
  return {
    textSize: pick(source['textSize'], TEXT_SIZES, DEFAULT_SETTINGS.textSize),
    palette: pick(source['palette'], PALETTES, DEFAULT_SETTINGS.palette),
    motion: pick(source['motion'], MOTION_CHOICES, DEFAULT_SETTINGS.motion),
    volume: {
      master: level(volume['master'], DEFAULT_SETTINGS.volume.master),
      music: level(volume['music'], DEFAULT_SETTINGS.volume.music),
      ambience: level(volume['ambience'], DEFAULT_SETTINGS.volume.ambience),
      effects: level(volume['effects'], DEFAULT_SETTINGS.volume.effects),
    },
    muted: typeof source['muted'] === 'boolean' ? source['muted'] : legacyMuted,
    weather: typeof source['weather'] === 'boolean' ? source['weather'] : DEFAULT_SETTINGS.weather,
  };
}

function readStored(): Settings {
  let raw: string | null = null;
  let legacy = false;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
    legacy = window.localStorage.getItem(LEGACY_MUTE_KEY) === '1';
  } catch {
    /* depo kapalı */
  }
  try {
    return sanitizeSettings(raw ? JSON.parse(raw) : null, legacy);
  } catch {
    return sanitizeSettings(null, legacy);
  }
}

function writeStored(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* depo kapalı: seçim bu oturumla sınırlı */
  }
}

let current: Settings = DEFAULT_SETTINGS;
let loaded = false;
let systemReduced = false;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window !== 'undefined') current = readStored();
}

/** Seçilen hareket ve cihazın tercihi birlikte: azaltılmış hareket etkin mi. */
export function reducedMotion(settings: Settings = getSettings()): boolean {
  return settings.motion === 'reduced' || (settings.motion === 'auto' && systemReduced);
}

function apply(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--text-scale', String(TEXT_SCALE[current.textSize]));
  root.dataset['textSize'] = current.textSize;
  root.dataset['palette'] = current.palette;
  if (reducedMotion(current)) root.dataset['motion'] = 'reduced';
  else delete root.dataset['motion'];
}

/** Açılışta bir kez, ilk çizimden önce: hatırlanan seçimler ve cihazın hareket tercihi. */
export function initSettings(): void {
  ensureLoaded();
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemReduced = media.matches;
    media.addEventListener('change', (event) => {
      systemReduced = event.matches;
      apply();
      for (const listener of listeners) listener();
    });
  }
  apply();
}

export function getSettings(): Settings {
  ensureLoaded();
  return current;
}

/** Bir ya da birkaç seçimi değiştirir: hemen uygulanır, hatırlanır, abonelere duyurulur. */
export function updateSettings(change: Partial<Omit<Settings, 'volume'>> & { volume?: Partial<Settings['volume']> }): void {
  ensureLoaded();
  current = sanitizeSettings({ ...current, ...change, volume: { ...current.volume, ...change.volume } });
  writeStored(current);
  apply();
  for (const listener of listeners) listener();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Seçimler; değişince bileşeni yeniden çizer. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}
