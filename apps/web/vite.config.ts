import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

function vendorChunk(id: string): string | undefined {
  if (id.includes('/node_modules/three/')) return 'three';
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
  // Üç paketin İngilizce sözlüğü tek parça (Tur 46): dil seçilince bir istek.
  if (/\/src\/i18n\/en(\.ts$|\/)/.test(id)) return 'locale-en';
  return undefined;
}

export default defineConfig({
  plugins: [react(), preloadFonts()],
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    sourcemap: !single,
    outDir: single ? 'dist-single' : 'dist',
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
});
