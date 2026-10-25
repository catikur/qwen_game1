#!/usr/bin/env node
/**
 * Steam deposu (Tur 70): `tauri build --features steam` çıktısını Steam'e
 * yüklenecek klasöre koyar. Kullanım:
 *
 *   pnpm --filter @capital/desktop exec tauri build --features steam --no-bundle   # Windows, Linux
 *   pnpm --filter @capital/desktop exec tauri build --features steam --bundles app --target universal-apple-darwin # macOS
 *   node tools/steam-depot.mjs <klasör>
 *
 * Steam kurulum paketi istemiyor, klasör istiyor (`docs/STEAM.md`). Klasörde
 * oyunun kendisi ve Steamworks'ün kütüphanesi yan yana: Windows'ta
 * `capitalforge.exe` + `steam_api64.dll` + WebView2'nin kurulum betiği
 * (`docs/steam/steampipe/installscript_win.vdf`; kurucunun kendisini CI
 * Microsoft'tan indiriyor), Linux'ta `capitalforge` +
 * `libsteam_api.so` (rpath `$ORIGIN`), macOS'ta `CapitalForge.app` ve
 * içinde `Contents/MacOS/libsteam_api.dylib` (rpath `@executable_path`).
 * macOS'ta evrensel derleme (`universal-apple-darwin`) varsa o, yoksa
 * makinenin kendi mimarisi; SDK'nın dylib'i iki mimariyi de taşıyor.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) {
  console.error('kullanım: node tools/steam-depot.mjs <klasör>');
  process.exit(2);
}
// fileURLToPath: Windows'ta da sürücü harfli yol (`D:\a\…`).
const root = fileURLToPath(new URL('..', import.meta.url));
const target = join(root, 'apps/desktop/src-tauri/target');
const release = join(target, 'release');
const LIBRARY = { win32: 'steam_api64.dll', linux: 'libsteam_api.so', darwin: 'libsteam_api.dylib' }[process.platform];
if (!LIBRARY) throw new Error(`desteklenmeyen işletim sistemi: ${process.platform}`);

/** steamworks-sys kütüphaneyi derlemenin çıktı klasörüne kopyalıyor. */
function library() {
  const releases = [release, join(target, 'aarch64-apple-darwin/release'), join(target, 'x86_64-apple-darwin/release')];
  for (const build of releases.map((dir) => join(dir, 'build'))) {
    for (const dir of existsSync(build) ? readdirSync(build) : []) {
      if (!dir.startsWith('steamworks-sys-')) continue;
      const candidate = join(build, dir, 'out', LIBRARY);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(`${LIBRARY} bulunamadı: önce \`tauri build --features steam\``);
}

function need(path) {
  if (!existsSync(path)) throw new Error(`yok: ${path} (önce \`tauri build --features steam\`)`);
  return path;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const lib = library();
if (process.platform === 'darwin') {
  const universal = join(target, 'universal-apple-darwin/release/bundle/macos/CapitalForge.app');
  const app = existsSync(universal) ? universal : need(join(release, 'bundle/macos/CapitalForge.app'));
  cpSync(app, join(out, 'CapitalForge.app'), { recursive: true });
  cpSync(lib, join(out, 'CapitalForge.app/Contents/MacOS', LIBRARY));
} else {
  const exe = process.platform === 'win32' ? 'capitalforge.exe' : 'capitalforge';
  cpSync(need(join(release, exe)), join(out, exe));
  cpSync(lib, join(out, LIBRARY));
  if (process.platform === 'win32') {
    cpSync(join(root, 'docs/steam/steampipe/installscript_win.vdf'), join(out, 'installscript_win.vdf'));
  }
}
console.log(`Steam deposu: ${out}`);
for (const entry of readdirSync(out)) console.log(`  ${entry}`);
