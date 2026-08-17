import { BUILDINGS, NPC_PROFILES } from '@capital/content';
import { pushNews } from '../news';
import { estimateInvestment } from './market';
import { isDistrictOpen, tilePrice } from './city';
import type { AuctionState, GameState } from '../types';

/**
 * Parsel ihalesi.
 *
 * Bugüne kadar arazi alımı "ilk gelen alır"dı: rakip haftada bir karar
 * veriyor, oyuncu istediği an alabiliyordu. Yani oyuncu her zaman
 * kazanıyordu ve arazi hiç çekişmiyordu. Bölge dolduğunda tek çıkış
 * devralmaydı — o da sabit çarpanlı, pazarlıksız.
 *
 * İhale, araziye bir PAZAR veriyor: belediye periyodik olarak gerçekten
 * istenen bir parseli açık artırmaya çıkarıyor, rakipler kendi
 * değerlemelerine göre teklif veriyor ve oyuncu kaybedebiliyor.
 *
 * AKIŞI KESMİYOR. İhale duraklatmıyor; üstte bir çip olarak duruyor ve
 * oyuncu ilgilenmezse kendiliğinden sonuçlanıyor. Kaçırılan ihale bir
 * ceza değil, kaçırılmış bir fırsat. `Capitalism.md`'deki "casual
 * oynanış" sözü bunu gerektiriyor.
 */

/** Kaç günde bir yeni ihale açılır. */
const AUCTION_PERIOD_DAYS = 30;

/** İhale kaç gün açık kalır. */
const AUCTION_DAYS = 3;

/** Bir artırımın en az yükseltmesi gereken oran. */
const MIN_RAISE = 0.05;

/**
 * Değerlemenin taban fiyata göre çıkabileceği en yüksek kat.
 *
 * İlk sürüm değerlemeyi "en iyi binanın 220 günlük kârı" olarak
 * hesaplıyordu ve iki yönden bozuktu:
 *
 * 1. Parseller kazandırdıkları şeye göre çok ucuz (outlet 60–110 günde
 *    dönüyor, arsa onun küçük bir parçası). Kâr ufkuyla değerlemek
 *    7.000 ₺'lik bir parsele 780.000 ₺ teklif ettiriyordu.
 * 2. Sonuç nakitle kırpılınca HER parsel aynı değere iniyordu — yani
 *    teklif hiçbir bilgi taşımıyordu. Oysa açık artırmanın tek amacı
 *    rakibin değerlemesini oyuncuya öğretmek.
 *
 * Şimdiki model taban fiyatın katı: fırsat ne kadar iyiyse kat o kadar
 * yüksek. Arazi fiyatları makul kalıyor ve teklif okunabilir bir sinyal
 * taşıyor.
 */
const MAX_PREMIUM = 4;

/** Bu geri ödemedeki bir fırsat, tabanın tam katına denk sayılır. */
const PREMIUM_REFERENCE_DAYS = 200;

/** Yeni bir ihale açılmalı mı? */
function shouldOpen(state: GameState): boolean {
  if (!state.flags.landAuctions) return false;
  if (state.auction) return false;
  return state.time.day > 0 && state.time.day % AUCTION_PERIOD_DAYS === 0;
}

/**
 * İhaleye çıkarılacak parsel.
 *
 * Rastgele değil: **en gelişmiş bölgedeki en değerli boş parsel.** İhale
 * her zaman gerçekten istenen bir yer için olmalı; kimsenin bakmadığı bir
 * sanayi köşesi için açık artırma yapmak mekaniği anlamsız kılardı.
 */
function pickTile(state: GameState): number | null {
  let bestId: number | null = null;
  let bestValue = 0;

  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId) continue;
    const district = state.districts[tile.districtId];
    if (!district) continue;
    // Kilitli bölgede ihale açılmaz: satılamayan parsele teklif toplamak
    // mekaniği anlamsız kılardı.
    if (!isDistrictOpen(state, tile.districtId)) continue;

    // Değer = arsa değeri × bölgenin nüfusu. İkisi birlikte "burası
    // gerçekten istenen bir yer mi" sorusunu cevaplıyor.
    const value = tile.landValue * Math.max(1, district.population);
    if (value > bestValue) {
      bestValue = value;
      bestId = tile.id;
    }
  }

  return bestId;
}

/**
 * Bir şirketin bu parsele biçtiği en yüksek fiyat.
 *
 * Parselde kurulabilecek binalar arasında en iyi günlük kârı bulur ve
 * onun `VALUATION_DAYS` günlük karşılığını üst sınır sayar. Nakdiyle de
 * sınırlı — kimse ödeyemeyeceği fiyatı vermez.
 */
export function valuationFor(state: GameState, companyId: string, tileId: number): number {
  const tile = state.map.tiles[tileId];
  const company = state.companies[companyId];
  if (!tile || !company) return 0;

  // Parselde kurulabilecek EN İYİ binanın geri ödemesi. Oyuncuya
  // gösterilen tahminin aynısı — rakip asla "kızgınlıktan" fazla ödemez.
  let bestPayback = Number.POSITIVE_INFINITY;
  for (const def of BUILDINGS) {
    if (def.role !== 'outlet' && def.role !== 'rental') continue;
    if (company.netWorth < def.unlockNetWorth) continue;
    if (def.zones && !def.zones.includes(state.districts[tile.districtId]?.archetype ?? 'downtown')) {
      continue;
    }
    const estimate = estimateInvestment(state, tile.districtId, def.id, companyId);
    if (!estimate?.direct) continue;
    if (estimate.paybackDays < bestPayback) bestPayback = estimate.paybackDays;
  }

  const base = tilePrice(state, tileId, companyId);
  if (!Number.isFinite(bestPayback) || bestPayback <= 0) return base;

  const premium = Math.max(1, Math.min(MAX_PREMIUM, PREMIUM_REFERENCE_DAYS / bestPayback));
  return base * premium;
}

/** Açık ihaleye teklif verir; kural ihlali varsa sebebini döner. */
export function placeBid(
  state: GameState,
  companyId: string,
  amount: number,
): { ok: boolean; reason?: string } {
  const auction = state.auction;
  if (!auction) return { ok: false, reason: 'Açık bir ihale yok.' };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: 'Bilinmeyen şirket.' };
  if (auction.bidderId === companyId) {
    return { ok: false, reason: 'En yüksek teklif zaten senin.' };
  }

  const minimum = minimumBid(auction);
  if (amount < minimum) {
    return { ok: false, reason: `En az ${Math.round(minimum)} ₺ teklif vermelisin.` };
  }
  if (amount > company.cash) return { ok: false, reason: 'Nakit yetersiz.' };

  auction.bid = amount;
  auction.bidderId = companyId;
  auction.rounds += 1;
  return { ok: true };
}

/** Bir sonraki geçerli teklif. */
export function minimumBid(auction: AuctionState): number {
  return auction.bidderId === null
    ? auction.reserve
    : Math.ceil(auction.bid * (1 + MIN_RAISE));
}

/**
 * Rakiplerin teklif turu — kimse artırmayana kadar.
 *
 * İlk sürüm günde YALNIZCA BİR geçiş yapıyordu ve ihale fiyat keşfi
 * yapamıyordu: dört teklifçi, üç gün ve %5'lik adımlarla fiyat en fazla
 * 1,05^12 ≈ 1,8 katına çıkabiliyordu, yani kimsenin değerlemesine
 * ulaşamıyordu. Ekranda tuhaf bir çelişki olarak göründü — panel
 * "burada günde 30.690 ₺ kazanırsın" derken en yüksek teklif 5.239 ₺'ydi.
 *
 * Gerçek bir açık artırma hızlıdır: kimse artırmayana kadar sürer ve
 * fiyat ikinci en yüksek değerlemede durur. Fiyat böylece BİLGİ taşıyor —
 * mekaniğin tek amacı da buydu.
 */
const MAX_RAISES_PER_ROUND = 80;

function runBidRound(state: GameState): void {
  const auction = state.auction;
  if (!auction) return;

  let raises = 0;
  let active = true;

  while (active && raises < MAX_RAISES_PER_ROUND) {
    active = false;

    for (const profile of NPC_PROFILES) {
      const company = state.companies[profile.id];
      if (!company) continue;
      if (auction.bidderId === profile.id) continue;

      const valuation = valuationFor(state, profile.id, auction.tileId);
      // Kişilik burada da konuşuyor: arsa spekülatörü değerlemesinin
      // üstüne çıkar (arsa onun asıl işi), ucuzcu altında kalır.
      const appetite =
        profile.trait === 'landlord' ? 1.5 : profile.trait === 'price_cutter' ? 0.7 : 1;
      const ceiling = valuation * appetite;

      const next = minimumBid(auction);
      if (next > ceiling) continue;
      if (next > company.cash) continue;

      auction.bid = next;
      auction.bidderId = profile.id;
      auction.rounds += 1;
      raises += 1;
      active = true;
    }
  }
}

/** İhaleyi kapatır: kazanan varsa parseli devreder. */
function settle(state: GameState): void {
  const auction = state.auction;
  if (!auction) return;

  const tile = state.map.tiles[auction.tileId];
  const district = tile ? state.districts[tile.districtId] : undefined;

  if (!auction.bidderId || !tile) {
    pushNews(
      state,
      'neutral',
      'İhale sonuçsuz kaldı',
      `${district?.name ?? 'Şehirde'} bölgesindeki parsele taban fiyattan teklif gelmedi; parsel normal satışa döndü.`,
    );
    state.auction = null;
    return;
  }

  const winner = state.companies[auction.bidderId];
  if (!winner || winner.cash < auction.bid) {
    // Teklif verdiği günden bu yana parası bittiyse ihale düşer. Sessizce
    // parsel vermek "bedava arsa" kaçağı açardı.
    pushNews(
      state,
      'neutral',
      'İhale düştü',
      `${district?.name ?? 'Şehirde'} bölgesindeki parselin kazananı ödeme yapamadı; parsel normal satışa döndü.`,
    );
    state.auction = null;
    return;
  }

  winner.cash -= auction.bid;
  tile.ownerId = winner.id;

  const isPlayer = winner.id === state.playerCompanyId;
  pushNews(
    state,
    isPlayer ? 'good' : 'rival',
    isPlayer ? 'İhaleyi kazandın' : `${winner.name} ihaleyi kazandı`,
    `${district?.name ?? 'Şehir'} bölgesindeki parsel ${Math.round(auction.bid).toLocaleString('tr-TR')} ₺'ye ` +
      `${isPlayer ? 'senin oldu' : 'el değiştirdi'} — ${auction.rounds} artırım.`,
  );
  state.auction = null;
}

/**
 * Günlük ihale adımı.
 *
 * Sıra önemli: önce kapanış (dünkü ihale bugün bitiyorsa), sonra açılış.
 * Tersi olsaydı yeni açılan ihale aynı gün kapanabilirdi.
 */
export function runAuctionTick(state: GameState): void {
  if (state.auction && state.time.day >= state.auction.endsOnDay) {
    runBidRound(state);
    settle(state);
  } else if (state.auction) {
    runBidRound(state);
  }

  if (!shouldOpen(state)) return;

  const tileId = pickTile(state);
  if (tileId === null) return;

  const district = state.districts[state.map.tiles[tileId]!.districtId];
  state.auction = {
    tileId,
    endsOnDay: state.time.day + AUCTION_DAYS,
    reserve: tilePrice(state, tileId),
    bid: 0,
    bidderId: null,
    rounds: 0,
  };

  pushNews(
    state,
    'neutral',
    'Belediye parsel ihalesine çıktı',
    `${district?.name ?? 'Şehir'} bölgesinde bir parsel ${AUCTION_DAYS} gün açık artırmada. ` +
      `Taban fiyat ${Math.round(state.auction.reserve).toLocaleString('tr-TR')} ₺.`,
  );
}

/** İhaledeki parselde en iyi hangi binanın kurulabileceği — arayüz için. */
export function auctionHint(state: GameState, companyId: string): string | null {
  const auction = state.auction;
  if (!auction) return null;

  const tile = state.map.tiles[auction.tileId];
  if (!tile) return null;

  let bestName: string | null = null;
  let bestProfit = 0;
  for (const def of BUILDINGS) {
    if (def.role !== 'outlet' && def.role !== 'rental') continue;
    const company = state.companies[companyId];
    if (!company || company.netWorth < def.unlockNetWorth) continue;
    const estimate = estimateInvestment(state, tile.districtId, def.id, companyId);
    if (!estimate?.direct) continue;
    if (estimate.dailyProfit > bestProfit) {
      bestProfit = estimate.dailyProfit;
      bestName = def.name;
    }
  }

  if (!bestName) return null;
  return `Burada en iyi hamlen ${bestName} — günde ${Math.round(bestProfit).toLocaleString('tr-TR')} ₺ getirir.`;
}
