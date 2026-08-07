// TypeScript bir motor betiğini Node altında çalıştırır.
//
// Bütün oturum boyunca esbuild komutunu elle yazıyorduk; bu dosya onu
// `pnpm balance` / `pnpm bench` haline getiriyor. esbuild zaten Vite'ın
// bağımlılığı olarak kurulu, ayrıca bir paket eklemiyoruz.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const entry = process.argv[2];
if (!entry) {
  console.error('Kullanım: node tools/run-node-script.mjs <giriş.ts>');
  process.exit(2);
}

// esbuild projenin doğrudan bağımlılığı değil, Vite üzerinden geliyor.
// pnpm onu kök `node_modules`'a bağlamadığı için önce normal çözümlemeyi
// deniyor, olmazsa mağazadan buluyoruz.
const require = createRequire(import.meta.url);
function findEsbuild() {
  try {
    return require.resolve('esbuild/bin/esbuild');
  } catch {
    /* pnpm mağazasına bak */
  }
  const store = new URL('../node_modules/.pnpm/', import.meta.url).pathname;
  if (!existsSync(store)) return null;
  const match = readdirSync(store)
    .filter((name) => name.startsWith('esbuild@'))
    .sort()
    .pop();
  if (!match) return null;
  const candidate = join(store, match, 'node_modules', 'esbuild', 'bin', 'esbuild');
  return existsSync(candidate) ? candidate : null;
}

const esbuild = findEsbuild();
if (!esbuild) {
  console.error('esbuild bulunamadı — `pnpm install` çalıştırın.');
  process.exit(2);
}

const out = join(mkdtempSync(join(tmpdir(), 'capital-')), 'bundle.mjs');
execFileSync(esbuild, [entry, '--bundle', '--platform=node', '--format=esm', `--outfile=${out}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
});

try {
  execFileSync(process.execPath, [out], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
