// CapitalForge Lite: çevrimdışı çalışma. Sayfa önce ağdan (yeni sürüm hemen
// gelsin), yoksa önbellekten; paket, yazı tipi ve görseller önbellekten.
// Lig sunucusu (başka adres) hiç önbelleğe girmiyor.
//
// Önbelleğin adı değişmiyor: değişirse eskisi silinir ve oyun bir sonraki
// çevrimiçi açılışa kadar çevrimdışı açılmaz. Adresi sabit bir dosyanın
// (yazı tipi, görsel) içeriği değişince REFRESH listesine giriyor: çalışan
// kurulurken onu ağdan taze alıp önbellektekinin üstüne yazıyor.
const CACHE = 'cf-lite-v1';
// Tur 40: Fredoka'ya Türkçe harfler eklendi.
const REFRESH = ['fonts/Fredoka-Medium.ttf', 'fonts/Fredoka-SemiBold.ttf', 'fonts/Fredoka-Bold.ttf'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(REFRESH.map((path) => new Request(path, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});
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
