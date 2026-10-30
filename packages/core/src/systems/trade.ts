import { BUILDING_BY_ID, GOOD_BY_ID, TRADED_GOODS, TRADE_LINE, TRADE_RIVAL } from '@capital/content';
import '../i18n/gameTr';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { rivalProfile } from '../profiles';
import { fleetUsed, freightTerminals } from './freight';
import { SURPLUS_HAIRCUT, exportableSurplus, ownGoodFlow, spotOutlook } from './supply';
import type { BuildingInstance, CityTrade, CommandResult, GameState, RivalLine, TradeLine } from '../types';

/**
 * Şehirler arası hat (Tur 77).
 *
 * Holding'in şehirleri Tur 30'dan beri birlikte yaşıyor ama malları
 * birbirine geçmiyordu: her şehrin tedarik havuzu kendi içinde kapanıyordu.
 * Hat iki şehrin nakliye terminalini tek bir malla bağlıyor: mal bir
 * şehirde üretiliyor, öbüründe havuza (ve oradan rafa) giriyor.
 *
 * GÜN. Hatlar holding'de; şehirler sırayla yaşıyor (oynanan önce, sonra
 * uzaktakiler), bu yüzden hattın günü bütün şehirler yaşamadan ÖNCE
 * planlanıyor (`prepareTradeDay`): çıkış şehrinin bugünkü fazlası üretim
 * adımının hesabıyla tahmin ediliyor (`exportableSurplus`), kamyonların
 * taşıyabildiği kadarı yükleniyor. Yük ve ödeme iki şehrin kendi
 * defterine, kendi üretim adımında yazılıyor: aynı gün, para yaratılmadan.
 *
 * PARA. Çıkış şehri nötr: yüklenen mal fazlanın pazar fiyatıyla
 * (spot × %85) satılıyor, üreticiler pazara satmış gibi kazanıyor. Varış
 * şehri malın bedelini ve nakliyeyi ödüyor (terminalin mal maliyetinde);
 * mal yolu bitince nakliye dahil maliyetiyle havuza giriyor ve şehrin
 * pazardan alacağının yerini tutuyor. Holding'in kazancı fazla satarken
 * kırılan fiyat eksi nakliye. Varış şehrinin kasası yetmezse sefer
 * yetebildiği kadar.
 *
 * BİLANÇO. Yoldaki mal varış şehrinin varlığı: net değere malın bedeliyle
 * giriyor (`inTransitValue`); nakliye gider. Hat kapanınca yoldaki mal yine
 * varıyor; varış şehri kaybedilirse onunla gidiyor.
 *
 * KURALLAR. Hat için iki şehirde de terminal gerekiyor; kamyonlar çıkış
 * terminalinin filosundan (taşıma sözleşmeleriyle ortak). Bir şehir aynı
 * malı hem alıp hem gönderemiyor: mal şehirler arasında dönüp durmasın.
 * Şehir kaybedilir ya da terminal yıkılırsa hat ertesi sabah kapanıyor.
 * Lig koşusunda holding yok, hat da yok: simülasyon izi aynı.
 *
 * FİYAT (Tur 78). Hat fazla yetmezse eksiğini çıkış şehrinin pazarından
 * alabiliyor (`buy`): pazarın fiyatından (spot), bedeli varış şehrinden.
 * Hattın her fiyatı spot fiyattan: fazla × %85, pazardan alış × 1, varışta
 * satış × %95. Olayların maliyet çarpanı mala değil şirketin işletmesine
 * biniyor (girdiyle perakende işlemenin toplamına); sabah planı çıkış
 * şehrinin olaylarından önce koştuğu için hat ona hiç bakmıyor: olayın
 * başladığı ya da bittiği gün de fiyat aynı (Codex #108). Böylece hat üretimsiz de çalışıyor:
 * malı bir şehirde ucuza alıp öbüründe kendi ihtiyacına ya da pazara
 * veriyor; hattın pazara satışı planlı, kırığı üretim fazlasının %15'i
 * değil %5'i (`TRADE_LINE.saleShare`). Pazardan alınan çıkış şehrinin
 * tüketimine girip fiyatı yükseltiyor (ihracat baskısı), varışta artan
 * şehrin üretimine girip düşürüyor: fark iki uçtan daralıyor.
 * Rakipler oyuncunun pazara satışta kârlı yolunu kopyalıyor (`TRADE_RIVAL`):
 * onların malı da varışın fazlası, fark daralıyor.
 */

/** Holding'in şehirleri: oynanan, sonra uzaktakiler. */
export function tradeCities(root: GameState): GameState[] {
  return [root, ...(root.holding?.dormant ?? []).map((city) => city.state)];
}

/** Holding'de bu tohumla anılan şehir. */
export function cityBySeed(root: GameState, seed: number): GameState | undefined {
  return tradeCities(root).find((city) => city.meta.seed === seed);
}

/** 32 bitlik karıştırma (murmur3'ün sonu): her girdi biti her çıktı bitine dokunsun. */
function mix(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** İki şehrin arası (gün), şehir çiftinin tohumlarından: iki yönde aynı. */
export function transitDaysBetween(a: number, b: number): number {
  const lo = Math.min(a >>> 0, b >>> 0);
  const hi = Math.max(a >>> 0, b >>> 0);
  const hash = mix(Math.imul(lo, 0x9e3779b1) ^ mix(hi));
  return TRADE_LINE.minTransitDays + (hash % (TRADE_LINE.maxTransitDays - TRADE_LINE.minTransitDays + 1));
}

/** Hattın günlük bedeli: kamyon başına, yolun her günü için; boş giden kamyonun da. */
export function lineDailyCost(line: Pick<TradeLine, 'trucks' | 'transitDays'>): number {
  return line.trucks * TRADE_LINE.truckCostPerTransitDay * line.transitDays;
}

/** Hattın günde taşıyabildiği birim. */
export function lineCapacity(trucks: number): number {
  return trucks * TRADE_LINE.truckUnits;
}

/** Dolu giden kamyonla birim başına nakliye. */
export function freightPerUnit(transitDays: number): number {
  return (TRADE_LINE.truckCostPerTransitDay * transitDays) / TRADE_LINE.truckUnits;
}

/** Hattın şehrin pazarından aldığı bir birimin bedeli: pazarın fiyatı (spot); olayın maliyet çarpanı işletmeye biniyor, mala değil. */
export function marketBuyPrice(city: GameState, goodId: string): number {
  return city.market.spot[goodId] ?? GOOD_BY_ID[goodId]?.basePrice ?? 0;
}

/** İki şehir arasında bir malın bugünkü birim hesabı (Tur 78). */
export interface LineMargins {
  transitDays: number;
  /** Çıkışta ve varışta pazarın fiyatı (spot). */
  originSpot: number;
  destinationSpot: number;
  /** Çıkışta pazardan alışın birim bedeli (spot). */
  buyPrice: number;
  /** Çıkışta fazlanın birim bedeli (spot × %85). */
  surplusPrice: number;
  /** Dolu kamyonla birim başına nakliye. */
  freight: number;
  /** Pazardan alıp varışta pazara satmanın birim kârı: varış spot × %95 (hattın satışı) − alış − nakliye. */
  market: number;
  /** Pazardan alıp varışta kendi ihtiyacına vermenin birim kârı: varışta pazardan alacağının bedeli − alış − nakliye. */
  need: number;
}

/** Bir malın iki şehir arasındaki birim hesabı; şehir ya da mal yoksa `undefined`. */
export function lineMargins(root: GameState, from: number, to: number, goodId: string): LineMargins | undefined {
  const source = cityBySeed(root, from);
  const target = cityBySeed(root, to);
  const good = GOOD_BY_ID[goodId];
  if (!source || !target || !good || from === to) return undefined;
  const transitDays = transitDaysBetween(from, to);
  const originSpot = source.market.spot[goodId] ?? good.basePrice;
  const destinationSpot = target.market.spot[goodId] ?? good.basePrice;
  const buyPrice = marketBuyPrice(source, goodId);
  const freight = freightPerUnit(transitDays);
  return {
    transitDays,
    originSpot,
    destinationSpot,
    buyPrice,
    surplusPrice: originSpot * SURPLUS_HAIRCUT,
    freight,
    market: destinationSpot * TRADE_LINE.saleShare - buyPrice - freight,
    need: marketBuyPrice(target, goodId) - buyPrice - freight,
  };
}

/** Şehirlerin fiyat tablosunun bir satırı (Tur 78). */
export interface PriceBoardRow {
  goodId: string;
  /** Şehirlerin bugünkü fiyatı, holding'in sırasıyla (oynanan önce); `ratio` katalog fiyatına oran. */
  prices: Array<{ seed: number; spot: number; ratio: number }>;
  /** Pazardan alıp pazara satmanın en kârlı yönü; kârlı yön yoksa yok. */
  best?: { from: number; to: number; margin: number };
}

/** Holding'in ayakta şehirlerinde her malın fiyatı ve en kârlı yönü; tek şehirde boş. */
export function priceBoard(root: GameState): PriceBoardRow[] {
  const cities = tradeCities(root).filter((city) => !city.gameOver);
  if (cities.length < 2) return [];
  return TRADED_GOODS.map((good) => {
    const prices = cities.map((city) => {
      const spot = city.market.spot[good.id] ?? good.basePrice;
      return { seed: city.meta.seed, spot, ratio: good.basePrice > 0 ? spot / good.basePrice : 1 };
    });
    let best: PriceBoardRow['best'];
    for (const a of cities) {
      for (const b of cities) {
        const margins = lineMargins(root, a.meta.seed, b.meta.seed, good.id);
        if (margins && margins.market > 0 && (!best || margins.market > best.margin)) best = { from: a.meta.seed, to: b.meta.seed, margin: margins.market };
      }
    }
    return { goodId: good.id, prices, ...(best ? { best } : {}) };
  });
}

/** Holding'in hatları. */
export function tradeLines(root: GameState): TradeLine[] {
  return root.holding?.lines ?? [];
}

/** Rakiplerin hatları (Tur 78). */
export function rivalLines(root: GameState): RivalLine[] {
  return root.holding?.rivalLines ?? [];
}

/** Bu yolu kopyalayan rakip hattı. */
export function rivalLineOn(root: GameState, from: number, to: number, goodId: string): RivalLine | undefined {
  return rivalLines(root).find((line) => line.from === from && line.to === to && line.goodId === goodId);
}

/**
 * Oyuncunun yolunu rakibin kopyalamasına kalan (Tur 78), hattın satırı
 * için: yol kaç gündür kârlı, eşiğe kaç gün var. Yol kârlı değilse, yolu
 * bir rakip zaten taşıyorsa ya da varışta rakip rekabeti kapalıysa yok.
 * Eşiğe varan yolda `left` sıfır: kopya her sabah yeniden deneniyor, nakdi
 * yeten ilk rakip giriyor (Bugbot #108).
 */
export function rivalCopyCountdown(root: GameState, line: TradeLine): { days: number; left: number } | undefined {
  const days = line.profitableDays ?? 0;
  if (days <= 0 || !cityBySeed(root, line.to)?.flags.npcCompetition || rivalLineOn(root, line.from, line.to, line.goodId)) return undefined;
  return { days, left: Math.max(0, TRADE_RIVAL.entryDays - days) };
}

/** Terminalin hatlara verebileceği kamyon: filo eksi sözleşmeler ve öbür hatlar. */
function freeTrucks(city: GameState, terminal: BuildingInstance, line?: TradeLine): number {
  const fleet = BUILDING_BY_ID[terminal.defId]?.fleet ?? 0;
  const own = line && line.fromTerminalId === terminal.id ? line.trucks : 0;
  return Math.max(0, fleet - fleetUsed(city, terminal.id) + own);
}

/** Çıkış terminali: en çok boş kamyonu olan (eşitlikte parsel sırası). */
function originTerminal(city: GameState): BuildingInstance | undefined {
  let best: BuildingInstance | undefined;
  for (const terminal of freightTerminals(city)) {
    if (!best || freeTrucks(city, terminal) > freeTrucks(city, best)) best = terminal;
  }
  return best;
}

/** Hattın bir ucu hâlâ geçerli mi: şehir ayakta, terminal oyuncunun ve filolu. */
function terminalAlive(city: GameState | undefined, terminalId: string): city is GameState {
  if (!city || city.gameOver) return false;
  const terminal = city.buildings[terminalId];
  return Boolean(terminal && terminal.companyId === city.playerCompanyId && (BUILDING_BY_ID[terminal.defId]?.fleet ?? 0) > 0);
}

function cityName(city: GameState | undefined): string {
  return city?.cityName ?? '';
}

function goodName(goodId: string): string {
  return GOOD_BY_ID[goodId]?.name ?? goodId;
}

/** Terminallerin hatlara ayırdığı kamyon, holding'in hatlarından (uzaktaki şehrin taşıma adımı bunu okuyor). */
function syncLineTrucks(root: GameState): void {
  const held = new Map<string, number>();
  for (const line of tradeLines(root)) held.set(`${line.from}|${line.fromTerminalId}`, (held.get(`${line.from}|${line.fromTerminalId}`) ?? 0) + line.trucks);
  for (const city of tradeCities(root)) {
    for (const terminal of freightTerminals(city)) {
      const trucks = held.get(`${city.meta.seed}|${terminal.id}`) ?? 0;
      if (trucks > 0) terminal.lineTrucks = trucks;
      else delete terminal.lineTrucks;
    }
  }
}

export interface LineQuote {
  ok: boolean;
  reason?: string;
  transitDays: number;
  capacity: number;
  dailyCost: number;
  /** Çıkış şehrinde bugün kendi ihtiyacından ve aynı malın açık hatlarından artan (birim). */
  surplus: number;
  /** Varış şehrinde bugün kendi üretiminin ve aynı malı getiren hatların karşılamadığı (birim). */
  need: number;
  /**
   * Fazlayı ve açığı karşılayan kamyon (en az 1, boştaki kamyonla sınırlı).
   * Pazardan alan hatta fazla sınır değil: açığı karşılayan kamyon.
   */
  suggestedTrucks: number;
  /** Yükün birim bedeli: çıkışta fazlanın pazar fiyatı. */
  unitPrice: number;
  /** Varış şehrinde malın pazar fiyatı: hattın yerini tuttuğu alım. */
  destinationSpot: number;
  /** Çıkış terminalinin hatlara verebileceği kamyon. */
  freeTrucks: number;
  /** Birim hesabı (Tur 78): alış, satış, nakliye, pazara ve ihtiyaca birim kâr. */
  margins?: LineMargins;
  /** Hattın kendi etkisi (Tur 80): bu kamyonlarla fiyatlar ve birim kâr, pazar oturunca. */
  outlook?: LineOutlook;
}

/**
 * Hattın kendi etkisinin tahmini (Tur 80). Bugünkü fark dar pazarda bir
 * tuzak: dört kamyon silikonun alışını 30 günde %40 yükseltip varışını %39
 * düşürüyordu (Tur 79). Tahmin iki şehrin son günkü akışına hattın yükünü
 * ekleyip spot fiyat adımının formülünü (`spotOutlook`) `days` gün
 * işletiyor. Olaylar bugünkü gibi; rakibin kopyası (aynı gün kadar sonra)
 * sayılmıyor.
 */
export interface LineOutlook {
  days: number;
  /** Çıkışta ve varışta pazarın fiyatı `days` gün sonra. */
  originSpot: number;
  destinationSpot: number;
  /** Hattın birim kârı o gün: varışta satış eksi yükün bedeli (fazla ×%85, alınan tam) ve nakliye. */
  margin: number;
  /** Günlük kârı o gün (birim kâr × yük). */
  daily: number;
  /**
   * Tahminin günlük yükü: varışın kasasının yettiği kadar (Codex #110).
   * Sıfırsa kasa kamyonların bedeline yetmiyor, hat yola çıkmaz.
   */
  units: number;
  /** Varışın kasası yükü kısıyor. */
  cashShort?: true;
  /** Günlük kârı en yüksek kamyon (boştakiyle sınırlı) ve o günlük kâr; hiçbiri kârda değilse 0. */
  bestTrucks: number;
  bestDaily: number;
}

/** Tahminin ufku: kârlı yolu rakibin kopyaladığı gün (pazar o zamana oturuyor: fark her gün %15 kapanıyor). */
const OUTLOOK_DAYS = TRADE_RIVAL.entryDays;

/**
 * Açık hatların pazara henüz yansımayan akışı (Codex #110). Varışın pazarı
 * (`market.produced`) yalnız varan malı sayıyor: dün malı varmamış hattın
 * yükü orada yok, yarınki yükü sabah planından. İlk seferi yoldaki rakip
 * hattı iki şehirde de henüz alıp satmıyor. Tahminin ufku (30 gün) yolu
 * (3–6 gün) aşıyor: bu akışlar o güne pazarda.
 */
function pendingFlows(
  root: GameState,
  plan: PlannedLoad[],
  source: GameState,
  target: GameState,
  goodId: string,
): { originOut: number; destinationIn: number } {
  let originOut = 0;
  let destinationIn = 0;
  const arrived = target.trade?.arrived ?? {};
  for (const load of plan) {
    if (load.line.goodId === goodId && load.line.to === target.meta.seed && !((arrived[load.line.id] ?? 0) > 0)) destinationIn += load.own + load.bought;
  }
  // Dünkü plan (`runRivalLines`) bugünün takvimiyle bir gün önce koştu: ilk seferi yoldaysa yükü sıfırdı.
  const lastPlan = root.time.day - 1;
  for (const rival of rivalLines(root)) {
    if (rival.goodId !== goodId || (rival.last?.units ?? 0) > 0 || lastPlan >= rival.openedDay + rival.transitDays) continue;
    const units = lineCapacity(rival.trucks);
    if (rival.to === target.meta.seed) destinationIn += units;
    if (rival.from === source.meta.seed) originOut += units;
  }
  return { originOut, destinationIn };
}

/** `trucks` kamyonluk hattın `OUTLOOK_DAYS` sonraki fiyatları ve birim kârı; yük varışın kasasının yettiği kadar. */
function outlookFor(
  root: GameState,
  source: GameState,
  target: GameState,
  goodId: string,
  trucks: number,
  buy: boolean,
  surplus: number,
  budget: number,
  pending: { originOut: number; destinationIn: number },
): Omit<LineOutlook, 'bestTrucks' | 'bestDaily'> | undefined {
  const capacity = lineCapacity(trucks);
  const fromSurplus = Math.min(capacity, surplus);
  const fromMarket = buy ? capacity - fromSurplus : 0;
  // Yüksüz hat (fazla yok, pazardan almıyor) fiyatı oynatmıyor; formun öbür satırları söylüyor.
  if (fromSurplus + fromMarket <= 0) return undefined;
  const transitDays = transitDaysBetween(source.meta.seed, target.meta.seed);
  const fixed = lineDailyCost({ trucks, transitDays });
  const good = GOOD_BY_ID[goodId]!;
  const unitPrice = (source.market.spot[goodId] ?? good.basePrice) * SURPLUS_HAIRCUT;
  const { own, bought, cashShort } = fundLoad(budget, fixed, fromSurplus, fromMarket, unitPrice, buy ? marketBuyPrice(source, goodId) : 0);
  const units = own + bought;
  const short = cashShort ? { cashShort: true as const } : {};
  // Çıkışın bugünkü hat alımları da ihracat baskısında (akışları kayıtta kalmıyor).
  let out = bought;
  for (const line of tradeLines(root)) if (line.from === source.meta.seed && line.goodId === goodId) out += line.last?.bought ?? 0;
  for (const rival of rivalLines(root)) if (rival.from === source.meta.seed && rival.goodId === goodId) out += rival.last?.units ?? 0;
  const originSpot = spotOutlook(source, goodId, { consumed: units + pending.originOut, out: out + pending.originOut }, OUTLOOK_DAYS);
  const destinationSpot = spotOutlook(target, goodId, { produced: units + pending.destinationIn }, OUTLOOK_DAYS);
  // Kamyonların bedeline yetmeyen kasa: hat yola çıkmıyor, kâr da zarar da yok.
  if (units <= 0) return { days: OUTLOOK_DAYS, originSpot, destinationSpot, margin: 0, daily: 0, units: 0, ...short };
  const cost = own * originSpot * SURPLUS_HAIRCUT + bought * originSpot + fixed;
  const margin = destinationSpot * TRADE_LINE.saleShare - cost / units;
  return { days: OUTLOOK_DAYS, originSpot, destinationSpot, margin, daily: margin * units, units, ...short };
}

/** Tahmin ve günlük kârı en yüksek kamyon: birim kâr kamyonla azalıyor (varış doyuyor, çıkış pahalanıyor, boş kamyon). */
function lineOutlook(
  root: GameState,
  source: GameState,
  target: GameState,
  goodId: string,
  trucks: number,
  buy: boolean,
  surplus: number,
  free: number,
): LineOutlook | undefined {
  // Yeni hat yarın sabah listenin sonunda (Codex #110): aynı şehre giden açık
  // hatlar kasadan paylarını sabah planının kendisiyle, bugünkü kasa ve
  // fiyatlarla alıyor (dünkü seferleri kasa kısıtlıyken eksik kalmış olabilir).
  const plan = planTradeDay(root);
  const budget = plan.budget.get(target.meta.seed) ?? target.companies[target.playerCompanyId]?.cash ?? 0;
  const pending = pendingFlows(root, plan.loads, source, target, goodId);
  const outlook = outlookFor(root, source, target, goodId, trucks, buy, surplus, budget, pending);
  if (!outlook) return undefined;
  let bestTrucks = 0;
  let bestDaily = 0;
  for (let count = 1; count <= free; count++) {
    const daily = outlookFor(root, source, target, goodId, count, buy, surplus, budget, pending)?.daily ?? 0;
    // Birim kâr eksiye düşünce fazlası da düşüyor: aramayı bitir.
    if (daily <= 0) break;
    if (daily > bestDaily) {
      bestDaily = daily;
      bestTrucks = count;
    }
  }
  return { ...outlook, bestTrucks, bestDaily };
}

/**
 * Hat açılabilir mi; açılırsa kapasitesi, süresi, bedeli ve iki şehrin
 * bugünkü fiyatı. Panel ve komut aynı hesabı kullanıyor.
 */
export function lineQuote(root: GameState, from: number, to: number, goodId: string, trucks: number, buy = false): LineQuote {
  const source = cityBySeed(root, from);
  const target = cityBySeed(root, to);
  const transitDays = transitDaysBetween(from, to);
  const terminal = source ? originTerminal(source) : undefined;
  const free = source && terminal ? freeTrucks(source, terminal) : 0;
  const good = GOOD_BY_ID[goodId];
  const lines = tradeLines(root);
  /*
   * Açık hatların payı (Bugbot #107). Sabah planı fazlayı önce açılan
   * hatlara veriyor: yeni hat çıkışta onların kapasitesinden kalanı
   * yükleyebilir. Varışta da aynı malı getiren hatların taşıdığı (dünkü
   * seferi, ilk günde kapasitesi) açıktan düşülüyor. Düşülmeseydi form ikinci
   * hatta boş giden kamyon önerirdi.
   */
  let claimed = 0;
  let delivered = 0;
  for (const line of lines) {
    if (line.goodId !== goodId) continue;
    if (line.from === from) claimed += lineCapacity(line.trucks);
    if (line.to === to) delivered += line.last?.units ?? lineCapacity(line.trucks);
  }
  const surplus = source && good ? Math.max(0, exportableSurplus(source, goodId) - claimed) : 0;
  const flow = target && good ? ownGoodFlow(target, goodId) : { produced: 0, consumed: 0 };
  const need = Math.max(0, flow.consumed - flow.produced - delivered);
  const margins = lineMargins(root, from, to, goodId);
  const outlook = source && target && good && from !== to && trucks >= 1
    ? lineOutlook(root, source, target, goodId, Math.round(trucks), buy, surplus, free)
    : undefined;
  const base = {
    transitDays,
    capacity: lineCapacity(trucks),
    dailyCost: lineDailyCost({ trucks, transitDays }),
    surplus,
    need,
    suggestedTrucks: Math.max(1, Math.min(free, Math.ceil((buy ? need : Math.min(surplus, need)) / TRADE_LINE.truckUnits))),
    unitPrice: source && good ? (source.market.spot[goodId] ?? good.basePrice) * SURPLUS_HAIRCUT : 0,
    destinationSpot: target && good ? (target.market.spot[goodId] ?? good.basePrice) : 0,
    freeTrucks: free,
    ...(margins ? { margins } : {}),
    ...(outlook ? { outlook } : {}),
  };
  const refuse = (reason: string): LineQuote => ({ ok: false, reason, ...base });

  if (!root.holding) return refuse(tc('core.trade.noHolding'));
  if (from === to) return refuse(tc('core.trade.sameCity'));
  if (!source || !target) return refuse(tc('core.holding.noSuchCity'));
  if (source.gameOver || target.gameOver) return refuse(tc('core.trade.lostCity'));
  if (!good || !TRADED_GOODS.some((entry) => entry.id === goodId)) return refuse(tc('core.trade.badGood'));
  if (lines.length >= TRADE_LINE.maxLines) return refuse(tc('core.trade.maxLines', { max: TRADE_LINE.maxLines }));
  if (lines.some((line) => line.from === from && line.to === to && line.goodId === goodId)) return refuse(tc('core.trade.duplicate'));
  if (lines.some((line) => line.goodId === goodId && (line.to === from || line.from === to))) return refuse(tc('core.trade.chain'));
  if (!terminal) return refuse(tc('core.trade.noTerminal', { city: cityName(source) }));
  if (freightTerminals(target).length === 0) return refuse(tc('core.trade.noTerminal', { city: cityName(target) }));
  if (free < 1) return refuse(tc('core.trade.fleetFull'));
  if (!Number.isInteger(trucks) || trucks < 1 || trucks > free) return refuse(tc('core.trade.badTrucks', { max: free }));
  return { ok: true, ...base };
}

export function openLine(root: GameState, from: number, to: number, goodId: string, trucks: number, buy = false): CommandResult {
  const quote = lineQuote(root, from, to, goodId, trucks, buy);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const holding = root.holding!;
  const source = cityBySeed(root, from)!;
  const target = cityBySeed(root, to)!;
  const id = holding.nextLineId ?? 1;
  holding.nextLineId = id + 1;
  holding.lines = [
    ...tradeLines(root),
    {
      id: `line-${id}`,
      from,
      to,
      fromTerminalId: originTerminal(source)!.id,
      toTerminalId: freightTerminals(target)[0]!.id,
      goodId,
      trucks,
      transitDays: quote.transitDays,
      ...(buy ? { buy: true } : {}),
    },
  ];
  syncLineTrucks(root);
  return { ok: true };
}

export function setLineTrucks(root: GameState, lineId: string, trucks: number): CommandResult {
  const line = tradeLines(root).find((entry) => entry.id === lineId);
  if (!line) return { ok: false, reason: tc('core.trade.noSuchLine') };
  const source = cityBySeed(root, line.from);
  const terminal = source?.buildings[line.fromTerminalId];
  if (!source || !terminal || !terminalAlive(source, line.fromTerminalId)) return { ok: false, reason: tc('core.trade.noTerminal', { city: cityName(source) }) };
  const max = freeTrucks(source, terminal, line);
  if (!Number.isInteger(trucks) || trucks < 1 || trucks > max) return { ok: false, reason: tc('core.trade.badTrucks', { max }) };
  line.trucks = trucks;
  syncLineTrucks(root);
  return { ok: true };
}

/** Hat fazla yetmezse eksiğini çıkış şehrinin pazarından alsın mı (Tur 78); ertesi sabahtan. */
export function setLineBuy(root: GameState, lineId: string, buy: boolean): CommandResult {
  const line = tradeLines(root).find((entry) => entry.id === lineId);
  if (!line) return { ok: false, reason: tc('core.trade.noSuchLine') };
  if (buy) line.buy = true;
  else delete line.buy;
  return { ok: true };
}

/** Hattı kapatır; yoldaki mal yine varıyor. */
export function closeLine(root: GameState, lineId: string): CommandResult {
  const lines = tradeLines(root);
  if (!lines.some((line) => line.id === lineId)) return { ok: false, reason: tc('core.trade.noSuchLine') };
  root.holding!.lines = lines.filter((line) => line.id !== lineId);
  syncLineTrucks(root);
  return { ok: true };
}

/** Holding'den çıkan şehrin hatları (`closeCity`): şehrin yeri boşalıyor, hatları da; rakiplerinki de. */
export function dropCityLines(root: GameState, seed: number): void {
  const rivals = rivalLines(root);
  if (rivals.some((line) => line.from === seed || line.to === seed)) {
    const kept = rivals.filter((line) => line.from !== seed && line.to !== seed);
    if (kept.length > 0) root.holding!.rivalLines = kept;
    else delete root.holding!.rivalLines;
  }
  const lines = tradeLines(root);
  if (!lines.some((line) => line.from === seed || line.to === seed)) return;
  root.holding!.lines = lines.filter((line) => line.from !== seed && line.to !== seed);
  syncLineTrucks(root);
}

/**
 * Bozulan hatları kapatır: şehri kaybedilen ya da terminali artık olmayan.
 * Haber oynanan şehre; yoldaki mal varış şehri ayaktaysa yine varıyor.
 */
function closeBrokenLines(root: GameState): void {
  const holding = root.holding!;
  const kept: TradeLine[] = [];
  for (const line of holding.lines ?? []) {
    const source = cityBySeed(root, line.from);
    const target = cityBySeed(root, line.to);
    const sourceOk = terminalAlive(source, line.fromTerminalId);
    const targetOk = terminalAlive(target, line.toTerminalId);
    if (sourceOk && targetOk) {
      kept.push(line);
      continue;
    }
    const reason =
      !target || target.gameOver
        ? tc('core.trade.brokenTargetLost', { city: cityName(target) })
        : !source || source.gameOver
          ? tc('core.trade.brokenSourceLost', { city: cityName(source) })
          : tc('core.trade.brokenTerminal', { city: cityName(sourceOk ? target : source) });
    pushNews(root, 'bad', tc('core.trade.brokenTitle', { from: cityName(source), to: cityName(target), good: goodName(line.goodId) }), reason);
  }
  if (kept.length !== (holding.lines ?? []).length) holding.lines = kept;
}

/** Şehrin bugünkü pazar akışına ekler: hatlara alınan (`marketOut`) ya da rakip hatlarının getirdiği (`marketIn`). */
function addMarketFlow(city: GameState, field: 'marketOut' | 'marketIn', goodId: string, units: number): void {
  const flows = ((city.trade ??= { inbound: [] }) as CityTrade)[field] ??= {};
  flows[goodId] = (flows[goodId] ?? 0) + units;
}

/**
 * Varış şehrinin kasasının yettiği yük: önce kamyonların bedeli, sonra ucuz
 * olan fazla, sonra pazardan alınan. Kamyonun bedeline yetmeyen hat yola
 * çıkmıyor, bedel de ödenmiyor. Sabah planı ve formun tahmini aynı kuralla
 * (Codex #110).
 */
function fundLoad(
  cash: number,
  fixed: number,
  own: number,
  bought: number,
  unitPrice: number,
  buyPrice: number,
): { own: number; bought: number; freight: number; cashShort: boolean } {
  if (cash < fixed) return { own: 0, bought: 0, freight: 0, cashShort: true };
  if (own * unitPrice + bought * buyPrice <= cash - fixed) return { own, bought, freight: fixed, cashShort: false };
  let left = cash - fixed;
  const funded = Math.min(own, Math.max(0, Math.floor(left / unitPrice)));
  left -= funded * unitPrice;
  return { own: funded, bought: buyPrice > 0 ? Math.min(bought, Math.max(0, Math.floor(left / buyPrice))) : 0, freight: fixed, cashShort: true };
}

/** Sabah planında bir hattın bugünkü yükü ve bedelleri. */
interface PlannedLoad {
  line: TradeLine;
  source: GameState;
  target: GameState;
  /** Fazladan ve pazardan yüklenen (birim). */
  own: number;
  bought: number;
  /** Fazlanın birim bedeli (spot × %85). */
  unitPrice: number;
  freight: number;
  goods: number;
  short?: 'surplus' | 'cash';
}

/**
 * Sabah planı, yan etkisiz (Codex #110). Hatlar sırayla: aynı malı aynı
 * şehirden taşıyanlar fazlayı, aynı şehre gidenler kasayı paylaşıyor; kasa
 * önce ucuz olana, fazlaya yetiyor (`fundLoad`). `budget` her varış
 * şehrinin plandan sonra kalan kasası: formun tahmini yeni hattın (listede
 * sonda) payını oradan okuyor. Plan bozuk hattı önce kapatıyor
 * (`closeBrokenLines`); tahmin onu saymıyor.
 */
function planTradeDay(root: GameState): { loads: PlannedLoad[]; budget: Map<number, number> } {
  const surplus = new Map<string, number>();
  const budget = new Map<number, number>();
  const loads: PlannedLoad[] = [];
  for (const line of root.holding?.lines ?? []) {
    const source = cityBySeed(root, line.from);
    const target = cityBySeed(root, line.to);
    if (!terminalAlive(source, line.fromTerminalId) || !terminalAlive(target, line.toTerminalId)) continue;
    const good = GOOD_BY_ID[line.goodId]!;
    const key = `${line.from}|${line.goodId}`;
    const available = surplus.get(key) ?? exportableSurplus(source, line.goodId);
    const cash = budget.get(line.to) ?? target.companies[target.playerCompanyId]?.cash ?? 0;
    const unitPrice = (source.market.spot[line.goodId] ?? good.basePrice) * SURPLUS_HAIRCUT;
    const buyPrice = line.buy ? marketBuyPrice(source, line.goodId) : 0;
    const fixed = lineDailyCost(line);
    const capacity = lineCapacity(line.trucks);

    const fromSurplus = Math.min(capacity, available);
    const fromMarket = line.buy ? capacity - fromSurplus : 0;
    const { own, bought, freight, cashShort } = fundLoad(cash, fixed, fromSurplus, fromMarket, unitPrice, buyPrice);
    const short = cashShort ? 'cash' : fromSurplus + fromMarket < capacity ? 'surplus' : undefined;
    const goods = own * unitPrice + bought * buyPrice;
    surplus.set(key, available - own);
    budget.set(line.to, cash - freight - goods);
    loads.push({ line, source, target, own, bought, unitPrice, freight, goods, ...(short ? { short } : {}) });
  }
  return { loads, budget };
}

/**
 * Hattın günü, şehirler yaşamadan önce (motorun `runDay`'i). Her hat için:
 * çıkış şehrinin bugünkü fazlası (aynı malı taşıyan öbür hatlardan kalanı),
 * pazardan alan hatta eksiği çıkış pazarından (Tur 78), kamyonların
 * kapasitesi ve varış şehrinin kasası ne kadarına yetiyorsa o kadar yük.
 * Kasa önce ucuz olana, fazlaya yetiyor. Yük çıkış şehrinin, ödeme ve
 * yoldaki mal varış şehrinin kaydına; iki şehrin üretim adımı defterlere
 * yazıyor. Sonra rakiplerin hatları.
 */
export function prepareTradeDay(root: GameState): void {
  const holding = root.holding;
  if (!holding || ((holding.lines?.length ?? 0) === 0 && (holding.rivalLines?.length ?? 0) === 0)) return;
  // Günün listeleri üretim adımında siliniyor; yaşamayan şehirde kalmış
  // olsa da ikinci kez yazılmasın (bozuk hat aşağıda kapanıyor).
  for (const city of tradeCities(root)) {
    const trade = city.trade;
    if (!trade) continue;
    delete trade.loads;
    delete trade.payments;
    delete trade.marketOut;
    delete trade.marketIn;
    delete trade.rivalBooks;
    delete trade.fallback;
  }
  closeBrokenLines(root);
  syncLineTrucks(root);

  for (const { line, source, target, own, bought, unitPrice, freight, goods, short } of planTradeDay(root).loads) {
    const units = own + bought;
    if (freight + goods > 0) {
      const trade = (target.trade ??= { inbound: [] });
      (trade.payments ??= []).push({ lineId: line.id, terminalId: line.toTerminalId, amount: freight + goods });
    }
    if (own > 0) {
      (source.trade ??= { inbound: [] }).loads ??= [];
      source.trade.loads!.push({ lineId: line.id, goodId: line.goodId, units: own, unitPrice, terminalId: line.fromTerminalId });
    }
    // Pazardan alınan çıkış şehrinin tüketimine: fazlası eriyor (Tur 78).
    if (bought > 0) addMarketFlow(source, 'marketOut', line.goodId, bought);
    if (units > 0) {
      (target.trade ??= { inbound: [] }).inbound.push({
        lineId: line.id,
        goodId: line.goodId,
        units,
        unitPrice: goods / units,
        unitCost: (goods + freight) / units,
        daysLeft: line.transitDays,
        terminalId: line.toTerminalId,
      });
    }
    line.last = { units, goods, freight, ...(bought > 0 ? { bought } : {}), ...(short ? { short } : {}) };
    line.shipped = (line.shipped ?? 0) + units;
    line.goodsPaid = (line.goodsPaid ?? 0) + goods;
    line.freightPaid = (line.freightPaid ?? 0) + freight;
  }
  runRivalLines(root);
}

/**
 * Bir hattın bugünkü kârı (Tur 79): bugün yüklediği mal varış şehrinin
 * pazar fiyatından planlı satışla (`saleShare`) değerleniyor; eksi malın
 * bedeli ve nakliye. Boş giden kamyonun bedeli de düşüyor. Malı varışta
 * kendi tesisine veren hat da pazara satmış gibi sayılıyor (alçak değer).
 * Bugün seferi yoksa (yeni açıldı) yok.
 */
export function lineProfitToday(root: GameState, line: TradeLine): number | undefined {
  const last = line.last;
  if (!last) return undefined;
  const spot = cityBySeed(root, line.to)?.market.spot[line.goodId] ?? GOOD_BY_ID[line.goodId]?.basePrice ?? 0;
  return last.units * spot * TRADE_LINE.saleShare - last.goods - last.freight;
}

/**
 * Oyuncunun hatlarının bugünkü kârı (Tur 79), ticaret hedefi için:
 * hatların `lineProfitToday` toplamı. Zarar eden gün toplamı azaltıyor;
 * rakip hatları sayılmıyor.
 */
export function tradeProfitToday(root: GameState): number {
  let profit = 0;
  for (const line of tradeLines(root)) profit += lineProfitToday(root, line) ?? 0;
  return profit;
}

/**
 * Günün sonunda, bütün şehirler yaşadıktan sonra (motorun `runDay`'i):
 * gün içinde fazlası yetmeyen yükün pazardan alınanı hattın satırına
 * (Codex #108). Sabah planından sonra grev başlarsa yükün bir kısmı ya da
 * hepsi çıkışın pazarından alınıyor; satır bunu pazardan alınan diye
 * yazıyor. Pazarın fiyatı hattın ödediği fazla fiyatından yüksek: fark da
 * malın bedeline (Codex #109), bugünkü kâr ve ticaret hedefi onu düşüyor.
 * Şehirlerin kaydı siliniyor: kayda geçmesin.
 */
export function settleTradeFallbacks(root: GameState): void {
  if (!root.holding) return;
  const lines = new Map((root.holding.lines ?? []).map((line) => [line.id, line]));
  for (const city of tradeCities(root)) {
    const fallback = city.trade?.fallback;
    if (!fallback) continue;
    delete city.trade!.fallback;
    for (const [lineId, { units, cost }] of Object.entries(fallback)) {
      const line = lines.get(lineId);
      if (!line?.last) continue;
      line.last.bought = (line.last.bought ?? 0) + units;
      line.last.goods += cost;
      line.goodsPaid = (line.goodsPaid ?? 0) + cost;
    }
  }
}

/** Yol rakibin gözünde kârlı: pazara satışta birim kâr, malın çıkıştaki alış fiyatının eşiğini geçiyor. */
function rivalWorthy(margins: LineMargins): boolean {
  return margins.market >= TRADE_RIVAL.entryMargin * margins.buyPrice;
}

/**
 * Kopyalayan rakip: varış şehrinin, günlük yükü `cashDays` gün taşıyacak
 * nakdi olan en zengini. Emlakçı (`landlord`) mal ticaretine girmiyor;
 * rakip rekabeti kapalı şehirde kimse kopyalamıyor.
 */
function copycat(target: GameState, margins: LineMargins): string | undefined {
  if (!target.flags.npcCompetition) return undefined;
  const reserve = lineCapacity(1) * (margins.buyPrice + margins.freight) * TRADE_RIVAL.cashDays;
  let best: { id: string; cash: number } | undefined;
  for (const company of Object.values(target.companies)) {
    if (company.isPlayer || company.cash < reserve) continue;
    if (rivalProfile(target, company.profileId)?.trait === 'landlord') continue;
    if (!best || company.cash > best.cash) best = { id: company.id, cash: company.cash };
  }
  return best?.id;
}

/**
 * Rakiplerin hatları (Tur 78), oyuncunun seferlerinden sonra.
 *
 * Önce oyuncunun yolları: bugün yük taşıyan ve pazara satışta kârlı
 * (`rivalWorthy`) her gün sayılıyor; sayı `entryDays`'e varınca varış
 * şehrinin rakibi aynı yolu bir kamyonla kopyalıyor. Sonra her rakip
 * hattı: `reviewDays`'te bir kamyonunu gözden geçiriyor (kâr sürüyorsa
 * bir ekliyor, zarardaysa bir çekiyor; sıfıra inen kapanıyor). İlk seferi
 * yolu bitince varıyor; o günden sonra malı her gün çıkış pazarından alıp
 * varış pazarına satıyor: çıkışta şehrin tüketimine, varışta üretimine
 * giriyor. Kâr rakibin varış şehrindeki defterine. Rakip ya da şehri
 * yoksa hat sessizce düşüyor.
 */
function runRivalLines(root: GameState): void {
  const holding = root.holding!;
  const day = root.time.day;
  for (const line of holding.lines ?? []) {
    const margins = lineMargins(root, line.from, line.to, line.goodId);
    if (margins && (line.last?.units ?? 0) > 0 && rivalWorthy(margins)) line.profitableDays = (line.profitableDays ?? 0) + 1;
    else delete line.profitableDays;
    if (!margins || (line.profitableDays ?? 0) < TRADE_RIVAL.entryDays || rivalLineOn(root, line.from, line.to, line.goodId)) continue;
    const source = cityBySeed(root, line.from)!;
    const target = cityBySeed(root, line.to)!;
    const companyId = copycat(target, margins);
    if (!companyId) continue;
    const id = holding.nextRivalLineId ?? 1;
    holding.nextRivalLineId = id + 1;
    (holding.rivalLines ??= []).push({
      id: `rival-line-${id}`,
      from: line.from,
      to: line.to,
      goodId: line.goodId,
      companyId,
      trucks: 1,
      transitDays: margins.transitDays,
      openedDay: day,
      reviewDay: day + TRADE_RIVAL.reviewDays,
    });
    const vars = { name: target.companies[companyId]!.name, from: cityName(source), to: cityName(target), good: goodName(line.goodId) };
    pushNews(root, 'bad', tc('core.trade.rivalOpenTitle', vars), tc('core.trade.rivalOpenBody', vars));
  }

  const kept: RivalLine[] = [];
  // Rakibin yolları tek kasadan yüklüyor: bedel varışın üretim adımında
  // deftere giriyor, o güne dek kasa yerinde; aynı şirketin ikinci yolu
  // birincinin bedelini düşülmüş nakitle görüyor (Codex #108).
  const budget = new Map<string, number>();
  for (const rival of holding.rivalLines ?? []) {
    const source = cityBySeed(root, rival.from);
    const target = cityBySeed(root, rival.to);
    const company = target?.companies[rival.companyId];
    const margins = lineMargins(root, rival.from, rival.to, rival.goodId);
    if (!source || !target || source.gameOver || target.gameOver || !company || !margins) continue;
    // Rakip rekabeti kapalı şehirde rakip hamle yapmıyor (bina öngörüsünün
    // kopyaları da onu kapatıyor): kamyonunu gözden geçirmiyor, yükü sürüyor (Codex #108).
    if (target.flags.npcCompetition && day >= rival.reviewDay) {
      if (rivalWorthy(margins)) rival.trucks = Math.min(TRADE_RIVAL.maxTrucks, rival.trucks + 1);
      else if (margins.market < 0) rival.trucks -= 1;
      rival.reviewDay = day + TRADE_RIVAL.reviewDays;
    }
    if (rival.trucks <= 0) {
      const vars = { name: company.name, from: cityName(source), to: cityName(target), good: goodName(rival.goodId) };
      pushNews(root, 'good', tc('core.trade.rivalCloseTitle', vars), tc('core.trade.rivalCloseBody', vars));
      continue;
    }
    kept.push(rival);
    const units = lineCapacity(rival.trucks);
    const cost = units * margins.buyPrice + lineDailyCost(rival);
    const wallet = `${rival.to}:${rival.companyId}`;
    const cash = budget.get(wallet) ?? company.cash;
    // İlk sefer yolda; nakdi yükün bedeline yetmeyen rakip bugün yüklemiyor.
    if (day < rival.openedDay + rival.transitDays || cash < cost) {
      rival.last = { units: 0, margin: margins.market };
      continue;
    }
    budget.set(wallet, cash - cost);
    addMarketFlow(source, 'marketOut', rival.goodId, units);
    addMarketFlow(target, 'marketIn', rival.goodId, units);
    ((target.trade ??= { inbound: [] }).rivalBooks ??= []).push({
      companyId: rival.companyId,
      revenue: units * margins.destinationSpot * TRADE_LINE.saleShare,
      cogs: cost,
    });
    rival.last = { units, margin: margins.market };
  }
  if (kept.length > 0) holding.rivalLines = kept;
  else delete holding.rivalLines;
}

/** Bu şehre yoldaki mal, hat başına: birim ve sefer sayısı. */
export function inboundByLine(city: GameState): Record<string, { units: number; shipments: number; value: number }> {
  const out: Record<string, { units: number; shipments: number; value: number }> = {};
  for (const shipment of city.trade?.inbound ?? []) {
    const entry = (out[shipment.lineId] ??= { units: 0, shipments: 0, value: 0 });
    entry.units += shipment.units;
    entry.shipments += 1;
    entry.value += shipment.units * shipment.unitPrice;
  }
  return out;
}
