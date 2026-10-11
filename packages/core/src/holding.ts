import { CITY_NAMES, CONSUMER_CATEGORIES, HOLDING } from '@capital/content';
import type { CitySizeId } from '@capital/content';
import { pushNews } from './news';
import { formatMoney } from './selectors';
import { recomputeNetWorth } from './systems/city';
import { createNewGame } from './worldgen';
import type { CommandResult, DormantCity, GameState, HoldingState } from './types';

/**
 * Holding: birden çok şehir (Tur 22).
 *
 * MODEL: SimCity'nin bölge oyunu. Aynı anda bir şehir oynanıyor; diğerleri
 * BEKLİYOR — takvimleri, rakipleri ve şehir gelişimi donuk. Böylece her
 * şehir tam bir simülasyon olarak kalıyor ve hiçbir sistem "hangi şehir"
 * sorusunu bilmek zorunda değil: oynanan şehrin durumu motorun tek
 * durumu, bekleyenler onun `holding` alanında.
 *
 * Bekleyen şehrin kârı durmuyor: ayrıldığın gündeki kâr eğiliminin yarısı
 * her gün holding KASASINA akıyor. Kasa ayrı, çünkü bu para doğrudan
 * oynanan şehrin kasasına aksaydı şehrin zaferi hiçbir şey yapmadan
 * gelirdi. Kasadan şehre aktarılan sermaye o şehrin zafer hedefine
 * ekleniyor (`importedCapital`): zafer şehirde yaratılan değerle ölçülüyor.
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

/** Bekleyen şehirlerden holding kasasına bugün akan para. */
export function remoteIncome(state: GameState): number {
  let total = 0;
  for (const city of state.holding?.dormant ?? []) {
    if (city.state.gameOver) continue;
    total += Math.max(0, city.trend) * HOLDING.remoteShare;
  }
  return total;
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
  if (state.league) return closed('Lig koşusunda yeni şehir açılmıyor.');
  if (state.gameOver) return closed('Kaybedilen şehirden yeni şehir açılamaz.');
  if (!state.victory) return closed('Yeni şehir için bu şehirde zafere ulaşmalısın.');
  if (cityCount(state) >= HOLDING.maxCities) return closed(`Holding en fazla ${HOLDING.maxCities} şehir.`);
  if (player.cash < HOLDING.minCapital) {
    return closed(`Yeni şehre en az ${formatMoney(HOLDING.minCapital)} sermaye gerekiyor; kasada ${formatMoney(player.cash)} var.`);
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

/** Bu şehri bekleyen hâle getirir: hızı durur, `holding` alanı onu taşıyan şehre geçer. */
function toDormant(state: GameState): DormantCity {
  const trend = cityTrend(state);
  const frozen: GameState = { ...state, time: { ...state.time, speed: 0 } };
  delete frozen.holding;
  return { state: frozen, trend };
}

export function openCity(
  state: GameState,
  citySize: CitySizeId,
  capital: number,
): CommandResult & { next?: GameState } {
  const quote = openCityQuote(state);
  if (!quote.ok) return { ok: false, reason: quote.reason };
  const amount = Math.floor(capital);
  if (!(amount >= HOLDING.minCapital)) return { ok: false, reason: `En az ${formatMoney(HOLDING.minCapital)}.` };
  if (amount > quote.maxCapital) return { ok: false, reason: 'Kasada o kadar nakit yok.' };

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
    `${quote.name}: holding yeni şehirde`,
    `${formatMoney(amount)} sermaye ve %${Math.round(brand * 100)} marka bilinirliğiyle geldin. Rakipler: ${rivals}. ` +
      `${state.cityName} bekliyor; kârının yarısı her gün holding kasasına akacak.`,
  );
  return { ok: true, next };
}

export function switchCity(state: GameState, index: number): CommandResult & { next?: GameState } {
  if (state.league) return { ok: false, reason: 'Lig koşusunda şehir değiştirilmiyor.' };
  const holding = state.holding;
  const target = holding?.dormant[index];
  if (!holding || !target) return { ok: false, reason: 'Böyle bir şehir yok.' };

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
  if (!holding) return { ok: false, reason: 'Holding yok: önce bir şehirde zafere ulaşıp yeni şehir aç.' };
  if (state.gameOver) return { ok: false, reason: 'Kaybedilen şehre para aktarılamaz.' };
  const value = Math.round(amount);
  if (value === 0) return { ok: false, reason: 'Tutar sıfır.' };
  const player = state.companies[state.playerCompanyId]!;
  if (value > 0 && value > holding.treasury) return { ok: false, reason: 'Holding kasasında o kadar para yok.' };
  if (value < 0 && -value > player.cash) return { ok: false, reason: 'Şehrin kasasında o kadar nakit yok.' };
  holding.treasury -= value;
  player.cash += value;
  state.importedCapital = (state.importedCapital ?? 0) + value;
  recomputeNetWorth(state);
  return { ok: true };
}

/** Günlük: bekleyen şehirlerin kâr payı holding kasasına. */
export function runHoldingTick(state: GameState): void {
  if (!state.holding) return;
  state.holding.treasury += remoteIncome(state);
}
