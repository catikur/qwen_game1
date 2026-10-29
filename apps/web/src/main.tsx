import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capital/ui/styles.css';
import { UpdateNotice, initAppearance, initLocale, initSettings, initWhatsNew, installErrorLog } from '@capital/ui';
import { App } from './App';
import { initAppShell } from './pwa';
import { initReport } from './report';

declare const __CF_DESKTOP__: boolean;

// Hata günlüğü (Tur 74) her şeyden önce: açılışın uyarıları da hata raporuna girsin.
installErrorLog(window);

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

/** Yerel depo; gizli pencerede ya da izin yoksa erişmek de hata atabiliyor. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

void (async () => {
  // Masaüstü sürümü (Tur 66): ayarlar ve kayıtlar dosyada; ilk çizimden
  // önce dosyalar okunuyor. Web paketinde bu dal ve köprü hiç yok.
  if (__CF_DESKTOP__) await (await import('./desktop')).initDesktop();

  // Görünüm ilk çizimden önce: gündüz/gece camı arasında açılışta kayma olmasın.
  initAppearance();
  // Ayarlar da (Tur 47): metin boyutu, palet ve hareket ilk çizimde doğru.
  initSettings();
  // Kurulabilir ve çevrimdışı oyun (Tur 48): hizmet çalışanı sayfa yüklenince kaydediliyor.
  initAppShell();
  // Yeni sürüm işareti ve hata raporu (Tur 74). Masaüstünde dosyalar yerel depoya
  // yukarıda yazıldı: dönen oyuncu yeni gelen sanılmıyor.
  initWhatsNew(storage());
  initReport();

  // Dil de ilk çizimden önce: adres parametresi (?lang=en) ya da hatırlanan
  // seçim. Türkçede beklenecek bir şey yok; İngilizce sözlüğü ayrı parçada
  // (Tur 46), çizim onu bekliyor.
  await initLocale();
  // Kumanda (Tur 72): bağlanınca işi ayrı parçadan iniyor; giriş paketinde yalnız bu kanca.
  const pad = () => void import('./pad').then((module) => module.startPad());
  window.addEventListener('gamepadconnected', pad, { once: true });
  if (navigator.getGamepads?.().some(Boolean)) pad();
  createRoot(container).render(
    <StrictMode>
      <App />
      {/* Yeni sürüm hazır (Tur 48): kurulumda da oyunda da. */}
      <UpdateNotice />
    </StrictMode>,
  );
})();
