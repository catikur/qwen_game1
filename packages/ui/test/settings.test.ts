import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  TEXT_SCALE,
  getSettings,
  reducedMotion,
  sanitizeSettings,
  subscribeSettings,
  updateSettings,
} from '../src/settings';

/**
 * Ayarlar (Tur 47). Testte `localStorage`, `document` ve `matchMedia` yok:
 * seçimler bellekte kalıyor, cihazın hareket tercihi "azalt" değil.
 */
describe('ayarlar', () => {
  test('depodan gelen bozuk ya da bilinmeyen değer varsayılana düşüyor, düzeyler 0–1 arasında', () => {
    assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
    assert.deepEqual(sanitizeSettings('çöp'), DEFAULT_SETTINGS);
    const cleaned = sanitizeSettings({
      textSize: 'devasa',
      palette: 'safe',
      motion: 42,
      volume: { master: 1.7, ambience: -0.2, effects: 'yüksek' },
    });
    assert.equal(cleaned.textSize, 'normal');
    assert.equal(cleaned.palette, 'safe');
    assert.equal(cleaned.motion, 'auto');
    assert.deepEqual(cleaned.volume, { master: 1, ambience: 0, effects: 1 });
  });

  test('eski sessize alma seçimi taşınıyor; ayarlarda açıkça yazan geçerli', () => {
    assert.equal(sanitizeSettings(null, true).muted, true, 'Tur 47 öncesi sessize alan sessiz açılıyor');
    assert.equal(sanitizeSettings({ muted: false }, true).muted, false);
    assert.equal(sanitizeSettings({ muted: true }, false).muted, true);
  });

  test('değişiklik uygulanıyor, abonelere duyuruluyor; ses düzeyi tek tek değişiyor', () => {
    let calls = 0;
    const stop = subscribeSettings(() => calls++);
    updateSettings({ textSize: 'xlarge', volume: { effects: 0.4 } });
    assert.equal(getSettings().textSize, 'xlarge');
    assert.deepEqual(getSettings().volume, { master: 1, ambience: 1, effects: 0.4 }, 'diğer düzeyler yerinde');
    assert.equal(TEXT_SCALE[getSettings().textSize], 1.3);
    assert.equal(calls, 1);
    stop();
    updateSettings({ textSize: 'normal', volume: { effects: 1 } });
    assert.equal(calls, 1, 'abonelik bitti');
  });

  test('azaltılmış hareket: seçilince açık, Tam seçilince kapalı, Otomatik cihaza uyuyor', () => {
    assert.equal(reducedMotion({ ...DEFAULT_SETTINGS, motion: 'reduced' }), true);
    assert.equal(reducedMotion({ ...DEFAULT_SETTINGS, motion: 'full' }), false);
    assert.equal(reducedMotion({ ...DEFAULT_SETTINGS, motion: 'auto' }), false, 'testteki cihaz azaltma istemiyor');
  });
});
