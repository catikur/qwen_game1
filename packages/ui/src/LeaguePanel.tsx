import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CEO_BY_ID } from '@capital/content';
import { LEAGUE_SAMPLE_DAYS, decodeRun, encodeRun, formatMoney, getPlayer, replayRun, runFromState } from '@capital/core';
import type { GameState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import type { LeagueEntry } from './useGame';

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

/** Bu haftanın tablosuna abone olur (bir kez, hafta değişince yeniden). */
export function useLeagueEntries(weekId: string | null): LeagueEntry[] {
  const { league } = useGame();
  const [entries, setEntries] = useState<LeagueEntry[]>([]);
  useEffect(() => {
    if (!weekId) return;
    return league.subscribe(weekId, (next) => setEntries([...next].sort((a, b) => b.score - a.score)));
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

function Sparks({ mine, ghost }: { mine: number[]; ghost: number[] | null }): ReactElement {
  const width = 320;
  const height = 96;
  const all = [...mine, ...(ghost ?? [])];
  const max = Math.max(1, ...all);
  const points = (series: number[]) =>
    series
      .map((value, index) => {
        const x = (index / Math.max(1, 36)) * (width - 8) + 4;
        const y = height - 6 - (value / max) * (height - 16);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  return (
    <svg className="league-sparks" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net değer eğrisi: sen ve hayalet">
      <line x1="4" x2={width - 4} y1={height - 6} y2={height - 6} className="league-axis" />
      {ghost && ghost.length > 1 && <polyline points={points(ghost)} className="league-ghost-line" />}
      {mine.length > 1 && <polyline points={points(mine)} className="league-mine-line" />}
    </svg>
  );
}

type Verdict = { status: 'running'; day: number } | { status: 'ok' } | { status: 'bad'; reason: string };

function useVerifier() {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const verify = async (key: string, code: string) => {
    const run = decodeRun(code);
    if (!run) {
      setVerdicts((v) => ({ ...v, [key]: { status: 'bad', reason: 'Kod okunamadı.' } }));
      return;
    }
    setVerdicts((v) => ({ ...v, [key]: { status: 'running', day: 0 } }));
    const result = await replayRun(run, {
      yieldEvery: 20,
      onProgress: (day) => setVerdicts((v) => ({ ...v, [key]: { status: 'running', day } })),
    });
    setVerdicts((v) => ({
      ...v,
      [key]: result.ok ? { status: 'ok' } : { status: 'bad', reason: result.reason ?? 'Tekrar tutmadı.' },
    }));
  };
  return { verdicts, verify };
}

function VerdictText({ verdict }: { verdict: Verdict | undefined }): ReactElement | null {
  if (!verdict) return null;
  if (verdict.status === 'running') return <span className="muted">tekrar oynanıyor · {verdict.day}. gün</span>;
  if (verdict.status === 'ok') return <span className="pos">doğrulandı</span>;
  return <span className="neg">tutmadı — {verdict.reason}</span>;
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
        <p className="muted">
          Bu bir serbest oyun. Tohum Ligi'ne yeni oyun ekranından katılırsın: o haftanın şehri herkes için aynı,
          360 gün, skor şirket değeri.
        </p>
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
        {weekId} · herkes aynı şehirde, {state.league.endDay} gün.{' '}
        {board.kind === 'shared'
          ? 'Tablo bu sayfayı açan herkesle paylaşılıyor.'
          : 'Tablo yalnızca bu tarayıcıdaki koşuları gösteriyor.'}
      </p>

      <section className="league-compare">
        <Sparks mine={mine} ghost={ghost?.curve ?? null} />
        <div className="league-legend">
          <span>
            <span className="league-key mine" aria-hidden="true" /> Sen · {formatMoney(now)}
          </span>
          {ghost && (
            <span>
              <span className="league-key ghost" aria-hidden="true" /> {ghost.companyName}
              {ghostNow !== null ? ` · bu gün ${formatMoney(ghostNow)}` : ''}
            </span>
          )}
        </div>
      </section>

      <section>
        <h3>Bu haftanın tablosu</h3>
        {entries.length === 0 ? (
          <p className="muted">Henüz gönderilmiş koşu yok. İlk skoru sen bırak.</p>
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
                  <button type="button" onClick={() => void verify(entry.id, entry.code)}>
                    Doğrula
                  </button>
                  <button
                    type="button"
                    aria-pressed={ghost?.id === entry.id}
                    onClick={() => {
                      setGhostId(entry.id);
                      writeGhostId(entry.id);
                    }}
                  >
                    Hayalet
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
        <h3>Bir koşu kodunu doğrula</h3>
        <textarea
          className="manual-text"
          value={pasted}
          spellCheck={false}
          placeholder="CF1.…"
          onChange={(e) => setPasted(e.target.value)}
          aria-label="Koşu kodu"
        />
        <div className="manual-actions">
          <button type="button" disabled={pasted.trim().length === 0} onClick={() => void verify('pasted', pasted)}>
            Tekrar oynat ve doğrula
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
      saved: board.kind === 'shared' ? 'Skor tabloya yazıldı.' : 'Skor bu tarayıcının tablosuna yazıldı.',
      'kept-better': 'Bu haftaki daha iyi skorun tabloda kaldı.',
      error: 'Skor gönderilemedi — kodu kopyalayıp sonra deneyebilirsin.',
    };
    setSent(text[outcome]);
    toast(text[outcome], outcome === 'error' ? 'bad' : 'good');
  };

  const copy = async () => {
    if (!leagueRun) return;
    const encoded = encodeRun(leagueRun);
    try {
      await navigator.clipboard.writeText(encoded);
      toast('Koşu kodu panoya kopyalandı.', 'good');
    } catch {
      setCode(encoded);
    }
  };

  return (
    <div className="gameover league-result" role="alertdialog" aria-label="Lig sonucu">
      <div className="gameover-card">
        <h2>{lost ? 'Lig koşusu: devralındın' : 'Lig koşusu bitti'}</h2>
        <p className="league-final">{lost ? 'Skor 0' : formatMoney(league.score ?? 0)}</p>
        <p className="muted">
          {league.weekId} · {league.finishedDay}. gün · {state.commandLog?.length ?? 0} hamle. Kod, skoru herkesin kendi
          tarayıcısında yeniden oynatarak doğrulamasını sağlıyor.
        </p>
        {sent && <p>{sent}</p>}
        {code && <textarea className="manual-text" readOnly value={code} onFocus={(e) => e.target.select()} aria-label="Koşu kodu" />}
        <div className="gameover-actions">
          {!lost && (
            <button type="button" className="primary" onClick={() => void submit()} disabled={sent !== null}>
              {board.kind === 'shared' ? 'Tabloya gönder' : 'Tabloya yaz'}
            </button>
          )}
          <button type="button" className="ghost-invert" onClick={() => void copy()}>
            Kodu kopyala
          </button>
          <button
            type="button"
            className="ghost-invert"
            onClick={() => {
              run({ type: 'DISMISS_LEAGUE' });
              setView({ openPanel: 'league' });
            }}
          >
            Tabloyu aç
          </button>
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            Yeni koşu
          </button>
        </div>
      </div>
    </div>
  );
}
