/**
 * Swift eşitlik fikstürleri.
 *
 * TS modeli (denge burada ayarlanıyor) belirli senaryoları oynatıyor ve her
 * adımın sonucunu kaydediyor. Swift testleri (`ios-lite/Tests/.../FixtureTests`)
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
  buy,
  buyManager,
  incomePerSecond,
  maxAffordable,
  managerCost,
  newGame,
  prestige,
  stageRate,
  startCampaign,
  starsFor,
  upgradeCost,
  type ChainId,
  type LiteState,
  type Stage,
} from '../src/index';

export type Op =
  | { op: 'buy'; chain: ChainId; stage: Stage; count: number }
  | { op: 'advance'; seconds: number }
  | { op: 'offline'; seconds: number }
  | { op: 'campaign' }
  | { op: 'manager' }
  | { op: 'prestige' };

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
}

export interface Scenario {
  name: string;
  ops: Array<Op & { ok: boolean }>;
  snapshots: Snapshot[];
}

export interface Fixtures {
  /** Uyarı: elle düzenlenmez — `node tools/run-node-script.mjs packages/lite-model/test/write-fixtures.ts`. */
  generatedBy: string;
  rates: Array<[Stage, number, number]>;
  costs: Array<[ChainId, Stage, number, number, number]>;
  affordable: Array<[number, ChainId, Stage, number, number]>;
  stars: Array<[number, number]>;
  managerCosts: Array<[number, number]>;
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
  }
}

/**
 * Kayıt botu: her turda önerilen hamleyi kasa yettikçe alıyor (bazen toplu
 * alımla), sonra zamanı ilerletiyor; arada kampanya, müdür, çevrimdışı ve
 * holding adımları serpiştiriliyor. Kararlar TS'te veriliyor, adımlar
 * kaydediliyor.
 */
function record(name: string, rounds: number, dt: number, extras: (round: number) => Op[], every: number): Scenario {
  let state = newGame();
  const ops: Scenario['ops'] = [];
  const snapshots: Snapshot[] = [snapshot(state, 0)];
  const run = (op: Op) => {
    const r = apply(state, op);
    state = r.state;
    ops.push({ ...op, ok: r.ok });
  };
  for (let round = 0; round < rounds; round++) {
    for (const op of extras(round)) run(op);
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
  return { name, ops, snapshots };
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

  const stars: Fixtures['stars'] = [0, 1, 999_999_999, 1e9, 3.99e9, 4e9, 4e12, 7.3e15].map((e) => [e, starsFor(e)]);
  const managerCosts: Fixtures['managerCosts'] = [0, 1, 5, 9].map((l) => [l, managerCost(l)]);

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
  ];

  return {
    generatedBy: 'packages/lite-model/test/write-fixtures.ts — elle düzenlenmez',
    rates,
    costs,
    affordable,
    stars,
    managerCosts,
    scenarios,
  };
}
