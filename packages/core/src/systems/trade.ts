import { BUILDING_BY_ID, GOOD_BY_ID, TRADED_GOODS, TRADE_LINE } from '@capital/content';
import '../i18n/gameTr';
import { tc } from '../i18n';
import { pushNews } from '../news';
import { fleetUsed, freightTerminals } from './freight';
import { SURPLUS_HAIRCUT, exportableSurplus, ownGoodFlow } from './supply';
import type { BuildingInstance, CommandResult, GameState, TradeLine } from '../types';

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

/** Holding'in hatları. */
export function tradeLines(root: GameState): TradeLine[] {
  return root.holding?.lines ?? [];
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
  /** Fazlayı ve açığı karşılayan kamyon (en az 1, boştaki kamyonla sınırlı). */
  suggestedTrucks: number;
  /** Yükün birim bedeli: çıkışta fazlanın pazar fiyatı. */
  unitPrice: number;
  /** Varış şehrinde malın pazar fiyatı: hattın yerini tuttuğu alım. */
  destinationSpot: number;
  /** Çıkış terminalinin hatlara verebileceği kamyon. */
  freeTrucks: number;
}

/**
 * Hat açılabilir mi; açılırsa kapasitesi, süresi, bedeli ve iki şehrin
 * bugünkü fiyatı. Panel ve komut aynı hesabı kullanıyor.
 */
export function lineQuote(root: GameState, from: number, to: number, goodId: string, trucks: number): LineQuote {
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
  const base = {
    transitDays,
    capacity: lineCapacity(trucks),
    dailyCost: lineDailyCost({ trucks, transitDays }),
    surplus,
    need,
    suggestedTrucks: Math.max(1, Math.min(free, Math.ceil(Math.min(surplus, need) / TRADE_LINE.truckUnits))),
    unitPrice: source && good ? (source.market.spot[goodId] ?? good.basePrice) * SURPLUS_HAIRCUT : 0,
    destinationSpot: target && good ? (target.market.spot[goodId] ?? good.basePrice) : 0,
    freeTrucks: free,
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

export function openLine(root: GameState, from: number, to: number, goodId: string, trucks: number): CommandResult {
  const quote = lineQuote(root, from, to, goodId, trucks);
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

/** Hattı kapatır; yoldaki mal yine varıyor. */
export function closeLine(root: GameState, lineId: string): CommandResult {
  const lines = tradeLines(root);
  if (!lines.some((line) => line.id === lineId)) return { ok: false, reason: tc('core.trade.noSuchLine') };
  root.holding!.lines = lines.filter((line) => line.id !== lineId);
  syncLineTrucks(root);
  return { ok: true };
}

/** Holding'den çıkan şehrin hatları (`closeCity`): şehrin yeri boşalıyor, hatları da. */
export function dropCityLines(root: GameState, seed: number): void {
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

/**
 * Hattın günü, şehirler yaşamadan önce (motorun `runDay`'i). Her hat için:
 * çıkış şehrinin bugünkü fazlası (aynı malı taşıyan öbür hatlardan kalanı),
 * kamyonların kapasitesi ve varış şehrinin kasası ne kadarına yetiyorsa o
 * kadar yük. Yük çıkış şehrinin, ödeme ve yoldaki mal varış şehrinin
 * kaydına; iki şehrin üretim adımı defterlerine yazıyor.
 */
export function prepareTradeDay(root: GameState): void {
  const holding = root.holding;
  if (!holding?.lines || holding.lines.length === 0) return;
  // Günün listeleri üretim adımında siliniyor; yaşamayan şehirde kalmış
  // olsa da ikinci kez yazılmasın (bozuk hat aşağıda kapanıyor).
  for (const city of tradeCities(root)) {
    delete city.trade?.loads;
    delete city.trade?.payments;
  }
  closeBrokenLines(root);
  syncLineTrucks(root);

  const surplus = new Map<string, number>();
  const budget = new Map<number, number>();
  for (const line of holding.lines) {
    const source = cityBySeed(root, line.from)!;
    const target = cityBySeed(root, line.to)!;
    const good = GOOD_BY_ID[line.goodId]!;
    const key = `${line.from}|${line.goodId}`;
    const available = surplus.get(key) ?? exportableSurplus(source, line.goodId);
    const cash = budget.get(line.to) ?? target.companies[target.playerCompanyId]?.cash ?? 0;
    const unitPrice = (source.market.spot[line.goodId] ?? good.basePrice) * SURPLUS_HAIRCUT;
    const fixed = lineDailyCost(line);

    let units = Math.min(lineCapacity(line.trucks), available);
    let short: 'surplus' | 'cash' | undefined = units < lineCapacity(line.trucks) ? 'surplus' : undefined;
    let freight = fixed;
    if (cash < fixed) {
      // Kamyonun bedelini ödeyemeyen hat bugün yola çıkmıyor.
      units = 0;
      freight = 0;
      short = 'cash';
    } else if (units * unitPrice > cash - fixed) {
      units = Math.max(0, Math.floor((cash - fixed) / unitPrice));
      short = 'cash';
    }
    const goods = units * unitPrice;
    surplus.set(key, available - units);
    budget.set(line.to, cash - freight - goods);

    if (freight + goods > 0) {
      const trade = (target.trade ??= { inbound: [] });
      (trade.payments ??= []).push({ lineId: line.id, terminalId: line.toTerminalId, amount: freight + goods });
    }
    if (units > 0) {
      (source.trade ??= { inbound: [] }).loads ??= [];
      source.trade.loads!.push({ lineId: line.id, goodId: line.goodId, units, unitPrice, terminalId: line.fromTerminalId });
      (target.trade ??= { inbound: [] }).inbound.push({
        lineId: line.id,
        goodId: line.goodId,
        units,
        unitPrice,
        unitCost: unitPrice + freight / units,
        daysLeft: line.transitDays,
        terminalId: line.toTerminalId,
      });
    }
    line.last = { units, goods, freight, ...(short ? { short } : {}) };
    line.shipped = (line.shipped ?? 0) + units;
    line.goodsPaid = (line.goodsPaid ?? 0) + goods;
    line.freightPaid = (line.freightPaid ?? 0) + freight;
  }
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
