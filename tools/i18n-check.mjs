#!/usr/bin/env node
/**
 * Çeviri denetimi (Tur 69): `node tools/i18n-check.mjs de`
 *
 * Bir dilin bütün sözlüklerini İngilizce eşleriyle karşılaştırıyor. Birim
 * testi (`packages/core/test/i18n.test.ts`) aynı kuralları zorunlu tutuyor;
 * bu betik çevirmen için: hangi dosyada ne eksik, hangi metin İngilizceyle
 * aynı kalmış, hangi kısa etiket çok uzamış.
 *
 * Hata (çıkış 1): eksik ya da fazla anahtar, farklı yer tutucu, Türkçeye
 * özgü harf (ç ğ ı ş İ), bozuk süslü parantez, "(s)" gibi çoğul eki.
 * Uyarı: İngilizcede tekil/çoğul biçimi olup çeviride olmayan metin,
 * İngilizceyle aynı uzun metin, iki katına yakın uzamış kısa etiket.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findEsbuild } from './esbuild-path.mjs';

const locale = process.argv[2];
if (!locale || !/^[a-z]{2}$/.test(locale) || locale === 'tr' || locale === 'en') {
  console.error('kullanım: node tools/i18n-check.mjs <dil kodu, ör. de>');
  process.exit(2);
}
const root = resolve(new URL('..', import.meta.url).pathname);
const at = (file) => join(root, file);

/** [ad, İngilizce dosya, dışa aktarım, çeviri dosyası, dışa aktarım] */
const PAIRS = [
  ['içerik', 'packages/content/src/i18n/en.ts', 'contentEn', `packages/content/src/i18n/${locale}.ts`, `content${cap(locale)}`],
  ['çekirdek · komutlar', 'packages/core/src/i18n/en/commands.ts', 'commands', `packages/core/src/i18n/${locale}/commands.ts`, 'commands'],
  ['çekirdek · piyasalar', 'packages/core/src/i18n/en/markets.ts', 'markets', `packages/core/src/i18n/${locale}/markets.ts`, 'markets'],
  ['çekirdek · dünya', 'packages/core/src/i18n/en/world.ts', 'world', `packages/core/src/i18n/${locale}/world.ts`, 'world'],
  ['arayüz · uygulama', 'packages/ui/src/i18n/en/app.ts', 'app', `packages/ui/src/i18n/${locale}/app.ts`, 'app'],
  ['arayüz · finans', 'packages/ui/src/i18n/en/finance.ts', 'finance', `packages/ui/src/i18n/${locale}/finance.ts`, 'finance'],
  ['arayüz · HUD', 'packages/ui/src/i18n/en/hud.ts', 'hud', `packages/ui/src/i18n/${locale}/hud.ts`, 'hud'],
  ['arayüz · paneller', 'packages/ui/src/i18n/en/panels.ts', 'panels', `packages/ui/src/i18n/${locale}/panels.ts`, 'panels'],
  ['paket rafı', 'packages/ui/src/packMessages.ts', 'packEn', `packages/ui/src/packMessages.${locale}.ts`, `pack${cap(locale)}`],
  ['editör', 'packages/ui/src/packEditorMessages.ts', 'editorEn', `packages/ui/src/packEditorMessages.${locale}.ts`, `editor${cap(locale)}`],
];

function cap(text) {
  return text[0].toUpperCase() + text.slice(1);
}

const esbuild = findEsbuild();
if (!esbuild) {
  console.error('esbuild bulunamadı — `pnpm install` çalıştırın.');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
const present = PAIRS.filter(([, , , file]) => existsSync(at(file)));
const absent = PAIRS.filter(([, , , file]) => !existsSync(at(file)));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  present
    .map(([, en, enName, other, otherName], i) => `export { ${enName} as en${i} } from '${at(en)}';\nexport { ${otherName} as tr${i} } from '${at(other)}';`)
    .join('\n'),
);
const bundle = join(dir, 'entry.mjs');
execFileSync(esbuild, [entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=error']);
const modules = await import(bundle);
rmSync(dir, { recursive: true, force: true });

const SLOT = /\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g;
const placeholders = (text) => [...text.matchAll(SLOT)].map((m) => m[1]).sort().join(',');
const plurals = (text) => [...text.matchAll(/\{(\w+)\|[^|{}]*\|[^|{}]*\}/g)].map((m) => m[1]).sort().join(',');
const stray = (text) => (text.replace(SLOT, '').match(/[{}]/g) ?? []).length;

let errors = 0;
let warnings = 0;
for (const [name, , , file] of absent) {
  console.log(`HATA  ${name}: dosya yok (${file})`);
  errors++;
}
present.forEach(([name, , , file], i) => {
  const en = modules[`en${i}`];
  const other = modules[`tr${i}`];
  const lines = [];
  const error = (text) => lines.push(`  HATA   ${text}`) && errors++;
  const warn = (text) => lines.push(`  uyarı  ${text}`) && warnings++;
  for (const key of Object.keys(en)) if (!(key in other)) error(`eksik: ${key}`);
  for (const key of Object.keys(other)) if (!(key in en)) error(`fazla: ${key}`);
  for (const [key, text] of Object.entries(other)) {
    const source = en[key];
    if (source === undefined) continue;
    if (typeof text !== 'string' || text.trim() === '') { error(`boş: ${key}`); continue; }
    if (placeholders(text) !== placeholders(source)) error(`yer tutucular farklı: ${key}\n           en: ${source}\n           ${locale}: ${text}`);
    if (/[çğışÇĞİŞ]/.test(text)) error(`Türkçe harf: ${key}: ${text}`);
    if (stray(text) !== stray(source)) error(`süslü parantez bozuk: ${key}: ${text}`);
    if (/\((s|e|n|en)\)/.test(text)) error(`"(s)" biçiminde çoğul; {n|# …|# …} kullan: ${key}: ${text}`);
    if (plurals(source) && !plurals(text)) warn(`tekil/çoğul biçimi yok (1 ile dene): ${key}: ${text}`);
    // Yalnız yer tutucu ve işaretten oluşan metin ("{value} / {target}") çevrilmiyor.
    const words = source.replace(SLOT, '').match(/\p{L}{2,}/gu) ?? [];
    if (text === source && words.length >= 2) warn(`İngilizceyle aynı: ${key}: ${text}`);
    if (source.length <= 24 && text.length > Math.max(source.length * 1.7, source.length + 10)) {
      warn(`kısa etiket uzadı (${source.length}→${text.length}): ${key}: "${source}" → "${text}"`);
    }
  }
  console.log(`${lines.some((line) => line.includes('HATA')) ? '✗' : lines.length ? '!' : '✓'} ${name} — ${Object.keys(other).length}/${Object.keys(en).length} anahtar (${file})`);
  for (const line of lines) console.log(line);
});
console.log(`\n${locale}: ${errors} hata, ${warnings} uyarı`);
process.exit(errors ? 1 : 0);
