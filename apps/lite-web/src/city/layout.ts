/**
 * Parsel düzeni (iOS `CityLayout` / `IslandLayout` ile aynı). Ana ada 7×7,
 * ortada iki yol; zincir başına üç kare (ham → işleme → satış). Uydu adalar
 * 3×3, ortada yol, tek zincir.
 */
import { CHAINS, CHAIN_BY_ID, DISTRICTS, type ChainId } from '@capital/lite-model';

/** (sütun, satır). */
export type Tile = readonly [number, number];

const sameTile = (a: Tile, c: number, r: number) => a[0] === c && a[1] === r;

const MAIN_TILES: Record<ChainId, readonly Tile[]> = {
  bakery: [[0, 0], [1, 0], [2, 0]],
  coffee: [[0, 2], [1, 2], [2, 2]],
  fashion: [[4, 0], [5, 0], [6, 0]],
  leather: [[0, 4], [1, 4], [2, 4]],
  tech: [[4, 4], [5, 4], [6, 4]],
  // Ada zincirleri kendi adalarında (`IslandLayout`).
  energy: [],
  auto: [],
  aviation: [],
};

export const CityLayout = {
  size: 7,
  roads: new Set<number>([3]) as ReadonlySet<number>,
  /** Ana adadaki parseller: [ham, işleme, satış]. */
  tiles(chain: ChainId): readonly Tile[] {
    return MAIN_TILES[chain];
  },
  mainChains: ['bakery', 'coffee', 'fashion', 'leather', 'tech'] as readonly ChainId[],
  /** Liman: güneydoğu köşesinde su ve vinçler. */
  port: [[4, 6], [5, 6], [6, 6]] as readonly Tile[],
  isRoad(c: number, r: number): boolean {
    return CityLayout.roads.has(c) || CityLayout.roads.has(r);
  },
  isClaimed(c: number, r: number): boolean {
    return (
      CityLayout.mainChains.some((chain) => MAIN_TILES[chain].some((tile) => sameTile(tile, c, r))) ||
      CityLayout.port.some((tile) => sameTile(tile, c, r))
    );
  },
  isPort(c: number, r: number): boolean {
    return CityLayout.port.some((tile) => sameTile(tile, c, r));
  },
} as const;

/**
 * Uydu ada düzeni (L7): 3×3, ortada yol (köprüler ona bağlanıyor), bir yanda
 * zincirin üç parseli, öbür yanda adanın süsleri.
 */
export const IslandLayout = {
  size: 3,
  road: 1,
  /** [ham, işleme, satış] */
  tiles: [[2, 0], [0, 1], [2, 2]] as readonly Tile[],
  decor: [[0, 0], [2, 1], [0, 2]] as readonly Tile[],
} as const;

/** Uydu adanın zinciri; ana adada (0) yok. */
export function islandChain(island: number): ChainId | null {
  if (island === 0) return null;
  return CHAINS.find((chain) => districtIsland(chain.district) === island)?.id ?? null;
}

/** Zincirin bulunduğu ada (fırsat balonu başka adadaysa sayfanın köşesinde). */
export function chainIsland(chain: ChainId): number {
  return districtIsland(CHAIN_BY_ID[chain].district);
}

function districtIsland(id: string): number {
  return DISTRICTS.find((district) => district.id === id)?.island ?? 0;
}
