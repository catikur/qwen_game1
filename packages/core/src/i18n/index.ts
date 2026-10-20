import { BASE_LOCALE, registerLocaleLoader, registerMessages, translate } from '@capital/content';
import type { MessageParams } from '@capital/content';
import { commands } from './tr/commands';
import { markets } from './tr/markets';
import { world } from './tr/world';

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
 * `en/` altında, aynı anahtar kümesiyle (tip denetimi eksik anahtarı yakalıyor);
 * dil seçilince iniyor (Tur 46).
 */
export const coreTr = { ...commands, ...markets, ...world } as const;
export type CoreKey = keyof typeof coreTr;

registerMessages(BASE_LOCALE, coreTr);
registerLocaleLoader('en', () => import('./en').then((m) => registerMessages('en', m.coreEn)));

/** Çekirdek metni: etkin dilde, yoksa Türkçe. */
export function tc(key: CoreKey, params?: MessageParams): string {
  return translate(key, params);
}
