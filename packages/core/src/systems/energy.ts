import { BUILDING_BY_ID, ENERGY, ERA_BY_ID, EVENT_BY_ID } from '@capital/content';
import type { BuildingDef } from '@capital/content';
import { formatMoney } from '../format';
import { tc } from '../i18n';
import '../i18n/gameTr';
import { pushNews } from '../news';
import type { BuildingInstance, CommandResult, EnergyState, FuelLock, GameState } from '../types';
import { activeCrisis } from './economy';
import { seasonOf } from './living';

/**
 * Enerji — santraller ve şebeke fiyatı (Tur 57). Sabitler ve gerekçe
 * `@capital/content` energy.ts'te.
 *
 * FİYAT. Şebeke fiyatı bir endeks: normalde 1, krizler ve olaylar onu
 * çarpıyor (enerji krizi ×2, enerji sıkışması ×1,3, durgunluk ×0,85).
 * Her binanın bakımının bir payı enerji (`ENERGY.share`); fatura o payın
 * fiyatla çarpımı. Fiyat 1 ve santral yokken bakım eskisiyle bit bit aynı.
 *
 * SANTRAL. Gün başında her santral menzilindeki binaları sırayla alıyor:
 * önce sahibinin binaları, sonra rakiplerinki, yakından uzağa, gücü
 * yettiğince. Enerji ihtiyacı binanın enerji payı (MWh = pay / taban
 * fiyat). Eski santral önce seçiyor; bir bina tek santralden alıyor.
 *   - Sahibinin binası faturayı ödemiyor; santral yakıtını ödüyor.
 *     Kazanç binanın defterinde (daha düşük bakım), depodaki gibi.
 *   - Rakibin binası şebeke fiyatının %5 altından santrale ödüyor:
 *     rakibin bakımında, santralin cirosunda. Para el değiştiriyor.
 * Doğalgaz yakıtını şebeke fiyatıyla alıyor (%45'i); güneş tarlasında
 * yakıt yok, üretimi mevsime bağlı.
 *
 * SABİTLEME. Oyuncu doğalgaz santrallerinin yakıtını 120 gün bugünkü
 * fiyatın %8 fazlasına sabitleyebiliyor. Krizin uyarısında sabitleyen
 * şoku santralin kârına çeviriyor; fiyat düşerse fazladan ödüyor.
 *
 * Zar yok: dağıtım binalardan ve fiyattan türüyor, gün gün yeniden
 * kuruluyor. Santrali olmayan şehirde bu modül yalnızca fiyatı okuyor.
 */

/** Şebeke fiyatı endeksi: kriz, olay ve dönem çarpanlarının çarpımı. */
export function energyPrice(state: GameState): number {
  let price = activeCrisis(state)?.effects.energyPrice ?? 1;
  for (const active of state.activeEvents) {
    const multiplier = EVENT_BY_ID[active.defId]?.effects.energyPrice;
    if (multiplier) price *= multiplier;
  }
  const era = state.era ? ERA_BY_ID[state.era.defId]?.effects.energyPrice : undefined;
  if (era) price *= era;
  return price;
}

/** Bakımın enerjiye giden payı. Santralin kendisinde sıfır. */
export function energyShare(def: BuildingDef): number {
  if (def.role === 'energy') return 0;
  return ENERGY.share[def.role] ?? ENERGY.share.default;
}

/** Şebekeye bağlı binanın bakımı: enerji payı fiyatla. Fiyat 1'ken `upkeep`in kendisi. */
export function gridUpkeep(upkeep: number, def: BuildingDef, price: number): number {
  return price === 1 ? upkeep : upkeep * (1 + energyShare(def) * (price - 1));
}

/** Santralin bugünkü gücü (MWh): güneş tarlası mevsimle. */
export function plantCapacity(state: GameState, def: BuildingDef): number {
  const power = def.power ?? 0;
  return def.solar ? power * (ENERGY.solarSeason[seasonOf(state.time.day).id] ?? 1) : power;
}

/** Şirketin süren yakıt sabitlemesi; yoksa ya da süresi geçtiyse null. */
export function fuelLock(state: GameState, companyId: string): FuelLock | null {
  const lock = state.energy?.fuelLocks[companyId];
  return lock && state.time.day < lock.untilDay ? lock : null;
}

/** Santralin bugün MWh başına yakıt maliyeti (₺). */
export function fuelCost(state: GameState, plant: BuildingInstance, def: BuildingDef, price = energyPrice(state)): number {
  const fuel = def.fuel ?? 0;
  if (fuel <= 0) return 0;
  const index = fuelLock(state, plant.companyId)?.price ?? price;
  return ENERGY.unitPrice * fuel * index;
}

/** Bir binanın santralden aldığı enerji: hangi santral, sahibinin mi. */
export interface PowerSupply {
  plant: BuildingInstance;
  def: BuildingDef;
  own: boolean;
  /** Bu binanın bugünkü ihtiyacı (MWh). */
  mwh: number;
}

export interface PowerGrid {
  /** Bina → santral. Şebekeye bağlı bina listede yok. */
  served: Map<string, PowerSupply>;
  /** Santral → bugünkü gücü (MWh). */
  capacity: Map<string, number>;
}

/**
 * Kimlik sırası: `b9` `b10`dan önce (önce uzunluk). Dilden bağımsız:
 * `localeCompare` sunucuda ve tarayıcıda aynı sırayı vermeyebilir.
 */
function byId(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** Santraller, eskiden yeniye (kurulduğu gün, sonra kimlik). */
export function powerPlants(state: GameState): BuildingInstance[] {
  return Object.values(state.buildings)
    .filter((b) => BUILDING_BY_ID[b.defId]?.role === 'energy')
    .sort((a, b) => a.builtDay - b.builtDay || byId(a.id, b.id));
}

/** Binanın enerji ihtiyacı (MWh): bakımının enerji payı, taban fiyatla. */
export function energyNeed(def: BuildingDef, upkeep: number): number {
  return (upkeep * energyShare(def)) / ENERGY.unitPrice;
}

/**
 * Bir santralin menzilindeki adaylar, alma sırasıyla: sahibinin binaları
 * önce, sonra yakından uzağa, eşitse kimlik. `taken`deki binalar başka
 * santralden alıyor. `extra` henüz kurulmamış bir bina (yapı menüsünün
 * tahmini): kurulsaydı aynı sırada yer alırdı.
 */
function candidates(
  state: GameState,
  companyId: string,
  x: number,
  y: number,
  radius: number,
  taken: ReadonlyMap<string, unknown>,
  skip?: string,
  extra?: BuildingInstance,
): Array<{ building: BuildingInstance; def: BuildingDef; distance: number; own: boolean }> {
  const list: Array<{ building: BuildingInstance; def: BuildingDef; distance: number; own: boolean }> = [];
  const buildings = Object.values(state.buildings);
  if (extra) buildings.push(extra);
  for (const building of buildings) {
    if (building.id === skip || taken.has(building.id)) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def || energyShare(def) <= 0) continue;
    const tile = state.map.tiles[building.tileId];
    if (!tile) continue;
    const distance = Math.abs(tile.x - x) + Math.abs(tile.y - y);
    if (distance > radius) continue;
    list.push({ building, def, distance, own: building.companyId === companyId });
  }
  return list.sort((a, b) => Number(b.own) - Number(a.own) || a.distance - b.distance || byId(a.building.id, b.building.id));
}

/**
 * Bugünkü dağıtım. `upkeepOf` binanın bakımı (enerji payı dahil, fiyat
 * hariç): ihtiyaç ondan. `extra` kurulsaydı dağıtıma girecek bina (yapı
 * menüsünün tahmini). Santral yoksa null.
 */
export function powerGrid(
  state: GameState,
  upkeepOf: (building: BuildingInstance) => number,
  extra?: BuildingInstance,
): PowerGrid | null {
  const plants = powerPlants(state);
  if (plants.length === 0) return null;
  const served = new Map<string, PowerSupply>();
  const capacity = new Map<string, number>();
  for (const plant of plants) {
    const def = BUILDING_BY_ID[plant.defId]!;
    const tile = state.map.tiles[plant.tileId];
    const power = plantCapacity(state, def);
    capacity.set(plant.id, power);
    if (!tile) continue;
    let left = power;
    for (const candidate of candidates(state, plant.companyId, tile.x, tile.y, def.radius, served, undefined, extra)) {
      const mwh = energyNeed(candidate.def, upkeepOf(candidate.building));
      if (mwh <= 0 || mwh > left) continue;
      left -= mwh;
      served.set(candidate.building.id, { plant, def, own: candidate.own, mwh });
    }
  }
  return { served, capacity };
}

/**
 * Enerjisini santralden alan binanın bakımı ve defter notu.
 *
 *   sahibinin binası: bakım − enerji payı; fatura 0, kazanç şebeke faturası
 *   rakibin binası:  bakım − enerji payı + tarife; kazanç indirim kadar
 */
export function servedUpkeep(
  upkeep: number,
  def: BuildingDef,
  price: number,
  supply: PowerSupply,
): { upkeep: number; bill: number; saved: number } {
  const energy = upkeep * energyShare(def);
  const grid = energy * price;
  if (supply.own) return { upkeep: upkeep - energy, bill: 0, saved: grid };
  const bill = grid * (1 - ENERGY.rivalDiscount);
  return { upkeep: upkeep - energy + bill, bill, saved: grid - bill };
}

/**
 * Bu parsele kurulacak binanın yarınki bakımı, menzildeki bir santralden
 * alacaksa (Codex #87): sahibinin santralinden faturasız, rakibinkinden
 * tarifeyle. `raw` fiyattan önceki bakım, `upkeepOf` diğer binalarınki.
 * Dağıtım varsayımsal binayla yeniden kuruluyor; bina kurulunca alacağı
 * kimlikle, yani sırası da aynı. Santralden almayacaksa null: bakım şebeke
 * fiyatıyla, çağıranın eski hesabı.
 */
export function prospectiveUpkeep(
  state: GameState,
  companyId: string,
  def: BuildingDef,
  tileId: number,
  raw: number,
  upkeepOf: (building: BuildingInstance) => number,
): number | null {
  const tile = state.map.tiles[tileId];
  if (!tile || energyShare(def) <= 0) return null;
  const prospect: BuildingInstance = {
    id: `b${state.nextId}`,
    defId: def.id,
    tileId,
    districtId: tile.districtId,
    companyId,
    priceMultiplier: 1,
    autoPrice: true,
    builtDay: state.time.day,
    stocked: [],
    focus: null,
    last: { unitsSold: 0, capacityUsed: 0, revenue: 0, cogs: 0, upkeep: 0, wages: 0, profit: 0, share: 0, producedUnits: 0, soldToMarket: 0 },
  };
  const supply = powerGrid(state, (building) => (building === prospect ? raw : upkeepOf(building)), prospect)?.served.get(prospect.id);
  return supply ? servedUpkeep(raw, def, energyPrice(state), supply).upkeep : null;
}

/**
 * Santrallerin günlük defteri: rakiplerin faturası ciro, yakıt mal
 * maliyeti, sahibine kazandırdığı ayrı. Müşteri binaların defteri
 * yazıldıktan SONRA (faturaları `last.power`da).
 */
export function settlePlants(state: GameState, grid: PowerGrid, price: number): void {
  const totals = new Map<string, { ownMwh: number; rivalMwh: number; buildings: number; saved: number; sold: number }>();
  for (const [buildingId, supply] of grid.served) {
    const power = state.buildings[buildingId]?.last.power;
    if (!power) continue;
    const entry = totals.get(supply.plant.id) ?? { ownMwh: 0, rivalMwh: 0, buildings: 0, saved: 0, sold: 0 };
    entry.buildings += 1;
    if (supply.own) {
      entry.ownMwh += supply.mwh;
      entry.saved += power.saved;
    } else {
      entry.rivalMwh += supply.mwh;
      entry.sold += power.bill;
    }
    totals.set(supply.plant.id, entry);
  }

  for (const [plantId, capacity] of grid.capacity) {
    const plant = state.buildings[plantId];
    const def = plant ? BUILDING_BY_ID[plant.defId] : undefined;
    if (!plant || !def) continue;
    const entry = totals.get(plantId) ?? { ownMwh: 0, rivalMwh: 0, buildings: 0, saved: 0, sold: 0 };
    const fuel = (entry.ownMwh + entry.rivalMwh) * fuelCost(state, plant, def, price);
    plant.last.revenue += entry.sold;
    plant.last.cogs += fuel;
    plant.last.profit += entry.sold - fuel;
    plant.last.plant = { capacity, ownMwh: entry.ownMwh, rivalMwh: entry.rivalMwh, buildings: entry.buildings, saved: entry.saved };
    const company = state.companies[plant.companyId];
    if (company) {
      company.today.revenue += entry.sold;
      company.today.cogs += fuel;
    }
    const sum = (plant.energyTotals ??= { sold: 0, saved: 0, fuel: 0 });
    sum.sold += entry.sold;
    sum.saved += entry.saved;
    sum.fuel += fuel;
  }
}

// ------------------------------------------------------------ tahmin

export interface EnergyPotential {
  /** Santralin bugünkü gücü (MWh). */
  capacity: number;
  /** Kendi ve rakip binalarından alacakları (bina sayısı ve MWh). */
  own: number;
  ownMwh: number;
  rival: number;
  rivalMwh: number;
  /** Bugünkü fiyatla: kendi binalarına kazanç, rakiplere satış, yakıt. */
  saved: number;
  sold: number;
  fuel: number;
}

/**
 * Bu parsele kurulacak santralin bugünkü fiyatla günlük hesabı. Mevcut
 * santrallerin aldığı binalar dışarıda: yeni santral en yenisi, en son
 * seçiyor. Yapı menüsü ve oyuncunun kararı için; simülasyon kullanmıyor.
 */
export function energyPotential(
  state: GameState,
  companyId: string,
  defId: string,
  tileId: number,
  upkeepOf: (building: BuildingInstance) => number,
): EnergyPotential | null {
  const def = BUILDING_BY_ID[defId];
  const tile = state.map.tiles[tileId];
  if (!def || def.role !== 'energy' || !tile) return null;
  const price = energyPrice(state);
  const grid = powerGrid(state, upkeepOf);
  const capacity = plantCapacity(state, def);
  const lock = def.fuel ? fuelLock(state, companyId) : null;
  const fuelPerMwh = ENERGY.unitPrice * (def.fuel ?? 0) * (lock?.price ?? price);
  const result: EnergyPotential = { capacity, own: 0, ownMwh: 0, rival: 0, rivalMwh: 0, saved: 0, sold: 0, fuel: 0 };
  let left = capacity;
  for (const candidate of candidates(state, companyId, tile.x, tile.y, def.radius, grid?.served ?? new Map(), tile.buildingId ?? undefined)) {
    const upkeep = upkeepOf(candidate.building);
    const mwh = energyNeed(candidate.def, upkeep);
    if (mwh <= 0 || mwh > left) continue;
    left -= mwh;
    const gridBill = mwh * ENERGY.unitPrice * price;
    if (candidate.own) {
      result.own += 1;
      result.ownMwh += mwh;
      result.saved += gridBill;
    } else {
      result.rival += 1;
      result.rivalMwh += mwh;
      result.sold += gridBill * (1 - ENERGY.rivalDiscount);
    }
  }
  result.fuel = (result.ownMwh + result.rivalMwh) * fuelPerMwh;
  return result;
}

// ------------------------------------------------------------ sabitleme

function ensureEnergy(state: GameState): EnergyState {
  return (state.energy ??= { fuelLocks: {} });
}

/** Şirketin doğalgaz (yakıtlı) santrali var mı? */
export function hasFuelPlant(state: GameState, companyId: string): boolean {
  return Object.values(state.buildings).some((b) => b.companyId === companyId && (BUILDING_BY_ID[b.defId]?.fuel ?? 0) > 0);
}

/** Bugün sabitlenirse yakıtın endeksi. */
export function fuelLockQuote(state: GameState): number {
  return energyPrice(state) * (1 + ENERGY.lockPremium);
}

export function lockFuel(state: GameState): CommandResult {
  const companyId = state.playerCompanyId;
  if (!hasFuelPlant(state, companyId)) return { ok: false, reason: tc('core.energy.noFuelPlant') };
  if (fuelLock(state, companyId)) return { ok: false, reason: tc('core.energy.alreadyLocked') };
  const price = fuelLockQuote(state);
  const day = state.time.day;
  ensureEnergy(state).fuelLocks[companyId] = { price, fromDay: day, untilDay: day + ENERGY.lockDays };
  pushNews(
    state,
    'neutral',
    tc('core.energy.lockedTitle'),
    tc('core.energy.lockedBody', {
      price: formatMoney(ENERGY.unitPrice * price),
      days: ENERGY.lockDays,
    }),
  );
  return { ok: true };
}

/** Günlük adım: süresi biten sabitlemeleri kaldırır. Santral yoksa hiçbir şey yapmıyor. */
export function runEnergyTick(state: GameState): void {
  const locks = state.energy?.fuelLocks;
  if (!locks) return;
  for (const [companyId, lock] of Object.entries(locks)) {
    if (state.time.day < lock.untilDay) continue;
    delete locks[companyId];
    if (companyId === state.playerCompanyId) {
      pushNews(state, 'neutral', tc('core.energy.unlockedTitle'), tc('core.energy.unlockedBody'));
    }
  }
}
