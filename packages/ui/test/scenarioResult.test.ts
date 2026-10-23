import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO_BY_ID } from '@capital/content';
import type { ScenarioState } from '@capital/core';
import { scenarioResultText } from '../src/ScenarioScreens';

/** Senaryo sonucunun cümlesi (Tur 60): süre dolunca eksik kalan koşul. */
function lost(id: string, score: number): string {
  const run: ScenarioState = { id, startDay: 250, endDay: 610, finishedDay: 610, outcome: 'lost', lostReason: 'time', score };
  return scenarioResultText(SCENARIO_BY_ID[id]!, run);
}

describe('senaryo sonucu (Tur 60)', () => {
  test('dönüşüm: birim yetip dönüşüm projesi eksikse sonuç eksik koşulu söylüyor (Codex #90)', () => {
    const met = lost('renewal', 1.05);
    assert.match(met, /dönüşüm projesi/);
    assert.ok(!/%105/.test(met), met);
    assert.match(lost('renewal', 0.6), /dolu birim hedefin %60 kadarında kaldı/);
  });

  test('nakliye: mağaza yetip rakip eksikse rakibi söylüyor', () => {
    assert.match(lost('haulage', 1.2), /2 ayrı rakibin/);
    assert.match(lost('haulage', 0.5), /%50/);
  });
});
