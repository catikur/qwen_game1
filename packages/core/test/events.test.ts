import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, SECTOR_EVENTS } from '@capital/content';
import { createNewGame } from '../src/worldgen';
import { runEventTick } from '../src/systems/events';
import type { GameState } from '../src/types';

/*
 * İki olay takvimi (Tur 27).
 *
 * Sektör olayları şehrin kriz takvimine eklenseydi eski krizler seyrelir,
 * kredi ve baskın kontrollerinin ölçtüğü kötü günler kayardı (denge
 * testinde altı kontrol düştü). Bu yüzden ayrı bir takvimdeler: kendi zarı,
 * kendi sınırı. Buradaki testler o ayrılığı sınıyor; takvim yalnızca tohum
 * ve günden okunduğu için motoru koşturmadan, tik tik.
 */

const CITY = new Set(EVENTS.map((e) => e.id));
const SECTOR = new Set(SECTOR_EVENTS.map((e) => e.id));

interface Start {
  day: number;
  id: string;
}

/** Takvimi `days` gün işletir; `afterTick` her günün sonunda durumu değiştirebilir. */
function runCalendar(seed: number, days: number, afterTick?: (state: GameState) => void) {
  const state = createNewGame({ seed });
  const starts: Start[] = [];
  let maxCity = 0;
  let maxSector = 0;
  for (let i = 0; i < days; i++) {
    state.time.day += 1;
    const before = new Set(state.activeEvents.map((a) => `${a.defId}:${a.startedDay}`));
    runEventTick(state);
    for (const active of state.activeEvents) {
      if (!before.has(`${active.defId}:${active.startedDay}`)) starts.push({ day: state.time.day, id: active.defId });
    }
    maxCity = Math.max(maxCity, state.activeEvents.filter((a) => CITY.has(a.defId)).length);
    maxSector = Math.max(maxSector, state.activeEvents.filter((a) => SECTOR.has(a.defId)).length);
    afterTick?.(state);
  }
  return { starts, maxCity, maxSector };
}

describe('olay takvimleri', () => {
  test('şehirde aynı anda en fazla iki olay, sektörde en fazla bir', () => {
    for (const seed of [1, 7, 42]) {
      const { maxCity, maxSector } = runCalendar(seed, 1500);
      assert.ok(maxCity <= 2, `seed ${seed}: şehir ${maxCity}`);
      assert.equal(maxSector, 1, `seed ${seed}: sektör ${maxSector}`);
    }
  });

  test('sektör olayı şehrin krizini ertelemiyor ve kaydırmıyor', () => {
    /*
     * Karşılaştırma: sektör olayları her gün açılır açılmaz siliniyor.
     * Şehir takvimi sektör takvimine hiç bakmıyorsa iki koşuda şehrin
     * olayları aynı günlerde, aynı sırayla çıkmalı.
     */
    for (const seed of [1, 7, 42]) {
      const city = (starts: Start[]) => starts.filter((s) => CITY.has(s.id)).map((s) => `${s.day}:${s.id}`);
      const both = runCalendar(seed, 1500);
      const alone = runCalendar(seed, 1500, (state) => {
        state.activeEvents = state.activeEvents.filter((a) => !SECTOR.has(a.defId));
      });
      assert.ok(both.starts.some((s) => SECTOR.has(s.id)), `seed ${seed}: sektör olayı çıktı`);
      assert.deepEqual(city(both.starts), city(alone.starts), `seed ${seed}: şehir takvimi aynı`);
    }
  });

  test('her sektör olayı sırası gelince çıkıyor', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      for (const start of runCalendar(seed, 1500).starts) if (SECTOR.has(start.id)) seen.add(start.id);
    }
    assert.deepEqual([...SECTOR].filter((id) => !seen.has(id)), []);
  });

  test('aynı olay üst üste binmiyor', () => {
    for (const seed of [3, 11]) {
      const state = createNewGame({ seed });
      for (let i = 0; i < 1500; i++) {
        state.time.day += 1;
        runEventTick(state);
        const ids = state.activeEvents.map((a) => a.defId);
        assert.equal(new Set(ids).size, ids.length, `seed ${seed}, gün ${state.time.day}: ${ids.join(',')}`);
      }
    }
  });
});
