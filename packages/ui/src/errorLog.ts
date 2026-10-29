/**
 * Hata günlüğü (Tur 74): hata raporuna giden son uyarılar ve hatalar.
 * Açılışta kuruluyor (`main.tsx`) ki ilk anların hatası da kaçmasın; bu
 * yüzden giriş paketinde ve küçük. Yalnız bellekte, hiçbir yere
 * gönderilmiyor: oyuncu raporu kendisi kaydedip yolluyor.
 *
 * Konsolun `error` ve `warn`'ı sarılıyor (asılları yine çağrılıyor),
 * pencerenin yakalanmamış hataları ve reddedilen sözler de yazılıyor.
 */
export interface LogLine {
  /** Açılıştan bu yana geçen süre, ms. */
  at: number;
  level: 'error' | 'warn';
  text: string;
}

export const LOG_LIMIT = 60;
export const LOG_TEXT_LIMIT = 600;

const lines: LogLine[] = [];
const started = Date.now();

export function logLines(): readonly LogLine[] {
  return lines;
}

function describe(value: unknown): string {
  if (value instanceof Error) {
    const stack = (value.stack ?? '').split('\n').slice(1, 4).map((line) => line.trim()).join(' · ');
    return stack ? `${value.name}: ${value.message} (${stack})` : `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function recordLog(level: LogLine['level'], parts: readonly unknown[], now = Date.now()): void {
  const text = parts.map(describe).join(' ');
  lines.push({ at: now - started, level, text: text.length > LOG_TEXT_LIMIT ? `${text.slice(0, LOG_TEXT_LIMIT)}…` : text });
  if (lines.length > LOG_LIMIT) lines.splice(0, lines.length - LOG_LIMIT);
}

const installed = new WeakSet<object>();

export function installErrorLog(target: Window & typeof globalThis): void {
  if (installed.has(target)) return;
  installed.add(target);
  const { console } = target;
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      recordLog(level, args);
      original(...args);
    };
  }
  target.addEventListener('error', (event) => {
    const where = event.filename ? `${event.filename.split('/').pop()}:${event.lineno}` : '';
    recordLog('error', [event.error ?? event.message, where].filter(Boolean));
  });
  target.addEventListener('unhandledrejection', (event) => recordLog('error', ['unhandledrejection:', event.reason]));
}
