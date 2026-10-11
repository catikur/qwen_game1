import { translate } from './messages';

/**
 * İçerik metinlerini etkin dile bağlar (Tur 23).
 *
 * Bina, ürün, olay, CEO… tanımları Türkçe metinleriyle yazılmış düz
 * nesneler ve oyunun her yerinde `def.name` diye okunuyor. Bütün okuma
 * yerlerini değiştirmek yerine metin alanı bir getter'a dönüşüyor: etkin
 * dilde `content.<tür>.<kimlik>.<alan>` anahtarı varsa o, yoksa nesnenin
 * kendi Türkçe metni. Türkçe oyunda getter aynı dizgeyi döndürüyor; yani
 * davranış birebir aynı.
 *
 * Dizi alanları (kurulum ekranındaki "facts") öğe öğe çevriliyor:
 * `content.<tür>.<kimlik>.<alan>.<sıra>`.
 */
const baseTexts = new WeakMap<object, Record<string, string>>();

/**
 * Bir içerik nesnesinin temel dildeki (Türkçe) metni. Simülasyonun metne
 * göre sıraladığı yerler bunu kullanıyor: sıralama dile göre değişirse
 * aynı tohum İngilizcede başka bir oyun oynardı.
 */
export function baseText(entry: object, field: string): string | undefined {
  return baseTexts.get(entry)?.[field];
}

function localizeFields<T extends object>(entry: T, prefix: string, fields: readonly string[]): void {
  const record = entry as Record<string, unknown>;
  for (const field of fields) {
    const original = record[field];
    if (typeof original === 'string') {
      const bases = baseTexts.get(entry) ?? {};
      bases[field] = original;
      baseTexts.set(entry, bases);
      Object.defineProperty(entry, field, {
        get: () => translate(`${prefix}.${field}`, undefined, original),
        enumerable: true,
        configurable: true,
      });
    } else if (Array.isArray(original)) {
      const items = original.slice() as string[];
      Object.defineProperty(entry, field, {
        get: () => items.map((item, index) => translate(`${prefix}.${field}.${index}`, undefined, item)),
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/** `id` alanı olan bir listenin metin alanlarını dile bağlar. */
export function localizeList<T extends { id: string }>(list: readonly T[], kind: string, fields: readonly (keyof T & string)[]): void {
  for (const entry of list) localizeFields(entry, `content.${kind}.${entry.id}`, fields);
}

/** Anahtarı kimlik olan bir kaydın metin alanlarını dile bağlar. */
export function localizeRecord<T extends object>(
  record: Readonly<Record<string, T>>,
  kind: string,
  fields: readonly (keyof T & string)[],
): void {
  for (const [key, entry] of Object.entries(record)) localizeFields(entry, `content.${kind}.${key}`, fields);
}
