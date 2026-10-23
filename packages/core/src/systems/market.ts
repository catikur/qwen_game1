import {
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  GOOD_BY_ID,
  getCeoModifiers,
} from '@capital/content';
import { categoryRevenueRate } from './council';
import { constructionMultiplier } from '../actions';
import { dailyWealthTax, overheadMultiplier } from './economy';
import { boostMultiplier } from './cards';
import { campaignPriceFactor } from './rivalry';
import { settleInterest } from './credit';
import type { BuildingDef, CategoryId, DistrictArchetypeId } from '@capital/content';
import {
  defaultShelf,
  estimateBaselineDemand,
  goodShares,
  shelfReach,
  zeroByCategory,
} from './demand';
import { collectEventModifiers } from './events';
import { activeFad } from './living';
import { projectAttraction, projectUpkeep } from './projects';
import { buildingStrikeFactor, serviceFactor, wageFor } from './labor';
import { marketingLeverage } from './focus';
import { SURPLUS_HAIRCUT, outletRelief, unitCogsFor } from './supply';
import type { FreightClient } from './supply';
import type { BuildingInstance, CompanyState, DistrictState, GameState } from '../types';
import { scopedMemo, scopedOutlets, withBuildingIndex } from './buildingIndex';

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
  return def.upkeepPerDay * getCeoModifiers(state.companies[companyId]?.ceoId ?? null).upkeep * overheadMultiplier(state, companyId);
}

/**
 * İki district arasındaki erişim ağırlığı (aynı = 1, komşu = kısmi).
 *
 * TUR 8'DEN TUR 21'E KADAR YANLIŞTI. Sütun sayısı `harita genişliği / 8`
 * diye hesaplanıyordu; bölge kenarı Tur 8'de 8'den 10'a çıktı ve 30
 * genişlikte `round(3,75) = 4` sütun çıktı. 3×3 haritada komşuluk
 * karışıktı: Çarşı (sol orta) hesapta Teknopark'ın komşusuydu, altındaki
 * Öğrenci bölgesine çapraz sayılıyordu. 5×5 yerleşimi denerken bulundu.
 * Artık konum bölgenin kendi koordinatından okunuyor.
 */
export function accessWeight(state: GameState, fromDistrict: number, toDistrict: number): number {
  if (fromDistrict === toDistrict) return 1;

  const a = state.districts[fromDistrict];
  const b = state.districts[toDistrict];
  if (!a || !b) return 0;
  const size = a.x1 - a.x0 + 1;
  const dx = Math.abs(a.x0 - b.x0) / size;
  const dy = Math.abs(a.y0 - b.y0) / size;

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
 * Binanın taban kalitesinin prim gücüne katkısı (Tur 21, REKABET §3.4).
 *
 * Tur 2'nin "bilinen sadeleştirmesi" buydu: prim gücü yalnızca Ar-Ge ve
 * pazarlamadan geliyordu, süpermarket bakkaldan kaliteli olmasına rağmen
 * aynı fiyattan satıyordu. Taban kalite artık aynı kanaldan, aynı
 * kıtlık çarpanıyla fiyata dönüyor — ama kategorinin EN DÜŞÜK kaliteli
 * mağazasına göre: bakkal, kafe, butik, elektronik mağazası ve spor
 * salonu için katkı sıfır, onların ekonomisi birebir Tur 1. Fark yalnızca
 * üst kademede ve kalite farkının yarısı kadar (süpermarket ve restoran
 * +0,115, mağazalar zinciri +0,10): boş talebin %50 olduğu bir bölgede
 * fiyat ~%4 primli, doymuş bölgede sıfır — doymuş pazarda kalite yine
 * paya döner.
 *
 * Ağırlık neden yarım: tam ağırlıkta (fark 0,23) üst kademe mağaza o kadar
 * hızlı döndü ki Tur 15'in fırsat maliyeti freni zincir ünitelerini
 * erteledi ve zincir A/B'si bir tohumda 4 üniteden 1'e indi (denge testi
 * "zincir kurulabilen her tohumda kazandırıyor" önkoşulunu kaybetti).
 * Yarım ağırlıkta zincir 3 ünite ve %9 önde; kalite fiyatta görünür kaldı.
 */
const QUALITY_EDGE_WEIGHT = 0.5;
const categoryFloorQuality = new Map<string, number>();
for (const def of Object.values(BUILDING_BY_ID)) {
  if (def.role !== 'outlet') continue;
  const floor = categoryFloorQuality.get(def.category);
  if (floor === undefined || def.quality < floor) categoryFloorQuality.set(def.category, def.quality);
}

export function qualityEdge(defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def || def.role !== 'outlet') return 0;
  return Math.max(0, def.quality - (categoryFloorQuality.get(def.category) ?? def.quality)) * QUALITY_EDGE_WEIGHT;
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
  /**
   * Yeni mağazanın şirketin KENDİ şubelerinden alacağı günlük kâr (₺).
   * `dailyProfit`ten zaten düşülmüş; ekranda ayrıca söyleniyor (Tur 25).
   */
  cannibalized: number;
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
        if (GOOD_BY_ID[stockedId]?.inputGoodId !== goodId) continue;
        consumed += building.soldByGood ? (building.soldByGood[stockedId] ?? 0) : draw / shelf.length;
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
  // Süren kart etkileri (Tur 37b) yeni binaya da ilk günden uygulanıyor: tahmin de görsün (Codex #62).
  const wages =
    wageFor(state, companyId, defId, districtId) * overheadMultiplier(state, companyId) * boostMultiplier(state, companyId, 'wages');
  // Sponsorun belediye ayrıcalığı (Tur 37d): bölgedeki bakım indirimi yeni binaya da.
  const fixedCosts =
    upkeepFor(state, companyId, defId) * boostMultiplier(state, companyId, 'upkeep') * projectUpkeep(state, companyId, districtId) + wages;
  // Geri ödeme, oyuncunun gerçekten ödeyeceği maliyete göre hesaplanır.
  const investmentCost = def.cost * getCeoModifiers(company.ceoId).buildCost * constructionMultiplier(state);

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
        cannibalized: 0,
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
      cannibalized: 0,
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
      cannibalized: 0,
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
      cannibalized: 0,
      paybackDays: dailyProfit > 0 ? investmentCost / dailyProfit : Infinity,
    };
  }

  // Outlet: mevcut rakiplere karşı beklenen pazar payı.
  // Fiyat, motorun uygulayacağı otomatik fiyatın aynısıyla hesaplanır;
  // aksi halde tahmin sistematik olarak gerçeğin altında kalır.
  const priceMultiplier = autoPriceMultiplier(
    district.unmet[def.category] ?? 0,
    district.outletCount[def.category] ?? 0,
    premiumEdge(state, companyId, def.category) + qualityEdge(def.id),
  );
  const salePrice = category.basePrice * priceMultiplier;

  const brand = 0.45 + 0.55 * (company.brand[def.category] ?? 0);

  /*
   * PAY HEDEF BÖLGE BAŞINA, YAMYAMLIK DÜŞÜLEREK (Tur 25).
   *
   * Eski tahmin iki şeyi görmüyordu ve ikisi de zincir A/B'sini ters
   * çeviriyordu:
   *
   *   1. KOMŞU RAKİPLER. Komşu bölgenin talebi tahmine ekleniyordu ama o
   *      talebin peşindeki komşu mağazalar rakip sayılmıyordu: pay yalnızca
   *      kendi bölgendeki mağazalara karşı hesaplanıp şehrin yarısının
   *      talebine uygulanıyordu. Pazar adımı ise her bölgenin talebini o
   *      bölgeye erişen BÜTÜN mağazalar arasında erişim ağırlığıyla bölüyor.
   *      Tahmin artık aynısını yapıyor: her hedef bölge için ayrı pay.
   *   2. KENDİ MAĞAZALARIN. Yeni mağazanın payı kısmen senin eski
   *      mağazalarından geliyor; eski tahmin bunu kâr sayıyordu. Doymuş
   *      bölgede (boş talep yok) yeni şubenin satışının kendi şubelerinden
   *      çaldığı kısmı artık kârdan düşülüyor.
   *
   * Ölçüm (zincir A/B, 12 tohum): zincirle ucuzlayan girdi, eski tahminde
   * aynı kategoriye mağaza üstüne mağaza açtırıyordu — bir tohumda 23
   * teknoloji mağazası, tanesi günde 377 ₺. Zincirli kol 12 tohumun
   * 3'ünde öndeydi; ayrıntı DURUM.md Tur 25'te.
   */
  // Raf, inşaatın koyacağı raf: kalıcı karar, modaya göre değil (actions.ts).
  // Erişim ise bugünün payıyla — moda süresince satışın kullandığı paylar (Codex #64).
  const shelf = defaultShelf(district.archetype, def.category, def.slots ?? 1);
  const fadGood = activeFad(state)?.goodId ?? null;
  const self =
    Math.pow(qualityFor(state, companyId, defId), 1.15) *
    brand *
    Math.pow(1 / priceMultiplier, category.elasticity) *
    boostMultiplier(state, companyId, 'attraction', def.category) *
    projectAttraction(state, companyId, districtId);
  const sources = categoryAttractiveness(state, def.category, companyId);

  let reachable = 0;
  let ownLossUnits = 0;
  for (const target of state.districts) {
    const access = accessWeight(state, target.id, districtId);
    if (access <= 0) continue;
    const demand =
      (target.demand[def.category] || estimateBaselineDemand(target, def.category)) *
      // Outlet yalnızca RAFINDAKİ ürünlerin talebine erişir: tek yuvalı bir
      // bakkal kategorinin tamamını değil, taşıdığı ürünün payını yakalar.
      shelfReach(target.archetype, def.category, shelf, fadGood);
    if (demand <= 0) continue;

    let total = 0;
    let own = 0;
    for (const [sourceId, source] of sources) {
      const weight = accessWeight(state, target.id, sourceId);
      if (weight <= 0) continue;
      total += source.total * weight;
      own += source.own * weight;
    }

    const mine = self * access;
    const share = mine / (mine + total);
    reachable += demand * share;
    // Eski şubelerin bu bölgedeki satışı payları oranında küçülür; boş
    // talep varsa kapasitesi dolu şube kaybını oradan telafi eder.
    if (own > 0) {
      const served = demand * (1 - Math.min(1, Math.max(0, target.unmet[def.category] ?? 0)));
      ownLossUnits += served * (own / total) * share;
    }
  }
  const expectedUnits = Math.min(def.capacity, reachable);
  // Kapasite yetmiyorsa yeni şube her bölgeden orantılı olarak az alır.
  const capacityScale = reachable > 0 ? expectedUnits / reachable : 0;

  // Birim maliyet zincirden geliyor. Yeni bina için depo indirimi
  // varsayılmaz — tahmin temkinli olsun.
  const goodId = shelf[0];
  const unitCogs = goodId ? unitCogsFor(state, companyId, goodId, 0, 1) * boostMultiplier(state, companyId, 'cogs') : 0;

  // Yürürlükteki meclis kararı tahmine de giriyor: vergi gelen kategoride
  // "60 günde döner" demek, oyuncuya yalan söylemek olurdu.
  const unitRevenue = salePrice * (1 + categoryRevenueRate(state, def.category));
  const revenue = expectedUnits * unitRevenue;
  const cogs = expectedUnits * unitCogs;
  const cannibalized = ownLossUnits * capacityScale * Math.max(0, unitRevenue - unitCogs);
  const dailyProfit = revenue - cogs - fixedCosts - cannibalized;

  return {
    direct: true,
    expectedUnits,
    utilisation: def.capacity > 0 ? expectedUnits / def.capacity : 0,
    revenue,
    cogs,
    fixedCosts,
    dailyProfit,
    cannibalized,
    paybackDays: dailyProfit > 0 ? investmentCost / dailyProfit : Infinity,
  };
}

interface SourceAttractiveness {
  /** Bölgedeki bütün mağazaların çekicilik toplamı (erişim ağırlığı uygulanmadan). */
  total: number;
  /** Aynısı yalnızca sorulan şirketin mağazaları için. */
  own: number;
}

/**
 * Bir kategoride bölge başına mağaza çekiciliği — pazar adımının paylaştırdığı
 * ağırlıkların aynısı (kalite, marka, fiyat). Bina indeksi açıksa bir kez
 * hesaplanır: kart ve rekabet taraması aynı kategoriyi onlarca kez soruyor.
 */
function categoryAttractiveness(
  state: GameState,
  categoryId: CategoryId,
  companyId: string,
): Map<number, SourceAttractiveness> {
  return scopedMemo(state, `attractiveness|${categoryId}|${companyId}`, () => {
    const category = CATEGORIES[categoryId];
    const byDistrict = new Map<number, SourceAttractiveness>();
    const add = (building: BuildingInstance): void => {
      const def = BUILDING_BY_ID[building.defId];
      if (!def || def.role !== 'outlet' || def.category !== categoryId) return;
      const company = state.companies[building.companyId];
      const brand = 0.45 + 0.55 * (company?.brand[categoryId] ?? 0);
      // Pazar adımıyla aynı fiyat ve çekicilik: süren kampanyanın indirimi ve kart etkisi (Codex #62).
      const price = building.priceMultiplier * campaignPriceFactor(state, building.companyId, categoryId);
      const priceFactor = Math.pow(1 / price, category.elasticity);
      const value =
        Math.pow(qualityFor(state, building.companyId, building.defId), 1.15) *
        brand *
        priceFactor *
        boostMultiplier(state, building.companyId, 'attraction', categoryId) *
        projectAttraction(state, building.companyId, building.districtId);
      const entry = byDistrict.get(building.districtId) ?? { total: 0, own: 0 };
      entry.total += value;
      if (building.companyId === companyId) entry.own += value;
      byDistrict.set(building.districtId, entry);
    };
    if (scopedOutlets(state, 0) !== null) {
      for (const district of state.districts) for (const building of scopedOutlets(state, district.id)!) add(building);
    } else {
      for (const building of Object.values(state.buildings)) add(building);
    }
    return byDistrict;
  });
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
      premiumEdge(state, building.companyId, def.category) + qualityEdge(def.id),
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
  // Pazar adımı bina değiştirmiyor: indeks bütün adım boyunca geçerli.
  withBuildingIndex(state, () => marketStep(state));
}

/**
 * Mağazanın pazar adımı boyunca sabit kalan değerleri (Tur 43).
 *
 * Dağıtım fiyatı, kaliteyi, markayı ve kart, hizmet, proje çarpanlarını her
 * (bölge, ürün) çifti için yeniden hesaplıyordu. Büyük şehirde bir günün
 * yarısı buradaydı. Hiçbiri gün içinde değişmiyor: fiyat otomatik fiyattan
 * sonra, marka dağıtımdan sonra güncelleniyor. Burada mağaza başına bir kez.
 *
 * Çekicilik eskisiyle aynı sırayla çarpılıyor:
 * `kalite × marka × fiyat` (`appeal`), sonra `× erişim × hizmet × kart × proje`.
 * Sonuç bit bit aynı; parmak izi testi bunu tutuyor.
 */
interface OutletDay {
  building: BuildingInstance;
  def: BuildingDef;
  /** Şirketi yoksa mağaza satış yapmıyor (eskiden de aday olmuyordu). */
  company: CompanyState | undefined;
  /** Deponun perakende maliyetinden sildiği pay (sözleşmede terminalin tam payı). */
  relief: number;
  /** Taşıma sözleşmesi (Tur 56): satılan her birimden terminale ücret. */
  freight: FreightClient | null;
  price: number;
  appeal: number;
  service: number;
  boost: number;
  project: number;
  cogsBoost: number;
  /** Ürün başına birim maliyet, ilk satışta. */
  unitCogs: Map<string, number>;
  /** Bölge başına kalan kapasite; bölge kimliği dizinin indisi. */
  budget: Float64Array;
  soldGoods: Record<string, number>;
  /** Kendi bölgesindeki satış: pay bundan. */
  ownUnits: number;
  /** Şirketin kategori başına bugünkü satışı; şirketin bütün mağazaları aynı kaydı paylaşıyor. */
  companySold: Record<CategoryId, number>;
}

/**
 * Taşıma ücreti el değiştiriyor (Tur 56): müşterinin mal maliyetine ve
 * mağazasının defterine, oyuncunun cirosuna ve terminalin defterine. İkisi
 * de kasaya günün sonundaki şirket toplamıyla giriyor.
 */
function collectFreight(state: GameState, outlet: BuildingInstance, client: FreightClient, fee: number): void {
  if (fee <= 0) return;
  const player = state.companies[state.playerCompanyId];
  const customer = state.companies[outlet.companyId];
  const terminal = state.buildings[client.deal.terminalId];
  if (!player || !customer || !terminal) return;
  outlet.last.cogs += fee;
  outlet.last.profit -= fee;
  outlet.last.freight = (outlet.last.freight ?? 0) + fee;
  customer.today.cogs += fee;
  client.deal.lastFee = (client.deal.lastFee ?? 0) + fee;
  terminal.last.revenue += fee;
  terminal.last.profit += fee;
  player.today.revenue += fee;
}

function outletDay(
  state: GameState,
  building: BuildingInstance,
  def: BuildingDef,
  companySold: Record<CategoryId, number>,
): OutletDay {
  const company = state.companies[building.companyId];
  const category = CATEGORIES[def.category];
  const { relief, freight } = outletRelief(state, building);
  const outlet: OutletDay = {
    building,
    def,
    company,
    // Sözleşmedeki mağaza malını terminalin tam indirimiyle alıyor; ücret
    // satıştan ayrıca kesiliyor (`collectFreight`). Toplamı `relief`le aynı.
    relief: freight ? freight.relief : relief,
    freight,
    price: 0,
    appeal: 0,
    service: 1,
    boost: 1,
    project: 1,
    cogsBoost: 1,
    unitCogs: new Map(),
    budget: new Float64Array(state.districts.length),
    soldGoods: {},
    ownUnits: 0,
    companySold,
  };
  if (!company) return outlet;
  // Rakip kampanyası (Tur 37b): saldıran şirket hedef kategoride fiyat kırıyor.
  outlet.price = category.basePrice * building.priceMultiplier * campaignPriceFactor(state, building.companyId, def.category);
  const priceFactor = Math.pow(category.basePrice / outlet.price, category.elasticity);
  const brand = 0.45 + 0.55 * (company.brand[def.category] ?? 0);
  const quality = Math.pow(qualityFor(state, building.companyId, building.defId), 1.15);
  outlet.appeal = quality * brand * priceFactor;
  // Ücret politikası mağaza hizmetinde görünür (düşük −%4, yüksek +%4);
  // karar kartının süreli çekiciliği (Tur 37b) de burada.
  outlet.service = serviceFactor(state, building.companyId);
  outlet.boost = boostMultiplier(state, building.companyId, 'attraction', def.category);
  outlet.project = projectAttraction(state, building.companyId, building.districtId);
  outlet.cogsBoost = boostMultiplier(state, building.companyId, 'cogs');
  return outlet;
}

function marketStep(state: GameState): void {
  applyAutoPricing(state);
  // Taşıma ücretleri (Tur 56) bugünün satışından; dünkü sayı silinsin.
  for (const deal of state.freight?.contracts ?? []) deal.lastFee = 0;

  const mods = collectEventModifiers(state);
  // Moda olan ürün (Tur 37d): kategori içinde talep ona kayıyor.
  const fadGood = activeFad(state)?.goodId ?? null;
  // Ürün payları gün boyunca sabit (arketip × kategori × moda): bir kez
  // hesaplanıp gün boyunca okunuyor. Bütçe adımı her mağaza × bölge için
  // yeni bir dizi kuruyordu (Tur 38). Erişim `shelfReach` ile aynı toplam.
  const sharesMemo = new Map<string, ReturnType<typeof goodShares>>();
  const sharesOf = (archetype: DistrictArchetypeId, categoryId: CategoryId): ReturnType<typeof goodShares> => {
    const key = `${archetype}|${categoryId}`;
    let shares = sharesMemo.get(key);
    if (!shares) {
      shares = goodShares(archetype, categoryId, fadGood);
      sharesMemo.set(key, shares);
    }
    return shares;
  };
  const reachOf = (archetype: DistrictArchetypeId, categoryId: CategoryId, stocked: readonly string[]): number => {
    let reach = 0;
    for (const entry of sharesOf(archetype, categoryId)) {
      if (stocked.includes(entry.good.id)) reach += entry.share;
    }
    return reach;
  };
  const buildings = Object.values(state.buildings);

  // Outlet'leri district kırılımıyla indeksle ve rakip sayacını kur.
  // Depo indirimi outlet başına bir kez çözülür; iç döngüde tekrar
  // hesaplamak günlük maliyeti kare kadar büyütürdü.
  const outlets: OutletDay[] = [];
  // Şehir geneli pazar payı için şirket × kategori satışı; mağazalar şirketinkini paylaşıyor.
  const soldByCompany = new Map<string, Record<CategoryId, number>>();
  const outletsByDistrict = new Map<number, OutletDay[]>();
  // Aynı liste kategoriye göre de (Tur 38): dağıtım her (bölge, ürün) için
  // yalnız o kategorinin mağazalarını geziyor, şehrin bütün mağazalarını
  // değil. Bölge sırası ve bölge içindeki sıra aynı — sonuç birebir aynı.
  const outletsByDistrictCategory = new Map<number, Map<CategoryId, OutletDay[]>>();
  for (const district of state.districts) district.outletCount = zeroByCategory();

  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;

    let companySold = soldByCompany.get(building.companyId);
    if (!companySold) {
      companySold = zeroByCategory();
      soldByCompany.set(building.companyId, companySold);
    }
    const outlet = outletDay(state, building, def, companySold);
    outlets.push(outlet);
    const list = outletsByDistrict.get(building.districtId) ?? [];
    list.push(outlet);
    outletsByDistrict.set(building.districtId, list);
    const byCategory = outletsByDistrictCategory.get(building.districtId) ?? new Map<CategoryId, OutletDay[]>();
    const categoryList = byCategory.get(def.category) ?? [];
    categoryList.push(outlet);
    byCategory.set(def.category, categoryList);
    outletsByDistrictCategory.set(building.districtId, byCategory);

    const district = state.districts[building.districtId];
    if (district) district.outletCount[def.category] += 1;
  }

  // Şehir geneli pazar payı için birikimler. Şirketin satışı `OutletDay.companySold`'da.
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
      for (const entry of mods.districtDemand) {
        if (entry.districtId === district.id) eventMultiplier *= entry.multipliers[categoryId] ?? 1;
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
  for (const [sourceDistrictId, list] of outletsByDistrict) {
    // Kaynak bölgeden erişilen bölgeler bir kez (Tur 43); bölge sırası aynı.
    const reachable: Array<{ district: DistrictState; access: number }> = [];
    for (const district of state.districts) {
      const access = accessWeight(state, district.id, sourceDistrictId);
      if (access > 0) reachable.push({ district, access });
    }
    for (const outlet of list) {
      const { building, def, budget } = outlet;
      // Raf erişimi arketip başına bir kez: bölgeler aynı arketipi paylaşıyor.
      const reachByArchetype = new Map<DistrictArchetypeId, number>();
      let total = 0;

      for (const { district, access } of reachable) {
        // Kapasite, satışın kullanacağı paylarla bölünüyor: moda da (Codex #64).
        let reach = reachByArchetype.get(district.archetype);
        if (reach === undefined) {
          reach = reachOf(district.archetype, def.category, building.stocked);
          reachByArchetype.set(district.archetype, reach);
        }
        const pull = (district.demand[def.category] ?? 0) * reach * access;
        if (pull <= 0) continue;
        budget[district.id] = pull;
        total += pull;
      }

      // Grevde mağaza kapasitesinin yalnızca çalışan kısmı satabilir.
      const capacity = def.capacity * buildingStrikeFactor(state, building.companyId, def);
      for (const { district } of reachable) {
        const pull = budget[district.id]!;
        if (pull > 0) budget[district.id] = capacity * (pull / total);
      }
    }
  }

  const servedByDistrictCategory = new Map<string, number>();

  // ---- 3. Dağıtım ----
  for (const district of state.districts) {
    // Erişim kaynak bölge başına bir kez (Tur 43); kategori ve ürün döngüsü
    // onu her seferinde yeniden soruyordu. Kaynak sırası aynı.
    const sources: Array<{ byCategory: Map<CategoryId, OutletDay[]>; access: number }> = [];
    for (const sourceDistrictId of outletsByDistrict.keys()) {
      const access = accessWeight(state, district.id, sourceDistrictId);
      if (access <= 0) continue;
      sources.push({ byCategory: outletsByDistrictCategory.get(sourceDistrictId)!, access });
    }
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
      for (const { good, share } of sharesOf(district.archetype, categoryId)) {
        const goodDemand = demandUnits * share;
        if (goodDemand <= 0) continue;

        // ---- 2. Bu talebe erişebilen, ürünü rafında taşıyan outlet'ler ----
        interface Candidate {
          outlet: OutletDay;
          attractiveness: number;
          capacityLeft: number;
          /** Bu (bölge, ürün) turunda sattığı; iki geçişin toplamı. */
          sold: number;
        }
        const candidates: Candidate[] = [];

        for (const source of sources) {
          const list = source.byCategory.get(categoryId);
          if (!list) continue;

          for (const outlet of list) {
            if (!outlet.building.stocked.includes(good.id)) continue;
            if (!outlet.company) continue;

            // Kapasite, bu bölgeye ayrılmış bütçeden düşer — komşu
            // bölgelerin sırası bu bölgeyi aç bırakamaz.
            const capacityLeft = Math.max(0, outlet.budget[district.id]!);
            if (capacityLeft <= 0) continue;

            candidates.push({
              outlet,
              // ---- 3. Çekicilik ---- Çarpım sırası `outletDay`'deki notta.
              attractiveness: outlet.appeal * source.access * outlet.service * outlet.boost * outlet.project,
              capacityLeft,
              sold: 0,
            });
          }
        }

        if (candidates.length === 0) {
          unservedTotal += goodDemand;
          continue;
        }

        // ---- 4-5. Payları dağıt, kapasiteyi uygula, artanı yeniden dağıt ----
        let remaining = goodDemand;

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
            c.outlet.budget[district.id] = c.capacityLeft;
            consumed += sold;
            c.sold += sold;
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
          const units = candidate.sold;
          if (units <= 0) continue;

          const { outlet } = candidate;
          const { building, def } = outlet;
          const company = outlet.company!;

          const revenue = units * outlet.price;
          // Satış maliyeti zincirden: dışarıdan alınan girdi payı +
          // perakende işleme. Kendi ürettiğin kısmın maliyeti zaten
          // üretim ünitesinin defterinde duruyor. Birim maliyet ürün başına
          // günde bir kez (Tur 43): spot fiyat ve tedarik payı gün içinde sabit.
          let unitCogs = outlet.unitCogs.get(good.id);
          if (unitCogs === undefined) {
            unitCogs = unitCogsFor(state, building.companyId, good.id, outlet.relief, mods.costMultiplier);
            outlet.unitCogs.set(good.id, unitCogs);
          }
          const cogs = units * unitCogs * outlet.cogsBoost;

          building.last.unitsSold += units;
          outlet.soldGoods[good.id] = (outlet.soldGoods[good.id] ?? 0) + units;
          building.last.revenue += revenue;
          building.last.cogs += cogs;
          building.last.profit += revenue - cogs;
          building.last.capacityUsed =
            def.capacity > 0 ? building.last.unitsSold / def.capacity : 0;

          // Pay yalnızca outlet'in KENDİ bölgesindeki kategori satışından
          // hesaplanır. Eskiden her (bölge, ürün) turunda bir kesir
          // toplanıyordu; iki ürünlü bir mağaza "%134 pay" gösterebiliyordu.
          if (building.districtId === district.id) outlet.ownUnits += units;

          company.today.revenue += revenue;
          company.today.cogs += cogs;
          // Taşıma sözleşmesi (Tur 56): maliyet terminalin tam indirimiyle,
          // ücret ayrıca müşteriden oyuncuya (Codex #86).
          if (outlet.freight) collectFreight(state, building, outlet.freight, units * good.retailCost * outlet.freight.rate * mods.costMultiplier * outlet.cogsBoost);

          outlet.companySold[categoryId] += units;
          soldByCategory[categoryId] += units;

          priceSum += outlet.price * units;
          priceWeight += units;
        }
      }

      district.unmet[categoryId] = demandUnits > 0 ? unservedTotal / demandUnits : 0;
      district.priceIndex[categoryId] =
        priceWeight > 0 ? priceSum / priceWeight / category.basePrice : 1;
    }
  }

  // Payları döngüden sonra tek seferde çöz.
  for (const { building, def, ownUnits, soldGoods } of outlets) {
    const served = servedByDistrictCategory.get(`${building.districtId}|${def.category}`) ?? 0;
    building.last.share = served > 0 ? ownUnits / served : 0;
    building.soldByGood = soldGoods;
  }

  // ---- Kira üreten binalar ----
  // Bölge × kategori kiralık kapasitesi tek taramada (Tur 38): her kiralık
  // için bütün binaları taramak bina sayısının karesiydi. Kapasiteler tam
  // sayı; toplam sıradan bağımsız, sonuç birebir aynı.
  const rentalCapacity = new Map<string, number>();
  for (const other of buildings) {
    const otherDef = BUILDING_BY_ID[other.defId];
    if (!otherDef || otherDef.role !== 'rental') continue;
    const key = `${other.districtId}|${otherDef.category}`;
    rentalCapacity.set(key, (rentalCapacity.get(key) ?? 0) + otherDef.capacity);
  }
  for (const building of buildings) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def || def.role !== 'rental') continue;

    const district = state.districts[building.districtId];
    const company = state.companies[building.companyId];
    if (!district || !company) continue;

    const category = CATEGORIES[def.category];
    // Aynı bölgede ne kadar çok kiralık varsa doluluk o kadar düşer.
    const rivalCapacity = rentalCapacity.get(`${building.districtId}|${def.category}`) ?? 0;

    const absorbable = district.population * 0.06 + 40;
    const pressure = Math.min(1, rivalCapacity / Math.max(1, absorbable));
    const occupancy = Math.max(
      0.15,
      Math.min(1, 0.55 + 0.5 * district.incomeLevel - 0.4 * pressure),
    );

    // basePrice = birim başına günlük kira; kapasite = kiralanabilir birim.
    const revenue = def.capacity * occupancy * category.basePrice;
    // Kart indirimi (`cogs`) raftaki mal için; kiralığın rafı yok (Codex #62).
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

    // Meclis kararı: kategori cirosuna vergi (−) ya da teşvik (+). Satış
    // ADETİ değişmiyor, yalnızca kasaya giren — müşteri vergiyi görmez,
    // marjı daralan işletme görür.
    if (def.role === 'outlet' && state.policies && state.policies.length > 0) {
      const rate = categoryRevenueRate(state, def.category);
      if (rate !== 0 && building.last.revenue > 0) {
        const adjust = building.last.revenue * rate;
        building.last.revenue += adjust;
        building.last.profit += adjust;
        company.today.revenue += adjust;
      }
    }
  }

  for (const company of Object.values(state.companies)) {
    for (const categoryId of CONSUMER_CATEGORIES) {
      const total = soldByCategory[categoryId];
      const own = soldByCompany.get(company.id)?.[categoryId] ?? 0;
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

    if (company.debt > 0 || company.credit?.feeToday) company.today.interest = settleInterest(state, company);
    // Servet vergisi (Tur 37a): kademeli, dünkü özkaynaktan.
    company.today.tax = dailyWealthTax(state, company);

    company.today.profit =
      company.today.revenue -
      company.today.cogs -
      company.today.upkeep -
      company.today.wages -
      company.today.interest -
      company.today.tax;

    company.cash += company.today.profit;
  }
}
