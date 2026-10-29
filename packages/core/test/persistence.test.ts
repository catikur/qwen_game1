import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUG_REPORT_KIND,
  NewerSaveError,
  deleteSave,
  exportToJson,
  importFromJson,
  loadGame,
  saveGame,
  setSaveBackend,
} from '../../persistence/src/index';
import type { SaveBackend, SaveRecord } from '../../persistence/src/index';
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

  test('neden kodlu, arayüz oyuncunun dilinde söylüyor (Tur 75); JSON "null" da çökmüyor', () => {
    const problem = (text: string) => {
      const outcome = importFromJson(text);
      return outcome.ok ? 'ok' : [outcome.problem, outcome.version];
    };
    assert.deepEqual(problem('{ yarım'), ['notJson', undefined]);
    assert.deepEqual(problem('null'), ['noVersion', undefined]);
    assert.deepEqual(problem('[1, 2]'), ['noVersion', undefined]);
    assert.deepEqual(problem(JSON.stringify({ meta: { schemaVersion: SCHEMA_VERSION }, map: null })), ['broken', undefined]);
    const newer = JSON.parse(exportToJson(playedState(1)));
    newer.state.meta.schemaVersion = SCHEMA_VERSION + 2;
    assert.deepEqual(problem(JSON.stringify(newer)), ['newer', SCHEMA_VERSION + 2]);
  });

  test('göç adımını düşüren eski kayıt bozuk sayılıyor, hata fırlatmıyor (Tur 75)', async () => {
    // v1 → v2 adımı her şirkete CEO alanı ekliyor; şirketin yerinde null var.
    const damaged = JSON.stringify({ meta: { schemaVersion: 1 }, companies: { p1: null } });
    const outcome = importFromJson(damaged);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.problem, 'broken');
    // Açılıştaki otomatik kayıt da aynı yoldan: açılış menüye nedeniyle düşüyor.
    const store = memoryBackend([{ meta: { slot: 0 } as SaveRecord['meta'], state: JSON.parse(damaged) as SaveRecord['state'] }]);
    setSaveBackend(store.backend);
    const boot = await loadGame(0);
    assert.equal(boot.ok, false);
    if (!boot.ok) assert.equal(boot.problem, 'broken');
  });

  test('hata raporu içe aktarılıyor: içindeki kayıt açılıyor; kaydı çıkarılmış rapor nedeniyle (Tur 75)', () => {
    const state = playedState(12);
    // Raporun biçimi `packages/ui/src/bugReport.ts`: kayıt en sonda, dışa aktarılanla aynı.
    const report = { kind: BUG_REPORT_KIND, format: 1, app: { version: '1.0.0', edition: 'web' }, note: 'not', log: [], save: JSON.parse(exportToJson(state)) };
    const outcome = importFromJson(JSON.stringify(report));
    assert.ok(outcome.ok, outcome.ok ? '' : outcome.reason);
    if (outcome.ok) assert.equal(JSON.stringify(outcome.state), JSON.stringify(state));
    const bare = importFromJson(JSON.stringify({ ...report, save: null }));
    assert.equal(bare.ok, false);
    if (!bare.ok) assert.equal(bare.problem, 'reportWithoutSave');
  });
});

/** Bellekte sahte depo: okunan slotlar sayılıyor. */
function memoryBackend(initial: SaveRecord[] = []) {
  const records = new Map(initial.map((record) => [record.meta.slot, record] as const));
  const reads: number[] = [];
  const backend: SaveBackend = {
    put: async (record) => void records.set(record.meta.slot, JSON.parse(JSON.stringify(record)) as SaveRecord),
    get: async (slot) => {
      reads.push(slot);
      return records.get(slot);
    },
    list: async () => [...records.values()].map((record) => record.meta),
    remove: async (slot) => void records.delete(slot),
  };
  return { records, reads, backend };
}

function recordOf(state: ReturnType<typeof playedState>, slot: number, schemaVersion = SCHEMA_VERSION): SaveRecord {
  const copy = JSON.parse(JSON.stringify(state)) as ReturnType<typeof playedState>;
  copy.meta.schemaVersion = schemaVersion;
  const raw = JSON.parse(exportToJson(copy)) as SaveRecord;
  return { meta: { ...raw.meta, slot, schemaVersion }, state: copy };
}

describe('yeni sürümün kaydı ezilmiyor (Tur 75)', () => {
  test('otomatik kayıt slotundaki yeni sürüm kaydının üstüne yazılmıyor; açılmıyor, nedeni ve sürümü söyleniyor', async () => {
    const theirs = recordOf(playedState(30), 0, SCHEMA_VERSION + 1);
    const store = memoryBackend([theirs]);
    setSaveBackend(store.backend);
    try {
      const loaded = await loadGame(0);
      assert.equal(loaded.ok, false);
      if (!loaded.ok) assert.deepEqual([loaded.problem, loaded.version], ['newer', SCHEMA_VERSION + 1]);
      const ours = playedState(2);
      await assert.rejects(saveGame(ours, 0), (error: unknown) => error instanceof NewerSaveError && error.slot === 0 && error.schemaVersion === SCHEMA_VERSION + 1);
      await assert.rejects(saveGame(ours, 0), NewerSaveError);
      assert.equal(store.records.get(0)?.state.time.day, 30, 'yeni sürümün kaydı yerinde');
      // Oyuncu slotu silerse yazılıyor.
      await deleteSave(0);
      await saveGame(ours, 0);
      assert.equal(store.records.get(0)?.state.time.day, 2);
    } finally {
      setSaveBackend(null);
    }
  });

  test('aynı ya da eski sürümün kaydı ezilir; slot her yazıştan önce okunuyor', async () => {
    const store = memoryBackend([recordOf(playedState(5), 1), recordOf(playedState(5), 2, SCHEMA_VERSION - 1)]);
    setSaveBackend(store.backend);
    try {
      const ours = playedState(8);
      await saveGame(ours, 1);
      await saveGame(ours, 1);
      await saveGame(ours, 2);
      await saveGame(ours, 3);
      assert.deepEqual([1, 2, 3].map((slot) => store.records.get(slot)?.state.time.day), [8, 8, 8]);
      assert.deepEqual(store.reads, [1, 1, 2, 3], 'her yazıştan önce bir okuma');
    } finally {
      setSaveBackend(null);
    }
  });

  test('açılıp yazılan slota başka sekme yeni sürümle yazınca bu sekme üstüne yazmıyor (Codex #105)', async () => {
    const store = memoryBackend([recordOf(playedState(4), 0)]);
    setSaveBackend(store.backend);
    try {
      // Eski sürümün sekmesi kaydı açmış ve yazmış.
      assert.ok((await loadGame(0)).ok);
      await saveGame(playedState(6), 0);
      // Yeni sürüm başka bir sekmede açılıp otomatik kaydı kendi biçimiyle yazıyor.
      store.records.set(0, recordOf(playedState(40), 0, SCHEMA_VERSION + 1));
      await assert.rejects(saveGame(playedState(7), 0), NewerSaveError);
      assert.equal(store.records.get(0)?.state.time.day, 40, 'yeni sürümün kaydı yerinde');
    } finally {
      setSaveBackend(null);
    }
  });

  test('okunamayan slotun üstüne yazılıyor, slot sonraki yazışta yine okunuyor', async () => {
    const store = memoryBackend([recordOf(playedState(5), 1, SCHEMA_VERSION + 1)]);
    const get = store.backend.get;
    let failing = true;
    store.backend.get = async (slot) => {
      if (failing) {
        failing = false;
        throw new Error('disk meşgul');
      }
      return get(slot);
    };
    setSaveBackend(store.backend);
    try {
      // İlk okuma düştü: kayıt kurtarılamıyor sayılıp yazılıyor (eskisi gibi).
      await saveGame(playedState(8), 1);
      assert.equal(store.records.get(1)?.state.time.day, 8);
      // Sonraki yazış yine okuyor.
      store.records.set(1, recordOf(playedState(9), 1, SCHEMA_VERSION + 1));
      await assert.rejects(saveGame(playedState(10), 1), NewerSaveError);
      assert.equal(store.records.get(1)?.state.time.day, 9);
    } finally {
      setSaveBackend(null);
    }
  });
});
