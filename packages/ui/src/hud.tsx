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
import { useCollapsible } from './collapse';
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

      {/*
       * Metrikler dar ekranda İKON + DEĞER, geniş ekranda etiket + değer.
       *
       * Ölçüm: üst bar 177 px, yani 664 px'lik ekranın %27'si — kalan en
       * büyük sabit blok oydu. Yerin çoğunu değerler değil ETİKETLER
       * yiyordu: "ŞİRKET DEĞERİ" 13 karakter, gösterdiği sayı 8.
       *
       * Etiket silinmiyor, ikona dönüşüyor: `title` ve `aria-label` tam
       * adı taşımaya devam ediyor, yani ekran okuyucu ve uzun basma
       * ipucu bir şey kaybetmiyor.
       */}
      <div className="metrics">
        <Metric icon="cash" label="Nakit" value={formatMoney(player.cash)} tone="accent" />
        <Metric
          icon="profit"
          label="Günlük kâr"
          value={formatMoney(profit)}
          tone={profit >= 0 ? 'good' : 'bad'}
        />
        <Metric icon="worth" label="Şirket değeri" value={formatMoney(player.netWorth)} />
        {player.debt > 0 && (
          <Metric icon="debt" label="Borç" value={formatMoney(player.debt)} tone="bad" />
        )}
        <Metric icon="rank" label="Sıralama" value={`${rank}.`} tone={rank === 1 ? 'good' : 'plain'} />
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
  icon,
  label,
  value,
  tone = 'plain',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'plain' | 'accent' | 'good' | 'bad';
}): ReactElement {
  return (
    <div className={`metric metric-${tone}`} title={label}>
      <MetricIcon name={icon} />
      <span className="metric-label">{label}</span>
      <span className="metric-value" aria-label={`${label}: ${value}`}>
        {value}
      </span>
    </div>
  );
}

/** Metrik ikonları — dar ekranda etiketin yerini alırlar. */
function MetricIcon({ name }: { name: string }): ReactElement {
  const paths: Record<string, ReactElement> = {
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6 12v0M18 12v0" />
      </>
    ),
    profit: (
      <>
        <path d="M3 17l6-6 4 3 8-8" />
        <path d="M16 6h5v5" />
      </>
    ),
    worth: (
      <>
        <path d="M4 20V7l8-3v16" />
        <path d="M12 11h8v9" />
        <path d="M3 20h18" />
      </>
    ),
    debt: (
      <>
        <path d="M12 3.8 21 19.5H3L12 3.8Z" />
        <path d="M12 10v4" />
        <path d="M12 17v0" />
      </>
    ),
    rank: (
      <>
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4.5V8a3 3 0 0 0 3 3M17 6h2.5V8a3 3 0 0 1-3 3" />
        <path d="M9.5 20h5M12 14v6" />
      </>
    ),
  };
  return (
    <svg
      className="metric-icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
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
  const { open, toggle, setOpen } = useCollapsible();

  return (
    <div className={open ? 'lensbar' : 'lensbar closed'}>
      {/*
       * Katlama başlığı yalnızca dar ekranda görünüyor (CSS).
       *
       * Kapalıyken bile AKTİF LENSİ yazıyor: bir kontrolü katlamak onun
       * ne durumda olduğunu gizlemeyi gerektirmiyor. Harita renkleri
       * lense göre değiştiği için "hangi lens açık" sorusunun cevabı her
       * an görünür kalmalı — yoksa oyuncu renkleri yanlış okur.
       */}
      <button
        type="button"
        className="collapse-head"
        onClick={toggle}
        aria-expanded={open}
        data-collapse="lens"
      >
        <LensIcon name={active?.id ?? 'none'} />
        <span className="collapse-title">Harita: {active?.name ?? 'Şehir'}</span>
        <span className="collapse-chevron" aria-hidden="true" />
      </button>

      <div className="lens-body">
        <div className="lens-buttons">
          {LENSES.map((lens) => (
            <button
              key={lens.id}
              type="button"
              className={view.lens === lens.id ? 'lens active' : 'lens'}
              onClick={() => {
                setView({ lens: lens.id });
                // Seçim yapıldı — katman kendini kapatsın ki harita
                // hemen görünsün. Dar ekranda seçtikten sonra elle
                // kapatmak zorunda bırakmak fazladan bir dokunuş.
                if (window.matchMedia?.('(max-width: 860px)').matches) setOpen(false);
              }}
              aria-pressed={view.lens === lens.id}
              title={lens.hint}
            >
              <LensIcon name={lens.id} />
              <span className="lens-name">{lens.name}</span>
            </button>
          ))}
        </div>
        {active && <p className="lens-hint">{active.hint}</p>}
      </div>
    </div>
  );
}

/** Lens ikonları — `currentColor` ile çizilir, iki temada da çalışır. */
function LensIcon({ name }: { name: string }): ReactElement {
  const paths: Record<string, ReactElement> = {
    none: (
      <>
        <path d="M4 20V9l6-4v15" />
        <path d="M10 12h9v8" />
        <path d="M3 20h18" />
      </>
    ),
    opportunity: (
      <>
        <path d="M12 3.5c2.6 3 4 5.2 4 7.3a4 4 0 0 1-8 0c0-2.1 1.4-4.3 4-7.3Z" />
        <path d="M9.5 20.5h5" />
      </>
    ),
    landValue: (
      <>
        <path d="M20 12.5 12.5 20a1.6 1.6 0 0 1-2.3 0l-6.2-6.2a1.6 1.6 0 0 1 0-2.3L11.5 4H19a1 1 0 0 1 1 1v7.5Z" />
        <path d="M16 8v0" />
      </>
    ),
    competition: (
      <>
        <path d="M8 21V10" />
        <path d="M16 21V4" />
        <path d="M4 21h16" />
        <path d="M8 10 4.5 6.5M16 4l3.5 3.5" />
      </>
    ),
    income: (
      <>
        <ellipse cx="12" cy="7" rx="7" ry="3" />
        <path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
        <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      </>
    ),
    ownership: (
      <>
        <circle cx="8.5" cy="9.5" r="3.5" />
        <path d="M11 12l7 7" />
        <path d="M16 17l2-2" />
      </>
    ),
  };
  return (
    <svg
      className="lens-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] ?? paths.none}
    </svg>
  );
}

/** Haber akışının katlama ikonu — megafon. */
function NewsIcon(): ReactElement {
  return (
    <svg
      className="collapse-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1Z" />
      <path d="M18 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
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
  const { open, toggle } = useCollapsible();
  const latest = state.news[0];

  return (
    <section className={open ? 'news' : 'news closed'} aria-label="Haber akışı">
      {/*
       * Haber akışı da dar ekranda katlanıyor. Lens ve yapı menüsü
       * katlandıktan sonra boşalan yeri BU yutuyordu: 102 px'den 153 px'e
       * büyüyüp haritaya kalan payı %38'de bırakmıştı.
       *
       * Kapalıyken en son haberin başlığı görünüyor — akış bir bildirim
       * kanalı, tamamen susturmak yeni bir olayı kaçırmak demek olurdu.
       */}
      <button
        type="button"
        className="collapse-head"
        onClick={toggle}
        aria-expanded={open}
        data-collapse="news"
      >
        <NewsIcon />
        <span className="collapse-title">
          {latest ? latest.title : 'Şehir Haberleri'}
          {latest && <span className="collapse-badge">{latest.day}. gün</span>}
        </span>
        <span className="collapse-chevron" aria-hidden="true" />
      </button>

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
