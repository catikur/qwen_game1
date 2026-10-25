import { app } from './de/app';
import { finance } from './de/finance';
import { hud } from './de/hud';
import { panels } from './de/panels';

/** Almanca arayüz sözlüğü (Tur 69): Türkçeyle aynı anahtarlar, eksiksiz. */
export const de = { ...panels, ...hud, ...finance, ...app };
