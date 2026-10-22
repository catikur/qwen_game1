import type { LeagueBoard, LeagueEntry, LeagueFeedInfo, LeagueSubmitOutcome } from '@capital/ui';

/**
 * Tohum Ligi tablosunun üçüncü deposu (Tur 51): lig sunucusu.
 *
 * Lite'ın sunucusu (`packages/lite-league`, `seed.ts`) ana oyunun
 * koşularını da alıyor. GitHub Pages'teki oyun tabloyu oradan okuyor;
 * tablo herkese açık ve tek. Doğrulama hâlâ bu tarayıcıda: her satır
 * yeniden oynanıyor (`leagueVerify`), kod sırası gelince iniyor
 * (`loadCode`). Tabloda kodun yalnızca özeti var: elli satırın kodu
 * birlikte inseydi telefon megabaytlarca bekleyecekti.
 *
 * Hesap anonim ve tembel: ilk gönderimde açılıyor; kimlik ve anahtar bu
 * tarayıcıda. Bağlantı yokken gönderilen koşu bekliyor ve tablo bir
 * sonraki tazelenişte (bağlantı gelince, sayfa görünür olunca, dakikada
 * bir) önce onu gönderiyor.
 */

export interface ServerBoardOptions {
  /** Sunucunun kökü, sonda `/` yok. */
  url: string;
  fetch: typeof fetch;
  /** Hesap ve bekleyen gönderimler; yoksa (depo kapalı) yalnız bu oturumda. */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Bağlantı gelince (`online`) tazelenir. */
  online?: EventTarget;
  /** Sayfa görünür olunca tazelenir; gizliyken dakikalık tazeleme durur. */
  visibility?: { target: EventTarget; visible(): boolean };
  /** Tablonun tazelenme aralığı (ms). */
  pollMs?: number;
  /** İstek zaman aşımı (ms). */
  timeoutMs?: number;
}

export interface ServerBoard extends LeagueBoard {
  kind: 'server';
  /** Sunucu ayakta ve bu sürümde mi (sağlık ucunda `seed`)? */
  probe(): Promise<'ok' | 'old' | 'offline'>;
  /** Bu tarayıcı sunucuyu daha önce çalışırken gördü mü (bağlantısız açılışta da sunucu tablosu kalsın)? */
  seen(): boolean;
}

const ACCOUNT_KEY = 'capitalforge.league.account';
const PENDING_KEY = 'capitalforge.league.pending';
const SEEN_KEY = 'capitalforge.league.server';
/** Son görülen tablo (bir hafta): bağlantısız yeniden açılışta boş tablo yerine o (Codex #80). */
const TABLE_KEY = 'capitalforge.league.table';
/** Bekleyen gönderim sınırı: en yenileri kalıyor. */
const PENDING_MAX = 3;

interface Account {
  url: string;
  id: string;
  token: string;
}

interface Pending {
  url: string;
  weekId: string;
  code: string;
}

interface StoredTable {
  url: string;
  weekId: string;
  /** Sunucunun satırları olduğu gibi (`toEntry` yeniden denetliyor). */
  rows: unknown[];
}

type Reply = { status: number; body: Record<string, unknown> } | null;

/** Gönderimin sunucudaki sonucu; `offline` bekleyen kuyruğa giriyor. */
type SendOutcome = Exclude<LeagueSubmitOutcome, 'queued'> | 'offline';

export function createServerBoard(options: ServerBoardOptions): ServerBoard {
  const { url } = options;
  const pollMs = options.pollMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const memory = new Map<string, string | null>();
  /**
   * Son yazımı depoya geçemeyen anahtarlar: okuma onlarda bellekten. Depo
   * okunup yazılamıyorsa (dolu, yazma kapalı) yeni açılan hesap ve bekleyen
   * gönderim bu oturumda kaybolmasın (Codex #80). Depo çalışırken depo esas:
   * öbür sekmelerin yazdıkları görülüyor.
   */
  const unsaved = new Set<string>();

  const read = (key: string): string | null => {
    if (!options.storage || unsaved.has(key)) return memory.get(key) ?? null;
    try {
      return options.storage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  };
  const write = (key: string, value: string | null): void => {
    memory.set(key, value);
    try {
      if (value === null) options.storage?.removeItem(key);
      else options.storage?.setItem(key, value);
      unsaved.delete(key);
    } catch {
      // Depo kapalı ya da dolu: bu oturumda bellekte.
      unsaved.add(key);
    }
  };
  const parse = <T>(key: string): T | null => {
    try {
      const raw = read(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };

  /** Hesap yalnızca bu sunucu için (adres değiştiyse yok sayılıyor). */
  const account = (): Account | null => {
    const stored = parse<Account>(ACCOUNT_KEY);
    return stored && stored.url === url && typeof stored.id === 'string' && typeof stored.token === 'string' ? stored : null;
  };

  /** `auth`: `true` depodaki hesap; bir hesap verilirse o (gönderim, açtığı hesapla). */
  async function call(path: string, init: { method?: string; body?: unknown; auth?: boolean | Account } = {}): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const me = init.auth === true ? account() : init.auth || null;
    if (me) headers.authorization = `Bearer ${me.id}.${me.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await options.fetch(`${url}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      let body: Record<string, unknown> = {};
      try {
        const parsed = (await response.json()) as unknown;
        if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
      } catch {
        // gövdesiz ya da JSON değil
      }
      return { status: response.status, body };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureAccount(): Promise<Account | SendOutcome> {
    const existing = account();
    if (existing) return existing;
    const reply = await call('/v1/seed/players', { method: 'POST' });
    if (!reply) return 'offline';
    if (reply.status === 429) return 'busy';
    const { id, token } = reply.body;
    if (reply.status !== 201 || typeof id !== 'string' || typeof token !== 'string') return 'error';
    // Bu arada öbür sekme hesap açtıysa onunki: tarayıcı tek hesap tutuyor, koşu
    // tarayıcının erişemediği bir hesapta kalmasın (Codex #80). Bizimki boş kalıyor.
    const meanwhile = account();
    if (meanwhile) return meanwhile;
    const created: Account = { url, id, token };
    write(ACCOUNT_KEY, JSON.stringify(created));
    return created;
  }

  async function send(code: string, retried = false): Promise<SendOutcome> {
    const me = await ensureAccount();
    if (typeof me === 'string') return me;
    const reply = await call('/v1/seed/runs', { method: 'POST', body: { code }, auth: me });
    if (!reply) return 'offline';
    if (reply.status === 201) return 'saved';
    if (reply.status === 200 && reply.body.outcome === 'kept-better') return 'kept-better';
    if (reply.status === 401) {
      // Hesap sunucuda yok (başka sekmeden silindi): bir kez yenisiyle. Depodaki
      // başka bir hesapsa (öbür sekme açtı) ona dokunulmuyor.
      if (account()?.id === me.id) write(ACCOUNT_KEY, null);
      return retried ? 'error' : send(code, true);
    }
    if (reply.status === 400 && reply.body.error === 'name-blocked') return 'name-blocked';
    if (reply.status === 409 && reply.body.error === 'week') return 'closed';
    if (reply.status === 429) return 'busy';
    return 'error';
  }

  const pending = (): Pending[] => (parse<Pending[]>(PENDING_KEY) ?? []).filter((item) => item && item.url === url && typeof item.code === 'string');

  function queue(weekId: string, code: string): void {
    const items = [...pending().filter((item) => item.code !== code), { url, weekId, code }].slice(-PENDING_MAX);
    write(PENDING_KEY, JSON.stringify(items));
  }

  let flushing: Promise<void> | null = null;
  let again = false;
  /** Bekleyen gönderimler: bağlantı ya da yoğunluk yüzünden gidemeyen kalıyor, gerisi (gitti ya da kesin ret) düşüyor. */
  function flushPending(): Promise<void> {
    // İş sürerken gelen istek (ör. bağlantı geldi) bir tur daha: süren tur bağlantısızken başlamış olabilir.
    if (flushing) {
      again = true;
      return flushing;
    }
    const run = (async () => {
      do {
        again = false;
        for (const item of pending()) {
          const outcome = await send(item.code);
          if (outcome === 'offline' || outcome === 'busy') continue;
          write(PENDING_KEY, JSON.stringify(pending().filter((other) => other.code !== item.code)));
        }
      } while (again);
    })();
    // İşaret iş bitince kalkıyor. Kuyruk boşken iş hemen bitiyor: işareti
    // işin içinden kaldırmak atamadan önce olurdu ve işaret takılı kalırdı.
    flushing = run;
    const clear = () => {
      if (flushing === run) flushing = null;
    };
    void run.then(clear, clear);
    return run;
  }

  const codes = new Map<string, Promise<string>>();
  /** Bir satırın kodu; aynı anda iki istek tek indirme. */
  function loadCode(key: string): Promise<string> {
    let promise = codes.get(key);
    if (!promise) {
      promise = call(`/v1/seed/codes/${key}`).then((reply) => {
        if (reply?.status === 200 && typeof reply.body.code === 'string') return reply.body.code;
        throw new Error('code');
      });
      codes.set(key, promise);
      // Doğrulanan kodun sonucu önbellekte; kodun kendisi bellekte tutulmuyor.
      void promise.then(
        () => codes.delete(key),
        () => codes.delete(key),
      );
    }
    return promise;
  }

  function toEntry(raw: unknown): LeagueEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const { id, weekId, companyName, ceoId, score, curve, submittedAt, codeKey, mine } = row;
    if (typeof id !== 'string' || typeof weekId !== 'string' || typeof companyName !== 'string' || typeof score !== 'number') return null;
    if (typeof codeKey !== 'string' || !/^[0-9a-f]{64}$/.test(codeKey)) return null;
    return {
      id,
      weekId,
      companyName: companyName.slice(0, 40),
      ceoId: typeof ceoId === 'string' ? ceoId : null,
      score,
      curve: Array.isArray(curve) ? curve.filter((value): value is number => typeof value === 'number') : [],
      code: '',
      codeKey,
      loadCode: () => loadCode(codeKey),
      submittedAt: typeof submittedAt === 'string' ? submittedAt : '',
      mine: mine === true,
    };
  }

  const tables = new Map<string, LeagueEntry[]>();
  /** Sayfa bağlantısız yeniden açıldıysa bellekte tablo yok: depodaki son görülen. */
  const storedTable = (weekId: string): LeagueEntry[] | null => {
    const stored = parse<StoredTable>(TABLE_KEY);
    if (!stored || stored.url !== url || stored.weekId !== weekId || !Array.isArray(stored.rows)) return null;
    return stored.rows.map(toEntry).filter((entry): entry is LeagueEntry => entry !== null);
  };
  const active = new Set<() => Promise<void>>();
  const refreshAll = () => active.forEach((refresh) => void refresh());
  /**
   * Bekleyen gönderim tablo açık olmasa da gidiyor: sunucu tanınınca ve
   * bağlantı gelince. Bağlantısızken gönderip serbest oyuna geçen oyuncunun
   * koşusu bir sonraki lig koşusunu beklemesin.
   */
  let listening = false;
  const listen = () => {
    if (listening) return;
    listening = true;
    options.online?.addEventListener('online', () => void flushPending().then(refreshAll));
    if (pending().length > 0) void flushPending().then(refreshAll);
  };

  return {
    kind: 'server',

    async probe() {
      const reply = await call('/v1/health');
      if (!reply || reply.status >= 500) {
        // Görülmüş sunucu bağlantısız açılışta da seçiliyor: bekleyen gönderim bağlantı gelince gitsin (Codex #80).
        if (read(SEEN_KEY) === url) listen();
        return 'offline';
      }
      const ok = reply.status === 200 && typeof reply.body.seed === 'number' && reply.body.seed >= 1;
      write(SEEN_KEY, ok ? url : null);
      // Dinleme yalnız kullanılacak tabloda: tanınmayan sunucunun tablosu atılıyor.
      if (ok) listen();
      return ok ? 'ok' : 'old';
    },

    seen: () => read(SEEN_KEY) === url,

    subscribe(weekId, onChange: (entries: LeagueEntry[], info?: LeagueFeedInfo) => void) {
      let stopped = false;
      let sequence = 0;
      const refresh = async () => {
        const mine = ++sequence;
        await flushPending();
        const reply = await call(`/v1/seed/weeks/${encodeURIComponent(weekId)}`, { auth: true });
        // Sonradan başlayan tazeleme önce bittiyse eskisinin cevabı yazılmıyor.
        if (stopped || mine !== sequence) return;
        if (reply?.status === 200 && Array.isArray(reply.body.entries)) {
          const entries = reply.body.entries.map(toEntry).filter((entry): entry is LeagueEntry => entry !== null);
          tables.set(weekId, entries);
          write(TABLE_KEY, JSON.stringify({ url, weekId, rows: reply.body.entries } satisfies StoredTable));
          onChange(entries, {});
        } else {
          onChange(tables.get(weekId) ?? [], { offline: true });
        }
      };
      active.add(refresh);
      const cached = tables.get(weekId) ?? storedTable(weekId);
      if (cached) {
        tables.set(weekId, cached);
        onChange(cached, {});
      }
      void refresh();
      const visible = () => options.visibility?.visible() ?? true;
      const timer = setInterval(() => {
        if (visible()) void refresh();
      }, pollMs);
      const onOnline = () => void refresh();
      const onVisibility = () => {
        if (visible()) void refresh();
      };
      options.online?.addEventListener('online', onOnline);
      options.visibility?.target.addEventListener('visibilitychange', onVisibility);
      return () => {
        stopped = true;
        active.delete(refresh);
        clearInterval(timer);
        options.online?.removeEventListener('online', onOnline);
        options.visibility?.target.removeEventListener('visibilitychange', onVisibility);
      };
    },

    async submit(entry) {
      const outcome = await send(entry.code);
      if (outcome === 'offline') {
        queue(entry.weekId, entry.code);
        return 'queued';
      }
      if (outcome === 'saved' || outcome === 'kept-better') refreshAll();
      return outcome;
    },

    account: {
      exists: () => account() !== null,
      async forget() {
        if (!account()) return true;
        const reply = await call('/v1/players/me', { method: 'DELETE', auth: true });
        // 401: hesap sunucuda zaten yok.
        if (!reply || (reply.status !== 200 && reply.status !== 401)) return false;
        write(ACCOUNT_KEY, null);
        write(PENDING_KEY, null);
        // Depodaki tablo silinen satırı "benim" diye taşımasın.
        write(TABLE_KEY, null);
        refreshAll();
        return true;
      },
    },
  };
}
