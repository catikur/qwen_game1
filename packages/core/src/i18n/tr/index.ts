import { commands } from './commands';
import { markets } from './markets';
import { world } from './world';

/**
 * Çekirdeğin bütün Türkçe sözlüğü: testler ve dil denetimi için. Oyun
 * bunu içe aktarmıyor; gruplar ayrı yerlerde kaydediliyor (`../index.ts`,
 * `../gameTr.ts`).
 */
export const coreTr = { ...commands, ...markets, ...world } as const;
