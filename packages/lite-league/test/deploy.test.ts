/**
 * Worker'ın paketine giren her dosya dağıtım iş akışını tetikliyor mu (Codex
 * #80). Sunucu ana oyunun koşu kodunu oyunun kendi çözücüsüyle açıyor; çözücü
 * çekirdeğin ve içeriğin yarısını getiriyor (CEO'lar, binalar...). Biri
 * değişip Worker yeniden dağıtılmazsa Pages'teki oyunun geçerli koşusu
 * sunucuda "bozuk" sayılırdı. (Otomatik dağıtım açıkken: varsayılan kapalı,
 * canlıya geçiş kullanıcının kararı; aşağıdaki kapı testi.)
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

/** Dağıtım işinin kapı adımı (`id: secrets`): betiği ve adımın kendi ortamı. */
function gateStep(workflow: string): { script: string; env: Record<string, string> } {
  const deploy = workflow.split(/^  deploy:\s*$/m)[1] ?? '';
  const step = deploy.split(/^      - /m).find((block) => /^\s*id: secrets\s*$/m.test(block)) ?? '';
  const script = (step.split(/^        run: \|\s*$/m)[1] ?? '')
    .split('\n')
    .filter((line) => line.startsWith('          ') || line.trim() === '')
    .map((line) => line.slice(10))
    .join('\n');
  const env: Record<string, string> = {};
  const envBlock = step.split(/^        env:\s*$/m)[1]?.split(/^        \S/m)[0] ?? '';
  for (const [, name, value] of envBlock.matchAll(/^          (\w+): (.+)$/gm)) env[name] = value.trim();
  return { script, env };
}

test('dağıtım: main\'e birleşmek canlıya kendiliğinden dağıtmıyor; elle ya da açıkça açılmış otomatik dağıtımla (Codex #80)', () => {
  const root = repoRoot();
  const { script, env } = gateStep(readFileSync(join(root, '.github/workflows/lite-league.yml'), 'utf8'));
  assert.ok(script.includes('GITHUB_OUTPUT'), 'kapı adımı bulundu');
  const out = mkdtempSync(join(tmpdir(), 'capital-gate-'));
  try {
    const ready = (vars: Record<string, string>): string => {
      const output = join(out, 'output');
      execFileSync('bash', ['-c', `: > "${output}"\n${script}`], {
        env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, ...vars },
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return /ready=(\w+)/.exec(readFileSync(output, 'utf8'))?.[1] ?? '';
    };
    const secrets = { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'y' };
    // Kapı depo değişkeninden okuyor: adımın ortamında `vars.LITE_LEAGUE_AUTODEPLOY`.
    const auto = Object.entries(env).find(([, value]) => value.includes('vars.LITE_LEAGUE_AUTODEPLOY'))?.[0];
    assert.ok(auto, 'otomatik dağıtım depo değişkenine bağlı');
    assert.equal(ready({ GITHUB_EVENT_NAME: 'push' }), 'false', 'sır yoksa dağıtım yok');
    assert.equal(ready({ ...secrets, GITHUB_EVENT_NAME: 'push' }), 'false', 'sırlar var ama otomatik dağıtım açılmadı: birleşme canlıya gitmiyor');
    assert.equal(ready({ ...secrets, GITHUB_EVENT_NAME: 'workflow_dispatch' }), 'true', 'elle başlatılan koşu dağıtıyor');
    assert.equal(ready({ ...secrets, GITHUB_EVENT_NAME: 'push', [auto!]: 'true' }), 'true', 'açıkça açılmış otomatik dağıtım');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

/** İş akışının bir işi (`  <ad>:` satırından bir sonraki işe kadar). */
function job(workflow: string, name: string): string {
  return workflow.split(new RegExp(`^  ${name}:\\s*$`, 'm'))[1]?.split(/^  \S/m)[0] ?? '';
}

test('dağıtım: wrangler paketlemeden önce bağımlılıklar kuruluyor (Tur 71)', () => {
  // Çekirdek içeriği paket adıyla alıyor (`@capital/content`); kurulumsuz paketleme çözemiyordu.
  const deploy = job(readFileSync(join(repoRoot(), '.github/workflows/lite-league.yml'), 'utf8'), 'deploy');
  const install = deploy.indexOf('pnpm install --frozen-lockfile');
  const wrangler = deploy.indexOf('wrangler@4 deploy');
  assert.ok(wrangler > 0, 'dağıtım adımı bulundu');
  assert.ok(install > 0 && install < wrangler, 'bağımlılıklar dağıtımdan önce kuruluyor');
  assert.match(deploy, /deployed=true/, 'dağıtım yapıldığını canlı denetime söylüyor');
});

test('canlı denetim: dağıtımdan sonra koşuyor, simülasyonu depodakiyle karşılaştırıyor; main\'de katı (Tur 71)', () => {
  const smoke = job(readFileSync(join(repoRoot(), '.github/workflows/lite-league.yml'), 'utf8'), 'smoke');
  assert.match(smoke, /^    needs: deploy$/m, 'dağıtımı bekliyor');
  assert.match(smoke, /^    if: \$\{\{ !cancelled\(\) \}\}$/m, 'PR\'da dağıtım atlanınca da koşuyor');
  assert.match(smoke, /packages\/lite-league\/scripts\/sim-check\.ts "\$URL" \$STRICT \$WAIT/);
  assert.match(smoke, /STRICT: \$\{\{ github\.event_name != 'pull_request' && '--strict' \|\| '' \}\}/, 'PR dışında katı');
  assert.match(smoke, /WAIT: \$\{\{ needs\.deploy\.outputs\.deployed == 'true' && '--wait' \|\| '' \}\}/, 'az önce dağıtıldıysa bekliyor');
});
