import { BASE_LOCALE, registerMessages } from '@capital/content';
import { hudPlay } from './tr/hudPlay';
import { panelsPlay } from './tr/panelsPlay';

/**
 * Oyunun içindeki panellerin ve göstergenin Türkçe metinleri (Tur 80): yapı
 * menüsü, bina ve parsel, tahminler, rakipler, nakliye, santral, kira, proje,
 * kayıtlar, yardım; üst bar, gündem, holding, hedefler, kartlar, anlar.
 * Kurulum ekranı bunları okumuyor; giriş paketinde 12,4 KB (gzip) yer
 * tutuyorlardı. Bu anahtarları yazan her bileşen bu dosyayı içe aktarıyor
 * (`apps/web/test/catalogs.test.ts` sınıyor).
 */
registerMessages(BASE_LOCALE, { ...panelsPlay, ...hudPlay });
