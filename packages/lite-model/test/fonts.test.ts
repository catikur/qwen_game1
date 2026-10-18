import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { repoRoot } from './fixture-path';

/*
 * Fredoka (başlık yazı tipi) Türkçe'nin beş harfini taşımıyor; harfler
 * tools/fredoka_turkish.py ile ekleniyor (Tur 40). Lite'ın dosyaları (web ve
 * iOS) yerinde yamalı, ana oyunun gömülü alt kümesi bu dosyalardan üretiliyor.
 * Dosyalardan biri yamasız bir sürümle değişirse harfler başka yazı tipine
 * düşer ya da çengeli kopuk çizilir; bu test onu yakalıyor.
 */
const TURKISH = 'ŞşĞğİ';
const root = repoRoot();
const LITE = ['apps/lite-web/public/fonts', 'ios-lite/App/Resources/Fonts'].flatMap((dir) =>
  ['Medium', 'SemiBold', 'Bold'].map((weight) => `${dir}/Fredoka-${weight}.ttf`),
);

/** sfnt `cmap` tablosundaki karakterler (biçim 4 ve 12). */
function cmapCodes(cmap: Buffer): Set<number> {
  const codes = new Set<number>();
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const at = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(at);
    if (format === 4) {
      const segments = cmap.readUInt16BE(at + 6) / 2;
      for (let s = 0; s < segments; s++) {
        const end = cmap.readUInt16BE(at + 14 + s * 2);
        const start = cmap.readUInt16BE(at + 16 + segments * 2 + s * 2);
        for (let code = start; code <= end && code !== 0xffff; code++) codes.add(code);
      }
    } else if (format === 12) {
      for (let g = 0; g < cmap.readUInt32BE(at + 12); g++) {
        const group = at + 16 + g * 12;
        for (let code = cmap.readUInt32BE(group); code <= cmap.readUInt32BE(group + 4); code++) codes.add(code);
      }
    }
  }
  return codes;
}

function ttfCmap(font: Buffer): Buffer {
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const entry = 12 + i * 16;
    if (font.toString('latin1', entry, entry + 4) === 'cmap') {
      const at = font.readUInt32BE(entry + 8);
      return font.subarray(at, at + font.readUInt32BE(entry + 12));
    }
  }
  throw new Error('cmap yok');
}

/** woff2'de cmap dönüştürülmüyor: tablo dizinini okuyup açılmış akıştan kesiliyor. */
function woff2Cmap(font: Buffer): Buffer {
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = font[at++]!;
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  let offset = 0;
  let cmap: { offset: number; length: number } | undefined;
  for (let i = 0; i < font.readUInt16BE(12); i++) {
    const flags = font[at++]!;
    const known = flags & 0x3f;
    const tag = known === 0x3f ? font.toString('latin1', at, (at += 4)) : known;
    const length = base128();
    const version = flags >> 6;
    const glyfOrLoca = tag === 10 || tag === 11 || tag === 'glyf' || tag === 'loca';
    const stored = (glyfOrLoca ? version !== 3 : version !== 0) ? base128() : length;
    if (tag === 0 || tag === 'cmap') cmap = { offset, length };
    offset += stored;
  }
  assert.ok(cmap, 'cmap yok');
  const data = brotliDecompressSync(font.subarray(at, at + font.readUInt32BE(20)));
  return data.subarray(cmap.offset, cmap.offset + cmap.length);
}

function missing(codes: Set<number>): string {
  return [...TURKISH].filter((ch) => !codes.has(ch.codePointAt(0)!)).join(' ');
}

test("Lite'ın Fredoka dosyalarında Türkçe harfler var (web ve iOS)", () => {
  for (const file of LITE) {
    const gone = missing(cmapCodes(ttfCmap(readFileSync(join(root, file)))));
    assert.equal(gone, '', `${file}: ${gone} eksik — python3 tools/fredoka_turkish.py`);
  }
});

test('ana oyunun gömülü Fredoka alt kümesinde Türkçe harfler var', () => {
  const css = readFileSync(join(root, 'packages/ui/src/fonts-cam.css'), 'utf8');
  const faces = [...css.matchAll(/font-family: 'Fredoka';[^}]*?font-weight: (\d+);[^}]*?base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(faces.length, 2);
  for (const [, weight, data] of faces) {
    const gone = missing(cmapCodes(woff2Cmap(Buffer.from(data!, 'base64'))));
    assert.equal(gone, '', `Fredoka ${weight}: ${gone} eksik — python3 tools/make-cam-fonts.py`);
  }
});
