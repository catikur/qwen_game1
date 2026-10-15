import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR_UNLOCK,
  AUTO_UNLOCK,
  CAMPAIGN,
  CHAIN_IDS,
  CITY_THEMES,
  COUNCIL_FIRST,
  COUNCIL_PAIRS,
  ENERGY_PROCESSING,
  ENERGY_UNLOCK,
  EVENT_DURATION,
  EVENT_FIRST,
  EVENT_GAP,
  GOALS,
  GOAL_IPO_INDEX,
  IPO_SHARE,
  IPO_UNLOCK,
  IPO_VALUATION_SECONDS,
  POLICY,
  OFFLINE_CAP_BASE,
  STARTING_CASH,
  STAR_SOFT_FROM,
  TRADE_ROUTE_BONUS,
  advance,
  applyOffline,
  bestMove,
  buildingTier,
  buy,
  chainReport,
  chainUnlocked,
  chooseCouncil,
  cityTheme,
  claimGoal,
  companyValue,
  featuredChain,
  firstOvertake,
  goPublic,
  goalMet,
  goalReward,
  gridPowered,
  incomePerSecond,
  islandUnlocked,
  ipoProceeds,
  maxAffordable,
  newGame,
  prestige,
  prestigePreview,
  stageRate,
  startCampaign,
  starsFor,
  steadyIncome,
  tradeRoutes,
  upgradeCost,
  upgradeGain,
  type LiteState,
} from '../src/index';

function must(result: ReturnType<typeof buy>): LiteState {
  assert.ok(result.ok, 'eylem başarısız');
  return result.ok ? result.state : (null as never);
}

function close(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)), message ?? `${actual} ≉ ${expected}`);
}

function rich(): LiteState {
  const s = newGame();
  s.cash = 1e6;
  return s;
}

test('yeni oyun: başlangıç kasası, gelir yok, ilk hamle fırın satışı', () => {
  const s = newGame();
  assert.equal(s.cash, STARTING_CASH);
  assert.equal(incomePerSecond(s), 0);
  const move = bestMove(s);
  assert.deepEqual(move && { chain: move.chain, stage: move.stage }, { chain: 'bakery', stage: 2 });
});

test('yukarı kademeyi almak geliri hiçbir zaman düşürmüyor (entegrasyon)', () => {
  let s = must(buy(rich(), 'bakery', 2, 20));
  const sellingOnly = incomePerSecond(s);
  s = must(buy(s, 'bakery', 1, 1));
  const withMill = incomePerSecond(s);
  s = must(buy(s, 'bakery', 0, 1));
  const integrated = incomePerSecond(s);
  assert.ok(withMill > sellingOnly, `değirmen geliri artırmalı: ${sellingOnly} → ${withMill}`);
  assert.ok(integrated > withMill, `tarla geliri artırmalı: ${withMill} → ${integrated}`);
});

test('tam entegre zincirde marj %85, yalnızca satışta %20', () => {
  let s = must(buy(rich(), 'bakery', 2, 5));
  assert.equal(chainReport(s, 'bakery').margin.toFixed(2), '0.20');
  s = must(buy(s, 'bakery', 1, 30));
  s = must(buy(s, 'bakery', 0, 30));
  assert.equal(chainReport(s, 'bakery').margin.toFixed(2), '0.85');
});

test('kilometre taşı hızı ikiye katlıyor', () => {
  assert.equal(stageRate(2, 25) / stageRate(2, 24), (25 / 24) * 2);
  assert.equal(stageRate(2, 0), 0);
});

test('en fazla alım maliyetle tutarlı', () => {
  for (const cash of [3, 4, 50, 1234, 9e5, 7.7e9]) {
    for (const level of [0, 3, 40]) {
      const n = maxAffordable(cash, 'coffee', 1, level);
      if (n > 0) assert.ok(upgradeCost('coffee', 1, level, n) <= cash);
      assert.ok(upgradeCost('coffee', 1, level, n + 1) > cash);
    }
  }
});

test('kilitli zincir alınamıyor', () => {
  const r = buy(rich(), 'tech', 2, 1);
  assert.equal(r.ok, false);
});

test('kampanya tam 30 saniye ×2', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  s = advance(s, 5);
  const base = incomePerSecond(s);
  const started = startCampaign(s);
  assert.ok(started.ok);
  s = started.ok ? started.state : s;
  assert.equal(incomePerSecond(s) / base, CAMPAIGN.multiplier);
  s = advance(s, CAMPAIGN.duration - 1e-6);
  assert.ok(incomePerSecond(s) > base * 1.5, 'süre bitmeden kampanya sürmeli');
  s = advance(s, 1e-3);
  assert.ok(incomePerSecond(s) < base * 1.5, 'süre bitince kampanya kapanmalı');
  assert.equal(startCampaign(s).ok, false, 'bekleme süresi dolmadan yeniden açılmamalı');
});

test('rakip kovalıyor: büyütmeyi bırakınca pay düşüyor ama tabanın altına inmiyor', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  const fresh = chainReport(s, 'bakery').share;
  s = advance(s, 3600);
  const later = chainReport(s, 'bakery').share;
  assert.ok(fresh > 0.99, `başta pay tam olmalı: ${fresh}`);
  assert.ok(later < 0.7 && later >= 0.15, `rakip yetişmeli: ${later}`);
});

/** Olay ve meclis takvimini uzağa iter: kural tek başına ölçülsün. */
function quiet(s: LiteState): LiteState {
  return { ...s, event: null, nextEventAt: 1e12, policy: null, council: null, nextCouncilAt: 1e12 };
}

test('çevrimdışı: tavanla kırpılıyor, yarı verim', () => {
  let s = must(buy(rich(), 'bakery', 2, 10));
  s = quiet(advance(s, 3600)); // rakip dengeye otursun
  const r = applyOffline(s, 10 * 3600);
  assert.equal(r.seconds, OFFLINE_CAP_BASE);
  const perSecond = r.earned / r.seconds;
  const online = incomePerSecond(s);
  assert.ok(perSecond > online * 0.4 && perSecond < online * 0.6, `${perSecond} / ${online}`);
});

test('holding: yıldız korunuyor, şehir sıfırlanıyor, rakip sertleşiyor', () => {
  const s = rich();
  s.earned = 1e11;
  const r = prestige(s);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.city, 1);
  assert.equal(r.state.stars, 10);
  // L7: satılan şehir holding haritasına geçiyor.
  assert.deepEqual(r.state.history, [{ stars: 10, listed: false, earned: 1e11 }]);
  assert.equal(r.state.cash, STARTING_CASH);
  for (const id of CHAIN_IDS) assert.deepEqual(r.state.chains[id].levels, [0, 0, 0]);
  assert.equal(prestige(newGame()).ok, false, 'kazançsız şehir satılamaz');
});

test('advance deterministik ve adım bölmesinden bağımsız değil ama tekrarlanabilir', () => {
  const s = must(buy(rich(), 'bakery', 2, 12));
  const a = advance(s, 123.5);
  const b = advance(s, 123.5);
  assert.deepEqual(a, b);
});

// ------------------------------------------------------------ L3

test('olay takvimi: ilk olay EVENT_FIRST, iki dakika sürüyor, sonraki EVENT_GAP sonra', () => {
  let s = must(buy(rich(), 'bakery', 2, 5));
  s = advance(s, EVENT_FIRST - 1);
  assert.equal(s.event, null);
  s = advance(s, 1);
  assert.ok(s.event, 'olay başlamalı');
  assert.equal(s.event!.until, EVENT_FIRST + EVENT_DURATION);
  s = advance(s, EVENT_DURATION);
  assert.equal(s.event, null, 'süre bitince olay kalkmalı');
  assert.equal(s.nextEventAt, EVENT_FIRST + EVENT_GAP);
  assert.equal(s.events, 1);
});

test('olay çevrimdışı başlamıyor; dönüşte başlıyor', () => {
  let s = must(buy(rich(), 'bakery', 2, 5));
  s = applyOffline(s, 2000).state;
  assert.equal(s.event, null);
  assert.equal(s.events, 0);
  s = advance(s, 1);
  assert.ok(s.event, 'dönüşte kaçan olay başlamalı');
});

test('hammadde krizi: pazardan alan zincir ezilir, entegre zincir korunur', () => {
  let s = must(buy(rich(), 'bakery', 2, 5));
  s = must(buy(s, 'bakery', 1, 40));
  s = must(buy(s, 'bakery', 0, 40));
  s.earned = 1e4; // kahve açık
  s = quiet(must(buy(s, 'coffee', 2, 5)));
  const calm = { bakery: chainReport(s, 'bakery').margin, coffee: chainReport(s, 'coffee').margin };
  const crisis = { ...s, event: { kind: 'crisis' as const, chain: null, until: s.clock + 100 } };
  assert.equal(chainReport(crisis, 'bakery').margin.toFixed(2), calm.bakery.toFixed(2));
  assert.ok(chainReport(crisis, 'coffee').margin < calm.coffee / 2, 'pazardan alan zincirin marjı çökmeli');
});

test('grev yalnızca vurduğu zincirin satışını yarıya indiriyor', () => {
  const s = quiet(must(buy(rich(), 'bakery', 2, 8)));
  const strike = { ...s, event: { kind: 'strike' as const, chain: 'bakery' as const, until: s.clock + 100 } };
  assert.equal(chainReport(strike, 'bakery').rates[2], chainReport(s, 'bakery').rates[2] / 2);
});

test('meclis: oturum açılıyor, seçim politikayı bir saat yürürlüğe koyuyor', () => {
  let s = must(buy(rich(), 'bakery', 2, 8));
  s = advance(s, COUNCIL_FIRST);
  assert.equal(s.council, 0, 'ilk oturum ilk seçenek çifti');
  assert.equal(chooseCouncil(newGame(), 0).ok, false, 'oturum yokken karar yok');
  s = quiet(s);
  s.council = 0;
  const before = chainReport(s, 'bakery').rates[2];
  const r = chooseCouncil(s, 1);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.policy?.kind, COUNCIL_PAIRS[0]![1]);
  assert.equal(r.state.council, null);
  assert.equal(chainReport(r.state, 'bakery').rates[2], before * POLICY.pedestrian);
  const later = advance(r.state, 3600);
  assert.equal(later.policy, null, 'bir saat sonra politika kalkmalı');
});

test('görev merdiveni: sırayla, şartı tutmadan alınmıyor, ödül gelirle ölçekleniyor', () => {
  let s = rich();
  assert.equal(GOALS[0]!.kind, 'bakeryRetail');
  assert.equal(claimGoal(s).ok, false, 'şart tutmadan ödül yok');
  s = must(buy(s, 'bakery', 2, 3));
  const cash = s.cash;
  const reward = goalReward(s, GOALS[0]!);
  const r = claimGoal(s);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.goal, 1);
  assert.equal(r.state.cash, cash + reward);
  assert.equal(claimGoal(r.state).ok, false, 'sıradaki görevin (değirmen) şartı tutmuyor');
});

test('holding yeni şehirde olay, meclis ve görevleri sıfırlıyor', () => {
  const s = rich();
  s.earned = 4e12;
  s.goal = 9;
  s.events = 12;
  const r = prestige(s);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.state.goal, 0);
  assert.equal(r.state.events, 0);
  assert.equal(r.state.nextEventAt, EVENT_FIRST);
});

// ------------------------------------------------------------ L4

/** Halka arza hazır bir şirket: kazanç eşikte, birkaç zincir satıyor. */
function ipoReady(): LiteState {
  let s = rich();
  s.cash = 1e9;
  // Kazanç önce: kahve ancak açıldıktan sonra alınabiliyor.
  s.earned = IPO_UNLOCK;
  for (const id of ['bakery', 'coffee'] as const) for (const stage of [0, 1, 2] as const) s = must(buy(s, id, stage, 40));
  return s;
}

test('halka arz: eşikten önce kapalı, bir kez yapılıyor, kasaya hissenin değeri giriyor', () => {
  const early = ipoReady();
  early.earned = IPO_UNLOCK - 1;
  assert.deepEqual(goPublic(early), { ok: false, reason: 'locked' });

  const s = ipoReady();
  const expected = steadyIncome(s) * IPO_VALUATION_SECONDS * IPO_SHARE;
  assert.equal(ipoProceeds(s), expected);
  const listed = must(goPublic(s));
  assert.equal(listed.cash - s.cash, expected);
  assert.equal(listed.listed, true);
  assert.deepEqual(goPublic(listed), { ok: false, reason: 'max' });
});

test('halka arz değerlemesi kampanya, olay ve politikadan etkilenmiyor', () => {
  const s = ipoReady();
  const calm = companyValue(s);
  const boosted = must(startCampaign(s));
  boosted.event = { kind: 'exportBoom', chain: null, until: boosted.clock + 60 };
  boosted.policy = { kind: 'taxCut', until: boosted.clock + 60 };
  assert.ok(incomePerSecond(boosted) > incomePerSecond(s) * 2, 'çarpanlar anlık geliri artırmalı');
  assert.equal(companyValue(boosted), calm);
});

test('halka açık şirket satılırken yıldız ×1,2; yeni şehir halka açık değil', () => {
  const s = ipoReady();
  s.earned = 1e11;
  assert.equal(prestigePreview(s), 10);
  const listed = must(goPublic(s));
  assert.equal(prestigePreview(listed), 12);
  const next = must(prestige(listed));
  assert.equal(next.stars, 12);
  assert.equal(next.listed, false);
  assert.equal(next.history[0]!.listed, true);
});

test('halka arz görevi: sanayiden sonra, limandan önce; halka arz edince tutuyor', () => {
  assert.equal(GOALS[GOAL_IPO_INDEX]!.kind, 'ipo');
  assert.equal(GOALS[GOAL_IPO_INDEX - 1]!.kind, 'industry');
  assert.equal(GOALS[GOAL_IPO_INDEX + 1]!.kind, 'port');
  const s = ipoReady();
  assert.equal(goalMet(s, GOALS[GOAL_IPO_INDEX]!), false);
  assert.equal(goalMet(must(goPublic(s)), GOALS[GOAL_IPO_INDEX]!), true);
});

test('şehir bonusu: ilk şehirde yok, sonra sırayla bir zincirin geliri ×2', () => {
  assert.equal(featuredChain(newGame(0)), null);
  assert.equal(featuredChain(newGame(1)), 'coffee');
  assert.equal(featuredChain(newGame(2)), 'fashion');
  assert.equal(featuredChain(newGame(5)), 'bakery');
  assert.equal(featuredChain(newGame(6)), 'coffee');

  const build = (city: number) => {
    let s = newGame(city);
    s.cash = 1e6;
    s.earned = 1e5;
    s = must(buy(s, 'coffee', 2, 10));
    s = must(buy(s, 'bakery', 2, 10));
    return s;
  };
  const first = build(0);
  const second = build(1);
  // Rakip sıfırken pay 1: fark yalnızca bonus (yıldız yok, rakip henüz kovalamadı).
  assert.equal(chainReport(second, 'coffee').income, chainReport(first, 'coffee').income * 2);
  // L7: ilk şehir satılınca fırına ticaret yolu kaldı.
  close(chainReport(second, 'bakery').income, chainReport(first, 'bakery').income * (1 + TRADE_ROUTE_BONUS));
});

test('rakip öngörüsü: ilk şehirde geçemiyor, sert şehirde geçiyor, zaten gerideysen sessiz', () => {
  const setup = (city: number, online: number) => {
    let s = newGame(city);
    s.cash = 1e7;
    for (const stage of [0, 1, 2] as const) s = must(buy(s, 'bakery', stage, 30));
    return advance(s, online);
  };
  assert.equal(firstOvertake(setup(0, 300), 4 * 3600), null);

  const hard = setup(6, 120);
  const at = firstOvertake(hard, 2 * 3600);
  assert.ok(at !== null && at > 0, `sert şehirde rakip geçmeli: ${at}`);
  // Öngörü çevrimdışı ilerlemeyle tutarlı: o anda pay eşiğin altında, bir adım öncesinde değil.
  assert.ok(chainReport(applyOffline(hard, at!).state, 'bakery').share < 0.5);
  assert.ok(chainReport(applyOffline(hard, at! - 30).state, 'bakery').share >= 0.5);

  // Uzun süre büyütmeden kalınca rakip zaten geçmiş: "seni geçti" denmiyor.
  assert.equal(firstOvertake(setup(6, 9_000), 2 * 3600), null);
});

// ------------------------------------------------------------ L7

test('yıldız eğrisi: STAR_SOFT_FROM\'a kadar karekök, sonra dördüncü kök; eşikte kesintisiz', () => {
  assert.equal(STAR_SOFT_FROM, 1e11);
  assert.equal(starsFor(1e11), 10);
  assert.equal(starsFor(1.6e12), 20);
  assert.equal(starsFor(1e15), 100);
  assert.equal(starsFor(1e15, true), 120);
  // Eşiğin hemen iki yanı aynı yıldız.
  assert.equal(starsFor(STAR_SOFT_FROM * 0.999999), 9);
  assert.equal(starsFor(STAR_SOFT_FROM * 1.000001), 10);
});

test('takımada: adalar sırayla açılıyor, her ada tek zincir', () => {
  const s = newGame();
  s.earned = ENERGY_UNLOCK - 1;
  assert.equal(islandUnlocked(s, 0), true);
  assert.equal(islandUnlocked(s, 1), false);
  assert.equal(chainUnlocked(s, 'energy'), false);
  s.earned = ENERGY_UNLOCK;
  assert.equal(islandUnlocked(s, 1), true);
  assert.equal(chainUnlocked(s, 'energy'), true);
  assert.equal(chainUnlocked(s, 'auto'), false);
  s.earned = AUTO_UNLOCK;
  assert.equal(chainUnlocked(s, 'auto'), true);
  assert.equal(islandUnlocked(s, 3), false);
  s.earned = AIR_UNLOCK;
  assert.equal(chainUnlocked(s, 'aviation'), true);
  assert.equal(islandUnlocked(s, 3), true);
  assert.equal(CHAIN_IDS.length, 8);
});

test('enerji şebekesi: diğer zincirlerde işleme ×1,3; enerjinin kendisinde değil; öneri bunu sayıyor', () => {
  let s = newGame();
  s.earned = ENERGY_UNLOCK;
  s.cash = 1e9;
  s = must(buy(s, 'bakery', 1, 10));
  s = must(buy(s, 'energy', 2, 1));
  s.cash = 1e9;
  const before = chainReport(s, 'bakery').rates[1];
  const energyBefore = chainReport(s, 'energy').rates[1];
  assert.equal(gridPowered(s), false);
  const gain = upgradeGain(s, 'energy', 1);
  const powered = must(buy(s, 'energy', 1, 1));
  assert.equal(gridPowered(powered), true);
  close(chainReport(powered, 'bakery').rates[1], before * ENERGY_PROCESSING);
  assert.equal(energyBefore, 0);
  assert.equal(chainReport(powered, 'energy').rates[1], stageRate(1, 1));
  // Kazanç tahmini gerçek gelir farkıyla aynı (fırının hızlanması dahil).
  close(gain, incomePerSecond(powered) - incomePerSecond(s));
  assert.ok(gain > 0);
});

test('ticaret yolu: satılan her şehir öne çıkan zincirine (ilk şehirde fırına) kalıcı +%10', () => {
  assert.equal(tradeRoutes(0, 'bakery'), 0);
  assert.equal(tradeRoutes(1, 'bakery'), 1);
  assert.equal(tradeRoutes(2, 'coffee'), 1);
  assert.equal(tradeRoutes(6, 'bakery'), 2);
  assert.equal(tradeRoutes(6, 'coffee'), 1);
  assert.equal(tradeRoutes(6, 'tech'), 1);
  assert.equal(tradeRoutes(13, 'energy'), 0);
  const total = CHAIN_IDS.reduce((n, id) => n + tradeRoutes(9, id), 0);
  assert.equal(total, 9);
});

test('bina kademeleri ve şehir temaları', () => {
  assert.deepEqual(
    [0, 1, 24, 25, 49, 50, 99, 100, 777].map(buildingTier),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  assert.deepEqual([0, 1, 2, 3, 4].map(cityTheme), ['coast', 'mountain', 'desert', 'snow', 'coast']);
  assert.equal(CITY_THEMES.length, 4);
});

test('ada görevleri sona eklendi: eski kayıtların görev sırası kaymıyor', () => {
  assert.equal(GOAL_IPO_INDEX, 11);
  assert.deepEqual(
    GOALS.slice(-4).map((goal) => goal.kind),
    ['firstStar', 'energyIsland', 'autoIsland', 'airIsland'],
  );
  const s = newGame();
  s.earned = AUTO_UNLOCK;
  assert.equal(goalMet(s, GOALS[GOALS.length - 3]!), true);
  assert.equal(goalMet(s, GOALS[GOALS.length - 2]!), true);
  assert.equal(goalMet(s, GOALS[GOALS.length - 1]!), false);
});
