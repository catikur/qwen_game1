import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreContext } from './hooks';
import { isNative, onBack } from './native';
import { GameStore } from './store';
import { closeTopSheet } from './ui';
import './styles.css';

const store = new GameStore();
store.start();
if (isNative) void onBack(closeTopSheet);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);

// Çevrimdışı çalışma: paket ve yazı tipleri önbellekte (yalnızca yayında; senaryo karelerinde yok).
// Android kabuğunda paket zaten cihazda: hizmet çalışanı yok.
if ('serviceWorker' in navigator && import.meta.env.PROD && !store.isScenario && !isNative) {
  addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}
