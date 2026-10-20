import { commands } from './commands';
import { markets } from './markets';
import { world } from './world';

/** Çekirdeğin İngilizce sözlüğü: dil seçilince iniyor (Tur 46). */
export const coreEn = { ...commands, ...markets, ...world };
