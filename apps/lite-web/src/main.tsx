import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreContext } from './hooks';
import { GameStore } from './store';
import './styles.css';

const store = new GameStore();
store.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);

// Çevrimdışı çalışma: paket ve yazı tipleri önbellekte (yalnızca yayında; senaryo karelerinde yok).
if ('serviceWorker' in navigator && import.meta.env.PROD && !store.isScenario) {
  addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}
