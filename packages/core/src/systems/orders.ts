import { getDifficulty } from '@capital/content';
import { pushNews } from '../news';
import { formatMoney } from '../selectors';
import {
  CONTROL_THRESHOLD,
  TOTAL_SHARES,
  buyShares,
  freeFloat,
  sharePrice,
  sharesHeld,
  sharesOutstanding,
} from './equity';
import type { CommandResult, CompanyState, GameState, TakeoverOrder } from '../types';

/**
 * Günlük alım tavanı ve devralma emri (Tur 20).
 *
 * Tur 19'a kadar rakiplerin baskını günde en fazla %3,5 toplayabiliyordu
 * ama oyuncu bir rakibin %51'ini TEK TIKLA alabiliyordu. Hedefin geri
 * alım ve ihraç savunması oyuncuya karşı hiç çalışmıyordu, çünkü
 * savunmanın tepki verecek bir günü olmuyordu. Kural artık iki taraf için
 * aynı: bir şirket başka bir şirketin hissesinden (ya da kendi
 * hissesinden) günde en fazla zorluğun `raidDailyCap` payı kadar alır.
 *
 * Devralma bu yüzden bir SÜREÇ: emir her gün tavan kadar alır, hedef
 * %30'u görünce savunmaya geçer (geri alım, doktrini varsa ihraç), ve
 * dolaşımdaki hisse kontrole yetmez hâle gelirse emir düşer. Oyuncu
 * savaşı kazanabilir ya da kaybedebilir; tek tık değil.
 */

/*
 * FİYAT SINIRI YOK — ölçüm kaldırttı. İlk sürüm emri verildiği günün
 * fiyatının 1,25 katında durduruyordu. Ama fiyat günlük kârdan türeyen
 * güvenle oynuyor: Kilit Market'in güveni üç günde 0,60'tan 1,24'e çıktı,
 * fiyat iki katına vardı ve emir 75 gün bekledi. Sınır oyuncuyu korumuyor,
 * emri donduruyordu. Fiyat zaten defterin 0,6–1,8 katı arasında; oyuncu
 * ilerlemeyi görüyor ve emri istediği gün iptal edebiliyor.
 */

/**
 * Emir kasada bu kadarını bırakır: işletmenin birkaç günlük gideri ya da
 * taban tutar, hangisi büyükse. Devralma uğruna maaşlar kredili hesaba
 * düşmesin.
 */
const ORDER_MIN_RESERVE = 100_000;
const ORDER_RESERVE_DAYS = 5;

/** Bir şirketin hissesinden bir alıcının bir günde alabileceği en fazla adet. */
export function dailyBuyCap(state: GameState, issuerId: string): number {
  const cap = getDifficulty(state.difficulty).raidDailyCap;
  return Math.floor((cap * sharesOutstanding(state, issuerId)) / TOTAL_SHARES);
}

function boughtToday(state: GameState, buyer: CompanyState, issuerId: string): number {
  const log = buyer.purchases;
  if (!log || log.day !== state.time.day) return 0;
  return log.counts[issuerId] ?? 0;
}

function recordPurchase(state: GameState, buyer: CompanyState, issuerId: string, count: number): void {
  if (!buyer.purchases || buyer.purchases.day !== state.time.day) {
    buyer.purchases = { day: state.time.day, counts: {} };
  }
  buyer.purchases.counts[issuerId] = (buyer.purchases.counts[issuerId] ?? 0) + count;
}

/** Bugün bu şirketten daha kaç hisse alınabilir. */
export function capRemaining(state: GameState, buyerId: string, issuerId: string): number {
  const buyer = state.companies[buyerId];
  if (!buyer) return 0;
  return Math.max(0, dailyBuyCap(state, issuerId) - boughtToday(state, buyer, issuerId));
}

/**
 * Oyuncunun elle alımı: `buyShares` + günlük tavan. Geri alım da sayılır —
 * rakibin savunması da tavanlı (`tryBuybackDefense`).
 */
export function playerBuy(state: GameState, buyerId: string, issuerId: string, count: number): CommandResult {
  const wanted = Math.floor(count);
  const remaining = capRemaining(state, buyerId, issuerId);
  if (wanted > 0 && wanted > remaining) {
    const cap = dailyBuyCap(state, issuerId);
    return {
      ok: false,
      reason:
        remaining === 0
          ? `Bugünkü alım tavanı doldu (günde ${cap.toLocaleString('tr-TR')} hisse). Yarın devam edebilirsin.`
          : `Bugün en fazla ${remaining.toLocaleString('tr-TR')} hisse daha alabilirsin (günde ${cap.toLocaleString('tr-TR')}).`,
    };
  }
  const result = buyShares(state, buyerId, issuerId, wanted);
  if (result.ok) recordPurchase(state, state.companies[buyerId]!, issuerId, wanted);
  return result;
}

/** Kontrol için daha kaç hisse gerekiyor (eşik %50'nin üstü). */
export function sharesToControl(state: GameState, buyerId: string, issuerId: string): number {
  const outstanding = sharesOutstanding(state, issuerId);
  return Math.max(0, Math.floor(outstanding * CONTROL_THRESHOLD) + 1 - sharesHeld(state, buyerId, issuerId));
}

function cashReserve(company: CompanyState): number {
  const t = company.today;
  const daily = t.cogs + t.upkeep + t.wages + t.interest;
  return Math.max(ORDER_MIN_RESERVE, daily * ORDER_RESERVE_DAYS);
}

export interface OrderEstimate {
  /** Kontrol için gereken hisse. */
  need: number;
  /** Günlük tavan. */
  cap: number;
  /** Tavanla en az kaç gün (savunma yoksa). */
  days: number;
  /** Bugünkü fiyattan toplam maliyet. */
  cost: number;
  /** Dolaşımdaki hisse kontrole yetiyor mu? */
  floatShort: boolean;
}

export function orderEstimate(state: GameState, buyerId: string, issuerId: string): OrderEstimate {
  const need = sharesToControl(state, buyerId, issuerId);
  const cap = dailyBuyCap(state, issuerId);
  return {
    need,
    cap,
    days: cap > 0 ? Math.ceil(need / cap) : Infinity,
    cost: need * sharePrice(state, issuerId),
    floatShort: need > freeFloat(state, issuerId),
  };
}

export function findOrder(state: GameState, buyerId: string, issuerId: string): TakeoverOrder | undefined {
  return state.companies[buyerId]?.orders?.find((o) => o.issuerId === issuerId);
}

function removeOrder(buyer: CompanyState, issuerId: string): void {
  if (!buyer.orders) return;
  buyer.orders = buyer.orders.filter((o) => o.issuerId !== issuerId);
  if (buyer.orders.length === 0) delete buyer.orders;
}

export function placeTakeoverOrder(state: GameState, buyerId: string, issuerId: string): CommandResult {
  const buyer = state.companies[buyerId];
  const issuer = state.companies[issuerId];
  if (!buyer || !issuer) return { ok: false, reason: 'Bilinmeyen şirket.' };
  if (buyerId === issuerId) return { ok: false, reason: 'Kendi şirketine devralma emri verilmez; geri alımı kullan.' };
  if (findOrder(state, buyerId, issuerId)) return { ok: false, reason: `${issuer.name} için zaten bir emrin var.` };
  if (issuer.lockedUntilDay !== undefined && state.time.day < issuer.lockedUntilDay) {
    return {
      ok: false,
      reason: `${issuer.name} kurucu kilidinde — hisseleri ${issuer.lockedUntilDay - state.time.day} gün sonra piyasaya çıkıyor.`,
    };
  }
  const price = sharePrice(state, issuerId);
  if (price <= 0) return { ok: false, reason: 'Hisse fiyatı yok.' };
  const estimate = orderEstimate(state, buyerId, issuerId);
  if (estimate.need <= 0) return { ok: false, reason: `${issuer.name} zaten senin kontrolünde.` };
  if (estimate.floatShort) {
    return {
      ok: false,
      reason: `Dolaşımda ${freeFloat(state, issuerId).toLocaleString('tr-TR')} hisse var; kontrol için ${estimate.need.toLocaleString('tr-TR')} gerekiyor.`,
    };
  }

  const order: TakeoverOrder = { issuerId, placedDay: state.time.day };
  (buyer.orders ??= []).push(order);
  // Bugünün payı hemen: emri veren oyuncu sonucu aynı gün görsün.
  executeOrder(state, buyer, order);
  return { ok: true };
}

export function cancelTakeoverOrder(state: GameState, buyerId: string, issuerId: string): CommandResult {
  const buyer = state.companies[buyerId];
  if (!buyer || !findOrder(state, buyerId, issuerId)) return { ok: false, reason: 'Süren bir emir yok.' };
  removeOrder(buyer, issuerId);
  return { ok: true };
}

/** Nakit bekleyen emir: durum her gün güncel, haberi emir başına bir kez. */
function waitForCash(state: GameState, buyer: CompanyState, order: TakeoverOrder, name: string): void {
  order.waitingCash = true;
  if (order.warned || !buyer.isPlayer) return;
  order.warned = true;
  pushNews(
    state,
    'bad',
    `${name} emri nakit bekliyor`,
    'Kasada işletmenin birkaç günlük giderinden artan para yok. Para girdikçe emir kendiliğinden devam eder.',
    order.issuerId,
  );
}

/**
 * Bir emrin bugünkü alımı. Kontrol eşiği geçilirse devralmayı her zamanki
 * gibi `runTakeoverTick` yapar; emir ertesi gün hedef yok diye kapanır.
 */
function executeOrder(state: GameState, buyer: CompanyState, order: TakeoverOrder): void {
  const issuer = state.companies[order.issuerId];
  // Hedef yok: devralındı (bizce ya da başkasınca) — haberi devralma tick'i verdi.
  if (!issuer) return removeOrder(buyer, order.issuerId);
  const need = sharesToControl(state, buyer.id, issuer.id);
  if (need <= 0) return;

  const float = freeFloat(state, issuer.id);
  if (need > float) {
    /*
     * SAVUNMA KAZANDI. Hedef hisselerini hazinesine çekti (ya da başka
     * hissedarlar topladı) ve dolaşımda kontrole yetecek hisse kalmadı.
     * Rakipler hisse satmadığı ve ihraç edilen hisseler kurumsal
     * yatırımcıda kaldığı için bu kalıcı: beklemek yalnızca nakit
     * bağlar. Emir düşer, toplanan pay temettü getirmeye devam eder.
     */
    removeOrder(buyer, issuer.id);
    if (buyer.isPlayer) {
      const held = sharesHeld(state, buyer.id, issuer.id);
      const pct = Math.round((held / sharesOutstanding(state, issuer.id)) * 100);
      pushNews(
        state,
        'bad',
        `${issuer.name} devralmayı savuşturdu`,
        `Dolaşımda ${float.toLocaleString('tr-TR')} hisse kaldı, kontrol için ${need.toLocaleString('tr-TR')} gerekiyordu. ` +
          `Emir kapandı; elindeki %${pct} pay temettü getirmeye devam ediyor, istersen satabilirsin.`,
        issuer.id,
      );
    }
    return;
  }

  const price = sharePrice(state, issuer.id);
  if (price <= 0) return;
  const affordable = Math.floor(Math.max(0, buyer.cash - cashReserve(buyer)) / price);
  if (affordable <= 0) return waitForCash(state, buyer, order, issuer.name);

  const count = Math.min(capRemaining(state, buyer.id, issuer.id), need, affordable);
  if (count <= 0) return;
  if (!buyShares(state, buyer.id, issuer.id, count).ok) return;
  recordPurchase(state, buyer, issuer.id, count);
  delete order.waitingCash;
}

/** Günlük: rakiplerin hamlesinden sonra, devralma tick'inden önce. */
export function runOrderTick(state: GameState): void {
  for (const company of Object.values(state.companies)) {
    if (!company.orders) continue;
    for (const order of [...company.orders]) executeOrder(state, company, order);
  }
}
