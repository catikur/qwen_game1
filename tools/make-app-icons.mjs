// Ana oyunun uygulama simgeleri (Tur 48): kurulan oyunun ana ekranda,
// görev çubuğunda ve sekme başlığında görünen yüzü.
//
// Tek kaynak `tools/app-icon.mjs`teki SVG: gökyüzü, üç bina (küçük, orta,
// ışıkları yanan kule) ve üstlerinden yükselen yeşil çizgi — şehir ve
// büyüme. Chromium onu PNG'ye çiziyor; tarayıcıların manifest simgesi
// olarak istediği biçim bu. Çıktılar `apps/web/public/` altına yazılıyor ve
// depoya giriyor; SVG değişince bu betik yeniden koşulur.
//
// Maskelenebilir simgede işletim sistemi kenarları kendi biçimine göre
// kesiyor (daire, damla, yuvarlak kare). Bütün çizim ortadaki 410 px'lik
// güvenli dairenin içinde (512 px'te yarıçap 205); en uçtaki nokta, kulenin
// sağ üst köşesi, merkezden 199 px.
//
// Masaüstü sürümünün simgeleri (Tur 66) aynı çizimden: 1024 px'lik kaynak
// `apps/desktop/src-tauri/icons/source-1024.png`, platform dosyaları ondan
// (`pnpm --filter @capital/desktop icons`).
//
// Çalıştırma: node tools/make-app-icons.mjs [--desktop]  (Playwright ve Chromium gerekir;
// --desktop yalnız masaüstü kaynağını yazar)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { ICON_SVG } from './app-icon.mjs';

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



/**
 * Çıktılar. `round`: köşeler saydam yuvarlak kare (her yerde olduğu gibi
 * gösterilen "any" simgesi). Maskelenebilir ve Apple simgesi tam kare: kesimi
 * sistem yapıyor, iOS saydamlığı siyaha boyardı.
 */
const WEB = new URL('../apps/web/public/', import.meta.url);
const DESKTOP = new URL('../apps/desktop/src-tauri/icons/', import.meta.url);
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, round: true, target: WEB },
  { file: 'icon-512.png', size: 512, round: true, target: WEB },
  { file: 'icon-maskable-512.png', size: 512, round: false, target: WEB },
  { file: 'apple-touch-icon.png', size: 180, round: false, target: WEB },
  { file: 'source-1024.png', size: 1024, round: true, target: DESKTOP },
].filter((output) => !process.argv.includes('--desktop') || output.target === DESKTOP);

const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
try {
  const uri = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`;
  for (const { file, size, round, target } of OUTPUTS) {
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
