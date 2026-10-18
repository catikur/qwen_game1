import type { GameState, RunFeats } from '../types';

/**
 * Şehrin dikkate değer anlarının sayacı (Tur 41).
 *
 * Kariyer rozetleri koşudan sonra da okunabilmeli, ama bu anların çoğu
 * durumda iz bırakmadan bitiyor: kriz siliniyor, konsorsiyum dağılıyor,
 * baskıncı satıp gidiyor. Sayaç olduğu yerde, anın kendisinde artıyor.
 * Simülasyon sayacı okumuyor; zar atmıyor, hiçbir şeyi değiştirmiyor.
 */
export type FeatCounter = Exclude<keyof RunFeats, 'crisisWorth' | 'raidPeak'>;

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
