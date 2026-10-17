import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUBBLE_BY_ID, BUBBLE_TIMING, QUEST_TIMING } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { dayOfMonth, formatDate, getPlayer, nextMonthStart } from '../src/selectors';
import { agenda } from '../src/agenda';
import { purchaseBlocker } from '../src/actions';
import { createLeagueGame, replayRun, runFromState } from '../src/league';
import { boostMultiplier } from '../src/systems/cards';
import { recomputeNetWorth } from '../src/systems/city';
import {
  claimBubble,
  claimQuest,
  questValue,
  runBubbleTick,
  runQuestTick,
  settleBubbleAway,
} from '../src/systems/opportunities';
import type { BubbleState, GameState, QuestBoard } from '../src/types';
import { playerStrategy } from './proxy';

function play(seed: number, days: number, catchBubbles = false): GameEngine {
  const engine = new GameEngine(createNewGame({ seed }));
  for (let day = 1; day <= days; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    if (catchBubbles && engine.getState().bubble) engine.dispatch({ type: 'CLAIM_BUBBLE' });
    engine.runDay();
  }
  return engine;
}

function putBubble(state: GameState, kind: BubbleState['kind'], extra: Partial<BubbleState> = {}): BubbleState {
  const outlet = Object.values(state.buildings).find((b) => b.companyId === state.playerCompanyId)!;
  const bubble: BubbleState = {
    kind,
    tileId: outlet.tileId,
    offeredDay: state.time.day,
    untilDay: state.time.day + BUBBLE_TIMING.lifetimeDays - 1,
    amount: 50_000,
    ...extra,
  };
  state.bubble = bubble;
  return bubble;
}

describe('takvim', () => {
  test('ay başı UTC takviminden; tarih çubuğu da UTC', () => {
    assert.equal(nextMonthStart(0), 31);
    assert.equal(nextMonthStart(30), 31);
    assert.equal(nextMonthStart(31), 59);
    assert.equal(dayOfMonth(31), 1);
    assert.equal(dayOfMonth(59), 1);
    assert.ok(formatDate(0).includes('2026'), formatDate(0));
  });
});

describe('fırsat balonları', () => {
  test('normal oyunda takvimle çıkıyor, ömrü bitince sönüyor', () => {
    const engine = play(7, 200);
    const state = engine.getState();
    assert.ok((state.bubblesShown ?? 0) >= 4, `balon sayısı ${state.bubblesShown}`);
    assert.ok(state.nextBubbleDay !== undefined);
    // Bir balonu ömrü boyunca izle: son gün hâlâ yakalanabilir, ertesi gün yok.
    const watch = new GameEngine(structuredClone(state));
    while (!watch.getState().bubble) watch.runDay();
    const bubble = watch.getState().bubble!;
    assert.equal(bubble.untilDay - bubble.offeredDay + 1, BUBBLE_TIMING.lifetimeDays);
    while (watch.getState().time.day < bubble.untilDay) watch.runDay();
    assert.ok(watch.getState().bubble, 'son gün balon yok');
    watch.runDay();
    assert.ok(!watch.getState().bubble || watch.getState().bubble!.offeredDay !== bubble.offeredDay);
  });

  test('nakit balonu yakalanınca tutar kasaya giriyor, balon kalkıyor', () => {
    const state = play(7, 60).getState();
    const bubble = putBubble(state, 'order', { amount: 82_000 });
    const before = getPlayer(state).cash;
    assert.ok(claimBubble(state).ok);
    assert.equal(getPlayer(state).cash - before, bubble.amount);
    assert.equal(state.bubble, undefined);
    assert.equal(state.bubblesCaught, 1);
    assert.equal(claimBubble(state).ok, false, 'boş şehirde ikinci yakalama yok');
  });

  test('kuyruk balonu: kategoride çekicilik yarından başlıyor, tam süre ve bayrağa bağlı', () => {
    const state = play(7, 60).getState();
    const def = BUBBLE_BY_ID.rush;
    assert.equal(def.reward.kind, 'boost');
    if (def.reward.kind !== 'boost') return;
    putBubble(state, 'rush', { category: 'retail', amount: 0 });
    const day = state.time.day;
    assert.ok(claimBubble(state).ok);
    const id = state.playerCompanyId;
    state.time.day = day + 1;
    assert.equal(boostMultiplier(state, id, 'attraction', 'retail'), def.reward.multiplier);
    assert.equal(boostMultiplier(state, id, 'attraction', 'dining'), 1);
    state.time.day = day + def.reward.days;
    assert.equal(boostMultiplier(state, id, 'attraction', 'retail'), def.reward.multiplier, 'son gün');
    state.time.day = day + def.reward.days + 1;
    assert.equal(boostMultiplier(state, id, 'attraction', 'retail'), 1, 'süre bitti');

    // Kartlar kapalı: balonun etkisi sürüyor; balonlar kapalı: etkisi kalkıyor.
    state.time.day = day + 2;
    state.flags.cards = false;
    assert.equal(boostMultiplier(state, id, 'attraction', 'retail'), def.reward.multiplier);
    state.flags.bubbles = false;
    assert.equal(boostMultiplier(state, id, 'attraction', 'retail'), 1);
  });

  test('indirimli arsa: kasa yetmezse balon bekliyor, yetince parsel oyuncunun', () => {
    const state = play(7, 60).getState();
    const tile = state.map.tiles.find((t) => !t.structureId && !t.buildingId && purchaseBlocker(state, t.id) === null)!;
    putBubble(state, 'parcel', { tileId: tile.id, amount: 120_000 });
    const player = getPlayer(state);
    const cash = player.cash;
    player.cash = 1_000;
    const refused = claimBubble(state);
    assert.equal(refused.ok, false);
    assert.ok(state.bubble, 'para yetmeyince balon sönmüyor');
    player.cash = cash;
    assert.ok(claimBubble(state).ok);
    assert.equal(tile.ownerId, player.id);
    assert.equal(player.cash, cash - 120_000);
  });

  test('indirimli arsa: ömrü içinde parsele yapı dikilirse indirimle verilmiyor, balon sönüyor (Codex #63)', () => {
    const state = play(7, 60).getState();
    const tile = state.map.tiles.find((t) => !t.structureId && !t.buildingId && purchaseBlocker(state, t.id) === null)!;
    putBubble(state, 'parcel', { tileId: tile.id, amount: 120_000 });
    const player = getPlayer(state);
    const cash = player.cash;
    // Şehir büyümesi parsele devredilebilir bir yapı dikti.
    tile.structureId = 'row_houses';
    const refused = claimBubble(state);
    assert.equal(refused.ok, false);
    assert.equal(tile.ownerId, null, 'yapılı parsel indirimle verildi');
    assert.equal(player.cash, cash);
    assert.equal(state.bubble, undefined);

    // Günün adımı da elden çıkan parselin balonunu söndürüyor.
    const other = state.map.tiles.find((t) => t.id !== tile.id && !t.structureId && !t.buildingId && purchaseBlocker(state, t.id) === null)!;
    putBubble(state, 'parcel', { tileId: other.id, amount: 120_000 });
    other.structureId = 'row_houses';
    runBubbleTick(state);
    assert.equal(state.bubble, undefined);
  });

  test('bayrak kapalıyken balon yok, uzaktaki şehirde sönüyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 7 }));
    engine.getState().flags.bubbles = false;
    for (let day = 0; day < 150; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    assert.equal(engine.getState().bubble, undefined);
    assert.equal(engine.getState().bubblesShown, undefined);

    const state = play(7, 60).getState();
    putBubble(state, 'order');
    settleBubbleAway(state);
    assert.equal(state.bubble, undefined);
    putBubble(state, 'order');
    state.flags.bubbles = false;
    runBubbleTick(state);
    assert.equal(state.bubble, undefined);
  });

  test('balon zarı dışsal: state.rng dokunulmuyor, aynı tohum aynı balonlar', () => {
    const a = play(11, 140).getState();
    const b = play(11, 140).getState();
    assert.deepEqual(a.bubble, b.bubble);
    assert.equal(a.bubblesShown, b.bubblesShown);
    const off = new GameEngine(createNewGame({ seed: 11 }));
    off.getState().flags.bubbles = false;
    off.getState().flags.quests = false;
    const on = new GameEngine(createNewGame({ seed: 11 }));
    for (let day = 0; day < 60; day++) {
      off.runDay();
      on.runDay();
    }
    assert.deepEqual(on.getState().rng, off.getState().rng);
  });

  test('lig: balon yakalamaları günlüğe giriyor ve tekrar aynı skoru veriyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W41', 'Balon AŞ', null));
    let caught = 0;
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      if (state.bubble && engine.dispatch({ type: 'CLAIM_BUBBLE' }).ok) caught++;
      engine.runDay();
    }
    assert.ok(caught > 0, 'ligde hiç balon yakalanmadı');
    const run = runFromState(engine.getState())!;
    assert.ok(run.log.some(([, command]) => command.type === 'CLAIM_BUBBLE'));
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });

  test('bina tahmini balon üretmiyor, görev ödülünü saymıyor', async () => {
    const { projectBuilding } = await import('../src/projection');
    const state = play(7, 80).getState();
    const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId);
    assert.ok(tile);
    delete state.bubble;
    const ask = () => projectBuilding(state, state.playerCompanyId, 'corner_shop', tile.id, 120)!;
    state.nextBubbleDay = state.time.day + 3;
    const busy = ask();
    state.flags.bubbles = false;
    state.flags.quests = false;
    const quiet = ask();
    delete state.flags.bubbles;
    delete state.flags.quests;
    assert.deepEqual(busy, quiet);
  });
});

describe('görev panosu', () => {
  test('ilk ay başında üç farklı görevle kuruluyor, ay sonunda yenileniyor', () => {
    const engine = play(3, 31);
    const board = engine.getState().quests;
    assert.ok(board, 'pano kurulmadı');
    assert.equal(board.startDay, 31);
    assert.equal(board.endDay, 59);
    assert.equal(board.items.length, QUEST_TIMING.slots);
    assert.equal(new Set(board.items.map((q) => q.defId)).size, board.items.length);
    for (const quest of board.items) assert.ok(quest.reward >= QUEST_TIMING.rewardMin);
    assert.ok(agenda(engine.getState()).some((item) => item.kind === 'quests'));

    while (engine.getState().time.day < 59) engine.runDay();
    assert.equal(engine.getState().quests?.startDay, 59);
    assert.equal(engine.getState().quests?.endDay, 90);
  });

  test('tamamlanan görev işaretleniyor; ödül dokununca, bir kez; ay bitince alınmayan düşüyor', () => {
    const engine = play(3, 31);
    const state = engine.getState();
    const board: QuestBoard = {
      startDay: state.time.day,
      endDay: nextMonthStart(state.time.day),
      items: [
        { defId: 'cash', base: 0, target: 1_000, reward: 77_000 },
        { defId: 'outlets', base: 0, target: 50, reward: 5_000 },
      ],
    };
    state.quests = board;
    const before = getPlayer(state).cash;
    runQuestTick(state);
    assert.equal(board.items[0]!.doneDay, state.time.day);
    assert.equal(state.news[0]!.tone, 'good');
    assert.equal(getPlayer(state).cash, before, 'ödül kendiliğinden ödenmiyor');
    assert.ok(agenda(state).some((item) => item.kind === 'quests' && item.urgency === 1), 'gündemde ödül hazır');

    assert.equal(engine.dispatch({ type: 'CLAIM_QUEST', index: 1 }).ok, false, 'bitmeyen görevin ödülü yok');
    assert.equal(engine.dispatch({ type: 'CLAIM_QUEST', index: 5 }).ok, false);
    assert.ok(engine.dispatch({ type: 'CLAIM_QUEST', index: 0 }).ok);
    assert.equal(getPlayer(state).cash - before, 77_000);
    assert.equal(state.questsDone, 1);
    assert.equal(engine.dispatch({ type: 'CLAIM_QUEST', index: 0 }).ok, false, 'ikinci ödül yok');

    // Alınmayan ödül ay sonunda panoyla birlikte gidiyor.
    board.items[1]!.doneDay = state.time.day;
    while (engine.getState().time.day < board.endDay) engine.runDay();
    assert.notEqual(engine.getState().quests?.startDay, board.startDay);
    assert.equal(engine.getState().questsDone, 1);
  });

  test('lig: görev ödülleri günlüğe giriyor ve tekrar aynı skoru veriyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W42', 'Görev AŞ', null));
    let claimed = 0;
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      state.quests?.items.forEach((quest, index) => {
        if (quest.doneDay !== undefined && !quest.claimed && engine.dispatch({ type: 'CLAIM_QUEST', index }).ok) claimed++;
      });
      engine.runDay();
    }
    assert.ok(claimed > 0, 'ligde hiç görev ödülü alınmadı');
    const run = runFromState(engine.getState())!;
    assert.ok(run.log.some(([, command]) => command.type === 'CLAIM_QUEST'));
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });

  test('pay görevi marka da veriyor; geçme görevinde rakip çıkınca yarış bitmiş sayılıyor', () => {
    const state = play(3, 31).getState();
    const player = getPlayer(state);
    player.marketShare.retail = 0.4;
    const brand = player.brand.retail ?? 0;
    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    rival.netWorth = player.netWorth * 1.2;
    const board: QuestBoard = {
      startDay: state.time.day,
      endDay: nextMonthStart(state.time.day),
      items: [
        { defId: 'share', base: 0, target: 0.35, reward: 10_000, category: 'retail' },
        { defId: 'overtake', base: 0, target: 1, reward: 10_000, rivalId: rival.id, rivalName: rival.name },
      ],
    };
    state.quests = board;
    runQuestTick(state);
    assert.ok(board.items[0]!.doneDay !== undefined);
    assert.ok(claimQuest(state, 0).ok);
    assert.ok((player.brand.retail ?? 0) > brand);
    assert.equal(board.items[1]!.doneDay, undefined, 'rakip hâlâ önde');
    delete state.companies[rival.id];
    assert.equal(questValue(state, board, board.items[1]!), 1);
  });

  test('geçme görevi günün net değeriyle aynı gün tamamlanıyor; net değer geçmişine günde bir örnek (Codex #63)', () => {
    const engine = play(3, 31);
    const state = engine.getState();
    const player = getPlayer(state);
    const rival = Object.values(state.companies).find((c) => !c.isPlayer && c.netWorth > player.netWorth)
      ?? Object.values(state.companies).find((c) => !c.isPlayer)!;
    rival.cash += Math.max(0, player.netWorth - rival.netWorth) + 100_000;
    recomputeNetWorth(state);
    assert.ok(rival.netWorth > player.netWorth);
    state.quests = {
      startDay: state.time.day,
      endDay: nextMonthStart(state.time.day + 1),
      items: [{ defId: 'overtake', base: 0, target: 1, reward: 10_000, rivalId: rival.id, rivalName: rival.name }],
    };
    // Bu gün oyuncu rakibi geçiyor (kasaya giren para); dünkü net değer eski.
    player.cash += rival.netWorth - player.netWorth + 5_000_000;
    const history = player.netWorthHistory.length;
    const full = history >= 120;
    engine.runDay();
    assert.equal(state.quests!.items[0]!.doneDay, state.time.day, 'geçiş bir gün geç sayıldı');
    if (!full) assert.equal(player.netWorthHistory.length, history + 1, 'net değer geçmişine çift örnek');
  });

  test('sayaç görevleri pano kurulduktan sonrasını sayıyor', () => {
    const engine = play(3, 31);
    const state = engine.getState();
    const board: QuestBoard = {
      startDay: state.time.day,
      endDay: nextMonthStart(state.time.day),
      items: [
        { defId: 'outlets', base: 0, target: 1, reward: 10_000 },
        { defId: 'parcels', base: state.map.tiles.filter((t) => t.ownerId === state.playerCompanyId).length, target: 2, reward: 10_000 },
      ],
    };
    state.quests = board;
    assert.equal(questValue(state, board, board.items[0]!), 0, 'eski mağazalar sayılmıyor');
    assert.equal(questValue(state, board, board.items[1]!), 0);
    getPlayer(state).cash += 10_000_000;
    const free = state.map.tiles.filter((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId);
    let bought = 0;
    for (const tile of free) {
      if (bought === 2) break;
      if (engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) bought++;
    }
    assert.equal(questValue(state, board, board.items[1]!), 2);
  });

  test('panonun son gününde yapılan eylem görevi hemen tamamlıyor, ödül alınabiliyor (Codex #63)', () => {
    const engine = play(3, 31);
    const state = engine.getState();
    const player = getPlayer(state);
    player.cash += 10_000_000;
    // Panonun son günü: bir sonraki günlük adım panoyu yeniliyor.
    state.quests = {
      startDay: state.time.day - 20,
      endDay: state.time.day + 1,
      items: [{ defId: 'parcels', base: state.map.tiles.filter((t) => t.ownerId === player.id).length, target: 1, reward: 40_000 }],
    };
    const tile = state.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId && purchaseBlocker(state, t.id) === null)!;
    assert.ok(engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok);
    assert.equal(state.quests.items[0]!.doneDay, state.time.day, 'son gün alınan parsel sayılmadı');
    const cash = player.cash;
    assert.ok(engine.dispatch({ type: 'CLAIM_QUEST', index: 0 }).ok);
    assert.equal(player.cash, cash + 40_000);
  });

  test('bayrak kapalıyken pano yok', () => {
    const engine = new GameEngine(createNewGame({ seed: 3 }));
    engine.getState().flags.quests = false;
    for (let day = 0; day < 70; day++) engine.runDay();
    assert.equal(engine.getState().quests, undefined);
    const state = play(3, 40).getState();
    assert.ok(state.quests);
    state.flags.quests = false;
    runQuestTick(state);
    assert.equal(state.quests, undefined);
  });
});
