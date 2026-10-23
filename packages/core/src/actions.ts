import {
  BUILDING_BY_ID,
  DISTRICT_ARCHETYPES,
  STRUCTURE_BY_ID,
  formatShortMoney,
  getCeoModifiers,
} from '@capital/content';
import { defaultShelf } from './systems/demand';
import { defaultFocus } from './systems/focus';
import { LAND_SELL_RATIO, tilePrice } from './systems/city';
import { permitMultiplier } from './systems/council';
import { crisisBuildMultiplier } from './systems/economy';
import { isPledged } from './systems/credit';
import { tc } from './i18n';
import type { CommandResult, GameState } from './types';

/**
 * Oyun eylemleri.
 *
 * Hem oyuncu komutları hem NPC yapay zekâsı BU fonksiyonları çağırır.
 * Böylece "NPC hile yapıyor" hissi mimari olarak imkânsız hale gelir:
 * rakibin bir arsayı alması ile senin alman aynı kodu, aynı fiyatı ve
 * aynı nakit kontrolünü kullanır.
 */

const DEMOLISH_REFUND = 0.25;

export function canBuild(state: GameState, companyId: string, defId: string): CommandResult {
  const def = BUILDING_BY_ID[defId];
  if (!def) return { ok: false, reason: tc('core.actions.unknownBuilding') };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: tc('core.actions.unknownCompany') };

  if (company.netWorth < def.unlockNetWorth) {
    return {
      ok: false,
      reason: tc('core.actions.needsNetWorth', { name: def.name, amount: formatShortMoney(def.unlockNetWorth) }),
    };
  }
  const cost = buildCost(state, companyId, defId);
  if (company.cash < cost) {
    return { ok: false, reason: tc('core.actions.buildNoCash', { amount: formatShortMoney(cost) }) };
  }
  return { ok: true };
}

/**
 * İmar kontrolü — bir bina bu bölgeye kurulabilir mi?
 *
 * Üretim üniteleri yalnızca sanayi ve limana kurulur. Şehir haritasının
 * ortasına çiftlik dikmek hem tuhaf olurdu hem de kolay; kısıt sayesinde
 * sanayi bölgesi — en düşük arsa değerine ve en az tüketici talebine
 * sahip olmasına rağmen — şehrin en çekişmeli arazisi haline geliyor.
 *
 * Kural oyuncuya da NPC'ye de aynı şekilde uygulanır.
 */
export function zoningBlocker(state: GameState, districtId: number, defId: string): string | null {
  const def = BUILDING_BY_ID[defId];
  if (!def?.zones || def.zones.length === 0) return null;

  const district = state.districts[districtId];
  if (!district) return tc('core.actions.districtNotFound');
  if (def.zones.includes(district.archetype)) return null;

  const names = def.zones.map((zone) => DISTRICT_ARCHETYPES[zone].name).join(tc('core.actions.zoneOr'));
  return tc('core.actions.zoningOnly', { name: def.name, zones: names });
}

/** CEO pazarlığı uygulanmış inşaat maliyeti. */
/**
 * İnşaat maliyeti çarpanı: meclisin ruhsat indirimi × kriz (Tur 37a —
 * durgunlukta inşaat ucuzluyor). Gerçek maliyet ve yatırım tahmini aynı
 * çarpanı okuyor.
 */
export function constructionMultiplier(state: GameState): number {
  return permitMultiplier(state) * crisisBuildMultiplier(state);
}

export function buildCost(state: GameState, companyId: string, defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const company = state.companies[companyId];
  // Meclisin ruhsat kolaylığı herkese aynı: oyuncu da rakip de ucuz kurar.
  return Math.round(def.cost * getCeoModifiers(company?.ceoId ?? null).buildCost * constructionMultiplier(state));
}

/** Parselin neden alınamadığını açıklar; alınabiliyorsa null döner. */
export function purchaseBlocker(state: GameState, tileId: number): string | null {
  const tile = state.map.tiles[tileId];
  if (!tile) return tc('core.actions.tileNotFound');
  if (tile.kind === 'road') return tc('core.actions.roadNotForSale');
  if (tile.kind === 'civic') {
    const structure = tile.structureId ? STRUCTURE_BY_ID[tile.structureId] : null;
    return tc('core.actions.civicNotForSale', { name: structure?.name ?? tc('core.actions.publicArea') });
  }
  // Kilitli bölge: oyuncu da NPC de bu kapıdan geçer, kural tek yerde.
  const district = state.districts[tile.districtId];
  if (district?.opensOnDay !== undefined && state.time.day < district.opensOnDay) {
    return tc('core.actions.districtLocked', { district: district.name, days: district.opensOnDay - state.time.day });
  }
  if (tile.ownerId) {
    const owner = state.companies[tile.ownerId];
    return tc('core.actions.tileOwned', { owner: owner?.name ?? tc('core.actions.aRival') });
  }
  // İhaledeki parsel normal yoldan alınamaz. Alınabilseydi ihale bir
  // mekanik değil, sadece bir bildirim olurdu: oyuncu teklif vermek
  // yerine doğrudan satın alıp geçerdi.
  if (state.auction?.tileId === tileId) {
    return tc('core.actions.tileInAuction');
  }
  // Belediyedeki dönüşüm başvurusunun parseli (Tur 58) ihale gününe kadar
  // satılmıyor: başvuru, rakip yapıyı ihaleden önce devralınca düşüyordu.
  if (state.renewalRequest?.tileId === tileId) {
    return tc('core.actions.tileInRenewal');
  }
  return null;
}

export function buyTile(state: GameState, companyId: string, tileId: number): CommandResult {
  const blocker = purchaseBlocker(state, tileId);
  if (blocker) return { ok: false, reason: blocker };

  const tile = state.map.tiles[tileId]!;
  if (tile.structureId) {
    const structure = STRUCTURE_BY_ID[tile.structureId];
    return {
      ok: false,
      reason: tc('core.actions.tileHasStructure', { structure: structure?.name ?? tc('core.actions.existingStructure') }),
    };
  }

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: tc('core.actions.unknownCompany') };

  const price = tilePrice(state, tileId, companyId);
  if (company.cash < price) {
    return { ok: false, reason: tc('core.actions.tileNoCash', { price: formatShortMoney(price) }) };
  }

  company.cash -= price;
  tile.ownerId = companyId;
  return { ok: true };
}

/**
 * Mevcut yapıyı sahibinden primli devralır ve yıkar.
 *
 * Sıkışık bir şehirde büyümenin asıl yolu bu: iyi bölgede boş parsel
 * kalmadığında birinin işini satın alırsın.
 */
export function buyoutTile(state: GameState, companyId: string, tileId: number): CommandResult {
  const blocker = purchaseBlocker(state, tileId);
  if (blocker) return { ok: false, reason: blocker };

  const tile = state.map.tiles[tileId]!;
  if (!tile.structureId) {
    return { ok: false, reason: tc('core.actions.tileAlreadyEmpty') };
  }

  const structure = STRUCTURE_BY_ID[tile.structureId];
  if (!structure || structure.buyoutMultiplier === null) {
    return { ok: false, reason: tc('core.actions.structureNotForSale') };
  }

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: tc('core.actions.unknownCompany') };

  const price = tilePrice(state, tileId, companyId);
  if (company.cash < price) {
    return {
      ok: false,
      reason: tc('core.actions.buyoutNoCash', { name: structure.name, price: formatShortMoney(price) }),
    };
  }

  company.cash -= price;
  tile.ownerId = companyId;
  tile.structureId = null;
  tile.structureHeight = 0;
  return { ok: true };
}

export function sellTile(state: GameState, companyId: string, tileId: number): CommandResult {
  const tile = state.map.tiles[tileId];
  if (!tile) return { ok: false, reason: tc('core.actions.landNotFound') };
  if (tile.ownerId !== companyId) return { ok: false, reason: tc('core.actions.landNotYours') };
  if (tile.buildingId) return { ok: false, reason: tc('core.actions.demolishFirst') };
  if (isPledged(state, tileId)) return { ok: false, reason: tc('core.actions.landPledged') };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: tc('core.actions.unknownCompany') };

  company.cash += Math.round(tile.landValue * LAND_SELL_RATIO);
  tile.ownerId = null;
  // Dönüşüm hakkı (Tur 58) parselin yeni sahibine geçmiyor.
  delete tile.renewal;
  return { ok: true };
}

export function build(
  state: GameState,
  companyId: string,
  tileId: number,
  defId: string,
): CommandResult {
  const tile = state.map.tiles[tileId];
  if (!tile) return { ok: false, reason: tc('core.actions.tileNotFound') };
  if (tile.ownerId !== companyId) return { ok: false, reason: tc('core.actions.buyTileFirst') };
  if (tile.buildingId) return { ok: false, reason: tc('core.actions.tileOccupied') };

  const zoning = zoningBlocker(state, tile.districtId, defId);
  if (zoning) return { ok: false, reason: zoning };

  const allowed = canBuild(state, companyId, defId);
  if (!allowed.ok) return allowed;

  const company = state.companies[companyId]!;
  const def = BUILDING_BY_ID[defId]!;

  company.cash -= buildCost(state, companyId, defId);
  const id = `b${state.nextId++}`;

  // Outlet açılır açılmaz raflarını BÖLGEDE en çok satan ürünlerle
  // doldurur — yuvası kaç taneyse o kadar. Tek yuvalı bakkal gerçekten
  // seçim yapmak zorunda; üç yuvalı süpermarket kategorinin tamamını
  // taşır. Oyuncu isterse rafı sonra değiştirir.
  const district = state.districts[tile.districtId];
  const stocked =
    def.role === 'outlet' && district
      ? defaultShelf(district.archetype, def.category, def.slots ?? 1)
      : [];

  // Ar-Ge merkezi / pazarlama ofisi kurulur kurulmaz şirketin en çok
  // mağazası olan kategoriye atanır. Boş bir binaya bakıp "bu ne işe
  // yarıyor" dedirtmek yerine, makul olanı yapıp oyuncunun değiştirmesine
  // bırakıyoruz — rafta izlediğimiz yolun aynısı.
  const focus = defaultFocus(state, companyId, defId);

  state.buildings[id] = {
    id,
    defId,
    tileId,
    districtId: tile.districtId,
    companyId,
    priceMultiplier: 1,
    autoPrice: true,
    builtDay: state.time.day,
    stocked,
    focus,
    last: {
      unitsSold: 0,
      capacityUsed: 0,
      revenue: 0,
      cogs: 0,
      upkeep: 0,
      wages: 0,
      profit: 0,
      share: 0,
      producedUnits: 0,
      soldToMarket: 0,
    },
  };
  // Proje (Tur 58): inşaat süresince şantiye; dönüşüm parselinde imar
  // artışıyla. Parseldeki dönüşüm hakkını ilk kurulan bina kullanıyor:
  // proje değilse hak düşüyor.
  if (def.buildDays) {
    state.buildings[id]!.development = {
      opensOnDay: state.time.day + def.buildDays,
      ...(tile.renewal ? { renewal: true } : {}),
    };
  }
  delete tile.renewal;
  tile.buildingId = id;
  return { ok: true };
}

export function demolish(state: GameState, companyId: string, tileId: number): CommandResult {
  const tile = state.map.tiles[tileId];
  if (!tile?.buildingId) return { ok: false, reason: tc('core.actions.nothingToDemolish') };

  const building = state.buildings[tile.buildingId];
  if (!building) return { ok: false, reason: tc('core.actions.buildingNotFound') };
  if (building.companyId !== companyId) return { ok: false, reason: tc('core.actions.buildingNotYours') };

  const def = BUILDING_BY_ID[building.defId];
  const company = state.companies[companyId];
  if (company && def) company.cash += Math.round(def.cost * DEMOLISH_REFUND);

  delete state.buildings[tile.buildingId];
  tile.buildingId = null;
  return { ok: true };
}

