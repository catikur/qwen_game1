/**
 * Steam başarımlarının tablosu (Tur 70): Steamworks'e girilecek her şey.
 *
 *   node tools/run-node-script.mjs tools/steam/basarimlar.ts docs/steam
 *
 * Çıktı `basarimlar.csv`: API adı (`STEAM_ACHIEVEMENTS`), grup ve üç dilde
 * ad ile açıklama. Ad ve açıklama kariyer rozetinin kendisi (`title`,
 * `hint`), oyunun kendi sözlüklerinden; Steam'deki başarım oyundakiyle aynı
 * sözü söylüyor. Sütunlar Steamworks'ün dil adlarıyla (`english`,
 * `turkish`, `german`); İngilizce önde, çünkü Steam'in yedek dili o.
 *
 * Simgeler bu tablodan çiziliyor (`tools/steam/gorseller.mjs`); rozet
 * eklenince ya da metni değişince ikisi de yeniden koşulur.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENTS, STEAM_ACHIEVEMENTS, loadLocale, setLocale } from '../../packages/content/src/index';

const out = process.argv[2];
if (!out) {
  console.error('kullanım: node tools/run-node-script.mjs tools/steam/basarimlar.ts <çıktı dizini>');
  process.exit(2);
}

/** Steamworks'ün dil adı → oyunun dil kodu. */
const LANGUAGES = [
  ['english', 'en'],
  ['turkish', 'tr'],
  ['german', 'de'],
] as const;

const text = new Map<string, Record<string, { title: string; hint: string }>>();
for (const [steam, locale] of LANGUAGES) {
  if (locale !== 'tr' && !(await loadLocale(locale))) throw new Error(`dil yüklenemedi: ${locale}`);
  setLocale(locale);
  for (const def of ACHIEVEMENTS) {
    const row = text.get(def.id) ?? {};
    row[steam] = { title: def.title, hint: def.hint };
    text.set(def.id, row);
  }
}

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const header = ['api_name', 'group', ...LANGUAGES.flatMap(([steam]) => [`name_${steam}`, `desc_${steam}`])];
const lines = [header.join(',')];
for (const def of ACHIEVEMENTS) {
  const api = STEAM_ACHIEVEMENTS[def.id];
  if (!api) throw new Error(`Steam adı yok: ${def.id} (packages/content/src/steam.ts)`);
  const row = text.get(def.id)!;
  const fields = [api, def.group, ...LANGUAGES.flatMap(([steam]) => [row[steam]!.title, row[steam]!.hint])];
  if (fields.some((field) => !field.trim())) throw new Error(`boş alan: ${def.id}`);
  // Sözlükte anahtar yoksa metin Türkçe kalıyor; Steam'e yanlış dil gitmesin.
  for (const [steam] of LANGUAGES) {
    if (steam !== 'turkish' && row[steam]!.hint === row.turkish!.hint) throw new Error(`çevrilmemiş: ${def.id} (${steam})`);
  }
  lines.push(fields.map(cell).join(','));
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'basarimlar.csv'), `${lines.join('\n')}\n`);
console.log(`basarimlar.csv: ${ACHIEVEMENTS.length} başarım, ${LANGUAGES.length} dil`);
