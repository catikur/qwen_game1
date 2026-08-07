import {
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  GOOD_BY_ID,
  getCeoModifiers,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import {
  defaultShelf,
  estimateBaselineDemand,
  goodShares,
  shelfReach,
  zeroByCategory,
} from './demand';
import { collectEventModifiers } from './events';
import { marketingLeverage } from './focus';
import { SURPLUS_HAIRCUT, distributionRelief, unitCogsFor } from './supply';
import type { BuildingInstance, GameState } from '../types';

/**
 * Pazar çözümlemesi — oyunun ekonomik kalbi.
 *
 * Her gün, her district'in her ürünü için:
 *   1. Talep hesaplanır (nüfus × gelir × arketip ağırlığı × olay çarpanı).
 *   2. O talebe erişebilen, ürünü rafında taşıyan outlet'ler toplanır
 *      (kendi bölgesi tam, komşu bölgeler kısmi ağırlıkla).
 *   3. Her outlet'in çekiciliği hesaplanır: kalite, marka, fiyat esnekliği
 *      ve erişilebilirlik.
 *   4. Talep çekicilik oranında paylaştırılır, kapasite sınırı uygulanır.
 *   5. Kapasiteden taşan talep ikinci turda kalanlara dağıtılır.
 *
 * Satış maliyeti artık sabit bir orandan gelmiyor: tedarik zincirinden
 * geliyor (`systems/supply.ts`). Zincirini kuran oyuncu aynı ürünü
 * rakibinden ucuza satabilir — fiyat savaşının tabanı budur.
 *
 * Oyuncu bu formülü bilmek zorunda değil: karşılanmamış talep bir ısı
 * lensinde renk olarak görünür, dükkânın kâr/zarar satırı da nedenini
 * kalem kalem yazar.
 */

const WAGE_PER_JOB = 42;

/** Komşu district'ten gelen müşteri ağırlığı. */
const NEIGHBOR_ACCESS = 0.3;
const DIAGONAL_ACCESS = 0.14;

/**
 * Bir binanın gerçek kalitesi.
 *
 * Üç toplamsal kaynak: bina tanımı, CEO'nun sektör primi ve şirketin o
 * kategoride biriktirdiği Ar-Ge. Üçü de toplamsal olduğu için Ar-Ge
 * merkezi kurmayan bir şirkette formül Tur 1'deki haline indirgeniyor.
 */
function qualityFor(state: GameState, companyId: string, defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const company = state.companies[companyId];
  const ceo = getCeoModifiers(company?.ceoId ?? null);
  const bonus = ceo.categoryQuality?.category === def.category ? ceo.categoryQuality.bonus : 0;
  const research = company?.research[def.category] ?? 0;
  return Math.max(0.05, Math.min(1, def.quality + bonus + research));
}

function upkeepFor(state: GameState, companyId: string, defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  return def.upkeepPerDay * getCeoModifiers(state.companies[companyId]?.ceoId ?? null).upkeep;
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

/**
 * Bir şirketin bir kategorideki "prim gücü": Ar-Ge primi + pazarlama
 * kaldıracı. Hiçbirine yatırım yapmamışsa TAM SIFIR.
 */
function premiumEdge(state: GameState, companyId: string, categoryId: CategoryId): number {
  const company = state.companies[companyId];
  if (!company) return 0;
  return (company.research[categoryId] ?? 0) + marketingLeverage(state, companyId, categoryId);
}

/**
 * Otomatik fiyatlama — "casual" varsayılan.
 *
 * Bölgede talep karşılanmıyorsa fiyatı yukarı, arz fazlaysa aşağı iter.
 * Oyuncu isterse manuel fiyata geçip bu davranışı devralabilir.
 *
 * ---- Neden `edge` diye ikinci bir kanal var ----
 *
 * Kalite ve marka, çekicilik formülünde talebi paylaştırıyor. Ama ÖLÇÜM
 * şunu gösterdi: bu şehirde talep kronik olarak kapasiteyi aşıyor
 * (400. günde bile boş talep %19–40), yani herkes zaten kapasitesinin
 * tamamını satıyor ve pay yarışı hiç yaşanmıyor. Şehre 40 süpermarket
 * dikildiğinde bile tam Ar-Ge primi hacme yalnızca **+%3,4** ekliyordu;
 * 24 süpermarketle +%0,7.
 *
 * Yani kaliteyi sadece paya bağlamak, oyuncunun fark edemeyeceği bir
 * mekanik demekti. Arz-kıt bir pazarda kalitenin gerçek karşılığı zaten
 * hacim değil FİYATTIR: malın kapış kapış gidiyorsa, daha iyi olanı daha
 * pahalıya satarsın.
 *
 * `edge` tam olarak bunu yapıyor ve kıtlıkla ÇARPILIYOR:
 *   - Bölgede boş talep yoksa prim de yok — orada yarış paya döner,
 *     kalite kendi asıl kanalından (çekicilik) çalışır.
 *   - Boş talep yüksekse prim büyür — kalite marj olarak ödenir.
 *
 * `edge = 0` olduğunda formül Tur 1'deki haline BİREBİR indirgeniyor;
 * denge kimliği bozulmuyor.
 */
function autoPriceMultiplier(unmetRatio: number, competitors: number, edge = 0): number {
  const scarcity = 1 + unmetRatio * 0.5 * (1 + edge * 1.8);
  const crowding = 1 - Math.min(0.1, competitors * 0.02);
  // Taban 0.95: otomatik fiyat asla marjı eritecek kadar kırmaz. Fiyat
  // savaşı bilinçli bir tercih olmalı, varsayılan davranış değil.
  return Math.max(0.95, Math.min(1.4 + edge * 0.3, scarcity * crowding));
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

/** Bir şirketin bir üründe bugünkü üretim ve tüketim hacmi. */
function companyFlow(
  state: GameState,
  companyId: string,
  goodId: string,
): { produced: number; consumed: number } {
  let produced = 0;
  let consumed = 0;

  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;

    if (def.outputGoodId === goodId) produced += def.capacity;

    if (def.role === 'process' && def.outputGoodId) {
      if (GOOD_BY_ID[def.outputGoodId]?.inputGoodId === goodId) consumed += def.capacity;
    }
    if (def.role === 'outlet') {
      const draw = building.last.unitsSold > 0 ? building.last.unitsSold : def.capacity;
      const shelf = building.stocked;
      for (const stockedId of shelf) {
        if (GOOD_BY_ID[stockedId]?.inputGoodId === goodId) consumed += draw / shelf.length;
      }
    }
  }

  return { produced, consumed };
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
  const fixedCosts = upkeepFor(state, companyId, defId) + wages;
  // Geri ödeme, oyuncunun gerçekten ödeyeceği maliyete göre hesaplanır.
  const investmentCost = def.cost * getCeoModifiers(company.ceoId).buildCost;

  // ---- Üretim üniteleri: değeri kârda değil, TASARRUFTA ----
  // Bir fabrika kendi başına para basmaz; ürünü pazardan almak yerine
  // kendin ürettiğin için birim maliyetini düşürür. Fazlası pazara
  // satılır ama hacim döken taraf sen olduğun için fiyat kırılır.
  if (def.role === 'extract' || def.role === 'process') {
    const good = def.outputGoodId ? GOOD_BY_ID[def.outputGoodId] : undefined;
    if (!good || def.capacity <= 0) {
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

    const output = def.capacity;
    const spot = state.market.spot[good.id] ?? good.basePrice;

    // Girdinin marjinal maliyeti: kendi üretiminde fazlan varsa kendi
    // maliyetin, yoksa pazardan alacağın için spot fiyat.
    let inputCost = 0;
    if (good.inputGoodId) {
      const input = companyFlow(state, companyId, good.inputGoodId);
      const inputSpot =
        state.market.spot[good.inputGoodId] ?? GOOD_BY_ID[good.inputGoodId]?.basePrice ?? 0;
      inputCost =
        input.produced > input.consumed
          ? (company.unitCost[good.inputGoodId] ?? inputSpot)
          : inputSpot;
    }

    const flow = companyFlow(state, companyId, good.id);
    const uncovered = Math.max(0, flow.consumed - flow.produced);
    const internalUnits = Math.min(output, uncovered);
    const surplusUnits = output - internalUnits;

    const revenue = internalUnits * spot + surplusUnits * spot * SURPLUS_HAIRCUT;
    const cogs = output * inputCost;
    const dailyProfit = revenue - cogs - fixedCosts;

    return {
      direct: true,
      expectedUnits: output,
      utilisation: 1,
      revenue,
      cogs,
      fixedCosts,
      dailyProfit,
      paybackDays: dailyProfit > 0 ? investmentCost / dailyProfit : Infinity,
    };
  }

  // ---- Depo, Ar-Ge, pazarlama: değeri kendi defterinde görünmez ----
  //
  // Üçü de doğrudan gelir üretmez; katkıları BAŞKA binaların satırına
  // dağılır. Buraya uydurma bir "beklenen kâr" yazmak yerine dürüst
  // davranıyoruz: `direct: false` diyoruz ve gerçek değerlendirmeyi
  // rekabet kartına bırakıyoruz — tıpkı zincirde deponun yaptığı gibi.
  if (def.role === 'logistics' || def.role === 'research' || def.role === 'marketing') {
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
      paybackDays: dailyProfit > 0 ? investmentCost / dailyProfit : Infinity,
    };
  }

  // Outlet: mevcut rakiplere karşı beklenen pazar payı.
  // Fiyat, motorun uygulayacağı otomatik fiyatın aynısıyla hesaplanır;
  // aksi halde tahmin sistematik olarak gerçeğin altında kalır.
  const priceMultiplier = autoPriceMultiplier(
    district.unmet[def.category] ?? 0,
    district.outletCount[def.category] ?? 0,
    premiumEdge(state, companyId, def.category),
  );
  const salePrice = category.basePrice * priceMultiplier;

  const brand = 0.45 + 0.55 * (company.brand[def.category] ?? 0);
  const selfAttractiveness =
    Math.pow(qualityFor(state, companyId, defId), 1.15) *
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
    rivalAttractiveness +=
      Math.pow(qualityFor(state, other.companyId, other.defId), 1.15) * otherBrand * priceFactor;
  }

  const share = selfAttractiveness / (selfAttractiveness + rivalAttractiveness);
  // Komşu bölgelerden de müşteri gelir; bunu görmezden gelmek tahmini düşürür.
  const ownDemand = district.demand[def.category] || estimateBaselineDemand(district, def.category);
  const spillover = neighbourDemand(state, districtId, def.category);

  // Outlet yalnızca RAFINDAKİ ürünlerin talebine erişir. Tek yuvalı bir
  // bakkal kategorinin tamamını değil, taşıdığı ürünün payını yakalar;
  // bunu saymamak küçük dükkânların gelirini sistematik olarak şişirirdi.
  const shelf = defaultShelf(district.archetype, def.category, def.slots ?? 1);
  const reach = shelfReach(district.archetype, def.category, shelf);
  const expectedUnits = Math.min(def.capacity, (ownDemand + spillover) * reach * share);

  // Birim maliyet zincirden geliyor. Yeni bina için depo indirimi
  // varsayılmaz — tahmin temkinli olsun.
  const goodId = shelf[0];
  const unitCogs = goodId ? unitCogsFor(state, companyId, goodId, 0, 1) : 0;

  const revenue = expectedUnits * salePrice;
  const cogs = expectedUnits * unitCogs;
  const dailyProfit = revenue - cogs - fixedCosts;

  return {
    direct: true,
    expectedUnits,
    utilisation: def.capacity > 0 ? expectedUnits / def.capacity : 0,
    revenue,
    cogs,
    fixedCosts,
    dailyProfit,
    paybackDays: dailyProfit > 0 ? investmentCost / dailyProfit : Infinity,
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
      premiumEdge(state, building.companyId, def.category),
    );
    // Fiyat bir günde zıplamasın; oyuncu grafikte anlamlı bir eğri görsün.
    building.priceMultiplier += (target - building.priceMultiplier) * 0.25;
  }
}

/**
 * Tüketici pazarı.
 *
 * Defterler `resetDailyLedgers` ile sıfırlanmış, üretim `runProductionTick`
 * ile çözülmüş olarak gelir — bu adım yalnızca satışı yapar.
 */
export function runMarketTick(state: GameState): void {
  applyAutoPricing(state);

  const mods = collectEventModifiers(state);
  const buildings = Object.values(state.buildings);

  // Outlet'leri district kırılımıyla indeksle ve rakip sayacını kur.
  // Depo indirimi outlet başına bir kez çözülür; iç döngüde tekrar
  // hesaplamak günlük maliyeti kare kadar büyütürdü.
  const outletsByDistrict = new Map<number, BuildingInstance[]>();
  const reliefByOutlet = new Map<string, number>();
  for (const district of state.districts) district.outletCount = zeroByCategory();

  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;

    const list = outletsByDistrict.get(building.districtId) ?? [];
    list.push(building);
    outletsByDistrict.set(building.districtId, list);
    reliefByOutlet.set(building.id, distributionRelief(state, building));

    const district = state.districts[building.districtId];
    if (district) district.outletCount[def.category] += 1;
  }

  // Şehir geneli pazar payı için birikimler.
  const soldByCompanyCategory = new Map<string, number>();
  const soldByCategory = zeroByCategory();

  // ---- 1. Talep: outlet'lerden BAĞIMSIZ, tek geçişte ----
  // Talep yalnızca bölgenin kendi durumuna ve olaylara bağlı, o yüzden
  // dağıtımdan önce tamamı hesaplanabilir. Bu ayrım bir sonraki adımın
  // ön koşulu.
  for (const district of state.districts) {
    const archetype = DISTRICT_ARCHETYPES[district.archetype];
    for (const categoryId of CONSUMER_CATEGORIES) {
      const category = CATEGORIES[categoryId];
      const weight = archetype.demandWeights[categoryId] ?? 1;
      const incomeFactor =
        1 + (district.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
      let eventMultiplier = mods.demand[categoryId] ?? 1;
      for (const entry of mods.archetypeDemand) {
        if (entry.archetype === district.archetype) {
          eventMultiplier *= entry.multipliers[categoryId] ?? 1;
        }
      }
      district.demand[categoryId] = Math.max(
        0,
        district.population *
          category.demandPerCapita *
          weight *
          Math.max(0.2, incomeFactor) *
          eventMultiplier,
      );
    }
  }

  /**
   * ---- 2. Kapasite bütçesi: bölgelere ORANTILI ----
   *
   * Bir outlet komşu bölgelere de satar. Kapasiteyi bölgeleri sırayla
   * gezerek harcarsak, hangi bölgenin doyacağını haritadaki INDEKS SIRASI
   * belirler: kendi mahallesindeki süpermarket tüm kapasitesini önce
   * işlenen komşuya satıp kendi bölgesini "%100 boş" bırakabiliyordu.
   *
   * Bunun yerine her outlet, kapasitesini erişebildiği bölgelere o
   * bölgelerin talep ağırlığı oranında ayırır. Sonuç sıradan bağımsız.
   */
  const budgetByOutlet = new Map<string, Map<number, number>>();
  for (const [sourceDistrictId, list] of outletsByDistrict) {
    for (const building of list) {
      const def = BUILDING_BY_ID[building.defId]!;
      const pulls = new Map<number, number>();
      let total = 0;

      for (const district of state.districts) {
        const access = accessWeight(state, district.id, sourceDistrictId);
        if (access <= 0) continue;
        const reach = shelfReach(district.archetype, def.category, building.stocked);
        const pull = (district.demand[def.category] ?? 0) * reach * access;
        if (pull <= 0) continue;
        pulls.set(district.id, pull);
        total += pull;
      }

      const budget = new Map<number, number>();
      for (const [districtId, pull] of pulls) {
        budget.set(districtId, def.capacity * (pull / total));
      }
      budgetByOutlet.set(building.id, budget);
    }
  }

  // Bir outlet'in kendi bölgesindeki kategori payı için birikim.
  const ownDistrictUnits = new Map<string, number>();
  const servedByDistrictCategory = new Map<string, number>();

  // ---- 3. Dağıtım ----
  for (const district of state.districts) {
    for (const categoryId of CONSUMER_CATEGORIES) {
      const category = CATEGORIES[categoryId];
      const demandUnits = district.demand[categoryId] ?? 0;

      let unservedTotal = 0;
      let priceSum = 0;
      let priceWeight = 0;

      // Aynı kategoride birden çok ürün olabilir; her biri kendi talep
      // payı için ayrı yarışır. Pay bölgeye göre değişir — ekmek orta
      // gelir mahallesinde, bisküvi turizmde daha çok satar. Kapasite
      // ise raflar arasında ORTAKTIR.
      for (const { good, share } of goodShares(district.archetype, categoryId)) {
        const goodDemand = demandUnits * share;
        if (goodDemand <= 0) continue;

        // ---- 2. Bu talebe erişebilen, ürünü rafında taşıyan outlet'ler ----
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
            if (!building.stocked.includes(good.id)) continue;

            const company = state.companies[building.companyId];
            if (!company) continue;

            // ---- 3. Çekicilik ----
            const price = category.basePrice * building.priceMultiplier;
            const priceFactor = Math.pow(category.basePrice / price, category.elasticity);
            const brand = 0.45 + 0.55 * (company.brand[categoryId] ?? 0);
            const quality = Math.pow(qualityFor(state, building.companyId, building.defId), 1.15);
            // Kapasite, bu bölgeye ayrılmış bütçeden düşer — komşu
            // bölgelerin sırası bu bölgeyi aç bırakamaz.
            const budget = budgetByOutlet.get(building.id);
            const capacityLeft = Math.max(0, budget?.get(district.id) ?? 0);

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
          unservedTotal += goodDemand;
          continue;
        }

        // ---- 4-5. Payları dağıt, kapasiteyi uygula, artanı yeniden dağıt ----
        let remaining = goodDemand;
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
            budgetByOutlet.get(c.building.id)?.set(district.id, c.capacityLeft);
            consumed += sold;
            soldHere.set(c.building.id, (soldHere.get(c.building.id) ?? 0) + sold);
          }

          remaining -= consumed;
          if (consumed <= 0.01) break;
        }

        unservedTotal += remaining;
        const servedUnits = goodDemand - remaining;
        const key = `${district.id}|${categoryId}`;
        servedByDistrictCategory.set(key, (servedByDistrictCategory.get(key) ?? 0) + servedUnits);

        // ---- Defterleri işle ----
        for (const candidate of candidates) {
          const units = soldHere.get(candidate.building.id) ?? 0;
          if (units <= 0) continue;

          const building = candidate.building;
          const def = BUILDING_BY_ID[building.defId]!;
          const company = state.companies[building.companyId]!;

          const revenue = units * candidate.price;
          // Satış maliyeti zincirden: dışarıdan alınan girdi payı +
          // perakende işleme. Kendi ürettiğin kısmın maliyeti zaten
          // üretim ünitesinin defterinde duruyor.
          const cogs =
            units *
            unitCogsFor(
              state,
              building.companyId,
              good.id,
              reliefByOutlet.get(building.id) ?? 0,
              mods.costMultiplier,
            );

          building.last.unitsSold += units;
          building.last.revenue += revenue;
          building.last.cogs += cogs;
          building.last.profit += revenue - cogs;
          building.last.capacityUsed =
            def.capacity > 0 ? building.last.unitsSold / def.capacity : 0;

          // Pay yalnızca outlet'in KENDİ bölgesindeki kategori satışından
          // hesaplanır. Eskiden her (bölge, ürün) turunda bir kesir
          // toplanıyordu; iki ürünlü bir mağaza "%134 pay" gösterebiliyordu.
          if (building.districtId === district.id) {
            ownDistrictUnits.set(building.id, (ownDistrictUnits.get(building.id) ?? 0) + units);
          }

          company.today.revenue += revenue;
          company.today.cogs += cogs;

          const key = `${building.companyId}|${categoryId}`;
          soldByCompanyCategory.set(key, (soldByCompanyCategory.get(key) ?? 0) + units);
          soldByCategory[categoryId] += units;

          priceSum += candidate.price * units;
          priceWeight += units;
        }
      }

      district.unmet[categoryId] = demandUnits > 0 ? unservedTotal / demandUnits : 0;
      district.priceIndex[categoryId] =
        priceWeight > 0 ? priceSum / priceWeight / category.basePrice : 1;
    }
  }

  // Payları döngüden sonra tek seferde çöz.
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    const served = servedByDistrictCategory.get(`${building.districtId}|${def.category}`) ?? 0;
    building.last.share = served > 0 ? (ownDistrictUnits.get(building.id) ?? 0) / served : 0;
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
      // CEO'nun pazarlama kabiliyeti bu hızı belirler.
      //
      // Pazarlama ofisi hedefi payın hak ettiğinin ÜSTÜNE çeker. Bu,
      // markanın "zengini daha zengin yapan" döngüsüne küçük oyuncunun
      // girebileceği tek kapı: kaldıraç toplamsal olduğu için düşük
      // markada oransal katkısı daha büyük (%37'ye karşı %21).
      const leverage = marketingLeverage(state, company.id, categoryId);
      const target = Math.min(1, share * 1.15 + leverage);
      const growth = 0.035 * getCeoModifiers(company.ceoId).brandGrowth;
      company.brand[categoryId] += (target - company.brand[categoryId]) * growth;
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
