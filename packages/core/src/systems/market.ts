import {
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  EVENTS,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import { zeroByCategory } from '../worldgen';
import type { BuildingInstance, GameState } from '../types';

/**
 * Pazar çözümlemesi — oyunun ekonomik kalbi.
 *
 * Her gün, her district'in her kategorisi için:
 *   1. Talep hesaplanır (nüfus × gelir × arketip ağırlığı × olay çarpanı).
 *   2. O talebe erişebilen tüm outlet'ler toplanır (kendi bölgesi tam,
 *      komşu bölgeler kısmi ağırlıkla).
 *   3. Her outlet'in çekiciliği hesaplanır: kalite, marka, fiyat esnekliği
 *      ve erişilebilirlik.
 *   4. Talep çekicilik oranında paylaştırılır, kapasite sınırı uygulanır.
 *   5. Kapasiteden taşan talep ikinci turda kalanlara dağıtılır.
 *
 * Oyuncu bu formülü bilmek zorunda değil: karşılanmamış talep bir ısı
 * lensinde renk olarak görünür, dükkânın kâr/zarar satırı da nedenini
 * kalem kalem yazar.
 */

const WAGE_PER_JOB = 42;
const WAREHOUSE_COST_BONUS = 0.88;
const FACTORY_COST_BONUS = 0.85;
/** Komşu district'ten gelen müşteri ağırlığı. */
const NEIGHBOR_ACCESS = 0.3;
const DIAGONAL_ACCESS = 0.14;

interface EventModifiers {
  demand: Record<CategoryId, number>;
  /** Sadece belirli arketipe uygulanan çarpanlar. */
  archetypeDemand: Array<{ archetype: string; multipliers: Partial<Record<CategoryId, number>> }>;
  costMultiplier: number;
  landValueDrift: number;
}

export function collectEventModifiers(state: GameState): EventModifiers {
  const demand = zeroByCategory();
  for (const key of Object.keys(demand) as CategoryId[]) demand[key] = 1;

  const mods: EventModifiers = {
    demand,
    archetypeDemand: [],
    costMultiplier: 1,
    landValueDrift: 0,
  };

  for (const active of state.activeEvents) {
    const def = EVENTS.find((e) => e.id === active.defId);
    if (!def) continue;

    if (def.effects.costMultiplier) mods.costMultiplier *= def.effects.costMultiplier;
    if (def.effects.landValueDrift) mods.landValueDrift += def.effects.landValueDrift;

    if (def.effects.demandMultiplier) {
      if (def.effects.districtArchetype) {
        mods.archetypeDemand.push({
          archetype: def.effects.districtArchetype,
          multipliers: def.effects.demandMultiplier,
        });
      } else {
        for (const [cat, mult] of Object.entries(def.effects.demandMultiplier)) {
          mods.demand[cat as CategoryId] *= mult as number;
        }
      }
    }
  }

  return mods;
}

/** İki district arasındaki erişim ağırlığı (aynı = 1, komşu = kısmi). */
function accessWeight(state: GameState, fromDistrict: number, toDistrict: number): number {
  if (fromDistrict === toDistrict) return 1;

  const cols = Math.round(state.map.width / 8);
  const ax = fromDistrict % cols;
  const ay = Math.floor(fromDistrict / cols);
  const bx = toDistrict % cols;
  const by = Math.floor(toDistrict / cols);
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);

  if (dx <= 1 && dy <= 1) return dx === 1 && dy === 1 ? DIAGONAL_ACCESS : NEIGHBOR_ACCESS;
  return 0;
}

function tileOf(state: GameState, tileId: number) {
  return state.map.tiles[tileId];
}

/** Bir outlet'in maliyet çarpanı: kendi depo/fabrikası menzilindeyse düşer. */
function costModifierFor(state: GameState, outlet: BuildingInstance): number {
  const outletTile = tileOf(state, outlet.tileId);
  if (!outletTile) return 1;

  let modifier = 1;
  let hasWarehouse = false;
  let hasFactory = false;

  for (const other of Object.values(state.buildings)) {
    if (other.companyId !== outlet.companyId) continue;
    const def = BUILDING_BY_ID[other.defId];
    if (!def || (def.role !== 'logistics' && def.role !== 'production')) continue;

    const tile = tileOf(state, other.tileId);
    if (!tile) continue;
    const distance = Math.abs(tile.x - outletTile.x) + Math.abs(tile.y - outletTile.y);
    if (distance > def.radius) continue;

    if (def.role === 'logistics') hasWarehouse = true;
    if (def.role === 'production') hasFactory = true;
  }

  if (hasWarehouse) modifier *= WAREHOUSE_COST_BONUS;
  if (hasFactory) modifier *= FACTORY_COST_BONUS;
  return modifier;
}

/**
 * Otomatik fiyatlama — "casual" varsayılan.
 *
 * Bölgede talep karşılanmıyorsa fiyatı yukarı, arz fazlaysa aşağı iter.
 * Oyuncu isterse manuel fiyata geçip bu davranışı devralabilir.
 */
function autoPriceMultiplier(unmetRatio: number, competitors: number): number {
  const scarcity = 1 + unmetRatio * 0.5;
  const crowding = 1 - Math.min(0.1, competitors * 0.02);
  // Taban 0.95: otomatik fiyat asla marjı eritecek kadar kırmaz. Fiyat
  // savaşı bilinçli bir tercih olmalı, varsayılan davranış değil.
  return Math.max(0.95, Math.min(1.4, scarcity * crowding));
}

export interface InvestmentEstimate {
  /** Doğrudan gelir üretmeyen binalarda false. */
  direct: boolean;
  expectedUnits: number;
  utilisation: number;
  revenue: number;
  cogs: number;
  fixedCosts: number;
  dailyProfit: number;
  /** Gün cinsinden geri ödeme; kâr negatifse Infinity. */
  paybackDays: number;
}

/**
 * Bir binanın belirli bir district'te ne kazandıracağının tahmini.
 *
 * Aynı fonksiyonu hem yapı menüsü (oyuncuya "≈ 82 gün geri ödeme" yazar)
 * hem de NPC yapay zekâsı kullanır. Böylece oyuncuya gösterilen tahmin ile
 * rakibin kararı aynı matematikten çıkar.
 */
export function estimateInvestment(
  state: GameState,
  districtId: number,
  defId: string,
  companyId: string,
): InvestmentEstimate | null {
  const def = BUILDING_BY_ID[defId];
  const district = state.districts[districtId];
  const company = state.companies[companyId];
  if (!def || !district || !company) return null;

  const category = CATEGORIES[def.category];
  const wages = def.jobs * WAGE_PER_JOB * (0.6 + district.incomeLevel);
  const fixedCosts = def.upkeepPerDay + wages;

  if (def.role === 'logistics' || def.role === 'production') {
    return {
      direct: false,
      expectedUnits: 0,
      utilisation: 0,
      revenue: 0,
      cogs: 0,
      fixedCosts,
      dailyProfit: -fixedCosts,
      paybackDays: Infinity,
    };
  }

  if (def.role === 'rental') {
    let rivalCapacity = def.capacity;
    for (const other of Object.values(state.buildings)) {
      if (other.districtId !== districtId) continue;
      const otherDef = BUILDING_BY_ID[other.defId];
      if (otherDef?.role === 'rental' && otherDef.category === def.category) {
        rivalCapacity += otherDef.capacity;
      }
    }
    const absorbable = district.population * 0.06 + 40;
    const pressure = Math.min(1, rivalCapacity / Math.max(1, absorbable));
    const occupancy = Math.max(
      0.15,
      Math.min(1, 0.55 + 0.5 * district.incomeLevel - 0.4 * pressure),
    );
    const revenue = def.capacity * occupancy * category.basePrice;
    const cogs = revenue * category.costRatio;
    const dailyProfit = revenue - cogs - fixedCosts;
    return {
      direct: true,
      expectedUnits: def.capacity * occupancy,
      utilisation: occupancy,
      revenue,
      cogs,
      fixedCosts,
      dailyProfit,
      paybackDays: dailyProfit > 0 ? def.cost / dailyProfit : Infinity,
    };
  }

  // Outlet: mevcut rakiplere karşı beklenen pazar payı.
  // Fiyat, motorun uygulayacağı otomatik fiyatın aynısıyla hesaplanır;
  // aksi halde tahmin sistematik olarak gerçeğin altında kalır.
  const priceMultiplier = autoPriceMultiplier(
    district.unmet[def.category] ?? 0,
    district.outletCount[def.category] ?? 0,
  );
  const salePrice = category.basePrice * priceMultiplier;

  const brand = 0.45 + 0.55 * (company.brand[def.category] ?? 0);
  const selfAttractiveness =
    Math.pow(Math.max(0.05, def.quality), 1.15) *
    brand *
    Math.pow(1 / priceMultiplier, category.elasticity);

  let rivalAttractiveness = 0;
  for (const other of Object.values(state.buildings)) {
    if (other.districtId !== districtId) continue;
    const otherDef = BUILDING_BY_ID[other.defId];
    if (!otherDef || otherDef.role !== 'outlet' || otherDef.category !== def.category) continue;

    const otherCompany = state.companies[other.companyId];
    const otherBrand = 0.45 + 0.55 * (otherCompany?.brand[def.category] ?? 0);
    const priceFactor = Math.pow(1 / other.priceMultiplier, category.elasticity);
    rivalAttractiveness += Math.pow(Math.max(0.05, otherDef.quality), 1.15) * otherBrand * priceFactor;
  }

  const share = selfAttractiveness / (selfAttractiveness + rivalAttractiveness);
  // Komşu bölgelerden de müşteri gelir; bunu görmezden gelmek tahmini düşürür.
  const ownDemand = district.demand[def.category] || estimateBaselineDemand(district, def.category);
  const spillover = neighbourDemand(state, districtId, def.category);
  const expectedUnits = Math.min(def.capacity, (ownDemand + spillover) * share);

  const revenue = expectedUnits * salePrice;
  const cogs = expectedUnits * category.basePrice * category.costRatio;
  const dailyProfit = revenue - cogs - fixedCosts;

  return {
    direct: true,
    expectedUnits,
    utilisation: def.capacity > 0 ? expectedUnits / def.capacity : 0,
    revenue,
    cogs,
    fixedCosts,
    dailyProfit,
    paybackDays: dailyProfit > 0 ? def.cost / dailyProfit : Infinity,
  };
}

/** Komşu district'lerden erişim ağırlığıyla gelen ek talep. */
function neighbourDemand(state: GameState, districtId: number, categoryId: CategoryId): number {
  let total = 0;
  for (const other of state.districts) {
    if (other.id === districtId) continue;
    const access = accessWeight(state, other.id, districtId);
    if (access <= 0) continue;
    const demand = other.demand[categoryId] || estimateBaselineDemand(other, categoryId);
    total += demand * access;
  }
  return total;
}

/** Henüz hiç tick koşmadıysa talep 0 görünür; kaba bir taban üret. */
function estimateBaselineDemand(
  district: { population: number; incomeLevel: number; archetype: string },
  categoryId: CategoryId,
): number {
  const category = CATEGORIES[categoryId];
  const archetype = DISTRICT_ARCHETYPES[district.archetype as keyof typeof DISTRICT_ARCHETYPES];
  const weight = archetype?.demandWeights[categoryId] ?? 1;
  const incomeFactor = 1 + (district.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
  return district.population * category.demandPerCapita * weight * Math.max(0.2, incomeFactor);
}

/**
 * Otomatik fiyatları bir önceki günün sinyallerine göre günceller.
 * Manuel fiyata geçmiş binalara dokunmaz.
 */
function applyAutoPricing(state: GameState): void {
  for (const building of Object.values(state.buildings)) {
    if (!building.autoPrice) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'outlet') continue;

    const district = state.districts[building.districtId];
    if (!district) continue;

    const target = autoPriceMultiplier(
      district.unmet[def.category] ?? 0,
      district.outletCount[def.category] ?? 0,
    );
    // Fiyat bir günde zıplamasın; oyuncu grafikte anlamlı bir eğri görsün.
    building.priceMultiplier += (target - building.priceMultiplier) * 0.25;
  }
}

export function runMarketTick(state: GameState): void {
  applyAutoPricing(state);

  const mods = collectEventModifiers(state);
  const buildings = Object.values(state.buildings);

  // Şirket defterlerini sıfırla.
  for (const company of Object.values(state.companies)) {
    company.today = { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, profit: 0 };
  }

  // Outlet'leri district+kategori kırılımıyla indeksle.
  const outletsByDistrict = new Map<number, BuildingInstance[]>();
  const costModifiers = new Map<string, number>();

  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;

    // Sabit giderler her binada işler, satış olsun olmasın.
    const district = state.districts[building.districtId];
    const wages = def.jobs * WAGE_PER_JOB * (0.6 + (district?.incomeLevel ?? 0.5));
    building.last = {
      unitsSold: 0,
      capacityUsed: 0,
      revenue: 0,
      cogs: 0,
      upkeep: def.upkeepPerDay,
      wages,
      profit: -def.upkeepPerDay - wages,
      share: 0,
    };

    if (def.role === 'outlet') {
      const list = outletsByDistrict.get(building.districtId) ?? [];
      list.push(building);
      outletsByDistrict.set(building.districtId, list);
      costModifiers.set(building.id, costModifierFor(state, building));
    }
  }

  // Şehir geneli pazar payı için birikimler.
  const soldByCompanyCategory = new Map<string, number>();
  const soldByCategory = zeroByCategory();

  for (const district of state.districts) {
    const archetype = DISTRICT_ARCHETYPES[district.archetype];
    district.outletCount = zeroByCategory();

    for (const categoryId of CONSUMER_CATEGORIES) {
      const category = CATEGORIES[categoryId];

      // ---- 1. Talep ----
      const weight = archetype.demandWeights[categoryId] ?? 1;
      const incomeFactor =
        1 + (district.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
      let eventMultiplier = mods.demand[categoryId];
      for (const entry of mods.archetypeDemand) {
        if (entry.archetype === district.archetype) {
          eventMultiplier *= entry.multipliers[categoryId] ?? 1;
        }
      }

      const demandUnits = Math.max(
        0,
        district.population *
          category.demandPerCapita *
          weight *
          Math.max(0.2, incomeFactor) *
          eventMultiplier,
      );
      district.demand[categoryId] = demandUnits;

      // ---- 2. Bu talebe erişebilen outlet'ler ----
      interface Candidate {
        building: BuildingInstance;
        price: number;
        attractiveness: number;
        capacityLeft: number;
      }
      const candidates: Candidate[] = [];

      for (const [sourceDistrictId, list] of outletsByDistrict) {
        const access = accessWeight(state, district.id, sourceDistrictId);
        if (access <= 0) continue;

        for (const building of list) {
          const def = BUILDING_BY_ID[building.defId]!;
          if (def.category !== categoryId) continue;

          if (sourceDistrictId === district.id) district.outletCount[categoryId] += 1;

          const company = state.companies[building.companyId];
          if (!company) continue;

          // ---- 3. Çekicilik ----
          const price = category.basePrice * building.priceMultiplier;
          const priceFactor = Math.pow(category.basePrice / price, category.elasticity);
          const brand = 0.45 + 0.55 * (company.brand[categoryId] ?? 0);
          const quality = Math.pow(Math.max(0.05, def.quality), 1.15);
          const capacityLeft = Math.max(0, def.capacity - building.last.unitsSold);

          if (capacityLeft <= 0) continue;

          candidates.push({
            building,
            price,
            attractiveness: quality * brand * priceFactor * access,
            capacityLeft,
          });
        }
      }

      if (candidates.length === 0) {
        district.unmet[categoryId] = demandUnits > 0 ? 1 : 0;
        district.priceIndex[categoryId] = 1;
        continue;
      }

      // ---- 4-5. Payları dağıt, kapasiteyi uygula, artanı yeniden dağıt ----
      let remaining = demandUnits;
      const soldHere = new Map<string, number>();

      for (let pass = 0; pass < 2 && remaining > 0.01; pass++) {
        const open = candidates.filter((c) => c.capacityLeft > 0.01);
        if (open.length === 0) break;

        let totalAttractiveness = 0;
        for (const c of open) totalAttractiveness += c.attractiveness;
        if (totalAttractiveness <= 0) break;

        let consumed = 0;
        for (const c of open) {
          const wanted = remaining * (c.attractiveness / totalAttractiveness);
          const sold = Math.min(wanted, c.capacityLeft);
          if (sold <= 0) continue;

          c.capacityLeft -= sold;
          consumed += sold;
          soldHere.set(c.building.id, (soldHere.get(c.building.id) ?? 0) + sold);
        }

        remaining -= consumed;
        if (consumed <= 0.01) break;
      }

      const servedUnits = demandUnits - remaining;
      district.unmet[categoryId] = demandUnits > 0 ? remaining / demandUnits : 0;

      // ---- Defterleri işle ----
      let priceSum = 0;
      let priceWeight = 0;

      for (const candidate of candidates) {
        const units = soldHere.get(candidate.building.id) ?? 0;
        if (units <= 0) continue;

        const building = candidate.building;
        const def = BUILDING_BY_ID[building.defId]!;
        const company = state.companies[building.companyId]!;
        const costModifier = costModifiers.get(building.id) ?? 1;

        const revenue = units * candidate.price;
        const cogs =
          units * category.basePrice * category.costRatio * costModifier * mods.costMultiplier;

        building.last.unitsSold += units;
        building.last.revenue += revenue;
        building.last.cogs += cogs;
        building.last.profit += revenue - cogs;
        building.last.capacityUsed = def.capacity > 0 ? building.last.unitsSold / def.capacity : 0;
        building.last.share = servedUnits > 0 ? units / servedUnits : 0;

        company.today.revenue += revenue;
        company.today.cogs += cogs;

        const key = `${building.companyId}|${categoryId}`;
        soldByCompanyCategory.set(key, (soldByCompanyCategory.get(key) ?? 0) + units);
        soldByCategory[categoryId] += units;

        priceSum += candidate.price * units;
        priceWeight += units;
      }

      district.priceIndex[categoryId] =
        priceWeight > 0 ? priceSum / priceWeight / category.basePrice : 1;
    }
  }

  // ---- Kira üreten binalar ----
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'rental') continue;

    const district = state.districts[building.districtId];
    const company = state.companies[building.companyId];
    if (!district || !company) continue;

    const category = CATEGORIES[def.category];
    // Aynı bölgede ne kadar çok kiralık varsa doluluk o kadar düşer.
    const rivalCapacity = buildings.reduce((total, other) => {
      if (other.districtId !== building.districtId) return total;
      const otherDef = BUILDING_BY_ID[other.defId];
      if (!otherDef || otherDef.role !== 'rental' || otherDef.category !== def.category) {
        return total;
      }
      return total + otherDef.capacity;
    }, 0);

    const absorbable = district.population * 0.06 + 40;
    const pressure = Math.min(1, rivalCapacity / Math.max(1, absorbable));
    const occupancy = Math.max(
      0.15,
      Math.min(1, 0.55 + 0.5 * district.incomeLevel - 0.4 * pressure),
    );

    // basePrice = birim başına günlük kira; kapasite = kiralanabilir birim.
    const revenue = def.capacity * occupancy * category.basePrice;
    const cogs = revenue * category.costRatio * mods.costMultiplier;

    building.last.unitsSold = def.capacity * occupancy;
    building.last.capacityUsed = occupancy;
    building.last.revenue = revenue;
    building.last.cogs = cogs;
    building.last.profit += revenue - cogs;
    building.last.share = occupancy;

    company.today.revenue += revenue;
    company.today.cogs += cogs;

    // Konut, bölgenin nüfusunu büyütür: kendi müşterini üretme döngüsü.
    if (def.category === 'housing') {
      const archetype = DISTRICT_ARCHETYPES[district.archetype];
      const ceiling = archetype.population * 2.4;
      if (district.population < ceiling) {
        district.population = Math.min(ceiling, district.population + def.capacity * occupancy * 0.02);
      }
    }
  }

  // ---- Şirket toplamları, marka ve pazar payı ----
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    const company = state.companies[building.companyId];
    if (!def || !company) continue;
    company.today.upkeep += building.last.upkeep;
    company.today.wages += building.last.wages;
  }

  for (const company of Object.values(state.companies)) {
    for (const categoryId of CONSUMER_CATEGORIES) {
      const total = soldByCategory[categoryId];
      const own = soldByCompanyCategory.get(`${company.id}|${categoryId}`) ?? 0;
      const share = total > 0 ? own / total : 0;
      company.marketShare[categoryId] = share;

      // Marka payı takip eder ama yavaş: bir günde zirveye çıkılmaz.
      const target = Math.min(1, share * 1.15);
      company.brand[categoryId] += (target - company.brand[categoryId]) * 0.035;
      company.brand[categoryId] = Math.max(0.05, Math.min(1, company.brand[categoryId]));
    }

    if (company.debt > 0) company.today.interest = (company.debt * 0.08) / 365;

    company.today.profit =
      company.today.revenue -
      company.today.cogs -
      company.today.upkeep -
      company.today.wages -
      company.today.interest;

    company.cash += company.today.profit;
  }
}
