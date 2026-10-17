import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSUMER_CATEGORIES, FAD, GOOD_BY_ID, GOODS, SEASONS, TREND } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { collectEventModifiers } from '../src/systems/events';
import { goodShares } from '../src/systems/demand';
import {
  activeFad,
  fadSchedule,
  livingDemand,
  runLivingTick,
  seasonMultiplier,
  seasonOf,
  trendAt,
} from '../src/systems/living';
import { agenda } from '../src/agenda';

describe('canlı pazar', () => {
  test('mevsimler takvim ayından; her kategorinin yıllık ortalaması 1', () => {
    assert.equal(seasonOf(0).id, 'winter');
    assert.equal(seasonOf(59).id, 'spring');
    assert.equal(seasonOf(160).id, 'summer');
    assert.equal(seasonOf(250).id, 'autumn');
    assert.equal(seasonOf(340).id, 'winter');
    for (const category of CONSUMER_CATEGORIES) {
      const mean = SEASONS.reduce((total, season) => total + (season.demand[category] ?? 1), 0) / SEASONS.length;
      assert.ok(Math.abs(mean - 1) < 1e-9, `${category} ortalaması ${mean}`);
    }
    assert.equal(seasonMultiplier(160, 'dining'), SEASONS.find((s) => s.id === 'summer')!.demand.dining);
  });

  test("eğilim 1'den başlıyor, aralıkta kalıyor, parça sınırında kopmuyor, tohuma bağlı", () => {
    for (const category of CONSUMER_CATEGORIES) {
      assert.equal(trendAt(7, category, 0).value, 1);
      let previous = trendAt(7, category, 0);
      for (let day = 1; day <= 1500; day++) {
        const point = trendAt(7, category, day);
        assert.ok(point.value >= TREND.range[0] - 1e-9 && point.value <= TREND.range[1] + 1e-9, `${category} ${day}: ${point.value}`);
        // Doğrusal parçalar: günlük değişim, en uzun parçadaki en büyük farkın günlüğünü aşmıyor.
        const maxStep = (TREND.range[1] - Math.min(1, TREND.range[0])) / TREND.segmentDays[0] + 1e-9;
        assert.ok(Math.abs(point.value - previous.value) <= maxStep, `${category} ${day}: sıçrama`);
        const length = point.endDay - point.startDay;
        assert.ok(length >= TREND.segmentDays[0] && length <= TREND.segmentDays[1]);
        previous = point;
      }
    }
    assert.deepEqual(trendAt(7, 'retail', 400), trendAt(7, 'retail', 400));
    assert.notDeepEqual(trendAt(7, 'retail', 400), trendAt(8, 'retail', 400));
    assert.notDeepEqual(trendAt(7, 'retail', 400), trendAt(7, 'dining', 400));
  });

  test('moda takvimi: aralıklı, süresi sınırlı, aynı ürün üst üste yok, tek ürünlü kategori yok', () => {
    const first = fadSchedule(11, 0).next;
    assert.ok(first.startDay >= FAD.firstDay[0] && first.startDay <= FAD.firstDay[1]);
    let last: string | null = null;
    let lastEnd = -1;
    let day = 0;
    let count = 0;
    while (day < 2000) {
      const { active, next } = fadSchedule(11, day);
      const window = active ?? next;
      const duration = window.endDay - window.startDay;
      assert.ok(duration >= FAD.durationDays[0] && duration <= FAD.durationDays[1]);
      if (lastEnd >= 0) {
        const gap = window.startDay - lastEnd;
        assert.ok(gap >= FAD.gapDays[0] && gap <= FAD.gapDays[1], `ara ${gap}`);
      }
      assert.notEqual(window.goodId, last);
      const good = GOOD_BY_ID[window.goodId]!;
      assert.ok(GOODS.filter((g) => g.tier === 'consumer' && g.category === good.category).length > 1);
      last = window.goodId;
      lastEnd = window.endDay;
      day = window.endDay;
      count++;
    }
    assert.ok(count >= 8, `2000 günde ${count} moda`);
  });

  test('talep çarpanı olay boru hattından geçiyor; bayrak kapalıyken 1', () => {
    const state = createNewGame({ seed: 5 });
    state.time.day = 400;
    state.activeEvents = [];
    delete state.era;
    delete state.crisis;
    const mods = collectEventModifiers(state);
    for (const category of CONSUMER_CATEGORIES) {
      const expected = trendAt(5, category, 400).value * seasonMultiplier(400, category) * (activeFad(state) && GOOD_BY_ID[activeFad(state)!.goodId]!.category === category ? FAD.categoryBoost : 1);
      assert.ok(Math.abs((mods.demand[category] ?? 1) - expected) < 1e-9, category);
      assert.ok(Math.abs(livingDemand(state, category) - expected) < 1e-9);
    }
    state.flags.livingMarket = false;
    const quiet = collectEventModifiers(state);
    for (const category of CONSUMER_CATEGORIES) assert.equal(quiet.demand[category] ?? 1, 1);
    assert.equal(activeFad(state), null);
  });

  test('moda ürünü kategorinin içinde payını büyütüyor, toplam pay 1', () => {
    const base = goodShares('mid_residential', 'grocery');
    const fad = goodShares('mid_residential', 'grocery', 'biscuit');
    const before = base.find((entry) => entry.good.id === 'biscuit')!.share;
    const after = fad.find((entry) => entry.good.id === 'biscuit')!.share;
    assert.ok(after > before, `${after} > ${before}`);
    assert.ok(Math.abs(fad.reduce((total, entry) => total + entry.share, 0) - 1) < 1e-9);
  });

  test('haber: mevsim dönümü ve başlayan moda; gündemde moda geri sayımı', () => {
    const state = createNewGame({ seed: 11 });
    state.time.day = 59;
    runLivingTick(state);
    assert.ok(state.news.some((item) => item.title.includes('İlkbahar')), 'mevsim haberi yok');

    const fad = fadSchedule(11, 0).next;
    const at = createNewGame({ seed: 11 });
    at.time.day = fad.startDay;
    runLivingTick(at);
    const good = GOOD_BY_ID[fad.goodId]!;
    assert.ok(at.news.some((item) => item.title.includes(good.name)), 'moda haberi yok');
    const chip = agenda(at).find((item) => item.kind === 'fad');
    assert.ok(chip, 'gündemde moda yok');
    assert.equal(chip.daysLeft, fad.endDay - fad.startDay);
  });

  test('pazar durumsuz: kayda alan yazmıyor, zar çekmiyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 3 }));
    for (let day = 0; day < 120; day++) engine.runDay();
    const state = engine.getState();
    const rng = structuredClone(state.rng);
    for (const category of CONSUMER_CATEGORIES) livingDemand(state, category);
    collectEventModifiers(state);
    assert.deepEqual(state.rng, rng);
    assert.ok(!('living' in state) && !('trends' in state) && !('fad' in state));
  });
});
