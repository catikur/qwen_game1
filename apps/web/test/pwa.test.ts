import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheVersion, precacheEntries, renderServiceWorker } from '../pwa/plugin.mjs';
import template from '../pwa/sw.js' with { type: 'text' };

/**
 * Kurulabilir oyun (Tur 48): önbellek listesi, sürüm özeti ve hizmet
 * çalışanının kendisi. Çalışan sahte bir ortamda koşuyor (kapsam Pages'teki
 * gibi `/qwen_game1/`): hangi isteğe karıştığı, hangi önbellekleri sildiği.
 */
describe('önbellek listesi ve sürüm', () => {
  test('paketin hepsi giriyor; harita, çalışanın kendisi ve Lite girmiyor; sıra sabit', () => {
    const files = [
      'index.html',
      'assets\\index-a1.js',
      'assets/index-a1.js.map',
      'assets/three-b2.js',
      'sw.js',
      'lite/index.html',
      'lite/sw.js',
      'manifest.webmanifest',
      'icon-192.png',
    ];
    assert.deepEqual(precacheEntries(files), ['assets/index-a1.js', 'assets/three-b2.js', 'icon-192.png', 'index.html', 'manifest.webmanifest']);
  });

  test('özet içerikten: aynı paket aynı sürüm, bir bayt değişince yeni sürüm', () => {
    const files: Record<string, string> = { 'index.html': '<html>', 'assets/a.js': 'a' };
    const entries = Object.keys(files).sort();
    const first = cacheVersion(entries, (entry) => files[entry]!);
    assert.equal(first, cacheVersion(entries, (entry) => files[entry]!));
    assert.match(first, /^[0-9a-f]{12}$/);
    assert.notEqual(first, cacheVersion(entries, (entry) => (entry === 'index.html' ? '<html> ' : files[entry]!)));
    assert.notEqual(first, cacheVersion(['assets/b.js', 'index.html'], (entry) => files[entry] ?? 'a'));
  });

  test('şablon yer tutucusuz kalırsa derleme duruyor', () => {
    assert.throws(() => renderServiceWorker('const x = 1;', [], 'v'), /yer tutucu/);
  });
});

type Listener = (event: Record<string, unknown>) => void;

/** Cevabın asgari sahtesi: gövde bir dizgi. */
class FakeResponse {
  readonly ok = true;
  constructor(readonly body: string) {}
  clone(): FakeResponse {
    return this;
  }
}
const fromNetwork = (url: string) => new FakeResponse(`ağdan ${new URL(url).pathname}`);

/** Önbellek deposunun asgari sahtesi: adlar oluşturulma sırasında. */
function fakeCaches() {
  const store = new Map<string, Map<string, FakeResponse>>();
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const cache = store.get(name)!;
    return {
      addAll: async (requests: Request[]) => {
        for (const request of requests) cache.set(request.url, fromNetwork(request.url));
      },
      put: async (key: string, response: FakeResponse) => void cache.set(key, response),
      match: async (key: string) => cache.get(key),
    };
  };
  return {
    store,
    api: {
      open,
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (key: string) => {
        for (const cache of store.values()) if (cache.has(key)) return cache.get(key);
        return undefined;
      },
    },
  };
}

function boot(version: string, caches: ReturnType<typeof fakeCaches>) {
  const listeners = new Map<string, Listener>();
  let claimed = false;
  let skipped = false;
  const self = {
    registration: { scope: 'https://oyun.test/qwen_game1/' },
    clients: { claim: async () => void (claimed = true) },
    skipWaiting: async () => void (skipped = true),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  const source = renderServiceWorker(template, ['assets/index-a1.js', 'assets/locale-en-c3.js', 'index.html', 'manifest.webmanifest'], version);
  const fetchFromNetwork = async (request: Request | string) => fromNetwork(typeof request === 'string' ? request : request.url);
  new Function('self', 'caches', 'fetch', source)(self, caches.api, fetchFromNetwork);
  const run = async (type: string, event: Record<string, unknown>) => {
    let waited: Promise<unknown> | undefined;
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => void (waited = promise) });
    await waited;
  };
  /** İsteğe karışırsa cevabı, karışmazsa `null` (tarayıcı kendisi ağa gider). */
  const fetch = async (url: string, mode: 'navigate' | 'cors' = 'cors') => {
    let answer: Promise<FakeResponse> | null = null;
    const request = { url, method: 'GET', mode };
    listeners.get('fetch')!({ request, respondWith: (promise: Promise<FakeResponse>) => void (answer = promise) });
    // Atama geri çağrıda; tip denetimi onu görmüyor.
    const settled = answer as Promise<FakeResponse> | null;
    return settled ? (await settled).body : null;
  };
  return { run, fetch, message: (data: unknown) => listeners.get('message')!({ data }), state: () => ({ claimed, skipped }) };
}

describe('hizmet çalışanı', () => {
  test('kurulunca listeyi önbelleğe alıyor; kabuk ve parçalar önbellekten, sorgulu adres de', async () => {
    const caches = fakeCaches();
    const worker = boot('v1', caches);
    await worker.run('install', {});
    assert.deepEqual([...caches.store.get('capitalforge-v1')!.keys()].sort(), [
      'https://oyun.test/qwen_game1/assets/index-a1.js',
      'https://oyun.test/qwen_game1/assets/locale-en-c3.js',
      'https://oyun.test/qwen_game1/index.html',
      'https://oyun.test/qwen_game1/manifest.webmanifest',
    ]);
    caches.store.get('capitalforge-v1')!.set('https://oyun.test/qwen_game1/index.html', new FakeResponse('önbellekteki kabuk'));
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/', 'navigate'), 'önbellekteki kabuk');
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/?lang=en', 'navigate'), 'önbellekteki kabuk');
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/index.html', 'navigate'), 'önbellekteki kabuk');
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/assets/locale-en-c3.js'), 'ağdan /qwen_game1/assets/locale-en-c3.js');
  });

  test('Lite\'a, listede olmayan dosyaya ve başka kökene karışmıyor', async () => {
    const caches = fakeCaches();
    const worker = boot('v1', caches);
    await worker.run('install', {});
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/lite/', 'navigate'), null);
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/lite/assets/app.js'), null);
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/assets/index-a1.js.map'), null);
    assert.equal(await worker.fetch('https://lig.test/qwen_game1/assets/index-a1.js'), null);
  });

  test('etkinleşince en yeni iki sürüm kalıyor, Lite\'ın önbelleğine dokunmuyor; sayfayı devralıyor', async () => {
    const caches = fakeCaches();
    for (const name of ['capitalforge-v1', 'cf-lite-v1', 'capitalforge-v2']) await caches.api.open(name);
    const worker = boot('v3', caches);
    await worker.run('install', {});
    await worker.run('activate', {});
    assert.deepEqual([...caches.store.keys()], ['cf-lite-v1', 'capitalforge-v2', 'capitalforge-v3']);
    assert.equal(worker.state().claimed, true);
  });

  test('yeni sürüm devralınca eski sekmenin istediği eski parça önceki önbellekten geliyor', async () => {
    const caches = fakeCaches();
    const old = await caches.api.open('capitalforge-v1');
    await old.addAll([new Request('https://oyun.test/qwen_game1/assets/locale-en-OLD.js')]);
    const worker = boot('v2', caches);
    await worker.run('install', {});
    await worker.run('activate', {});
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/assets/locale-en-OLD.js'), 'ağdan /qwen_game1/assets/locale-en-OLD.js');
    assert.equal(caches.store.has('capitalforge-v1'), true, 'önceki sürüm duruyor');
  });

  test('önbellekten düşen dosya ağdan alınıp geri konuyor (başka uygulama ya da tarayıcı silmişse)', async () => {
    const caches = fakeCaches();
    const worker = boot('v1', caches);
    await worker.run('install', {});
    const cache = caches.store.get('capitalforge-v1')!;
    cache.delete('https://oyun.test/qwen_game1/assets/index-a1.js');
    cache.delete('https://oyun.test/qwen_game1/index.html');
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/assets/index-a1.js'), 'ağdan /qwen_game1/assets/index-a1.js');
    assert.equal(await worker.fetch('https://oyun.test/qwen_game1/?lang=en', 'navigate'), 'ağdan /qwen_game1/index.html', 'kabuk adresiyle');
    assert.equal(cache.has('https://oyun.test/qwen_game1/assets/index-a1.js'), true);
    assert.equal(cache.has('https://oyun.test/qwen_game1/index.html'), true);
  });

  test('kendiliğinden devralmıyor; oyuncu Yenile deyince bekleyen sürüm geçiyor', async () => {
    const worker = boot('v1', fakeCaches());
    await worker.run('install', {});
    assert.equal(worker.state().skipped, false);
    worker.message('skip-waiting');
    assert.equal(worker.state().skipped, true);
  });
});
