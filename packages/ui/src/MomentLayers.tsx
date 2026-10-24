import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { formatMoney, getPlayer } from '@capital/core';
import type { GameState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { reducedMotion, useSettings } from './settings';
import { MONEY_TAGS, momentsBetween, moneyTagsOf, snapshotOf } from './moments';
import type { Moment, MomentSnapshot, MoneyTag } from './moments';
import { t } from './i18n';

/**
 * Önemli anlar (Tur 63), arayüz: para akışı ve büyük anların bandı.
 *
 *   - Kazanç etiketleri: her gün oyuncunun en çok kazandıran üç binasının
 *     çatısından dünkü kâr yükseliyor (çok zarar eden varsa o da,
 *     kırmızı). Para nereden geliyor: şehrin üstünde, sayıyla.
 *   - Kasa: üst bardaki değer yeni tutara sayarak gidiyor, altında farkı.
 *   - Bant: rakip devralınınca ve zafer gelince ekranın üstünde kısa bir
 *     an; zafer ekranı havai fişeklerden sonra açılıyor.
 *
 * Hepsi görünüm: simülasyon okumuyor. Azaltılmış harekette etiket yok,
 * sayaç sayarak değil doğrudan yeni değere gidiyor; bant ve fark kalıyor
 * (bilgi taşıyorlar, hareket değil).
 */

/** Zafer ekranı havai fişeklerden bu kadar sonra (ms). */
export const VICTORY_DELAY_MS = 2400;
const TAKEOVER_BANNER_MS = 4600;
const VICTORY_BANNER_MS = VICTORY_DELAY_MS + 400;
const CASH_TWEEN_MS = 650;
const CASH_DELTA_MS = 2200;
/** Fark rozeti en sık bu aralıkla yeniden "zıplıyor"; hızlı oyunda yazı değişiyor, rozet titremiyor. */
const CASH_DELTA_POP_MS = 700;

/** İki etiketin çakıştığı sayılan uzaklık (px): yazının yarı eni ve satır yüksekliği. */
const TAG_GAP_X = 84;
const TAG_GAP_Y = 27;

interface LiveTag extends MoneyTag {
  key: string;
  born: number;
  order: number;
}

/** Kazanç etiketleri: şehrin üstünde, binanın çatısına bağlı. */
export function MoneyTags(): ReactElement | null {
  const state = useGameState();
  const { view, projectTile } = useGame();
  const settings = useSettings();
  const [tags, setTags] = useState<LiveTag[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const lastDay = useRef<number | null>(null);
  const lastWave = useRef(-Infinity);
  const source = useRef<GameState | null>(null);
  // Pencere açıkken, veri lensinde ve oyun bitince etiket yok: şehre bakılmıyor.
  const enabled = settings.moneyTags && !reducedMotion(settings) && view.openPanel === 'none' && view.lens === 'none' && !state.gameOver;
  const day = state.time.day;

  useEffect(() => {
    const previous = lastDay.current;
    lastDay.current = day;
    // Kayıt açıldı ya da şehir değişti: gün farkı bir kazanç değil.
    if (source.current !== state) {
      source.current = state;
      return;
    }
    if (previous === null || day <= previous || !enabled) return;
    const now = performance.now();
    if (now - lastWave.current < MONEY_TAGS.minGapMs) return;
    lastWave.current = now;
    const fresh = moneyTagsOf(state).map((tag, order) => ({ ...tag, key: `${day}:${tag.buildingId}`, born: now, order }));
    if (fresh.length > 0) setTags((list) => [...list.filter((tag) => now - tag.born < MONEY_TAGS.lifeMs), ...fresh]);
  }, [day, state, enabled]);

  useEffect(() => {
    if (!enabled) setTags([]);
  }, [enabled]);

  useEffect(() => {
    if (tags.length === 0) return;
    const oldest = Math.min(...tags.map((tag) => tag.born));
    const timer = window.setTimeout(
      () => setTags((list) => list.filter((tag) => performance.now() - tag.born < MONEY_TAGS.lifeMs + 300)),
      Math.max(50, oldest + MONEY_TAGS.lifeMs + 320 - performance.now()),
    );
    return () => window.clearTimeout(timer);
  }, [tags]);

  // Konum her karede sahneden: kamera kayarken etiket çatıda kalıyor.
  // Yan yana binaların etiketleri üst üste binmesin: çakışan bir üst sıraya.
  useEffect(() => {
    if (tags.length === 0 || !projectTile) return;
    let frame = 0;
    const placed: Array<{ x: number; y: number }> = [];
    const place = (): void => {
      const root = layer.current;
      placed.length = 0;
      if (root) {
        for (const el of Array.from(root.children) as HTMLElement[]) {
          const at = projectTile(Number(el.dataset['tile']));
          if (!at || !at.visible) {
            el.style.visibility = 'hidden';
            continue;
          }
          let y = at.y;
          for (let tries = 0; tries < tags.length; tries++) {
            const clash = placed.find((p) => Math.abs(p.x - at.x) < TAG_GAP_X && Math.abs(p.y - y) < TAG_GAP_Y);
            if (!clash) break;
            y = clash.y - TAG_GAP_Y;
          }
          placed.push({ x: at.x, y });
          el.style.visibility = '';
          el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(y)}px)`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [tags, projectTile]);

  if (tags.length === 0) return null;
  return (
    <div ref={layer} className="money-tags" aria-hidden="true">
      {tags.map((tag) => (
        <span key={tag.key} className="money-tag-anchor" data-tile={tag.tileId}>
          <span
            className={`money-tag ${tag.amount > 0 ? 'money-tag-gain' : 'money-tag-loss'}`}
            data-money-tag={tag.buildingId}
            style={{ animationDelay: `${tag.order * 140}ms` }}
          >
            {tag.amount > 0 ? `+${formatMoney(tag.amount)}` : formatMoney(tag.amount)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Kasa sayacı: değer yeni tutara sayarak gidiyor. Yazıyı React değil
 * bu bileşen yazıyor (sayım her karede; üst bar yeniden çizilmiyor).
 * Kayıt açılınca ya da şehir değişince saymadan yeni değer.
 */
export function TweenMoney({ value, source }: { value: number; source: GameState }): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const from = useRef<GameState>(source);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = shown.current;
    const jump = from.current !== source || reducedMotion() || Math.abs(value - start) < 1;
    from.current = source;
    if (jump) {
      shown.current = value;
      el.textContent = formatMoney(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (): void => {
      const k = Math.min(1, (performance.now() - began) / CASH_TWEEN_MS);
      const eased = 1 - (1 - k) * (1 - k) * (1 - k);
      shown.current = k >= 1 ? value : start + (value - start) * eased;
      el.textContent = formatMoney(shown.current);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    step();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, source]);

  return <span ref={ref} className="tween-money" />;
}

/** Kasanın son değişimi: değerin altında kısa bir rozet (yeşil giriş, kırmızı çıkış). */
export function CashDelta({ value, source }: { value: number; source: GameState }): ReactElement | null {
  const previous = useRef(value);
  const from = useRef<GameState>(source);
  const lastPop = useRef(-Infinity);
  const [delta, setDelta] = useState<{ pop: number; amount: number; at: number } | null>(null);

  useEffect(() => {
    const change = value - previous.current;
    previous.current = value;
    if (from.current !== source) {
      from.current = source;
      setDelta(null);
      return;
    }
    if (Math.abs(change) < 1) return;
    const now = performance.now();
    const pop = now - lastPop.current >= CASH_DELTA_POP_MS;
    if (pop) lastPop.current = now;
    setDelta((current) => ({ pop: pop || !current ? (current?.pop ?? 0) + 1 : current.pop, amount: Math.round(change), at: now }));
  }, [value, source]);

  useEffect(() => {
    if (!delta) return;
    const timer = window.setTimeout(() => setDelta(null), CASH_DELTA_MS);
    return () => window.clearTimeout(timer);
  }, [delta]);

  if (!delta) return null;
  const text = delta.amount > 0 ? `+${formatMoney(delta.amount)}` : formatMoney(delta.amount);
  return (
    <span
      key={delta.pop}
      className={`metric-delta ${delta.amount > 0 ? 'metric-delta-gain' : 'metric-delta-loss'}`}
      data-delta-sign={delta.amount > 0 ? 'gain' : 'loss'}
      title={t('hud.moment.cashDelta', { delta: text })}
    >
      {text}
    </span>
  );
}

/**
 * Büyük anların bandı: devralma ve zafer. Ekranın üstünde, birkaç
 * saniye; ekran okuyucuya da söyleniyor.
 */
export function MomentBanner(): ReactElement | null {
  const state = useGameState();
  const snapshot = useRef<MomentSnapshot | null>(null);
  const source = useRef<GameState | null>(null);
  const [shown, setShown] = useState<{ id: number; moment: Moment } | null>(null);

  useEffect(() => {
    if (source.current !== state || !snapshot.current) {
      source.current = state;
      snapshot.current = snapshotOf(state);
      return;
    }
    const moments = momentsBetween(snapshot.current, state);
    snapshot.current = snapshotOf(state);
    const latest = moments.find((moment) => moment.kind === 'victory') ?? moments[0];
    if (latest) setShown((current) => ({ id: (current?.id ?? 0) + 1, moment: latest }));
  });

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), shown.moment.kind === 'victory' ? VICTORY_BANNER_MS : TAKEOVER_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown || state.gameOver) return null;
  const { moment } = shown;
  const player = getPlayer(state);
  if (moment.kind === 'takeover') {
    return (
      <div key={shown.id} className="moment-banner moment-takeover" role="status" aria-live="polite" data-moment="takeover" data-moment-company={moment.companyId}>
        <span className="moment-eyebrow">{t('hud.moment.takeoverEyebrow')}</span>
        <strong className="moment-title">{t('hud.moment.takeover', { name: moment.name })}</strong>
        <span className="moment-detail">
          <span className="moment-swatches" aria-hidden="true">
            <span className="moment-swatch" style={{ background: moment.color }} />
            <span className="moment-arrow">→</span>
            <span className="moment-swatch" style={{ background: player.color }} />
          </span>
          {moment.buildings === 0 ? t('hud.moment.takeoverEmpty') : t('hud.moment.takeoverDetail', { buildings: moment.buildings })}
        </span>
      </div>
    );
  }
  return (
    <div key={shown.id} className="moment-banner moment-victory" role="status" aria-live="polite" data-moment="victory">
      <span className="moment-eyebrow">{t('hud.moment.victoryEyebrow')}</span>
      <strong className="moment-title">{moment.victory === 'monopoly' ? t('hud.victory.titleMonopoly') : t('hud.victory.titleNetWorth')}</strong>
      <span className="moment-detail">{t('hud.moment.victoryDetail')}</span>
    </div>
  );
}

/**
 * Canlı gelen bir anın ekranı biraz beklesin (zafer: havai fişek önce).
 * Kayıt açılırken zaten orada olan an ve azaltılmış hareket beklemiyor.
 */
export function useMomentDelay(key: string | null, ms: number): boolean {
  const [ready, setReady] = useState<string | null>(key);
  useEffect(() => {
    if (!key || key === ready) return;
    if (reducedMotion()) {
      setReady(key);
      return;
    }
    const timer = window.setTimeout(() => setReady(key), ms);
    return () => window.clearTimeout(timer);
  }, [key, ready, ms]);
  return key !== null && key === ready;
}
