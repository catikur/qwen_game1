/**
 * Arayüz parçaları (iOS `Theme.swift` karşılıkları): cam kart, parlak düğme,
 * ikon karosu, sikke, hap, dolum çubuğu, hap seçici, alt pencere.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  Car,
  Coffee,
  Cpu,
  Croissant,
  Plane,
  Shirt,
  ShoppingBag,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ChainId } from '@capital/lite-model';
import { useNight } from './hooks';
import { chainColors, css, type GlossName, type Rgb } from './theme';

export const CHAIN_ICONS: Record<ChainId, LucideIcon> = {
  bakery: Croissant,
  coffee: Coffee,
  fashion: Shirt,
  leather: ShoppingBag,
  tech: Cpu,
  energy: Zap,
  auto: Car,
  aviation: Plane,
};

export function Glass({ children, className = '', padding, style, id }: { children: ReactNode; className?: string; padding?: number; style?: CSSProperties; id?: string }) {
  return (
    <div id={id} className={`glass ${className}`} style={{ ...(padding !== undefined ? { padding } : {}), ...style }}>
      {children}
    </div>
  );
}

export function Gloss({
  gloss = 'orange',
  radius = 14,
  edge = 4,
  onClick,
  disabled,
  children,
  className = '',
  style,
  label,
  testId,
}: {
  gloss?: GlossName | null;
  radius?: number;
  edge?: number;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`gloss ${gloss ?? 'off'} ${className}`}
      style={{ ['--radius' as string]: `${radius}px`, ['--edge-size' as string]: `${edge}px`, ...style }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Renkli ikon karosu: degrade, üstte ışık çizgisi, altta ince kenar. */
export function IconTile({ icon: Icon, colors, size = 34 }: { icon: LucideIcon; colors: [Rgb, Rgb]; size?: number }) {
  return (
    <span
      className="tile-icon"
      style={{ width: size, height: size, borderRadius: size * 0.35, background: `linear-gradient(180deg, ${css(colors[0])}, ${css(colors[1])})` }}
    >
      <Icon size={size * 0.5} strokeWidth={2.6} />
    </span>
  );
}

export function ChainTile({ chain, size = 34 }: { chain: ChainId; size?: number }) {
  const night = useNight();
  return <IconTile icon={CHAIN_ICONS[chain]} colors={chainColors(chain, night)} size={size} />;
}

/** Kasa yanındaki altın para. */
export function Coin({ size = 30 }: { size?: number }) {
  return (
    <span className="coin" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden>
      ₺
    </span>
  );
}

export function Pill({ text, icon: Icon, size = 8.5 }: { text: string; icon?: LucideIcon; size?: number }) {
  return (
    <span className="pill" style={{ fontSize: size }}>
      {Icon && <Icon size={size * 0.9} strokeWidth={3.5} />}
      {text}
    </span>
  );
}

/** Yuvarlak dolum çubuğu. */
export function ProgressBar({ value, colors, height = 8, track }: { value: number; colors: [Rgb, Rgb]; height?: number; track?: string }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <span className="bar" style={{ height, background: track }}>
      <i style={{ width: v > 0 ? `max(${height}px, ${v * 100}%)` : 0, background: `linear-gradient(90deg, ${css(colors[0])}, ${css(colors[1])})` }} />
    </span>
  );
}

export function PillPicker<T extends string>({ value, options, label, onChange }: { value: T; options: readonly T[]; label: (option: T) => string; onChange: (option: T) => void }) {
  return (
    <div className="picker" role="radiogroup">
      {options.map((option) => (
        <button key={option} type="button" role="radio" aria-checked={option === value} className={option === value ? 'on' : ''} onClick={() => onChange(option)}>
          {label(option)}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
      <span />
    </label>
  );
}

/** Alt pencere: gökyüzü zeminli, başlık ve "Tamam"; Escape ve arka plana dokunma kapatıyor. */
export function Sheet({ title, onClose, children, center, done, testId }: { title?: string; onClose: () => void; children: ReactNode; center?: boolean; done: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', key);
    ref.current?.focus();
    return () => removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} className={`sheet ${center ? 'center' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId}>
        {title !== undefined && (
          <div className="sheet-head">
            <span className="display grow" style={{ fontSize: 22 }}>
              {title}
            </span>
            <Gloss gloss="blue" radius={12} edge={3} onClick={onClose} style={{ fontSize: 14, padding: '0 14px', minHeight: 34 }}>
              {done}
            </Gloss>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
