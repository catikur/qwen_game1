import { BUILDING_BY_ID, PATHS, PATH_BY_ID, PATH_SOURCES } from '@capital/content';
import type { PathDef, PathId, PathSource } from '@capital/content';
import type { BuildingInstance, GameState } from '../types';

/**
 * Şirketin yolu (Tur 61): kârın kaynağı ve zafere giden iş kolu.
 *
 * Gün sonunda oyuncunun binalarının günlük kârı kaynağına göre toplanıyor
 * (`state.sources`). Kendi santralinden enerji alan binanın tasarrufu o
 * binanın kârında duruyor (faturası yok); tasarruf santralin işi olduğu
 * için enerjiye yazılıyor, binanın kaynağından düşülüyor. Terminal kendi
 * mağazalarına depo; nakliyenin kârı rakiplerden topladığı ücret. Simülasyon
 * defteri okumuyor; zar atmıyor, hiçbir şeyi değiştirmiyor (lig izi aynı).
 */
export function sourceOf(building: BuildingInstance): PathSource {
  const def = BUILDING_BY_ID[building.defId];
  switch (def?.role) {
    case 'rental':
      return 'realestate';
    case 'energy':
      return 'energy';
    case 'logistics':
      // Filolu terminal rakiplere taşıyor (Tur 56); filosuz depo zincirin parçası.
      return (def.fleet ?? 0) > 0 ? 'freight' : 'retail';
    default:
      return 'retail';
  }
}

export function notePathSources(state: GameState): void {
  const playerId = state.playerCompanyId;
  if (!state.companies[playerId]) return;
  let sources = state.sources;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== playerId) continue;
    let profit = building.last.profit;
    const power = building.last.power;
    let saved = 0;
    if (power && power.saved > 0 && state.buildings[power.plantId]?.companyId === playerId) saved = power.saved;
    if (profit === 0 && saved === 0) continue;
    sources ??= state.sources = {};
    const source = sourceOf(building);
    if (saved > 0 && source !== 'energy') {
      profit -= saved;
      sources.energy = (sources.energy ?? 0) + saved;
    }
    if (source === 'freight') {
      // Terminal kendi mağazalarına depo da: bakımı ve ücretleri zincirin.
      // Rakibe taşımanın ek gideri yok; nakliyenin kârı topladığı ücret.
      const fees = building.last.revenue;
      sources.freight = (sources.freight ?? 0) + fees;
      sources.retail = (sources.retail ?? 0) + profit - fees;
      continue;
    }
    sources[source] = (sources[source] ?? 0) + profit;
  }
}

export interface CompanyPath {
  path: PathDef;
  /** Kaynakların toplam kârdaki payı (0..1); toplam artıda değilse hepsi 0. */
  shares: Record<PathSource, number>;
  /** Kaynakların koşu boyunca topladığı kâr. */
  totals: Record<PathSource, number>;
  acquisitions: number;
}

/** Yol eşiğini geçiyor mu (perakendenin eşiği yok). */
export function pathReached(def: PathDef, shares: Record<PathSource, number>, acquisitions: number): boolean {
  if (def.source && def.share) return shares[def.source] >= def.share;
  if (def.acquisitions) return acquisitions >= def.acquisitions;
  return false;
}

/** Şirketin bugüne kadarki yolu: eşiğini geçen ilk yol (listenin sırası), hiçbiri değilse perakende. */
export function companyPath(state: GameState): CompanyPath {
  const totals = Object.fromEntries(PATH_SOURCES.map((source) => [source, state.sources?.[source] ?? 0])) as Record<PathSource, number>;
  const sum = PATH_SOURCES.reduce((total, source) => total + totals[source], 0);
  const shares = Object.fromEntries(PATH_SOURCES.map((source) => [source, sum > 0 ? Math.max(0, totals[source]) / sum : 0])) as Record<PathSource, number>;
  const acquisitions = state.companies[state.playerCompanyId]?.acquisitions ?? 0;
  const id: PathId = PATHS.find((def) => pathReached(def, shares, acquisitions))?.id ?? 'retail';
  return { path: PATH_BY_ID[id], shares, totals, acquisitions };
}
