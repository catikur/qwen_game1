import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNCIL } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { buildCost } from '../src/actions';
import { motionSupport, runCouncilTick } from '../src/systems/council';
import type { GameState, MotionState } from '../src/types';

function motion(lobby: Record<string, number>, base = 0.45): MotionState {
  return { id: 'm', kind: 'permit_relief', title: 't', summary: 's', baseSupport: base, lobby };
}

function openSession(seed = 9): GameState {
  const state = createNewGame({ seed });
  state.time.day = COUNCIL.firstSessionDay;
  runCouncilTick(state);
  return state;
}

describe('meclis desteği', () => {
  test('lobisiz destek meclisin eğilimi', () => {
    assert.equal(motionSupport(motion({})).support, 0.45);
  });

  test('lobi destekleri kaydırır ve azalan verimlidir', () => {
    const one = motionSupport(motion({ a: 100_000 })).support - 0.45;
    const four = motionSupport(motion({ a: 400_000 })).support - 0.45;
    assert.ok(one > 0);
    assert.ok(four < one * 4 && four > one, `4× harcama ${four.toFixed(3)} vs ${one.toFixed(3)}`);
  });

  test('karşı lobi kaymayı geri alır, katkıların toplamı desteğe eşit', () => {
    const breakdown = motionSupport(motion({ a: 300_000, b: -120_000, c: 60_000 }));
    const total = breakdown.contributions.reduce((sum, entry) => sum + entry.delta, 0);
    assert.ok(Math.abs(breakdown.base + total - breakdown.support) < 1e-9);
  });

  test('kayma tavanlı', () => {
    const breakdown = motionSupport(motion({ a: 1e12 }));
    assert.ok(Math.abs(breakdown.support - (0.45 + COUNCIL.maxSwing)) < 1e-9);
  });
});

describe('meclis takvimi', () => {
  test('ilk oturum açılıyor, önergeler dışsal zardan', () => {
    const a = openSession(9);
    const b = createNewGame({ seed: 9 });
    b.rng.s = 12345; // durum zarını boz: önergeler etkilenmemeli
    b.time.day = COUNCIL.firstSessionDay;
    runCouncilTick(b);
    assert.equal(a.council?.session?.motions.length, COUNCIL.motionsPerSession);
    assert.deepEqual(
      a.council!.session!.motions.map((m) => [m.kind, m.baseSupport]),
      b.council!.session!.motions.map((m) => [m.kind, m.baseSupport]),
    );
  });

  test('oylama günü sonuç geçmişe yazılıyor, sıradaki oturum kuruluyor', () => {
    const state = openSession();
    const voteDay = state.council!.session!.voteDay;
    state.time.day = voteDay;
    runCouncilTick(state);
    assert.equal(state.council!.session, null);
    assert.equal(state.council!.history.length, COUNCIL.motionsPerSession);
    assert.ok(state.council!.history.every((m) => m.result !== undefined));
    assert.equal(state.council!.nextSessionDay, voteDay + COUNCIL.sessionEveryDays - COUNCIL.lobbyWindowDays);
  });

  test('bayrak kapalıyken meclis hiç toplanmıyor', () => {
    const state = createNewGame({ seed: 9 });
    state.flags.council = false;
    state.time.day = COUNCIL.firstSessionDay;
    runCouncilTick(state);
    assert.equal(state.council, undefined);
  });
});

describe('lobi komutu', () => {
  test('bağış nakitten düşüyor ve önergeye işleniyor', () => {
    const engine = new GameEngine(openSession());
    const state = engine.getState();
    const target = state.council!.session!.motions[0]!;
    const cash = state.companies['player']!.cash;
    assert.ok(engine.dispatch({ type: 'LOBBY', motionId: target.id, side: 'against', amount: 50_000 }).ok);
    assert.equal(state.companies['player']!.cash, cash - 50_000);
    assert.equal(target.lobby['player'], -50_000);
  });

  test('oturum yokken ya da nakit yetmezken reddediliyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 9 }));
    assert.equal(engine.dispatch({ type: 'LOBBY', motionId: 'x', side: 'for', amount: 1 }).ok, false);
    const open = new GameEngine(openSession());
    const id = open.getState().council!.session!.motions[0]!.id;
    assert.equal(open.dispatch({ type: 'LOBBY', motionId: id, side: 'for', amount: 1e12 }).ok, false);
  });

  test('yeterli lobi önergeyi geçiriyor, karşı lobi düşürüyor', () => {
    for (const [side, expected] of [['for', true], ['against', false]] as const) {
      const engine = new GameEngine(openSession());
      const state = engine.getState();
      const target = state.council!.session!.motions[0]!;
      state.companies['player']!.cash = 1e9;
      engine.dispatch({ type: 'LOBBY', motionId: target.id, side, amount: 20_000_000 });
      state.time.day = state.council!.session!.voteDay;
      runCouncilTick(state);
      assert.equal(state.council!.history.find((m) => m.id === target.id)?.result?.passed, expected, side);
    }
  });
});

describe('kararların etkisi', () => {
  test('ruhsat kolaylığı inşaatı herkese ucuzlatıyor', () => {
    const state = createNewGame({ seed: 9 });
    const before = buildCost(state, 'player', 'corner_shop');
    state.policies = [{ kind: 'permit_relief', rate: COUNCIL.permitDiscount, untilDay: 999, title: 't' }];
    assert.equal(buildCost(state, 'player', 'corner_shop'), Math.round(before * (1 - COUNCIL.permitDiscount)));
  });

  test('süresi dolan karar düşüyor', () => {
    const state = createNewGame({ seed: 9 });
    state.policies = [{ kind: 'permit_relief', rate: 0.1, untilDay: 50, title: 't' }];
    state.time.day = 50;
    runCouncilTick(state);
    assert.equal(state.policies.length, 0);
  });
});
