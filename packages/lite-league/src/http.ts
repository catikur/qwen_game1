/**
 * Lig sunucusunun HTTP yardımcıları: hata, JSON yanıt, gövde okuma, rastgele
 * anahtar ve kod, CORS.
 */
import { fromBase64 } from './attest';

/** Gövde sınırı (bayt): rapor ve kanıt için. */
export const MAX_BODY = 8_192;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Gövde: ham baytlar (App Attest onayı bunların üstüne) ve JSON nesnesi. */
export async function readBody(request: Request, max: number = MAX_BODY): Promise<{ bytes: Uint8Array<ArrayBuffer>; value: Record<string, unknown> }> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > max) throw new HttpError(413, 'body');
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return { bytes, value: value as Record<string, unknown> };
  } catch {
    // aşağıda
  }
  throw new HttpError(400, 'body');
}

export async function readJson(request: Request, max?: number): Promise<Record<string, unknown>> {
  return (await readBody(request, max)).value;
}

export function base64(text: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_BODY) return null;
  try {
    return fromBase64(text);
  } catch {
    return null;
  }
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

export function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

/** 6 harfli kod (davet, cihaz taşıma): karışan harfler (0/O, 1/I) yok. */
export function shortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/**
 * Tarayıcıdan gelen istekler (web sürümü, Android kabuğu): yalnızca oyunun
 * kendi adresleri. iOS uygulaması tarayıcı değil, Origin göndermiyor.
 */
export function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === 'https://catikur.github.io') return origin;
  // Android kabuğu (Capacitor) ve yerel geliştirme.
  if (/^(https?|capacitor):\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function withCors(response: Response, origin: string | null): Response {
  const allowed = allowedOrigin(origin);
  if (!allowed) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', allowed);
  headers.set('vary', 'origin');
  return new Response(response.body, { status: response.status, headers });
}

/** Ön uçuş (OPTIONS): izin verilen yöntemler ve başlıklar. */
export function preflight(origin: string | null): Response {
  const allowed = allowedOrigin(origin);
  if (!allowed) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': allowed,
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    },
  });
}
