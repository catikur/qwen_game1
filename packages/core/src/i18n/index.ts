import { BASE_LOCALE, registerMessages, translate } from '@capital/content';
import type { MessageParams } from '@capital/content';
import { commands } from './tr/commands';
import { markets } from './tr/markets';
import { world } from './tr/world';
import { commands as commandsEn } from './en/commands';
import { markets as marketsEn } from './en/markets';
import { world as worldEn } from './en/world';

/**
 * Çekirdeğin ürettiği metinler (Tur 23): haberler, komut ret sebepleri,
 * gündem etiketleri, hedef ayrıntıları, tahmin notları.
 *
 * Simülasyon metni OKUMUYOR, yalnızca üretiyor: aynı tohum her dilde aynı
 * oyunu oynar. Üretilen metin (haber, sözleşme ve önerge başlığı) state'e
 * o günün diliyle yazılıyor; dil oyun ortasında değişirse eski haberler
 * yazıldıkları dilde kalır, yenileri yeni dilde gelir.
 *
 * Türkçe sözlük üç grup modülünde; her modül yalnızca kendi dosyalarının
 * anahtarlarını taşıyor ('core.<dosya>.<ad>'). İngilizce karşılıkları
 * `en/` altında, aynı anahtar kümesiyle (tip denetimi eksik anahtarı yakalıyor).
 */
export const coreTr = { ...commands, ...markets, ...world } as const;
export type CoreKey = keyof typeof coreTr;

registerMessages(BASE_LOCALE, coreTr);
registerMessages('en', { ...commandsEn, ...marketsEn, ...worldEn });

/** Çekirdek metni: etkin dilde, yoksa Türkçe. */
export function tc(key: CoreKey, params?: MessageParams): string {
  return translate(key, params);
}
