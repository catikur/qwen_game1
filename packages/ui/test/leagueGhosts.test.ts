import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRun } from '@capital/core';
import type { LeagueRun } from '@capital/core';
import { loadGhostLog, moveText, movesWindow } from '../src/LeagueGhosts';
import type { LeagueEntry } from '../src/useGame';

/** Hayalet eğri (Tur 54): kartın metni ve liderin kodunun inişi. */
const run: LeagueRun = {
  version: 2,
  weekId: '2026-W44',
  ceoId: null,
  companyName: 'Lider AŞ',
  score: 1000,
  curve: [100, 200],
  log: [
    [3, { type: 'BUY_TILE', tileId: 7 }],
    [3, { type: 'BUILD', tileId: 7, defId: 'cafe' }],
  ],
  sim: 'test',
};

function serverEntry(id: string, loadCode: () => Promise<string>): LeagueEntry {
  return {
    id,
    weekId: run.weekId,
    companyName: run.companyName,
    ceoId: null,
    score: run.score,
    curve: run.curve,
    code: '',
    codeKey: 'c'.repeat(64),
    loadCode,
    submittedAt: '',
  };
}

describe('hayalet eğri: hamle kartı', () => {
  test('hamle metni: bina adı, adet ve para', () => {
    assert.equal(moveText({ kind: 'build', day: 3, lastDay: 9, count: 2, defId: 'cafe' }), 'Kafe kurdu ×2');
    assert.equal(moveText({ kind: 'loan', day: 3, lastDay: 9, count: 2, amount: 650_000 }), 'Kredi çekti ×2 · 650 B ₺');
    assert.equal(moveText({ kind: 'land', day: 3, lastDay: 3, count: 1 }), 'Arsa aldı');
  });

  test('pencere: haftada 30 gün, günün koşusunda 10', () => {
    assert.equal(movesWindow(360), 30);
    assert.equal(movesWindow(90), 10);
  });

  test('liderin kodu bir kez iniyor; tablo tazelenip satır yenilense de', async () => {
    let downloads = 0;
    const loadCode = async () => {
      downloads++;
      return encodeRun(run);
    };
    const first = await loadGhostLog(serverEntry('s1', loadCode));
    const again = await loadGhostLog(serverEntry('s1', loadCode));
    assert.deepEqual(first, run.log);
    assert.equal(again, first);
    assert.equal(downloads, 1);
  });

  test('inmeyen kod sonra yeniden deneniyor', async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error('çevrimdışı');
      return encodeRun(run);
    };
    const entry = { ...serverEntry('s2', flaky), codeKey: 'd'.repeat(64) };
    assert.equal(await loadGhostLog(entry), null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(await loadGhostLog(entry), run.log);
    assert.equal(calls, 2);
  });
});
