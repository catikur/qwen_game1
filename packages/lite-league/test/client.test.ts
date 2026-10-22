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
