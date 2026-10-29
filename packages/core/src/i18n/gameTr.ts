import { BASE_LOCALE, registerMessages } from '@capital/content';
import { commands } from './tr/commands';
import { markets } from './tr/markets';

/**
 * Oyunun içinde üretilen Türkçe metinler (Tur 74): komut ret sebepleri,
 * gündem, holding, zincir ve rekabet kartları, banka, işgücü, meclis,
 * ihale, emirler, hisse. Kurulum ekranı bunları okumuyor; giriş paketinde
 * 8 KB (gzip) yer tutuyorlardı.
 *
 * Bu grupların anahtarlarını yazan her modül bu dosyayı içe aktarıyor:
 * sözlük onlarla, yani simülasyonla birlikte geç inen parçada.
 * `packages/core/test/i18n.test.ts` içe aktarmayan modülü yakalıyor.
 */
registerMessages(BASE_LOCALE, { ...commands, ...markets });
