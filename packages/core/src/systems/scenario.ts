import { BUILDING_BY_ID, GOOD_BY_ID, formatDecimal, formatNumber, scenarioDefFor } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { formatMoney } from '../format';
import { floorTo, scenarioScoreText, starsFor } from './scenarioText';
import { victoryNetWorth } from './goals';
import { rentalOutlook } from './realestate';
import { stanceOf } from './relations';
import { tradeProfitToday } from './trade';
import type { GameState, ScenarioLostReason, ScenarioState } from '../types';

/**
 * Senaryo modu (Tur 39): günlük hedef, süre ve yıldız. Kurulum
 * `scenario.ts`te; bu dosya yalnızca okuyor ve koşuyu bitiriyor — zar
 * atmıyor, simülasyonun gidişatını değiştirmiyor.
 */

/** Senaryo sürüyor mu (bitmemiş)? */
export function scenarioActive(state: GameState): boolean {
  return state.scenario !== undefined && state.scenario.finishedDay === undefined;
}

/** Açılış ekranı bekliyor mu. */
export function scenarioBriefPending(state: GameState): boolean {
  const run = state.scenario;
  return run !== undefined && !run.briefSeen && run.finishedDay === undefined;
}

/** Sonuç ekranı bekliyor mu (bitti, ekran kapanmadı). */
export function scenarioResultPending(state: GameState): boolean {
  const run = state.scenario;
  return run !== undefined && run.finishedDay !== undefined && !run.resultSeen;
}

/**
 * Senaryonun bir ekranı (açılış ya da sonuç) bekliyor mu: takvim o ekran
 * kapanana kadar yürümüyor (Codex #66) — şehir ekranın arkasında yaşamasın.
 */
export function scenarioScreenPending(state: GameState): boolean {
  return scenarioBriefPending(state) || scenarioResultPending(state);
}

export function scenarioDefOf(state: GameState): ScenarioDef | null {
  return state.scenario ? (scenarioDefFor(state.scenario) ?? null) : null;
}

/**
 * Senaryo başka bir şehre geçerken (Holding: iki şehir, `switchCity`):
 * şehirlerin takvimleri birlikte yürüyor, günler aradaki farkla kayıyor.
 */
export function shiftScenario(run: ScenarioState, offset: number): ScenarioState {
  const shift = (day: number | undefined) => (day === undefined ? undefined : day + offset);
  const next: ScenarioState = { ...run, startDay: run.startDay + offset, endDay: run.endDay + offset };
  const finished = shift(run.finishedDay);
  const out = shift(run.outOfRankDay);
  if (finished !== undefined) next.finishedDay = finished;
  if (out !== undefined) next.outOfRankDay = out;
  return next;
}

/** Şehirdeki rakip sayısı. */
export function rivalsLeft(state: GameState): number {
  return Object.values(state.companies).filter((company) => !company.isPlayer).length;
}

export interface HoldingCityStatus {
  name: string;
  /** Oynanan şehir mi. */
  active: boolean;
  /** Şehirde yaratılan değer ve zafer eşiği. */
  value: number;
  target: number;
  rank: number;
  won: boolean;
  lost: boolean;
}

/** Holding: iki şehir — her şehrin zafer durumu, oynanan şehir başta. */
export function holdingCities(state: GameState): HoldingCityStatus[] {
  const cities = [state, ...(state.holding?.dormant.map((city) => city.state) ?? [])];
  return cities.map((city, index) => ({
    name: city.cityName ?? '',
    active: index === 0,
    value: createdValue(city),
    target: victoryNetWorth(city),
    rank: playerRank(city),
    won: city.victory !== undefined,
    lost: city.gameOver !== undefined,
  }));
}

/**
 * Oyuncunun net değerinin en güçlü rakibinkine oranı. Rakip kalmadıysa
 * tavan (99): oran JSON'a yazılıyor, sonsuz yazılamaz.
 */
export function leadRatio(state: GameState): number {
  const player = state.companies[state.playerCompanyId];
  if (!player) return 0;
  let best = 0;
  for (const company of Object.values(state.companies)) {
    if (!company.isPlayer) best = Math.max(best, company.netWorth);
  }
  if (best <= 0) return 99;
  return Math.max(0, player.netWorth / best);
}

/** Oyuncunun net değere göre sırası (1: en değerli). */
export function playerRank(state: GameState): number {
  const player = state.companies[state.playerCompanyId];
  if (!player) return Number.POSITIVE_INFINITY;
  let rank = 1;
  for (const company of Object.values(state.companies)) {
    if (!company.isPlayer && company.netWorth > player.netWorth) rank++;
  }
  return rank;
}

export interface ChainGoalStatus {
  /** Zincirin malları: hammadde ve ara mal (ürün tanımından). */
  rawGoodId: string;
  intermediateId: string;
  /** Hammadde ünitesi, işleme ünitesi, ürünü rafında taşıyan mağaza. */
  raw: boolean;
  process: boolean;
  outlet: boolean;
  /** Ara malın şirket birim maliyeti ve spot fiyatı. */
  cost: number;
  spot: number;
  /** Ürünün kategorisinde pay (0..1). */
  share: number;
  met: boolean;
}

/**
 * Zincir hedefi: `goodId` tüketici ürünü; ara malı ve hammaddesi ürün
 * tanımından. Maliyet koşulu ara malın harmanlanmış birim maliyeti (kendi
 * üretimi + piyasadan alınan) spot fiyatın altında.
 */
export function chainGoalStatus(state: GameState, goodId: string, target: number): ChainGoalStatus | null {
  const good = GOOD_BY_ID[goodId];
  const intermediate = good?.inputGoodId ? GOOD_BY_ID[good.inputGoodId] : undefined;
  const raw = intermediate?.inputGoodId;
  const player = state.companies[state.playerCompanyId];
  if (!good || !intermediate || !raw || !good.category || !player) return null;
  let hasRaw = false;
  let hasProcess = false;
  let hasOutlet = false;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== player.id) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    if (def.role === 'extract' && def.outputGoodId === raw) hasRaw = true;
    if (def.role === 'process' && def.outputGoodId === intermediate.id) hasProcess = true;
    if (def.role === 'outlet' && building.stocked.includes(goodId)) hasOutlet = true;
  }
  const spot = state.market.spot[intermediate.id] ?? intermediate.basePrice;
  const cost = player.unitCost[intermediate.id] ?? spot;
  const share = player.marketShare[good.category] ?? 0;
  return {
    rawGoodId: raw,
    intermediateId: intermediate.id,
    raw: hasRaw,
    process: hasProcess,
    outlet: hasOutlet,
    cost,
    spot,
    share,
    met: hasRaw && hasProcess && hasOutlet && cost < spot && share >= target,
  };
}

export interface FreightGoalRival {
  companyId: string;
  name: string;
  /** Bugün sözleşmede taşınan mağazaları. */
  outlets: number;
  hostile: boolean;
}

export interface FreightGoalStatus {
  /** Şehrin rakipleri: taşınan mağazası çoktan aza, sonra kimlik. */
  rivals: FreightGoalRival[];
  /** Mağazası taşınan ayrı rakip ve toplam taşınan mağaza. */
  served: number;
  outlets: number;
  met: boolean;
}

/**
 * Herkesin nakliyecisi (Tur 60): bugün sözleşmedeki mağazalar, rakip
 * rakip. Mağaza el değiştirdiyse ya da kapandıysa sayılmıyor (taşıma
 * adımı onu sözleşmeden düşürüyor; aynı gün de sayılmasın).
 */
export function freightGoalStatus(state: GameState, rivals: number, outlets: number): FreightGoalStatus {
  const counts = new Map<string, number>();
  for (const deal of state.freight?.contracts ?? []) {
    const live = deal.outletIds.filter((id) => state.buildings[id]?.companyId === deal.companyId).length;
    if (live > 0) counts.set(deal.companyId, (counts.get(deal.companyId) ?? 0) + live);
  }
  const list = Object.values(state.companies)
    .filter((company) => !company.isPlayer)
    .map((company) => ({
      companyId: company.id,
      name: company.name,
      outlets: counts.get(company.id) ?? 0,
      hostile: stanceOf(state, company.id) === 'hostile',
    }))
    .sort((a, b) => b.outlets - a.outlets || a.companyId.localeCompare(b.companyId));
  const served = list.filter((rival) => rival.outlets > 0).length;
  const total = list.reduce((sum, rival) => sum + rival.outlets, 0);
  return { rivals: list, served, outlets: total, met: served >= rivals && total >= outlets };
}

/** Karanlık kış (Tur 60): oyuncunun santrallerinin bugün rakiplere sattığı elektrik. */
function powerSoldToday(state: GameState): number {
  let sold = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    if (BUILDING_BY_ID[building.defId]?.role === 'energy') sold += building.last.revenue;
  }
  return sold;
}

export interface RentalGoalStatus {
  /** Kiralık birimlerin dolu olanları (hak sahipleri hariç) ve toplamı. */
  occupied: number;
  units: number;
  /** İnşaattaki projelerin açılınca gelecek birimi. */
  building: number;
  /** Dönüşüm parselinde açılmış ve inşaattaki projeler. */
  renewals: number;
  renewalsBuilding: number;
}

/**
 * Kentsel dönüşüm (Tur 60): kiralıklarındaki dolu birim. Proje doluluğu
 * kendi durumunda, diğer kiralıklar hedefte (pazar adımının hesabı).
 * Dolu birim tam sayıya aşağı.
 */
export function rentalGoalStatus(state: GameState): RentalGoalStatus {
  let occupied = 0;
  let units = 0;
  let building = 0;
  let renewals = 0;
  let renewalsBuilding = 0;
  for (const rental of Object.values(state.buildings)) {
    if (rental.companyId !== state.playerCompanyId || BUILDING_BY_ID[rental.defId]?.role !== 'rental') continue;
    const outlook = rentalOutlook(state, rental.id);
    if (!outlook) continue;
    const renewal = Boolean(rental.development?.renewal);
    if (outlook.opensIn !== null) {
      building += outlook.units;
      if (renewal) renewalsBuilding++;
      continue;
    }
    if (renewal) renewals++;
    units += outlook.units;
    occupied += outlook.units * outlook.occupancy;
  }
  return { occupied: Math.floor(occupied + 1e-6), units, building, renewals, renewalsBuilding };
}

function rentalMet(status: RentalGoalStatus, goal: { units: number; renewals: number }): boolean {
  return status.occupied >= goal.units && status.renewals >= goal.renewals;
}

/** Şehirde yaratılan değer (holding aktarımı hariç; zaferin ölçüsü). */
function createdValue(state: GameState): number {
  const player = state.companies[state.playerCompanyId];
  return (player?.netWorth ?? 0) - (state.importedCapital ?? 0);
}

// Yıldız ve metinler kurulum ekranında da okunuyor; hafif modülde (Tur 46).
export { scenarioGoalText, scenarioScoreText, starsFor } from './scenarioText';

export interface ScenarioProgress {
  /** 0..1: net değer hedefinde hedefe oran; öndelik hedefinde geçen süre. */
  progress: number;
  /** Kısa durum ("4,2 M ₺ / 12 M ₺", "önde ×1,12"). */
  detail: string;
  daysLeft: number;
  /** Öndelik hedefinde şu an önde mi. */
  ahead?: boolean;
}

/** Hedefin bugünkü durumu; arayüz (gündem, hedef paneli) okuyor. */
export function scenarioProgress(state: GameState): ScenarioProgress | null {
  const run = state.scenario;
  const def = scenarioDefOf(state);
  const player = state.companies[state.playerCompanyId];
  if (!run || !def || !player) return null;
  const day = state.time.day;
  const daysLeft = Math.max(0, run.endDay - day);
  if (def.goal.kind === 'netWorth') {
    return {
      progress: Math.max(0, Math.min(1, player.netWorth / def.goal.target)),
      detail: tc('core.scenario.progressMoney', { value: formatMoney(Math.max(0, player.netWorth)), target: formatMoney(def.goal.target) }),
      daysLeft,
    };
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const goal = def.goal;
  if (goal.kind === 'victory') {
    const target = victoryNetWorth(state);
    const rank = playerRank(state);
    return {
      progress: clamp(createdValue(state) / target),
      detail: tc(rank === 1 ? 'core.scenario.progressVictory' : 'core.scenario.progressVictoryRank', {
        value: formatMoney(Math.max(0, createdValue(state))),
        target: formatMoney(target),
        rank,
      }),
      daysLeft,
    };
  }
  if (goal.kind === 'chain') {
    const status = chainGoalStatus(state, goal.goodId, goal.share);
    if (!status) return null;
    const links = [status.raw, status.process, status.outlet].filter(Boolean).length;
    const cheaper = status.cost < status.spot;
    return {
      progress: clamp((clamp(status.share / goal.share) * 3 + links + (cheaper ? 1 : 0)) / 7),
      // Maliyet ancak kendi üretimi varken söz konusu (yoksa piyasa fiyatı).
      detail: tc(cheaper || !status.process ? 'core.scenario.progressChain' : 'core.scenario.progressChainCost', {
        share: Math.floor(status.share * 100),
        target: Math.round(goal.share * 100),
        links,
      }),
      daysLeft,
      ahead: status.met,
    };
  }
  if (goal.kind === 'monopoly') {
    const total = Math.max(1, run.rivalsAtStart ?? rivalsLeft(state));
    const left = rivalsLeft(state);
    return {
      progress: clamp((total - left) / total),
      detail: tc('core.scenario.progressMonopoly', { taken: Math.max(0, total - left), total, left }),
      daysLeft,
      ahead: left === 0,
    };
  }
  if (goal.kind === 'holding') {
    const cities = holdingCities(state);
    const here = cities[0]!;
    const won = cities.filter((city) => city.won).length;
    return {
      progress: clamp(cities.reduce((sum, city) => sum + (city.won ? 1 : clamp(city.value / city.target)), 0) / cities.length),
      detail: tc(here.won ? 'core.scenario.progressHoldingWon' : 'core.scenario.progressHolding', {
        won,
        total: cities.length,
        value: formatMoney(Math.max(0, here.value)),
        target: formatMoney(here.target),
      }),
      daysLeft,
      ahead: won === cities.length,
    };
  }
  if (goal.kind === 'freight') {
    const status = freightGoalStatus(state, goal.rivals, goal.outlets);
    return {
      progress: clamp((clamp(status.served / goal.rivals) + clamp(status.outlets / goal.outlets)) / 2),
      detail: tc('core.scenario.progressFreight', { served: status.served, rivals: goal.rivals, outlets: status.outlets, target: goal.outlets }),
      daysLeft,
      ahead: status.met,
    };
  }
  if (goal.kind === 'power') {
    const sold = run.powerSold ?? 0;
    return {
      progress: clamp(sold / goal.target),
      detail: tc('core.scenario.progressPower', { value: formatMoney(sold), target: formatMoney(goal.target) }),
      daysLeft,
    };
  }
  if (goal.kind === 'trade') {
    // Ticaretin kârı (Tur 79): zarar eden gün toplamı düşürüyor; ilerleme sıfırın altına inmiyor.
    const profit = run.tradeProfit ?? 0;
    return {
      progress: clamp(profit / goal.target),
      detail: tc('core.scenario.progressTrade', { value: formatMoney(profit), target: formatMoney(goal.target) }),
      daysLeft,
    };
  }
  if (goal.kind === 'rental') {
    const status = rentalGoalStatus(state);
    // Paketin hedefi dönüşüm istemeyebilir (`renewals: 0`, Tur 67): o pay baştan tam (0/0 NaN'dı).
    const renewalShare = goal.renewals > 0 ? clamp(status.renewals / goal.renewals) : 1;
    return {
      progress: clamp((clamp(status.occupied / goal.units) * 3 + renewalShare) / 4),
      detail: tc(status.building > 0 ? 'core.scenario.progressRentalBuilding' : 'core.scenario.progressRental', {
        occupied: formatNumber(status.occupied),
        target: formatNumber(goal.units),
        building: formatNumber(status.building),
        renewals: status.renewals,
        renewalTarget: goal.renewals,
      }),
      daysLeft,
      ahead: rentalMet(status, goal),
    };
  }
  if (goal.kind === 'sponsor') {
    const done = run.sponsored ?? 0;
    const rank = playerRank(state);
    return {
      progress: clamp(done / goal.projects),
      detail:
        run.outOfRankDay === undefined
          ? tc('core.scenario.progressSponsor', { done, total: goal.projects, rank })
          : tc('core.scenario.progressSponsorOut', {
              done,
              total: goal.projects,
              rank,
              max: goal.maxRank,
              days: Math.max(0, run.outOfRankDay + goal.graceDays - day),
            }),
      daysLeft,
      ahead: rank <= goal.maxRank,
    };
  }
  const lead = leadRatio(state);
  const span = Math.max(1, run.endDay - run.startDay);
  return {
    progress: Math.max(0, Math.min(1, (day - run.startDay) / span)),
    detail:
      lead > 1
        ? tc('core.scenario.progressAhead', { ratio: formatDecimal(floorTo(Math.min(lead, 9.99), 2), 2) })
        : tc('core.scenario.progressBehind', { percent: Math.floor(lead * 100) }),
    daysLeft,
    ahead: lead > 1,
  };
}

const LOST_BODY: Record<
  ScenarioLostReason,
  'core.scenario.lostTakeover' | 'core.scenario.lostTime' | 'core.scenario.lostRank' | 'core.scenario.lostProject' | 'core.scenario.lostCity'
> = {
  takeover: 'core.scenario.lostTakeover',
  time: 'core.scenario.lostTime',
  rank: 'core.scenario.lostRank',
  project: 'core.scenario.lostProject',
  city: 'core.scenario.lostCity',
};

function finish(state: GameState, run: ScenarioState, def: ScenarioDef, won: boolean, score: number, reason?: ScenarioLostReason): void {
  run.finishedDay = state.time.day;
  run.outcome = won ? 'won' : 'lost';
  // Yıldız ham skordan, saklanan skor aşağı yuvarlanmış (Codex #66): ×1,3996
  // yuvarlanınca ×1,4 olup üç yıldız eşiğini geçmiş gibi görünüyordu.
  run.score = floorTo(score, 3);
  run.stars = won ? starsFor(def, score) : 0;
  if (!won) run.lostReason = reason ?? 'time';
  // Zafer hedefinde zafer ekranı senaryonun sonuç ekranıyla aynı haberi verirdi.
  if (won && def.goal.kind === 'victory' && state.victory) state.victory.dismissed = true;
  // Dondurmalar senaryoyla bitiyor: serbest oyunda boşalan koltuk yine doluyor, ihraç açılıyor.
  if (def.setup.freeze?.entrants) state.flags.rivalEntry = true;
  if (def.setup.freeze?.issuance) state.flags.issuance = true;
  state.time.speed = 0;
  const maxRank = def.goal.kind === 'sponsor' ? def.goal.maxRank : 0;
  const graceDays = def.goal.kind === 'sponsor' ? def.goal.graceDays : 0;
  pushNews(
    state,
    won ? 'good' : 'bad',
    won ? tc('core.scenario.wonTitle', { title: def.title, stars: run.stars }) : tc('core.scenario.lostTitle', { title: def.title }),
    won ? tc('core.scenario.wonBody', { score: scenarioScoreText(def, run.score) }) : tc(LOST_BODY[run.lostReason!], { rank: maxRank, days: graceDays }),
  );
}

/**
 * Şehrin sponsoru: senaryoda katkı penceresi kapanan projeyi bir kez
 * sayar. Kapanan proje inşaat evresinde (`closeFunding` sponsoru yazdı);
 * açılış günü projenin kimliği. Dönen değer: bugün kapandıysa sponsor
 * oyuncu mu.
 */
function closedToday(state: GameState, run: ScenarioState): boolean | null {
  const project = state.project;
  if (!project || project.phase !== 'building' || project.openedDay < run.startDay) return null;
  const closed = run.closedProjects ?? [];
  if (closed.includes(project.openedDay)) return null;
  run.closedProjects = [...closed, project.openedDay];
  return project.sponsorId === state.playerCompanyId;
}

/**
 * Şehrin sponsoru: sıra tutuluyor mu. Sıranın dışına düşen şirketin geri
 * dönmek için `graceDays` günü var (bina kurmak da katkı da net değeri bir
 * an düşürüyor; ilk ölçümde ilk inşaat oyuncuyu ilk gün üçüncülüğe
 * indiriyordu). Düştüğü gün haber; geri dönünce sayaç siliniyor.
 */
function rankHeld(state: GameState, run: ScenarioState, maxRank: number, graceDays: number): boolean {
  const rank = playerRank(state);
  if (rank <= maxRank) {
    delete run.outOfRankDay;
    return true;
  }
  if (run.outOfRankDay === undefined) {
    run.outOfRankDay = state.time.day;
    pushNews(
      state,
      'bad',
      tc('core.scenario.outOfRankTitle', { max: maxRank }),
      tc('core.scenario.outOfRankBody', { rank, max: maxRank, days: graceDays }),
    );
  }
  return state.time.day - run.outOfRankDay < graceDays;
}

/** Senaryonun proje takvimi: biri bitince sonrakinin açılışına (yoksa serbest oyunun takvimi). */
export function scenarioProjectGap(state: GameState): readonly [number, number] | null {
  if (!scenarioActive(state)) return null;
  const gap = scenarioDefOf(state)?.setup.projects?.gapDays;
  return gap === undefined ? null : [gap, gap];
}

/**
 * Günlük senaryo adımı, günün sonunda (net değer ve devralma kesinleşmiş).
 * Devralınan oyuncu kaybediyor; hedefe ulaşan ya da süresi dolan koşu
 * bitiyor ve oyun duraklıyor. Sonra şehir serbest oyuna açık.
 */
export function runScenarioTick(state: GameState): void {
  const run = state.scenario;
  if (!run || run.finishedDay !== undefined) return;
  const def = scenarioDefFor(run);
  const player = state.companies[state.playerCompanyId];
  if (!def || !player) return;
  const day = state.time.day;
  const goal = def.goal;

  if (state.gameOver) {
    finish(state, run, def, false, 0, 'takeover');
    return;
  }

  switch (goal.kind) {
    case 'netWorth':
      if (player.netWorth >= goal.target) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, player.netWorth / goal.target);
      return;
    case 'victory':
      // Zafer günün hedef adımında yazıldı (`runGoalTick` bu adımdan önce).
      if (state.victory) finish(state, run, def, true, state.victory.day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, createdValue(state) / victoryNetWorth(state));
      return;
    case 'chain': {
      const status = chainGoalStatus(state, goal.goodId, goal.share);
      if (status?.met) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, (status?.share ?? 0) / goal.share);
      return;
    }
    case 'sponsor': {
      const sponsor = closedToday(state, run);
      if (sponsor === false) {
        finish(state, run, def, false, run.sponsored ?? 0, 'project');
        return;
      }
      if (sponsor === true) run.sponsored = (run.sponsored ?? 0) + 1;
      if (!rankHeld(state, run, goal.maxRank, goal.graceDays)) finish(state, run, def, false, run.sponsored ?? 0, 'rank');
      else if ((run.sponsored ?? 0) >= goal.projects) finish(state, run, def, true, leadRatio(state));
      else if (day >= run.endDay) finish(state, run, def, false, run.sponsored ?? 0);
      return;
    }
    case 'monopoly': {
      const left = rivalsLeft(state);
      if (left === 0) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, left);
      return;
    }
    case 'holding': {
      const away = state.holding?.dormant ?? [];
      // Uzaktaki şehrin zaferi de senaryonun bir adımı: şehre dönünce zafer ekranı açılmasın.
      for (const city of away) if (city.state.victory) city.state.victory.dismissed = true;
      const cities = holdingCities(state);
      if (cities.some((city) => city.lost)) finish(state, run, def, false, cities.filter((city) => city.won).length, 'city');
      else if (cities.every((city) => city.won)) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, cities.filter((city) => city.won).length);
      return;
    }
    case 'freight': {
      const status = freightGoalStatus(state, goal.rivals, goal.outlets);
      if (status.met) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, status.outlets / goal.outlets);
      return;
    }
    case 'power': {
      run.powerSold = Math.round((run.powerSold ?? 0) + powerSoldToday(state));
      if (run.powerSold >= goal.target) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, run.powerSold / goal.target);
      return;
    }
    case 'rental': {
      const status = rentalGoalStatus(state);
      if (rentalMet(status, goal)) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, status.occupied / goal.units);
      return;
    }
    case 'trade': {
      run.tradeProfit = Math.round((run.tradeProfit ?? 0) + tradeProfitToday(state));
      if (run.tradeProfit >= goal.target) finish(state, run, def, true, day - run.startDay);
      else if (day >= run.endDay) finish(state, run, def, false, Math.max(0, run.tradeProfit) / goal.target);
      return;
    }
    case 'leadAtEnd': {
      if (day < run.endDay) return;
      const lead = leadRatio(state);
      finish(state, run, def, lead > 1, lead);
      return;
    }
  }
}
