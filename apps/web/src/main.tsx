import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capital/ui/styles.css';
import { initAppearance, initLocale } from '@capital/ui';
import { App } from './App';

// Görünüm ilk çizimden önce: gündüz/gece camı arasında açılışta kayma olmasın.
initAppearance();

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

// Dil de ilk çizimden önce: adres parametresi (?lang=en) ya da hatırlanan
// seçim. Türkçede beklenecek bir şey yok; İngilizce sözlüğü ayrı parçada
// (Tur 46), çizim onu bekliyor.
void initLocale().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
