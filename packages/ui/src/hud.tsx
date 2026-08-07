import type { ReactElement } from 'react';
import { CEO_BY_ID, EVENTS } from '@capital/content';
import {
  LENSES,
  companyRanking,
  formatDate,
  formatMoney,
  getPlayer,
} from '@capital/core';
import type { GameSpeed } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { useGame, useGameState } from './useGame';

/** Üst bar: oyuncunun her an görmesi gereken beş sayı ve zaman kontrolü. */
export function TopBar(): ReactElement {
  const { run, view, setView } = useGame();
  const state = useGameState();
  const player = getPlayer(state);
  const ceo = player.ceoId ? CEO_BY_ID[player.ceoId] : undefined;
  const rank = companyRanking(state).find((row) => row.company.isPlayer)?.rank ?? 1;
  const profit = player.today.profit;

  const speeds: Array<{ value: GameSpeed; label: string }> = [
    { value: 0, label: '❚❚' },
    { value: 1, label: '▶' },
    { value: 2, label: '▶▶' },
    { value: 3, label: '▶▶▶' },
  ];

  return (
    <header className="topbar">
      <div className="brand">
        {ceo ? (
          <span className="brand-ceo" title={`${ceo.name} · ${ceo.title}`}>
            <CeoPortrait portrait={ceo.portrait} size={38} />
          </span>
        ) : (
          <span className="brand-mark" />
        )}
        <div>
          <div className="brand-name">{player.name}</div>
          <div className="brand-sub">
            {ceo ? `${ceo.name} · ` : ''}
            {formatDate(state.time.day)}
          </div>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Nakit" value={formatMoney(player.cash)} tone="accent" />
        <Metric
          label="Günlük kâr"
          value={formatMoney(profit)}
          tone={profit >= 0 ? 'good' : 'bad'}
        />
        <Metric label="Şirket değeri" value={formatMoney(player.netWorth)} />
        {player.debt > 0 && <Metric label="Borç" value={formatMoney(player.debt)} tone="bad" />}
        <Metric label="Sıralama" value={`${rank}.`} tone={rank === 1 ? 'good' : 'plain'} />
      </div>

      <div className="topbar-actions">
        <div className="speeds" role="group" aria-label="Oyun hızı">
          {speeds.map((speed) => (
            <button
              key={speed.value}
              type="button"
              className={state.time.speed === speed.value ? 'speed active' : 'speed'}
              onClick={() => run({ type: 'SET_SPEED', speed: speed.value })}
              aria-pressed={state.time.speed === speed.value}
              title={speed.value === 0 ? 'Duraklat (Boşluk)' : `${speed.value}× hız`}
            >
              {speed.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'chain' ? 'none' : 'chain' })}>
          Zincir
        </button>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'rivalry' ? 'none' : 'rivalry' })}>
          Rekabet
        </button>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'company' ? 'none' : 'company' })}>
          Şirket
        </button>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'rivals' ? 'none' : 'rivals' })}>
          Rakipler
        </button>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'saves' ? 'none' : 'saves' })}>
          Kayıt
        </button>
        <button type="button" onClick={() => setView({ openPanel: view.openPanel === 'help' ? 'none' : 'help' })} title="Nasıl oynanır">
          ?
        </button>
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'accent' | 'good' | 'bad';
}): ReactElement {
  return (
    <div className={`metric metric-${tone}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

/**
 * Veri lensleri.
 *
 * Oyunun "sofistike simülasyon, basit oynanış" sözünü tutan yer burası:
 * oyuncu tablo okumak yerine haritayı renklendirip nereye yatırım yapacağını
 * görüyor.
 */
export function LensBar(): ReactElement {
  const { view, setView } = useGame();
  const active = LENSES.find((lens) => lens.id === view.lens);

  return (
    <div className="lensbar">
      <div className="lens-buttons">
        {LENSES.map((lens) => (
          <button
            key={lens.id}
            type="button"
            className={view.lens === lens.id ? 'lens active' : 'lens'}
            onClick={() => setView({ lens: lens.id })}
            aria-pressed={view.lens === lens.id}
          >
            {lens.name}
          </button>
        ))}
      </div>
      {active && <p className="lens-hint">{active.hint}</p>}
    </div>
  );
}

const TONE_LABEL: Record<string, string> = {
  good: 'Fırsat',
  bad: 'Risk',
  rival: 'Rakip',
  neutral: 'Haber',
};

export function NewsFeed(): ReactElement {
  const state = useGameState();

  return (
    <section className="news" aria-label="Haber akışı">
      <h2>Şehir Haberleri</h2>
      <ul>
        {state.news.slice(0, 8).map((item) => (
          <li key={item.id} className={`news-item news-${item.tone}`}>
            <div className="news-head">
              <span className="news-tag">{TONE_LABEL[item.tone] ?? 'Haber'}</span>
              <span className="news-day">{item.day}. gün</span>
            </div>
            <div className="news-title">{item.title}</div>
            <p className="news-body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Toasts(): ReactElement {
  const { toasts } = useGame();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

/** Aktif ekonomik olaylar — piyasanın neden değiştiğini gösterir. */
export function ActiveEvents(): ReactElement | null {
  const state = useGameState();
  if (state.activeEvents.length === 0) return null;

  return (
    <div className="active-events">
      {state.activeEvents.map((active) => {
        const def = EVENTS.find((event) => event.id === active.defId);
        if (!def) return null;
        return (
          <span key={active.defId} className={`event-chip tone-${def.tone}`} title={def.body}>
            {def.title} · {active.remainingDays} gün
          </span>
        );
      })}
    </div>
  );
}
