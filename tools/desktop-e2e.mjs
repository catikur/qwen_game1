// Masaüstü sürümü (Tur 66): derlenmiş oyun gerçek penceresinde, uçtan uca.
//
// tauri-driver, WebKitWebDriver'ın (Linux'un WebKitGTK'si: oyunun Linux'ta
// koştuğu motorun kendisi) önüne geçip derlenmiş ikiliyi açıyor; test
// WebDriver'la konuşuyor. Veri dizini geçici (`CAPITALFORGE_DATA_DIR`),
// dışa aktarma da (`CAPITALFORGE_EXPORT_DIR`). Denetlenen:
// - kabuk köprüsü açık, hizmet çalışanı ve manifest yok, şehir çiziliyor;
// - slota kayıt `saves/slot-N.json`'a gidiyor, liste dosyadan geliyor;
// - dışa aktarılan kayıt ve şehir kartı İndirilenler'e (PNG 1200 × 630);
// - ayar dosyaya gidiyor; pencere kapanırken oyun otomatik kayda yazıyor;
// - yeniden açılınca oyun kaldığı günden, seçilen dilde açılıyor;
// - Steam komutları kabukta (Steam'siz derlemede "kapalı"), ikinci kopya
//   açılmıyor, var olan pencere öne geliyor (Tur 70; D-Bus oturumu varsa);
// - oyun bir web sayfası gibi davranmıyor (Tur 71): tarayıcı kısayolları ve
//   sağ tık menüsü kapalı, metin seçilmiyor (yazı alanı hariç), F11 tam ekran,
//   pencerenin durumu kapanışta dosyaya; Steam Deck'te (`SteamDeck=1`) metin
//   ilk açılışta "çok büyük".
//
// Gerekenler: tauri-driver (`cargo install tauri-driver --locked`),
// WebKitWebDriver (Debian/Ubuntu: webkit2gtk-driver), ekran (xvfb-run).
// Çalıştırma: xvfb-run -a dbus-run-session -- node tools/desktop-e2e.mjs [ikili]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BIN = process.argv[2] ?? join(ROOT, 'apps/desktop/src-tauri/target/release/capitalforge');
const SHOTS = process.env.SHOTS ?? '';
const PORT = 4444;
const ELEMENT = 'element-6066-11e4-a52e-4f735a0b8a07';
const DATA = mkdtempSync(join(tmpdir(), 'capitalforge-desktop-'));
const OUT = join(DATA, 'Downloads');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const section = (name) => console.log(`\n=== ${name} ===`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sürücünün kapısı; Steam Deck bölümü kendi sürücüsünü başka kapıda açıyor. */
let port = PORT;

async function wd(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json.value ?? json).slice(0, 400)}`);
  return json.value;
}

class Window {
  static async open() {
    const value = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: BIN } } } });
    return new Window(value.sessionId);
  }

  constructor(id) {
    this.id = id;
  }

  run(script, ...args) {
    return wd('POST', `/session/${this.id}/execute/sync`, { script, args });
  }

  /** Sayfada bir koşul doğru olana kadar (yazılımsal GL'de kareler yavaş). */
  async until(expression, timeoutMs, label) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
      try {
        last = await this.run(`return (${expression});`);
        if (last) return last;
      } catch (error) {
        last = String(error).slice(0, 200);
      }
      await sleep(300);
    }
    throw new Error(`${label}: ${timeoutMs / 1000} sn içinde olmadı (${JSON.stringify(last)})`);
  }

  /** Tıklama sayfanın içinden: WebDriver'ın "tıklanabilir mi" beklemesi saniyede birkaç karede uzuyor. */
  click(css, text = null) {
    return this.run(
      `const all = [...document.querySelectorAll(arguments[0])];
       const el = arguments[1] === null ? all[0] : all.find((e) => e.textContent.includes(arguments[1]));
       if (!el) throw new Error('yok: ' + arguments[0] + ' ' + (arguments[1] ?? ''));
       el.click();
       return true;`,
      css,
      text,
    );
  }

  async screenshot(name) {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const png = await wd('GET', `/session/${this.id}/screenshot`);
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'));
  }

  close() {
    return wd('DELETE', `/session/${this.id}`).catch(() => undefined);
  }
}

/** Düğümün tarafında bir dosya koşulu (kabuğun yazdığı). */
async function untilFile(read, timeoutMs, label) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      last = read();
      if (last) return last;
    } catch {
      /* henüz yok ya da yarım */
    }
    await sleep(200);
  }
  throw new Error(`${label}: ${timeoutMs / 1000} sn içinde dosya yok`);
}

/**
 * Oyunun süreçleri kapanana kadar bekle; kalan olursa öldür. Kapanış
 * otomatik kayıt için 5 sn'ye kadar sürüyor ve tek pencere eklentisi o
 * sırada açılan yeni kopyayı açtırmıyor (CI'da Steam Deck bölümü öyle
 * düştü). Kalan süreçlerin sayısını döndürüyor.
 */
async function untilGameGone(timeoutMs) {
  // Yalnız bu ikilinin süreçleri: adıyla bul, çalıştırılabilir dosyasıyla doğrula
  // (komut satırında yolu taşıyan test sürecinin kendisi değil).
  const binary = realpathSync(BIN);
  const alive = () => {
    let pids = [];
    try {
      pids = execFileSync('pgrep', ['-x', basename(BIN).slice(0, 15)], { encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      return [];
    }
    return pids.filter((pid) => {
      try {
        return readlinkSync(`/proc/${pid}/exe`) === binary;
      } catch {
        return false;
      }
    });
  };
  const start = Date.now();
  while (alive().length > 0 && Date.now() - start < timeoutMs) await sleep(250);
  const left = alive();
  for (const pid of left) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      /* bu arada kapandı */
    }
  }
  return left.length;
}

const readSave = (slot) => JSON.parse(readFileSync(join(DATA, 'saves', `slot-${slot}.json`), 'utf8'));
const exported = (ext) => (existsSync(OUT) ? readdirSync(OUT).filter((name) => name.endsWith(ext)) : []);

// WebKit'in kendi verisi (yerel depo dahil) de geçici dizinde: her koşu ilk açılış.
const driver = spawn('tauri-driver', ['--port', String(PORT)], {
  env: {
    ...process.env,
    CAPITALFORGE_DATA_DIR: DATA,
    CAPITALFORGE_EXPORT_DIR: OUT,
    XDG_DATA_HOME: join(DATA, 'xdg-data'),
    XDG_CONFIG_HOME: join(DATA, 'xdg-config'),
    XDG_CACHE_HOME: join(DATA, 'xdg-cache'),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let win = null;

try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/status`).then(() => true, () => false)) break;
    await sleep(200);
  }

  section('Açılış');
  win = await Window.open();
  await win.until(`document.querySelector('.newgame')`, 120_000, 'kurulum ekranı');
  const shell = await win.run(`return {
    shell: document.documentElement.dataset.shell ?? null,
    manifest: !!document.querySelector('link[rel=manifest]'),
    worker: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    origin: location.origin,
  };`);
  check('Kabuğun köprüsü açık (sayfa masaüstünde)', shell.shell === 'desktop', JSON.stringify(shell));
  check('Hizmet çalışanı ve manifest yok', !shell.manifest && !shell.worker);
  await win.screenshot('desktop-setup');

  section('Steam ve tek pencere');
  // Steam'siz derleme (CI): komutlar kabukta, durum "kapalı", açma isteği hata vermiyor.
  const steam = await win.run(`return window.__TAURI__.core.invoke('steam_status').then(async (status) => {
    await window.__TAURI__.core.invoke('steam_unlock', { names: ['CF_FIRST_VICTORY'] });
    return status;
  });`);
  check("Steam komutları kabukta: Steam'siz derlemede kapalı, açma isteği hata vermiyor",
    steam?.available === false && /Steam'siz/.test(steam.detail), JSON.stringify(steam));
  // İkinci kopya D-Bus'tan birinciyi buluyor, ona haber verip çıkıyor. Oturum
  // otobüsü yoksa eklenti tek pencereyi bilemiyor (normal açılış): denetlenemez.
  if (process.env.DBUS_SESSION_BUS_ADDRESS) {
    const second = spawn(BIN, [], { env: { ...process.env, CAPITALFORGE_DATA_DIR: DATA, CAPITALFORGE_EXPORT_DIR: OUT }, stdio: 'ignore' });
    const exit = await Promise.race([
      new Promise((resolve) => second.once('exit', (code) => resolve(code))),
      sleep(20_000).then(() => 'açık kaldı'),
    ]);
    if (exit === 'açık kaldı') second.kill();
    const alive = await win.run('return !!document.querySelector(".newgame");').catch(() => false);
    check('İkinci kopya açılmıyor, ilk pencere yerinde', exit === 0 && alive === true, `ikinci kopya: ${exit}`);
  } else {
    console.log('  ATLANDI  Tek pencere: D-Bus oturumu yok (dbus-run-session ile çalıştır)');
  }

  section('Uygulama gibi');
  const feel = await win.run(`
    const fire = (init, target = window) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const menu = (target) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const input = document.querySelector('.newgame-field input[type="text"]');
    const select = (el) => { const cs = getComputedStyle(el); return cs.userSelect || cs.webkitUserSelect; };
    return {
      f5: fire({ key: 'F5', code: 'F5' }),
      reload: fire({ key: 'r', code: 'KeyR', ctrlKey: true }),
      print: fire({ key: 'p', code: 'KeyP', ctrlKey: true }),
      find: fire({ key: 'f', code: 'KeyF', ctrlKey: true }),
      back: fire({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }),
      copy: fire({ key: 'c', code: 'KeyC', ctrlKey: true }, input),
      typing: fire({ key: 'a', code: 'KeyA' }, input),
      menu: menu(document.querySelector('.newgame')),
      inputMenu: menu(input),
      body: select(document.body),
      field: select(input),
    };`);
  check('Tarayıcı kısayolları yutuluyor: F5, Ctrl+R, Ctrl+P, Ctrl+F, Alt+←', feel.f5 && feel.reload && feel.print && feel.find && feel.back, JSON.stringify(feel));
  check('Yazı alanının kısayolları yerinde: Ctrl+C, harf', feel.copy === false && feel.typing === false);
  check('Sağ tık menüsü oyunda kapalı, yazı alanında açık', feel.menu === true && feel.inputMenu === false);
  check('Oyunun metni seçilmiyor, yazı alanı seçiliyor', feel.body === 'none' && feel.field === 'text', `${feel.body} / ${feel.field}`);
  const shellInfo = await win.run(`return window.__TAURI__.core.invoke('shell_info');`);
  const textSize = await win.run(`return document.documentElement.dataset.textSize;`);
  check('Steam Deck değil: metin varsayılan boyda', shellInfo?.deck === false && textSize === 'normal', `${JSON.stringify(shellInfo)} · ${textSize}`);
  // F11 kabuğun komutuyla tam ekranı açıyor, Alt+Enter kapatıyor (pencere
  // yöneticisi olmayan xvfb'de de GTK durumu söylüyor).
  const full = await win.run(`
    const w = window.__TAURI__.window.getCurrentWindow();
    const wait = () => new Promise((resolve) => setTimeout(resolve, 1500));
    const before = await w.isFullscreen();
    const errors = [];
    const original = console.warn;
    console.warn = (...args) => { errors.push(args.map(String).join(' ')); original(...args); };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', code: 'F11', bubbles: true, cancelable: true }));
    await wait();
    const on = await w.isFullscreen();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }));
    await wait();
    const off = await w.isFullscreen();
    console.warn = original;
    return { before, on, off, errors };`);
  check('F11 tam ekranı açıyor, Alt+Enter kapatıyor', full.errors.length === 0 && full.before === false && full.on === true && full.off === false, JSON.stringify(full));

  await win.click('[data-newgame-start]');
  await win.until(`document.querySelector('.topbar')`, 180_000, 'oyun ekranı');
  const frames = await win.until(`(window.__capital?.renderInfo()?.frameCount ?? 0) >= 3 && window.__capital.renderInfo().frameCount`, 180_000, 'şehrin kareleri');
  check('Şehir WebKitGTK\'de çiziliyor', frames >= 3, `${frames} kare`);

  section('Kayıt dosyada');
  const day = await win.run(`
    const c = window.__capital;
    c.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    for (let i = 0; i < 6; i++) c.engine.runDay();
    return c.getState().time.day;`);
  await win.click('[data-panel="saves"]');
  await win.until(`document.querySelector('.slotlist .slot:nth-child(2) .slot-actions button')`, 30_000, 'kayıt paneli');
  // Slot 1'in ilk düğmesi "Kaydet" (otomatik kayıt slotunda yok).
  await win.click('.slotlist .slot:nth-child(2) .slot-actions button');
  const saved = await untilFile(() => readSave(1), 20_000, 'slot-1.json');
  check('Slota kayıt saves/slot-1.json dosyasına', saved.meta.slot === 1 && saved.state.time.day === day, `${saved.meta.companyName}, ${saved.meta.day}. gün`);
  const listed = await win.until(`document.querySelector('.slotlist .slot:nth-child(2)')?.textContent.includes('${saved.meta.companyName}') && document.querySelector('.slotlist .slot:nth-child(2)').textContent`, 20_000, 'slot listesi');
  check('Kayıt listesi dosyadan geliyor', listed.includes(saved.meta.companyName));
  check('Geçici dosya kalmıyor', readdirSync(join(DATA, 'saves')).every((name) => name.endsWith('.json')), readdirSync(join(DATA, 'saves')).join(', '));

  section('Dışa aktarma İndirilenler\'e');
  // İkinci düğme "JSON dışa aktar".
  await win.click('.saverow-actions button:nth-child(2)');
  const json = await untilFile(() => exported('.json')[0], 20_000, 'dışa aktarılan kayıt');
  // Dosya yazılırken de görünüyor: tamamı okunana kadar (yarım dosya JSON değil;
  // yüklü makinede 256 KB'ta kesik okunmuştu).
  const record = await untilFile(() => JSON.parse(readFileSync(join(OUT, json), 'utf8')), 20_000, 'dışa aktarılan kaydın tamamı');
  check('Kayıt dosyası İndirilenler klasöründe, adı ASCII', /^capitalforge-[A-Za-z0-9._-]+-gun\d+\.json$/.test(json) && record.state.time.day === day, json);
  const toast = await win.until(`[...document.querySelectorAll('.toasts .toast')].map((t) => t.textContent).find((t) => t.includes('İndirilenler'))`, 10_000, 'bildirim');
  check('Oyuncuya dosyanın nereye gittiği söyleniyor', toast.includes('İndirilenler'), toast);
  await win.click('.saverow-actions button:nth-child(2)');
  await untilFile(() => exported('.json').length === 2, 20_000, 'ikinci dışa aktarma');
  check('Aynı adla ikinci dışa aktarma üstüne yazmıyor', exported('.json').some((name) => name.includes(' (2)')), exported('.json').join(', '));

  await win.run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`);
  await win.click('.goal-chip');
  await win.until(`document.querySelector('.goals [data-city-card-open]')`, 20_000, 'hedefler');
  await win.click('.goals [data-city-card-open]');
  await win.until(`document.querySelector('[data-city-card="ready"], [data-city-card="failed"]')?.dataset.cityCard === 'ready'`, 180_000, 'şehir kartı');
  const img = await win.until(`(() => { const img = document.querySelector('[data-city-card-image]'); return img && img.complete && img.naturalWidth > 0 && { width: img.naturalWidth, height: img.naturalHeight, src: img.src.slice(0, 5) }; })()`, 20_000, 'kartın görseli');
  check('Kart pencerede görünüyor (blob görseli CSP\'den geçiyor)', img.width === 1200 && img.height === 630, JSON.stringify(img));
  // Yazılımsal GL'de görsel bir iki saniye sonra boyanıyor.
  await sleep(3000);
  await win.screenshot('desktop-city-card');
  await win.click('[data-city-card-download]');
  const png = await untilFile(() => exported('.png')[0], 30_000, 'şehir kartı dosyası');
  const bytes = readFileSync(join(OUT, png));
  const size = bytes.length > 24 ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : [0, 0];
  check('Şehir kartı İndirilenler\'de: PNG, 1200 × 630', bytes.subarray(1, 4).toString() === 'PNG' && size[0] === 1200 && size[1] === 630, `${png} · ${size.join(' × ')} · ${Math.round(bytes.length / 1024)} KB`);
  if (SHOTS) writeFileSync(join(SHOTS, 'desktop-card-file.png'), bytes);
  await win.click('[data-city-card-close]');

  section('Ayarlar ve kapanış');
  await win.run(`localStorage.setItem('capitalforge.locale', 'en'); return true;`);
  const locale = await untilFile(() => readFileSync(join(DATA, 'profile', 'capitalforge.locale'), 'utf8') === 'en', 10_000, 'dil dosyası');
  check('Ayar dosyaya gidiyor: profile/capitalforge.locale', locale === true);
  const profile = readdirSync(join(DATA, 'profile'));
  check('Arayüzün başka kayıtları da dosyada', profile.length >= 2, profile.join(', '));

  const lastDay = await win.run(`
    const c = window.__capital;
    for (let i = 0; i < 4; i++) c.engine.runDay();
    return c.getState().time.day;`);
  const before = existsSync(join(DATA, 'saves', 'slot-0.json')) ? readSave(0).state.time.day : null;
  // Oyun tam ekranda kapanıyor (Codex): pencere kipinin boyu hatırlanmalı,
  // tam ekranın (ekranın) boyu değil. Pencere yöneticisi olmayan xvfb'de tam
  // ekran pencerenin boyunu değiştirmiyor, GTK yalnız durumu söylüyor; boy
  // farkını Rust testleri sınıyor (`src/window.rs`), burada işaretin ve
  // açılışın yolu.
  const windowed = await win.run(`
    const w = window.__TAURI__.window.getCurrentWindow();
    const size = await w.innerSize();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', code: 'F11', bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const full = await w.innerSize();
    return { width: size.width, height: size.height, full: await w.isFullscreen(), fullWidth: full.width, fullHeight: full.height };`);
  // Kapatma düğmesinin kabuktan gelen haberi; sayfa kaydedip `quit` diyor.
  await win.run(`window.__TAURI__.event.emit('capitalforge://close-requested'); return true;`).catch(() => undefined);
  const autosave = await untilFile(() => readSave(0).state.time.day === lastDay && readSave(0), 15_000, 'otomatik kayıt');
  check('Pencere kapanırken oyun otomatik kayda yazıyor', autosave.state.time.day === lastDay, `${before ?? 'yok'} → ${autosave.state.time.day}. gün`);
  const gone = await (async () => {
    for (let i = 0; i < 40; i++) {
      if (await win.run('return 1;').then(() => false, () => true)) return true;
      await sleep(250);
    }
    return false;
  })();
  check('Kayıttan sonra pencere kapanıyor', gone);
  await win.close();
  win = null;
  // Pencerenin boyu, yeri ve tam ekranı (Tur 71): kapanışta uygulamanın ayar dizinine.
  const windowState = await untilFile(() => JSON.parse(readFileSync(join(DATA, 'xdg-config', 'com.conforcus.capitalforge', 'window.json'), 'utf8')), 10_000, 'pencere durumu');
  check('Tam ekranda kapanan pencere: tam ekran hatırlanıyor, boy pencere kipindeki',
    windowed.full === true && windowState.fullscreen === true && windowState.width === windowed.width && windowState.height === windowed.height,
    `${JSON.stringify(windowState)} · pencere ${windowed.width}×${windowed.height}, tam ekran ${windowed.fullWidth}×${windowed.fullHeight}`);

  section('Yeniden açılış');
  win = await Window.open();
  const resumed = await win.until(`document.querySelector('.topbar') && window.__capital?.getState().time.day`, 180_000, 'kaldığı yer');
  check('Oyun kaldığı günden açılıyor (dosyadaki otomatik kayıt)', resumed === lastDay, `${resumed}. gün`);
  const reopened = await win.run(`
    const w = window.__TAURI__.window.getCurrentWindow();
    const full = await w.isFullscreen();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const size = await w.innerSize();
    return { full, after: await w.isFullscreen(), width: size.width, height: size.height };`);
  check('Yeniden açılışta tam ekran; çıkınca pencere eski boyunda, ekranın boyunda değil',
    reopened.full === true && reopened.after === false && reopened.width === windowed.width && reopened.height === windowed.height,
    `${JSON.stringify(reopened)} · beklenen ${windowed.width}×${windowed.height}`);
  const lang = await win.run(`return document.documentElement.lang;`);
  check('Dil dosyadan geliyor', lang === 'en', lang);
  await win.screenshot('desktop-resumed');
} catch (error) {
  check('Uçtan uca akış', false, String(error?.stack ?? error).slice(0, 600));
} finally {
  if (win) await win.close();
  driver.kill();
  if (driver.exitCode === null) await new Promise((resolve) => driver.once('exit', resolve));
  // Pencerenin süreçleri (WebKit, mesa'nın gölgelendirici önbelleği) kapanırken
  // hâlâ yazıyor olabiliyor: silme yeniden deneniyor, temizlik testi düşürmüyor.
  try {
    rmSync(DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.warn(`Geçici dizin silinemedi: ${error.message}`);
  }
}

// Steam, Deck'te başlattığı her sürece `SteamDeck=1` veriyor (Tur 71): ilk
// açılışta metin "çok büyük". Ayrı bir sürücü, ayrı ve boş bir veri dizini.
section('Steam Deck');
const lingering = await untilGameGone(20_000);
if (lingering > 0) console.log(`  (önceki pencereden ${lingering} süreç 20 sn'de kapanmadı, kapatıldı)`);
const DECK = mkdtempSync(join(tmpdir(), 'capitalforge-deck-'));
port = PORT + 10;
const deckDriver = spawn('tauri-driver', ['--port', String(port), '--native-port', String(port + 1)], {
  env: {
    ...process.env,
    SteamDeck: '1',
    CAPITALFORGE_DATA_DIR: DECK,
    CAPITALFORGE_EXPORT_DIR: join(DECK, 'Downloads'),
    XDG_DATA_HOME: join(DECK, 'xdg-data'),
    XDG_CONFIG_HOME: join(DECK, 'xdg-config'),
    XDG_CACHE_HOME: join(DECK, 'xdg-cache'),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let deck = null;
try {
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${port}/status`).then(() => true, () => false)) break;
    await sleep(200);
  }
  deck = await Window.open();
  await deck.until(`document.querySelector('.newgame')`, 120_000, 'kurulum ekranı');
  const text = await deck.run(`return {
    info: null,
    size: document.documentElement.dataset.textSize,
    scale: getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
  };`);
  text.info = await deck.run(`return window.__TAURI__.core.invoke('shell_info');`);
  check("Steam Deck'te metin ilk açılışta çok büyük", text.info?.deck === true && text.size === 'xlarge' && text.scale === '1.3', JSON.stringify(text));
  await deck.screenshot('desktop-deck');
} catch (error) {
  check('Steam Deck açılışı', false, String(error?.stack ?? error).slice(0, 600));
} finally {
  if (deck) await deck.close();
  deckDriver.kill();
  if (deckDriver.exitCode === null) await new Promise((resolve) => deckDriver.once('exit', resolve));
  try {
    rmSync(DECK, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.warn(`Geçici dizin silinemedi: ${error.message}`);
  }
}

console.log(`\n================================\nTOPLAM: ${passed} geçti, ${failed} kaldı`);
process.exit(failed === 0 ? 0 : 1);
