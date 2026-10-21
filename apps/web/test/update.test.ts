import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { applyUpdate, setBeforeUpdate } from '../src/pwa';

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

  test('tek sekmede: kaydedip bekleyen çalışana geçmesini söylüyor', async () => {
    const posted: unknown[] = [];
    const waiting = { state: 'installed', postMessage: (message: unknown) => posted.push(message) };
    const serviceWorker = { controller: { id: 'eski' } as unknown, getRegistration: async () => ({ waiting }) };
    let reloads = 0;
    let saved = 0;
    Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker }, configurable: true });
    Object.defineProperty(globalThis, 'location', { value: { reload: () => reloads++ }, configurable: true });
    const stop = setBeforeUpdate(async () => void saved++);
    await applyUpdate();
    stop();
    assert.equal(saved, 1);
    assert.deepEqual(posted, ['skip-waiting']);
    assert.equal(reloads, 0, 'yenileme yeni çalışan devralınca (controllerchange)');
  });
});
