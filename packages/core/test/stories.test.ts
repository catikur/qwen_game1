import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, BUILDING_BY_ID, CAMPAIGN, CARD_BY_ID, CARD_TIMING, CATEGORIES, NPC_PROFILES } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { getPlayer } from '../src/selectors';
import { agenda } from '../src/agenda';
import { build, demolish } from '../src/actions';
import { createLeagueGame, replayRun, runFromState } from '../src/league';
import { boostMultiplier, cardAmount, chooseCard, runCardTick, settleCardAway } from '../src/systems/cards';
import { campaignPriceFactor, effectivePriceMultiplier, rivalQuote, runRivalryTick } from '../src/systems/rivalry';
import { competitionCards } from '../src/competition';
import type { CardState, CompanyState, GameState } from '../src/types';
import { playerStrategy } from './proxy';

/** Vekil oyuncuyla `days` gün; kart gelirse ilk seçeneği seçen ya da bekleyen. */
function play(seed: number, days: number, answer: boolean): GameEngine {
  const engine = new GameEngine(createNewGame({ seed }));
  for (let day = 1; day <= days; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    const card = engine.getState().card;
    if (answer && card) engine.dispatch({ type: 'CHOOSE_CARD', choiceId: CARD_BY_ID[card.defId]!.choices[0]!.id });
    engine.runDay();
  }
  return engine;
}

function putCard(state: GameState, defId: string, extra: Partial<CardState> = {}): CardState {
  const card: CardState = {
    defId,
    offeredDay: state.time.day,
    deadlineDay: state.time.day + CARD_TIMING.lifetimeDays,
    amount: 100_000,
    ...extra,
  };
  state.card = card;
  return card;
}

describe('karar kartları', () => {
  test('normal oyunda kart geliyor, süre dolunca varsayılan uygulanıyor ve haber oluyor', () => {
    const engine = play(7, 260, false);
    const state = engine.getState();
    assert.ok((state.recentCards?.length ?? 0) > 0, 'hiç kart kapanmadı');
    const expired = state.news.filter((item) => item.body.includes('Süre doldu'));
    assert.ok(expired.length > 0, 'süresi dolan kartın haberi yok');
  });

  test('tutar kâr eğiliminden, taban ve tavanla', () => {
    assert.equal(cardAmount(createNewGame({ seed: 3 })), CARD_TIMING.amountMin, 'binasız şirket tabanda');
    const state = play(3, 40, false).getState();
    const own = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId);
    assert.ok(own.length > 0);
    for (const building of own) building.profitTrend = 0;
    own[0]!.profitTrend = 10_000_000;
    assert.equal(cardAmount(state), CARD_TIMING.amountMax);
    own[0]!.profitTrend = 200_000;
    assert.equal(cardAmount(state), Math.round((200_000 * CARD_TIMING.amountDays) / 1000) * 1000);
  });

  test('seçim nakdi ve süreli çekiciliği uyguluyor; etki kategoriye özel ve süresi bitiyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 5 }));
    const state = engine.getState();
    const player = getPlayer(state);
    const cash = player.cash;
    putCard(state, 'viral_video', { category: 'retail' });
    assert.ok(engine.dispatch({ type: 'CHOOSE_CARD', choiceId: 'campaign' }).ok);
    assert.equal(state.card, undefined);
    assert.equal(player.cash, cash - 100_000);
    assert.ok(Math.abs(boostMultiplier(state, player.id, 'attraction', 'retail') - 1.2) < 1e-9);
    assert.equal(boostMultiplier(state, player.id, 'attraction', 'dining'), 1);
    assert.equal(boostMultiplier(state, player.id, 'upkeep'), 1);
    assert.ok(state.news[0]!.body.includes('Bedel'));
    // Gün arasında seçildi: etki yarından başlıyor ve tam 30 pazar günü sürüyor.
    const chosenDay = state.time.day;
    let active = 0;
    for (let day = chosenDay + 1; day <= chosenDay + 40; day++) {
      state.time.day = day;
      if (boostMultiplier(state, player.id, 'attraction', 'retail') > 1) active++;
    }
    assert.equal(active, 30);
    runCardTick(state);
    assert.equal(player.boosts, undefined, 'biten etki temizlendi');
  });

  test('sendika kartı baskıyı düşürüyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 5 }));
    const state = engine.getState();
    const player = getPlayer(state);
    player.labor = { policy: 'market', pressure: 0.6, agreement: 1 };
    putCard(state, 'union_lunch');
    assert.ok(chooseCard(state, 'bonus').ok);
    assert.ok(Math.abs(player.labor.pressure - 0.25) < 1e-9);
  });

  test('bakım kartı defterdeki bakımı düşürüyor', () => {
    const base = play(11, 120, false);
    const boosted = new GameEngine(structuredClone(base.getState()));
    const plain = new GameEngine(structuredClone(base.getState()));
    const state = boosted.getState();
    delete state.card;
    delete plain.getState().card;
    getPlayer(state).boosts = [{ target: 'upkeep', multiplier: 0.5, untilDay: state.time.day + 10, cardId: 'pos_system' }];
    boosted.runDay();
    plain.runDay();
    const a = getPlayer(boosted.getState()).today.upkeep;
    const b = getPlayer(plain.getState()).today.upkeep;
    assert.ok(b > 0);
    assert.ok(Math.abs(a / b - 0.5) < 0.02, `${a} / ${b}`);
  });

  test('mal indirimi raftaki mala: kiralık binanın maliyeti değişmiyor', () => {
    const base = play(11, 120, false);
    const state = base.getState();
    delete state.card;
    getPlayer(state).cash += 50_000_000;
    const built = state.map.tiles.some((tile) => {
      if (tile.kind !== 'plot' || tile.ownerId || tile.structureId) return false;
      if (!base.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) return false;
      return base.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'apartment' }).ok;
    });
    assert.ok(built, 'kiralık kurulamadı');
    const boosted = new GameEngine(structuredClone(state));
    const plain = new GameEngine(structuredClone(state));
    getPlayer(boosted.getState()).boosts = [
      { target: 'cogs', multiplier: 0.5, untilDay: state.time.day + 10, cardId: 'bulk_supplier' },
    ];
    boosted.runDay();
    plain.runDay();
    const cogs = (engine: GameEngine, role: string): number =>
      Object.values(engine.getState().buildings)
        .filter((b) => b.companyId === engine.getState().playerCompanyId && BUILDING_BY_ID[b.defId]?.role === role)
        .reduce((total, b) => total + b.last.cogs, 0);
    assert.ok(cogs(plain, 'rental') > 0);
    assert.equal(cogs(boosted, 'rental'), cogs(plain, 'rental'));
    assert.ok(cogs(boosted, 'outlet') < cogs(plain, 'outlet') * 0.8, `${cogs(boosted, 'outlet')} / ${cogs(plain, 'outlet')}`);
  });

  test('şanslı seçenek aynı durumda aynı sonucu veriyor', () => {
    const outcomes = [1, 2].map(() => {
      const state = createNewGame({ seed: 8 });
      state.time.day = 90;
      putCard(state, 'storm_warning');
      const cash = getPlayer(state).cash;
      chooseCard(state, 'risk');
      return getPlayer(state).cash - cash;
    });
    assert.equal(outcomes[0], outcomes[1]);
  });

  test('bilinmeyen seçenek ve boş masa reddediliyor', () => {
    const state = createNewGame({ seed: 5 });
    assert.equal(chooseCard(state, 'campaign').ok, false);
    putCard(state, 'viral_video', { category: 'retail' });
    assert.equal(chooseCard(state, 'yok').ok, false);
    assert.ok(state.card);
  });

  test('bayrak kapalıyken kart yok ve süren etki kalkıyor', () => {
    const state = createNewGame({ seed: 5 });
    const player = getPlayer(state);
    player.boosts = [{ target: 'attraction', multiplier: 1.2, untilDay: 999, cardId: 'festival_sponsor' }];
    putCard(state, 'festival_sponsor');
    state.flags.cards = false;
    assert.equal(boostMultiplier(state, player.id, 'attraction'), 1);
    runCardTick(state);
    assert.equal(state.card, undefined);
    assert.equal(agenda(state).some((item) => item.kind === 'card'), false);
  });

  test('gündemde karar kalemi geri sayıyla', () => {
    const state = createNewGame({ seed: 5 });
    putCard(state, 'poached_manager', { rivalId: Object.values(state.companies).find((c) => !c.isPlayer)!.id });
    const item = agenda(state).find((entry) => entry.kind === 'card');
    assert.ok(item);
    assert.equal(item.daysLeft, CARD_TIMING.lifetimeDays);
    assert.ok(!item.label.includes('{rival}'), item.label);
  });

  test('süresi dolan kartın etkisi de tam süre: gün adımında, pazardan önce başlıyor', () => {
    const state = createNewGame({ seed: 5 });
    state.time.day = 100;
    putCard(state, 'viral_video', { category: 'retail', offeredDay: 80, deadlineDay: 99 });
    runCardTick(state);
    assert.equal(state.card, undefined);
    const player = getPlayer(state);
    let active = 0;
    for (let day = 100; day <= 130; day++) {
      state.time.day = day;
      if (boostMultiplier(state, player.id, 'attraction', 'retail') > 1) active++;
    }
    assert.equal(active, 12, 'varsayılan "kendi haline bırak" 12 gün');
  });

  test('rakip kart masadayken oyundan çıksa da metin dolu kalıyor', () => {
    const state = createNewGame({ seed: 5 });
    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    putCard(state, 'poached_manager', { rivalId: rival.id, rivalName: rival.name, ceoName: 'Deniz Arkın' });
    delete state.companies[rival.id];
    const label = agenda(state).find((entry) => entry.kind === 'card')!.label;
    assert.ok(label.includes(rival.name) && !label.includes('{'), label);
    chooseCard(state, 'counter');
    assert.ok(!state.news[0]!.body.includes('{') && state.news[0]!.body.includes('Deniz Arkın'), state.news[0]!.body);
  });

  test('bina tahmini yeni kart üretmiyor, süren kart etkisini koruyor', async () => {
    const { projectBuilding } = await import('../src/projection');
    const state = play(7, 80, false).getState();
    const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId);
    assert.ok(tile);
    const player = getPlayer(state);
    delete player.boosts;
    const ask = () => projectBuilding(state, state.playerCompanyId, 'corner_shop', tile.id, 120)!;

    // Pencerede kesin bir kart (süresi dolunca Perakende'ye +%7) ve ardından
    // yenisi: izdüşüm ikisini de görmüyor — kartsız durumla aynı cevap.
    putCard(state, 'viral_video', { category: 'retail', deadlineDay: state.time.day + 3 });
    state.nextCardDay = state.time.day + 5;
    const withCard = ask();
    delete state.card;
    state.nextCardDay = Number.MAX_SAFE_INTEGER;
    const quiet = ask();
    assert.deepEqual(withCard, quiet);

    // Süren etki (bakım −%50) ise bugünü etkiliyor: yeni bakkalın kârı daha yüksek çıkıyor.
    player.boosts = [{ target: 'upkeep', multiplier: 0.5, untilDay: state.time.day + 500, cardId: 'pos_system' }];
    const boosted = ask();
    assert.ok(boosted.finalProfit > quiet.finalProfit, `${boosted.finalProfit} > ${quiet.finalProfit}`);
    // Kaynak durumun kartına ve bayrağına dokunulmuyor.
    assert.notEqual(state.flags.cards, false);
  });

  test('uzaktaki şehirde yerel müdür varsayılanı seçiyor', () => {
    const state = createNewGame({ seed: 5 });
    putCard(state, 'storm_warning');
    settleCardAway(state);
    assert.equal(state.card, undefined);
    assert.ok(state.news[0]!.body.includes('Yerel müdür'));
  });

  test('lig: kart seçimleri günlüğe giriyor ve tekrar aynı skoru veriyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W40', 'Kart AŞ', null));
    let chosen = 0;
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      if (state.card) {
        const def = CARD_BY_ID[state.card.defId]!;
        if (engine.dispatch({ type: 'CHOOSE_CARD', choiceId: def.choices[0]!.id }).ok) chosen++;
      }
      engine.runDay();
    }
    assert.ok(chosen > 0, 'ligde hiç kart seçilmedi');
    const run = runFromState(engine.getState())!;
    assert.ok(run.log.some(([, command]) => command.type === 'CHOOSE_CARD'));
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});

describe('rakip hikâyeleri', () => {
  /** Rakibe kategoride gerçek bir mağaza aç: kampanya yalnız rafı olan rakiple sürüyor. */
  function openOutlet(state: GameState, company: CompanyState, category: CategoryId): string {
    const def = BUILDINGS.find((b) => b.role === 'outlet' && b.category === category)!;
    company.cash += 100_000_000;
    for (const tile of state.map.tiles) {
      if (tile.kind !== 'plot' || tile.ownerId || tile.structureId) continue;
      tile.ownerId = company.id;
      if (build(state, company.id, tile.id, def.id).ok) return tile.buildingId!;
      tile.ownerId = null;
    }
    throw new Error(`${category} mağazası açılamadı`);
  }

  function rival(state: GameState, trait: string): CompanyState {
    const profile = NPC_PROFILES.find((p) => p.trait === trait)!;
    return Object.values(state.companies).find((c) => c.profileId === profile.id) ?? Object.values(state.companies).find((c) => !c.isPlayer)!;
  }

  test('CEO kişiliğine göre konuşuyor; oyuncu ve kapalı bayrakta söz yok', () => {
    const state = createNewGame({ seed: 5 });
    const company = Object.values(state.companies).find((c) => !c.isPlayer)!;
    const quote = rivalQuote(state, company, 'overtook');
    assert.ok(quote && quote.includes('“'), String(quote));
    assert.equal(rivalQuote(state, company, 'overtook'), quote, 'aynı gün aynı söz');
    assert.ok(rivalQuote(state, company, 'passed', {}, 60), 'soğuma ilk sözü engellemiyor');
    assert.equal(rivalQuote(state, company, 'passed', {}, 60), null, 'soğuma ikinci sözü susturuyor');
    assert.equal(rivalQuote(state, getPlayer(state), 'overtook'), null);
    state.flags.rivalStories = false;
    assert.equal(rivalQuote(state, company, 'overtook'), null);
  });

  test('kampanya: başlıyor, fiyat kırıyor, bitince kazanan ilan ediliyor', () => {
    const state = createNewGame({ seed: 5 });
    const player = getPlayer(state);
    const category: CategoryId = 'retail';
    player.marketShare[category] = 0.4;
    const attacker = rival(state, 'price_cutter');
    attacker.marketShare[category] = 0.3;
    openOutlet(state, attacker, category);
    state.time.day = 200;
    state.nextCampaignDay = 200;
    runRivalryTick(state);
    const campaign = state.campaign;
    assert.ok(campaign, 'kampanya başlamadı');
    assert.equal(campaign.category, category);
    assert.equal(campaign.companyId, attacker.id);
    assert.equal(state.news[0]!.companyId, attacker.id);
    assert.ok(state.news[0]!.title.includes(CATEGORIES[category].name));
    assert.equal(campaignPriceFactor(state, attacker.id, category), CAMPAIGN.priceCut.price_cutter);
    assert.equal(campaignPriceFactor(state, attacker.id, 'dining'), 1);
    assert.equal(campaignPriceFactor(state, player.id, category), 1);
    assert.ok(agenda(state).some((item) => item.kind === 'campaign'));

    // Oyuncu payını korudu: geri püskürtüldü, marka güçlendi.
    const brand = player.brand[category] ?? 0;
    state.time.day = campaign.endDay;
    runRivalryTick(state);
    assert.equal(state.campaign, undefined);
    assert.equal(state.news[0]!.tone, 'good');
    assert.ok((player.brand[category] ?? 0) > brand);
    assert.ok((state.nextCampaignDay ?? 0) >= campaign.endDay + CAMPAIGN.gapDays[0]);
  });

  test('kampanya: pay düştüyse rakip kazanıyor', () => {
    const state = createNewGame({ seed: 6 });
    const player = getPlayer(state);
    player.marketShare.dining = 0.5;
    const attacker = rival(state, 'expansionist');
    attacker.marketShare.dining = 0.2;
    openOutlet(state, attacker, 'dining');
    state.time.day = 300;
    state.nextCampaignDay = 300;
    runRivalryTick(state);
    assert.ok(state.campaign);
    player.marketShare.dining = 0.3;
    state.time.day = state.campaign.endDay;
    runRivalryTick(state);
    assert.equal(state.news[0]!.tone, 'bad');
  });

  test('oyuncunun güçlü kategorisi yoksa kampanya açılmıyor; bayrak kapalıyken hiç yok', () => {
    const state = createNewGame({ seed: 5 });
    state.time.day = 200;
    state.nextCampaignDay = 200;
    runRivalryTick(state);
    assert.equal(state.campaign, undefined);
    assert.equal(state.nextCampaignDay, 214);

    // Oyuncu güçlü ama kategoride hiçbir rakip satış yapmıyor: saldıracak kimse yok, kampanya bekliyor.
    const empty = createNewGame({ seed: 5 });
    getPlayer(empty).marketShare.retail = 0.5;
    for (const company of Object.values(empty.companies)) if (!company.isPlayer) company.marketShare.retail = 0;
    empty.time.day = 200;
    empty.nextCampaignDay = 200;
    runRivalryTick(empty);
    assert.equal(empty.campaign, undefined);
    assert.equal(empty.nextCampaignDay, 214);

    const off = createNewGame({ seed: 5 });
    getPlayer(off).marketShare.retail = 0.5;
    off.flags.rivalStories = false;
    off.time.day = 200;
    off.nextCampaignDay = 200;
    runRivalryTick(off);
    assert.equal(off.campaign, undefined);
  });

  test('kampanya: saldıran kategorideki son mağazasını kapatınca bitiyor, ödül yok', () => {
    const state = createNewGame({ seed: 5 });
    const player = getPlayer(state);
    player.marketShare.retail = 0.4;
    const attacker = rival(state, 'price_cutter');
    attacker.marketShare.retail = 0.3;
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === attacker.id && BUILDING_BY_ID[building.defId]?.category === 'retail') {
        demolish(state, attacker.id, building.tileId);
      }
    }
    const shop = openOutlet(state, attacker, 'retail');
    state.time.day = 200;
    state.nextCampaignDay = 200;
    runRivalryTick(state);
    assert.ok(state.campaign);
    const brand = player.brand.retail ?? 0;
    demolish(state, attacker.id, state.buildings[shop]!.tileId);
    state.time.day = 210;
    runRivalryTick(state);
    assert.equal(state.campaign, undefined);
    assert.equal(state.news[0]!.tone, 'neutral');
    assert.ok(state.news[0]!.title.includes(attacker.name));
    assert.equal(player.brand.retail ?? 0, brand, 'çekilen rakibe karşı sadakat markası yok');
    assert.equal(state.nextCampaignDay, 210 + CAMPAIGN.gapDays[0]);
  });

  test('kampanyadaki rakibin indirimli fiyatı rekabet panelinde ve binada görünüyor', () => {
    const state = play(7, 120, false).getState();
    delete state.card;
    const player = getPlayer(state);
    const category = competitionCards(state, player.id)[0]!.category;
    const attacker = rival(state, 'price_cutter');
    const shopId = openOutlet(state, attacker, category);
    attacker.marketShare[category] = 0.95;
    const shop = state.buildings[shopId]!;
    const before = competitionCards(state, player.id).find((card) => card.category === category)!.leader!;
    assert.equal(before.companyId, attacker.id);
    assert.equal(effectivePriceMultiplier(state, shop), shop.priceMultiplier);

    state.campaign = { companyId: attacker.id, category, startDay: state.time.day, endDay: state.time.day + 45, playerShare: 0.3 };
    const factor = campaignPriceFactor(state, attacker.id, category);
    assert.ok(factor < 1);
    assert.equal(effectivePriceMultiplier(state, shop), shop.priceMultiplier * factor);
    const during = competitionCards(state, player.id).find((card) => card.category === category)!.leader!;
    assert.ok(Math.abs(during.price - before.price * factor) < 1e-9, `${during.price} / ${before.price}`);
    // Oyuncunun kendi fiyatı kampanyadan etkilenmiyor.
    const own = Object.values(state.buildings).find((b) => b.companyId === player.id && BUILDING_BY_ID[b.defId]?.category === category)!;
    assert.equal(effectivePriceMultiplier(state, own), own.priceMultiplier);
  });

  test('bina tahmini süren kampanyayı görüyor; rakipler donukken yeni kampanya yok', async () => {
    const { projectBuilding } = await import('../src/projection');
    const state = play(7, 120, false).getState();
    delete state.card;
    state.nextCardDay = Number.MAX_SAFE_INTEGER;
    const player = getPlayer(state);
    const category = competitionCards(state, player.id)[0]!.category;
    const attacker = rival(state, 'price_cutter');
    const shop = state.buildings[openOutlet(state, attacker, category)]!;
    const def = BUILDINGS.find((b) => b.role === 'outlet' && b.category === category)!;
    const tile = state.map.tiles.find(
      (t) => t.districtId === shop.districtId && t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId,
    )!;
    assert.ok(tile, 'aynı bölgede boş parsel yok');
    const ask = () => projectBuilding(state, player.id, def.id, tile.id, 60)!;
    const quiet = ask();
    state.campaign = { companyId: attacker.id, category, startDay: state.time.day, endDay: state.time.day + 45, playerShare: 0.3 };
    const attacked = ask();
    // Yön kategoriye göre değişiyor (saldırı altındaki kategoride yeni mağazanın
    // marjinal değeri); önemli olan tahminin bugünkü fiyat savaşını görmesi.
    assert.notDeepEqual(attacked, quiet, 'tahmin kampanyayı görmüyor');
    assert.ok(state.campaign, 'kaynak durumun kampanyası yerinde');

    // Rakipler donuk (npcCompetition kapalı): süren kampanya indirimiyle sürüyor, bitince yenisi açılmıyor.
    state.flags.npcCompetition = false;
    runRivalryTick(state);
    assert.ok(state.campaign);
    assert.ok(campaignPriceFactor(state, attacker.id, category) < 1);
    state.time.day = state.campaign.endDay;
    runRivalryTick(state);
    assert.equal(state.campaign, undefined);
    state.time.day = state.nextCampaignDay!;
    player.marketShare[category] = 0.5;
    runRivalryTick(state);
    assert.equal(state.campaign, undefined, 'rakipler donukken yeni kampanya');
  });

  test('uzun oyunda kampanya ve sözlü haberler çıkıyor', () => {
    const state = play(1, 560, true).getState();
    const quoted = state.news.filter((item) => item.companyId && item.body.includes('“'));
    assert.ok(quoted.length > 0, 'sözlü rakip haberi yok');
    assert.ok(state.campaign !== undefined || state.nextCampaignDay !== undefined);
  });
});
