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
 * Kapsam dışı: içerik paketi (bina, ürün, rakip, zorluk adları zaten tek
 * yerde) ve çekirdeğin ürettiği metinler (haberler, komut ret sebepleri).
 * O ikisi bir sonraki adım; `DURUM.md` §4.9.
 */
export type MessageKey = keyof typeof tr;
export type Messages = Record<MessageKey, string>;

const LOCALES: Record<string, Partial<Messages>> = { tr };
let active: Partial<Messages> = tr;
let activeLocale = 'tr';

/** Yeni bir dil sözlüğü kaydeder (eksik anahtarlar Türkçeye düşer). */
export function registerLocale(locale: string, messages: Partial<Messages>): void {
  LOCALES[locale] = messages;
}

export function setLocale(locale: string): void {
  const messages = LOCALES[locale];
  if (!messages) return;
  active = messages;
  activeLocale = locale;
}

export function currentLocale(): string {
  return activeLocale;
}

/** `{ad}` biçimindeki yer tutucuları doldurur. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const lookup = (messages: Partial<Messages>): string | undefined => (messages as Record<string, string | undefined>)[key];
  const template: string = lookup(active) ?? lookup(tr) ?? String(key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => (name in params ? String(params[name]) : match));
}
