import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { ModifierLine } from '../src/ModifierLine';

/** Ek kural satırı (Tur 45, Tur 60): senaryonun kuralı zorluk çarpanına girmiyor. */
describe('ek kural satırı', () => {
  test('serbest oyunda kurallar ve zorluk çarpanı', () => {
    const html = renderToStaticMarkup(createElement(ModifierLine, { modifiers: ['tight_credit'] }));
    assert.match(html, /Sıkı banka/);
    assert.match(html, /×1,20/);
  });

  test('senaryoda kural var, çarpan yok (Codex #90)', () => {
    const html = renderToStaticMarkup(createElement(ModifierLine, { modifiers: ['tight_credit'], scenario: true }));
    assert.match(html, /Sıkı banka/);
    assert.ok(!/×/.test(html), html);
  });
});
