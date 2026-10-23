import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, PATHS } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { agenda } from '../src/agenda';
import { companyPath, notePathSources, sourceOf } from '../src/systems/paths';
import { FREIGHT_CHALLENGER_SHARE, freightStanding } from '../src/systems/freight';
import { FREIGHT_SHARE } from '../src/systems/supply';
import { runGoalTick } from '../src/systems/goals';
import { simulateCityDay } from '../src/day';
import { playerStrategy } from './proxy';
import type { BuildingInstance, BuildingLedger, GameState } from '../src/types';

/** Vekilin 120 gün oynadığı şehir. */
function grown(seed = 1): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Yol AŞ' }));
  for (let day = 1; day <= 120; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

const base = grown();
const fresh = (): GameState => JSON.parse(JSON.stringify(base.getState())) as GameState;

/** Defteri elle yazılmış bina: muhasebeyi durumdan bağımsız denemek için. */
function fake(state: GameState, template: BuildingInstance, id: string, defId: string, last: Partial<BuildingLedger>, companyId = state.playerCompanyId): BuildingInstance {
  const building: BuildingInstance = { ...template, id, defId, companyId, last: { ...template.last, revenue: 0, profit: 0, power: undefined, ...last } };
  delete building.last.power;
  if (last.power) building.last.power = last.power;
  state.buildings[id] = building;
  return building;
}

describe('şirketin yolu: kârın kaynağı (Tur 61)', () => {
  test('kaynak rolden: mağaza ve zincir perakende, kiralık kira, santral enerji, filolu terminal nakliye, depo perakende', () => {
    const template = Object.values(base.getState().buildings)[0]!;
    const of = (defId: string) => sourceOf({ ...template, defId });
    assert.equal(of('supermarket'), 'retail');
    assert.equal(of('residence'), 'realestate');
    assert.equal(of('housing_estate'), 'realestate');
    assert.equal(of('gas_plant'), 'energy');
    assert.equal(of('freight_terminal'), 'freight');
    const depot = Object.values(BUILDING_BY_ID).find((def) => def.role === 'logistics' && !def.fleet)!;
    assert.equal(of(depot.id), 'retail', depot.id);
    const extract = Object.values(BUILDING_BY_ID).find((def) => def.role === 'extract')!;
    assert.equal(of(extract.id), 'retail');
  });

  test('defter: kendi santralinin tasarrufu enerjiye, terminalin ücreti nakliyeye, gideri zincire; rakibin binası ve rakip santralin indirimi sayılmıyor', () => {
    const state = fresh();
    const template = Object.values(state.buildings)[0]!;
    const rival = Object.values(state.companies).find((company) => !company.isPlayer)!;
    state.buildings = {};
    state.sources = undefined;
    const sources = (): GameState['sources'] => state.sources;
    fake(state, template, 'plant', 'gas_plant', { profit: 300 });
    fake(state, template, 'rivalPlant', 'gas_plant', { profit: 999 }, rival.id);
    fake(state, template, 'shop', 'supermarket', { profit: 1000, power: { plantId: 'plant', bill: 0, saved: 200 } });
    fake(state, template, 'shop2', 'supermarket', { profit: 400, power: { plantId: 'rivalPlant', bill: 50, saved: 5 } });
    fake(state, template, 'home', 'residence', { profit: 700, power: { plantId: 'plant', bill: 0, saved: 30 } });
    fake(state, template, 'terminal', 'freight_terminal', { revenue: 500, profit: 100 });
    fake(state, template, 'rivalShop', 'supermarket', { profit: 5000 }, rival.id);
    notePathSources(state);
    assert.deepEqual(sources(), {
      energy: 300 + 200 + 30,
      retail: 1000 - 200 + 400 + (100 - 500),
      realestate: 700 - 30,
      freight: 500,
    });
    // Toplam, oyuncunun binalarının kârı: kaynaklar arasında yer değiştiriyor, yaratılmıyor.
    const total = Object.values(sources() ?? {}).reduce((sum: number, value) => sum + (value ?? 0), 0);
    assert.equal(total, 300 + 1000 + 400 + 700 + 100);
    notePathSources(state);
    assert.equal(sources()?.freight, 1000, 'gün gün birikiyor');
  });

  test('defter yalnız kendi alanını yazıyor: simülasyonun durumu bit bit aynı', () => {
    const state = fresh();
    const before = JSON.parse(JSON.stringify(state)) as GameState;
    notePathSources(state);
    assert.ok(state.sources && Object.keys(state.sources).length > 0);
    delete state.sources;
    delete before.sources;
    assert.deepEqual(state, before);
  });

  test('motor her gün yazıyor; kaynakların toplamı oyuncunun binalarının günlük kârlarının toplamı', () => {
    const engine = new GameEngine(fresh());
    const state = engine.getState();
    const sum = () => Object.values(state.sources ?? {}).reduce((total, value) => total + (value ?? 0), 0);
    const start = sum();
    let expected = 0;
    for (let i = 0; i < 20; i++) {
      engine.runDay();
      for (const building of Object.values(state.buildings)) if (building.companyId === state.playerCompanyId) expected += building.last.profit;
    }
    assert.ok(Math.abs(sum() - start - expected) < 1e-6, `${sum() - start} ≠ ${expected}`);
  });

  test('yol eşiklerden: devralma, gayrimenkul, enerji, nakliye sırasıyla; hiçbiri değilse perakende', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const path = (sources: GameState['sources'], acquisitions = 0) => {
      state.sources = sources;
      me.acquisitions = acquisitions;
      return companyPath(state).path.id;
    };
    const rule = (id: string) => PATHS.find((def) => def.id === id)!;
    const re = rule('realestate').share!;
    const en = rule('energy').share!;
    const fr = rule('freight').share!;
    assert.equal(path({}), 'retail', 'kâr yok');
    assert.equal(path({ retail: -100, realestate: 50 }), 'retail', 'toplam eksi: paylar sıfır');
    assert.equal(path({ retail: 100 - re * 100, realestate: re * 100 }), 'realestate');
    assert.equal(path({ retail: 100 - re * 100 + 1, realestate: re * 100 - 1 }), 'retail', 'eşiğin altı');
    assert.equal(path({ retail: 100 - en * 100 - fr * 100, energy: en * 100, freight: fr * 100 }), 'energy', 'enerji nakliyeden önce');
    assert.equal(path({ retail: 100 - fr * 100, freight: fr * 100 }), 'freight');
    assert.equal(path({ retail: 50, realestate: 50 }, rule('takeover').acquisitions!), 'takeover', 'devralma önce');
    assert.equal(path({ retail: 100 }, rule('takeover').acquisitions! - 1), 'retail');
    const shares = companyPath(state).shares;
    assert.deepEqual(shares, { retail: 1, realestate: 0, energy: 0, freight: 0 });
    // Zarar eden kaynak varken paylar 0..1 kalıyor ve toplamı 1 (Codex #91).
    state.sources = { retail: -100, realestate: 200 };
    assert.deepEqual(companyPath(state).shares, { retail: 0, realestate: 1, energy: 0, freight: 0 });
  });

  test('defter şehrin gününde yazılıyor: hedef adımından önce, bekleyen şehirde de (Codex #91)', () => {
    const state = fresh();
    state.sources = undefined;
    simulateCityDay(state);
    const sources = (): GameState['sources'] => state.sources;
    assert.ok(sources() && Object.keys(sources()!).length > 0, 'şehrin günü defteri yazmadı');
  });

  test('zaferin yolu zafer gününün kârını da sayıyor (Codex #91)', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const rival = Object.values(state.companies).find((company) => !company.isPlayer)!;
    // Oyuncunun tek binası kârlı bir kiralık: bugünkü kâr kiradan gelsin.
    const rental = Object.values(state.buildings).find((b) => BUILDING_BY_ID[b.defId]?.role === 'rental' && b.last.profit > 0)!;
    assert.ok(rental, 'kârlı kiralık yok');
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === me.id && building.id !== rental.id) building.companyId = rival.id;
    }
    rental.companyId = me.id;
    state.sources = undefined;
    delete state.victory;
    me.cash += 2_000_000_000;
    const engine = new GameEngine(state);
    engine.runDay();
    const victory = (): GameState['victory'] => engine.getState().victory;
    assert.equal(victory()?.kind, 'tycoon');
    assert.equal(victory()?.path, 'realestate', 'zafer günü defterden önce dondu');
  });

  test('zafer günü yolu donduruyor', () => {
    const state = fresh();
    for (const company of Object.values(state.companies)) if (!company.isPlayer) delete state.companies[company.id];
    state.sources = { retail: 70, realestate: 30 };
    delete state.victory;
    const victory = (): GameState['victory'] => state.victory;
    runGoalTick(state);
    assert.equal(victory()?.kind, 'monopoly');
    assert.equal(victory()?.path, 'realestate');
    // Sonra değişen defter zaferin yolunu değiştirmiyor.
    state.sources = { retail: 100 };
    runGoalTick(state);
    assert.equal(victory()?.path, 'realestate');
  });
});

describe('taşıma teklifinde müşterinin yeri (Tur 61)', () => {
  test('en güçlü rakip, değeri seninkinin eşiğini geçince "en yakın rakibin"; küçük rakip değil', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const rivals = Object.values(state.companies).filter((company) => !company.isPlayer).sort((a, b) => b.netWorth - a.netWorth);
    const top = rivals[0]!;
    const small = rivals[rivals.length - 1]!;
    me.netWorth = 10_000_000;
    top.netWorth = 10_000_000 * FREIGHT_CHALLENGER_SHARE;
    small.netWorth = 1_000_000;
    const strong = freightStanding(state, { companyId: top.id, estimate: 600 })!;
    assert.equal(strong.challenger, true);
    assert.equal(strong.rank, 2);
    assert.equal(strong.saving, Math.round((600 * (1 - FREIGHT_SHARE)) / FREIGHT_SHARE));
    assert.equal(freightStanding(state, { companyId: small.id, estimate: 600 })!.challenger, false, 'küçük rakip');
    top.netWorth = 10_000_000 * FREIGHT_CHALLENGER_SHARE - 1;
    assert.equal(freightStanding(state, { companyId: top.id, estimate: 600 })!.challenger, false, 'eşiğin altı');
    top.netWorth = 20_000_000;
    const ahead = freightStanding(state, { companyId: top.id, estimate: 600 })!;
    assert.deepEqual([ahead.challenger, ahead.rank], [true, 1], 'önündeki rakip de');
  });

  test('gündem çipi müşteri en yakın rakipse söylüyor', () => {
    const state = fresh();
    const me = state.companies[state.playerCompanyId]!;
    const top = Object.values(state.companies).filter((company) => !company.isPlayer).sort((a, b) => b.netWorth - a.netWorth)[0]!;
    const terminal = Object.values(state.buildings).find((b) => b.companyId === me.id)!;
    me.netWorth = 10_000_000;
    top.netWorth = 9_000_000;
    state.freight = {
      contracts: [],
      offers: [{ id: 'o1', companyId: top.id, terminalId: terminal.id, outletIds: ['x', 'y'], estimate: 400, rate: 0.2, offeredDay: state.time.day, durationDays: 120 }],
      nextId: 2,
      lastOfferDay: state.time.day,
      declined: {},
      earnedTotal: 0,
    };
    const chip = () => agenda(state).find((item) => item.kind === 'freightOffer')!.label;
    assert.match(chip(), /en yakın rakibin|closest rival/);
    top.netWorth = 1_000_000;
    assert.ok(!/en yakın rakibin|closest rival/.test(chip()), chip());
  });
});
