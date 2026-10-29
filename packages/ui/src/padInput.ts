/**
 * Kumandanın okunması (Tur 72): tarayıcının Gamepad API'si, "standart" düzen.
 *
 * Steam Input oyuna Xbox düzeninde sanal bir kumanda veriyor; Steam Deck'in
 * düğmeleri de böyle geliyor. Tarayıcı DualSense'i ve DualShock'u da aynı
 * düzene eşliyor: A alttaki (✕), B sağdaki (○). Burada yalnız saf kararlar
 * var: hangi düğme bu karede basıldı, çubuk ne kadar itiliyor, hangi eylem.
 * Sayfayla konuşan kısım `apps/web/src/pad.ts`.
 */

import type { PadGlyphs } from './padGlyphs';

export { glyphOf } from './padGlyphs';
export type { GlyphButton, PadGlyphs } from './padGlyphs';

/** Standart düzende düğmelerin sırası. */
const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'menu', 'l3', 'r3', 'up', 'down', 'left', 'right'] as const;
export type PadButton = (typeof BUTTONS)[number];
export type Direction = 'up' | 'down' | 'left' | 'right';
/** Pencerede sol çubuk da yön tuşu gibi. */
export type StickStep = 'stickUp' | 'stickDown' | 'stickLeft' | 'stickRight';
export type PadPress = PadButton | StickStep;

/** Gamepad API'nin bize gereken kadarı; testlerde sahte kumanda. */
export interface PadLike {
  readonly id?: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ReadonlyArray<number>;
}

export interface Stick {
  readonly x: number;
  readonly y: number;
}

export interface PadFrame {
  readonly down: ReadonlySet<PadButton>;
  readonly left: Stick;
  readonly right: Stick;
  /** Tetikler, 0–1; ölü bölgenin altı 0. */
  readonly lt: number;
  readonly rt: number;
}

/** Çubuğun boşluğu: bırakılan çubuk tam sıfıra dönmüyor. */
export const DEAD_ZONE = 0.2;
const TRIGGER_DEAD = 0.06;
/** Tetik bu değerden sonra düğme olarak da basılı. */
const TRIGGER_PRESS = 0.5;
/** Pencerede sol çubuk bu kadar itilince bir adım. */
const STICK_STEP = 0.55;
const STILL: Stick = { x: 0, y: 0 };

/** Daire biçimli ölü bölge; dışında 0'dan 1'e yeniden ölçek. */
export function deadZone(x: number, y: number, zone = DEAD_ZONE): Stick {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= zone) return STILL;
  const scaled = Math.min(1, (length - zone) / (1 - zone));
  return { x: (x / length) * scaled, y: (y / length) * scaled };
}

function trigger(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > TRIGGER_DEAD ? Math.min(1, value) : 0;
}

export function readPad(pad: PadLike): PadFrame {
  const down = new Set<PadButton>();
  BUTTONS.forEach((name, index) => {
    const button = pad.buttons[index];
    if (!button) return;
    const isTrigger = name === 'lt' || name === 'rt';
    if (isTrigger ? button.value >= TRIGGER_PRESS : button.pressed) down.add(name);
  });
  const axis = (index: number) => pad.axes[index] ?? 0;
  return {
    down,
    left: deadZone(axis(0), axis(1)),
    right: deadZone(axis(2), axis(3)),
    lt: trigger(pad.buttons[6]?.value),
    rt: trigger(pad.buttons[7]?.value),
  };
}

/** Bu karede kumandaya dokunuldu mu: ipuçları ve nişangâh kumandaya geçsin. */
export function padTouched(frame: PadFrame): boolean {
  const moved = (stick: Stick) => stick.x !== 0 || stick.y !== 0;
  return frame.down.size > 0 || moved(frame.left) || moved(frame.right) || frame.lt > 0 || frame.rt > 0;
}

/** Basılı tutulan yön tekrar ediyor: önce bekleyip sonra sık. */
export const REPEAT_DELAY_MS = 380;
export const REPEAT_EVERY_MS = 110;
const REPEATS = new Set<PadPress>(['up', 'down', 'left', 'right', 'stickUp', 'stickDown', 'stickLeft', 'stickRight']);

/** Düğmenin basıldığı kare: kenar ve yönlerde tekrar. */
export class PadPresses {
  private readonly since = new Map<PadPress, number>();
  private readonly fired = new Map<PadPress, number>();

  update(frame: PadFrame, now: number): PadPress[] {
    const down = new Set<PadPress>(frame.down);
    if (frame.left.y <= -STICK_STEP) down.add('stickUp');
    if (frame.left.y >= STICK_STEP) down.add('stickDown');
    if (frame.left.x <= -STICK_STEP) down.add('stickLeft');
    if (frame.left.x >= STICK_STEP) down.add('stickRight');
    const pressed: PadPress[] = [];
    for (const name of down) {
      const start = this.since.get(name);
      if (start === undefined) {
        this.since.set(name, now);
        this.fired.set(name, now);
        pressed.push(name);
      } else if (REPEATS.has(name) && now - start >= REPEAT_DELAY_MS && now - (this.fired.get(name) ?? start) >= REPEAT_EVERY_MS) {
        this.fired.set(name, now);
        pressed.push(name);
      }
    }
    for (const name of [...this.since.keys()]) {
      if (down.has(name)) continue;
      this.since.delete(name);
      this.fired.delete(name);
    }
    return pressed;
  }

  /** Kumanda değişti ya da pencere odağı kaybetti: basılı hiçbir şey kalmasın. */
  reset(): void {
    this.since.clear();
    this.fired.clear();
  }
}

/**
 * Kumandanın o an konuştuğu katman. Harita: odak hiçbir düğmede değil, A
 * ortadaki parseli seçiyor. Arayüz: odak bir düğmede. Pencere: panel ya da
 * kurulum penceresi gibi kipli bir katman açık; kamera duruyor. Karar:
 * kapatılmayan, bir seçim isteyen ekran (zafer, senaryonun açılışı ve
 * sonucu, lig sonucu, iflas); orada yalnız A ve yön tuşu.
 */
export type PadLayer = 'map' | 'hud' | 'modal' | 'decision';

export type PadAction =
  | { readonly type: 'move'; readonly dir: Direction }
  | { readonly type: 'activate' }
  | { readonly type: 'back' }
  | { readonly type: 'panel'; readonly step: 1 | -1 }
  | { readonly type: 'pause' }
  | { readonly type: 'speed' }
  | { readonly type: 'lens' }
  | { readonly type: 'settings' };

const STICK_DIRECTION: Record<StickStep, Direction> = {
  stickUp: 'up',
  stickDown: 'down',
  stickLeft: 'left',
  stickRight: 'right',
};

/**
 * Basılan düğmelerin eylemleri. Sol çubuk haritada kamerayı sürüyor, pencerede
 * geziyor. Karar ekranında yalnız gezmek ve basmak: omuzlar ve ☰ ekranın
 * altında panel açıyordu, karar verilince ortaya çıkıyordu; Y ve X arkadaki
 * oyunu yürütüyordu; B'nin Escape'ini de dinleyen yok (Codex #102).
 */
export function padActions(pressed: readonly PadPress[], layer: PadLayer): PadAction[] {
  const actions: PadAction[] = [];
  for (const name of pressed) {
    switch (name) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        actions.push({ type: 'move', dir: name });
        break;
      case 'stickUp':
      case 'stickDown':
      case 'stickLeft':
      case 'stickRight':
        if (layer === 'modal' || layer === 'decision') actions.push({ type: 'move', dir: STICK_DIRECTION[name] });
        break;
      case 'a':
        actions.push({ type: 'activate' });
        break;
      case 'b':
        actions.push({ type: 'back' });
        break;
      case 'lb':
        actions.push({ type: 'panel', step: -1 });
        break;
      case 'rb':
        actions.push({ type: 'panel', step: 1 });
        break;
      case 'y':
        actions.push({ type: 'pause' });
        break;
      case 'x':
        actions.push({ type: 'speed' });
        break;
      case 'view':
        actions.push({ type: 'lens' });
        break;
      case 'menu':
        actions.push({ type: 'settings' });
        break;
      default:
        // Tetikler sürekli (yakınlaştırma); L3 ve R3 boş.
        break;
    }
  }
  return layer === 'decision' ? actions.filter((action) => action.type === 'move' || action.type === 'activate') : actions;
}

/** Kare başına sürekli girdiler. */
export interface PadDrive {
  /** Kamerayı kaydır: sol çubuk. */
  readonly pan: Stick;
  /** Döndür (x) ve eğ (y): sağ çubuk. */
  readonly orbit: Stick;
  /** Yakınlaş (+) ya da uzaklaş (−): RT − LT. */
  readonly zoom: number;
  /** Pencerede sağ çubuk içeriği kaydırıyor (+ aşağı). */
  readonly scroll: number;
}

export function padDrive(frame: PadFrame, layer: PadLayer): PadDrive {
  if (layer === 'modal' || layer === 'decision') return { pan: STILL, orbit: STILL, zoom: 0, scroll: frame.right.y };
  return { pan: frame.left, orbit: frame.right, zoom: frame.rt - frame.lt, scroll: 0 };
}

/**
 * Hangi kumanda: düğme yazıları ona göre (`padGlyphs.ts`). Nintendo'nun
 * üretici kimliği 057e: Pro Controller ve Joy-Con, Steam Input'suz bağlanınca
 * tarayıcıya kendi adıyla geliyor. Sony'ninki 054c; DualShock 4'ün adı
 * "Wireless Controller".
 */
export function padGlyphs(id: string | undefined): PadGlyphs {
  if (/057e|nintendo|pro controller|joy-?con/i.test(id ?? '')) return 'nintendo';
  return /054c|dualsense|dualshock|playstation|wireless controller/i.test(id ?? '') ? 'playstation' : 'xbox';
}
