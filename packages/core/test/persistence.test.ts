import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { exportToJson, importFromJson } from '../../persistence/src/index';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { SCHEMA_VERSION } from '../src/types';

function playedState(days = 40) {
  const engine = new GameEngine(createNewGame({ seed: 314 }));
  for (let i = 0; i < days; i++) engine.runDay();
  return engine.getState();
}

describe('kayıt', () => {
  test('dışa aktarılan kayıt aynen geri yüklenir', () => {
    const state = playedState();
    const outcome = importFromJson(exportToJson(state));
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    assert.equal(outcome.state.time.day, state.time.day);
    assert.equal(outcome.state.rng.s, state.rng.s);
    assert.equal(outcome.migratedFrom, undefined);
  });

  test('zarfsız ham state de yüklenir', () => {
    const outcome = importFromJson(JSON.stringify(playedState(5)));
    assert.ok(outcome.ok);
  });

  test('v1 kaydı güncel şemaya taşınır ve her kare geçerli olur', () => {
    const legacy = JSON.parse(JSON.stringify(playedState())) as Record<string, any>;
    legacy.meta.schemaVersion = 1;
    for (const tile of legacy.map.tiles) {
      delete tile.kind;
      delete tile.structureId;
      delete tile.structureHeight;
    }
    for (const company of Object.values(legacy.companies) as Array<Record<string, unknown>>) delete company.ceoId;

    const outcome = importFromJson(JSON.stringify(legacy));
    assert.ok(outcome.ok, outcome.ok ? '' : outcome.reason);
    if (!outcome.ok) return;
    assert.equal(outcome.state.meta.schemaVersion, SCHEMA_VERSION);
    assert.equal(outcome.migratedFrom, 1);
    assert.ok(outcome.state.map.tiles.every((t) => typeof t.kind === 'string'));
  });

  test('her ara sürümden göç zinciri tamamlanır', () => {
    for (let version = 2; version < SCHEMA_VERSION; version++) {
      const raw = JSON.parse(exportToJson(playedState(3)));
      raw.state.meta.schemaVersion = version;
      const outcome = importFromJson(JSON.stringify(raw));
      assert.ok(outcome.ok, `v${version}: ${outcome.ok ? '' : outcome.reason}`);
    }
  });

  test('deri zinciri gelmeden kaydedilmiş şehirde yeni ürünlerin pazarı kuruluyor (Tur 29)', () => {
    /*
     * Kayıt şeması ürün listesini taşımıyor. Ham deri ve derinin pazar
     * girdileri olmayan bir kayıt yükleniyor; ilk gün referans ve spot
     * fiyat yerine gelmeli. Referans `?? 1` ile kalsaydı ilk fazla üretim
     * fiyatı tabana çökertirdi.
     */
    const state = playedState(10);
    for (const id of ['hide', 'leather']) {
      delete state.market.reference[id];
      delete state.market.spot[id];
    }
    const outcome = importFromJson(exportToJson(state));
    assert.ok(outcome.ok);
    if (!outcome.ok) return;
    const engine = new GameEngine(outcome.state);
    engine.runDay();
    const market = engine.getState().market;
    for (const id of ['hide', 'leather']) {
      assert.ok((market.reference[id] ?? 0) > 100, `${id} referansı ${market.reference[id]}`);
      assert.ok(market.spot[id]! > 0, `${id} spot ${market.spot[id]}`);
    }
    // Üretim yokken fiyat referansta: deri 25, ham deri 12.
    assert.equal(Math.round(market.spot.leather!), 25);
    assert.equal(Math.round(market.spot.hide!), 12);
  });

  test('gelecek sürümün kaydı açıkça reddedilir', () => {
    const raw = JSON.parse(exportToJson(playedState(1)));
    raw.state.meta.schemaVersion = SCHEMA_VERSION + 1;
    const outcome = importFromJson(JSON.stringify(raw));
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.match(outcome.reason, /daha yeni/);
  });

  test('bozuk JSON ve eksik yapı gerekçeyle reddedilir', () => {
    const notJson = importFromJson('{ yarım');
    assert.equal(notJson.ok, false);
    const broken = importFromJson(JSON.stringify({ meta: { schemaVersion: SCHEMA_VERSION }, map: null }));
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.match(broken.reason, /bozuk|eksik/);
  });
});
