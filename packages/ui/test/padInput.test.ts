import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PadPresses,
  REPEAT_DELAY_MS,
  REPEAT_EVERY_MS,
  deadZone,
  glyphOf,
  padActions,
  padDrive,
  padGlyphs,
  padTouched,
  readPad,
  type PadLike,
} from '../src/padInput';
import { nearestBox, type Box } from '../src/spatialNav';

/** Standart düzende sahte kumanda: basılı düğmeler ve eksenler. */
function pad(pressed: number[] = [], axes: number[] = [0, 0, 0, 0], triggers: [number, number] = [0, 0]): PadLike {
  return {
    id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)',
    buttons: Array.from({ length: 17 }, (_, index) => {
      const value = index === 6 ? triggers[0] : index === 7 ? triggers[1] : pressed.includes(index) ? 1 : 0;
      return { pressed: value >= 0.5 || pressed.includes(index), value };
    }),
    axes,
  };
}

test('kumanda okunuyor: standart düzen, çubukta ölü bölge, tetik hem düğme hem değer', () => {
  const idle = readPad(pad([], [0.1, -0.12, 0.05, 0.15]));
  assert.equal(idle.down.size, 0);
  assert.deepEqual([idle.left, idle.right], [{ x: 0, y: 0 }, { x: 0, y: 0 }], 'bırakılan çubuğun titremesi sayılmıyor');
  assert.equal(padTouched(idle), false);
  const frame = readPad(pad([0, 4, 12], [1, 0, 0, -0.6], [0.3, 0.9]));
  assert.deepEqual([...frame.down].sort(), ['a', 'lb', 'rt', 'up']);
  assert.deepEqual(frame.left, { x: 1, y: 0 }, 'tam itilen çubuk 1');
  assert.ok(frame.right.y < 0 && frame.right.y > -0.6, 'ölü bölgenin dışı 0’dan başlıyor');
  assert.equal(frame.lt, 0.3);
  assert.equal(frame.rt, 0.9);
  assert.equal(padTouched(frame), true);
  // Ölü bölge daire biçimli: çapraz itiş iki eksende de geçiyor.
  const diagonal = deadZone(0.5, 0.5);
  assert.ok(Math.abs(diagonal.x - diagonal.y) < 1e-9 && diagonal.x > 0);
  assert.deepEqual(deadZone(Number.NaN, 0), { x: 0, y: 0 });
});

test('basış kenarda; yönler basılı tutulunca önce bekleyip sonra tekrar ediyor, öbür düğmeler etmiyor', () => {
  const presses = new PadPresses();
  const held = readPad(pad([0, 13]));
  assert.deepEqual(presses.update(held, 0).sort(), ['a', 'down']);
  assert.deepEqual(presses.update(held, 100), [], 'ilk bekleme');
  assert.deepEqual(presses.update(held, REPEAT_DELAY_MS), ['down'], 'A tekrar etmiyor');
  assert.deepEqual(presses.update(held, REPEAT_DELAY_MS + 10), []);
  assert.deepEqual(presses.update(held, REPEAT_DELAY_MS + REPEAT_EVERY_MS), ['down']);
  // Bırakıp yeniden basınca hemen.
  assert.deepEqual(presses.update(readPad(pad()), REPEAT_DELAY_MS + 200), []);
  assert.deepEqual(presses.update(held, REPEAT_DELAY_MS + 210).sort(), ['a', 'down']);
  // Sol çubuk da yön adımı (pencerede gezmek için).
  presses.reset();
  assert.deepEqual(presses.update(readPad(pad([], [0, -0.9, 0, 0])), 0), ['stickUp']);
});

test('eylemler: yön tuşu her katmanda gezer; sol çubuk yalnız pencerede; omuzlar panel, Y durdur, X hız', () => {
  const pressed = ['up', 'stickLeft', 'a', 'b', 'lb', 'rb', 'y', 'x', 'menu', 'view', 'lt', 'l3'] as const;
  assert.deepEqual(padActions(pressed, 'map'), [
    { type: 'move', dir: 'up' },
    { type: 'activate' },
    { type: 'back' },
    { type: 'panel', step: -1 },
    { type: 'panel', step: 1 },
    { type: 'pause' },
    { type: 'speed' },
    { type: 'settings' },
    { type: 'lens' },
  ]);
  assert.deepEqual(padActions(['stickLeft'], 'modal'), [{ type: 'move', dir: 'left' }]);
  assert.deepEqual(padActions(['stickLeft'], 'hud'), [], 'arayüzde sol çubuk kamerayı sürüyor');
});

test('sürekli girdiler: haritada kamera (kaydır, döndür, yakınlaş), pencerede kaydırma', () => {
  const frame = readPad(pad([], [0.5, 0, -1, 0.8], [0.2, 0.9]));
  const map = padDrive(frame, 'map');
  assert.ok(map.pan.x > 0 && map.orbit.x < 0 && map.orbit.y > 0);
  assert.ok(Math.hypot(map.orbit.x, map.orbit.y) <= 1 + 1e-9, 'çapraz itiş 1’i aşmıyor');
  assert.ok(Math.abs(map.zoom - 0.7) < 1e-9, 'RT yakınlaştırıyor, LT uzaklaştırıyor');
  assert.equal(map.scroll, 0);
  const modal = padDrive(frame, 'modal');
  assert.deepEqual([modal.pan, modal.orbit, modal.zoom], [{ x: 0, y: 0 }, { x: 0, y: 0 }, 0], 'pencere açıkken kamera duruyor');
  assert.ok(modal.scroll > 0, 'sağ çubuk aşağı: içerik aşağı');
});

test('düğme yazıları: Steam Input ve Xbox ABXY, Sony kumandası ✕ ○ □ △', () => {
  assert.equal(padGlyphs('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)'), 'xbox');
  assert.equal(padGlyphs('Steam Virtual Gamepad'), 'xbox');
  assert.equal(padGlyphs('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(padGlyphs('054c-09cc-Wireless Controller'), 'playstation');
  assert.equal(padGlyphs(undefined), 'xbox');
  assert.deepEqual(['a', 'b', 'y'].map((button) => glyphOf(button as 'a' | 'b' | 'y', 'playstation')), ['✕', '○', '△']);
  assert.equal(glyphOf('a', 'xbox'), 'A');
});

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, right: left + width, bottom: top + height });

test('yönle odak: aynı sütundaki ve satırdaki komşu önce; kap aday değil; o yönde aday yoksa -1', () => {
  // Dikey liste (yapı menüsü) ve sağında tek bir düğme.
  const list = [box(10, 10, 200, 40), box(10, 54, 200, 40), box(10, 98, 200, 40), box(260, 60, 80, 30)];
  assert.equal(nearestBox(list[0]!, list, 'down'), 1, 'hemen alttaki');
  assert.equal(nearestBox(list[1]!, list, 'down'), 2, 'çapraz yakındaki değil, sütundaki');
  assert.equal(nearestBox(list[2]!, list, 'up'), 1);
  assert.equal(nearestBox(list[1]!, list, 'right'), 3);
  assert.equal(nearestBox(list[3]!, list, 'left'), 1, 'aynı yükseklikteki satır');
  assert.equal(nearestBox(list[0]!, list, 'up'), -1);
  // Kaynağı içine alan kap hiçbir yönde aday değil.
  const container = box(0, 0, 400, 400);
  assert.equal(nearestBox(list[0]!, [container], 'down'), -1);
  // Haritanın ortasından (nokta) sola: sol sütunda ortaya en yakın yükseklik.
  const center = box(640, 400, 0, 0);
  const leftColumn = [box(16, 120, 268, 40), box(16, 380, 268, 40), box(16, 640, 268, 40)];
  assert.equal(nearestBox(center, leftColumn, 'left'), 1);
  assert.equal(nearestBox(center, leftColumn, 'right'), -1);
  // Hizadaki uzak kart, hizanın dışındaki yakın sekmeyi yeniyor: sola basınca
  // üst bardaki sekmeye değil sol sütuna (tarayıcıda bulunan hata).
  const tab = box(533, 75, 88, 36);
  assert.equal(nearestBox(center, [tab, leftColumn[1]!], 'left'), 1);
  // Yukarı-aşağıda hizanın dışındaki kutu tümüyle daha yakınsa o.
  const below = box(600, 430, 80, 30);
  const farInBeam = box(630, 700, 40, 30);
  assert.equal(nearestBox(center, [farInBeam, box(700, 410, 80, 20)], 'down'), 1, 'hizadaki çok uzakta, dışarıdaki tümüyle yakın');
  assert.equal(nearestBox(center, [below, farInBeam], 'down'), 0);
});
