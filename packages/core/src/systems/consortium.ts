import { CONSORTIUM, formatDecimal, formatPercent, getDifficulty } from '@capital/content';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { rivalProfile } from '../profiles';
import { buyShares, controlReachable, freeFloat, sharePrice, sharesHeld, sharesOutstanding, TOTAL_SHARES } from './equity';
import type { CompanyState, ConsortiumState, GameState } from '../types';

/**
 * Rakip konsorsiyumu (Tur 37d-3) — içerik ve gerekçe `@capital/content`
 * consortium.ts'te.
 *
 * Akış: koşullar oluşunca duyuru → savunma penceresi → her gün ortak alım.
 * Hisseler önderin hesabına toplanıyor, bedeli üyeler kasalarından
 * paylaşıyor. Böylece kontrol (`controllerOf`), %10/%25/%40 uyarıları,
 * geri alım kilidi ve uzak şehirdeki yerel savunma tek baskıncıyla aynı
 * yoldan işliyor. Zar yok: koşullar ve takvim durumdan.
 */

export function consortiumEnabled(state: GameState): boolean {
  return (
    state.flags.consortium !== false &&
    state.flags.raids !== false &&
    state.flags.npcCompetition !== false &&
    state.flags.randomEvents !== false
  );
}

function rivals(state: GameState): CompanyState[] {
  return Object.values(state.companies).filter((company) => !company.isPlayer && rivalProfile(state, company.profileId));
}

/** Oyuncunun son bina kurduğu gün (hiç yoksa −∞). */
function lastBuildDay(state: GameState): number {
  let last = Number.NEGATIVE_INFINITY;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId === state.playerCompanyId && building.builtDay > last) last = building.builtDay;
  }
  return last;
}

export interface ConsortiumPressure {
  /** Oyuncunun net değeri / en güçlü rakibinki. */
  lead: number;
  /** Kasa / net değer. */
  cashShare: number;
  /** Son binadan bu yana geçen gün. */
  idleFor: number;
}

/** Konsorsiyumu doğuran üç ölçü: önde olma, atıl para, duran yatırım. */
export function consortiumPressure(state: GameState): ConsortiumPressure {
  const player = state.companies[state.playerCompanyId];
  const top = Math.max(0, ...rivals(state).map((company) => company.netWorth));
  const worth = player?.netWorth ?? 0;
  return {
    lead: top > 0 ? worth / top : 0,
    cashShare: worth > 0 ? Math.max(0, player!.cash) / worth : 0,
    idleFor: state.time.day - lastBuildDay(state),
  };
}

/** Üyeler: en büyük rakipler, alıma katkı verebilecek kasası olanlar. */
function pickMembers(state: GameState): CompanyState[] {
  return rivals(state)
    .filter((company) => company.cash > CONSORTIUM.memberReserve)
    .sort((a, b) => b.netWorth - a.netWorth || (a.id < b.id ? -1 : 1))
    .slice(0, CONSORTIUM.maxMembers);
}

function names(state: GameState, ids: readonly string[]): string {
  return ids.map((id) => state.companies[id]?.name ?? id).join(', ');
}

function tryForm(state: GameState): void {
  const day = state.time.day;
  if (state.victory || day < CONSORTIUM.earliestDay || day < (state.nextConsortiumDay ?? 0)) return;
  const player = state.companies[state.playerCompanyId]!;
  if (player.lockedUntilDay !== undefined && day < player.lockedUntilDay) return;
  const pressure = consortiumPressure(state);
  if (pressure.lead < CONSORTIUM.leadRatio) return;
  if (pressure.cashShare < CONSORTIUM.idleCashShare) return;
  if (pressure.idleFor < CONSORTIUM.idleDays) return;
  const members = pickMembers(state);
  if (members.length < CONSORTIUM.minMembers) return;
  const leader = members[0]!;
  if (!controlReachable(state, leader.id, player.id)) return;

  const consortium: ConsortiumState = {
    leaderId: leader.id,
    memberIds: members.map((member) => member.id),
    names: members.map((member) => member.name),
    formedDay: day,
    startsDay: day + CONSORTIUM.warningDays,
    baseShares: sharesHeld(state, leader.id, player.id),
  };
  state.consortium = consortium;
  pushNews(
    state,
    'bad',
    tc('core.consortium.formedTitle', { leader: leader.name }),
    tc('core.consortium.formedBody', {
      members: names(state, consortium.memberIds),
      share: formatPercent(Math.round(pressure.cashShare * 100)),
      idle: Number.isFinite(pressure.idleFor) ? pressure.idleFor : CONSORTIUM.idleDays,
      days: CONSORTIUM.warningDays,
      builds: CONSORTIUM.workedBuilds,
    }),
    leader.id,
  );
}

type DissolveReason = 'worked' | 'invested' | 'lead' | 'locked' | 'members' | 'victory';

const DISSOLVE_BODY = {
  worked: 'core.consortium.dissolvedWorked',
  invested: 'core.consortium.dissolvedInvested',
  victory: 'core.consortium.dissolvedVictory',
  lead: 'core.consortium.dissolvedLead',
  locked: 'core.consortium.dissolvedLocked',
  members: 'core.consortium.dissolvedMembers',
} as const;

function dissolve(state: GameState, consortium: ConsortiumState, reason: DissolveReason, cashShare: number): void {
  delete state.consortium;
  state.nextConsortiumDay = state.time.day + CONSORTIUM.cooldownDays;
  pushNews(
    state,
    reason === 'members' ? 'neutral' : 'good',
    tc('core.consortium.dissolvedTitle', { leader: consortium.names[0] ?? '' }),
    tc(DISSOLVE_BODY[reason], { share: formatPercent(Math.round(cashShare * 100)) }),
  );
}

/** Kuruluştan bu yana kurulan yeni binalar ("yatırıma dönüş" ilerlemesi). */
export function consortiumBuilds(state: GameState, consortium: ConsortiumState): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId === state.playerCompanyId && building.builtDay >= consortium.formedDay) count++;
  }
  return count;
}

/** Günlük ortak alım: tavan, üyelerin katkısı ve serbest hisseyle sınırlı. */
function buyTogether(state: GameState, consortium: ConsortiumState): void {
  const player = state.companies[state.playerCompanyId]!;
  const leader = state.companies[consortium.leaderId]!;
  const members = consortium.memberIds.map((id) => state.companies[id]!).filter(Boolean);
  const price = sharePrice(state, player.id);
  if (price <= 0) return;
  const difficulty = getDifficulty(state.difficulty);
  const cap = Math.floor((difficulty.raidDailyCap * CONSORTIUM.capShare * sharesOutstanding(state, player.id)) / TOTAL_SHARES);
  const budgets = members.map((member) => Math.max(0, (member.cash - CONSORTIUM.memberReserve) * CONSORTIUM.memberBudget));
  const pool = budgets.reduce((sum, value) => sum + value, 0);
  const wanted = Math.min(cap, Math.floor(pool / price), freeFloat(state, player.id));
  if (wanted <= 0) return;
  const cost = wanted * price;
  // Üyeler paylarını önderin kasasına aktarıyor; alımı önder yapıyor.
  members.forEach((member, index) => {
    if (member.id === leader.id) return;
    const part = (cost * budgets[index]!) / pool;
    member.cash -= part;
    leader.cash += part;
  });
  buyShares(state, leader.id, player.id, wanted);
}

/** Konsorsiyumun topladığı pay (kuruluştan bu yana önderin aldığı), 0..1. */
export function consortiumStake(state: GameState, consortium: ConsortiumState): number {
  const held = sharesHeld(state, consortium.leaderId, state.playerCompanyId);
  return held / sharesOutstanding(state, state.playerCompanyId);
}

/**
 * Uzaktaki şehirde konsorsiyum yok: o şehir tanımı gereği pasif (oyuncu
 * başka şehirde), yerel müdür bina kurmuyor. Konsorsiyum oynanan şehrin
 * tehdidi; şehirden ayrılınca süren konsorsiyum sessizce dağılıyor.
 */
export function settleConsortiumAway(state: GameState): void {
  delete state.consortium;
}

/**
 * Günlük adım — motorun gününde, net değerin günlük hesabından SONRA
 * (yalnız oynanan şehir; bekleyen şehirler `settleConsortiumAway`). Bugünkü
 * alımın kontrolü geçmesi ertesi günün devralma adımında sonuçlanıyor;
 * baskın uyarıları ise aynı gün düşüyor.
 */
export function runConsortiumTick(state: GameState): void {
  if (!consortiumEnabled(state)) {
    delete state.consortium;
    return;
  }
  const player = state.companies[state.playerCompanyId];
  if (!player || state.gameOver) return;
  const consortium = state.consortium;
  if (!consortium) {
    tryForm(state);
    return;
  }

  consortium.memberIds = consortium.memberIds.filter((id) => state.companies[id]);
  const pressure = consortiumPressure(state);
  if (!state.companies[consortium.leaderId] || consortium.memberIds.length < CONSORTIUM.minMembers) {
    dissolve(state, consortium, 'members', pressure.cashShare);
    return;
  }
  if (state.victory) {
    dissolve(state, consortium, 'victory', pressure.cashShare);
    return;
  }
  if (pressure.cashShare < CONSORTIUM.workedCashShare) {
    dissolve(state, consortium, 'worked', pressure.cashShare);
    return;
  }
  if (consortiumBuilds(state, consortium) >= CONSORTIUM.workedBuilds) {
    dissolve(state, consortium, 'invested', pressure.cashShare);
    return;
  }
  if (pressure.lead < CONSORTIUM.dissolveRatio) {
    dissolve(state, consortium, 'lead', pressure.cashShare);
    return;
  }
  if (!controlReachable(state, consortium.leaderId, player.id)) {
    dissolve(state, consortium, 'locked', pressure.cashShare);
    return;
  }

  const day = state.time.day;
  if (day < consortium.startsDay) return;
  if (day === consortium.startsDay) {
    const difficulty = getDifficulty(state.difficulty);
    pushNews(
      state,
      'bad',
      tc('core.consortium.buyingTitle', { leader: consortium.names[0] ?? '' }),
      tc('core.consortium.buyingBody', {
        cap: formatPercent(formatDecimal((difficulty.raidDailyCap * CONSORTIUM.capShare) / 100, 2)),
      }),
      consortium.leaderId,
    );
  }
  buyTogether(state, consortium);
}
