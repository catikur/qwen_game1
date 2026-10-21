import { useSyncExternalStore } from 'react';

/**
 * Kurulabilir oyunun durumu (Tur 48): yeni sürüm hazır mı, oyun kurulabilir
 * ya da kurulu mu, dosyaları çevrimdışı açılacak kadar önbellekte mi.
 *
 * Arayüz paketi hizmet çalışanını tanımıyor. Durumu ve eylemleri oyunun
 * kabuğu yazıyor (`apps/web/src/pwa.ts`); güncelleme bildirimi ve Ayarlar
 * buradan okuyor. Tek dosyalık sayfada ve geliştirme sunucusunda kimse
 * yazmıyor: `supported` kapalı kalıyor, Ayarlar'ın Uygulama bölümü görünmüyor.
 */
export interface AppShellState {
  /** Bu sayfada hizmet çalışanı var: kurulum ve çevrimdışı açılış mümkün. */
  supported: boolean;
  /** Yeni sürüm arka planda indi, oyuncunun yenilemesini bekliyor. */
  updateReady: boolean;
  /** Tarayıcı kurulum penceresini açabiliyor (Chromium'un `beforeinstallprompt`'u). */
  installable: boolean;
  /** Oyun kurulu uygulama olarak açık. */
  installed: boolean;
  /** Oyunun bütün dosyaları önbellekte: bağlantı olmadan da açılır. */
  offlineReady: boolean;
  /** iOS'ta kurulum penceresi yok; Safari'nin Paylaş menüsü tarif ediliyor. */
  platform: 'ios' | 'other';
}

export interface AppShellActions {
  install(): Promise<void>;
  applyUpdate(): Promise<void>;
}

let current: AppShellState = {
  supported: false,
  updateReady: false,
  installable: false,
  installed: false,
  offlineReady: false,
  platform: 'other',
};
let actions: AppShellActions | null = null;
const listeners = new Set<() => void>();

export function getAppShell(): AppShellState {
  return current;
}

export function setAppShell(change: Partial<AppShellState>): void {
  current = { ...current, ...change };
  for (const listener of listeners) listener();
}

export function setAppShellActions(next: AppShellActions): void {
  actions = next;
}

export function installApp(): Promise<void> {
  return actions?.install() ?? Promise.resolve();
}

export function applyUpdate(): Promise<void> {
  return actions?.applyUpdate() ?? Promise.resolve();
}

export function subscribeAppShell(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppShell(): AppShellState {
  return useSyncExternalStore(subscribeAppShell, getAppShell, getAppShell);
}
