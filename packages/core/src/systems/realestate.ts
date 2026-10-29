import { BUILDINGS, BUILDING_BY_ID, CATEGORIES, REAL_ESTATE, STRUCTURE_BY_ID } from '@capital/content';
import type { BuildingDef, CategoryId } from '@capital/content';
import { formatMoney } from '../format';
import { tc } from '../i18n';
import '../i18n/gameTr';
import { pushNews } from '../news';
import type { BuildingInstance, CommandResult, DistrictState, GameState } from '../types';
import { isDistrictOpen, tilePrice } from './city';
import { zoningBlocker } from '../actions';

/**
 * Gayrimenkul geliştiricisi (Tur 58): proje, kira, doluluk, kentsel dönüşüm.
 *
 * Kiralığın pazarı eskisi gibi bölge × kategori: aynı bölgede ne kadar çok
 * kiralık birim varsa doluluk o kadar düşük. Üstüne:
 *
 *   - Proje (`buildDays`): inşaat süresince pazarda yok, kirası yok; açılınca
 *     doluluğu bir durum. Hedefe günde en çok kiracı gelişi kadar yaklaşıyor,
 *     hedef düşerse taşınma kadar uzaklaşıyor.
 *   - Kira: hedef doluluğu kaydırıyor (pahalı kira düşürüyor), geliri
 *     çarpıyor. Kira 1'ken hesap eskisiyle bit bit aynı.
 *   - Dönüşüm parseli: projenin kapasitesi imar artışıyla büyük; hak
 *     sahipleri tanımdaki kapasitenin bir payında kirasız oturuyor. Onların
 *     daireleri pazara çıkmıyor (zaten orada oturuyorlardı): baskıda yok.
 *
 * Zar yok; projenin doluluğu dışında durum yok.
 */

/** Proje mi: inşaat süresi olan kiralık. */
export function isProject(def: BuildingDef | undefined): boolean {
  return Boolean(def && def.role === 'rental' && (def.buildDays ?? 0) > 0);
}

/** İnşaatı süren proje: kirası yok, bakımın şantiye payı, ücret yok. */
export function underConstruction(building: BuildingInstance): boolean {
  return building.development !== undefined && building.development.occupancy === undefined;
}

/** Projenin birimleri: kiralık (imar artışıyla) ve hak sahiplerinin kirasız daireleri. */
export function projectUnits(def: BuildingDef, renewal: boolean): { units: number; rightHolders: number } {
  if (!renewal) return { units: def.capacity, rightHolders: 0 };
  const total = Math.round(def.capacity * (1 + REAL_ESTATE.renewal.capacityBonus));
  const rightHolders = Math.round(def.capacity * REAL_ESTATE.renewal.rightHolders);
  return { units: total - rightHolders, rightHolders };
}

/** Kiralığın bugün pazardaki birimleri; inşaattaki projede sıfır. */
export function rentalUnits(building: BuildingInstance, def: BuildingDef): { units: number; rightHolders: number } {
  const development = building.development;
  if (!development) return { units: def.capacity, rightHolders: 0 };
  if (development.occupancy === undefined) return { units: 0, rightHolders: 0 };
  return projectUnits(def, Boolean(development.renewal));
}

/** Kira seviyesi; yokluğu piyasa kirası. */
export function rentOf(building: BuildingInstance): number {
  return building.rent ?? 1;
}

/**
 * Doluluğun kırpılmamış hâli: gelir yüksekse dolu, bölgede kiralık birim
 * çoksa boş. `capacity` bölgenin o kategorideki bütün kiralık birimleri.
 */
export function rawOccupancy(district: DistrictState, capacity: number): number {
  const absorbable = district.population * 0.06 + 40;
  const pressure = Math.min(1, capacity / Math.max(1, absorbable));
  return 0.55 + 0.5 * district.incomeLevel - 0.4 * pressure;
}

/** Hedef doluluk: kira kaydırıyor, sonra %15–%100. Kira 1'ken eskisiyle aynı. */
export function rentalTarget(raw: number, category: CategoryId, rent: number): number {
  const shifted = rent === 1 ? raw : raw - (REAL_ESTATE.elasticity[category] ?? 1) * (rent - 1);
  return Math.max(0.15, Math.min(1, shifted));
}

/** Projenin bugünkü doluluğu: dünkünden hedefe doğru, kiracı gelişi ya da taşınma kadar. */
export function leaseStep(occupancy: number, target: number, category: CategoryId): number {
  if (target > occupancy) return Math.min(target, occupancy + (REAL_ESTATE.leaseUp[category] ?? 0.02));
  return Math.max(target, occupancy - (REAL_ESTATE.moveOut[category] ?? 0.01));
}

/** Bölge × kategori → kiralık birim (pazar adımı ve tahmin aynı sayıyla). */
export function rentalSupply(buildings: Iterable<BuildingInstance>): Map<string, number> {
  const supply = new Map<string, number>();
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'rental') continue;
    const { units } = rentalUnits(building, def);
    if (units <= 0) continue;
    const key = `${building.districtId}|${def.category}`;
    supply.set(key, (supply.get(key) ?? 0) + units);
  }
  return supply;
}

/**
 * Parselin dönüşüm hakkı var mı: dönüşüm ihalesinden alınmış (hak parselde)
 * ya da açık dönüşüm ihalesinin parseli (yapı daha yerinde). İkincisi yapı
 * menüsünün ve ihale ipucunun tahmini için: kazanan hakkı alacak.
 */
export function renewalRight(state: GameState, tileId: number): boolean {
  const tile = state.map.tiles[tileId];
  if (!tile) return false;
  if (tile.renewal) return true;
  return state.auction?.tileId === tileId && tile.structureId !== null;
}

/** Projenin açılıştan hedefe doluş süresi (gün), hedefin altında açılırsa. */
export function leaseUpDays(def: BuildingDef, target: number): number {
  const prelease = REAL_ESTATE.prelease[def.category] ?? 0;
  const rate = REAL_ESTATE.leaseUp[def.category] ?? 0.02;
  return Math.max(0, Math.ceil((target - prelease) / rate));
}

/**
 * Projenin geri ödemesi (yapı menüsü): inşaat süresi, doluşun yarısı
 * (doğrusal doluşta ortalama eksik, yaklaşık) ve bedelle şantiye giderinin
 * dolmuş projenin kârıyla ödenmesi.
 */
export function projectPayback(def: BuildingDef, investmentCost: number, dailyProfit: number, target: number): number {
  const build = def.buildDays ?? 0;
  const site = def.upkeepPerDay * REAL_ESTATE.siteUpkeep * build;
  return build + leaseUpDays(def, target) / 2 + (investmentCost + site) / dailyProfit;
}

export interface RentalOutlook {
  /** Kiralık birim (inşaatta tanımın kapasitesi, dönüşüm payıyla). */
  units: number;
  rightHolders: number;
  rent: number;
  /** Bugünkü doluluk (kiralık birimlerin dolu payı); inşaatta 0. */
  occupancy: number;
  /** Bu kirayla hedef doluluk. */
  target: number;
  /** Projede hedefe kaç gün; anında dolan kiralıkta 0. */
  daysToTarget: number;
  /** Bu kirayla ve hedef dolulukta günlük kira geliri. */
  rentAtTarget: number;
  /** Proje inşaatta: açılışa kaç gün. */
  opensIn: number | null;
}

/**
 * Kiralığın bugünü ve verilen kirayla hedefi (arayüz). Pazar adımının
 * hesabının aynısı: bölgenin kiralık birimleri, inşaattaki proje açılmış
 * sayılarak (açılınca oraya girecek).
 */
export function rentalOutlook(state: GameState, buildingId: string, rent?: number): RentalOutlook | null {
  const building = state.buildings[buildingId];
  const def = building ? BUILDING_BY_ID[building.defId] : undefined;
  const district = building ? state.districts[building.districtId] : undefined;
  if (!building || !def || def.role !== 'rental' || !district) return null;
  const opening = underConstruction(building);
  const mine = building.development ? projectUnits(def, Boolean(building.development.renewal)) : rentalUnits(building, def);
  let capacity = 0;
  for (const other of Object.values(state.buildings)) {
    if (other === building || other.districtId !== building.districtId) continue;
    const otherDef = BUILDING_BY_ID[other.defId];
    if (otherDef?.role === 'rental' && otherDef.category === def.category) capacity += rentalUnits(other, otherDef).units;
  }
  capacity += mine.units;
  const level = rent ?? rentOf(building);
  const target = rentalTarget(rawOccupancy(district, capacity), def.category, level);
  const occupancy = opening ? 0 : building.development ? (building.development.occupancy ?? 0) : target;
  const from = opening ? REAL_ESTATE.prelease[def.category] ?? 0 : occupancy;
  const rate = target > from ? REAL_ESTATE.leaseUp[def.category] ?? 0.02 : REAL_ESTATE.moveOut[def.category] ?? 0.01;
  return {
    units: mine.units,
    rightHolders: mine.rightHolders,
    rent: level,
    occupancy,
    target,
    daysToTarget: building.development ? Math.ceil(Math.abs(target - from) / rate) : 0,
    rentAtTarget: mine.units * target * CATEGORIES[def.category].basePrice * level,
    opensIn: opening ? Math.max(0, building.development!.opensOnDay - state.time.day) : null,
  };
}

/** Kira seviyesini ayarlar: adıma yuvarlanmış, sınırlar içinde; 1 alanı siliyor. */
export function setRent(state: GameState, companyId: string, buildingId: string, rent: number): CommandResult {
  const building = state.buildings[buildingId];
  if (!building) return { ok: false, reason: tc('core.engine.buildingNotFound') };
  if (building.companyId !== companyId) return { ok: false, reason: tc('core.engine.buildingNotYours') };
  if (BUILDING_BY_ID[building.defId]?.role !== 'rental') return { ok: false, reason: tc('core.realestate.notRental') };
  if (!Number.isFinite(rent)) return { ok: false, reason: tc('core.realestate.badRent') };
  const { min, max, step } = REAL_ESTATE.rent;
  const level = Math.round(Math.max(min, Math.min(max, rent)) / step) * step;
  const rounded = Math.round(level * 100) / 100;
  if (rounded === 1) delete building.rent;
  else building.rent = rounded;
  return { ok: true };
}

/** Bu parsel için dönüşüm başvurusu neden yapılamıyor; yapılabiliyorsa null. */
export function renewalBlocker(state: GameState, tileId: number): string | null {
  if (!state.flags.landAuctions) return tc('core.realestate.noAuctions');
  const tile = state.map.tiles[tileId];
  if (!tile || tile.kind !== 'plot') return tc('core.realestate.notRenewable');
  const structure = tile.structureId ? STRUCTURE_BY_ID[tile.structureId] : undefined;
  if (!structure || structure.buyoutMultiplier === null) return tc('core.realestate.notRenewable');
  if (tile.ownerId || tile.buildingId) return tc('core.realestate.notRenewable');
  // İmar artışı ve hak sahipleri yalnız projede: bölgeye proje kurulamıyorsa başvuru bedelsiz bir vaat olurdu (Codex #88).
  if (!BUILDINGS.some((def) => isProject(def) && zoningBlocker(state, tile.districtId, def.id) === null)) {
    return tc('core.realestate.noProjectZone');
  }
  if (!isDistrictOpen(state, tile.districtId)) return tc('core.realestate.districtLocked');
  if (state.auction?.tileId === tileId) return tc('core.realestate.inAuction');
  if (state.renewalRequest) return tc('core.realestate.requestPending');
  return null;
}

/** Başvurunun bedeli: parselin oyuncuya bugünkü fiyatının payı, en az taban. */
export function renewalFee(state: GameState, tileId: number): number {
  return Math.max(REAL_ESTATE.renewal.minFee, Math.round(tilePrice(state, tileId, state.playerCompanyId) * REAL_ESTATE.renewal.applicationFee));
}

/**
 * Dönüşüm başvurusu: belediye sıradaki ihalesini bu parsele açıyor (en geç
 * 30 gün). Bedel geri dönmüyor; ihaleyi rakip kazanırsa da.
 */
export function requestRenewal(state: GameState, tileId: number): CommandResult {
  const blocker = renewalBlocker(state, tileId);
  if (blocker) return { ok: false, reason: blocker };
  const company = state.companies[state.playerCompanyId];
  if (!company) return { ok: false, reason: tc('core.actions.unknownCompany') };
  const fee = renewalFee(state, tileId);
  if (company.cash < fee) return { ok: false, reason: tc('core.realestate.noCash', { fee: formatMoney(fee) }) };
  company.cash -= fee;
  state.renewalRequest = { tileId, day: state.time.day, fee };
  const tile = state.map.tiles[tileId]!;
  pushNews(
    state,
    'neutral',
    tc('core.realestate.requestedTitle'),
    tc('core.realestate.requestedBody', {
      structure: STRUCTURE_BY_ID[tile.structureId!]?.name ?? tc('core.auction.aStructure'),
      district: state.districts[tile.districtId]?.name ?? tc('core.auction.city'),
      fee: formatMoney(fee),
    }),
    { tileId },
  );
  return { ok: true };
}

/**
 * Bekleyen başvurunun parseli hâlâ dönüşüme uygunsa onu döndürür ve
 * başvuruyu kapatır (ihale açılıyor); uygun değilse başvuru düşüyor.
 */
export function takeRenewalRequest(state: GameState): number | null {
  const request = state.renewalRequest;
  if (!request) return null;
  delete state.renewalRequest;
  const tile = state.map.tiles[request.tileId];
  const structure = tile?.structureId ? STRUCTURE_BY_ID[tile.structureId] : undefined;
  if (tile && structure && structure.buyoutMultiplier !== null && !tile.ownerId && !tile.buildingId && isDistrictOpen(state, tile.districtId)) {
    return request.tileId;
  }
  pushNews(state, 'neutral', tc('core.realestate.droppedTitle'), tc('core.realestate.droppedBody'), { tileId: request.tileId });
  return null;
}

/**
 * Günlük adım, defterden önce: açılış günü gelen projeyi açıyor. Doluluk
 * ön kiralamayla başlıyor; pazar adımı o günden hedefe yürütüyor. Parsel
 * ihalesi kapatılmışsa bekleyen başvuruyu düşürüyor.
 */
export function runRealEstateTick(state: GameState): void {
  // İhale kapatıldıysa bekleyen başvuru açılmayacak: parsel de satılmaz kalırdı.
  if (state.renewalRequest && !state.flags.landAuctions) {
    const { tileId } = state.renewalRequest;
    delete state.renewalRequest;
    pushNews(state, 'neutral', tc('core.realestate.droppedTitle'), tc('core.realestate.droppedOffBody'), { tileId });
  }
  for (const building of Object.values(state.buildings)) {
    const development = building.development;
    if (!development || development.occupancy !== undefined) continue;
    if (state.time.day < development.opensOnDay) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    development.occupancy = REAL_ESTATE.prelease[def.category] ?? 0;
    if (building.companyId !== state.playerCompanyId) continue;
    const { units, rightHolders } = projectUnits(def, Boolean(development.renewal));
    pushNews(
      state,
      'good',
      tc('core.realestate.openedTitle', { name: def.name }),
      tc(rightHolders > 0 ? 'core.realestate.openedRenewalBody' : 'core.realestate.openedBody', {
        name: def.name,
        units,
        share: Math.round(development.occupancy * 100),
        rightHolders,
      }),
      { tileId: building.tileId },
    );
  }
}
