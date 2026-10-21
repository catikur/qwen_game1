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
 * - Önbellekler `capitalforge-<özet>` adında. Etkinleşince en yeni iki
 *   etkinleşmiş sürümünki kalıyor: başka bir sekmede hâlâ açık duran eski
 *   sürüm, sonradan istediği parçayı (İngilizce sözlük) yine bulsun.
 * - Önbellekten düşen dosya ağdan alınıp geri konuyor.
 */
const VERSION = __CF_VERSION__;
const PRECACHE = __CF_PRECACHE__;
const PREFIX = 'capitalforge-';
const CACHE = PREFIX + VERSION;
const KEEP = 2;
/**
 * Etkinleşmiş sürümlerin kaydı. Önbellekler oluşturulma sırasına göre
 * değil buna göre tutuluyor: kurulumu yarıda kalan sürümün önbelleği hiç
 * etkinleşmediği için "önceki sürüm" sayılmıyor (Codex #77).
 */
const META = PREFIX + 'meta';

const scope = new URL(self.registration.scope);
const shell = new URL('index.html', scope).href;
const known = new Set(PRECACHE.map((path) => new URL(path, scope).href));
/** Parçaların klasörü: adlar içerik özeti taşıyor, eski sürümün parçası eski önbellekte. */
const assets = new URL('assets/', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Aynı sürümün yeniden kurulumu (tarayıcı çalışanı yeniden denedi)
      // çalışan sürümün önbelleğine yazıyor; düşerse onu silmemeli.
      const existed = await caches.has(CACHE);
      const cache = await caches.open(CACHE);
      try {
        // Kabuk ve manifest HTTP önbelleğini atlıyor: yeni sürümün kabuğu
        // eski parçalara bağlı kalmasın. Parçaların adı içeriklerinin özeti.
        await cache.addAll(
          PRECACHE.map((path) => new Request(new URL(path, scope), { cache: /\.(html|webmanifest)$/.test(path) ? 'no-cache' : 'default' })),
        );
      } catch (error) {
        // Bağlantı koptu: yarım önbellek kalmasın, tarayıcı bu çalışanı atıyor.
        if (!existed) await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});

/** Etkinleşmiş sürümler, eskiden yeniye. */
async function activated() {
  const hit = await (await caches.open(META)).match(new URL('__versions', scope).href);
  try {
    const list = hit ? await hit.json() : [];
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // En yeni iki etkinleşmiş sürüm kalıyor; ötekiler (yarım kalan
      // kurulumlar dahil) siliniyor.
      const versions = [...(await activated()).filter((item) => item !== VERSION), VERSION].slice(-KEEP);
      await (await caches.open(META)).put(new URL('__versions', scope).href, new Response(JSON.stringify(versions)));
      const keep = new Set([META, ...versions.map((item) => PREFIX + item)]);
      const ours = (await caches.keys()).filter((key) => key.startsWith(PREFIX));
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
      // Öteki önbelleklere yalnız eski sürümün parçası için bakılıyor. Bu
      // sürümün dosyası (kabuk dahil) düştüyse eski sürümünkini vermek oyunu
      // yeni çalışanın altında eski sürümle açardı (Codex #77): ağdan alınıyor.
      const hit = (await cache.match(key)) ?? (older ? await caches.match(key) : undefined);
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
