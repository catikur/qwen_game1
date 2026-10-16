/**
 * Para ve süre biçimi (iOS `Format.swift` ile aynı). Türkçede B (bin), M,
 * Mr (milyar), Tn (trilyon), Ka (katrilyon); İngilizcede K, M, B, T, Qa.
 */
import { lang } from './l10n';

const TR_UNITS: Array<[number, string]> = [[1e18, 'Kn'], [1e15, 'Ka'], [1e12, 'Tn'], [1e9, 'Mr'], [1e6, 'M'], [1e3, 'B']];
const EN_UNITS: Array<[number, string]> = [[1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

const formatters = new Map<string, Intl.NumberFormat>();

function decimal(value: number, digits: number): string {
  const key = `${lang()}:${digits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(lang() === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function number(value: number): string {
  const units = lang() === 'tr' ? TR_UNITS : EN_UNITS;
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  for (const [scale, suffix] of units) {
    if (v >= scale) return `${sign}${decimal(v / scale, v / scale >= 100 ? 1 : 2)} ${suffix}`;
  }
  if (v >= 100) return sign + decimal(v, 0);
  return sign + decimal(v, v >= 10 ? 1 : 2);
}

export function money(value: number): string {
  return lang() === 'tr' ? `${number(value)} ₺` : `₺${number(value)}`;
}

export function percent(fraction: number): string {
  return decimal(fraction * 100, 0);
}

export function duration(seconds: number): string {
  const s = Math.round(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  // Sıfır alt birim yazılmıyor: "2 dk 0 sn" değil "2 dk".
  if (lang() === 'tr') {
    if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
    if (m > 0) return sec > 0 ? `${m} dk ${sec} sn` : `${m} dk`;
    return `${sec} sn`;
  }
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}
