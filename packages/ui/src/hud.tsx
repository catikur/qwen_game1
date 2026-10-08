import { useState } from 'react';
import type { ReactElement } from 'react';
import { CEO_BY_ID, ERA_BY_ID, EVENTS, NPC_PROFILES } from '@capital/content';
import {
  LENSES,
  OFFER_LIFETIME_DAYS,
  agenda,
  companyRanking,
  contractProgress,
  formatDate,
  formatMoney,
  getPlayer,
} from '@capital/core';
import type { GameSpeed } from '@capital/core';
import { CeoPortrait } from './CeoPortrait';
import { AuctionChip } from './AuctionPanel';
import { ghostValueAt, useGhost } from './LeaguePanel';
import { useCollapsible } from './collapse';
import { useGame, useGameState } from './useGame';
import type { ViewState } from './useGame';

/** Üst bar: oyuncunun her an görmesi gereken beş sayı ve zaman kontrolü. */
export function TopBar(): ReactElement {
  const { run, view, setView, audio } = useGame();
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
        {/*
         * CEO adı ve tarih AYRI kaplarda duruyor, tek bir metin değil.
         *
         * Dar ekranda ikisinin değeri aynı değil: tarihe her gün bakılır
         * (kredi vadesi, sözleşme günü), CEO'nun adı ise oyun başında bir
         * kez seçilip bir daha değişmez. Tek bir dizge olsalardı CSS
         * birini tutup diğerini atamaz, ya ikisi de kalır ya ikisi de
         * giderdi.
         */}
        <div className="brand-text">
          <div className="brand-name">{player.name}</div>
          <div className="brand-sub">
            {ceo && <span className="brand-ceo-name">{ceo.name} · </span>}
            <span className="brand-date">{formatDate(state.time.day)}</span>
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
        {/*
          Ses düğmesi hız grubunda: ikisi de "oyunun akışını" yönetiyor ve
          dar ekranda üst barda kalan tek grup bu.
        */}
        <button
          type="button"
          className={audio.muted ? 'speed sound-toggle muted' : 'speed sound-toggle'}
          onClick={audio.toggle}
          aria-pressed={!audio.muted}
          aria-label={audio.muted ? 'Sesi aç' : 'Sesi kapat'}
          title={audio.muted ? 'Sesi aç' : 'Sesi kapat'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M4 10v4h3l5 4V6L7 10z" />
            {audio.muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />}
          </svg>
        </button>
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
const PANEL_TABS: Array<{
  id: 'chain' | 'rivalry' | 'bourse' | 'council' | 'company' | 'rivals' | 'saves' | 'help';
  label: string;
  title: string;
}> = [
  { id: 'chain', label: 'Zincir', title: 'Tedarik zinciri' },
  { id: 'rivalry', label: 'Rekabet', title: 'Rekabet kartı' },
  { id: 'bourse', label: 'Borsa', title: 'Borsa' },
  { id: 'council', label: 'Meclis', title: 'Belediye meclisi' },
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
    council: (
      <>
        <path d="M3 9.5L12 4l9 5.5" />
        <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
        <path d="M3 20h18" />
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

/**
 * Bir haberin taşıdığı yüz.
 *
 * Portre rakibin kendi profilinden geliyor (`NPC_PROFILES`), oyuncunun
 * CEO kataloğundan değil: rakiplere `ceoId` vermek onlara CEO
 * perk'lerini de vermek olurdu. Yüz var, görünmez avantaj yok.
 */
function RivalFace({ companyId }: { companyId: string }): ReactElement | null {
  const state = useGameState();
  const company = state.companies[companyId];
  const profile = company?.profileId
    ? NPC_PROFILES.find((p) => p.id === company.profileId)
    : undefined;
  if (!profile) return null;
  return (
    <span className="news-portrait" title={`${profile.ceoName} · ${profile.name}`}>
      <CeoPortrait portrait={profile.portrait} size={34} />
    </span>
  );
}


/**
 * Oyun sonu ekranı — düşmanca devralma imparatorluğu aldığında.
 *
 * Motor `gameOver` doluyken günü ilerletmeyi bırakıyor; bu ekran da
 * sahnenin üstüne iniyor. Kapatılamaz ve bu bilinçli: kaybetmek bir
 * bildirim değil bir SON. Oyuncunun iki çıkışı var — son duruma bakmak
 * (arka plandaki şehir ve paneller hâlâ okunuyor, ekran haritayı
 * örtmüyor) ya da yeni imparatorluk kurmak.
 *
 * Devralanın yüzü burada büyük: kaybettiğin kişinin kim olduğunu görmek,
 * "tekrar dene" düğmesine basmanın sebebi.
 */
export function GameOverScreen({ onNewGame }: { onNewGame: () => void }): ReactElement | null {
  const state = useGameState();
  const over = state.gameOver;
  if (!over) return null;

  const raider = state.companies[over.byCompanyId];
  const profile = raider?.profileId
    ? NPC_PROFILES.find((p) => p.id === raider.profileId)
    : undefined;
  const player = getPlayer(state);

  return (
    <div className="gameover" role="alertdialog" aria-label="Oyun sonu">
      <div className="gameover-card">
        {profile && (
          <span className="gameover-face">
            <CeoPortrait portrait={profile.portrait} size={72} />
          </span>
        )}
        <h2>İmparatorluk el değiştirdi</h2>
        <p>
          {over.day}. gün: {raider?.name ?? 'Bir rakip'}
          {profile ? ` — başında ${profile.ceoName} —` : ''} {player.name}
          {"'"}in hisselerinin yarısından fazlasını topladı.
        </p>
        <p className="muted">
          Şehir olduğu yerde duruyor; panellerden son durumuna bakabilirsin.
          Takvim bir daha ilerlemeyecek.
        </p>
        <button type="button" className="primary" onClick={onNewGame}>
          Yeni imparatorluk kur
        </button>
      </div>
    </div>
  );
}

export function NewsFeed(): ReactElement {
  const state = useGameState();
  const { focusOn } = useGame();
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
              {/*
                Yeri olan haber bir kapı: "Liman imara açıldı" okunup
                geçilmesin, bir dokunuşla oraya gidilsin. Yalnızca yeri
                bilinen haberlerde var — boş bir "Git" yalan söylerdi.
              */}
              {(item.tileId !== undefined || item.districtId !== undefined) && (
                <button
                  type="button"
                  className="news-goto"
                  onClick={() =>
                    focusOn(item.tileId !== undefined ? { tileId: item.tileId } : { districtId: item.districtId! })
                  }
                  title="Olay yerine git"
                >
                  Git
                </button>
              )}
            </div>
            {/*
             * Yüzü olan haberler farklı dizilir: portre solda, metin
             * sağda. Bu ayrım süs değil — bir RAKİBİN hamlesiyle piyasa
             * olayı arasındaki farkı, okumadan önce görünür kılıyor.
             */}
            <div className={item.companyId ? 'news-face' : undefined}>
              {item.companyId && <RivalFace companyId={item.companyId} />}
              <div>
                <div className="news-title">{item.title}</div>
                <p className="news-body">{item.body}</p>
              </div>
            </div>
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

/**
 * Sözleşme çipi — teklif ve aktif hâl aynı yerde.
 *
 * Teklif MASADA görünür durur (yalnızca haberde kalsaydı akışta kaybolur,
 * "teklif geldi mi" sorusunun cevabı bir kaydırma olurdu) ve kabul/geç
 * düğmeleri çipin üstünde: karar iki dokunuş, panel açmak yok.
 *
 * Aktif sözleşme ilerlemeyi motorla AYNI seçiciden okur
 * (`contractProgress`) — çip %100 derken motorun "bitmedi" demesi diye
 * bir durum olamaz.
 */
function ContractChip(): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();

  const offer = state.contractOffer;
  if (offer) {
    const left = Math.max(0, offer.offeredDay + OFFER_LIFETIME_DAYS - state.time.day);
    return (
      <span className="event-chip contract-chip" title={`Ödül ${formatMoney(offer.reward)} · cayma ${formatMoney(offer.penalty)} · süre ${offer.durationDays} gün`}>
        <span className="contract-label">Teklif</span>
        {offer.title}
        <span className="contract-days">{left}g</span>
        <button type="button" onClick={() => run({ type: 'ACCEPT_CONTRACT' })}>Kabul</button>
        <button type="button" onClick={() => run({ type: 'DECLINE_CONTRACT' })}>Geç</button>
      </span>
    );
  }

  const contract = state.contract;
  if (!contract) return null;
  const progress = contractProgress(state, contract);
  const left = Math.max(0, contract.deadlineDay - state.time.day);
  return (
    <span
      className="event-chip contract-chip active"
      title={`Ödül ${formatMoney(contract.reward)} · cayma ${formatMoney(contract.penalty)}`}
    >
      <span className="contract-label">Sözleşme</span>
      {contract.title}
      <span className="contract-days">%{Math.round(progress * 100)} · {left}g</span>
    </span>
  );
}

/**
 * Gündem şeridi.
 *
 * Çekirdeğin `agenda()` listesini aciliyet sırasıyla çiziyor. İhale ve
 * sözleşme kendi etkileşimli çiplerini taşıyor (teklif ver, kabul et);
 * diğerleri tıklanınca ilgili paneli açıyor ya da kamerayı olay yerine
 * götürüyor.
 *
 * Dar ekranda ilk üç kalem görünür, kalanı "+N" ile açılır. Şerit iki
 * satıra taşsaydı haritanın payını yiyordu; yatay kaydırma da yok —
 * gizli kaydırma keşfedilmeyen bir arayüz (rıhtımın dersi).
 */
const AGENDA_VISIBLE_NARROW = 3;

export function ActiveEvents(): ReactElement | null {
  const state = useGameState();
  const { view, setView, focusOn } = useGame();
  const [expanded, setExpanded] = useState(false);
  const ghost = useGhost(state);
  const items = agenda(state);
  if (items.length === 0) return null;

  const extra = Math.max(0, items.length - AGENDA_VISIBLE_NARROW);
  const togglePanel = (panel: ViewState['openPanel']) =>
    setView({ openPanel: view.openPanel === panel ? 'none' : panel });

  let contractDrawn = false;
  const chips = items.map((item, index) => {
    const className = index >= AGENDA_VISIBLE_NARROW && !expanded ? 'agenda-extra' : undefined;
    const days = item.daysLeft !== null ? <span className="agenda-days">{item.daysLeft}g</span> : null;
    let chip: ReactElement | null = null;

    switch (item.kind) {
      case 'auction':
        chip = <AuctionChip />;
        break;
      case 'contract':
      case 'contractOffer':
        if (contractDrawn) return null;
        contractDrawn = true;
        chip = <ContractChip />;
        break;
      case 'era':
        chip = (
          <span className={`event-chip era-chip tone-${item.tone}`} title={ERA_BY_ID[state.era?.defId ?? '']?.body}>
            {item.label}
          </span>
        );
        break;
      case 'event':
        chip = (
          <span
            className={`event-chip tone-${item.tone}`}
            title={EVENTS.find((e) => `event:${e.id}` === item.key)?.body}
          >
            {item.label} · {item.daysLeft} gün
          </span>
        );
        break;
      case 'raid':
        chip = (
          <button
            type="button"
            className={`event-chip raid-chip urgency-${item.urgency}`}
            onClick={() => togglePanel('bourse')}
            title="Hisse baskını — borsadan geri alım yapabilirsin"
          >
            <span className="agenda-label">Baskın</span>
            {item.label}
          </button>
        );
        break;
      case 'order':
        chip = (
          <button
            type="button"
            className={`event-chip order-chip urgency-${item.urgency} tone-${item.tone}`}
            onClick={() => togglePanel('bourse')}
            title="Devralma emri — borsada ilerleme ve iptal"
          >
            <span className="agenda-label">Devralma</span>
            {item.label}
            {item.progress !== undefined && (
              <span className="goal-chip-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </span>
            )}
            {days}
          </button>
        );
        break;
      case 'union':
      case 'bank':
        chip = (
          <button
            type="button"
            className={`event-chip ${item.kind}-chip urgency-${item.urgency} tone-${item.tone}`}
            onClick={() => togglePanel('company')}
            title={item.kind === 'union' ? 'İşgücü — şirket panelinde cevap ver' : 'Banka — şirket panelinde'}
          >
            <span className="agenda-label">{item.kind === 'union' ? 'Sendika' : 'Banka'}</span>
            {item.label}
            {item.progress !== undefined && (
              <span className="goal-chip-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </span>
            )}
            {days}
          </button>
        );
        break;
      case 'unlock':
        chip = (
          <button
            type="button"
            className="event-chip unlock-chip"
            onClick={() => item.districtId !== undefined && focusOn({ districtId: item.districtId })}
            title="Bölgeye git"
          >
            {item.label}
            {days}
          </button>
        );
        break;
      case 'council':
        chip = (
          <button
            type="button"
            className="event-chip council-chip"
            onClick={() => togglePanel('council')}
            title="Belediye meclisi — önergeler ve lobi"
          >
            {item.label}
            {days}
          </button>
        );
        break;
      case 'league': {
        // Hayalet: tablodaki en iyi koşu bu gün neredeydi? Fark yeşil/kırmızı.
        const ghostNow = ghost ? ghostValueAt(ghost, state.time.day) : null;
        const gap = ghostNow !== null ? getPlayer(state).netWorth - ghostNow : null;
        chip = (
          <button
            type="button"
            className="event-chip league-chip"
            onClick={() => togglePanel('league')}
            title="Tohum Ligi — tablo ve hayalet"
          >
            <span className="agenda-label">Lig</span>
            {days}
            {gap !== null && (
              <span className={gap >= 0 ? 'pos' : 'neg'}>
                {gap >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(gap))} hayalete
              </span>
            )}
          </button>
        );
        break;
      }
      case 'goal':
        chip = (
          <button
            type="button"
            className="event-chip goal-chip"
            onClick={() => togglePanel('goals')}
            title="Hedef merdiveni"
          >
            <span className="agenda-label">Hedef</span>
            {item.label}
            <span className="goal-chip-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }} />
            </span>
            <span className="agenda-days">%{Math.round((item.progress ?? 0) * 100)}</span>
          </button>
        );
        break;
    }
    if (!chip) return null;
    return (
      <span key={item.key} className={className} data-agenda={item.kind}>
        {chip}
      </span>
    );
  });

  return (
    <div className="active-events agenda" aria-label="Gündem">
      {chips}
      {extra > 0 && (
        <button
          type="button"
          className="event-chip agenda-more"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          {expanded ? 'Daralt' : `+${extra}`}
        </button>
      )}
    </div>
  );
}
