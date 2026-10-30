import { app } from './en/app';
import { finance } from './en/finance';
import { trade } from './en/trade';
import { hud } from './en/hud';
import { hudPlay } from './en/hudPlay';
import { panels } from './en/panels';
import { panelsPlay } from './en/panelsPlay';

/** İngilizce arayüz sözlüğü (Tur 23): Türkçeyle aynı anahtarlar, eksiksiz. */
export const en = { ...panels, ...panelsPlay, ...hud, ...hudPlay, ...finance, ...trade, ...app };
