import { BASE_LOCALE, registerMessages } from '@capital/content';
import { trade } from './tr/trade';

/**
 * Şehirler arası hatların Türkçe metinleri (Tur 77). Kurulum ekranı
 * bunları okumuyor; giriş paketinde 1,1 KB (gzip) yer tutuyorlardı
 * (ana parça 69,8 / 70 KB). `trade.` anahtarı yazan her bileşen bu dosyayı
 * içe aktarıyor (`apps/web/test/catalogs.test.ts` sınıyor).
 */
registerMessages(BASE_LOCALE, trade);
