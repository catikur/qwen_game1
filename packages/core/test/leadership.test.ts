import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { stepLeadership } from '../src/leadership';
import type { GameState } from '../src/types';

/** Aynı bölgede iki şirketin birer mağazası; cirolar elle. */
function duel(): { state: GameState; mine: string; theirs: string; rival: string } {
  const engine = new GameEngine(createNewGame({ seed: 2 }));
  for (let day = 0; day < 3; day++) engine.runDay();
  const state = engine.getState();
  for (const id of Object.keys(state.buildings)) delete state.buildings[id];
  const rival = Object.values(state.companies).find((c) => !c.isPlayer)!.id;
  const def = Object.values(BUILDING_BY_ID).find((d) => d.role === 'outlet')!;
  const make = (id: string, companyId: string, revenue: number) => {
    state.buildings[id] = {
      id, defId: def.id, tileId: 0, districtId: 0, companyId, priceMultiplier: 1, autoPrice: true, builtDay: 0, stocked: [], focus: null,
      last: { unitsSold: 0, capacityUsed: 0, revenue, cogs: 0, upkeep: 0, wages: 0, profit: 0, share: 0, producedUnits: 0, soldToMarket: 0 },
    };
  };
  make('m', 'player', 1000);
  make('t', rival, 600);
  return { state, mine: 'm', theirs: 't', rival };
}

describe('bölge liderliği', () => {
  test('ilk gün sessizce kurulur', () => {
    const { state } = duel();
    const { memory, changes } = stepLeadership(state, null);
    assert.equal(memory.leader[0], 'player');
    assert.equal(changes.length, 0);
  });

  test('ortalama yavaş döner, liderlik %5 farkla el değiştirir', () => {
    const { state, mine, theirs, rival } = duel();
    let { memory } = stepLeadership(state, null);
    state.buildings[mine]!.last.revenue = 600;
    state.buildings[theirs]!.last.revenue = 1000;
    // Tek günlük sıçrama devir değil.
    let step = stepLeadership(state, memory);
    assert.equal(step.changes.length, 0);
    memory = step.memory;
    let day = 1;
    let change = null;
    while (!change && day < 60) {
      step = stepLeadership(state, memory);
      memory = step.memory;
      change = step.changes[0] ?? null;
      day++;
    }
    assert.ok(change, 'devir oldu');
    assert.equal(change!.from, 'player');
    assert.equal(change!.to, rival);
    assert.ok(day > 3, `${day}. gün`);
    assert.ok(change!.toShare > change!.fromShare);
  });

  test('yakın iki şirket her gün yer değiştirmiyor', () => {
    const { state, mine, theirs } = duel();
    let { memory } = stepLeadership(state, null);
    let changes = 0;
    for (let day = 0; day < 120; day++) {
      // ±%3 salınım: eşik %5.
      state.buildings[mine]!.last.revenue = day % 2 ? 1000 : 970;
      state.buildings[theirs]!.last.revenue = day % 2 ? 970 : 1000;
      const step = stepLeadership(state, memory);
      memory = step.memory;
      changes += step.changes.length;
    }
    assert.equal(changes, 0);
  });

  test('motor oyuncuyu ilgilendiren devri haber yapıyor', () => {
    const { state, mine, theirs, rival } = duel();
    state.flags.npcCompetition = false;
    const engine = new GameEngine(state);
    // Mağaza dışında bina yok; ciroları her gün elle yaz ve yalnızca liderlik adımını sına.
    const check = (engine as unknown as { checkLeadership(): void }).checkLeadership.bind(engine);
    check();
    state.buildings[mine]!.last.revenue = 100;
    state.buildings[theirs]!.last.revenue = 2000;
    for (let day = 0; day < 30; day++) check();
    const item = state.news.find((n) => /öne geçti/.test(n.title));
    assert.ok(item, 'kayıp haberi');
    assert.equal(item!.companyId, rival);
    assert.equal(item!.districtId, 0);
  });
});
