import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID, GOOD_BY_ID } from '@capital/content';
import { chainCards } from '../src/chain';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { playerStrategy } from './proxy';

describe('zincir kartı', () => {
  /*
   * Tur 32. Hammadde krizinde ara mal ünitesi zarar ediyor ve kart eskiden
   * sebep söylemeden "hamle yok"a düşüyordu (main'deki tam oynanış testi
   * bir sektör olayıyla bunu yakaladı). Artık sebebini yazıyor; kriz
   * geçince hamle geri geliyor.
   */
  test('girdi krizinde hamle yerine sebep; taban fiyatta hamle geri geliyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Kriz AŞ' }));
    for (let day = 1; day <= 120; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    const state = engine.getState();
    const player = state.companies[state.playerCompanyId]!;
    player.cash = 50_000_000;
    player.netWorth = 50_000_000;

    // Hamlesi ara mal ünitesi olan kart (sensör fabrikası gibi): kriz onun girdisinde.
    const card = chainCards(state, state.playerCompanyId).find((c) => {
      const mid = GOOD_BY_ID[c.goodId]?.inputGoodId;
      if (!c.move || !mid) return false;
      return Boolean(GOOD_BY_ID[mid]?.inputGoodId) && BUILDING_BY_ID[c.move.defId]?.outputGoodId === mid;
    });
    assert.ok(card, 'ara mal hamlesi olan bir kart var');
    const mid = GOOD_BY_ID[card.goodId]!.inputGoodId!;
    const raw = GOOD_BY_ID[mid]!.inputGoodId!;
    const again = () => chainCards(state, state.playerCompanyId).find((c) => c.goodId === card.goodId)!;

    const saved = state.market.spot[raw];
    state.market.spot[raw] = GOOD_BY_ID[raw]!.basePrice * 2.5;
    const crisis = again();
    assert.equal(crisis.slots[0]!.state, 'crisis');
    assert.equal(crisis.move, null, 'zarar eden ünite önerilmiyor');
    assert.match(crisis.blocked ?? '', /krizde/, 'sebep söyleniyor');
    assert.ok((crisis.blocked ?? '').includes(GOOD_BY_ID[raw]!.name), crisis.blocked ?? '');

    state.market.spot[raw] = saved ?? GOOD_BY_ID[raw]!.basePrice;
    assert.ok(again().move, 'kriz geçince hamle geri geliyor');
  });
});
