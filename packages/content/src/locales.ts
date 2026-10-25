import { registerLocaleLoader, registerMessages } from './messages';

/**
 * İçerik metinlerinin dilleri (Tur 23). Türkçe ayrı bir sözlük değil:
 * içerik nesnelerinin kendi metinleri (`localize.ts`). Burada yalnızca
 * diğer diller kaydediliyor; sözlük dil seçilince iniyor (Tur 46).
 */
registerLocaleLoader('en', () => import('./i18n/en').then((m) => registerMessages('en', m.contentEn)));
// Almanca (Tur 69): aynı anahtarlar, aynı geç iniş.
registerLocaleLoader('de', () => import('./i18n/de').then((m) => registerMessages('de', m.contentDe)));
