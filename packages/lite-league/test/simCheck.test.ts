/**
 * Canlı denetimin simülasyon adımı (Tur 71): sunucunun izi deponunkiyle
 * karşılaştırılıyor. Sahte sunucu gerçek işleyici (`handle`), ağ yok.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simFingerprint } from '../../core/src/league';
import { handle, type Options } from '../src/app';
import { APPLE_ATTEST } from '../src/attest';
import { simCheck, simReport } from '../scripts/simCheck';
import { memoryDb } from './sqlite';
import { TEST_SIM, TRUSTING } from './trust';

const THURSDAY = Date.UTC(2026, 9, 15, 12);
const OTHER_SIM = 'fedcba9876543210';

/** `fetch` yerine işleyicinin kendisi; `path` verilirse istek o yola gidiyor. */
function server(options: Options = TRUSTING, path?: string): typeof fetch {
  const db = memoryDb();
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (path) url.pathname = path;
    return handle(new Request(url, init), db, THURSDAY, options);
  }) as typeof fetch;
}

test('sim ucu: sunucunun izi herkese açık ve önbelleksiz; sahte iz yokken oyunun motoru', async () => {
  const fake = await server()('https://lig.test/v1/seed/sim');
  assert.equal(fake.status, 200);
  assert.deepEqual(await fake.json(), { sim: TEST_SIM });
  assert.equal(fake.headers.get('cache-control'), 'no-store');
  // Koşuları yargılayan izin aynısı (`submitRun` ile aynı `SERVER_REPLAY`).
  const real = await server({ attest: APPLE_ATTEST })('https://lig.test/v1/seed/sim');
  assert.deepEqual(await real.json(), { sim: simFingerprint() });
});

test('sim ucu: IP başına saatte 30 (Codex); iz soğuk kopyada pahalı', async () => {
  const db = memoryDb();
  const ask = (ip: string) => handle(new Request('https://lig.test/v1/seed/sim', { headers: { 'cf-connecting-ip': ip } }), db, THURSDAY, TRUSTING);
  for (let i = 0; i < 30; i++) assert.equal((await ask('203.0.113.7')).status, 200, `${i + 1}. istek`);
  const busy = await ask('203.0.113.7');
  assert.equal(busy.status, 429);
  assert.ok(Number((await busy.json()).retryAfter) > 0, 'ne zaman yeniden deneneceği söyleniyor');
  assert.equal((await ask('198.51.100.4')).status, 200, 'başka IP etkilenmiyor');
});

test('simülasyon denetimi: aynı, farklı, eski sunucu, okunamayan', async () => {
  assert.deepEqual(await simCheck('https://lig.test', TEST_SIM, server()), { status: 'same', live: TEST_SIM });
  assert.deepEqual(await simCheck('https://lig.test/', OTHER_SIM, server()), { status: 'different', live: TEST_SIM });
  // Tur 71'den eski sunucu bu yolu tanımıyor ve kimlik soruyor: tanımadığı başka bir yol gibi.
  const old = server(TRUSTING, '/v1/seed/bilinmeyen');
  assert.equal((await old('https://lig.test/v1/seed/sim')).status, 401);
  assert.deepEqual(await simCheck('https://lig.test', TEST_SIM, old), { status: 'old' });
  const down = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.equal((await simCheck('https://lig.test', TEST_SIM, down)).status, 'unreachable');
  const page = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
  assert.equal((await simCheck('https://lig.test', TEST_SIM, page)).status, 'unreachable');
  const failing = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  assert.deepEqual(await simCheck('https://lig.test', TEST_SIM, failing), { status: 'unreachable', detail: 'HTTP 503' });
});

test('simülasyon denetimi: az önce dağıtıldıysa yeni sürümü bekliyor', async () => {
  const fresh = server();
  let calls = 0;
  // İlk iki istek henüz eski sürüme düşüyor.
  const rolling = (async (input: string | URL | Request, init?: RequestInit) => (++calls <= 2 ? new Response('{}', { status: 401 }) : fresh(input, init))) as typeof fetch;
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);
  assert.deepEqual(await simCheck('https://lig.test', TEST_SIM, rolling, { attempts: 5, delayMs: 10, sleep }), { status: 'same', live: TEST_SIM });
  assert.deepEqual(waits, [10, 10], 'aynı iz gelince bekleme bitiyor');
  waits.length = 0;
  assert.deepEqual(await simCheck('https://lig.test', OTHER_SIM, server(), { attempts: 3, delayMs: 10, sleep }), { status: 'different', live: TEST_SIM });
  assert.equal(waits.length, 2, 'fark sürerse bütün denemeler');
});

test('simülasyon denetimi: main\'de eski sunucu hata, PR\'da uyarı; okunamayan her yerde hata', () => {
  const same = simReport({ status: 'same', live: TEST_SIM }, TEST_SIM, true);
  assert.equal(same.code, 0);
  assert.ok(!same.line.startsWith('::'), same.line);
  for (const result of [{ status: 'different', live: OTHER_SIM }, { status: 'old' }] as const) {
    const strict = simReport(result, TEST_SIM, true);
    assert.equal(strict.code, 1);
    assert.ok(strict.line.startsWith('::error::'), strict.line);
    assert.match(strict.line, /Run workflow/, 'nasıl güncelleneceğini söylüyor');
    const pr = simReport(result, TEST_SIM, false);
    assert.equal(pr.code, 0);
    assert.ok(pr.line.startsWith('::warning::'), pr.line);
  }
  assert.match(simReport({ status: 'different', live: OTHER_SIM }, TEST_SIM, true).line, new RegExp(`canlı ${OTHER_SIM}, depo ${TEST_SIM}`));
  for (const strict of [true, false]) assert.equal(simReport({ status: 'unreachable', detail: 'HTTP 503' }, TEST_SIM, strict).code, 1);
});
