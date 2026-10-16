import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Metinler tek kaynaktan: iOS uygulamasının `L10n.swift` sözlükleri derleme
 * anında okunuyor (`virtual:l10n`). Web'e özgü farklar `src/l10n.ts`'de.
 */
const swiftL10n = fileURLToPath(new URL('../../ios-lite/App/Sources/L10n.swift', import.meta.url));

/** Lig sunucusu: iOS uygulamasıyla aynı adres (`project.yml` → `LiteLeagueURL`); `VITE_LEAGUE_URL` ile değişiyor. */
const projectYml = readFileSync(fileURLToPath(new URL('../../ios-lite/App/project.yml', import.meta.url)), 'utf8');

function leagueUrl(): string {
  const env = process.env.VITE_LEAGUE_URL;
  if (env !== undefined) return env;
  return /LiteLeagueURL:\s*"([^"]*)"/.exec(projectYml)?.[1] ?? '';
}

/** Sürüm: iOS uygulamasıyla aynı (`CFBundleShortVersionString`). */
const appVersion = /CFBundleShortVersionString:\s*"([^"]*)"/.exec(projectYml)?.[1] ?? '0';

function parseTable(source: string, name: 'tr' | 'en'): Record<string, string> {
  const start = source.indexOf(`private static let ${name}: [String: String] = [`);
  if (start < 0) throw new Error(`L10n.swift: ${name} sözlüğü bulunamadı`);
  const end = source.indexOf('\n    ]', start);
  const table: Record<string, string> = {};
  const line = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/;
  for (const row of source.slice(start, end).split('\n')) {
    const match = line.exec(row);
    if (!match) continue;
    table[match[1]!] = match[2]!.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(["\\])/g, '$1').replace(/\\n/g, '\n');
  }
  return table;
}

function l10n(): Plugin {
  const id = 'virtual:l10n';
  return {
    name: 'lite-l10n',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      this.addWatchFile(swiftL10n);
      const source = readFileSync(swiftL10n, 'utf8');
      return `export const tr = ${JSON.stringify(parseTable(source, 'tr'))};\nexport const en = ${JSON.stringify(parseTable(source, 'en'))};\n`;
    },
  };
}

export default defineConfig({
  // Göreli yollar: GitHub Pages'te /qwen_game1/lite/ altında da, Android
  // kabuğunda (Capacitor) da aynı paket çalışıyor.
  base: './',
  plugins: [react(), l10n()],
  define: { __LEAGUE_URL__: JSON.stringify(leagueUrl()), __APP_VERSION__: JSON.stringify(appVersion) },
  server: { port: 5174, host: '127.0.0.1' },
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 700 },
});
