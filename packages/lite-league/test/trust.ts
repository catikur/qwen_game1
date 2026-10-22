/**
 * Testlerin sahte koşuları için sunucu ayarı (Tur 52): iz sabit, tekrar
 * beyanı olduğu gibi kabul ediyor. Sunucunun gerçek tekrarını
 * `seed.test.ts`'in gerçek koşulu testleri deniyor.
 */
import type { Options } from '../src/app';
import { APPLE_ATTEST } from '../src/attest';
import type { LeagueRun } from '../../core/src/league';

/** Sahte koşuların izi (`run()` yardımcılarıyla aynı). */
export const TEST_SIM = 'abcdef0123456789';

export const TRUSTING: Options = {
  attest: APPLE_ATTEST,
  seed: {
    sim: () => TEST_SIM,
    replay: async (run: LeagueRun) => ({ ok: true, score: run.score, curve: run.curve }),
  },
};
