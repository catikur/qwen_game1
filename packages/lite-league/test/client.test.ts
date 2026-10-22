/**
 * Oyunun lig sunucusu istemcisi (`apps/web/src/league-server.ts`, Tur 51)
 * gerçek sunucuya karşı: istekler `handle`'a, veritabanı Node'un SQLite'ı.
 * Bağlantı kesilmesi `fetch`'in hata vermesiyle, eski sunucu sağlık ucunun
 * eski cevabıyla taklit ediliyor.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeRun, type LeagueRun } from '../../core/src/index';
import { createServerBoard, type ServerBoard } from '../../../apps/web/src/league-server';
import { handle } from '../src/app';
import { SEED } from '../src/seed';
import type { Db } from '../src/db';
import { memoryDb } from './sqlite';

const THURSDAY = Date.UTC(2026, 9, 15, 12);
const WEEK = '2026-W42';
const URL = 'https://lig.test';

interface Net {
  online: boolean;
  /** Eski sunucu: sağlık ucu `seed` demiyor, ana oyunun uçları yok. */
  old: boolean;
  now: number;
  requests: string[];
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function client(db: Db, net: Net, storage = memoryStorage(), online = new EventTarget()) {
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    net.requests.push(`${request.method} ${new globalThis.URL(request.url).pathname}`);
    if (!net.online) throw new TypeError('fetch failed');
    if (net.old && new globalThis.URL(request.url).pathname === '/v1/health') return Response.json({ ok: true, week: WEEK });
    if (net.old) return Response.json({ error: 'route' }, { status: 404 });
    return handle(request, db, net.now);
  }) as typeof fetch;
  // Dakikalık tazeleme testte işlemesin (Node'un zamanlayıcısı 2^31 ms'den uzununu 1 ms sayıyor).
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30 });
  return { board, storage, online };
}

function run(overrides: Partial<LeagueRun> = {}): LeagueRun {
  return {
    version: 2,
    weekId: WEEK,
    ceoId: 'bakkal_ciragi',
    companyName: 'Atilla Holding',
    score: 1_250_000,
    curve: [100_000, 180_000, 260_000],
    log: [[1, { type: 'SET_FOCUS', focus: 'growth' } as never]],
    sim: 'abcdef0123456789',
    ...overrides,
  };
}

function entryOf(value: LeagueRun) {
  return { weekId: value.weekId, companyName: value.companyName, ceoId: value.ceoId, score: value.score, curve: value.curve, code: encodeRun(value), submittedAt: '' };
}

/** Açık abonelikler: test kalsa da kapanıyor (zamanlayıcı süreci açık tutmasın). */
const subscriptions: Array<() => void> = [];
afterEach(() => subscriptions.splice(0).forEach((stop) => stop()));

/** Aboneliğin teslimatları: son hâli ve bir sonrakini bekleme. */
function watch(board: ServerBoard, week = WEEK) {
  const seen: Array<{ entries: Array<Record<string, any>>; offline: boolean }> = [];
  const waiters: Array<() => void> = [];
  const stop = board.subscribe(week, (entries, info) => {
    seen.push({ entries: entries as never, offline: info?.offline === true });
    waiters.splice(0).forEach((resolve) => resolve());
  });
  subscriptions.push(stop);
  return {
    seen,
    last: () => seen.at(-1)!,
    next: () => new Promise<void>((resolve) => waiters.push(resolve)),
    stop,
  };
}

test('istemci: sunucuyu tanıyor; eski sunucu ve bağlantısızlık ayrılıyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage } = client(db, net);
  assert.equal(board.seen(), false);
  assert.equal(await board.probe(), 'ok');
  assert.equal(board.seen(), true);
  net.online = false;
  assert.equal(await board.probe(), 'offline');
  assert.equal(board.seen(), true, 'bağlantısızlık "görüldü"yü silmiyor');
  net.online = true;
  net.old = true;
  assert.equal(await board.probe(), 'old');
  assert.equal(board.seen(), false, 'eski sürüme dönen sunucu artık sayılmıyor');
  assert.equal(storage.map.has('capitalforge.league.account'), false, 'tanımak hesap açmıyor');
});

test('istemci: ilk gönderim hesap açıyor; tablo satırı geliyor, kod ayrı iniyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage } = client(db, net);
  const feed = watch(board);
  await feed.next();
  assert.deepEqual(feed.last(), { entries: [], offline: false });
  assert.equal(board.account!.exists(), false);

  const value = run();
  const refreshed = feed.next();
  assert.equal(await board.submit(entryOf(value)), 'saved');
  await refreshed;
  assert.equal(board.account!.exists(), true);
  assert.equal(JSON.parse(storage.map.get('capitalforge.league.account')!).url, URL);
  const [row] = feed.last().entries;
  assert.equal(row!.mine, true);
  assert.equal(row!.code, '', 'tabloda kod yok');
  assert.match(row!.codeKey, /^[0-9a-f]{64}$/);
  assert.equal(await row!.loadCode(), encodeRun(value));

  // Başka bir tarayıcı aynı satırı görüyor, kendisininmiş gibi değil.
  const other = client(db, net).board;
  const otherFeed = watch(other);
  await otherFeed.next();
  assert.equal(otherFeed.last().entries.length, 1);
  assert.equal(otherFeed.last().entries[0]!.mine, false);
  assert.equal(otherFeed.last().entries[0]!.companyName, 'Atilla Holding');

  net.now += SEED.minGapMs;
  assert.equal(await board.submit(entryOf(run({ score: 10 }))), 'kept-better');
  feed.stop();
  otherFeed.stop();
});

test('istemci: bağlantı yokken gönderim bekliyor, bağlantı gelince gidiyor; son tablo gösteriliyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage, online } = client(db, net);
  const feed = watch(board);
  await feed.next();

  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  assert.equal(JSON.parse(storage.map.get('capitalforge.league.pending')!).length, 1);
  const offline = feed.next();
  online.dispatchEvent(new Event('online'));
  await offline;
  assert.deepEqual(feed.last(), { entries: [], offline: true }, 'bağlantı yok: son görülen tablo, işaretli');

  net.online = true;
  const back = feed.next();
  online.dispatchEvent(new Event('online'));
  await back;
  assert.equal(feed.last().offline, false);
  assert.equal(feed.last().entries.length, 1, 'bekleyen koşu önce gönderildi, tabloda');
  assert.equal(feed.last().entries[0]!.mine, true);
  assert.deepEqual(JSON.parse(storage.map.get('capitalforge.league.pending')!), []);
  feed.stop();
});

test('istemci: sunucunun kesin retleri; silinen hesap yenisiyle', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage } = client(db, net);
  assert.equal(await board.submit(entryOf(run({ companyName: 'Orospu AŞ' }))), 'name-blocked');
  net.now += SEED.minGapMs;
  assert.equal(await board.submit(entryOf(run({ weekId: '2026-W40' }))), 'closed');
  net.now += SEED.minGapMs;
  assert.equal(await board.submit(entryOf(run())), 'saved');
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'busy', 'aynı hesaptan 30 sn içinde');
  assert.equal(storage.map.get('capitalforge.league.pending') ?? null, null, 'kesin cevaplar beklemeye girmiyor');

  // Hesap başka sekmeden silindi: gönderim yeni hesapla.
  const before = JSON.parse(storage.map.get('capitalforge.league.account')!).id;
  await handle(new Request(`${URL}/v1/players/me`, { method: 'DELETE', headers: { authorization: `Bearer ${before}.${JSON.parse(storage.map.get('capitalforge.league.account')!).token}` } }), db, net.now);
  net.now += SEED.minGapMs;
  assert.equal(await board.submit(entryOf(run({ score: 3_000_000 }))), 'saved');
  assert.notEqual(JSON.parse(storage.map.get('capitalforge.league.account')!).id, before);
});

test('istemci: hesabı silmek koşuları da siliyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage } = client(db, net);
  const feed = watch(board);
  await feed.next();
  const saved = feed.next();
  await board.submit(entryOf(run()));
  await saved;
  assert.equal(feed.last().entries.length, 1);

  net.online = false;
  assert.equal(await board.account!.forget(), false, 'bağlantı yokken silinemiyor; anahtar kalıyor');
  assert.equal(board.account!.exists(), true);
  net.online = true;
  const emptied = feed.next();
  assert.equal(await board.account!.forget(), true);
  await emptied;
  assert.equal(board.account!.exists(), false);
  assert.equal(storage.map.has('capitalforge.league.account'), false);
  assert.deepEqual(feed.last().entries, []);
  feed.stop();
});

test('istemci: bekleyen gönderim tablo açık değilken de bağlantı gelince gidiyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const { board, storage, online } = client(db, net);
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 50 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await total(), 1, 'serbest oyuna geçen oyuncunun koşusu da gitti');
  assert.deepEqual(JSON.parse(storage.map.get('capitalforge.league.pending')!), []);
});

test('istemci: açılışta bekleyen gönderim varsa sunucu tanınınca gidiyor', async () => {
  const db = memoryDb();
  const net: Net = { online: false, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  assert.equal(await client(db, net, storage).board.submit(entryOf(run())), 'queued');
  // Sayfa yeniden açıldı, bağlantı var.
  net.online = true;
  const { board } = client(db, net, storage);
  assert.equal(await board.probe(), 'ok');
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 50 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await total(), 1);
});

test('istemci: tarayıcı deposu yazılamıyorsa (dolu, kapalı) hesap ve bekleyen gönderim bu oturumda bellekte', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  // Okunuyor ama yazılamıyor: `setItem` hata veriyor (Codex #80).
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('dolu', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  };
  const online = new EventTarget();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!net.online) throw new TypeError('fetch failed');
    return handle(new Request(input, init), db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage: full as never, online, pollMs: 2 ** 30 });
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved', 'yeni hesap hemen sonraki gönderimde bulunuyor');
  assert.equal(board.account!.exists(), true);

  net.now += SEED.minGapMs;
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const best = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).entries[0]?.score as number;
  for (let i = 0; i < 50 && (await best()) !== 2_000_000; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await best(), 2_000_000, 'bekleyen gönderim kaybolmadı');
});

test('istemci: bağlantısız yeniden açılışta son görülen tablo depodan geliyor', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const first = client(db, net, storage).board;
  assert.equal(await first.probe(), 'ok');
  assert.equal(await first.submit(entryOf(run())), 'saved');
  const seen = watch(first);
  await seen.next();
  assert.equal(seen.last().entries.length, 1);
  seen.stop();

  // Sayfa bağlantısız yeniden açıldı: yeni tablo nesnesi, aynı depo (Codex #80).
  net.online = false;
  const again = client(db, net, storage).board;
  assert.equal(await again.probe(), 'offline');
  assert.equal(again.seen(), true);
  const feed = watch(again);
  await feed.next();
  if (!feed.last().offline) await feed.next();
  assert.equal(feed.last().offline, true);
  assert.equal(feed.last().entries.length, 1, 'boş tablo değil, son görülen');
  assert.equal(feed.last().entries[0]!.companyName, 'Atilla Holding');
  assert.equal(feed.last().entries[0]!.mine, true);
});

test('istemci: iki sekme ilk gönderimi aynı anda yaparsa tek hesap; koşu tarayıcının tuttuğu hesapta (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  // İkinci sekmenin hesap açma cevabı, birinci sekme koşusunu gönderene kadar gecikiyor.
  const tab = (hold: boolean) =>
    createServerBoard({
      url: URL,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const response = await handle(request, db, net.now);
        if (hold && new globalThis.URL(request.url).pathname === '/v1/seed/players') await gate;
        return response;
      }) as typeof fetch,
      storage,
      pollMs: 2 ** 30,
    });
  const first = tab(false);
  const second = tab(true);
  const late = second.submit(entryOf(run({ companyName: 'İkinci Sekme' })));
  assert.equal(await first.submit(entryOf(run())), 'saved');
  release();
  await late;
  const stored = JSON.parse(storage.map.get('capitalforge.league.account')!);
  const table = await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`, { headers: { authorization: `Bearer ${stored.id}.${stored.token}` } }), db, net.now)).json();
  assert.equal(table.total, 1, 'tarayıcının erişemediği hesapta satır kalmıyor');
  assert.equal(table.entries[0].mine, true, 'satır tarayıcının tuttuğu hesabın');
});

test('istemci: bağlantısız açılışta görülmüş sunucu seçilince de bekleyen gönderim bağlantı gelince gidiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const first = client(db, net, storage).board;
  assert.equal(await first.probe(), 'ok');
  net.online = false;
  assert.equal(await first.submit(entryOf(run())), 'queued');

  // Sayfa bağlantısız yeniden açıldı; oyuncu serbest oyunda (tablo aboneliği yok).
  const online = new EventTarget();
  const again = client(db, net, storage, online).board;
  assert.equal(await again.probe(), 'offline');
  assert.equal(again.seen(), true);
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 50 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await total(), 1, 'bekleyen koşu gitti');
});

test('istemci: bırakılan tablo bağlantı dinleyicisini kaldırıyor, bekleyen kuyruğa dokunmuyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  // Pencere gibi: dinleyici ekle ve kaldır sayılıyor.
  class Counting extends EventTarget {
    count = 0;
    override addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
      if (args[0] === 'online') this.count++;
      super.addEventListener(...args);
    }
    override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>) {
      if (args[0] === 'online') this.count--;
      super.removeEventListener(...args);
    }
  }
  const online = new Counting();
  const old = client(db, net, storage, online).board;
  assert.equal(await old.probe(), 'ok');
  assert.equal(online.count, 1, 'tanınan sunucuda dinleme var');
  old.close?.();
  assert.equal(online.count, 0, 'bırakılınca dinleyici kalkıyor');
  assert.equal(await old.probe(), 'ok');
  assert.equal(online.count, 0, 'bırakılan tablo yeniden dinlemeye başlamıyor');

  // Yeni oyun ekranının tablosu: bağlantısız gönderim, sonra bağlantı.
  const fresh = client(db, net, storage, online).board;
  assert.equal(await fresh.probe(), 'ok');
  net.online = false;
  assert.equal(await fresh.submit(entryOf(run())), 'queued');
  net.online = true;
  const before = net.requests.length;
  online.dispatchEvent(new Event('online'));
  for (let i = 0; i < 50 && !net.requests.slice(before).includes('POST /v1/seed/runs'); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const sends = net.requests.slice(before).filter((line) => line === 'POST /v1/seed/runs').length;
  assert.equal(sends, 1, 'bekleyen koşuyu yalnız yeni tablo gönderiyor');
  assert.equal(online.count, 1);
  fresh.close?.();
});

test('istemci: hesap silinirken süren gönderim bekleniyor, 401 yeni hesap açmıyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  // Koşu gönderimi elle bırakılana kadar yolda bekliyor.
  let hold: Promise<void> | null = null;
  let release = () => {};
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new globalThis.URL(request.url).pathname;
    net.requests.push(`${request.method} ${path}`);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && path === '/v1/seed/runs' && hold) await hold;
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30 });
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved');

  // İkinci koşu bağlantısızken kuyrukta; bağlantı gelince gönderimi yolda kalıyor.
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  net.now += SEED.minGapMs + 1000;
  net.online = true;
  hold = new Promise((resolve) => (release = resolve));
  online.dispatchEvent(new Event('online'));
  for (let i = 0; i < 50 && net.requests.filter((line) => line === 'POST /v1/seed/runs').length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5));

  // Oyuncu tam o sırada hesabını siliyor.
  const forgotten = board.account!.forget();
  await new Promise((resolve) => setTimeout(resolve, 30));
  release();
  assert.equal(await forgotten, true);
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));

  const table = (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()) as { total: number };
  assert.equal(table.total, 0, 'silinen hesabın koşusu sunucuda kalmıyor');
  assert.equal(net.requests.filter((line) => line === 'POST /v1/seed/players').length, 1, 'silinirken yeni hesap açılmıyor');
  assert.equal(board.account!.exists(), false);
});

test('istemci: gönderim aralığına takılan bekleyen koşu sonra kendiliğinden yeniden deneniyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    net.requests.push(`${request.method} ${new globalThis.URL(request.url).pathname}`);
    if (!net.online) throw new TypeError('fetch failed');
    const response = await handle(request, db, net.now);
    if (response.status !== 429) return response;
    // Sunucu "30 sn sonra" diyor; testin saati elle ilerliyor, bekleme kısaltılıyor.
    return Response.json({ ...((await response.json()) as object), retryAfter: 0.05 }, { status: 429 });
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 40 });
  assert.equal(await board.probe(), 'ok');

  // Bağlantısızken iki koşu; bağlantı gelince ilki gidiyor, ikincisi 30 sn aralığa takılıyor.
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const best = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).entries[0]?.score as number | undefined;
  for (let i = 0; i < 50 && (await best()) === undefined; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await best(), 1_250_000, 'ilk koşu gitti, ikincisi aralığa takıldı');

  // Aralık geçiyor; serbest oyunda (tablo aboneliği yok), yeni bağlantı olayı olmadan.
  net.now += SEED.minGapMs + 1000;
  for (let i = 0; i < 100 && (await best()) !== 2_000_000; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await best(), 2_000_000, 'bekleyen ikinci koşu kendiliğinden gitti');
  assert.equal(storage.getItem('capitalforge.league.pending'), '[]');
  board.close?.();
});

test('istemci: yazılamayan depoda bellekteki hesap ve kuyruk yeni oyun ekranının tablosuna da geçiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('dolu', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  };
  const online = new EventTarget();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    net.requests.push(`${request.method} ${new globalThis.URL(request.url).pathname}`);
    if (!net.online) throw new TypeError('fetch failed');
    return handle(request, db, net.now);
  }) as typeof fetch;
  const open = () => createServerBoard({ url: URL, fetch: fetcher, storage: full as never, online, pollMs: 2 ** 30 });

  const first = open();
  assert.equal(await first.probe(), 'ok');
  assert.equal(await first.submit(entryOf(run())), 'saved');
  net.online = false;
  net.now += SEED.minGapMs;
  assert.equal(await first.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  // Menüye dönüldü: tablo bırakılıyor, yeni oyun ekranı yeni tablo kuruyor.
  first.close?.();
  const second = open();
  assert.equal(second.account!.exists(), true, 'hesap kaybolmadı');
  net.online = true;
  assert.equal(await second.probe(), 'ok');
  const best = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).entries[0]?.score as number;
  for (let i = 0; i < 50 && (await best()) !== 2_000_000; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await best(), 2_000_000, 'bekleyen koşu yeni tabloyla gitti');
  assert.equal(net.requests.filter((line) => line === 'POST /v1/seed/players').length, 1, 'tek hesap');
  second.close?.();
});

test('istemci: hesap silinirken öbür sekme yeni hesap açtıysa onunki silinmiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  let hold: Promise<void> | null = null;
  let release = () => {};
  let deleting = () => {};
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === 'DELETE' && hold) {
      deleting();
      await hold;
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online: new EventTarget(), pollMs: 2 ** 30 });
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved');

  // Silme yolda; öbür sekme bu arada kendi hesabını açıp depoya yazıyor.
  hold = new Promise((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (deleting = resolve));
  const forgotten = board.account!.forget();
  await started;
  const other = { url: URL, id: 'öbür-sekme', token: 'anahtar' };
  storage.setItem('capitalforge.league.account', JSON.stringify(other));
  storage.setItem('capitalforge.league.pending', JSON.stringify([{ url: URL, weekId: WEEK, code: 'öbür' }]));
  release();
  assert.equal(await forgotten, true);
  assert.deepEqual(JSON.parse(storage.getItem('capitalforge.league.account')!), other, 'öbür sekmenin hesabı yerinde');
  assert.equal(JSON.parse(storage.getItem('capitalforge.league.pending')!).length, 1, 'öbür sekmenin kuyruğu yerinde');
});

test('istemci: silme başladığı andaki hesabı siliyor; beklerken öbür sekmenin açtığı hesap ve koşusu kalıyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  let hold: Promise<void> | null = null;
  let release = () => {};
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    net.requests.push(`${request.method} ${new globalThis.URL(request.url).pathname}`);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs' && hold) await hold;
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30 });
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved');
  const a = JSON.parse(storage.getItem('capitalforge.league.account')!) as { id: string };

  // Bu sekmenin gönderimi yolda; oyuncu hesabını siliyor.
  net.now += SEED.minGapMs;
  hold = new Promise((resolve) => (release = resolve));
  const sending = board.submit(entryOf(run({ score: 2_000_000 })));
  for (let i = 0; i < 50 && net.requests.filter((line) => line === 'POST /v1/seed/runs').length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  const forgotten = board.account!.forget();

  // Silme gönderimi beklerken öbür sekme yeni hesap açıp koşusunu gönderiyor.
  const opened = (await (await handle(new Request(`${URL}/v1/seed/players`, { method: 'POST' }), db, net.now)).json()) as { id: string; token: string };
  const other = { url: URL, id: opened.id, token: opened.token };
  const posted = await handle(
    new Request(`${URL}/v1/seed/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${other.id}.${other.token}` },
      body: JSON.stringify({ code: encodeRun(run({ companyName: 'Öbür Sekme', score: 500_000 })) }),
    }),
    db,
    net.now,
  );
  assert.equal(posted.status, 201);
  storage.setItem('capitalforge.league.account', JSON.stringify(other));
  release();
  await sending;
  assert.equal(await forgotten, true);

  const table = (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()) as { entries: Array<{ companyName: string }> };
  assert.deepEqual(table.entries.map((entry) => entry.companyName), ['Öbür Sekme'], 'silinen hesabın koşusu gitti, öbür sekmeninki kaldı');
  assert.equal(JSON.parse(storage.getItem('capitalforge.league.account')!).id, other.id, 'öbür sekmenin anahtarı yerinde');
  assert.equal(await db.first('SELECT id FROM players WHERE id = ?', a.id), null, 'silme başladığı andaki hesap silindi');
});

test('istemci: sunucunun söylediği süre sonra yeniden deniyor; saatlik sınır geri çekilmeden uzun sürse de koşu gidiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  // Saatlik sınır: ~1 sn boyunca her gönderim 429; geri çekilme (40 ms'den beş kez) o süreyi doldurmuyor.
  const busyUntil = Date.now() + 1000;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs' && Date.now() < busyUntil) {
      return Response.json({ error: 'busy', retryAfter: 1 }, { status: 429 });
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 10 });
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 60 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await total(), 1, 'koşu sınır kalkınca gitti');
  board.close?.();
});

test('istemci: başarılı gönderim eski "saat sonra dene" süresini siliyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  let hourly = true;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    const runs = request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs';
    // Saatlik sınır: bir saat sonra dene.
    if (runs && hourly) return Response.json({ error: 'busy', retryAfter: 3600 }, { status: 429 });
    const response = await handle(request, db, net.now);
    if (response.status !== 429) return response;
    // 30 sn aralığı; testin saati elle ilerliyor, bekleme kısaltılıyor.
    return Response.json({ ...((await response.json()) as object), retryAfter: 0.05 }, { status: 429 });
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 20 });
  // Test kalsa da saatlik zamanlayıcı süreci açık tutmasın.
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'busy');
  // Sınır kalktı; oyuncu yeniden gönderiyor, gidiyor.
  hourly = false;
  assert.equal(await board.submit(entryOf(run())), 'saved');

  // Sonra iki bağlantısız koşu: ikincisi 30 sn aralığına takılıyor, saatlik süreye değil.
  net.now += SEED.minGapMs + 1000;
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  assert.equal(await board.submit(entryOf(run({ score: 3_000_000 }))), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const best = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).entries[0]?.score as number;
  for (let i = 0; i < 50 && (await best()) !== 2_000_000; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  net.now += SEED.minGapMs + 1000;
  for (let i = 0; i < 100 && (await best()) !== 3_000_000; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await best(), 3_000_000, 'ikinci koşu kısa aralıkla gitti');
  board.close?.();
});

test('istemci: silinen hesabın bekleyen koşuları kuyruktan gidiyor, öbür sekmeninkiler kalıyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  let hold: Promise<void> | null = null;
  let release = () => {};
  let deleting = () => {};
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'DELETE' && hold) {
      deleting();
      await hold;
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online: new EventTarget(), pollMs: 2 ** 30 });
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved');
  // Bu hesabın bağlantısızken kuyruğa giren koşusu.
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  net.online = true;

  hold = new Promise((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (deleting = resolve));
  const forgotten = board.account!.forget();
  await started;
  // Öbür sekme yeni hesabını ve kendi bekleyen koşusunu yazıyor.
  const other = { url: URL, id: 'öbür-sekme', token: 'anahtar' };
  const mine = JSON.parse(storage.getItem('capitalforge.league.pending')!) as unknown[];
  storage.setItem('capitalforge.league.account', JSON.stringify(other));
  storage.setItem('capitalforge.league.pending', JSON.stringify([...mine, { url: URL, weekId: WEEK, code: 'öbür', account: other.id }]));
  release();
  assert.equal(await forgotten, true);
  const left = JSON.parse(storage.getItem('capitalforge.league.pending')!) as Array<{ code: string }>;
  assert.deepEqual(left.map((item) => item.code), ['öbür'], 'silinen hesabın koşusu kuyruktan gitti, öbür sekmeninki kaldı');
});

test('istemci: hesap açma da yoğunluğa takılırsa sunucunun söylediği süre sonra yeniden deniyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  // IP'nin saatlik hesap sınırı: ~1 sn boyunca hesap açma 429; geri çekilme (10 ms'den beş kez) o süreyi doldurmuyor.
  const busyUntil = Date.now() + 1000;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/players' && Date.now() < busyUntil) {
      return Response.json({ error: 'busy', retryAfter: 1 }, { status: 429 });
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 10 });
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 60 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await total(), 1, 'hesap açıldı, koşu gitti');
});

test('istemci: bekleyen koşu yalnız kendi hesabıyla gidiyor; hesap silindiyse yeni hesapla yeniden yayımlanmıyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const { board, online } = client(db, net, storage);
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  assert.equal(await board.submit(entryOf(run())), 'saved');
  const a = JSON.parse(storage.getItem('capitalforge.league.account')!) as { id: string; token: string };
  net.now += SEED.minGapMs;
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');

  // Öbür sekme hesabı sunucuda sildi; cevabı daha o sekmeye ulaşmadı, depo yerinde.
  const deleted = await handle(new Request(`${URL}/v1/players/me`, { method: 'DELETE', headers: { authorization: `Bearer ${a.id}.${a.token}` } }), db, net.now);
  assert.equal(deleted.status, 200);
  const before = net.requests.length;
  net.online = true;
  online.dispatchEvent(new Event('online'));
  for (let i = 0; i < 50 && JSON.parse(storage.getItem('capitalforge.league.pending') ?? '[]').length > 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const table = (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()) as { total: number };
  assert.equal(table.total, 0, 'silinen hesabın koşusu yeni hesapla yayımlanmadı');
  assert.equal(net.requests.slice(before).filter((line) => line === 'POST /v1/seed/players').length, 0, 'yeni hesap açılmadı');
  assert.deepEqual(JSON.parse(storage.getItem('capitalforge.league.pending') ?? '[]'), [], 'koşu kuyruktan düştü');
});

test('istemci: hesapsız kuyruğa giren koşu hesap açılınca ona bağlanıyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  let runsDown = true;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    // Hesap açılıyor ama koşu isteği yolda kopuyor.
    if (runsDown && request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs') throw new TypeError('fetch failed');
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30 });
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  for (let i = 0; i < 50 && !storage.getItem('capitalforge.league.account'); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setTimeout(resolve, 30));
  const a = JSON.parse(storage.getItem('capitalforge.league.account')!) as { id: string };
  const queued = JSON.parse(storage.getItem('capitalforge.league.pending')!) as Array<{ account?: string }>;
  assert.equal(queued.length, 1, 'koşu kuyrukta');
  assert.equal(queued[0].account, a.id, 'koşu açılan hesaba bağlandı');
  runsDown = false;
});

test('istemci: "şu kadar sonra dene" süresi son tarih olarak tutuluyor; eski uzun süre yenisini ezmiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  const hints = [1.5, 0.05];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs' && hints.length > 0) {
      return Response.json({ error: 'busy', retryAfter: hints.shift() }, { status: 429 });
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 10 });
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  // Doğrudan gönderim "1,5 sn sonra" cevabı alıyor; süre neredeyse doluyor.
  assert.equal(await board.submit(entryOf(run())), 'busy');
  await new Promise((resolve) => setTimeout(resolve, 1450));
  // Bekleyen koşu "0,05 sn sonra" cevabı alıyor: eski sürenin kalanı kadar beklenmeli, baştan 1,5 sn değil.
  net.online = false;
  assert.equal(await board.submit(entryOf(run({ score: 2_000_000 }))), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 40 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await total(), 1, 'koşu sunucunun yeni süresiyle gitti');
});

test('istemci: sunucunun geçici hatasında (5xx) bekleyen koşu kuyrukta kalıyor ve sonra gidiyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  let failures = 2;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs' && failures > 0) {
      failures--;
      return Response.json({ error: 'internal' }, { status: 503 });
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 10 });
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 50 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await total(), 1, 'geçici hatadan sonra koşu gitti');
});

test('istemci: sunucu uzun süre hata verse de bekleyen koşu seyrek aralıkla denenmeye devam ediyor (Codex #80)', async () => {
  const db = memoryDb();
  const net: Net = { online: true, old: false, now: THURSDAY, requests: [] };
  const storage = memoryStorage();
  const online = new EventTarget();
  // İkiye katlanan beş denemeden uzun bir kesinti; bağlantı hiç gitmiyor, yeni `online` olayı yok.
  let failures = 9;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (!net.online) throw new TypeError('fetch failed');
    if (request.method === 'POST' && new globalThis.URL(request.url).pathname === '/v1/seed/runs' && failures > 0) {
      failures--;
      return Response.json({ error: 'internal' }, { status: 503 });
    }
    return handle(request, db, net.now);
  }) as typeof fetch;
  const board = createServerBoard({ url: URL, fetch: fetcher, storage, online, pollMs: 2 ** 30, retryMs: 2 });
  subscriptions.push(() => board.close?.());
  assert.equal(await board.probe(), 'ok');
  net.online = false;
  assert.equal(await board.submit(entryOf(run())), 'queued');
  net.online = true;
  online.dispatchEvent(new Event('online'));
  const total = async () => (await (await handle(new Request(`${URL}/v1/seed/weeks/${WEEK}`), db, net.now)).json()).total as number;
  for (let i = 0; i < 150 && (await total()) === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(failures, 0, 'kesinti boyunca denemeler sürdü');
  assert.equal(await total(), 1, 'kesinti bitince koşu gitti');
});
