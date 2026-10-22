import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import { ghostMoves, ghostTally } from '../src/ghost';
import { createLeagueGame, decodeRun, encodeRun, runFromState } from '../src/league';
import type { LoggedCommand } from '../src/types';
import { playerStrategy } from './proxy';

const LOG: LoggedCommand[] = [
  [0, { type: 'BUY_TILE', tileId: 4 }],
  [0, { type: 'BUILD', tileId: 4, defId: 'grocery' }],
  [3, { type: 'RENAME_COMPANY', name: 'Başka AŞ' }],
  [12, { type: 'TAKE_LOAN', kind: 'term', amount: 400_000, termDays: 180 }],
  [12, { type: 'BUILD', tileId: 9, defId: 'farm' }],
  [15, { type: 'CLAIM_BUBBLE' }],
  [18, { type: 'BUILD', tileId: 10, defId: 'farm' }],
  [18, { type: 'BUYOUT_TILE', tileId: 11 }],
  [19, { type: 'SET_PRICE_MULTIPLIER', buildingId: 'b1', multiplier: 1.1 }],
  [20, { type: 'TAKE_LOAN', kind: 'secured', amount: 250_000, termDays: 90 }],
  [20, { type: 'BUILD', tileId: 12, defId: 'grocery' }],
];

describe('hayaletin hamleleri (Tur 54)', () => {
  test('pencere [from, to): türe ve bina türüne göre toplanıyor, ilk görüldüğü sırayla', () => {
    const moves = ghostMoves(LOG, 10, 20);
    assert.deepEqual(moves, [
      { kind: 'loan', day: 12, lastDay: 12, count: 1, amount: 400_000 },
      { kind: 'build', day: 12, lastDay: 18, count: 2, defId: 'farm' },
      { kind: 'land', day: 18, lastDay: 18, count: 1 },
      { kind: 'price', day: 19, lastDay: 19, count: 1 },
    ]);
  });

  test('stratejiyi anlatmayan komutlar sayılmıyor; paralar toplanıyor', () => {
    const moves = ghostMoves(LOG, 0, 100);
    assert.ok(!moves.some((move) => (move.kind as string) === 'rename'), 'şirket adı hamle değil');
    assert.equal(
      moves.reduce((sum, move) => sum + move.count, 0),
      LOG.length - 2,
      'ad ve balon dışında hepsi',
    );
    assert.equal(moves.find((move) => move.kind === 'loan')?.amount, 650_000);
    assert.deepEqual(
      moves.filter((move) => move.kind === 'build').map((move) => [move.defId, move.count]),
      [
        ['grocery', 2],
        ['farm', 2],
      ],
    );
  });

  test('bozuk satır atlanıyor, hata atılmıyor', () => {
    const broken = [
      ['on', { type: 'BUILD', tileId: 1, defId: 'farm' }],
      [5, null],
      [5, { type: 'NOT_A_COMMAND' }],
      [6, { type: 'BUILD', tileId: 2 }],
    ] as unknown as LoggedCommand[];
    assert.deepEqual(ghostMoves(broken, 0, 100), [{ kind: 'build', day: 6, lastDay: 6, count: 1 }]);
  });

  test('sayım o gün dahil: bina, arsa, kredi', () => {
    assert.deepEqual(ghostTally(LOG, 17), { built: 2, land: 1, loans: 1, borrowed: 400_000, moves: 4 });
    assert.deepEqual(ghostTally(LOG, 18), { built: 3, land: 2, loans: 1, borrowed: 400_000, moves: 6 });
    assert.deepEqual(ghostTally(LOG, 360), { built: 4, land: 2, loans: 2, borrowed: 650_000, moves: 9 });
  });

  test('gerçek bir günün koşusu: koddan çözülen günlük oyuncunun kendi sayımıyla aynı', () => {
    const engine = new GameEngine(createLeagueGame('2026-10-22', 'Hayalet AŞ', null));
    while (engine.getState().league!.finishedDay === undefined) {
      if (engine.getState().time.day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    const state = engine.getState();
    const run = decodeRun(encodeRun(runFromState(state)!))!;
    const tally = ghostTally(run.log, 90);
    assert.deepEqual(tally, ghostTally(state.commandLog ?? [], 90));
    assert.ok(tally.built > 0, 'vekil bina kuruyor');
    const owned = Object.values(state.buildings).filter((building) => building.companyId === state.playerCompanyId).length;
    assert.ok(tally.built >= owned, `kurulan ${tally.built} ≥ elde ${owned}`);
    const builds = run.log.filter(([, command]) => command.type === 'BUILD').length;
    assert.equal(tally.built, builds);
  });
});
