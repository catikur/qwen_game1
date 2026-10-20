import type { CitySizeId } from '@capital/content';
import type { GameState } from './types';

/*
 * Holding'in değeri ve kuruluşu (Tur 46'da `holding.ts`'ten ayrıldı):
 * kariyer kurulum ekranında da okunuyor, holding'in işleyişi oyun parçasında.
 */

/** Holding'in toplam değeri: oynanan şehir + bekleyenler + kasa. */
export function holdingNetWorth(state: GameState): number {
  const own = (s: GameState) => (s.gameOver ? 0 : (s.companies[s.playerCompanyId]?.netWorth ?? 0));
  let total = own(state) + (state.holding?.treasury ?? 0);
  for (const city of state.holding?.dormant ?? []) total += own(city.state);
  return total;
}

/**
 * Koşunun kuruluş anı (Tur 41): holding'de kurucu şehrinki. Eski kayıtta
 * `foundedAtIso` yok; şehirlerin en erkeni kurucu şehir.
 */
export function holdingFoundedAt(state: GameState): string {
  if (state.holding?.foundedAtIso) return state.holding.foundedAtIso;
  let first = state.meta.createdAtIso;
  for (const city of state.holding?.dormant ?? []) if (city.state.meta.createdAtIso < first) first = city.state.meta.createdAtIso;
  return first;
}

/** Kurucu şehrin boyutu (Tur 41); kurucu şehir kapatıldıysa holding'de saklanan. */
export function holdingFounderSize(state: GameState): CitySizeId {
  if (state.holding?.foundedCitySize) return state.holding.foundedCitySize;
  const founded = holdingFoundedAt(state);
  const founder = [state, ...(state.holding?.dormant ?? []).map((city) => city.state)].find((city) => city.meta.createdAtIso === founded);
  return (founder ?? state).citySize ?? 'standard';
}
