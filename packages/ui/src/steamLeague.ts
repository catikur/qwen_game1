import { useSyncExternalStore } from 'react';
import type { LeagueSubmitOutcome } from './useGame';

/*
 * Steam skor tabloları (Tur 73). Masaüstünde Steam açıkken kabuk kuruyor
 * (`apps/web/src/desktop/steam.ts`). Tohum Ligi'ne giden koşunun puanı
 * Steam'in o hafta ya da günkü tablosuna da gidiyor; lig panelinde
 * oyuncunun Steam arkadaşlarının puanları. Steam'in tablosu koşuyu
 * doğrulamıyor: lig tablosunun yerini tutmuyor, yanında arkadaş kıyası.
 */

export interface SteamScore {
  /** Tablodaki puan: Steam en iyisini tutuyor. */
  score: number;
  /** Bütün oyuncular arasındaki sıra. */
  rank: number;
}

export interface SteamFriendScore {
  name: string;
  score: number;
  /** Bütün oyuncular arasındaki sıra. */
  rank: number;
  /** Oyuncunun kendisi. */
  me: boolean;
}

export interface SteamLeague {
  /** Koşunun puanı haftanın ya da günün tablosuna. */
  upload(boardId: string, score: number): Promise<SteamScore>;
  /** O tablodaki Steam arkadaşları (oyuncu dahil), puan sırasıyla. */
  friends(boardId: string): Promise<SteamFriendScore[]>;
}

let current: SteamLeague | null = null;
const listeners = new Set<() => void>();

export function setSteamLeague(next: SteamLeague | null): void {
  current = next;
  for (const listener of listeners) listener();
}

export function steamLeague(): SteamLeague | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSteamLeague(): SteamLeague | null {
  return useSyncExternalStore(subscribe, steamLeague, steamLeague);
}

/**
 * Lig gönderiminin sonucuna göre puan Steam'e gidiyor mu. Koşu geçerli ama
 * tablo o an almadıysa da (bekliyor, sunucu yoğun, ad herkese açık tabloya
 * giremiyor) gidiyor: Steam'in tablosu ad göstermiyor, en iyisini tutuyor.
 * Kapanmış lig, tutmayan tekrar ve kopya koşu gitmiyor.
 */
export function mirrorsToSteam(outcome: LeagueSubmitOutcome): boolean {
  return outcome === 'saved' || outcome === 'kept-better' || outcome === 'queued' || outcome === 'busy' || outcome === 'name-blocked' || outcome === 'version';
}
