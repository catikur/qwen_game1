import type { SteamMessageKey } from './steamMessages';

/** Deutsch — Steam in der Liga (Tur 73). */
export const steamDe: Record<SteamMessageKey, string> = {
  'hud.steam.title': 'Deine Steam-Freunde',
  'hud.steam.note': 'Aus der Steam-Bestenliste, nur Freunde. Steam prüft die Partien nicht; die eigentliche Wertung steht in der Tabelle oben.',
  'hud.steam.loading': 'Steam-Bestenliste wird geladen…',
  'hud.steam.error': 'Die Steam-Bestenliste ist nicht erreichbar.',
  'hud.steam.empty': 'Diese Woche hat noch keiner deiner Steam-Freunde eine Partie eingereicht.',
  'hud.steam.emptyDay': 'Heute hat noch keiner deiner Steam-Freunde eine Partie eingereicht.',
  'hud.steam.you': '{name} (du)',
  'hud.steam.rank': 'Deine Punktzahl steht auch in der Steam-Bestenliste: Platz {rank}.',
};
