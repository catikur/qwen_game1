import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, LABOR, NPC_LABOR, NPC_PROFILES, WAGE_POLICIES } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { isDistrictOpen } from '../src/systems/city';
import {
  WAGE_PER_JOB,
  compromiseOdds,
  runLaborTick,
  strikeFactor,
  wageFor,
  wageIndexTarget,
  workforce,
} from '../src/systems/labor';
import type { BuildingInstance, GameState, LaborState } from '../src/types';

/** Açık bir bölgedeki boş parsele doğrudan bina koyar (test kısayolu). */
function place(state: GameState, companyId: string, defId: string): BuildingInstance {
  const tile = state.map.tiles.find(
    (t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId && isDistrictOpen(state, t.districtId),
  )!;
  const id = `t${state.nextId++}`;
  tile.ownerId = companyId;
  tile.buildingId = id;
  const building: BuildingInstance = {
    id,
    defId,
    tileId: tile.id,
    districtId: tile.districtId,
    companyId,
    priceMultiplier: 1,
    autoPrice: true,
    builtDay: state.time.day,
    stocked: [],
    focus: null,
    last: { unitsSold: 0, capacityUsed: 0, revenue: 0, cogs: 0, upkeep: 0, wages: 0, profit: 0, share: 0, producedUnits: 0, soldToMarket: 0 },
  };
  state.buildings[id] = building;
  return building;
}

/** Oyuncuya ~300 çalışanlık üretim. */
function staffed(seed = 3): GameState {
  const state = createNewGame({ seed });
  for (let i = 0; i < 4; i++) place(state, 'player', 'wheat_farm');
  return state;
}

function fillPressure(state: GameState, companyId = 'player'): void {
  for (let i = 0; i < 2000 && !state.companies[companyId]!.labor?.demand; i++) {
    state.time.day += 1;
    runLaborTick(state);
  }
}

describe('ücret', () => {
  test('işgücü kapalıyken Tur 17 formülü birebir', () => {
    const state = createNewGame({ seed: 2 });
    state.flags.labor = false;
    const district = state.districts[0]!;
    district.wageIndex = 1.3;
    state.companies.player!.labor = { policy: 'high', pressure: 0, agreement: 1.5 };
    const def = BUILDING_BY_ID.supermarket!;
    assert.equal(wageFor(state, 'player', 'supermarket', 0), def.jobs * WAGE_PER_JOB * (0.6 + district.incomeLevel));
  });

  test('bölge endeksi, politika ve sözleşme çarpılıyor', () => {
    const state = createNewGame({ seed: 2 });
    const base = wageFor(state, 'player', 'supermarket', 0);
    state.districts[0]!.wageIndex = 1.2;
    state.companies.player!.labor = { policy: 'low', pressure: 0, agreement: 1.1 };
    const expected = base * 1.2 * WAGE_POLICIES.low.wage * 1.1;
    assert.ok(Math.abs(wageFor(state, 'player', 'supermarket', 0) - expected) < 1e-9);
  });

  test('yoğun iş bölgesinde endeks yükseliyor, tavanı aşmıyor', () => {
    assert.equal(wageIndexTarget(10, 1000), 1);
    assert.ok(wageIndexTarget(600, 1000) > 1);
    assert.equal(wageIndexTarget(1e6, 1000), LABOR.indexCap);
    const state = staffed();
    const districtId = Object.values(state.buildings)[0]!.districtId;
    state.districts[districtId]!.population = 200;
    for (let i = 0; i < 120; i++) runLaborTick(state);
    const index = state.districts[districtId]!.wageIndex!;
    assert.ok(index > 1.05 && index <= LABOR.indexCap, `endeks ${index}`);
  });

  test('politika değişikliği soğumalı, rakip doktrini kendi politikası', () => {
    const engine = new GameEngine(createNewGame({ seed: 5 }));
    assert.equal(engine.dispatch({ type: 'SET_WAGE_POLICY', policy: 'high' }).ok, true);
    assert.equal(engine.dispatch({ type: 'SET_WAGE_POLICY', policy: 'low' }).ok, false);
    engine.getState().time.day += LABOR.policyCooldownDays;
    assert.equal(engine.dispatch({ type: 'SET_WAGE_POLICY', policy: 'low' }).ok, true);

    const state = engine.getState();
    runLaborTick(state);
    for (const profile of NPC_PROFILES) {
      const company = state.companies[profile.id];
      if (company) assert.equal(company.labor?.policy, NPC_LABOR[profile.trait].policy, profile.id);
    }
  });
});

describe('sendika', () => {
  test('küçük şirkette baskı birikmiyor', () => {
    const state = createNewGame({ seed: 3 });
    place(state, 'player', 'corner_shop');
    for (let i = 0; i < 300; i++) runLaborTick(state);
    assert.equal(state.companies.player!.labor?.pressure, 0);
  });

  test('baskı dolunca talep masaya geliyor; süre dolarsa Ret sayılıyor', () => {
    const state = staffed();
    assert.ok(workforce(state, 'player').employees >= LABOR.minEmployees);
    fillPressure(state);
    const labor = state.companies.player!.labor!;
    assert.ok(labor.demand, 'talep geldi');
    assert.equal(labor.demand.deadlineDay - labor.demand.offeredDay, LABOR.deadlineDays);
    assert.ok(labor.demand.raise >= 0.03 && labor.demand.raise <= 0.12, `talep ${labor.demand.raise}`);
    assert.match(state.news[0]!.title, /Sendika .* zam istiyor/);

    state.time.day = labor.demand.deadlineDay + 1;
    runLaborTick(state);
    assert.equal(labor.demand, undefined);
    assert.equal(labor.lastResponse?.kind, 'reject');
  });

  test('Kabul sözleşmeyi zam kadar büyütüp baskıyı sıfırlıyor', () => {
    const engine = new GameEngine(staffed());
    const state = engine.getState();
    fillPressure(state);
    const raise = state.companies.player!.labor!.demand!.raise;
    assert.equal(engine.dispatch({ type: 'RESPOND_UNION', response: 'accept' }).ok, true);
    const labor = state.companies.player!.labor!;
    assert.ok(Math.abs(labor.agreement - (1 + raise)) < 1e-12);
    assert.equal(labor.pressure, 0);
    assert.equal(engine.dispatch({ type: 'RESPOND_UNION', response: 'accept' }).ok, false, 'masada talep yok');
  });

  test('grev kapasiteyi düşürüyor, bitince sözleşme imzalanıyor', () => {
    const state = staffed();
    const labor: LaborState = { policy: 'market', pressure: 0, agreement: 1 };
    state.companies.player!.labor = labor;
    state.time.day = 50;
    labor.strike = { startedDay: 51, endsOnDay: 51 + LABOR.strikeDays - 1, raise: 0.05 };
    assert.equal(strikeFactor(state, 'player'), 1, 'başlamadan önce tam');
    state.time.day = 51;
    assert.equal(strikeFactor(state, 'player'), LABOR.strikeCapacity);

    const engine = new GameEngine(state);
    engine.runDay(); // 52
    const farm = Object.values(state.buildings)[0]!;
    assert.equal(farm.last.wages, wageFor(state, 'player', farm.defId, farm.districtId) * LABOR.strikeCapacity);

    state.time.day = 51 + LABOR.strikeDays;
    runLaborTick(state);
    assert.equal(labor.strike, undefined);
    assert.ok(Math.abs(labor.agreement - 1.05) < 1e-12);
    assert.equal(labor.strikeDays, LABOR.strikeDays);
  });

  test('cevabın sonucu dışsal zardan: durum zarı değişse de aynı', () => {
    const outcome = (scramble: boolean) => {
      const engine = new GameEngine(staffed(11));
      const state = engine.getState();
      fillPressure(state);
      if (scramble) state.rng.s = 987_654;
      engine.dispatch({ type: 'RESPOND_UNION', response: 'compromise' });
      const labor = state.companies.player!.labor!;
      return [labor.agreement, labor.strike?.startedDay ?? null];
    };
    assert.deepEqual(outcome(false), outcome(true));
  });

  test('uzlaşma ihtimali: düşük ücret ve sertlik düşürür, yüksek ücret zamanla artırır', () => {
    const state = createNewGame({ seed: 1 });
    state.time.day = 400;
    const base = compromiseOdds(state, { policy: 'market', pressure: 1, agreement: 1 });
    assert.equal(base, LABOR.compromiseOdds);
    assert.ok(compromiseOdds(state, { policy: 'low', pressure: 1, agreement: 1 }) < base);
    assert.equal(compromiseOdds(state, { policy: 'high', pressure: 1, agreement: 1, policyDay: 390 }), base, 'yeni zam güven vermiyor');
    assert.ok(compromiseOdds(state, { policy: 'high', pressure: 1, agreement: 1, policyDay: 100 }) > base);
    assert.ok(
      compromiseOdds(state, { policy: 'market', pressure: 1, agreement: 1, lastResponse: { kind: 'reject', day: 300 } }) < base,
    );
  });

  test('rakip talebe doktrinle hemen cevap veriyor', () => {
    const state = createNewGame({ seed: 3 });
    const rival = NPC_PROFILES.find((p) => state.companies[p.id] && NPC_LABOR[p.trait].response === 'accept')!;
    for (let i = 0; i < 4; i++) place(state, rival.id, 'wheat_farm');
    fillPressure(state, rival.id);
    const labor = state.companies[rival.id]!.labor!;
    // Talep aynı tick'te cevaplandı: masada kalmıyor, sözleşme büyüdü.
    assert.equal(labor.demand, undefined);
    assert.equal(labor.lastResponse?.kind, 'accept');
    assert.ok(labor.agreement > 1);
  });

  test('sistem kapatılınca masada talep ve grev kalmıyor', () => {
    const state = staffed();
    fillPressure(state);
    state.flags.labor = false;
    runLaborTick(state);
    assert.equal(state.companies.player!.labor!.demand, undefined);
    assert.equal(strikeFactor(state, 'player'), 1);
  });
});
