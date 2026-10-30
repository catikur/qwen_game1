import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BUBBLE_BY_ID, BUBBLE_TIMING, formatPercent } from '@capital/content';
import type { BubbleKind } from '@capital/content';
import { bubbleText, bubblesEnabled, formatMoney } from '@capital/core';
import type { BubbleState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';
import './i18n/playTr';

/**
 * Fırsat balonu (Tur 37c).
 *
 * Şehrin üstünde, bağlandığı binanın çatısında beliren dokun-yakala
 * fırsatı. Konumu her karede sahneden okunuyor (`projectTile`); React
 * yeniden çizilmiyor, yalnızca düğmenin `transform`'u değişiyor. Bina
 * ekran dışındaysa balon kenara yapışıyor — fırsat görünmeden kaçmasın.
 *
 * Ödül balonun üstünde RAKAMLA yazılı (kartla aynı ilke): tutar çıktığı
 * gün sabitleniyor, gösterilen ödenen.
 */

/** Kenar payları: ekran kenarından ve HUD'dan (üst çubuk, gündem, telefonda alttaki rıhtım). */
const EDGE_X = 8;
const EDGE_GAP = 14;
const EDGE_BOTTOM = 110;

/**
 * Çapanın dikeyde gidebileceği aralık. Balon çapanın ÜSTÜNDE duruyor:
 * üst sınır HUD'un altı + balonun boyu; alt sınır telefonda rıhtımın üstü
 * ("Dokun" ipucu çapanın altında, ona da yer kalsın).
 */
function verticalRange(height: number): [number, number] {
  let top = 0;
  for (const selector of ['.topbar', '.active-events']) {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (rect && rect.bottom < window.innerHeight / 2) top = Math.max(top, rect.bottom);
  }
  const dock = document.querySelector('.topbar-actions')?.getBoundingClientRect();
  const bottom = dock && dock.top > window.innerHeight / 2 ? dock.top - 36 : window.innerHeight - EDGE_BOTTOM;
  return [top + height + EDGE_GAP, Math.max(top + height + EDGE_GAP, bottom)];
}

/**
 * Çapanın yatayda gidebileceği aralık: ekran kenarı ve balonun boyunda
 * yan paneller (solda lens ve yatırım listesi, sağda bina penceresi).
 * Bina bir panelin arkasında kalırsa balon panelin üstüne binmiyor,
 * kenarına yapışıyor. Telefonda paneller ekranı kaplıyor (geniş): onlar
 * yan panel sayılmıyor.
 */
function horizontalRange(half: number, top: number, bottom: number): [number, number] {
  let left = 0;
  let right = window.innerWidth;
  for (const selector of ['.lensbar', '.buildpanel', '.inspector']) {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.width > window.innerWidth * 0.45) continue;
    if (rect.bottom < top || rect.top > bottom) continue;
    if (rect.left + rect.width / 2 < window.innerWidth / 2) left = Math.max(left, rect.right);
    else right = Math.min(right, rect.left);
  }
  const min = left + half;
  const max = right - half;
  return min <= max ? [min, max] : [half, window.innerWidth - half];
}

interface Burst {
  id: number;
  x: number;
  y: number;
  text: string;
}

function Glyph({ kind }: { kind: BubbleKind }): ReactElement {
  const common = {
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  switch (kind) {
    case 'order':
      return (
        <svg {...common}>
          <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
          <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
      );
    case 'vip':
      return (
        <svg {...common}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      );
    case 'rush':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" />
          <circle cx="16.5" cy="9" r="2.5" />
          <path d="M2.5 20c.6-3.4 2.8-5.5 5.5-5.5s4.9 2.1 5.5 5.5M14 15.2c.8-.5 1.6-.7 2.5-.7 2.3 0 4.2 1.8 4.7 4.8" />
        </svg>
      );
    case 'investor':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 12h18" />
        </svg>
      );
    case 'parcel':
      return (
        <svg {...common}>
          <path d="M12 21s-6-5.3-6-10a6 6 0 0112 0c0 4.7-6 10-6 10z" />
          <circle cx="12" cy="11" r="2.2" />
        </svg>
      );
  }
}

/** Balonun üstündeki ödül: "+82 B ₺", "+%25 · 7 gün", "−%40 · 120 B ₺". */
export function bubbleReward(bubble: BubbleState): string {
  const reward = BUBBLE_BY_ID[bubble.kind].reward;
  if (reward.kind === 'cash') return `+${formatMoney(bubble.amount)}`;
  if (reward.kind === 'boost') {
    return t('hud.bubble.boost', { percent: formatPercent(Math.round((reward.multiplier - 1) * 100)), days: reward.days });
  }
  return t('hud.bubble.parcel', { percent: formatPercent(Math.round(reward.discount * 100)), price: formatMoney(bubble.amount) });
}

export function OpportunityBubble(): ReactElement | null {
  const state = useGameState();
  const { run, toast, view, projectTile } = useGame();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const bubble = state.bubble && bubblesEnabled(state) && !state.gameOver ? state.bubble : null;
  // Bir pencere açıkken balon pencerenin üstüne binmesin; kapanınca geri geliyor.
  const shown = bubble !== null && view.openPanel === 'none';
  const tileId = shown ? bubble.tileId : undefined;

  useEffect(() => {
    if (tileId === undefined || !projectTile) return;
    let frame = 0;
    const place = (): void => {
      const el = anchorRef.current;
      const at = projectTile(tileId);
      if (el && at) {
        // Balon çapanın üstünde ortalı: kenara yapışırken yarısı ekrandan taşmasın.
        const button = el.firstElementChild as HTMLElement | null;
        const half = (button?.offsetWidth ?? 160) / 2 + EDGE_X;
        const height = (button?.offsetHeight ?? 48) + 12;
        const [minY, maxY] = verticalRange(height);
        const y = Math.min(maxY, Math.max(minY, at.y));
        const [minX, maxX] = horizontalRange(half, y - height, y + 36);
        const x = Math.min(maxX, Math.max(minX, at.x));
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        el.dataset.edge = at.visible && x === at.x && y === at.y ? 'no' : 'yes';
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [tileId, projectTile]);

  useEffect(() => {
    if (bursts.length === 0) return;
    const timer = window.setTimeout(() => setBursts((list) => list.slice(1)), 1300);
    return () => window.clearTimeout(timer);
  }, [bursts]);

  /*
   * Patlama katmanı ayrı ve anahtarlı: balon kalkınca React çapanın
   * <div>'ini bu katman için yeniden kullanıyordu; çapanın elle verilen
   * `transform`'u katmanda kalıyor, patlama ekranın öbür ucuna kayıyordu.
   */
  const layer =
    bursts.length > 0 ? (
      <div key="bursts" className="bubble-bursts" aria-hidden="true">
        {bursts.map((burst) => (
          <span key={burst.id} className="bubble-burst" style={{ left: burst.x, top: burst.y }}>
            {burst.text}
          </span>
        ))}
      </div>
    ) : null;

  if (!shown || !bubble) return <>{layer}</>;

  const def = BUBBLE_BY_ID[bubble.kind];
  const left = Math.max(0, bubble.untilDay - state.time.day + 1);
  const fraction = Math.min(1, left / BUBBLE_TIMING.lifetimeDays);
  const hint = (state.bubblesShown ?? 0) <= BUBBLE_TIMING.hintCount;
  const reward = bubbleReward(bubble);

  const claim = (): void => {
    const rect = anchorRef.current?.getBoundingClientRect();
    const text = bubbleText(bubble);
    if (!run({ type: 'CLAIM_BUBBLE' })) return;
    toast(text, 'good');
    if (rect) setBursts((list) => [...list, { id: Date.now(), x: rect.left, y: rect.top - 56, text: reward }]);
  };

  return (
    <>
      <div key="anchor" ref={anchorRef} className="bubble-anchor" data-bubble={bubble.kind}>
        <button
          type="button"
          className={`opportunity-bubble bubble-${def.reward.kind}`}
          onClick={claim}
          title={`${def.title} · ${t('hud.bubble.daysLeft', { days: left })}`}
          aria-label={`${def.title}: ${reward}. ${t('hud.bubble.daysLeft', { days: left })}`}
        >
          <span className="bubble-icon" style={{ ['--left' as string]: `${Math.round(fraction * 360)}deg` }}>
            <Glyph kind={bubble.kind} />
          </span>
          <span className="bubble-text">
            <span className="bubble-title">{def.title}</span>
            <span className="bubble-reward">{reward}</span>
          </span>
        </button>
        {hint && <span className="bubble-hint">{t('hud.bubble.hint')}</span>}
      </div>
      {layer}
    </>
  );
}
