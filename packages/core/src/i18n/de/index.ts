import { commands } from './commands';
import { markets } from './markets';
import { world } from './world';

/** Çekirdeğin Almanca sözlüğü (Tur 69): dil seçilince iniyor. */
export const coreDe = { ...commands, ...markets, ...world };
