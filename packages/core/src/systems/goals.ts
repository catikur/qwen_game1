import { BUILDING_BY_ID, GOALS, getCitySize, getDifficulty } from '@capital/content';
import type { GoalDef } from '@capital/content';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import { sharesOutstanding } from './equity';
import type { GameState, VictoryKind } from '../types';

/**
 * Hedef merdiveni ve zafer.
 *
 * İlerleme her basamak için 0..1 arası bir sayı; "%62" diyebilmek,
 * "henüz değil" demekten çok daha fazla yön veriyor. Değerlendirme günde
 * bir, milestone kontrolünden sonra koşuyor — zar atmıyor, yalnızca
 * okuyor, yani eklenmesi simülasyonun gidişatını değiştirmiyor.
 */

export interface GoalStatus {
  def: GoalDef;
  /** 0..1; tamamlanmışsa 1. */
  progress: number;
  /** Tamamlandığı gün; tamamlanmadıysa null. */
  completedDay: number | null;
  /** İlerlemenin okunur hâli ("3 / 5 mağaza"). */
  detail: string;
}

function playerOf(state: GameState) {
  return state.companies[state.playerCompanyId]!;
}

function countRoles(state: GameState, roles: string[]): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role && roles.includes(role)) count++;
  }
  return count;
}

/** En güçlü rakibin net değeri; rakip kalmadıysa 0. */
function leaderRivalWorth(state: GameState): number {
  let best = 0;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer) continue;
    best = Math.max(best, company.netWorth);
  }
  return best;
}

function rivalCount(state: GameState): number {
  return Object.values(state.companies).filter((c) => !c.isPlayer).length;
}

/** Oyuncunun bir rakipte tuttuğu en büyük pay (0..1). */
function bestRivalStake(state: GameState): number {
  const player = playerOf(state);
  let best = 0;
  for (const [issuerId, count] of Object.entries(player.shares)) {
    if (issuerId === player.id || !count) continue;
    if (!state.companies[issuerId]) continue;
    best = Math.max(best, count / sharesOutstanding(state, issuerId));
  }
  return best;
}

export function victoryNetWorth(state: GameState): number {
  // Büyük şehirde ekonomi de büyük (Tur 21): eşik şehir boyutuyla ölçekli.
  return getDifficulty(state.difficulty).victoryNetWorth * getCitySize(state.citySize).victoryScale;
}

/** Zafer koşulu sağlanıyor mu, sağlanıyorsa hangi yoldan. */
export function victoryReached(state: GameState): VictoryKind | null {
  if (state.gameOver) return null;
  if (rivalCount(state) === 0) return 'monopoly';
  const player = playerOf(state);
  if (player.netWorth >= victoryNetWorth(state) && player.netWorth > leaderRivalWorth(state)) return 'tycoon';
  return null;
}

function measure(state: GameState, def: GoalDef): { progress: number; detail: string } {
  const player = playerOf(state);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));

  switch (def.kind) {
    case 'outlets': {
      const count = countRoles(state, ['outlet']);
      return { progress: clamp(count / def.target), detail: `${Math.min(count, def.target)} / ${def.target} mağaza` };
    }
    case 'units': {
      const count = countRoles(state, ['extract', 'process']);
      return { progress: clamp(count / def.target), detail: `${Math.min(count, def.target)} / ${def.target} üretim ünitesi` };
    }
    case 'netWorth':
      return {
        progress: clamp(player.netWorth / def.target),
        detail: `${formatMoney(Math.max(0, player.netWorth))} / ${formatMoney(def.target)}`,
      };
    case 'rank': {
      const leader = leaderRivalWorth(state);
      const ahead = player.netWorth > leader;
      return {
        progress: ahead ? 1 : clamp(leader > 0 ? player.netWorth / leader : 1),
        detail: ahead ? 'bir numarasın' : `liderin %${Math.round(clamp(player.netWorth / Math.max(1, leader)) * 100)}'i`,
      };
    }
    case 'rivalStake': {
      const stake = bestRivalStake(state);
      return { progress: clamp(stake / def.target), detail: `en büyük payın %${Math.round(stake * 100)}` };
    }
    case 'acquisitions': {
      const count = player.acquisitions ?? 0;
      return { progress: clamp(count / def.target), detail: `${count} / ${def.target} devralma` };
    }
    case 'victory': {
      const target = victoryNetWorth(state);
      if (victoryReached(state)) return { progress: 1, detail: 'zafer' };
      const worth = clamp(player.netWorth / target);
      const leader = leaderRivalWorth(state);
      const rank = player.netWorth > leader ? 1 : clamp(player.netWorth / Math.max(1, leader));
      // İki koşulun zayıf olanı — ikisi de gerekli.
      return {
        progress: Math.min(worth, rank),
        detail: `${formatMoney(Math.max(0, player.netWorth))} / ${formatMoney(target)}${rank < 1 ? ' · henüz bir numara değilsin' : ''}`,
      };
    }
  }
}

/** Merdivenin tamamı, sırasıyla. */
export function goalLadder(state: GameState): GoalStatus[] {
  return GOALS.map((def) => {
    const completedDay = state.goals?.[def.id] ?? null;
    if (completedDay !== null) return { def, progress: 1, completedDay, detail: 'tamamlandı' };
    const { progress, detail } = measure(state, def);
    return { def, progress, completedDay: null, detail };
  });
}

/** Sıradaki (ilk tamamlanmamış) basamak; merdiven bittiyse null. */
export function nextGoal(state: GameState): GoalStatus | null {
  return goalLadder(state).find((goal) => goal.completedDay === null) ?? null;
}

/**
 * Günlük değerlendirme: yeni tamamlanan basamakları kaydeder, zaferi ilan
 * eder. Zafer oyunu DURAKLATIR ama bitirmez — ekran açılınca oyuncu
 * serbest oyuna devam edebilir.
 */
export function runGoalTick(state: GameState): void {
  if (state.gameOver) return;
  const done = (state.goals ??= {});

  for (const def of GOALS) {
    if (done[def.id] !== undefined) continue;
    const reached = def.kind === 'victory' ? victoryReached(state) !== null : measure(state, def).progress >= 1;
    if (!reached) continue;
    done[def.id] = state.time.day;
    if (def.kind === 'victory') continue; // zafer kendi haberini veriyor

    const next = GOALS.find((goal) => done[goal.id] === undefined);
    pushNews(
      state,
      'good',
      `Hedef tamam: ${def.title}`,
      next ? `Sıradaki basamak: ${next.title} — ${next.hint}` : 'Merdivenin sonu göründü.',
    );
  }

  if (!state.victory) {
    const kind = victoryReached(state);
    if (kind) {
      state.victory = { day: state.time.day, kind };
      state.time.speed = 0;
      pushNews(
        state,
        'good',
        kind === 'monopoly' ? 'Tekel: şehirde rakip kalmadı' : 'Şehrin sahibi sensin',
        kind === 'monopoly'
          ? 'Son rakip de senin oldu. Şehrin bütün ticareti tek elde.'
          : `${formatMoney(victoryNetWorth(state))} hedefini aştın ve bütün rakiplerin önündesin.`,
      );
    }
  }
}
