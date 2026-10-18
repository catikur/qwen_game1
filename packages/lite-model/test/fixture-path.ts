import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Swift test paketinin okuduğu fikstür dosyası.
 *
 * Kök, çalışma dizininden yukarı doğru aranıyor: betikler ve testler esbuild
 * ile geçici bir dizine paketlenip oradan koşuyor, `import.meta.url` kaynağı
 * göstermiyor.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

export const FIXTURE_PATH = join(repoRoot(), 'ios-lite/Kit/Tests/CapitalForgeLiteKitTests/Fixtures/scenarios.json');
