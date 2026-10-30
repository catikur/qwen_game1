import {
  BUILDING_BY_ID,
  GOODS,
  GOOD_BY_ID,
  REAL_ESTATE,
  TRADED_GOODS,
  TRADE_LINE,
  getCeoModifiers,
} from '@capital/content';
import { collectEventModifiers } from './events';
import { zeroByGood } from './defaults';
import { buildingStrikeFactor, wageFor } from './labor';
import { overheadMultiplier } from './economy';
import { boostMultiplier } from './cards';
import { projectUpkeep } from './projects';
import { DISTRIBUTION_RELIEF, scopedDepots } from './buildingIndex';
import { estimateBaselineDemand, goodShares } from './demand';
import { energyPrice, gridUpkeep, powerGrid, servedUpkeep, settlePlants } from './energy';
import { underConstruction } from './realestate';
import { cityRule, cityUpkeepScale, referencePrice } from './cityType';
import type { BuildingDef } from '@capital/content';
import type { BuildingInstance, DistrictState, FreightDeal, GameState, Shipment, TradeLoad } from '../types';

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

/** Fazla üretim satarken fiyat kırılır — hacim döken taraf sensin. */
export const SURPLUS_HAIRCUT = 0.85;

/**
 * Taşıma ücreti (Tur 56): terminalin rakip mağazasına sağladığı indirimin
 * terminale giden payı. Müşteri kalanını tutuyor: ikisi de kazanıyor, ama
 * rakip senin kamyonunla ucuzluyor.
 */
export const FREIGHT_SHARE = 0.6;

/** Bu şehirde taşıma ücretinin terminale düşen payı: limanda daha çok (Tur 76). */
export function freightShareOf(state: GameState): number {
  return cityRule(state).freightShare ?? FREIGHT_SHARE;
}

/** Arz fazlası referans hacme ulaştığında spot fiyat bu oranda düşer. */
const GLUT_DEPTH = 0.4;

/**
 * İhracat baskısı (Tur 78): hatların şehrin pazarından aldığı mal, şehrin
 * fazlasını aşınca, referans hacme ulaştığında fiyatı bu oranda yükseltir.
 * Fazla kırığının aynası: ucuz şehirden alındıkça ucuzluk eriyor.
 */
const EXPORT_DEPTH = 0.4;

/** Spot fiyat bir günde zıplamasın; oyuncu grafikte eğri görsün. */
const SPOT_SMOOTHING = 0.15;

const SPOT_FLOOR = 0.6;
const SPOT_CEILING = 1.8;

// Kayıt taşıma da kullanıyor; bağımlılıksız modülde (Tur 46).
export { seedSpotPrices, zeroByGood } from './defaults';

/**
 * Spot pazarın referans hacmi — fazla üretimin fiyatı ne kadar kırdığını
 * ölçekler.
 *
 * Haritadan türetiliyor, sabit değil: şehir büyürse referans da büyür,
 * yani bir fabrikanın fiyat üzerindeki etkisi harita boyutuna göre
 * kendiliğinden dengelenir.
 */
export function referenceVolumes(districts: DistrictState[]): Record<string, number> {
  const reference = zeroByGood();

  for (const good of GOODS) {
    if (good.tier !== 'consumer' || !good.category) continue;

    let cityDemand = 0;
    for (const district of districts) {
      const share =
        goodShares(district.archetype, good.category).find((entry) => entry.good.id === good.id)
          ?.share ?? good.demandShare;
      cityDemand += estimateBaselineDemand(district, good.category) * share;
    }

    // Tüketici ürününün talebi zincirin her kademesine 1:1 iner.
    let current = GOOD_BY_ID[good.inputGoodId ?? ''];
    while (current) {
      reference[current.id] = (reference[current.id] ?? 0) + cityDemand;
      current = GOOD_BY_ID[current.inputGoodId ?? ''];
    }
  }

  return reference;
}


function wagesFor(state: GameState, building: BuildingInstance): number {
  const def = BUILDING_BY_ID[building.defId];
  if (!def) return 0;
  // İnşaattaki proje (Tur 58): kadrosu açılışta işe başlıyor.
  if (underConstruction(building)) return 0;
  // Grevdeki işçi ücret almaz: grev binası çalıştığı oranda öder.
  // Yönetim yükü (Tur 37a): büyük şirketin her işi biraz daha pahalı.
  return (
    wageFor(state, building.companyId, building.defId, building.districtId) *
    buildingStrikeFactor(state, building.companyId, def) *
    overheadMultiplier(state, building.companyId) *
    boostMultiplier(state, building.companyId, 'wages')
  );
}

/** Üretim ünitesinin bugünkü çıktısı — grevde düşer. */
function outputOf(state: GameState, building: BuildingInstance): number {
  const def = BUILDING_BY_ID[building.defId];
  if (!def) return 0;
  return def.capacity * buildingStrikeFactor(state, building.companyId, def);
}

function upkeepFor(state: GameState, building: BuildingInstance): number {
  const def = BUILDING_BY_ID[building.defId];
  if (!def) return 0;
  const ceo = getCeoModifiers(state.companies[building.companyId]?.ceoId ?? null);
  const upkeep =
    def.upkeepPerDay *
    cityUpkeepScale(state, def) *
    ceo.upkeep *
    overheadMultiplier(state, building.companyId) *
    boostMultiplier(state, building.companyId, 'upkeep') *
    projectUpkeep(state, building.companyId, building.districtId);
  // İnşaattaki proje (Tur 58): bakımın şantiye payı.
  return underConstruction(building) ? upkeep * REAL_ESTATE.siteUpkeep : upkeep;
}

/** Bir lojistik binasının perakende maliyetinden sildiği pay. */
export function reliefOf(def: BuildingDef): number {
  return def.relief ?? DISTRIBUTION_RELIEF;
}

/**
 * Şirketin KENDİ deposundan gelen indirim: menzilindeki en cömert depo.
 *
 * Mesafeyi rota çizerek değil burada modelliyoruz: deposu olmayan şirket
 * de şehir geneli havuzu kullanır, sadece birim başına daha çok dağıtım
 * öder. Mevcut `warehouse.radius = 8` mekaniği aynen korunuyor; terminal
 * (Tur 56) daha geniş menzil ve daha büyük pay.
 */
export function ownDepotRelief(state: GameState, outlet: BuildingInstance): number {
  const outletTile = state.map.tiles[outlet.tileId];
  if (!outletTile) return 0;
  let best = 0;

  // Bina indeksi açıksa (pazar adımı, zincir kartı) yalnızca şirketin depoları.
  const depots = scopedDepots(state, outlet.companyId);
  if (depots) {
    for (const depot of depots) {
      if (Math.abs(depot.x - outletTile.x) + Math.abs(depot.y - outletTile.y) <= depot.radius) best = Math.max(best, depot.relief);
    }
    return best;
  }

  for (const other of Object.values(state.buildings)) {
    if (other.companyId !== outlet.companyId) continue;
    const def = BUILDING_BY_ID[other.defId];
    if (def?.role !== 'logistics') continue;

    const tile = state.map.tiles[other.tileId];
    if (!tile) continue;
    const distance = Math.abs(tile.x - outletTile.x) + Math.abs(tile.y - outletTile.y);
    if (distance <= def.radius) best = Math.max(best, reliefOf(def));
  }
  return best;
}

/** Taşıma sözleşmesindeki bir mağaza: terminalin payı ve ücrete giden kısmı. */
export interface FreightClient {
  deal: FreightDeal;
  /** Terminalin perakende maliyetinden sildiği pay. */
  relief: number;
  /** Bu payın ücret olarak terminale giden kısmı (perakende maliyetinin oranı). */
  rate: number;
}

/**
 * Mağaza bir taşıma sözleşmesinde mi (Tur 56)? Sözleşme geçerliyse:
 * terminal duruyor, hâlâ oyuncunun, mağaza hâlâ müşterinin ve menzilde.
 * Geçersiz sözleşmeyi günün sonunda taşıma adımı temizliyor; o güne kadar
 * ücret de indirim de yok.
 */
export function freightClient(state: GameState, outlet: BuildingInstance): FreightClient | null {
  const contracts = state.freight?.contracts;
  if (!contracts || contracts.length === 0) return null;
  for (const deal of contracts) {
    if (deal.companyId !== outlet.companyId || !deal.outletIds.includes(outlet.id)) continue;
    const terminal = state.buildings[deal.terminalId];
    if (!terminal || terminal.companyId !== state.playerCompanyId) return null;
    const def = BUILDING_BY_ID[terminal.defId];
    if (!def?.fleet) return null;
    const a = state.map.tiles[terminal.tileId];
    const b = state.map.tiles[outlet.tileId];
    if (!a || !b || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > def.radius) return null;
    const relief = reliefOf(def);
    return { deal, relief, rate: relief * freightShareOf(state) };
  }
  return null;
}

/**
 * Mağazanın dağıtım indirimi ve varsa taşıma sözleşmesi. Kendi deposu
 * önce: kendi deposu olan mağaza sözleşmeye girmiyor (taşıma adımı onu
 * sözleşmeden çıkarıyor). Sözleşmedeki mağazanın indirimi terminalin payı
 * eksi ücret: müşterinin ödediği toplam bu, ücret de oyuncunun cirosu.
 */
export function outletRelief(state: GameState, outlet: BuildingInstance): { relief: number; freight: FreightClient | null } {
  const own = ownDepotRelief(state, outlet);
  if (own > 0) return { relief: own, freight: null };
  const freight = freightClient(state, outlet);
  return { relief: freight ? freight.relief - freight.rate : 0, freight };
}

/** Bir outlet'in dağıtım indirimi (0..1): kendi deposu ya da taşıma sözleşmesi. */
export function distributionRelief(state: GameState, outlet: BuildingInstance): number {
  return outletRelief(state, outlet).relief;
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
    company.today = { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, tax: 0, profit: 0 };
  }

  // Enerji (Tur 57): bakımın enerji payı şebeke fiyatıyla; santralden alan
  // binada santralin defterine. Santral yoksa ve fiyat 1'ken bakım aynı.
  const price = energyPrice(state);
  const grid = powerGrid(state, (building) => upkeepFor(state, building));

  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    const base = upkeepFor(state, building);
    const supply = grid?.served.get(building.id);
    const served = supply && def ? servedUpkeep(base, def, price, supply) : null;
    const upkeep = served ? served.upkeep : def ? gridUpkeep(base, def, price) : base;
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
    if (served) building.last.power = { plantId: supply!.plant.id, bill: served.bill, saved: served.saved };
  }
  if (grid) settlePlants(state, grid, price);
}

/** Binanın bakımı, enerji fiyatından ve santralden önce: enerji ihtiyacı bundan (Tur 57). */
export function buildingUpkeep(state: GameState, building: BuildingInstance): number {
  return upkeepFor(state, building);
}

/** Kâr eğiliminin penceresi (gün) — üstel ortalamanın zaman sabiti. */
export const PROFIT_TREND_DAYS = 30;

/**
 * Her binanın kâr eğilimini günün defteriyle günceller.
 *
 * Pazar ve üretim çözüldükten SONRA koşmalı: `last.profit` ancak o zaman
 * günün son hâli. Zar atmıyor, yalnızca okuyor — eklenmesi simülasyonun
 * kendisini değiştirmez, ona bakan kararları (rakibin şube kapatması,
 * oyuncunun "zararda" uyarısı) besler.
 */
export function runProfitTrendTick(state: GameState): void {
  for (const building of Object.values(state.buildings)) {
    const today = building.last.profit;
    building.profitTrend =
      building.profitTrend === undefined
        ? today
        : building.profitTrend + (today - building.profitTrend) / PROFIT_TREND_DAYS;
  }
}

/**
 * Binanın bugünkü girdi talebi, ürün başına: üretim ünitesinin girdisi ya da
 * rafın çekişi. Üretim adımı ve hattın sabah tahmini (`exportableSurplus`)
 * aynı hesabı kullanıyor.
 */
function addDemand(state: GameState, building: BuildingInstance, def: BuildingDef, consumed: Record<string, number>): void {
  if (def.role === 'process' && def.outputGoodId) {
    const input = GOOD_BY_ID[def.outputGoodId]?.inputGoodId;
    if (input) consumed[input] = (consumed[input] ?? 0) + outputOf(state, building);
  }

  if (def.role === 'outlet') {
    /*
     * DÜNKÜ SATIŞ, ÜRÜN BAŞINA (Tur 21).
     *
     * Eskiden `expectedDraw` dünkü satışı okumak istiyordu ama defter bu
     * adımdan ÖNCE sıfırlanıyor (`resetDailyLedgers`): okunan her zaman
     * 0'dı ve tüketim KAPASİTEDEN sayılıyordu, üstelik raftaki ürünlere
     * EŞİT bölünerek. "Yemek + kahve" satan restoran kahveyi çok, yemeği
     * az satarken iki ürün de yarım kapasite tüketiyor sayılıyordu: iç
     * arz oranı şişiyor, fazla üretim "tüketildi" diye pazara satılmıyor,
     * tesis girdisini alıp ürününü boşa harcıyordu. Zincir A/B'si bunu
     * gösterdi (Hazır Gıda Tesisi kartta +1.643 ₺/gün, gerçekte −5.371).
     * Pazar adımı artık ürün başına satışı `soldByGood`'a yazıyor;
     * alanı olmayan (eski kayıt, yeni mağaza) eski kurala düşer.
     */
    const draw = expectedDraw(building);
    const shelf = building.stocked.length > 0 ? building.stocked : [];
    for (const goodId of shelf) {
      const input = GOOD_BY_ID[goodId]?.inputGoodId;
      if (!input) continue;
      const units = building.soldByGood ? (building.soldByGood[goodId] ?? 0) : draw / shelf.length;
      consumed[input] = (consumed[input] ?? 0) + units;
    }
  }
}

/**
 * Oyuncunun bu şehirde bir maldaki bugünkü üretimi ve kendi tüketimi
 * (Tur 77), üretim adımının hesabıyla: bugünkü kapasite ve grev, rafların
 * dünkü satışı. Gelen hattın malı sayılmıyor.
 */
export function ownGoodFlow(state: GameState, goodId: string): { produced: number; consumed: number } {
  const flows = ownGoodFlows(state);
  return { produced: flows.produced[goodId] ?? 0, consumed: flows.consumed[goodId] ?? 0 };
}

/** `ownGoodFlow` bütün mallarda: oyuncunun binalarının bugünkü üretimi ve ihtiyacı. */
export function ownGoodFlows(state: GameState): { produced: Record<string, number>; consumed: Record<string, number> } {
  const consumed: Record<string, number> = {};
  const produced: Record<string, number> = {};
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    addDemand(state, building, def, consumed);
    if (def.outputGoodId && (def.role === 'extract' || def.role === 'process')) {
      produced[def.outputGoodId] = (produced[def.outputGoodId] ?? 0) + outputOf(state, building);
    }
  }
  return { produced, consumed };
}

/**
 * Oyuncunun bu şehirde bugün kendi ihtiyacından artacak malı (Tur 77).
 * Şehirler arası hat sabah bunu yüklüyor (aynı malı hem alan hem gönderen
 * şehir yok: gelen hattın malı burada sayılmasa da olur).
 */
export function exportableSurplus(state: GameState, goodId: string): number {
  const flow = ownGoodFlow(state, goodId);
  return Math.max(0, flow.produced - flow.consumed);
}

/** Hattın bu şehirdeki günü (Tur 77): varan mal terminal başına, yükler ürün başına. */
interface TradeDay {
  /** Ürün → terminal → bugün varan birim. */
  imported: Record<string, Record<string, number>>;
  /** Ürün → bugünkü yükler. */
  loads: Record<string, TradeLoad[]>;
}

/**
 * Sabah planlanan günü defterlere geçirir (Tur 77, `prepareTradeDay`):
 *
 * - Varış şehrinin ödemesi (malın ve nakliyenin bedeli) terminalin mal
 *   maliyetinde; nakit pazar adımının sonunda bugünkü kârla.
 * - Yolu biten mal nakliye dahil maliyetiyle şirketin havuzuna giriyor:
 *   kendi üretimi gibi, iç transferi defterlere yazılmıyor (bedeli ödendi).
 * - Çıkış şehrinin yükleri fazladan düşmek üzere ürün başına toplanıyor.
 *
 * Günün yükleri ve ödemeleri siliniyor: bir gün iki kez yazılmasın.
 */
function takeTradeDay(state: GameState, flow: CompanyFlow | undefined): TradeDay | null {
  const trade = state.trade;
  const player = state.companies[state.playerCompanyId];
  if (!trade || !flow || !player) return null;
  const day: TradeDay = { imported: {}, loads: {} };

  for (const payment of trade.payments ?? []) {
    const terminal = state.buildings[payment.terminalId];
    if (terminal) {
      terminal.last.cogs += payment.amount;
      terminal.last.profit -= payment.amount;
    }
    player.today.cogs += payment.amount;
  }
  delete trade.payments;

  const arrived: Record<string, number> = {};
  const onRoad: Shipment[] = [];
  for (const shipment of trade.inbound) {
    if (shipment.daysLeft > 0) {
      shipment.daysLeft -= 1;
      onRoad.push(shipment);
      continue;
    }
    const before = flow.produced[shipment.goodId] ?? 0;
    flow.produced[shipment.goodId] = before + shipment.units;
    flow.ownCost[shipment.goodId] =
      ((flow.ownCost[shipment.goodId] ?? 0) * before + shipment.unitCost * shipment.units) / Math.max(1, before + shipment.units);
    const terminals = (day.imported[shipment.goodId] ??= {});
    terminals[shipment.terminalId] = (terminals[shipment.terminalId] ?? 0) + shipment.units;
    arrived[shipment.lineId] = (arrived[shipment.lineId] ?? 0) + shipment.units;
  }
  trade.inbound = onRoad;
  if (Object.keys(arrived).length > 0) trade.arrived = arrived;
  else delete trade.arrived;

  for (const load of trade.loads ?? []) (day.loads[load.goodId] ??= []).push(load);
  delete trade.loads;
  return day;
}

/** Rakip hatlarının bugünkü defteri (Tur 78): ciro ve mal maliyeti rakibin gününe; nakit pazar adımında. */
function bookRivalLines(state: GameState): void {
  const books = state.trade?.rivalBooks;
  if (!books) return;
  for (const book of books) {
    const company = state.companies[book.companyId];
    if (!company) continue;
    company.today.revenue += book.revenue;
    company.today.cogs += book.cogs;
  }
  delete state.trade!.rivalBooks;
}

/** Ürünün kendi ihtiyacından artanı, hattın yükü önce (Tur 77): yüklenen, pazara kalan, yükün birim bedeli. */
function splitSurplus(
  flow: CompanyFlow,
  goodId: string,
  trade: TradeDay | null,
): { exported: number; surplus: number; unitPrice: number; load: number } {
  const free = Math.max(0, (flow.produced[goodId] ?? 0) - (flow.consumed[goodId] ?? 0));
  const loads = trade?.loads[goodId];
  if (!loads) return { exported: 0, surplus: free, unitPrice: 0, load: 0 };
  let load = 0;
  let value = 0;
  for (const entry of loads) {
    load += entry.units;
    value += entry.units * entry.unitPrice;
  }
  const exported = Math.min(load, free);
  return { exported, surplus: free - exported, unitPrice: load > 0 ? value / load : 0, load };
}

/** Terminalin defterine hattın cirosu ya da gideri; terminal yoksa yalnız şirketin defteri. */
function bookLine(state: GameState, terminalId: string, revenue: number, cogs: number): void {
  const company = state.companies[state.playerCompanyId]!;
  const terminal = state.buildings[terminalId];
  if (terminal) {
    terminal.last.revenue += revenue;
    terminal.last.cogs += cogs;
    terminal.last.profit += revenue - cogs;
    terminal.last.lineRevenue = (terminal.last.lineRevenue ?? 0) + revenue;
  }
  company.today.revenue += revenue;
  company.today.cogs += cogs;
}

/**
 * Hattın terminaldeki payı (Tur 77), üreticilerin defterinden sonra:
 *
 * - Varan malın havuzdaki payı üretici gibi: fazla çıkarsa o payın
 *   yükü ve pazara satılanı varış terminalinin cirosu.
 * - Fazla yükü karşılamadıysa (sabahki tahmin tuttu ama grev başladı)
 *   eksik çıkış şehrinin pazarından alınıyor: terminalin mal maliyetinde,
 *   bedeli de cirosunda. Para yaratılmıyor; eksik fazla fiyatıyla satılıyor.
 *   Hattın her alışı gibi spot fiyattan (Tur 78): olayın maliyet çarpanı
 *   şirketin işletmesine biniyor, mala değil.
 *
 * Döndürdüğü: ürün başına bu eksik, pazardan alınan birim. Hat başına
 * payı şehrin kaydında (`fallback`): gün bitince hattın satırına geçiyor.
 */
function settleTradeGoods(state: GameState, trade: TradeDay, flow: CompanyFlow): Record<string, number> {
  const bought: Record<string, number> = {};
  const goods = new Set([...Object.keys(trade.imported), ...Object.keys(trade.loads)]);
  for (const goodId of goods) {
    const produced = flow.produced[goodId] ?? 0;
    const spot = state.market.spot[goodId] ?? GOOD_BY_ID[goodId]?.basePrice ?? 0;
    const split = splitSurplus(flow, goodId, trade);
    if (produced > 0) {
      // Hattın getirdiği malın pazara kalanı planlı satış (Tur 78): kırığı %5.
      const value = split.exported * split.unitPrice + split.surplus * spot * TRADE_LINE.saleShare;
      for (const [terminalId, units] of Object.entries(trade.imported[goodId] ?? {})) {
        if (value > 0) bookLine(state, terminalId, value * (units / produced), 0);
      }
    }
    // Sabahki tahmin üretim adımıyla aynı hesap; eksik yalnız gün içinde
    // değişen kapasitede (grev). Kayan noktanın kırıntısı eksik sayılmıyor.
    const short = split.load - split.exported;
    if (short <= 1e-6) continue;
    bought[goodId] = short;
    const lines = ((state.trade ??= { inbound: [] }).fallback ??= {});
    for (const load of trade.loads[goodId] ?? []) {
      const units = load.units * (short / split.load);
      bookLine(state, load.terminalId, units * load.unitPrice, units * spot);
      // Hat fazla fiyatını ödemişti; terminalin zararı da hattın malının bedeli (Codex #109).
      const entry = (lines[load.lineId] ??= { units: 0, cost: 0 });
      entry.units += units;
      entry.cost += units * (spot - load.unitPrice);
    }
  }
  return bought;
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
    addDemand(state, building, def, flow.consumed);
  }

  // Şehirler arası hat (Tur 77): varan mal havuza, günün yükü ve ödemesi.
  const trade = takeTradeDay(state, flows[state.playerCompanyId]);
  bookRivalLines(state);

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

        const output = outputOf(state, building);
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

    const output = outputOf(state, building);
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
    // Hattın yükü (Tur 77) fazladan önce gidiyor, bedeli de fazlanın fiyatıyla.
    const produced = flow.produced[good.id] ?? 0;
    const split = splitSurplus(flow, good.id, building.companyId === state.playerCompanyId ? trade : null);
    if (split.exported > 0 && produced > 0) {
      const units = split.exported * (output / produced);
      const revenue = units * split.unitPrice;
      building.last.exported = units;
      building.last.revenue += revenue;
      building.last.profit += revenue;
      company.today.revenue += revenue;
    }
    if (split.surplus > 0 && produced > 0) {
      const share = output / produced;
      const units = split.surplus * share;
      const revenue = units * (state.market.spot[good.id] ?? good.basePrice) * SURPLUS_HAIRCUT;
      building.last.soldToMarket = units;
      building.last.revenue += revenue;
      building.last.profit += revenue;
      company.today.revenue += revenue;
    }

    building.last.capacityUsed = 1;
  }
  const fallback = trade ? settleTradeGoods(state, trade, flows[state.playerCompanyId]!) : undefined;

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
  // Hatta yüklenen mal şehrin pazarından çıkıyor (Tur 77). Hatların
  // pazardan aldığı da (Tur 78); rakip hatlarının getirdiği pazara giriyor:
  // varışta fazla büyüyor, yarının fiyatı düşüyor.
  for (const [goodId, loads] of Object.entries(trade?.loads ?? {})) {
    for (const load of loads) consumed[goodId] = (consumed[goodId] ?? 0) + load.units;
  }
  // (Akışlar spot fiyat adımına kadar duruyor: ihracat baskısı onları okuyor.)
  for (const [goodId, units] of Object.entries(state.trade?.marketOut ?? {})) consumed[goodId] = (consumed[goodId] ?? 0) + units;
  for (const [goodId, units] of Object.entries(state.trade?.marketIn ?? {})) produced[goodId] = (produced[goodId] ?? 0) + units;
  state.market.produced = produced;
  state.market.consumed = consumed;
  // Gün içinde (grev) fazlası yetmeyen yükün eksiği pazardan alındı: o da
  // ihracat baskısına (Codex #108). Tüketimde planlı yükle zaten sayıldı;
  // akışa tüketim sayıldıktan sonra giriyor, iki kez sayılmasın.
  for (const [goodId, units] of Object.entries(fallback ?? {})) {
    const out = ((state.trade ??= { inbound: [] }).marketOut ??= {});
    out[goodId] = (out[goodId] ?? 0) + units;
  }
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
 * Sonradan eklenen ürünün pazar girdileri (Tur 29).
 *
 * Kayıt şeması ürün listesini taşımıyor; deri zinciri gelmeden kaydedilmiş
 * bir şehirde ham deri ve derinin referans hacmi yok. Spot fiyat
 * `reference ?? 1` ile hesaplansaydı ilk fazla üretim fiyatı tabana
 * çökertirdi. Eksik girdi bugünkü bölgelerden türetiliyor — yeni şehirde
 * kurulumdaki nihai ölçekten, burada şimdiki nüfustan; referans yalnızca
 * fazlanın fiyatı ne kadar kırdığını ölçeklediği için yaklaşık yeter.
 * Yeni oyunda hiçbir şey eksik değil, bu adım hiçbir şey yapmıyor.
 */
function backfillMarket(state: GameState): void {
  let missing = false;
  for (const good of TRADED_GOODS) {
    if (state.market.reference[good.id] === undefined) {
      missing = true;
      break;
    }
  }
  if (!missing) return;
  const fresh = referenceVolumes(state.districts);
  for (const good of TRADED_GOODS) {
    if (state.market.reference[good.id] === undefined) state.market.reference[good.id] = fresh[good.id] ?? 0;
    if (state.market.spot[good.id] === undefined) state.market.spot[good.id] = referencePrice(state, good.id);
  }
}

/**
 * Yarının spot fiyatları — günün sonunda koşar.
 *
 * Fiyat yalnızca ARZ FAZLASIYLA düşer, talep artışıyla yükselmez. Sebebi
 * denge kısıtı: hiç üretimi olmayan oyuncu her zaman referans fiyattan
 * almalı, yoksa zincir eklemek onu cezalandırmış olurdu. Yukarı yönlü
 * baskı olaylardan gelir — ve olay, kendi zincirini kurmuş oyuncuyu
 * vurmaz. Tedarik krizinin oyundaki karşılığı tam olarak bu asimetri.
 * Tek istisna şehirler arası hat (Tur 78): hatların şehrin pazarından
 * dışarı aldığı mal fiyatı yükseltiyor (`EXPORT_DEPTH`); yalnız holding'de.
 */
export function runSpotPriceTick(state: GameState): void {
  const mods = collectEventModifiers(state);
  backfillMarket(state);
  const exported = state.trade?.marketOut;

  for (const good of TRADED_GOODS) {
    const produced = state.market.produced[good.id] ?? 0;
    const consumed = state.market.consumed[good.id] ?? 0;
    const target = spotTarget(state, good.id, produced, consumed, exported?.[good.id] ?? 0, mods.goodPrice[good.id] ?? 1);
    state.market.spot[good.id] = nextSpot(state, good.id, state.market.spot[good.id] ?? referencePrice(state, good.id), target);
  }
  // Oyuncunun binalarının akışı, günün sonunda (Codex #110): hat formunun
  // tahmini gün arasında kurulan ya da yıkılan binanın farkını bununla buluyor.
  // Rafların satışı pazar adımında yazılıyor; kayıt ondan sonra, yoksa tahmin
  // bir günlük satış farkını bina değişmiş sanardı (Bugbot #110). Simülasyon
  // okumuyor.
  state.market.own = ownGoodFlows(state);
  // Günün hat akışları (Tur 78) burada bitiyor: kayıtta kalmasın.
  if (state.trade) {
    delete state.trade.marketOut;
    delete state.trade.marketIn;
  }
}

/** Fiyatın yöneldiği değer: şehrin referans fiyatı, olayın çarpanı, fazla kırığı, ihracat baskısı. */
function spotTarget(
  state: GameState,
  goodId: string,
  produced: number,
  consumed: number,
  out: number,
  eventMultiplier: number,
  referenceVolume = state.market.reference[goodId] ?? 1,
): number {
  const reference = Math.max(1, referenceVolume);
  const glut = Math.min(1, Math.max(0, produced - consumed) / reference);
  // Şehrin referans fiyatı (Tur 76): türün bol ya da kıt hammaddesi; dengeli şehirde katalogdaki.
  let target = referencePrice(state, goodId) * eventMultiplier * (1 - GLUT_DEPTH * glut);
  // İhracat baskısı (Tur 78): yalnız hatların pazardan aldığı, şehrin
  // açığına düşen kısmı. Talep artışı fiyatı yükseltmiyor (yukarıdaki
  // kısıt); dışarı giden mal ise şehrin pazarından eksiliyor. Pazardan
  // alım yoksa çarpan hiç yok: hatsız şehir bitine kadar aynı.
  if (out > 0) {
    const pull = Math.min(1, Math.min(out, Math.max(0, consumed - produced)) / reference);
    if (pull > 0) target *= 1 + EXPORT_DEPTH * pull;
  }
  return target;
}

/** Bir günde fiyat hedefe `SPOT_SMOOTHING` kadar yaklaşıyor; taban ve tavan referans fiyatın katı. */
function nextSpot(state: GameState, goodId: string, current: number, target: number): number {
  const base = referencePrice(state, goodId);
  return Math.max(base * SPOT_FLOOR, Math.min(base * SPOT_CEILING, current + (target - current) * SPOT_SMOOTHING));
}

/**
 * Bir malın fiyatı `days` gün sonra, şehrin son günkü akışına bir hattın
 * yükü eklenirse (Tur 80, hat formunun tahmini). Spot fiyat adımıyla aynı
 * formül: fazla kırığı, ihracat baskısı, olayın çarpanı, yumuşatma, taban ve
 * tavan. Akış ve olaylar bugünkü gibi sayılıyor; simülasyon bunu okumuyor.
 *
 * - `consumed`: şehrin pazarından eklenen çıkış (hattın yükü),
 * - `out`: pazardan alınan kısmı, şehrin bugünkü öbür hat alımlarıyla,
 * - `produced`: şehre eklenen varış (hattın getirdiği).
 */
/** Oyuncunun binalarının bugünkü akışı eksi pazarın kaydındaki (dünkü); kayıt yoksa sıfır. */
function ownFlowDrift(state: GameState, goodId: string): { produced: number; consumed: number } {
  const recorded = state.market.own;
  if (!recorded) return { produced: 0, consumed: 0 };
  const now = ownGoodFlow(state, goodId);
  return { produced: now.produced - (recorded.produced[goodId] ?? 0), consumed: now.consumed - (recorded.consumed[goodId] ?? 0) };
}

export function spotOutlook(
  state: GameState,
  goodId: string,
  extra: { produced?: number; consumed?: number; out?: number },
  days: number,
): number {
  // Pazarın kaydı dünün: oyuncu o günden beri bina kurduysa ya da yıktıysa
  // (Codex #110) kendi akışının farkı ekleniyor; yarınki gün de canlı binalardan sayıyor.
  const drift = ownFlowDrift(state, goodId);
  const produced = (state.market.produced[goodId] ?? 0) + drift.produced + (extra.produced ?? 0);
  const consumed = (state.market.consumed[goodId] ?? 0) + drift.consumed + (extra.consumed ?? 0);
  // Eski kayıtta sonradan eklenen malın referansı ilk fiyat adımına dek yok
  // (`backfillMarket` günün sonunda dolduruyor): tahmin aynı değeri yan
  // etkisiz hesaplıyor (Codex #110).
  const reference = state.market.reference[goodId] ?? referenceVolumes(state.districts)[goodId] ?? 0;
  const target = spotTarget(state, goodId, produced, consumed, extra.out ?? 0, collectEventModifiers(state).goodPrice[goodId] ?? 1, reference);
  let spot = state.market.spot[goodId] ?? referencePrice(state, goodId);
  for (let day = 0; day < days; day++) spot = nextSpot(state, goodId, spot, target);
  return spot;
}
