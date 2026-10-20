import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { currentLocale, registerLocaleLoader, registerMessages, setLocale } from '@capital/content';
import { chooseLocale } from '../src/i18n/locale';

/**
 * Dil seçimi (Tur 46): Türkçe dışı sözlük seçilince iniyor. Testte
 * `localStorage` ve `document` yok; seçim bellekte kalıyor.
 */
describe('dil seçimi', () => {
  test('sözlük inerken başka dil seçilirse geç inen eski seçim yenisinin üstüne yazmıyor (Codex #75)', async () => {
    let release = (): void => undefined;
    registerLocaleLoader('xs', () => new Promise<void>((resolve) => {
      release = () => {
        registerMessages('xs', { 'test.slow': 'geç' });
        resolve();
      };
    }));
    const slow = chooseLocale('xs');
    assert.equal(await chooseLocale('tr'), true);
    release();
    assert.equal(await slow, false, 'eski seçim uygulanmıyor');
    assert.equal(currentLocale(), 'tr');
    // Sözlük indi; yeniden seçilince geçiyor.
    assert.equal(await chooseLocale('xs'), true);
    assert.equal(currentLocale(), 'xs');
    setLocale('tr');
  });
});
