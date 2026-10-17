import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { recordScenarioResult, scenarioRecord, scenarioRunKey } from '../src/scenarioBest';

/**
 * Cihazdaki en iyi sonuç (Tur 39). Testte `localStorage` yok: kayıt
 * bellekte çalışıyor (depo kapalı tarayıcıdaki gibi).
 */
describe('senaryonun cihazdaki en iyisi', () => {
  test('aynı koşunun sonucu bir kez sayılıyor', () => {
    const key = scenarioRunKey({ createdAtIso: '2026-10-17T10:00:00.000Z', finishedDay: 350, outcome: 'won', score: 1.2 });
    assert.equal(recordScenarioResult('crisis', key, 2, 1.2), true);
    assert.equal(recordScenarioResult('crisis', key, 2, 1.2), true);
    assert.equal(scenarioRecord('crisis').attempts, 1);
  });

  test('kayıttan dönüp aynı gün başka sonuçla biten koşu ayrı deneme; daha iyiyse en iyi oluyor', () => {
    // Krizin ortasında hep son gün bitiyor: kuruluş anı + gün iki koşuyu ayırmıyordu.
    const first = scenarioRunKey({ createdAtIso: '2026-10-17T11:00:00.000Z', finishedDay: 350, outcome: 'won', score: 1.1 });
    const forked = scenarioRunKey({ createdAtIso: '2026-10-17T11:00:00.000Z', finishedDay: 350, outcome: 'won', score: 1.5 });
    assert.notEqual(first, forked);
    recordScenarioResult('rescue', first, 1, 1.1);
    assert.equal(recordScenarioResult('rescue', forked, 3, 1.5), true);
    assert.deepEqual(scenarioRecord('rescue').best, { stars: 3, score: 1.5, run: forked });
    assert.equal(scenarioRecord('rescue').attempts, 2);
  });
});
