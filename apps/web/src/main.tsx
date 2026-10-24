import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capital/ui/styles.css';
import { UpdateNotice, initAppearance, initLocale, initSettings } from '@capital/ui';
import { App } from './App';
import { initAppShell } from './pwa';

declare const __CF_DESKTOP__: boolean;

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

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

  // Dil de ilk çizimden önce: adres parametresi (?lang=en) ya da hatırlanan
  // seçim. Türkçede beklenecek bir şey yok; İngilizce sözlüğü ayrı parçada
  // (Tur 46), çizim onu bekliyor.
  await initLocale();
  createRoot(container).render(
    <StrictMode>
      <App />
      {/* Yeni sürüm hazır (Tur 48): kurulumda da oyunda da. */}
      <UpdateNotice />
    </StrictMode>,
  );
})();
