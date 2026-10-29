// Oyunun sürümünü bütün dosyalarda birlikte değiştirir (Tur 74).
//
// Çalıştırma: node tools/set-version.mjs 1.0.1
//
// Sürüm tek bir sayı ama yedi dosyada duruyor: oyunun kendisi
// (`apps/web/package.json`, derlemeye `__CF_VERSION__` olarak giriyor),
// çekirdeğin `GAME_VERSION`'ı (kaydın künyesine yazılıyor), depo kökü,
// masaüstü paketi, Tauri'nin yapılandırması (işletim sisteminin gördüğü
// sürüm), Rust paketi ve onun kilit dosyası. Elle
// değiştirilince biri unutuluyordu; `apps/web/test/version.test.ts`
// hepsinin aynı olduğunu ve değişiklik günlüğünün (`packages/ui/src/changelog.ts`)
// en yeni girdisinin bu sürüm olduğunu sınıyor. Günlüğün girdisini bu araç
// yazmıyor: maddeleri insan yazar (üç dilde), `docs/YAYIN.md` → "Sürüm".
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const version = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Kullanım: node tools/set-version.mjs <büyük.küçük.yama>, örneğin 1.0.1');
  process.exit(1);
}

/** Dosyayı okur, değiştirir, değişmediyse söyler (kalıp tutmadı demek). */
function rewrite(file, change) {
  const full = join(root, file);
  const before = readFileSync(full, 'utf8');
  const after = change(before);
  if (after === before && !before.includes(version)) throw new Error(`${file}: sürüm satırı bulunamadı`);
  writeFileSync(full, after);
  console.log(`  ${file}`);
}

const jsonVersion = (text) => text.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`);

console.log(`Sürüm ${version}:`);
rewrite('package.json', jsonVersion);
rewrite('apps/web/package.json', jsonVersion);
rewrite('packages/core/src/worldgen.ts', (text) => text.replace(/(export const GAME_VERSION = )'[^']*'/, `$1'${version}'`));
rewrite('apps/desktop/package.json', jsonVersion);
rewrite('apps/desktop/src-tauri/tauri.conf.json', jsonVersion);
rewrite('apps/desktop/src-tauri/Cargo.toml', (text) => text.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${version}"`));
rewrite('apps/desktop/src-tauri/Cargo.lock', (text) => text.replace(/(name = "capitalforge"\nversion = )"[^"]*"/, `$1"${version}"`));
console.log('Değişiklik günlüğüne bu sürümün girdisini ekle: packages/ui/src/changelog.ts (üç dilde).');
