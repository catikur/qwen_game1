/**
 * Tanıtım kareleri için büyümüş şehirler (Tur 50).
 *
 * Oyunun denge vekili (`packages/core/test/proxy.ts`) oyunun önerdiği gibi
 * oynuyor: zincir kartının hamlesi, fırsat lensinin gösterdiği mağaza,
 * baskına karşı savunma. Sabit tohum, aynı şehir hep aynı. Haberler state'e
 * yazılırken dile dökülüyor; bu yüzden her dil ayrı koşuluyor.
 *
 *   node tools/run-node-script.mjs tools/tanitim/sehir.ts <çıktı dizini>
 *
 * Çıktı: <dil>-orta.json (516. gün). `tools/tanitim/kareler.mjs` bunu oyuna
 * yüklüyor (`engine.replaceState`).
 *
 * Gün Tur 70'te 420'den 516'ya geçti: mevsimlerden (Tur 62) beri 420. gün
 * kışın sonu, yerde kar. 516–527 bu tohumda on iki gün açık hava, yaz başı;
 * kareler ve Steam görselleri (`tools/steam/gorseller.mjs`) o pencerede.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadLocale, setLocale } from '../../packages/content/src/index';
import { GameEngine, createNewGame } from '../../packages/core/src/index';
import { defendAgainstRaids, playerStrategy } from '../../packages/core/test/proxy';

const out = process.argv[2];
if (!out) {
  console.error('kullanım: node tools/run-node-script.mjs tools/tanitim/sehir.ts <çıktı dizini>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

// Almanca Tur 70'te (Steam'in Almanca sayfası).
const NAMES: Record<string, string> = { tr: 'Deniz Ticaret', en: 'Harbor Trading', de: 'Hafenhandel' };
const SEED = 42;
const MID_DAY = 516;

for (const locale of Object.keys(NAMES)) {
  await loadLocale(locale);
  setLocale(locale);
  const engine = new GameEngine(createNewGame({ seed: SEED, companyName: NAMES[locale]! }));
  for (let day = 1; day <= MID_DAY; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    if (day % 3 === 0) defendAgainstRaids(engine);
    engine.runDay();
  }
  const state = engine.getState();
  writeFileSync(join(out, `${locale}-orta.json`), JSON.stringify(state));
  console.log(`${locale}: ${MID_DAY}. gün, ${Object.keys(state.buildings).length} bina`);
}
