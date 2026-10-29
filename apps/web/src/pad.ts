/**
 * Kumandanın sayfadaki işi (Tur 72).
 *
 * Giriş paketinde yalnız bir kanca var (`main.tsx`): kumanda bağlanınca bu
 * modül iniyor. Kare başına kumandayı okuyor; arayüzde odağı yönle
 * gezdiriyor, A ile basıyor, B ile geri dönüyor, düğme ipuçlarını
 * gösteriyor. Haritanın işleri (kamera, ortadaki parsel, paneller, hız)
 * oyun ekranının: `GameRoot` bir harita işleyicisi kaydediyor
 * (`padBridge.ts`; oyun ekranı bu modülü içe aktarmıyor). Kurulum
 * ekranında yalnız arayüzde gezinme var. Kararlar `@capital/ui`'daki saf
 * işlevlerde (`padInput`, `spatialNav`).
 */
import {
  PadPresses,
  glyphOf,
  inputMode,
  nearestBox,
  padActions,
  padDrive,
  padGlyphs,
  padGlyphsInUse,
  padTouched,
  pt,
  readPad,
  setInputMode,
  setPadGlyphsInUse,
  watchInputMode,
} from '@capital/ui';
import type { Box, Direction, PadAction, PadLayer, PadMessageKey } from '@capital/ui';
import { focusFirst, focusOn, focusables, mapHandler } from './padBridge';
import { TEXT_INPUT_EVENT } from './textInput';
import type { TextField } from './textInput';

/** Kipli katmanlar: panel, kurulum penceresi, editör, zafer ve sonuç ekranları. */
const MODAL = '[aria-modal="true"], [role="alertdialog"]';
/**
 * Karar ekranları (zafer, senaryonun açılışı ve sonucu, lig sonucu, iflas):
 * kapatılmıyor, oyuncu bir düğme seçiyor. Kumandanın orada yalnız A'sı ve
 * yön tuşu var (`padActions`); şerit de yalnız onları gösteriyor (Codex #102).
 */
const DECISION = '[role="alertdialog"]';
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);
/** Denetim sayılanlar: odak bunların dışındaysa bir kapta (detay, pencere). A açılır bölümün başlığına basıyor, bölüm açılıp kapanıyor. */
const CONTROL = 'a[href], button, input, select, textarea, details > summary, [tabindex]:not([tabindex="-1"])';
/** Kaba girerken atlanan: başlıktaki kapatma düğmesi (B zaten kapatıyor). */
const CLOSE = '.inspector-head button, .modal-head button';

function topModal(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>(MODAL)].filter((element) => element.getClientRects().length > 0);
  return open.at(-1) ?? null;
}

/** Odak bir denetimde mi (sayfanın kendisi ya da şehrin tuvali değil). */
function focused(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element !== document.body && !(element instanceof HTMLCanvasElement);
}

function isTextField(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement || element.isContentEditable) return true;
  return element instanceof HTMLInputElement && TEXT_INPUTS.has(element.type);
}

export function padLayer(): PadLayer {
  const modal = topModal();
  if (modal) return modal.matches(DECISION) ? 'decision' : 'modal';
  return focused(document.activeElement) ? 'hud' : 'map';
}

/** Haritanın ortası: yön tuşu haritadan arayüze buradan çıkıyor. */
function mapCenter(): Box {
  const scene = document.querySelector('canvas.scene');
  const rect = scene?.getBoundingClientRect();
  const x = rect && rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect && rect.height > 0 ? rect.top + rect.height / 2 : window.innerHeight / 2;
  return { left: x, right: x, top: y, bottom: y };
}

/** Kaydırıcı ve seçim kutusu sağa-sola değer değiştiriyor; değiştirdiyse true. */
function adjust(element: HTMLElement, step: 1 | -1): boolean {
  if (element instanceof HTMLInputElement && element.type === 'range') {
    if (step > 0) element.stepUp();
    else element.stepDown();
  } else if (element instanceof HTMLSelectElement && element.options.length > 0) {
    element.selectedIndex = (element.selectedIndex + step + element.options.length) % element.options.length;
  } else {
    return false;
  }
  // React değişikliği girdi ve değişim olaylarından okuyor.
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function move(dir: Direction): void {
  const modal = topModal();
  const scope = modal ?? document.body;
  const active = document.activeElement;
  const inScope = focused(active) && active !== modal && scope.contains(active);
  // Odak bir kapta: yön onun içine giriyor.
  if (inScope && !active.matches(CONTROL) && focusFirst(active, CLOSE)) return;
  if (inScope && (dir === 'left' || dir === 'right') && adjust(active, dir === 'right' ? 1 : -1)) return;
  const items = focusables(scope).filter((element) => element !== active);
  if (items.length === 0) return;
  // Pencereye girerken ilk denetim; haritadan çıkarken haritanın ortasından.
  if (!inScope && modal) {
    if (!focusFirst(modal, CLOSE)) focusOn(items[0]!);
    return;
  }
  const from = inScope ? active.getBoundingClientRect() : mapCenter();
  const index = nearestBox(from, items.map((element) => element.getBoundingClientRect()), dir);
  if (index >= 0) focusOn(items[index]!);
}

/** Basılan düğmenin bulunduğu yer: detay ya da pencere. */
const REGION = '.inspector, [aria-modal="true"], [role="alertdialog"]';

/**
 * Basılan düğme kaybolduysa (satın al → sat) odak sayfaya düşüyordu ve
 * kumanda haritaya dönmüş sayılıyordu. Yer duruyorsa odak onun kendisinde:
 * A ya da yön tuşu içine giriyor. Yerine gelen düğmeye geçmiyor; satın
 * alınca gelen "sat" düğmesinde ikinci basış parseli satardı. Yer
 * kapandıysa (pencereyi kapatan düğme) odak haritada.
 */
function keepFocus(region: HTMLElement | null): void {
  if (!region) return;
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (region.isConnected) region.focus({ preventScroll: true });
  });
}

function press(element: HTMLElement): void {
  // Kap (detay): A içine giriyor.
  if (!element.matches(CONTROL)) {
    focusFirst(element, CLOSE);
    return;
  }
  if (isTextField(element)) {
    // Ekran klavyesi (Steam Deck): masaüstü kabuğu dinliyor.
    const rect = element.getBoundingClientRect();
    const field: TextField = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, multiline: !(element instanceof HTMLInputElement) };
    window.dispatchEvent(new CustomEvent(TEXT_INPUT_EVENT, { detail: field }));
    return;
  }
  if (element instanceof HTMLSelectElement) {
    adjust(element, 1);
    return;
  }
  if (element instanceof HTMLInputElement && element.type === 'range') return;
  const region = element.closest<HTMLElement>(REGION);
  element.click();
  keepFocus(region);
}

function activate(): void {
  const modal = topModal();
  const active = document.activeElement;
  if (focused(active) && active !== modal && (!modal || modal.contains(active))) {
    press(active);
    return;
  }
  if (modal) {
    if (!focusFirst(modal, CLOSE)) focusFirst(modal);
    return;
  }
  const map = mapHandler();
  if (map) map.select();
  else focusFirst(document.body);
}

/**
 * B: yazı alanından çık; yoksa Escape. Escape'in işleri tek yerde (oyun
 * ekranı, kurulum, editör): pencereyi kapatıyor, yerleştirmeden çıkıyor,
 * odağı haritaya veriyor, seçimi bırakıyor.
 */
function back(): void {
  const active = document.activeElement;
  if (focused(active) && isTextField(active)) {
    active.blur();
    return;
  }
  (focused(active) ? active : document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

/** Pencerede sağ çubuk içeriği kaydırıyor: odağın ya da pencerenin kaydırılan kabı. */
function scroll(amount: number, dt: number): void {
  const modal = topModal();
  if (!modal) return;
  const start = focused(document.activeElement) && modal.contains(document.activeElement) ? document.activeElement : modal;
  const scrollable = (element: HTMLElement) => element.scrollHeight > element.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(element).overflowY);
  let box: HTMLElement | null = start;
  while (box && box !== modal.parentElement && !scrollable(box)) box = box.parentElement;
  if (!box || !scrollable(box)) box = [...modal.querySelectorAll<HTMLElement>('*')].find(scrollable) ?? null;
  box?.scrollBy(0, amount * 900 * dt);
}

function run(action: PadAction): void {
  switch (action.type) {
    case 'move':
      move(action.dir);
      break;
    case 'activate':
      activate();
      break;
    case 'back':
      back();
      break;
    case 'panel':
      mapHandler()?.panel(action.step);
      break;
    case 'pause':
      mapHandler()?.pause();
      break;
    case 'speed':
      mapHandler()?.speed();
      break;
    case 'lens':
      mapHandler()?.lens();
      break;
    case 'settings':
      mapHandler()?.settings();
      break;
  }
}

// ------------------------------------------------------------ ipuçları

type HintButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'menu' | 'view' | 'dpad';

function hintsFor(layer: PadLayer): Array<[HintButton, PadMessageKey]> {
  const map = mapHandler();
  if (layer === 'decision') return [['a', 'hud.pad.select'], ['dpad', 'hud.pad.move']];
  if (layer === 'modal') return [['a', 'hud.pad.select'], ['b', 'hud.pad.close'], ['dpad', 'hud.pad.move'], ...(map ? ([['lb', 'hud.pad.panels']] as Array<[HintButton, PadMessageKey]>) : [])];
  if (layer === 'hud') return [['a', 'hud.pad.select'], ['b', 'hud.pad.toMap'], ['dpad', 'hud.pad.move']];
  if (!map) return [['a', 'hud.pad.select'], ['dpad', 'hud.pad.move'], ['b', 'hud.pad.back']];
  if (map.placing()) return [['a', 'hud.pad.place'], ['b', 'hud.pad.cancel']];
  return [['a', 'hud.pad.pick'], ['dpad', 'hud.pad.toHud'], ['lb', 'hud.pad.panels'], ['y', 'hud.pad.pause'], ['x', 'hud.pad.speed'], ['menu', 'hud.pad.settings']];
}

let hints: HTMLElement | null = null;
let hintsKey = '';

function renderHints(layer: PadLayer): void {
  const glyphs = padGlyphsInUse();
  const items = hintsFor(layer);
  const key = `${document.documentElement.lang}|${glyphs}|${items.map(([button, label]) => `${button}:${label}`).join(',')}`;
  if (key === hintsKey && hints?.isConnected) return;
  hintsKey = key;
  if (!hints || !hints.isConnected) {
    hints = document.createElement('div');
    hints.className = 'pad-hints';
    // Görsel yardım: ekran okuyucu düğmelerin kendi adlarını okuyor.
    hints.setAttribute('aria-hidden', 'true');
    document.body.append(hints);
  }
  hints.dataset['layer'] = layer;
  hints.replaceChildren(
    ...items.map(([button, label]) => {
      const item = document.createElement('span');
      item.className = 'pad-hint';
      const glyph = document.createElement('b');
      glyph.className = 'pad-glyph';
      glyph.dataset['button'] = button;
      glyph.textContent = button === 'dpad' ? '✚' : button === 'lb' ? `${glyphOf('lb', glyphs)} ${glyphOf('rb', glyphs)}` : glyphOf(button, glyphs);
      item.append(glyph, document.createTextNode(pt(label)));
      return item;
    }),
  );
}

// ------------------------------------------------------------ döngü

/** Bağlı kumandalardan en son kullanılan. */
/**
 * En son kullanılan, standart düzendeki kumanda. Düğme ve eksen sırası
 * yalnız standart düzende belli (`readPad`); başka düzendeki kumandada
 * rastgele bir düğme A ya da B olurdu, o kumanda okunmuyor (Codex #102).
 */
function activePad(): Gamepad | null {
  let best: Gamepad | null = null;
  for (const pad of navigator.getGamepads()) {
    if (pad?.connected && pad.mapping === 'standard' && (!best || pad.timestamp > best.timestamp)) best = pad;
  }
  return best;
}

let running = false;

/** Kumanda bağlanınca bir kez (`main.tsx`); ikinci çağrı bir şey yapmıyor. */
export function startPad(): void {
  if (running || typeof navigator.getGamepads !== 'function') return;
  running = true;
  watchInputMode(window);
  const presses = new PadPresses();
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const connected = activePad();
    // Kumanda çıkarıldı: ipuçları, nişangâh ve odak görünümü kumandada kalmasın (Codex #102).
    if (!connected && inputMode() === 'pad') setInputMode('pointer');
    const pad = document.visibilityState === 'visible' && document.hasFocus() ? connected : null;
    if (pad) {
      const frame = readPad(pad);
      const pressed = presses.update(frame, now);
      if (padTouched(frame)) {
        setPadGlyphsInUse(padGlyphs(pad.id));
        setInputMode('pad');
      }
      for (const action of padActions(pressed, padLayer())) run(action);
      const layer = padLayer();
      const drive = padDrive(frame, layer);
      mapHandler()?.drive(drive.pan, drive.orbit, drive.zoom);
      if (drive.scroll !== 0) scroll(drive.scroll, dt);
      renderHints(layer);
    } else {
      presses.reset();
      mapHandler()?.drive({ x: 0, y: 0 }, { x: 0, y: 0 }, 0);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
