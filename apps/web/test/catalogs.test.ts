import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { translate } from '../../../packages/content/src/index';
import '../../../packages/core/src/i18n/index';
import { commands as trCommands } from '../../../packages/core/src/i18n/tr/commands';
import { markets as trMarkets } from '../../../packages/core/src/i18n/tr/markets';
import { worldPlay as trWorldPlay } from '../../../packages/core/src/i18n/tr/worldPlay';
import { finance as trFinance } from '../../../packages/ui/src/i18n/tr/finance';
import { trade as trTrade } from '../../../packages/ui/src/i18n/tr/trade';
import { panelsPlay as trPanelsPlay } from '../../../packages/ui/src/i18n/tr/panelsPlay';
import { hudPlay as trHudPlay } from '../../../packages/ui/src/i18n/tr/hudPlay';
import { panels as trPanels } from '../../../packages/ui/src/i18n/tr/panels';
import { hud as trHud } from '../../../packages/ui/src/i18n/tr/hud';
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
  // Tur 80: 'world' grubunun oyunun içindeki kısmı (`worldPlay`) da aynı kayıtta.
  const corePrefixes = [...new Set(Object.keys({ ...trCommands, ...trMarkets, ...trWorldPlay }).map((key) => key.split('.').slice(0, 2).join('.') + '.'))];
  const uses = (text: string, prefixes: readonly string[]) => prefixes.some((prefix) => text.includes(prefix));

  test('komut ve piyasa anahtarı yazan her çekirdek modülü sözlüğünü içe aktarıyor', () => {
    assert.ok(corePrefixes.length >= 34, corePrefixes.join(' '));
    const users = sources('packages/core/src').filter(([, text]) => uses(text, corePrefixes));
    assert.ok(users.length >= 28, `${users.length} kullanan modül`);
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

  test('hat anahtarı yazan her arayüz modülü sözlüğünü içe aktarıyor (Tur 77); uygulama hat anahtarı yazmıyor', () => {
    const tradeUse = (text: string) => /['"`]trade\./.test(text);
    assert.ok(Object.keys(trTrade).every((key) => key.startsWith('trade.')));
    const users = sources('packages/ui/src').filter(([, text]) => tradeUse(text));
    assert.ok(users.length >= 2, `${users.length} kullanan modül`);
    const missing = users.filter(([, text]) => !/^import '\.\/i18n\/tradeTr';$/m.test(text)).map(([file]) => file);
    assert.deepEqual(missing, [], 'tradeTr.ts içe aktarılmalı');
    assert.deepEqual(sources('apps/web/src').filter(([, text]) => tradeUse(text)).map(([file]) => file), []);
  });

  test('oyunun içindeki panel ve gösterge anahtarını yazan her arayüz modülü sözlüğünü içe aktarıyor (Tur 80); kurulumun anahtarları ayrı', () => {
    // Önek iki parçalı ('panels.build.', 'hud.agenda.'): kurulum ekranının
    // grupları ('panels.settings.', 'hud.scenario.') giriş sözlüğünde kalıyor.
    const prefixes = (keys: string[]) => new Set(keys.map((key) => key.split('.').slice(0, 2).join('.') + '.'));
    const play = prefixes(Object.keys({ ...trPanelsPlay, ...trHudPlay }));
    const setup = prefixes(Object.keys({ ...trPanels, ...trHud }));
    assert.deepEqual([...play].filter((prefix) => setup.has(prefix)), [], 'bir grup iki sözlüğe bölünmemeli');
    assert.ok(play.size >= 38, [...play].join(' '));
    const playUse = (text: string) => [...play].some((prefix) => new RegExp(`['"\`]${prefix.replace(/\./g, '\\.')}`).test(text));
    const users = sources('packages/ui/src').filter(([, text]) => playUse(text));
    assert.ok(users.length >= 17, `${users.length} kullanan modül`);
    const missing = users.filter(([, text]) => !/^import '\.\/i18n\/playTr';$/m.test(text)).map(([file]) => file);
    assert.deepEqual(missing, [], 'playTr.ts içe aktarılmalı');
    assert.deepEqual(sources('apps/web/src').filter(([, text]) => playUse(text)).map(([file]) => file), []);
  });

  test('geç inen sözlüklerin kaydı paketin yan etkileri arasında: yoksa paketleyici kaydı atıyor (Tur 77)', () => {
    // `import './i18n/tradeTr'` yalnız yan etki; listede olmayan dosyayı Vite
    // ağaç sallamada siliyor ve Türkçe oyunda ham anahtar görünüyor.
    const pkg = JSON.parse(readFileSync(join(repoRoot(), 'packages/ui/package.json'), 'utf8')) as { sideEffects: string[] };
    const registrations = readdirSync(join(repoRoot(), 'packages/ui/src/i18n')).filter((file) => /Tr\.ts$/.test(file));
    assert.deepEqual(registrations.sort(), ['financeTr.ts', 'playTr.ts', 'tradeTr.ts']);
    assert.deepEqual(registrations.filter((file) => !pkg.sideEffects.includes(`./src/i18n/${file}`)), []);
  });

  test('kurulumun okuduğu çekirdek metinleri girişte kayıtlı; oyunun metinleri değil', () => {
    const entry = readFileSync(join(repoRoot(), 'packages/core/src/i18n/index.ts'), 'utf8');
    assert.ok(!/^import \{[^}]*\} from '\.\/tr\/(commands|markets|worldPlay)';$/m.test(entry), 'giriş sözlüğü komut, piyasa ve oyunun dünya metinlerini değer olarak içe aktarmamalı');
    const ui = readFileSync(join(repoRoot(), 'packages/ui/src/i18n/index.ts'), 'utf8');
    assert.ok(!/^import \{[^}]*\} from '\.\/tr(\/finance|\/trade|\/panelsPlay|\/hudPlay)?';$/m.test(ui), 'arayüzün giriş sözlüğü finans, hat ve oyunun panel gruplarını değer olarak içe aktarmamalı');
    assert.equal(translate('core.scenario.scoreDays', { days: 3 }).includes('core.'), false);
  });
});

