import { CEO_BY_ID } from '@capital/content';
import { GameEngine } from './engine';
import { formatMoney } from './selectors';
import { LEAGUE_DAYS, LEAGUE_SAMPLE_DAYS } from './systems/league';
import { isPurchasable } from './systems/city';
import { createNewGame } from './worldgen';
import type { GameCommand, GameState, LoggedCommand } from './types';

/**
 * Lig koşu kodu ve tekrar doğrulaması (kural ve takvim: systems/league).
 *
 * GÜVEN MODELİ (Tur 31). Sunucu yok: tablo claude.ai'nin paylaşılan
 * deposunda, her kişi yalnızca kendi satırına yazabiliyor ama satırın
 * içeriği tamamen onun tarayıcısından geliyor. Bu yüzden satıra değil
 * KANITA güveniliyor: her tarayıcı her koşuyu kendisi yeniden oynatıyor ve
 * sıralama yalnızca kendi tekrarının bulduğu skorla yapılıyor. Satırın
 * beyan ettiği skor, ad, CEO ve eğri sıralamaya hiç girmiyor; gösterilen
 * her şey doğrulanmış koşunun kendisinden.
 *
 * Bu modelin yapamadığı tek şey kopyayı önlemek: koşu kodu tabloda açık,
 * biri başkasının koşusunu kendi satırına yazabilir (şirket adı simülasyonu
 * değiştirmediği için adı da değiştirebilir). Aynı eğri ve skor "aynı koşu"
 * diye işaretleniyor ve tabloda bir kez sayılıyor; hangisinin önce
 * gönderildiğini ise yalnızca satırın kendi beyan ettiği zaman söylüyor.
 */

// ---------------------------------------------------------------- koşu kodu

export interface LeagueRun {
  /** 1: Tur 17 · 2: simülasyon parmak izi (Tur 31). */
  version: 1 | 2;
  weekId: string;
  ceoId: string | null;
  companyName: string;
  score: number;
  /** Net değer eğrisi — hayalet karşılaştırması için; tekrarla birebir tutmalı. */
  curve: number[];
  log: LoggedCommand[];
  /** Koşunun oynandığı simülasyonun parmak izi (`simFingerprint`); v1'de yok. */
  sim?: string;
}

/** Kod ve günlük sınırları: bozuk ya da kötü niyetli bir satır kimsenin tarayıcısını kilitlemesin. */
export const RUN_LIMITS = {
  /** Kodun karakter sınırı (base64). Gerçek bir koşu ~10–300 bin karakter. */
  codeLength: 1_200_000,
  /** Günlükteki komut sınırı. Vekil 360 günde ~200, yoğun bir oyuncu birkaç bin. */
  logEntries: 12_000,
  nameLength: 40,
} as const;

/**
 * Günlüğe girebilecek komutlar. Tanımadığı türü taşıyan kod reddediliyor:
 * motor da reddederdi, ama sınırın kod çözülürken çizilmesi tekrarın hiç
 * başlamaması demek.
 */
const LOGGABLE: ReadonlySet<string> = new Set<GameCommand['type']>([
  'ACCEPT_CONTRACT',
  'BUILD',
  'BUYOUT_TILE',
  'BUY_SHARES',
  'BUY_TILE',
  'CANCEL_TAKEOVER_ORDER',
  'CHOOSE_CARD',
  'CLAIM_BUBBLE',
  'CLAIM_QUEST',
  'DECLINE_CONTRACT',
  'DEMOLISH',
  'HOLDING_TRANSFER',
  'ISSUE_SHARES',
  'LOBBY',
  'OPEN_CITY',
  'PLACE_BID',
  'PLACE_TAKEOVER_ORDER',
  'RENAME_COMPANY',
  'REPAY_LOAN',
  'RESPOND_UNION',
  'SELL_SHARES',
  'SELL_TILE',
  'SET_AUTO_PRICE',
  'SET_FLAG',
  'SET_FOCUS',
  'SET_PRICE_MULTIPLIER',
  'SET_STOCK',
  'SET_WAGE_POLICY',
  'SWITCH_CITY',
  'TAKE_LOAN',
]);

const WEEK_ID = /^\d{4}-W\d{2}$/;
const CURVE_MAX = Math.floor(LEAGUE_DAYS / LEAGUE_SAMPLE_DAYS) + 1;

export function runFromState(state: GameState): LeagueRun | null {
  const league = state.league;
  if (!league || league.score === undefined) return null;
  const player = state.companies[state.playerCompanyId]!;
  return {
    version: 2,
    weekId: league.weekId,
    ceoId: player.ceoId,
    companyName: player.name,
    score: league.score,
    curve: league.curve,
    log: state.commandLog ?? [],
    sim: simFingerprint(),
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

export type DecodeError = 'unreadable' | 'tooLarge' | 'malformed';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Yapı denetimi: her alan beklenen türde ve sınırda mı? */
function wellFormed(raw: unknown): raw is LeagueRun {
  if (!raw || typeof raw !== 'object') return false;
  const run = raw as Record<string, unknown>;
  if (run['version'] !== 1 && run['version'] !== 2) return false;
  if (typeof run['weekId'] !== 'string' || !WEEK_ID.test(run['weekId'])) return false;
  const ceoId = run['ceoId'];
  if (ceoId !== null && (typeof ceoId !== 'string' || !CEO_BY_ID[ceoId])) return false;
  const name = run['companyName'];
  if (typeof name !== 'string' || name.length === 0 || name.length > RUN_LIMITS.nameLength) return false;
  if (!finite(run['score']) || (run['score'] as number) < 0) return false;
  const curve = run['curve'];
  if (!Array.isArray(curve) || curve.length > CURVE_MAX || !curve.every(finite)) return false;
  if (run['sim'] !== undefined && (typeof run['sim'] !== 'string' || run['sim'].length > 32)) return false;
  const log = run['log'];
  if (!Array.isArray(log) || log.length > RUN_LIMITS.logEntries) return false;
  for (const entry of log) {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [day, command] = entry as [unknown, unknown];
    if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > LEAGUE_DAYS) return false;
    if (!command || typeof command !== 'object' || Array.isArray(command)) return false;
    const type = (command as { type?: unknown }).type;
    if (typeof type !== 'string' || !LOGGABLE.has(type)) return false;
  }
  return true;
}

/** Kodu çözer; reddederse nedeniyle. */
export function decodeRunChecked(code: string): { run: LeagueRun } | { error: DecodeError } {
  const trimmed = code.trim();
  if (trimmed.length > RUN_LIMITS.codeLength) return { error: 'tooLarge' };
  if (!trimmed.startsWith('CF1.')) return { error: 'unreadable' };
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64(trimmed.slice(4)));
  } catch {
    return { error: 'unreadable' };
  }
  return wellFormed(raw) ? { run: raw } : { error: 'malformed' };
}

export function decodeRun(code: string): LeagueRun | null {
  const decoded = decodeRunChecked(code);
  return 'run' in decoded ? decoded.run : null;
}

// ---------------------------------------------------------------- parmak izi

let fingerprint: string | null = null;

/**
 * Simülasyonun parmak izi (Tur 31).
 *
 * Oyun güncellenince simülasyon değişebiliyor (Tur 29'un deri zinciri,
 * Tur 30'un yaşayan şehirleri) ve haftanın ortasında oynanmış dürüst bir
 * koşu yeni sürümde tutmayabiliyor. O koşu sahte değil, eski. Ayırt etmek
 * için her koşu oynandığı simülasyonun izini taşıyor: sabit bir dünyada
 * 60 gün, durumun sayısal izdüşümünün özeti. Metinler (haber, ad) izin
 * dışında — dil değişince iz değişmesin. Sürüm sayacı elle artırılsaydı
 * unutulurdu; iz kendiliğinden değişiyor.
 */
export function simFingerprint(): string {
  fingerprint ??= computeSimFingerprint();
  return fingerprint;
}

const FINGERPRINT_DAYS = 60;

function fingerprintWorld(): GameEngine {
  return new GameEngine(createNewGame({ seed: 20_261_013, companyName: 'Parmak İzi', league: { weekId: '2000-W01' } }));
}

/**
 * İz senaryosu: boşta bir dünya değil, fırsatları da işleten küçük bir oyun.
 * Balon ve görev ödülleri lig skorunu değiştirebiliyor; boşta dünyada mağaza
 * olmadığı için balon çıkmıyor, ödül de alınmıyordu. Takvimleri ya da
 * ödülleri değişince iz değişmezse dürüst bir koşu tekrarda sahte sayılırdı
 * (sürüm farkı yerine). İlk gün tek bir bakkal, sonra her balon ve her
 * tamamlanan görev alınıyor (Codex #63).
 */
function fingerprintStep(engine: GameEngine, day: number): void {
  const state = engine.getState();
  if (day === 1) {
    for (const tile of state.map.tiles) {
      if (!isPurchasable(tile) || tile.structureId || tile.buildingId) continue;
      if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) continue;
      if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' }).ok) break;
    }
  }
  if (state.bubble) engine.dispatch({ type: 'CLAIM_BUBBLE' });
  state.quests?.items.forEach((quest, index) => {
    if (quest.doneDay !== undefined && !quest.claimed) engine.dispatch({ type: 'CLAIM_QUEST', index });
  });
  engine.runDay();
}

function fingerprintOf(state: GameState): string {
  const parts: string[] = [String(state.time.day), String(state.rng.s)];
  // Fırsatların takvimi ve ödülleri de izde (ödül alınmasa da).
  parts.push(`bubbles:${state.bubblesShown ?? 0}/${state.bubblesCaught ?? 0}/${state.nextBubbleDay ?? '-'}`);
  parts.push(`quests:${state.questsDone ?? 0}`);
  for (const quest of state.quests?.items ?? []) parts.push(`${quest.defId}:${quest.target}:${quest.reward}:${quest.doneDay ?? '-'}`);
  for (const id of Object.keys(state.companies).sort()) {
    const c = state.companies[id]!;
    parts.push(`${id}:${Math.round(c.cash)}:${Math.round(c.netWorth)}`);
  }
  for (const id of Object.keys(state.buildings).sort()) {
    const b = state.buildings[id]!;
    parts.push(`${b.defId}@${b.tileId}:${b.companyId}`);
  }
  for (const id of Object.keys(state.market.spot).sort()) parts.push(`${id}=${state.market.spot[id]!.toFixed(6)}`);
  return fnv(parts.join('|'));
}

/** Önbelleksiz hesap (test: dil değişince iz aynı kalmalı). */
export function computeSimFingerprint(): string {
  const engine = fingerprintWorld();
  for (let day = 1; day <= FINGERPRINT_DAYS; day++) fingerprintStep(engine, day);
  return fingerprintOf(engine.getState());
}

/**
 * Aynı iz, tarayıcıda parça parça: 10 günde bir kontrolü bırakıyor, tablo
 * açılırken arayüz donmuyor. Sonuç `simFingerprint` ile paylaşılıyor.
 */
export async function simFingerprintAsync(yieldEvery = 10): Promise<string> {
  if (fingerprint) return fingerprint;
  const engine = fingerprintWorld();
  for (let day = 1; day <= FINGERPRINT_DAYS; day++) {
    fingerprintStep(engine, day);
    if (day % yieldEvery === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fingerprint ??= fingerprintOf(engine.getState());
  return fingerprint;
}

/** 64 bitlik FNV-1a benzeri özet (iki 32 bitlik koldan), onaltılık. */
export function fnv(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------- tekrar

export interface ReplayResult {
  ok: boolean;
  /** Tekrarda bulunan skor ve eğri. */
  score: number;
  curve: number[];
  reason?: string;
}

/** Bir lig koşusunun başlangıç dünyası. */
export function createLeagueGame(weekId: string, companyName: string, ceoId: string | null): GameState {
  return createNewGame({ companyName, ceoId, league: { weekId } });
}

function sameCurve(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Koşuyu baştan oynatır. `yieldEvery` verilirse her N günde bir kontrolü
 * bırakır (tarayıcıda arayüz donmasın diye) — sonucu değiştirmez. Skor da
 * eğri de tutmalı: eğri hayalet karşılaştırmasında gösteriliyor.
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
  const curve = state().league?.curve ?? [];
  if (score !== run.score) {
    return { ok: false, score, curve, reason: `Tekrarda skor ${formatMoney(score)}, iddia ${formatMoney(run.score)}.` };
  }
  if (!sameCurve(curve, run.curve)) return { ok: false, score, curve, reason: 'Tekrarda eğri tutmadı.' };
  return { ok: true, score, curve };
}

// ---------------------------------------------------------------- doğrulama

export type RunRejection =
  /** Kod okunamıyor. */
  | 'unreadable'
  /** Kod sınırı aşıyor. */
  | 'tooLarge'
  /** Kodun yapısı bozuk (alan türü, tanınmayan komut, sınır dışı gün). */
  | 'malformed'
  /** Satırın beyan ettiği skor, hafta, ad ya da CEO koddakiyle aynı değil. */
  | 'mismatch'
  /** Bu sürümde tekrar skoru tutmadı: sahte ya da bozuk. */
  | 'replay'
  /** Skor tuttu, eğri tutmadı. */
  | 'curve'
  /** Başka bir simülasyon sürümünde oynanmış; bu sürümle tutmuyor (sahte değil). */
  | 'version'
  /** Parmak izsiz eski kod; bu sürümle tutmuyor, hangi sürümde oynandığı bilinmiyor. */
  | 'unknownVersion'
  /** Tekrar sırasında hata. */
  | 'error';

export interface VerifiedRun {
  status: 'ok';
  score: number;
  curve: number[];
  companyName: string;
  ceoId: string | null;
  /** Günlük boş mu (kopya tespiti hiç oynanmamış koşuları ayırmasın). */
  idle: boolean;
}

export interface RejectedRun {
  status: 'bad';
  kind: RunRejection;
  /** Tekrarın bulduğu skor (tekrar koştuysa). */
  score?: number;
}

export type RunVerdict = VerifiedRun | RejectedRun;

/** Satırın beyanı: tabloya yazılan alanlar. */
export interface RunClaim {
  weekId: string;
  score: number;
  companyName?: string;
  ceoId?: string | null;
}

/**
 * Bir koşuyu doğrular. Satırın beyanı verilirse beyan koda birebir uymalı;
 * sonra koşu bu tarayıcıda yeniden oynanıyor. Doğrulanan koşunun skoru,
 * eğrisi, adı ve CEO'su tekrarın kendisinden — satırdan değil.
 */
export async function verifyRun(
  code: string,
  claim?: RunClaim,
  options: { yieldEvery?: number; onProgress?: (day: number) => void } = {},
): Promise<RunVerdict> {
  const decoded = decodeRunChecked(code);
  if ('error' in decoded) return { status: 'bad', kind: decoded.error };
  const run = decoded.run;
  if (
    claim &&
    (claim.weekId !== run.weekId ||
      claim.score !== run.score ||
      (claim.companyName !== undefined && claim.companyName !== run.companyName) ||
      (claim.ceoId !== undefined && claim.ceoId !== run.ceoId))
  ) {
    return { status: 'bad', kind: 'mismatch' };
  }
  let result: ReplayResult;
  try {
    result = await replayRun(run, options);
  } catch {
    return { status: 'bad', kind: 'error' };
  }
  if (result.ok) {
    return { status: 'ok', score: result.score, curve: result.curve, companyName: run.companyName, ceoId: run.ceoId, idle: run.log.length === 0 };
  }
  // Tutmayan koşu: sürüm farkı mı, sahte mi?
  const kind: RunRejection =
    run.sim === undefined ? 'unknownVersion' : run.sim !== simFingerprint() ? 'version' : result.score === run.score ? 'curve' : 'replay';
  return { status: 'bad', kind, score: result.score };
}

// ---------------------------------------------------------------- sıralama

export interface LeagueRow {
  id: string;
  submittedAt: string;
}

export interface LeagueStanding<T extends LeagueRow> {
  /** Doğrulanmış, tekrarın skoruyla sıralı; her koşu bir kez. */
  ranked: Array<{ entry: T; verdict: VerifiedRun }>;
  /** Henüz doğrulanmadı. */
  pending: T[];
  /** Doğrulanamadı (neden ve varsa tekrarın skoru). */
  rejected: Array<{ entry: T; verdict: RejectedRun }>;
  /** Doğrulanmış ama sıralamadaki bir koşunun aynısı (eğri ve skor). */
  copies: Array<{ entry: T; verdict: VerifiedRun; of: T }>;
}

/**
 * Tablonun kendisi. Satırın beyan ettiği skor sıralamaya girmiyor; yalnızca
 * doğrulanmış koşular, tekrarın skoruyla. Aynı eğri ve skoru taşıyan
 * koşulardan yalnızca önce gönderildiğini beyan eden sayılıyor (beyan
 * edilen zaman satırın kendisinden; sunucusuz bir tabloda başka saat yok).
 */
export function rankLeague<T extends LeagueRow>(
  entries: readonly T[],
  verdictOf: (entry: T) => RunVerdict | undefined,
): LeagueStanding<T> {
  const standing: LeagueStanding<T> = { ranked: [], pending: [], rejected: [], copies: [] };
  const verified: Array<{ entry: T; verdict: VerifiedRun }> = [];
  for (const entry of entries) {
    const verdict = verdictOf(entry);
    if (!verdict) standing.pending.push(entry);
    else if (verdict.status === 'bad') standing.rejected.push({ entry, verdict });
    else verified.push({ entry, verdict });
  }
  verified.sort((a, b) => a.entry.submittedAt.localeCompare(b.entry.submittedAt) || a.entry.id.localeCompare(b.entry.id));
  const firstOf = new Map<string, T>();
  for (const row of verified) {
    const key = `${row.verdict.score}|${row.verdict.curve.join(',')}`;
    const first = row.verdict.idle ? undefined : firstOf.get(key);
    if (first) standing.copies.push({ ...row, of: first });
    else {
      if (!row.verdict.idle) firstOf.set(key, row.entry);
      standing.ranked.push(row);
    }
  }
  standing.ranked.sort((a, b) => b.verdict.score - a.verdict.score);
  return standing;
}
