import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GameEngine } from '../../../packages/core/src/engine';
import { GAME_VERSION, createNewGame } from '../../../packages/core/src/worldgen';
import { listSaves, loadGame, saveGame, setSaveBackend } from '../../../packages/persistence/src/index';
import type { InvokeOptions } from '../src/desktop/bridge';
import { hydrate, isProfileKey, mirror } from '../src/desktop/profile';
import { fileSaves } from '../src/desktop/saves';

/**
 * Masaüstü sürümü (Tur 66), sayfa tarafı: küçük kayıtların dosya aynası ve
 * kayıt slotlarının dosya deposu. Kabuğun kendisi (Rust) `cargo test`'te;
 * burada komutlar sahte, aynı sözleşmeyle.
 */

/** `Storage`'ın bellekte bir eşi; ayna onun prototipini sarıyor. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  [name: string]: unknown;
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

type Call = [string, string?];

function recordingSink(delays: number[] = []) {
  const calls: Call[] = [];
  let n = 0;
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delays[n++ % Math.max(delays.length, 1)] ?? 0));
  return {
    calls,
    sink: {
      async set(key: string, value: string) {
        await wait();
        calls.push([key, value]);
      },
      async remove(key: string) {
        await wait();
        calls.push([key]);
      },
    },
  };
}

let disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers) dispose();
  disposers = [];
  setSaveBackend(null);
});

describe('küçük kayıtlar dosyada', () => {
  test('açılışta dosya kazanıyor; dosyada olmayan oyun anahtarları geri dönüyor', () => {
    const storage = new MemoryStorage();
    storage.setItem('capitalforge.locale', 'en');
    storage.setItem('capitalforge.career.v1', '{"runs":3}');
    storage.setItem('başka.site', 'x');
    const missing = hydrate(storage, { 'capitalforge.locale': 'tr', 'capitalforge.settings.v1': '{"muted":true}', 'yabanci': 'y' });
    assert.equal(storage.getItem('capitalforge.locale'), 'tr');
    assert.equal(storage.getItem('capitalforge.settings.v1'), '{"muted":true}');
    assert.equal(storage.getItem('yabanci'), null);
    assert.deepEqual(missing, ['capitalforge.career.v1']);
  });

  test('her yazma ve silme dosyaya, geldiği sırayla; yavaş komut sırayı bozmuyor', async () => {
    const storage = new MemoryStorage();
    const { calls, sink } = recordingSink([15, 0, 5, 0]);
    const m = mirror(storage, sink);
    disposers.push(m.dispose);
    storage.setItem('capitalforge.settings.v1', 'a');
    storage.setItem('capitalforge.settings.v1', 'b');
    storage.removeItem('capitalforge.settings.v1');
    storage.setItem('capitalforge.locale', 'en');
    storage.setItem('dışarıdan', 'x');
    await m.idle();
    assert.deepEqual(calls, [
      ['capitalforge.settings.v1', 'a'],
      ['capitalforge.settings.v1', 'b'],
      ['capitalforge.settings.v1'],
      ['capitalforge.locale', 'en'],
    ]);
    // Yerel depo her zamanki gibi çalışıyor.
    assert.equal(storage.getItem('dışarıdan'), 'x');
    assert.equal(storage.getItem('capitalforge.locale'), 'en');
  });

  test('yalnız verilen depo: oturum deposu dosyaya gitmiyor; temizlemek oyun anahtarlarını siliyor', async () => {
    const storage = new MemoryStorage();
    const session = new MemoryStorage();
    const { calls, sink } = recordingSink();
    const m = mirror(storage, sink);
    disposers.push(m.dispose);
    session.setItem('capitalforge.locale', 'en');
    storage.setItem('capitalforge.locale', 'tr');
    storage.setItem('yabancı', '1');
    storage.clear();
    await m.idle();
    assert.deepEqual(calls, [['capitalforge.locale', 'tr'], ['capitalforge.locale']]);
    assert.equal(session.getItem('capitalforge.locale'), 'en');
    assert.equal(storage.length, 0);
  });

  test('bir yazma düşerse sonrakiler yine gidiyor; ayna kaldırılınca depo eski hâline dönüyor', async () => {
    const storage = new MemoryStorage();
    const calls: string[] = [];
    const warn = console.warn;
    console.warn = () => {};
    try {
      const m = mirror(storage, {
        async set(key, value) {
          if (value === 'bozuk') throw new Error('disk dolu');
          calls.push(`${key}=${value}`);
        },
        async remove() {},
      });
      storage.setItem('capitalforge.a', 'bozuk');
      storage.setItem('capitalforge.a', 'iyi');
      await m.idle();
      m.dispose();
      storage.setItem('capitalforge.a', 'sonra');
      await m.idle();
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(calls, ['capitalforge.a=iyi']);
    assert.equal(storage.getItem('capitalforge.a'), 'sonra');
  });

  test('oyunun yerel depoya yazdığı her anahtar dosyaya gidebiliyor', () => {
    // Arayüzün ve oyun kabuğunun kaynağında geçen bütün `capitalforge.*` anahtarları.
    const root = repoRoot();
    const keys = new Set<string>();
    for (const dir of ['packages/ui/src', 'apps/web/src']) {
      for (const file of readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })) {
        if (!/\.(ts|tsx)$/.test(file)) continue;
        for (const match of readFileSync(join(root, dir, file), 'utf8').matchAll(/'(capitalforge\.[a-zA-Z0-9._-]+)'/g)) keys.add(match[1]!);
      }
    }
    assert.ok(keys.size >= 10, `yalnız ${keys.size} anahtar bulundu`);
    for (const key of keys) assert.ok(isProfileKey(key), key);
    for (const key of ['capitalforge.', 'capitalforge.A', 'capitalforge.x.tmp', '../capitalforge.x', 'capitalforge./x', 'capital-game:save:0']) {
      assert.ok(!isProfileKey(key) || key === 'capitalforge.', key);
    }
  });
});

/** Kabuğun kayıt komutlarının sahtesi: slot başına bir "dosya". */
function fakeShell() {
  const files = new Map<number, Uint8Array>();
  const calls: string[] = [];
  const invoke = async <T>(command: string, args?: unknown, options?: InvokeOptions): Promise<T> => {
    calls.push(command);
    switch (command) {
      case 'save_write': {
        assert.ok(args instanceof Uint8Array, 'kayıt ham bayt olarak gitmeli');
        files.set(Number(options?.headers?.slot), args);
        return undefined as T;
      }
      case 'save_read': {
        const bytes = files.get((args as { slot: number }).slot) ?? new Uint8Array();
        return bytes.slice().buffer as T;
      }
      case 'save_list':
        return [...files.keys()].sort().map((slot) => JSON.parse(new TextDecoder().decode(files.get(slot))).meta) as T;
      case 'save_remove':
        files.delete((args as { slot: number }).slot);
        return undefined as T;
      default:
        throw new Error(`bilinmeyen komut ${command}`);
    }
  };
  return { files, calls, invoke };
}

describe('kayıt slotları dosyada', () => {
  test('kaydet, listele, yükle: şehir aynen geri geliyor', async () => {
    const shell = fakeShell();
    setSaveBackend(fileSaves(shell.invoke));
    const engine = new GameEngine(createNewGame({ seed: 66 }));
    for (let i = 0; i < 20; i++) engine.runDay();
    const state = engine.getState();

    await saveGame(state, 2, 'Masaüstü');
    await saveGame(state, 0);
    assert.deepEqual([...shell.files.keys()].sort(), [0, 2]);

    const metas = await listSaves();
    assert.deepEqual(metas.map((m) => [m.slot, m.name, m.day]), [[0, 'Otomatik kayıt', 20], [2, 'Masaüstü', 20]]);

    const loaded = await loadGame(2);
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.equal(loaded.state.time.day, 20);
    assert.equal(loaded.state.rng.s, state.rng.s);
    assert.equal(JSON.stringify(loaded.state), JSON.stringify(state));
  });

  test('boş slot "kayıt yok"; silinen slot listeden çıkıyor; tarayıcı deposuna dönülebiliyor', async () => {
    const shell = fakeShell();
    setSaveBackend(fileSaves(shell.invoke));
    const empty = await loadGame(4);
    assert.deepEqual(empty, { ok: false, reason: 'Bu slotta kayıt yok.' });

    await saveGame(new GameEngine(createNewGame({ seed: 7 })).getState(), 3);
    const { deleteSave } = await import('../../../packages/persistence/src/index');
    await deleteSave(3);
    assert.deepEqual(await listSaves(), []);
    assert.deepEqual(shell.calls, ['save_read', 'save_write', 'save_remove', 'save_list']);
  });
});

describe('sürüm', () => {
  test('masaüstü paketi oyunla aynı sürümde: tauri.conf, Cargo, package.json', () => {
    const root = repoRoot();
    const conf = JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8')) as { version: string };
    const pkg = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8')) as { version: string };
    const cargo = /^version = "([^"]+)"/m.exec(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8'))?.[1];
    assert.equal(conf.version, GAME_VERSION);
    assert.equal(pkg.version, GAME_VERSION);
    assert.equal(cargo, GAME_VERSION);
  });
});

/** Testler geçici dizine paketlenip koşuyor: depo kökünü çalışma dizininden bul. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('depo kökü bulunamadı');
    dir = parent;
  }
  return dir;
}
