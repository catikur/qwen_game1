// Açılış paketi denetimi (Tur 46): kurulum ekranının yolu küçük kalıyor mu.
//
// Kurulum ekranı için tarayıcının indirmesi gerekenler: index.html'in
// betiği, onun durağan içe aktarmaları (zincirleme), önden yüklenen
// modüller ve stil dosyası. Şehir sahnesi (three), oyun ekranı ve İngilizce
// sözlük bu yolda olmamalı; geç geliyorlar. Biri kurulumun yoluna ağır bir
// modül sokarsa (Tur 46'da `formatMoney` yatırım tahminiyle birlikte bütün
// simülasyonu taşıyordu) bütçe kırmızı yanar.
//
// Çalıştırma: pnpm build && node tools/bundle-check.mjs [dist]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST = path.resolve(process.argv[2] ?? 'apps/web/dist');
/** Kurulum ekranının yolu, gzip (KB); yazı tipleri hariç. Tur 46 öncesi 517 KB, sonunda ~128 KB. */
const CRITICAL_BUDGET_KB = 160;
/** Ana parçanın kendisi, gzip (KB). Tur 46 sonunda ~58 KB; öncesinde 246 KB. */
const ENTRY_BUDGET_KB = 75;
/** Kurulumun yolunda olmaması gerekenler. */
const LATE = [/^three-/, /^GameRoot-/, /^locale-en-/, /^locale-de-/];

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const assetOf = (href) => path.basename(href);
const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(html)?.[1];
if (!entry) throw new Error('index.html giriş betiği bulunamadı');
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => assetOf(m[1]));
const styles = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => assetOf(m[1]));

const assets = path.join(DIST, 'assets');
const read = (file) => fs.readFileSync(path.join(assets, file), 'utf8');
/** Durağan içe aktarmalar: `import{…}from"./x.js"` ve `import"./x.js"`; dinamik `import("…")` sayılmıyor. */
const staticImports = (code) =>
  [...code.matchAll(/(?:^|[;\n}])\s*import\s*(?:[^"'();]*?from\s*)?["']\.\/([^"']+\.js)["']/g)].map((m) => m[1]);

const critical = new Set();
const queue = [assetOf(entry), ...preloads];
while (queue.length) {
  const file = queue.shift();
  if (critical.has(file)) continue;
  critical.add(file);
  for (const dep of staticImports(read(file))) queue.push(dep);
}
for (const file of styles) critical.add(file);

const gzipKb = (file) => zlib.gzipSync(fs.readFileSync(path.join(assets, file)), { level: 9 }).length / 1024;
const rows = [...critical].map((file) => [file, gzipKb(file)]);
const total = rows.reduce((sum, [, kb]) => sum + kb, 0);
console.log('Kurulum ekranının yolu (gzip):');
for (const [file, kb] of rows) console.log(`  ${kb.toFixed(1).padStart(7)} KB  ${file}`);
console.log(`  ${total.toFixed(1).padStart(7)} KB  toplam\n`);

const late = [...critical].filter((file) => LATE.some((re) => re.test(file)));
check('Şehir sahnesi, oyun ekranı ve dil sözlükleri kurulumun yolunda değil', late.length === 0, late.join(', '));
check(`Kurulumun yolu ${CRITICAL_BUDGET_KB} KB'ın altında`, total <= CRITICAL_BUDGET_KB, `${total.toFixed(1)} KB`);
const entryKb = gzipKb(assetOf(entry));
check(`Ana parça ${ENTRY_BUDGET_KB} KB'ın altında`, entryKb <= ENTRY_BUDGET_KB, `${entryKb.toFixed(1)} KB`);

const files = fs.readdirSync(assets);
// Yazı tipleri ayrı dosya ve önden yükleniyor (Tur 46): CSS'e gömülü olsalar
// ilk çizimi bekletir, CSS'in değiştiği her yayında da yeniden inerler.
const fonts = files.filter((file) => file.endsWith('.woff2'));
const preloadedFonts = [...html.matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"/g)].map((m) => assetOf(m[1]));
const embedded = styles.filter((file) => read(file).includes('data:font/'));
check('Yazı tipleri CSS\'te gömülü değil, her biri önden yükleniyor',
  fonts.length > 0 && embedded.length === 0 && fonts.every((file) => preloadedFonts.includes(file)),
  `${fonts.length} yazı tipi · ${preloadedFonts.length} önden${embedded.length ? ` · gömülü: ${embedded.join(', ')}` : ''}`);
const game = files.find((file) => /^GameRoot-.*\.js$/.test(file));
check('Oyun ekranı ayrı parça ve şehir sahnesini o getiriyor', Boolean(game) && staticImports(read(game)).some((dep) => /^three-/.test(dep)), game ?? 'yok');
check('İngilizce ve Almanca sözlük ayrı parça', ['en', 'de'].every((locale) => files.some((file) => new RegExp(`^locale-${locale}-.*\\.js$`).test(file))));
// Kumanda (Tur 72): modülü kumanda bağlanınca iniyor. Oyun ekranı onu durağan
// içe aktarsa ekranla birlikte inerdi (Codex #102): ortak uç `padBridge.ts`'te.
const pad = files.find((file) => /^pad-.*\.js$/.test(file));
const gameGraph = new Set();
for (const queue = game ? [game] : []; queue.length; ) {
  const file = queue.shift();
  if (gameGraph.has(file)) continue;
  gameGraph.add(file);
  queue.push(...staticImports(read(file)));
}
check('Kumandanın modülü ayrı parça: ne kurulumun yolunda ne oyun ekranının durağan içe aktarmalarında',
  Boolean(pad) && !critical.has(pad) && !gameGraph.has(pad), pad ?? 'yok');

// Kurulabilir oyun (Tur 48): hizmet çalışanı paketin her parçasını önbelleğe
// alıyor; biri listede yoksa çevrimdışı açılış o parçada kırılır.
const swPath = path.join(DIST, 'sw.js');
const sw = fs.existsSync(swPath) ? fs.readFileSync(swPath, 'utf8') : '';
const precache = JSON.parse(/const PRECACHE = (\[.*?\]);/.exec(sw)?.[1] ?? 'null') ?? [];
const missing = ['index.html', 'manifest.webmanifest', ...files.filter((file) => !file.endsWith('.map')).map((file) => `assets/${file}`)].filter(
  (file) => !precache.includes(file),
);
check('Hizmet çalışanı paketin her parçasını önbelleğe alıyor, haritaları almıyor',
  precache.length > 0 && missing.length === 0 && !precache.some((file) => file.endsWith('.map')) && /const VERSION = "[0-9a-f]{12}"/.test(sw),
  `${precache.length} dosya${missing.length ? ` · eksik: ${missing.slice(0, 3).join(', ')}` : ''}`);
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
const icons = manifest.icons ?? [];
check('Manifest kurulabilir: ad, kapsam, tam ekran, 192 ve 512 simgesi, maskelenebilir simge; dosyalar pakette',
  Boolean(manifest.name && manifest.short_name) && manifest.start_url === './' && manifest.scope === './' && manifest.display === 'standalone' &&
    ['192x192', '512x512'].every((size) => icons.some((icon) => icon.sizes === size)) && icons.some((icon) => icon.purpose === 'maskable') &&
    icons.every((icon) => fs.existsSync(path.join(DIST, icon.src)) && precache.includes(icon.src)) && html.includes('rel="manifest"'),
  `${icons.length} simge`);

if (failed > 0) {
  console.log(`\n${failed} kontrol kaldı.`);
  process.exit(1);
}
console.log('\nPaket bütçesi tamam.');
