import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { createNewGame } from '@capital/core';
import { PathSummary } from '../src/PathSummary';

const share = (html: string, source: string): number => Number(new RegExp(`data-path-source="${source}" data-share="(\\d+)"`).exec(html)?.[1] ?? NaN);

/** Şirketin yolu (Tur 61): canlı defter ve zafer günü donan defter. */
describe('şirketin yolu kutusu', () => {
  test('canlı: defterin payları', () => {
    const state = createNewGame({ seed: 1, companyName: 'Yol AŞ' });
    state.sources = { retail: 70, realestate: 30 };
    const html = renderToStaticMarkup(createElement(PathSummary, { state }));
    assert.match(html, /data-path="realestate"/);
    assert.deepEqual([share(html, 'retail'), share(html, 'realestate')], [70, 30]);
  });

  test('zafer ekranı zafer gününün paylarını çiziyor, sonraki defteri değil (Codex #91)', () => {
    const state = createNewGame({ seed: 1, companyName: 'Yol AŞ' });
    // Zaferden sonra uzakta yaşamaya devam eden şehir: defter perakendeye kaydı.
    state.sources = { retail: 95, realestate: 5 };
    const victory = { day: 600, kind: 'tycoon' as const, path: 'realestate' as const, shares: { retail: 0.7, realestate: 0.3, energy: 0, freight: 0 }, acquisitions: 0 };
    const html = renderToStaticMarkup(createElement(PathSummary, { state, victory }));
    assert.match(html, /data-path="realestate"/);
    assert.deepEqual([share(html, 'retail'), share(html, 'realestate')], [70, 30], html);
  });
});
