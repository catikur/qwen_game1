import { BUILDING_BY_ID, BUILDINGS, CONSUMER_CATEGORIES } from '@capital/content';
import type { BuildingDef, CategoryId } from '@capital/content';
import type { BuildingInstance, CompanyState, DistrictState, GameState, Tile } from './types';

/**
 * UI ve render katmanının okuduğu türetilmiş veriler.
 * Hiçbiri state'i değiştirmez.
 */

/** Oyunun başlangıç tarihi — gün sayacını okunur bir takvime çevirir. */
const EPOCH = Date.UTC(2026, 0, 1);

export function getPlayer(state: GameState): CompanyState {
  return state.companies[state.playerCompanyId]!;
}

export function getTile(state: GameState, tileId: number): Tile | undefined {
  return state.map.tiles[tileId];
}

export function getDistrict(state: GameState, districtId: number): DistrictState | undefined {
  return state.districts[districtId];
}

export function getBuildingOnTile(state: GameState, tileId: number): BuildingInstance | undefined {
  const tile = state.map.tiles[tileId];
  return tile?.buildingId ? state.buildings[tile.buildingId] : undefined;
}

export function getBuildingDef(building: BuildingInstance): BuildingDef | undefined {
  return BUILDING_BY_ID[building.defId];
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)} Mr ₺`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)} M ₺`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000)} B ₺`;
  return `${sign}${Math.round(abs).toLocaleString('tr-TR')} ₺`;
}

export function formatDate(day: number): string {
  const date = new Date(EPOCH + day * 86_400_000);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Haritada gösterilebilecek veri lensleri. */
export type LensId = 'none' | 'opportunity' | 'landValue' | 'competition' | 'income' | 'ownership';

export interface LensDef {
  id: LensId;
  name: string;
  hint: string;
}

export const LENSES: LensDef[] = [
  { id: 'none', name: 'Şehir', hint: 'Binaları ve bölge renklerini olduğu gibi göster.' },
  {
    id: 'opportunity',
    name: 'Fırsat',
    hint: 'Karşılanmayan talep. Sıcak bölgeler para bırakır.',
  },
  { id: 'landValue', name: 'Arsa Değeri', hint: 'Arsa fiyatları. Ucuza al, değerlensin.' },
  { id: 'competition', name: 'Rekabet', hint: 'Bölgedeki rakip mağaza yoğunluğu.' },
  { id: 'income', name: 'Gelir', hint: 'Bölge gelir seviyesi. Lüks ürün nereye satılır?' },
  { id: 'ownership', name: 'Mülkiyet', hint: 'Arsalar kimin elinde?' },
];

/** Bir bölgenin toplam karşılanmamış talebi (0..1 normalize). */
export function districtOpportunity(district: DistrictState): number {
  let weighted = 0;
  let total = 0;
  for (const category of CONSUMER_CATEGORIES) {
    const demand = district.demand[category] ?? 0;
    weighted += demand * (district.unmet[category] ?? 0);
    total += demand;
  }
  return total > 0 ? weighted / total : 0;
}

/**
 * Lens için tile başına 0..1 değer. `ownership` ve `none` sayısal değildir,
 * onları render katmanı ayrıca ele alır.
 */
export function lensValue(state: GameState, tile: Tile, lens: LensId): number {
  const district = state.districts[tile.districtId];
  if (!district) return 0;

  switch (lens) {
    case 'opportunity': {
      // Ham oran oyunun başında her yerde ~1 çıkıyor ve harita tek renk
      // kalıyordu. Bölgeler arası FARKI göstermek için en yüksek değere
      // göre normalize ediyoruz — lensin işi karşılaştırma yaptırmak.
      let max = 0;
      for (const other of state.districts) {
        const value = districtOpportunity(other);
        if (value > max) max = value;
      }
      return max > 0 ? districtOpportunity(district) / max : 0;
    }
    case 'landValue': {
      let max = 1;
      for (const other of state.map.tiles) if (other.landValue > max) max = other.landValue;
      return tile.landValue / max;
    }
    case 'competition': {
      let max = 1;
      for (const other of state.districts) {
        let total = 0;
        for (const category of CONSUMER_CATEGORIES) total += other.outletCount[category] ?? 0;
        if (total > max) max = total;
      }
      let count = 0;
      for (const category of CONSUMER_CATEGORIES) count += district.outletCount[category] ?? 0;
      return count / max;
    }
    case 'income':
      return district.incomeLevel;
    default:
      return 0;
  }
}

export interface BuildOption {
  def: BuildingDef;
  unlocked: boolean;
  affordable: boolean;
  /** Kilitliyse gereken şirket değeri. */
  requirement: number;
}

export function buildOptions(state: GameState): BuildOption[] {
  const player = getPlayer(state);
  return BUILDINGS.map((def) => ({
    def,
    unlocked: player.netWorth >= def.unlockNetWorth,
    affordable: player.cash >= def.cost,
    requirement: def.unlockNetWorth,
  }));
}

export interface CompanyRankRow {
  company: CompanyState;
  rank: number;
  buildings: number;
  tiles: number;
}

export function companyRanking(state: GameState): CompanyRankRow[] {
  const buildingCounts: Record<string, number> = {};
  const tileCounts: Record<string, number> = {};

  for (const building of Object.values(state.buildings)) {
    buildingCounts[building.companyId] = (buildingCounts[building.companyId] ?? 0) + 1;
  }
  for (const tile of state.map.tiles) {
    if (tile.ownerId) tileCounts[tile.ownerId] = (tileCounts[tile.ownerId] ?? 0) + 1;
  }

  return Object.values(state.companies)
    .slice()
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((company, index) => ({
      company,
      rank: index + 1,
      buildings: buildingCounts[company.id] ?? 0,
      tiles: tileCounts[company.id] ?? 0,
    }));
}

/** Oyuncunun bir kategorideki toplam günlük kârı — panelde kırılım için. */
export function categoryBreakdown(state: GameState): Array<{
  category: CategoryId;
  revenue: number;
  profit: number;
  share: number;
  outlets: number;
}> {
  const player = getPlayer(state);
  const rows = new Map<CategoryId, { revenue: number; profit: number; outlets: number }>();

  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== player.id) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;

    const row = rows.get(def.category) ?? { revenue: 0, profit: 0, outlets: 0 };
    row.revenue += building.last.revenue;
    row.profit += building.last.profit;
    row.outlets += 1;
    rows.set(def.category, row);
  }

  return [...rows.entries()]
    .map(([category, row]) => ({
      category,
      revenue: row.revenue,
      profit: row.profit,
      outlets: row.outlets,
      share: player.marketShare[category] ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
