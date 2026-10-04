import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PROFILES } from '@capital/content';
import { createNewGame } from '../src/worldgen';
import { ENTRY_DELAY_DAYS, ENTRY_FIRST_DAY, runEntrantTick } from '../src/systems/entrants';
import type { GameState } from '../src/types';

function withVacancy(day = ENTRY_FIRST_DAY): { state: GameState; removed: string } {
  const state = createNewGame({ seed: 4 });
  const removed = Object.values(state.companies).find((c) => !c.isPlayer)!.id;
  delete state.companies[removed];
  state.time.day = day;
  return { state, removed };
}

const rivals = (state: GameState) => Object.values(state.companies).filter((c) => !c.isPlayer).length;

describe('yeni rakip girişi', () => {
  test('dolu kadroda kimse girmiyor', () => {
    const state = createNewGame({ seed: 4 });
    state.time.day = 400;
    const before = rivals(state);
    runEntrantTick(state);
    assert.equal(rivals(state), before);
  });

  test('koltuk boşalınca önce haber, 45 gün sonra giriş', () => {
    const { state } = withVacancy();
    const before = rivals(state);
    runEntrantTick(state);
    assert.equal(rivals(state), before, 'aynı gün giriş yok');
    assert.match(state.news[0]!.title, /yeni bir şirket geliyor/);
    state.time.day += ENTRY_DELAY_DAYS - 1;
    runEntrantTick(state);
    assert.equal(rivals(state), before);
    state.time.day += 1;
    runEntrantTick(state);
    assert.equal(rivals(state), before + 1);
  });

  test('devralınan isim geri dönmüyor, yeni gelen katalogdan', () => {
    const { state, removed } = withVacancy();
    runEntrantTick(state);
    state.time.day += ENTRY_DELAY_DAYS;
    runEntrantTick(state);
    assert.equal(state.companies[removed], undefined);
    const entrant = state.rivalHistory!.at(-1)!;
    assert.ok(NPC_PROFILES.some((p) => p.id === entrant));
    assert.ok(state.companies[entrant]);
  });

  test('sermaye profilin başlangıcından az değil', () => {
    const { state } = withVacancy();
    runEntrantTick(state);
    state.time.day += ENTRY_DELAY_DAYS;
    runEntrantTick(state);
    const entrant = state.companies[state.rivalHistory!.at(-1)!]!;
    const profile = NPC_PROFILES.find((p) => p.id === entrant.id)!;
    assert.ok(entrant.cash >= profile.startingCash);
  });

  test('200. günden önce ve bayrak kapalıyken giriş yok', () => {
    const early = withVacancy(ENTRY_FIRST_DAY - 1).state;
    runEntrantTick(early);
    assert.equal(early.rivalVacancyDay, undefined);
    const off = withVacancy().state;
    off.flags.rivalEntry = false;
    runEntrantTick(off);
    assert.equal(off.rivalVacancyDay, undefined);
  });

  test('az rakiple kurulan şehre koltuk boşalmadan kimse girmiyor', () => {
    const state = createNewGame({ seed: 4, npcCount: 2 });
    state.time.day = 400;
    runEntrantTick(state);
    assert.equal(rivals(state), 2);
    assert.equal(state.rivalVacancyDay, undefined);
  });
});
