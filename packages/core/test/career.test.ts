import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, ACHIEVEMENT_GROUPS, CONSUMER_CATEGORIES, CRISES, SCENARIOS } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { createScenarioGame } from '../src/scenario';
import { createLeagueGame } from '../src/league';
import { achievementStatus, achievementStatuses, careerTotals, isRunScoped, runFacts, runKeyOf, runValue } from '../src/career';
import type { RunFacts } from '../src/career';
import { formConsortium, runConsortiumTick } from '../src/systems/consortium';
import { runContractTick } from '../src/systems/contracts';
import { runAuctionTick } from '../src/systems/auction';
import { contributeToProject, runProjectTick } from '../src/systems/projects';
import { recomputeNetWorth } from '../src/systems/city';
import { playerStrategy } from './proxy';
import type { GameState } from '../src/types';

const player = (state: GameState) => state.companies[state.playerCompanyId]!;
const rivals = (state: GameState) => Object.values(state.companies).filter((company) => !company.isPlayer);

/** Vekilin birkaç gün oynadığı şehir. */
function played(days: number, seed = 3): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Kariyer AŞ' }));
  for (let day = 1; day <= days; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

/** Elle kurulan koşu özeti: kuralları durumdan bağımsız denemek için. */
function facts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    key: 'k',
    mode: 'free',
    companyName: 'X',
    ceoId: 'muhendis',
    difficulty: 'normal',
    citySize: 'standard',
    day: 100,
    worth: 0,
    companyWorth: 0,
    cities: 1,
    wins: [],
    closedWins: 0,
    holdingComplete: false,
    monopoly: false,
    acquisitions: 0,
    ipo: false,
    sponsored: 0,
    bubbles: 0,
    quests: 0,
    counters: { crisesWeathered: 0, crisesGrown: 0, consortiumsBroken: 0, raidsRepelled: 0, motionsWon: 0, contractsDone: 0, auctionsWon: 0 },
    lost: false,
    ...over,
  };
}

describe('kariyer: katalog', () => {
  test('kimlikler tekil, gruplar ve alanlar tutarlı', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
    const counters = Object.keys(facts().counters);
    for (const def of ACHIEVEMENTS) {
      assert.ok(ACHIEVEMENT_GROUPS.includes(def.group), def.id);
      assert.ok(def.target > 0, def.id);
      if (def.kind === 'feat') assert.ok(def.feat && counters.includes(def.feat), `${def.id}: sayaç`);
      if (def.kind === 'total') assert.ok(def.total, `${def.id}: toplam`);
      if (def.kind === 'victory') assert.ok(def.victory, `${def.id}: süzgeç`);
    }
    // Büyüme ve zafer senaryoda sayılmıyor: kurulum hazır servet ve şehir veriyor.
    for (const def of ACHIEVEMENTS.filter((a) => a.group === 'growth' || a.group === 'victory')) {
      assert.equal(def.freePlayOnly, true, def.id);
    }
    assert.equal(ACHIEVEMENT_BY_ID.scenario_perfect!.target, SCENARIOS.length * 3);
  });
});

describe('kariyer: koşu sayaçları', () => {
  test('kriz: ayakta biten sayılıyor, başladığından değerli biten ayrıca', () => {
    const engine = played(30);
    const state = engine.getState();
    const day = state.time.day;
    state.crisis = { defId: CRISES[0]!.id, phase: 'warning', activeDay: day + 1, endDay: day + 4 };
    engine.runDay();
    assert.equal(state.crisis?.phase, 'active');
    // Krizin başladığı günün başındaki değer (günün net değeri henüz hesaplanmamış).
    assert.ok((state.feats?.crisisWorth ?? 0) > 0);
    // Kriz sürerken oyuncunun değeri belirgin biçimde artıyor.
    player(state).cash += 5_000_000;
    while (state.crisis) engine.runDay();
    assert.equal(state.feats?.crisesWeathered, 1);
    assert.equal(state.feats?.crisesGrown, 1);
    assert.equal(state.feats?.crisisWorth, undefined);

    // İkinci kriz: başladığı günden daha az değerli bitiyor.
    const again = state.time.day;
    state.crisis = { defId: CRISES[0]!.id, phase: 'warning', activeDay: again + 1, endDay: again + 3 };
    engine.runDay();
    state.feats!.crisisWorth = player(state).netWorth * 10;
    while (state.crisis) engine.runDay();
    assert.equal(state.feats?.crisesWeathered, 2);
    assert.equal(state.feats?.crisesGrown, 1);
  });

  test('konsorsiyum: oyuncunun zaferiyle dağılan sayılıyor, üyeleri dağılan sayılmıyor', () => {
    const engine = played(120, 1);
    const state = engine.getState();
    const copy = JSON.parse(JSON.stringify(state)) as GameState;

    assert.ok(formConsortium(state, 5), 'konsorsiyum kurulamadı');
    state.victory = { day: state.time.day, kind: 'tycoon', dismissed: true };
    runConsortiumTick(state);
    assert.equal(state.consortium, undefined);
    assert.equal(state.feats?.consortiumsBroken, 1);

    assert.ok(formConsortium(copy, 5));
    for (const id of copy.consortium!.memberIds.slice(1)) delete copy.companies[id];
    runConsortiumTick(copy);
    assert.equal(copy.consortium, undefined);
    assert.equal(copy.feats?.consortiumsBroken, undefined);
  });

  test('sözleşme teslimi, oyuncunun kazandığı ihale ve meclis oylaması sayılıyor', () => {
    const engine = played(40);
    const state = engine.getState();
    const day = state.time.day;
    const category = CONSUMER_CATEGORIES[0]!;
    state.contract = {
      kind: 'share', title: 'Pay', districtId: 0, category, targetCount: 0, targetShare: 0.01,
      durationDays: 30, reward: 1000, penalty: 1000, offeredDay: day, acceptedDay: day, deadlineDay: day + 30,
    };
    player(state).marketShare[category] = 0.5;
    runContractTick(state);
    assert.equal(state.contract, undefined);
    assert.equal(state.feats?.contractsDone, 1);

    const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId)!;
    player(state).cash += 1_000_000;
    state.auction = { tileId: tile.id, endsOnDay: day, reserve: 1, bid: 999_999, bidderId: state.playerCompanyId, rounds: 1 };
    runAuctionTick(state);
    assert.equal(tile.ownerId, state.playerCompanyId);
    assert.equal(state.feats?.auctionsWon, 1);

    // Meclis: açılan oturumda oyuncu ilk önergeye büyük lobi yapıyor.
    let guard = 0;
    while (!state.council?.session && guard++ < 200) engine.runDay();
    const session = state.council!.session!;
    const motion = session.motions[0]!;
    player(state).cash += 50_000_000;
    const result = engine.dispatch({ type: 'LOBBY', motionId: motion.id, side: 'for', amount: 20_000_000 });
    assert.ok(result.ok, result.reason);
    while (state.council!.session) engine.runDay();
    assert.equal(motion.result?.passed, true);
    assert.equal(state.feats?.motionsWon, 1);
  });

  test('şehir projesinin sponsorluğu bittiği anda sayılıyor; sonraki devralma almıyor (Codex #70)', () => {
    const state = played(200, 1).getState();
    delete state.project;
    state.nextProjectDay = state.time.day;
    runProjectTick(state);
    assert.ok(state.project, 'proje açılmadı');
    state.flags.npcCompetition = false;
    player(state).cash = 50_000_000;
    assert.ok(contributeToProject(state, 2_000_000).ok);
    for (let i = 0; i < 400 && state.project; i++) {
      state.time.day += 1;
      runProjectTick(state);
    }
    assert.equal(state.cityProjects?.at(-1)?.sponsorId, state.playerCompanyId);
    assert.equal(state.feats?.projectsSponsored, 1);
    // Aynı karede oyuncu devralındı: `absorb` sponsorluğu devralana geçiriyor.
    for (const done of state.cityProjects!) if (done.sponsorId === state.playerCompanyId) done.sponsorId = rivals(state)[0]!.id;
    assert.equal(runFacts(state).sponsored, 1);
  });

  test('baskın: %25\'i geçip %10\'un altına itilen sayılıyor', () => {
    const engine = played(60);
    const state = engine.getState();
    const raider = rivals(state)[0]!;
    raider.shares[state.playerCompanyId] = 3_000;
    engine.runDay();
    assert.ok((state.feats?.raidPeak ?? 0) >= 2);
    assert.equal(state.feats?.raidsRepelled, undefined);
    raider.shares[state.playerCompanyId] = 0;
    engine.runDay();
    assert.equal(state.feats?.raidsRepelled, 1);
    assert.equal(state.feats?.raidPeak, 0);
  });
});

describe('kariyer: aynı gün', () => {
  test('baskın: duraklatılmış oyunda komutla bitince de hemen sayılıyor (Codex #70)', () => {
    const engine = played(60);
    const state = engine.getState();
    const raider = rivals(state)[0]!;
    raider.shares[state.playerCompanyId] = 3_000;
    engine.runDay();
    assert.ok((state.feats?.raidPeak ?? 0) >= 2);
    // Karşı devralma baskıncıyı yuttu (payı oyuncuya geçti): gün ilerlemeden başarılı bir komut.
    raider.shares[state.playerCompanyId] = 0;
    assert.ok(engine.dispatch({ type: 'SET_SPEED', speed: 0 }).ok);
    assert.equal(state.feats?.raidsRepelled, 1);
  });

  test('bir karede geçen günlerin arasındaki en yüksek değer de sayılıyor (Codex #70)', () => {
    const engine = played(30);
    const state = engine.getState();
    player(state).cash += 300_000_000;
    engine.runDay();
    const peak = player(state).netWorth;
    assert.ok(peak > 250_000_000);
    // Aynı karenin ertesi günü değer geri düştü; izleyici yalnız karenin sonunu görüyor.
    player(state).cash -= 300_000_000;
    engine.runDay();
    assert.ok(player(state).netWorth < 250_000_000);
    assert.equal(runFacts(state).worth, peak);
    assert.ok(runValue(ACHIEVEMENT_BY_ID.quarter_billion!, runFacts(state)) >= ACHIEVEMENT_BY_ID.quarter_billion!.target);
  });

  test('baskın: uzaktaki şehirde püskürtülen de sayılıyor (Codex #70)', () => {
    const engine = played(60);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    const away = state.holding!.dormant[0]!.state;
    const raider = rivals(away)[0]!;
    raider.shares[away.playerCompanyId] = 3_000;
    engine.runDay();
    assert.ok((away.feats?.raidPeak ?? 0) >= 2);
    // Baskıncı borcu için hisseyi sattı; şehir hâlâ uzakta.
    raider.shares[away.playerCompanyId] = 0;
    engine.runDay();
    assert.equal(away.feats?.raidsRepelled, 1);
    assert.equal(runFacts(engine.getState()).counters.raidsRepelled, 1);
  });

  test('Çeyrek milyar tek şirketin değeri, Yarım milyar holding\'in toplamı (Codex #70)', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    const away = state.holding!.dormant[0]!.state;
    player(state).cash += 150_000_000;
    away.companies[away.playerCompanyId]!.cash += 150_000_000;
    recomputeNetWorth(state);
    recomputeNetWorth(away);
    const run = runFacts(state);
    assert.ok(run.worth > 250_000_000, 'holding 250 M üstünde');
    assert.ok(runValue(ACHIEVEMENT_BY_ID.quarter_billion!, run) < 250_000_000, 'hiçbir şirket 250 M değil');
    assert.equal(runValue(ACHIEVEMENT_BY_ID.half_billion!, run), run.worth);
  });

  test('tekel zaferi, sonra yeni rakip gelse de Tekel sayılıyor (Codex #70)', () => {
    const state = played(30, 6).getState();
    assert.ok(rivals(state).length > 0);
    // Eski kayıt: tekelle kazanılmış, oyun sürmüş, yeni bir rakip girmiş.
    state.victory = { day: 900, kind: 'monopoly', dismissed: true };
    assert.equal(runFacts(state).monopoly, true);
    assert.equal(runValue(ACHIEVEMENT_BY_ID.monopoly!, runFacts(state)), 1);
  });

  test('kapatılan şehir de açılmış sayılıyor (Codex #70)', () => {
    const state = played(10, 6).getState();
    state.holding = { foundingSeed: state.meta.seed, opened: 2, treasury: 0, dormant: [], closedWins: 0 };
    assert.equal(runFacts(state).cities, 2);
    assert.equal(runValue(ACHIEVEMENT_BY_ID.second_city!, runFacts(state)), 2);
  });
});

describe('kariyer: koşunun özeti', () => {
  test('serbest oyun, tekel, holding: kimlik şehirden şehre aynı', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    const key = runKeyOf(state);
    assert.equal(key, `${state.meta.createdAtIso}:${state.meta.seed}`);
    let run = runFacts(state);
    assert.equal(run.mode, 'free');
    assert.equal(run.cities, 1);
    assert.equal(run.monopoly, false);

    // Zafer ve kasa: holding açılabiliyor.
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    run = runFacts(state);
    assert.equal(run.key, key, 'yeni şehirde koşu aynı');
    assert.equal(run.cities, 2);
    assert.deepEqual(run.wins, [{ day: 420, citySize: 'standard' }]);
    assert.ok(engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    assert.equal(runKeyOf(engine.getState()), key, 'şehir değişince koşu aynı');

    // Tekel: oynanan şehirde rakip kalmadı.
    state = engine.getState();
    for (const rival of rivals(state)) delete state.companies[rival.id];
    assert.equal(runFacts(state).monopoly, true);
  });

  test('eski holding kaydında kurucu şehir kapanınca koşunun kimliği değişmiyor (Codex #70)', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.meta.createdAtIso = '2026-01-01T00:00:00.000Z';
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    state.meta.createdAtIso = '2026-02-01T00:00:00.000Z';
    // Tur 41 öncesi kayıt: kuruluş anı yazılı değil, şehirlerin en erkeninden okunuyor.
    delete state.holding!.foundedAtIso;
    const key = runKeyOf(state);
    assert.ok(key.startsWith('2026-01-01'), key);
    state.holding!.dormant[0]!.state.gameOver = { day: 400, byCompanyId: rivals(state)[0]!.id };
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(engine.getState().holding!.dormant.length, 0);
    assert.equal(runKeyOf(engine.getState()), key, 'kurucu şehir kapandıktan sonra da aynı koşu');
  });

  test('kapatılan şehrin katkısı koşuda kalıyor, sonraki ilerleme üstüne ekleniyor (Codex #70)', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    const lost = state.holding!.dormant[0]!.state;
    (lost.feats ??= {}).contractsDone = 4;
    lost.companies[lost.playerCompanyId]!.acquisitions = 2;
    lost.companies[lost.playerCompanyId]!.issues = 1;
    lost.bubblesCaught = (lost.bubblesCaught ?? 0) + 3;
    const before = runFacts(state);
    lost.gameOver = { day: 400, byCompanyId: rivals(lost)[0]!.id };
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    state = engine.getState();
    assert.equal(state.holding!.dormant.length, 0);
    (state.feats ??= {}).contractsDone = (state.feats.contractsDone ?? 0) + 1;
    const after = runFacts(state);
    assert.equal(after.counters.contractsDone, before.counters.contractsDone + 1, '4 + 1');
    assert.deepEqual(
      [after.acquisitions, after.ipo, after.bubbles, after.quests],
      [before.acquisitions, true, before.bubbles, before.quests],
    );

    // Yerine yeni şehir açılınca da kapatılanların payı kalıyor (Codex #70).
    state.victory = { day: 300, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    (state.feats ??= {}).contractsDone = 1;
    const reopened = runFacts(state);
    assert.equal(reopened.counters.contractsDone, after.counters.contractsDone + 1, '4 + 1 + 1');
    assert.equal(reopened.acquisitions, after.acquisitions);
    assert.equal(reopened.ipo, true);
  });

  test('yeni şehir açılınca kapatılan şehrin zaferi holding\'de kalıyor', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    // Kurucu şehir (zaferli) kaybedilip kapatılıyor; yeni şehirde zafer var, bir şehir daha açılıyor.
    state.holding!.dormant[0]!.state.gameOver = { day: 500, byCompanyId: rivals(state.holding!.dormant[0]!.state)[0]!.id };
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(engine.getState().holding!.closedWins, 1);
    state = engine.getState();
    state.victory = { day: 300, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    assert.equal(state.holding!.closedWins, 1, 'kapatılan şehrin zaferi');
    assert.equal(runFacts(state).wins.length + runFacts(state).closedWins, 2);
  });

  test('kapatılan şehrin zafer yolu koşunun yollarında kalıyor (Codex #91)', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true, path: 'realestate' };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    state = engine.getState();
    state.victory = { day: 300, kind: 'tycoon', dismissed: true, path: 'takeover' };
    assert.deepEqual([...(runFacts(state).paths ?? [])].sort(), ['realestate', 'takeover']);
    // Kurucu şehir (gayrimenkulle kazanmıştı) kaybedilip kapatılıyor: yolu holding'de kalmalı.
    state.holding!.dormant[0]!.state.gameOver = { day: 500, byCompanyId: rivals(state.holding!.dormant[0]!.state)[0]!.id };
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    state = engine.getState();
    assert.deepEqual([...(runFacts(state).paths ?? [])].sort(), ['realestate', 'takeover'], 'kapatılan şehrin yolu');
    // Aynı yoldan ikinci kapatma listeyi büyütmüyor.
    assert.deepEqual(state.holding!.closedPaths, ['realestate']);
  });

  test('kurucu şehir kapanınca koşunun kurucu boyutu değişmiyor (Codex #70)', () => {
    const engine = played(30, 6);
    let state = engine.getState();
    state.victory = { day: 420, kind: 'tycoon', dismissed: true };
    player(state).cash = 30_000_000;
    recomputeNetWorth(state);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'large', capital: 8_000_000 }).ok);
    state = engine.getState();
    assert.equal(runFacts(state).citySize, 'standard');
    state.holding!.dormant[0]!.state.gameOver = { day: 400, byCompanyId: rivals(state.holding!.dormant[0]!.state)[0]!.id };
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(runFacts(engine.getState()).citySize, 'standard', 'kurucu şehir standarttı');
  });

  test('lig ve senaryo kendi kipiyle; senaryonun sayaçları devir gününden', () => {
    assert.equal(runFacts(createLeagueGame('2026-W40', 'Lig AŞ', null)).mode, 'league');
    for (const id of ['crisis', 'holding']) {
      const state = createScenarioGame(id, { companyName: 'Senaryo AŞ' });
      const run = runFacts(state);
      assert.equal(run.mode, 'scenario');
      assert.equal(run.scenarioId, id);
      assert.deepEqual(Object.values(run.counters).filter((v) => v > 0), [], `${id}: ön tarih sayılmadı`);
      assert.equal(run.acquisitions + run.bubbles + run.quests + run.sponsored, 0, id);
    }
  });
});

describe('kariyer: rozet kuralları', () => {
  test('zafer süzgeci: gün, zorluk, şehir boyutu; senaryoda sayılmıyor', () => {
    const blitz = ACHIEVEMENT_BY_ID.blitz!;
    const hard = ACHIEVEMENT_BY_ID.hard_victory!;
    const big = ACHIEVEMENT_BY_ID.big_city!;
    const first = ACHIEVEMENT_BY_ID.first_victory!;
    const quick = facts({ wins: [{ day: 480, citySize: 'standard' }] });
    assert.equal(runValue(blitz, quick), 1);
    assert.equal(runValue(blitz, facts({ wins: [{ day: 500, citySize: 'standard' }] })), 0, '500. gün sayılmıyor');
    assert.equal(runValue(blitz, { ...quick, difficulty: 'easy' }), 0, 'Rahat sayılmıyor');
    assert.equal(runValue(hard, quick), 0);
    assert.equal(runValue(hard, { ...quick, difficulty: 'hard' }), 1);
    assert.equal(runValue(big, quick), 0);
    assert.equal(runValue(big, facts({ wins: [{ day: 900, citySize: 'large' }] })), 1);
    assert.equal(runValue(first, facts({ closedWins: 1 })), 1, 'kapatılan şehrin zaferi süzgeçsiz zafere sayılıyor');
    assert.equal(runValue(blitz, facts({ closedWins: 1 })), 0);
    assert.equal(runValue(first, { ...quick, mode: 'scenario' }), 0);
    assert.equal(runValue(ACHIEVEMENT_BY_ID.first_takeover!, facts({ mode: 'scenario', acquisitions: 1 })), 1, 'devralma senaryoda da');
  });

  test('ek kural rozetleri (Tur 45): Dengeli ve üstünde iki kural ve dört kural; kural koşudan', () => {
    const house = ACHIEVEMENT_BY_ID.house_rules!;
    const all = ACHIEVEMENT_BY_ID.all_rules!;
    const win = facts({ wins: [{ day: 700, citySize: 'standard' }] });
    assert.equal(runValue(house, win), 0, 'kuralsız zafer sayılmıyor');
    assert.equal(runValue(house, { ...win, modifiers: ['storms'] }), 0, 'tek kural yetmiyor');
    assert.equal(runValue(house, { ...win, modifiers: ['storms', 'scarce_land'] }), 1);
    assert.equal(runValue(house, { ...win, difficulty: 'easy', modifiers: ['storms', 'scarce_land'] }), 0, 'Rahat sayılmıyor');
    const four: RunFacts['modifiers'] = ['storms', 'hungry_rivals', 'tight_credit', 'scarce_land'];
    assert.equal(runValue(all, { ...win, modifiers: ['storms', 'hungry_rivals', 'tight_credit'] }), 0);
    assert.equal(runValue(all, { ...win, modifiers: four }), 1);
    assert.equal(runValue(all, { ...win, difficulty: 'hard', modifiers: four }), 1);
    assert.equal(runValue(all, { ...win, difficulty: 'easy', modifiers: four }), 0, 'Rahat sayılmıyor');
    assert.equal(runValue(all, { ...facts(), modifiers: ['storms', 'hungry_rivals', 'tight_credit', 'scarce_land'] }), 0, 'zafer yoksa sayılmıyor');
    // Koşunun özeti kuralları taşıyor; kuralsız koşuda alan yok.
    assert.deepEqual(runFacts(createNewGame({ seed: 5, companyName: 'Kural AŞ', modifiers: ['scarce_land', 'storms'] })).modifiers, ['storms', 'scarce_land']);
    assert.equal(runFacts(createNewGame({ seed: 5, companyName: 'Kural AŞ' })).modifiers, undefined);
  });

  test('koşu rozeti en iyi koşudan, kariyer rozeti toplamdan', () => {
    const runs = [
      facts({ key: 'a', acquisitions: 2, bubbles: 30, counters: { ...facts().counters, motionsWon: 3 }, league: 'finished' }),
      facts({ key: 'b', acquisitions: 5, bubbles: 25, counters: { ...facts().counters, motionsWon: 1 } }),
    ];
    const input = { runs, scenarioStars: {}, archived: { totals: { motionsWon: 1 } } };
    const serial = achievementStatus(ACHIEVEMENT_BY_ID.serial_acquirer!, input);
    assert.deepEqual([serial.value, serial.done, serial.runKey], [5, true, 'b']);
    assert.equal(careerTotals(input).bubbles, 55);
    assert.equal(achievementStatus(ACHIEVEMENT_BY_ID.bubble_hunter!, input).done, true);
    assert.equal(achievementStatus(ACHIEVEMENT_BY_ID.council_voice!, input).value, 5, 'budanan koşuların toplamı da');
    assert.equal(achievementStatus(ACHIEVEMENT_BY_ID.league_player!, input).done, true);
    assert.equal(isRunScoped(ACHIEVEMENT_BY_ID.council_voice!), false);
  });

  test('günün koşusu "Ligde" rozetini açmıyor: rozet bir haftayı istiyor (Codex #82)', () => {
    const daily = { runs: [facts({ key: 'g', league: 'finished', leagueKind: 'day' })], scenarioStars: {} };
    assert.equal(careerTotals(daily).leagueRuns, 0);
    assert.equal(achievementStatus(ACHIEVEMENT_BY_ID.league_player!, daily).done, false);
    const weekly = { runs: [...daily.runs, facts({ key: 'h', league: 'finished' })], scenarioStars: {} };
    assert.equal(careerTotals(weekly).leagueRuns, 1);
    // Koşunun özeti günün koşusunu işaretliyor, haftanınkini değil.
    assert.equal(runFacts(createLeagueGame('2026-10-22', 'Gün AŞ', null)).leagueKind, 'day');
    assert.equal(runFacts(createLeagueGame('2026-W44', 'Hafta AŞ', null)).leagueKind, undefined);
  });

  test('senaryo yıldızları ve farklı CEO zaferleri', () => {
    const stars = Object.fromEntries(SCENARIOS.map((s) => [s.id, 1]));
    const tour = achievementStatus(ACHIEVEMENT_BY_ID.scenario_tour!, { runs: [], scenarioStars: stars });
    assert.deepEqual([tour.value, tour.target, tour.done], [SCENARIOS.length, SCENARIOS.length, true]);
    const perfect = achievementStatus(ACHIEVEMENT_BY_ID.scenario_perfect!, { runs: [], scenarioStars: stars });
    assert.deepEqual([perfect.value, perfect.done], [SCENARIOS.length, false]);

    const win = [{ day: 600, citySize: 'standard' as const }];
    const runs = [
      facts({ key: 'a', ceoId: 'muhendis', wins: win }),
      facts({ key: 'b', ceoId: 'muhendis', wins: win }),
      facts({ key: 'c', ceoId: 'sef', wins: win }),
      facts({ key: 'd', ceoId: 'modaci', wins: win, mode: 'scenario' }),
      facts({ key: 'e', ceoId: 'hekim' }),
    ];
    const ceos = achievementStatus(ACHIEVEMENT_BY_ID.three_ceos!, { runs, scenarioStars: {} });
    assert.equal(ceos.value, 2, 'aynı CEO bir kez, senaryo ve zafersiz koşu sayılmıyor');
    const more = achievementStatus(ACHIEVEMENT_BY_ID.three_ceos!, { runs, scenarioStars: {}, archived: { victoryCeos: ['girisimci'] } });
    assert.equal(more.done, true);
  });

  test('zaferin yolu koşu özetinde; Üç yol farklı yolları sayıyor, senaryo ve budanan koşu dahil (Tur 61)', () => {
    const engine = played(30);
    const state = engine.getState();
    state.victory = { day: 30, kind: 'tycoon', path: 'realestate' };
    assert.deepEqual(runFacts(state).wins, [{ day: 30, citySize: 'standard', path: 'realestate' }]);
    delete state.victory.path;
    assert.deepEqual(runFacts(state).wins, [{ day: 30, citySize: 'standard' }], 'eski kayıtta yol yok');

    const at = (path?: 'retail' | 'takeover' | 'realestate' | 'energy' | 'freight') => [{ day: 600, citySize: 'standard' as const, ...(path ? { path } : {}) }];
    const runs = [
      facts({ key: 'a', wins: at('retail') }),
      facts({ key: 'b', wins: at('retail') }),
      facts({ key: 'c', wins: at('realestate') }),
      facts({ key: 'd', wins: at('energy'), mode: 'scenario' }),
      facts({ key: 'e', wins: at() }),
      facts({ key: 'f' }),
    ];
    const def = ACHIEVEMENT_BY_ID.three_paths!;
    assert.equal(isRunScoped(def), false, 'kariyer kapsamında');
    const paths = achievementStatus(def, { runs, scenarioStars: {} });
    assert.deepEqual([paths.value, paths.target, paths.done], [2, 3, false], 'aynı yol bir kez; senaryo, yolsuz eski zafer ve zafersiz koşu sayılmıyor');
    const more = achievementStatus(def, { runs, scenarioStars: {}, archived: { victoryPaths: ['takeover'] } });
    assert.equal(more.done, true, 'budanan koşunun yolu');
  });

  test('her rozetin bir durumu var; boş kariyerde hiçbiri açık değil', () => {
    const statuses = achievementStatuses({ runs: [], scenarioStars: {} });
    assert.equal(statuses.length, ACHIEVEMENTS.length);
    assert.deepEqual(statuses.filter((s) => s.done).map((s) => s.def.id), []);
  });
});
