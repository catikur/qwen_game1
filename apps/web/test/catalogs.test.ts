import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { translate } from '../../../packages/content/src/index';
import '../../../packages/core/src/i18n/index';
import { commands as trCommands } from '../../../packages/core/src/i18n/tr/commands';
import { markets as trMarkets } from '../../../packages/core/src/i18n/tr/markets';
import { finance as trFinance } from '../../../packages/ui/src/i18n/tr/finance';
/** Depo kökü: testler derlenip başka klasörden koşuyor, `pnpm-workspace.yaml`'a kadar çıkılıyor. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

/** Klasördeki kaynak dosyaları (alt klasörler dahil, sözlükler hariç): [yol, metin]. */
function sources(dir: string): Array<[string, string]> {
  const root = join(repoRoot(), dir);
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !file.split(/[\\/]/).includes('i18n'))
    .map((file) => [`${dir}/${file}`, readFileSync(join(root, file), 'utf8')]);
}

describe('geç inen Türkçe sözlükler (Tur 74)', () => {
  /*
   * Komut ve piyasa metinleri ile finans panellerinin metinleri giriş
   * paketinde değil: kaydı, anahtarlarını yazan modüllerle birlikte iniyor
   * (`gameTr.ts`, `financeTr.ts`). Kaydı içe aktarmayan bir modül Türkçe
   * oyunda ham anahtar gösterirdi; aynı parçada içe aktaran başka bir modül
   * olduğu için çoğu zaman fark edilmezdi.
   */
  const corePrefixes = [...new Set(Object.keys({ ...trCommands, ...trMarkets }).map((key) => key.split('.').slice(0, 2).join('.') + '.'))];
  const uses = (text: string, prefixes: readonly string[]) => prefixes.some((prefix) => text.includes(prefix));

  test('komut ve piyasa anahtarı yazan her çekirdek modülü sözlüğünü içe aktarıyor', () => {
    assert.ok(corePrefixes.length >= 14, corePrefixes.join(' '));
    const users = sources('packages/core/src').filter(([, text]) => uses(text, corePrefixes));
    assert.ok(users.length >= 10, `${users.length} kullanan modül`);
    const missing = users.filter(([, text]) => !/^import '(\.\.?\/)+i18n\/gameTr';$/m.test(text)).map(([file]) => file);
    assert.deepEqual(missing, [], 'gameTr.ts içe aktarılmalı');
  });

  test('finans anahtarı yazan her arayüz modülü sözlüğünü içe aktarıyor; uygulama finans anahtarı yazmıyor', () => {
    const financeUse = (text: string) => /['"`]finance\./.test(text);
    assert.ok(Object.keys(trFinance).every((key) => key.startsWith('finance.')));
    const users = sources('packages/ui/src').filter(([, text]) => financeUse(text));
    assert.ok(users.length >= 4, `${users.length} kullanan modül`);
    const missing = users.filter(([, text]) => !/^import '\.\/i18n\/financeTr';$/m.test(text)).map(([file]) => file);
    assert.deepEqual(missing, [], 'financeTr.ts içe aktarılmalı');
    // Uygulama kabuğu (apps/web) sözlüğü içe aktaramıyor: bu anahtarları arayüz bileşenleri yazıyor.
    const shell = sources('apps/web/src').filter(([, text]) => financeUse(text) || uses(text, corePrefixes)).map(([file]) => file);
    assert.deepEqual(shell, []);
  });

  test('kurulumun okuduğu çekirdek metinleri girişte kayıtlı; oyunun metinleri değil', () => {
    const entry = readFileSync(join(repoRoot(), 'packages/core/src/i18n/index.ts'), 'utf8');
    assert.ok(!/^import \{[^}]*\} from '\.\/tr\/(commands|markets)';$/m.test(entry), 'giriş sözlüğü komut ve piyasa grubunu değer olarak içe aktarmamalı');
    const ui = readFileSync(join(repoRoot(), 'packages/ui/src/i18n/index.ts'), 'utf8');
    assert.ok(!/^import \{[^}]*\} from '\.\/tr(\/finance)?';$/m.test(ui), 'arayüzün giriş sözlüğü finans grubunu değer olarak içe aktarmamalı');
    assert.equal(translate('core.scenario.scoreDays', { days: 3 }).includes('core.'), false);
  });
});

