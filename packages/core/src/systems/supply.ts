import {
  BUILDING_BY_ID,
  GOODS,
  GOOD_BY_ID,
  TRADED_GOODS,
  getCeoModifiers,
} from '@capital/content';
import { collectEventModifiers } from './events';
import type { BuildingInstance, GameState } from '../types';

/**
 * Tedarik zinciri.
 *
 * Oyunun "emlak tycoon'u" ile "firma işletme oyunu" arasındaki farkı
 * kuran katman. Satılan her birimin artık bir maliyeti, o maliyetin bir
 * zinciri, o zincirin de bir sahibi var:
 *
 *     hammadde  →  ara mal  →  mağaza rafı  →  tüketici
 *
 * KRİTİK BASİTLEŞTİRME — şirket geneli havuz.
 * Hangi çiftliğin hangi fabrikayı beslediği diye bir soru YOK. Şirketin
 * şehirdeki tüm üretimi tek havuza girer, tüm tüketimi aynı havuzdan
 * çeker. Rota çizme, ünite kablolama, sürükle-bırak yok. Capitalism II
 * casual oyuncuyu tam olarak orada kaybediyor. Mesafeyi rota ile değil
 * dağıtım maliyetiyle modelliyoruz (bkz. `distributionRelief`).
 *
 * DENGE KISITI. Hiç üretimi olmayan şirket her birimi spot fiyattan alır
 * ve `spot(ara mal) + retailCost === basePrice × costRatio` olduğu için
 * ekonomisi zincir öncesiyle birebir aynı kalır. Zincir o maliyeti aşağı
 * çeker, tedarik krizi yukarı iter.
 */

const WAGE_PER_JOB = 42;

/** Fazla üretim satarken fiyat kırılır — hacim döken taraf sensin. */
export const SURPLUS_HAIRCUT = 0.85;

/** Depo, perakende maliyetinin bu kadarını hafifletir. */
const DISTRIBUTION_RELIEF = 0.25;

/** Arz fazlası referans hacme ulaştığında spot fiyat bu oranda düşer. */
const GLUT_DEPTH = 0.4;

/** Spot fiyat bir günde zıplamasın; oyuncu grafikte eğri görsün. */
const SPOT_SMOOTHING = 0.15;

const SPOT_FLOOR = 0.6;
const SPOT_CEILING = 1.8;

/** Ürün kimliği → 0 sözlüğü. */
export function zeroByGood(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const good of GOODS) out[good.id] = 0;
  return out;
}

/** Spot fiyatları referans değerleriyle tohumlar (yeni oyun ve migration). */
export function seedSpotPrices(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const good of GOODS) out[good.id] = good.basePrice;
  return out;
}

function wagesFor(state: GameState, building: BuildingInstance): number {
  const def = BUILDING_BY_ID[building.defId];
  if (!def) return 0;
  const district = state.districts[building.districtId];
  return def.jobs * WAGE_PER_JOB * (0.6 + (district?.incomeLevel ?? 0.5));
}

function upkeepFor(state: GameState, building: BuildingInstance): number {
  const def = BUILDING_BY_ID[building.defId];
  if (!def) return 0;
  const ceo = getCeoModifiers(state.companies[building.companyId]?.ceoId ?? null);
  return def.upkeepPerDay * ceo.upkeep;
}

/**
 * Bir outlet depo menzilinde mi?
 *
 * Mesafeyi rota çizerek değil burada modelliyoruz: deposu olmayan şirket
 * de şehir geneli havuzu kullanır, sadece birim başına daha çok dağıtım
 * öder. Mevcut `warehouse.radius = 8` mekaniği aynen korunuyor.
 */
export function distributionRelief(state: GameState, outlet: BuildingInstance): number {
  const outletTile = state.map.tiles[outlet.tileId];
  if (!outletTile) return 0;

  for (const other of Object.values(state.buildings)) {
    if (other.companyId !== outlet.companyId) continue;
    const def = BUILDING_BY_ID[other.defId];
    if (def?.role !== 'logistics') continue;

    const tile = state.map.tiles[other.tileId];
    if (!tile) continue;
    const distance = Math.abs(tile.x - outletTile.x) + Math.abs(tile.y - outletTile.y);
    if (distance <= def.radius) return DISTRIBUTION_RELIEF;
  }
  return 0;
}


/**
 * Bir outlet'in bugün kaç birim girdi çekeceğinin tahmini.
 *
 * Bugünkü satış henüz bilinmiyor (pazar bu adımdan sonra koşuyor), bu
 * yüzden dünkü satış kullanılıyor. Gecikme bir kusur değil, tasarımın
 * parçası: fazla/eksik üretim salınımı "darboğaz" durumunu anlamlı kılar.
 */
function expectedDraw(outlet: BuildingInstance): number {
  const def = BUILDING_BY_ID[outlet.defId];
  if (!def) return 0;
  return outlet.last.unitsSold > 0 ? outlet.last.unitsSold : def.capacity;
}

/** Günlük defterleri sıfırlar. Üretim ve pazar adımlarından ÖNCE koşar. */
export function resetDailyLedgers(state: GameState): void {
  for (const company of Object.values(state.companies)) {
    company.today = { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, profit: 0 };
  }

  for (const building of Object.values(state.buildings)) {
    const upkeep = upkeepFor(state, building);
    const wages = wagesFor(state, building);
    building.last = {
      unitsSold: 0,
      capacityUsed: 0,
      revenue: 0,
      cogs: 0,
      upkeep,
      wages,
      profit: -upkeep - wages,
      share: 0,
      producedUnits: 0,
      soldToMarket: 0,
    };
  }
}

interface CompanyFlow {
  /** Ürün → bugün üretilen birim. */
  produced: Record<string, number>;
  /** Ürün → bugün ihtiyaç duyulan birim (üretim girdisi + raf çekişi). */
  consumed: Record<string, number>;
  /** Ürün → kendi üretiminin ortalama birim maliyeti. */
  ownCost: Record<string, number>;
}

/**
 * Üretim adımı — pazardan ÖNCE koşar.
 *
 * Her üretim ünitesi tam kapasite çalışır. Böylece bir çiftlik asla atıl
 * kalmaz: ya kendi zincirini besler ya da fazlasını pazara satar. Aşırı
 * yatırımın cezası boş kapasite değil, düşen spot fiyattır.
 */
export function runProductionTick(state: GameState): void {
  const mods = collectEventModifiers(state);
  const buildings = Object.values(state.buildings);
  const flows: Record<string, CompanyFlow> = {};

  for (const companyId of Object.keys(state.companies)) {
    flows[companyId] = { produced: {}, consumed: {}, ownCost: {} };
  }

  // ---- 1. Talep: üretim ünitelerinin girdisi + rafların çekişi ----
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    const flow = flows[building.companyId];
    if (!def || !flow) continue;

    if (def.role === 'process' && def.outputGoodId) {
      const input = GOOD_BY_ID[def.outputGoodId]?.inputGoodId;
      if (input) flow.consumed[input] = (flow.consumed[input] ?? 0) + def.capacity;
    }

    if (def.role === 'outlet') {
      const draw = expectedDraw(building);
      const shelf = building.stocked.length > 0 ? building.stocked : [];
      for (const goodId of shelf) {
        const input = GOOD_BY_ID[goodId]?.inputGoodId;
        if (!input) continue;
        flow.consumed[input] = (flow.consumed[input] ?? 0) + draw / shelf.length;
      }
    }
  }

  // ---- 2. Üretim ve birim maliyet, kademe kademe ----
  // Sıra önemli: bir ara malın maliyeti girdisinin harmanlanmış
  // maliyetini içerir, o yüzden önce hammaddeler çözülmeli.
  for (const tier of ['raw', 'intermediate'] as const) {
    for (const good of TRADED_GOODS) {
      if (good.tier !== tier) continue;

      for (const building of buildings) {
        const def = BUILDING_BY_ID[building.defId];
        if (!def || def.outputGoodId !== good.id) continue;
        if (def.role !== 'extract' && def.role !== 'process') continue;

        const flow = flows[building.companyId];
        const company = state.companies[building.companyId];
        if (!flow || !company) continue;

        const output = def.capacity;
        if (output <= 0) continue;

        // İşleme ünitesinin girdisi: kendi havuzundan karşılanan kısmı
        // kendi maliyetiyle, kalanı spot fiyattan.
        const inputCost = good.inputGoodId ? (company.unitCost[good.inputGoodId] ?? 0) : 0;
        const operating = building.last.upkeep + building.last.wages;
        const unitCost = inputCost + operating / output;

        // Ağırlıklı ortalama: aynı ürünü üreten birden çok ünite olabilir.
        const before = flow.produced[good.id] ?? 0;
        const beforeCost = flow.ownCost[good.id] ?? 0;
        flow.produced[good.id] = before + output;
        flow.ownCost[good.id] =
          (beforeCost * before + unitCost * output) / Math.max(1, before + output);

        building.last.producedUnits = output;
      }

      // Bu ürün için her şirketin harmanlanmış birim maliyetini çöz.
      const spot = state.market.spot[good.id] ?? good.basePrice;
      for (const [companyId, flow] of Object.entries(flows)) {
        const company = state.companies[companyId];
        if (!company) continue;

        const produced = flow.produced[good.id] ?? 0;
        const consumed = flow.consumed[good.id] ?? 0;
        const internalShare = consumed > 0 ? Math.min(1, produced / consumed) : produced > 0 ? 1 : 0;
        const ownCost = flow.ownCost[good.id] ?? spot;

        company.supplyRatio[good.id] = internalShare;
        company.unitCost[good.id] = internalShare * ownCost + (1 - internalShare) * spot;
      }
    }
  }

  // ---- 3. Üretim ünitelerinin defteri ----
  // İç transfer defterlere YAZILMAZ; yoksa ciro şişer ve aynı para iki
  // kez sayılır. Gerçek para hareketi ikisi: dışarıdan alınan girdi ve
  // pazara satılan fazla.
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def?.outputGoodId) continue;
    if (def.role !== 'extract' && def.role !== 'process') continue;

    const good = GOOD_BY_ID[def.outputGoodId];
    const company = state.companies[building.companyId];
    const flow = flows[building.companyId];
    if (!good || !company || !flow) continue;

    const output = def.capacity;
    if (output <= 0) continue;

    // Girdinin dışarıdan alınan kısmı.
    if (good.inputGoodId) {
      const inputSpot =
        (state.market.spot[good.inputGoodId] ?? GOOD_BY_ID[good.inputGoodId]?.basePrice ?? 0) *
        mods.costMultiplier;
      const external = 1 - (company.supplyRatio[good.inputGoodId] ?? 0);
      const cogs = output * external * inputSpot;
      building.last.cogs += cogs;
      building.last.profit -= cogs;
      company.today.cogs += cogs;
    }

    // Şirketin bu üründeki fazlası, üreticiler arasında kapasiteye göre.
    const produced = flow.produced[good.id] ?? 0;
    const consumed = flow.consumed[good.id] ?? 0;
    const surplus = Math.max(0, produced - consumed);
    if (surplus > 0 && produced > 0) {
      const share = output / produced;
      const units = surplus * share;
      const revenue = units * (state.market.spot[good.id] ?? good.basePrice) * SURPLUS_HAIRCUT;
      building.last.soldToMarket = units;
      building.last.revenue += revenue;
      building.last.profit += revenue;
      company.today.revenue += revenue;
    }

    building.last.capacityUsed = 1;
  }

  // ---- 4. Tüketici ürünlerinin harmanlanmış maliyeti ----
  // Perakende işleme maliyeti outlet'e özeldir (depo menzili), bu yüzden
  // buradaki değer deposuz taban; pazar adımı binaya göre indirimi uygular.
  for (const good of GOODS) {
    if (good.tier !== 'consumer') continue;
    for (const company of Object.values(state.companies)) {
      const inputCost = good.inputGoodId ? (company.unitCost[good.inputGoodId] ?? 0) : 0;
      company.unitCost[good.id] = inputCost + good.retailCost;
      company.supplyRatio[good.id] = good.inputGoodId
        ? (company.supplyRatio[good.inputGoodId] ?? 0)
        : 1;
    }
  }

  // ---- 5. Şehir geneli arz/talep — yarının spot fiyatı için ----
  const produced = zeroByGood();
  const consumed = zeroByGood();
  for (const flow of Object.values(flows)) {
    for (const [goodId, units] of Object.entries(flow.produced)) {
      produced[goodId] = (produced[goodId] ?? 0) + units;
    }
    for (const [goodId, units] of Object.entries(flow.consumed)) {
      consumed[goodId] = (consumed[goodId] ?? 0) + units;
    }
  }
  state.market.produced = produced;
  state.market.consumed = consumed;
}

/**
 * Bir birim satarken şirketin cebinden GERÇEKTEN çıkan mal maliyeti.
 *
 * Kendi ürettiğin kısmın maliyeti zaten üretim ünitesinin gideri olarak
 * defterde duruyor; burada yalnızca dışarıdan alınan pay ve perakende
 * işleme sayılır. İç transfer defterlere yazılmaz — yoksa aynı para iki
 * kez sayılır ve ciro şişer.
 *
 * `relief`: deponun perakende maliyetinden sildiği pay (0..1).
 */
export function unitCogsFor(
  state: GameState,
  companyId: string,
  goodId: string,
  relief: number,
  costMultiplier: number,
): number {
  const good = GOOD_BY_ID[goodId];
  if (!good) return 0;

  const company = state.companies[companyId];
  let inputCost = 0;

  if (good.inputGoodId && company) {
    const spot =
      state.market.spot[good.inputGoodId] ?? GOOD_BY_ID[good.inputGoodId]?.basePrice ?? 0;
    const external = 1 - (company.supplyRatio[good.inputGoodId] ?? 0);
    inputCost = external * spot;
  }

  return (inputCost + good.retailCost * (1 - relief)) * costMultiplier;
}

/** Bir outlet örneği için birim maliyet; depo menzilini kendisi çözer. */
export function outletUnitCogs(
  state: GameState,
  outlet: BuildingInstance,
  goodId: string,
  costMultiplier: number,
): number {
  return unitCogsFor(
    state,
    outlet.companyId,
    goodId,
    distributionRelief(state, outlet),
    costMultiplier,
  );
}

/**
 * Yarının spot fiyatları — günün sonunda koşar.
 *
 * Fiyat yalnızca ARZ FAZLASIYLA düşer, talep artışıyla yükselmez. Sebebi
 * denge kısıtı: hiç üretimi olmayan oyuncu her zaman referans fiyattan
 * almalı, yoksa zincir eklemek onu cezalandırmış olurdu. Yukarı yönlü
 * baskı olaylardan gelir — ve olay, kendi zincirini kurmuş oyuncuyu
 * vurmaz. Tedarik krizinin oyundaki karşılığı tam olarak bu asimetri.
 */
export function runSpotPriceTick(state: GameState): void {
  const mods = collectEventModifiers(state);

  for (const good of TRADED_GOODS) {
    const reference = Math.max(1, state.market.reference[good.id] ?? 1);
    const surplus = Math.max(0, (state.market.produced[good.id] ?? 0) - (state.market.consumed[good.id] ?? 0));
    const glut = Math.min(1, surplus / reference);

    const eventMultiplier = mods.goodPrice[good.id] ?? 1;
    const target = good.basePrice * eventMultiplier * (1 - GLUT_DEPTH * glut);

    const current = state.market.spot[good.id] ?? good.basePrice;
    const next = current + (target - current) * SPOT_SMOOTHING;

    state.market.spot[good.id] = Math.max(
      good.basePrice * SPOT_FLOOR,
      Math.min(good.basePrice * SPOT_CEILING, next),
    );
  }
}
