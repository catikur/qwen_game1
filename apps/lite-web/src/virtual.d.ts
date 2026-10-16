declare module 'virtual:l10n' {
  export const tr: Record<string, string>;
  export const en: Record<string, string>;
}

/** Lig sunucusunun adresi (vite.config.ts; boşsa lig "yakında"). */
declare const __LEAGUE_URL__: string;

/** Uygulama sürümü (iOS ile aynı). */
declare const __APP_VERSION__: string;
