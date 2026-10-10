import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDING, NPC_PROFILES } from '@capital/content';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { cityTrend, holdingNetWorth, openCityQuote, remoteIncome, runHoldingTick } from '../src/holding';
import { victoryNetWorth, victoryReached } from '../src/systems/goals';
import { recomputeNetWorth } from '../src/systems/city';
import { playerStrategy } from './proxy';
import type { GameState } from '../src/types';

/** Zafer kazanılmış, kasası dolu bir şehir: holding'in açılabildiği an. */
function conquered(seed = 6): GameEngine {
  const state = createNewGame({ seed, companyName: 'Holding AŞ' });
  const engine = new GameEngine(state);
  // Vekil birkaç mağaza kursun: bekleyen şehrin kâr eğilimi sıfır olmasın.
  for (let day = 1; day <= 60; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  const live = engine.getState();
  live.companies.player!.cash = 30_000_000;
  live.victory = { day: live.time.day, kind: 'tycoon', dismissed: true };
  recomputeNetWorth(live);
  return engine;
}

const player = (state: GameState) => state.companies[state.playerCompanyId]!;

describe('holding (çoklu şehir)', () => {
  test('zafer olmadan yeni şehir açılmıyor', () => {
    const engine = new GameEngine(createNewGame({ seed: 6 }));
    const result = engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 2_000_000 });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /zafer/);
  });

  test('yeni şehir: sermaye taşınıyor, kurucu şehir bekliyor, rakipler farklı', () => {
    const engine = conquered();
    const founding = engine.getState();
    const name = openCityQuote(founding).name;
    const result = engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    assert.ok(result.ok, result.reason);
    const city = engine.getState();
    assert.notEqual(city, founding);
    assert.equal(city.cityName, name);
    assert.equal(player(city).cash, 8_000_000);
    assert.equal(city.importedCapital, 8_000_000);
    assert.equal(city.time.day, 0);
    assert.equal(city.holding!.dormant.length, 1);
    const dormant = city.holding!.dormant[0]!.state;
    assert.equal(player(dormant).cash, 22_000_000, 'sermaye kurucu şehrin kasasından çıktı');
    assert.equal(dormant.importedCapital, -8_000_000);
    assert.equal(dormant.holding, undefined, 'iç içe holding yok');
    assert.ok(dormant.cityName);
    // İkinci şehir kataloğun ikinci dörtlüsüyle başlıyor.
    const rivals = Object.values(city.companies).filter((c) => !c.isPlayer).map((c) => c.profileId);
    assert.deepEqual(rivals, NPC_PROFILES.slice(4, 8).map((p) => p.id));
    assert.equal(player(city).name, 'Holding AŞ');
  });

  test('zafer şehirde yaratılan değerle: getirilen sermaye sayılmıyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const target = victoryNetWorth(city);
    player(city).cash = target + 1_000_000;
    recomputeNetWorth(city);
    assert.ok(player(city).netWorth >= target);
    assert.equal(victoryReached(city), null, 'net değer hedefte ama 8 M ₺ getirildi');
    player(city).cash += 8_000_000;
    recomputeNetWorth(city);
    assert.equal(victoryReached(city), 'tycoon');
  });

  test('bekleyen şehrin kâr eğiliminin yarısı kasaya; kaybedilen şehir ödemiyor', () => {
    const engine = conquered();
    const trend = cityTrend(engine.getState());
    assert.ok(trend > 0, `eğilim ${trend}`);
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    assert.equal(city.holding!.dormant[0]!.trend, trend);
    assert.equal(remoteIncome(city), trend * HOLDING.remoteShare);
    const before = city.holding!.treasury;
    runHoldingTick(city);
    assert.equal(city.holding!.treasury, before + trend * HOLDING.remoteShare);
    city.holding!.dormant[0]!.state.gameOver = { day: 1, byCompanyId: 'nova_holding' };
    assert.equal(remoteIncome(city), 0);
  });

  test('şehir değişince bekleyenin takvimi duruyor, geri dönünce kaldığı yerden', () => {
    const engine = conquered();
    const foundingDay = engine.getState().time.day;
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    for (let day = 0; day < 15; day++) engine.runDay();
    assert.equal(engine.getState().holding!.dormant[0]!.state.time.day, foundingDay);
    assert.ok(engine.getState().holding!.treasury > 0);
    const switched = engine.dispatch({ type: 'SWITCH_CITY', index: 0 });
    assert.ok(switched.ok, switched.reason);
    const back = engine.getState();
    assert.equal(back.time.day, foundingDay);
    assert.equal(back.holding!.dormant.length, 1);
    assert.equal(back.holding!.dormant[0]!.state.time.day, 15);
    assert.ok(back.holding!.treasury > 0, 'kasa şehirle birlikte dolaşıyor');
  });

  test('kasa ile şehir arasında aktarım zafer ölçüsünü düzeltiyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    city.holding!.treasury = 5_000_000;
    assert.equal(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: 6_000_000 }).ok, false);
    assert.ok(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: 3_000_000 }).ok);
    assert.equal(city.holding!.treasury, 2_000_000);
    assert.equal(city.importedCapital, 11_000_000);
    assert.ok(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: -1_000_000 }).ok);
    assert.equal(city.importedCapital, 10_000_000);
    assert.equal(city.holding!.treasury, 3_000_000);
  });

  test('holding değeri: oynanan + bekleyen + kasa', () => {
    const engine = conquered();
    const before = player(engine.getState()).netWorth;
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    city.holding!.treasury = 1_000_000;
    const total = holdingNetWorth(city);
    assert.ok(Math.abs(total - (before + 1_000_000)) < before * 0.01, `${total} ≈ ${before + 1_000_000}`);
  });

  test('en fazla üç şehir; lig koşusunda kapalı', () => {
    const engine = conquered();
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 }).ok);
    const second = engine.getState();
    player(second).cash = 30_000_000;
    second.victory = { day: 1, kind: 'tycoon', dismissed: true };
    assert.ok(engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 2_000_000 }).ok);
    const third = engine.getState();
    player(third).cash = 30_000_000;
    third.victory = { day: 1, kind: 'tycoon', dismissed: true };
    const fourth = engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 2_000_000 });
    assert.equal(fourth.ok, false);
    assert.match(fourth.reason ?? '', /en fazla/);
    assert.equal(new Set([second.cityName, third.cityName, ...third.holding!.dormant.map((d) => d.state.cityName)]).size, 3);

    const league = createNewGame({ league: { weekId: '2026-W40' } });
    league.victory = { day: 1, kind: 'tycoon' };
    league.companies.player!.cash = 30_000_000;
    assert.equal(openCityQuote(league).ok, false);
  });

  test('kayıt bekleyen şehirleriyle gidip geliyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    for (let day = 0; day < 5; day++) engine.runDay();
    const city = engine.getState();
    const outcome = importFromJson(exportToJson(city));
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.state.cityName, city.cityName);
    assert.equal(outcome.state.holding!.treasury, city.holding!.treasury);
    assert.equal(outcome.state.holding!.dormant[0]!.state.time.day, city.holding!.dormant[0]!.state.time.day);
    const restored = new GameEngine(outcome.state);
    assert.ok(restored.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
  });

  test('şehir değişince eşik haberleri yeniden düşmüyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    engine.runDay();
    const city = engine.getState();
    assert.ok(!city.news.some((n) => n.title.startsWith('Şirket değeri')), 'getirilen sermaye eşik haberi değil');
    engine.dispatch({ type: 'SWITCH_CITY', index: 0 });
    const back = engine.getState();
    const count = back.news.filter((n) => n.title.startsWith('Şirket değeri')).length;
    engine.runDay();
    assert.equal(back.news.filter((n) => n.title.startsWith('Şirket değeri')).length, count);
  });
});
