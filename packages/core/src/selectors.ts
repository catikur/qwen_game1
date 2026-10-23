import { BUILDING_BY_ID, BUILDINGS, CONSUMER_CATEGORIES, numberLocale } from '@capital/content';
import type { BuildingDef, CategoryId } from '@capital/content';
import { estimateInvestment } from './systems/market';
import type { InvestmentEstimate } from './systems/market';
import { indirectEstimate } from './systems/indirect';
import type { IndirectEstimate } from './systems/indirect';
import { tc } from './i18n';
import { formatMoney } from './format';
import type { BuildingInstance, CompanyState, DistrictState, GameState, Tile } from './types';

/**
 * UI ve render katmanının okuduğu türetilmiş veriler.
 * Hiçbiri state'i değiştirmez.
 */

export { formatMoney } from './format';

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

export function formatDate(day: number): string {
  const date = new Date(EPOCH + day * 86_400_000);
  // Takvim UTC'de: batı saat dilimlerinde tarih bir gün geride görünüyordu
  // ve ay başında dönen görev panosu (Tur 37c) çubuktaki aydan önce dönerdi.
  return date.toLocaleDateString(numberLocale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Oyun gününün takvim ayı (0 = Ocak), UTC. */
export function monthOf(day: number): number {
  return new Date(EPOCH + day * 86_400_000).getUTCMonth();
}

/** Oyun gününün takvimdeki ay günü (1..31). */
export function dayOfMonth(day: number): number {
  return new Date(EPOCH + day * 86_400_000).getUTCDate();
}

/** `day`'den SONRAKİ ilk ay başının oyun günü. */
export function nextMonthStart(day: number): number {
  const date = new Date(EPOCH + day * 86_400_000);
  return Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - EPOCH) / 86_400_000);
}

/** Oyun gününün ay adı (etkin dilde, "Mart"). */
export function monthName(day: number): string {
  const date = new Date(EPOCH + day * 86_400_000);
  return date.toLocaleDateString(numberLocale(), { month: 'long', timeZone: 'UTC' });
}

/** Haritada gösterilebilecek veri lensleri. */
export type LensId = 'none' | 'opportunity' | 'landValue' | 'competition' | 'income' | 'ownership';

export interface LensDef {
  id: LensId;
  name: string;
  hint: string;
}

/** Ad ve ipucu okundukları anda etkin dilde (alıcılar) — içe aktarımda donmuyor. */
export const LENSES: LensDef[] = [
  {
    id: 'none',
    get name() {
      return tc('core.selectors.lensNoneName');
    },
    get hint() {
      return tc('core.selectors.lensNoneHint');
    },
  },
  {
    id: 'opportunity',
    get name() {
      return tc('core.selectors.lensOpportunityName');
    },
    get hint() {
      return tc('core.selectors.lensOpportunityHint');
    },
  },
  {
    id: 'landValue',
    get name() {
      return tc('core.selectors.lensLandValueName');
    },
    get hint() {
      return tc('core.selectors.lensLandValueHint');
    },
  },
  {
    id: 'competition',
    get name() {
      return tc('core.selectors.lensCompetitionName');
    },
    get hint() {
      return tc('core.selectors.lensCompetitionHint');
    },
  },
  {
    id: 'income',
    get name() {
      return tc('core.selectors.lensIncomeName');
    },
    get hint() {
      return tc('core.selectors.lensIncomeHint');
    },
  },
  {
    id: 'ownership',
    get name() {
      return tc('core.selectors.lensOwnershipName');
    },
    get hint() {
      return tc('core.selectors.lensOwnershipHint');
    },
  },
];

/** Bir bölgenin karşılanmamış talep ORANI (0..1) — panelde "%X boş". */
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
 * Bir bölgede masada kalan MUTLAK talep (birim/gün).
 *
 * Lens bunu kullanır, oranı değil: oyunun başında her bölge %100 boştur ve
 * oran haritayı tek renk boyar — hiçbir şey söylemez. Oysa 5.800 nüfuslu
 * bir bölgedeki %100 ile 1.100 nüfuslu bir bölgedeki %100 aynı fırsat
 * değildir. Oyuncunun aradığı bilgi "nerede daha çok para var".
 */
export function districtOpportunityUnits(district: DistrictState): number {
  let units = 0;
  for (const category of CONSUMER_CATEGORIES) {
    units += (district.demand[category] ?? 0) * (district.unmet[category] ?? 0);
  }
  return units;
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
      // Mutlak karşılanmamış talebi, şehirdeki en yüksek değere göre
      // normalize et. Lensin işi bölgeleri KARŞILAŞTIRTMAK.
      let max = 0;
      for (const other of state.districts) {
        const value = districtOpportunityUnits(other);
        if (value > max) max = value;
      }
      return max > 0 ? districtOpportunityUnits(district) / max : 0;
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

export interface RankedBuildOption extends BuildOption {
  estimate: InvestmentEstimate | null;
  /**
   * Depo, Ar-Ge, pazarlama (Tur 21): karşı-olgusal günle ölçülen dolaylı
   * katkı. Sıralamaya girmiyor — sıralama parsel başına DOĞRUDAN kâr.
   */
  indirect?: IndirectEstimate | null;
  /** Bu bölgede parsel başına en çok kazandıran, inşa edilebilir seçenek. */
  bestPick: boolean;
}

/**
 * Bir bölge için yapı önerileri — PARSEL BAŞINA GETİRİYE göre sıralı.
 *
 * Kritik ayrım, ölçümle bulundu: oyunun kıt kaynağı para değil TOPRAK.
 * Sınırsız nakitle koşulan bir oyunda bile karşılanmayan talep sıfıra
 * inmiyor ve inşa denemelerinin ezici çoğunluğu "boş parsel yok" diye
 * bitiyor (`pnpm constraint`). Yani oyuncunun asıl sorusu "param en
 * hızlı nasıl geri döner" değil, "BU PARSELDEN en çok ne çıkar".
 *
 * Tur 8 haritayı bollaştırdı ama bu ölçütü DEĞİŞTİRMEDİ ve değiştirmesi
 * de gerekmiyor: bir bina hâlâ bir parsel kaplıyor, dolayısıyla parsel
 * başına getiri hâlâ doğru soru. Toprak ucuzladı, bedava olmadı —
 * abonman oranı %57 ve denge testi onu bir bantta tutuyor.
 *
 * Geri ödeme ikinci soruyu cevaplamıyor ve iki sıralama birbirinin
 * tersi çıkıyor: geri ödeme 17–41 gün aralığında neredeyse düz, ama
 * parsel başına kapasite 34 ile 1400 arasında — 41 kat fark. Geri
 * ödemeye göre seçen oyuncu kıt parselleri en verimsiz binalara
 * harcıyor.
 *
 * Ölçülen fark (1200 gün, aynı tempo ve aynı nakit disiplini, tek
 * değişken sıralama ölçütü): karşılanmayan talep %45 → %34, oyuncunun
 * net değeri 72 M ₺ → 196 M ₺.
 *
 * Bir bina bir parsel kapladığı için "parsel başına getiri" tam olarak
 * `dailyProfit`. Formül değil, doğru sütuna bakmak.
 */
export function rankedBuildOptions(state: GameState, districtId: number, tileId?: number): RankedBuildOption[] {
  const player = getPlayer(state);
  const rows: RankedBuildOption[] = buildOptions(state).map((option) => {
    const estimate = estimateInvestment(state, districtId, option.def.id, player.id, tileId);
    const row: RankedBuildOption = { ...option, estimate, bestPick: false };
    // Kilitli binada pahalı deneyi koşmaya gerek yok.
    if (estimate && !estimate.direct && option.unlocked) row.indirect = indirectEstimate(state, player.id, option.def.id, districtId, tileId);
    return row;
  });

  const score = (row: RankedBuildOption): number =>
    row.estimate?.direct ? row.estimate.dailyProfit : Number.NEGATIVE_INFINITY;

  rows.sort((a, b) => {
    // İnşa EDİLEBİLİR seçenekler önce: listenin tepesinde bugün
    // dokunamayacağın bir bina durması tavsiye değil, hayal kırıklığı.
    const buildableA = a.unlocked && a.affordable ? 1 : 0;
    const buildableB = b.unlocked && b.affordable ? 1 : 0;
    if (buildableA !== buildableB) return buildableB - buildableA;
    return score(b) - score(a);
  });

  const best = rows.find((row) => row.unlocked && row.affordable && score(row) > 0);
  if (best) best.bestPick = true;
  return rows;
}

/** Bir bölgede oyuncunun inşa edebileceği boş parsel sayısı. */
export function freePlotsIn(state: GameState, districtId: number): number {
  return state.map.tiles.filter(
    (tile) => tile.districtId === districtId && tile.kind === 'plot' && !tile.buildingId,
  ).length;
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
