/**
 * Sunucu tarafı çizim için asgari tip (Tur 54): bileşenin çıktısını Node'da
 * saymak için. `edge` yapısı seçildi: tarayıcı yapısının MessageChannel'ı
 * test sürecini kapanmadan tutuyordu, Node yapısı da tek parça pakette
 * `require('util')` istiyor.
 */
declare module 'react-dom/server.edge' {
  import type { ReactNode } from 'react';
  export function renderToStaticMarkup(element: ReactNode): string;
}
