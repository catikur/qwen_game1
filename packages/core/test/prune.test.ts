import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_BY_ID } from '@capital/content';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { recentlyPruned, runNpcTick } from '../src/systems/npc';
import type { BuildingInstance, GameState } from '../src/types';

/*
 * Rakibin zararlı şubeyi kapatması — mekanizmanın kendisi (Tur 25).
 *
 * Denge testi bunu 900 günlük bir oyunda kapanış sayarak ölçüyordu. Yatırım
 * tahmini kendi şubelerinden çalınan satışı düşmeye başlayınca rakip zararlı
 * şubeyi çoğu tohumda hiç açmıyor; o oyunda kapanış sayısı sıfır ve sıfır
 * hem "kural çalışmıyor" hem "kapatacak bir şey yok" demek olabiliyor.
 * Kuralı burada, zararı elle kurarak sınıyoruz.
 */

/** 60 gün oynanmış, rakiplerinin mağazası olan bir şehir. */
function city(): GameState {
  const engine = new GameEngine(createNewGame({ seed: 7 }));
  for (let day = 0; day < 60; day++) engine.runDay();
  return engine.getState();
}

function rivalOutlets(state: GameState): BuildingInstance[] {
  return Object.values(state.buildings).filter(
    (b) => b.companyId !== state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'outlet',
  );
}

/** Rakiplerin karar günleri yedi güne yayılı: bir hafta boyunca her gün bir tik. */
function runWeek(state: GameState, pin: () => void): void {
  for (let i = 0; i < 7; i++) {
    state.time.day += 1;
    pin();
    runNpcTick(state);
  }
}

describe('rakip zararlı şubeyi kapatıyor', () => {
  test('eğilimi zararda ve yaşlı şube bir hafta içinde kapanıyor, hafızaya giriyor', () => {
    const state = city();
    const target = rivalOutlets(state)[0]!;
    const company = state.companies[target.companyId]!;
    const { id, districtId, defId } = target;
    target.builtDay = state.time.day - 200;
    runWeek(state, () => {
      if (state.buildings[id]) state.buildings[id]!.profitTrend = -5_000;
    });
    assert.equal(state.buildings[id], undefined, 'şube kapandı');
    assert.ok(recentlyPruned(state, company, districtId, defId), 'aynı yere aynı tür hafızada');
  });

  test('genç şube zararda da olsa kapanmıyor (müşteri tabanı oturuyor)', () => {
    const state = city();
    const target = rivalOutlets(state)[0]!;
    const { id } = target;
    target.builtDay = state.time.day - 30;
    runWeek(state, () => {
      if (state.buildings[id]) state.buildings[id]!.profitTrend = -5_000;
    });
    assert.ok(state.buildings[id], 'şube açık');
  });

  test('kâr eden şube kapanmıyor', () => {
    const state = city();
    const target = rivalOutlets(state)[0]!;
    const { id } = target;
    target.builtDay = state.time.day - 200;
    runWeek(state, () => {
      if (state.buildings[id]) state.buildings[id]!.profitTrend = 2_000;
    });
    assert.ok(state.buildings[id], 'şube açık');
  });
});
