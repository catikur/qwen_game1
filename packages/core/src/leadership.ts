import { BUILDING_BY_ID } from '@capital/content';
import type { GameState } from './types';

/**
 * Bölge liderliği (Tur 21, §4.7'nin son kalemi).
 *
 * "Rakip seni geçince hırslanasın" Tur 11'de net değer sıralaması için
 * geldi. Ama oyuncunun gözüyle rekabet bir bölgede yaşanıyor: "Merkez'de
 * bir numaraydım, Nova bir süpermarket açtı ve artık değilim". O an bir
 * olay değildi.
 *
 * Lider: bölgedeki perakende cirosunun en büyük payını alan şirket. Ciro
 * günlük gürültülü (olay, fiyat salınımı), o yüzden 10 günlük üstel
 * ortalama izleniyor ve liderlik ancak %5 farkla el değiştiriyor — yoksa
 * iki yakın şirket her gün yer değiştirip haber akışını doldururdu.
 *
 * Hafıza motorda, state'te değil (geçilme olayıyla aynı gerekçe): türetilmiş
 * bir bilgi; kayıt yüklenince ilk gün sessizce yeniden kuruluyor.
 */

export interface LeadershipMemory {
  /** Bölge → şirket → ciro ortalaması. */
  ema: Record<number, Record<string, number>>;
  /** Bölge → lider şirket. */
  leader: Record<number, string>;
}

export interface LeadershipChange {
  districtId: number;
  from: string;
  to: string;
  /** Yeni liderin ve eski liderin ciro payı (0..1). */
  toShare: number;
  fromShare: number;
}

const EMA = 0.1;
const HYSTERESIS = 1.05;

/** Bugünkü perakende cirosu, bölge ve şirket kırılımıyla. */
export function districtRevenue(state: GameState): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {};
  for (const building of Object.values(state.buildings)) {
    if (BUILDING_BY_ID[building.defId]?.role !== 'outlet') continue;
    const row = (out[building.districtId] ??= {});
    row[building.companyId] = (row[building.companyId] ?? 0) + building.last.revenue;
  }
  return out;
}

function argmax(row: Record<string, number>): string | null {
  let best: string | null = null;
  for (const [id, value] of Object.entries(row)) {
    if (value <= 0) continue;
    if (best === null || value > row[best]!) best = id;
  }
  return best;
}

export function stepLeadership(
  state: GameState,
  memory: LeadershipMemory | null,
): { memory: LeadershipMemory; changes: LeadershipChange[] } {
  const today = districtRevenue(state);
  if (!memory) {
    const leader: Record<number, string> = {};
    for (const [id, row] of Object.entries(today)) {
      const top = argmax(row);
      if (top) leader[Number(id)] = top;
    }
    return { memory: { ema: today, leader }, changes: [] };
  }

  const changes: LeadershipChange[] = [];
  const districts = new Set([...Object.keys(memory.ema), ...Object.keys(today)].map(Number));
  for (const id of districts) {
    const row = (memory.ema[id] ??= {});
    const now = today[id] ?? {};
    for (const companyId of new Set([...Object.keys(row), ...Object.keys(now)])) {
      // Devralınan ya da silinen şirket ortalamadan düşer.
      if (!state.companies[companyId]) {
        delete row[companyId];
        continue;
      }
      row[companyId] = (row[companyId] ?? 0) * (1 - EMA) + (now[companyId] ?? 0) * EMA;
    }
    const top = argmax(row);
    const current = memory.leader[id];
    if (!top) {
      delete memory.leader[id];
      continue;
    }
    if (current === undefined || !state.companies[current]) {
      // Sahipsiz bölgeye ilk giren, ya da lider oyundan çıktı: sessiz devir.
      memory.leader[id] = top;
      continue;
    }
    if (top === current) continue;
    if (row[top]! <= (row[current] ?? 0) * HYSTERESIS) continue;
    const total = Object.values(row).reduce((sum, value) => sum + value, 0);
    changes.push({
      districtId: id,
      from: current,
      to: top,
      toShare: total > 0 ? row[top]! / total : 0,
      fromShare: total > 0 ? (row[current] ?? 0) / total : 0,
    });
    memory.leader[id] = top;
  }
  return { memory, changes };
}
