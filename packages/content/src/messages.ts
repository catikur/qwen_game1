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

/** Bir dilin sözlüğündeki metin (etkin dilden bağımsız); yoksa ya da dil inmediyse yok. */
export function messageIn(locale: string, key: string): string | undefined {
  return dictionaries.get(locale)?.[key];
}

/*
 * Sonradan yüklenen diller (Tur 46). İngilizce sözlükler ilk açılışın
 * yolunda değil: her paket kendi sözlüğünü indiren bir işlev kaydediyor,
 * dil seçilince hepsi birlikte iniyor. Türkçe temel dil, hep yüklü.
 */
const loaders = new Map<string, Array<() => Promise<void>>>();
const loading = new Map<string, Promise<boolean>>();

/** Bir dilin sözlüğünü sonradan kaydeden işlev; `loadLocale` çağırır. */
export function registerLocaleLoader(locale: string, loader: () => Promise<void>): void {
  const list = loaders.get(locale);
  if (list) list.push(loader);
  else loaders.set(locale, [loader]);
}

/**
 * Dilin sözlüklerini indirip kaydeder; dil kullanılabilir olunca `true`.
 * Bir kez iner; inmezse sonraki çağrı yeniden dener.
 */
export function loadLocale(locale: string): Promise<boolean> {
  const pending = loaders.get(locale);
  if (!pending) return Promise.resolve(dictionaries.has(locale));
  let promise = loading.get(locale);
  if (!promise) {
    promise = Promise.all(pending.map((load) => load())).then(
      () => {
        loaders.delete(locale);
        return true;
      },
      (error: unknown) => {
        loading.delete(locale);
        throw error;
      },
    );
    loading.set(locale, promise);
  }
  return promise;
}

/** Etkin dili değiştirir; kayıtlı olmayan (ya da henüz inmemiş) dilde hiçbir şey yapmaz. */
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

/** Seçilebilen diller: yüklü olanlar ve sonradan yüklenebilenler. */
export function availableLocales(): string[] {
  return [...new Set([...dictionaries.keys(), ...loaders.keys()])];
}

export function onLocaleChange(listener: (locale: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `{ad}` biçimindeki yer tutucuları doldurur. `{ad|tekil|çoğul}` sayıya göre
 * birini seçiyor, içindeki `#` değerin kendisi: "{days|# day|# days}" (Tur 50).
 * Geri sayım 1'e inince İngilizcede "1 days" yazıyordu. Türkçede sayıdan
 * sonra isim çoğul olmadığından Türkçe metinler bunu kullanmıyor.
 */
export function fillTemplate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(
    /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g,
    (match: string, name: string, one: string | undefined, other: string | undefined) => {
      if (!(name in params)) return match;
      const value = String(params[name]);
      if (one === undefined || other === undefined) return value;
      return (value === '1' ? one : other).replace(/#/g, value);
    },
  );
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
