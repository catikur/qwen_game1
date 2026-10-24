/**
 * Masaüstü kabuğuyla konuşma (Tur 66).
 *
 * Masaüstü sürümü (`apps/desktop`) oyunu Tauri'nin penceresinde açıyor;
 * `withGlobalTauri` ile sayfada `window.__TAURI__.core.invoke` var. Kabuk
 * komutları Rust tarafında (`apps/desktop/src-tauri/src/main.rs`): kayıt
 * slotları, küçük ayar dosyaları ve dışa aktarma. Komut yoksa (sayfa
 * tarayıcıda açılmış) oyun web sürümü gibi davranıyor.
 */
export interface InvokeOptions {
  headers?: Record<string, string>;
}

export type Invoke = <T = unknown>(command: string, args?: unknown, options?: InvokeOptions) => Promise<T>;

export interface DesktopEvents {
  listen(event: string, handler: () => void): Promise<unknown>;
}

interface TauriGlobal {
  core?: { invoke?: Invoke };
  event?: DesktopEvents;
}

/** Kabuğun "pencere kapanıyor" haberi (`main.rs` → `CLOSE_EVENT`). */
export const CLOSE_EVENT = 'capitalforge://close-requested';

function tauri(): TauriGlobal | undefined {
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

export function desktopInvoke(): Invoke | null {
  const invoke = tauri()?.core?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

export function desktopEvents(): DesktopEvents | null {
  const events = tauri()?.event;
  return events && typeof events.listen === 'function' ? events : null;
}
