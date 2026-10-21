import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getAppShell, setAppShell } from '@capital/ui';
import { applyUpdate, listenForTakeover, setBeforeUpdate } from '../src/pwa';

/**
 * "Yenile" (Tur 48): yeni sürüme geçmeden önce oyun kaydediliyor. Kayıt
 * sürerken başka bir sekme bekleyen çalışanı etkinleştirebilir; bu sekme o
 * zaman beklemeyi bırakıp yenilemeli (Codex #77).
 */
describe('yeni sürüme geçiş', () => {
  test('kayıt sürerken başka sekme yeni sürüme geçirdiyse sayfa yenileniyor, düğme takılı kalmıyor', async () => {
    const posted: unknown[] = [];
    const waiting = { state: 'installed', postMessage: (message: unknown) => posted.push(message) };
    const serviceWorker = { controller: { id: 'eski' } as unknown, getRegistration: async () => ({ waiting }) };
    let reloads = 0;
    Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker }, configurable: true });
    Object.defineProperty(globalThis, 'location', { value: { reload: () => reloads++ }, configurable: true });
    const stop = setBeforeUpdate(async () => {
      // Kayıt sürerken öteki sekme "Yenile"ye bastı: çalışan etkinleşti, bu sayfanın denetleyicisi değişti.
      waiting.state = 'activated';
      serviceWorker.controller = { id: 'yeni' };
    });
    await applyUpdate();
    stop();
    assert.equal(reloads, 1);
    assert.deepEqual(posted, [], 'etkinleşmiş çalışana mesaj gitmiyor');
  });

  test('tek sekmede: kaydedip bekleyen çalışana geçmesini söylüyor, devralınca yenileniyor', async () => {
    const posted: unknown[] = [];
    const listeners: Array<() => void> = [];
    const waiting = { state: 'installed', postMessage: (message: unknown) => posted.push(message) };
    const serviceWorker = {
      controller: { id: 'eski' } as unknown,
      getRegistration: async () => ({ waiting }),
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') listeners.push(listener);
      },
    };
    let reloads = 0;
    let saved = 0;
    Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker }, configurable: true });
    Object.defineProperty(globalThis, 'location', { value: { reload: () => reloads++ }, configurable: true });
    listenForTakeover(serviceWorker as unknown as ServiceWorkerContainer);
    const stop = setBeforeUpdate(async () => void saved++);
    await applyUpdate();
    stop();
    assert.equal(saved, 1);
    assert.deepEqual(posted, ['skip-waiting']);
    assert.equal(reloads, 0, 'yenileme yeni çalışan devralınca (controllerchange)');
    serviceWorker.controller = { id: 'yeni' };
    for (const listener of listeners) listener();
    assert.equal(reloads, 1);
  });

  test('sayfa yüklenmeden başka sekme yeni sürüme geçirse de "yeni sürüm hazır" çıkıyor (Codex #77)', () => {
    // Denetleyici değişimi kayıt tamamlanmadan da dinleniyor: açılışın hemen başında.
    const listeners: Array<() => void> = [];
    const container = {
      controller: { id: 'eski' } as unknown,
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') listeners.push(listener);
      },
    };
    setAppShell({ updateReady: false });
    listenForTakeover(container as unknown as ServiceWorkerContainer);
    container.controller = { id: 'yeni' };
    for (const listener of listeners) listener();
    assert.equal(getAppShell().updateReady, true);
  });

  test('ilk kurulumda çalışanın sayfayı devralması "yeni sürüm" sayılmıyor', () => {
    const listeners: Array<() => void> = [];
    const container = {
      controller: null as unknown,
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'controllerchange') listeners.push(listener);
      },
    };
    setAppShell({ updateReady: false });
    listenForTakeover(container as unknown as ServiceWorkerContainer);
    container.controller = { id: 'ilk' };
    for (const listener of listeners) listener();
    assert.equal(getAppShell().updateReady, false);
  });
});
