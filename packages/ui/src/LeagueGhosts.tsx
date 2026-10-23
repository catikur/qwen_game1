import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactElement } from 'react';
import { BUILDING_BY_ID } from '@capital/content';
import { LEAGUE_SAMPLE_DAYS, decodeRun, formatMoney, ghostMoves, ghostTally } from '@capital/core';
import type { GhostMove, GhostMoveKind, LoggedCommand } from '@capital/core';
import { codeOf, keyOf } from './leagueVerify';
import type { LeagueEntry } from './useGame';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/**
 * Hayalet eğri (Tur 54): liderlerin değer eğrisi oyuncunun koşusunun
 * üstünde ve liderin o günlerde ne yaptığı.
 *
 * Eğriler satırın doğrulanmış hâlinden (sunucu ya da bu tarayıcı yeniden
 * oynadı); hamleler koşu kodunun günlüğünden, yeniden oynatmadan
 * (`ghostMoves`). Kod lig sunucusunda ayrı iniyor: yalnızca kartta
 * gösterilen hayaletinki, bir kez.
 */

/** Grafikteki çizgi. `slot` rengi ve biçimi belirliyor: hayalet kesik çizgi, sen düz ve kalın. */
export interface CurveSeries {
  id: string;
  name: string;
  curve: number[];
  slot: 'you' | 'ghost' | 'b' | 'c';
}

/**
 * Çizimin genişliği kabın gerçek genişliği: yazılar her pencerede aynı
 * boyda kalsın (geniş pencerede ölçeklenen bir viewBox yazıyı iki katına
 * çıkarıyordu).
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => {
      const next = Math.round(item?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Grafikte bir gün: örnek dizinine yuvarlanmış (eğri 10 günde bir). */
export function sampleOf(day: number): number {
  return Math.max(0, Math.floor(day / LEAGUE_SAMPLE_DAYS));
}

export function GhostChart({
  series: given,
  endDay,
  today,
  focus,
  onFocus,
}: {
  series: CurveSeries[];
  endDay: number;
  today: number;
  /** Sabitlenmiş örnek (kart o günü anlatıyor); yoksa bugün. */
  focus: number | null;
  onFocus: (sample: number | null) => void;
}): ReactElement {
  // Eğri koşunun uzunluğunda kesiliyor: doğrulanmamış satırın eğrisi beyandır,
  // binlerce örnek binlerce satır çizdirmesin (Codex #83).
  const samples = Math.floor(endDay / LEAGUE_SAMPLE_DAYS) + 1;
  const series = given.map((s) => (s.curve.length > samples ? { ...s, curve: s.curve.slice(0, samples) } : s));
  const svgRef = useRef<SVGSVGElement>(null);
  const box = useWidth(320);
  const W = Math.max(240, box.width);
  const H = Math.round(Math.min(220, Math.max(140, W * 0.32)));
  const X0 = 6;
  const X1 = W - 6;
  const Y_TOP = 16;
  const Y_BASE = H - 20;
  const [hover, setHover] = useState<number | null>(null);
  const slots = Math.max(1, endDay / LEAGUE_SAMPLE_DAYS);
  const last = Math.max(0, ...series.map((s) => s.curve.length - 1));
  const values = series.flatMap((s) => s.curve);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const x = (sample: number) => X0 + (sample / slots) * (X1 - X0);
  const y = (value: number) => Y_BASE - ((value - min) / (max - min)) * (Y_BASE - Y_TOP);
  const points = (curve: number[]) => curve.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const todaySample = Math.min(sampleOf(today), slots);
  const shown = hover ?? focus;

  const sampleAt = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const px = ((clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(last, Math.round(((px - X0) / (X1 - X0)) * slots)));
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => setHover(sampleAt(event.clientX));
  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    const sample = sampleAt(event.clientX);
    // Bugünün örneği de sabitlenebiliyor: o örneğin bugünden önceki günleri de görünsün.
    onFocus(sample);
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const from = focus ?? todaySample;
    let next: number | null | undefined;
    if (event.key === 'ArrowLeft') next = Math.max(0, from - 1);
    else if (event.key === 'ArrowRight') next = Math.min(last, from + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    // Gün seçiliyken Escape yalnızca bugüne dönüyor; seçim yoksa pencereyi kapatıyor (GameRoot).
    else if (event.key === 'Escape' && focus !== null) next = null;
    if (next === undefined) return;
    event.preventDefault();
    // Oyunun kısayolları (kamera, pencere) grafiğin tuşunu almasın.
    event.stopPropagation();
    onFocus(next);
  };

  // Üstte çizilen son: sen. Hayalet senden önce, öbür liderler en altta.
  const order: CurveSeries['slot'][] = ['c', 'b', 'ghost', 'you'];
  const drawn = [...series].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  const rows =
    shown === null
      ? []
      : series
          .map((s) => ({ s, value: s.curve[shown] }))
          .filter((row): row is { s: CurveSeries; value: number } => row.value !== undefined)
          .sort((a, b) => b.value - a.value);
  const tipLeft = shown === null ? 0 : (x(shown) / W) * 100;
  // Kutu imlecin yanında, üstünde değil: noktalar görünsün.
  const tipSide = tipLeft < 50 ? 'right' : 'left';

  return (
    <div className="league-curves" data-league-curves={series.length} ref={box.ref}>
      <svg
        ref={svgRef}
        className="league-sparks"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={t('app.league.chart.label')}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
        onKeyDown={onKey}
      >
        {[0.5, 1].map((share) => {
          const value = min + (max - min) * share;
          return (
            <g key={share} className="league-grid">
              <line x1={X0} x2={X1} y1={y(value)} y2={y(value)} />
              <text x={X1} y={y(value) + 11} textAnchor="end">
                {formatMoney(value)}
              </text>
            </g>
          );
        })}
        <line x1={X0} x2={X1} y1={y(0)} y2={y(0)} className="league-axis" />
        <g className="league-days">
          <text x={X0} y={H - 4} textAnchor="start">
            {t('app.league.chart.day', { day: 0 })}
          </text>
          <text x={X1} y={H - 4} textAnchor="end">
            {t('app.league.chart.day', { day: endDay })}
          </text>
        </g>
        <g className="league-today" data-league-today={today}>
          <line x1={x(todaySample)} x2={x(todaySample)} y1={Y_TOP - 4} y2={Y_BASE} />
          <text x={x(todaySample)} y={Y_TOP - 6} textAnchor={todaySample > slots * 0.85 ? 'end' : todaySample < slots * 0.15 ? 'start' : 'middle'}>
            {t('app.league.chart.today')}
          </text>
        </g>
        {drawn.map((s) =>
          s.curve.length > 1 ? (
            <polyline key={s.id} points={points(s.curve)} className={`league-line slot-${s.slot}`} data-league-line={s.slot} />
          ) : s.curve.length === 1 ? (
            // Koşunun ilk günü: tek örnek, çizgi yerine nokta.
            <circle key={s.id} cx={x(0)} cy={y(s.curve[0]!)} r={3} className={`league-dot slot-${s.slot}`} data-league-line={s.slot} />
          ) : null,
        )}
        {shown !== null && (
          <g className="league-cross">
            <line x1={x(shown)} x2={x(shown)} y1={Y_TOP} y2={Y_BASE} />
            {rows.map(({ s, value }) => (
              <circle key={s.id} cx={x(shown)} cy={y(value)} r={3.5} className={`league-dot slot-${s.slot}`} />
            ))}
          </g>
        )}
      </svg>
      {shown !== null && rows.length > 0 && (
        <div className={`league-tip side-${tipSide}`} style={{ left: `${tipLeft}%` }} data-league-tip={shown * LEAGUE_SAMPLE_DAYS}>
          <strong>{t('app.league.chart.day', { day: shown * LEAGUE_SAMPLE_DAYS })}</strong>
          {rows.map(({ s, value }) => (
            <span key={s.id}>
              <span className={`league-key slot-${s.slot}`} aria-hidden="true" /> {s.name} <b>{formatMoney(value)}</b>
            </span>
          ))}
        </div>
      )}
      <table className="league-curves-table">
        <caption>{t('app.league.chart.label')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('app.league.chart.dayHead')}</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: last + 1 }, (_, sample) => (
            <tr key={sample}>
              <th scope="row">{sample * LEAGUE_SAMPLE_DAYS}</th>
              {series.map((s) => (
                <td key={s.id}>{s.curve[sample] === undefined ? '' : formatMoney(s.curve[sample]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- hamleler

type LogState = { status: 'loading' } | { status: 'ready'; log: LoggedCommand[] } | { status: 'unavailable' };

/** Çözülmüş günlükler: kod bir kez iniyor ve bir kez çözülüyor (oturum boyunca). */
const logs = new Map<string, Promise<LoggedCommand[] | null>>();

export function loadGhostLog(entry: LeagueEntry): Promise<LoggedCommand[] | null> {
  const key = keyOf(entry);
  let pending = logs.get(key);
  if (!pending) {
    pending = codeOf(entry).then((code) => (code ? (decodeRun(code)?.log ?? null) : null));
    // İnmediyse (bağlantı yok) bir dahaki açılışta yeniden denensin.
    pending.then((log) => {
      if (!log) logs.delete(key);
    });
    logs.set(key, pending);
  }
  return pending;
}

function useGhostLog(entry: LeagueEntry): LogState {
  // Tablo her tazelendiğinde satır nesnesi yenileniyor; kod aynıysa günlük de aynı.
  const key = keyOf(entry);
  const latest = useRef(entry);
  latest.current = entry;
  const [state, setState] = useState<{ key: string; log: LogState }>({
    key: '',
    log: { status: 'loading' },
  });
  useEffect(() => {
    let alive = true;
    void loadGhostLog(latest.current).then((log) => {
      if (alive)
        setState({
          key,
          log: log ? { status: 'ready', log } : { status: 'unavailable' },
        });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state.log : { status: 'loading' };
}

const MOVE_TEXT: Record<GhostMoveKind, MessageKey> = {
  build: 'app.league.move.build',
  demolish: 'app.league.move.demolish',
  land: 'app.league.move.land',
  sellLand: 'app.league.move.sellLand',
  loan: 'app.league.move.loan',
  repay: 'app.league.move.repay',
  issue: 'app.league.move.issue',
  trade: 'app.league.move.trade',
  takeover: 'app.league.move.takeover',
  city: 'app.league.move.city',
  project: 'app.league.move.project',
  bid: 'app.league.move.bid',
  lobby: 'app.league.move.lobby',
  contract: 'app.league.move.contract',
  freight: 'app.league.move.freight',
  price: 'app.league.move.price',
  shelf: 'app.league.move.shelf',
  staff: 'app.league.move.staff',
  card: 'app.league.move.card',
};

export function moveText(move: GhostMove): string {
  const name = move.defId ? (BUILDING_BY_ID[move.defId]?.name ?? move.defId) : '';
  const count = move.count > 1 ? ` ×${move.count}` : '';
  const money = move.amount !== undefined ? ` · ${formatMoney(move.amount)}` : '';
  return `${t(MOVE_TEXT[move.kind], { name })}${count}${money}`;
}

/** Kartın penceresi: haftada 30 gün, günün koşusunda 10. */
export function movesWindow(endDay: number): number {
  return Math.max(LEAGUE_SAMPLE_DAYS, Math.round(endDay / 12));
}

const MOVE_LINES = 6;

export function GhostMoves({
  entry,
  name,
  verified,
  day,
  today,
  endDay,
  myLog,
}: {
  entry: LeagueEntry;
  name: string;
  verified: boolean;
  /** Kartın anlattığı gün (sabitlenmiş ya da bugün). */
  day: number;
  today: number;
  endDay: number;
  myLog: readonly LoggedCommand[];
}): ReactElement {
  const log = useGhostLog(entry);
  // Koşunun sonuna yakın pencere geriye kayıyor: hep tam uzunlukta.
  const from = Math.max(0, Math.min(day, endDay - movesWindow(endDay)));
  const to = from + movesWindow(endDay);
  return (
    <section className="league-moves" data-league-moves={log.status} data-league-moves-day={from} aria-live="polite">
      <h4>{t(day === today ? 'app.league.moves.titleToday' : 'app.league.moves.title', { name, from, to: to - 1 })}</h4>
      {log.status === 'loading' && <p className="muted">{t('app.league.moves.loading')}</p>}
      {log.status === 'unavailable' && <p className="muted">{t('app.league.moves.unavailable')}</p>}
      {log.status === 'ready' && <MovesBody log={log.log} from={from} to={to} name={name} today={today} myLog={myLog} />}
      {!verified && <p className="muted">{t('app.league.moves.unverified')}</p>}
    </section>
  );
}

function MovesBody({
  log,
  from,
  to,
  name,
  today,
  myLog,
}: {
  log: LoggedCommand[];
  from: number;
  to: number;
  name: string;
  today: number;
  myLog: readonly LoggedCommand[];
}): ReactElement {
  const moves = ghostMoves(log, from, to);
  const shown = moves.slice(0, MOVE_LINES);
  const rest = moves.slice(MOVE_LINES).reduce((sum, move) => sum + move.count, 0);
  // Sayım kartın gününe kadar; senin sayın yalnızca o gün geçmişteyse.
  const through = Math.max(0, from - 1);
  const leader = ghostTally(log, through);
  const you = from <= today ? ghostTally(myLog, through) : null;
  return (
    <>
      {moves.length === 0 ? (
        <p className="muted">{t('app.league.moves.none')}</p>
      ) : (
        <ul className="league-move-list">
          {shown.map((move) => (
            <li key={`${move.kind}:${move.defId ?? ''}`} data-league-move={move.kind}>
              <span className="league-move-day">
                {move.lastDay > move.day
                  ? t('app.league.moves.days', {
                      from: move.day,
                      to: move.lastDay,
                    })
                  : t('app.league.moves.day', { day: move.day })}
              </span>
              <span>{moveText(move)}</span>
            </li>
          ))}
          {rest > 0 && <li className="muted">{t('app.league.moves.more', { count: rest })}</li>}
        </ul>
      )}
      {from > 0 && (
        <dl className="league-tally" data-league-tally={from}>
          <dt>{t('app.league.moves.tallyTitle', { day: from })}</dt>
          <dd>
            <span>
              {t('app.league.moves.tally', {
                name,
                built: leader.built,
                land: leader.land,
                loans: leader.loans,
              })}
            </span>
            {you && (
              <span>
                {t('app.league.moves.tally', {
                  name: t('app.league.moves.you'),
                  built: you.built,
                  land: you.land,
                  loans: you.loans,
                })}
              </span>
            )}
          </dd>
        </dl>
      )}
    </>
  );
}
