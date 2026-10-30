import { app } from './tr/app';
import { finance } from './tr/finance';
import { trade } from './tr/trade';
import { hud } from './tr/hud';
import { hudPlay } from './tr/hudPlay';
import { panels } from './tr/panels';
import { panelsPlay } from './tr/panelsPlay';

/**
 * Türkçe sözlük: grup modüllerinin birleşimi. Her modül anahtarlarını kendi
 * önekiyle yazar (`panels.`, `hud.`, `finance.`, `trade.`, `app.`), çakışma olmaz.
 * `panelsPlay` ve `hudPlay` aynı öneklerin oyunun içindeki anahtarları (Tur 80).
 */
export const tr = { ...panels, ...panelsPlay, ...hud, ...hudPlay, ...finance, ...trade, ...app } as const;
