import { GameEngine } from './engine';
import { formatMoney } from './selectors';
import { LEAGUE_DAYS } from './systems/league';
import { createNewGame } from './worldgen';
import type { GameCommand, GameState, LoggedCommand } from './types';

/**
 * Lig koşu kodu ve tekrar doğrulaması (kural ve takvim: systems/league).
 */

// ---------------------------------------------------------------- koşu kodu

export interface LeagueRun {
  version: 1;
  weekId: string;
  ceoId: string | null;
  companyName: string;
  score: number;
  /** Net değer eğrisi — hayalet karşılaştırması için. */
  curve: number[];
  log: LoggedCommand[];
}

export function runFromState(state: GameState): LeagueRun | null {
  const league = state.league;
  if (!league || league.score === undefined) return null;
  const player = state.companies[state.playerCompanyId]!;
  return {
    version: 1,
    weekId: league.weekId,
    ceoId: player.ceoId,
    companyName: player.name,
    score: league.score,
    curve: league.curve,
    log: state.commandLog ?? [],
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(code: string): string {
  const binary = atob(code);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeRun(run: LeagueRun): string {
  return `CF1.${toBase64(JSON.stringify(run))}`;
}

export function decodeRun(code: string): LeagueRun | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith('CF1.')) return null;
  try {
    const run = JSON.parse(fromBase64(trimmed.slice(4))) as LeagueRun;
    if (run.version !== 1 || typeof run.weekId !== 'string' || !Array.isArray(run.log)) return null;
    return run;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tekrar

export interface ReplayResult {
  ok: boolean;
  /** Tekrarda bulunan skor. */
  score: number;
  reason?: string;
}

/** Bir lig koşusunun başlangıç dünyası. */
export function createLeagueGame(weekId: string, companyName: string, ceoId: string | null): GameState {
  return createNewGame({ companyName, ceoId, league: { weekId } });
}

/**
 * Koşuyu baştan oynatır. `yieldEvery` verilirse her N günde bir kontrolü
 * bırakır (tarayıcıda arayüz donmasın diye) — sonucu değiştirmez.
 */
export async function replayRun(
  run: LeagueRun,
  options: { yieldEvery?: number; onProgress?: (day: number) => void } = {},
): Promise<ReplayResult> {
  const engine = new GameEngine(createLeagueGame(run.weekId, run.companyName, run.ceoId));
  const state = () => engine.getState();
  const byDay = new Map<number, GameCommand[]>();
  for (const [day, command] of run.log) {
    const list = byDay.get(day) ?? [];
    list.push(command);
    byDay.set(day, list);
  }

  while (state().league && state().league!.finishedDay === undefined) {
    const day = state().time.day;
    for (const command of byDay.get(day) ?? []) engine.dispatch(command);
    engine.runDay();
    if (options.yieldEvery && state().time.day % options.yieldEvery === 0) {
      options.onProgress?.(state().time.day);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (state().time.day > LEAGUE_DAYS + 5) break; // emniyet
  }

  const score = state().league?.score ?? 0;
  if (score !== run.score) {
    return { ok: false, score, reason: `Tekrarda skor ${formatMoney(score)}, iddia ${formatMoney(run.score)}.` };
  }
  return { ok: true, score };
}
