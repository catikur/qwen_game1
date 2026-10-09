import { app } from './tr/app';
import { finance } from './tr/finance';
import { hud } from './tr/hud';
import { panels } from './tr/panels';

/**
 * Türkçe sözlük: grup modüllerinin birleşimi. Her modül anahtarlarını kendi
 * önekiyle yazar (`panels.`, `hud.`, `finance.`, `app.`), çakışma olmaz.
 */
export const tr = { ...panels, ...hud, ...finance, ...app } as const;
