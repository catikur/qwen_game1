import { registerMessages } from './messages';
import { contentEn } from './i18n/en';

/**
 * İçerik metinlerinin dilleri (Tur 23). Türkçe ayrı bir sözlük değil:
 * içerik nesnelerinin kendi metinleri (`localize.ts`). Burada yalnızca
 * diğer diller kaydediliyor.
 */
registerMessages('en', contentEn);
