import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import { createLeagueGame, decodeRun, encodeRun, replayRun, runFromState } from '../src/league';
import { LEAGUE_DAYS, leagueSeed, leagueWeekId } from '../src/systems/league';
import { createNewGame } from '../src/worldgen';
import type { GameState } from '../src/types';
import { playerStrategy } from './proxy';

/** Vekil oyuncuyla bir lig koşusu; isteğe bağlı olarak ortada "yeniden yükleme". */
function playLeague(options: { reloadAt?: number; cheatAt?: number } = {}): GameState {
  let engine = new GameEngine(createLeagueGame('2026-W40', 'Lig AŞ', null));
  while (engine.getState().league!.finishedDay === undefined) {
    const day = engine.getState().time.day;
    if (day === options.reloadAt) {
      // Sayfa yenileme: kayıttan yeni bir motor.
      engine = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    }
    if (day === options.cheatAt) engine.getState().companies['player']!.cash += 5_000_000;
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine.getState();
}

describe('lig takvimi', () => {
  test('ISO hafta kimliği', () => {
    assert.equal(leagueWeekId(new Date(Date.UTC(2026, 9, 4))), '2026-W40');
    assert.equal(leagueWeekId(new Date(Date.UTC(2026, 0, 1))), '2026-W01');
    assert.equal(leagueWeekId(new Date(Date.UTC(2027, 0, 3))), '2026-W53');
  });

  test('aynı hafta aynı şehir, farklı hafta farklı şehir', () => {
    assert.equal(leagueSeed('2026-W40'), leagueSeed('2026-W40'));
    assert.notEqual(leagueSeed('2026-W40'), leagueSeed('2026-W41'));
    const a = createLeagueGame('2026-W40', 'A', null);
    const b = createLeagueGame('2026-W40', 'B', null);
    assert.equal(a.meta.seed, b.meta.seed);
    assert.equal(a.difficulty, undefined, 'lig Dengeli');
  });

  test('ligde kural değiştirilemez', () => {
    const engine = new GameEngine(createLeagueGame('2026-W40', 'A', null));
    assert.equal(engine.dispatch({ type: 'SET_FLAG', flag: 'npcCompetition', value: false }).ok, false);
    const free = new GameEngine(createNewGame({ seed: 1 }));
    assert.ok(free.dispatch({ type: 'SET_FLAG', flag: 'npcCompetition', value: false }).ok);
  });
});

describe('koşu doğrulaması', () => {
  test('360 gün sonunda skor kayda geçiyor, eğri örnekleniyor', () => {
    const state = playLeague();
    assert.equal(state.league!.finishedDay, LEAGUE_DAYS);
    assert.ok((state.league!.score ?? 0) > 0);
    assert.equal(state.league!.curve.length, LEAGUE_DAYS / 10 + 1);
    assert.ok((state.commandLog?.length ?? 0) > 20, 'vekil komutları günlükte');
  });

  test('koşu kodu tekrarla aynı skoru veriyor', async () => {
    const run = runFromState(playLeague())!;
    const decoded = decodeRun(encodeRun(run))!;
    assert.deepEqual(decoded, run);
    const result = await replayRun(decoded);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });

  test('ortada sayfa yenilense de tekrar tutuyor', async () => {
    const run = runFromState(playLeague({ reloadAt: 137 }))!;
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
  });

  test('konsoldan eklenen nakit tekrarda bulunamıyor', async () => {
    const run = runFromState(playLeague({ cheatAt: 90 }))!;
    const result = await replayRun(run);
    assert.equal(result.ok, false);
    assert.ok(result.score < run.score);
  });

  test('bozuk kod reddediliyor', () => {
    assert.equal(decodeRun('selam'), null);
    assert.equal(decodeRun('CF1.@@@'), null);
  });
});
