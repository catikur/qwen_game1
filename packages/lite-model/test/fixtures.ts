/**
 * Swift eşitlik fikstürleri.
 *
 * TS modeli (denge burada ayarlanıyor) belirli senaryoları oynatıyor ve her
 * adımın sonucunu kaydediyor. Swift testleri (`ios-lite/Kit/Tests/.../FixtureTests`)
 * aynı adımları kendi modeliyle oynatıp aynı sayıları üretmek zorunda.
 *
 * Adımlar KAYITLI: Swift botun kararını yeniden vermiyor, kaydı oynatıyor.
 * Böylece iki model arasında tek bir kayan nokta farkı bütün senaryoyu
 * saptırmıyor; fark yalnızca kendi adımında görünüyor. Botun kararını da
 * (önerilen hamle) ayrıca karşılaştırıyoruz.
 */
import {
  CHAIN_IDS,
  STAGES,
  advance,
  applyOffline,
  bestMove,
  buildingTier,
  buy,
  buyManager,
  chooseCouncil,
  cityTheme,
  catchDeal,
  claimGoal,
  dealReward,
  currentGoal,
  firstOvertake,
  goPublic,
  goalMet,
  incomePerSecond,
  ipoUnlocked,
  maxAffordable,
  managerCost,
  newGame,
  prestige,
  stageRate,
  startCampaign,
  starsFor,
  tradeRoutes,
  upgradeCost,
  weekId,
  weekStart,
  type ChainId,
  type CityRecord,
  type LiteState,
  type Stage,
} from '../src/index';

export type Op =
  | { op: 'buy'; chain: ChainId; stage: Stage; count: number }
  | { op: 'advance'; seconds: number }
  | { op: 'offline'; seconds: number }
  | { op: 'campaign' }
  | { op: 'manager' }
  | { op: 'prestige' }
  | { op: 'council'; choice: 0 | 1 }
  | { op: 'claim' }
  | { op: 'ipo' }
  | { op: 'deal' };

export interface Snapshot {
  /** Bu kadar adım oynatıldıktan sonra. */
  after: number;
  cash: number;
  earned: number;
  totalEarned: number;
  clock: number;
  city: number;
  stars: number;
  manager: number;
  levels: number[][];
  rivals: number[];
  income: number;
  best: { chain: ChainId; stage: Stage } | null;
  // L3
  event: { kind: string; chain: ChainId | null; until: number } | null;
  nextEventAt: number;
  events: number;
  council: number | null;
  nextCouncilAt: number;
  sessions: number;
  policy: { kind: string; until: number } | null;
  policies: number;
  campaigns: number;
  goal: number;
  // L4
  listed: boolean;
  /** `firstOvertake(state, OVERTAKE_HORIZON)`. */
  overtake: number | null;
  // L7
  history: CityRecord[];
  // L9
  deal: { kind: string; chain: ChainId | null; until: number } | null;
  nextDealAt: number;
  deals: number;
  /** Duran fırsatın ödülü (`dealReward`). */
  dealReward: number;
}

/** Takımada senaryosunun başlangıcı: daha önce satılmış beş şehir. */
const ISLAND_HISTORY: CityRecord[] = [
  { stars: 9, listed: true, earned: 6.2e10 },
  { stars: 12, listed: true, earned: 3.1e11 },
  { stars: 11, listed: false, earned: 5.5e11 },
  { stars: 14, listed: true, earned: 1.3e12 },
  { stars: 14, listed: true, earned: 1.9e12 },
];

/** Fikstürde rakip öngörüsünün ufku (sn). */
export const OVERTAKE_HORIZON = 4 * 3600;

/** Rakip öngörüsü vakası: `newGame(city)`, kasa, alımlar, çevrimiçi süre. */
export interface OvertakeCase {
  city: number;
  cash: number;
  buys: Array<[ChainId, Stage, number]>;
  online: number;
  horizon: number;
  result: number | null;
}

export interface Scenario {
  name: string;
  /** Başlangıç: `newGame(city, stars, totalEarned, history)`. */
  start: { city: number; stars: number; totalEarned: number; history: CityRecord[] };
  ops: Array<Op & { ok: boolean }>;
  snapshots: Snapshot[];
}

export interface Fixtures {
  /** Uyarı: elle düzenlenmez — `node tools/run-node-script.mjs packages/lite-model/test/write-fixtures.ts`. */
  generatedBy: string;
  rates: Array<[Stage, number, number]>;
  costs: Array<[ChainId, Stage, number, number, number]>;
  affordable: Array<[number, ChainId, Stage, number, number]>;
  /** [kazanç, yıldız, halka açıkken yıldız] */
  stars: Array<[number, number, number]>;
  managerCosts: Array<[number, number]>;
  overtakes: OvertakeCase[];
  /** L7: [seviye, bina kademesi] */
  tiers: Array<[number, number]>;
  /** L7: [şehir, zincir, ticaret yolu sayısı] */
  routes: Array<[number, ChainId, number]>;
  /** L7: [şehir, tema] */
  themes: Array<[number, string]>;
  /** L8: [epoch ms, ISO hafta, haftanın başı ms] */
  weeks: Array<[number, string, number]>;
  scenarios: Scenario[];
}

function snapshot(state: LiteState, after: number): Snapshot {
  const move = bestMove(state);
  return {
    after,
    cash: state.cash,
    earned: state.earned,
    totalEarned: state.totalEarned,
    clock: state.clock,
    city: state.city,
    stars: state.stars,
    manager: state.manager,
    levels: CHAIN_IDS.map((id) => [...state.chains[id].levels]),
    rivals: CHAIN_IDS.map((id) => state.chains[id].rival),
    income: incomePerSecond(state),
    best: move ? { chain: move.chain, stage: move.stage } : null,
    event: state.event ? { ...state.event } : null,
    nextEventAt: state.nextEventAt,
    events: state.events,
    council: state.council,
    nextCouncilAt: state.nextCouncilAt,
    sessions: state.sessions,
    policy: state.policy ? { ...state.policy } : null,
    policies: state.policies,
    campaigns: state.campaigns,
    goal: state.goal,
    listed: state.listed,
    overtake: firstOvertake(state, OVERTAKE_HORIZON),
    history: state.history.map((record) => ({ ...record })),
    deal: state.deal ? { ...state.deal } : null,
    nextDealAt: state.nextDealAt,
    deals: state.deals,
    dealReward: dealReward(state),
  };
}

function apply(state: LiteState, op: Op): { state: LiteState; ok: boolean } {
  switch (op.op) {
    case 'buy': {
      const r = buy(state, op.chain, op.stage, op.count);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'advance':
      return { state: advance(state, op.seconds), ok: true };
    case 'offline':
      return { state: applyOffline(state, op.seconds).state, ok: true };
    case 'campaign': {
      const r = startCampaign(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'manager': {
      const r = buyManager(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'prestige': {
      const r = prestige(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'council': {
      const r = chooseCouncil(state, op.choice);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'claim': {
      const r = claimGoal(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'ipo': {
      const r = goPublic(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
    case 'deal': {
      const r = catchDeal(state);
      return r.ok ? { state: r.state, ok: true } : { state, ok: false };
    }
  }
}

/**
 * Kayıt botu: her turda önerilen hamleyi kasa yettikçe alıyor (bazen toplu
 * alımla), sonra zamanı ilerletiyor; arada kampanya, müdür, çevrimdışı ve
 * holding adımları serpiştiriliyor. Kararlar TS'te veriliyor, adımlar
 * kaydediliyor.
 */
function record(
  name: string,
  rounds: number,
  dt: number,
  extras: (round: number) => Op[],
  every: number,
  start: LiteState = newGame(),
  /** L9: bot fırsatları yakalıyor mu (eski senaryolar yakalamıyor: fırsat süresi dolup kayboluyor). */
  catchDeals = false,
): Scenario {
  let state = start;
  const ops: Scenario['ops'] = [];
  const snapshots: Snapshot[] = [snapshot(state, 0)];
  const run = (op: Op) => {
    const r = apply(state, op);
    state = r.state;
    ops.push({ ...op, ok: r.ok });
  };
  for (let round = 0; round < rounds; round++) {
    for (const op of extras(round)) run(op);
    // L3: tutan görevin ödülünü al; açık oturumda sırayla seçenek seç.
    const goal = currentGoal(state);
    if (goal && goalMet(state, goal)) run({ op: 'claim' });
    if (state.council !== null) run({ op: 'council', choice: (state.sessions % 2) as 0 | 1 });
    // L4: halka arz açılır açılmaz.
    if (!state.listed && ipoUnlocked(state)) run({ op: 'ipo' });
    // L9: duran fırsatı yakala.
    if (catchDeals && state.deal !== null) run({ op: 'deal' });
    for (let guard = 0; guard < 40; guard++) {
      const move = bestMove(state);
      if (!move || move.cost > state.cash) break;
      // Üç turda bir toplu alım: maxAffordable ve geometrik toplam da sınansın.
      const count = round % 3 === 0 ? Math.max(1, Math.min(5, maxAffordable(state.cash, move.chain, move.stage, state.chains[move.chain].levels[move.stage]))) : 1;
      run({ op: 'buy', chain: move.chain, stage: move.stage, count });
    }
    run({ op: 'advance', seconds: dt });
    if ((round + 1) % every === 0) snapshots.push(snapshot(state, ops.length));
  }
  snapshots.push(snapshot(state, ops.length));
  const begin = { city: start.city, stars: start.stars, totalEarned: start.totalEarned, history: start.history.map((r) => ({ ...r })) };
  return { name, start: begin, ops, snapshots };
}

export function buildFixtures(): Fixtures {
  const levels = [0, 1, 2, 9, 24, 25, 26, 49, 50, 99, 100, 101, 250, 777, 1000, 1200];
  const rates: Fixtures['rates'] = [];
  for (const stage of STAGES) for (const level of levels) rates.push([stage, level, stageRate(stage, level)]);

  const costs: Fixtures['costs'] = [];
  for (const id of CHAIN_IDS) {
    for (const stage of STAGES) {
      for (const [level, count] of [[0, 1], [0, 10], [7, 1], [33, 25], [120, 3]] as const) {
        costs.push([id, stage, level, count, upgradeCost(id, stage, level, count)]);
      }
    }
  }

  const affordable: Fixtures['affordable'] = [];
  for (const cash of [0, 3.99, 4, 100, 12_345.6, 9.9e8, 4.2e13]) {
    for (const id of CHAIN_IDS) {
      for (const level of [0, 17, 60]) affordable.push([cash, id, 2, level, maxAffordable(cash, id, 2, level)]);
    }
  }

  const stars: Fixtures['stars'] = [0, 1, 999_999_999, 1e9, 3.99e9, 4e9, 9.99e10, 1e11, 1.07e11, 4e12, 7.3e15, 2.5e18].map((e) => [
    e,
    starsFor(e),
    starsFor(e, true),
  ]);
  const managerCosts: Fixtures['managerCosts'] = [0, 1, 5, 9].map((l) => [l, managerCost(l)]);

  // Rakip öngörüsü: ilk şehirde rakip geçemiyor (hedefi akışın 0,6'sı),
  // dördüncü şehirden sonra geçiyor. Biri zaten geride (sonuç null olmalı).
  const overtakeCase = (city: number, buys: OvertakeCase['buys'], online: number, horizon: number): OvertakeCase => {
    let state = newGame(city);
    state.cash = 1e7;
    for (const [chain, stage, count] of buys) {
      const r = buy(state, chain, stage, count);
      if (r.ok) state = r.state;
    }
    state = advance(state, online);
    return { city, cash: 1e7, buys, online, horizon, result: firstOvertake(state, horizon) };
  };
  const bakery: OvertakeCase['buys'] = [['bakery', 0, 30], ['bakery', 1, 30], ['bakery', 2, 30]];
  const overtakes: OvertakeCase[] = [
    overtakeCase(0, bakery, 300, 4 * 3600),
    overtakeCase(3, bakery, 300, 4 * 3600),
    overtakeCase(6, bakery, 120, 2 * 3600),
    overtakeCase(6, bakery, 9_000, 2 * 3600),
  ];

  const scenarios = [
    // Açılış: ilk 20 dakika, kampanya her fırsatta.
    record('acilis', 240, 5, (round) => (round % 7 === 0 ? [{ op: 'campaign' }] : []), 20),
    // Orta oyun: çevrimdışı dönüşler ve müdür.
    record(
      'cevrimdisi',
      160,
      20,
      (round) => {
        const ops: Op[] = [];
        if (round % 40 === 39) ops.push({ op: 'offline', seconds: 5_000 + round * 37 });
        if (round % 25 === 24) ops.push({ op: 'manager' });
        if (round % 11 === 0) ops.push({ op: 'campaign' });
        return ops;
      },
      10,
    ),
    // Uzun koşu ve holding: şehri satıp yeni şehirde devam.
    record(
      'holding',
      260,
      60,
      (round) => {
        const ops: Op[] = [];
        if (round % 30 === 29) ops.push({ op: 'offline', seconds: 20_000 });
        if (round % 20 === 19) ops.push({ op: 'manager' });
        if (round === 200) ops.push({ op: 'prestige' });
        return ops;
      },
      20,
    ),
    // L7: takımada. Beşinci şehir (beş ticaret yolu, öne çıkan fırın), 60
    // yıldızla: adalar açılıyor, enerji şebekesi kuruluyor, şehir satılıyor.
    record(
      'takimada',
      150,
      120,
      (round) => {
        const ops: Op[] = [];
        if (round % 25 === 24) ops.push({ op: 'offline', seconds: 9_000 });
        if (round % 15 === 14) ops.push({ op: 'manager' });
        if (round % 9 === 0) ops.push({ op: 'campaign' });
        if (round === 140) ops.push({ op: 'prestige' });
        return ops;
      },
      15,
      newGame(5, 60, 4e14, ISLAND_HISTORY),
    ),
    // L9: fırsatlar. 4 sn'lik turlar (12 sn'lik fırsat kaçmıyor), kampanyalı;
    // bazı fırsatlar ara sıra kasıtlı kaçırılıyor (çevrimdışı dönüşte duran fırsat kayboluyor).
    record(
      'firsatlar',
      600,
      4,
      (round) => {
        const ops: Op[] = [];
        if (round % 13 === 0) ops.push({ op: 'campaign' });
        if (round % 150 === 149) ops.push({ op: 'offline', seconds: 3_000 });
        // Yakalanmamış fırsata yine dokunmak: reddediliyor, kasa değişmiyor.
        if (round % 50 === 7) ops.push({ op: 'deal' });
        return ops;
      },
      25,
      newGame(),
      true,
    ),
  ];

  const tiers: Fixtures['tiers'] = [0, 1, 24, 25, 49, 50, 99, 100, 777].map((level) => [level, buildingTier(level)]);
  const routes: Fixtures['routes'] = [];
  for (const city of [0, 1, 2, 5, 6, 13]) for (const id of CHAIN_IDS) routes.push([city, id, tradeRoutes(city, id)]);
  const themes: Fixtures['themes'] = [0, 1, 2, 3, 4, 9].map((city) => [city, cityTheme(city)]);
  const weeks: Fixtures['weeks'] = [
    Date.UTC(2026, 9, 15, 12),
    Date.UTC(2026, 9, 12),
    Date.UTC(2026, 9, 11, 23, 59, 59, 999),
    Date.UTC(2027, 0, 1),
    Date.UTC(2027, 0, 4),
    Date.UTC(2024, 11, 30),
    Date.UTC(2020, 11, 31),
    Date.UTC(1999, 0, 1),
    Date.UTC(2100, 2, 1, 6),
  ].map((ms) => [ms, weekId(ms), weekStart(weekId(ms))]);

  return {
    generatedBy: 'packages/lite-model/test/write-fixtures.ts — elle düzenlenmez',
    rates,
    costs,
    affordable,
    stars,
    managerCosts,
    overtakes,
    tiers,
    routes,
    themes,
    weeks,
    scenarios,
  };
}
