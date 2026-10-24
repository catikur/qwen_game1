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
// - yeniden açılınca oyun kaldığı günden, seçilen dilde açılıyor.
//
// Gerekenler: tauri-driver (`cargo install tauri-driver --locked`),
// WebKitWebDriver (Debian/Ubuntu: webkit2gtk-driver), ekran (xvfb-run).
// Çalıştırma: xvfb-run -a node tools/desktop-e2e.mjs [ikili]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

async function wd(method, path, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
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
  const record = JSON.parse(readFileSync(join(OUT, json), 'utf8'));
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

  section('Yeniden açılış');
  win = await Window.open();
  const resumed = await win.until(`document.querySelector('.topbar') && window.__capital?.getState().time.day`, 180_000, 'kaldığı yer');
  check('Oyun kaldığı günden açılıyor (dosyadaki otomatik kayıt)', resumed === lastDay, `${resumed}. gün`);
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

console.log(`\n================================\nTOPLAM: ${passed} geçti, ${failed} kaldı`);
process.exit(failed === 0 ? 0 : 1);
