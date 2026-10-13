import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { CEO_BY_ID } from '@capital/content';
import { LEAGUE_SAMPLE_DAYS, encodeRun, formatMoney, getPlayer, runFromState, verifyRun } from '@capital/core';
import type { GameState, RunRejection, RunVerdict } from '@capital/core';
import { useGame, useGameState } from './useGame';
import type { LeagueBoard, LeagueEntry } from './useGame';
import { progressFor, useLeagueStanding, verdictFor } from './leagueVerify';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Tohum Ligi arayüzü: tablo, hayalet karşılaştırması, tekrar doğrulaması
 * ve sonuç ekranı.
 *
 * Tablodaki her satır bir KANIT taşıyor (koşu kodu). Tur 31'den beri bu
 * tarayıcı her satırı kendiliğinden yeniden oynatıyor ve sıralama yalnızca
 * doğrulanmış koşulardan, tekrarın bulduğu skorla (`leagueVerify`).
 * Satırın beyan ettiği skor, ad, CEO ve eğri sıralamaya girmiyor; tutmayan
 * satır nedeniyle ayrı listede. Güven bir sunucuya değil herkesin kendi
 * tekrarına dayanıyor.
 */

const GHOST_KEY = 'capitalforge.league.ghost';

function readGhostId(): string | null {
  try {
    return localStorage.getItem(GHOST_KEY);
  } catch {
    return null;
  }
}

function writeGhostId(id: string | null): void {
  try {
    if (id) localStorage.setItem(GHOST_KEY, id);
    else localStorage.removeItem(GHOST_KEY);
  } catch {
    /* tarayıcı depolaması kapalı — hayalet bu oturumda hatırlanmaz */
  }
}

/*
 * TEK ABONELİK. Gündem çipi (hayalet farkı) ve lig paneli aynı tabloyu
 * okuyor; ikisi ayrı abone olunca paylaşılan depoda iki özdeş sorgu ve
 * her teslimatta iki ad çözümü koşuyordu. Tablo + hafta başına bir
 * abonelik açılıyor, okuyanlar onu paylaşıyor, son okuyan gidince kapanıyor.
 */
interface SharedFeed {
  entries: LeagueEntry[];
  listeners: Set<(entries: LeagueEntry[]) => void>;
  stop: () => void;
}
const feeds = new Map<LeagueBoard, Map<string, SharedFeed>>();

function joinFeed(board: LeagueBoard, weekId: string, listener: (entries: LeagueEntry[]) => void): () => void {
  let byWeek = feeds.get(board);
  if (!byWeek) feeds.set(board, (byWeek = new Map()));
  let feed = byWeek.get(weekId);
  if (!feed) {
    const created: SharedFeed = { entries: [], listeners: new Set(), stop: () => undefined };
    created.stop = board.subscribe(weekId, (next) => {
      created.entries = [...next].sort((a, b) => b.score - a.score);
      created.listeners.forEach((notify) => notify(created.entries));
    });
    byWeek.set(weekId, created);
    feed = created;
  }
  feed.listeners.add(listener);
  listener(feed.entries);
  return () => {
    feed!.listeners.delete(listener);
    if (feed!.listeners.size === 0) {
      feed!.stop();
      byWeek!.delete(weekId);
    }
  };
}

/** Bu haftanın tablosu (paylaşılan tek abonelikten). */
export function useLeagueEntries(weekId: string | null): LeagueEntry[] {
  const { league } = useGame();
  const [entries, setEntries] = useState<LeagueEntry[]>([]);
  useEffect(() => {
    if (!weekId) return;
    return joinFeed(league, weekId, setEntries);
  }, [league, weekId]);
  return entries;
}

/**
 * Hayalet: doğrulanmışsa eğrisi tekrarın kendisinden. Doğrulanmamış bir
 * satırın eğrisi beyandır; gösterilebilir (oyuncunun kendi kıyası) ama
 * `verified: false` taşır.
 */
export interface Ghost {
  entry: LeagueEntry;
  name: string;
  curve: number[];
  verified: boolean;
}

function ghostOf(entry: LeagueEntry): Ghost {
  const verdict = verdictFor(entry);
  return verdict?.status === 'ok'
    ? { entry, name: verdict.companyName, curve: verdict.curve, verified: true }
    : { entry, name: entry.companyName, curve: entry.curve, verified: false };
}

/** Seçili hayalet; seçim yoksa oyuncunun olmayan en iyi DOĞRULANMIŞ koşu, o da yoksa en iyi beyan. */
function pickGhost(entries: readonly LeagueEntry[], ghostId: string | null): Ghost | null {
  const chosen = ghostId ? entries.find((entry) => entry.id === ghostId) : undefined;
  if (chosen) return ghostOf(chosen);
  const others = entries.filter((entry) => !entry.mine);
  const verified = others
    .map((entry) => ({ entry, verdict: verdictFor(entry) }))
    .filter((row): row is { entry: LeagueEntry; verdict: Extract<RunVerdict, { status: 'ok' }> } => row.verdict?.status === 'ok')
    .sort((a, b) => b.verdict.score - a.verdict.score)[0];
  if (verified) return ghostOf(verified.entry);
  const unverified = others.find((entry) => verdictFor(entry) === undefined);
  return unverified ? ghostOf(unverified) : null;
}

export function useGhost(state: GameState): Ghost | null {
  const entries = useLeagueEntries(state.league?.weekId ?? null);
  // Gündem çipi doğrulama koşturmuyor; önbellekteki sonuçları okuyor.
  useLeagueStanding(entries, false);
  const [ghostId] = useState(readGhostId);
  return pickGhost(entries, ghostId);
}

/** Hayaletin bu gündeki değeri — eğri 10 günde bir örneklendi. */
export function ghostValueAt(ghost: Ghost, day: number): number | null {
  const index = Math.floor(day / LEAGUE_SAMPLE_DAYS);
  return ghost.curve[Math.min(index, ghost.curve.length - 1)] ?? null;
}

function Sparks({ mine, ghost, slots }: { mine: number[]; ghost: number[] | null; slots: number }): ReactElement {
  const width = 320;
  const height = 96;
  const all = [...mine, ...(ghost ?? [])];
  const max = Math.max(1, ...all);
  const points = (series: number[]) =>
    series
      .map((value, index) => {
        const x = (index / Math.max(1, slots)) * (width - 8) + 4;
        const y = height - 6 - (value / max) * (height - 16);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return (
    <svg className="league-sparks" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('app.league.sparksLabel')}>
      <line x1="4" x2={width - 4} y1={height - 6} y2={height - 6} className="league-axis" />
      {ghost && ghost.length > 1 && <polyline points={points(ghost)} className="league-ghost-line" />}
      {mine.length > 1 && <polyline points={points(mine)} className="league-mine-line" />}
    </svg>
  );
}

const REJECTION: Record<RunRejection, MessageKey> = {
  unreadable: 'app.league.reject.unreadable',
  tooLarge: 'app.league.reject.tooLarge',
  malformed: 'app.league.reject.malformed',
  mismatch: 'app.league.reject.mismatch',
  replay: 'app.league.reject.replay',
  curve: 'app.league.reject.curve',
  version: 'app.league.reject.version',
  unknownVersion: 'app.league.reject.unknownVersion',
  error: 'app.league.reject.error',
};

function rejectionText(verdict: Extract<RunVerdict, { status: 'bad' }>, claimed?: number): string {
  const reason = t(REJECTION[verdict.kind]);
  if (verdict.score === undefined || claimed === undefined || verdict.score === claimed) return reason;
  return `${reason} ${t('app.league.reject.found', { found: formatMoney(verdict.score), claimed: formatMoney(claimed) })}`;
}

/** Yapıştırılan kodun tek seferlik doğrulaması (tablodan bağımsız). */
function usePasteVerifier() {
  const [state, setState] = useState<{ status: 'idle' } | { status: 'running'; day: number } | { status: 'done'; verdict: RunVerdict }>({ status: 'idle' });
  const verify = async (code: string) => {
    setState({ status: 'running', day: 0 });
    const verdict = await verifyRun(code, undefined, {
      yieldEvery: 20,
      onProgress: (day) => setState({ status: 'running', day }),
    });
    setState({ status: 'done', verdict });
  };
  return { state, verify };
}

function EntryWho({ entry, name, ceoId }: { entry: LeagueEntry; name: string; ceoId: string | null }): ReactElement {
  return (
    <span className="league-who">
      {name}
      <span className="muted">
        {entry.who ? ` · ${entry.who}` : ''}
        {ceoId ? ` · ${CEO_BY_ID[ceoId]?.name ?? ''}` : ''}
      </span>
    </span>
  );
}

export function LeaguePanel(): ReactElement {
  const state = useGameState();
  const { league: board } = useGame();
  const weekId = state.league?.weekId ?? null;
  const entries = useLeagueEntries(weekId);
  // Panel açıkken bu tarayıcı her satırı yeniden oynatıyor.
  const standing = useLeagueStanding(entries, state.league !== undefined);
  const [ghostId, setGhostId] = useState(readGhostId);
  const paste = usePasteVerifier();
  const [pasted, setPasted] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  if (!state.league) {
    return (
      <div className="league">
        <p className="muted">{t('app.league.freePlay')}</p>
      </div>
    );
  }

  const ghost = pickGhost(entries, ghostId);
  const mine = state.league.curve;
  const now = getPlayer(state).netWorth;
  const ghostNow = ghost ? ghostValueAt(ghost, state.time.day) : null;
  const ghostButton = (entry: LeagueEntry) => (
    <button
      type="button"
      aria-pressed={ghost?.entry.id === entry.id}
      onClick={() => {
        setGhostId(entry.id);
        writeGhostId(entry.id);
      }}
    >
      {t('app.league.ghost')}
    </button>
  );

  return (
    <div className="league">
      <p className="muted">
        {t('app.league.intro', { weekId: weekId ?? '', endDay: state.league.endDay })}{' '}
        {board.kind === 'shared'
          ? t('app.league.board.shared')
          : t('app.league.board.local')}{' '}
        {t('app.league.trust')}
      </p>

      <section className="league-compare">
        <Sparks mine={mine} ghost={ghost?.curve ?? null} slots={state.league.endDay / LEAGUE_SAMPLE_DAYS} />
        <div className="league-legend">
          <span>
            <span className="league-key mine" aria-hidden="true" /> {t('app.league.legend.you', { money: formatMoney(now) })}
          </span>
          {ghost && (
            <span>
              <span className="league-key ghost" aria-hidden="true" /> {ghost.name}
              {ghostNow !== null ? t('app.league.legend.ghostToday', { money: formatMoney(ghostNow) }) : ''}
              {!ghost.verified && <span className="muted"> · {t('app.league.legend.unverified')}</span>}
            </span>
          )}
        </div>
      </section>

      <section>
        <h3>{t('app.league.tableTitle')}</h3>
        {entries.length === 0 ? (
          <p className="muted">{t('app.league.empty')}</p>
        ) : (
          <>
            {standing.ranked.length === 0 && <p className="muted">{t('app.league.noneVerified')}</p>}
            <ol className="league-table" data-league-table="ranked">
              {standing.ranked.map(({ entry, verdict }, index) => (
                <li key={entry.id} className={entry.mine ? 'mine' : undefined} data-league-row="ranked">
                  <span className="league-rank">{index + 1}</span>
                  <EntryWho entry={entry} name={verdict.companyName} ceoId={verdict.ceoId} />
                  <span className="league-score">{formatMoney(verdict.score)}</span>
                  <span className="league-actions">{ghostButton(entry)}</span>
                  <span className="league-verdict">
                    <span className="pos">{t('app.league.verdict.ok')}</span>
                  </span>
                </li>
              ))}
            </ol>
            {standing.pending.length > 0 && (
              <ul className="league-table league-pending" data-league-table="pending">
                {standing.pending.map((entry) => {
                  const day = progressFor(entry);
                  return (
                    <li key={entry.id} className={entry.mine ? 'mine' : undefined} data-league-row="pending">
                      <span className="league-rank">·</span>
                      <EntryWho entry={entry} name={entry.companyName} ceoId={entry.ceoId} />
                      <span className="league-score muted">{t('app.league.claimed', { money: formatMoney(entry.score) })}</span>
                      <span className="league-actions" />
                      <span className="league-verdict muted">
                        {day !== null && day > 0 ? t('app.league.verdict.running', { day }) : t('app.league.verdict.queued')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {standing.copies.length > 0 && (
              <ul className="league-table league-copies" data-league-table="copies">
                {standing.copies.map(({ entry, verdict, of }) => (
                  <li key={entry.id} className={entry.mine ? 'mine' : undefined} data-league-row="copy">
                    <span className="league-rank">=</span>
                    <EntryWho entry={entry} name={verdict.companyName} ceoId={verdict.ceoId} />
                    <span className="league-score muted">{formatMoney(verdict.score)}</span>
                    <span className="league-actions" />
                    <span className="league-verdict muted">
                      {t('app.league.copyOf', { name: verdictFor(of)?.status === 'ok' ? (verdictFor(of) as { companyName: string }).companyName : of.companyName })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {standing.rejected.length > 0 && (
              <div className="league-rejected" data-league-table="rejected">
                <button type="button" className="ghost" aria-expanded={showRejected} onClick={() => setShowRejected((v) => !v)}>
                  {t('app.league.rejectedToggle', { count: standing.rejected.length })}
                </button>
                {showRejected && (
                  <ul className="league-table">
                    {standing.rejected.map(({ entry, verdict }) => (
                      <li key={entry.id} className={entry.mine ? 'mine' : undefined} data-league-row="rejected" data-reject={verdict.kind}>
                        <span className="league-rank">×</span>
                        <EntryWho entry={entry} name={entry.companyName} ceoId={entry.ceoId} />
                        <span className="league-score muted">{t('app.league.claimed', { money: formatMoney(entry.score) })}</span>
                        <span className="league-actions" />
                        <span className="league-verdict neg">{rejectionText(verdict, entry.score)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="league-paste">
        <h3>{t('app.league.paste.title')}</h3>
        <textarea
          className="manual-text"
          value={pasted}
          spellCheck={false}
          placeholder="CF1.…"
          onChange={(e) => setPasted(e.target.value)}
          aria-label={t('app.league.codeLabel')}
        />
        <div className="manual-actions">
          <button type="button" disabled={pasted.trim().length === 0 || paste.state.status === 'running'} onClick={() => void paste.verify(pasted)}>
            {t('app.league.paste.verify')}
          </button>
          {paste.state.status === 'running' && <span className="muted">{t('app.league.verdict.running', { day: paste.state.day })}</span>}
          {paste.state.status === 'done' &&
            (paste.state.verdict.status === 'ok' ? (
              <span className="pos">{t('app.league.verdict.okScore', { money: formatMoney(paste.state.verdict.score) })}</span>
            ) : (
              <span className="neg">{t('app.league.verdict.bad', { reason: rejectionText(paste.state.verdict) })}</span>
            ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Lig sonu ekranı: skor, tabloya gönderme ve koşu kodu.
 */
export function LeagueResultScreen({ onNewGame }: { onNewGame: () => void }): ReactElement | null {
  const state = useGameState();
  const { run, league: board, toast, setView } = useGame();
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const league = state.league;
  if (!league || league.finishedDay === undefined || league.resultSeen) return null;

  const leagueRun = runFromState(state);
  const lost = league.outcome === 'lost';

  const submit = async () => {
    if (!leagueRun) return;
    const outcome = await board.submit({
      weekId: leagueRun.weekId,
      companyName: leagueRun.companyName,
      ceoId: leagueRun.ceoId,
      score: leagueRun.score,
      curve: leagueRun.curve,
      code: encodeRun(leagueRun),
      submittedAt: new Date().toISOString(),
    });
    const text: Record<typeof outcome, string> = {
      saved: board.kind === 'shared' ? t('app.league.submit.savedShared') : t('app.league.submit.savedLocal'),
      'kept-better': t('app.league.submit.keptBetter'),
      error: t('app.league.submit.error'),
    };
    setSent(text[outcome]);
    toast(text[outcome], outcome === 'error' ? 'bad' : 'good');
  };

  const copy = async () => {
    if (!leagueRun) return;
    const encoded = encodeRun(leagueRun);
    try {
      await navigator.clipboard.writeText(encoded);
      toast(t('app.league.copied'), 'good');
    } catch {
      setCode(encoded);
    }
  };

  return (
    <div className="gameover league-result" role="alertdialog" aria-label={t('app.league.result.label')}>
      <div className="gameover-card">
        <h2>{lost ? t('app.league.result.titleLost') : t('app.league.result.titleDone')}</h2>
        <p className="league-final">{lost ? t('app.league.result.scoreZero') : formatMoney(league.score ?? 0)}</p>
        <p className="muted">
          {t('app.league.result.summary', {
            weekId: league.weekId,
            day: league.finishedDay,
            moves: state.commandLog?.length ?? 0,
          })}
        </p>
        {sent && <p>{sent}</p>}
        {code && <textarea className="manual-text" readOnly value={code} onFocus={(e) => e.target.select()} aria-label={t('app.league.codeLabel')} />}
        <div className="gameover-actions">
          {!lost && (
            <button type="button" className="primary" onClick={() => void submit()} disabled={sent !== null}>
              {board.kind === 'shared' ? t('app.league.result.submitShared') : t('app.league.result.submitLocal')}
            </button>
          )}
          <button type="button" className="ghost-invert" onClick={() => void copy()}>
            {t('app.league.result.copy')}
          </button>
          <button
            type="button"
            className="ghost-invert"
            onClick={() => {
              run({ type: 'DISMISS_LEAGUE' });
              setView({ openPanel: 'league' });
            }}
          >
            {t('app.league.result.openTable')}
          </button>
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            {t('app.league.result.newRun')}
          </button>
        </div>
      </div>
    </div>
  );
}
