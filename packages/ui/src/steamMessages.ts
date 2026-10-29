import { registerMessages, translate } from '@capital/content';
import { steamDe } from './steamMessages.de';

/*
 * Steam'in lig yazıları (Tur 73): lig panelindeki Steam arkadaşları ve
 * sonuç ekranındaki Steam sırası. Yalnız masaüstünde Steam açıkken
 * görünüyor; giriş paketine girmesin diye lig paneliyle oyun ekranının
 * parçasında. Almancası `steamMessages.de.ts`'te. Anahtarlar `hud.steam.`
 * altında.
 */
export const steamTr = {
  'hud.steam.title': 'Steam arkadaşların',
  'hud.steam.note': "Steam'in tablosundan, yalnız arkadaşların. Steam koşuları doğrulamıyor; asıl sıralama yukarıdaki tabloda.",
  'hud.steam.loading': "Steam'in tablosu iniyor…",
  'hud.steam.error': "Steam'in tablosuna ulaşılamadı.",
  'hud.steam.empty': 'Bu hafta Steam arkadaşlarından henüz kimse koşu göndermedi.',
  'hud.steam.emptyDay': 'Bugün Steam arkadaşlarından henüz kimse koşu göndermedi.',
  'hud.steam.you': '{name} (sen)',
  'hud.steam.rank': "Puanın Steam'in tablosunda da: {rank}. sıradasın.",
} as const;

export type SteamMessageKey = keyof typeof steamTr;

export const steamEn: Record<SteamMessageKey, string> = {
  'hud.steam.title': 'Your Steam friends',
  'hud.steam.note': 'From the Steam leaderboard, friends only. Steam does not verify runs; the real standings are in the table above.',
  'hud.steam.loading': 'Loading the Steam leaderboard…',
  'hud.steam.error': 'The Steam leaderboard could not be reached.',
  'hud.steam.empty': 'None of your Steam friends has sent a run this week yet.',
  'hud.steam.emptyDay': 'None of your Steam friends has sent a run today yet.',
  'hud.steam.you': '{name} (you)',
  'hud.steam.rank': 'Your score is on the Steam leaderboard too: rank {rank}.',
};

registerMessages('tr', steamTr);
registerMessages('en', steamEn);
registerMessages('de', steamDe);

export function st(key: SteamMessageKey, params?: Record<string, string | number>): string {
  return translate(key, params);
}
