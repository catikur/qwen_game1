import { BASE_LOCALE, registerMessages, translate } from '@capital/content';
import { tr } from './tr';

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
registerMessages(BASE_LOCALE, tr);

/** Yeni bir dil sözlüğü kaydeder (eksik anahtarlar Türkçeye düşer). */
export function registerLocale(locale: string, messages: Partial<Messages>): void {
  registerMessages(locale, messages as Record<string, string>);
}

export { setLocale, currentLocale } from '@capital/content';

/** `{ad}` biçimindeki yer tutucuları doldurur. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(key, params);
}
