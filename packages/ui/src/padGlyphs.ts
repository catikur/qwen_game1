/**
 * Düğme ipuçlarının yazısı (Tur 72): Steam'in sanal kumandası Xbox düzeninde
 * (Steam Deck de); Sony kumandasında şekiller ✕ ○ □ △. Ayrı ve küçük bir
 * modül: Ayarlar'ın kumanda listesi giriş paketinde, kumandanın geri kalanı
 * (`padInput.ts`) geç inen parçada kalsın.
 *
 * Düğme adları konum: `a` alttaki, `b` sağdaki, `x` soldaki, `y` üstteki
 * (tarayıcının standart düzeni). Nintendo kumandasında aynı konumların
 * yazısı başka: alttaki B, sağdaki A, soldaki Y, üstteki X (Codex #102).
 */
export type PadGlyphs = 'xbox' | 'playstation' | 'nintendo';
export type GlyphButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'lt' | 'rt' | 'menu' | 'view';

export function glyphOf(button: GlyphButton, glyphs: PadGlyphs): string {
  if (glyphs === 'playstation') {
    return { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', menu: 'Options', view: 'Create' }[button];
  }
  if (glyphs === 'nintendo') {
    return { a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', menu: '+', view: '−' }[button];
  }
  return { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', menu: '☰', view: '⧉' }[button];
}
