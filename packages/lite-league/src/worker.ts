/**
 * Cloudflare Worker girişi: istekler `handle`'a, haftalık cron bölüm
 * değişimine. Bağlama: `DB` (D1), `wrangler.toml`. İsteğe bağlı sır:
 * `TURNSTILE_SECRET` (web ve Android hesabı açarken bot denetimi).
 */
import { handle, rollover, type Options } from './app';
import { APPLE_ATTEST } from './attest';
import { d1, type D1Like } from './db';

interface Env {
  DB: D1Like;
  TURNSTILE_SECRET?: string;
}

/** Turnstile jetonunu Cloudflare'a doğrulat. */
function turnstile(secret: string): NonNullable<Options['turnstile']> {
  return async (token, ip) => {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    if (!response.ok) return false;
    return ((await response.json()) as { success?: boolean }).success === true;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const options: Options = { attest: APPLE_ATTEST, ...(env.TURNSTILE_SECRET ? { turnstile: turnstile(env.TURNSTILE_SECRET) } : {}) };
    return handle(request, d1(env.DB), Date.now(), options);
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await rollover(d1(env.DB), Date.now());
  },
};
