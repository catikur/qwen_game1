// Birim testleri: `packages/*/test/*.test.ts`.
//
// Eski `pnpm test` komutu `node --test --experimental-strip-types` ile
// hiç var olmayan dosyaları arıyordu ve SIFIR testle "geçti" diyordu.
// Ayrıca çekirdeğin göreli içe aktarmaları uzantısız ('./actions'),
// Node'un tip soyucusu bunları çözemez. Bu koşucu her test dosyasını
// esbuild ile tek parça yapıp `node --test`'e veriyor; test bulamazsa
// başarısız sayıyor — yeşil, ancak gerçekten koşan bir şeyin yeşili.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { findEsbuild } from './esbuild-path.mjs';

const root = new URL('..', import.meta.url).pathname;
const files = [];
for (const pkg of readdirSync(join(root, 'packages'))) {
  const dir = join(root, 'packages', pkg, 'test');
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) if (name.endsWith('.test.ts')) files.push(join(dir, name));
}
const filter = process.argv[2];
const selected = filter ? files.filter((f) => f.includes(filter)) : files;
if (selected.length === 0) {
  console.error(filter ? `"${filter}" ile eşleşen test dosyası yok.` : 'Hiç test dosyası bulunamadı.');
  process.exit(1);
}

const esbuild = findEsbuild();
if (!esbuild) {
  console.error('esbuild bulunamadı — `pnpm install` çalıştırın.');
  process.exit(2);
}

const outDir = mkdtempSync(join(tmpdir(), 'capital-test-'));
const bundles = selected.map((file) => {
  const pkg = basename(join(file, '..', '..'));
  const out = join(outDir, `${pkg}-${basename(file, '.ts')}.mjs`);
  execFileSync(esbuild, [file, '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return out;
});

try {
  execFileSync(process.execPath, ['--test', '--test-reporter=spec', ...bundles], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
