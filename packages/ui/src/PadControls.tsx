import type { ReactElement } from 'react';
import { glyphOf } from './padGlyphs';
import type { GlyphButton, PadGlyphs } from './padGlyphs';
import { pt } from './padMessages';
import type { PadMessageKey } from './padMessages';

/**
 * Ayarlar'daki kumanda listesi (Tur 72). Ayrı parça: Ayarlar kurulum
 * ekranında da açılıyor ve kurulum ekranının paketi dolu; liste yalnız
 * kumanda kullanılınca iniyor. Düğme yazısı kumandaya göre (Xbox ABXY,
 * Sony ✕ ○ □ △); hangisi olduğunu kumanda modülü söylüyor (`padInUse.ts`).
 */
const CONTROLS: Array<[id: string, ...buttons: GlyphButton[]]> = [
  ['pan'],
  ['orbit'],
  ['zoom', 'lt', 'rt'],
  ['pick', 'a'],
  ['back', 'b'],
  ['move'],
  ['panels', 'lb', 'rb'],
  ['pause', 'y'],
  ['speed', 'x'],
  ['settings', 'menu'],
  ['lens', 'view'],
];

export default function PadControls({ glyphs }: { glyphs: PadGlyphs }): ReactElement {
  const label = (id: string, buttons: GlyphButton[]) =>
    buttons.length > 0 ? buttons.map((button) => glyphOf(button, glyphs)).join(' · ') : id === 'move' ? '✚' : pt(`hud.pad.key.${id}` as PadMessageKey);
  return (
    <section className="settings-group" data-pad-controls>
      <h3>{pt('hud.pad.controls')}</h3>
      <dl className="settings-keys">
        {CONTROLS.map(([id, ...buttons]) => (
          <div key={id}>
            <dt>
              <kbd>{label(id, buttons)}</kbd>
            </dt>
            <dd>{pt(`hud.pad.what.${id}` as PadMessageKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
