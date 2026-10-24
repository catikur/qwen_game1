import { getPlayer, sharesOutstanding } from '@capital/core';
import type { GameState } from '@capital/core';

/**
 * Önemli anlar (Tur 63), arayüzün yanı: hangi an, hangi bina. Saf
 * hesap; bileşenler (`Moments.tsx`) yalnızca çiziyor.
 *
 * Simülasyon bunları okumuyor ve bunlar simülasyondan bir şey
 * değiştirmiyor: hepsi iki durum arasındaki farktan ya da dünün
 * defterinden çıkarılıyor.
 */

export const MONEY_TAGS = {
  /** Günde en çok kaç kazanç etiketi (en çok kazandıranlar). */
  gains: 3,
  /** Zarar etiketi en iyi kazancın en az bu oranı kadar zarardaysa (küçük kayıp gürültü). */
  lossShare: 0.25,
  /** İki etiket dalgası arası (ms): hızlı oyunda her gün değil. */
  minGapMs: 1200,
  /** Etiketin yükselip sönmesi (ms). */
  lifeMs: 1800,
} as const;

/** Bir kazanç etiketi: dünkü kâr (ya da zarar), binanın çatısında. */
export interface MoneyTag {
  buildingId: string;
  tileId: number;
  amount: number;
}

/**
 * Günün kazanç etiketleri: oyuncunun dün en çok kazandıran üç binası;
 * zarar eden bir bina varsa en çok kaybettireni de (kayıp kazancın
 * dörtte birinden büyükse). Para nereden geliyor, nereye gidiyor: şehrin
 * üstünde, sayıyla.
 */
export function moneyTagsOf(state: GameState, gains: number = MONEY_TAGS.gains): MoneyTag[] {
  const player = getPlayer(state);
  const rows: MoneyTag[] = [];
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== player.id) continue;
    const amount = Math.round(building.last.profit);
    if (amount !== 0) rows.push({ buildingId: building.id, tileId: building.tileId, amount });
  }
  const byId = (a: MoneyTag, b: MoneyTag): number => (a.buildingId < b.buildingId ? -1 : a.buildingId > b.buildingId ? 1 : 0);
  const best = rows.filter((row) => row.amount > 0).sort((a, b) => b.amount - a.amount || byId(a, b)).slice(0, gains);
  const worst = rows.filter((row) => row.amount < 0).sort((a, b) => a.amount - b.amount || byId(a, b))[0];
  const floor = best.length > 0 ? best[0]!.amount * MONEY_TAGS.lossShare : 0;
  return worst && -worst.amount >= floor ? [...best, worst] : best;
}

/** Bir anın karşılaştırıldığı önceki hâl: şirketler, oyuncunun devralmaları ve payları, binaların sahibi, zafer. */
export interface MomentSnapshot {
  companies: Record<string, { name: string; color: string }>;
  playerId: string;
  acquisitions: number;
  /** Oyuncunun her şirketteki payı (0..1): devralınanı binası olmasa da tanıtıyor. */
  stakes: Record<string, number>;
  owners: Record<string, string>;
  victory: string | null;
}

export type Moment =
  | { kind: 'takeover'; companyId: string; name: string; color: string; buildings: number }
  | { kind: 'victory'; victory: 'tycoon' | 'monopoly' };

function victoryKey(state: GameState): string | null {
  return state.victory && !state.victory.dismissed ? `${state.victory.kind}:${state.victory.day}` : null;
}

export function snapshotOf(state: GameState): MomentSnapshot {
  const player = getPlayer(state);
  const companies: MomentSnapshot['companies'] = {};
  for (const company of Object.values(state.companies)) companies[company.id] = { name: company.name, color: company.color };
  const owners: Record<string, string> = {};
  for (const building of Object.values(state.buildings)) owners[building.id] = building.companyId;
  const stakes: Record<string, number> = {};
  for (const [id, count] of Object.entries(player.shares)) {
    if (count > 0) stakes[id] = count / Math.max(1, sharesOutstanding(state, id));
  }
  return { companies, playerId: player.id, acquisitions: player.acquisitions ?? 0, stakes, owners, victory: victoryKey(state) };
}

/**
 * İki hâl arasındaki anlar.
 *
 * Devralma: oyuncunun devralma sayısı arttı ve bir şirket listeden
 * düştü. Aynı gün iki şirket düştüyse (rakip de birini yuttu) oyuncunun
 * olanı: önce oyuncunun en büyük payı olan (devralan çoğunluğu tutuyor;
 * binası olmayan şirkette de), eşitse binaları oyuncuya geçen (Codex #93).
 * Zafer: motor zaferi ilan etti.
 */
export function momentsBetween(before: MomentSnapshot, state: GameState): Moment[] {
  const moments: Moment[] = [];
  const player = getPlayer(state);
  if (player.id === before.playerId && (player.acquisitions ?? 0) > before.acquisitions) {
    const gone = Object.keys(before.companies).filter((id) => id !== player.id && !state.companies[id]);
    let pick: { id: string; stake: number; buildings: number } | null = null;
    for (const id of gone) {
      let buildings = 0;
      for (const [buildingId, owner] of Object.entries(before.owners)) {
        if (owner === id && state.buildings[buildingId]?.companyId === player.id) buildings++;
      }
      const stake = before.stakes[id] ?? 0;
      if (!pick || stake > pick.stake || (stake === pick.stake && buildings > pick.buildings)) pick = { id, stake, buildings };
    }
    if (pick) {
      const company = before.companies[pick.id]!;
      moments.push({ kind: 'takeover', companyId: pick.id, name: company.name, color: company.color, buildings: pick.buildings });
    }
  }
  const victory = victoryKey(state);
  if (victory && victory !== before.victory && state.victory) moments.push({ kind: 'victory', victory: state.victory.kind });
  return moments;
}
