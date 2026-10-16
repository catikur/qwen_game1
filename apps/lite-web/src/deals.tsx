/**
 * Şehir fırsatları (iOS `DealViews.swift` karşılığı): bir binanın üstünde
 * beliren balon; dokununca ödül kasaya, balon patlıyor ve tutar yukarı uçuyor.
 */
import { Briefcase, Crown } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { CHAIN_BY_ID, DEAL_LIFETIME, DISTRICTS, dealReward, type ActiveDeal, type LiteState } from '@capital/lite-model';
import type { CityOverlayArgs } from './city/CityView';
import { CityLayout, IslandLayout } from './city/layout';
import { IsoPainter, type Point, type Size } from './city/painter';
import { money } from './format';
import { useNight, useStore } from './hooks';
import { t } from './l10n';
import type { DealCatch } from './store';
import { chainColors, css, type Rgb } from './theme';
import { CHAIN_ICONS } from './ui';

const BURST = 1.3;

/** Balonun yeri: zincirin satış binasının üstü; zincir başka adadaysa sayfanın sağ üstü; yatırımcı adanın ortasında. */
function anchor(deal: ActiveDeal, island: number, painter: IsoPainter, state: LiteState, size: Size): Point {
  let point: Point;
  if (deal.chain) {
    const home = DISTRICTS.find((d) => d.id === CHAIN_BY_ID[deal.chain!].district)!.island;
    if (home === island) {
      const tile = island === 0 ? CityLayout.tiles(deal.chain)[2]! : IslandLayout.tiles[2]!;
      const height = IsoPainter.shape(2, Math.max(1, state.chains[deal.chain].levels[2])).height;
      point = painter.point(tile[0] + 0.5, tile[1] + 0.5, height + 0.9);
    } else {
      point = { x: size.width * 0.8, y: size.height * 0.3 };
    }
  } else {
    const middle = painter.grid / 2;
    point = painter.point(middle, middle, 2.4);
  }
  // Kenarlardan taşmasın.
  return { x: Math.min(Math.max(point.x, 60), size.width - 60), y: Math.min(Math.max(point.y, 64), size.height - 50) };
}

interface Style {
  inner: Rgb;
  outer: Rgb;
  glyph: Rgb;
}

function dealStyle(deal: ActiveDeal, night: boolean): Style {
  if (deal.kind === 'vip') return { inner: 0xffe9f8, outer: 0xe07bff, glyph: 0x9b34d1 };
  if (deal.kind === 'investor') return { inner: 0xfff7cf, outer: 0xffb21e, glyph: 0xa35a00 };
  const [a, b] = chainColors(deal.chain ?? 'bakery', night);
  return { inner: 0xffffff, outer: a, glyph: b };
}

function DealIcon({ deal, color }: { deal: ActiveDeal; color: string }) {
  const Icon = deal.kind === 'vip' ? Crown : deal.kind === 'investor' ? Briefcase : CHAIN_ICONS[deal.chain ?? 'bakery'];
  return <Icon size={24} strokeWidth={2.8} color={color} />;
}

/** Adanın üstündeki katman: duran fırsat ve son yakalananın uçuşu. */
export function DealLayer({ island, painter, size }: CityOverlayArgs) {
  const store = useStore();
  const state = store.state;
  const deal = state.deal;
  const caught = store.lastCatch;
  const burst = caught && (caught.frozen || performance.now() - caught.at < BURST * 1000) ? caught : null;
  return (
    <>
      {deal && <DealBubble key={state.deals} deal={deal} at={anchor(deal, island, painter, state, size)} reward={dealReward(state)} remaining={deal.until - state.clock} hint={state.deals <= 3} onCatch={() => store.catchDeal()} />}
      {burst && <DealBurst key={burst.id} caught={burst} at={anchor(burst.deal, island, painter, state, size)} />}
    </>
  );
}

function DealBubble({ deal, at, reward, remaining, hint, onCatch }: { deal: ActiveDeal; at: Point; reward: number; remaining: number; hint: boolean; onCatch: () => void }) {
  const night = useNight();
  const style = dealStyle(deal, night);
  const left = Math.max(0, Math.min(1, remaining / DEAL_LIFETIME));
  const urgent = remaining < 3;
  const radius = 26;
  const circumference = 2 * Math.PI * (radius + 6);
  return (
    <button
      type="button"
      className="deal plain"
      onClick={onCatch}
      aria-label={t('deal.a11y', t(`deal.${deal.kind}`), money(reward))}
      data-testid="deal"
      style={{ position: 'absolute', left: at.x - 60, top: at.y - (hint ? 64 : 52), width: 120, height: hint ? 128 : 104 }}
    >
      <span className="deal-bob">
        {hint && <span className="deal-hint">{t('deal.hint')}</span>}
        <span className={`deal-ball ${urgent ? 'urgent' : ''}`} style={{ ['--outer' as string]: css(style.outer), background: `radial-gradient(circle at 35% 30%, ${css(style.inner)} 3%, ${css(style.outer)} 70%)` } as CSSProperties}>
          <svg className="deal-ring" viewBox="-36 -36 72 72" aria-hidden>
            <circle r={radius + 6} fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${circumference * left} ${circumference}`} transform="rotate(-90)" />
          </svg>
          <DealIcon deal={deal} color={css(style.glyph)} />
          <i className="deal-shine" />
        </span>
        <span className="deal-reward display">+{money(reward)}</span>
      </span>
    </button>
  );
}

/** Yakalanınca: altın taneler dağılıyor, tutar yukarı uçuyor. */
function DealBurst({ caught, at }: { caught: DealCatch; at: Point }) {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (caught.frozen) return;
    let id = 0;
    const loop = () => {
      setFrame((f) => f + 1);
      if (performance.now() - caught.at < BURST * 1000) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [caught]);
  const p = caught.frozen ? 0.4 : Math.min(1, (performance.now() - caught.at) / (BURST * 1000));
  const ease = 1 - Math.pow(1 - p, 3);
  return (
    <span aria-hidden style={{ position: 'absolute', left: at.x, top: at.y, pointerEvents: 'none' }}>
      {Array.from({ length: 10 }, (_, k) => {
        const angle = (k / 10) * 2 * Math.PI;
        return (
          <i
            key={k}
            style={{
              position: 'absolute',
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: k % 2 === 0 ? '#ffd24a' : '#fff1a8',
              left: -4.5 + Math.cos(angle) * 46 * ease,
              top: -4.5 + Math.sin(angle) * 46 * ease - 14 * ease,
              opacity: 1 - p,
            }}
          />
        );
      })}
      <span
        className="display"
        style={{
          position: 'absolute',
          left: 0,
          top: -12 - 56 * ease,
          transform: 'translate(-50%, -50%)',
          whiteSpace: 'nowrap',
          padding: '0 11px',
          minHeight: 30,
          lineHeight: '30px',
          borderRadius: 999,
          background: 'var(--money)',
          border: '2px solid rgba(255,255,255,0.9)',
          color: '#fff',
          fontSize: 18,
          boxShadow: '0 2px 4px var(--card-shadow)',
          opacity: p < 0.7 ? 1 : (1 - p) / 0.3,
        }}
      >
        +{money(caught.reward)}
      </span>
    </span>
  );
}
