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
  /** Koşu gönderiminin zaman aşımı (ms): sunucu koşuyu yeniden oynatıyor. */
  submitTimeoutMs?: number;
  /** Yoğunluğa (429) takılan bekleyen gönderimin ilk yeniden denemesi (ms); her seferinde iki katı. */
  retryMs?: number;
}

export interface ServerBoard extends LeagueBoard {
  kind: 'server';
  /** Sunucu ayakta ve bu sürümde mi (sağlık ucunda `seed`, `verify` ve `daily`)? */
  probe(): Promise<'ok' | 'old' | 'offline'>;
  /** Bu tarayıcı sunucuyu daha önce çalışırken gördü mü (bağlantısız açılışta da sunucu tablosu kalsın)? */
  seen(): boolean;
}

const ACCOUNT_KEY = 'capitalforge.league.account';
const PENDING_KEY = 'capitalforge.league.pending';
const SEEN_KEY = 'capitalforge.league.server';
/**
 * Bir sekme hesabı siliyor (Codex #80): silme isteğinden depo temizlenene
 * kadar öbür sekmeler 401'de yeni hesap açmasın. Çöken sekmenin işareti bir
 * dakika sonra yok sayılıyor.
 */
const FORGET_KEY = 'capitalforge.league.forgetting';
/**
 * İki sekmenin aynı anda açtığı hesaplardan kaybedeni (Codex #80): silme
 * ulaşamadıysa anahtarı burada, sonraki işte yeniden siliniyor.
 */
const ORPHAN_KEY = 'capitalforge.league.orphans';
const ORPHAN_MAX = 10;
const FORGET_TTL_MS = 60_000;
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
  /** Kuyruğa girdiği andaki hesap: silinen hesabın koşusu öbür sekmenin hesabıyla gitmesin (Codex #80). */
  account?: string;
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

/**
 * Depoya geçemeyen yazımların bellekteki kopyası: tablo başına değil, depo
 * başına (sayfa boyunca). Oyun ekranı her açılışta yeni tablo kuruyor; kopya
 * tablonun içinde olsaydı menüye dönen oyuncunun hesabı ve bekleyen koşusu
 * kaybolurdu (Codex #80).
 */
interface Fallback {
  memory: Map<string, string | null>;
  /** Son yazımı depoya geçemeyen anahtarlar: okuma onlarda bellekten. */
  unsaved: Set<string>;
}
const NO_STORAGE = {};
const fallbacks = new WeakMap<object, Fallback>();
function fallbackFor(storage: object | null): Fallback {
  const key = storage ?? NO_STORAGE;
  let found = fallbacks.get(key);
  if (!found) {
    found = { memory: new Map(), unsaved: new Set() };
    fallbacks.set(key, found);
  }
  return found;
}

/** Sağlık ucunun sürüm işareti (`seed`, `verify`, `daily`) var ve en az 1 mi? */
function atLeastOne(value: unknown): boolean {
  return typeof value === 'number' && value >= 1;
}

/** Tablonun ucu (Tur 53): günün koşusu ("2026-10-22") ayrı uçta, hafta ("2026-W43") eskisinde. */
function boardPath(id: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(id) ? '/v1/seed/days' : '/v1/seed/weeks';
}

export function createServerBoard(options: ServerBoardOptions): ServerBoard {
  const { url } = options;
  const pollMs = options.pollMs ?? 60_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  // Koşu gönderimi daha uzun: sunucu koşuyu yeniden oynatıyor (Tur 52, ~1–3 sn).
  const submitTimeoutMs = options.submitTimeoutMs ?? 30_000;
  // Sunucu aynı hesaptan iki gönderim arasında 30 sn istiyor (SEED.minGapMs).
  const retryMs = options.retryMs ?? 31_000;
  /**
   * Depo okunup yazılamıyorsa (dolu, yazma kapalı) yeni açılan hesap ve
   * bekleyen gönderim bu oturumda bellekte (Codex #80). Depo çalışırken depo
   * esas: öbür sekmelerin yazdıkları görülüyor.
   */
  const { memory, unsaved } = fallbackFor(options.storage);

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
  async function call(path: string, init: { method?: string; body?: unknown; auth?: boolean | Account; timeout?: number } = {}): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const me = init.auth === true ? account() : init.auth || null;
    if (me) headers.authorization = `Bearer ${me.id}.${me.token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeout ?? timeoutMs);
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

  const orphans = (): Account[] => (parse<Account[]>(ORPHAN_KEY) ?? []).filter((item) => item && item.url === url && typeof item.id === 'string');

  /** Hesabı sunucudan sil; sunucu silindi ya da zaten yok dediyse `true`. */
  async function drop(target: Account): Promise<boolean> {
    const reply = await call('/v1/players/me', { method: 'DELETE', auth: target });
    return reply !== null && (reply.status === 200 || reply.status === 401);
  }

  /** Silinemeyen artık hesaplar yeniden deneniyor (sunucu tanınınca). */
  async function sweepOrphans(): Promise<void> {
    for (const orphan of orphans()) {
      if (await drop(orphan)) write(ORPHAN_KEY, JSON.stringify(orphans().filter((item) => item.id !== orphan.id)));
    }
  }

  async function ensureAccount(): Promise<Account | SendOutcome> {
    const existing = account();
    if (existing) return existing;
    const reply = await call('/v1/seed/players', { method: 'POST' });
    if (!reply) return 'offline';
    if (reply.status === 429) {
      // Saatlik hesap sınırı: gönderimdeki gibi sunucunun söylediği süreden önce değil (Codex #80).
      noteRetry(reply.body.retryAfter);
      return 'busy';
    }
    if (reply.status >= 500) return 'busy';
    const { id, token } = reply.body;
    if (reply.status !== 201 || typeof id !== 'string' || typeof token !== 'string') return 'error';
    // Bu arada öbür sekme hesap açtıysa onunki: tarayıcı tek hesap tutuyor, koşu
    // tarayıcının erişemediği bir hesapta kalmasın (Codex #80). Bizim açtığımız
    // siliniyor: anahtarını kimse tutmayacak, sunucuda boşuna kalmasın.
    const meanwhile = account();
    if (meanwhile) {
      const orphan: Account = { url, id, token };
      // Silme ulaşamazsa anahtar kaybolmasın: saklanıp sonra yeniden deneniyor.
      if (!(await drop(orphan))) write(ORPHAN_KEY, JSON.stringify([...orphans(), orphan].slice(-ORPHAN_MAX)));
      return meanwhile;
    }
    const created: Account = { url, id, token };
    write(ACCOUNT_KEY, JSON.stringify(created));
    return created;
  }

  /**
   * Hesap siliniyor: yeni gönderim başlamıyor, süren gönderimler bekleniyor.
   * Yoksa silmeyle yarışan gönderim 401 alıp yeni hesap açıyor ve koşuyu
   * oyuncunun "sildim" dediği verinin yerine yazıyordu (Codex #80).
   */
  let forgetting = false;
  const inflight = new Set<Promise<SendOutcome>>();
  /** Yoğunluk cevabının "şu kadar sonra dene" son tarihi (ms, saat): süre değil, geçen zaman düşülsün (Codex #80). */
  let retryAt = 0;
  /** Sunucu ne zaman yeniden denenebileceğini söylüyor (saatlik sınırda saatin sonu). */
  function noteRetry(after: unknown): void {
    if (typeof after === 'number' && after > 0) retryAt = Math.max(retryAt, Date.now() + after * 1000);
  }

  /** Herhangi bir sekme bu hesabı siliyor mu (işaret tazeyse). */
  function deleting(id: string): boolean {
    const mark = parse<{ url: string; id: string; at: number }>(FORGET_KEY);
    return !!mark && mark.url === url && mark.id === id && Date.now() - mark.at < FORGET_TTL_MS;
  }

  /**
   * Bir gönderimin hesabı. `owner`: koşu yalnız bu hesapla gidiyor (bekleyen
   * koşunun kuyruğa girdiği, doğrudan gönderimin başladığı andaki hesap).
   * `direct`: oyuncunun kendi gönderimi; hesap sunucuda yoksa (başka yerden
   * silindi) bir kez yenisiyle. `used`: son denemenin hesabı.
   */
  interface Attempt {
    owner?: string;
    direct?: boolean;
    used?: string;
  }

  function send(code: string, attempt: Attempt = {}): Promise<SendOutcome> {
    if (forgetting) return Promise.resolve('error');
    const promise = sendOnce(code, false, attempt);
    inflight.add(promise);
    const done = () => void inflight.delete(promise);
    void promise.then(done, done);
    return promise;
  }

  async function sendOnce(code: string, retried: boolean, attempt: Attempt): Promise<SendOutcome> {
    const { owner } = attempt;
    // Koşu yalnız kendi hesabıyla: o hesap gittiyse ya da değiştiyse koşu
    // düşüyor, başka hesapla yeniden yayımlanmıyor (Codex #80).
    if (owner !== undefined && account()?.id !== owner) return 'error';
    const me = await ensureAccount();
    if (typeof me === 'string') return me;
    attempt.used = me.id;
    // Hesapsız kuyruğa giren koşu açılan hesaba bağlanıyor: istek kopsa da sonra
    // yalnız bu hesapla gitsin (Codex #80).
    if (owner === undefined) bindPending(code, me.id);
    const reply = await call('/v1/seed/runs', { method: 'POST', body: { code }, auth: me, timeout: submitTimeoutMs });
    if (!reply) return 'offline';
    // Gönderim geçti: eski "şu kadar sonra dene" süresi artık geçerli değil (Codex #80).
    if (reply.status === 201 || (reply.status === 200 && reply.body.outcome === 'kept-better')) retryAt = 0;
    if (reply.status === 201) return 'saved';
    if (reply.status === 200 && reply.body.outcome === 'kept-better') return 'kept-better';
    if (reply.status === 401) {
      // Hesap sunucuda yok. Depoda hâlâ bu hesap varsa ve hiçbir sekme onu
      // silmiyorsa (başka yerden silindi) oyuncunun gönderimi bir kez yenisiyle.
      // Bir sekme siliyorsa, sildiyse ya da depoda başka hesap varsa yenisi
      // açılmıyor: koşu oyuncunun sildiği hesabın yerine yazılmasın (Codex #80).
      // Bekleyen koşu yalnız kendi hesabıyla.
      const stillMine = account()?.id === me.id;
      if (stillMine) write(ACCOUNT_KEY, null);
      const renew = !retried && !forgetting && stillMine && !deleting(me.id) && (owner === undefined || attempt.direct === true);
      if (!renew) return 'error';
      // Yeni hesapla: koşu ona bağlanıyor (hesap açılamazsa hesapsız kuyruğa).
      attempt.owner = undefined;
      attempt.used = undefined;
      return sendOnce(code, true, attempt);
    }
    if (reply.status === 400 && reply.body.error === 'name-blocked') return 'name-blocked';
    if (reply.status === 409 && reply.body.error === 'week') return 'closed';
    // Tur 52: sunucu koşuyu yeniden oynatıyor. Başka sürümün koşusu bekliyor
    // (sunucu ya da oyun güncellenince gidiyor); tutmayan ve kopya koşu düşüyor.
    if (reply.status === 409 && reply.body.error === 'sim') return 'version';
    if (reply.status === 409 && reply.body.error === 'copy') return 'copy';
    if (reply.status === 422 && reply.body.error === 'replay') return 'rejected';
    if (reply.status === 429) {
      noteRetry(reply.body.retryAfter);
      return 'busy';
    }
    // Sunucunun geçici hatası: kesin ret değil, bekleyen koşu kuyrukta kalıp yeniden deneniyor (Codex #80).
    if (reply.status >= 500) return 'busy';
    return 'error';
  }

  const pending = (): Pending[] => (parse<Pending[]>(PENDING_KEY) ?? []).filter((item) => item && item.url === url && typeof item.code === 'string');

  /** Hesapsız bekleyen koşuya hesabını yaz. */
  function bindPending(code: string, owner: string): void {
    const items = pending();
    if (!items.some((item) => item.code === code && item.account === undefined)) return;
    write(PENDING_KEY, JSON.stringify(items.map((item) => (item.code === code && item.account === undefined ? { ...item, account: owner } : item))));
  }

  function queue(weekId: string, code: string, owner: string | undefined): void {
    const items = [...pending().filter((item) => item.code !== code), { url, weekId, code, ...(owner ? { account: owner } : {}) }].slice(-PENDING_MAX);
    write(PENDING_KEY, JSON.stringify(items));
  }

  let flushing: Promise<void> | null = null;
  let again = false;
  /**
   * Yoğunluğa takılan ya da isteği kopan bekleyen gönderim kendiliğinden
   * yeniden deneniyor: art arda iki koşu bağlantı gelince gönderilince
   * ikincisi 30 sn aralığa takılıyordu ve serbest oyunda bir sonraki olaya
   * kadar bekliyordu (Codex #80). Aralık 31 sn'den başlayıp beş kez ikiye
   * katlanıyor; sonra o seyrek aralıkla (~16 dk) sürüyor: uzun bir sunucu
   * kesintisinde de koşu bir sonraki olayı beklemeden gidiyor (Codex #80).
   */
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  const RETRY_DOUBLINGS = 5;
  function retryLater(): void {
    if (retryTimer !== null || closed) return;
    // Sunucunun söylediği süreden önce değil: saatlik sınır geri çekilmeden uzun sürebiliyor.
    const delay = Math.max(retryMs * 2 ** Math.min(retries, RETRY_DOUBLINGS), retryAt - Date.now());
    retryAt = 0;
    retries++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flushPending().then(refreshAll);
    }, delay);
  }
  /** Bekleyen gönderimler: bağlantı ya da yoğunluk yüzünden gidemeyen kalıyor, gerisi (gitti ya da kesin ret) düşüyor. */
  function flushPending(): Promise<void> {
    // İş sürerken gelen istek (ör. bağlantı geldi) bir tur daha: süren tur bağlantısızken başlamış olabilir.
    if (flushing) {
      again = true;
      return flushing;
    }
    const run = (async () => {
      let kept = false;
      do {
        again = false;
        kept = false;
        for (const item of pending()) {
          // Hesap silinirken kuyruk olduğu gibi kalıyor (silme başarısız olursa da).
          if (forgetting) return;
          const attempt: Attempt = { owner: item.account };
          const outcome = await send(item.code, attempt);
          // Kalan koşu yeniden deneniyor: yoğunluk da, kopan istek de. Tarayıcı
          // çevrimiçiyken yol kopabiliyor (DNS, zaman aşımı); yol açılınca
          // `online` olayı gelmiyor (Codex #80).
          if (outcome === 'offline' || outcome === 'busy' || outcome === 'version') {
            kept = true;
            continue;
          }
          // Yalnız bu girdi (hesapsızsa gönderimde bağlandığı hesapla): beklerken öbür
          // sekme aynı koşuyu başka hesapla kuyruğa koyduysa o kalıyor (Codex #80).
          const mine = (other: Pending) =>
            other.code === item.code && (other.account === item.account || (item.account === undefined && other.account === attempt.used));
          write(PENDING_KEY, JSON.stringify(pending().filter((other) => !mine(other))));
        }
      } while (again && !forgetting);
      if (kept) retryLater();
      else retries = 0;
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
    const { id, weekId, companyName, ceoId, score, curve, submittedAt, codeKey, mine, verified, idle } = row;
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
      // Sunucu gönderimde yeniden oynattı (Tur 52); eski sunucunun satırlarını tarayıcı doğruluyor.
      verified: verified === true,
      idle: idle === true,
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
  let closed = false;
  const onOnline = () => void flushPending().then(refreshAll);
  const listen = () => {
    if (listening || closed) return;
    listening = true;
    options.online?.addEventListener('online', onOnline);
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
      // Tur 51'in sunucusu (`verify` yok) koşuyu doğrulamıyor, eski tabloya
      // yazıyor; Tur 52 gelince o koşular görünmez olurdu (Codex #81). Tur
      // 52'ninki (`daily` yok) günün koşusunu tanımıyor ve haftanın kuralı
      // olmadan oynatıyor: o da eski (Tur 53).
      const ok = reply.status === 200 && atLeastOne(reply.body.seed) && atLeastOne(reply.body.verify) && atLeastOne(reply.body.daily);
      write(SEEN_KEY, ok ? url : null);
      // Dinleme yalnız kullanılacak tabloda: tanınmayan sunucunun tablosu atılıyor.
      if (ok) listen();
      if (ok) void sweepOrphans();
      return ok ? 'ok' : 'old';
    },

    seen: () => read(SEEN_KEY) === url,

    // Oyun ekranı her açılışta yeni tablo kuruyor: eskisi dinlemeyi bırakmazsa
    // her bağlantıda o da aynı bekleyen kuyruğu göndermeye kalkardı (Codex #80).
    close() {
      closed = true;
      if (listening) options.online?.removeEventListener('online', onOnline);
      listening = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    },

    subscribe(weekId, onChange: (entries: LeagueEntry[], info?: LeagueFeedInfo) => void) {
      let stopped = false;
      let sequence = 0;
      const refresh = async () => {
        const mine = ++sequence;
        await flushPending();
        const reply = await call(`${boardPath(weekId)}/${encodeURIComponent(weekId)}`, { auth: true });
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
      // Gönderim başladığı andaki hesapla (Codex #80): yolda öbür sekme hesabı
      // silerse koşu yeni hesapla yayımlanmıyor, hesapsız kuyruğa da girmiyor.
      const attempt: Attempt = { owner: account()?.id, direct: true };
      const outcome = await send(entry.code, attempt);
      if (outcome === 'offline' || outcome === 'version') {
        // Kuyruğa denediği hesapla (hesap açılamadıysa hesapsız); o hesap bu
        // arada gittiyse ya da siliniyorsa kuyruğa girmiyor. Sürüm farkında
        // da koşu bekliyor (Tur 52): sürümler eşleşince gidiyor.
        const owner = attempt.used ?? attempt.owner;
        if (owner !== undefined && (account()?.id !== owner || deleting(owner))) return 'error';
        queue(entry.weekId, entry.code, owner);
        // Kendiliğinden yeniden deneniyor: tarayıcı çevrimiçiyken kopan istekte
        // ve sürüm farkında `online` olayı gelmiyor.
        retryLater();
        return outcome === 'version' ? 'version' : 'queued';
      }
      if (outcome === 'saved' || outcome === 'kept-better') refreshAll();
      return outcome;
    },

    account: {
      exists: () => account() !== null,
      async forget() {
        // Silinecek hesap baştaki: beklerken öbür sekme yenisini yazarsa o silinmiyor (Codex #80).
        const me = account();
        if (!me) return true;
        forgetting = true;
        write(FORGET_KEY, JSON.stringify({ url, id: me.id, at: Date.now() }));
        try {
          // Süren gönderimler önce bitiyor: koşu silinecek hesaba düşüyor ve onunla gidiyor.
          await Promise.all([...inflight]);
          await flushing;
          const reply = await call('/v1/players/me', { method: 'DELETE', auth: me });
          // 401: hesap sunucuda zaten yok.
          if (!reply || (reply.status !== 200 && reply.status !== 401)) return false;
          // Yalnız silinen hesap: öbür sekme bu arada yenisini açtıysa onun
          // anahtarı ve kuyruğu yerinde kalıyor (Codex #80).
          if (account()?.id === me.id) {
            write(ACCOUNT_KEY, null);
            write(PENDING_KEY, null);
          } else {
            // Öbür sekmenin kuyruğu kalıyor; silinen hesabın koşuları gidiyor.
            write(PENDING_KEY, JSON.stringify(pending().filter((item) => item.account !== me.id)));
          }
          // Depodaki tablo silinen satırı "benim" diye taşımasın.
          write(TABLE_KEY, null);
          refreshAll();
          return true;
        } finally {
          forgetting = false;
          if (parse<{ id: string }>(FORGET_KEY)?.id === me.id) write(FORGET_KEY, null);
        }
      },
    },
  };
}
