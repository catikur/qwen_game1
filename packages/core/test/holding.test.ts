import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDING, NPC_PROFILES } from '@capital/content';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { cityDirective, cityTrend, holdingLadder, holdingNetWorth, holdingWins, openCityQuote, remoteIncome } from '../src/holding';
import { buybackToLock, sharesOutstanding } from '../src/systems/equity';
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

  /*
   * Tur 30: şehirler eşzamanlı yaşıyor. Tur 22'de bekleyen şehir donuktu ve
   * kasaya ayrıldığın gündeki kâr eğiliminin yarısı akıyordu; şimdi
   * bekleyen şehir her gün yaşıyor ve o günkü kârının yarısını ödüyor.
   */
  test('bekleyen şehir yaşıyor: kârının yarısı kasaya, yarısı şehirde; kaybedilen şehir yaşamıyor', () => {
    const engine = conquered();
    assert.ok(cityTrend(engine.getState()) > 0);
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const away = city.holding!.dormant[0]!;
    const day = away.state.time.day;
    const treasury = city.holding!.treasury;
    const imported = away.state.importedCapital ?? 0;
    engine.runDay();
    assert.equal(away.state.time.day, day + 1, 'bekleyen şehrin takvimi de ilerledi');
    const profit = player(away.state).today.profit;
    assert.ok(profit > 0, `kâr ${profit}`);
    assert.equal(away.lastDividend, profit * HOLDING.remoteShare);
    assert.equal(city.holding!.treasury, treasury + profit * HOLDING.remoteShare);
    assert.equal(remoteIncome(city), away.lastDividend);
    assert.equal(away.state.importedCapital, imported - away.lastDividend!, 'kasaya çıkan şehirden çıkmış sayılıyor');

    away.state.gameOver = { day: away.state.time.day, byCompanyId: 'nova_holding' };
    const lostDay = away.state.time.day;
    engine.runDay();
    assert.equal(away.state.time.day, lostDay, 'kaybedilen şehir yaşamıyor');
    assert.equal(away.lastDividend, 0);
    assert.equal(remoteIncome(city), 0);
  });

  test('şehirler aynı takvimle ilerliyor; geri dönünce öbürü de o kadar yaşamış', () => {
    const engine = conquered();
    const foundingDay = engine.getState().time.day;
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    for (let day = 0; day < 15; day++) engine.runDay();
    assert.equal(engine.getState().holding!.dormant[0]!.state.time.day, foundingDay + 15);
    assert.ok(engine.getState().holding!.treasury > 0);
    const switched = engine.dispatch({ type: 'SWITCH_CITY', index: 0 });
    assert.ok(switched.ok, switched.reason);
    const back = engine.getState();
    assert.equal(back.time.day, foundingDay + 15);
    assert.equal(back.holding!.dormant.length, 1);
    assert.equal(back.holding!.dormant[0]!.state.time.day, 15);
    assert.ok(back.holding!.treasury > 0, 'kasa şehirle birlikte dolaşıyor');
  });

  test('uzaktaki şehrin rakipleri kurmaya devam ediyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const away = engine.getState().holding!.dormant[0]!.state;
    const rivalBuildings = () => Object.values(away.buildings).filter((b) => b.companyId !== away.playerCompanyId).length;
    const before = rivalBuildings();
    for (let day = 0; day < 60; day++) engine.runDay();
    assert.ok(rivalBuildings() > before, `${before} → ${rivalBuildings()}`);
  });

  test("uzak şehirde baskın %25'i geçince oynanan şehre bir kez haber düşüyor", () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const away = city.holding!.dormant[0]!.state;
    const raider = Object.values(away.companies).find((c) => !c.isPlayer)!;
    raider.shares[away.playerCompanyId] = 2_700;
    const count = () => city.news.filter((n) => n.title.includes(raider.name) && n.title.includes('%27')).length;
    engine.runDay();
    assert.equal(count(), 1, city.news.slice(0, 3).map((n) => n.title).join(' | '));
    engine.runDay();
    assert.equal(count(), 1, 'aynı eşik ikinci kez haber değil');
  });

  test('uzak şehirde sendika talebine yerel müdür uzlaşmayla cevap veriyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const away = engine.getState().holding!.dormant[0]!.state;
    const day = away.time.day;
    const labor = player(away).labor ?? { policy: 'market' as const, pressure: 0, agreement: 1 };
    // Masada süresi dolmamış bir talep: oyuncu uzakta, cevabı müdür veriyor.
    player(away).labor = { ...labor, pressure: 1, demand: { raise: 0.06, offeredDay: day, deadlineDay: day + 10 } };
    engine.runDay();
    const now = player(away).labor!;
    assert.equal(now.demand, undefined, JSON.stringify(now));
    assert.equal(now.lastResponse?.kind, 'compromise');
    assert.equal(now.strike, undefined);
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

describe('holding: uzaktan yönetim (Tur 32)', () => {
  test('kâr payı talimatı: hiç, yarısı, hepsi; talimat şehirle birlikte gidip geliyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const away = city.holding!.dormant[0]!;
    assert.deepEqual(cityDirective(away.state), { payout: 'half', defend: false }, 'varsayılan: yarısı, savunma kapalı');

    assert.ok(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, payout: 'keep' }).ok);
    let treasury = city.holding!.treasury;
    let cash = player(away.state).cash;
    engine.runDay();
    assert.ok(player(away.state).today.profit > 0);
    assert.equal(away.lastDividend, 0);
    assert.equal(city.holding!.treasury, treasury, 'kasaya bir şey akmadı');
    assert.ok(player(away.state).cash > cash, 'kâr şehirde kaldı');

    assert.ok(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, payout: 'all' }).ok);
    treasury = city.holding!.treasury;
    cash = player(away.state).cash;
    engine.runDay();
    const profit = player(away.state).today.profit;
    assert.ok(profit > 0);
    assert.ok(cash > profit);
    assert.equal(away.lastDividend, profit, "kârın hepsi kasaya");
    assert.equal(city.holding!.treasury, treasury + away.lastDividend!);
    assert.equal(away.state.remote?.defend, false, 'verilmeyen alan aynı kaldı');

    // Kurucu şehre geç ve geri dön: talimat şehrin kendi durumunda.
    assert.ok(engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    assert.ok(engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok);
    assert.equal(cityDirective(engine.getState().holding!.dormant[0]!.state).payout, 'all');

    assert.equal(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 4, payout: 'all' }).ok, false);
    assert.equal(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, payout: 'bogus' as never }).ok, false);
  });

  test('savunma talimatı: yerel müdür serbest hisseden geri alıyor, kendi kasasından; kapalıyken almıyor', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const away = city.holding!.dormant[0]!;
    const s = away.state;
    const me = player(s);
    const raider = Object.values(s.companies).find((c) => !c.isPlayer)!;
    raider.shares[me.id] = Math.round(sharesOutstanding(s, me.id) * 0.24);
    const treasuryShares = () => me.shares[me.id] ?? 0;
    // Getter: `assert.equal(..., undefined)` derleyicide alanı daraltmasın.
    const defense = () => away.lastDefense;

    engine.runDay();
    assert.equal(treasuryShares(), 0, 'savunma kapalıyken geri alım yok');
    assert.equal(defense(), undefined);

    assert.ok(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, defend: true }).ok);
    const holdingTreasury = city.holding!.treasury;
    engine.runDay();
    assert.ok(treasuryShares() > 0, `hazine ${treasuryShares()}`);
    assert.equal(defense()?.shares, treasuryShares());
    assert.ok((defense()?.cost ?? 0) > 0);
    assert.ok(city.holding!.treasury >= holdingTreasury, 'savunmanın parası holding kasasından değil');
    assert.ok(me.cash > HOLDING.defenseReserve, 'yedek korunuyor');

    // Kontrol kilitlenince harcama duruyor.
    me.shares[me.id] = Math.ceil(sharesOutstanding(s, me.id) * 0.5);
    assert.equal(buybackToLock(s, me.id), 0);
    const locked = treasuryShares();
    engine.runDay();
    assert.equal(treasuryShares(), locked, 'kilitli şehirde geri alım yok');
    assert.equal(defense(), undefined);
  });

  test('kasadan uzaktaki şehre para: zafer ölçüsü o şehirde düzeliyor; kaybedilen şehre yok', () => {
    const engine = conquered();
    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const city = engine.getState();
    const away = city.holding!.dormant[0]!.state;
    city.holding!.treasury = 5_000_000;
    const cash = player(away).cash;
    const imported = away.importedCapital ?? 0;
    assert.ok(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: 3_000_000, index: 0 }).ok);
    assert.equal(city.holding!.treasury, 2_000_000);
    assert.equal(player(away).cash, cash + 3_000_000);
    assert.equal(away.importedCapital, imported + 3_000_000);
    assert.equal(city.importedCapital, 8_000_000, 'oynanan şehrin defteri değişmedi');
    assert.ok(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: -1_000_000, index: 0 }).ok, 'uzaktaki şehirden kasaya');
    assert.equal(city.holding!.treasury, 3_000_000);
    assert.equal(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: 1_000, index: 3 }).ok, false);

    away.gameOver = { day: away.time.day, byCompanyId: 'nova_holding' };
    assert.equal(engine.dispatch({ type: 'HOLDING_TRANSFER', amount: 1_000, index: 0 }).ok, false);
    assert.equal(engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, defend: true }).ok, false);
  });

  test('holding hedefleri: dört basamak, son basamak bir kez haber; kaybedilen şehir kapatılınca yeri boşalıyor', () => {
    const engine = conquered();
    const before = engine.getState();
    assert.equal(holdingWins(before), 1);
    assert.deepEqual(holdingLadder(before).map((step) => step.done), [false, false, false, false]);

    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 8_000_000 });
    const second = engine.getState();
    assert.deepEqual(holdingLadder(second).map((step) => step.done), [true, false, false, false]);
    second.victory = { day: second.time.day, kind: 'tycoon', dismissed: true };
    player(second).cash = 30_000_000;
    assert.deepEqual(holdingLadder(second).map((step) => step.done), [true, true, false, false]);

    engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital: 2_000_000 });
    const third = engine.getState();
    assert.deepEqual(holdingLadder(third).map((step) => step.done), [true, true, true, false]);
    assert.equal(holdingLadder(third)[3]!.count, 2);

    // Zaferi olan kurucu şehir kaybedilip kapatılıyor: zaferi sayılmaya devam ediyor, yer boşalıyor.
    const founding = third.holding!.dormant[0]!.state;
    founding.gameOver = { day: founding.time.day, byCompanyId: 'nova_holding' };
    assert.equal(engine.dispatch({ type: 'CLOSE_CITY', index: 1 }).ok, false, 'ayakta olan şehir kapatılamıyor');
    assert.ok(engine.dispatch({ type: 'CLOSE_CITY', index: 0 }).ok);
    assert.equal(third.holding!.dormant.length, 1);
    assert.equal(third.holding!.closedWins, 1);
    assert.equal(holdingWins(third), 2);
    third.victory = { day: third.time.day, kind: 'tycoon', dismissed: true };
    player(third).cash = 30_000_000;
    assert.ok(openCityQuote(third).ok, 'kapatılan şehrin yeri boşaldı');

    const done = () => third.news.filter((n) => n.title.startsWith('Holding tamamlandı')).length;
    engine.runDay();
    assert.equal(done(), 1, third.news.slice(0, 3).map((n) => n.title).join(' | '));
    assert.equal(third.holding!.completedDay, third.time.day);
    assert.ok(holdingLadder(third).every((step) => step.done));
    engine.runDay();
    assert.equal(done(), 1, 'bir kez');
  });
});
