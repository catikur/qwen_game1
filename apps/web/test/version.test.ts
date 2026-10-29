import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GAME_VERSION } from '../../../packages/core/src/worldgen';
import { CHANGELOG, CHANGELOG_LOCALES, changelogNotes } from '../../../packages/ui/src/changelog';
import { APP_VERSION, compareVersions } from '../../../packages/ui/src/version';

/**
 * Sürüm (Tur 74): tek sayı, yedi dosya. `tools/set-version.mjs` hepsini
 * birlikte değiştiriyor; bu test biri unutulursa ya da değişiklik
 * günlüğüne yeni sürümün girdisi yazılmazsa kırmızı.
 */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

const read = (file: string) => readFileSync(join(repoRoot(), file), 'utf8');
const jsonVersion = (file: string) => (JSON.parse(read(file)) as { version: string }).version;

/** Dosya başına okunan sürüm; okunamadıysa yok. */
function versions(): Record<string, string | undefined> {
  return {
    'package.json': jsonVersion('package.json'),
    'apps/web/package.json': jsonVersion('apps/web/package.json'),
    'apps/desktop/package.json': jsonVersion('apps/desktop/package.json'),
    'apps/desktop/src-tauri/tauri.conf.json': jsonVersion('apps/desktop/src-tauri/tauri.conf.json'),
    'apps/desktop/src-tauri/Cargo.toml': /^version\s*=\s*"([^"]+)"/m.exec(read('apps/desktop/src-tauri/Cargo.toml'))?.[1],
    'apps/desktop/src-tauri/Cargo.lock': /name = "capitalforge"\nversion = "([^"]+)"/.exec(read('apps/desktop/src-tauri/Cargo.lock'))?.[1],
    'packages/core/src/worldgen.ts': GAME_VERSION,
  };
}

describe('sürüm', () => {
  test('yedi dosyada aynı sürüm; biçimi büyük.küçük.yama', () => {
    const found = versions();
    const web = found['apps/web/package.json']!;
    assert.match(web, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(
      Object.entries(found).filter(([, version]) => version !== web),
      [],
      `hepsi ${web} olmalı: node tools/set-version.mjs ${web}`,
    );
  });

  test('derleme sürümü oyunun paketinden alıyor; testte tanımsız, "0.0.0"', () => {
    assert.match(read('apps/web/vite.config.ts'), /__CF_VERSION__: JSON\.stringify\(appPackage\.version\)/);
    assert.equal(APP_VERSION, '0.0.0');
  });

  test('sürüm karşılaştırması sayıyla: 1.10.0, 1.9.0\'dan yeni; eksik parça sıfır', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('0.2.0', '1.0.0'), -1);
    assert.equal(compareVersions('1.0', '1.0.0'), 0);
    assert.equal(compareVersions('bozuk', '0.0.1'), -1);
  });
});

describe('değişiklik günlüğü', () => {
  test('en yeni girdi oyunun sürümü; sürümler ve günler eskiye doğru sıralı', () => {
    assert.equal(CHANGELOG[0]?.version, versions()['apps/web/package.json'], 'yeni sürümün girdisi packages/ui/src/changelog.ts başına');
    for (let i = 1; i < CHANGELOG.length; i++) {
      assert.equal(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version), 1, `${CHANGELOG[i - 1]!.version} > ${CHANGELOG[i]!.version}`);
      assert.ok(CHANGELOG[i - 1]!.date >= CHANGELOG[i]!.date, CHANGELOG[i]!.version);
    }
    for (const entry of CHANGELOG) assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, entry.version);
  });

  test('her girdinin maddeleri üç dilde, aynı sayıda, boş madde yok', () => {
    for (const entry of CHANGELOG) {
      const counts = CHANGELOG_LOCALES.map((locale) => entry.notes[locale].length);
      assert.ok(counts[0]! > 0, entry.version);
      assert.deepEqual(new Set(counts).size, 1, `${entry.version}: ${counts.join('/')}`);
      for (const locale of CHANGELOG_LOCALES) {
        for (const note of entry.notes[locale]) assert.ok(note.trim().length > 10, `${entry.version} ${locale}: ${note}`);
      }
      // Türkçe harf yalnız Türkçede; Almancada ö ve ü var, ç ğ ı ş İ yok.
      assert.ok(entry.notes.en.every((note) => !/[çğıöşüÇĞİÖŞÜ]/.test(note)), `${entry.version} en`);
      assert.ok(entry.notes.de.every((note) => !/[çğışÇĞİŞ]/.test(note)), `${entry.version} de`);
    }
  });

  test('bilinmeyen dilde İngilizce maddeler', () => {
    const entry = CHANGELOG[0]!;
    assert.deepEqual(changelogNotes(entry, 'de'), entry.notes.de);
    assert.deepEqual(changelogNotes(entry, 'fr'), entry.notes.en);
  });
});
