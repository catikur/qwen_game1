/*
 * Kurulabilir oyunun derleme tarafı (Tur 48).
 *
 * Paket yazıldıktan sonra çıktı klasörünü dolaşıp hizmet çalışanını
 * üretiyor: önbelleğe girecek dosyaların listesi ve bu dosyaların
 * içeriğinden bir özet (`sw.js` şablonu: `apps/web/pwa/sw.js`). Özet her
 * yayında değişen bir şey değil, içerik değişince değişen bir şey: aynı
 * kaynaktan iki derleme aynı çalışanı veriyor, tarayıcı boşuna
 * güncellemiyor.
 *
 * Saf işlevler ayrı dışa aktarılıyor (`apps/web/test/pwa.test.ts`).
 * JavaScript, çünkü `vite.config.ts` Node tiplerini bilmiyor (@types/node
 * bilinçli olarak yok); tipler `plugin.d.mts`'te.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Önbelleğe girecek dosyalar: çıktının hepsi, şunlar hariç:
 * - kaynak haritaları (yalnız geliştirici araçları istiyor, oyunun iki katı boyda);
 * - çalışanın kendisi (tarayıcı onu ayrıca ve hep ağdan denetliyor);
 * - `lite/` (Pages'te aynı kapsamın altındaki ayrı uygulama).
 * Sıra sabit: özet ve test aynı listeyi görsün.
 */
export function precacheEntries(files) {
  // Windows'ta klasör ayracı ters bölü; listede hep düz bölü.
  return [...new Set(files.map((file) => file.replaceAll('\\', '/')))]
    .filter((file) => !file.endsWith('.map') && file !== 'sw.js' && !file.startsWith('lite/'))
    .sort();
}

/** Listenin ve içeriklerin özeti: biri değişince önbelleğin adı da değişiyor. */
export function cacheVersion(entries, read) {
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(entry);
    hash.update('\0');
    hash.update(read(entry));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function renderServiceWorker(template, entries, version) {
  if (!template.includes('__CF_VERSION__') || !template.includes('__CF_PRECACHE__')) {
    throw new Error('sw.js şablonunda yer tutucu yok');
  }
  return template.replace('__CF_VERSION__', JSON.stringify(version)).replace('__CF_PRECACHE__', JSON.stringify(entries));
}

function walk(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, root) : [relative(root, path)];
  });
}

/** Vite eklentisi: yalnız derlemede, paket diske yazıldıktan sonra. */
export function serviceWorker() {
  let outDir = '';
  return {
    name: 'capital:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir.startsWith('/') ? config.build.outDir : join(config.root, config.build.outDir);
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const entries = precacheEntries(walk(outDir));
        const version = cacheVersion(entries, (entry) => readFileSync(join(outDir, entry)));
        const template = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
        writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, entries, version));
      },
    },
  };
}
