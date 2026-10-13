import { CITY_NAMES, CONSUMER_CATEGORIES, HOLDING } from '@capital/content';
import type { CitySizeId } from '@capital/content';
import { simulateCityDay } from './day';
import { tc } from './i18n';
import { pushNews } from './news';
import { formatMoney } from './selectors';
import { recomputeNetWorth } from './systems/city';
import { sharesHeld, sharesOutstanding } from './systems/equity';
import { runGoalTick } from './systems/goals';
import { respondUnion } from './systems/labor';
import { createNewGame } from './worldgen';
import type { CommandResult, DormantCity, GameState, HoldingState } from './types';

/**
 * Holding: birden çok şehir (Tur 22).
 *
 * MODEL: Aynı anda bir şehir OYNANIYOR; oynanan şehrin durumu motorun tek
 * durumu, öbürleri onun `holding` alanında. Hiçbir sistem "hangi şehir"
 * sorusunu bilmek zorunda değil: her şehir tam bir simülasyon.
 *
 * ŞEHİRLER EŞZAMANLI YAŞIYOR (Tur 30). Tur 22'de bekleyen şehir donuktu
 * (takvimi, rakipleri ve gelişimi dururdu) ve kasaya ayrıldığın gündeki kâr
 * eğiliminin yarısı akıyordu — hiç değişmeyen, hiç risk taşımayan bir
 * gelir. Artık her gün oynanan şehirle birlikte bekleyenler de bir gün
 * yaşıyor (`simulateCityDay`): mağazaları satıyor, rakipleri kuruyor ve
 * baskın yapıyor, şehir büyüyor. Oyuncunun yerine yerel müdür yalnızca
 * sendikaya uzlaşmayla cevap veriyor; yeni yatırım ve savunma oyuncunun
 * işi. Baskın %25 ve %40'ı geçince, şehir kaybedilince ya da zafere
 * ulaşınca haber oynanan şehre düşüyor.
 *
 * Kâr payı: bekleyen şehrin o günkü kârının yarısı holding KASASINA
 * aktarılıyor, yarısı şehirde kalıyor. Kasa ayrı, çünkü bu para doğrudan
 * oynanan şehrin kasasına aksaydı şehrin zaferi hiçbir şey yapmadan
 * gelirdi. Kasadan şehre aktarılan sermaye o şehrin zafer hedefine
 * ekleniyor (`importedCapital`), şehirden kasaya çıkan düşülüyor: zafer
 * şehirde yaratılan değerle ölçülüyor.
 *
 * Yeni şehir zafer kazanılan şehirden açılıyor; sermaye o şehrin
 * kasasından taşınıyor, marka bilinirliğinin yarısı da. Rakip kadrosu
 * katalogda kayıyor: ikinci şehir aynı dört rakiple başlamıyor.
 */

/** Oynanan şehrin oyuncu için ŞEHİRDE yarattığı değer: net değer eksi aktarılan sermaye. */
export function cityValue(state: GameState): number {
  const player = state.companies[state.playerCompanyId];
  return (player?.netWorth ?? 0) - (state.importedCapital ?? 0);
}

/** Oyuncunun bir şehirdeki günlük kâr eğilimi (bina kâr ortalamalarının toplamı). */
export function cityTrend(state: GameState): number {
  if (state.gameOver) return 0;
  let total = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    total += building.profitTrend ?? building.last.profit;
  }
  return total;
}

/** Bir şehrin bugünkü kâr payı; Tur 30 öncesi kayıtta henüz yaşamamış şehir için eğilimden. */
export function cityDividend(city: DormantCity): number {
  if (city.state.gameOver) return 0;
  return city.lastDividend ?? Math.max(0, city.trend) * HOLDING.remoteShare;
}

/** Bekleyen şehirlerden holding kasasına dün akan para. */
export function remoteIncome(state: GameState): number {
  let total = 0;
  for (const city of state.holding?.dormant ?? []) total += cityDividend(city);
  return total;
}

/** Oyuncunun hissesinde en büyük dış pay ve baskın eşiği (0: yok, 1: %10, 2: %25, 3: %40). */
export function raidStatus(state: GameState): { stage: number; fraction: number; holderId: string | null } {
  const player = state.companies[state.playerCompanyId];
  if (!player) return { stage: 0, fraction: 0, holderId: null };
  let holderId: string | null = null;
  let top = 0;
  for (const company of Object.values(state.companies)) {
    if (company.isPlayer) continue;
    const count = sharesHeld(state, company.id, player.id);
    if (count > top) {
      top = count;
      holderId = company.id;
    }
  }
  const fraction = top / sharesOutstanding(state, player.id);
  const stage = fraction >= 0.4 ? 3 : fraction >= 0.25 ? 2 : fraction >= 0.1 ? 1 : 0;
  return { stage, fraction, holderId };
}

/** Holding'in toplam değeri: oynanan şehir + bekleyenler + kasa. */
export function holdingNetWorth(state: GameState): number {
  const own = (s: GameState) => (s.gameOver ? 0 : (s.companies[s.playerCompanyId]?.netWorth ?? 0));
  let total = own(state) + (state.holding?.treasury ?? 0);
  for (const city of state.holding?.dormant ?? []) total += own(city.state);
  return total;
}

export function cityCount(state: GameState): number {
  return 1 + (state.holding?.dormant.length ?? 0);
}

function foundingSeed(state: GameState): number {
  return state.holding?.foundingSeed ?? state.meta.seed;
}

/** Holding'in `index`'inci şehrinin adı (kurucu 0). */
export function cityNameAt(seed: number, index: number): string {
  return CITY_NAMES[(((seed >>> 0) % CITY_NAMES.length) + index) % CITY_NAMES.length]!;
}

/** Yeni şehrin tohumu: kurucu tohum ve sıradan, oyunun zarından değil. */
function citySeed(seed: number, index: number): number {
  return (Math.imul((seed ^ 0x27d4eb2d) >>> 0, 2654435761) ^ Math.imul(index, 40503)) >>> 0 || 1;
}

/** Yeni şehir açılabilir mi; açılabiliyorsa sermaye aralığı. */
export function openCityQuote(state: GameState): { ok: boolean; reason?: string; maxCapital: number; name: string } {
  const player = state.companies[state.playerCompanyId]!;
  const opened = state.holding?.opened ?? 1;
  const name = cityNameAt(foundingSeed(state), opened);
  const closed = (reason: string) => ({ ok: false, reason, maxCapital: 0, name });
  if (state.league) return closed(tc('core.holding.leagueNoNewCity'));
  if (state.gameOver) return closed(tc('core.holding.lostCityNoOpen'));
  if (!state.victory) return closed(tc('core.holding.needVictory'));
  if (cityCount(state) >= HOLDING.maxCities) return closed(tc('core.holding.maxCities', { max: HOLDING.maxCities }));
  if (player.cash < HOLDING.minCapital) {
    return closed(
      tc('core.holding.minCapitalQuote', { min: formatMoney(HOLDING.minCapital), cash: formatMoney(player.cash) }),
    );
  }
  return { ok: true, maxCapital: Math.floor(player.cash), name };
}

/** Yeni şehirde taşınan marka bilinirliği. */
export function carriedBrand(state: GameState): number {
  const player = state.companies[state.playerCompanyId]!;
  const values = CONSUMER_CATEGORIES.map((category) => player.brand[category] ?? 0);
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return average * HOLDING.brandCarry;
}

/**
 * Bu şehri uzaktan yönetilen hâle getirir: hızı durur (günü artık holding
 * işletiyor), `holding` alanı onu taşıyan şehre geçer. Baskın eşiği
 * sessizce kaydediliyor: ayrılır ayrılmaz bilinen bir baskın yeniden
 * haber olmasın.
 */
function toDormant(state: GameState): DormantCity {
  const trend = cityTrend(state);
  const away: GameState = { ...state, time: { ...state.time, speed: 0 } };
  delete away.holding;
  return { state: away, trend, raidStage: raidStatus(away).stage };
}

export function openCity(
  state: GameState,
  citySize: CitySizeId,
  capital: number,
): CommandResult & { next?: GameState } {
  const quote = openCityQuote(state);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const amount = Math.floor(capital);
  if (!(amount >= HOLDING.minCapital)) return { ok: false, reason: tc('core.holding.minCapital', { min: formatMoney(HOLDING.minCapital) }) };
  if (amount > quote.maxCapital) return { ok: false, reason: tc('core.holding.notEnoughCash') };

  const player = state.companies[state.playerCompanyId]!;
  const seed = foundingSeed(state);
  const opened = state.holding?.opened ?? 1;
  const brand = carriedBrand(state);

  // Ayrılan şehir: sermaye kasasından çıkıyor ve bu şehirden aktarılmış
  // sayılıyor (zafer ölçüsü buna göre düzeliyor).
  player.cash -= amount;
  state.importedCapital = (state.importedCapital ?? 0) - amount;
  state.cityName ??= cityNameAt(seed, 0);
  recomputeNetWorth(state);

  const next = createNewGame({
    seed: citySeed(seed, opened),
    citySize,
    ...(state.difficulty ? { difficulty: state.difficulty } : {}),
    companyName: player.name,
    ceoId: player.ceoId,
    startingCash: amount,
    startingBrand: brand,
    rivalOffset: opened * 4,
  });
  next.flags = { ...state.flags };
  next.cityName = quote.name;
  next.importedCapital = amount;
  const holding: HoldingState = {
    foundingSeed: seed,
    opened: opened + 1,
    treasury: state.holding?.treasury ?? 0,
    dormant: [...(state.holding?.dormant ?? []), toDormant(state)],
  };
  next.holding = holding;
  recomputeNetWorth(next);

  const rivals = Object.values(next.companies)
    .filter((company) => !company.isPlayer)
    .map((company) => company.name)
    .join(', ');
  pushNews(
    next,
    'good',
    tc('core.holding.openedTitle', { city: quote.name }),
    tc('core.holding.openedBody', {
      capital: formatMoney(amount),
      brand: Math.round(brand * 100),
      rivals,
      previous: state.cityName,
    }),
  );
  return { ok: true, next };
}

export function switchCity(state: GameState, index: number): CommandResult & { next?: GameState } {
  if (state.league) return { ok: false, reason: tc('core.holding.leagueNoSwitch') };
  const holding = state.holding;
  const target = holding?.dormant[index];
  if (!holding || !target) return { ok: false, reason: tc('core.holding.noSuchCity') };

  const next = target.state;
  next.holding = {
    ...holding,
    dormant: [...holding.dormant.filter((_, i) => i !== index), toDormant(state)],
  };
  recomputeNetWorth(next);
  return { ok: true, next };
}

/** Holding kasası ile oynanan şehir arasında para; artı kasadan şehre. */
export function holdingTransfer(state: GameState, amount: number): CommandResult {
  const holding = state.holding;
  if (!holding) return { ok: false, reason: tc('core.holding.noHolding') };
  if (state.gameOver) return { ok: false, reason: tc('core.holding.lostCityNoTransfer') };
  const value = Math.round(amount);
  if (value === 0) return { ok: false, reason: tc('core.holding.zeroAmount') };
  const player = state.companies[state.playerCompanyId]!;
  if (value > 0 && value > holding.treasury) return { ok: false, reason: tc('core.holding.treasuryShort') };
  if (value < 0 && -value > player.cash) return { ok: false, reason: tc('core.holding.cityCashShort') };
  holding.treasury -= value;
  player.cash += value;
  state.importedCapital = (state.importedCapital ?? 0) + value;
  recomputeNetWorth(state);
  return { ok: true };
}

/**
 * Günlük: bekleyen şehirler de bir gün yaşıyor (Tur 30).
 *
 * Sıra her şehir için aynı: şehrin günü, yerel müdürün sendika cevabı,
 * kâr payı, net değer, hedefler. Kaybedilen şehir yaşamıyor ve ödemiyor.
 */
export function runHoldingTick(state: GameState): void {
  const holding = state.holding;
  if (!holding) return;
  for (const city of holding.dormant) liveAway(state, holding, city);
}

function liveAway(active: GameState, holding: HoldingState, city: DormantCity): void {
  const s = city.state;
  if (s.gameOver) {
    city.lastDividend = 0;
    return;
  }
  const name = s.cityName ?? '';
  const wonBefore = Boolean(s.victory);

  simulateCityDay(s);

  const player = s.companies[s.playerCompanyId];
  // Yerel müdür: sendika talebine uzlaşma (oyuncu uzaktayken grev çıkmasın).
  if (player?.labor?.demand && !s.gameOver) respondUnion(s, s.playerCompanyId, 'compromise');

  // Kâr payı: bugünkü kârın yarısı kasaya, şehirden çıkan sermaye sayılıyor.
  let dividend = 0;
  if (player && !s.gameOver && player.today.profit > 0) {
    dividend = Math.min(Math.max(0, player.cash), player.today.profit * HOLDING.remoteShare);
    player.cash -= dividend;
    s.importedCapital = (s.importedCapital ?? 0) - dividend;
    holding.treasury += dividend;
  }
  city.lastDividend = dividend;

  recomputeNetWorth(s);
  runGoalTick(s);
  city.trend = cityTrend(s);

  // Haberler oynanan şehre: uzaktaki şehrin haber akışını kimse okumuyor.
  // (`gameOver` gün içinde dolabiliyor; derleyicinin yukarıdaki daraltması geçersiz.)
  const lost = s.gameOver as GameState['gameOver'];
  if (lost) {
    const by = s.companies[lost.byCompanyId]?.name ?? '';
    pushNews(active, 'bad', tc('core.holding.remoteLostTitle', { city: name, name: by }), tc('core.holding.remoteLostBody', { city: name }));
    return;
  }
  const raid = raidStatus(s);
  const raider = raid.holderId ? s.companies[raid.holderId] : undefined;
  if (raid.stage > (city.raidStage ?? 0) && raid.stage >= 2 && raider) {
    pushNews(
      active,
      'bad',
      tc('core.holding.remoteRaidTitle', { city: name, name: raider.name, percent: Math.round(raid.fraction * 100) }),
      tc('core.holding.remoteRaidBody', { city: name }),
    );
  }
  city.raidStage = raid.stage;
  if (!wonBefore && s.victory) {
    pushNews(active, 'good', tc('core.holding.remoteVictoryTitle', { city: name }), tc('core.holding.remoteVictoryBody', { city: name }));
  }
}
