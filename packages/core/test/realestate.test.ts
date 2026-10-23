import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CATEGORIES, REAL_ESTATE, STRUCTURE_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { build, buyTile, buyoutTile } from '../src/actions';
import { agenda } from '../src/agenda';
import { isPurchasable, isDistrictOpen, runPopulationTick } from '../src/systems/city';
import { runLaborTick, workforce } from '../src/systems/labor';
import { runAuctionTick } from '../src/systems/auction';
import { estimateInvestment, runMarketTick } from '../src/systems/market';
import {
  projectUnits,
  rentalOutlook,
  renewalBlocker,
  renewalFee,
  requestRenewal,
  runRealEstateTick,
  setRent,
  takeRenewalRequest,
} from '../src/systems/realestate';
import { buildingUpkeep, resetDailyLedgers } from '../src/systems/supply';
import { playerStrategy } from './proxy';
import type { BuildingInstance, GameState } from '../src/types';

const ESTATE = 'housing_estate';
const CAMPUS = 'office_campus';

/** Büyümüş bir şehir: vekil 150 gün; olay, dönem ve kriz yok (fiyat 1). */
function grown(seed = 1): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Gayrimenkul AŞ' }));
  for (let day = 1; day <= 150; day++) {
    if (day % 7 === 1) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

const base = grown();
const fresh = (): GameState => {
  const state = JSON.parse(JSON.stringify(base.getState())) as GameState;
  state.activeEvents = [];
  state.era = undefined;
  state.crisis = undefined;
  const me = state.companies[state.playerCompanyId]!;
  me.cash += 20_000_000;
  me.netWorth += 20_000_000;
  return state;
};

function nextDay(state: GameState): void {
  state.time.day += 1;
  runRealEstateTick(state);
  resetDailyLedgers(state);
  runMarketTick(state);
}

/** Projeye izinli, en kalabalık bölgedeki boş parsel. */
function freePlot(state: GameState, defId: string, avoid: number[] = []): number {
  const def = BUILDING_BY_ID[defId]!;
  let best: { id: number; population: number } | null = null;
  for (const tile of state.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId || avoid.includes(tile.id)) continue;
    if (!isDistrictOpen(state, tile.districtId) || state.auction?.tileId === tile.id) continue;
    const district = state.districts[tile.districtId]!;
    if (def.zones && !def.zones.includes(district.archetype)) continue;
    if (!best || district.population > best.population) best = { id: tile.id, population: district.population };
  }
  assert.ok(best, `${defId} için boş parsel yok`);
  return best.id;
}

function placeProject(state: GameState, defId = ESTATE, tileId = freePlot(state, defId)): BuildingInstance {
  const me = state.playerCompanyId;
  assert.ok(buyTile(state, me, tileId).ok);
  assert.ok(build(state, me, tileId, defId).ok);
  return state.buildings[state.map.tiles[tileId]!.buildingId!]!;
}

/** Şehrin satılabilir bir konut yapısı olan, Konut Sitesine izinli sahipsiz parsel (dönüşüm adayı). */
function structurePlot(state: GameState, avoid: number[] = []): number {
  const zones = BUILDING_BY_ID[ESTATE]!.zones!;
  const tile = state.map.tiles.find(
    (t) =>
      !avoid.includes(t.id) &&
      renewalBlocker(state, t.id) === null &&
      STRUCTURE_BY_ID[t.structureId!]?.kind === 'residential' &&
      zones.includes(state.districts[t.districtId]!.archetype),
  );
  assert.ok(tile, 'dönüşüm adayı yok');
  return tile.id;
}

/** Oyuncuya dönüşüm ihalesini kazandırır: ihale bugün kapanıyor, teklif kimsenin geçemeyeceği kadar. */
function winRenewal(state: GameState, tileId: number): void {
  state.auction = { tileId, endsOnDay: state.time.day, reserve: 1, bid: 50_000_000, bidderId: state.playerCompanyId, rounds: 1 };
  state.companies[state.playerCompanyId]!.cash += 50_000_000;
  runAuctionTick(state);
  assert.equal(state.map.tiles[tileId]!.ownerId, state.playerCompanyId, 'ihale oyuncuya geçmedi');
}

function openProject(state: GameState, project: BuildingInstance): void {
  state.time.day = project.development!.opensOnDay - 1;
  nextDay(state);
  assert.notEqual(project.development!.occupancy, undefined, 'proje açılmadı');
}

describe('gayrimenkul: proje, kira, doluluk ve kentsel dönüşüm (Tur 58)', () => {
  test('kira: pahalı kira hedefi esneklik kadar düşürüyor, geliri çarpıyor; adıma yuvarlanıyor, 1 alanı siliyor', () => {
    const state = fresh();
    const rental = Object.values(state.buildings).find((b) => BUILDING_BY_ID[b.defId]?.role === 'rental' && b.companyId === state.playerCompanyId)
      ?? placeProject(state, 'apartment', freePlot(state, 'apartment'));
    const def = BUILDING_BY_ID[rental.defId]!;
    const a = JSON.parse(JSON.stringify(state)) as GameState;
    const b = JSON.parse(JSON.stringify(state)) as GameState;
    assert.ok(setRent(b, b.playerCompanyId, rental.id, 1.1).ok);
    assert.equal(b.buildings[rental.id]!.rent, 1.1);
    nextDay(a);
    nextDay(b);
    const atMarket = a.buildings[rental.id]!.last;
    const dear = b.buildings[rental.id]!.last;
    const e = REAL_ESTATE.elasticity[def.category]!;
    // Hedef kırpılmadıysa esneklik × 0,1 kadar aşağıda; ciro kira × doluluk.
    if (atMarket.capacityUsed > 0.15 + e * 0.1 && atMarket.capacityUsed < 1) {
      assert.ok(Math.abs(atMarket.capacityUsed - dear.capacityUsed - e * 0.1) < 1e-9, `${atMarket.capacityUsed} → ${dear.capacityUsed}`);
    }
    assert.ok(Math.abs(dear.revenue - def.capacity * dear.capacityUsed * CATEGORIES[def.category].basePrice * 1.1) < 1e-6);

    // Sınırlar ve adım; 1 alanı siliyor; başkasının binası ve kiralık olmayan bina reddediliyor.
    assert.ok(setRent(b, b.playerCompanyId, rental.id, 9).ok);
    assert.equal(b.buildings[rental.id]!.rent, REAL_ESTATE.rent.max);
    assert.ok(setRent(b, b.playerCompanyId, rental.id, 0.92).ok);
    assert.equal(b.buildings[rental.id]!.rent, 0.9);
    assert.ok(setRent(b, b.playerCompanyId, rental.id, 1.01).ok);
    assert.equal(b.buildings[rental.id]!.rent, undefined);
    const shop = Object.values(b.buildings).find((x) => x.companyId === b.playerCompanyId && BUILDING_BY_ID[x.defId]?.role === 'outlet')!;
    assert.equal(setRent(b, b.playerCompanyId, shop.id, 1.1).ok, false);
    const theirs = Object.values(b.buildings).find((x) => x.companyId !== b.playerCompanyId)!;
    assert.equal(setRent(b, b.playerCompanyId, theirs.id, 1.1).ok, false);
    assert.equal(setRent(b, b.playerCompanyId, rental.id, Number.NaN).ok, false);
  });

  test('inşaattaki proje: kirası yok, bakımın şantiye payı, ücret yok, pazarda yok', () => {
    const state = fresh();
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    const project = placeProject(state);
    nextDay(state);
    nextDay(without);
    const ledger = project.last;
    assert.equal(ledger.revenue, 0);
    assert.equal(ledger.wages, 0);
    const full = buildingUpkeep(state, { ...project, development: undefined });
    assert.ok(Math.abs(ledger.upkeep - full * REAL_ESTATE.siteUpkeep) < 1e-6, `şantiye ${ledger.upkeep}, tam ${full}`);
    // Bölgedeki diğer kiralıkların doluluğu proje yokmuş gibi.
    const def = BUILDING_BY_ID[project.defId]!;
    for (const other of Object.values(state.buildings)) {
      const otherDef = BUILDING_BY_ID[other.defId];
      if (other.id === project.id || other.districtId !== project.districtId || otherDef?.role !== 'rental' || otherDef.category !== def.category) continue;
      assert.equal(other.last.capacityUsed, without.buildings[other.id]!.last.capacityUsed);
    }
    const outlook = rentalOutlook(state, project.id)!;
    assert.equal(outlook.opensIn, def.buildDays! - 1);
  });

  test('inşaattaki projenin kadrosu yok: çalışan sayısı, ücret endeksi ve nüfus artışı proje yokmuş gibi; açılınca sayılıyor', () => {
    const state = fresh();
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    const me = state.playerCompanyId;
    const project = placeProject(state, CAMPUS);
    const def = BUILDING_BY_ID[project.defId]!;
    assert.equal(workforce(state, me).employees, workforce(without, me).employees);
    for (const city of [state, without]) {
      runLaborTick(city);
      runPopulationTick(city);
    }
    const district = state.districts[project.districtId]!;
    const before = without.districts[project.districtId]!;
    assert.equal(district.wageIndex, before.wageIndex);
    assert.equal(district.population, before.population);
    openProject(state, project);
    assert.equal(workforce(state, me).employees, workforce(without, me).employees + def.jobs);
  });

  test('açılış: ön kiralamayla açılıyor, kiracılar günde en çok gelişi kadar geliyor, hedefte duruyor', () => {
    const state = fresh();
    const project = placeProject(state);
    const def = BUILDING_BY_ID[project.defId]!;
    const seq = state.newsSeq ?? 0;
    openProject(state, project);
    const prelease = REAL_ESTATE.prelease.housing!;
    const rate = REAL_ESTATE.leaseUp.housing!;
    assert.ok(state.news.some((item) => item.id > seq && item.title.includes(def.name)), 'açılış haberi yok');
    const target = rentalOutlook(state, project.id)!.target;
    assert.ok(target > prelease + rate, `hedef ${target} ön kiralamaya yakın`);
    assert.ok(Math.abs(project.development!.occupancy! - (prelease + rate)) < 1e-9);
    let previous = project.development!.occupancy!;
    for (let day = 0; day < 60; day++) {
      nextDay(state);
      const now = project.development!.occupancy!;
      assert.ok(now - previous <= rate + 1e-9, `bir günde ${now - previous}`);
      previous = now;
    }
    const outlook = rentalOutlook(state, project.id)!;
    assert.ok(Math.abs(previous - outlook.target) < 1e-9, `${previous} hedefe (${outlook.target}) varmadı`);
    assert.ok(project.last.wages > 0, 'kadro açılışta işe başlamadı');
    assert.ok(Math.abs(project.last.revenue - def.capacity * previous * CATEGORIES.housing.basePrice) < 1e-6);
  });

  test('dönüşüm başvurusu: kurallar ve bedel; parsel ihale gününe kadar satılmıyor; sıradaki ihale o parsel', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const vacant = freePlot(state, ESTATE);
    assert.ok(renewalBlocker(state, vacant), 'boş parsele başvuru olmamalı');
    const tileId = structurePlot(state);
    const fee = renewalFee(state, tileId);
    const cash = me.cash;
    assert.ok(requestRenewal(state, tileId).ok);
    assert.equal(me.cash, cash - fee);
    assert.deepEqual(state.renewalRequest, { tileId, day: state.time.day, fee });
    // İkinci başvuru bekliyor; parsel devralınamıyor (oyuncu da rakip de).
    const another = state.map.tiles.find((t) => t.id !== tileId && t.kind === 'plot' && !t.ownerId && STRUCTURE_BY_ID[t.structureId ?? '']?.buyoutMultiplier)!;
    assert.equal(requestRenewal(state, another.id).ok, false);
    assert.equal(buyoutTile(state, me.id, tileId).ok, false);
    const rival = Object.keys(state.companies).find((id) => id !== me.id)!;
    assert.equal(buyoutTile(state, rival, tileId).ok, false);
    const agendaKinds = agenda(state).filter((item) => item.kind === 'renewal').map((item) => item.key);
    assert.ok(agendaKinds.includes('renewal:request'));
    // İhale günü: açılan ihale başvurunun parseli.
    state.auction = null;
    state.time.day = (Math.floor(state.time.day / 30) + 1) * 30;
    runAuctionTick(state);
    // Atama daraltmasını aş: ihale adımı alanı yeniden dolduruyor.
    assert.equal((state.auction as GameState['auction'])?.tileId, tileId);
    assert.equal(state.renewalRequest, undefined);

    // Parsel ihale gününden önce el değiştirdiyse başvuru düşüyor.
    const other = fresh();
    const plot = structurePlot(other);
    assert.ok(requestRenewal(other, plot).ok);
    other.map.tiles[plot]!.ownerId = rival;
    assert.equal(takeRenewalRequest(other), null);
    assert.equal(other.renewalRequest, undefined);

    // İhalesiz oyunda başvuru yok; ihale sonradan kapatılırsa bekleyen başvuru düşüyor, parsel satılık.
    const off = fresh();
    off.flags.landAuctions = false;
    assert.ok(renewalBlocker(off, structurePlot(fresh())));
    const late = fresh();
    const held = structurePlot(late);
    assert.ok(requestRenewal(late, held).ok);
    late.flags.landAuctions = false;
    runRealEstateTick(late);
    assert.equal(late.renewalRequest, undefined);
    assert.ok(buyoutTile(late, late.playerCompanyId, held).ok, 'parsel yeniden satılık değil');
  });

  test('dönüşüm hakkı: kazanan parseli hakla alıyor; proje imar artışıyla büyük, hak sahipleri kirasız; başka bina hakkı düşürüyor', () => {
    const state = fresh();
    const tileId = structurePlot(state);
    const structureId = state.map.tiles[tileId]!.structureId!;
    winRenewal(state, tileId);
    const tile = state.map.tiles[tileId]!;
    assert.equal(tile.structureId, null);
    assert.deepEqual(tile.renewal, { day: state.time.day, structureId });
    assert.ok(agenda(state).some((item) => item.key === `renewal:${tileId}`), 'gündemde boş dönüşüm parseli yok');

    const defId = ESTATE;
    const def = BUILDING_BY_ID[defId]!;
    const estimate = estimateInvestment(state, tile.districtId, defId, state.playerCompanyId, tileId)!;
    const plain = estimateInvestment(state, tile.districtId, defId, state.playerCompanyId)!;
    assert.ok(estimate.dailyProfit > plain.dailyProfit, 'tahmin dönüşüm hakkını saymıyor');
    assert.ok(build(state, state.playerCompanyId, tileId, defId).ok);
    const project = state.buildings[tile.buildingId!]!;
    assert.equal(project.development?.renewal, true);
    assert.equal(tile.renewal, undefined, 'hak kullanılınca kalkmalı');
    const units = projectUnits(def, true);
    assert.equal(units.rightHolders, Math.round(def.capacity * REAL_ESTATE.renewal.rightHolders));
    assert.equal(units.units + units.rightHolders, Math.round(def.capacity * (1 + REAL_ESTATE.renewal.capacityBonus)));
    openProject(state, project);
    const outlook = rentalOutlook(state, project.id)!;
    assert.equal(outlook.units, units.units);
    assert.equal(outlook.rightHolders, units.rightHolders);
    // Kira yalnız kiralık birimlerden.
    assert.ok(Math.abs(project.last.revenue - units.units * project.development!.occupancy! * CATEGORIES[def.category].basePrice) < 1e-6);

    // Proje dışında bina: hak düşüyor, proje yok.
    const second = fresh();
    const plot = structurePlot(second);
    winRenewal(second, plot);
    assert.ok(build(second, second.playerCompanyId, plot, 'corner_shop').ok);
    assert.equal(second.map.tiles[plot]!.renewal, undefined);
    assert.equal(second.buildings[second.map.tiles[plot]!.buildingId!]!.development, undefined);
  });

  test('rakipler proje kurmuyor ve kira ayarlamıyor', () => {
    const engine = new GameEngine(fresh());
    for (let day = 0; day < 120; day++) engine.runDay();
    const state = engine.getState();
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === state.playerCompanyId) continue;
      assert.equal(building.development, undefined, `rakip projesi: ${building.defId}`);
      assert.equal(building.rent, undefined);
    }
  });

  test('yapı menüsünün tahmini: dolmuş projenin günü defterle aynı; geri ödeme inşaatı ve doluşu sayıyor', () => {
    const state = fresh();
    const tileId = freePlot(state, CAMPUS);
    assert.ok(buyTile(state, state.playerCompanyId, tileId).ok);
    const districtId = state.map.tiles[tileId]!.districtId;
    const estimate = estimateInvestment(state, districtId, CAMPUS, state.playerCompanyId, tileId)!;
    const def = BUILDING_BY_ID[CAMPUS]!;
    assert.ok(estimate.direct);
    assert.ok(estimate.paybackDays > def.buildDays! + def.cost / estimate.dailyProfit, `geri ödeme ${estimate.paybackDays}`);
    assert.ok(build(state, state.playerCompanyId, tileId, CAMPUS).ok);
    const project = state.buildings[state.map.tiles[tileId]!.buildingId!]!;
    openProject(state, project);
    for (let day = 0; day < 80; day++) nextDay(state);
    const outlook = rentalOutlook(state, project.id)!;
    assert.ok(Math.abs(project.development!.occupancy! - outlook.target) < 1e-9, 'ofis hedefe varmadı');
    // Bölgenin nüfusu 80 günde biraz kaydı: tahmin defterden %5'ten fazla şaşmıyor.
    const revenue = project.last.revenue;
    assert.ok(Math.abs(revenue - estimate.revenue) / estimate.revenue < 0.05, `tahmin ${estimate.revenue}, defter ${revenue}`);
  });

  test('kayıt: proje, kira, başvuru ve dönüşüm hakkı kaydedilip açılıyor', () => {
    const state = fresh();
    const project = placeProject(state);
    const renewal = structurePlot(state);
    winRenewal(state, renewal);
    assert.ok(requestRenewal(state, structurePlot(state, [renewal])).ok);
    openProject(state, project);
    assert.ok(setRent(state, state.playerCompanyId, project.id, 1.15).ok);
    const engine = new GameEngine(state);
    engine.runDay();
    const copy = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    copy.runDay();
    engine.runDay();
    const a = engine.getState();
    const b = copy.getState();
    assert.deepEqual(b.buildings, a.buildings);
    assert.deepEqual(b.renewalRequest, a.renewalRequest);
    assert.deepEqual(b.map.tiles[renewal], a.map.tiles[renewal]);
    assert.equal(b.buildings[project.id]!.rent, 1.15);
    assert.ok(b.map.tiles[renewal]!.renewal);
  });
});
