import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, createNewGame, customerFlows } from '@capital/core';
import { allocateShoppers, type FlowShare } from '../src/shopper-allocation';

const BUDGET = 54;
const PER_STORE = 6;

function store(companyId: string, n: number, units: number): FlowShare {
  return { buildingId: `${companyId}-${n}`, companyId, units };
}

/** Motorun sırası: satışa göre azalan, eşitlikte kimlik. */
function bySales(flows: FlowShare[]): FlowShare[] {
  return [...flows].sort((a, b) => b.units - a.units || a.buildingId.localeCompare(b.buildingId));
}

function totals(quotas: Array<{ flow: FlowShare; count: number }>) {
  const units: Record<string, number> = {};
  const cars: Record<string, number> = {};
  for (const { flow, count } of quotas) {
    units[flow.companyId] = (units[flow.companyId] ?? 0) + flow.units;
    cars[flow.companyId] = (cars[flow.companyId] ?? 0) + count;
  }
  return { units, cars };
}

/** En çok satan şirketin aracı, en kalabalık şirketinkinden en fazla 1 eksik. */
function leaderGap(quotas: Array<{ flow: FlowShare; count: number }>): number {
  const { units, cars } = totals(quotas);
  const leader = Object.entries(units).sort((a, b) => b[1] - a[1])[0]![0];
  const most = Math.max(...Object.values(cars));
  return most - (cars[leader] ?? 0);
}

/** Daha çok satan bir kapının, daha az satandan kaç araç eksik kalabildiği. */
function doorInversion(quotas: Array<{ flow: FlowShare; count: number }>): number {
  let worst = 0;
  let fewestAbove = Infinity;
  for (const { count } of [...quotas].sort((a, b) => b.flow.units - a.flow.units)) {
    worst = Math.max(worst, count - fewestAbove);
    fewestAbove = Math.min(fewestAbove, count);
  }
  return worst;
}

describe('müşteri aracı paylaştırma', () => {
  test('bütçe tam dağıtılıyor ve kapı tavanı aşılmıyor', () => {
    const flows = bySales([
      ...Array.from({ length: 12 }, (_, n) => store('a', n, 40 + n * 7)),
      ...Array.from({ length: 20 }, (_, n) => store('b', n, 15 + n * 3)),
      store('c', 0, 150),
    ]);
    const quotas = allocateShoppers(flows, BUDGET, PER_STORE);
    assert.equal(quotas.reduce((sum, q) => sum + q.count, 0), BUDGET);
    assert.ok(quotas.every((q) => q.count <= PER_STORE));
    assert.deepEqual(quotas.map((q) => q.flow), flows, 'sıra korunuyor');
  });

  test('az ama büyük mağazalı lider, çok küçük dükkânlı rakibin gerisinde kalmıyor', () => {
    // Kapı düzeyinde yuvarlamanın yalan söylediği durum: liderin her
    // mağazası 1,3 araçlık (kesir 0,3), rakibin her dükkânı 0,7 araçlık.
    // Eski dağıtım artan aracı kesri büyük olana, yani rakibe veriyordu.
    const flows = bySales([
      ...Array.from({ length: 22 }, (_, n) => store('lider', n, 130)),
      ...Array.from({ length: 30 }, (_, n) => store('rakip', n, 70)),
    ]);
    const quotas = allocateShoppers(flows, BUDGET, PER_STORE);
    const { cars } = totals(quotas);
    assert.ok((cars['lider'] ?? 0) > (cars['rakip'] ?? 0), `lider ${cars['lider']} · rakip ${cars['rakip']}`);
    assert.ok(leaderGap(quotas) <= 0);
    assert.ok(doorInversion(quotas) <= 1);
  });

  test('tavana dayanan mağazanın fazlası rakibe değil şirketin öbür kapılarına gidiyor', () => {
    const flows = bySales([
      store('dev', 0, 600),
      store('dev', 1, 200),
      store('dev', 2, 200),
      ...Array.from({ length: 10 }, (_, n) => store('küçük', n, 50)),
    ]);
    const quotas = allocateShoppers(flows, BUDGET, PER_STORE);
    const { cars } = totals(quotas);
    // dev satışın 2/3'ü: 36 araç hakkı var ama 3 kapı × 6 = 18 sığıyor.
    assert.equal(cars['dev'], 18);
    // Rakibin payı kendi satışı kadar (1/3 → 18), dev'in taşan fazlası değil.
    assert.equal(cars['küçük'], 18);
  });

  test('aynı girdi aynı dağıtımı veriyor', () => {
    const flows = bySales(Array.from({ length: 40 }, (_, n) => store(n % 3 === 0 ? 'x' : 'y', n, 10 + ((n * 37) % 23))));
    assert.deepEqual(allocateShoppers(flows, BUDGET, PER_STORE), allocateShoppers(flows, BUDGET, PER_STORE));
  });

  test('satış yoksa araç yok', () => {
    assert.deepEqual(allocateShoppers([], BUDGET, PER_STORE), []);
    const idle = [store('a', 0, 0)];
    assert.deepEqual(allocateShoppers(idle, BUDGET, PER_STORE), [{ flow: idle[0], count: 0 }]);
  });

  test('gerçek şehirde her gün en çok satan en kalabalık', () => {
    // Tur 34 sonrası main'in tam oynanış testi burada kırmızı yanmıştı:
    // birimde lider 17 araç, araçta lider rakip 19 araç. Aynı kural motorun
    // ürettiği gerçek akışla, her gün sınanıyor.
    const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Akış AŞ' }));
    let checked = 0;
    for (let day = 1; day <= 150; day++) {
      engine.runDay();
      const flows = customerFlows(engine.getState());
      if (new Set(flows.map((f) => f.companyId)).size < 2) continue;
      const quotas = allocateShoppers(flows, BUDGET, PER_STORE);
      assert.ok(leaderGap(quotas) <= 1, `gün ${day}: fark ${leaderGap(quotas)}`);
      assert.ok(doorInversion(quotas) <= 1, `gün ${day}: kapı ters sırası ${doorInversion(quotas)}`);
      checked++;
    }
    assert.ok(checked > 100, `${checked} gün sınandı`);
  });
});
