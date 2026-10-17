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
  /*
   * Tur 38. Rakip kartı fırsat maliyeti frenini hesaplamıyor: fren oyuncu
   * tavsiyesi, rakip onu okumuyor ve girdisi büyük şehrin geç oyununda
   * günün beşte biriydi. Frensiz kart, frenli kartla aynı hamleyi vermeli;
   * yalnız `deferred` ve sebep metni değişebilir.
   */
  test('frensiz kart (rakip) aynı hamleyi veriyor; yalnız erteleme ve sebep farklı', () => {
    const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Fren AŞ' }));
    for (let day = 1; day <= 240; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    const state = engine.getState();
    let compared = 0;
    for (const companyId of Object.keys(state.companies)) {
      const full = chainCards(state, companyId);
      const lean = chainCards(state, companyId, { brake: false });
      assert.equal(lean.length, full.length, companyId);
      full.forEach((card, i) => {
        const other = lean[i]!;
        assert.equal(other.goodId, card.goodId);
        if (!card.move) {
          assert.equal(other.move, null);
          return;
        }
        const { deferred, reason, ...rest } = card.move;
        const { deferred: leanDeferred, reason: leanReason, ...leanRest } = other.move!;
        assert.deepEqual(leanRest, rest, `${companyId} ${card.goodId}`);
        assert.equal(leanDeferred, false);
        void deferred; void reason; void leanReason;
        compared++;
      });
    }
    assert.ok(compared >= 3, `${compared} hamle karşılaştırıldı`);
  });

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
