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
import { MAX_PACKS, addPack, installedPacks, removePack } from '../src/packStore';
import { recordScenarioResult, scenarioRecord } from '../src/scenarioBest';

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
    unknownRef: true, conflict: true, count: true, format: true, version: true, starsOrder: true, metric: true, needsSetup: true,
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
