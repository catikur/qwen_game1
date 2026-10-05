import { BUILDING_BY_ID } from '@capital/content';
import type { GameState } from '../types';

/**
 * İşgücü — ücretin tek doğru kaynağı.
 *
 * Ücret eskiden üç yerde ayrı ayrı yazılıyordu (günlük defter, yatırım
 * tahmini, zincir kartının birim maliyeti) ve aynı sabitin üç kopyası
 * vardı. Ücret artık bir sisteme bağlanacağı için (bölgenin işgücü
 * piyasası, şirketin ücret politikası, toplu sözleşmeler) bu fonksiyon
 * tek kapı: defter, tahmin ve kart aynı rakamı görür — oyuncuya gösterilen
 * geri ödeme, ödeyeceği ücretle hesaplanır.
 */
export const WAGE_PER_JOB = 42;

/** Bir binanın günlük ücret gideri (henüz kurulmamış bina için de). */
export function wageFor(state: GameState, companyId: string, defId: string, districtId: number): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const district = state.districts[districtId];
  void companyId;
  return def.jobs * WAGE_PER_JOB * (0.6 + (district?.incomeLevel ?? 0.5));
}
