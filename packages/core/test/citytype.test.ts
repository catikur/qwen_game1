import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CITY_TYPES, GOOD_BY_ID, RIVAL_CEOS, getCityType, getDifficulty } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { buildCost } from '../src/actions';
import { buildOptions } from '../src/selectors';
import { indirectEstimate } from '../src/systems/indirect';
import { playerStrategy } from './proxy';
import { victoryNetWorth } from '../src/systems/goals';
import { buildingUpkeep, freightShareOf, FREIGHT_SHARE } from '../src/systems/supply';
import { referencePrice } from '../src/systems/cityType';
import { foundCity } from '../src/holding';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import type { GameState } from '../src/types';

const rivalsOf = (state: GameState) => Object.values(state.companies).filter((company) => !company.isPlayer).map((company) => company.id);
const production = (state: GameState) => state.districts.filter((district) => district.archetype === 'industrial' || district.archetype === 'port');

describe('şehrin türü (Tur 76)', () => {
  test('dengeli şehir varsayılan ve bugünkü şehrin kendisi: alan yazmıyor', () => {
    const a = createNewGame({ seed: 11 });
    const b = createNewGame({ seed: 11, cityType: 'balanced' });
    assert.equal(a.cityType, undefined);
    assert.equal(b.cityType, undefined);
    const strip = (s: GameState) => JSON.stringify({ ...s, meta: undefined });
    assert.equal(strip(a), strip(b));
  });

  test('lig türü yok sayıyor: herkes dengeli şehirde', () => {
    const plain = createNewGame({ companyName: 'Lig', league: { weekId: '2026-W44' } });
    const typed = createNewGame({ companyName: 'Lig', league: { weekId: '2026-W44' }, cityType: 'port' });
    assert.equal(typed.cityType, undefined);
    const strip = (s: GameState) => JSON.stringify({ ...s, meta: undefined });
    assert.equal(strip(typed), strip(plain));
    // Bilinmeyen tür (bozuk komut ya da kayıt) dengeli şehir.
    const unknown = createNewGame({ seed: 4, cityType: 'harbor' as never });
    assert.equal(unknown.cityType, undefined);
    assert.equal(strip(unknown), strip(createNewGame({ seed: 4 })));
  });

  test('her tür iki boyutta da tam bir yerleşim; üretim arazisi türden', () => {
    for (const type of CITY_TYPES) {
      for (const size of ['standard', 'large'] as const) {
        const layout = type.layouts[size];
        const side = size === 'standard' ? 3 : 5;
        assert.equal(layout.length, side, `${type.id} ${size}`);
        assert.ok(layout.every((row) => row.length === side), `${type.id} ${size} satırlar`);
      }
    }
    const count = (id: 'balanced' | 'port' | 'industrial' | 'capital') => production(createNewGame({ seed: 3, cityType: id })).length;
    assert.deepEqual([count('balanced'), count('port'), count('industrial'), count('capital')], [2, 3, 3, 1]);
    // Kuruluşta açık üretim bölgesi: dengeli şehirde biri (liman köşede, kilitli), liman ve sanayi kentinde iki.
    const open = (id: 'balanced' | 'port' | 'industrial' | 'capital') =>
      production(createNewGame({ seed: 3, cityType: id })).filter((district) => district.opensOnDay === undefined).length;
    assert.deepEqual([open('balanced'), open('port'), open('industrial'), open('capital')], [1, 2, 2, 1]);
    const port = createNewGame({ seed: 3, cityType: 'port' });
    assert.equal(port.cityType, 'port');
    assert.equal(createNewGame({ seed: 3, cityType: 'capital', citySize: 'large' }).districts.length, 25);
    // Türün maddeleri sayı vermiyor, iki boyutta da doğru olanı söylüyor (Codex #106).
    for (const size of ['standard', 'large'] as const) {
      const zones = (id: 'balanced' | 'port' | 'industrial' | 'capital') => {
        const all = getCityType(id).layouts[size].flat();
        const n = (archetype: string) => all.filter((a) => a === archetype).length;
        return { port: n('port'), industrial: n('industrial'), share: (n('port') + n('industrial')) / all.length, elite: n('downtown') + n('lux_residential') };
      };
      const balanced = zones('balanced');
      assert.equal(balanced.port, balanced.industrial, `${size}: dengelide liman ve sanayi eşit`);
      assert.ok(zones('port').port > zones('port').industrial && zones('port').share > balanced.share, `${size}: limanda liman çok, üretim arazisi bol`);
      assert.ok(zones('industrial').industrial > zones('industrial').port && zones('industrial').share > balanced.share, `${size}: sanayide sanayi çok`);
      const capital = zones('capital');
      assert.ok(capital.port === 0 && capital.industrial < capital.elite && capital.share < balanced.share, `${size}: başkentte sanayi az, liman yok`);
    }
  });

  test('hammadde fiyatı türden: limanda kahve ucuz, başkentte her hammadde pahalı', () => {
    const port = createNewGame({ seed: 5, cityType: 'port' });
    const capital = createNewGame({ seed: 5, cityType: 'capital' });
    const balanced = createNewGame({ seed: 5 });
    const base = (id: string) => GOOD_BY_ID[id]!.basePrice;
    assert.equal(balanced.market.spot.coffee_bean, base('coffee_bean'));
    assert.ok(Math.abs(port.market.spot.coffee_bean! - base('coffee_bean') * 0.8) < 1e-9);
    assert.ok(Math.abs(port.market.spot.wheat! - base('wheat') * 1.1) < 1e-9);
    assert.ok(Math.abs(capital.market.spot.silicon! - base('silicon') * 1.1) < 1e-9);
    // Ara mal ve tüketici ürünü türden etkilenmiyor: zincir kurmayanın maliyeti aynı.
    assert.equal(port.market.spot.roasted_coffee, base('roasted_coffee'));
    // Şirketlerin ilk birim maliyeti de şehrin fiyatından.
    assert.ok(Math.abs(port.companies.player!.unitCost.coffee_bean! - base('coffee_bean') * 0.8) < 1e-9);
    // Üretim yokken fiyat şehrin referansında kalıyor (dengeli fiyata dönmüyor).
    const engine = new GameEngine(port);
    for (let day = 0; day < 40; day++) engine.runDay();
    const after = engine.getState();
    const ref = referencePrice(after, 'coffee_bean');
    assert.ok(Math.abs(ref - base('coffee_bean') * 0.8) < 1e-9);
    assert.ok(after.market.spot.coffee_bean! < base('coffee_bean') * 0.9, `${after.market.spot.coffee_bean} < ${base('coffee_bean') * 0.9}`);
  });

  test('rakip kadrosu türden: limanın tüccarları pragmatik ve vefalı, sanayinin aileleri kindar ve gururlu', () => {
    assert.deepEqual(rivalsOf(createNewGame({ seed: 8 })), ['nova_holding', 'kilit_market', 'meridyen', 'atlas_yapi']);
    const port = rivalsOf(createNewGame({ seed: 8, cityType: 'port' }));
    assert.deepEqual(port, ['meridyen', 'anadolu_gida', 'veri_sanayi', 'atlas_yapi']);
    assert.ok(port.every((id) => ['pragmatic', 'loyal'].includes(RIVAL_CEOS[id]!.temperament)));
    // Sanayinin eski aileleri (ikisi kindar, biri gururlu) ve bir kooperatif. Firuze Grup hiçbir
    // türün ilk dördünde değil: ölçümde 3×3 şehirde oyuncuyu geçip zaferi kilitliyordu.
    const industrial = rivalsOf(createNewGame({ seed: 8, cityType: 'industrial' }));
    assert.deepEqual(industrial, ['kilit_market', 'kule_gayrimenkul', 'nova_holding', 'anadolu_gida']);
    assert.deepEqual(industrial.map((id) => RIVAL_CEOS[id]!.temperament), ['vindictive', 'vindictive', 'proud', 'loyal']);
    assert.deepEqual(rivalsOf(createNewGame({ seed: 8, cityType: 'capital' })), ['meridyen', 'kule_gayrimenkul', 'atlas_yapi', 'veri_sanayi']);
    for (const type of CITY_TYPES) assert.ok(!type.rivals.includes('firuze_grup'), type.id);
    // Büyük şehirde sekiz koltuk: kataloğun hepsi, türünkiler önde.
    const large = rivalsOf(createNewGame({ seed: 8, cityType: 'port', citySize: 'large' }));
    assert.equal(large.length, 8);
    assert.deepEqual(large.slice(0, 4), port);
  });

  test('kurallar: limanda terminal ucuz ve ücretin payı büyük; sanayide tesis bakımı az; başkentte arsa pahalı, gelir yüksek', () => {
    const balanced = createNewGame({ seed: 4 });
    const port = createNewGame({ seed: 4, cityType: 'port' });
    assert.equal(buildCost(port, 'player', 'freight_terminal'), Math.round(buildCost(balanced, 'player', 'freight_terminal') * 0.75));
    assert.equal(buildCost(port, 'player', 'cafe'), buildCost(balanced, 'player', 'cafe'));
    assert.equal(freightShareOf(balanced), FREIGHT_SHARE);
    assert.equal(freightShareOf(port), 0.7);

    const industrial = createNewGame({ seed: 4, cityType: 'industrial' });
    const farm = (state: GameState) =>
      buildingUpkeep(state, { id: 'b', defId: 'wheat_farm', companyId: 'player', tileId: 0, districtId: 0, last: {} } as never);
    const shop = (state: GameState) =>
      buildingUpkeep(state, { id: 'b', defId: 'corner_shop', companyId: 'player', tileId: 0, districtId: 0, last: {} } as never);
    assert.ok(BUILDING_BY_ID.wheat_farm!.role === 'extract');
    assert.ok(Math.abs(farm(industrial) - farm(balanced) * 0.8) < 1e-6, `${farm(industrial)} / ${farm(balanced)}`);
    assert.equal(shop(industrial), shop(balanced));

    const capital = createNewGame({ seed: 4, cityType: 'capital' });
    const meanLand = (state: GameState, archetype: string) => {
      const ids = new Set(state.districts.filter((d) => d.archetype === archetype && d.opensOnDay === undefined).map((d) => d.id));
      const tiles = state.map.tiles.filter((tile) => tile.kind === 'plot' && ids.has(tile.districtId));
      return tiles.reduce((sum, tile) => sum + tile.landValue, 0) / tiles.length;
    };
    assert.ok(meanLand(capital, 'downtown') > meanLand(balanced, 'downtown') * 1.15, `${meanLand(capital, 'downtown')} / ${meanLand(balanced, 'downtown')}`);
    const income = (state: GameState, archetype: string) => state.districts.find((d) => d.archetype === archetype)!.incomeLevel;
    assert.ok(Math.abs(income(capital, 'downtown') - (income(balanced, 'downtown') + 0.06)) < 1e-9);
    assert.ok(Math.abs(income(industrial, 'downtown') - (income(balanced, 'downtown') - 0.05)) < 1e-9);
  });

  test('zafer eşiği türün çarpanıyla', () => {
    const base = getDifficulty('normal').victoryNetWorth;
    for (const type of CITY_TYPES) {
      assert.equal(victoryNetWorth(createNewGame({ seed: 1, cityType: type.id })), base * getCityType(type.id).victoryScale, type.id);
    }
  });

  test('aynı tohum aynı şehir: türlü şehir de belirlenimli', () => {
    const run = () => {
      const engine = new GameEngine(createNewGame({ seed: 21, cityType: 'industrial' }));
      for (let day = 0; day < 30; day++) engine.runDay();
      return JSON.stringify({ ...engine.getState(), meta: undefined });
    };
    assert.equal(run(), run());
  });

  test('yapı menüsü şehrin fiyatını gösteriyor: limanda ucuz terminale kasa yetiyor, tahmin indirimli (Codex #106)', () => {
    const port = createNewGame({ seed: 21, cityType: 'port' });
    const balanced = createNewGame({ seed: 21 });
    const option = (state: GameState, defId: string) => buildOptions(state).find((o) => o.def.id === defId)!;
    for (const defId of ['freight_terminal', 'warehouse']) {
      const listed = BUILDING_BY_ID[defId]!.cost;
      assert.equal(option(port, defId).cost, buildCost(port, port.playerCompanyId, defId));
      assert.equal(option(port, defId).cost, Math.round(listed * 0.75), defId);
      assert.equal(option(balanced, defId).cost, listed, defId);
      // Kasa indirimli fiyata yetiyor, katalog fiyatına yetmiyor: menü kurdurmalı.
      port.companies[port.playerCompanyId]!.cash = listed * 0.8;
      assert.ok(option(port, defId).affordable, defId);
      balanced.companies[balanced.playerCompanyId]!.cash = listed * 0.8;
      assert.ok(!option(balanced, defId).affordable, defId);
    }
    // Deponun geri ödemesi ödenecek maliyetle: limanda katalog fiyatının dörtte üçü.
    const engine = new GameEngine(createNewGame({ seed: 21, cityType: 'port' }));
    const state = engine.getState();
    for (let day = 0; day < 120; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    const estimates = state.map.tiles
      .filter((t) => t.kind === 'plot' && !t.ownerId && !t.buildingId && !t.structureId)
      .map((t) => indirectEstimate(state, state.playerCompanyId, 'warehouse', t.districtId, t.id))
      .filter((e) => e && e.dailyProfit > 0 && Number.isFinite(e.paybackDays));
    assert.ok(estimates.length > 0, 'depo tahmini yok');
    for (const e of estimates) assert.ok(Math.abs(e!.paybackDays * e!.dailyProfit - BUILDING_BY_ID.warehouse!.cost * 0.75) < 1, `${e!.paybackDays} × ${e!.dailyProfit}`);
  });

  test('holding: yeni şehrin türü seçiliyor; başka türden şehrin kadrosu türünden, aynı türünki kayıyor', () => {
    const founder = createNewGame({ seed: 30 });
    const port = foundCity(JSON.parse(JSON.stringify(founder)) as GameState, 'standard', 2_000_000, 'port');
    assert.equal(port.cityType, 'port');
    assert.deepEqual(rivalsOf(port), ['meridyen', 'anadolu_gida', 'veri_sanayi', 'atlas_yapi']);
    // Dengeliden dengeliye: Tur 22'deki kayma (aynı dört rakip yok).
    const again = foundCity(JSON.parse(JSON.stringify(founder)) as GameState, 'standard', 2_000_000);
    assert.equal(again.cityType, undefined);
    const overlap = rivalsOf(again).filter((id) => rivalsOf(founder).includes(id));
    assert.equal(overlap.length, 0, overlap.join());
    // Limandan limana: ikinci liman aynı dörtle başlamıyor.
    const portFounder = createNewGame({ seed: 31, cityType: 'port' });
    const second = foundCity(JSON.parse(JSON.stringify(portFounder)) as GameState, 'standard', 2_000_000, 'port');
    assert.equal(rivalsOf(second).filter((id) => rivalsOf(portFounder).includes(id)).length, 0);
    // Dengeli kurucu → liman → ikinci liman: kayma türün şehir sayısından
    // (açılan şehir sayısından değil; 8 kayma sekizli kadroda başa sarardı).
    const thirdPort = foundCity(JSON.parse(JSON.stringify(port)) as GameState, 'standard', 1_000_000, 'port');
    assert.equal(rivalsOf(thirdPort).filter((id) => rivalsOf(port).includes(id)).length, 0, rivalsOf(thirdPort).join());
    // Limandan dengeliye: dengeli kurucunun dördüyle başlamıyor.
    const backHome = foundCity(JSON.parse(JSON.stringify(port)) as GameState, 'standard', 1_000_000);
    assert.equal(rivalsOf(backHome).filter((id) => rivalsOf(founder).includes(id)).length, 0, rivalsOf(backHome).join());
  });

  test('kayıt: türlü şehir kaydedilip açılıyor; v6 kaydı dengeli şehir olarak v7e taşınıyor', () => {
    const port = createNewGame({ seed: 12, cityType: 'port' });
    const round = importFromJson(exportToJson(port));
    assert.ok(round.ok);
    if (round.ok) assert.equal(round.state.cityType, 'port');
    const legacy = JSON.parse(exportToJson(createNewGame({ seed: 12 })));
    legacy.state.meta.schemaVersion = 6;
    const migrated = importFromJson(JSON.stringify(legacy));
    assert.ok(migrated.ok);
    if (migrated.ok) {
      assert.equal(migrated.migratedFrom, 6);
      assert.equal(migrated.state.cityType, undefined);
    }
  });
});
