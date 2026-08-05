import { BUILDING_BY_ID, STRUCTURE_BY_ID, getCeoModifiers } from '@capital/content';
import { LAND_SELL_RATIO, tilePrice } from './systems/city';
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
  if (!def) return { ok: false, reason: 'Bilinmeyen bina.' };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };

  if (company.netWorth < def.unlockNetWorth) {
    return {
      ok: false,
      reason: `${def.name} için ${formatShort(def.unlockNetWorth)} şirket değeri gerekiyor.`,
    };
  }
  const cost = buildCost(state, companyId, defId);
  if (company.cash < cost) {
    return { ok: false, reason: `Nakit yetersiz — ${formatShort(cost)} gerekiyor.` };
  }
  return { ok: true };
}

/** CEO pazarlığı uygulanmış inşaat maliyeti. */
export function buildCost(state: GameState, companyId: string, defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const company = state.companies[companyId];
  return Math.round(def.cost * getCeoModifiers(company?.ceoId ?? null).buildCost);
}

/** Parselin neden alınamadığını açıklar; alınabiliyorsa null döner. */
export function purchaseBlocker(state: GameState, tileId: number): string | null {
  const tile = state.map.tiles[tileId];
  if (!tile) return 'Parsel bulunamadı.';
  if (tile.kind === 'road') return 'Burası sokak — satılık değil.';
  if (tile.kind === 'civic') {
    const structure = tile.structureId ? STRUCTURE_BY_ID[tile.structureId] : null;
    return `${structure?.name ?? 'Kamu alanı'} — belediye malı, satılık değil.`;
  }
  if (tile.ownerId) {
    const owner = state.companies[tile.ownerId];
    return `Bu parsel ${owner?.name ?? 'bir rakibe'} ait.`;
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
      reason: `Parselde ${structure?.name ?? 'mevcut bir yapı'} var — sahibinden devralman gerekiyor.`,
    };
  }

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };

  const price = tilePrice(state, tileId, companyId);
  if (company.cash < price) {
    return { ok: false, reason: `Nakit yetersiz — parsel ${formatShort(price)}.` };
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
    return { ok: false, reason: 'Parsel zaten boş — doğrudan satın alabilirsin.' };
  }

  const structure = STRUCTURE_BY_ID[tile.structureId];
  if (!structure || structure.buyoutMultiplier === null) {
    return { ok: false, reason: 'Bu yapı hiçbir fiyata devredilmiyor.' };
  }

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };

  const price = tilePrice(state, tileId, companyId);
  if (company.cash < price) {
    return {
      ok: false,
      reason: `${structure.name} devralmak ${formatShort(price)} tutuyor — nakit yetersiz.`,
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
  if (!tile) return { ok: false, reason: 'Arsa bulunamadı.' };
  if (tile.ownerId !== companyId) return { ok: false, reason: 'Bu arsa sizin değil.' };
  if (tile.buildingId) return { ok: false, reason: 'Önce üzerindeki binayı yıkın.' };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };

  company.cash += Math.round(tile.landValue * LAND_SELL_RATIO);
  tile.ownerId = null;
  return { ok: true };
}

export function build(
  state: GameState,
  companyId: string,
  tileId: number,
  defId: string,
): CommandResult {
  const tile = state.map.tiles[tileId];
  if (!tile) return { ok: false, reason: 'Parsel bulunamadı.' };
  if (tile.ownerId !== companyId) return { ok: false, reason: 'Önce bu parseli satın alın.' };
  if (tile.buildingId) return { ok: false, reason: 'Parselde zaten bir bina var.' };

  const allowed = canBuild(state, companyId, defId);
  if (!allowed.ok) return allowed;

  const company = state.companies[companyId]!;

  company.cash -= buildCost(state, companyId, defId);
  const id = `b${state.nextId++}`;
  state.buildings[id] = {
    id,
    defId,
    tileId,
    districtId: tile.districtId,
    companyId,
    priceMultiplier: 1,
    autoPrice: true,
    builtDay: state.time.day,
    last: {
      unitsSold: 0,
      capacityUsed: 0,
      revenue: 0,
      cogs: 0,
      upkeep: 0,
      wages: 0,
      profit: 0,
      share: 0,
    },
  };
  tile.buildingId = id;
  return { ok: true };
}

export function demolish(state: GameState, companyId: string, tileId: number): CommandResult {
  const tile = state.map.tiles[tileId];
  if (!tile?.buildingId) return { ok: false, reason: 'Yıkılacak bina yok.' };

  const building = state.buildings[tile.buildingId];
  if (!building) return { ok: false, reason: 'Bina bulunamadı.' };
  if (building.companyId !== companyId) return { ok: false, reason: 'Bu bina sizin değil.' };

  const def = BUILDING_BY_ID[building.defId];
  const company = state.companies[companyId];
  if (company && def) company.cash += Math.round(def.cost * DEMOLISH_REFUND);

  delete state.buildings[tile.buildingId];
  tile.buildingId = null;
  return { ok: true };
}

function formatShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ₺`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}B ₺`;
  return `${Math.round(value)} ₺`;
}
