import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GameEngine } from '../../../packages/core/src/engine';
import { GAME_VERSION, createNewGame } from '../../../packages/core/src/worldgen';
import { listSaves, loadGame, saveGame, setSaveBackend } from '../../../packages/persistence/src/index';
import { ACHIEVEMENTS, STEAM_ACHIEVEMENTS } from '../../../packages/content/src/index';
import type { Invoke, InvokeOptions } from '../src/desktop/bridge';
import { hydrate, isProfileKey, mirror } from '../src/desktop/profile';
import { fileSaves } from '../src/desktop/saves';
import { initSteam } from '../src/desktop/steam';
import { TEXT_INPUT_EVENT } from '../src/textInput';
import { keyVerdict, nativeFeel } from '../src/desktop/native';
import { TEXT_SCALE } from '../../../packages/ui/src/settings';

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

/** Kariyer deposunun sahtesi: açılmış rozetler ve değişiklik haberi. */
function fakeCareer(initial: string[]) {
  const unlocked = [...initial];
  const listeners = new Set<() => void>();
  return {
    unlocked,
    source: {
      unlockedIds: () => [...unlocked],
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    open(id: string) {
      unlocked.push(id);
      for (const listener of listeners) listener();
    },
    touch() {
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

/** Kabuğun Steam komutlarının sahtesi; `failUnlocks` kadar ilk bildirim reddediliyor. */
function fakeSteam(available: boolean, failUnlocks = 0) {
  const unlocks: string[][] = [];
  const keyboards: unknown[] = [];
  let failures = failUnlocks;
  const invoke = (async (command: string, args?: unknown) => {
    if (command === 'steam_status') return { available, detail: available ? "Steam'e bağlı" : 'Steam açık değil' };
    if (command === 'steam_unlock') {
      if (failures-- > 0) throw new Error('kabuk meşgul');
      unlocks.push((args as { names: string[] }).names);
      return null;
    }
    if (command === 'steam_keyboard') {
      keyboards.push(args);
      return true;
    }
    throw new Error(`beklenmeyen komut ${command}`);
  }) as Invoke;
  return { invoke, unlocks, keyboards };
}

/** Sayfanın penceresi yerine: yazı alanı haberi buradan geliyor. */
function fakeHost(devicePixelRatio: number) {
  const host = new EventTarget() as EventTarget & { devicePixelRatio: number };
  host.devicePixelRatio = devicePixelRatio;
  const field = (detail: { x: number; y: number; width: number; height: number }) =>
    host.dispatchEvent(new CustomEvent(TEXT_INPUT_EVENT, { detail }));
  return { host, field };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Steam başarımları (Tur 70)', () => {
  test('her rozetin Steam adı var: tekil, Steamworks biçiminde, fazlası yok', () => {
    const ids = ACHIEVEMENTS.map((def) => def.id).sort();
    assert.deepEqual(Object.keys(STEAM_ACHIEVEMENTS).sort(), ids);
    const names = Object.values(STEAM_ACHIEVEMENTS);
    assert.equal(new Set(names).size, names.length, 'iki rozet aynı adı taşıyor');
    for (const name of names) assert.match(name, /^CF_[A-Z0-9_]{1,124}$/);
  });

  test('açılışta açılmış rozetler gidiyor, sonra yalnız yeni açılanlar', async () => {
    const career = fakeCareer(['first_victory', 'blitz', 'bilinmeyen_rozet']);
    const steam = fakeSteam(true);
    const status = await initSteam(steam.invoke, career.source);
    assert.equal(status.available, true);
    await settle();
    assert.deepEqual(steam.unlocks, [['CF_FIRST_VICTORY', 'CF_BLITZ']], 'tabloda olmayan rozet atlanıyor');
    career.touch();
    await settle();
    assert.equal(steam.unlocks.length, 1, 'değişmeyen liste yeniden gitmiyor');
    career.open('empire');
    await settle();
    assert.deepEqual(steam.unlocks[1], ['CF_EMPIRE']);
  });

  test('Steam yoksa hiçbir şey gönderilmiyor, kariyer dinlenmiyor', async () => {
    const career = fakeCareer(['first_victory']);
    const steam = fakeSteam(false);
    const status = await initSteam(steam.invoke, career.source);
    assert.equal(status.available, false);
    career.open('empire');
    await settle();
    assert.deepEqual(steam.unlocks, []);
    assert.equal(career.listeners.size, 0);
  });

  test('gidemeyen bildirim bir sonraki değişiklikte yeniden deneniyor', async () => {
    const career = fakeCareer(['shield']);
    const steam = fakeSteam(true, 1);
    await initSteam(steam.invoke, career.source);
    await settle();
    assert.deepEqual(steam.unlocks, []);
    career.touch();
    await settle();
    assert.deepEqual(steam.unlocks, [['CF_SHIELD']]);
  });

  test('kumanda yazı alanını seçince Steam’in ekran klavyesi alanın yanında, fiziksel pikselde (Tur 72)', async () => {
    const steam = fakeSteam(true);
    const deck = fakeHost(1.5);
    await initSteam(steam.invoke, fakeCareer([]).source, deck.host);
    deck.field({ x: 100.4, y: 40, width: 320, height: 36.2 });
    await settle();
    assert.deepEqual(steam.keyboards, [{ x: 151, y: 60, width: 480, height: 54 }]);
    // Steam yoksa klavye de istenmiyor.
    const off = fakeSteam(false);
    const pc = fakeHost(1);
    await initSteam(off.invoke, fakeCareer([]).source, pc.host);
    pc.field({ x: 0, y: 0, width: 320, height: 36 });
    await settle();
    assert.deepEqual(off.keyboards, []);
  });

  test("kabuğun komut listesinde Steam'in üç komutu var", () => {
    const main = readFileSync(join(repoRoot(), 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
    const handler = /generate_handler!\[([^\]]*)\]/.exec(main)?.[1] ?? '';
    for (const command of ['steam_status', 'steam_unlock', 'steam_keyboard']) assert.ok(handler.includes(command), command);
  });
});

describe('uygulama gibi (Tur 71)', () => {
  const key = (code: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  test('tarayıcının kısayolları yutuluyor; oyunun, yazının ve macOS menüsünün kısayolları yerinde', () => {
    for (const code of ['F5', 'F3', 'F7', 'BrowserBack', 'BrowserRefresh']) assert.equal(keyVerdict(key(code)), 'browser', code);
    for (const code of ['KeyR', 'KeyP', 'KeyF', 'KeyG', 'KeyU', 'KeyS', 'KeyO', 'KeyJ', 'KeyH', 'KeyN', 'Equal', 'Minus', 'Digit0']) {
      assert.equal(keyVerdict(key(code, { ctrlKey: true })), 'browser', `Ctrl+${code}`);
    }
    assert.equal(keyVerdict(key('KeyR', { ctrlKey: true, shiftKey: true })), 'browser', 'Ctrl+Shift+R');
    for (const code of ['KeyR', 'KeyP', 'KeyF', 'Equal']) assert.equal(keyVerdict(key(code, { metaKey: true })), 'browser', `Cmd+${code}`);
    // macOS uygulama menüsü: sayfa yutarsa menü de çalışmıyor.
    for (const code of ['KeyH', 'KeyM', 'KeyW', 'KeyQ', 'KeyN']) assert.equal(keyVerdict(key(code, { metaKey: true })), null, `Cmd+${code}`);
    assert.equal(keyVerdict(key('ArrowLeft', { altKey: true })), 'browser', 'Alt+← geri');
    // Oyunun ve yazının tuşları.
    for (const code of ['Space', 'Digit1', 'Digit2', 'KeyW', 'KeyA', 'ArrowLeft', 'Escape', 'Tab', 'Enter', 'F12']) assert.equal(keyVerdict(key(code)), null, code);
    for (const code of ['KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY', 'KeyA']) assert.equal(keyVerdict(key(code, { ctrlKey: true })), null, `Ctrl+${code}`);
    assert.equal(keyVerdict(key('F11')), 'fullscreen');
    assert.equal(keyVerdict(key('Enter', { altKey: true })), 'fullscreen');
    assert.equal(keyVerdict(key('NumpadEnter', { altKey: true })), 'fullscreen');
  });

  test('AltGr ile yazılan harf ve macOS\'un sözcük gezinmesi yazı alanında yerinde (Cursor Bugbot)', () => {
    // Windows'ta AltGr = Ctrl+Alt: Almanca "}" (0), "\\" (ß), "@" (Q); Lehçe "ś", "ó", "ń".
    for (const code of ['Digit0', 'Minus', 'KeyQ', 'KeyS', 'KeyO', 'KeyN', 'KeyE']) {
      assert.equal(keyVerdict(key(code, { ctrlKey: true, altKey: true })), null, `AltGr+${code}`);
      assert.equal(keyVerdict(key(code, { ctrlKey: true, altKey: true }), true), null, `yazı alanında AltGr+${code}`);
    }
    assert.equal(keyVerdict(key('Enter', { ctrlKey: true, altKey: true })), null, 'AltGr+Enter tam ekran değil');
    // Option + ok macOS'ta sözcük sözcük gezinme; yazı alanının dışında tarayıcının geri tuşu.
    assert.equal(keyVerdict(key('ArrowLeft', { altKey: true }), true), null);
    assert.equal(keyVerdict(key('ArrowRight', { altKey: true }), true), null);
    assert.equal(keyVerdict(key('ArrowLeft', { altKey: true }), false), 'browser');
    // Yazı alanında da tarayıcının işi olanlar yutuluyor: yeniden yükle, yazdır, ara.
    for (const [code, mods] of [['F5', {}], ['KeyR', { ctrlKey: true }], ['KeyP', { ctrlKey: true }], ['KeyF', { metaKey: true }]] as const) {
      assert.equal(keyVerdict(key(code, mods), true), 'browser', code);
    }
  });

  /** Pencere yerine bir olay hedefi: `closest` yazı alanı mı diye, `getSelection` seçili metin. */
  class FakeWindow extends EventTarget {
    field = false;
    /** Alan bir `input` ise türü (yoksa yazı kutusu gibi `textarea`). */
    inputType: string | null = null;
    selection = '';
    closest(): unknown {
      if (!this.field) return null;
      return this.inputType === null ? { tagName: 'TEXTAREA' } : { tagName: 'INPUT', type: this.inputType };
    }
    getSelection() {
      return { toString: () => this.selection };
    }
  }
  const press = (target: EventTarget, code: string, extra: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const fire = (target: EventTarget, type: string) => {
    const event = new Event(type, { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  test('kısayol yutuluyor, oyunun dinleyicisine gitmiyor; F11 tam ekranı bir kez çeviriyor', () => {
    const target = new FakeWindow();
    let toggles = 0;
    const release = nativeFeel(target as unknown as Window, { toggleFullscreen: () => toggles++ });
    const game: string[] = [];
    target.addEventListener('keydown', (event) => game.push((event as KeyboardEvent).code));
    assert.equal(press(target, 'F5'), true);
    assert.equal(press(target, 'KeyR', { ctrlKey: true }), true);
    assert.equal(press(target, 'Space'), false, 'oyunun tuşu');
    assert.deepEqual(game, ['Space'], 'yutulan tuş oyunun dinleyicisine gitmiyor');
    assert.equal(press(target, 'F11'), true);
    assert.equal(press(target, 'F11', { repeat: true }), true, 'basılı tutulan F11 de yutuluyor');
    assert.equal(toggles, 1, 'basılı tutmak tam ekranı titretmiyor');
    assert.equal(press(target, 'Enter', { altKey: true }), true);
    assert.equal(toggles, 2);
    release();
    assert.equal(press(target, 'F5'), false, 'bırakılınca dinlemiyor');
  });

  test('yazı alanında AltGr ve Option + ok geçiyor, F5 yine yutuluyor; kaydırıcıda ve onay kutusunda Alt + ok yutuluyor', () => {
    const target = new FakeWindow();
    target.field = true;
    const release = nativeFeel(target as unknown as Window, { toggleFullscreen: () => undefined });
    for (const type of [null, 'text', 'search', 'number']) {
      target.inputType = type;
      assert.equal(press(target, 'Digit0', { ctrlKey: true, altKey: true }), false, `Almanca "}" (${type ?? 'textarea'})`);
      assert.equal(press(target, 'ArrowLeft', { altKey: true }), false, `Option + ← (${type ?? 'textarea'})`);
      assert.equal(press(target, 'F5'), true);
    }
    // Ayarlar'ın ses kaydırıcısı ve onay kutuları yazı alanı değil (Cursor Bugbot).
    for (const type of ['range', 'checkbox', 'radio', 'button']) {
      target.inputType = type;
      assert.equal(press(target, 'ArrowLeft', { altKey: true }), true, `Alt + ← (${type})`);
      assert.equal(fire(target, 'contextmenu'), true, `sağ tık (${type})`);
    }
    release();
  });

  test('sağ tık menüsü oyunda kapalı; yazı alanında ve seçili kodda açık; sürükleme kapalı', () => {
    const target = new FakeWindow();
    const release = nativeFeel(target as unknown as Window, { toggleFullscreen: () => undefined });
    assert.equal(fire(target, 'contextmenu'), true, 'oyunun üstünde');
    target.selection = 'ABC123';
    assert.equal(fire(target, 'contextmenu'), false, 'seçili davet kodu: kopyala menüsü');
    target.selection = '';
    target.field = true;
    assert.equal(fire(target, 'contextmenu'), false, 'yazı alanı: kes, kopyala, yapıştır');
    assert.equal(fire(target, 'dragstart'), false, 'yazı alanında metin sürüklenebiliyor');
    target.field = false;
    assert.equal(fire(target, 'dragstart'), true, 'görsel ya da metin pencereden dışarı sürüklenmiyor');
    release();
  });

  test("Steam Deck'in metni (çok büyük): arayüzün en küçük yazısı 12 pikseli geçiyor (Valve'ın okunabilirlik önerisi)", () => {
    // Bütün yazı boyları `calc(Npx * var(--text-scale))`; en küçük N burada. Tarayıcı
    // testi ("Pencere boyları ve Steam Deck") görünen metni de ölçüyor.
    const css = readFileSync(join(repoRoot(), 'packages/ui/src/styles.css'), 'utf8');
    const sizes = [...css.matchAll(/font-size:\s*calc\(([\d.]+)px \* var\(--text-scale\)/g)].map((match) => Number(match[1]));
    assert.ok(sizes.length > 100, `${sizes.length} yazı boyu`);
    const smallest = Math.min(...sizes);
    assert.ok(smallest * TEXT_SCALE.xlarge >= 12, `en küçük ${smallest} px × ${TEXT_SCALE.xlarge} = ${smallest * TEXT_SCALE.xlarge} px`);
  });

  test('kabuğun komut listesinde ortam bilgisi ve tam ekran var; pencerenin durumu hatırlanıyor', () => {
    const root = repoRoot();
    const main = readFileSync(join(root, 'apps/desktop/src-tauri/src/main.rs'), 'utf8');
    const handler = /generate_handler!\[([^\]]*)\]/.exec(main)?.[1] ?? '';
    for (const command of ['shell_info', 'fullscreen_toggle']) assert.ok(handler.includes(command), command);
    // Pencerenin hafızası kabuğun kendi modülünde (Codex): açılışta uygulanıyor,
    // taşıma ve boy değişimi izleniyor, çıkışta yazılıyor. Kararları Rust testleri sınıyor.
    for (const call of ['window::restore(', 'window::track(window)', 'window::closing(window)', 'window::persist(app)']) assert.ok(main.includes(call), call);
    assert.doesNotMatch(main, /tauri_plugin_window_state/, 'eklenti tam ekranda ekranın boyunu yazıyordu');
    const conf = JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8')) as {
      app: { windows: Array<{ minWidth: number; minHeight: number; maximized?: boolean }> };
    };
    const [window] = conf.app.windows;
    // İlk açılışın büyütülmesi kabuğun kararı (hafıza yoksa); yapılandırmadaki
    // bayrak hatırlanan pencere kipini her açılışta ezerdi.
    assert.equal(window?.maximized, undefined);
    // En küçük pencere tarayıcı testinin ölçtüğü en küçük boy (playtest: "Pencere boyları").
    assert.deepEqual([window?.minWidth, window?.minHeight], [960, 600]);
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
