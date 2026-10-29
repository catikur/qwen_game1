import { ACHIEVEMENTS, SCENARIOS } from '@capital/content';
import type { AchievementDef, AchievementFeat, AchievementTotal, CitySizeId, CityTypeId, DifficultyId, ModifierId, PathId } from '@capital/content';
import { holdingFoundedAt, holdingFounderSize, holdingFounderType, holdingNetWorth } from './holdingFacts';
import { FEAT_COUNTERS, addTally, cityTally } from './systems/feats';
import { leagueBoardKind } from './systems/leagueWeek';
import type { CityTally, GameState } from './types';

/**
 * Kariyer (Tur 41): koşunun özeti ve rozet kuralları.
 *
 * İkisi de saf: durum okunuyor, değiştirilmiyor. Koşular arası depo
 * arayüzde (`packages/ui/src/career.ts`); burada yalnızca "bu koşu ne
 * yaptı" ve "bu koşular hangi rozetleri açıyor" var, düğümde test
 * edilebilsin diye.
 */

export type RunMode = 'free' | 'league' | 'scenario';

/** Koşu sayaçları: rozetlerin okuduğu `RunFeats` alanları ve toplamların kaynağı. */
export type RunCounter = AchievementFeat | 'motionsWon' | 'contractsDone' | 'auctionsWon';

const COUNTERS: readonly RunCounter[] = FEAT_COUNTERS;

export interface RunWin {
  /** Zaferin günü, şehrin kendi takviminde. */
  day: number;
  citySize: CitySizeId;
  /** Zafere giden yol (Tur 61); eski koşularda yok. */
  path?: PathId;
}

/** Bir koşunun kariyere giden özeti; holding'in bütün şehirleri tek koşu. */
export interface RunFacts {
  /** Koşunun kimliği: kurucu şehrin kuruluş anı ve tohumu. */
  key: string;
  mode: RunMode;
  scenarioId?: string;
  companyName: string;
  ceoId: string | null;
  difficulty: DifficultyId;
  /** Ek kurallar (Tur 45); koşunun bütün şehirlerinde aynı. Eski koşularda yok. */
  modifiers?: ModifierId[];
  /** Kurucu şehrin boyutu. */
  citySize: CitySizeId;
  /** Kurucu şehrin türü (Tur 76); dengeli şehirde ve eski koşularda yok. */
  cityType?: CityTypeId;
  /** Oynanan şehrin günü. */
  day: number;
  /** Holding'in en yüksek toplam değeri (tek şehirde şirketin net değeri). */
  worth: number;
  /** Tek bir şehirdeki şirketin en yüksek değeri. */
  companyWorth: number;
  cities: number;
  wins: RunWin[];
  /**
   * Zaferlerin yolları, şehirden bağımsız (Tur 61). Kariyer deposu zaferleri
   * gün ve boyutla birleştiriyor; holding'in iki şehri aynı yerel günde başka
   * yollardan kazanınca yol kaybolmasın (Codex #91). Eski koşularda yok.
   */
  paths?: PathId[];
  /** Kapatılmış şehirlerde kazanılmış zafer (günü ve boyutu bilinmiyor). */
  closedWins: number;
  holdingComplete: boolean;
  monopoly: boolean;
  acquisitions: number;
  ipo: boolean;
  sponsored: number;
  bubbles: number;
  quests: number;
  counters: Record<RunCounter, number>;
  /** Oynanan şehir devralındı. */
  lost: boolean;
  league?: 'playing' | 'finished' | 'lost';
  /** Lig koşusu günün koşusuysa (Tur 53); haftanın tohumunda alan yok. */
  leagueKind?: 'day';
  scenario?: { outcome?: 'won' | 'lost'; stars: number };
}

function citiesOf(state: GameState): GameState[] {
  return [state, ...(state.holding?.dormant ?? []).map((city) => city.state)];
}

export function runKeyOf(state: GameState): string {
  return `${holdingFoundedAt(state)}:${state.holding?.foundingSeed ?? state.meta.seed}`;
}

export function runFacts(state: GameState): RunFacts {
  const cities = citiesOf(state);
  const player = state.companies[state.playerCompanyId];
  const wins: RunWin[] = [];
  let peak = 0;
  // Kapatılan şehirlerin payı holding'de duruyor (Codex #70).
  let tally: CityTally = state.holding?.closedTally ?? {};
  // Kapatılan şehirlerin zafer yolları da holding'de (Codex #91).
  const paths = new Set<PathId>(state.holding?.closedPaths ?? []);
  for (const city of cities) {
    if (city.victory) wins.push({ day: city.victory.day, citySize: city.citySize ?? 'standard', ...(city.victory.path ? { path: city.victory.path } : {}) });
    if (city.victory?.path) paths.add(city.victory.path);
    tally = addTally(tally, cityTally(city));
    peak = Math.max(peak, city.feats?.peakWorth ?? 0);
  }
  const counters = Object.fromEntries(COUNTERS.map((key) => [key, tally.feats?.[key] ?? 0])) as Record<RunCounter, number>;
  const league = state.league;
  const scenario = state.scenario;
  return {
    key: runKeyOf(state),
    mode: scenario ? 'scenario' : league ? 'league' : 'free',
    ...(scenario ? { scenarioId: scenario.id } : {}),
    companyName: player?.name ?? '',
    ceoId: player?.ceoId ?? null,
    difficulty: state.difficulty ?? 'normal',
    ...(state.modifiers?.length ? { modifiers: [...state.modifiers] } : {}),
    // Kurucu şehir kapatıldıysa boyutu holding'de (Codex #70).
    citySize: holdingFounderSize(state),
    ...(holdingFounderType(state) !== 'balanced' ? { cityType: holdingFounderType(state) } : {}),
    day: state.time.day,
    // Bir karede birkaç gün geçebiliyor: arada kalan tepe günün sayacından (Codex #70).
    worth: Math.max(holdingNetWorth(state), peak),
    companyWorth: tally.companyWorth ?? 0,
    // Kapatılan şehir de açılmıştı: sayı kalıcı sayaçtan (Codex #70).
    cities: Math.max(cities.length, state.holding?.opened ?? 1),
    wins,
    ...(paths.size > 0 ? { paths: [...paths] } : {}),
    closedWins: state.holding?.closedWins ?? 0,
    holdingComplete: state.holding?.completedDay !== undefined,
    monopoly: Boolean(tally.monopoly),
    acquisitions: tally.acquisitions ?? 0,
    ipo: Boolean(tally.ipo),
    sponsored: tally.sponsored ?? 0,
    bubbles: tally.bubbles ?? 0,
    quests: tally.quests ?? 0,
    counters,
    lost: Boolean(state.gameOver),
    ...(league ? { league: league.outcome ?? 'playing' } : {}),
    ...(league && leagueBoardKind(league.weekId) === 'day' ? { leagueKind: 'day' as const } : {}),
    ...(scenario ? { scenario: { ...(scenario.outcome ? { outcome: scenario.outcome } : {}), stars: scenario.stars ?? 0 } } : {}),
  };
}

// ---------------------------------------------------------------- rozetler

const DIFFICULTY_RANK: Record<DifficultyId, number> = { easy: 0, normal: 1, hard: 2 };

/** Koşu kapsamındaki rozetler; kariyer kapsamındakiler (`total`, senaryo, CEO, yol) toplamdan. */
export function isRunScoped(def: AchievementDef): boolean {
  return (
    def.kind !== 'total' && def.kind !== 'scenarioEvery' && def.kind !== 'scenarioStars' && def.kind !== 'ceoVictories' && def.kind !== 'pathVictories'
  );
}

function victoriesIn(def: AchievementDef, run: RunFacts): number {
  const filter = def.victory ?? {};
  if (filter.minDifficulty && DIFFICULTY_RANK[run.difficulty] < DIFFICULTY_RANK[filter.minDifficulty]) return 0;
  if (filter.minModifiers && (run.modifiers?.length ?? 0) < filter.minModifiers) return 0;
  const matching = run.wins.filter(
    (win) => (filter.maxDay === undefined || win.day < filter.maxDay) && (filter.citySize === undefined || win.citySize === filter.citySize),
  ).length;
  // Kapatılan şehrin zaferinin günü ve boyutu bilinmiyor: yalnız süzgeçsiz zafere sayılıyor.
  return matching + (filter.maxDay === undefined && filter.citySize === undefined ? run.closedWins : 0);
}

/** Koşu kapsamındaki rozetin bu koşudaki değeri. */
export function runValue(def: AchievementDef, run: RunFacts): number {
  if (def.freePlayOnly && run.mode === 'scenario') return 0;
  switch (def.kind) {
    case 'worth':
      return run.worth;
    case 'companyWorth':
      return run.companyWorth;
    case 'victory':
      return victoriesIn(def, run);
    case 'monopoly':
      return run.monopoly ? 1 : 0;
    case 'acquisitions':
      return run.acquisitions;
    case 'ipo':
      return run.ipo ? 1 : 0;
    case 'cities':
      return run.cities;
    case 'holding':
      return run.holdingComplete ? 1 : 0;
    case 'sponsor':
      return run.sponsored;
    case 'feat':
      return def.feat ? run.counters[def.feat] : 0;
    default:
      return 0;
  }
}

export type CareerTotals = Record<AchievementTotal, number>;

export interface CareerInput {
  runs: readonly RunFacts[];
  /** Senaryo kimliği → bu cihazdaki en iyi yıldız. */
  scenarioStars: Readonly<Record<string, number>>;
  /**
   * Depodan budanmış eski koşular: toplamları ve zafer kazanılan CEO'ları,
   * koşu rozetinin en iyisi için de özetleri (toplamlara zaten katlanmış).
   * Özeti de silinmiş en eski koşulardan yalnız koşu rozetlerinin en iyi
   * değeri (`best`, rozet kimliği → değer) kalıyor.
   */
  archived?: {
    totals?: Partial<CareerTotals>;
    victoryCeos?: readonly string[];
    /** Budanan koşuların zafer yolları (Tur 61). */
    victoryPaths?: readonly string[];
    runs?: readonly RunFacts[];
    best?: Readonly<Record<string, number>>;
  };
}

export function careerTotals(input: CareerInput): CareerTotals {
  const totals: CareerTotals = { motionsWon: 0, contractsDone: 0, auctionsWon: 0, bubbles: 0, quests: 0, leagueRuns: 0 };
  for (const run of input.runs) {
    totals.motionsWon += run.counters.motionsWon;
    totals.contractsDone += run.counters.contractsDone;
    totals.auctionsWon += run.counters.auctionsWon;
    totals.bubbles += run.bubbles;
    totals.quests += run.quests;
    // "Ligde" bir haftayı istiyor: 90 günlük günün koşusu sayılmıyor (Tur 53, Codex #82).
    if (run.league === 'finished' && run.leagueKind !== 'day') totals.leagueRuns++;
  }
  for (const key of Object.keys(totals) as AchievementTotal[]) totals[key] += input.archived?.totals?.[key] ?? 0;
  return totals;
}

/** Zafer kazanılan farklı CEO'lar (senaryo dışı). */
export function victoryCeos(input: CareerInput): string[] {
  const ceos = new Set(input.archived?.victoryCeos ?? []);
  for (const run of input.runs) {
    if (run.mode !== 'scenario' && run.ceoId && run.wins.length + run.closedWins > 0) ceos.add(run.ceoId);
  }
  return [...ceos];
}

/** Bir koşunun zafer yolları: özetin listesi ve zaferlerin kendi yolları. */
export function runPaths(run: Pick<RunFacts, 'paths' | 'wins'>): PathId[] {
  const paths = new Set<PathId>(run.paths ?? []);
  for (const win of run.wins) if (win.path) paths.add(win.path);
  return [...paths];
}

/** Zafer kazanılan farklı yollar (Tur 61, senaryo dışı). */
export function victoryPaths(input: CareerInput): string[] {
  const paths = new Set(input.archived?.victoryPaths ?? []);
  for (const run of input.runs) {
    if (run.mode === 'scenario') continue;
    for (const path of runPaths(run)) paths.add(path);
  }
  return [...paths];
}

export interface AchievementStatus {
  def: AchievementDef;
  /** Koşu rozetinde en iyi koşunun değeri; kariyer rozetinde toplam. */
  value: number;
  target: number;
  done: boolean;
  /** Koşu rozetini açan ilk koşu (depodaki sırayla). */
  runKey?: string;
}

export function achievementStatus(def: AchievementDef, input: CareerInput, totals = careerTotals(input)): AchievementStatus {
  if (isRunScoped(def)) {
    let value = 0;
    let runKey: string | undefined;
    // Budanan koşu da koşu rozetinin en iyisinde sayılıyor (Codex #70).
    for (const run of [...input.runs, ...(input.archived?.runs ?? [])]) {
      const v = runValue(def, run);
      if (v >= def.target && runKey === undefined) runKey = run.key;
      value = Math.max(value, v);
    }
    value = Math.max(value, input.archived?.best?.[def.id] ?? 0);
    return { def, value, target: def.target, done: value >= def.target, ...(runKey ? { runKey } : {}) };
  }
  let value = 0;
  let target = def.target;
  switch (def.kind) {
    case 'total':
      value = def.total ? totals[def.total] : 0;
      break;
    case 'scenarioEvery':
      target = SCENARIOS.length;
      value = SCENARIOS.filter((scenario) => (input.scenarioStars[scenario.id] ?? 0) >= def.target).length;
      break;
    case 'scenarioStars':
      value = SCENARIOS.reduce((sum, scenario) => sum + (input.scenarioStars[scenario.id] ?? 0), 0);
      break;
    case 'ceoVictories':
      value = victoryCeos(input).length;
      break;
    case 'pathVictories':
      value = victoryPaths(input).length;
      break;
  }
  return { def, value, target, done: value >= target };
}

export function achievementStatuses(input: CareerInput): AchievementStatus[] {
  const totals = careerTotals(input);
  return ACHIEVEMENTS.map((def) => achievementStatus(def, input, totals));
}
