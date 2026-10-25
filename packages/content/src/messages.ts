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
/**
 * Dillerin ilk duyulduğu sıra (Tur 69): seçici her zaman aynı sırada.
 * Sözlüğü inen dil eskiden listede önlere geçiyordu ("Türkçe · Deutsch ·
 * English", İngilizce seçilince başka sıra).
 */
const order: string[] = [BASE_LOCALE];

function remember(locale: string): void {
  if (!order.includes(locale)) order.push(locale);
}
let active = BASE_LOCALE;
const listeners = new Set<(locale: string) => void>();

/** Bir dile anahtar ekler; aynı dile birden çok modül kendi anahtarlarını kaydeder. */
export function registerMessages(locale: string, messages: Readonly<Record<string, string>>): void {
  remember(locale);
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
  remember(locale);
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

/** Seçilebilen diller: yüklü olanlar ve sonradan yüklenebilenler, kayıt sırasıyla. */
export function availableLocales(): string[] {
  return order.filter((locale) => dictionaries.has(locale) || loaders.has(locale));
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

/**
 * Bir dilin sayı ve para yazımı (Tur 69). İki dil varken her biçimleyici
 * "İngilizce mi?" diye soruyordu; Almanca ondalıkta Türkçeye, yüzdede
 * ikisinden başkasına benziyor ("45 %", "1,2 Mio. ₺"). Dil kendi biçimini
 * kaydediyor; kaydı olmayan dil Türkçe biçimle yazıyor.
 */
export interface LocaleFormat {
  /** `Intl` için BCP 47 etiketi. */
  tag: string;
  /** Yüzdenin yazımı; `value` hazır sayı metni. */
  percent: (value: string) => string;
  /** Ondalık ayırıcı. */
  decimal: ',' | '.';
  /** Para işareti tutarın önünde ("₺45K") mı, arkasında ("45 B ₺") mı. */
  currency: 'before' | 'after';
  /** `formatMoney`'nin kısaltmaları, sayıyla arasındaki boşluk dahil. */
  units: { thousand: string; million: string; billion: string };
  /** `formatShortMoney`'nin kısaltmaları (kart ve ipucu metinleri). */
  shortUnits: { thousand: string; million: string };
  /**
   * Dil başına metinlerde (paketlerin `{ "tr": …, "en": … }` metinleri) bu
   * dil yoksa sırayla bakılan diller; en sonda hep Türkçe. Almanca oynayan
   * İngilizcesi olan paketi İngilizce görüyor, Türkçe değil.
   */
  fallbacks: readonly string[];
}

const TURKISH_FORMAT: LocaleFormat = {
  tag: 'tr-TR',
  percent: (value) => `%${value}`,
  decimal: ',',
  currency: 'after',
  units: { thousand: ' B', million: ' M', billion: ' Mr' },
  shortUnits: { thousand: 'B', million: 'M' },
  fallbacks: [],
};

const formats = new Map<string, LocaleFormat>([
  [BASE_LOCALE, TURKISH_FORMAT],
  [
    'en',
    {
      tag: 'en-US',
      percent: (value) => `${value}%`,
      decimal: '.',
      currency: 'before',
      units: { thousand: 'K', million: 'M', billion: 'B' },
      shortUnits: { thousand: 'K', million: 'M' },
      fallbacks: [],
    },
  ],
  [
    'de',
    {
      tag: 'de-DE',
      // Sayıyla işaret arasında bölünmeyen boşluk: satır "45" ile "%" arasında kırılmasın.
      percent: (value) => `${value}\u00a0%`,
      decimal: ',',
      currency: 'after',
      units: { thousand: ' Tsd.', million: ' Mio.', billion: ' Mrd.' },
      shortUnits: { thousand: ' Tsd.', million: ' Mio.' },
      fallbacks: ['en'],
    },
  ],
]);

/** Bir dilin biçimini kaydeder (yeni dil ya da test). */
export function registerLocaleFormat(locale: string, format: LocaleFormat): void {
  formats.set(locale, format);
}

/** Dilin biçimi; kaydı yoksa Türkçe biçim. */
export function localeFormat(locale: string = active): LocaleFormat {
  return formats.get(locale) ?? TURKISH_FORMAT;
}

/** Dil başına metinde bakılacak diller: etkin dil, onun yedekleri, Türkçe. */
export function textLocales(locale: string = active): string[] {
  return [...new Set([locale, ...localeFormat(locale).fallbacks, BASE_LOCALE])];
}

/** Sayı biçimi için BCP 47 dil etiketi. */
export function numberLocale(): string {
  return localeFormat().tag;
}

/**
 * Yüzde: Türkçede işaret önde ("%45"), İngilizcede arkada ("45%"),
 * Almancada boşlukla arkada ("45 %"). `value` hazır sayı ya da metin
 * (yuvarlama çağıranda).
 */
export function formatPercent(value: number | string): string {
  return localeFormat().percent(String(value));
}

/** Ondalık ayırıcı: Türkçede ve Almancada virgül, İngilizcede nokta. `text` noktalı sayı metni. */
export function localizeDecimal(text: string): string {
  return localeFormat().decimal === '.' ? text : text.replace('.', ',');
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
  return localeFormat().currency === 'before' ? `₺${amount}` : `${amount} ₺`;
}

/**
 * Para birimi kısaltmaları. Türkçe: B (bin), M (milyon), Mr (milyar) ve
 * sayıyla arasında boşluk; İngilizce: K, M, B bitişik; Almanca: Tsd.,
 * Mio., Mrd. boşlukla.
 */
export function moneyUnits(): { thousand: string; million: string; billion: string } {
  return localeFormat().units;
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
 * İngilizcede "₺1.2M", "₺45K", "₺500"; Almancada "1,2 Mio. ₺", "45 Tsd. ₺".
 * Türkçede ondalık virgül (Tur 44).
 */
export function formatShortMoney(value: number): string {
  const units = localeFormat().shortUnits;
  if (value >= 1_000_000) return withCurrency(`${formatDecimal(value / 1_000_000, 1)}${units.million}`);
  if (value >= 1_000) return withCurrency(`${Math.round(value / 1_000)}${units.thousand}`);
  return withCurrency(`${Math.round(value)}`);
}
