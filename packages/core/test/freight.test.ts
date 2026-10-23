import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, GOOD_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { build, buyTile, demolish, purchaseBlocker } from '../src/actions';
import { supplyRoutes } from '../src/routes';
import { collectEventModifiers } from '../src/systems/events';
import { boostMultiplier } from '../src/systems/cards';
import { FREIGHT, fleetUsed, freightPenalty, freightProspects, runFreightTick } from '../src/systems/freight';
import { FREIGHT_SHARE, distributionRelief, ownDepotRelief, resetDailyLedgers, runProductionTick, unitCogsFor } from '../src/systems/supply';
import { runMarketTick } from '../src/systems/market';
import { isPurchasable } from '../src/systems/city';
import { indirectEstimate } from '../src/systems/indirect';
import { playerStrategy } from './proxy';
import type { BuildingInstance, GameState } from '../src/types';

const TERMINAL = 'freight_terminal';

/** Rakipleri büyümüş bir şehir: vekil 150 gün. */
function grown(seed = 1): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Nakliye AŞ' }));
  for (let day = 1; day <= 150; day++) {
    if (day % 7 === 1) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

const base = grown();
const fresh = (): GameEngine => new GameEngine(JSON.parse(JSON.stringify(base.getState())) as GameState);

function rivalOutlets(state: GameState): BuildingInstance[] {
  return Object.values(state.buildings).filter((b) => b.companyId !== state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'outlet');
}

/** Rakip mağazalarının en yoğun olduğu boş parsele terminal; kimliğini döndürür. */
function placeTerminal(state: GameState): BuildingInstance {
  const me = state.companies[state.playerCompanyId]!;
  me.cash += 5_000_000;
  me.netWorth += 5_000_000;
  const radius = BUILDING_BY_ID[TERMINAL]!.radius;
  const rivals = rivalOutlets(state);
  let best: { id: number; count: number } | null = null;
  for (const tile of state.map.tiles) {
    if (!isPurchasable(tile) || tile.structureId || tile.buildingId || tile.ownerId) continue;
    const count = rivals.filter((o) => {
      const at = state.map.tiles[o.tileId]!;
      return Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= radius;
    }).length;
    if (!best || count > best.count) best = { id: tile.id, count };
  }
  assert.ok(best && best.count >= 4, `menzilde ${best?.count} rakip mağazası`);
  assert.ok(buyTile(state, me.id, best.id).ok);
  assert.ok(build(state, me.id, best.id, TERMINAL).ok);
  return state.buildings[state.map.tiles[best.id]!.buildingId!]!;
}

/** İlk teklif gelene kadar taşıma adımı (gün ilerleyerek). */
function awaitOffer(state: GameState): void {
  for (let i = 0; i < 80 && !state.freight?.offers.length; i++) {
    state.time.day += 1;
    runFreightTick(state);
  }
  assert.ok(state.freight?.offers.length, 'teklif gelmedi');
}

function marketDay(state: GameState): void {
  state.time.day += 1;
  resetDailyLedgers(state);
  runProductionTick(state);
  runMarketTick(state);
  runFreightTick(state);
}

describe('nakliye terminali ve taşıma sözleşmeleri (Tur 56)', () => {
  test('terminal kendi mağazasına depodan büyük indirim veriyor; menzil dışına vermiyor', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    const at = state.map.tiles[terminal.tileId]!;
    const def = BUILDING_BY_ID[TERMINAL]!;
    const own = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'outlet');
    let inside = 0;
    for (const outlet of own) {
      const tile = state.map.tiles[outlet.tileId]!;
      const reach = Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y) <= def.radius;
      if (reach) {
        inside++;
        assert.equal(ownDepotRelief(state, outlet), 0.35);
      }
    }
    assert.ok(inside > 0, 'menzilde kendi mağazası yok');
    assert.ok(def.relief! > 0.25, 'terminal depodan cömert');
  });

  test('terminali olmayan oyunda taşıma adımı hiçbir şeye dokunmuyor (zar da atmıyor)', () => {
    const state = fresh().getState();
    const before = JSON.stringify(state);
    for (let i = 0; i < 30; i++) runFreightTick(state);
    assert.equal(JSON.stringify(state), before);
  });

  test('teklif menzildeki tek bir rakibin mağazalarından, yakından uzağa, filo kadar', () => {
    const state = fresh().getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    assert.equal(offer.terminalId, terminal.id);
    assert.ok(offer.outletIds.length >= FREIGHT.minOutlets && offer.outletIds.length <= FREIGHT.maxOutlets, `${offer.outletIds.length} mağaza`);
    const radius = BUILDING_BY_ID[TERMINAL]!.radius;
    const at = state.map.tiles[terminal.tileId]!;
    for (const id of offer.outletIds) {
      const outlet = state.buildings[id]!;
      assert.equal(outlet.companyId, offer.companyId);
      const tile = state.map.tiles[outlet.tileId]!;
      assert.ok(Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y) <= radius);
    }
    assert.ok(offer.estimate > 0);
    assert.equal(offer.durationDays, FREIGHT.durationDays);
    assert.ok(
      state.news.some((item) => item.companyId === offer.companyId && item.tileId === terminal.tileId),
      'teklif haberi',
    );
    // Teklifteki mağaza başka teklife girmiyor.
    const prospects = freightProspects(state, terminal).map((b) => b.id);
    assert.ok(offer.outletIds.every((id) => !prospects.includes(id)));
  });

  test('kabul: rakibin indirimi ücret düşülmüş, ücret oyuncunun cirosu ve terminalin defteri', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    assert.ok(engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: offer.id }).ok);
    assert.equal(state.freight!.offers.length, 0);
    const deal = state.freight!.contracts[0]!;
    assert.equal(deal.acceptedDay, state.time.day);
    assert.equal(deal.endDay, state.time.day + FREIGHT.durationDays);
    assert.equal(fleetUsed(state, terminal.id), deal.outletIds.length);

    const outlet = state.buildings[deal.outletIds[0]!]!;
    assert.ok(Math.abs(distributionRelief(state, outlet) - 0.35 * (1 - FREIGHT_SHARE)) < 1e-12, 'müşterinin indirimi');

    state.time.day += 1;
    resetDailyLedgers(state);
    runProductionTick(state);
    runMarketTick(state);
    // Ücret = sözleşmedeki mağazaların bugünkü satışı × perakende maliyeti × terminalin payı.
    const mods = collectEventModifiers(state);
    const boost = boostMultiplier(state, deal.companyId, 'cogs');
    let expected = 0;
    for (const id of deal.outletIds) {
      for (const [goodId, units] of Object.entries(state.buildings[id]!.soldByGood ?? {})) {
        expected += units * GOOD_BY_ID[goodId]!.retailCost * 0.35 * FREIGHT_SHARE * mods.costMultiplier * boost;
      }
    }
    assert.ok(expected > 0, 'satış yok');
    assert.ok(Math.abs(deal.lastFee! - expected) < 1e-6, `ücret ${deal.lastFee} beklenen ${expected}`);
    assert.ok(terminal.last.revenue >= deal.lastFee! - 1e-9, 'terminalin cirosu');

    runFreightTick(state);
    assert.ok(Math.abs(deal.earned! - expected) < 1e-6);
    assert.ok(Math.abs(state.freight!.earnedTotal - expected) < 1e-6);
  });

  test('ücret müşterinin maliyetinde: maliyeti terminalin tam indirimiyle artı ücret (Codex #86)', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    state.time.day += 1;
    resetDailyLedgers(state);
    runProductionTick(state);
    runMarketTick(state);
    const mods = collectEventModifiers(state);
    const boost = boostMultiplier(state, deal.companyId, 'cogs');
    // Ücret olmasaydı müşterinin ödeyeceği: terminalin %35'lik tam indirimiyle mal maliyeti.
    let full = 0;
    let cogs = 0;
    for (const id of deal.outletIds) {
      const outlet = state.buildings[id]!;
      cogs += outlet.last.cogs;
      for (const [goodId, units] of Object.entries(outlet.soldByGood ?? {})) {
        full += units * unitCogsFor(state, deal.companyId, goodId, 0.35, mods.costMultiplier) * boost;
      }
    }
    assert.ok(deal.lastFee! > 0);
    assert.ok(Math.abs(cogs - (full + deal.lastFee!)) < 1e-6, `maliyet ${cogs} · tam indirimle ${full} + ücret ${deal.lastFee}`);
  });

  test('her mağazanın bugünkü ücreti kendi defterinde; toplamı sözleşmenin ücreti (Codex #86)', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    marketDay(state);
    const fees = deal.outletIds.map((id) => state.buildings[id]!.last.freight ?? 0);
    assert.ok(
      fees.every((fee) => fee > 0),
      `mağaza ücretleri ${fees.join(', ')}`,
    );
    assert.ok(Math.abs(fees.reduce((sum, fee) => sum + fee, 0) - deal.lastFee!) < 1e-6);
    assert.ok(new Set(fees.map((fee) => Math.round(fee))).size > 1, 'her mağaza aynı ücreti gösteriyor');
  });

  test('terminalin topladığı ücret sözleşme bitince de kalıyor (Codex #86)', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    for (let i = 0; i < 3; i++) marketDay(state);
    const earned = deal.earned!;
    assert.ok(earned > 0);
    assert.ok(Math.abs((terminal.freightEarned ?? 0) - earned) < 1e-6, `terminal ${terminal.freightEarned} · sözleşme ${earned}`);
    assert.ok(engine.dispatch({ type: 'CANCEL_FREIGHT', contractId: deal.id }).ok);
    state.freight!.lastOfferDay = state.time.day + 1_000;
    marketDay(state);
    assert.ok(Math.abs((terminal.freightEarned ?? 0) - earned) < 1e-6, 'bitince toplanan sıfırlandı');
  });

  test('sözleşme rakibi ucuzlatıyor, oyuncuya para getiriyor (aynı gün, sözleşmeli ve sözleşmesiz)', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    const without = JSON.parse(JSON.stringify(state)) as GameState;
    without.freight!.offers = [];
    assert.ok(engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: offer.id }).ok);
    for (let day = 0; day < 5; day++) {
      marketDay(state);
      marketDay(without);
    }
    const unitCost = (world: GameState): number => {
      let cogs = 0;
      let units = 0;
      for (const id of offer.outletIds) {
        cogs += world.buildings[id]!.last.cogs;
        units += world.buildings[id]!.last.unitsSold;
      }
      return cogs / units;
    };
    assert.ok(unitCost(state) < unitCost(without), `birim maliyet ${unitCost(state)} / ${unitCost(without)}`);
    assert.ok(state.freight!.contracts[0]!.earned! > 0);
  });

  test('filo dolunca yeni teklif gelmiyor; kabul filoyu aşmıyor', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    const fleet = BUILDING_BY_ID[TERMINAL]!.fleet!;
    // Filoyu bir kamyon boş kalacak kadar doldur: bir mağaza filoda birden çok kez.
    const client = freightProspects(state, terminal)[0]!;
    state.freight = {
      offers: [],
      contracts: [
        {
          id: 'fr0',
          companyId: client.companyId,
          terminalId: terminal.id,
          outletIds: Array.from({ length: fleet - 1 }, () => client.id),
          durationDays: 120,
          offeredDay: 0,
          estimate: 1,
          acceptedDay: 0,
          endDay: 999,
        },
      ],
      nextId: 1,
      lastOfferDay: -100,
      declined: {},
      earnedTotal: 0,
    };
    const rng = state.rng.s;
    state.time.day += 1;
    runFreightTick(state);
    assert.equal(state.freight.offers.length, 0, 'dolu filoya teklif');
    assert.equal(state.rng.s, rng, 'dolu filoda zar atılmıyor');
  });

  test('ret: teklif düşüyor, aynı rakip bir süre teklif getirmiyor', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    assert.ok(engine.dispatch({ type: 'DECLINE_FREIGHT', offerId: offer.id }).ok);
    assert.equal(state.freight!.offers.length, 0);
    assert.equal(state.freight!.declined[offer.companyId], state.time.day);
    for (let i = 0; i < FREIGHT.declineCooldownDays - 1; i++) {
      state.time.day += 1;
      runFreightTick(state);
      assert.ok(
        state.freight!.offers.every((o) => o.companyId !== offer.companyId),
        'reddeden rakip yeniden geldi',
      );
    }
    assert.equal(engine.dispatch({ type: 'DECLINE_FREIGHT', offerId: offer.id }).ok, false);
  });

  test('teklifin süresi dolunca sessizce düşüyor', () => {
    const state = fresh().getState();
    placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    state.freight!.lastOfferDay = state.time.day + 1_000; // yeni teklif gelmesin
    state.time.day = offer.offeredDay + FREIGHT.offerLifetimeDays;
    runFreightTick(state);
    assert.equal(state.freight!.offers.length, 0);
  });

  test('iptal: cayma bedeli oyuncudan müşteriye', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    const offer = state.freight!.offers[0]!;
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: offer.id });
    const deal = state.freight!.contracts[0]!;
    const me = state.companies[state.playerCompanyId]!;
    const client = state.companies[deal.companyId]!;
    const [cash, clientCash] = [me.cash, client.cash];
    assert.ok(engine.dispatch({ type: 'CANCEL_FREIGHT', contractId: deal.id }).ok);
    assert.equal(state.freight!.contracts.length, 0);
    assert.equal(me.cash, cash - freightPenalty(deal));
    assert.equal(client.cash, clientCash + freightPenalty(deal));
    assert.equal(freightPenalty(deal), Math.round(deal.estimate * FREIGHT.cancelPenaltyDays));
  });

  test('müşteri devralındıktan sonra bitirmek bedelsiz: sözleşme zaten geçersiz (Codex #86)', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    // Gün sonunda devralma (taşıma adımından sonra): mağazalar oyuncunun, şirket yok.
    for (const id of deal.outletIds) state.buildings[id]!.companyId = state.playerCompanyId;
    delete state.companies[deal.companyId];
    const cash = state.companies[state.playerCompanyId]!.cash;
    assert.ok(engine.dispatch({ type: 'CANCEL_FREIGHT', contractId: deal.id }).ok);
    assert.equal(state.freight!.contracts.length, 0);
    assert.equal(state.companies[state.playerCompanyId]!.cash, cash, 'devralınan müşteriye bedel ödendi');
  });

  test('terminali yıkıp aynı gün bitirmek bedelden kurtarmıyor', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    const client = state.companies[deal.companyId]!;
    const clientCash = client.cash;
    assert.ok(demolish(state, state.playerCompanyId, terminal.tileId).ok);
    assert.ok(engine.dispatch({ type: 'CANCEL_FREIGHT', contractId: deal.id }).ok);
    assert.equal(client.cash, clientCash + freightPenalty(deal));
  });

  test('terminal yıkılınca sözleşme bozuluyor ve bedel ödeniyor; teklifleri de düşüyor', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    const client = state.companies[deal.companyId]!;
    const clientCash = client.cash;
    assert.ok(demolish(state, state.playerCompanyId, terminal.tileId).ok);
    // Yıkıldığı gün indirim de ücret de yok.
    assert.equal(distributionRelief(state, state.buildings[deal.outletIds[0]!]!), 0);
    state.time.day += 1;
    runFreightTick(state);
    assert.equal(state.freight!.contracts.length, 0);
    assert.equal(client.cash, clientCash + freightPenalty(deal));
  });

  test('mağaza kapanınca ya da el değiştirince sözleşmeden bedelsiz çıkıyor; mağaza kalmayınca sözleşme bitiyor', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    const [first, second, ...rest] = deal.outletIds;
    const estimate = deal.estimate;
    // Biri yıkılıyor, biri oyuncuya geçiyor.
    const gone = state.buildings[first!]!;
    state.map.tiles[gone.tileId]!.buildingId = null;
    delete state.buildings[first!];
    state.buildings[second!]!.companyId = state.playerCompanyId;
    const cash = state.companies[state.playerCompanyId]!.cash;
    state.time.day += 1;
    runFreightTick(state);
    assert.deepEqual(state.freight!.contracts[0]?.outletIds ?? [], rest);
    if (rest.length > 0) assert.ok(state.freight!.contracts[0]!.estimate < estimate);
    for (const id of rest) state.buildings[id]!.companyId = state.playerCompanyId;
    state.time.day += 1;
    runFreightTick(state);
    assert.equal(state.freight!.contracts.length, 0);
    assert.equal(state.companies[state.playerCompanyId]!.cash, cash, 'bedel kesilmedi');
  });

  test('süre dolunca sözleşme bitiyor, ücret toplamı haberde', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    state.freight!.lastOfferDay = deal.endDay! + 1_000;
    state.time.day = deal.endDay! - 1;
    marketDay(state);
    assert.equal(state.freight!.contracts.length, 0);
    assert.ok(deal.earned! > 0);
    assert.equal(state.news[0]!.tone, 'good');
  });

  test('kamyonlar: sözleşmedeki rakip mağazalarına terminalden, oyuncunun bacağı', () => {
    const engine = fresh();
    const state = engine.getState();
    const terminal = placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const deal = state.freight!.contracts[0]!;
    const legs = supplyRoutes(state, state.playerCompanyId).filter((leg) => leg.fromTileId === terminal.tileId);
    const targets = new Set(legs.filter((leg) => leg.companyId === state.playerCompanyId).map((leg) => leg.toTileId));
    for (const id of deal.outletIds) assert.ok(targets.has(state.buildings[id]!.tileId), `${id} için kamyon yok`);
  });

  test('kamyon indirimi veren depodan çıkıyor: yakın depo ve uzak terminal menzildeyse terminal (Codex #86)', () => {
    const state = fresh().getState();
    const me = state.playerCompanyId;
    const company = state.companies[me]!;
    company.cash += 5_000_000;
    company.netWorth += 5_000_000;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const free = state.map.tiles.filter((t) => t.kind === 'plot' && !t.structureId && !t.buildingId && !purchaseBlocker(state, t.id));
    // Kamyonu gelen kendi mağazası; 5–10 karede terminal, ondan yakın (8 kare içinde) depo.
    const served = new Set(
      supplyRoutes(state, me)
        .filter((leg) => leg.companyId === me && leg.kind === 'delivery')
        .map((leg) => leg.toTileId),
    );
    let pick: { outlet: BuildingInstance; terminal: number; depot: number } | null = null;
    for (const outlet of Object.values(state.buildings)) {
      if (pick) break;
      if (outlet.companyId !== me || BUILDING_BY_ID[outlet.defId]?.role !== 'outlet' || !served.has(outlet.tileId)) continue;
      const o = state.map.tiles[outlet.tileId]!;
      for (const far of free) {
        const d = dist(far, o);
        if (d < 5 || d > BUILDING_BY_ID[TERMINAL]!.radius) continue;
        const near = free.find((t) => t.id !== far.id && dist(t, o) < d && dist(t, o) <= 8);
        if (near) {
          pick = { outlet, terminal: far.id, depot: near.id };
          break;
        }
      }
    }
    assert.ok(pick, 'uygun mağaza ve parsel yok');
    assert.ok(buyTile(state, me, pick.terminal).ok && build(state, me, pick.terminal, TERMINAL).ok);
    assert.ok(buyTile(state, me, pick.depot).ok && build(state, me, pick.depot, 'warehouse').ok);
    assert.equal(ownDepotRelief(state, pick.outlet), 0.35, 'indirim terminalden');
    const legs = supplyRoutes(state, me).filter((leg) => leg.kind === 'delivery' && leg.toTileId === pick!.outlet.tileId);
    assert.ok(legs.length > 0);
    assert.ok(
      legs.every((leg) => leg.fromTileId === pick!.terminal),
      `kamyon ${legs.map((leg) => leg.fromTileId).join(',')} · terminal ${pick.terminal} · depo ${pick.depot}`,
    );
  });

  test('yapı menüsünün taşıma potansiyeli teklif ve sözleşmeyle güncel (Codex #86)', () => {
    const state = fresh().getState();
    const terminal = placeTerminal(state);
    const radius = BUILDING_BY_ID[TERMINAL]!.radius;
    // Kurulu terminalin yanında boş bir parsel: aynı rakip mağazaları menzilde.
    const at = state.map.tiles[terminal.tileId]!;
    const site = state.map.tiles.find((t) => t.kind === 'plot' && !t.structureId && !t.buildingId && Math.abs(t.x - at.x) + Math.abs(t.y - at.y) <= 2)!;
    assert.ok(site, 'yakın parsel yok');
    const before = indirectEstimate(state, state.playerCompanyId, TERMINAL, site.districtId, site.id)!.freight!;
    assert.ok(before.outlets > 2, `${before.outlets} mağaza`);
    // Aynı hafta, bina değişmeden: kurulu terminale bir teklif gelip mağazaları tutuyor.
    const held = freightProspects(state, terminal)
      .filter((o) => {
        const t = state.map.tiles[o.tileId]!;
        return Math.abs(t.x - site.x) + Math.abs(t.y - site.y) <= radius;
      })
      .slice(0, 2);
    state.freight = {
      offers: [
        {
          id: 'fr9',
          companyId: held[0]!.companyId,
          terminalId: terminal.id,
          outletIds: held.map((o) => o.id),
          durationDays: 120,
          offeredDay: state.time.day,
          estimate: 1,
        },
      ],
      contracts: [],
      nextId: 10,
      lastOfferDay: state.time.day,
      declined: {},
      earnedTotal: 0,
    };
    const after = indirectEstimate(state, state.playerCompanyId, TERMINAL, site.districtId, site.id)!.freight!;
    assert.equal(after.outlets, before.outlets - held.length, 'teklifteki mağazalar hâlâ potansiyelde');
  });

  test('komutlar oyunun komutu: tanınmayan teklif ve sözleşme reddediliyor', () => {
    const engine = fresh();
    assert.equal(engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: 'fr99' }).ok, false);
    assert.equal(engine.dispatch({ type: 'CANCEL_FREIGHT', contractId: 'fr99' }).ok, false);
  });

  test('kayıt: taşıma durumu JSON ile gidip geliyor', () => {
    const engine = fresh();
    const state = engine.getState();
    placeTerminal(state);
    awaitOffer(state);
    engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: state.freight!.offers[0]!.id });
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    assert.deepEqual(copy.freight, state.freight);
    marketDay(state);
    marketDay(copy);
    assert.equal(copy.freight!.earnedTotal, state.freight!.earnedTotal);
  });
});
