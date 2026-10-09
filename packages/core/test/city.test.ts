import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_ARCHETYPES, STRUCTURES, rootStructureOf } from '@capital/content';
import { DISTRICT_UNLOCK_DAYS, createNewGame } from '../src/worldgen';
import { isDistrictOpen } from '../src/systems/city';
import { districtPressure } from '../src/systems/citygrowth';
import { purchaseBlocker } from '../src/actions';

describe('kademeli imar', () => {
  test('varsayılan şehirde dört köşe kilitli, takvim sabit günlerden', () => {
    const state = createNewGame({ seed: 11 });
    const locked = state.districts.filter((d) => d.opensOnDay !== undefined);
    assert.equal(locked.length, 4);
    assert.deepEqual(locked.map((d) => d.opensOnDay).sort((a, b) => a! - b!), DISTRICT_UNLOCK_DAYS);
  });

  test('laboratuvar zemininde hiçbir bölge kilitli değil', () => {
    const state = createNewGame({ seed: 11, districtUnlocks: false });
    assert.ok(state.districts.every((d) => d.opensOnDay === undefined));
  });

  test('isDistrictOpen açılış gününde açılır, bir gün önce kapalıdır', () => {
    const state = createNewGame({ seed: 11 });
    const district = state.districts.find((d) => d.opensOnDay !== undefined)!;
    state.time.day = district.opensOnDay! - 1;
    assert.equal(isDistrictOpen(state, district.id), false);
    state.time.day = district.opensOnDay!;
    assert.equal(isDistrictOpen(state, district.id), true);
  });

  test('takvimsiz (eski kayıt) bölge açık, olmayan bölge kapalı', () => {
    const state = createNewGame({ seed: 11, districtUnlocks: false });
    assert.equal(isDistrictOpen(state, 0), true);
    assert.equal(isDistrictOpen(state, 999), false);
  });

  test('kilitli bölgede satın alma gerekçesiyle reddedilir', () => {
    const state = createNewGame({ seed: 11 });
    const district = state.districts.find((d) => d.opensOnDay !== undefined)!;
    const tile = state.map.tiles.find(
      (t) => t.districtId === district.id && t.kind === 'plot' && t.ownerId === null,
    )!;
    assert.match(purchaseBlocker(state, tile.id) ?? '', /imara kapalı/);
  });
});

describe('şehrin gelişme basıncı', () => {
  test('gün 0 ve taban nüfusta basınç sıfır', () => {
    const state = createNewGame({ seed: 5 });
    const district = state.districts[4]!;
    state.time.day = 0;
    district.population = DISTRICT_ARCHETYPES[district.archetype].population;
    assert.equal(districtPressure(state, district), 0);
  });

  // PR #22'de yakalanan hata: fazlalık önce 1'e kırpılıp sonra 1,6'ya
  // bölünüyordu; basınç tavanda 0,794'te takılıyordu.
  test('900. gün ve 2,6 kat nüfusta basınç tam 1', () => {
    const state = createNewGame({ seed: 5 });
    const district = state.districts[4]!;
    state.time.day = 900;
    district.population = DISTRICT_ARCHETYPES[district.archetype].population * 2.6;
    assert.ok(Math.abs(districtPressure(state, district) - 1) < 1e-9);
  });

  test('basınç zamanla ve nüfusla azalmaz, [0, 1] içinde kalır', () => {
    const state = createNewGame({ seed: 5 });
    const district = state.districts[4]!;
    const base = DISTRICT_ARCHETYPES[district.archetype].population;
    let previous = -1;
    for (let step = 0; step <= 20; step++) {
      state.time.day = step * 60;
      district.population = base * (1 + step * 0.1);
      const pressure = districtPressure(state, district);
      assert.ok(pressure >= previous, `adım ${step}: ${pressure} < ${previous}`);
      assert.ok(pressure >= 0 && pressure <= 1);
      previous = pressure;
    }
  });
});

describe('yapı kademeleri', () => {
  test('gökdelenin kökü sıra ev, fabrikanın kökü bostan', () => {
    assert.equal(rootStructureOf('tower_block'), 'row_houses');
    assert.equal(rootStructureOf('apartment_block'), 'row_houses');
    assert.equal(rootStructureOf('factory_shed'), 'allotments');
    assert.equal(rootStructureOf('warehouse_old'), 'allotments');
  });

  test('zincirsiz yapı kendi köküdür', () => {
    const loner = STRUCTURES.find(
      (s) => !s.upgradesTo && !STRUCTURES.some((other) => other.upgradesTo === s.id),
    );
    if (loner) assert.equal(rootStructureOf(loner.id), loner.id);
  });

  test('yükseltme zincirlerinde döngü yok ve her hedef tanımlı', () => {
    const ids = new Set(STRUCTURES.map((s) => s.id));
    for (const structure of STRUCTURES) {
      const visited = new Set<string>();
      let current: string | undefined = structure.id;
      while (current) {
        assert.ok(ids.has(current), `tanımsız yapı: ${current}`);
        assert.ok(!visited.has(current), `döngü: ${structure.id}`);
        visited.add(current);
        current = STRUCTURES.find((s) => s.id === current)?.upgradesTo;
      }
    }
  });

  test('kuruluşta şehir dokusu yalnızca kök yapılardan oluşur', () => {
    const state = createNewGame({ seed: 21 });
    for (const tile of state.map.tiles) {
      if (!tile.structureId || tile.kind !== 'plot') continue;
      assert.equal(rootStructureOf(tile.structureId), tile.structureId, `kare ${tile.id}: ${tile.structureId}`);
    }
  });
});

describe('üretimin tüketim sayımı (Tur 21)', () => {
  test('mağazanın ürün başına dünkü satışı defter sıfırlansa da duruyor', async () => {
    const { GameEngine } = await import('../src/engine');
    const { build, buyTile } = await import('../src/actions');
    const { resetDailyLedgers } = await import('../src/systems/supply');
    const state = createNewGame({ seed: 4 });
    state.flags.npcCompetition = false;
    state.companies.player!.cash = 5_000_000;
    state.companies.player!.netWorth = 5_000_000; // restoran kilidi
    const tile = state.map.tiles.find(
      (t) => t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId && !purchaseBlocker(state, t.id),
    )!;
    assert.equal(buyTile(state, 'player', tile.id).ok, true);
    assert.equal(build(state, 'player', tile.id, 'restaurant').ok, true);
    const outlet = state.buildings[state.map.tiles[tile.id]!.buildingId!]!;
    assert.equal(outlet.soldByGood, undefined, 'ilk günden önce yok: eski kurala düşer');
    const engine = new GameEngine(state);
    for (let day = 0; day < 5; day++) engine.runDay();
    assert.ok(outlet.soldByGood, 'pazar adımı ürün başına satışı yazıyor');
    const total = Object.values(outlet.soldByGood!).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, 'satış var');
    assert.ok(Math.abs(total - outlet.last.unitsSold) < 1e-6, `${total} = ${outlet.last.unitsSold}`);
    for (const goodId of Object.keys(outlet.soldByGood!)) assert.ok(outlet.stocked.includes(goodId), goodId);
    // Defter üretimden ÖNCE sıfırlanıyor; dünkü satış ayrı alanda kalmalı.
    const before = { ...outlet.soldByGood! };
    resetDailyLedgers(state);
    assert.equal(outlet.last.unitsSold, 0);
    assert.deepEqual(outlet.soldByGood, before);
  });
});
