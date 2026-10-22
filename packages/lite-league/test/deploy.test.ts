/**
 * Worker'ın paketine giren her dosya dağıtım iş akışını tetikliyor mu (Codex
 * #80). Sunucu ana oyunun koşu kodunu oyunun kendi çözücüsüyle açıyor; çözücü
 * çekirdeğin ve içeriğin yarısını getiriyor (CEO'lar, binalar...). Biri
 * değişip Worker yeniden dağıtılmazsa Pages'teki oyunun geçerli koşusu
 * sunucuda "bozuk" sayılırdı.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Testler geçici dizine paketlenip koşuyor: depo kökünü çalışma dizininden bul. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Depo kökü bulunamadı (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

/** İş akışının `push` tetikleyicisindeki yollar (main'e birleşince dağıtım). */
function pushPaths(workflow: string): string[] {
  const block = workflow.split(/^  push:\s*$/m)[1]?.split(/^  \S/m)[0] ?? '';
  return [...block.matchAll(/^\s+- '([^']+)'/gm)].map((match) => match[1]);
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split('**')
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${source}$`);
}

test('dağıtım: Worker paketine giren her dosya main\'e birleşince dağıtımı tetikliyor (Codex #80)', async () => {
  const root = repoRoot();
  const { findEsbuild } = (await import(pathToFileURL(join(root, 'tools/esbuild-path.mjs')).href)) as { findEsbuild: () => string | null };
  const esbuild = findEsbuild();
  assert.ok(esbuild, 'esbuild bulundu');
  const out = mkdtempSync(join(tmpdir(), 'capital-worker-'));
  try {
    // Paketleme betiğiyle aynı ayarlar (tools/bundle-lite-league.mjs).
    execFileSync(
      esbuild,
      [
        'packages/lite-league/src/worker.ts',
        '--bundle',
        '--format=esm',
        '--platform=neutral',
        `--outfile=${join(out, 'worker.js')}`,
        `--metafile=${join(out, 'meta.json')}`,
        '--log-level=warning',
      ],
      { cwd: root },
    );
    const inputs = Object.keys((JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8')) as { inputs: Record<string, unknown> }).inputs);
    const paths = pushPaths(readFileSync(join(root, '.github/workflows/lite-league.yml'), 'utf8'));
    assert.ok(paths.length > 0, 'iş akışında push yolları var');
    assert.ok(inputs.some((file) => file.startsWith('packages/content/')), 'paket içerikten de dosya alıyor');
    const patterns = paths.map(globToRegExp);
    const missed = inputs.filter((file) => !patterns.some((pattern) => pattern.test(file)));
    assert.deepEqual(missed, [], `dağıtımı tetiklemeyen paket dosyaları: ${missed.slice(0, 5).join(', ')}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
