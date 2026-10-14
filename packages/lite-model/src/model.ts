import {
  BASE_RATE,
  CAMPAIGN,
  CHAIN_BY_ID,
  CHAIN_IDS,
  COST_GROWTH,
  DISTRICTS,
  MANAGER_BASE_COST,
  MANAGER_COST_GROWTH,
  MANAGER_MAX,
  MARGIN,
  MILESTONES,
  OFFLINE_CAP_BASE,
  OFFLINE_CAP_PER_MANAGER,
  OFFLINE_EFFICIENCY,
  RIVAL_AGGRESSION_BASE,
  RIVAL_AGGRESSION_PER_CITY,
  RIVAL_LAG,
  SHARE_FLOOR,
  STAGES,
  STARTING_CASH,
  STAR_BONUS,
  STAR_SCALE,
  STAR_UNIT,
  type ChainId,
  type DistrictId,
  type Stage,
} from './content';

/**
 * CapitalForge Lite — oyun modeli.
 *
 * Saf fonksiyonlar, saf veri. Swift karşılığı `Model.swift` aynı sırayla aynı
 * işlemleri yapıyor; sonuçların eşitliğini fikstür testleri koruyor. Bu yüzden
 * burada "akıllı" kısayol yok: her döngü sabit sırada (CHAIN_IDS, STAGES), her
 * adım sabit uzunlukta.
 */

export interface ChainState {
  /** Kademe seviyeleri: [ham, işleme, satış]; 0 = sahip değil. */
  levels: [number, number, number];
  /** Rakibin bu zincirdeki akışı (birim/sn). */
  rival: number;
}

export interface LiteState {
  version: 1;
  /** Kaçıncı şehir (0'dan). Holding her satışta bir artırıyor. */
  city: number;
  /** Holding Yıldızı: kalıcı gelir çarpanı. */
  stars: number;
  cash: number;
  /** Bu şehirde ömür boyu kazanç: mahalleler, zincirler ve yıldız buna bağlı. */
  earned: number;
  /** Bütün şehirler boyunca kazanç. */
  totalEarned: number;
  /** Bu şehirde geçen oyun zamanı (sn), çevrimdışı dahil. */
  clock: number;
  /** Genel Müdür seviyesi: çevrimdışı tavanını uzatıyor. */
  manager: number;
  campaignUntil: number;
  campaignReadyAt: number;
  chains: Record<ChainId, ChainState>;
}

export function newGame(city = 0, stars = 0, totalEarned = 0): LiteState {
  const chains = {} as Record<ChainId, ChainState>;
  for (const id of CHAIN_IDS) chains[id] = { levels: [0, 0, 0], rival: 0 };
  return {
    version: 1,
    city,
    stars,
    cash: STARTING_CASH,
    earned: 0,
    totalEarned,
    clock: 0,
    manager: 0,
    campaignUntil: 0,
    campaignReadyAt: 0,
    chains,
  };
}

export function cloneState(state: LiteState): LiteState {
  const chains = {} as Record<ChainId, ChainState>;
  for (const id of CHAIN_IDS) {
    const chain = state.chains[id];
    chains[id] = { levels: [chain.levels[0], chain.levels[1], chain.levels[2]], rival: chain.rival };
  }
  return { ...state, chains };
}

// ------------------------------------------------------------ kademeler

/** Seviyenin geçtiği kilometre taşı sayısı. */
export function milestonesReached(level: number): number {
  let count = 0;
  for (const milestone of MILESTONES) if (level >= milestone) count++;
  return count;
}

/** Bir sonraki kilometre taşı (yoksa null). */
export function nextMilestone(level: number): number | null {
  for (const milestone of MILESTONES) if (level < milestone) return milestone;
  return null;
}

/** Kademenin hızı (birim/sn). */
export function stageRate(stage: Stage, level: number): number {
  if (level <= 0) return 0;
  return BASE_RATE[stage] * level * Math.pow(2, milestonesReached(level));
}

/** `level`'den başlayarak `count` seviyenin toplam maliyeti (geometrik toplam). */
export function upgradeCost(chainId: ChainId, stage: Stage, level: number, count = 1): number {
  const base = CHAIN_BY_ID[chainId].baseCost[stage];
  const growth = COST_GROWTH[stage];
  return (base * Math.pow(growth, level) * (Math.pow(growth, count) - 1)) / (growth - 1);
}

/** Kasanın yettiği en fazla seviye sayısı. */
export function maxAffordable(cash: number, chainId: ChainId, stage: Stage, level: number): number {
  const base = CHAIN_BY_ID[chainId].baseCost[stage];
  const growth = COST_GROWTH[stage];
  const first = base * Math.pow(growth, level);
  if (cash < first) return 0;
  let count = Math.floor(Math.log((cash * (growth - 1)) / first + 1) / Math.log(growth));
  // Kayan nokta sınırında bir fazla ya da eksik çıkabiliyor: maliyetle doğrula.
  while (count > 0 && upgradeCost(chainId, stage, level, count) > cash) count--;
  while (upgradeCost(chainId, stage, level, count + 1) <= cash) count++;
  return count;
}

// ------------------------------------------------------------ açılış

export function districtUnlocked(state: LiteState, id: DistrictId): boolean {
  const district = DISTRICTS.find((d) => d.id === id)!;
  return state.earned >= district.unlockAt;
}

export function chainUnlocked(state: LiteState, id: ChainId): boolean {
  const chain = CHAIN_BY_ID[id];
  return districtUnlocked(state, chain.district) && state.earned >= chain.unlockAt;
}

// ------------------------------------------------------------ gelir

export function campaignActive(state: LiteState): boolean {
  return state.clock < state.campaignUntil;
}

/** Bütün gelire uygulanan çarpan: yıldızlar, mahalleler, kampanya. */
export function incomeMultiplier(state: LiteState): number {
  let multiplier = 1 + STAR_BONUS * state.stars;
  for (const district of DISTRICTS) if (state.earned >= district.unlockAt) multiplier *= district.incomeMultiplier;
  if (campaignActive(state)) multiplier *= CAMPAIGN.multiplier;
  return multiplier;
}

export interface ChainReport {
  /** Kademe hızları: [ham, işleme, satış]. */
  rates: [number, number, number];
  /** Satılan birim/sn (satış kademesinin hızı). */
  sold: number;
  /** Kendi işlemenden karşılanan kısım. */
  processed: number;
  /** Onun da kendi hammaddenden karşılanan kısmı. */
  integrated: number;
  /** Birim başına ortalama marj (0..1). */
  margin: number;
  /** Pazar payı (0..1). */
  share: number;
  /** Gelir (₺/sn), bütün çarpanlar dahil. */
  income: number;
  /** Darboğaz: büyütülmesi en çok kazandıracak kademe (satış yoksa satış). */
  bottleneck: Stage;
}

function shareOf(sold: number, rival: number): number {
  if (sold <= 0) return 0;
  return Math.max(SHARE_FLOOR, sold / (sold + rival));
}

function marginUnits(rates: readonly [number, number, number]): { sold: number; processed: number; integrated: number; units: number } {
  const sold = rates[2];
  const processed = Math.min(sold, rates[1]);
  const integrated = Math.min(processed, rates[0]);
  const units = integrated * MARGIN.integrated + (processed - integrated) * MARGIN.processed + (sold - processed) * MARGIN.bought;
  return { sold, processed, integrated, units };
}

function chainIncomeFor(state: LiteState, chainId: ChainId, levels: readonly [number, number, number], multiplier: number): number {
  const rates: [number, number, number] = [stageRate(0, levels[0]), stageRate(1, levels[1]), stageRate(2, levels[2])];
  const m = marginUnits(rates);
  const share = shareOf(m.sold, state.chains[chainId].rival);
  return CHAIN_BY_ID[chainId].price * m.units * share * multiplier;
}

export function chainReport(state: LiteState, chainId: ChainId): ChainReport {
  const chain = state.chains[chainId];
  const rates: [number, number, number] = [stageRate(0, chain.levels[0]), stageRate(1, chain.levels[1]), stageRate(2, chain.levels[2])];
  const m = marginUnits(rates);
  const share = shareOf(m.sold, chain.rival);
  const multiplier = incomeMultiplier(state);
  const income = CHAIN_BY_ID[chainId].price * m.units * share * multiplier;
  return {
    rates,
    sold: m.sold,
    processed: m.processed,
    integrated: m.integrated,
    margin: m.sold > 0 ? m.units / m.sold : 0,
    share,
    income,
    bottleneck: bottleneckOf(state, chainId),
  };
}

export function incomePerSecond(state: LiteState): number {
  const multiplier = incomeMultiplier(state);
  let total = 0;
  for (const id of CHAIN_IDS) total += chainIncomeFor(state, id, state.chains[id].levels, multiplier);
  return total;
}

/** Bir kademe +1 seviye olunca gelirin artışı (₺/sn). */
export function upgradeGain(state: LiteState, chainId: ChainId, stage: Stage): number {
  const multiplier = incomeMultiplier(state);
  const levels = state.chains[chainId].levels;
  const before = chainIncomeFor(state, chainId, levels, multiplier);
  const next: [number, number, number] = [levels[0], levels[1], levels[2]];
  next[stage] += 1;
  return chainIncomeFor(state, chainId, next, multiplier) - before;
}

/**
 * Darboğaz: +1 seviyenin harcanan lira başına en çok gelir getirdiği kademe.
 * Satış yoksa satış (zincir onsuz para kazanmıyor).
 */
export function bottleneckOf(state: LiteState, chainId: ChainId): Stage {
  const levels = state.chains[chainId].levels;
  if (levels[2] === 0) return 2;
  let best: Stage = 2;
  let bestRatio = -1;
  for (const stage of STAGES) {
    const ratio = upgradeGain(state, chainId, stage) / upgradeCost(chainId, stage, levels[stage]);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = stage;
    }
  }
  return best;
}

export interface Move {
  chain: ChainId;
  stage: Stage;
  cost: number;
  /** Gelir artışı (₺/sn). */
  gain: number;
}

/**
 * Önerilen hamle: bütün açık zincirlerde lira başına en çok gelir getiren
 * +1 seviye. Ana oyundaki zincir kartının "tek hamle"sinin karşılığı.
 */
export function bestMove(state: LiteState): Move | null {
  let best: Move | null = null;
  let bestRatio = -1;
  for (const id of CHAIN_IDS) {
    if (!chainUnlocked(state, id)) continue;
    const levels = state.chains[id].levels;
    for (const stage of STAGES) {
      const cost = upgradeCost(id, stage, levels[stage]);
      const gain = upgradeGain(state, id, stage);
      // Henüz satışı olmayan zincirde ilk satış seviyesi her zaman aday.
      const ratio = gain / cost;
      if (gain > 0 && ratio > bestRatio) {
        bestRatio = ratio;
        best = { chain: id, stage, cost, gain };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------ eylemler

export type ActionResult = { ok: true; state: LiteState } | { ok: false; reason: 'locked' | 'cash' | 'max' | 'cooldown' };

export function buy(state: LiteState, chainId: ChainId, stage: Stage, count = 1): ActionResult {
  if (!chainUnlocked(state, chainId)) return { ok: false, reason: 'locked' };
  if (count < 1) return { ok: false, reason: 'cash' };
  const level = state.chains[chainId].levels[stage];
  const cost = upgradeCost(chainId, stage, level, count);
  if (cost > state.cash) return { ok: false, reason: 'cash' };
  const next = cloneState(state);
  next.cash -= cost;
  next.chains[chainId].levels[stage] = level + count;
  return { ok: true, state: next };
}

export function managerCost(level: number): number {
  return MANAGER_BASE_COST * Math.pow(MANAGER_COST_GROWTH, level);
}

export function buyManager(state: LiteState): ActionResult {
  if (state.manager >= MANAGER_MAX) return { ok: false, reason: 'max' };
  const cost = managerCost(state.manager);
  if (cost > state.cash) return { ok: false, reason: 'cash' };
  const next = cloneState(state);
  next.cash -= cost;
  next.manager += 1;
  return { ok: true, state: next };
}

export function startCampaign(state: LiteState): ActionResult {
  if (state.clock < state.campaignReadyAt) return { ok: false, reason: 'cooldown' };
  const next = cloneState(state);
  next.campaignUntil = state.clock + CAMPAIGN.duration;
  next.campaignReadyAt = state.clock + CAMPAIGN.duration + CAMPAIGN.cooldown;
  return { ok: true, state: next };
}

// ------------------------------------------------------------ zaman

export function rivalAggression(city: number): number {
  return RIVAL_AGGRESSION_BASE + RIVAL_AGGRESSION_PER_CITY * city;
}

/** Çevrimiçi adım (sn): kısa, kampanya sınırında bölünüyor. */
export const ONLINE_STEP = 1;
/** Çevrimdışı adım (sn): kampanya yok, rakip yarı hızda. */
export const OFFLINE_STEP = 30;

/**
 * Zamanı ilerletir. Her adımda: geliri adımın başındaki durumdan hesapla,
 * kasaya ekle, rakipleri hedefe doğru yaklaştır. Kampanya bitişi adım
 * sınırı olarak kullanılıyor ki ×2 tam süresi kadar sürsün.
 */
export function advance(state: LiteState, seconds: number, offline = false): LiteState {
  const next = cloneState(state);
  const step = offline ? OFFLINE_STEP : ONLINE_STEP;
  const lag = offline ? RIVAL_LAG * 2 : RIVAL_LAG;
  const aggression = rivalAggression(next.city);
  let remaining = seconds;
  while (remaining > 1e-9) {
    let h = Math.min(step, remaining);
    if (next.campaignUntil > next.clock) h = Math.min(h, next.campaignUntil - next.clock);
    const income = incomePerSecond(next) * (offline ? OFFLINE_EFFICIENCY : 1);
    next.cash += income * h;
    next.earned += income * h;
    next.totalEarned += income * h;
    const pull = 1 - Math.exp(-h / lag);
    for (const id of CHAIN_IDS) {
      const chain = next.chains[id];
      const sold = stageRate(2, chain.levels[2]);
      chain.rival += (aggression * sold - chain.rival) * pull;
    }
    next.clock += h;
    remaining -= h;
  }
  return next;
}

export function offlineCap(state: LiteState): number {
  return OFFLINE_CAP_BASE + OFFLINE_CAP_PER_MANAGER * state.manager;
}

export interface OfflineResult {
  state: LiteState;
  /** Kasaya giren para. */
  earned: number;
  /** Sayılan süre (tavanla kırpılmış). */
  seconds: number;
}

/** Uygulama kapalıyken geçen süre: tavanla kırpılıyor, kampanya yok, rakip yarı hızda. */
export function applyOffline(state: LiteState, elapsed: number): OfflineResult {
  const seconds = Math.max(0, Math.min(elapsed, offlineCap(state)));
  // Kampanya çevrimdışına taşmasın.
  const base = cloneState(state);
  if (base.campaignUntil > base.clock) base.campaignUntil = base.clock;
  const next = advance(base, seconds, true);
  return { state: next, earned: next.cash - base.cash, seconds };
}

// ------------------------------------------------------------ holding

export function starsFor(earned: number): number {
  return Math.floor(STAR_SCALE * Math.sqrt(Math.max(0, earned) / STAR_UNIT));
}

/** Şehri satınca kazanılacak yıldız. */
export function prestigePreview(state: LiteState): number {
  return starsFor(state.earned);
}

/** Şehri sat, holding yeni şehre geçsin: sıfırdan başla, yıldızları koru. */
export function prestige(state: LiteState): ActionResult {
  const gained = prestigePreview(state);
  if (gained < 1) return { ok: false, reason: 'locked' };
  return { ok: true, state: newGame(state.city + 1, state.stars + gained, state.totalEarned) };
}
