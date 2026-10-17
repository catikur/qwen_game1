import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, CONSORTIUM, getDifficulty } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { getPlayer } from '../src/selectors';
import { agenda } from '../src/agenda';
import { sharesHeld, sharesOutstanding, TOTAL_SHARES } from '../src/systems/equity';
import { consortiumPressure, runConsortiumTick, settleConsortiumAway } from '../src/systems/consortium';
import type { GameState } from '../src/types';
import { playerStrategy } from './proxy';

/**
 * Güçlü ama pasif oyuncu: vekil 400. güne kadar 5 günde bir oynuyor, sonra
 * el çekiyor. Konsorsiyum kurulana kadar ilerletilen durum bir kez
 * hesaplanıyor; her test kopyasıyla çalışıyor.
 */
let fixture: string | null = null;
function passiveLeader(): GameEngine {
  if (!fixture) {
    const engine = new GameEngine(createNewGame({ seed: 1 }));
    for (let day = 1; day <= 700 && !engine.getState().consortium; day++) {
      if (day <= 400 && day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    assert.ok(engine.getState().consortium, 'pasif liderin karşısında konsorsiyum kurulmadı');
    fixture = JSON.stringify(engine.getState());
  }
  return new GameEngine(JSON.parse(fixture) as GameState);
}

function freePlots(state: GameState): number[] {
  return state.map.tiles
    .filter((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId && state.districts[t.districtId]?.opensOnDay === undefined)
    .map((t) => t.id);
}

describe('rakip konsorsiyumu', () => {
  test('çok önde, yatırımı duran oyuncuya karşı kuruluyor: duyuru, gündem, savunma penceresi', () => {
    const engine = passiveLeader();
    const state = engine.getState();
    const consortium = state.consortium!;
    const pressure = consortiumPressure(state);
    assert.ok(pressure.lead >= CONSORTIUM.leadRatio);
    assert.ok(pressure.idleFor >= CONSORTIUM.idleDays);
    assert.ok(consortium.memberIds.length >= CONSORTIUM.minMembers && consortium.memberIds.length <= CONSORTIUM.maxMembers);
    const richest = Object.values(state.companies).filter((c) => !c.isPlayer).sort((a, b) => b.netWorth - a.netWorth)[0]!;
    assert.equal(consortium.leaderId, richest.id, 'önder en büyük rakip');
    assert.equal(consortium.startsDay - consortium.formedDay, CONSORTIUM.warningDays);
    assert.ok(state.news.some((item) => item.title.includes(richest.name) && item.body.includes(String(CONSORTIUM.workedBuilds))));
    const chip = agenda(state).find((item) => item.kind === 'consortium');
    assert.equal(chip?.daysLeft, consortium.startsDay - state.time.day);

    // Pencerede alım yok.
    const before = sharesHeld(state, consortium.leaderId, state.playerCompanyId);
    while (state.time.day < consortium.startsDay - 1) engine.runDay();
    assert.equal(sharesHeld(state, consortium.leaderId, state.playerCompanyId), before);
  });

  test('pencere bitince her gün ortak alım: tavanla sınırlı, bedeli üyeler paylaşıyor, hisse önderde', () => {
    const engine = passiveLeader();
    const state = engine.getState();
    const consortium = state.consortium!;
    while (state.time.day < consortium.startsDay - 1) engine.runDay();
    const player = getPlayer(state);
    const cap = Math.floor(
      (getDifficulty(state.difficulty).raidDailyCap * CONSORTIUM.capShare * sharesOutstanding(state, player.id)) / TOTAL_SHARES,
    );
    const others = consortium.memberIds.filter((id) => id !== consortium.leaderId);
    const before = sharesHeld(state, consortium.leaderId, player.id);
    const cashBefore = others.map((id) => state.companies[id]!.cash);
    // Yalnız konsorsiyum adımı: rakiplerin kendi harcamaları karışmasın.
    state.time.day = consortium.startsDay;
    runConsortiumTick(state);
    const bought = sharesHeld(state, consortium.leaderId, player.id) - before;
    assert.ok(bought > 0 && bought <= cap, `${bought} ≤ ${cap}`);
    others.forEach((id, index) => assert.ok(state.companies[id]!.cash < cashBefore[index]!, 'üye bedele katılmadı'));
    for (const id of others) assert.equal(sharesHeld(state, id, player.id), 0, 'hisse üyede değil önderde');
    assert.ok(state.news.some((item) => item.title === 'Konsorsiyum hisseni topluyor'), 'alım haberi yok');
  });

  test('savunmasız pasif lider devralınıyor; önder şirketi alıyor', () => {
    const engine = passiveLeader();
    const leaderId = engine.getState().consortium!.leaderId;
    for (let day = 0; day < 200 && !engine.getState().gameOver; day++) engine.runDay();
    assert.equal(engine.getState().gameOver?.byCompanyId, leaderId);
  });

  test('yatırıma dönüş (üç yeni bina) konsorsiyumu dağıtıyor; soğuma süresi', () => {
    const engine = passiveLeader();
    const state = engine.getState();
    const player = getPlayer(state);
    player.cash += 5_000_000;
    let built = 0;
    for (const tileId of freePlots(state)) {
      if (built === CONSORTIUM.workedBuilds) break;
      if (!engine.dispatch({ type: 'BUY_TILE', tileId }).ok) continue;
      if (engine.dispatch({ type: 'BUILD', tileId, defId: 'corner_shop' }).ok) built++;
    }
    assert.equal(built, CONSORTIUM.workedBuilds);
    assert.ok(BUILDING_BY_ID['corner_shop']);
    engine.runDay();
    assert.equal(state.consortium, undefined);
    assert.equal(state.nextConsortiumDay, state.time.day + CONSORTIUM.cooldownDays);
    assert.ok(state.news.some((item) => item.body.includes('Yatırıma döndün')));
  });

  test('kontrol kilitlenince ve zafer gelince dağılıyor; zaferden sonra kurulmuyor', () => {
    const locked = passiveLeader().getState();
    // Kurumsal yatırımcı payı yarıyı buldu: kalan her hisse de yetmiyor.
    getPlayer(locked).investorShares = Math.ceil(sharesOutstanding(locked, locked.playerCompanyId) * 0.55);
    runConsortiumTick(locked);
    assert.equal(locked.consortium, undefined);
    assert.ok(locked.news[0]!.body.includes('kilitli'));

    const won = passiveLeader().getState();
    won.victory = { day: won.time.day, kind: 'tycoon' };
    runConsortiumTick(won);
    assert.equal(won.consortium, undefined);
    delete won.nextConsortiumDay;
    runConsortiumTick(won);
    assert.equal(won.consortium, undefined, 'zaferden sonra yeniden kuruldu');
  });

  test('etkin oynayan lidere kurulmuyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 1 }));
    for (let day = 1; day <= 560; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
      assert.equal(engine.getState().consortium, undefined, `${day}. günde kuruldu`);
    }
  });

  test('bayrak, baskınlar ya da laboratuvar kapalıyken yok; uzak şehirde dağılıyor; zar çekmiyor', () => {
    for (const flag of ['consortium', 'raids', 'randomEvents', 'npcCompetition'] as const) {
      const state = passiveLeader().getState();
      state.flags[flag] = false;
      runConsortiumTick(state);
      assert.equal(state.consortium, undefined, `${flag} kapalıyken sürüyor`);
    }
    const away = passiveLeader().getState();
    settleConsortiumAway(away);
    assert.equal(away.consortium, undefined);

    const state = passiveLeader().getState();
    const rng = JSON.stringify(state.rng);
    state.time.day = state.consortium!.startsDay;
    runConsortiumTick(state);
    assert.equal(JSON.stringify(state.rng), rng, 'konsorsiyum state.rng çekti');
  });
});
