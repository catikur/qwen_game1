import { ACHIEVEMENTS, SCENARIOS } from '@capital/content';
import type { AchievementDef } from '@capital/content';
import { achievementStatuses, careerTotals, runFacts, runKeyOf, victoryCeos } from '@capital/core';
import type { AchievementStatus, CareerInput, CareerTotals, GameState, RunFacts } from '@capital/core';
import { scenarioRecord } from './scenarioBest';

/**
 * Kariyer deposu (Tur 41): koşuların özeti ve açılan rozetler, bu cihazda.
 *
 * Kullanıcı "cihazda saklanır, lig dokunulmaz"ı seçti. Rozet kuralları
 * çekirdekte (`packages/core/src/career.ts`); burada koşular arası hafıza
 * var. Aynı koşu yeniden görülünce sayaçlar ve değer en yükseğinde
 * kalıyor: eski bir kayıttan dönmek kazanılmışı geri almıyor. Açılan rozet
 * kalıcı; açıldığı an, koşu ve gün saklanıyor.
 *
 * Depo kapalıysa (gizli sekme) her şey oturum boyunca bellekte.
 */
const STORAGE_KEY = 'capitalforge.career.v1';
/** Saklanan koşu sayısı; eskiler toplamlara katlanıyor. */
export const MAX_CAREER_RUNS = 100;
/** Olaysız günlerde depoya en sık yazma aralığı. */
const WRITE_EVERY_MS = 10_000;

export interface CareerRun extends RunFacts {
  firstSeenIso: string;
  lastSeenIso: string;
}

export interface UnlockRecord {
  at: string;
  runKey?: string;
  companyName?: string;
  day?: number;
}

/** Budanan koşulardan kalan: toplamlar, zafer CEO'ları ve özet sayılar. */
export interface CareerArchive {
  totals: Partial<CareerTotals>;
  victoryCeos: string[];
  runs: number;
  victories: number;
  bestWorth: number;
  /**
   * Budanan koşular, bütün özetleriyle (Codex #70): o koşunun kaydı yeniden
   * yüklenirse katkısı arşivden düşülüp koşu listeye geri dönüyor; yoksa yeni
   * koşu sanılıp iki kez sayılırdı. Geri gelen koşu budanmadan önceki
   * özetiyle birleşiyor: eski kayıt zaferi, devralmayı, halka arzı geri almıyor.
   */
  folded?: Record<string, CareerRun>;
}

interface CareerFile {
  version: 1;
  /** En son görülen başta. */
  runs: CareerRun[];
  unlocked: Record<string, UnlockRecord>;
  archived?: CareerArchive;
}

let memory: CareerFile = { version: 1, runs: [], unlocked: {} };
let loaded = false;
let lastWrite = 0;
let revision = 0;
const listeners = new Set<() => void>();

function read(): CareerFile {
  if (loaded) return memory;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<CareerFile>) : null;
    if (parsed && Array.isArray(parsed.runs) && parsed.unlocked && typeof parsed.unlocked === 'object') {
      memory = { version: 1, runs: parsed.runs, unlocked: parsed.unlocked, ...(parsed.archived ? { archived: parsed.archived } : {}) };
    }
  } catch {
    // Depo kapalı ya da bozuk: oturum boyunca bellekte.
  }
  return memory;
}

function commit(next: CareerFile, persist: boolean): void {
  memory = next;
  loaded = true;
  revision++;
  if (persist) {
    lastWrite = Date.now();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Kaydedilemedi: bellekteki kopya oturum boyunca geçerli.
    }
  }
  listeners.forEach((listener) => listener());
}

/** Depo değişince (koşu, rozet) haber; `useSyncExternalStore` için. */
export function subscribeCareer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function careerRevision(): number {
  return revision;
}

function winKey(win: { day: number; citySize: string }): string {
  return `${win.day}:${win.citySize}`;
}

/** Aynı koşunun iki görünümü: sayaçlar ve değer en yükseğinde, durum en yenisinden. */
export function mergeRun(previous: CareerRun | undefined, next: RunFacts, nowIso: string): CareerRun {
  if (!previous) return { ...next, firstSeenIso: nowIso, lastSeenIso: nowIso };
  const wins = new Map(previous.wins.map((win) => [winKey(win), win]));
  for (const win of next.wins) wins.set(winKey(win), win);
  const counters = { ...next.counters };
  for (const key of Object.keys(counters) as (keyof typeof counters)[]) counters[key] = Math.max(counters[key], previous.counters[key] ?? 0);
  const stars = Math.max(previous.scenario?.stars ?? 0, next.scenario?.stars ?? 0);
  const outcome = previous.scenario?.outcome === 'won' || next.scenario?.outcome === 'won' ? 'won' : (next.scenario?.outcome ?? previous.scenario?.outcome);
  return {
    ...next,
    worth: Math.max(previous.worth, next.worth),
    cities: Math.max(previous.cities, next.cities),
    wins: [...wins.values()],
    closedWins: Math.max(previous.closedWins, next.closedWins),
    holdingComplete: previous.holdingComplete || next.holdingComplete,
    monopoly: previous.monopoly || next.monopoly,
    acquisitions: Math.max(previous.acquisitions, next.acquisitions),
    ipo: previous.ipo || next.ipo,
    sponsored: Math.max(previous.sponsored, next.sponsored),
    bubbles: Math.max(previous.bubbles, next.bubbles),
    quests: Math.max(previous.quests, next.quests),
    counters,
    ...(previous.league === 'finished' ? { league: 'finished' as const } : {}),
    ...(next.scenario || previous.scenario ? { scenario: { ...(outcome ? { outcome } : {}), stars } } : {}),
    firstSeenIso: previous.firstSeenIso,
    lastSeenIso: nowIso,
  };
}

function isVictorious(run: RunFacts): boolean {
  return run.mode !== 'scenario' && run.wins.length + run.closedWins > 0;
}

/** Eski koşuyu toplamlara katlar: kariyer rozetleri ve özet sayılar budanınca düşmesin. */
function fold(archive: CareerArchive | undefined, run: CareerRun): CareerArchive {
  const base: CareerArchive = archive ?? { totals: {}, victoryCeos: [], runs: 0, victories: 0, bestWorth: 0 };
  const own = careerTotals({ runs: [run], scenarioStars: {} });
  const totals = { ...base.totals };
  for (const key of Object.keys(own) as (keyof CareerTotals)[]) totals[key] = (totals[key] ?? 0) + own[key];
  const ceos = new Set(base.victoryCeos);
  if (isVictorious(run) && run.ceoId) ceos.add(run.ceoId);
  return {
    totals,
    victoryCeos: [...ceos],
    runs: base.runs + 1,
    victories: base.victories + (isVictorious(run) ? 1 : 0),
    bestWorth: Math.max(base.bestWorth, run.mode === 'scenario' ? 0 : run.worth),
    folded: { ...base.folded, [run.key]: run },
  };
}

/**
 * Budanmış koşu geri geldi: katkısı arşivden düşülüyor. En yüksek değer ve
 * zafer CEO'ları birleşim gibi davranıyor (aynı koşu iki kez artırmıyor),
 * onlara dokunulmuyor.
 */
function unfold(archive: CareerArchive, key: string): { archive: CareerArchive; run: CareerRun } | null {
  const run = archive.folded?.[key];
  if (!run) return null;
  // Katlarken eklenenin aynısı: aynı koşudan yeniden hesaplanıyor.
  const own = careerTotals({ runs: [run], scenarioStars: {} });
  const totals = { ...archive.totals };
  for (const name of Object.keys(own) as (keyof CareerTotals)[]) totals[name] = (totals[name] ?? 0) - own[name];
  const rest = { ...archive.folded };
  delete rest[key];
  return {
    archive: { ...archive, totals, runs: archive.runs - 1, victories: archive.victories - (isVictorious(run) ? 1 : 0), folded: rest },
    run,
  };
}

function scenarioStars(): Record<string, number> {
  return Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenarioRecord(scenario.id).best?.stars ?? 0]));
}

function inputOf(file: CareerFile): CareerInput {
  return {
    runs: file.runs,
    scenarioStars: scenarioStars(),
    ...(file.archived ? { archived: { totals: file.archived.totals, victoryCeos: file.archived.victoryCeos } } : {}),
  };
}

/** Yeni açılan rozetleri kaydeder; açılış bağlamı: rozeti açan koşu (koşu rozeti) ya da şimdiki koşu. */
function unlock(file: CareerFile, statuses: AchievementStatus[], nowIso: string, current?: RunFacts): AchievementDef[] {
  const opened: AchievementDef[] = [];
  for (const status of statuses) {
    if (!status.done || file.unlocked[status.def.id]) continue;
    const run = file.runs.find((r) => r.key === (status.runKey ?? current?.key));
    file.unlocked[status.def.id] = {
      at: nowIso,
      ...(run ? { runKey: run.key, companyName: run.companyName, day: run.day } : {}),
    };
    opened.push(status.def);
  }
  return opened;
}

/**
 * Oynanan koşuyu kaydeder ve bu çağrıda açılan rozetleri döndürür.
 * Depoya rozet açılınca, koşunun sonucu değişince ya da en az
 * `WRITE_EVERY_MS` arayla yazılıyor; arada bellekte.
 */
export function observeCareer(state: GameState, nowIso = new Date().toISOString()): AchievementDef[] {
  const file = read();
  const facts = runFacts(state);
  const index = file.runs.findIndex((run) => run.key === facts.key);
  const back = index < 0 && file.archived ? unfold(file.archived, facts.key) : null;
  // Budanmış koşu geri geldiyse budanmadan önceki özetiyle birleşiyor.
  const previous = index >= 0 ? file.runs[index] : back?.run;
  let archived = back ? back.archive : file.archived;
  const merged = mergeRun(previous, facts, nowIso);
  const runs = [merged, ...file.runs.filter((_, i) => i !== index)];
  while (runs.length > MAX_CAREER_RUNS) archived = fold(archived, runs.pop()!);
  const next: CareerFile = { version: 1, runs, unlocked: { ...file.unlocked }, ...(archived ? { archived } : {}) };
  const opened = unlock(next, achievementStatuses(inputOf(next)), nowIso, facts);
  const outcome = (run: CareerRun | undefined) =>
    run ? `${run.lost}:${run.wins.length}:${run.cities}:${run.league ?? ''}:${run.scenario?.outcome ?? ''}` : '';
  const eventful = opened.length > 0 || !previous || outcome(previous) !== outcome(merged);
  commit(next, eventful || Date.now() - lastWrite >= WRITE_EVERY_MS);
  return opened;
}

/** Oyun dışından (kurulum ekranı): senaryo yıldızları ve toplamlar yeni rozet açtı mı? */
export function syncCareer(nowIso = new Date().toISOString()): AchievementDef[] {
  const file = read();
  const next: CareerFile = { ...file, unlocked: { ...file.unlocked } };
  const opened = unlock(next, achievementStatuses(inputOf(next)), nowIso);
  if (opened.length) commit(next, true);
  return opened;
}

export interface CareerSummary {
  statuses: AchievementStatus[];
  unlocked: Readonly<Record<string, UnlockRecord>>;
  runs: readonly CareerRun[];
  runCount: number;
  victories: number;
  bestWorth: number;
  scenarioStars: number;
  ceos: number;
}

export function careerSummary(): CareerSummary {
  const file = read();
  const input = inputOf(file);
  const archived = file.archived;
  const own = file.runs.filter((run) => run.mode !== 'scenario');
  return {
    statuses: achievementStatuses(input),
    unlocked: file.unlocked,
    runs: file.runs,
    runCount: file.runs.length + (archived?.runs ?? 0),
    victories: file.runs.filter(isVictorious).length + (archived?.victories ?? 0),
    bestWorth: Math.max(archived?.bestWorth ?? 0, ...own.map((run) => run.worth)),
    scenarioStars: Object.values(input.scenarioStars).reduce((sum, stars) => sum + stars, 0),
    ceos: victoryCeos(input).length,
  };
}

/** Bu koşuda açılan rozetler (sonuç ekranları). */
export function unlockedInRun(state: GameState): AchievementDef[] {
  const key = runKeyOf(state);
  const unlocked = read().unlocked;
  return ACHIEVEMENTS.filter((def) => unlocked[def.id]?.runKey === key);
}

/** Yalnız testler: bellekteki depoyu sıfırlar. */
export function resetCareerForTests(): void {
  memory = { version: 1, runs: [], unlocked: {} };
  loaded = true;
  lastWrite = 0;
  revision++;
}
