import { BUILDINGS, STRUCTURE_BY_ID, numberLocale } from '@capital/content';
import { pushNews } from '../news';
import { tc } from '../i18n';
import { rivalProfiles } from '../profiles';
import { estimateInvestment } from './market';
import { isDistrictOpen, tilePrice } from './city';
import type { AuctionState, GameState } from '../types';
import { withBuildingIndex } from './buildingIndex';
import { noteFeat } from './feats';
import { isProject, takeRenewalRequest } from './realestate';

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
export const AUCTION_PERIOD_DAYS = 30;

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
 * Dolu parsel (kentsel dönüşüm) ihalesinin açılması için en iyi dolu
 * parselin, en iyi boş parselden bu kat daha değerli olması gerekiyor.
 */
const OCCUPIED_PREMIUM = 2;

/** Bir şehir yapısının ihaleye çıkabilir olması: devredilebilir yapı. */
function auctionableStructure(structureId: string | null): boolean {
  if (!structureId) return false;
  const structure = STRUCTURE_BY_ID[structureId];
  return Boolean(structure && structure.buyoutMultiplier !== null);
}

/**
 * İhaleye çıkarılacak parsel.
 *
 * Rastgele değil: **en gelişmiş bölgedeki en değerli parsel.** İhale
 * her zaman gerçekten istenen bir yer için olmalı; kimsenin bakmadığı bir
 * sanayi köşesi için açık artırma yapmak mekaniği anlamsız kılardı.
 *
 * DOLU PARSEL (Tur 21). Şehir kendi kendine yapılaşıyor (Tur 16) ve
 * merkez önce doluyor: geç oyunda boş parsel yalnızca kenarlarda kalıyor,
 * 1.200. günde hiç kalmıyor. İhale eskiden yalnızca boş parsele bakıyordu;
 * yani şehir doldukça ya kenardaki ucuz bir köşeyi açık artırmaya
 * çıkarıyor ya da hiç açılmıyordu. Artık belediye, şehrin kendi yapısı
 * (bostan, apartman, ofis…) olan bir parseli de "kentsel dönüşüm"
 * ihalesine çıkarabiliyor: kazanan parseli alıyor, yapı yıkılıyor. Taban
 * fiyat sahibinden devralma bedeli (`tilePrice` yapının primini zaten
 * katıyor). Şirket binası olan parsel ihaleye çıkmaz.
 *
 * Eşik: dolu parsel ancak en iyi boş parselin iki katı değerliyse ya da hiç
 * boş parsel yoksa seçiliyor. Erken oyunda boş parsel bol ve merkezde,
 * ihale eskisi gibi davranıyor.
 */
function pickTile(state: GameState): number | null {
  let bestFree: number | null = null;
  let bestFreeValue = 0;
  let bestOccupied: number | null = null;
  let bestOccupiedValue = 0;

  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId) continue;
    if (tile.structureId && !auctionableStructure(tile.structureId)) continue;
    const district = state.districts[tile.districtId];
    if (!district) continue;
    // Kilitli bölgede ihale açılmaz: satılamayan parsele teklif toplamak
    // mekaniği anlamsız kılardı.
    if (!isDistrictOpen(state, tile.districtId)) continue;

    // Değer = arsa değeri × bölgenin nüfusu. İkisi birlikte "burası
    // gerçekten istenen bir yer mi" sorusunu cevaplıyor.
    const value = tile.landValue * Math.max(1, district.population);
    if (tile.structureId) {
      if (value > bestOccupiedValue) {
        bestOccupiedValue = value;
        bestOccupied = tile.id;
      }
    } else if (value > bestFreeValue) {
      bestFreeValue = value;
      bestFree = tile.id;
    }
  }

  if (bestOccupied !== null && (bestFree === null || bestOccupiedValue >= bestFreeValue * OCCUPIED_PREMIUM)) {
    return bestOccupied;
  }
  return bestFree;
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
    // Rakipler proje kurmuyor (Tur 58): dönüşüm hakkının değeri yalnız oyuncuda.
    if (isProject(def)) continue;
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
  if (!auction) return { ok: false, reason: tc('core.auction.noAuction') };

  const company = state.companies[companyId];
  if (!company) return { ok: false, reason: tc('core.auction.unknownCompany') };
  if (auction.bidderId === companyId) {
    return { ok: false, reason: tc('core.auction.alreadyLeading') };
  }

  const minimum = minimumBid(auction);
  if (amount < minimum) {
    return { ok: false, reason: tc('core.auction.minBid', { amount: Math.round(minimum) }) };
  }
  if (amount > company.cash) return { ok: false, reason: tc('core.auction.noCash') };

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
  // Teklif turu parsel ve bina değiştirmiyor (yalnızca teklif): indeks açık.
  withBuildingIndex(state, () => bidRound(state));
}

function bidRound(state: GameState): void {
  const auction = state.auction;
  if (!auction) return;

  let raises = 0;
  let active = true;
  // Değerleme tur boyunca sabit (Tur 43): teklif ne parseli ne kasayı
  // değiştiriyor, kasa ihale kapanınca düşüyor. Her artırmada yeniden
  // hesaplanıyordu; değerleme her bina türü için yatırım tahmini demek ve
  // ihale günü büyük şehirde günün en pahalı kalemiydi.
  const valuations = new Map<string, number>();

  while (active && raises < MAX_RAISES_PER_ROUND) {
    active = false;

    for (const profile of rivalProfiles(state)) {
      const company = state.companies[profile.id];
      if (!company) continue;
      if (auction.bidderId === profile.id) continue;

      let valuation = valuations.get(profile.id);
      if (valuation === undefined) {
        valuation = valuationFor(state, profile.id, auction.tileId);
        valuations.set(profile.id, valuation);
      }
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
      tc('core.auction.noBidTitle'),
      tile?.structureId
        ? tc('core.auction.noBidRenewalBody', { district: district?.name ?? tc('core.auction.inCity') })
        : tc('core.auction.noBidBody', { district: district?.name ?? tc('core.auction.inCity') }),
      { tileId: auction.tileId },
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
      tc('core.auction.failedTitle'),
      tc('core.auction.failedBody', { district: district?.name ?? tc('core.auction.inCity') }),
      { tileId: auction.tileId },
    );
    state.auction = null;
    return;
  }

  winner.cash -= auction.bid;
  tile.ownerId = winner.id;
  if (winner.id === state.playerCompanyId) noteFeat(state, 'auctionsWon');
  // Kentsel dönüşüm: yapı yıkılır, parsel boş olarak el değiştirir. Parsel
  // dönüşüm hakkını taşıyor (Tur 58): üstüne kurulan proje imar artışıyla.
  const razed = tile.structureId ? STRUCTURE_BY_ID[tile.structureId]?.name ?? tc('core.auction.structure') : null;
  if (tile.structureId) tile.renewal = { day: state.time.day, structureId: tile.structureId };
  tile.structureId = null;
  tile.structureHeight = 0;

  const isPlayer = winner.id === state.playerCompanyId;
  pushNews(
    state,
    isPlayer ? 'good' : 'rival',
    isPlayer ? tc('core.auction.wonTitle') : tc('core.auction.wonRivalTitle', { name: winner.name }),
    tc(isPlayer ? 'core.auction.wonBody' : 'core.auction.wonRivalBody', {
      district: district?.name ?? tc('core.auction.city'),
      price: Math.round(auction.bid).toLocaleString(numberLocale()),
      rounds: auction.rounds,
    }) + (razed ? ` ${tc('core.auction.razed', { structure: razed })}` : ''),
    { tileId: auction.tileId, ...(isPlayer ? {} : { companyId: winner.id }) },
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

  // Oyuncunun dönüşüm başvurusu (Tur 58) sıradaki ihalenin parseli.
  const requested = takeRenewalRequest(state);
  const tileId = requested ?? pickTile(state);
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

  const structureId = state.map.tiles[tileId]!.structureId;
  const occupied = structureId ? STRUCTURE_BY_ID[structureId]?.name ?? tc('core.auction.aStructure') : null;
  pushNews(
    state,
    'neutral',
    occupied ? tc('core.auction.openedRenewalTitle') : tc('core.auction.openedTitle'),
    (occupied
      ? tc('core.auction.openedRenewalBody', {
          district: district?.name ?? tc('core.auction.city'),
          structure: occupied,
          days: AUCTION_DAYS,
          price: Math.round(state.auction.reserve).toLocaleString(numberLocale()),
        })
      : tc('core.auction.openedBody', {
          district: district?.name ?? tc('core.auction.city'),
          days: AUCTION_DAYS,
          price: Math.round(state.auction.reserve).toLocaleString(numberLocale()),
        })) + (requested !== null ? ` ${tc('core.realestate.requestOpened')}` : ''),
    { tileId: state.auction.tileId },
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
    const estimate = estimateInvestment(state, tile.districtId, def.id, companyId, auction.tileId);
    if (!estimate?.direct) continue;
    if (estimate.dailyProfit > bestProfit) {
      bestProfit = estimate.dailyProfit;
      bestName = def.name;
    }
  }

  if (!bestName) return null;
  return tc('core.auction.hint', { building: bestName, profit: Math.round(bestProfit).toLocaleString(numberLocale()) });
}
