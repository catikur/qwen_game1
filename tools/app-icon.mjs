// Uygulama simgesinin çizimi (Tur 48): tek kaynak. Simgeleri
// `tools/make-app-icons.mjs`, Steam'in simge ve kapsül görsellerini
// `tools/steam/gorseller.mjs` (Tur 70) bundan çiziyor.
//
// Gökyüzü, üç bina (küçük, orta, ışıkları yanan kule) ve üstlerinden
// yükselen yeşil çizgi — şehir ve büyüme. 512 × 512; çizim maskelenebilir
// simgenin güvenli dairesine sığıyor (ayrıntı `make-app-icons.mjs`te).
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f8fe0"/>
      <stop offset="0.55" stop-color="#7ccbff"/>
      <stop offset="1" stop-color="#d3eeff"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dcecff"/>
    </linearGradient>
    <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a74d4"/>
      <stop offset="1" stop-color="#1f4c9c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <rect x="0" y="392" width="512" height="120" fill="#1d3f82"/>
  <rect x="0" y="392" width="512" height="10" fill="#12925a"/>
  <rect x="118" y="276" width="84" height="116" rx="8" fill="url(#glass)"/>
  <rect x="214" y="204" width="84" height="188" rx="8" fill="url(#glass)"/>
  <rect x="310" y="126" width="90" height="266" rx="8" fill="url(#tower)"/>
  <g fill="#9cc4f5">
    <rect x="134" y="296" width="20" height="16" rx="3"/><rect x="166" y="296" width="20" height="16" rx="3"/>
    <rect x="134" y="328" width="20" height="16" rx="3"/><rect x="166" y="328" width="20" height="16" rx="3"/>
    <rect x="230" y="226" width="20" height="16" rx="3"/><rect x="262" y="226" width="20" height="16" rx="3"/>
    <rect x="230" y="258" width="20" height="16" rx="3"/><rect x="262" y="258" width="20" height="16" rx="3"/>
    <rect x="230" y="290" width="20" height="16" rx="3"/><rect x="262" y="290" width="20" height="16" rx="3"/>
    <rect x="230" y="322" width="20" height="16" rx="3"/><rect x="262" y="322" width="20" height="16" rx="3"/>
  </g>
  <g fill="#ffe58a">
    <rect x="328" y="150" width="22" height="18" rx="3"/><rect x="360" y="150" width="22" height="18" rx="3"/>
    <rect x="328" y="184" width="22" height="18" rx="3"/><rect x="360" y="184" width="22" height="18" rx="3"/>
    <rect x="328" y="218" width="22" height="18" rx="3"/><rect x="360" y="218" width="22" height="18" rx="3"/>
    <rect x="328" y="252" width="22" height="18" rx="3"/><rect x="360" y="252" width="22" height="18" rx="3"/>
    <rect x="328" y="286" width="22" height="18" rx="3"/><rect x="360" y="286" width="22" height="18" rx="3"/>
    <rect x="328" y="320" width="22" height="18" rx="3"/><rect x="360" y="320" width="22" height="18" rx="3"/>
  </g>
  <polyline points="110,256 176,222 250,160 322,108" fill="none" stroke="#12925a" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="346,88 294,98 334,136" fill="#12925a" stroke="#12925a" stroke-width="10" stroke-linejoin="round"/>
</svg>`;
