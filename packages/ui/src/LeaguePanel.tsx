import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CEO_BY_ID } from '@capital/content';
import { LEAGUE_SAMPLE_DAYS, decodeRun, encodeRun, formatMoney, getPlayer, replayRun, runFromState } from '@capital/core';
import type { GameState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import type { LeagueBoard, LeagueEntry } from './useGame';
import { t } from './i18n';

/**
 * Tohum Ligi arayüzü: tablo, hayalet karşılaştırması, tekrar doğrulaması
 * ve sonuç ekranı.
 *
 * Tablodaki her satır bir KANIT taşıyor (koşu kodu): "Doğrula" o koşuyu
 * bu tarayıcıda baştan oynatıp aynı skoru bulup bulmadığını gösteriyor.
 * Güven bir sunucuya değil herkesin kendi tekrarına dayanıyor.
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

/** Seçili hayalet; seçim yoksa oyuncunun kendisi olmayan en iyi koşu. */
export function useGhost(state: GameState): LeagueEntry | null {
  const entries = useLeagueEntries(state.league?.weekId ?? null);
  const [ghostId] = useState(readGhostId);
  return useMemo(() => {
    const chosen = ghostId ? entries.find((entry) => entry.id === ghostId) : undefined;
    return chosen ?? entries.find((entry) => !entry.mine) ?? null;
  }, [entries, ghostId]);
}

/** Hayaletin bu gündeki değeri — eğri 10 günde bir örneklendi. */
export function ghostValueAt(ghost: LeagueEntry, day: number): number | null {
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

type Verdict = { status: 'running'; day: number } | { status: 'ok' } | { status: 'bad'; reason: string };

function useVerifier() {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  /**
   * Tablo satırı doğrulanırken koşu kodu yetmez: satırın GÖSTERDİĞİ skor
   * ve hafta da kodla aynı olmalı. Yoksa biri dürüst bir koşunun kodunu
   * şişirilmiş bir skorun yanına koyar ve tekrar "doğrulandı" derdi.
   */
  const verify = async (key: string, code: string, expected?: { score: number; weekId: string }) => {
    const run = decodeRun(code);
    if (!run) {
      setVerdicts((v) => ({ ...v, [key]: { status: 'bad', reason: t('app.league.verify.unreadable') } }));
      return;
    }
    if (expected && (run.score !== expected.score || run.weekId !== expected.weekId)) {
      setVerdicts((v) => ({
        ...v,
        [key]: { status: 'bad', reason: t('app.league.verify.mismatch') },
      }));
      return;
    }
    setVerdicts((v) => ({ ...v, [key]: { status: 'running', day: 0 } }));
    const result = await replayRun(run, {
      yieldEvery: 20,
      onProgress: (day) => setVerdicts((v) => ({ ...v, [key]: { status: 'running', day } })),
    });
    setVerdicts((v) => ({
      ...v,
      [key]: result.ok ? { status: 'ok' } : { status: 'bad', reason: result.reason ?? t('app.league.verify.failed') },
    }));
  };
  return { verdicts, verify };
}

function VerdictText({ verdict }: { verdict: Verdict | undefined }): ReactElement | null {
  if (!verdict) return null;
  if (verdict.status === 'running') return <span className="muted">{t('app.league.verdict.running', { day: verdict.day })}</span>;
  if (verdict.status === 'ok') return <span className="pos">{t('app.league.verdict.ok')}</span>;
  return <span className="neg">{t('app.league.verdict.bad', { reason: verdict.reason })}</span>;
}

export function LeaguePanel(): ReactElement {
  const state = useGameState();
  const { league: board } = useGame();
  const weekId = state.league?.weekId ?? null;
  const entries = useLeagueEntries(weekId);
  const [ghostId, setGhostId] = useState(readGhostId);
  const { verdicts, verify } = useVerifier();
  const [pasted, setPasted] = useState('');

  if (!state.league) {
    return (
      <div className="league">
        <p className="muted">{t('app.league.freePlay')}</p>
      </div>
    );
  }

  const ghost = (ghostId ? entries.find((e) => e.id === ghostId) : undefined) ?? entries.find((e) => !e.mine) ?? null;
  const mine = state.league.curve;
  const now = getPlayer(state).netWorth;
  const ghostNow = ghost ? ghostValueAt(ghost, state.time.day) : null;

  return (
    <div className="league">
      <p className="muted">
        {t('app.league.intro', { weekId: weekId ?? '', endDay: state.league.endDay })}{' '}
        {board.kind === 'shared'
          ? t('app.league.board.shared')
          : t('app.league.board.local')}
      </p>

      <section className="league-compare">
        <Sparks mine={mine} ghost={ghost?.curve ?? null} slots={state.league.endDay / LEAGUE_SAMPLE_DAYS} />
        <div className="league-legend">
          <span>
            <span className="league-key mine" aria-hidden="true" /> {t('app.league.legend.you', { money: formatMoney(now) })}
          </span>
          {ghost && (
            <span>
              <span className="league-key ghost" aria-hidden="true" /> {ghost.companyName}
              {ghostNow !== null ? t('app.league.legend.ghostToday', { money: formatMoney(ghostNow) }) : ''}
            </span>
          )}
        </div>
      </section>

      <section>
        <h3>{t('app.league.tableTitle')}</h3>
        {entries.length === 0 ? (
          <p className="muted">{t('app.league.empty')}</p>
        ) : (
          <ol className="league-table">
            {entries.map((entry, index) => (
              <li key={entry.id} className={entry.mine ? 'mine' : undefined}>
                <span className="league-rank">{index + 1}</span>
                <span className="league-who">
                  {entry.companyName}
                  <span className="muted">
                    {entry.who ? ` · ${entry.who}` : ''}
                    {entry.ceoId ? ` · ${CEO_BY_ID[entry.ceoId]?.name ?? ''}` : ''}
                  </span>
                </span>
                <span className="league-score">{formatMoney(entry.score)}</span>
                <span className="league-actions">
                  <button
                    type="button"
                    onClick={() => void verify(entry.id, entry.code, { score: entry.score, weekId: entry.weekId })}
                  >
                    {t('app.league.verify')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={ghost?.id === entry.id}
                    onClick={() => {
                      setGhostId(entry.id);
                      writeGhostId(entry.id);
                    }}
                  >
                    {t('app.league.ghost')}
                  </button>
                </span>
                <span className="league-verdict">
                  <VerdictText verdict={verdicts[entry.id]} />
                </span>
              </li>
            ))}
          </ol>
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
          <button type="button" disabled={pasted.trim().length === 0} onClick={() => void verify('pasted', pasted)}>
            {t('app.league.paste.verify')}
          </button>
          <VerdictText verdict={verdicts['pasted']} />
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
