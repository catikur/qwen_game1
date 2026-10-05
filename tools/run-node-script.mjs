// TypeScript bir motor betiğini Node altında çalıştırır.
//
// Bütün oturum boyunca esbuild komutunu elle yazıyorduk; bu dosya onu
// `pnpm balance` / `pnpm bench` haline getiriyor. esbuild zaten Vite'ın
// bağımlılığı olarak kurulu, ayrıca bir paket eklemiyoruz.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findEsbuild } from './esbuild-path.mjs';

const [entry, ...scriptArgs] = process.argv.slice(2);
if (!entry) {
  console.error('Kullanım: node tools/run-node-script.mjs <giriş.ts> [argümanlar…]');
  process.exit(2);
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
  execFileSync(process.execPath, [out, ...scriptArgs], { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
