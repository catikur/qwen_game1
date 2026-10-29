import { BASE_LOCALE, registerMessages } from '@capital/content';
import { finance } from './tr/finance';

/**
 * Finans panellerinin Türkçe metinleri (Tur 74): banka, borsa, meclis ve
 * ihale. Kurulum ekranı bunları okumuyor; giriş paketinde 3,7 KB (gzip)
 * yer tutuyorlardı. `finance.` anahtarı yazan her bileşen bu dosyayı
 * içe aktarıyor (`packages/core/test/i18n.test.ts` sınıyor).
 */
registerMessages(BASE_LOCALE, finance);
