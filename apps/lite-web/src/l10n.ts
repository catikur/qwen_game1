/**
 * İki dil: Türkçe (varsayılan) ve İngilizce. Sözlükler iOS uygulamasının
 * `L10n.swift`'inden (`virtual:l10n`, vite.config.ts); web'e özgü farklar
 * aşağıda. Biçim belirteçleri Swift'inkiler: %@, %ld, %d, %.Nf, %%.
 */
import { en as enBase, tr as trBase } from 'virtual:l10n';
import type { ActiveEvent, ChainId, DistrictId, GoalKind, PolicyKind, Stage } from '@capital/lite-model';

export type Lang = 'tr' | 'en';

/** Web ve Android'de iOS'a özgü cümleler. */
const trWeb: Record<string, string> = {
  'settings.notifications.denied': 'Bildirim izni kapalı. Tarayıcının site ayarlarından açabilirsin.',
  'sync.corrected': 'Oyun sunucuyla eşitlendi.',
  'sync.replaced': 'Oyun başka cihazda ilerlemiş; oradan devam ediyorsun.',
  'sync.signedOut': 'Hesap silinmiş; yeni bir oyun başladı.',
  'sync.connecting': 'Sunucuya bağlanıyor…',
  'league.joinBody': 'Oyunun sunucuda kayıtlı. Bir şirket adı seçince haftalık ligde ve yıldız tablosunda görünürsün.',
};
const enWeb: Record<string, string> = {
  'settings.notifications.denied': 'Notifications are off. Turn them on in your browser’s site settings.',
  'sync.corrected': 'Your game was synced with the server.',
  'sync.replaced': 'Your game moved ahead on another device; continuing from there.',
  'sync.signedOut': 'The account was deleted; a new game has started.',
  'sync.connecting': 'Connecting to the server…',
  'league.joinBody': 'Your game is saved on the server. Pick a company name to appear in the weekly league and the stars leaderboard.',
};

const tables: Record<Lang, Record<string, string>> = {
  tr: { ...trBase, ...trWeb },
  en: { ...enBase, ...enWeb },
};

export function deviceLang(): Lang {
  const code = (typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : 'tr').slice(0, 2).toLowerCase();
  return code === 'tr' ? 'tr' : 'en';
}

let current: Lang = deviceLang();

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function lang(): Lang {
  return current;
}

/** Büyük harf: Türkçede "i" → "İ". */
export function upper(text: string): string {
  return text.toLocaleUpperCase(current === 'tr' ? 'tr-TR' : 'en-US');
}

/** Swift `String(format:)` karşılığı (kullandığımız belirteçler). */
export function format(pattern: string, args: ReadonlyArray<string | number>): string {
  let index = 0;
  return pattern.replace(/%(%|@|l{0,2}d|\.(\d+)f)/g, (match, kind: string, digits?: string) => {
    if (kind === '%') return '%';
    const value = args[index++];
    if (value === undefined) return match;
    if (kind === '@') return String(value);
    if (digits !== undefined) return Number(value).toFixed(Number(digits));
    return String(Math.trunc(Number(value)));
  });
}

export function t(key: string, ...args: Array<string | number>): string {
  const pattern = tables[current][key] ?? tables.tr[key] ?? key;
  return args.length === 0 ? pattern : format(pattern, args);
}

export const chainName = (id: ChainId) => t(`chain.${id}`);
export const stageName = (chain: ChainId, stage: Stage) => t(`stage.${chain}.${stage}`);
export const stageRole = (stage: Stage) => t(`role.${stage}`);
export const districtName = (id: DistrictId) => t(`district.${id}`);
export const policyTitle = (kind: PolicyKind) => t(`policy.${kind}`);
export const policyBody = (kind: PolicyKind) => t(`policy.${kind}.body`);
export const goalTitle = (kind: GoalKind) => t(`goal.${kind}`);

export function eventTitle(event: ActiveEvent): string {
  if (event.kind === 'strike' && event.chain) return t('event.strike', chainName(event.chain));
  return t(`event.${event.kind}`);
}

export function eventBody(event: ActiveEvent): string {
  if (event.kind === 'strike' && event.chain) return t('event.strike.body', stageName(event.chain, 2));
  return t(`event.${event.kind}.body`);
}
