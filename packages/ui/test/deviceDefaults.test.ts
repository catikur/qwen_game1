import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, sanitizeSettings, setDeviceDefaults } from '../src/settings';

/**
 * Cihazın varsayılanları (Tur 71), ayrı dosyada: modülün durumu öbür
 * ayar testlerine sızmasın (her test dosyası kendi sürecinde). Çok büyük
 * metnin en küçük yazısı `apps/web/test/desktop.test.ts`'te.
 */
test('Steam Deck: seçilmemiş metin boyu çok büyük; oyuncunun seçimi önde', () => {
  assert.equal(sanitizeSettings(null).textSize, 'normal', 'cihaz söylemeden normal');
  setDeviceDefaults({ textSize: 'xlarge' });
  assert.equal(sanitizeSettings(null).textSize, 'xlarge');
  assert.equal(sanitizeSettings({ palette: 'safe' }).textSize, 'xlarge', 'başka ayarı seçmiş, metin boyunu seçmemiş');
  assert.equal(sanitizeSettings({ textSize: 'small' }).textSize, 'small', 'oyuncunun seçimi önde');
  assert.equal(sanitizeSettings({ textSize: 'devasa' }).textSize, 'xlarge', 'bozuk değer cihazın varsayılanına düşüyor');
  assert.equal(getSettings().textSize, 'xlarge', 'ilk okuma cihazın varsayılanıyla');
});
