import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFixtures } from './fixtures';
import { FIXTURE_PATH } from './fixture-path';

/*
 * Kayıtlı fikstür, modelin bugünkü çıktısıyla aynı olmalı.
 *
 * Model ya da içerik değişip fikstür yeniden yazılmazsa Swift testleri eski
 * sayılarla karşılaştırır ve "Swift yanlış" der — oysa yanlış olan kayıt.
 * Bu test o durumu TS tarafında, sebebiyle birlikte yakalıyor.
 */
test('Swift fikstürleri güncel (write-fixtures.ts yeniden çalıştırılmalı mı?)', () => {
  const committed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const fresh = JSON.parse(JSON.stringify(buildFixtures()));
  assert.deepEqual(committed, fresh, 'fikstür eski: node tools/run-node-script.mjs packages/lite-model/test/write-fixtures.ts');
});

test('fikstür senaryoları oyunun bütün evrelerini kapsıyor', () => {
  const fixtures = buildFixtures();
  const byName = Object.fromEntries(fixtures.scenarios.map((s) => [s.name, s]));
  const last = (name: string) => byName[name]!.snapshots[byName[name]!.snapshots.length - 1]!;
  // Açılış: kahve açılmış olmalı (ikinci zincirde de satış var).
  assert.ok(last('acilis').levels[1]![2]! > 0, 'açılışta kahve satışı yok');
  // Çevrimdışı senaryoda müdür alınmış ve çevrimdışı adımlar başarılı.
  assert.ok(last('cevrimdisi').manager > 0, 'müdür alınmamış');
  // L3: olay, meclis ve görev senaryolarda gerçekten yaşanıyor.
  assert.ok(last('acilis').events >= 3, 'açılışta olay yaşanmamış');
  assert.ok(last('cevrimdisi').policies >= 1, 'meclis kararı alınmamış');
  assert.ok(last('acilis').goal >= 5, 'görev merdiveni ilerlememiş');
  // Holding: şehir satılmış, yıldız var.
  assert.equal(last('holding').city, 1, 'holding senaryosu şehri satmamış');
  assert.ok(last('holding').stars > 0);
  // L4: halka arz şehri satmadan önce yapılmış ve başarılı; ikinci şehirde öne çıkan zincir var.
  const ipo = byName['holding']!.ops.filter((o) => o.op === 'ipo');
  assert.ok(ipo.length >= 1 && ipo.every((o) => o.ok), 'holding senaryosunda başarılı halka arz yok');
  // Rakip öngörüsü: hem "geçemiyor" hem "şu saniyede geçiyor" vakası var.
  assert.ok(fixtures.overtakes.some((c) => c.result === null), 'rakibin geçemediği vaka yok');
  assert.ok(fixtures.overtakes.some((c) => c.result !== null), 'rakibin geçtiği vaka yok');
  // L7: takımada senaryosunda üç ada da açılmış, şebeke kurulmuş, şehir haritaya geçmiş.
  const islands = byName['takimada']!.snapshots;
  const beforeSale = [...islands].reverse().find((snap) => snap.city === 5)!;
  assert.ok(beforeSale.levels[7]![2]! > 0, 'takımadada havacılık satışı yok');
  assert.ok(beforeSale.levels[5]![1]! > 0, 'takımadada enerji şebekesi kurulmamış');
  assert.equal(last('takimada').city, 6, 'takımada şehri satılmamış');
  assert.equal(last('takimada').history.length, 6, 'satılan şehir haritaya geçmemiş');
  const ops = fixtures.scenarios.flatMap((s) => s.ops.map((o) => o.op));
  for (const kind of ['buy', 'advance', 'offline', 'campaign', 'manager', 'prestige', 'council', 'claim', 'ipo']) {
    assert.ok(ops.includes(kind as never), `${kind} adımı hiç yok`);
  }
});
