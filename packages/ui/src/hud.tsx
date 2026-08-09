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
import { AuctionChip } from './AuctionPanel';
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

      {/*
       * Hız kontrolü ve panel düğmeleri AYRI kaplar.
       *
       * Dar ekranda ikisi farklı yere gidiyor: hız üst barda kalıyor (zamanı
       * durdurmak her an gerekir), panel düğmeleri ise alt rıhtıma iniyor —
       * başparmağın ulaştığı yer orası. Tek kapta olsalardı ikisini ayıramaz,
       * ya da düğmeleri iki kez çizmek zorunda kalırdık; aynı düğmeyi iki
       * yerde çizmek hem erişilebilirlik hem test tarafında karışıklık olurdu.
       */}
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

      <nav className="topbar-actions" aria-label="Paneller">
        {PANEL_TABS.map((tab) => {
          const open = view.openPanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={open ? 'dock-tab active' : 'dock-tab'}
              /*
               * Kimlik etiketten ayrı duruyor. Testler eskiden görünen
               * yazıya göre seçiyordu ("Rakipler"); etiket dar ekrana
               * sığsın diye kısalınca sessizce başka bir düğmeyi tıklamaya
               * başlarlardı. Yazı bir sunum ayrıntısı, `data-panel` ise
               * sözleşme.
               */
              data-panel={tab.id}
              onClick={() => setView({ openPanel: open ? 'none' : tab.id })}
              aria-pressed={open}
              /*
               * `aria-label` BİLEREK yok. Koysaydık erişilebilir ad görünen
               * yazının yerine geçerdi: ekranda "Yardım" yazarken ad "Nasıl
               * oynanır" olurdu ve sesle kontrol eden biri gördüğü kelimeyi
               * söyleyince eşleşme olmazdı (WCAG 2.5.3). Ad görünen
               * etiketten geliyor; `title` yalnızca ek bağlam veriyor.
               */
              title={tab.title}
            >
              <PanelIcon name={tab.id} />
              <span className="dock-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

/**
 * Rıhtımın sekmeleri.
 *
 * Yazı yerine ikon + minik etiket taşıyorlar ve sebebi ölçüm: yalnızca
 * yazıyla yedi düğme 516 px yer istiyordu, dar ekran 390 px. Son iki
 * düğme ("Kayıt", "?") ekranın DIŞINDA kalıyordu ve rıhtımın yatay
 * kaydırılabildiğini gösteren hiçbir işaret yoktu — yani o iki panele
 * ulaşmanın görünür bir yolu yoktu.
 *
 * Etiket tamamen atılmadı: ikon tek başına ne olduğunu söylemiyor.
 * Rıhtım eşit sütunlu bir ızgara olduğu için 320 px'de bile taşmıyor.
 */
const PANEL_TABS: Array<{ id: 'chain' | 'rivalry' | 'bourse' | 'company' | 'rivals' | 'saves' | 'help'; label: string; title: string }> = [
  { id: 'chain', label: 'Zincir', title: 'Tedarik zinciri' },
  { id: 'rivalry', label: 'Rekabet', title: 'Rekabet kartı' },
  { id: 'bourse', label: 'Borsa', title: 'Borsa' },
  { id: 'company', label: 'Şirket', title: 'Şirket' },
  { id: 'rivals', label: 'Rakip', title: 'Rakipler' },
  { id: 'saves', label: 'Kayıt', title: 'Kayıtlar' },
  { id: 'help', label: 'Yardım', title: 'Nasıl oynanır' },
];

/** Rıhtım ikonları — `currentColor` ile çizilir, iki temada da çalışır. */
function PanelIcon({ name }: { name: string }): ReactElement {
  const paths: Record<string, ReactElement> = {
    chain: (
      <>
        <path d="M10.6 13.4a3.8 3.8 0 0 0 5.4 0l2.2-2.2a3.8 3.8 0 0 0-5.4-5.4l-1.1 1.1" />
        <path d="M13.4 10.6a3.8 3.8 0 0 0-5.4 0l-2.2 2.2a3.8 3.8 0 0 0 5.4 5.4l1.1-1.1" />
      </>
    ),
    rivalry: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V5" />
        <path d="M16 20v-7" />
        <path d="M3 20h18" />
      </>
    ),
    bourse: (
      <>
        <path d="M3 16l5-5 4 3 8-8" />
        <path d="M15 6h5v5" />
      </>
    ),
    company: (
      <>
        <path d="M4 20V6l7-3v17" />
        <path d="M11 10h8v10" />
        <path d="M3 20h18" />
        <path d="M7 9v0M7 13v0M15 14v0" />
      </>
    ),
    rivals: (
      <>
        <circle cx="8.5" cy="8" r="2.8" />
        <path d="M3.5 19a5 5 0 0 1 10 0" />
        <path d="M16 6.2a2.8 2.8 0 0 1 0 5.6" />
        <path d="M16.5 14.4A5 5 0 0 1 20.5 19" />
      </>
    ),
    saves: (
      <>
        <path d="M5 4h11l3 3v13H5z" />
        <path d="M8 4v5h7V4" />
        <path d="M8 20v-6h8v6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.6" />
        <path d="M12 17v0" />
      </>
    ),
  };
  return (
    <svg
      className="dock-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
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
  // İhale çipi de buraya düşüyor: ikisi de "şu an olan bir şey" ve
  // ikisi de akışı kesmiyor.
  if (state.activeEvents.length === 0 && !state.auction) return null;

  return (
    <div className="active-events">
      <AuctionChip />
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
