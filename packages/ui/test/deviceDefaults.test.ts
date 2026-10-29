import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, sanitizeSettings, setDeviceDefaults, updateSettings } from '../src/settings';

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

test('Steam Deck: kayıt bütün ayarları yazıyor; seçilmemiş "normal" Deck\'in varsayılanını ezmiyor (Codex)', () => {
  setDeviceDefaults({ textSize: 'xlarge' });
  // PC'de yalnız sesi değiştirmiş oyuncunun kaydı Steam Cloud'la Deck'e geliyor.
  const fromPc = { ...sanitizeSettings(null), textSize: 'normal', textSizeChosen: false, volume: { master: 0.5 } };
  assert.equal(sanitizeSettings(fromPc).textSize, 'xlarge');
  // Tur 71'den önceki kayıtta işaret yok: varsayılandan farklı boy seçilmiş sayılıyor.
  assert.equal(sanitizeSettings({ textSize: 'large' }).textSize, 'large');
  assert.equal(sanitizeSettings({ textSize: 'normal' }).textSize, 'xlarge', 'eski kayıttaki varsayılan boy seçim sayılmıyor');
  assert.equal(sanitizeSettings({ textSize: 'normal', textSizeChosen: true }).textSize, 'normal', 'açıkça seçilmiş normal');
  // Ayarlar'dan seçilen boy işaretleniyor ve kalıyor; başka bir ayar işareti silmiyor.
  updateSettings({ volume: { master: 0.4 } });
  assert.equal(getSettings().textSizeChosen, false);
  assert.equal(getSettings().textSize, 'xlarge');
  updateSettings({ textSize: 'normal' });
  assert.deepEqual([getSettings().textSize, getSettings().textSizeChosen], ['normal', true]);
  updateSettings({ palette: 'safe' });
  assert.deepEqual([getSettings().textSize, getSettings().textSizeChosen], ['normal', true]);
  assert.equal(sanitizeSettings(JSON.parse(JSON.stringify(getSettings()))).textSize, 'normal', 'kayıttan geri okununca da');
});

test('Deck\'te seçilmemiş "çok büyük" PC\'ye geçince normal; Deck\'te seçilmiş olan kalıyor', () => {
  // Ayrı bir süreçte değil: cihazın varsayılanı kaldırılınca PC gibi.
  setDeviceDefaults({ textSize: undefined });
  assert.equal(sanitizeSettings({ textSize: 'xlarge', textSizeChosen: false }).textSize, 'normal');
  assert.equal(sanitizeSettings({ textSize: 'xlarge', textSizeChosen: true }).textSize, 'xlarge');
  assert.equal(sanitizeSettings({ textSize: 'large' }).textSize, 'large', 'eski kayıttaki seçim');
});
