import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capital/ui/styles.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('#root bulunamadı');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
