import { commands } from './commands';
import { markets } from './markets';
import { world } from './world';
import { worldPlay } from './worldPlay';

/**
 * Çekirdeğin bütün Türkçe sözlüğü: testler ve dil denetimi için. Oyun
 * bunu içe aktarmıyor; gruplar ayrı yerlerde kaydediliyor (`../index.ts`,
 * `../gameTr.ts`).
 */
export const coreTr = { ...commands, ...markets, ...world, ...worldPlay } as const;
