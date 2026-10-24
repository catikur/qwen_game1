import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, createNewGame, getPlayer } from '@capital/core';
import type { GameState } from '@capital/core';
import { MONEY_TAGS, momentsBetween, moneyTagsOf, snapshotOf } from '../src/moments';

/** Önemli anlar (Tur 63): kazanç etiketleri ve devralma/zafer anları, iki hâlin farkından. */

/** Rakiplerin şube açtığı bir şehir: ilk günlerde rakipler kuruyor. */
function grownCity(): GameState {
  const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'An AŞ' }));
  for (let day = 0; day < 40 && Object.keys(engine.getState().buildings).length < 6; day++) engine.runDay();
  return engine.getState();
}

function cityWith(profits: number[]): { state: GameState; ids: string[] } {
  const state = grownCity();
  const player = getPlayer(state);
  const rival = Object.values(state.buildings).find((b) => b.companyId !== player.id);
  assert.ok(rival, 'şehirde rakip binası var');
  const ids: string[] = [];
  profits.forEach((profit, i) => {
    const id = `test-b${i}`;
    state.buildings[id] = { ...structuredClone(rival), id, tileId: rival.tileId + i, companyId: player.id, last: { ...rival.last, profit } };
    ids.push(id);
  });
  return { state, ids };
}

describe('kazanç etiketleri', () => {
  test('en çok kazandıran üç bina, büyükten küçüğe; rakibin binası yok', () => {
    const { state, ids } = cityWith([120, 900, 40, 500, 0, 300]);
    const tags = moneyTagsOf(state);
    assert.deepEqual(tags.map((tag) => tag.buildingId), [ids[1], ids[3], ids[5]]);
    assert.deepEqual(tags.map((tag) => tag.amount), [900, 500, 300]);
    assert.equal(tags.length, MONEY_TAGS.gains);
  });

  test('çok zarar eden bina kırmızı etiketle; küçük zarar gürültü', () => {
    const big = cityWith([800, 400, -350]);
    assert.deepEqual(moneyTagsOf(big.state).map((tag) => tag.amount), [800, 400, -350]);
    const small = cityWith([800, 400, -60]);
    assert.deepEqual(moneyTagsOf(small.state).map((tag) => tag.amount), [800, 400]);
    const onlyLoss = cityWith([-20]);
    assert.deepEqual(moneyTagsOf(onlyLoss.state).map((tag) => tag.amount), [-20], 'kazanç yoksa zarar görünüyor');
  });
});

describe('büyük anlar', () => {
  test('oyuncu rakibi devralınca: adı, rengi, oyuncuya geçen binaları', () => {
    const state = grownCity();
    const player = getPlayer(state);
    const target = Object.values(state.companies).find((c) => !c.isPlayer && Object.values(state.buildings).some((b) => b.companyId === c.id));
    assert.ok(target);
    const before = snapshotOf(state);
    const owned = Object.values(state.buildings).filter((b) => b.companyId === target.id);
    for (const building of owned) building.companyId = player.id;
    delete state.companies[target.id];
    player.acquisitions = (player.acquisitions ?? 0) + 1;
    assert.deepEqual(momentsBetween(before, state), [
      { kind: 'takeover', companyId: target.id, name: target.name, color: target.color, buildings: owned.length },
    ]);
    assert.deepEqual(momentsBetween(snapshotOf(state), state), [], 'an bir kez');
  });

  test('rakip rakibi yutunca oyuncunun anı yok', () => {
    const state = createNewGame({ seed: 3, companyName: 'An AŞ' });
    const rivals = Object.values(state.companies).filter((c) => !c.isPlayer);
    const before = snapshotOf(state);
    for (const building of Object.values(state.buildings)) if (building.companyId === rivals[1]!.id) building.companyId = rivals[0]!.id;
    delete state.companies[rivals[1]!.id];
    rivals[0]!.acquisitions = (rivals[0]!.acquisitions ?? 0) + 1;
    assert.deepEqual(momentsBetween(before, state), []);
  });

  test('zafer ilan edilince bir kez; kapatılmış zafer an değil', () => {
    const state = createNewGame({ seed: 3, companyName: 'An AŞ' });
    const before = snapshotOf(state);
    state.victory = { day: 400, kind: 'monopoly', path: 'retail', shares: { retail: 1, realestate: 0, energy: 0, freight: 0 }, acquisitions: 0 };
    assert.deepEqual(momentsBetween(before, state), [{ kind: 'victory', victory: 'monopoly' }]);
    const after = snapshotOf(state);
    assert.deepEqual(momentsBetween(after, state), []);
    state.victory.dismissed = true;
    assert.deepEqual(momentsBetween(after, state), []);
  });
});
