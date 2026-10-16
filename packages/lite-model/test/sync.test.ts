import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_IDS,
  SYNC,
  SyncJournal,
  SyncedGame,
  advance,
  applyOffline,
  newGame,
  replay,
  starFree,
  step,
  validOp,
  type LiteState,
  type SyncOp,
} from '../src/index';

/** Bir oyuncunun yarım saati: alımlar, kampanya, fırsat, meclis, kısa bir ayrılış. */
function session(game: SyncedGame): void {
  game.tick(5);
  game.act(['b', 'bakery', 0, 1]);
  for (let k = 0; k < 400; k++) {
    game.tick(1);
    // Parası yettikçe darboğazı büyüten oyuncu.
    for (const stage of [0, 1, 2] as const) game.act(['b', 'bakery', stage, 1]);
    if (game.state.deal) game.act(['d']);
    if (game.state.council !== null) game.act(['p', 1]);
    game.act(['g']);
    if (k === 120) game.act(['c']);
  }
  game.away(3_600);
  // Toplam 595 çevrimiçi adım: bir gönderimin sınırı (SYNC.maxSteps) içinde.
  game.tick(190);
}

test('eşitleme: dürüst istemcinin durumu sunucunun oynattığıyla bit bit aynı', () => {
  const game = new SyncedGame(newGame());
  session(game);
  const ops = game.journal.ops;
  assert.ok(ops.length > 20, `günlük ${ops.length} kayıt`);
  // Art arda adımlar tek kayıtta birleşiyor.
  assert.ok(ops.filter((op) => op[0] === 't').length < 420);
  const server = replay(newGame(), ops);
  assert.equal(server.skipped, 0);
  assert.deepEqual(server.state, game.state);
  // Haftalık puan dilimleri toplam kazancın yıldızsız karşılığı.
  const total = server.spans.reduce((sum, span) => sum + span.score, 0);
  assert.ok(Math.abs(total - starFree(game.state.totalEarned, 0)) < 1e-6 * game.state.totalEarned);
  assert.equal(server.seconds, 5 + 400 + 3_600 + 190);
});

test('eşitleme: adımlar istemcinin çağrısıyla aynı (advance(1) × n, advance(n) değil)', () => {
  let s = newGame();
  s.cash = 1e4;
  s.chains.bakery.levels = [5, 5, 5];
  const stepped = step(s, 300);
  let manual = s;
  for (let k = 0; k < 300; k++) manual = advance(manual, 1);
  assert.deepEqual(stepped, manual);
});

test('eşitleme: sunucunun saatine sığmayan süre kırpılıyor, parası yetmeyen alım atlanıyor', () => {
  const start = newGame();
  start.chains.bakery.levels = [1, 1, 1];
  const ops: SyncOp[] = [['t', 600], ['b', 'bakery', 2, 500], ['o', 7_200]];
  const result = replay(start, ops, 100);
  assert.equal(result.seconds, 100);
  assert.equal(result.clipped, 500 + 7_200);
  // 100 sn sonra bütçe bitti: çevrimdışı kayıt sıfır sürüyle, alım parasızlıktan atlandı.
  assert.deepEqual(result.state, applyOffline(step(start, 100), 0).state);
  assert.equal(result.skipped, 1);
  // Bir gönderimde en çok SYNC.maxSteps çevrimiçi adım.
  const long = replay(start, [['t', 600], ['t', 600]]);
  assert.equal(long.seconds, SYNC.maxSteps);
});

test('eşitleme: bozuk kayıtlar reddediliyor', () => {
  for (const op of [['t', 0], ['t', 1.5], ['t', SYNC.maxSteps + 1], ['o', -1], ['o', Infinity], ['b', 'gold', 0, 1], ['b', 'bakery', 3, 1], ['b', 'bakery', 0, 0], ['p', 2], ['m', 1], ['x'], 't', null, []]) {
    assert.equal(validOp(op), false, JSON.stringify(op));
  }
  for (const op of [['t', 1], ['o', 0], ['b', CHAIN_IDS[0], 2, 10], ['p', 0], ['m'], ['c'], ['g'], ['d'], ['i'], ['s'], ['r']]) {
    assert.equal(validOp(op), true, JSON.stringify(op));
  }
});

test('günlük: gönderimdeki kayıtlar donuk, yeni adımlar ayrı kayda; düşerse yerinde', () => {
  const journal = new SyncJournal();
  journal.steps(3);
  journal.push(['m']);
  journal.steps(2);
  const batch = journal.take();
  assert.deepEqual(batch, [['t', 3], ['m'], ['t', 2]]);
  // Gönderim yoldayken gelen adım gönderilen kayda eklenmiyor.
  journal.steps(4);
  assert.deepEqual(journal.ops, [['t', 3], ['m'], ['t', 2], ['t', 4]]);
  journal.drop();
  assert.deepEqual(journal.ops, [['t', 4]]);
  journal.take();
  journal.release();
  journal.steps(1);
  assert.deepEqual(journal.ops, [['t', 5]]);
  // Bir gönderim en çok SYNC.maxSteps adım taşıyor.
  const big = new SyncJournal();
  for (let k = 0; k < 3; k++) big.steps(SYNC.maxSteps);
  assert.equal(big.take().length, 1);
});

test('istemci: sunucu aldıktan sonra arada yapılanlar yeniden uygulanıyor; başka cihaz ilerlediyse sunucunun durumu', () => {
  const game = new SyncedGame(newGame());
  game.tick(30);
  game.act(['b', 'bakery', 0, 1]);
  const batch = game.journal.take();
  const server = replay(newGame(), batch).state;
  game.tick(10);
  const before = structuredClone(game.state) as LiteState;
  game.accepted(server);
  assert.deepEqual(game.state, before);
  assert.deepEqual(game.journal.ops, [['t', 10]]);
  const other = step(newGame(), 5);
  game.replaced(other);
  assert.deepEqual(game.state, other);
  assert.equal(game.journal.pending, 0);
});

test('eşitleme: sıfırlama yeni oyun; sonrası yeniden sayılıyor', () => {
  const game = new SyncedGame(newGame());
  session(game);
  game.act(['r']);
  game.tick(3);
  assert.deepEqual(game.state, step(newGame(), 3));
  assert.deepEqual(replay(newGame(), game.journal.ops).state, game.state);
});

test('eşitleme: çevrimiçi adımlar bütçenin yalnızca son saatine yerleşiyor; ayrılış bütün süreyi kullanabiliyor', () => {
  const start = newGame();
  start.cash = 1e9;
  const day = 86_400;
  // Bir gün sonra "hep çevrimiçiydim": en çok son bir saat sayılıyor, öncesi kazançsız boşluk.
  const online = replay(start, [['t', SYNC.maxSteps], ['t', SYNC.maxSteps], ['t', SYNC.maxSteps], ['t', SYNC.maxSteps], ['t', SYNC.maxSteps], ['t', SYNC.maxSteps]], day);
  assert.equal(online.state.clock, Math.min(SYNC.maxSteps, SYNC.maxBank) * SYNC.step, 'tek gönderimde en çok maxSteps');
  assert.equal(online.seconds, day - SYNC.maxBank + SYNC.maxSteps, 'boşluk zamanı geçiriyor');
  assert.equal(online.spans[0]!.score, 0, 'boşluğun haftalık payı yok');
  // Aynı gün dürüstçe "yoktum" (o) sonra kısa oyun: ayrılış bütün süreyi alıyor, adımlar sona sığıyor.
  const honest = replay(start, [['o', day - 600], ['t', 600]], day);
  assert.equal(honest.clipped, 0);
  assert.equal(honest.seconds, day);
  assert.equal(honest.state.clock, applyOffline(start, day - 600).state.clock + 600);
  // Bütçesiz oynatma (istemci) etkilenmiyor.
  assert.equal(replay(start, [['t', 600]]).state.clock, 600);
});

test('istemci: otuz günden uzun ayrılış sunucunun kabul ettiği kayda kırpılıyor', () => {
  const game = new SyncedGame(newGame());
  game.away(45 * 86_400);
  game.away(Number.NaN);
  const ops = game.journal.ops;
  assert.deepEqual(ops, [['o', SYNC.maxAway], ['o', 0]]);
  assert.ok(ops.every(validOp), 'gönderim reddedilmiyor');
  assert.equal(JSON.stringify(replay(newGame(), ops).state), JSON.stringify(game.state), 'sunucu aynısını oynatıyor');
});
