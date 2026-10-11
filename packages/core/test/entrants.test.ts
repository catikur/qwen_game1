import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PROFILES } from '@capital/content';
import { createNewGame } from '../src/worldgen';
import { ENTRY_DELAY_DAYS, ENTRY_FIRST_DAY, entryCooldown, runEntrantTick } from '../src/systems/entrants';
import { rivalProfile, rivalProfiles } from '../src/profiles';
import { GameEngine } from '../src/engine';
import { exportToJson, importFromJson } from '../../persistence/src/index';
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

  /** Kataloğun hepsi sahneye çıkmış, bir koltuk boş: büyük şehrin ilk devralmadan sonraki hâli. */
  function exhausted(seed = 4): GameState {
    const state = createNewGame({ seed, citySize: 'large' });
    const victim = Object.values(state.companies).find((c) => !c.isPlayer && c.profileId === 'kilit_market')!;
    delete state.companies[victim.id];
    state.time.day = 400;
    return state;
  }
  function enter(state: GameState): string {
    runEntrantTick(state);
    state.time.day += ENTRY_DELAY_DAYS;
    runEntrantTick(state);
    return state.rivalHistory!.at(-1)!;
  }

  test('katalog bitince yeni rakip üretiliyor (Tur 22)', () => {
    const state = exhausted();
    assert.equal(rivals(state), 7);
    const id = enter(state);
    assert.equal(rivals(state), 8);
    const profile = rivalProfile(state, id)!;
    assert.ok(profile, 'profil çözülüyor');
    assert.ok(!NPC_PROFILES.some((p) => p.id === id), 'katalog dışı');
    assert.ok(!NPC_PROFILES.some((p) => p.name === profile.name), `ad yeni: ${profile.name}`);
    assert.equal(state.companies[id]!.profileId, id);
    assert.match(state.news[0]!.title, new RegExp(profile.name));
  });

  test('doktrin sahnede eksik kalan kişilik, ağırlıklar kataloğun aynısı', () => {
    const state = exhausted();
    const profile = rivalProfile(state, enter(state))!;
    // Kilit Market (ucuzcu) devralındı: sahnede tek ucuzcu kaldı, diğer
    // kişilikler ikişer ya da genişlemeci/teknoloji birer. En az olan önce
    // kataloğun sırasıyla: genişlemeci.
    const template = NPC_PROFILES.find((p) => p.trait === profile.trait && p.marginWeight === profile.marginWeight)!;
    assert.ok(template, `kişilik ${profile.trait}`);
    for (const key of ['startingCash', 'demandWeight', 'priceMultiplier', 'aggression'] as const) {
      assert.equal(profile[key], template[key], key);
    }
    assert.equal(profile.trait, 'expansionist');
  });

  test('renk sahnede yok; aynı tohum aynı rakibi üretiyor', () => {
    const a = exhausted(9);
    const b = exhausted(9);
    const pa = rivalProfile(a, enter(a))!;
    const pb = rivalProfile(b, enter(b))!;
    assert.deepEqual(pa, pb);
    const others = Object.values(a.companies).filter((c) => c.id !== pa.id).map((c) => c.color);
    assert.ok(!others.includes(pa.color), pa.color);
  });

  test('üretilen rakip rakip turunda, kayıtta ve kayıttan dönüşte yaşıyor', () => {
    const state = exhausted();
    const id = enter(state);
    assert.ok(rivalProfiles(state).some((p) => p.id === id));
    state.companies[id]!.cash = 5_000_000;
    // Gerçek günler: rakip kararı pazarın talep ve fırsat verisini okuyor.
    const engine = new GameEngine(state);
    for (let i = 0; i < 21; i++) engine.runDay();
    assert.ok(Object.values(state.buildings).some((b) => b.companyId === id), 'üç haftada bina kurdu');
    const restored = importFromJson(exportToJson(state));
    assert.ok(restored.ok);
    if (!restored.ok) return;
    assert.deepEqual(rivalProfile(restored.state, id), rivalProfile(state, id));
  });

  test('ikinci üretilen rakibin adı ve rengi tekrar etmiyor', () => {
    const state = exhausted();
    const first = rivalProfile(state, enter(state))!;
    delete state.companies[first.id];
    state.time.day += entryCooldown(8);
    const second = rivalProfile(state, enter(state))!;
    assert.notEqual(second.name.split(' ')[0], first.name.split(' ')[0]);
    assert.notEqual(second.color, first.color, 'devralınanın rengi hemen geçmiyor');
  });

  test('giriş beklemesi koltuk sayısıyla: standart 120, büyük 60 gün', () => {
    assert.equal(entryCooldown(4), 120);
    assert.equal(entryCooldown(8), 60);
    assert.equal(entryCooldown(2), 120);
  });
});
