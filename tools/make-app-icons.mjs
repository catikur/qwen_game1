// Ana oyunun uygulama simgeleri (Tur 48): kurulan oyunun ana ekranda,
// görev çubuğunda ve sekme başlığında görünen yüzü.
//
// Tek kaynak aşağıdaki SVG: gökyüzü, üç bina (küçük, orta, ışıkları yanan
// kule) ve üstlerinden yükselen yeşil çizgi — şehir ve büyüme. Chromium
// onu PNG'ye çiziyor; tarayıcıların manifest simgesi olarak istediği biçim
// bu. Çıktılar `apps/web/public/` altına yazılıyor ve depoya giriyor;
// SVG değişince bu betik yeniden koşulur.
//
// Maskelenebilir simgede işletim sistemi kenarları kendi biçimine göre
// kesiyor (daire, damla, yuvarlak kare). Bütün çizim ortadaki 410 px'lik
// güvenli dairenin içinde (512 px'te yarıçap 205); en uçtaki nokta, kulenin
// sağ üst köşesi, merkezden 199 px.
//
// Çalıştırma: node tools/make-app-icons.mjs  (Playwright ve Chromium gerekir)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'];
  for (const id of candidates.filter(Boolean)) {
    try {
      return require(id);
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error('Playwright bulunamadı. Kurulum: npm i -g playwright');
}
const { chromium } = loadPlaywright();
const CHROMIUM = process.env.CHROMIUM ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? undefined : '/opt/pw-browsers/chromium');

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
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

/**
 * Çıktılar. `round`: köşeler saydam yuvarlak kare (her yerde olduğu gibi
 * gösterilen "any" simgesi). Maskelenebilir ve Apple simgesi tam kare: kesimi
 * sistem yapıyor, iOS saydamlığı siyaha boyardı.
 */
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, round: true },
  { file: 'icon-512.png', size: 512, round: true },
  { file: 'icon-maskable-512.png', size: 512, round: false },
  { file: 'apple-touch-icon.png', size: 180, round: false },
];

const target = new URL('../apps/web/public/', import.meta.url);
const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
try {
  const uri = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`;
  for (const { file, size, round } of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="${uri}" width="${size}" height="${size}" style="display:block;${round ? 'border-radius:22%;' : ''}"></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(file, target), png);
    console.log(`${file} · ${size}×${size} · ${png.length} bayt`);
    await page.close();
  }
} finally {
  await browser.close();
}
