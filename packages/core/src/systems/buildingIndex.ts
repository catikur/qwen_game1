import { BUILDING_BY_ID } from '@capital/content';
import type { BuildingInstance, GameState } from '../types';

/**
 * Bina indeksi — saf hesaplamalar süresince (Tur 21).
 *
 * Büyük şehir (5×5) geç oyunda günü 300 ms'ye çıkardı; standart şehirde
 * bile 50 ms'ydi. Profil iki suçlu gösterdi: `distributionRelief` (%43)
 * her mağaza için şehirdeki BÜTÜN binaları tarayıp depo arıyordu,
 * `focusPotency` (%22) her fiyat hesabında bütün binaları tarayıp Ar-Ge
 * ve pazarlama gücünü topluyordu. İkisi de mağaza × bina: şehir büyüdükçe
 * karesiyle büyüyor.
 *
 * İndeks bir taramada kuruluyor ve YALNIZCA binaları değiştirmeyen bir
 * hesaplamanın süresince yaşıyor (`withBuildingIndex`): pazar adımı, Ar-Ge
 * adımı, zincir ve rekabet kartları. Kapsam dışında fonksiyonlar eskisi
 * gibi tarıyor. Bayat indeks bu yüzden mümkün değil: kapsam içinde kimse
 * bina kurmuyor, yıkmıyor ya da sahibini değiştirmiyor.
 */

interface Depot {
  x: number;
  y: number;
  radius: number;
}

interface BuildingIndex {
  state: GameState;
  depots: Map<string, Depot[]>;
  /** `${şirket}|${rol}|${kategori}` → odak gücünün ham toplamı. */
  potency: Map<string, number>;
  /** Bölge → oradaki mağazalar (ekleme sırasıyla: toplama sırası korunur). */
  outlets: Map<number, BuildingInstance[]>;
  /** Şirket → arsa + bina defter değeri; ilk istendiğinde kurulur. */
  assets?: Map<string, number>;
}

let scope: BuildingIndex | null = null;

function buildIndex(state: GameState): BuildingIndex {
  const depots = new Map<string, Depot[]>();
  const potency = new Map<string, number>();
  const outlets = new Map<number, BuildingInstance[]>();
  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    if (def.role === 'outlet') {
      const list = outlets.get(building.districtId);
      if (list) list.push(building);
      else outlets.set(building.districtId, [building]);
    } else if (def.role === 'logistics') {
      const tile = state.map.tiles[building.tileId];
      if (!tile) continue;
      const list = depots.get(building.companyId);
      const entry = { x: tile.x, y: tile.y, radius: def.radius };
      if (list) list.push(entry);
      else depots.set(building.companyId, [entry]);
    } else if ((def.role === 'research' || def.role === 'marketing') && building.focus) {
      const key = `${building.companyId}|${def.role}|${building.focus}`;
      potency.set(key, (potency.get(key) ?? 0) + (def.focusPotency ?? 0));
    }
  }
  return { state, depots, potency, outlets };
}

/** `fn`'i bina indeksi açıkken çalıştırır. `fn` bina değiştirmemeli. */
export function withBuildingIndex<T>(state: GameState, fn: () => T): T {
  if (scope && scope.state === state) return fn();
  const previous = scope;
  scope = buildIndex(state);
  try {
    return fn();
  } finally {
    scope = previous;
  }
}

/** Kapsam içindeyse depolar (şirket → konum); değilse null. */
export function scopedDepots(state: GameState, companyId: string): Depot[] | null {
  if (!scope || scope.state !== state) return null;
  return scope.depots.get(companyId) ?? [];
}

/** Kapsam içindeyse odak gücünün ham toplamı; değilse null. */
export function scopedPotency(state: GameState, companyId: string, role: string, categoryId: string): number | null {
  if (!scope || scope.state !== state) return null;
  return scope.potency.get(`${companyId}|${role}|${categoryId}`) ?? 0;
}

/** Kapsam içindeyse bölgedeki mağazalar; değilse null. */
export function scopedOutlets(state: GameState, districtId: number): BuildingInstance[] | null {
  if (!scope || scope.state !== state) return null;
  return scope.outlets.get(districtId) ?? [];
}

/**
 * Kapsam içindeyse şirketin arsa + bina defter değeri (`bookValue`'nun
 * nakit ve borç dışındaki kısmı); değilse null. Toplama sırası `bookValue`
 * ile aynı (önce parseller, sonra binalar), kayan nokta sonucu birebir.
 */
export function scopedAssets(state: GameState, companyId: string, bookRatio: number): number | null {
  if (!scope || scope.state !== state) return null;
  if (!scope.assets) {
    const assets = new Map<string, number>();
    for (const tile of state.map.tiles) {
      if (tile.ownerId) assets.set(tile.ownerId, (assets.get(tile.ownerId) ?? 0) + tile.landValue);
    }
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      if (def) assets.set(building.companyId, (assets.get(building.companyId) ?? 0) + def.cost * bookRatio);
    }
    scope.assets = assets;
  }
  return scope.assets.get(companyId) ?? 0;
}
