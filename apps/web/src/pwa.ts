import { setAppShell, setAppShellActions } from '@capital/ui';

/**
 * Kurulabilir ve çevrimdışı oyun (Tur 48), sayfa tarafı.
 *
 * Hizmet çalışanı (`apps/web/pwa/sw.js`) oyunun bütün dosyalarını
 * önbelleğe alıyor; sayfa bundan sonra ağ olmadan da açılıyor. Yayından
 * sonra yeni sürüm arka planda iniyor ve bekliyor. Bu dosya onu fark edip
 * "Yeni sürüm hazır" diyor (`UpdateNotice`). Oyuncu Yenile deyince oyun
 * kaydediliyor, yeni çalışan devralıyor, sayfa yeni sürümle açılıyor.
 * Tur 46'daki "eski sayfa yeni parçayı bulamadı" artık olmuyor: açık
 * sayfa hep kendi sürümünün parçalarını önbellekten alıyor.
 *
 * Yalnız yayın paketinde: geliştirme sunucusunda ve tek dosyalık sayfada
 * (`__CF_SERVICE_WORKER__` kapalı) çalışan yok.
 */
declare const __CF_SERVICE_WORKER__: boolean;

/** Yeni sürüm uzun açık kalan oyunda da fark edilsin: yarım saatte bir ve sekmeye dönünce. */
const UPDATE_CHECK_MS = 30 * 60_000;

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let beforeUpdate: (() => Promise<unknown>) | null = null;
let applying = false;

/** Oyun ekranı yenilemeden önce kaydetsin diye (GameRoot). Kaldırma işlevi döner. */
export function setBeforeUpdate(save: () => Promise<unknown>): () => void {
  beforeUpdate = save;
  return () => {
    if (beforeUpdate === save) beforeUpdate = null;
  };
}

/** "Yenile": kaydet, bekleyen sürüme geçmesini söyle; devralınca sayfa yenileniyor. */
export async function applyUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  const controller = navigator.serviceWorker.controller;
  try {
    await beforeUpdate?.();
  } catch (error) {
    // Kayıt düşmezse yine de yenile: otomatik kayıt en fazla 30 sn geride.
    console.warn('Güncellemeden önce kayıt başarısız:', error);
  }
  // Yeni sürüm başka bir sekmede çoktan devraldıysa (kayıt sürerken de
  // olabilir: Codex #77) bekleyen yok ya da artık bekleyen değil; mesaj boşa
  // gider ve sayfa hiç yenilenmezdi. Yenilemek yeter.
  if (!waiting || waiting.state === 'activated' || waiting.state === 'redundant' || navigator.serviceWorker.controller !== controller) {
    location.reload();
    return;
  }
  applying = true;
  waiting.postMessage('skip-waiting');
}

function watch(registration: ServiceWorkerRegistration, hadController: boolean): void {
  const announce = () => {
    // İlk kurulumda bekleyen yok; beklemek yalnız eski bir sürüm sayfayı tutarken oluyor.
    if (registration.waiting && navigator.serviceWorker.controller) setAppShell({ updateReady: true });
  };
  announce();
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') announce();
    });
  });
  void navigator.serviceWorker.ready.then(() => setAppShell({ offlineReady: true }));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) {
      applying = false;
      location.reload();
      return;
    }
    // Başka bir sekme yeni sürüme geçti; bu sekme hâlâ eski sürümün kodunu
    // çalıştırıyor. Oyuncuya söyle, ne zaman yenileyeceğine o karar versin.
    if (hadController) setAppShell({ updateReady: true });
  });

  const check = () => void registration.update().catch(() => undefined);
  setInterval(check, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/** Açılışta bir kez. Kayıt sayfa yüklendikten sonra: ilk açılışın indirmesiyle yarışmasın. */
export function initAppShell(): void {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  setAppShell({ installed: standalone, platform: ios ? 'ios' : 'other' });

  let prompt: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Tarayıcının kendi şeridi yerine Ayarlar'daki "Cihaza kur".
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    setAppShell({ installable: true });
  });
  window.addEventListener('appinstalled', () => {
    prompt = null;
    setAppShell({ installable: false, installed: true });
  });
  setAppShellActions({
    async install() {
      if (!prompt) return;
      const event = prompt;
      prompt = null;
      await event.prompt();
      const choice = await event.userChoice;
      setAppShell({ installable: false, installed: choice.outcome === 'accepted' });
    },
    applyUpdate,
  });

  if (!__CF_SERVICE_WORKER__ || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  setAppShell({ supported: true });
  const hadController = navigator.serviceWorker.controller !== null;
  const register = () => {
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(
      (registration: ServiceWorkerRegistration | undefined) => {
        // Kaydı engelleyen ortam (otomasyonun "çalışan kapalı" ayarı) sözü
        // boş çözebiliyor; o zaman bu sayfada çevrimdışı yok.
        if (registration) watch(registration, hadController);
        else setAppShell({ supported: false });
      },
      (error: unknown) => {
        // Tarayıcı izin vermedi (gizli pencere, kapalı site verisi): Ayarlar'da
        // "dosyalar iniyor" diye bekletme, bölümü gizle.
        setAppShell({ supported: false });
        console.warn('Hizmet çalışanı kaydedilemedi:', error);
      },
    );
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
