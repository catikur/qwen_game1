import { NPC_PROFILES } from '@capital/content';
import type { NpcProfileDef } from '@capital/content';
import type { GameState } from './types';

/**
 * Rakip profilleri: katalog ve katalog bittikten sonra üretilenler (Tur 22).
 *
 * Sıra önemli: önce katalog, kendi sırasıyla; sonra üretilenler giriş
 * sırasıyla. Rakip turu, ihale ve lobi bu sırayla dönüyor; üretilmiş
 * rakip yokken liste katalogun ta kendisi, yani davranış birebir aynı.
 */
export function rivalProfiles(state: GameState): readonly NpcProfileDef[] {
  const extra = state.extraProfiles;
  return extra && extra.length > 0 ? [...NPC_PROFILES, ...extra] : NPC_PROFILES;
}

/** Bir şirketin `profileId`'sinden profili. Oyuncuda ve bilinmeyen kimlikte undefined. */
export function rivalProfile(state: GameState, profileId: string | null | undefined): NpcProfileDef | undefined {
  if (!profileId) return undefined;
  return (
    NPC_PROFILES.find((profile) => profile.id === profileId) ??
    state.extraProfiles?.find((profile) => profile.id === profileId)
  );
}
