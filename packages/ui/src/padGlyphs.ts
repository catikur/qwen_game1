/**
 * Düğme ipuçlarının yazısı (Tur 72): Steam'in sanal kumandası Xbox düzeninde
 * (Steam Deck de); Sony kumandasında şekiller ✕ ○ □ △. Ayrı ve küçük bir
 * modül: Ayarlar'ın kumanda listesi giriş paketinde, kumandanın geri kalanı
 * (`padInput.ts`) geç inen parçada kalsın.
 */
export type PadGlyphs = 'xbox' | 'playstation';
export type GlyphButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'menu' | 'view';

export function glyphOf(button: GlyphButton, glyphs: PadGlyphs): string {
  if (glyphs === 'playstation') {
    return { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', menu: 'Options', view: 'Create' }[button];
  }
  return { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', menu: '☰', view: '⧉' }[button];
}
