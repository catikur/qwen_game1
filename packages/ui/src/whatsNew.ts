import { useSyncExternalStore } from 'react';
import { APP_VERSION, compareVersions } from './version';

/**
 * "Yenilikler"in yeni sürüm işareti (Tur 74). Oyuncunun en son gördüğü
 * sürüm cihazda. Oyunun sürümü daha yeniyse Ayarlar düğmesinde bir nokta,
 * Ayarlar'ın başında "Yenilikler" çağrısı var; sayfa açılınca işaret kalkıyor.
 *
 * Yeni oyuncuya işaret yok: ilk açılışta oyunun sürümü görülmüş sayılıyor.
 * Cihazda oyunun başka bir kaydı varsa (ayar, kariyer, rehber) oyuncu
 * işaretin olmadığı eski bir sürümden geliyor: ona işaret var. Masaüstünde
 * anahtar da dosyada (`capitalforge.` öneki, `desktop/profile.ts`).
 */
const KEY = 'capitalforge.whatsnew.v1';
const PREFIX = 'capitalforge.';

let unseen = false;
let store: Storage | null = null;
let version = APP_VERSION;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Açılışta bir kez (`main.tsx`): masaüstünde dosyalar yerel depoya
 * yazıldıktan sonra. Sürüm testler için değiştirilebiliyor (derlemede oyunun sürümü).
 */
export function initWhatsNew(storage: Storage | null, current: string = APP_VERSION): void {
  store = storage;
  version = current;
  unseen = false;
  try {
    const seen = storage?.getItem(KEY) ?? null;
    if (seen !== null) unseen = compareVersions(seen, version) < 0;
    else if (storage && hasOtherKeys(storage)) unseen = true;
    else storage?.setItem(KEY, version);
  } catch {
    // Depo kapalı (gizli pencere, izin yok): işaret yok.
    unseen = false;
  }
  emit();
}

function hasOtherKeys(storage: Storage): boolean {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key !== KEY && key.startsWith(PREFIX)) return true;
  }
  return false;
}

export function whatsNewUnseen(): boolean {
  return unseen;
}

/** "Yenilikler" açılınca. */
export function markWhatsNewSeen(): void {
  try {
    store?.setItem(KEY, version);
  } catch {
    // Yazılamadı: bu oturumda yine de kalksın.
  }
  if (!unseen) return;
  unseen = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWhatsNewUnseen(): boolean {
  return useSyncExternalStore(subscribe, whatsNewUnseen, whatsNewUnseen);
}
