import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../public/sw.js' with { type: 'text' };

/**
 * Lite'ın hizmet çalışanı ana oyunla aynı kökende (Pages: `/qwen_game1/` ve
 * `/qwen_game1/lite/`). Tur 48'e kadar etkinleşirken kendi adı dışındaki
 * bütün önbellekleri siliyordu; ana oyun önbellek kullanmaya başlayınca
 * Lite'ı açan oyuncunun ana oyunu çevrimdışı açılmaz oldu.
 *
 * Not: Lite'ın tip denetimi yalnız `src`'ye bakıyor; bu dosyayı birim
 * test koşucusu derleyip koşturuyor.
 */
describe('Lite hizmet çalışanı', () => {
  test('etkinleşince yalnız kendi eski önbelleklerini siliyor, ana oyununkine dokunmuyor', async () => {
    const names = ['capitalforge-abc', 'cf-lite-v0', 'cf-lite-v1', 'başka-bir-şey'];
    const listeners = new Map<string, (event: Record<string, unknown>) => void>();
    const self = {
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
      location: { origin: 'https://oyun.test' },
      addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => listeners.set(type, listener),
    };
    const caches = {
      keys: async () => [...names],
      delete: async (name: string) => {
        names.splice(names.indexOf(name), 1);
        return true;
      },
    };
    new Function('self', 'caches', worker)(self, caches);
    let waited: Promise<unknown> | undefined;
    listeners.get('activate')!({ waitUntil: (promise: Promise<unknown>) => void (waited = promise) });
    await waited;
    assert.deepEqual(names, ['capitalforge-abc', 'cf-lite-v1', 'başka-bir-şey']);
  });
});
