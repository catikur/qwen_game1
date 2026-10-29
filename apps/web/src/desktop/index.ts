import { setSaveBackend } from '@capital/persistence';
import { careerUnlockedIds, setDeviceDefaults, subscribeCareer } from '@capital/ui';
import { setFileSink } from '../host';
import type { DeliveryOutcome } from '../host';
import { saveBeforeLeaving } from '../pwa';
import { CLOSE_EVENT, desktopEvents, desktopInvoke } from './bridge';
import type { Invoke } from './bridge';
import { nativeFeel } from './native';
import { hydrate, mirror } from './profile';
import type { Mirror } from './profile';
import { fileSaves } from './saves';
import { initSteam } from './steam';

/** Kapanışta kayıt en çok bu kadar bekleniyor; kabuk da 5 sn sonra kendisi kapanıyor. */
const CLOSE_SAVE_MS = 4000;

/**
 * Masaüstü sürümünün açılışı (Tur 66). Yalnız masaüstü paketinde
 * (`--mode desktop`, `__CF_DESKTOP__`) yükleniyor; arayüz çizilmeden önce:
 * ayarlar ilk karede dosyadakiler olsun.
 *
 * Kabuk yoksa (masaüstü paketi tarayıcıda açılmış) hiçbir şey değişmiyor.
 */
export async function initDesktop(): Promise<boolean> {
  const invoke = desktopInvoke();
  if (!invoke) return false;

  let profile: Mirror | null = null;
  try {
    const entries = await invoke<Record<string, string>>('profile_read_all');
    const missing = hydrate(localStorage, entries);
    profile = mirror(localStorage, {
      set: (key, value) => invoke('profile_set', { key, value }),
      remove: (key) => invoke('profile_remove', { key }),
    });
    // Depoda olup dosyada olmayanlar (ilk açılış): aynı değeri yeniden
    // yazmak onları aynanın sırasına koyuyor.
    for (const key of missing) {
      const value = localStorage.getItem(key);
      if (value !== null) localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn('Ayar dosyaları okunamadı; bu oturum yalnız yerel depoyla sürüyor.', error);
  }

  // Steam Deck (Tur 71): oyuncu metin boyunu seçmediyse "çok büyük".
  try {
    const shell = await invoke<{ deck?: boolean }>('shell_info');
    if (shell?.deck) setDeviceDefaults({ textSize: 'xlarge' });
  } catch (error) {
    console.warn('Kabuğun ortam bilgisi okunamadı.', error);
  }
  // Uygulama gibi (Tur 71): tarayıcının kısayolları ve sağ tık menüsü
  // kapalı, F11 ve Alt+Enter tam ekran.
  nativeFeel(window, {
    toggleFullscreen: () => {
      invoke<boolean>('fullscreen_toggle').catch((error) => console.warn('Tam ekran değişmedi:', error));
    },
  });

  setSaveBackend(fileSaves(invoke));
  setFileSink((filename, data) => exportFile(invoke, filename, data));
  // Steam başarımları (Tur 70): kariyer dosyadan okunduktan sonra; açılışı beklemiyor.
  void initSteam(invoke, { unlockedIds: careerUnlockedIds, subscribe: subscribeCareer });

  // Pencere kapanırken: kabuk kapanışı tutup haber veriyor; oyun otomatik
  // kayıt slotuna yazıyor, ayar dosyaları bitiyor, sonra kapanıyor.
  // Dinlenemezse kabuk 5 sn sonra kendisi kapanıyor; açılış bunun için durmuyor.
  try {
    await desktopEvents()?.listen(CLOSE_EVENT, async () => {
      try {
        await Promise.race([
          (async () => {
            await saveBeforeLeaving();
            await profile?.idle();
          })(),
          new Promise((resolve) => setTimeout(resolve, CLOSE_SAVE_MS)),
        ]);
      } catch (error) {
        console.warn('Kapanırken kayıt başarısız:', error);
      } finally {
        await invoke('quit');
      }
    });
  } catch (error) {
    console.warn('Kapanış haberi dinlenemiyor:', error);
  }

  document.documentElement.dataset.shell = 'desktop';
  return true;
}

/** Dışa aktarılan kayıt ve şehir kartı İndirilenler klasörüne (aynı ad varsa "ad (2)"). */
async function exportFile(invoke: Invoke, filename: string, data: Blob | string): Promise<DeliveryOutcome> {
  try {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
    await invoke<string>('export_file', bytes, { headers: { filename } });
    return 'downloads';
  } catch (error) {
    console.warn('Dosya İndirilenler klasörüne yazılamadı:', error);
    return 'blocked';
  }
}
