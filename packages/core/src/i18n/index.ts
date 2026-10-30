import { BASE_LOCALE, registerLocaleLoader, registerMessages, translate } from '@capital/content';
import type { MessageParams } from '@capital/content';
import type { commands } from './tr/commands';
import type { markets } from './tr/markets';
import { world } from './tr/world';
import type { worldPlay } from './tr/worldPlay';

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
export type CoreKey = keyof typeof commands | keyof typeof markets | keyof typeof world | keyof typeof worldPlay;

/*
 * Burada yalnız 'world' grubu kayıtlı: kurulum ekranının da okuduğu metinler
 * (senaryo puanı, lig sonucu) onda. Grubun oyunun içinde üretilen kısmı
 * (haberler, ilişkiler, hedefler, kartlar) Tur 80'den beri `worldPlay`'de,
 * komutlarla birlikte `gameTr.ts`'te kayıtlı. Komut ve piyasa grupları oyunun içinde
 * üretiliyor; onları yazan modüller `gameTr.ts`'i içe aktarıyor, sözlük
 * simülasyonla birlikte geç inen parçada (Tur 74). Bütün Türkçe sözlük
 * testler için `tr/index.ts`'te.
 */
registerMessages(BASE_LOCALE, world);
registerLocaleLoader('en', () => import('./en').then((m) => registerMessages('en', m.coreEn)));
registerLocaleLoader('de', () => import('./de').then((m) => registerMessages('de', m.coreDe)));

/** Çekirdek metni: etkin dilde, yoksa Türkçe. */
export function tc(key: CoreKey, params?: MessageParams): string {
  return translate(key, params);
}
