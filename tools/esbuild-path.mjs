// esbuild'in yolunu bulur — betik koşucusu ile test koşucusu ortak.
//
// esbuild projenin doğrudan bağımlılığı değil, Vite üzerinden geliyor.
// pnpm onu kök `node_modules`'a bağlamadığı için önce normal çözümlemeyi
// deniyor, olmazsa mağazadan buluyoruz.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function findEsbuild() {
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
