/**
 * Şehir görünümü (iOS `CityView` ile aynı): gökyüzünde süzülen ada; takımada
 * açılınca her ada yatay bir sayfa, üstte küçük ada haritası. Çizim
 * `IsoPainter`'da; burada tuval, sayfalar ve harita.
 *
 * Tuval saniyede en çok 30 kare çiziliyor (iOS `TimelineView(.animation(
 * minimumInterval: 1/30))`), sekme gizliyken ve sayfa ekran dışındayken
 * duruyor. iOS'taki şehir "hareketi azalt"a bakmıyor; burada da öyle.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Car, Coffee, Cpu, Croissant, House, Lock, Plane, Shirt, ShoppingBag, Zap, type LucideIcon } from 'lucide-react';
import { CHAIN_BY_ID, ISLAND_COUNT, cityTheme, districtUnlocked, islandUnlocked, type ChainId, type LiteState } from '@capital/lite-model';
import { money } from '../format';
import { districtName, t } from '../l10n';
import { chainColors, css, type Rgb } from '../theme';
import { islandChain } from './layout';
import { IsoPainter, referenceTime, type Size } from './painter';
import { CityPalette } from './palette';
import './city.css';

export interface CityOverlayArgs {
  island: number;
  painter: IsoPainter;
  size: Size;
}

export type CityOverlay = (args: CityOverlayArgs) => ReactNode;

export interface CityViewProps {
  state: LiteState;
  night: boolean;
  height: number | string;
  /** Her adanın tuvalinin üstünde, tuvalin CSS pikseliyle aynı koordinatlarda (fırsat balonları). */
  overlay?: CityOverlay;
  /** Açılışta gösterilecek ada (iOS `-liteIsland <n>`). */
  initialIsland?: number;
}

// ------------------------------------------------------------ ada haritası yardımcıları

const CHAIN_ICONS: Record<ChainId, LucideIcon> = {
  bakery: Croissant,
  coffee: Coffee,
  fashion: Shirt,
  leather: ShoppingBag,
  tech: Cpu,
  energy: Zap,
  auto: Car,
  aviation: Plane,
};

/** Adanın adı: ana ada ya da zincirinin mahallesi. */
export function islandName(island: number): string {
  const chain = islandChain(island);
  return chain ? districtName(CHAIN_BY_ID[chain].district) : t('island.main');
}

export function islandIcon(island: number): LucideIcon {
  const chain = islandChain(island);
  return chain ? CHAIN_ICONS[chain] : House;
}

export function islandColors(island: number, night: boolean): [Rgb, Rgb] {
  const chain = islandChain(island);
  return chain ? chainColors(chain, night) : [0xffc46b, 0xff9a3d];
}

/** Şu anki adanın adı; sıradaki ada kilitliyse köprünün açılacağı kazanç. */
export function islandCaption(state: LiteState, current: number): string {
  let next: number | null = null;
  for (let island = 0; island < ISLAND_COUNT; island++) {
    if (!islandUnlocked(state, island)) {
      next = island;
      break;
    }
  }
  if (next !== null && current === next - 1) {
    const chain = islandChain(next);
    if (chain) return `${islandName(current)} · ${t('island.locked', money(CHAIN_BY_ID[chain].unlockAt))}`;
  }
  return islandName(current);
}

// ------------------------------------------------------------ şehir

export function CityView({ state, night, height, overlay, initialIsland = 0 }: CityViewProps) {
  const islands = useMemo(() => {
    const open: number[] = [];
    for (let island = 0; island < ISLAND_COUNT; island++) if (islandUnlocked(state, island)) open.push(island);
    return open;
  }, [state]);
  const showMap = islands.length > 1 || districtUnlocked(state, 'technopark');
  const paged = islands.length > 1;

  const [chosen, setPage] = useState(() => (islands.includes(initialIsland) ? initialIsland : 0));
  // Şehir satılınca adalar yeniden kilitleniyor: kapanan adanın sayfası kalmasın.
  const page = islands.includes(chosen) ? chosen : 0;
  const scroller = useRef<HTMLDivElement>(null);
  /** Dokunarak başlatılan kaydırmanın hedefi: yoldaki sayfalar haritada yanıp sönmesin. */
  const target = useRef<{ index: number; timer: number } | null>(null);
  /** Sayfaları yeni kurulan kaydırıcı (açılışta ya da ada açılınca) seçili sayfaya bir kez oturuyor. */
  const placed = useRef<HTMLDivElement | null>(null);

  // Açılışta istenen adanın sayfası (animasyonsuz).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!paged || !el || placed.current === el) return;
    placed.current = el;
    const index = islands.indexOf(page);
    if (index > 0) el.scrollLeft = index * el.clientWidth;
  }, [paged, islands, page]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.max(0, Math.min(islands.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
    if (target.current) {
      if (index !== target.current.index) return;
      window.clearTimeout(target.current.timer);
      target.current = null;
    }
    const island = islands[index];
    if (island !== undefined) setPage(island);
  }, [islands]);

  const select = useCallback(
    (island: number) => {
      setPage(island);
      const el = scroller.current;
      const index = islands.indexOf(island);
      if (!el || index < 0) return;
      if (target.current) window.clearTimeout(target.current.timer);
      target.current = { index, timer: window.setTimeout(() => (target.current = null), 900) };
      el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    },
    [islands],
  );

  useEffect(
    () => () => {
      if (target.current) window.clearTimeout(target.current.timer);
    },
    [],
  );

  return (
    <div className="city" style={{ height }} data-testid="city">
      {paged ? (
        <div className="city-pages" ref={scroller} onScroll={onScroll}>
          {islands.map((island) => (
            <div className="city-page" key={island}>
              <IslandCanvas state={state} night={night} island={island} overlay={overlay} />
            </div>
          ))}
        </div>
      ) : (
        <IslandCanvas state={state} night={night} island={0} overlay={overlay} />
      )}
      {showMap && <IslandMap state={state} night={night} page={page} onSelect={select} />}
    </div>
  );
}

// ------------------------------------------------------------ ada haritası

/** Adalar arasında küçük harita: açık adalar renkli, sıradaki kilitli. */
export function IslandMap({ state, night, page, onSelect }: { state: LiteState; night: boolean; page: number; onSelect: (island: number) => void }) {
  const dots: ReactNode[] = [];
  for (let island = 0; island < ISLAND_COUNT; island++) {
    const open = islandUnlocked(state, island);
    const current = page === island;
    const [top, bottom] = islandColors(island, night);
    const Icon = open ? islandIcon(island) : Lock;
    dots.push(
      <button
        key={island}
        type="button"
        className={`island-dot${open ? ' is-open' : ''}${current ? ' is-current' : ''}`}
        style={open ? { background: `linear-gradient(180deg, ${css(top)}, ${css(bottom)})` } : undefined}
        disabled={!open}
        aria-label={islandName(island)}
        aria-current={current ? 'page' : undefined}
        onClick={() => onSelect(island)}
      >
        <Icon size={open ? 11 : 9} strokeWidth={3} aria-hidden />
      </button>,
    );
  }
  return (
    <div className="island-map">
      {dots}
      <span className="island-caption">{islandCaption(state, page)}</span>
    </div>
  );
}

// ------------------------------------------------------------ ada tuvali

/** Bir adanın canlı çizimi; üstünde isteğe bağlı katman (fırsat balonu). */
export function IslandCanvas({ state, night, island, overlay }: { state: LiteState; night: boolean; island: number; overlay?: CityOverlay }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const theme = cityTheme(state.city);
  const palette = useMemo(() => new CityPalette(night, theme), [night, theme]);
  const painter = useMemo(() => (size ? new IsoPainter(size, palette, island, state) : null), [size, palette, island, state]);

  // Döngünün okuduğu son değerler.
  const live = useRef<{ painter: IsoPainter | null; state: LiteState }>({ painter, state });
  /** Sayfa ekranda ve sekme açık mı; değilse durum değişince de çizilmiyor (görününce çiziliyor). */
  const showing = useRef(true);
  const drawn = useRef(false);

  const render = useCallback(() => {
    const el = canvas.current;
    const { painter: current, state: latest } = live.current;
    if (!el || !current) return;
    const { width, height } = current.size;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (el.width !== pixelWidth) el.width = pixelWidth;
    if (el.height !== pixelHeight) el.height = pixelHeight;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    current.draw(ctx, latest, referenceTime());
    drawn.current = true;
  }, []);

  // Boyut: kabın CSS pikseli. İlk ölçüm boyamadan önce (boş kare görünmesin).
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
    };
    const box = el.getBoundingClientRect();
    measure(box.width, box.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) measure(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Durum ya da boyut değişince hemen çiz (tuvali boyutlamak onu siliyor).
  useLayoutEffect(() => {
    live.current = { painter, state };
    if (showing.current || !drawn.current) render();
  }, [painter, state, render]);

  // Animasyon: en çok 30 kare/sn; sekme gizliyken ya da sayfa görünmüyorken duruyor.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0;
    let last = 0;
    let visible = true;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 1000 / 30 - 2) return;
      last = now;
      render();
    };
    const update = () => {
      const run = visible && document.visibilityState === 'visible';
      showing.current = run;
      if (run && frame === 0) {
        render();
        frame = requestAnimationFrame(tick);
      } else if (!run && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              // Kenarı değen komşu sayfa da "kesişiyor" sayılıyor: oran sıfırsa görünmüyor.
              if (entry) visible = entry.isIntersecting && entry.intersectionRatio > 0;
              update();
            },
            { threshold: [0, 0.01] },
          )
        : null;
    observer?.observe(el);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [render]);

  return (
    <div className="island-canvas" ref={host}>
      <canvas ref={canvas} aria-hidden />
      {overlay && painter && size && <div className="island-overlay">{overlay({ island, painter, size })}</div>}
    </div>
  );
}
