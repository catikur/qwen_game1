import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CRISES, MODIFIERS, MODIFIER_RULES, getDifficulty, modifierMultiplier, normalizeModifiers } from '@capital/content';
import type { ModifierId } from '@capital/content';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { createScenarioGame } from '../src/scenario';
import { recomputeNetWorth, tilePrice } from '../src/systems/city';
import { loanQuote, loanRate, overdraftRate } from '../src/systems/credit';
import { crisisBuildMultiplier } from '../src/systems/economy';
import { buyShares, founderLockFor } from '../src/systems/equity';
import { placeTakeoverOrder } from '../src/systems/orders';
import { difficultyOf } from '../src/systems/rules';
import type { GameState } from '../src/types';

/** Zorluk değiştiricileri (Tur 45): her kural yazdığını yapıyor, yazmadığına dokunmuyor. */
describe('zorluk değiştiricileri', () => {
  const game = (modifiers: ModifierId[], seed = 7): GameState => createNewGame({ seed, companyName: 'Kural AŞ', modifiers });

  test('liste katalog sırasıyla, tekrarsız; bilinmeyen kural düşüyor; çarpan ağırlıkların toplamı', () => {
    assert.deepEqual(normalizeModifiers(['scarce_land', 'storms', 'storms', 'nope']), ['storms', 'scarce_land']);
    assert.equal(modifierMultiplier([]), 1);
    const all = MODIFIERS.map((modifier) => modifier.id);
    const sum = MODIFIERS.reduce((total, modifier) => total + modifier.weight, 1);
    assert.equal(modifierMultiplier(all), Math.round(sum * 100) / 100);
  });

  test('kuralları oyuncu yalnız serbest oyunda seçiyor: kural yoksa alan yok; ligde haftanın kuralı, senaryoda yok', () => {
    assert.equal(game([]).modifiers, undefined);
    assert.deepEqual(game(['scarce_land', 'storms']).modifiers, ['storms', 'scarce_land']);
    const before = createNewGame({ companyName: 'Lig AŞ', league: { weekId: '2026-W42' }, modifiers: ['storms'] });
    assert.equal(before.modifiers, undefined, 'ligde herkes aynı kurallarla');
    // Tur 53: kural haftadan, oyuncunun seçtiği yok sayılıyor.
    const league = createNewGame({ companyName: 'Lig AŞ', league: { weekId: '2026-W43' }, modifiers: ['storms'] });
    assert.deepEqual(league.modifiers, ['scarce_land'], 'haftanın kuralı');
    assert.equal(createScenarioGame('rescue', { companyName: 'Senaryo AŞ' }).modifiers, undefined);
  });

  test('kurallar kayıttan geri geliyor', () => {
    const loaded = importFromJson(exportToJson(game(['hungry_rivals', 'tight_credit'])));
    assert.ok(loaded.ok, loaded.ok ? '' : loaded.reason);
    assert.deepEqual(loaded.ok ? loaded.state.modifiers : null, ['hungry_rivals', 'tight_credit']);
  });

  test('kural yokken kademe aynı nesne: hiçbir sayı değişmiyor', () => {
    assert.equal(difficultyOf(game([])), getDifficulty('normal'));
  });

  test('Fırtınalı yıllar: ilk kriz uyarısı 160–220. günde, sonraki kriz yarı aralıkla', () => {
    // Takvim oyuncudan bağımsız; baskınlar kapalı, oyun bitmesin.
    const first = (modifiers: ModifierId[]): { warning: number; next: number } => {
      const state = game(modifiers, 11);
      state.flags.raids = false;
      const engine = new GameEngine(state);
      let warning = -1;
      let next = -1;
      for (let day = 1; day <= 1200 && next < 0; day++) {
        const hadCrisis = state.crisis !== undefined;
        engine.runDay();
        if (state.crisis && warning < 0) warning = state.time.day;
        if (hadCrisis && !state.crisis) next = (state.nextCrisisDay ?? 0) - state.time.day;
      }
      return { warning, next };
    };
    const calm = first([]);
    const storms = first(['storms']);
    assert.ok(storms.warning >= MODIFIER_RULES.storms.firstDay && storms.warning <= MODIFIER_RULES.storms.firstDay + MODIFIER_RULES.storms.firstSpread,
      `fırtınalı: ilk uyarı ${storms.warning}. gün`);
    assert.ok(calm.warning >= 320, `sakin: ilk uyarı ${calm.warning}. gün`);
    const [min, max] = MODIFIER_RULES.storms.gapDays;
    assert.ok(storms.next >= min && storms.next <= max, `fırtınalı: sonraki ${storms.next} gün sonra`);
  });

  test('Fırtınalı yıllar: durgunluk inşaatı ucuzlatmıyor; kural yokken ucuzlatıyor', () => {
    const recession = CRISES.find((crisis) => (crisis.effects.buildCost ?? 1) < 1)!;
    const during = (modifiers: ModifierId[]): number => {
      const state = game(modifiers);
      state.crisis = { defId: recession.id, phase: 'active', activeDay: 0, endDay: 100 };
      return crisisBuildMultiplier(state);
    };
    assert.equal(during([]), recession.effects.buildCost);
    assert.equal(during(['storms']), 1);
  });

  test('Aç gözlü rakipler: bütçe ×1,3, baskın ısınması üçte bir kısa', () => {
    const base = getDifficulty('normal');
    const state = game(['hungry_rivals']);
    const rules = difficultyOf(state);
    assert.equal(rules.rivalBudgetMultiplier, base.rivalBudgetMultiplier * MODIFIER_RULES.hungryRivals.budgetMultiplier);
    assert.equal(rules.raidWarmupDays, Math.round(base.raidWarmupDays * MODIFIER_RULES.hungryRivals.raidWarmupMultiplier));
    // Kural rakibin cesaretini değiştiriyor, zafer çıtasını değil.
    assert.equal(rules.victoryNetWorth, base.victoryNetWorth);
  });

  test('Aç gözlü rakipler: kurucu kilidi rakip alıcıya erken açılıyor, oyuncuya kademenin gününde (Codex #74)', () => {
    const base = getDifficulty('normal');
    const state = game(['hungry_rivals']);
    const rules = difficultyOf(state);
    const [rival, raider] = Object.values(state.companies).filter((company) => !company.isPlayer);
    const player = state.companies[state.playerCompanyId]!;
    player.cash = raider!.cash = 50_000_000;
    // Rakiplerin baskını başladı, oyuncunun kilidi sürüyor.
    state.time.day = rules.raidWarmupDays + 10;
    const days = base.raidWarmupDays - state.time.day;
    const order = placeTakeoverOrder(state, player.id, rival!.id);
    assert.equal(order.ok, false);
    assert.match(order.reason ?? '', new RegExp(`${days} `), `oyuncunun emri bekliyor: ${order.reason}`);
    assert.equal(buyShares(state, player.id, rival!.id, 10).ok, false, 'oyuncunun alımı bekliyor');
    assert.equal(founderLockFor(state, rival!, player.id), base.raidWarmupDays);
    const bought = buyShares(state, raider!.id, rival!.id, 10);
    assert.ok(bought.ok, `rakip alıcı alabiliyor: ${bought.reason}`);
    // Kilit bitince oyuncu da serbest.
    state.time.day = base.raidWarmupDays;
    assert.ok(buyShares(state, player.id, rival!.id, 10).ok);
    // Kural yokken oyuncu ile rakibin kilidi aynı gün; ek alan yok.
    const plain = game([]);
    const plainRival = Object.values(plain.companies).find((company) => !company.isPlayer)!;
    assert.equal(plainRival.lockedUntilDay, base.raidWarmupDays);
    assert.equal(plainRival.playerLockedUntilDay, undefined);
  });

  test('Sıkı banka: kuruluş sermayesinin yarısı 360 günlük kredi; kasa aynı, net değer borç kadar eksik', () => {
    const plain = game([]);
    const tight = game(['tight_credit']);
    const before = plain.companies[plain.playerCompanyId]!;
    const after = tight.companies[tight.playerCompanyId]!;
    const rules = MODIFIER_RULES.tightCredit;
    assert.equal(after.cash, before.cash);
    assert.equal(after.debt, Math.round(before.cash * rules.startingLoanShare));
    assert.equal(after.netWorth, before.cash - after.debt);
    // Değer geçmişi de borçlu değerle açılıyor; yoksa şirket panelinde sahte bir ilk tepe (Codex #74).
    assert.deepEqual(after.netWorthHistory, [after.netWorth]);
    const loan = after.credit!.loans[0]!;
    assert.equal(loan.termDays, rules.startingLoanDays);
    assert.ok(Math.abs(loan.rate - (loanRate('A', 'term', rules.startingLoanDays) + rules.rateDelta)) < 1e-12, `${loan.rate}`);
    assert.equal(before.debt, 0);
    assert.equal(before.credit, undefined, 'kuralsız oyunda kredi yok');
  });

  test('Sıkı banka: yalnız oyuncuya faiz +4 puan ve limit ×0,6; rakibin kredisi aynı', () => {
    const plain = game([]);
    const tight = game(['tight_credit']);
    const rivalId = Object.keys(plain.companies).find((id) => id !== plain.playerCompanyId)!;
    // Açılış kredisi kıyası bozmasın: iki kolda da borçsuz, aynı kasa.
    for (const state of [plain, tight]) {
      const company = state.companies[state.playerCompanyId]!;
      company.cash = 2_000_000;
      company.debt = 0;
      delete company.credit;
      recomputeNetWorth(state);
    }
    const before = loanQuote(plain, plain.playerCompanyId, 'term', 360);
    const after = loanQuote(tight, tight.playerCompanyId, 'term', 360);
    assert.ok(before.ok && after.ok, `${before.reason ?? ''} ${after.reason ?? ''}`);
    assert.ok(Math.abs(after.rate - before.rate - MODIFIER_RULES.tightCredit.rateDelta) < 1e-12, `${before.rate} → ${after.rate}`);
    assert.ok(after.max <= before.max * MODIFIER_RULES.tightCredit.limitMultiplier && after.max >= before.max * MODIFIER_RULES.tightCredit.limitMultiplier - 1000,
      `${before.max} → ${after.max}`);
    const player = tight.companies[tight.playerCompanyId]!;
    assert.ok(Math.abs(overdraftRate(tight, player) - overdraftRate(plain, plain.companies[plain.playerCompanyId]!) - MODIFIER_RULES.tightCredit.rateDelta) < 1e-12);
    assert.deepEqual(loanQuote(tight, rivalId, 'term', 360), loanQuote(plain, rivalId, 'term', 360), 'rakibin teklifi aynı');
  });

  test('Kıt arsa: satın alma fiyatı herkese pahalı, defter değeri aynı; kilitli bölgeler geç açılıyor', () => {
    const plain = game([]);
    const scarce = game(['scarce_land']);
    const tile = plain.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId)!;
    const rivalId = Object.keys(plain.companies).find((id) => id !== plain.playerCompanyId)!;
    assert.equal(scarce.map.tiles[tile.id]!.landValue, tile.landValue);
    for (const companyId of [plain.playerCompanyId, rivalId]) {
      const price = tilePrice(plain, tile.id, companyId);
      assert.equal(tilePrice(scarce, tile.id, companyId), Math.round(price * MODIFIER_RULES.scarceLand.priceMultiplier), companyId);
    }
    const opens = (state: GameState): number[] =>
      state.districts.map((d) => d.opensOnDay).filter((day): day is number => day !== undefined).sort((a, b) => a - b);
    assert.deepEqual(opens(scarce), opens(plain).map((day) => Math.round(day * MODIFIER_RULES.scarceLand.unlockDelay)));
    assert.ok(opens(plain).length === 4);
  });

  test('kurallar holding\'in yeni şehrine geçiyor', () => {
    const state = game(['storms', 'scarce_land'], 6);
    const engine = new GameEngine(state);
    const live = engine.getState();
    live.companies[live.playerCompanyId]!.cash = 30_000_000;
    live.victory = { day: live.time.day, kind: 'tycoon', dismissed: true };
    recomputeNetWorth(live);
    const result = engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    assert.ok(result.ok, result.reason);
    assert.deepEqual(engine.getState().modifiers, ['storms', 'scarce_land']);
  });

  test('Sıkı banka holding\'in yeni şehrinde açılış kredisi vermiyor: giden sermaye oyuncunun', () => {
    const state = game(['tight_credit'], 6);
    const engine = new GameEngine(state);
    const live = engine.getState();
    live.companies[live.playerCompanyId]!.cash = 30_000_000;
    live.victory = { day: live.time.day, kind: 'tycoon', dismissed: true };
    recomputeNetWorth(live);
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    const city = engine.getState();
    assert.deepEqual(city.modifiers, ['tight_credit']);
    assert.equal(city.companies[city.playerCompanyId]!.debt, 0);
  });
});
