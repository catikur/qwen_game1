import type { CityTally, GameState, RunFeats } from '../types';

/**
 * Şehrin dikkate değer anlarının sayacı (Tur 41).
 *
 * Kariyer rozetleri koşudan sonra da okunabilmeli, ama bu anların çoğu
 * durumda iz bırakmadan bitiyor: kriz siliniyor, konsorsiyum dağılıyor,
 * baskıncı satıp gidiyor. Sayaç olduğu yerde, anın kendisinde artıyor.
 * Simülasyon sayacı okumuyor; zar atmıyor, hiçbir şeyi değiştirmiyor.
 */
export type FeatCounter = Exclude<keyof RunFeats, 'crisisWorth' | 'raidPeak' | 'peakWorth' | 'peakCompanyWorth'>;

/** Koşu özetinin sayaçları (`RunFacts.counters`); sponsorluk özette ayrı alan. */
export const FEAT_COUNTERS = [
  'crisesWeathered',
  'crisesGrown',
  'consortiumsBroken',
  'raidsRepelled',
  'motionsWon',
  'contractsDone',
  'auctionsWon',
] as const satisfies readonly FeatCounter[];

export function noteFeat(state: GameState, key: FeatCounter, by = 1): void {
  const feats = (state.feats ??= {});
  feats[key] = (feats[key] ?? 0) + by;
}

/**
 * Baskının püskürtülmesi: oyuncunun hissesindeki en büyük rakip payı %25'i
 * (ikinci uyarı, `stage` 2) geçmiş, sonra %10'un altına (`stage` 0) inmiş.
 * Baskıncıyı karşı devralmayla yutmak da sayılıyor: payı oyuncuya geçiyor.
 * Motorun gününde, baskın uyarısından sonra; yalnız oynanan şehir.
 */
export function noteRaidStage(state: GameState, stage: number): void {
  const peak = Math.max(state.feats?.raidPeak ?? 0, stage);
  if (stage === 0) {
    if (peak >= 2) noteFeat(state, 'raidsRepelled');
    if (state.feats?.raidPeak) state.feats.raidPeak = 0;
    return;
  }
  if (peak !== (state.feats?.raidPeak ?? 0)) (state.feats ??= {}).raidPeak = peak;
}

/**
 * Koşunun en yüksek değeri, gün sonunda. Motor bir karede birkaç gün
 * ilerletip bir kez haber veriyor; arada eşiği geçip geri düşen değer
 * kariyerde görünmezdi (Codex #70).
 */
export function notePeakWorth(state: GameState, worth: number): void {
  if (worth > (state.feats?.peakWorth ?? 0)) (state.feats ??= {}).peakWorth = worth;
}

/** Şehirdeki şirketin en yüksek değeri, gün sonunda (Çeyrek milyar tek şirketi okuyor; Codex #70). */
export function noteCompanyPeak(state: GameState): void {
  const worth = companyWorthNow(state);
  if (worth > (state.feats?.peakCompanyWorth ?? 0)) (state.feats ??= {}).peakCompanyWorth = worth;
}

function companyWorthNow(state: GameState): number {
  return state.gameOver ? 0 : (state.companies[state.playerCompanyId]?.netWorth ?? 0);
}

/** Şehrin koşuya kattığı: kariyerin topladığı sayılar. */
export function cityTally(state: GameState): CityTally {
  const own = state.companies[state.playerCompanyId];
  const feats: RunFeats = {};
  for (const key of FEAT_COUNTERS) if (state.feats?.[key]) feats[key] = state.feats[key];
  return {
    companyWorth: Math.max(state.feats?.peakCompanyWorth ?? 0, companyWorthNow(state)),
    acquisitions: own?.acquisitions ?? 0,
    ipo: (own?.issues ?? 0) > 0,
    // Bitiş anının sayacı; eski kayıtta (sayaçtan önce biten proje) bugünkü sponsorluk.
    sponsored: Math.max(
      state.feats?.projectsSponsored ?? 0,
      (state.cityProjects ?? []).filter((project) => project.sponsorId === state.playerCompanyId).length,
    ),
    bubbles: state.bubblesCaught ?? 0,
    quests: state.questsDone ?? 0,
    feats,
  };
}

export function addTally(into: CityTally, add: CityTally): CityTally {
  const feats: RunFeats = { ...into.feats };
  for (const key of FEAT_COUNTERS) if (add.feats?.[key]) feats[key] = (feats[key] ?? 0) + add.feats[key]!;
  return {
    companyWorth: Math.max(into.companyWorth ?? 0, add.companyWorth ?? 0),
    acquisitions: (into.acquisitions ?? 0) + (add.acquisitions ?? 0),
    ipo: Boolean(into.ipo || add.ipo),
    sponsored: (into.sponsored ?? 0) + (add.sponsored ?? 0),
    bubbles: (into.bubbles ?? 0) + (add.bubbles ?? 0),
    quests: (into.quests ?? 0) + (add.quests ?? 0),
    feats,
  };
}
