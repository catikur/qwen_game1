import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { PACK_FORMAT, PACK_VERSION, SCENARIO_BY_ID, packFromScenario, packScenarioId, registerPack, unregisterPack, validatePack } from '@capital/content';
import type { Pack, PackIssueCode } from '@capital/content';
import { createScenarioGame } from '@capital/core';
import { ModifierLine } from '../src/ModifierLine';
import { observeCareer, resetCareerForTests } from '../src/career';
import { issueText, packEn, packTr } from '../src/packMessages';
import { packDe } from '../src/packMessages.de';
import { MAX_PACKS, MAX_WORKSHOP_PACKS, addPack, installedPacks, refreshWorkshop, removePack, setWorkshopPacks, workshopDownloading } from '../src/packStore';
import { recordScenarioResult, scenarioRecord } from '../src/scenarioBest';
import { PackActions, PackList } from '../src/PackShelf';
import { WORKSHOP_TEXT_BYTES, WORKSHOP_TITLE_BYTES, fitUtf8, setWorkshopBridge } from '../src/workshop';
import type { WorkshopBridge, WorkshopListing } from '../src/workshop';

/**
 * Paket rafı (Tur 67): yüklü paketler, sorunların metni, paketteki kuralın
 * adı ve kariyer. Testte `localStorage` yok: depo bellekte.
 */
function sample(id: string, scenarioIds: string[] = ['kurtarma']): Pack {
  const base = packFromScenario(SCENARIO_BY_ID['rescue']!).scenarios[0]!;
  return { format: PACK_FORMAT, version: PACK_VERSION, id, name: `Paket ${id}`, scenarios: scenarioIds.map((sid) => ({ ...base, id: sid })) };
}

describe('yüklü paketler', () => {
  test('ekleme senaryoları oyuna tanıtıyor; aynı kimlik yeni sürüm, kaldırma çıkarıyor', () => {
    const first = addPack(sample('raf', ['a', 'b']));
    assert.equal(first.status, 'added');
    assert.ok(SCENARIO_BY_ID[packScenarioId('raf', 'a')]);
    assert.ok(SCENARIO_BY_ID[packScenarioId('raf', 'b')]);

    // Yeni sürümde olmayan senaryo oyundan da çıkıyor.
    const second = addPack(sample('raf', ['a']));
    assert.equal(second.status, 'updated');
    assert.equal(installedPacks().filter((entry) => entry.pack.id === 'raf').length, 1);
    assert.ok(SCENARIO_BY_ID[packScenarioId('raf', 'a')]);
    assert.equal(SCENARIO_BY_ID[packScenarioId('raf', 'b')], undefined);

    removePack('raf');
    assert.equal(SCENARIO_BY_ID[packScenarioId('raf', 'a')], undefined);
    assert.equal(installedPacks().some((entry) => entry.pack.id === 'raf'), false);
  });

  test('skor sürümünün oynanışına bağlı: metin ya da kural sırası değişse kalıyor, oyun değişince (kaldırıp yeniden kursa da) boş (Codex #97)', () => {
    const id = packScenarioId('skor', 'kurtarma');
    const version = (change: (scenario: Pack['scenarios'][number]) => Pack['scenarios'][number]): Pack => {
      const doc = sample('skor');
      doc.scenarios = [change({ ...doc.scenarios[0]!, rules: ['storms', 'tight_credit'] })];
      return doc;
    };
    const first = version((scenario) => scenario);
    addPack(first);
    recordScenarioResult(id, 'kosu-1', 2, 300);
    assert.equal(scenarioRecord(id).best?.score, 300);

    addPack(version((scenario) => ({ ...scenario, title: 'Yeni başlık', brief: 'Yeni açıklama' })));
    assert.equal(scenarioRecord(id).best?.score, 300, 'metin değişti, oyun aynı');
    addPack(version((scenario) => ({ ...scenario, rules: ['tight_credit', 'storms'] })));
    assert.equal(scenarioRecord(id).best?.score, 300, 'kuralların yalnız sırası değişti');
    // Varsayılanın açıkça yazılması oyunu değiştirmiyor: hazır değerle aynı ayar, etkisiz devir yazımı.
    const explicit = version((scenario) => ({
      ...scenario,
      rules: ['kis', 'tight_credit'],
      setup: { ...scenario.setup, freeze: { entrants: false }, feud: 0 },
    }));
    explicit.rules = [{ id: 'kis', base: 'storms', name: 'Kış', blurb: 'Hazır değerler', params: { firstDay: 160, gapDays: [150, 240] } }];
    addPack(explicit);
    assert.equal(scenarioRecord(id).best?.score, 300, 'varsayılan açıkça yazıldı');

    const harder = version((scenario) => ({ ...scenario, stars: { metric: 'days', two: 250, three: 200 } }));
    addPack(harder);
    assert.deepEqual(scenarioRecord(id), { attempts: 0 }, 'yıldız eşikleri değişti');

    // Kaldırıp başka sürümü kurmak da eski skoru getirmiyor; ilk sürüm geri gelince skoru da geliyor.
    removePack('skor');
    addPack(harder);
    assert.deepEqual(scenarioRecord(id), { attempts: 0 });
    addPack(first);
    assert.equal(scenarioRecord(id).best?.score, 300);
    // Yeni sürümün ilk sonucu eski sürümün skoruyla karşılaştırılmıyor: yerine geçiyor.
    addPack(harder);
    recordScenarioResult(id, 'kosu-2', 1, 380);
    assert.equal(scenarioRecord(id).best?.score, 380);
    assert.equal(scenarioRecord(id).attempts, 1);
    removePack('skor');
  });

  test('raf dolunca yeni paket eklenmiyor, var olanın sürümü yine güncelleniyor', () => {
    const ids = Array.from({ length: MAX_PACKS - installedPacks().length }, (_, i) => `dolu-${i}`);
    for (const id of ids) assert.equal(addPack(sample(id)).status, 'added');
    assert.equal(addPack(sample('fazla')).status, 'full');
    assert.equal(addPack(sample(ids[0]!)).status, 'updated');
    for (const id of ids) removePack(id);
    assert.equal(installedPacks().length, 0);
  });
});

describe('sorunların metni', () => {
  // Kayıt türü her kodu istiyor: doğrulayıcıya yeni kod eklenip metni unutulursa derleme kırılıyor.
  const CODES: Record<PackIssueCode, true> = {
    type: true, missing: true, unknownField: true, range: true, integer: true, enum: true, id: true, length: true, duplicate: true,
    unknownRef: true, conflict: true, count: true, format: true, version: true, starsOrder: true, metric: true, needsSetup: true, placeholder: true,
  };

  test('her sorun kodunun iki dilde metni var', () => {
    for (const code of Object.keys(CODES)) {
      const key = `hud.pack.issue.${code}`;
      assert.ok(key in packTr, `Türkçe: ${key}`);
      assert.ok(key in packEn, `İngilizce: ${key}`);
    }
  });

  test('aralık sayıları dile göre, tür adı çevrilmiş, yer tutucu kalmıyor', () => {
    assert.equal(issueText({ path: 'x', code: 'range', params: { min: 100_000, max: 0.12 } }), '100.000 ile 0,12 arasında olmalı');
    assert.equal(issueText({ path: 'x', code: 'type', params: { expected: 'array' } }), 'liste olmalı');
    const result = validatePack({ format: 'baska', version: 2, id: 'X', name: '', scenarios: 'yok' });
    assert.ok(!result.ok);
    if (result.ok) return;
    for (const issue of result.issues) assert.ok(!/\{\w+\}/.test(issueText(issue)), `${issue.code}: ${issueText(issue)}`);
  });
});

describe('paketin senaryosu arayüzde', () => {
  test('kural satırı paketin kendi adlı kuralını gösteriyor', () => {
    const doc: Pack = {
      ...sample('adli'),
      rules: [{ id: 'sert-kis', base: 'storms', name: 'Sert kış', blurb: 'Kriz sık geliyor.', params: { firstDay: 60 } }],
    };
    doc.scenarios = [{ ...doc.scenarios[0]!, rules: ['sert-kis'] }];
    const [def] = registerPack(doc);
    const html = renderToStaticMarkup(createElement(ModifierLine, { modifiers: ['storms'], scenario: true, def: def! }));
    assert.match(html, /Sert kış/);
    const plain = renderToStaticMarkup(createElement(ModifierLine, { modifiers: ['storms'], scenario: true }));
    assert.ok(!/Sert kış/.test(plain), plain);
    unregisterPack('adli');
  });

  test('paketten gelen senaryo kariyere girmiyor; hazır senaryo giriyor', () => {
    resetCareerForTests();
    const [def] = registerPack(sample('kariyersiz'));
    const custom = createScenarioGame(def!.id);
    custom.companies[custom.playerCompanyId]!.acquisitions = 1;
    assert.deepEqual(observeCareer(custom), []);

    const builtin = createScenarioGame('rescue');
    builtin.companies[builtin.playerCompanyId]!.acquisitions = 1;
    assert.deepEqual(observeCareer(builtin).map((achievement) => achievement.id), ['first_takeover']);
    unregisterPack('kariyersiz');
    resetCareerForTests();
  });
});

describe('Workshop paketleri (Tur 73)', () => {
  /** Kabuğun verdiği öğe: paket dosyalarının içi. */
  const item = (id: string, ...packs: Array<Pack | string>) => ({ id, packs: packs.map((pack) => (typeof pack === 'string' ? pack : JSON.stringify(pack))) });
  /** Liste hiç dönmüyor: köprüyü kurmak rafı tazelese de testin kurduğu raf değişmesin. */
  const bridge = (list: () => Promise<WorkshopListing> = () => new Promise(() => undefined)): WorkshopBridge => ({
    list,
    publish: async () => ({ id: '1', agreement: false }),
    open: async () => true,
  });

  test('abone olunan paketler rafta; bozuk dosya atlanıyor, aynı liste bir şey değiştirmiyor, abonelik bırakılınca gidiyor', () => {
    const items = [item('111', sample('atolye', ['a', 'b']), '{bozuk'), item('222', { ...sample('gecersiz'), version: 99 })];
    assert.deepEqual(setWorkshopPacks(items), { shown: 1, skipped: 2 });
    const shelf = installedPacks();
    assert.deepEqual(
      shelf.map((entry) => [entry.pack.id, entry.workshop]),
      [['atolye', '111']],
    );
    assert.ok(SCENARIO_BY_ID[packScenarioId('atolye', 'a')]);
    setWorkshopPacks(items.map((entry) => ({ ...entry, packs: [...entry.packs] })));
    assert.equal(installedPacks(), shelf, 'aynı liste: raf aynı dizi');

    removePack('atolye');
    assert.ok(SCENARIO_BY_ID[packScenarioId('atolye', 'a')], 'Workshop paketi raftan kaldırılamıyor');
    setWorkshopPacks([]);
    assert.equal(SCENARIO_BY_ID[packScenarioId('atolye', 'a')], undefined, 'abonelik bırakılınca oyundan da çıkıyor');
    assert.equal(installedPacks().length, 0);
  });

  test('aynı kimlikte oyuncunun kendi paketi geçiyor; onu kaldırınca Workshop sürümü geri geliyor', () => {
    setWorkshopPacks([item('333', sample('ortak', ['w1', 'w2']))]);
    addPack(sample('ortak', ['w1']));
    const own = installedPacks().filter((entry) => entry.pack.id === 'ortak');
    assert.equal(own.length, 1);
    assert.equal(own[0]!.workshop, undefined);
    assert.equal(SCENARIO_BY_ID[packScenarioId('ortak', 'w1')], own[0]!.scenarios[0], 'oyundaki tanım oyuncunun');
    assert.equal(SCENARIO_BY_ID[packScenarioId('ortak', 'w2')], undefined, 'Workshop sürümünün fazla senaryosu çıktı');

    removePack('ortak');
    assert.equal(installedPacks().find((entry) => entry.pack.id === 'ortak')?.workshop, '333');
    assert.ok(SCENARIO_BY_ID[packScenarioId('ortak', 'w2')]);
    setWorkshopPacks([]);
  });

  test('öğe güncellenince yeni sürüm, değişmeyen öğe aynı nesne; iki öğede aynı kimlik varsa ilki', () => {
    setWorkshopPacks([item('1', sample('bir', ['x', 'y'])), item('2', sample('iki')), item('3', sample('bir', ['z']))]);
    const before = installedPacks();
    assert.deepEqual(
      before.map((entry) => [entry.pack.id, entry.workshop]),
      [
        ['bir', '1'],
        ['iki', '2'],
      ],
    );
    assert.equal(SCENARIO_BY_ID[packScenarioId('bir', 'z')], undefined);

    setWorkshopPacks([item('1', sample('bir', ['x'])), item('2', sample('iki'))]);
    const after = installedPacks();
    assert.equal(
      after.find((entry) => entry.pack.id === 'iki'),
      before.find((entry) => entry.pack.id === 'iki'),
      'seçili senaryonun tanımı değişmiyor',
    );
    assert.ok(SCENARIO_BY_ID[packScenarioId('bir', 'x')]);
    assert.equal(SCENARIO_BY_ID[packScenarioId('bir', 'y')], undefined, 'yeni sürümde olmayan senaryo çıktı');
    setWorkshopPacks([]);
  });

  test(`Workshop'tan en çok ${MAX_WORKSHOP_PACKS} paket; oyuncunun rafını doldurmuyor`, () => {
    const items = Array.from({ length: MAX_WORKSHOP_PACKS + 2 }, (_, i) => item(String(i + 1), sample(`ws-${i}`)));
    assert.deepEqual(setWorkshopPacks(items), { shown: MAX_WORKSHOP_PACKS, skipped: 2 });
    assert.equal(addPack(sample('yine-sigar')).status, 'added');
    removePack('yine-sigar');
    setWorkshopPacks([]);
  });

  test('kabuğun listesi rafa; inmekte olanlar sayılıyor; eski liste yenisini ezmiyor', async () => {
    let calls = 0;
    setWorkshopBridge(
      bridge(async () => {
        calls++;
        return calls === 1 ? new Promise<WorkshopListing>((resolve) => setTimeout(() => resolve({ items: [item('9', sample('eski'))], downloading: 5 }), 20)) : { items: [item('10', sample('yeni'))], downloading: 2 };
      }),
    );
    await refreshWorkshop();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(
      installedPacks().map((entry) => entry.pack.id),
      ['yeni'],
    );
    assert.equal(workshopDownloading(), 2);
    setWorkshopBridge(null);
    setWorkshopPacks([]);
  });

  test("Steam'in sınırları UTF-8 bayt: başlık ve açıklama karakter bölünmeden kısalıyor (Codex #103)", () => {
    const bytes = (text: string) => new TextEncoder().encode(text).length;
    assert.equal(fitUtf8('Kısa ad', WORKSHOP_TITLE_BYTES), 'Kısa ad');
    // 64 Türkçe harf 128 bayt; karakter sayınca 80'i de geçiyordu.
    assert.equal(fitUtf8('ş'.repeat(80), WORKSHOP_TITLE_BYTES), 'ş'.repeat(64));
    assert.equal(fitUtf8('漢'.repeat(50), WORKSHOP_TITLE_BYTES), '漢'.repeat(42));
    // Vekil çiftler bölünmüyor: 1 + 31 × 4 bayt, bir sonraki sığmıyor.
    assert.equal(fitUtf8(`a${'😀'.repeat(40)}`, WORKSHOP_TITLE_BYTES), `a${'😀'.repeat(31)}`);
    const description = fitUtf8('ü'.repeat(5000), WORKSHOP_TEXT_BYTES);
    assert.equal(bytes(description), 7998);
    assert.equal(fitUtf8('a'.repeat(WORKSHOP_TEXT_BYTES), WORKSHOP_TEXT_BYTES).length, WORKSHOP_TEXT_BYTES);
  });

  test("paketin adındaki NUL Steam'in alanına gitmiyor; kabuk NUL'lu isteği reddediyor (Codex #103)", () => {
    // Doğrulayıcı geçiriyor: paylaşım kodunda ve dosyada NUL kaçışlı (`\u0000`).
    const raw = JSON.parse(JSON.stringify({ ...sample('nul'), name: 'Kriz\u0000 paketi' }));
    assert.equal(validatePack(raw).ok, true);
    assert.equal(fitUtf8(raw.name, WORKSHOP_TITLE_BYTES), 'Kriz paketi');
    assert.equal(fitUtf8('• Kurtarma — Batan\u0000 şirket', WORKSHOP_TEXT_BYTES), '• Kurtarma — Batan şirket');
    // Sınır NUL'lar atıldıktan sonra ölçülüyor.
    assert.equal(fitUtf8(`${'\u0000'.repeat(8)}${'a'.repeat(130)}`, WORKSHOP_TITLE_BYTES), 'a'.repeat(WORKSHOP_TITLE_BYTES));
  });

  test('rafta Workshop künyesi ve "göz at"; Workshop paketinde Steam sayfası, kaldırma ve yükleme yok; kendi paketinde yükleme yalnız Steam açıkken', () => {
    setWorkshopPacks([item('444', sample('vitrin'))]);
    addPack(sample('benim'));
    setWorkshopBridge(bridge());
    const noop = () => undefined;
    const list = renderToStaticMarkup(createElement(PackList, { selectedId: '', onSelect: noop, onChange: noop }));
    assert.match(list, /data-pack-workshop="444"/);
    assert.match(list, /Workshop: Paket vitrin/);
    assert.match(list, /Paket: Paket benim/);
    assert.match(list, /data-pack-workshop-browse/);

    const of = (id: string) => installedPacks().find((entry) => entry.pack.id === id)!.scenarios[0]!;
    const shop = renderToStaticMarkup(createElement(PackActions, { def: of('vitrin'), onRemoved: noop }));
    assert.match(shop, /data-pack-workshop-open/);
    assert.match(shop, /data-pack-workshop-note/);
    assert.ok(!shop.includes('data-pack-remove') && !shop.includes('data-pack-publish'), shop);

    const own = renderToStaticMarkup(createElement(PackActions, { def: of('benim'), onRemoved: noop }));
    assert.match(own, /data-pack-publish="new"/);
    assert.match(own, /data-pack-remove/);
    assert.ok(!own.includes('data-pack-workshop-open'));

    setWorkshopBridge(null);
    const offline = renderToStaticMarkup(createElement(PackActions, { def: of('benim'), onRemoved: noop }));
    assert.ok(!offline.includes('data-pack-publish'), 'Steam yoksa yükleme yok');
    assert.ok(!renderToStaticMarkup(createElement(PackList, { selectedId: '', onSelect: noop, onChange: noop })).includes('data-pack-workshop-browse'));
    removePack('benim');
    setWorkshopPacks([]);
  });

  test('Workshop metinleri üç dilde', () => {
    const keys = Object.keys(packTr).filter((key) => key.startsWith('hud.pack.workshop.') || key.endsWith('Workshop'));
    assert.ok(keys.length >= 19, String(keys.length));
    for (const key of keys) {
      assert.ok(packEn[key as keyof typeof packEn], `İngilizce: ${key}`);
      assert.ok(packDe[key as keyof typeof packDe], `Almanca: ${key}`);
    }
  });
});

