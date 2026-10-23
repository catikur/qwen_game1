import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CRISES, ENERGY } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { build, buyTile } from '../src/actions';
import { agenda } from '../src/agenda';
import { isPurchasable } from '../src/systems/city';
import { energyPrice, energyShare, fuelLock, plantCapacity, runEnergyTick } from '../src/systems/energy';
import { indirectEstimate } from '../src/systems/indirect';
import { buildingUpkeep, resetDailyLedgers } from '../src/systems/supply';
import { playerStrategy } from './proxy';
import type { BuildingInstance, GameState } from '../src/types';

const GAS = 'gas_plant';
const SOLAR = 'solar_farm';
const SHOCK = CRISES.find((def) => (def.effects.energyPrice ?? 1) > 1)!;

/** Büyümüş bir şehir: vekil 150 gün. */
function grown(seed = 1): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Enerji AŞ' }));
  for (let day = 1; day <= 150; day++) {
    if (day % 7 === 1) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

const base = grown();
const fresh = (): GameState => JSON.parse(JSON.stringify(base.getState())) as GameState;

function distance(state: GameState, a: BuildingInstance, b: BuildingInstance): number {
  const x = state.map.tiles[a.tileId]!;
  const y = state.map.tiles[b.tileId]!;
  return Math.abs(x.x - y.x) + Math.abs(x.y - y.y);
}

/** İzinli parsellerin en kalabalığına (menzildeki bina sayısı) santral. */
function placePlant(state: GameState, defId = GAS, avoid?: number): BuildingInstance {
  const me = state.companies[state.playerCompanyId]!;
  me.cash += 5_000_000;
  me.netWorth += 5_000_000;
  const def = BUILDING_BY_ID[defId]!;
  let best: { id: number; count: number } | null = null;
  for (const tile of state.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.ownerId || tile.id === avoid) continue;
    const archetype = state.districts[tile.districtId]?.archetype;
    if (def.zones && (!archetype || !def.zones.includes(archetype))) continue;
    let count = 0;
    for (const other of Object.values(state.buildings)) {
      const at = state.map.tiles[other.tileId]!;
      if (Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= def.radius) count++;
    }
    if (!best || count > best.count) best = { id: tile.id, count };
  }
  assert.ok(best && best.count >= 4, `menzilde ${best?.count} bina`);
  assert.ok(buyTile(state, me.id, best.id).ok);
  assert.ok(build(state, me.id, best.id, defId).ok);
  return state.buildings[state.map.tiles[best.id]!.buildingId!]!;
}

function nextDay(state: GameState): void {
  state.time.day += 1;
  resetDailyLedgers(state);
}

function setCrisis(state: GameState, defId: string, phase: 'warning' | 'active'): void {
  const day = state.time.day;
  state.crisis = { defId, phase, activeDay: phase === 'active' ? day : day + 10, endDay: day + 100 };
}

describe('enerji: şebeke fiyatı ve santraller (Tur 57)', () => {
  test('şebeke fiyatı krizden ve olaydan: enerji krizi ×2, sıkışma ×1,3, durgunluk ×0,85', () => {
    const state = fresh();
    state.crisis = undefined;
    state.activeEvents = [];
    assert.equal(energyPrice(state), 1);
    setCrisis(state, SHOCK.id, 'warning');
    assert.equal(energyPrice(state), 1, 'uyarıda fiyat değişmiyor');
    setCrisis(state, SHOCK.id, 'active');
    assert.equal(energyPrice(state), 2);
    state.activeEvents = [{ defId: 'energy_crunch', startedDay: state.time.day, remainingDays: 20 }];
    assert.ok(Math.abs(energyPrice(state) - 2.6) < 1e-9);
    state.activeEvents = [];
    setCrisis(state, 'deep_recession', 'active');
    assert.equal(energyPrice(state), 0.85);
    state.flags.crises = false;
    assert.equal(energyPrice(state), 1, 'kriz kapalıyken etkisi de yok');
  });

  test('santral yokken ve fiyat 1: bakım eskisiyle bit bit aynı, defterde enerji izi yok', () => {
    const state = fresh();
    state.crisis = undefined;
    state.activeEvents = [];
    state.era = undefined;
    nextDay(state);
    for (const building of Object.values(state.buildings)) {
      assert.equal(building.last.upkeep, buildingUpkeep(state, building));
      assert.equal(building.last.power, undefined);
      assert.equal(building.last.plant, undefined);
    }
    const before = JSON.stringify(state);
    for (let i = 0; i < 5; i++) runEnergyTick(state);
    assert.equal(JSON.stringify(state), before, 'enerji adımı santralsiz şehre dokunmuyor');
  });

  test('enerji krizinde şebekeye bağlı binanın bakımı enerji payı kadar artıyor', () => {
    const state = fresh();
    state.activeEvents = [];
    state.era = undefined;
    setCrisis(state, SHOCK.id, 'active');
    nextDay(state);
    let checked = 0;
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId]!;
      const expected = buildingUpkeep(state, building) * (1 + energyShare(def) * (2 - 1));
      assert.ok(Math.abs(building.last.upkeep - expected) < 1e-6, `${building.defId}: ${building.last.upkeep} ≠ ${expected}`);
      if (energyShare(def) > 0) checked++;
    }
    assert.ok(checked > 10);
  });

  test('santral önce sahibinin binalarını, sonra rakipleri alıyor; menzil ve güç içinde', () => {
    const state = fresh();
    const plant = placePlant(state);
    const def = BUILDING_BY_ID[GAS]!;
    nextDay(state);
    const served = Object.values(state.buildings).filter((b) => b.last.power?.plantId === plant.id);
    assert.ok(served.length > 0, 'kimse enerji almıyor');
    let mwh = 0;
    for (const building of served) {
      assert.ok(distance(state, plant, building) <= def.radius, 'menzil dışına enerji');
      mwh += (buildingUpkeep(state, building) * energyShare(BUILDING_BY_ID[building.defId]!)) / ENERGY.unitPrice;
    }
    assert.ok(mwh <= plantCapacity(state, def) + 1e-9, `${mwh} MWh > güç`);
    assert.ok(Math.abs(mwh - (plant.last.plant!.ownMwh + plant.last.plant!.rivalMwh)) < 1e-9);
    assert.equal(plant.last.plant!.buildings, served.length);
    // Rakibe enerji gidiyorsa menzildeki her kendi binası da alıyor (güç yettiyse önce o).
    const rivals = served.filter((b) => b.companyId !== state.playerCompanyId);
    const ownInRange = Object.values(state.buildings).filter(
      (b) => b.id !== plant.id && b.companyId === state.playerCompanyId && distance(state, plant, b) <= def.radius && energyShare(BUILDING_BY_ID[b.defId]!) > 0,
    );
    if (rivals.length > 0) for (const own of ownInRange) assert.ok(own.last.power, `${own.id} alamadı ama rakip aldı`);
    assert.equal(plant.last.plant!.capacity, def.power);
  });

  test('defter: kendi binasının faturası kalkıyor, rakip santrale ödüyor, yakıt santralin maliyeti', () => {
    const state = fresh();
    state.activeEvents = [];
    state.era = undefined;
    state.crisis = undefined;
    const plant = placePlant(state);
    const def = BUILDING_BY_ID[GAS]!;
    nextDay(state);
    const price = energyPrice(state);
    assert.equal(price, 1);
    let sold = 0;
    let mwh = 0;
    let own = 0;
    let rival = 0;
    for (const building of Object.values(state.buildings)) {
      const power = building.last.power;
      if (!power) continue;
      const share = energyShare(BUILDING_BY_ID[building.defId]!);
      const upkeep = buildingUpkeep(state, building);
      const energy = upkeep * share;
      mwh += energy / ENERGY.unitPrice;
      if (building.companyId === plant.companyId) {
        own++;
        assert.equal(power.bill, 0);
        assert.ok(Math.abs(building.last.upkeep - (upkeep - energy)) < 1e-9);
        assert.ok(Math.abs(power.saved - energy * price) < 1e-9);
      } else {
        rival++;
        const bill = energy * price * (1 - ENERGY.rivalDiscount);
        assert.ok(Math.abs(power.bill - bill) < 1e-9);
        assert.ok(Math.abs(building.last.upkeep - (upkeep - energy + bill)) < 1e-9);
        sold += bill;
      }
    }
    assert.ok(own > 0 && rival > 0, `kendi ${own}, rakip ${rival}`);
    assert.ok(Math.abs(plant.last.revenue - sold) < 1e-6);
    assert.ok(Math.abs(plant.last.cogs - mwh * ENERGY.unitPrice * def.fuel! * price) < 1e-6);
    assert.ok(Math.abs(plant.last.profit - (sold - plant.last.cogs - plant.last.upkeep - plant.last.wages)) < 1e-6);
    // Şirketin günü: santralin satışı ciroda, yakıtı maliyette.
    const me = state.companies[state.playerCompanyId]!;
    assert.ok(Math.abs(me.today.revenue - sold) < 1e-6);
    assert.ok(Math.abs(me.today.cogs - plant.last.cogs) < 1e-6);
    assert.ok(plant.energyTotals!.sold > 0 && plant.energyTotals!.saved > 0 && plant.energyTotals!.fuel > 0);
  });

  test('enerji krizinde kendi santralinden alan bina korunuyor, şebekedeki kabarıyor', () => {
    const calm = fresh();
    calm.activeEvents = [];
    calm.era = undefined;
    calm.crisis = undefined;
    const plant = placePlant(calm);
    const shock = JSON.parse(JSON.stringify(calm)) as GameState;
    setCrisis(shock, SHOCK.id, 'active');
    nextDay(calm);
    nextDay(shock);
    const ownServed = Object.values(calm.buildings).find((b) => b.companyId === calm.playerCompanyId && b.last.power);
    assert.ok(ownServed, 'kendi binası santralden almıyor');
    assert.ok(Math.abs(shock.buildings[ownServed.id]!.last.upkeep - ownServed.last.upkeep) < 1e-9, 'kendi santralinden alan bina krizden etkilendi');
    const gridOwn = Object.values(calm.buildings).find(
      (b) => b.companyId === calm.playerCompanyId && !b.last.power && energyShare(BUILDING_BY_ID[b.defId]!) > 0,
    );
    if (gridOwn) assert.ok(shock.buildings[gridOwn.id]!.last.upkeep > gridOwn.last.upkeep, 'şebekedeki bina kabarmadı');
    // Doğalgazın yakıtı fiyatla iki katı, rakiplere satış da.
    const a = calm.buildings[plant.id]!.last;
    const b = shock.buildings[plant.id]!.last;
    assert.ok(Math.abs(b.cogs - 2 * a.cogs) < 1e-6);
    assert.ok(Math.abs(b.revenue - 2 * a.revenue) < 1e-6);
  });

  test('güneş tarlası yakıtsız, gücü mevsimle', () => {
    const state = fresh();
    const plant = placePlant(state, SOLAR);
    const def = BUILDING_BY_ID[SOLAR]!;
    nextDay(state);
    assert.equal(plant.last.cogs, 0);
    // Gün 15 Ocak civarı kış, 15 Temmuz civarı yaz (yıl 360 gün değil: takvimin kendisinden).
    const capacities = new Set<number>();
    for (let day = 0; day < 365; day += 30) {
      state.time.day = day;
      capacities.add(plantCapacity(state, def));
    }
    assert.ok(capacities.size >= 3, `mevsimle değişmiyor: ${[...capacities].join(', ')}`);
    assert.ok(Math.max(...capacities) > def.power! && Math.min(...capacities) < def.power!);
  });

  test('eski santral önce seçiyor: aynı bina iki santralden almıyor', () => {
    const state = fresh();
    const first = placePlant(state);
    const second = placePlant(state, GAS, state.buildings[first.id]!.tileId);
    nextDay(state);
    const firstCount = first.last.plant!.buildings;
    const secondCount = second.last.plant!.buildings;
    const served = Object.values(state.buildings).filter((b) => b.last.power);
    assert.equal(served.length, firstCount + secondCount);
    // İlk santral tek başınaykenki müşterilerini koruyor.
    const solo = fresh();
    const alone = placePlant(solo);
    nextDay(solo);
    assert.equal(first.id, alone.id);
    assert.equal(firstCount, alone.last.plant!.buildings);
  });

  test('yakıt sabitleme: santralsiz olmuyor; fiyat +%8, kriz gelse de sabit; süre bitince kalkıyor', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    state.activeEvents = [];
    state.era = undefined;
    state.crisis = undefined;
    assert.equal(engine.dispatch({ type: 'LOCK_FUEL' }).ok, false, 'santral yokken sabitlendi');
    const plant = placePlant(state);
    assert.ok(engine.dispatch({ type: 'LOCK_FUEL' }).ok);
    const lock = fuelLock(state, state.playerCompanyId)!;
    assert.ok(Math.abs(lock.price - (1 + ENERGY.lockPremium)) < 1e-9);
    assert.equal(lock.untilDay, state.time.day + ENERGY.lockDays);
    assert.equal(engine.dispatch({ type: 'LOCK_FUEL' }).ok, false, 'iki kez sabitlendi');

    nextDay(state);
    const calmFuel = plant.last.cogs;
    setCrisis(state, SHOCK.id, 'active');
    nextDay(state);
    assert.ok(Math.abs(plant.last.cogs - calmFuel) < 1e-6, 'kriz sabit yakıtı değiştirdi');
    assert.ok(plant.last.revenue > 0);

    state.time.day = lock.untilDay;
    runEnergyTick(state);
    assert.equal(fuelLock(state, state.playerCompanyId), null);
    assert.equal(state.energy!.fuelLocks[state.playerCompanyId], undefined);
    assert.ok(state.news.some((item) => item.day === state.time.day), 'bitiş haberi yok');
    resetDailyLedgers(state);
    assert.ok(Math.abs(plant.last.cogs - 2 * (calmFuel / (1 + ENERGY.lockPremium))) < 1e-6, 'süre bitince yakıt yine piyasadan');
  });

  test('gündem: enerji krizi uyarısında doğalgaz santrali olan ve sabitlemeyen oyuncuya karar', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    setCrisis(state, SHOCK.id, 'warning');
    assert.ok(!agenda(state).some((item) => item.kind === 'fuelLock'), 'santral yokken gündemde');
    const plant = placePlant(state);
    const item = agenda(state).find((entry) => entry.kind === 'fuelLock');
    assert.ok(item, 'gündemde yok');
    assert.equal(item.tileId, plant.tileId);
    assert.equal(item.daysLeft, state.crisis!.activeDay - state.time.day);
    assert.ok(engine.dispatch({ type: 'LOCK_FUEL' }).ok);
    assert.ok(!agenda(state).some((entry) => entry.kind === 'fuelLock'), 'sabitledikten sonra hâlâ gündemde');
    setCrisis(state, 'rate_shock', 'warning');
    delete state.energy;
    assert.ok(!agenda(state).some((entry) => entry.kind === 'fuelLock'), 'enerjiyle ilgisiz krizde gündemde');
  });

  test('yapı menüsünün tahmini, santral kurulunca ertesi günün defteriyle aynı', () => {
    const state = fresh();
    state.activeEvents = [];
    state.era = undefined;
    state.crisis = undefined;
    const probe = JSON.parse(JSON.stringify(state)) as GameState;
    const plant = placePlant(probe);
    const tileId = plant.tileId;
    const districtId = plant.districtId;
    // Aynı parsel tahminde: sahibi ol, binayı kurmadan sor.
    const me = state.companies[state.playerCompanyId]!;
    me.cash += 5_000_000;
    me.netWorth += 5_000_000;
    assert.ok(buyTile(state, me.id, tileId).ok);
    const estimate = indirectEstimate(state, me.id, GAS, districtId, tileId)!;
    assert.ok(estimate.energy, 'tahminde enerji yok');
    nextDay(probe);
    const ledger = probe.buildings[plant.id]!.last;
    assert.ok(Math.abs(estimate.energy.sold - ledger.revenue) < 1e-6, `satış ${estimate.energy.sold} ≠ ${ledger.revenue}`);
    assert.ok(Math.abs(estimate.energy.fuel - ledger.cogs) < 1e-6);
    assert.ok(Math.abs(estimate.energy.saved - ledger.plant!.saved) < 1e-6);
    assert.equal(estimate.covered, ledger.plant!.buildings);
    assert.ok(Math.abs(estimate.dailyGain - (ledger.plant!.saved + ledger.revenue - ledger.cogs)) < 1e-6);
  });

  test('kayıt: santral ve sabitleme kaydedilip açılıyor; enerji alanı olmayan eski kayıt da', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    placePlant(state);
    assert.ok(engine.dispatch({ type: 'LOCK_FUEL' }).ok);
    engine.runDay();
    const copy = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    copy.runDay();
    engine.runDay();
    // Değer geçmişini motor kendi örnekliyor (kayıtta değil); karşılaştırma enerjinin kendisi.
    const a = engine.getState();
    const b = copy.getState();
    assert.deepEqual(b.energy, a.energy);
    assert.deepEqual(b.buildings, a.buildings);
    assert.equal(b.companies[b.playerCompanyId]!.cash, a.companies[a.playerCompanyId]!.cash);

    const old = fresh();
    delete old.energy;
    const legacy = new GameEngine(old);
    legacy.runDay();
    assert.equal(legacy.getState().energy, undefined);
  });
});
