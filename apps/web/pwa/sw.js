/*
 * CapitalForge hizmet çalışanı (Tur 48): oyun kurulunca ve çevrimdışıyken
 * de açılsın, yayından sonra eski sayfa yeni parçayı aramasın.
 *
 * Bu dosya bir şablon. Derleme (`apps/web/pwa/plugin.mjs`) paketteki her
 * dosyanın listesini ve listenin özetini aşağıdaki iki yer tutucuya yazıp
 * `sw.js` olarak çıkarıyor; özet değişince tarayıcı yeni çalışanı görüyor.
 *
 * Kurallar:
 * - Oyunun kabuğu (`index.html`) ve bütün parçalar önbellekten geliyor.
 *   Sayfa her zaman kendi sürümünün parçalarıyla çalışıyor; yeni sürüm
 *   arka planda iniyor ve oyuncu "Yenile" diyene kadar bekliyor
 *   (`apps/web/src/pwa.ts`). Kendiliğinden devralmıyor: oyun ortasında
 *   sayfanın altından sürüm değişmesin.
 * - Listede olmayan isteğe karışmıyor. Aynı kapsamın altında başka bir
 *   uygulama var (CapitalForge Lite, `lite/`, kendi çalışanı ve kendi
 *   önbelleğiyle); onun ne isteği ne önbelleği bu dosyanın işi.
 * - Önbellekler `capitalforge-<özet>` adında. Etkinleşince en yeni ikisi
 *   kalıyor: başka bir sekmede hâlâ açık duran eski sürüm, sonradan
 *   istediği parçayı (İngilizce sözlük) yine bulsun.
 * - Önbellekten düşen dosya ağdan alınıp geri konuyor.
 */
const VERSION = __CF_VERSION__;
const PRECACHE = __CF_PRECACHE__;
const PREFIX = 'capitalforge-';
const CACHE = PREFIX + VERSION;
const KEEP = 2;

const scope = new URL(self.registration.scope);
const shell = new URL('index.html', scope).href;
const known = new Set(PRECACHE.map((path) => new URL(path, scope).href));
/** Parçaların klasörü: adlar içerik özeti taşıyor, eski sürümün parçası eski önbellekte. */
const assets = new URL('assets/', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Kabuk ve manifest HTTP önbelleğini atlıyor: yeni sürümün kabuğu
      // eski parçalara bağlı kalmasın. Parçaların adı içeriklerinin özeti.
      cache.addAll(
        PRECACHE.map((path) => new Request(new URL(path, scope), { cache: /\.(html|webmanifest)$/.test(path) ? 'no-cache' : 'default' })),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Önbellek adları oluşturulma sırasıyla dönüyor; en yeni ikisi kalıyor.
      const ours = (await caches.keys()).filter((key) => key.startsWith(PREFIX));
      const keep = new Set([...ours.filter((key) => key !== CACHE).slice(-(KEEP - 1)), CACHE]);
      await Promise.all(ours.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
      // İlk kurulumda açık sayfa da bu çalışana geçiyor: sonradan inen
      // parçalar (İngilizce sözlük) çevrimdışı da bulunsun.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});

/** Oyunun kendi sayfası mı: kapsamın kökü ya da index.html, sorgu ne olursa olsun. */
function isShell(url) {
  return url.origin === scope.origin && (url.pathname === scope.pathname || url.href.split(/[?#]/)[0] === shell);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const page = request.mode === 'navigate' && isShell(url);
  const bare = url.href.split(/[?#]/)[0];
  // Bu sürümün listesinde yoksa ama bir parçaysa: başka sekmede hâlâ açık
  // eski sürüm istiyor (yeni sürüm devraldıktan sonra İngilizceye geçmek
  // gibi). Yayında eski dosya artık yok; önceki önbellekte var.
  const older = !known.has(bare) && bare.startsWith(assets) && !bare.endsWith('.map');
  if (!page && !known.has(bare) && !older) return;
  event.respondWith(
    (async () => {
      const key = page ? shell : bare;
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(key)) ?? (await caches.match(key));
      if (hit) return hit;
      // Önbellekte yok: tarayıcı yer açmak için silmiş ya da aynı kökendeki
      // başka bir uygulama temizlemiş. Ağdan al ve geri koy; bir sonraki
      // çevrimdışı açılış yine bulsun. Eski sürümün parçası geri konmuyor.
      const fresh = await fetch(page ? shell : request);
      if (fresh.ok && !older) await cache.put(key, fresh.clone());
      return fresh;
    })(),
  );
});
