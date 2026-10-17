import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CEOS, SCENARIOS, SCENARIO_BY_ID } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { GameEngine } from '../src/engine';
import { agenda } from '../src/agenda';
import { openCityQuote } from '../src/holding';
import { createScenarioGame, startScenario } from '../src/scenario';
import { getPlayer } from '../src/selectors';
import { leadRatio, runScenarioTick, scenarioProgress, scenarioScoreText, starsFor } from '../src/systems/scenario';
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
    if (setup.kind !== 'rescue') throw new Error('kurulum türü');
    const engine = started('rescue');
    const state = engine.getState();
    const player = getPlayer(state);
    const own = Object.values(state.buildings).filter((b) => b.companyId === player.id);
    const outlets = own.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'outlet');
    const idle = own.filter((b) => b.focus === setup.idle.focus);
    assert.equal(outlets.length, setup.outlets.length);
    assert.equal(idle.length, setup.idle.defIds.length);
    // Odak kategorisinde şirketin mağazası yok: destek binaları boşa çalışıyor.
    assert.ok(outlets.every((b) => BUILDING_BY_ID[b.defId]!.category !== setup.idle.focus));
    assert.equal(player.debt, setup.loan.amount);
    assert.equal(player.credit?.loans.length, 1);
    const raider = state.companies[state.scenario!.rivalId!]!;
    assert.equal(sharesHeld(state, raider.id, player.id), Math.round(setup.raiderStake * TOTAL_SHARES));
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
    if (setup.kind !== 'crisis') throw new Error('kurulum türü');
    const engine = started('crisis');
    const state = engine.getState();
    const run = state.scenario!;
    assert.deepEqual(state.crisis, { defId: setup.crisisId, phase: 'warning', activeDay: run.startDay + setup.warningDays, endDay: run.endDay });
    assert.equal(getPlayer(state).cash, setup.cash);
    while (state.time.day < run.startDay + setup.warningDays) engine.runDay();
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
});
