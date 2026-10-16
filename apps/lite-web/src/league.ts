/**
 * Lig istemcisi (web ve Android): aynı sunucu (`packages/lite-league`), aynı
 * haftalık lig ve özel ligler. iOS'tan farkı: oyun sunucuda. Hesap ilk
 * açılışta sessizce açılıyor (adsız); oyuncu ad verince lige katılıyor.
 * Hamleler günlük olarak gönderiliyor (`/v1/sync`), puanı sunucu hesaplıyor.
 */
import type { LiteState, SyncOp } from '@capital/lite-model';

export type Platform = 'web' | 'android';

export interface Account {
  id: string;
  token: string;
  name: string;
}

export interface LeagueRow {
  rank: number;
  name: string;
  score: number;
  me: boolean;
  /** Haftalık grupta: +1 çıkış, -1 iniş, 0 kalış. */
  move?: number;
  platform?: string;
}

export interface Standings {
  week: string;
  endsAt: number;
  division: number;
  divisionKey: string;
  promote: number;
  demote: number;
  group: LeagueRow[];
}

export interface PrivateLeague {
  code: string;
  name: string;
  members: LeagueRow[];
}

export interface StarRow {
  rank: number;
  name: string;
  stars: number;
  platform: string;
  me: boolean;
}

export interface StarsBoard {
  top: StarRow[];
  me: { rank: number | null; stars: number; platform: string };
  friends: StarRow[];
}

export interface ServerSave {
  version: number;
  state: LiteState;
  cursor: number;
}

export interface SyncResponse extends ServerSave {
  applied: number;
  skipped: number;
  clipped: number;
  score: number;
}

export class LeagueError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`);
  }
}

const ACCOUNT_KEY = 'lite.league.account';

/** Android kabuğu (Capacitor) mı, tarayıcı mı. */
export function detectPlatform(): Platform {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return capacitor?.getPlatform?.() === 'android' ? 'android' : 'web';
}

export class LeagueClient {
  readonly baseURL: string;
  readonly platform = detectPlatform();
  account: Account | null;

  constructor(
    baseURL: string,
    private readonly ephemeral: boolean,
  ) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.account = ephemeral ? null : LeagueClient.loadAccount();
  }

  get configured(): boolean {
    return this.baseURL !== '';
  }

  private static loadAccount(): Account | null {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      return raw ? (JSON.parse(raw) as Account) : null;
    } catch {
      return null;
    }
  }

  private saveAccount(): void {
    if (this.ephemeral) return;
    try {
      if (this.account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(this.account));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      // özel pencere
    }
  }

  private async send<T>(method: string, path: string, body?: unknown, options: { auth?: boolean; keepalive?: boolean } = {}): Promise<T> {
    if (!this.configured) throw new LeagueError(0, 'unconfigured');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.auth !== false && this.account) headers.authorization = `Bearer ${this.account.id}.${this.account.token}`;
    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive: options.keepalive ?? false,
      });
    } catch {
      throw new LeagueError(0, 'transport');
    }
    const text = await response.text();
    const parsed = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (!response.ok) {
      const reason = typeof parsed.reason === 'string' ? `:${parsed.reason}` : '';
      throw new LeagueError(response.status, `${String(parsed.error ?? '')}${reason}`, parsed);
    }
    return parsed as T;
  }

  /** Sessiz hesap (adsız): oyun sunucuda sıfırdan. */
  async register(turnstile?: string): Promise<ServerSave> {
    const created = await this.send<Account & { save: ServerSave }>('POST', 'v1/players', { platform: this.platform, ...(turnstile ? { turnstile } : {}) }, { auth: false });
    this.account = { id: created.id, token: created.token, name: created.name };
    this.saveAccount();
    return created.save;
  }

  async loadSave(): Promise<ServerSave> {
    return this.send('GET', 'v1/save');
  }

  sync(base: number, batch: string, ops: SyncOp[], rest: number, keepalive = false): Promise<SyncResponse> {
    return this.send('POST', 'v1/sync', { base, batch, ops, rest }, { keepalive });
  }

  /** Lige katıl ya da adı değiştir. */
  async rename(name: string): Promise<void> {
    const result = await this.send<{ name: string }>('PATCH', 'v1/players/me', { name });
    if (this.account) {
      this.account = { ...this.account, name: result.name };
      this.saveAccount();
    }
  }

  standings(): Promise<Standings> {
    return this.send('GET', 'v1/league');
  }

  async leagues(): Promise<PrivateLeague[]> {
    return (await this.send<{ leagues: PrivateLeague[] }>('GET', 'v1/leagues')).leagues;
  }

  stars(): Promise<StarsBoard> {
    return this.send('GET', 'v1/stars');
  }

  createLeague(name: string): Promise<{ code: string; name: string }> {
    return this.send('POST', 'v1/leagues', { name });
  }

  joinLeague(code: string): Promise<{ code: string; name: string }> {
    return this.send('POST', 'v1/leagues/join', { code });
  }

  leaveLeague(code: string): Promise<unknown> {
    return this.send('DELETE', `v1/leagues/${code}`);
  }

  /** Başka cihaza taşıma kodu (10 dakika). */
  createLink(): Promise<{ code: string; expiresAt: number }> {
    return this.send('POST', 'v1/link', {});
  }

  /** Kodla hesabı bu cihaza al: oyun ve lig buraya geçiyor. */
  async claimLink(code: string): Promise<ServerSave | null> {
    const claimed = await this.send<Account & { save?: ServerSave }>('POST', 'v1/link/claim', { code, platform: this.platform }, { auth: false });
    this.account = { id: claimed.id, token: claimed.token, name: claimed.name };
    this.saveAccount();
    return claimed.save ?? null;
  }

  async deleteAccount(): Promise<void> {
    await this.send('DELETE', 'v1/players/me');
    this.forget();
  }

  /** Hesabı bu cihazdan unut (sunucu tanımıyor: silinmiş). */
  forget(): void {
    this.account = null;
    this.saveAccount();
  }
}
