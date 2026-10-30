import { app } from './en/app';
import { finance } from './en/finance';
import { trade } from './en/trade';
import { hud } from './en/hud';
import { panels } from './en/panels';

/** İngilizce arayüz sözlüğü (Tur 23): Türkçeyle aynı anahtarlar, eksiksiz. */
export const en = { ...panels, ...hud, ...finance, ...trade, ...app };
