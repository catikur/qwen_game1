/**
 * Holding haritası (iOS `HoldingMapCanvas` karşılığı): satılan şehirler denizde
 * yılan gibi dizilmiş küçük adalar; eski şehirlerden şu ankine kesikli
 * ticaret yolları, her birinde o şehrin öne çıkan zincirinin bayrağı.
 */
import { useEffect, useRef } from 'react';
import { cityTheme, tradeRouteChain, type CityRecord, type LiteState } from '@capital/lite-model';
import { CityPalette } from './city/palette';
import { useNight } from './hooks';
import { t } from './l10n';
import { chainColors, css } from './theme';

const COLUMNS = 4;
const ROW_HEIGHT = 92;

export function mapHeight(cities: number): number {
  return Math.max(1, Math.ceil(cities / COLUMNS)) * ROW_HEIGHT + 16;
}

/** Şehrin haritadaki yeri: satır satır, her satırda yön değişiyor. */
function position(index: number, width: number): { x: number; y: number } {
  const row = Math.floor(index / COLUMNS);
  let column = index % COLUMNS;
  if (row % 2 === 1) column = COLUMNS - 1 - column;
  const cell = width / COLUMNS;
  return { x: cell * (column + 0.5), y: 8 + ROW_HEIGHT * (row + 0.42) };
}

/** Satılmış şehrin kaydı: harita L7'de geldi, ondan önce satılanların kaydı yok. */
function record(state: LiteState, city: number): CityRecord | null {
  const index = city - (state.city - state.history.length);
  return index >= 0 && index < state.history.length ? state.history[index]! : null;
}

export function HoldingMap({ state }: { state: LiteState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const night = useNight();
  const height = mapHeight(state.city + 1);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const ratio = devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const styles = getComputedStyle(canvas);
      const ink = styles.getPropertyValue('--ink').trim() || '#1d3557';
      const muted = styles.getPropertyValue('--muted').trim() || '#4f6c8e';
      const money = styles.getPropertyValue('--money').trim() || '#0e9f5a';
      // Deniz dalgaları.
      ctx.strokeStyle = night ? css(0x8fb0ff, 0.18) : css(0x3eb6f2, 0.28);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < Math.floor(height / 26); k++) {
        const y = k * 26 + 14;
        for (let j = 0; j < 6; j++) {
          const x = (j * width) / 6 + (k % 2 === 0 ? 10 : 34);
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y);
        }
      }
      ctx.stroke();
      // Ticaret yolları: satılmış her şehirden şu ankine.
      const current = position(state.city, width);
      ctx.setLineDash([5, 5]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (let index = 0; index < state.city; index++) {
        const from = position(index, width);
        ctx.strokeStyle = css(chainColors(tradeRouteChain(index), night)[1], 0.75);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo((from.x + current.x) / 2, Math.min(from.y, current.y) - 26, current.x, current.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let index = 0; index <= state.city; index++) {
        const center = position(index, width);
        const isCurrent = index === state.city;
        const palette = new CityPalette(night, cityTheme(index));
        const w = isCurrent ? 54 : 46;
        const h = w / 2;
        const depth = 7;
        const top = [center.x, center.y - h / 2];
        const right = [center.x + w / 2, center.y];
        const bottom = [center.x, center.y + h / 2];
        const left = [center.x - w / 2, center.y];
        const poly = (points: number[][], fill: string) => {
          ctx.beginPath();
          points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x!, y!) : ctx.lineTo(x!, y!)));
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
        };
        poly([left, bottom, [bottom[0]!, bottom[1]! + depth], [left[0]!, left[1]! + depth]], css(palette.side[0]));
        poly([bottom, right, [right[0]!, right[1]! + depth], [bottom[0]!, bottom[1]! + depth]], css(palette.side[1]));
        poly([top, right, bottom, left], css(palette.grass[0]));
        if (isCurrent) {
          ctx.strokeStyle = '#ffd44f';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        // Bayrak: o şehrin öne çıkan zinciri (ilk şehirde fırın).
        ctx.strokeStyle = night ? '#c9d6f5' : '#55638f';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y + 2);
        ctx.lineTo(center.x, center.y - 20);
        ctx.stroke();
        poly([[center.x, center.y - 20], [center.x + 12, center.y - 16], [center.x, center.y - 12]], css(chainColors(tradeRouteChain(index), night)[1]));
        // Etiket.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 12px Fredoka, Nunito, sans-serif';
        ctx.fillStyle = ink;
        ctx.fillText(isCurrent ? t('map.current') : t('map.city', index + 1), center.x, center.y + h / 2 + depth + 9);
        const past = record(state, index);
        ctx.font = '800 10.5px Nunito, sans-serif';
        if (past) {
          ctx.fillStyle = money;
          ctx.fillText(t('map.stars', past.stars), center.x, center.y + h / 2 + depth + 23);
        } else if (isCurrent) {
          ctx.fillStyle = muted;
          ctx.fillText(t(`theme.${cityTheme(index)}`), center.x, center.y + h / 2 + depth + 23);
        }
      }
    };
    draw();
    void document.fonts?.ready.then(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [state, night, height]);
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} data-testid="holding-map-canvas" />;
}
