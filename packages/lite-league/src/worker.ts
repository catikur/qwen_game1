/**
 * Cloudflare Worker girişi: istekler `handle`'a, haftalık cron bölüm
 * değişimine. Bağlama: `DB` (D1), `wrangler.toml`.
 */
import { handle, rollover } from './app';
import { d1, type D1Like } from './db';

interface Env {
  DB: D1Like;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, d1(env.DB), Date.now());
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await rollover(d1(env.DB), Date.now());
  },
};
