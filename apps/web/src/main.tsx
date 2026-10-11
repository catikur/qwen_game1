import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capital/ui/styles.css';
import { initLocale } from '@capital/ui';
import { App } from './App';

// Dil ilk çizimden önce: adres parametresi (?lang=en) ya da hatırlanan seçim.
initLocale();

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
