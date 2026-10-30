import { BASE_LOCALE, registerLocaleLoader, registerMessages, translate } from '@capital/content';
import type { tr } from './tr';
import { app } from './tr/app';
import { hud } from './tr/hud';
import { panels } from './tr/panels';

/**
 * Arayüz metinleri (Tur 21, §4.9 "yerelleştirme").
 *
 * Bileşenler artık metni kendisi yazmıyor, anahtarla istiyor:
 * `t('market.order.placed', { name, cap })`. Türkçe sözlük `tr/`
 * altında, dosya grubu başına bir modül; yeni bir dil aynı anahtarlarla
 * bir sözlük daha eklemek ve `setLocale` çağırmak demek. Eksik anahtar
 * Türkçeye düşer, o da yoksa anahtarın kendisi görünür (sessiz boşluk
 * yerine fark edilir bir hata).
 *
 * Tur 23: içerik adları ve çekirdeğin ürettiği metinler de aynı motordan
 * geçiyor; `DURUM.md` Tur 23.
 */
export type MessageKey = keyof typeof tr;
export type Messages = Record<MessageKey, string>;

/*
 * Motor Tur 23'ten beri içerik paketinde (`messages.ts`): çekirdek ve
 * içerik de aynı etkin dili okuyor. Arayüzün sözlüğü motora burada
 * kaydediliyor; `t` anahtar türünü koruyan ince bir sarmalayıcı.
 */
registerMessages(BASE_LOCALE, { ...panels, ...hud, ...app });
// Finans metinleri (banka, borsa, meclis, ihale) yalnız oyunda: onları
// yazan paneller `financeTr.ts`'i içe aktarıyor, sözlük onlarla iniyor (Tur 74).
// Şehirler arası hatların metinleri de öyle (`tradeTr.ts`, Tur 77).
// İngilizce dil seçilince iniyor (Tur 46): Türkçe oynayanın açılışında yok.
registerLocaleLoader('en', () => import('./en').then((m) => registerMessages('en', m.en)));
// Almanca (Tur 69) de öyle.
registerLocaleLoader('de', () => import('./de').then((m) => registerMessages('de', m.de)));

/** Yeni bir dil sözlüğü kaydeder (eksik anahtarlar Türkçeye düşer). */
export function registerLocale(locale: string, messages: Partial<Messages>): void {
  registerMessages(locale, messages as Record<string, string>);
}

export { setLocale, currentLocale } from '@capital/content';

/** `{ad}` biçimindeki yer tutucuları doldurur. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(key, params);
}
