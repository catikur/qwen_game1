import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, GOOD_BY_ID, TRADED_GOODS, TRADE_LINE, TRADE_RIVAL } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { foundCity } from '../src/holding';
import { build, buyTile, demolish } from '../src/actions';
import { simulateCityDay } from '../src/day';
import { inTransitValue, isPurchasable, netWorthNow } from '../src/systems/city';
import { fleetUsed } from '../src/systems/freight';
import { SURPLUS_HAIRCUT, exportableSurplus, runSpotPriceTick, spotOutlook } from '../src/systems/supply';
import {
  cityBySeed,
  lineCapacity,
  lineDailyCost,
  lineMargins,
  lineProfitToday,
  lineQuote,
  marketBuyPrice,
  prepareTradeDay,
  priceBoard,
  rivalCopyCountdown,
  rivalLineOn,
  rivalLines,
  transitDaysBetween,
} from '../src/systems/trade';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { SCHEMA_VERSION } from '../src/types';
import type { GameState, RivalLine } from '../src/types';

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

  test('teklif açık hatların payını düşüyor: çıkışta kalan fazla, varışta kalan açık (Bugbot #107)', () => {
    // Üç şehir: iki buğday çiftliği (A, B), bir değirmen (C, günde 1.800 buğday).
    const first = createNewGame({ seed: 11, companyName: 'Hat AŞ' });
    first.companies[first.playerCompanyId]!.cash += 9_000_000;
    const second = foundCity(first, 'standard', 3_000_000);
    second.companies[second.playerCompanyId]!.cash += 9_000_000;
    const engine = new GameEngine(foundCity(second, 'standard', 3_000_000));
    const c = engine.getState();
    const [a, b] = c.holding!.dormant.map((city) => city.state) as [GameState, GameState];
    for (const city of [a, b]) {
      place(city, 'wheat_farm');
      place(city, 'freight_terminal');
    }
    place(c, 'flour_mill');
    place(c, 'freight_terminal');
    assert.ok(engine.dispatch({ type: 'OPEN_LINE', from: a.meta.seed, to: c.meta.seed, goodId: 'wheat', trucks: 3 }).ok);
    // A'nın 2.700'ünün 900'ü hatta: A'dan B'ye teklif kalan 1.800'ü görüyor.
    assert.equal(lineQuote(c, a.meta.seed, b.meta.seed, 'wheat', 1).surplus, exportableSurplus(a, 'wheat') - lineCapacity(3));
    // C'nin 1.800'lük açığının 900'ünü A getiriyor: B'den C'ye teklif kalan 900'ü görüyor, 3 kamyon öneriyor.
    const fromB = lineQuote(c, b.meta.seed, c.meta.seed, 'wheat', 1);
    assert.equal(fromB.need, 1800 - lineCapacity(3));
    assert.equal(fromB.suggestedTrucks, 3);
    assert.ok(engine.dispatch({ type: 'OPEN_LINE', from: b.meta.seed, to: c.meta.seed, goodId: 'wheat', trucks: fromB.suggestedTrucks }).ok);
    engine.runDay();
    // Önerilen kamyonlar dolu gidiyor; varışta açık kalmadı.
    const lines = c.holding!.lines!;
    assert.deepEqual(lines.map((line) => [line.last!.units, line.last!.short ?? null]), [[900, null], [900, null]]);
    assert.equal(lineQuote(c, b.meta.seed, c.meta.seed, 'wheat', 1).need, 0);
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

  test('gün içinde eksik kalan yükün pazardan alınanı ihracat baskısına giriyor: sabah pazardan alanla aynı fiyat (Codex #108)', () => {
    // Aynı 1.800 birim iki yoldan pazardan çıkıyor: sabah planında (çiftlik
    // plandan önce yok, hat eksiği pazardan alıyor) ya da gün içinde (çiftlik
    // plandan sonra yok, yalnız fazla taşıyan hattın yükü pazardan).
    const morning = pair();
    delete morning.away.buildings[morning.farm];
    assert.ok(morning.engine.dispatch({ type: 'OPEN_LINE', from: morning.away.meta.seed, to: morning.root.meta.seed, goodId: 'wheat', trucks: 6, buy: true }).ok);
    prepareTradeDay(morning.root);
    assert.equal(morning.away.trade!.marketOut!['wheat'], lineCapacity(6));
    simulateCityDay(morning.away);

    const midday = pair();
    assert.ok(openWheat(midday).ok);
    prepareTradeDay(midday.root);
    assert.equal(midday.away.trade!.loads![0]!.units, lineCapacity(6));
    delete midday.away.buildings[midday.farm];
    simulateCityDay(midday.away);

    assert.ok(Math.abs(morning.away.market.consumed['wheat']! - midday.away.market.consumed['wheat']!) < 1e-6, 'tüketim aynı, iki kez sayılmıyor');
    const [a, b] = [morning.away.market.spot['wheat']!, midday.away.market.spot['wheat']!];
    assert.ok(Math.abs(a - b) < 1e-9, `sabah ${a} · gün içinde ${b}`);
  });

  test('grev sabah planından sonra başlarsa yükün pazardan alınanı hattın satırında (Codex #108)', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    assert.equal(line.last!.units, lineCapacity(6));
    assert.equal(line.last!.bought, undefined, 'fazla yetiyor, pazardan alım yok');
    // Grev yarın başlıyor: sabah planı bugünün takvimiyle görmüyor, çıkış
    // şehrinin üretim adımı (takvim bir gün ilerlemiş) görüyor.
    const labor = p.away.companies[p.away.playerCompanyId]!.labor!;
    const day = p.away.time.day;
    labor.strike = { startedDay: day + 1, endsOnDay: day + 3, raise: 0 };
    p.engine.runDay();
    const today = p.root.holding!.lines![0]!.last!;
    assert.equal(today.units, lineCapacity(6), 'sabah planı tam yük');
    assert.ok((today.bought ?? 0) > 0 && today.bought! <= lineCapacity(6), `pazardan ${today.bought}`);
    assert.equal(p.away.trade?.fallback, undefined, 'şehrin günlük kaydı silindi');
    // Ertesi gün grev planda da var: fazla az, hat eksik yüklüyor; pazardan alım yok (fazla taşıyan hat).
    p.engine.runDay();
    const next = p.root.holding!.lines![0]!.last!;
    assert.equal(next.bought, undefined);
    assert.equal(next.short, 'surplus');
  });

  test('grevde pazardan alınan eksik pazarın fiyatıyla malın bedelinde, bugünkü kâr onu düşüyor (Codex #109)', () => {
    const p = pair();
    assert.ok(openWheat(p).ok);
    p.engine.runDay();
    const paid = p.root.holding!.lines![0]!.goodsPaid!;
    const labor = p.away.companies[p.away.playerCompanyId]!.labor!;
    labor.strike = { startedDay: p.away.time.day + 1, endsOnDay: p.away.time.day + 3, raise: 0 };
    // Yarının sabah planı da üretim adımı da bu fiyatla: spot günün sonunda değişiyor.
    const spot = p.away.market.spot['wheat']!;
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    const today = line.last!;
    const bought = today.bought ?? 0;
    assert.ok(bought > 0 && bought <= today.units, `pazardan ${bought}`);
    // Fazlası fazla fiyatıyla, pazardan alınanı pazarın fiyatıyla (sabah planı hepsini fazla fiyatıyla yazmıştı).
    const goods = (today.units - bought) * spot * SURPLUS_HAIRCUT + bought * spot;
    assert.ok(Math.abs(today.goods - goods) < 1e-6 * goods, `${today.goods} · ${goods}`);
    assert.ok(Math.abs(line.goodsPaid! - paid - today.goods) < 1e-6 * goods, 'açıldığından beri de');
    // Çıkış terminalinin zararı hattın kârından düşüyor: ticaret hedefi şişmiyor.
    const sale = cityBySeed(p.root, line.to)!.market.spot['wheat']!;
    const expected = today.units * sale * TRADE_LINE.saleShare - goods - today.freight;
    assert.ok(Math.abs(lineProfitToday(p.root, line)! - expected) < 1e-6 * goods, `${lineProfitToday(p.root, line)} · ${expected}`);
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

/**
 * Ticaretin fiyatı (Tur 78): liman kentinden sanayi kentine kahve. Limanda
 * kahve çekirdeği %20 ucuz, sanayide %15 pahalı; çıkışta yalnız terminal
 * (üretim yok), varışta terminal. Olaylar kapalı: fiyatı yalnız hat oynatsın.
 */
function coffeeRoute(seed = 21, rivals = true): Pair {
  const first = createNewGame({ seed, companyName: 'Tüccar AŞ', cityType: 'port' });
  first.flags.randomEvents = false;
  first.companies[first.playerCompanyId]!.cash += 5_000_000;
  const root = foundCity(first, 'standard', 3_000_000, 'industrial');
  root.flags.randomEvents = false;
  if (!rivals) root.flags.npcCompetition = false;
  const engine = new GameEngine(root);
  const state = engine.getState();
  const away = state.holding!.dormant[0]!.state;
  const awayTerminal = place(away, 'freight_terminal');
  const rootTerminal = place(state, 'freight_terminal');
  return { engine, root: state, away, farm: '', awayTerminal, rootTerminal, mill: '' };
}

function openCoffee(p: Pair, trucks = 1, buy = true) {
  return p.engine.dispatch({ type: 'OPEN_LINE', from: p.away.meta.seed, to: p.root.meta.seed, goodId: 'coffee_bean', trucks, buy });
}

describe('ticaretin fiyatı (Tur 78)', () => {
  test('pazardan alan hat üretimsiz çalışıyor: mal çıkışın pazarından, bedeli varıştan; çıkışın defteri boş', () => {
    const p = coffeeRoute();
    assert.equal(exportableSurplus(p.away, 'coffee_bean'), 0);
    assert.ok(openCoffee(p, 2).ok);
    const price = marketBuyPrice(p.away, 'coffee_bean');
    assert.equal(price, p.away.market.spot['coffee_bean'], 'pazar fiyatı: spot');
    const awayTerminal = p.away.buildings[p.awayTerminal]!;
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    assert.equal(line.buy, true);
    assert.equal(line.last!.units, lineCapacity(2));
    assert.equal(line.last!.bought, lineCapacity(2));
    assert.ok(Math.abs(line.last!.goods - lineCapacity(2) * price) < 1e-6, 'mal çıkışın pazar fiyatından');
    assert.equal(line.last!.freight, lineDailyCost(line));
    const terminal = p.root.buildings[p.rootTerminal]!;
    assert.ok(Math.abs(terminal.last.cogs - (line.last!.goods + line.last!.freight)) < 1e-6, 'bedel varış terminalinde');
    // Çıkış şehrinin şirketi bu malı ne satıyor ne alıyor: yalnız pazarı tüketiyor.
    assert.equal(awayTerminal.last.lineRevenue ?? 0, 0);
    assert.ok(p.away.market.consumed['coffee_bean']! >= lineCapacity(2) - 1e-6);
  });

  test('çıkışta maliyet olayı başlasa da bitse de hattın alışı spot fiyattan (Codex #108)', () => {
    const p = coffeeRoute(21, false);
    assert.ok(openCoffee(p, 1).ok);
    // Enerji sıkışması (işletme maliyeti ×1,1) bugün bitiyor: sabah planı
    // olaydan önce koşuyor; şirketler bugün çarpansız alıyor, hat da.
    p.away.activeEvents.push({ defId: 'energy_crunch', startedDay: p.away.time.day - 19, remainingDays: 1 });
    const spot = p.away.market.spot['coffee_bean']!;
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    assert.ok(Math.abs(line.last!.goods - lineCapacity(1) * spot) < 1e-9, `mal ${line.last!.goods} · spot ${spot}`);
    assert.equal(p.away.activeEvents.some((event) => event.defId === 'energy_crunch'), false, 'olay bitti');
  });

  test('pazardan alan hat önce fazlayı yüklüyor, eksiği pazardan; kasa önce ucuz olana yetiyor', () => {
    const p = pair();
    const surplus = exportableSurplus(p.away, 'wheat');
    const trucks = Math.ceil(surplus / TRADE_LINE.truckUnits) + 1;
    assert.ok(p.engine.dispatch({ type: 'OPEN_LINE', from: p.away.meta.seed, to: p.root.meta.seed, goodId: 'wheat', trucks, buy: true }).ok);
    p.engine.runDay();
    const line = p.root.holding!.lines![0]!;
    assert.equal(line.last!.units, lineCapacity(trucks));
    assert.ok(Math.abs(line.last!.bought! - (lineCapacity(trucks) - surplus)) < 1e-6, `pazardan ${line.last!.bought} · fazla ${surplus}`);
    assert.equal(line.last!.short, undefined);

    // Kasa yalnız fazlaya yetiyorsa pazardan alım yok.
    const q = pair();
    assert.ok(q.engine.dispatch({ type: 'OPEN_LINE', from: q.away.meta.seed, to: q.root.meta.seed, goodId: 'wheat', trucks, buy: true }).ok);
    const fixed = lineDailyCost(q.root.holding!.lines![0]!);
    const ownCost = exportableSurplus(q.away, 'wheat') * q.away.market.spot['wheat']! * SURPLUS_HAIRCUT;
    q.root.companies[q.root.playerCompanyId]!.cash = fixed + ownCost + 1;
    q.engine.runDay();
    const poor = q.root.holding!.lines![0]!;
    assert.equal(poor.last!.short, 'cash');
    assert.equal(poor.last!.bought, undefined);
    assert.ok(poor.last!.units > 0);
  });

  test('ihracat baskısı: pazardan alındıkça çıkışın fiyatı yükseliyor; hatsız şehir bitine kadar aynı', () => {
    const p = coffeeRoute(21, false);
    const twin = new GameEngine(structuredClone(p.root));
    assert.ok(openCoffee(p, 3).ok);
    for (let day = 0; day < 25; day++) {
      p.engine.runDay();
      twin.runDay();
    }
    const twinAway = twin.getState().holding!.dormant[0]!.state;
    assert.ok(p.away.market.spot['coffee_bean']! > twinAway.market.spot['coffee_bean']! * 1.01, `çıkış ${p.away.market.spot['coffee_bean']} · hatsız ${twinAway.market.spot['coffee_bean']}`);
    // Varışta pazara giren mal fiyatı düşürüyor (fazla).
    assert.ok(p.root.market.spot['coffee_bean']! < twin.getState().market.spot['coffee_bean']!);
    // Başka malın fiyatı iki koşuda aynı: baskı yalnız taşınan malda.
    assert.equal(p.away.market.spot['silicon'], twinAway.market.spot['silicon']);
    assert.equal(p.away.trade?.marketOut, undefined, 'günün akışı kayda kalmıyor');
  });

  test('hattın malı varışta pazara kalınca planlı satış: spot × %95, terminalin cirosu', () => {
    const p = coffeeRoute(21, false);
    assert.ok(openCoffee(p, 1).ok);
    const line = () => p.root.holding!.lines![0]!;
    for (let day = 0; day < line().transitDays + 1; day++) p.engine.runDay();
    // Varışta kahve tüketen yok: gelen malın hepsi pazara.
    const spot = p.root.market.spot['coffee_bean']!;
    p.engine.runDay();
    const arrived = p.root.trade!.arrived![line().id]!;
    const terminal = p.root.buildings[p.rootTerminal]!;
    assert.equal(arrived, lineCapacity(1));
    assert.ok(Math.abs(terminal.last.lineRevenue! - arrived * spot * TRADE_LINE.saleShare) < 1e-6, `ciro ${terminal.last.lineRevenue} · ${arrived} × ${spot}`);
  });

  test('rakip kârlı yolu kopyalıyor: varışın en zengin rakibi (emlakçı değil), bir kamyon, haber', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    const margins = lineMargins(p.root, p.away.meta.seed, p.root.meta.seed, 'coffee_bean')!;
    assert.ok(margins.market > TRADE_RIVAL.entryMargin * margins.buyPrice, `pazara birim kâr ${margins.market}`);
    for (let day = 0; day < TRADE_RIVAL.entryDays - 1; day++) p.engine.runDay();
    assert.equal(rivalLines(p.root).length, 0, 'eşikten önce kopya yok');
    p.engine.runDay();
    const rivals = rivalLines(p.root);
    assert.equal(rivals.length, 1);
    const rival = rivals[0]!;
    assert.equal(rival.trucks, 1);
    assert.equal(rival.goodId, 'coffee_bean');
    const company = p.root.companies[rival.companyId]!;
    assert.ok(!company.isPlayer);
    const landlords = Object.values(p.root.companies).filter((c) => !c.isPlayer && (c.profileId === 'atlas_yapi' || c.profileId === 'kule_gayrimenkul'));
    assert.ok(!landlords.some((c) => c.id === rival.companyId), 'emlakçı mal ticaretine girmiyor');
    assert.ok(p.root.news.some((item) => item.title.includes(company.name) && item.title.includes('Rakip hattı')));
    assert.equal(rivalLineOn(p.root, p.away.meta.seed, p.root.meta.seed, 'coffee_bean'), rival);

    // Rakip rekabeti kapalı şehirde kimse kopyalamıyor.
    const calm = coffeeRoute(21, false);
    assert.ok(openCoffee(calm, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays + 5; day++) calm.engine.runDay();
    assert.equal(rivalLines(calm.root).length, 0);
  });

  test('rakibin malı yolu bitince varış pazarına giriyor; kârı kendi defterinde; kâr sürdükçe kamyon ekliyor', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays; day++) p.engine.runDay();
    const rival = rivalLines(p.root)[0]!;
    // Oyuncunun hattı gibi: açıldığı günden yol süresi kadar sonra varıyor.
    for (let day = 0; day < rival.transitDays - 1; day++) p.engine.runDay();
    assert.equal(rival.last!.units, 0, 'ilk sefer yolda');
    const company = p.root.companies[rival.companyId]!;
    p.engine.runDay();
    assert.equal(rival.last!.units, lineCapacity(1));
    // Ciro planlı satışla, mal maliyeti çıkışın pazarından ve nakliye.
    const margins = lineMargins(p.root, p.away.meta.seed, p.root.meta.seed, 'coffee_bean')!;
    assert.ok(company.today.revenue >= lineCapacity(1) * margins.destinationSpot * TRADE_LINE.saleShare * 0.9);
    assert.ok(p.root.market.produced['coffee_bean']! >= lineCapacity(1) * 2 - 1e-6, 'oyuncunun ve rakibin malı varışın fazlası');
    // Gözden geçirme günü: kâr eşiği aşılıyorsa bir kamyon daha.
    while (p.root.time.day < rival.reviewDay) p.engine.runDay();
    const before = lineMargins(p.root, p.away.meta.seed, p.root.meta.seed, 'coffee_bean')!;
    p.engine.runDay();
    const expected = before.market >= TRADE_RIVAL.entryMargin * before.buyPrice ? 2 : before.market < 0 ? 0 : 1;
    assert.equal(rivalLines(p.root)[0]?.trucks ?? 0, expected);
  });

  test('fark kapanınca rakip kamyon çekiyor, sıfırda hattı kapatıyor; haber', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays; day++) p.engine.runDay();
    const rival = rivalLines(p.root)[0]!;
    // Gözden geçirme o günün sabahında: bir önceki günün sonunda varışta
    // kahve ucuzladı (bereket), pazara satış zarar ediyor.
    while (p.root.time.day < rival.reviewDay) p.engine.runDay();
    p.root.market.spot['coffee_bean'] = p.away.market.spot['coffee_bean']! * 0.8;
    p.engine.runDay();
    assert.equal(rivalLines(p.root).length, 0);
    assert.ok(p.root.news.some((item) => item.title.includes(p.root.companies[rival.companyId]!.name) && item.title.includes('kapattı')));
  });

  test('rakip rekabeti kapanınca rakip hattı kamyonunu gözden geçirmiyor, yükü sürüyor (Codex #108)', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays; day++) p.engine.runDay();
    const rival = rivalLines(p.root)[0]!;
    assert.ok(rival, 'rakip kopyaladı');
    // Bina öngörüsünün kopyaları gibi: varış şehrinde rakipler hamle yapmıyor.
    p.root.flags.npcCompetition = false;
    const { trucks, reviewDay } = rival;
    while (p.root.time.day <= reviewDay + TRADE_RIVAL.reviewDays) p.engine.runDay();
    assert.equal(rival.trucks, trucks, 'kamyon sayısı aynı');
    assert.equal(rival.reviewDay, reviewDay, 'gözden geçirme bekliyor');
    assert.ok(rivalLines(p.root).includes(rival), 'hat duruyor');
    assert.equal(rival.last!.units, lineCapacity(trucks), 'yükü sürüyor');
  });

  test('aynı rakibin yolları tek kasadan yüklüyor: nakdi ikisine yetmezse ikincisi bekliyor (Codex #108)', () => {
    const p = coffeeRoute();
    const from = p.away.meta.seed;
    const to = p.root.meta.seed;
    const company = Object.values(p.root.companies).find((c) => !c.isPlayer)!;
    const day = p.root.time.day;
    const route = (id: number, goodId: string): RivalLine => ({
      id: `rival-line-${id}`,
      from,
      to,
      goodId,
      companyId: company.id,
      trucks: 2,
      transitDays: transitDaysBetween(from, to),
      openedDay: day - 30,
      reviewDay: day + 100,
    });
    const first = route(1, 'coffee_bean');
    const second = route(2, 'wheat');
    p.root.holding!.rivalLines = [first, second];
    const cost = (line: RivalLine) => lineCapacity(line.trucks) * lineMargins(p.root, from, to, line.goodId)!.buyPrice + lineDailyCost(line);
    // Nakit her yola ayrı ayrı yetiyor, ikisinin toplamına yetmiyor.
    company.cash = cost(first) + cost(second) / 2;
    assert.ok(company.cash >= cost(first) && company.cash >= cost(second) && company.cash < cost(first) + cost(second));
    p.engine.runDay();
    assert.equal(first.last!.units, lineCapacity(2), 'ilk yol yüklüyor');
    assert.equal(second.last!.units, 0, 'kalan nakit ikinci yola yetmiyor');

    // Nakit ikisine de yetince ikisi de yüklüyor.
    company.cash = (cost(first) + cost(second)) * 1.2;
    p.engine.runDay();
    assert.equal(first.last!.units, lineCapacity(2));
    assert.equal(second.last!.units, lineCapacity(2));
  });

  test('kopyaya kalan gün: eşikte sıfır, rakip giremezse orada bekliyor; rakip ya da rekabet yoksa sayaç yok (Bugbot #108)', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    const line = p.root.holding!.lines![0]!;
    assert.equal(rivalCopyCountdown(p.root, line), undefined, 'henüz kârlı gün yok');
    for (let day = 0; day < 10; day++) p.engine.runDay();
    assert.deepEqual(rivalCopyCountdown(p.root, line), { days: 10, left: TRADE_RIVAL.entryDays - 10 });
    // Eşik geçti, nakdi yeten rakip henüz yok: kopya her sabah yeniden deneniyor; sayaç "bir gün daha" demiyor.
    line.profitableDays = TRADE_RIVAL.entryDays + 3;
    assert.deepEqual(rivalCopyCountdown(p.root, line), { days: TRADE_RIVAL.entryDays + 3, left: 0 });
    // Ertesi sabah rakip kopyalıyor: satır rakibi gösteriyor, sayaç yok.
    p.engine.runDay();
    assert.ok(rivalLineOn(p.root, line.from, line.to, line.goodId));
    assert.equal(rivalCopyCountdown(p.root, line), undefined);

    // Rakip rekabeti kapalı şehirde yol kârlı kalsa da kimse kopyalamıyor: sayaç hiç yok.
    const calm = coffeeRoute(21, false);
    assert.ok(openCoffee(calm, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays + 2; day++) calm.engine.runDay();
    const quiet = calm.root.holding!.lines![0]!;
    assert.ok((quiet.profitableDays ?? 0) > TRADE_RIVAL.entryDays, `kârlı gün ${quiet.profitableDays}`);
    assert.equal(rivalCopyCountdown(calm.root, quiet), undefined);
  });

  test('SET_LINE_BUY ayarı değiştiriyor; birim hesabı ve fiyat tablosu', () => {
    const p = coffeeRoute(21, false);
    assert.ok(openCoffee(p, 1, false).ok);
    const line = p.root.holding!.lines![0]!;
    assert.equal(line.buy, undefined);
    p.engine.runDay();
    assert.equal(line.last!.units, 0, 'fazla yok, pazardan almıyor');
    assert.ok(p.engine.dispatch({ type: 'SET_LINE_BUY', lineId: line.id, buy: true }).ok);
    p.engine.runDay();
    assert.equal(line.last!.units, lineCapacity(1));
    assert.ok(p.engine.dispatch({ type: 'SET_LINE_BUY', lineId: line.id, buy: false }).ok);
    assert.equal(line.buy, undefined);
    assert.equal(p.engine.dispatch({ type: 'SET_LINE_BUY', lineId: 'yok', buy: true }).ok, false);

    const m = lineMargins(p.root, p.away.meta.seed, p.root.meta.seed, 'coffee_bean')!;
    assert.ok(Math.abs(m.freight - (TRADE_LINE.truckCostPerTransitDay * m.transitDays) / TRADE_LINE.truckUnits) < 1e-9);
    assert.ok(Math.abs(m.market - (m.destinationSpot * TRADE_LINE.saleShare - m.buyPrice - m.freight)) < 1e-9);
    assert.ok(Math.abs(m.need - (marketBuyPrice(p.root, 'coffee_bean') - m.buyPrice - m.freight)) < 1e-9);
    assert.equal(lineMargins(p.root, p.root.meta.seed, p.root.meta.seed, 'coffee_bean'), undefined);

    const board = priceBoard(p.root);
    const coffee = board.find((row) => row.goodId === 'coffee_bean')!;
    assert.equal(coffee.prices.length, 2);
    assert.equal(coffee.prices[0]!.seed, p.root.meta.seed, 'oynanan şehir önce');
    assert.deepEqual(coffee.best && [coffee.best.from, coffee.best.to], [p.away.meta.seed, p.root.meta.seed], 'kahve limandan sanayiye');
    assert.equal(priceBoard(createNewGame({ seed: 3 })).length, 0, 'tek şehirde tablo yok');
  });

  test('kayıt rakip hatlarını ve pazardan al ayarını taşıyor; v8 kaydı v9a olduğu gibi geçiyor; kapatılan şehrin rakip hatları gidiyor', () => {
    const p = coffeeRoute();
    assert.ok(openCoffee(p, 1).ok);
    for (let day = 0; day < TRADE_RIVAL.entryDays; day++) p.engine.runDay();
    assert.equal(rivalLines(p.root).length, 1);
    const loaded = importFromJson(exportToJson(p.root));
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    assert.equal(loaded.state.meta.schemaVersion, SCHEMA_VERSION);
    assert.equal(loaded.state.holding!.lines![0]!.buy, true);
    assert.deepEqual(loaded.state.holding!.rivalLines, p.root.holding!.rivalLines);

    const legacy = JSON.parse(exportToJson(pair(13).root));
    legacy.state.meta.schemaVersion = 8;
    legacy.state.holding.dormant[0].state.meta.schemaVersion = 8;
    const migrated = importFromJson(JSON.stringify(legacy));
    assert.ok(migrated.ok && migrated.migratedFrom === 8 && migrated.state.holding!.rivalLines === undefined);

    p.away.gameOver = { day: p.away.time.day, byCompanyId: Object.keys(p.away.companies).find((id) => id !== p.away.playerCompanyId)! };
    assert.ok(p.engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(rivalLines(p.root).length, 0);
  });
});

describe('hattın kendi etkisi (Tur 80)', () => {
  const route = (p: Pair) => [p.away.meta.seed, p.root.meta.seed] as const;

  test('tahminin formülü spot fiyat adımınınki: akış eklenmeden bir günlük tahmin yarınki fiyat', () => {
    const p = coffeeRoute(21, false);
    p.engine.runDay();
    const tomorrow = structuredClone(p.away);
    runSpotPriceTick(tomorrow);
    for (const good of TRADED_GOODS) {
      assert.ok(Math.abs(spotOutlook(p.away, good.id, {}, 1) - tomorrow.market.spot[good.id]!) < 1e-9, good.id);
    }
  });

  test('kamyon arttıkça çıkış pahalanıyor, varış ucuzluyor, birim kâr düşüyor; en kârlı kamyon günlük kârı en yüksek olan', () => {
    const p = coffeeRoute(21, false);
    const [from, to] = route(p);
    const quote = (trucks: number) => lineQuote(p.root, from, to, 'coffee_bean', trucks, true);
    const free = quote(1).freeTrucks;
    assert.ok(free >= 4, `${free} kamyon`);
    const outlooks = Array.from({ length: free }, (_, i) => quote(i + 1).outlook!);
    for (let i = 1; i < outlooks.length; i++) {
      assert.ok(outlooks[i]!.originSpot >= outlooks[i - 1]!.originSpot, 'çıkış');
      assert.ok(outlooks[i]!.destinationSpot <= outlooks[i - 1]!.destinationSpot, 'varış');
      assert.ok(outlooks[i]!.margin < outlooks[i - 1]!.margin, 'birim kâr');
    }
    const { bestTrucks, bestDaily } = outlooks[0]!;
    assert.ok(bestTrucks >= 1 && bestDaily > 0, `${bestTrucks} kamyon`);
    // Her kamyon sayısında aynı öneri; günlük kâr hiçbir sayıda daha yüksek değil.
    assert.ok(outlooks.every((outlook) => outlook.bestTrucks === bestTrucks && outlook.daily <= bestDaily + 1e-9));
    assert.ok(Math.abs(outlooks[bestTrucks - 1]!.daily - bestDaily) < 1e-9);
  });

  test('tahmin 30 gün sonra gerçekleşen fiyata yakın (olaysız, rakipsiz)', () => {
    const p = coffeeRoute(21, false);
    const [from, to] = route(p);
    const outlook = lineQuote(p.root, from, to, 'coffee_bean', 4, true).outlook!;
    assert.equal(outlook.days, TRADE_RIVAL.entryDays);
    assert.ok(openCoffee(p, 4).ok);
    for (let day = 0; day < outlook.days; day++) p.engine.runDay();
    const origin = p.away.market.spot['coffee_bean']!;
    const destination = p.root.market.spot['coffee_bean']!;
    assert.ok(Math.abs(outlook.originSpot / origin - 1) < 0.03, `çıkış ${outlook.originSpot} · ${origin}`);
    assert.ok(Math.abs(outlook.destinationSpot / destination - 1) < 0.03, `varış ${outlook.destinationSpot} · ${destination}`);
  });

  test('yüksüz hattın tahmini yok; fazla taşıyan hat fazlanın fiyatıyla hesaplanıyor', () => {
    const coffee = coffeeRoute(21, false);
    const [from, to] = route(coffee);
    // Çıkışta kahve fazlası yok: pazardan almayan hat boş gider, tahmin söylenmiyor.
    assert.equal(lineQuote(coffee.root, from, to, 'coffee_bean', 1, false).outlook, undefined);
    const p = pair();
    const [wheatFrom, wheatTo] = route(p);
    const outlook = lineQuote(p.root, wheatFrom, wheatTo, 'wheat', 2, false).outlook!;
    // Fazlanın birim bedeli çıkışın fiyatının %85'i: kâr bunu ve nakliyeyi düşüyor.
    const units = lineCapacity(2);
    const freight = lineDailyCost({ trucks: 2, transitDays: transitDaysBetween(wheatFrom, wheatTo) });
    const expected = outlook.destinationSpot * TRADE_LINE.saleShare - outlook.originSpot * SURPLUS_HAIRCUT - freight / units;
    assert.ok(Math.abs(outlook.margin - expected) < 1e-9, `${outlook.margin} · ${expected}`);
  });
});
