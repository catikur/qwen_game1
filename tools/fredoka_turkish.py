"""
Fredoka'ya Türkçe'nin eksik beş harfini (Ş ş Ğ ğ İ) ekler.

Fredoka bu harfleri taşımıyor (resmî 2.001 sürümü de: 320 glif). Eksik harf
bir sonraki yazı tipine düşüyor; başlıkta "Şehrin" ve "karşı" iki ayrı yazı
tipiyle görünüyordu (Tur 40). Harfler yazı tipinin kendi birleşen
işaretlerinden kuruluyor (s + çengel, g + ayraç, I + nokta); yükseklik
yazı tipinin kendi bileşik harflerinden okunuyor (ç, Ç, Â, Ï), yatayda
işaret gövdenin ortasına hizalanıyor. Lisans (SIL OFL 1.1) değiştirilmiş
sürüme izin veriyor; ayrılmış yazı tipi adı yok.

Çalıştırma: python3 tools/fredoka_turkish.py  (fonttools gerekir)
Lite'ın Fredoka dosyalarını (web ve iOS) yerinde yamalar; ikinci kez
çalıştırmak bir şey değiştirmez. Ana oyunun gömülü yazı tipleri
tools/make-cam-fonts.py ile, aynı işlevden.
"""
import pathlib
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    *(ROOT / 'apps/lite-web/public/fonts').glob('Fredoka-*.ttf'),
    *(ROOT / 'ios-lite/App/Resources/Fonts').glob('Fredoka-*.ttf'),
]

#   (ad, kod, gövde, işaret, dikey kaydırmanın okunduğu bileşik harf)
TURKISH = [
    ('scedilla', 0x15F, 's', 'uni0327', ('ccedilla', 'uni0327')),
    ('Scedilla', 0x15E, 'S', 'uni0327', ('Ccedilla', 'uni0327')),
    ('gbreve', 0x11F, 'g', 'uni0306', None),
    ('Gbreve', 0x11E, 'G', 'uni0306', ('Acircumflex', 'uni0302')),
    ('Idotaccent', 0x130, 'I', 'uni0307', ('Idieresis', 'uni0308')),
]


def add_turkish(font: TTFont) -> None:
    """Eksik Türkçe harfleri gövde + birleşen işaret bileşiği olarak ekler."""
    cmap = font.getBestCmap()
    glyf = font['glyf']
    hmtx = font['hmtx']

    def bounds(name: str) -> tuple[int, int, int, int]:
        glyph = glyf[name]
        glyph.recalcBounds(glyf)
        return glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax

    def center(name: str) -> float:
        x0, _, x1, _ = bounds(name)
        return (x0 + x1) / 2

    added = []
    for name, code, base, mark, model in TURKISH:
        if code in cmap or name in glyf:
            continue
        dy = 0
        if model:
            # Örnek bileşikteki işaretin yüksekliği; işaret farklıysa alt kenarları eşitleniyor.
            sample, sample_mark = model
            component = next(c for c in glyf[sample].components if c.glyphName == sample_mark)
            dy = component.y + bounds(sample_mark)[1] - bounds(mark)[1]
        parts = []
        for glyph_name, x, y, flags in ((base, 0, 0, 0x204), (mark, round(center(base) - center(mark)), dy, 0x4)):
            component = GlyphComponent()
            component.glyphName = glyph_name
            component.x, component.y, component.flags = x, y, flags
            parts.append(component)
        glyph = Glyph()
        glyph.numberOfContours = -1
        glyph.components = parts
        glyf[name] = glyph
        glyph.recalcBounds(glyf)
        hmtx[name] = (hmtx[base][0], glyph.xMin)
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[code] = name
        added.append(name)
    if added:
        # `glyf[ad] = ...` yeni adı tablonun sırasına ekliyor; yazı tipinin sırası onunla aynı olmalı.
        order = font.getGlyphOrder()
        font.setGlyphOrder(order + [name for name in added if name not in order])
        glyf.glyphOrder = font.getGlyphOrder()
        gdef = font.get('GDEF')
        if gdef and gdef.table.GlyphClassDef:
            for name in added:
                gdef.table.GlyphClassDef.classDefs[name] = 1


def main() -> None:
    for path in sorted(FILES):
        font = TTFont(path)
        before = len(font.getBestCmap())
        add_turkish(font)
        after = len(font.getBestCmap())
        if after != before:
            font.save(path)
        print(f'{path.relative_to(ROOT)}: {before} → {after} karakter')


if __name__ == '__main__':
    sys.exit(main())
