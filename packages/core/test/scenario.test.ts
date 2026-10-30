import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CEOS, SCENARIOS, SCENARIO_BY_ID, TRADE_LINE } from '@capital/content';
import { formatMoney } from '../src/format';
import type { ScenarioDef } from '@capital/content';
import { GameEngine } from '../src/engine';
import { agenda } from '../src/agenda';
import { openCityQuote } from '../src/holding';
import { createScenarioGame, startScenario } from '../src/scenario';
import { getPlayer } from '../src/selectors';
import {
  chainGoalStatus,
  freightGoalStatus,
  holdingCities,
  rentalGoalStatus,
  leadRatio,
  rivalsLeft,
  playerRank,
  runScenarioTick,
  scenarioProgress,
  scenarioProjectGap,
  scenarioScoreText,
  starsFor,
} from '../src/systems/scenario';
import { floorTo, scenarioGoalText } from '../src/systems/scenarioText';
import { loanQuote } from '../src/systems/credit';
import { stanceOf } from '../src/systems/relations';
import { rentalOutlook } from '../src/systems/realestate';
import { isDistrictOpen, isPurchasable } from '../src/systems/city';
import { tradeProfitToday } from '../src/systems/trade';
import { build, buyTile } from '../src/actions';
import { createNewGame } from '../src/worldgen';
import { TOTAL_SHARES, sharesHeld } from '../src/systems/equity';
import type { GameState } from '../src/types';

/**
 * Senaryo modu (Tur 39). Ön tarih senaryo başına bir kez koşuyor; her test
 * kopyasıyla çalışıyor.
 */
const fixtures = new Map<string, string>();
function scenario(id: string): GameState {
  if (!fixtures.has(id)) fixtures.set(id, JSON.stringify(createScenarioGame(id, { companyName: 'Senaryo AŞ' })));
  return JSON.parse(fixtures.get(id)!) as GameState;
}

function started(id: string): GameEngine {
  const engine = new GameEngine(scenario(id));
  assert.ok(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' }).ok);
  return engine;
}

/**
 * Senaryonun şehrinde bir arsa alıp binayı kurar (hedef testleri için).
 * Boş arsa yoksa yapılı arsa (Zincir ustası: sanayide boş arsa kalmamış).
 */
function buildOn(engine: GameEngine, defId: string, archetypes?: string[]): string {
  const state = engine.getState();
  const open = state.map.tiles.filter(
    (candidate) =>
      candidate.kind === 'plot' &&
      !candidate.ownerId &&
      !candidate.buildingId &&
      isDistrictOpen(state, candidate.districtId) &&
      (!archetypes || archetypes.includes(state.districts[candidate.districtId]!.archetype)),
  );
  const tile = open.find((candidate) => !candidate.structureId) ?? open[0];
  assert.ok(tile, `${defId}: arsa`);
  const bought = engine.dispatch(tile.structureId ? { type: 'BUYOUT_TILE', tileId: tile.id } : { type: 'BUY_TILE', tileId: tile.id });
  assert.ok(bought.ok, `${defId}: ${bought.ok ? '' : bought.reason}`);
  const result = engine.dispatch({ type: 'BUILD', tileId: tile.id, defId });
  assert.ok(result.ok, `${defId}: ${result.ok ? '' : result.reason}`);
  return state.map.tiles[tile.id]!.buildingId!;
}

function rivalWorths(state: GameState): string {
  return Object.values(state.companies)
    .filter((company) => !company.isPlayer)
    .map((company) => `${company.id}:${Math.round(company.netWorth)}`)
    .join(',');
}

describe('senaryo modu', () => {
  test('her senaryo kuruluyor: ön tarih, taze şirket, duraklamış başlangıç', () => {
    for (const def of SCENARIOS) {
      const state = scenario(def.id);
      // İkinci şehirle başlayan senaryoda ön tarih kurucu şehrin (uzakta).
      const founding = def.setup.secondCity ? state.holding!.dormant[0]!.state : state;
      const player = getPlayer(state);
      assert.equal(founding.time.day, def.preludeDays, def.id);
      const start = state.time.day;
      assert.deepEqual(state.scenario, {
        id: def.id,
        startDay: start,
        endDay: start + def.days,
        ...(state.scenario?.rivalId ? { rivalId: state.scenario.rivalId } : {}),
        ...(state.scenario?.rivalsAtStart !== undefined ? { rivalsAtStart: state.scenario.rivalsAtStart } : {}),
      });
      assert.equal(state.time.speed, 0, `${def.id}: açılış ekranı görülene kadar duraklamış`);
      assert.equal(player.name, 'Senaryo AŞ');
      assert.equal(player.lockedUntilDay, undefined, `${def.id}: kurucu kilidi ön tarihte kaldı`);
      assert.equal(state.card, undefined);
      assert.equal(state.contractOffer, undefined);
      assert.equal(state.bubble, undefined);
      assert.equal(state.quests, undefined);
      assert.ok(state.news.some((item) => item.title.includes(def.title)), `${def.id}: açılış haberi`);
      // Rakipler şehri kurdu.
      const rivalBuildings = Object.values(founding.buildings).filter((b) => b.companyId !== founding.playerCompanyId).length;
      assert.ok(rivalBuildings >= 40, `${def.id}: ${rivalBuildings} rakip binası`);
    }
  });

  test('aynı senaryo her seferinde aynı şehir: ad ve CEO ön tarihi değiştirmiyor, parça parça koşmak da', () => {
    const def = SCENARIO_BY_ID.crisis!;
    const a = scenario('crisis');
    const builder = startScenario('crisis', { companyName: 'Başka', ceoId: CEOS.at(-1)!.id });
    let chunks = 0;
    while (!builder.step(37)) chunks++;
    assert.equal(builder.daysDone(), def.preludeDays);
    assert.ok(chunks >= 4);
    const b = builder.finish();
    assert.equal(rivalWorths(a), rivalWorths(b));
    assert.deepEqual(
      a.map.tiles.map((tile) => tile.ownerId),
      b.map.tiles.map((tile) => tile.ownerId),
    );
    assert.equal(getPlayer(b).ceoId, CEOS.at(-1)!.id);
    // CEO'nun başlangıç nakdi çarpanı senaryonun kasasını değiştirmiyor.
    assert.equal(getPlayer(b).cash, getPlayer(a).cash);
  });

  test('Kurtarma: dört kârlı şube, boşa çalışan dört destek binası, C notunda kredi, baskıncı %30', () => {
    const setup = SCENARIO_BY_ID.rescue!.setup;
    const idleSetup = setup.idle!;
    const engine = started('rescue');
    const state = engine.getState();
    const player = getPlayer(state);
    const own = Object.values(state.buildings).filter((b) => b.companyId === player.id);
    const outlets = own.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'outlet');
    const idle = own.filter((b) => b.focus === idleSetup.focus);
    assert.equal(outlets.length, setup.outlets!.length);
    assert.equal(idle.length, idleSetup.defIds.length);
    // Odak kategorisinde şirketin mağazası yok: destek binaları boşa çalışıyor.
    assert.ok(outlets.every((b) => BUILDING_BY_ID[b.defId]!.category !== idleSetup.focus));
    assert.equal(player.debt, setup.loan!.amount);
    assert.equal(player.credit?.loans.length, 1);
    const raider = state.companies[state.scenario!.rivalId!]!;
    assert.equal(sharesHeld(state, raider.id, player.id), Math.round(setup.raiderStake! * TOTAL_SHARES));
    assert.equal(
      raider.netWorth,
      Math.max(...Object.values(state.companies).filter((c) => !c.isPlayer).map((c) => c.netWorth)),
      'baskıncı şehrin en güçlü rakibi',
    );

    for (let day = 0; day < 5; day++) engine.runDay();
    // Kaldıraç C sınırının altında: kredi ilk gün çağrılmıyor.
    assert.equal(player.credit?.rating, 'C');
    assert.equal(player.credit?.loans.length, 1);
    assert.ok(outlets.every((b) => state.buildings[b.id]!.last.profit > 0), 'şubeler kâr ediyor');
    assert.ok(idle.every((b) => state.buildings[b.id]!.last.profit < 0), 'destek binaları zarar ediyor');
  });

  test('Krizin ortasında: durgunluk uyarıda başlıyor ve senaryonun son gününde bitiyor', () => {
    const setup = SCENARIO_BY_ID.crisis!.setup;
    const crisisSetup = setup.crisis!;
    const engine = started('crisis');
    const state = engine.getState();
    const run = state.scenario!;
    assert.deepEqual(state.crisis, { defId: crisisSetup.id, phase: 'warning', activeDay: run.startDay + crisisSetup.warningDays, endDay: run.endDay });
    assert.equal(getPlayer(state).cash, setup.cash);
    while (state.time.day < run.startDay + crisisSetup.warningDays) engine.runDay();
    assert.equal(state.crisis?.phase, 'active');
    while (state.time.day < run.endDay) engine.runDay();
    assert.equal(state.crisis, undefined, 'kriz son gün bitti');
    assert.equal(run.finishedDay, run.endDay);
    // Kasada bekleyen oyuncu geride kalıyor.
    assert.equal(run.outcome, 'lost');
    assert.equal(run.stars, 0);
    assert.ok(run.score! < 0.5, `öndelik ${run.score}`);
    assert.equal(state.time.speed, 0, 'bitişte oyun duraklıyor');
  });

  test('net değer hedefi: ulaşan gün kazanıyor, yıldız güne göre; süre dolarsa kaybediyor', () => {
    const def = SCENARIO_BY_ID.rescue!;
    if (def.goal.kind !== 'netWorth') throw new Error('hedef türü');
    const engine = started('rescue');
    const state = engine.getState();
    getPlayer(state).cash += def.goal.target * 2;
    engine.runDay();
    assert.equal(state.scenario!.outcome, 'won');
    assert.equal(state.scenario!.score, 1);
    assert.equal(state.scenario!.stars, 3);
    assert.match(state.news[0]!.title, /3 yıldız/);

    const late = started('rescue');
    late.getState().time.day = late.getState().scenario!.endDay - 1;
    late.runDay();
    assert.equal(late.getState().scenario!.outcome, 'lost');
    assert.equal(late.getState().scenario!.stars, 0);
  });

  test('devralınan oyuncu senaryoyu kaybediyor', () => {
    const engine = started('rescue');
    const state = engine.getState();
    const raider = state.companies[state.scenario!.rivalId!]!;
    raider.shares[state.playerCompanyId] = TOTAL_SHARES / 2 + 1;
    engine.runDay();
    assert.ok(state.gameOver);
    assert.equal(state.scenario!.outcome, 'lost');
    assert.equal(state.scenario!.finishedDay, state.time.day);
  });

  test('öndelik hedefi: sürenin sonunda en güçlü rakibe oran, yıldız eşikleri', () => {
    const def = SCENARIO_BY_ID.crisis!;
    const engine = started('crisis');
    const state = engine.getState();
    state.time.day = state.scenario!.endDay - 1;
    getPlayer(state).cash += 400_000_000;
    engine.runDay();
    assert.equal(state.scenario!.outcome, 'won');
    // Skor aşağı yuvarlanıyor (Tur 46): eşiğin altındaki skor eşikte görünmesin.
    assert.ok(Math.abs(state.scenario!.score! - floorTo(leadRatio(state), 3)) < 1e-9);
    assert.equal(state.scenario!.stars, 3);

    const lead: ScenarioDef = { ...def, stars: { metric: 'lead', two: 1.2, three: 1.4 } };
    assert.deepEqual([1.01, 1.2, 1.39, 1.4].map((score) => starsFor(lead, score)), [1, 2, 2, 3]);
    const days: ScenarioDef = { ...def, stars: { metric: 'days', two: 300, three: 230 } };
    assert.deepEqual([400, 300, 231, 230].map((score) => starsFor(days, score)), [1, 2, 2, 3]);
  });

  test('açılış ekranı açıkken takvim yürümüyor (boşluk tuşu, hız düğmeleri)', () => {
    const engine = new GameEngine(scenario('crisis'));
    const state = engine.getState();
    assert.equal(engine.dispatch({ type: 'TOGGLE_PAUSE' }).ok, false);
    assert.equal(engine.dispatch({ type: 'SET_SPEED', speed: 3 }).ok, false);
    assert.equal(state.time.speed, 0);
    assert.ok(engine.dispatch({ type: 'SET_SPEED', speed: 0 }).ok, 'duraklatmak serbest');
    assert.ok(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' }).ok);
    assert.ok(engine.dispatch({ type: 'TOGGLE_PAUSE' }).ok);
    assert.equal(state.time.speed, 0);
    assert.ok(engine.dispatch({ type: 'SET_SPEED', speed: 3 }).ok);
  });

  test('sonuç ekranı açıkken de takvim yürümüyor; kapanınca serbest oyun', () => {
    const engine = started('rescue');
    const state = engine.getState();
    getPlayer(state).cash += 100_000_000;
    engine.runDay();
    assert.equal(state.scenario!.outcome, 'won');
    assert.equal(state.time.speed, 0);
    assert.equal(engine.dispatch({ type: 'TOGGLE_PAUSE' }).ok, false);
    assert.equal(engine.dispatch({ type: 'SET_SPEED', speed: 1 }).ok, false);
    assert.equal(state.time.speed, 0);
    assert.ok(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'result' }).ok);
    assert.ok(engine.dispatch({ type: 'SET_SPEED', speed: 1 }).ok);
    assert.equal(state.time.speed, 1);
  });

  test('bitiş günü karenin kalan günlerini durduruyor (geciken kare, arka plandan dönüş)', () => {
    const engine = started('rescue');
    const state = engine.getState();
    getPlayer(state).cash += 100_000_000;
    engine.dispatch({ type: 'SET_SPEED', speed: 3 });
    const day = state.time.day;
    // Bir karede dört günlük birikmiş zaman: ilk gün senaryo bitiyor.
    engine.advance(60_000);
    assert.equal(state.scenario!.finishedDay, day + 1);
    assert.equal(state.time.day, day + 1, 'bitişten sonra gün koşulmamalı');
    assert.equal(state.time.speed, 0);
  });

  test('yıldız ham skordan; saklanan ve gösterilen skor aşağı yuvarlanıyor', () => {
    // ×1,3996 üç yıldızın ×1,4 eşiğinin altında: yuvarlanıp eşiği geçmemeli.
    const def = SCENARIO_BY_ID.crisis!;
    const state = scenario('crisis');
    state.scenario!.briefSeen = true;
    state.time.day = state.scenario!.endDay;
    const rivals = Object.values(state.companies).filter((company) => !company.isPlayer);
    for (const rival of rivals) rival.netWorth = 1_000_000;
    rivals[0]!.netWorth = 10_000_000;
    getPlayer(state).netWorth = 13_996_000;
    runScenarioTick(state);
    assert.equal(state.scenario!.outcome, 'won');
    assert.equal(state.scenario!.stars, 2);
    assert.equal(state.scenario!.score, 1.399);
    assert.equal(scenarioScoreText(def, state.scenario!.score!), '×1,39');
  });

  test('kurallar kilitli; açılış ekranı takvimi başlatıyor, sonuç ekranı bitince kapanıyor', () => {
    const engine = new GameEngine(scenario('rescue'));
    const state = engine.getState();
    assert.equal(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'result' }).ok, false, 'süren senaryonun sonucu yok');
    assert.equal(engine.dispatch({ type: 'SET_FLAG', flag: 'raids', value: false }).ok, false);
    assert.ok(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' }).ok);
    assert.equal(state.time.speed, 1);
    assert.equal(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' }).ok, false);
    assert.equal(openCityQuote(state).ok, false);

    getPlayer(state).cash += 100_000_000;
    engine.runDay();
    assert.equal(state.scenario!.outcome, 'won');
    assert.ok(engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'result' }).ok);
    assert.equal(state.scenario!.resultSeen, true);
    // Biten senaryodan sonra şehir serbest oyun.
    assert.ok(engine.dispatch({ type: 'SET_FLAG', flag: 'raids', value: false }).ok);
  });

  test('gündemde senaryo çipi: hedef, ilerleme, geri sayım; bitince düşüyor', () => {
    const engine = started('rescue');
    const state = engine.getState();
    engine.runDay();
    const chip = agenda(state).find((item) => item.kind === 'scenario');
    assert.ok(chip);
    assert.equal(chip.daysLeft, state.scenario!.endDay - state.time.day);
    assert.match(chip.label, /Kurtarma/);
    assert.equal(chip.progress, scenarioProgress(state)!.progress);
    getPlayer(state).cash += 100_000_000;
    engine.runDay();
    assert.equal(agenda(state).find((item) => item.kind === 'scenario'), undefined);
  });
  test('Konsorsiyuma karşı: konsorsiyum devir günü kuruluyor; devralınan binalar dağılma sayacına girmiyor', () => {
    const def = SCENARIO_BY_ID.consortium!;
    const setup = def.setup;
    const engine = started('consortium');
    const state = engine.getState();
    const run = state.scenario!;
    const consortium = state.consortium;
    assert.ok(consortium, 'konsorsiyum kuruldu');
    assert.equal(consortium.formedDay, run.startDay);
    assert.equal(consortium.startsDay, run.startDay + setup.consortium!.warningDays);
    assert.equal(run.rivalId, consortium.leaderId, 'baskıncı konsorsiyumun önderi');
    const player = getPlayer(state);
    assert.equal(player.cash, setup.cash);
    const own = Object.values(state.buildings).filter((building) => building.companyId === player.id);
    assert.equal(own.length, setup.outlets!.length);
    assert.ok(own.every((building) => building.builtDay === run.startDay - setup.builtDaysAgo!), 'binalar 150 günlük');
    // Kasa net değerin çoğu: konsorsiyumun hedefi atıl kasa.
    assert.ok(player.cash > player.netWorth * 0.6, `kasa ${player.cash} / ${player.netWorth}`);
    for (let day = 0; day < 5; day++) engine.runDay();
    assert.ok(state.consortium, 'devralınan on iki bina "yatırıma dönüş" sayılmadı');
    assert.match(state.news.map((item) => item.title).join(' | '), /konsorsiyum/);
  });

  test('zafer hedefi: zafer günü kazanıyor, zafer ekranı senaryonun sonucuna bırakılıyor; süre dolarsa kaybediyor', () => {
    const engine = started('consortium');
    const state = engine.getState();
    getPlayer(state).cash += 2_000_000_000;
    engine.runDay();
    assert.ok(state.victory, 'zafer yazıldı');
    assert.equal(state.scenario!.outcome, 'won');
    assert.equal(state.scenario!.score, 1);
    assert.equal(state.scenario!.stars, 3);
    assert.equal(state.victory!.dismissed, true, 'aynı haberi iki ekran vermesin');

    const late = started('consortium');
    late.getState().time.day = late.getState().scenario!.endDay - 1;
    late.runDay();
    assert.equal(late.getState().scenario!.outcome, 'lost');
    assert.equal(late.getState().scenario!.lostReason, 'time');
    assert.ok(late.getState().scenario!.score! < 1);
  });

  test('Zincir ustası: zincir, maliyet ve pay aynı gün sağlanınca kazanılıyor', () => {
    const def = SCENARIO_BY_ID.chain!;
    if (def.goal.kind !== 'chain') throw new Error('hedef türü');
    const goal = def.goal;
    const engine = started('chain');
    const state = engine.getState();
    const player = getPlayer(state);
    assert.equal(player.cash, def.setup.cash);
    const before = chainGoalStatus(state, goal.goodId, goal.share)!;
    assert.deepEqual([before.rawGoodId, before.intermediateId], ['silicon', 'chip']);
    assert.deepEqual([before.raw, before.process, before.outlet, before.met], [false, false, false, false]);

    // Silikon Ocağı 6 M ₺ şirket değeriyle açılıyor.
    player.cash += 30_000_000;
    player.netWorth += 30_000_000;
    buildOn(engine, 'silicon_mine', ['industrial', 'port']);
    buildOn(engine, 'chip_fab', ['industrial', 'port']);
    const shop = buildOn(engine, 'phone_shop');
    if (!state.buildings[shop]!.stocked.includes(goal.goodId)) {
      assert.ok(engine.dispatch({ type: 'SET_STOCK', buildingId: shop, goodIds: [goal.goodId] }).ok);
    }
    for (let day = 0; day < 10 && state.scenario!.finishedDay === undefined; day++) engine.runDay();
    const built = chainGoalStatus(state, goal.goodId, goal.share)!;
    assert.deepEqual([built.raw, built.process, built.outlet], [true, true, true]);
    assert.ok(built.cost < built.spot, `çip ${built.cost} / piyasa ${built.spot}`);

    // Pay hedefin altındayken bitmiyor; hedefte kazanılıyor.
    const run = state.scenario!;
    delete run.finishedDay;
    delete run.outcome;
    player.marketShare.electronics = goal.share - 0.01;
    runScenarioTick(state);
    assert.equal(run.finishedDay, undefined);
    assert.match(scenarioProgress(state)!.detail, /zincir 3\/3/);
    player.marketShare.electronics = goal.share;
    runScenarioTick(state);
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, state.time.day - run.startDay);
  });

  test('Şehrin sponsoru: iki ihale de oyuncuda; proje takvimi senaryonun', () => {
    const def = SCENARIO_BY_ID.sponsor!;
    if (def.goal.kind !== 'sponsor') throw new Error('hedef türü');
    const projects = def.setup.projects!;
    const engine = started('sponsor');
    const state = engine.getState();
    const run = state.scenario!;
    assert.equal(state.nextProjectDay, run.startDay + projects.firstInDays);
    assert.deepEqual(scenarioProjectGap(state), [projects.gapDays, projects.gapDays]);
    assert.equal(scenarioProjectGap(createNewGame({ seed: 3 })), null, 'serbest oyunun takvimi değişmiyor');
    // Sıra sorun olmasın: oyuncu açık ara önde, her ihalede herkesten çok veriyor.
    getPlayer(state).cash += 200_000_000;
    let finished = -1;
    for (let day = 0; day < def.days && run.finishedDay === undefined; day++) {
      const project = state.project;
      if (project?.phase === 'funding' && project.closesDay - state.time.day === 1 && !project.contributions[state.playerCompanyId]) {
        assert.ok(engine.dispatch({ type: 'CONTRIBUTE_PROJECT', amount: 20_000_000 }).ok);
      }
      engine.runDay();
      // İlk proje bitti: sonraki serbest oyunun 260–380 günü yerine 30 gün sonra.
      if (finished < 0 && run.sponsored === 1 && !state.project) {
        finished = state.time.day;
        assert.equal(state.nextProjectDay, finished + projects.gapDays);
      }
    }
    assert.equal(run.outcome, 'won');
    assert.equal(run.sponsored, 2);
    assert.equal(run.closedProjects!.length, 2);
    assert.ok(finished > 0);
    assert.ok(Math.abs(run.score! - Math.floor(leadRatio(state) * 1000) / 1000) < 1e-9);
  });

  test('Şehrin sponsoru: ihaleyi rakip kaparsa senaryo biter', () => {
    const engine = started('sponsor');
    const state = engine.getState();
    const run = state.scenario!;
    getPlayer(state).cash += 200_000_000;
    for (let day = 0; day < 200 && run.finishedDay === undefined; day++) engine.runDay();
    assert.equal(run.outcome, 'lost');
    assert.equal(run.lostReason, 'project');
    assert.equal(state.project?.phase, 'building');
    assert.notEqual(state.project?.sponsorId, state.playerCompanyId);
    assert.equal(run.sponsored ?? 0, 0);
  });

  test('Şehrin sponsoru: ilk ikiden düşen şirketin geri dönmek için 20 günü var', () => {
    const def = SCENARIO_BY_ID.sponsor!;
    if (def.goal.kind !== 'sponsor') throw new Error('hedef türü');
    const grace = def.goal.graceDays;
    const state = scenario('sponsor');
    state.scenario!.briefSeen = true;
    const run = state.scenario!;
    const player = getPlayer(state);
    const rivals = Object.values(state.companies).filter((company) => !company.isPlayer);
    const drop = () => {
      for (const rival of rivals.slice(0, 2)) rival.netWorth = player.netWorth * 2;
    };
    const recover = () => {
      for (const rival of rivals) rival.netWorth = player.netWorth / 2;
    };

    drop();
    assert.equal(playerRank(state), 3);
    runScenarioTick(state);
    assert.equal(run.finishedDay, undefined, 'düştüğü gün bitmiyor');
    assert.equal(run.outOfRankDay, state.time.day);
    assert.match(state.news[0]!.title, /İlk 2 şirketin dışına düştün/);
    assert.match(scenarioProgress(state)!.detail, new RegExp(`${grace} gün`));
    state.time.day += grace - 1;
    runScenarioTick(state);
    assert.equal(run.finishedDay, undefined, 'son gün de geri dönebilir');
    recover();
    runScenarioTick(state);
    assert.equal(run.outOfRankDay, undefined, 'geri dönünce sayaç siliniyor');

    drop();
    runScenarioTick(state);
    state.time.day += grace;
    runScenarioTick(state);
    assert.equal(run.outcome, 'lost');
    assert.equal(run.lostReason, 'rank');
    assert.equal(state.time.speed, 0);
  });
  test('Büyük şehir fethi: ruhsat ve ihraç donduruluyor, ara zafer oyunu durdurmuyor, tekel kazanıyor', () => {
    const def = SCENARIO_BY_ID.conquest!;
    const engine = started('conquest');
    const state = engine.getState();
    const run = state.scenario!;
    assert.equal(state.citySize, 'large');
    assert.equal(state.flags.rivalEntry, false);
    assert.equal(state.flags.issuance, false);
    assert.equal(run.rivalsAtStart, 8);
    assert.equal(rivalsLeft(state), 8);
    assert.equal(getPlayer(state).cash, def.setup.cash);
    assert.equal(engine.dispatch({ type: 'ISSUE_SHARES', count: 500 }).ok, false, 'oyuncunun ihracı da kapalı');
    // Değer ve birincilik zaferi kaydediliyor ama senaryo sürüyor: ekran yok, takvim yürüyor.
    getPlayer(state).cash += 2_000_000_000;
    engine.runDay();
    assert.equal(state.victory?.kind, 'tycoon');
    assert.equal(state.victory?.dismissed, true);
    assert.equal(state.time.speed, 1);
    assert.equal(run.finishedDay, undefined);
    assert.match(scenarioProgress(state)!.detail, /devralınan 0\/8 · 8 rakip kaldı/);
    // Son rakip de gidince tekel.
    for (const company of Object.values(state.companies)) if (!company.isPlayer) delete state.companies[company.id];
    runScenarioTick(state);
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, state.time.day - run.startDay);
    assert.equal(state.flags.rivalEntry, true, 'dondurma senaryoyla kalkıyor');
    assert.equal(state.flags.issuance, true);

    const late = scenario('conquest');
    late.scenario!.briefSeen = true;
    late.time.day = late.scenario!.endDay;
    runScenarioTick(late);
    assert.equal(late.scenario!.outcome, 'lost');
    assert.equal(late.scenario!.lostReason, 'time');
    assert.equal(late.scenario!.score, 8, 'skor kalan rakip');
  });

  test('Holding: iki şehir — yeni şehirde başlıyor, kurucu şehir uzakta; sermaye kurucu şehrin zaferine sayılmıyor', () => {
    const def = SCENARIO_BY_ID.holding!;
    const setup = def.setup;
    const state = scenario('holding');
    const founding = state.holding!.dormant[0]!.state;
    assert.equal(state.time.day, 0);
    assert.equal(founding.time.day, def.preludeDays);
    assert.equal(founding.scenario, undefined, 'senaryo oynanan şehirde');
    assert.equal(getPlayer(founding).cash, setup.cash);
    assert.equal(founding.importedCapital, undefined);
    assert.equal(
      Object.values(founding.buildings).filter((b) => b.companyId === founding.playerCompanyId).length,
      setup.outlets!.length,
    );
    assert.equal(getPlayer(state).cash, setup.secondCity!.capital);
    assert.equal(state.importedCapital, setup.secondCity!.capital);
    const cities = holdingCities(state);
    assert.deepEqual(cities.map((city) => [city.active, city.won, city.lost]), [[true, false, false], [false, false, false]]);
    assert.equal(cities[0]!.value, 0, 'yeni şehirde yaratılan değer sıfırdan');
    assert.equal(Math.round(cities[1]!.value), Math.round(getPlayer(founding).netWorth));
  });

  test('Holding: şehir değişince senaryo oyuncuyla geliyor, günleri kayıyor', () => {
    const engine = started('holding');
    for (let day = 0; day < 5; day++) engine.runDay();
    const second = engine.getState();
    const before = scenarioProgress(second)!;
    assert.ok(engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    const founding = engine.getState();
    assert.notEqual(founding, second);
    assert.equal(founding.scenario?.id, 'holding');
    assert.equal(founding.scenario!.startDay, founding.time.day - 5);
    assert.equal(scenarioProgress(founding)!.daysLeft, before.daysLeft);
    assert.equal(founding.holding!.dormant[0]!.state.scenario, undefined, 'uzaktaki şehirde senaryo kalmıyor');
    engine.runDay();
    assert.ok(engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    const back = engine.getState();
    assert.equal(back.scenario!.startDay, 0);
    assert.equal(scenarioProgress(back)!.daysLeft, before.daysLeft - 1);
  });

  test('Holding: iki şehirde de zafer kazanıyor; uzaktaki şehir kaybedilirse senaryo biter', () => {
    const state = scenario('holding');
    state.scenario!.briefSeen = true;
    const run = state.scenario!;
    const founding = state.holding!.dormant[0]!.state;
    state.time.day = 120;
    state.victory = { day: 120, kind: 'tycoon', dismissed: true };
    runScenarioTick(state);
    assert.equal(run.finishedDay, undefined, 'bir şehir yetmiyor');
    assert.match(scenarioProgress(state)!.detail, /1\/2 şehirde zafer/);
    founding.victory = { day: founding.time.day, kind: 'tycoon' };
    runScenarioTick(state);
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, 120);
    assert.equal(founding.victory.dismissed, true, 'şehre dönünce zafer ekranı açılmasın');

    const lost = scenario('holding');
    lost.scenario!.briefSeen = true;
    lost.holding!.dormant[0]!.state.gameOver = { day: 300, byCompanyId: 'nova_holding' };
    runScenarioTick(lost);
    assert.equal(lost.scenario!.outcome, 'lost');
    assert.equal(lost.scenario!.lostReason, 'city');
  });
});

describe('senaryo paketi II (Tur 60)', () => {
  test('ek kural ön tarihle birlikte: şehir kuralla kurulmuş, kuralsız senaryoda kural yok', () => {
    for (const def of SCENARIOS) {
      const state = scenario(def.id);
      const founding = def.setup.secondCity ? state.holding!.dormant[0]!.state : state;
      assert.deepEqual(founding.modifiers ?? [], [...(def.modifiers ?? [])], def.id);
    }
    assert.deepEqual(SCENARIO_BY_ID.haulage!.modifiers, ['hungry_rivals']);
    assert.deepEqual(SCENARIO_BY_ID.blackout!.modifiers, ['tight_credit']);
    assert.deepEqual(SCENARIO_BY_ID.renewal!.modifiers, ['scarce_land']);
    // Sıkı banka devirde de: kredi teklifi kuralın faiz farkıyla ve küçük limitle.
    const tight = scenario('blackout');
    const free = scenario('blackout');
    delete free.modifiers;
    const [withRule, without] = [loanQuote(tight, tight.playerCompanyId, 'term', 360), loanQuote(free, free.playerCompanyId, 'term', 360)];
    assert.ok(withRule.rate > without.rate && withRule.max < without.max, `${withRule.max}@${withRule.rate} / ${without.max}@${without.rate}`);
  });

  test('hedef cümleleri sayılarla dolu', () => {
    assert.match(scenarioGoalText(SCENARIO_BY_ID.haulage!), /en az 2 rakibin toplam 40 mağazasını/);
    assert.match(scenarioGoalText(SCENARIO_BY_ID.blackout!), /4,00 M ₺ değerinde elektrik/);
    assert.match(scenarioGoalText(SCENARIO_BY_ID.renewal!), /1\.500 dolu birime ulaş; en az 2 dönüşüm projesi/);
  });

  test('Herkesin nakliyecisi: en değerli iki rakip kinli başlıyor, hafızada önceki yönetimin fiyat savaşı', () => {
    const state = scenario('haulage');
    const rivals = Object.values(state.companies)
      .filter((company) => !company.isPlayer)
      .sort((a, b) => b.netWorth - a.netWorth || a.id.localeCompare(b.id));
    const count = SCENARIO_BY_ID.haulage!.setup.feud!;
    for (const [index, rival] of rivals.entries()) {
      if (index < count) {
        assert.equal(stanceOf(state, rival.id), 'hostile', rival.id);
        assert.equal(rival.relation!.memory[0]!.kind, 'feud');
        assert.ok(rival.relation!.score <= -40);
      } else {
        assert.equal(stanceOf(state, rival.id), null, rival.id);
      }
    }
    // Husumetin haberi senaryonun açılışından sonra (akış yeniden eskiye: önce husumet).
    const opening = state.news.findIndex((item) => item.title.includes(SCENARIO_BY_ID.haulage!.title));
    const feuds = rivals.slice(0, count).map((rival) => state.news.findIndex((item) => item.tone === 'rival' && item.companyId === rival.id));
    assert.ok(opening >= 0);
    assert.ok(feuds.every((index) => index >= 0 && index < opening), `${feuds.join(',')} < ${opening}`);
  });

  test('nakliye hedefi: aynı gün iki rakibin kırk mağazası; el değiştiren mağaza sayılmıyor', () => {
    const engine = started('haulage');
    const state = engine.getState();
    const goal = SCENARIO_BY_ID.haulage!.goal as { kind: 'freight'; rivals: number; outlets: number };
    const outlets = new Map<string, string[]>();
    for (const building of Object.values(state.buildings)) {
      if (building.companyId === state.playerCompanyId || BUILDING_BY_ID[building.defId]?.role !== 'outlet') continue;
      outlets.set(building.companyId, [...(outlets.get(building.companyId) ?? []), building.id]);
    }
    const [a, b] = [...outlets.entries()].sort((x, y) => y[1].length - x[1].length);
    assert.ok(a && b && a[1].length + b[1].length >= goal.outlets, 'iki büyük rakibin mağazası hedefe yetiyor');
    const deal = (companyId: string, ids: string[], n: number) => ({
      id: `fr-${companyId}`,
      companyId,
      terminalId: 'yok',
      outletIds: ids.slice(0, n),
      durationDays: 120,
      offeredDay: state.time.day,
      estimate: 100,
      rate: 0.2,
    });
    const first = Math.min(a[1].length, goal.outlets);
    state.freight = { offers: [], contracts: [deal(a[0], a[1], first)], nextId: 2, lastOfferDay: 0, declined: {}, earnedTotal: 0 };
    let status = freightGoalStatus(state, goal.rivals, goal.outlets);
    assert.equal(status.served, 1);
    assert.equal(status.met, false, 'tek rakip yetmiyor');
    state.freight.contracts.push(deal(b[0], b[1], goal.outlets - first));
    status = freightGoalStatus(state, goal.rivals, goal.outlets);
    assert.equal(status.outlets, goal.outlets);
    assert.equal(status.met, true);
    assert.match(scenarioProgress(state)!.detail, /2\/2 rakip · 40\/40 mağaza/);
    // Mağaza el değiştirdi: sayılmıyor, hedef bugün tutmuyor.
    state.buildings[state.freight.contracts[1]!.outletIds[0]!]!.companyId = state.playerCompanyId;
    assert.equal(freightGoalStatus(state, goal.rivals, goal.outlets).met, false);
    state.buildings[state.freight.contracts[1]!.outletIds[0]!]!.companyId = b[0];
    state.time.day += 7;
    runScenarioTick(state);
    assert.equal(state.scenario!.outcome, 'won');
    assert.equal(state.scenario!.score, 7);
  });

  test('Karanlık kış: kriz bir ay sonra, son gün bitiyor; satış gün gün birikiyor, kendi binası sayılmıyor', () => {
    const engine = started('blackout');
    const state = engine.getState();
    const run = state.scenario!;
    assert.equal(state.crisis?.defId, 'energy_shock');
    assert.equal(state.crisis?.activeDay, run.startDay + 30);
    assert.equal(state.crisis?.endDay, run.endDay);
    // Santral: rakip binalarının en yoğun olduğu boş sanayi ya da liman parseli.
    const def = BUILDING_BY_ID.gas_plant!;
    const rivals = Object.values(state.buildings).filter((b) => b.companyId !== state.playerCompanyId);
    const tiles = state.map.tiles.filter(
      (tile) =>
        tile.kind === 'plot' && !tile.ownerId && !tile.buildingId && !tile.structureId && isDistrictOpen(state, tile.districtId) &&
        def.zones!.includes(state.districts[tile.districtId]!.archetype),
    );
    const near = (tile: (typeof tiles)[number]) =>
      rivals.filter((b) => {
        const at = state.map.tiles[b.tileId]!;
        return Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= def.radius;
      }).length;
    const tile = tiles.sort((x, y) => near(y) - near(x) || x.id - y.id)[0]!;
    assert.ok(engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok);
    const built = engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: def.id });
    assert.ok(built.ok, built.ok ? '' : built.reason);
    const plant = state.buildings[state.map.tiles[tile.id]!.buildingId!]!;
    let sold = 0;
    for (let day = 0; day < 40; day++) {
      engine.runDay();
      sold = Math.round(sold + plant.last.revenue);
      assert.equal(run.powerSold, sold, `gün ${day}`);
    }
    assert.ok(sold > 0, 'santral rakiplere satıyor');
    assert.ok((plant.last.plant?.rivalMwh ?? 0) > 0);
    assert.match(scenarioProgress(state)!.detail, /rakiplere .* \/ 4,00 M ₺ elektrik/);
    // Hedef: satış eşiği geçen gün kazanıyor; skor gün sayısı.
    run.powerSold = 4_000_000 - 1;
    engine.runDay();
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, state.time.day - run.startDay);
  });

  test('Kentsel dönüşüm: dolu birim ve açılmış iki dönüşüm projesi; inşaat ve hak sahipleri sayılmıyor', () => {
    const engine = started('renewal');
    const state = engine.getState();
    const run = state.scenario!;
    const goal = SCENARIO_BY_ID.renewal!.goal as { kind: 'rental'; units: number; renewals: number };
    const start = rentalGoalStatus(state);
    const rentals = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'rental');
    assert.equal(rentals.length, 2);
    const expected = rentals.reduce((sum, b) => sum + rentalOutlook(state, b.id)!.units * rentalOutlook(state, b.id)!.occupancy, 0);
    assert.equal(start.occupied, Math.floor(expected + 1e-6));
    assert.equal(start.renewals, 0);
    // Dört Konut Sitesi: ikisi dönüşüm parselinde. İnşaatta sayılmıyor.
    const projects: string[] = [];
    for (let i = 0; i < 4; i++) {
      const tile = state.map.tiles.find(
        (candidate) =>
          candidate.kind === 'plot' && !candidate.ownerId && !candidate.buildingId && !candidate.structureId &&
          isDistrictOpen(state, candidate.districtId) && BUILDING_BY_ID.housing_estate!.zones!.includes(state.districts[candidate.districtId]!.archetype),
      )!;
      assert.ok(engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok);
      if (i < 2) tile.renewal = { day: state.time.day, structureId: 'eski_yapi' };
      const built = engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'housing_estate' });
      assert.ok(built.ok, built.ok ? '' : built.reason);
      projects.push(tile.buildingId!);
    }
    const [renewalA, renewalB, plainA, plainB] = projects as [string, string, string, string];
    let status = rentalGoalStatus(state);
    assert.equal(status.renewals, 0);
    assert.equal(status.renewalsBuilding, 2);
    assert.equal(status.occupied, start.occupied);
    // Hak sahipleri birime sayılmıyor: dönüşüm projesi 1,6 kat, eksi hak sahipleri.
    const estate = rentalOutlook(state, renewalA)!;
    assert.ok(estate.rightHolders > 0);
    assert.equal(estate.units, Math.round(BUILDING_BY_ID.housing_estate!.capacity * 1.6) - estate.rightHolders);
    // Üçü açılıyor ve doluyor: birim hedefin üstünde ama tek dönüşüm projesi açık.
    const open = (ids: string[]) => {
      for (const id of ids) state.buildings[id]!.development!.opensOnDay = state.time.day + 1;
      engine.runDay();
    };
    open([renewalA, plainA, plainB]);
    for (const id of [renewalA, plainA, plainB]) state.buildings[id]!.development!.occupancy = 1;
    runScenarioTick(state);
    status = rentalGoalStatus(state);
    assert.ok(status.occupied >= goal.units, `${status.occupied}`);
    assert.equal(status.renewals, 1);
    assert.equal(run.outcome, undefined, 'tek dönüşüm projesi yetmiyor');
    assert.match(scenarioProgress(state)!.detail, /dönüşüm 1\/2/);
    // İkinci dönüşüm projesi açılınca kazanıyor; skor gün sayısı.
    open([renewalB]);
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, state.time.day - run.startDay);
  });
});

describe('ticaretle zafer (Tur 79)', () => {
  /** Uzaktaki şehre bina (kurucu şehir motorun dışında). */
  function placeAway(city: GameState, defId: string): string {
    const me = city.companies[city.playerCompanyId]!;
    for (const tile of city.map.tiles) {
      if (!isPurchasable(tile) || tile.structureId || tile.buildingId) continue;
      if (!buyTile(city, me.id, tile.id).ok) continue;
      if (build(city, me.id, tile.id, defId).ok) return city.map.tiles[tile.id]!.buildingId!;
    }
    throw new Error(`${defId} için parsel yok`);
  }

  test('iki senaryo da iki türlü şehirde: kurucu şehir uzakta, senaryo yeni şehirde', () => {
    for (const id of ['coffee', 'supplier']) {
      const def = SCENARIO_BY_ID[id]!;
      assert.equal(def.goal.kind, 'trade', id);
      assert.ok(def.cityType && def.setup.secondCity?.cityType && def.cityType !== def.setup.secondCity.cityType, `${id}: iki ayrı tür`);
      const state = scenario(id);
      const founding = state.holding!.dormant[0]!.state;
      assert.equal(founding.cityType, def.cityType, `${id}: kurucu şehrin türü`);
      assert.equal(state.cityType, def.setup.secondCity.cityType, `${id}: yeni şehrin türü`);
      assert.equal(founding.scenario, undefined);
      assert.equal(state.scenario?.id, id);
      assert.equal(getPlayer(state).cash, def.setup.secondCity.capital);
      assert.equal(
        Object.values(founding.buildings).filter((b) => b.companyId === founding.playerCompanyId).length,
        def.setup.outlets!.length,
      );
    }
    // Türsüz senaryolar dengeli kalıyor (eski kayıtlar ve rekorlar aynı şehirde).
    assert.equal(scenario('rescue').cityType, undefined);
  });

  test('ticaret hedefi: hatların kârı gün gün birikiyor, zarar eden gün düşürüyor; hedefte kazanıyor', () => {
    const engine = started('coffee');
    const state = engine.getState();
    const run = state.scenario!;
    const goal = SCENARIO_BY_ID.coffee!.goal as { kind: 'trade'; target: number };
    const away = state.holding!.dormant[0]!.state;
    placeAway(away, 'freight_terminal');
    buildOn(engine, 'freight_terminal');
    const opened = engine.dispatch({ type: 'OPEN_LINE', from: away.meta.seed, to: state.meta.seed, goodId: 'coffee_bean', trucks: 2, buy: true });
    assert.ok(opened.ok, opened.ok ? '' : opened.reason);
    let total = 0;
    for (let day = 0; day < 20; day++) {
      engine.runDay();
      total = Math.round(total + tradeProfitToday(state));
      assert.equal(run.tradeProfit, total, `gün ${day}`);
    }
    assert.ok(total > 0, 'limandan sanayiye kahve kârlı');
    // Günün kârı: yük varışın fiyatıyla planlı satış, eksi malın ve nakliyenin bedeli.
    const line = state.holding!.lines![0]!;
    const last = line.last!;
    const spot = state.market.spot['coffee_bean']!;
    assert.ok(Math.abs(tradeProfitToday(state) - (last.units * spot * TRADE_LINE.saleShare - last.goods - last.freight)) < 1e-6);
    assert.ok(run.tradeProfit! / goal.target < 1);
    assert.ok(scenarioProgress(state)!.detail.includes(`/ ${formatMoney(goal.target)}`), scenarioProgress(state)!.detail);
    // Yükü olmayan gün yalnız gider: toplam düşüyor.
    line.last = { ...last, units: 0 };
    runScenarioTick(state);
    assert.equal(run.tradeProfit, Math.round(total - last.goods - last.freight));
    assert.equal(run.outcome, undefined);
    // Eşiği geçen gün kazanıyor; skor gün sayısı.
    run.tradeProfit = goal.target - 1;
    engine.runDay();
    assert.ok(tradeProfitToday(state) > 1);
    assert.equal(run.outcome, 'won');
    assert.equal(run.score, state.time.day - run.startDay);
  });

  test('süre dolunca kaybediyor: skor hedefin payı, zarar sıfır sayılıyor', () => {
    const goal = SCENARIO_BY_ID.coffee!.goal as { kind: 'trade'; target: number };
    const half = scenario('coffee');
    half.scenario!.briefSeen = true;
    half.scenario!.tradeProfit = goal.target / 4;
    half.time.day = half.scenario!.endDay - 1;
    runScenarioTick(half);
    assert.equal(half.scenario!.outcome, undefined, 'son günden önce sürüyor');
    half.time.day += 1;
    runScenarioTick(half);
    assert.equal(half.scenario!.outcome, 'lost');
    assert.equal(half.scenario!.lostReason, 'time');
    assert.equal(half.scenario!.score, 0.25);

    const loss = scenario('coffee');
    loss.scenario!.briefSeen = true;
    loss.scenario!.tradeProfit = -5_000;
    assert.equal(scenarioProgress(loss)!.progress, 0, 'ilerleme sıfırın altına inmiyor');
    loss.time.day = loss.scenario!.endDay;
    runScenarioTick(loss);
    assert.equal(loss.scenario!.outcome, 'lost');
    assert.equal(loss.scenario!.score, 0);
  });

  test('hedef cümlesi sayılarla dolu', () => {
    for (const id of ['coffee', 'supplier']) {
      const def = SCENARIO_BY_ID[id]!;
      const goal = def.goal as { kind: 'trade'; target: number };
      const text = scenarioGoalText(def);
      assert.ok(text.includes(`${def.days} gün`) && text.includes(formatMoney(goal.target)), text);
    }
  });
});
