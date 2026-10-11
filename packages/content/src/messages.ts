/**
 * Sözlük motoru (Tur 23) — çekirdek, içerik ve arayüz aynı motoru kullanıyor.
 *
 * Tur 21'de motor arayüz paketindeydi; çekirdeğin ürettiği metinler
 * (haberler, komut ret sebepleri) ve içerik adları ona erişemiyordu, yani
 * ikinci bir dil yalnızca düğme yazılarını çevirebilirdi. Motor en alttaki
 * pakette olunca üç katman da aynı etkin dili okuyor.
 *
 * Kurallar:
 *   - Türkçe temel dil: bir anahtar etkin dilde yoksa Türkçeye, o da yoksa
 *     çağıranın verdiği yedeğe (içerik nesnesinin kendi metni), o da yoksa
 *     anahtarın kendisine düşer — sessiz boşluk yerine fark edilir hata.
 *   - Yer tutucular `{ad}`; parametrede olmayan yer tutucu olduğu gibi kalır.
 *   - Etkin dil süreç geneli tek bir değer. Simülasyon dili OKUMAZ, yalnızca
 *     metin üretirken kullanır: aynı tohum her dilde aynı oyunu oynar.
 */
export type MessageParams = Record<string, string | number>;

export const BASE_LOCALE = 'tr';

const dictionaries = new Map<string, Record<string, string>>([[BASE_LOCALE, {}]]);
let active = BASE_LOCALE;
const listeners = new Set<(locale: string) => void>();

/** Bir dile anahtar ekler; aynı dile birden çok modül kendi anahtarlarını kaydeder. */
export function registerMessages(locale: string, messages: Readonly<Record<string, string>>): void {
  const current = dictionaries.get(locale);
  if (current) Object.assign(current, messages);
  else dictionaries.set(locale, { ...messages });
}

/** Etkin dili değiştirir; kayıtlı olmayan dilde hiçbir şey yapmaz. */
export function setLocale(locale: string): boolean {
  if (!dictionaries.has(locale)) return false;
  if (locale === active) return true;
  active = locale;
  for (const listener of listeners) listener(locale);
  return true;
}

export function currentLocale(): string {
  return active;
}

export function availableLocales(): string[] {
  return [...dictionaries.keys()];
}

export function onLocaleChange(listener: (locale: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `{ad}` biçimindeki yer tutucuları doldurur. */
export function fillTemplate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => (name in params ? String(params[name]) : match));
}

/** Etkin dilde anahtarın metni; yoksa Türkçe, o da yoksa `fallback`, o da yoksa anahtar. */
export function translate(key: string, params?: MessageParams, fallback?: string): string {
  const template = dictionaries.get(active)?.[key] ?? dictionaries.get(BASE_LOCALE)?.[key] ?? fallback ?? key;
  return fillTemplate(template, params);
}

/** Etkin dilde (ya da Türkçede) bu anahtar var mı — testler ve eksik anahtar denetimi için. */
export function hasMessage(key: string, locale: string = active): boolean {
  return dictionaries.get(locale)?.[key] !== undefined;
}

/** Sayı biçimi için BCP 47 dil etiketi. */
export function numberLocale(): string {
  return active === 'en' ? 'en-US' : 'tr-TR';
}

/**
 * Yüzde: Türkçede işaret önde ("%45"), İngilizcede arkada ("45%").
 * `value` hazır sayı ya da metin (yuvarlama çağıranda).
 */
export function formatPercent(value: number | string): string {
  return active === 'en' ? `${value}%` : `%${value}`;
}

/** Ondalık sayı: Türkçede virgül ("5,0"), İngilizcede nokta ("5.0"). */
export function formatDecimal(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return active === 'en' ? text : text.replace('.', ',');
}
