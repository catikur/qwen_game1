import {
  BUILDINGS,
  BUILDING_BY_ID,
  CATEGORIES,
  GOOD_BY_ID,
  chainOf,
} from '@capital/content';
import type { BuildingDef, CategoryId, GoodDef } from '@capital/content';
import { STRUCTURE_BY_ID } from '@capital/content';
import { buildCost } from './actions';
import { isDistrictOpen, tilePrice } from './systems/city';
import { estimateInvestment } from './systems/market';
import { distributionRelief } from './systems/supply';
import type { BuildingInstance, GameState } from './types';

/**
 * Zincir kartı — oyuncunun tedarik zincirini gördüğü tek nesne.
 *
 * Motor tarafında dönen şey karmaşık: şirket geneli üretim havuzu, spot
 * fiyat, harmanlanmış birim maliyet, dağıtım payı. Oyuncunun görmesi
 * gereken şey ise basit: hangi halka bende, hangisi yetmiyor, hangisini
 * pazardan alıyorum ve şu an atabileceğim en iyi hamle ne.
 *
 * Bu dosya birincisini ikinciye çevirir. Hesabın tamamı türetilmiştir —
 * state'e hiçbir şey yazmaz.
 */

const WAGE_PER_JOB = 42;

/** Spot fiyat tavana bu kadar yaklaşınca "kriz" sayılır. */
const CRISIS_THRESHOLD = 1.25;

/**
 * Bu geri ödemenin üstündeki hamle "henüz erken" sayılır.
 *
 * Rakip yapay zekânın kârlılık kapısı 170 gün; kart oyuncuya ondan biraz
 * daha cömert davranıp 240 güne kadar makul diyor ama üstünü açıkça
 * uyarıyor. Amaç hamleyi gizlemek değil, ne zaman mantıklı olacağını
 * söylemek.
 */
const PREMATURE_PAYBACK_DAYS = 240;

export type ChainSlotKind = 'raw' | 'process' | 'distribution' | 'retail';

/**
 * Bir halkanın durumu. Renk tek başına anlam taşımaz; her durumun
 * arayüzde metin etiketi de vardır.
 */
export type ChainSlotState =
  /** Kendi üretimin ihtiyacını karşılıyor. */
  | 'own'
  /** Üretimin var ama yetmiyor; farkı pazardan alıyorsun. */
  | 'bottleneck'
  /** Hiç üretimin yok, tamamı spot. */
  | 'market'
  /** Spot fiyat tavana yakın; bu halka marjını yiyor. */
  | 'crisis'
  /** Bu halka bu ürün için yok (zincirsiz ürünler). */
  | 'none';

export interface ChainSlot {
  kind: ChainSlotKind;
  /** Yuvanın başlığı: "Kahve Bahçesi", "2 Kafe", "Dağıtım". */
  label: string;
  state: ChainSlotState;
  stateLabel: string;
  /** Bu halkanın birim maliyete kattığı pay (₺). */
  unitCost: number;
  /** İhtiyacın kendi üretiminden karşılanan oranı 0..1. */
  ratio: number;
  /** İkinci satır: "₺3,40 · %100 arz". */
  detail: string;
}

/** Karttaki tek buton: şu an atılabilecek en iyi hamle. */
export interface ChainMove {
  defId: string;
  name: string;
  cost: number;
  districtId: number;
  districtName: string;
  /** Kurulacak parsel — hesaplanmış, oyuncu haritada aramaz. */
  tileId: number;
  /** Parselde mevcut bir yapı var; önce sahibinden devralınacak. */
  needsBuyout: boolean;
  paybackDays: number;
  /** Hamleden sonra beklenen brüt marj 0..1. */
  projectedMargin: number;
  /**
   * Hamlenin halka maliyetine etkisi (₺/birim, pozitif = ucuzlatıyor).
   *
   * Kartın satış cümlesi "bu ünite girdini ucuzlatır"; bu alan o cümlenin
   * sayısı. §4.8 teşhis deneyi bunun ölçekte eksiye döndüğünü ölçebilsin
   * diye dışarı açıldı — spot çökmüşken kendi üretimin pazardan pahalı
   * hale gelebiliyor ve hamle maliyeti YÜKSELTİYOR.
   */
  costDelta: number;
  /** Neden bu hamle: "Kavurma kapasiten kafelerini besleyemiyor." */
  reason: string;
  affordable: boolean;
  /**
   * Ünitenin bu hamleden sonra dolacak kapasite oranı 0..1.
   *
   * Zincir bir ÖLÇEK oyunudur: bir işleme tesisi yaklaşık beş outlet
   * besler. Üç bakkalla değirmen kurmak teknik olarak mümkün ama
   * kapasitenin üçte biri boş kalır ve yatırım dönmez.
   */
  utilisation: number;
  /** Ölçek henüz yetmiyor: hamle doğru ama zamanı değil. */
  premature: boolean;
  /**
   * Hamle doğru ama SIRASI değil: şirketin önünde daha hızlı dönen bir
   * mağaza fırsatı var.
   *
   * `premature`den ayrı bir alan olması bilinçli — ikisi farklı soruların
   * cevabı. Premature ölçeğe bakar ("bu ünite boş çalışır"), deferred
   * fırsat maliyetine ("ünite dolu çalışır ama aynı nakit mağazada daha
   * hızlı döner"). §4.8 ölçümü frenin gerekçesi: kartı harfiyen izleyen
   * kol 27-43 üniteye çıkıp kuyruk kârının %20-25'ini yiyordu; ünitelerin
   * hiçbirinde delta ≤ 0 ya da kötü geri ödeme yoktu — zarar tamamen
   * 17-55 günlük mağaza fırsatları dururken 100-200 günlük üniteye para
   * bağlamanın bileşik maliyetiydi.
   */
  deferred: boolean;
}

export interface ChainCard {
  goodId: string;
  goodName: string;
  category: CategoryId;
  color: string;
  slots: ChainSlot[];
  /** Bir birimin şirkete toplam maliyeti (₺). */
  unitCost: number;
  /** Ortalama satış fiyatı (₺). */
  salePrice: number;
  /** Brüt marj 0..1. */
  margin: number;
  marketShare: number;
  unitsPerDay: number;
  outlets: number;
  move: ChainMove | null;
  /** Hamle önerilemiyorsa gerekçesi; öneri varsa null. */
  blocked: string | null;
}

const STATE_LABEL: Record<ChainSlotState, string> = {
  own: 'Sende',
  bottleneck: 'Darboğaz',
  market: 'Pazardan',
  crisis: 'Kriz',
  none: 'Yok',
};

function money(value: number): string {
  return `₺${value.toFixed(2)}`;
}

function percent(value: number): string {
  return `%${Math.round(value * 100)}`;
}

/** Bir şirketin bir üründeki günlük üretim ve tüketim hacmi. */
function flowFor(
  state: GameState,
  companyId: string,
  goodId: string,
): { produced: number; consumed: number; units: BuildingInstance[] } {
  let produced = 0;
  let consumed = 0;
  const units: BuildingInstance[] = [];

  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;

    if (def.outputGoodId === goodId) {
      produced += def.capacity;
      units.push(building);
    }

    if (def.role === 'process' && def.outputGoodId) {
      if (GOOD_BY_ID[def.outputGoodId]?.inputGoodId === goodId) consumed += def.capacity;
    }
    if (def.role === 'outlet' && building.stocked.length > 0) {
      const draw = building.last.unitsSold > 0 ? building.last.unitsSold : def.capacity;
      for (const stockedId of building.stocked) {
        if (GOOD_BY_ID[stockedId]?.inputGoodId === goodId) consumed += draw / building.stocked.length;
      }
    }
  }

  return { produced, consumed, units };
}

function slotState(
  produced: number,
  consumed: number,
  spot: number,
  basePrice: number,
): ChainSlotState {
  if (produced <= 0) {
    return spot >= basePrice * CRISIS_THRESHOLD ? 'crisis' : 'market';
  }
  if (consumed > 0 && produced < consumed) return 'bottleneck';
  return 'own';
}

/** Bu ürünün kademesini üreten bina tanımı (katalogda tek olduğu varsayımı). */
function unitDefFor(goodId: string): BuildingDef | undefined {
  return BUILDINGS.find((def) => def.outputGoodId === goodId);
}

/** Yeni bir ünitenin üreteceği birim maliyet: girdi + işletme / kapasite. */
function projectedUnitCost(
  state: GameState,
  def: BuildingDef,
  districtId: number,
  inputCost: number,
): number {
  const district = state.districts[districtId];
  if (!district || def.capacity <= 0) return inputCost;
  const wages = def.jobs * WAGE_PER_JOB * (0.6 + district.incomeLevel);
  return inputCost + (def.upkeepPerDay + wages) / def.capacity;
}

/**
 * Bir bina tanımının kurulabileceği en ucuz parsel.
 *
 * Boş parsel her zaman önce; kalmadıysa mevcut yapısı devralınabilecek
 * parsel. Bu ikinci kademe olmadan oyun geç safhada tıkanıyordu: sanayi
 * ve liman dolduğu anda tüm zincir kartları sessizce "hamle yok" demeye
 * başlıyor, oyuncu neden olduğunu göremiyordu. Şehir kıt — ama kapalı
 * değil; tıkanınca devralırsın.
 */
export function bestPlotFor(
  state: GameState,
  def: BuildingDef,
): { districtId: number; tileId: number; needsBuyout: boolean } | null {
  let best: { districtId: number; tileId: number; needsBuyout: boolean; price: number } | null = null;

  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId) continue;
    const district = state.districts[tile.districtId];
    if (!district) continue;
    if (def.zones && !def.zones.includes(district.archetype)) continue;
    // Kilitli bölge atlanır — YOKSA HEP ORAYI SEÇERDİ: imarsız arazi
    // iskontolu, yani "en ucuz parsel" araması kilitli limanı bulur ve
    // kart alınamaz bir hamle önerirdi. Ölçüldü: bu satır yokken üç
    // seed'de de tek bir rakip zincir kuramadı — hamleleri her hafta
    // imar kapısından dönüyordu.
    if (!isDistrictOpen(state, tile.districtId)) continue;

    const needsBuyout = tile.structureId !== null;
    if (needsBuyout) {
      const structure = STRUCTURE_BY_ID[tile.structureId!];
      // Hiçbir fiyata devredilmeyen yapılar (kamu) hesaba girmez.
      if (!structure || structure.buyoutMultiplier === null) continue;
    }

    const price = tilePrice(state, tile.id);
    if (price <= 0) continue;

    // Boş parsel her zaman devralmadan önce gelir.
    const better =
      !best ||
      (best.needsBuyout && !needsBuyout) ||
      (best.needsBuyout === needsBuyout && price < best.price);
    if (better) best = { districtId: tile.districtId, tileId: tile.id, needsBuyout, price };
  }

  return best ? { districtId: best.districtId, tileId: best.tileId, needsBuyout: best.needsBuyout } : null;
}

/**
 * "İyi mağaza fırsatı" eşiği (gün) — kalibrasyon bandının (17-55g) hemen
 * üstü. Şirketin önünde bu kadar hızlı dönen ve GERÇEKTEN alınabilir bir
 * parsele kurulabilen bir mağaza varken, kart üniteyi TEMPOYA bağlar.
 */
const OUTLET_GOOD_PAYBACK_DAYS = 60;

/**
 * Fren TEMPO, YASAK DEĞİL: iyi mağaza fırsatı varken iki ünite arasında
 * en az bu kadar gün istenir.
 *
 * Mutlak yasak denendi ve ölçüm reddetti: erteleme hiç kalkmıyor (bu
 * şehirde iyi mağaza fırsatı neredeyse daima var), üç tohumda da ünite
 * sayısı sıfıra indi — fren bir sistemi öldürmüştü. Ölçülen optimum ~8-10
 * ünite: yıkım, ünitenin varlığından değil 5 günde bir ünite alıp mağaza
 * bileşiğini boğmaktan geliyordu (§4.8 deneyi). 45 gün, kartı o sarmaldan
 * çıkarırken zinciri oyunda tutuyor; İLK ünite hiç frenlenmez (giriş
 * kapısı ölçek uyarısı, tempo değil) ve mağaza fırsatları kuruduğunda
 * fren kendiliğinden kalkar.
 */
const CHAIN_PACE_DAYS = 45;

/**
 * Şirketin bugün kurabileceği en hızlı dönen mağazanın geri ödemesi.
 *
 * Parsel şartı pazarlık değil: tahmin bölge düzeyinde ve arsa stokunu
 * görmüyor. Şart olmasaydı arazi tamamen tükenmiş bir şehirde bile
 * "mağaza fırsatı var" sanıp zinciri sonsuza dek ertelerdik — fren tam
 * da arazi bittiğinde ELİNİ ÇEKMEK zorunda.
 */
function bestOutletPaybackFor(state: GameState, companyId: string): number {
  const company = state.companies[companyId];
  if (!company) return Number.POSITIVE_INFINITY;

  // Bölgede alınabilir parsel (boş ya da devralınabilir yapı) var mı?
  const acquirable = new Set<number>();
  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId) continue;
    if (!isDistrictOpen(state, tile.districtId)) continue;
    if (tile.structureId) {
      const structure = STRUCTURE_BY_ID[tile.structureId];
      if (!structure || structure.buyoutMultiplier === null) continue;
    }
    acquirable.add(tile.districtId);
  }

  let best = Number.POSITIVE_INFINITY;
  for (const def of BUILDINGS) {
    if (def.role !== 'outlet' && def.role !== 'rental') continue;
    if (company.netWorth < def.unlockNetWorth) continue;
    for (const district of state.districts) {
      if (!acquirable.has(district.id)) continue;
      const estimate = estimateInvestment(state, district.id, def.id, companyId);
      if (!estimate?.direct) continue;
      if (estimate.paybackDays < best) best = estimate.paybackDays;
    }
  }
  return best;
}

/**
 * Kartın alt satırındaki tek hamle.
 *
 * Zincirin en zayıf halkasından başlar: hiç üretimin olmayan ya da
 * yetmeyen ilk kademe. Geri ödeme, yapı menüsünün gösterdiği tahminin
 * aynısıyla — yani rakip yapay zekânın kullandığı matematikle — çıkar.
 */
function bestMove(
  state: GameState,
  companyId: string,
  chain: GoodDef[],
  currentUnitCost: number,
  salePrice: number,
  outletPayback: number,
  daysSinceLastUnit: number,
): { move: ChainMove | null; blocked: string | null } {
  const company = state.companies[companyId];
  if (!company) return { move: null, blocked: null };

  // Hamle önerilemiyorsa SEBEBİ söylenir. Sessiz bir "hamle yok",
  // oyuncuya zincirin bittiğini sanmasına yol açıyordu.
  let blocked: string | null = null;

  // Kökten yaprağa: önce hammadde, sonra ara mal. Zincirin ilk eksik
  // halkasını kapatmak her zaman en çok kazandıran hamledir, çünkü
  // üstündeki her kademenin maliyeti ona bağlıdır.
  for (const link of chain) {
    if (link.tier === 'consumer') continue;

    const flow = flowFor(state, companyId, link.id);
    if (flow.consumed <= 0) continue;
    if (flow.produced >= flow.consumed) continue;

    const def = unitDefFor(link.id);
    if (!def) continue;

    if (company.netWorth < def.unlockNetWorth) {
      blocked ??= `${def.name} için ${Math.round(def.unlockNetWorth / 1000)} B ₺ şirket değeri gerekiyor.`;
      continue;
    }

    const plot = bestPlotFor(state, def);
    if (!plot) {
      blocked ??= `${def.name} kurulacak parsel kalmadı — sanayi ve liman dolu.`;
      continue;
    }
    const districtId = plot.districtId;

    const estimate = estimateInvestment(state, districtId, def.id, companyId);
    if (!estimate || !Number.isFinite(estimate.paybackDays)) continue;

    // Hamleden sonraki birim maliyet: yeni kapasite arz oranını yükseltir,
    // yükselen oran harmanlanmış maliyeti kendi maliyetine doğru çeker.
    const inputCost = link.inputGoodId ? (company.unitCost[link.inputGoodId] ?? 0) : 0;
    const spot = state.market.spot[link.id] ?? link.basePrice;
    const newOwnCost = projectedUnitCost(state, def, districtId, inputCost);
    const newRatio = Math.min(1, (flow.produced + def.capacity) / flow.consumed);
    const newLinkCost = newRatio * newOwnCost + (1 - newRatio) * spot;

    const delta = (company.unitCost[link.id] ?? spot) - newLinkCost;
    const projectedUnit = Math.max(0.01, currentUnitCost - delta);
    const projectedMargin = salePrice > 0 ? (salePrice - projectedUnit) / salePrice : 0;

    const cost = buildCost(state, companyId, def.id);
    const covered = flow.produced / flow.consumed;
    const utilisation = Math.min(1, flow.consumed / (flow.produced + def.capacity));
    const premature = utilisation < 0.5 || estimate.paybackDays > PREMATURE_PAYBACK_DAYS;
    // Fırsat maliyeti freni (§4.8): önünde hızlı dönen GERÇEK bir mağaza
    // fırsatı varken ünite tempoya bağlanır. Premature'la yarışmaz —
    // ölçek uyarısı her zaman önce gelir (daha temel bir itiraz).
    const deferred =
      !premature &&
      outletPayback <= OUTLET_GOOD_PAYBACK_DAYS &&
      daysSinceLastUnit < CHAIN_PACE_DAYS;

    const shortfall = flow.produced > 0
      ? `${link.name} üretimin ihtiyacının ${percent(covered)} kadarını karşılıyor; farkı ${money(spot)} üzerinden pazardan alıyorsun.`
      : `${link.name} tamamen pazardan geliyor: birim ${money(spot)}.`;

    const reason = premature
      ? `${shortfall} Ama ${def.name} günde ${Math.round(def.capacity).toLocaleString('tr-TR')} birim üretir; sen ${Math.round(flow.consumed).toLocaleString('tr-TR')} birim tüketiyorsun — kapasitenin ancak ${percent(utilisation)} kadarı dolar.`
      : deferred
        ? `${shortfall} Ama acelesi yok: aynı nakit bir mağazada ~${Math.round(outletPayback)} günde dönüyor ve son ünitenin üstünden ${Math.max(0, Math.round(daysSinceLastUnit))} gün geçti. Zincir sırası ~${Math.max(1, Math.round(CHAIN_PACE_DAYS - daysSinceLastUnit))} gün sonra.`
        : shortfall;

    return {
      move: {
      defId: def.id,
      name: def.name,
      cost,
      districtId,
      districtName: state.districts[districtId]?.name ?? '',
      tileId: plot.tileId,
      needsBuyout: plot.needsBuyout,
      paybackDays: estimate.paybackDays,
      projectedMargin,
      costDelta: delta,
      reason,
      affordable: company.cash >= cost,
      utilisation,
      premature,
      deferred,
      },
      blocked: null,
    };
  }

  return { move: null, blocked };
}

/**
 * Oyuncunun SATTIĞI her ürün için bir zincir kartı.
 *
 * Satmadığın ürün listelenmez: hiçbir şey satmıyorsan panel boş açılır ve
 * oyuncu hiç ilgilenmediği bir tabloyla karşılaşmaz.
 */
export function chainCards(state: GameState, companyId: string): ChainCard[] {
  const company = state.companies[companyId];
  if (!company) return [];

  // Hangi ürünleri hangi mağazalarda satıyoruz?
  const outletsByGood = new Map<string, BuildingInstance[]>();
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    if (BUILDING_BY_ID[building.defId]?.role !== 'outlet') continue;
    for (const goodId of building.stocked) {
      const list = outletsByGood.get(goodId) ?? [];
      list.push(building);
      outletsByGood.set(goodId, list);
    }
  }

  const cards: ChainCard[] = [];

  // Fırsat maliyeti freni için TEK SEFER hesaplanır: kart başına
  // hesaplansaydı parsel + tahmin taraması kart sayısıyla çarpılırdı.
  const outletPayback = bestOutletPaybackFor(state, companyId);

  // Tempo çapası: şirketin EN YENİ üretim ünitesi. Hiç ünite yoksa
  // sonsuz geçmiş — ilk ünite frene takılmaz, zincire giriş serbest.
  let lastUnitDay = Number.NEGATIVE_INFINITY;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role === 'extract' || role === 'process') {
      lastUnitDay = Math.max(lastUnitDay, building.builtDay);
    }
  }
  const daysSinceLastUnit = state.time.day - lastUnitDay;

  for (const [goodId, outlets] of outletsByGood) {
    const good = GOOD_BY_ID[goodId];
    if (!good?.category) continue;

    const category = CATEGORIES[good.category];
    const chain = chainOf(goodId);
    const slots: ChainSlot[] = [];

    // ---- 1-2. Hammadde ve işleme ----
    for (const link of chain) {
      if (link.tier === 'consumer') continue;

      const flow = flowFor(state, companyId, link.id);
      const spot = state.market.spot[link.id] ?? link.basePrice;
      const blended = company.unitCost[link.id] ?? spot;
      const inputCost = link.inputGoodId ? (company.unitCost[link.inputGoodId] ?? 0) : 0;
      const def = unitDefFor(link.id);
      const state_ = slotState(flow.produced, flow.consumed, spot, link.basePrice);
      const ratio = flow.consumed > 0 ? Math.min(1, flow.produced / flow.consumed) : flow.produced > 0 ? 1 : 0;

      slots.push({
        kind: link.tier === 'raw' ? 'raw' : 'process',
        label:
          flow.units.length > 0
            ? `${flow.units.length > 1 ? `${flow.units.length} ` : ''}${def?.name ?? link.name}`
            : (def?.name ?? link.name),
        state: state_,
        stateLabel: STATE_LABEL[state_],
        // Bu halkanın KENDİ kattığı pay: harmanlanmış maliyetten girdisi düşülür.
        unitCost: Math.max(0, blended - inputCost),
        ratio,
        detail:
          flow.produced > 0
            ? `${money(Math.max(0, blended - inputCost))} · ${percent(ratio)} arz`
            : `${money(Math.max(0, spot - inputCost))} · pazar fiyatı`,
      });
    }

    // ---- 3. Dağıtım ----
    // İki ayrı sayı: kaç mağaza depo menzilinde (oyuncuya gösterilen) ve
    // ortalama indirim (maliyete giren). Karıştırmak, tam kapsamı "%25"
    // gibi göstererek oyuncuya yalan söylerdi.
    let reliefSum = 0;
    let covered = 0;
    for (const outlet of outlets) {
      const relief = distributionRelief(state, outlet);
      reliefSum += relief;
      if (relief > 0) covered += 1;
    }
    const coverage = outlets.length > 0 ? covered / outlets.length : 0;
    const averageRelief = outlets.length > 0 ? reliefSum / outlets.length : 0;
    const retailPaid = good.retailCost * (1 - averageRelief);

    slots.push({
      kind: 'distribution',
      label: 'Dağıtım',
      state: coverage > 0 ? (coverage >= 0.999 ? 'own' : 'bottleneck') : 'market',
      stateLabel: coverage > 0 ? (coverage >= 0.999 ? 'Depolu' : 'Kısmen') : 'Deposuz',
      unitCost: retailPaid,
      ratio: coverage,
      detail:
        coverage > 0
          ? `${money(retailPaid)} · ${covered}/${outlets.length} mağaza depo menzilinde`
          : `${money(retailPaid)} · depo yok`,
    });

    // ---- 4. Satış ----
    let units = 0;
    let revenue = 0;
    for (const outlet of outlets) {
      units += outlet.last.unitsSold;
      revenue += outlet.last.revenue;
    }
    const salePrice = units > 0 ? revenue / units : category.basePrice;
    const outletName = BUILDING_BY_ID[outlets[0]!.defId]?.name ?? 'Mağaza';

    slots.push({
      kind: 'retail',
      label: `${outlets.length} ${outletName}`,
      state: 'own',
      stateLabel: 'Sende',
      unitCost: 0,
      ratio: 1,
      detail: `satış ${money(salePrice)} · ${Math.round(units)} birim/gün`,
    });

    const unitCost = (company.unitCost[goodId] ?? 0) - good.retailCost + retailPaid;
    const margin = salePrice > 0 ? (salePrice - unitCost) / salePrice : 0;

    cards.push({
      goodId,
      goodName: good.name,
      category: good.category,
      color: good.color,
      slots,
      unitCost,
      salePrice,
      margin,
      marketShare: company.marketShare[good.category] ?? 0,
      unitsPerDay: units,
      outlets: outlets.length,
      ...bestMove(state, companyId, chain, unitCost, salePrice, outletPayback, daysSinceLastUnit),
    });
  }

  return cards.sort((a, b) => b.unitsPerDay * b.salePrice - a.unitsPerDay * a.salePrice);
}
