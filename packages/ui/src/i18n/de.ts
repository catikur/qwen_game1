import { app } from './de/app';
import { finance } from './de/finance';
import { trade } from './de/trade';
import { hud } from './de/hud';
import { hudPlay } from './de/hudPlay';
import { panels } from './de/panels';
import { panelsPlay } from './de/panelsPlay';

/** Almanca arayüz sözlüğü (Tur 69): Türkçeyle aynı anahtarlar, eksiksiz. */
export const de = { ...panels, ...panelsPlay, ...hud, ...hudPlay, ...finance, ...trade, ...app };
