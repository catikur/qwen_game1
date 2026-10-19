import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGame, runFacts } from '@capital/core';
import { careerRunResult } from '../src/careerFormat';
import type { CareerRun } from '../src/career';

/** Kariyer geçmişindeki sonuç satırı (Tur 41). */
function run(over: Partial<CareerRun>): CareerRun {
  const facts = runFacts(createNewGame({ seed: 4, companyName: 'Sonuç AŞ' }));
  return { ...facts, firstSeenIso: '2026-10-01T00:00:00.000Z', lastSeenIso: '2026-10-01T00:00:00.000Z', ...over };
}

describe('kariyer geçmişi: sonuç', () => {
  test('zafer günüyle, sürüyor, devralındı', () => {
    assert.equal(careerRunResult(run({ wins: [{ day: 640, citySize: 'standard' }], day: 700 })), 'Zafer · 640. gün');
    assert.equal(careerRunResult(run({ day: 90 })), 'Sürüyor · 90. gün');
    assert.equal(careerRunResult(run({ day: 300, lost: true })), 'Devralındı · 300. gün');
  });

  test('zaferi yalnız kapatılan şehirde kalan koşu zaferli görünüyor (Codex #70)', () => {
    assert.equal(careerRunResult(run({ wins: [], closedWins: 1, day: 820 })), 'Zafer');
    assert.equal(careerRunResult(run({ wins: [], closedWins: 1, day: 820, lost: true })), 'Zafer', 'kayıp şehirden önce kazanılmış');
  });
});
