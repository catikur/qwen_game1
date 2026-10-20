import { difficultyWith, hasModifier } from '@capital/content';
import type { DifficultyDef, ModifierId } from '@capital/content';
import type { GameState } from '../types';

/**
 * Oyunun kuralları: zorluk kademesi ve değiştiricileri (Tur 45).
 *
 * Sistemler kademeyi buradan okuyor; değiştiricisiz oyunda kademenin
 * kendisi döner, hiçbir sayı değişmiyor.
 */
export function difficultyOf(state: GameState): DifficultyDef {
  return difficultyWith(state.difficulty, state.modifiers);
}

export function hasRule(state: GameState, id: ModifierId): boolean {
  return hasModifier(state.modifiers, id);
}
