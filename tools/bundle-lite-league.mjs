// Lig sunucusunu tek dosyaya paketler: Cloudflare panelinde Worker kodunun
// yerine yapıştırmak için (API anahtarı olmadan dağıtım).
// Kullanım: pnpm lite:league-bundle → packages/lite-league/dist/capitalforge-lite-league.js
import { execFileSync } from 'node:child_process';
import { findEsbuild } from './esbuild-path.mjs';

const esbuild = findEsbuild();
if (!esbuild) {
  console.error('esbuild bulunamadı — `pnpm install` çalıştırın.');
  process.exit(2);
}
const out = 'packages/lite-league/dist/capitalforge-lite-league.js';
execFileSync(
  esbuild,
  [
    'packages/lite-league/src/worker.ts',
    '--bundle',
    '--format=esm',
    '--platform=neutral',
    '--banner:js=// CapitalForge Lite lig sunucusu — packages/lite-league (tek dosya). Cloudflare panelinde Worker kodunun yerine yapıştır.',
    `--outfile=${out}`,
  ],
  { stdio: 'inherit' },
);
console.log(out);
