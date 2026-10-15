import {
  BASE_RATE,
  CAMPAIGN,
  CHAIN_BY_ID,
  CHAIN_IDS,
  CITY_BONUS,
  CITY_FEATURED,
  COST_GROWTH,
  COUNCIL_FIRST,
  COUNCIL_GAP,
  COUNCIL_PAIRS,
  CRISIS_MARGIN,
  DISTRICTS,
  EVENT_DURATION,
  EVENT_FIRST,
  EVENT_GAP,
  EVENT_KINDS,
  EXPORT_BOOM_MULTIPLIER,
  FASHION_WEEK_MULTIPLIER,
  GOALS,
  IPO_SHARE,
  IPO_SHARES,
  IPO_UNLOCK,
  IPO_VALUATION_SECONDS,
  LISTED_STAR_MULTIPLIER,
  MANAGER_BASE_COST,
  MANAGER_COST_GROWTH,
  MANAGER_MAX,
  MARGIN,
  MILESTONES,
  OFFLINE_CAP_BASE,
  OFFLINE_CAP_PER_MANAGER,
  OFFLINE_EFFICIENCY,
  OVERTAKE_SHARE,
  POLICY,
  POLICY_DURATION,
  RIVAL_AGGRESSION_BASE,
  RIVAL_AGGRESSION_PER_CITY,
  RIVAL_LAG,
  RIVAL_PUSH_MULTIPLIER,
  SHARE_FLOOR,
  STAGES,
  STARTING_CASH,
  STAR_BONUS,
  STAR_SCALE,
  STAR_UNIT,
  STRIKE_MULTIPLIER,
  TOURISM_MULTIPLIER,
  type ChainId,
  type DistrictId,
  type EventKind,
  type GoalDef,
  type PolicyKind,
  type Stage,
} from './content';

/**
 * CapitalForge Lite — oyun modeli.
 *
 * Saf fonksiyonlar, saf veri. Swift karşılığı `Model.swift` aynı sırayla aynı
 * işlemleri yapıyor; sonuçların eşitliğini fikstür testleri koruyor. Bu yüzden
 * burada "akıllı" kısayol yok: her döngü sabit sırada (CHAIN_IDS, STAGES), her
 * adım sabit uzunlukta, her seçim tamsayı aritmetiğiyle.
 */

export interface ChainState {
  /** Kademe seviyeleri: [ham, işleme, satış]; 0 = sahip değil. */
  levels: [number, number, number];
  /** Rakibin bu zincirdeki akışı (birim/sn). */
  rival: number;
}

export interface ActiveEvent {
  kind: EventKind;
  /** Grevin vurduğu zincir; diğer olaylarda null. */
  chain: ChainId | null;
  until: number;
}

export interface ActivePolicy {
  kind: PolicyKind;
  until: number;
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
  // ---- L3
  /** Süren şehir olayı. */
  event: ActiveEvent | null;
  nextEventAt: number;
  /** Bu şehirde başlayan olay sayısı (sıradaki olayın seçimi buna bağlı). */
  events: number;
  /** Açık meclis oturumu: hangi seçenek çifti. */
  council: number | null;
  nextCouncilAt: number;
  /** Bu şehirde açılan oturum sayısı. */
  sessions: number;
  /** Yürürlükteki politika. */
  policy: ActivePolicy | null;
  /** Seçilen politika sayısı (görev için). */
  policies: number;
  /** Açılan kampanya sayısı (görev için). */
  campaigns: number;
  /** Görev merdiveninde sıradaki görev. */
  goal: number;
  // ---- L4
  /** Şirket bu şehirde halka arz edildi mi. */
  listed: boolean;
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
    event: null,
    nextEventAt: EVENT_FIRST,
    events: 0,
    council: null,
    nextCouncilAt: COUNCIL_FIRST,
    sessions: 0,
    policy: null,
    policies: 0,
    campaigns: 0,
    goal: 0,
    listed: false,
  };
}

export function cloneState(state: LiteState): LiteState {
  const chains = {} as Record<ChainId, ChainState>;
  for (const id of CHAIN_IDS) {
    const chain = state.chains[id];
    chains[id] = { levels: [chain.levels[0], chain.levels[1], chain.levels[2]], rival: chain.rival };
  }
  return {
    ...state,
    chains,
    event: state.event ? { ...state.event } : null,
    policy: state.policy ? { ...state.policy } : null,
  };
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

/** Kademenin taban hızı (birim/sn): olay ve politika hariç. */
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

// ------------------------------------------------------------ olay ve politika etkileri

function eventIs(state: LiteState, kind: EventKind): boolean {
  return state.event !== null && state.event.kind === kind;
}

function policyIs(state: LiteState, kind: PolicyKind): boolean {
  return state.policy !== null && state.policy.kind === kind;
}

export function campaignActive(state: LiteState): boolean {
  return state.clock < state.campaignUntil;
}

/** Kampanyanın çarpanı: meclisin kampanya fonu ×2'yi ×3 yapıyor. */
export function campaignMultiplier(state: LiteState): number {
  return policyIs(state, 'campaignFund') ? POLICY.campaignFund : CAMPAIGN.multiplier;
}

/** Bütün gelire uygulanan çarpan: yıldızlar, mahalleler, kampanya, olay, politika. */
export function incomeMultiplier(state: LiteState): number {
  let multiplier = 1 + STAR_BONUS * state.stars;
  for (const district of DISTRICTS) if (state.earned >= district.unlockAt) multiplier *= district.incomeMultiplier;
  if (campaignActive(state)) multiplier *= campaignMultiplier(state);
  if (eventIs(state, 'exportBoom')) multiplier *= EXPORT_BOOM_MULTIPLIER;
  if (policyIs(state, 'taxCut')) multiplier *= POLICY.taxCut;
  if (policyIs(state, 'exportFair')) multiplier *= POLICY.exportFair;
  return multiplier;
}

/** Şehrin öne çıkan zinciri: ilk şehirde yok, sonra CITY_FEATURED sırasıyla. */
export function featuredChain(state: LiteState): ChainId | null {
  if (state.city < 1) return null;
  return CITY_FEATURED[(state.city - 1) % CITY_FEATURED.length]!;
}

/** Bir zincirin gelirine özel çarpan (şehir bonusu, turizm, moda haftası, tanıtım). */
export function chainMultiplier(state: LiteState, chainId: ChainId): number {
  let multiplier = featuredChain(state) === chainId ? CITY_BONUS : 1;
  const tourist = chainId === 'bakery' || chainId === 'coffee';
  if (eventIs(state, 'tourism') && tourist) multiplier *= TOURISM_MULTIPLIER;
  if (eventIs(state, 'fashionWeek') && chainId === 'fashion') multiplier *= FASHION_WEEK_MULTIPLIER;
  if (policyIs(state, 'tourismPromo') && (tourist || chainId === 'fashion')) multiplier *= POLICY.tourismPromo;
  return multiplier;
}

/** Bir kademenin hızına özel çarpan (grev, teşvikler). */
export function stageMultiplier(state: LiteState, chainId: ChainId, stage: Stage): number {
  let multiplier = 1;
  if (stage === 2 && state.event !== null && state.event.kind === 'strike' && state.event.chain === chainId) {
    multiplier *= STRIKE_MULTIPLIER;
  }
  if (stage === 0 && policyIs(state, 'industryGrant')) multiplier *= POLICY.industryGrant;
  if (stage === 1 && policyIs(state, 'techGrant')) multiplier *= POLICY.techGrant;
  if (stage === 2 && policyIs(state, 'pedestrian')) multiplier *= POLICY.pedestrian;
  return multiplier;
}

/** Kademelerin etkin hızı: taban × olay/politika. */
export function effectiveRates(state: LiteState, chainId: ChainId, levels: readonly [number, number, number]): [number, number, number] {
  return [
    stageRate(0, levels[0]) * stageMultiplier(state, chainId, 0),
    stageRate(1, levels[1]) * stageMultiplier(state, chainId, 1),
    stageRate(2, levels[2]) * stageMultiplier(state, chainId, 2),
  ];
}

/** Marjlar: hammadde krizinde pazardan alınan mal ve hammadde pahalı, entegrasyon korunuyor. */
export function margins(state: LiteState): { bought: number; processed: number; integrated: number } {
  if (eventIs(state, 'crisis')) {
    return { bought: CRISIS_MARGIN.bought, processed: CRISIS_MARGIN.processed, integrated: MARGIN.integrated };
  }
  return { bought: MARGIN.bought, processed: MARGIN.processed, integrated: MARGIN.integrated };
}

/** Rakibin kovalama hedefi (satış hızının katı). */
export function rivalAggression(state: LiteState): number {
  let aggression = RIVAL_AGGRESSION_BASE + RIVAL_AGGRESSION_PER_CITY * state.city;
  if (eventIs(state, 'rivalPush')) aggression *= RIVAL_PUSH_MULTIPLIER;
  if (policyIs(state, 'competitionBoard')) aggression *= POLICY.competitionBoard;
  return aggression;
}

// ------------------------------------------------------------ gelir

export interface ChainReport {
  /** Kademe hızları (etkin): [ham, işleme, satış]. */
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

function marginUnits(
  rates: readonly [number, number, number],
  m: { bought: number; processed: number; integrated: number },
): { sold: number; processed: number; integrated: number; units: number } {
  const sold = rates[2];
  const processed = Math.min(sold, rates[1]);
  const integrated = Math.min(processed, rates[0]);
  const units = integrated * m.integrated + (processed - integrated) * m.processed + (sold - processed) * m.bought;
  return { sold, processed, integrated, units };
}

function chainIncomeFor(state: LiteState, chainId: ChainId, levels: readonly [number, number, number], multiplier: number): number {
  const m = marginUnits(effectiveRates(state, chainId, levels), margins(state));
  const share = shareOf(m.sold, state.chains[chainId].rival);
  return CHAIN_BY_ID[chainId].price * m.units * share * multiplier * chainMultiplier(state, chainId);
}

export function chainReport(state: LiteState, chainId: ChainId): ChainReport {
  const chain = state.chains[chainId];
  const rates = effectiveRates(state, chainId, chain.levels);
  const m = marginUnits(rates, margins(state));
  const share = shareOf(m.sold, chain.rival);
  const income = CHAIN_BY_ID[chainId].price * m.units * share * incomeMultiplier(state) * chainMultiplier(state, chainId);
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

/**
 * Sürekli gelir: kampanya, olay ve politika olmadan (₺/sn). Halka arz
 * değerlemesi buna bakıyor; anlık çarpanların üstüne denk getirmek bir şey
 * kazandırmasın.
 */
export function steadyIncome(state: LiteState): number {
  const calm = cloneState(state);
  calm.event = null;
  calm.policy = null;
  calm.campaignUntil = calm.clock;
  return incomePerSecond(calm);
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
      const ratio = gain / cost;
      if (gain > 0 && ratio > bestRatio) {
        bestRatio = ratio;
        best = { chain: id, stage, cost, gain };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------ görevler

export function currentGoal(state: LiteState): GoalDef | null {
  return GOALS[state.goal] ?? null;
}

export function goalMet(state: LiteState, goal: GoalDef): boolean {
  const bakery = state.chains.bakery.levels;
  switch (goal.kind) {
    case 'bakeryRetail':
      return bakery[2] >= 1;
    case 'bakeryProcess':
      return bakery[1] >= 1;
    case 'bakeryChain':
      return bakery[0] >= 1 && bakery[1] >= 1 && bakery[2] >= 1;
    case 'firstCampaign':
      return state.campaigns >= 1;
    case 'coffeeRetail':
      return state.chains.coffee.levels[2] >= 1;
    case 'level25':
      return CHAIN_IDS.some((id) => state.chains[id].levels.some((level) => level >= 25));
    case 'center':
      return districtUnlocked(state, 'center');
    case 'manager':
      return state.manager >= 1;
    case 'council':
      return state.policies >= 1;
    case 'share75':
      return CHAIN_IDS.some((id) => state.chains[id].levels[2] > 0 && chainReport(state, id).share >= 0.75);
    case 'industry':
      return districtUnlocked(state, 'industry');
    case 'ipo':
      return state.listed;
    case 'port':
      return districtUnlocked(state, 'port');
    case 'technopark':
      return districtUnlocked(state, 'technopark');
    case 'firstStar':
      return prestigePreview(state) >= 1;
  }
}

/** Görevin ödülü: şimdiki gelirin `rewardSeconds` saniyesi, en az `minReward`. */
export function goalReward(state: LiteState, goal: GoalDef): number {
  return Math.max(goal.minReward, incomePerSecond(state) * goal.rewardSeconds);
}

// ------------------------------------------------------------ eylemler

export type ActionResult =
  | { ok: true; state: LiteState }
  | { ok: false; reason: 'locked' | 'cash' | 'max' | 'cooldown' | 'none' | 'unmet' };

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
  next.campaigns += 1;
  return { ok: true, state: next };
}

/** Meclis kararı: açık oturumun iki seçeneğinden biri (0 ya da 1). */
export function chooseCouncil(state: LiteState, choice: 0 | 1): ActionResult {
  if (state.council === null) return { ok: false, reason: 'none' };
  const next = cloneState(state);
  next.policy = { kind: COUNCIL_PAIRS[state.council]![choice], until: state.clock + POLICY_DURATION };
  next.council = null;
  next.policies += 1;
  return { ok: true, state: next };
}

/** Sıradaki görevin ödülünü al. */
export function claimGoal(state: LiteState): ActionResult {
  const goal = currentGoal(state);
  if (!goal) return { ok: false, reason: 'none' };
  if (!goalMet(state, goal)) return { ok: false, reason: 'unmet' };
  const reward = goalReward(state, goal);
  const next = cloneState(state);
  next.cash += reward;
  next.goal += 1;
  return { ok: true, state: next };
}

// ------------------------------------------------------------ halka arz

export function ipoUnlocked(state: LiteState): boolean {
  return state.earned >= IPO_UNLOCK;
}

/** Şirket değeri: sürekli gelirin IPO_VALUATION_SECONDS saniyesi. */
export function companyValue(state: LiteState): number {
  return steadyIncome(state) * IPO_VALUATION_SECONDS;
}

/** Borsadaki hisse fiyatı. */
export function sharePrice(state: LiteState): number {
  return companyValue(state) / IPO_SHARES;
}

/** Halka arzda kasaya girecek para. */
export function ipoProceeds(state: LiteState): number {
  return companyValue(state) * IPO_SHARE;
}

/** Halka arz: hissenin IPO_SHARE'i satılıyor, karşılığı kasaya. Şehirde bir kez. */
export function goPublic(state: LiteState): ActionResult {
  if (state.listed) return { ok: false, reason: 'max' };
  if (!ipoUnlocked(state)) return { ok: false, reason: 'locked' };
  const proceeds = ipoProceeds(state);
  const next = cloneState(state);
  next.cash += proceeds;
  next.listed = true;
  return { ok: true, state: next };
}

// ------------------------------------------------------------ zaman

/** Çevrimiçi adım (sn): kısa, kampanya/olay/politika sınırlarında bölünüyor. */
export const ONLINE_STEP = 1;
/** Çevrimdışı adım (sn): kampanya ve olay yok, rakip yarı hızda. */
export const OFFLINE_STEP = 30;
/** Sınır toleransı: kayan nokta toplamı sınırın bir tık altında kalmasın. */
const EPS = 1e-9;

/**
 * Sıradaki olayı başlatır. Aday listesi sabit sırada süzülüyor; seçim olay
 * sayacından tamsayıyla. Grev satışı olan zincirlerden birini vuruyor; moda
 * haftası moda, ihracat atağı Liman açılmadan gelmiyor.
 */
function startEvent(state: LiteState): void {
  const selling = CHAIN_IDS.filter((id) => state.chains[id].levels[2] > 0);
  const candidates = EVENT_KINDS.filter((kind) => {
    if (kind === 'strike') return selling.length > 0;
    if (kind === 'fashionWeek') return state.chains.fashion.levels[2] > 0;
    if (kind === 'exportBoom') return districtUnlocked(state, 'port');
    return true;
  });
  const kind = candidates[(state.events * 7 + state.city * 3) % candidates.length]!;
  const chain = kind === 'strike' ? selling[(state.events * 5 + state.city) % selling.length]! : null;
  state.event = { kind, chain, until: state.clock + EVENT_DURATION };
  state.events += 1;
  state.nextEventAt = state.clock + EVENT_GAP;
}

function openCouncil(state: LiteState): void {
  state.council = state.sessions % COUNCIL_PAIRS.length;
  state.sessions += 1;
  state.nextCouncilAt = state.clock + COUNCIL_GAP;
}

/** Saat sınırlarında başlayan ve biten şeyler. */
function applyBoundaries(state: LiteState, offline: boolean): void {
  if (state.event !== null && state.clock >= state.event.until - EPS) state.event = null;
  if (state.policy !== null && state.clock >= state.policy.until - EPS) state.policy = null;
  // Olay yalnızca oyuncu oradayken başlıyor; kapalıyken kaçan olay dönüşte başlıyor.
  if (!offline && state.event === null && state.clock >= state.nextEventAt - EPS) startEvent(state);
  if (state.clock >= state.nextCouncilAt - EPS) openCouncil(state);
}

/**
 * Zamanı ilerletir. Her adımda: sınırları uygula, geliri adımın başındaki
 * durumdan hesapla, kasaya ekle, rakipleri hedefe doğru yaklaştır. Kampanya,
 * olay ve politika sınırları adım sınırı: çarpanlar tam süreleri kadar sürsün.
 */
export function advance(state: LiteState, seconds: number, offline = false): LiteState {
  const next = cloneState(state);
  const step = offline ? OFFLINE_STEP : ONLINE_STEP;
  const lag = offline ? RIVAL_LAG * 2 : RIVAL_LAG;
  let remaining = seconds;
  while (remaining > EPS) {
    applyBoundaries(next, offline);
    let h = Math.min(step, remaining);
    const bounds = [next.campaignUntil, next.nextCouncilAt];
    if (next.event !== null) bounds.push(next.event.until);
    else if (!offline) bounds.push(next.nextEventAt);
    if (next.policy !== null) bounds.push(next.policy.until);
    for (const bound of bounds) if (bound - next.clock > EPS) h = Math.min(h, bound - next.clock);
    const income = incomePerSecond(next) * (offline ? OFFLINE_EFFICIENCY : 1);
    next.cash += income * h;
    next.earned += income * h;
    next.totalEarned += income * h;
    const pull = 1 - Math.exp(-h / lag);
    const aggression = rivalAggression(next);
    for (const id of CHAIN_IDS) {
      const chain = next.chains[id];
      const sold = effectiveRates(next, id, chain.levels)[2];
      chain.rival += (aggression * sold - chain.rival) * pull;
    }
    next.clock += h;
    remaining -= h;
  }
  applyBoundaries(next, offline);
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

/** Yıldız: halka açık şirket daha yüksek değerlemeyle satılıyor. */
export function starsFor(earned: number, listed = false): number {
  const premium = listed ? LISTED_STAR_MULTIPLIER : 1;
  return Math.floor(STAR_SCALE * Math.sqrt(Math.max(0, earned) / STAR_UNIT) * premium);
}

/** Şehri satınca kazanılacak yıldız. */
export function prestigePreview(state: LiteState): number {
  return starsFor(state.earned, state.listed);
}

/** Şehri sat, holding yeni şehre geçsin: sıfırdan başla, yıldızları koru. */
export function prestige(state: LiteState): ActionResult {
  const gained = prestigePreview(state);
  if (gained < 1) return { ok: false, reason: 'locked' };
  return { ok: true, state: newGame(state.city + 1, state.stars + gained, state.totalEarned) };
}

// ------------------------------------------------------------ bildirim

/**
 * Uygulama kapalı kalırsa rakip kaçıncı saniyede bir zincirde payını
 * OVERTAKE_SHARE'in altına düşürüyor (yoksa null). Yalnızca şu an önde olunan
 * zincirlere bakılıyor: zaten geride olduğun yerde "seni geçti" demek yalan.
 *
 * `applyOffline` ile aynı koşullar: kampanya kesiliyor, olay başlamıyor,
 * rakip yarı hızda. Adımlar OFFLINE_STEP.
 */
export function firstOvertake(state: LiteState, horizon: number): number | null {
  let current = cloneState(state);
  if (current.campaignUntil > current.clock) current.campaignUntil = current.clock;
  const leading = CHAIN_IDS.filter(
    (id) => current.chains[id].levels[2] > 0 && chainReport(current, id).share >= OVERTAKE_SHARE,
  );
  if (leading.length === 0) return null;
  let elapsed = 0;
  while (horizon - elapsed > EPS) {
    const h = Math.min(OFFLINE_STEP, horizon - elapsed);
    current = advance(current, h, true);
    elapsed += h;
    for (const id of leading) if (chainReport(current, id).share < OVERTAKE_SHARE) return elapsed;
  }
  return null;
}
