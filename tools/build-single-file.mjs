/**
 * Vite çıktısını tek bir HTML dosyasına gömer.
 *
 * Sebep: oyunu dosya sunucusu olmayan bir yerde (paylaşılan bir sayfa,
 * yerel bir dosya, sandbox'lı bir çerçeve) açabilmek. Dış istek yapan
 * hiçbir etiket kalmıyor — JS ve CSS satır içine giriyor, sourcemap
 * referansı düşüyor.
 *
 * Kullanım: node tools/build-single-file.mjs [çıktı.html]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve('apps/web/dist');
const ASSETS = join(DIST, 'assets');
const out = resolve(process.argv[2] ?? 'apps/web/dist/capital-single.html');

const files = readdirSync(ASSETS);
const jsName = files.find((f) => f.endsWith('.js'));
const cssName = files.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('dist/assets içinde js/css bulunamadı — önce `pnpm build`.');

const css = readFileSync(join(ASSETS, cssName), 'utf8');
const js = readFileSync(join(ASSETS, jsName), 'utf8')
  // harici .map dosyası artık yanında olmayacak
  .replace(/\/\/# sourceMappingURL=.*$/m, '')
  // satır içi script'i erken kapatacak dizileri kaçır (yalnızca string
  // ve regex literalleri içinde geçebilir; JS için eşdeğer yazım)
  .replace(/<\/script/gi, '<\\/script');

const title = 'CapitalForge — Şehir Ekonomisi';

const html = `<title>${title}</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`${out} yazıldı (${kb} KB)`);
