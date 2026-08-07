import { BUILDING_BY_ID, GOOD_BY_ID } from '@capital/content';
import type { BuildingInstance, GameState } from './types';

/**
 * Tedarik rotaları — zincirin şehir üzerindeki izdüşümü.
 *
 * Zincir kartı sayıları anlatıyor; bu dosya AYNI zinciri sokak seviyesinde
 * anlatıyor. Çiftlikten tesise, tesisten depoya, depodan mağazaya giden her
 * bağ bir "bacak" (leg). Çizim katmanı bu bacakları alıp üzerlerinde şirket
 * renginde kamyon yürütüyor.
 *
 * Neden motorda değil de burada değil — neden ÇİZİMDE değil de burada:
 * rota türetimi bir kural işi ("hangi tesis hangi mağazayı besler"), üçgen
 * işi değil. Burada durursa tarayıcı açmadan test edilebiliyor ve çizim
 * katmanı içerik kataloğunu hiç tanımak zorunda kalmıyor.
 *
 * Bu dosya da `chain.ts` gibi tamamen türetilmiştir — state'e yazmaz.
 */

export type SupplyLegKind =
  /** Hammadde: çiftlik/ocak → işleme tesisi. */
  | 'raw'
  /** Ara mal: tesis → depo. */
  | 'intermediate'
  /** Son teslim: tesis (veya depo) → mağaza. */
  | 'delivery';

export interface SupplyLeg {
  companyId: string;
  kind: SupplyLegKind;
  /** Taşınan mal — kamyonun ne götürdüğü. */
  goodId: string;
  fromTileId: number;
  toTileId: number;
  /** İki uç arasındaki Manhattan uzaklığı (tile). */
  distance: number;
}

/**
 * Bir tesisin kaç mağazasına kamyon çıkacağı.
 *
 * On mağazalı bir zincirde her mağazaya ayrı bacak çizmek şehri kamyon
 * çorbasına çevirir ve hiçbir şey okunmaz. En yakın üçü akışı anlatmaya
 * yetiyor; gerisi zaten aynı yöne gidiyor.
 */
const MAX_OUTLETS_PER_PLANT = 3;

/**
 * Toplam bacak tavanı.
 *
 * Sıralama oyuncuyu öne aldığı için tavan bağladığında ilk kırpılan rakip
 * oluyor — kendi lojistiğin her zaman görünür kalıyor.
 */
const MAX_LEGS = 64;

/**
 * Şehirdeki tüm tedarik bacaklarını türetir.
 *
 * Sonuç deterministiktir: aynı state her zaman aynı sırayla aynı bacakları
 * verir. Çizim katmanı buna güveniyor — liste değişmediyse kamyonlar
 * yerlerinden oynamıyor.
 */
export function supplyRoutes(state: GameState, playerCompanyId = 'player'): SupplyLeg[] {
  const byCompany = new Map<string, BuildingInstance[]>();
  for (const building of Object.values(state.buildings)) {
    const list = byCompany.get(building.companyId);
    if (list) list.push(building);
    else byCompany.set(building.companyId, [building]);
  }

  const legs: SupplyLeg[] = [];
  const seen = new Set<string>();

  const push = (leg: SupplyLeg): void => {
    if (leg.fromTileId === leg.toTileId) return;
    const key = `${leg.fromTileId}>${leg.toTileId}`;
    if (seen.has(key)) return;
    seen.add(key);
    legs.push(leg);
  };

  for (const [companyId, buildings] of byCompany) {
    const sorted = [...buildings].sort((a, b) => a.tileId - b.tileId);
    const extracts = sorted.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'extract');
    const plants = sorted.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'process');
    const outlets = sorted.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'outlet');
    const depots = sorted.filter((b) => BUILDING_BY_ID[b.defId]?.role === 'logistics');

    // --- Kademe 1: hammadde → tesis --------------------------------------
    //
    // Her çiftlik kendi ürününü işleyen EN YAKIN tesise bağlanır. Tesisi
    // olmayan çiftlik sessiz kalır; o zaten ürününü spot pazara satıyor.
    for (const extract of extracts) {
      const raw = BUILDING_BY_ID[extract.defId]?.outputGoodId;
      if (!raw) continue;
      const plant = nearest(
        state,
        extract,
        plants.filter((p) => {
          const output = BUILDING_BY_ID[p.defId]?.outputGoodId;
          return output ? GOOD_BY_ID[output]?.inputGoodId === raw : false;
        }),
      );
      if (!plant) continue;
      push({
        companyId,
        kind: 'raw',
        goodId: raw,
        fromTileId: extract.tileId,
        toTileId: plant.tileId,
        distance: manhattan(state, extract.tileId, plant.tileId),
      });
    }

    // --- Kademe 2: tesis → (depo) → mağaza --------------------------------
    //
    // Mağaza tarafından başlıyoruz çünkü karar mağazanın rafında: raftaki
    // ürünün ara malını hangi tesis üretiyorsa kamyon oradan geliyor.
    const servedByPlant = new Map<string, number>();

    for (const outlet of outlets) {
      const depot = nearestInRange(state, outlet, depots);

      for (const goodId of outlet.stocked) {
        const input = GOOD_BY_ID[goodId]?.inputGoodId;
        if (!input) continue;
        const plant = nearest(
          state,
          outlet,
          plants.filter((p) => BUILDING_BY_ID[p.defId]?.outputGoodId === input),
        );
        if (!plant) continue;

        const served = servedByPlant.get(plant.id) ?? 0;
        if (served >= MAX_OUTLETS_PER_PLANT) continue;
        servedByPlant.set(plant.id, served + 1);

        if (depot) {
          // Depo varsa akış onun üzerinden geçer — deponun neye yaradığı
          // tabloya bakmadan, kamyonların nereye uğradığından anlaşılıyor.
          push({
            companyId,
            kind: 'intermediate',
            goodId: input,
            fromTileId: plant.tileId,
            toTileId: depot.tileId,
            distance: manhattan(state, plant.tileId, depot.tileId),
          });
          push({
            companyId,
            kind: 'delivery',
            goodId,
            fromTileId: depot.tileId,
            toTileId: outlet.tileId,
            distance: manhattan(state, depot.tileId, outlet.tileId),
          });
        } else {
          push({
            companyId,
            kind: 'delivery',
            goodId,
            fromTileId: plant.tileId,
            toTileId: outlet.tileId,
            distance: manhattan(state, plant.tileId, outlet.tileId),
          });
        }
      }
    }
  }

  legs.sort((a, b) => {
    // Oyuncu önce: tavan bağladığında kırpılan taraf rakip olsun.
    const playerA = a.companyId === playerCompanyId ? 0 : 1;
    const playerB = b.companyId === playerCompanyId ? 0 : 1;
    if (playerA !== playerB) return playerA - playerB;
    if (a.companyId !== b.companyId) return a.companyId < b.companyId ? -1 : 1;
    if (a.fromTileId !== b.fromTileId) return a.fromTileId - b.fromTileId;
    return a.toTileId - b.toTileId;
  });

  return legs.slice(0, MAX_LEGS);
}

/** Aynı rota listesi mi? Çizim katmanı buna bakıp kamyonları korur. */
export function routeSignature(legs: SupplyLeg[]): string {
  return legs.map((leg) => `${leg.companyId}:${leg.fromTileId}>${leg.toTileId}`).join('|');
}

function manhattan(state: GameState, aTileId: number, bTileId: number): number {
  const a = state.map.tiles[aTileId];
  const b = state.map.tiles[bTileId];
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearest(
  state: GameState,
  from: BuildingInstance,
  candidates: BuildingInstance[],
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.id === from.id) continue;
    const distance = manhattan(state, from.tileId, candidate.tileId);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Menzili içinde kalan en yakın depo — dağıtım indirimiyle aynı kural. */
function nearestInRange(
  state: GameState,
  outlet: BuildingInstance,
  depots: BuildingInstance[],
): BuildingInstance | null {
  let best: BuildingInstance | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const depot of depots) {
    const radius = BUILDING_BY_ID[depot.defId]?.radius ?? 0;
    const distance = manhattan(state, outlet.tileId, depot.tileId);
    if (distance > radius) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = depot;
    }
  }
  return best;
}
