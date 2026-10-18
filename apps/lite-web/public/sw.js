// CapitalForge Lite: çevrimdışı çalışma. Sayfa önce ağdan (yeni sürüm hemen
// gelsin), yoksa önbellekten; paket, yazı tipi ve görseller önbellekten.
// Lig sunucusu (başka adres) hiç önbelleğe girmiyor.
// Adresi sabit bir dosya (yazı tipi, görsel) değişince sürüm artar; eski önbellek
// açılışta siliniyor. v2: Fredoka'ya Türkçe harfler eklendi (Tur 40).
const CACHE = 'cf-lite-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const page = request.mode === 'navigate';
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (page) {
        try {
          const fresh = await fetch(request);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(request)) ?? (await cache.match('./')) ?? Response.error();
        }
      }
      const cached = await cache.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })(),
  );
});
