import { registerMessages, translate } from '@capital/content';
import { padDe } from './padMessages.de';

/*
 * Kumandanın metinleri (Tur 72): düğme ipuçları ve Ayarlar'daki kumanda
 * listesi. Kumanda modülü geç inen bir parça (`apps/web/src/pad.ts`); bu
 * sözlük de onunla iniyor, giriş paketine girmiyor. Ayarlar listeyi
 * kumanda kullanıldıysa gösteriyor, yazılar o zaman inmiş oluyor.
 * Almancası `padMessages.de.ts`'te. Anahtarlar `hud.pad.` altında.
 */
export const padTr = {
  'hud.pad.select': 'Seç',
  'hud.pad.pick': 'Parseli seç',
  'hud.pad.place': 'Buraya kur',
  'hud.pad.cancel': 'Vazgeç',
  'hud.pad.back': 'Geri',
  'hud.pad.close': 'Kapat',
  'hud.pad.toMap': 'Haritaya dön',
  'hud.pad.toHud': 'Düğmeler',
  'hud.pad.move': 'Gez',
  'hud.pad.panels': 'Paneller',
  'hud.pad.pause': 'Durdur',
  'hud.pad.speed': 'Hız',
  'hud.pad.settings': 'Ayarlar',

  'hud.pad.controls': 'Kumanda',
  'hud.pad.key.pan': 'Sol çubuk',
  'hud.pad.key.orbit': 'Sağ çubuk',
  'hud.pad.what.pan': 'Kamerayı kaydır',
  'hud.pad.what.orbit': 'Döndür, eğ; pencerede kaydır',
  'hud.pad.what.zoom': 'Uzaklaş, yakınlaş',
  'hud.pad.what.pick': 'Ortadaki parseli seç; düğmeye bas',
  'hud.pad.what.back': 'Geri: pencereyi kapat, haritaya dön, seçimi bırak',
  'hud.pad.what.move': 'Düğmeler arasında gezin; kaydırıcıda değeri değiştir',
  'hud.pad.what.panels': 'Önceki, sonraki panel',
  'hud.pad.what.pause': 'Duraklat, sürdür',
  'hud.pad.what.speed': 'Hız',
  'hud.pad.what.settings': 'Ayarlar',
  'hud.pad.what.lens': 'Sonraki görünüm (lens)',
} as const;

export type PadMessageKey = keyof typeof padTr;

export const padEn: Record<PadMessageKey, string> = {
  'hud.pad.select': 'Select',
  'hud.pad.pick': 'Pick plot',
  'hud.pad.place': 'Build here',
  'hud.pad.cancel': 'Cancel',
  'hud.pad.back': 'Back',
  'hud.pad.close': 'Close',
  'hud.pad.toMap': 'Back to map',
  'hud.pad.toHud': 'Buttons',
  'hud.pad.move': 'Move',
  'hud.pad.panels': 'Panels',
  'hud.pad.pause': 'Pause',
  'hud.pad.speed': 'Speed',
  'hud.pad.settings': 'Settings',

  'hud.pad.controls': 'Controller',
  'hud.pad.key.pan': 'Left stick',
  'hud.pad.key.orbit': 'Right stick',
  'hud.pad.what.pan': 'Move the camera',
  'hud.pad.what.orbit': 'Rotate, tilt; scroll in a window',
  'hud.pad.what.zoom': 'Zoom out, zoom in',
  'hud.pad.what.pick': 'Pick the plot in the middle; press a button',
  'hud.pad.what.back': 'Back: close the window, return to the map, clear the selection',
  'hud.pad.what.move': 'Move between buttons; change a slider’s value',
  'hud.pad.what.panels': 'Previous, next panel',
  'hud.pad.what.pause': 'Pause or resume',
  'hud.pad.what.speed': 'Speed',
  'hud.pad.what.settings': 'Settings',
  'hud.pad.what.lens': 'Next view (lens)',
};

registerMessages('tr', padTr);
registerMessages('en', padEn);
registerMessages('de', padDe);

export function pt(key: PadMessageKey): string {
  return translate(key);
}
