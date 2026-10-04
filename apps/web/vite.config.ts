import { defineConfig } from 'vite';
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
const single = process.env.SINGLE_FILE === '1';

function vendorChunk(id: string): string | undefined {
  if (id.includes('/node_modules/three/')) return 'three';
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    sourcemap: !single,
    outDir: single ? 'dist-single' : 'dist',
    // three tek başına ~540 KB; bölünemeyen bir kütüphane için uyarı
    // gürültü. Tek parçalık paket bilinçli olarak büyük.
    chunkSizeWarningLimit: single ? 1500 : 600,
    rollupOptions: {
      output: single ? { inlineDynamicImports: true } : { manualChunks: vendorChunk },
    },
  },
});
