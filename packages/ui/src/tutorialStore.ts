import { useSyncExternalStore } from 'react';
import type { GameState } from '@capital/core';
import type { TutorialProgress } from './tutorial';

/*
 * Rehberin tarayıcıdaki deposu (Tur 46'da `tutorial.ts`'ten ayrıldı).
 * Kurulum ekranı "rehberi gördü mü"yü okuyor; adımların denetimi oyunun
 * sistemlerini içe aktardığı için oyun parçasında.
 */

const STORAGE_KEY = 'capitalforge.tutorial.v1';

interface Stored {
  /** Bu tarayıcıda bir rehber bitirildi ya da kapatıldı mı. */
  seen: boolean;
  games: Record<string, TutorialProgress>;
}

let memory: Stored = { seen: false, games: {} };
let loaded = false;
const listeners = new Set<() => void>();

function read(): Stored {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      memory = { seen: Boolean(parsed.seen), games: parsed.games && typeof parsed.games === 'object' ? parsed.games : {} };
    }
  } catch {
    // Depo kapalı ya da bozuk: oturum boyunca bellekte çalışır.
  }
  return memory;
}

function write(next: Stored): void {
  memory = next;
  loaded = true;
  try {
    // Eski oyunların kayıtları birikmesin: son on oyun yeter.
    const keys = Object.keys(next.games);
    const games = keys.length > 10 ? Object.fromEntries(keys.slice(-10).map((k) => [k, next.games[k]!])) : next.games;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ seen: next.seen, games }));
  } catch {
    // Kaydedilemedi: bellekteki kopya oturum boyunca geçerli.
  }
  for (const listener of listeners) listener();
}

/** Oyunun kimliği: aynı tohumdan iki ayrı oyun da ayrışsın diye kuruluş anıyla. */
export function tutorialKey(state: GameState): string {
  return `${state.meta.seed}:${state.meta.createdAtIso}`;
}

/** Bu tarayıcı rehberi daha önce bitirdi ya da kapattı mı (kurulumdaki varsayılan). */
export function tutorialSeen(): boolean {
  return read().seen;
}

/** Bu oyun için rehberi baştan başlatır. */
export function startTutorial(state: GameState): void {
  const current = read();
  write({ ...current, games: { ...current.games, [tutorialKey(state)]: { step: 0, stepDay: state.time.day, seen: false } } });
}

/** İlerlemeyi yazar; `null` rehberi bu oyun için bitirir. */
export function setTutorial(key: string, progress: TutorialProgress | null): void {
  const current = read();
  const games = { ...current.games };
  if (progress) games[key] = progress;
  else delete games[key];
  write({ seen: current.seen || progress === null, games });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bu oyunun rehber ilerlemesi; rehber yoksa null. */
export function useTutorial(key: string): TutorialProgress | null {
  return useSyncExternalStore(subscribe, () => read().games[key] ?? null, () => null);
}

/** Bu oyunun kayıtlı ilerlemesi; rehber yoksa undefined. */
export function tutorialProgress(key: string): TutorialProgress | undefined {
  return read().games[key];
}
