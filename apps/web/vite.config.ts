import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './pwa/plugin.mjs';

/**
 * İki paket biçimi.
 *
 * Varsayılan: üçüncü parti kütüphaneler kendi parçalarında (three ~%70,
 * react ~%20). Oyun kodu her sürümde değişiyor, kütüphaneler değişmiyor;
 * ayrı parçalar tarayıcı önbelleğinde kalıyor ve güncelleme yalnızca
 * oyunun kendi parçasını indiriyor.
 *
 * SINGLE_FILE=1: tek parça, `dist-single/` — paylaşılan sayfa için
 * `tools/build-single-file.mjs` bunu tek bir HTML'e gömüyor. Gömülü
 * sayfada parçalar arası içe aktarma çözülemez; orada bölmek kırmak olur.
 *
 * `--mode desktop` (Tur 66): masaüstü sürümünün paketi, `dist-desktop/`
 * (`apps/desktop`). Bölünmüş, ama hizmet çalışanı, manifest ve kaynak
 * haritası yok: dosyalar zaten diskte, güncellemeyi kurulum getiriyor.
 * Kabuğun köprüsü (`src/desktop/`) yalnız bu pakette. Ortam değişkeni
 * değil kip: Windows'ta da aynı komut.
 */
// @types/node bilinçli olarak yok; yapılandırmanın tek ihtiyacı ortam değişkeni.
declare const process: { env: Record<string, string | undefined> };
const single = process.env.SINGLE_FILE === '1';

/**
 * Yazı tipleri önden (Tur 46). Ayrı dosyalar (`packages/ui/src/fonts/`),
 * kurulum ekranı beşini de kullanıyor; CSS'ten keşfedilmeyi beklemeden
 * betikle birlikte iniyor, ekran ilk çizimde doğru yazı tipiyle geliyor.
 * Tek dosyalık pakette yazı tipi CSS'e gömülü, eklenecek bir şey yok.
 */
function preloadFonts(): Plugin {
  let base = '/';
  return {
    name: 'capital:preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.values(ctx.bundle ?? {})
          .filter((file) => file.fileName.endsWith('.woff2'))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `${base}${file.fileName}` },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

/**
 * Kurulabilir oyun (Tur 48): manifest, simgeler ve tarayıcı çubuğunun
 * rengi. Tek dosyalık sayfada yok: orada ne manifest ne hizmet çalışanı
 * var (gömülü sayfanın kendi adresi yok).
 */
function appLinks(): Plugin {
  let base = '/';
  return {
    name: 'capital:app-links',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml() {
      const link = (attrs: Record<string, string>) => ({ tag: 'link', attrs, injectTo: 'head' as const });
      const meta = (attrs: Record<string, string>) => ({ tag: 'meta', attrs, injectTo: 'head' as const });
      return [
        link({ rel: 'manifest', href: `${base}manifest.webmanifest` }),
        link({ rel: 'icon', type: 'image/png', sizes: '192x192', href: `${base}icon-192.png` }),
        link({ rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }),
        meta({ name: 'theme-color', content: '#7ccbff', media: '(prefers-color-scheme: light)' }),
        meta({ name: 'theme-color', content: '#142659', media: '(prefers-color-scheme: dark)' }),
        meta({ name: 'apple-mobile-web-app-title', content: 'CapitalForge' }),
      ];
    },
  };
}

function vendorChunk(id: string): string | undefined {
  if (id.includes('/node_modules/three/')) return 'three';
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
  // Üç paketin İngilizce sözlüğü tek parça (Tur 46): dil seçilince bir istek.
  if (/\/src\/i18n\/en(\.ts$|\/)/.test(id)) return 'locale-en';
  return undefined;
}

export default defineConfig(({ mode }) => {
  const desktop = !single && mode === 'desktop';
  const web = !single && !desktop;
  return {
    plugins: [react(), preloadFonts(), ...(web ? [appLinks(), serviceWorker()] : [])],
    // Simgeler ve manifest `public/`'te; tek dosyalık ve masaüstü paketine girmiyorlar.
    publicDir: web ? 'public' : false,
    // Hizmet çalışanı yalnız bölünmüş pakette kaydediliyor (apps/web/src/pwa.ts).
    // Lig sunucusu (Tur 51): yalnız verilince (Pages, `.github/workflows/pages.yml`).
    // Varsayılan boş: yerel derleme ve testler canlı sunucuya gitmiyor.
    define: {
      __CF_SERVICE_WORKER__: JSON.stringify(web),
      __CF_DESKTOP__: JSON.stringify(desktop),
      __LEAGUE_URL__: JSON.stringify(single ? '' : (process.env.VITE_LEAGUE_URL ?? '')),
    },
    server: { port: 5173, host: '127.0.0.1' },
    build: {
      target: 'es2022',
      sourcemap: web,
      outDir: single ? 'dist-single' : desktop ? 'dist-desktop' : 'dist',
      // three tek başına ~540 KB; bölünemeyen bir kütüphane için uyarı
      // gürültü. Tek parçalık paket bilinçli olarak büyük.
      chunkSizeWarningLimit: single ? 1500 : 600,
      // Tek dosyalık sayfada her şey gömülü (yazı tipleri dahil); bölünmüş
      // pakette yazı tipleri ayrı dosya (Tur 46), varsayılan sınır yeter.
      ...(single ? { assetsInlineLimit: 1024 * 1024 } : {}),
      rollupOptions: {
        output: single ? { inlineDynamicImports: true } : { manualChunks: vendorChunk },
      },
    },
  };
});
