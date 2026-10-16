/**
 * Ekran görüntüsü senaryoları (iOS `Scenario.swift` ile aynı): önerilen hamleyi
 * oynayan bir bot şehri belirli bir ana kadar getiriyor. Adres
 * `?scenario=<ad>` ile açılıyor; kayıt okunmuyor ve yazılmıyor, saat donuk.
 */
import {
  advance,
  bestMove,
  buy,
  buyManager,
  chooseCouncil,
  claimGoal,
  goPublic,
  incomePerSecond,
  managerCost,
  newGame,
  prestige,
  sharePrice,
  startCampaign,
  type ChainId,
  type CityRecord,
  type LiteState,
} from '@capital/lite-model';

export const PRICE_INTERVAL = 60;
export const PRICE_LIMIT = 120;

export interface Built {
  state: LiteState;
  /** Halka arzdan beri hisse fiyatı (borsa grafiği). */
  prices: number[];
}

/** L7 senaryolarının başlangıcı: ilk şehir sekiz saatte satılmış gibi. */
const islandStart = (): LiteState => newGame(1, 69, 1.15e14, [{ stars: 69, listed: true, earned: 1.15e14 }]);

/** Harita için örnek geçmiş: üç satılmış şehir. */
const SAMPLE_HISTORY: CityRecord[] = [
  { stars: 9, listed: true, earned: 6.3e10 },
  { stars: 14, listed: true, earned: 1.6e11 },
  { stars: 21, listed: true, earned: 6.1e11 },
];

function play(seconds: number, start: LiteState = newGame(), decideCouncil = true, ipo = true): Built {
  let state = start;
  const prices: number[] = [];
  for (let second = 0; second < seconds; second++) {
    // Görev tuttukça ödülü al; mecliste o an daha çok kazandıranı seç.
    for (let r = claimGoal(state); r.ok; r = claimGoal(state)) state = r.state;
    if (decideCouncil && state.council !== null) {
      const a = chooseCouncil(state, 0);
      const b = chooseCouncil(state, 1);
      if (a.ok && b.ok) state = incomePerSecond(a.state) >= incomePerSecond(b.state) ? a.state : b.state;
    }
    if (ipo && !state.listed) {
      const r = goPublic(state);
      if (r.ok) state = r.state;
    }
    const campaign = startCampaign(state);
    if (campaign.ok) state = campaign.state;
    if (managerCost(state.manager) < incomePerSecond(state) * 120) {
      const r = buyManager(state);
      if (r.ok) state = r.state;
    }
    for (let k = 0; k < 60; k++) {
      const move = bestMove(state);
      if (!move || move.cost > state.cash) break;
      const r = buy(state, move.chain, move.stage, 1);
      if (!r.ok) break;
      state = r.state;
    }
    state = advance(state, 1);
    // Borsa grafiği: uygulamadaki gibi dakikada bir örnek, son iki saat.
    if (state.listed && second % PRICE_INTERVAL === 0) {
      prices.push(sharePrice(state));
      if (prices.length > PRICE_LIMIT) prices.shift();
    }
  }
  // Görüntüde kampanya sayacı kafa karıştırmasın: senaryo kampanyasız bitiyor.
  state.campaignUntil = state.clock;
  state.campaignReadyAt = state.clock;
  return { state, prices };
}

export function buildScenario(name: string): Built {
  switch (name) {
    case 'start':
      return { state: newGame(), prices: [] };
    case 'early':
      return play(5 * 60);
    case 'mid':
      return play(70 * 60);
    case 'late':
      return play(4 * 3600);
    case 'council':
      return play(11 * 60, newGame(), false);
    case 'ipo':
      return play(85 * 60, newGame(), true, false);
    case 'listed':
      return play(2 * 3600 + 20 * 60);
    case 'city2': {
      const first = play(4 * 3600);
      const next = prestige(first.state);
      return next.ok ? play(20 * 60, next.state) : first;
    }
    case 'islands':
      return play(3 * 3600 + 30 * 60, islandStart());
    case 'skyline': {
      const built = play(3 * 3600 + 30 * 60, islandStart());
      const cash = built.state.cash;
      built.state.cash = Number.MAX_VALUE;
      for (const chain of ['bakery', 'fashion', 'tech', 'energy'] as ChainId[]) {
        const level = built.state.chains[chain].levels[2];
        if (level < 110) {
          const r = buy(built.state, chain, 2, 110 - level);
          if (r.ok) built.state = r.state;
        }
      }
      built.state.cash = cash;
      return built;
    }
    case 'desert':
      return play(40 * 60, newGame(2, 23, 0, SAMPLE_HISTORY.slice(0, 2)));
    case 'snow':
      return play(40 * 60, newGame(3, 44, 0, SAMPLE_HISTORY));
    default:
      return { state: newGame(), prices: [] };
  }
}
