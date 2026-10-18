"""
"Cam & Bulut" yazı tiplerini (Fredoka, Nunito) ana oyuna gömülü üretir.

Kaynak: Lite web'in dosyaları (apps/lite-web/public/fonts, SIL OFL 1.1).
Ana oyun tek dosya olarak da derlendiği için yazı tipleri CSS'e base64
woff2 olarak gömülüyor; boyut için Latin + Türkçe ve arayüzde geçen
simgelerle sınırlı alt küme alınıyor.

Çalıştırma: python3 tools/make-cam-fonts.py  (fonttools + brotli gerekir)
Çıktı: packages/ui/src/fonts-cam.css
"""
import base64
import io
import pathlib

from fontTools import subset
from fontTools.ttLib import TTFont

from fredoka_turkish import add_turkish

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'apps/lite-web/public/fonts'
TARGET = ROOT / 'packages/ui/src/fonts-cam.css'

# Latin, Latin-1, Türkçe harfler, tipografi ve arayüz simgeleri (₺, oklar, ≈, ×, üçgenler).
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [0x11E, 0x11F, 0x130, 0x131, 0x15E, 0x15F, 0x152, 0x153]
    + list(range(0x2010, 0x2028))
    + list(range(0x2030, 0x203B))
    + [0x20AC, 0x20BA, 0x2116, 0x2122, 0x2212, 0x2248, 0x2260, 0x2264, 0x2265, 0x00D7, 0x2022]
    + list(range(0x2190, 0x219A))
    + list(range(0x25B2, 0x25BE))
)

FACES = [
    ('Fredoka', 600, 'Fredoka-SemiBold.ttf'),
    ('Fredoka', 700, 'Fredoka-Bold.ttf'),
    ('Nunito', 600, 'Nunito-SemiBold.ttf'),
    ('Nunito', 700, 'Nunito-Bold.ttf'),
    ('Nunito', 800, 'Nunito-ExtraBold.ttf'),
]


def woff2(path: pathlib.Path) -> bytes:
    # Zaman damgası kaynaktan kalıyor: aynı kaynak her koşuda aynı dosyayı veriyor.
    font = TTFont(path, recalcTimestamp=False)
    # Kaynak dosyalar yamalı (tools/fredoka_turkish.py); yükseltilmiş bir kaynak gelirse de harfler eksik kalmasın.
    if font['name'].getDebugName(1).startswith('Fredoka'):
        add_turkish(font)
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'case', 'locl', 'ccmp', 'mark', 'mkmk']
    options.name_IDs = ['*']
    options.notdef_outline = True
    sub = subset.Subsetter(options)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    out = io.BytesIO()
    font.flavor = 'woff2'
    font.save(out)
    return out.getvalue()


def main() -> None:
    parts = [
        '/*',
        ' * "Cam & Bulut" yazı tipleri: Fredoka (başlık) ve Nunito (gövde).',
        ' * Fredoka — Copyright 2016 The Fredoka Project Authors.',
        ' * Nunito — Copyright 2014 The Nunito Project Authors.',
        ' * İkisi de SIL Open Font License 1.1: https://scripts.sil.org/OFL',
        ' *',
        ' * Lite ile aynı aile. Latin + Türkçe ve arayüz simgeleriyle sınırlı alt küme,',
        ' * woff2, CSS\'e gömülü (oyun tek dosya olarak da derleniyor).',
        ' *',
        ' * BU DOSYA ÜRETİLMİŞTİR — elle düzenlenmez: python3 tools/make-cam-fonts.py',
        ' */',
        '',
    ]
    total = 0
    for family, weight, file in FACES:
        data = woff2(SOURCE / file)
        total += len(data)
        encoded = base64.b64encode(data).decode('ascii')
        parts += [
            '@font-face {',
            f"  font-family: '{family}';",
            '  font-style: normal;',
            f'  font-weight: {weight};',
            '  font-display: swap;',
            f"  src: url(data:font/woff2;base64,{encoded}) format('woff2');",
            '}',
            '',
        ]
        print(f'{family} {weight}: {len(data) / 1024:.1f} KB')
    TARGET.write_text('\n'.join(parts), encoding='utf-8')
    print(f'toplam {total / 1024:.1f} KB woff2 → {TARGET.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
