import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, GOOD_BY_ID, TRADE_LINE } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { foundCity } from '../src/holding';
import { build, buyTile, demolish } from '../src/actions';
import { simulateCityDay } from '../src/day';
import { inTransitValue, isPurchasable, netWorthNow } from '../src/systems/city';
import { fleetUsed } from '../src/systems/freight';
import { SURPLUS_HAIRCUT, exportableSurplus } from '../src/systems/supply';
import { lineCapacity, lineDailyCost, lineQuote, prepareTradeDay, transitDaysBetween } from '../src/systems/trade';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { SCHEMA_VERSION } from '../src/types';
import type { GameState } from '../src/types';

/** Boş bir parsele bina; kimliğini döndürür. */
function place(state: GameState, defId: string): string {
  const me = state.companies[state.playerCompanyId]!;
  me.cash += 3_000_000;
  for (const tile of state.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId) continue;
    if (!buyTile(state, me.id, tile.id).ok) continue;
    if (build(state, me.id, tile.id, defId).ok) return state.map.tiles[tile.id]!.buildingId!;
  }
  throw new Error(`${defId} için parsel yok`);
}

interface Pair {
  engine: GameEngine;
  /** Oynanan şehir (varış). */
  root: GameState;
  /** Uzaktaki şehir (çıkış): buğday çiftliği ve terminal. */
  away: GameState;
  farm: string;
  awayTerminal: string;
  rootTerminal: string;
  mill: string;
}

/**
 * İki şehirli holding: uzaktaki şehirde buğday çiftliği (fazla), oynanan
 * şehirde un değirmeni (buğdayı pazardan alıyor); ikisinde de terminal.
 */
function pair(seed = 11): Pair {
  const first = createNewGame({ seed, companyName: 'Hat AŞ' });
  first.companies[first.playerCompanyId]!.cash += 5_000_000;
  const root = foundCity(first, 'standard', 3_000_000);
  const engine = new GameEngine(root);
  const state = engine.getState();
  const away = state.holding!.dormant[0]!.state;
  const farm = place(away, 'wheat_farm');
  const awayTerminal = place(away, 'freight_terminal');
  const mill = place(state, 'flour_mill');
  const rootTerminal = place(state, 'freight_terminal');
  return { engine, root: state, away, farm, awayTerminal, rootTerminal, mill };
}

const cash = (city: GameState) => city.companies[city.playerCompanyId]!.cash;

function openWheat(p: Pair, trucks = 6) {
  return p.engine.dispatch({ type: 'OPEN_LINE', from: p.away.meta.seed, to: p.root.meta.seed, goodId: 'wheat', trucks });
}

describe('şehirler arası hat (Tur 77)', () => {
  test('çıkış şehri fazlasını yüklüyor ve nötr: üretici pazara satmış gibi kazanıyor', () => {
    const p = pair();
    const surplus = exportableSurplus(p.away, 'wheat');
    assert.ok(surplus > lineCapacity(6), `buğday fazlası ${surplus}`);
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    const farm = p.away.buildings[p.farm]!;
    assert.equal(line.last!.units, lineCapacity(6));
    assert.equal(line.last!.short, undefined);
    // Çiftliğin bütün üretimi satıldı: yük ve pazara kalan aynı birim fiyatla.
    assert.ok(Math.abs(farm.last.exported! + farm.last.soldToMarket - farm.last.producedUnits) < 1e-6);
    const unitPrice = line.last!.goods / line.last!.units;
    assert.ok(Math.abs(farm.last.revenue - farm.last.producedUnits * unitPrice) < 1e-6, 'yük de fazla da spot × %85');
    // Şehrin pazarından çıkan yük fazlaya sayılmıyor: spot fiyatı yalnız kalan fazla kırıyor.
    assert.ok(Math.abs(p.away.market.produced['wheat']! - p.away.market.consumed['wheat']! - farm.last.soldToMarket) < 1e-6);
  });

  test('varış şehri malın ve nakliyenin bedelini ödüyor; para yaratılmıyor', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    const spot = p.away.market.spot['wheat']!;
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    const terminal = p.root.buildings[p.rootTerminal]!;
    const farm = p.away.buildings[p.farm]!;
    // Çıkışın yük cirosu varışın mal ödemesine eşit; nakliye de hattın bedeli.
    assert.ok(Math.abs(farm.last.exported! * spot * SURPLUS_HAIRCUT - line.last!.goods) < 1e-6);
    assert.equal(line.last!.freight, lineDailyCost(line));
    assert.ok(Math.abs(terminal.last.cogs - (line.last!.goods + line.last!.freight)) < 1e-6);
    assert.equal(line.last!.freight, 6 * TRADE_LINE.truckCostPerTransitDay * line.transitDays);
  });

  test('mal yol süresi kadar gün sonra havuza giriyor; o güne kadar varışın bilançosunda', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    const days = p.root.holding!.lines![0]!.transitDays;
    assert.equal(days, transitDaysBetween(p.away.meta.seed, p.root.meta.seed));
    assert.equal(days, transitDaysBetween(p.root.meta.seed, p.away.meta.seed), 'iki yönde aynı');
    assert.ok(days >= TRADE_LINE.minTransitDays && days <= TRADE_LINE.maxTransitDays);
    const player = p.root.companies[p.root.playerCompanyId]!;
    for (let day = 1; day <= days; day++) {
      p.engine.runDay();
      assert.equal(p.root.trade!.inbound.length, day, `gün ${day}: yoldaki sefer`);
      assert.equal(p.root.trade!.arrived, undefined);
      // Değirmen buğdayı hâlâ pazardan alıyor.
      assert.equal(player.supplyRatio['wheat'], 0);
    }
    p.engine.runDay();
    assert.equal(p.root.trade!.arrived!['line-1'], lineCapacity(6));
    assert.equal(p.root.trade!.inbound.length, days, 'biri vardı, biri yola çıktı');
    assert.equal(player.supplyRatio['wheat'], 1, 'değirmenin buğdayı hattan');

    // Yoldaki mal malın bedeliyle net değerde; çıkarılınca tam o kadar düşüyor.
    const value = inTransitValue(p.root);
    const line = p.root.holding!.lines![0]!;
    assert.ok(Math.abs(value - days * line.last!.goods) < days * line.last!.goods * 0.02, `${value}`);
    const withGoods = netWorthNow(p.root, player.id);
    const inbound = p.root.trade!.inbound;
    p.root.trade!.inbound = [];
    assert.ok(Math.abs(withGoods - netWorthNow(p.root, player.id) - value) < 1e-6);
    p.root.trade!.inbound = inbound;
  });

  test('hat değirmenin pazardan aldığı buğdayın yerini tutuyor: varış kazanıyor', () => {
    const run = (line: boolean) => {
      const p = pair();
      if (line) assert.ok(openWheat(p).ok);
      for (let day = 1; day <= 40; day++) p.engine.runDay();
      const before = cash(p.root);
      for (let day = 1; day <= 20; day++) p.engine.runDay();
      return cash(p.root) - before;
    };
    const without = run(false);
    const withLine = run(true);
    assert.ok(withLine > without, `hatlı ${withLine} ≤ hatsız ${without}`);
  });

  test('kamyonlar çıkış terminalinin filosundan: taşıma sözleşmesiyle ortak, uzaktaki şehirde de', () => {
    const p = pair();
    assert.ok(openWheat(p, 5).ok);
    const terminal = p.away.buildings[p.awayTerminal]!;
    assert.equal(terminal.lineTrucks, 5);
    assert.equal(fleetUsed(p.away, terminal.id), 5);
    const fleet = BUILDING_BY_ID['freight_terminal']!.fleet!;
    assert.equal(lineQuote(p.root, p.away.meta.seed, p.root.meta.seed, 'flour', 1).freeTrucks, fleet - 5);
    assert.ok(!p.engine.dispatch({ type: 'SET_LINE_TRUCKS', lineId: 'line-1', trucks: fleet + 1 }).ok);
    assert.ok(p.engine.dispatch({ type: 'SET_LINE_TRUCKS', lineId: 'line-1', trucks: fleet }).ok);
    assert.equal(terminal.lineTrucks, fleet);
    assert.ok(p.engine.dispatch({ type: 'CLOSE_LINE', lineId: 'line-1' }).ok);
    assert.equal(terminal.lineTrucks, undefined);
  });

  test('kurallar: iki terminal, iki ayrı şehir, ara mal, tek hat, zincir yok, filo sınırı', () => {
    const p = pair();
    const from = p.away.meta.seed;
    const to = p.root.meta.seed;
    const quote = (a: number, b: number, good: string, trucks = 2) => lineQuote(p.root, a, b, good, trucks);
    assert.ok(!quote(from, from, 'wheat').ok);
    assert.ok(!quote(from, to, 'bread').ok, 'mağaza ürünü taşınmıyor');
    assert.ok(!quote(from, to, 'wheat', 0).ok);
    assert.ok(!quote(from, to, 'wheat', 17).ok);
    assert.ok(!quote(from, to, 'wheat', 1.5).ok);
    assert.ok(quote(from, to, 'wheat').ok);
    assert.ok(openWheat(p, 2).ok);
    assert.ok(!quote(from, to, 'wheat').ok, 'aynı hat ikinci kez açılmıyor');
    assert.ok(!quote(to, from, 'wheat').ok, 'buğday alan şehir buğday göndermiyor');
    assert.ok(quote(to, from, 'flour').ok, 'öbür yönde başka mal');

    // Terminalsiz şehirden hat yok.
    const q = pair(12);
    demolish(q.away, q.away.playerCompanyId, q.away.buildings[q.awayTerminal]!.tileId);
    const refused = lineQuote(q.root, q.away.meta.seed, q.root.meta.seed, 'wheat', 2);
    assert.ok(!refused.ok && refused.reason!.includes(q.away.cityName!), refused.reason);

    // Holding'siz oyunda hat yok.
    const solo = new GameEngine(createNewGame({ seed: 3 }));
    assert.ok(!solo.dispatch({ type: 'OPEN_LINE', from: 1, to: 2, goodId: 'wheat', trucks: 1 }).ok);
  });

  test('en çok altı hat', () => {
    const p = pair();
    const from = p.away.meta.seed;
    const to = p.root.meta.seed;
    const goods = ['wheat', 'cotton', 'hide', 'silicon', 'vegetable', 'coffee_bean'];
    for (const goodId of goods) assert.ok(p.engine.dispatch({ type: 'OPEN_LINE', from, to, goodId, trucks: 1 }).ok, goodId);
    assert.equal(goods.length, TRADE_LINE.maxLines);
    assert.ok(!p.engine.dispatch({ type: 'OPEN_LINE', from: to, to: from, goodId: 'flour', trucks: 1 }).ok);
  });

  test('kasası yetmeyen varış şehri yetebildiği kadar alıyor; nakliyeyi ödeyemiyorsa sefer yok', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    const line = () => p.root.holding!.lines![0]!;
    const unitPrice = p.away.market.spot['wheat']! * SURPLUS_HAIRCUT;
    const fixed = lineDailyCost(line());
    p.root.companies[p.root.playerCompanyId]!.cash = fixed + 100 * unitPrice;
    prepareTradeDay(p.root);
    assert.equal(line().last!.units, 100);
    assert.equal(line().last!.short, 'cash');
    p.root.companies[p.root.playerCompanyId]!.cash = fixed - 1;
    prepareTradeDay(p.root);
    assert.deepEqual(line().last, { units: 0, goods: 0, freight: 0, short: 'cash' });
  });

  test('fazla yetmezse eksik çıkışın pazarından alınıyor; para yine denk', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    prepareTradeDay(p.root);
    const load = p.away.trade!.loads![0]!;
    // Sabahki tahminden sonra çiftlik yok oldu: yükün hepsi pazardan.
    delete p.away.buildings[p.farm];
    simulateCityDay(p.away);
    const terminal = p.away.buildings[p.awayTerminal]!;
    // Terminal yükü fazla fiyatıyla satıyor, eksiği pazar fiyatıyla alıyor (%85'e karşı tam fiyat).
    assert.ok(Math.abs(terminal.last.revenue - load.units * load.unitPrice) < 1e-6);
    assert.ok(Math.abs(terminal.last.cogs * SURPLUS_HAIRCUT - terminal.last.revenue) < terminal.last.revenue * 0.2, `${terminal.last.cogs}`);
    assert.equal(terminal.last.lineRevenue, terminal.last.revenue);
    // Yük şehrin pazarından çıktı.
    assert.ok(p.away.market.consumed['wheat']! >= load.units);
  });

  test('hat kapanınca yoldaki mal yine varıyor', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    p.engine.runDay();
    assert.ok(p.engine.dispatch({ type: 'CLOSE_LINE', lineId: 'line-1' }).ok);
    const days = transitDaysBetween(p.away.meta.seed, p.root.meta.seed);
    let arrived = 0;
    for (let day = 0; day < days; day++) {
      p.engine.runDay();
      arrived += p.root.trade!.arrived?.['line-1'] ?? 0;
    }
    assert.equal(arrived, 2 * lineCapacity(6));
    assert.equal(p.root.trade!.inbound.length, 0);
  });

  test('terminal yıkılınca hat ertesi sabah kapanıyor, haber oynanan şehre', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    demolish(p.away, p.away.playerCompanyId, p.away.buildings[p.awayTerminal]!.tileId);
    p.engine.runDay();
    assert.equal(p.root.holding!.lines!.length, 0);
    const news = p.root.news.find((item) => item.title.includes(GOOD_BY_ID['wheat']!.name) && item.title.includes(p.away.cityName!));
    assert.ok(news, 'haber yok');
  });

  test('şehre geçince hat sürüyor; kayıt hatları, yoldaki malı ve kamyonları taşıyor', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    assert.ok(p.engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    const root = p.engine.getState();
    assert.equal(root.holding!.lines!.length, 1);
    p.engine.runDay();
    const destination = root.holding!.dormant.find((city) => city.state.meta.seed === root.holding!.lines![0]!.to)!.state;
    assert.equal(destination.trade!.inbound.length, 2);

    const loaded = importFromJson(exportToJson(root));
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.equal(loaded.state.meta.schemaVersion, SCHEMA_VERSION);
    assert.equal(loaded.state.holding!.lines!.length, 1);
    assert.equal(loaded.state.buildings[p.awayTerminal]!.lineTrucks, 6);
    const again = loaded.state.holding!.dormant.find((city) => city.state.meta.seed === destination.meta.seed)!.state;
    assert.equal(again.trade!.inbound.length, 2);

    // v7 kaydı (hat yok) v8'e olduğu gibi geçiyor.
    const legacy = JSON.parse(exportToJson(pair(13).root));
    legacy.state.meta.schemaVersion = 7;
    legacy.state.holding.dormant[0].state.meta.schemaVersion = 7;
    const migrated = importFromJson(JSON.stringify(legacy));
    assert.ok(migrated.ok && migrated.migratedFrom === 7 && migrated.state.holding!.lines === undefined);
  });

  test('kapatılan şehrin hatları da gidiyor', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.away.gameOver = { day: p.away.time.day, byCompanyId: Object.keys(p.away.companies).find((id) => id !== p.away.playerCompanyId)! };
    assert.ok(p.engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(p.root.holding!.lines!.length, 0);
  });
});
