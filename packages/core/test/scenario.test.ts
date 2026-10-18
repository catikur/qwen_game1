import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CEOS, SCENARIOS, SCENARIO_BY_ID } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { GameEngine } from '../src/engine';
import { agenda } from '../src/agenda';
import { openCityQuote } from '../src/holding';
import { createScenarioGame, startScenario } from '../src/scenario';
import { getPlayer } from '../src/selectors';
import {
  chainGoalStatus,
  leadRatio,
  playerRank,
  runScenarioTick,
  scenarioProgress,
  scenarioProjectGap,
  scenarioScoreText,
  starsFor,
} from '../src/systems/scenario';
import { isDistrictOpen } from '../src/systems/city';
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
      const player = getPlayer(state);
      assert.equal(state.time.day, def.preludeDays, def.id);
      assert.deepEqual(state.scenario, { id: def.id, startDay: def.preludeDays, endDay: def.preludeDays + def.days, ...(state.scenario?.rivalId ? { rivalId: state.scenario.rivalId } : {}) });
      assert.equal(state.time.speed, 0, `${def.id}: açılış ekranı görülene kadar duraklamış`);
      assert.equal(player.name, 'Senaryo AŞ');
      assert.equal(player.lockedUntilDay, undefined, `${def.id}: kurucu kilidi ön tarihte kaldı`);
      assert.equal(state.card, undefined);
      assert.equal(state.contractOffer, undefined);
      assert.equal(state.bubble, undefined);
      assert.equal(state.quests, undefined);
      assert.match(state.news.at(-1)!.title, new RegExp(def.title));
      // Rakipler şehri kurdu.
      const rivalBuildings = Object.values(state.buildings).filter((b) => b.companyId !== player.id).length;
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
    assert.ok(Math.abs(state.scenario!.score! - Math.round(leadRatio(state) * 1000) / 1000) < 1e-9);
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
});
