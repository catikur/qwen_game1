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

/** Ondalık ayırıcı: Türkçede virgül, İngilizcede nokta. `text` noktalı sayı metni. */
export function localizeDecimal(text: string): string {
  return active === 'en' ? text : text.replace('.', ',');
}

/** Ondalık sayı: Türkçede virgül ("5,0"), İngilizcede nokta ("5.0"). */
export function formatDecimal(value: number, digits: number): string {
  return localizeDecimal(value.toFixed(digits));
}

/** Binlik ayırıcılı tam sayı: Türkçede "1.234", İngilizcede "1,234". */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(numberLocale(), options);
}

/** Para işareti: Türkçede tutarın arkasında ("45 B ₺"), İngilizcede önünde ("₺45K"). */
export function withCurrency(amount: string): string {
  return active === 'en' ? `₺${amount}` : `${amount} ₺`;
}

/**
 * Para birimi kısaltmaları. Türkçe: B (bin), M (milyon), Mr (milyar) ve
 * sayıyla arasında boşluk; İngilizce: K, M, B bitişik.
 */
export function moneyUnits(): { thousand: string; million: string; billion: string } {
  return active === 'en' ? { thousand: 'K', million: 'M', billion: 'B' } : { thousand: ' B', million: ' M', billion: ' Mr' };
}

/**
 * Birim fiyat, kuruşuyla (zincir kartı): Türkçede "2,80 ₺", İngilizcede
 * "₺2.80". Birim ekonomisinde ₺2,80 ile ₺3,40 arasındaki fark kararın
 * kendisi; `formatMoney` bin ve milyon ölçeği için yuvarlıyor.
 */
export function formatUnitMoney(value: number): string {
  return withCurrency(formatDecimal(value, 2));
}

/**
 * Kısa para biçimi (kart ve ipucu metinleri): "1,2M ₺", "45B ₺", "500 ₺";
 * İngilizcede "₺1.2M", "₺45K", "₺500". Türkçede ondalık virgül (Tur 44).
 */
export function formatShortMoney(value: number): string {
  const thousand = active === 'en' ? 'K' : 'B';
  if (value >= 1_000_000) return withCurrency(`${formatDecimal(value / 1_000_000, 1)}M`);
  if (value >= 1_000) return withCurrency(`${Math.round(value / 1_000)}${thousand}`);
  return withCurrency(`${Math.round(value)}`);
}
