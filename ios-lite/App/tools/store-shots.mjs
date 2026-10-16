// CapitalForge Lite — App Store görselleri (L9): simülatör karesi + üstte başlık.
//
// CI kareleri (ios-lite-shots dalı ya da Actions çıktısı) bir dizine
// indirildikten sonra:
//   node ios-lite/App/tools/store-shots.mjs <kareler dizini> <çıktı dizini>
// Çıktı: <çıktı>/<dil>/iphone-<n>.png (1290×2796, 6,9"), ipad-<n>.png
// (13" kare boyunda) ve android-<n>.png (Play, 1080×1920; web sürümünün
// play-* kareleri). Alfa yok (App Store saydamlık istemiyor).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('kullanım: node ios-lite/App/tools/store-shots.mjs <kareler> <çıktı>');
  process.exit(2);
}

/** Sıra mağazadaki sıra: ilk üçü en çok görülen. */
const PHONE = [
  { shot: 'mid', tr: 'Zincirini kur, darboğazı büyüt', en: 'Build your chain, grow the bottleneck' },
  { shot: 'deal', tr: 'Şehirde fırsatları yakala', en: 'Catch deals in the city' },
  { shot: 'islands', tr: 'Adalara yayıl, kuleler yükselt', en: 'Expand to islands, raise towers' },
  { shot: 'listed', tr: 'Halka arz et, borsada yüksel', en: 'Go public, climb the market' },
  { shot: 'league', tr: 'Haftalık ligde yarış', en: 'Race in the weekly league' },
  { shot: 'map', tr: 'Şehri sat, holdingini büyüt', en: 'Sell the city, grow your holding' },
];
/** Play Store (L11): telefon 1080 × 1920; kareler web sürümünden (`play-<dil>-<ad>.png`). */
const PLAY = [
  { shot: 'mid', tr: 'Zincirini kur, darboğazı büyüt', en: 'Build your chain, grow the bottleneck' },
  { shot: 'deal', tr: 'Şehirde fırsatları yakala', en: 'Catch deals in the city' },
  { shot: 'islands', tr: 'Adalara yayıl, kuleler yükselt', en: 'Expand to islands, raise towers' },
  { shot: 'league', tr: 'iPhone, Android, tarayıcı: aynı lig', en: 'iPhone, Android, browser: one league' },
];
const IPAD = [
  { shot: 'mid', tr: 'Zincirini kur, darboğazı büyüt', en: 'Build your chain, grow the bottleneck' },
  { shot: 'deal', tr: 'Şehirde fırsatları yakala', en: 'Catch deals in the city' },
  { shot: 'islands', tr: 'Adalara yayıl, kuleler yükselt', en: 'Expand to islands, raise towers' },
  { shot: 'league', tr: 'Haftalık ligde yarış', en: 'Race in the weekly league' },
];

const font = readFileSync(join(here, '..', 'Resources', 'Fonts', 'Fredoka-Bold.ttf')).toString('base64');
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

function sizeOf(file) {
  const png = readFileSync(file);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Sayfa: gökyüzü, bulutlar, başlık, altta taşan ekran. */
function page({ width, height, caption, src, shotSize }) {
  const isPad = width > 1600;
  // Play telefonu (1080 × 1920) iPhone'dan kısa: başlık ve ekran biraz yukarıda.
  const isPlay = !isPad && height < 2000;
  const captionSize = isPad ? 118 : isPlay ? 84 : 104;
  const top = isPad ? 430 : isPlay ? 380 : 520;
  const shotWidth = Math.round(width * (isPad ? 0.84 : 0.84));
  const shotHeight = Math.round((shotWidth * shotSize.height) / shotSize.width);
  const radius = isPad ? 54 : 74;
  return `<!doctype html><html><head><style>
    @font-face { font-family: Fredoka; src: url(data:font/ttf;base64,${font}); font-weight: 700; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { background: linear-gradient(180deg, #3F9BFF 0%, #7CCBFF 46%, #CFEFFF 100%); position: relative; font-family: Fredoka, sans-serif; }
    .cloud { position: absolute; background: #fff; opacity: 0.85; border-radius: 999px; }
    .cloud::before, .cloud::after { content: ''; position: absolute; background: #fff; border-radius: 50%; }
    .cloud::before { width: 55%; height: 170%; left: 14%; top: -80%; }
    .cloud::after { width: 42%; height: 130%; left: 48%; top: -55%; }
    h1 { position: absolute; left: 0; right: 0; top: ${isPad ? 120 : isPlay ? 100 : 150}px; margin: 0 auto; width: ${Math.round(width * 0.86)}px;
         text-align: center; color: #fff; font-size: ${captionSize}px; line-height: 1.08; letter-spacing: -0.5px;
         text-shadow: 0 6px 24px rgba(16, 52, 112, 0.35); text-wrap: balance; }
    .shot { position: absolute; left: ${Math.round((width - shotWidth) / 2)}px; top: ${top}px; width: ${shotWidth}px; height: ${shotHeight}px;
            border-radius: ${radius}px; overflow: hidden; box-shadow: 0 40px 90px rgba(16, 52, 112, 0.35), 0 0 0 ${isPad ? 10 : 12}px rgba(255, 255, 255, 0.85); }
    .shot img { width: 100%; height: 100%; display: block; }
  </style></head><body>
    <div class="cloud" style="width:${width * 0.26}px;height:${width * 0.07}px;left:${-width * 0.04}px;top:${height * 0.035}px"></div>
    <div class="cloud" style="width:${width * 0.2}px;height:${width * 0.055}px;right:${-width * 0.03}px;top:${height * 0.1}px"></div>
    <h1>${caption}</h1>
    <div class="shot"><img src="${src}"></div>
  </body></html>`;
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const name of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright', '/opt/node22/lib/node_modules/playwright']) {
    if (!name) continue;
    try {
      return require(name);
    } catch {}
  }
  throw new Error('Playwright bulunamadı');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
let written = 0;
for (const lang of ['tr', 'en']) {
  mkdirSync(join(output, lang), { recursive: true });
  const jobs = [
    ...PHONE.map((spec, index) => ({ spec, index, file: join(input, `${lang}-${spec.shot}.png`), name: `iphone-${index + 1}`, width: 1290, height: 2796 })),
    ...IPAD.map((spec, index) => ({ spec, index, file: join(input, `store-ipad-${lang}-${spec.shot}.png`), name: `ipad-${index + 1}`, width: 2064, height: 2752 })),
    ...PLAY.map((spec, index) => ({ spec, index, file: join(input, `play-${lang}-${spec.shot}.png`), name: `android-${index + 1}`, width: 1080, height: 1920 })),
  ];
  for (const job of jobs) {
    if (!existsSync(job.file)) {
      console.log(`atlandı (kare yok): ${job.file}`);
      continue;
    }
    const pageObject = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
    await pageObject.setContent(page({ width: job.width, height: job.height, caption: job.spec[lang], src: dataUrl(job.file), shotSize: sizeOf(job.file) }));
    await pageObject.evaluate(() => document.fonts.ready);
    const out = join(output, lang, `${job.name}.png`);
    // JPEG yerine PNG ama opak: arka plan dolu, alfa kanalı App Store'da sorun olmasın diye beyaz zemin.
    await pageObject.screenshot({ path: out, omitBackground: false });
    await pageObject.close();
    written += 1;
    console.log(`yazıldı: ${out}`);
  }
}
await browser.close();
console.log(`${written} görsel`);
