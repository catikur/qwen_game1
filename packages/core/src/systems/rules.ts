import { difficultyWith, hasModifier, rulesWith } from '@capital/content';
import type { DifficultyDef, ModifierId, MODIFIER_RULES } from '@capital/content';
import type { GameState } from '../types';

/**
 * Oyunun kuralları: zorluk kademesi ve değiştiricileri (Tur 45).
 *
 * Sistemler kademeyi buradan okuyor; değiştiricisiz oyunda kademenin
 * kendisi döner, hiçbir sayı değişmiyor.
 */
export function difficultyOf(state: GameState): DifficultyDef {
  return difficultyWith(state.difficulty, state.modifiers, ruleValues(state).hungryRivals);
}

/**
 * Kuralların değerleri (Tur 67): hazır değerler, paketten gelen senaryonun
 * ayarlarıyla. Ayarsız oyunda `MODIFIER_RULES`'un kendisi: sayı değişmiyor.
 */
export function ruleValues(state: GameState): typeof MODIFIER_RULES {
  return rulesWith(state.ruleOverrides);
}

export function hasRule(state: GameState, id: ModifierId): boolean {
  return hasModifier(state.modifiers, id);
}
