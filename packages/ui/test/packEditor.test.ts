import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { GOAL_KINDS, PACK_LIMITS, SCENARIO_BY_ID, SCENARIOS, registerMessages, setLocale, validatePack } from '@capital/content';
import type { Pack, PackIssue } from '@capital/content';
import PackEditor, { issuePlace } from '../src/PackEditor';
import { parseNumber } from '../src/packEditorFields';
import { draftDirty, draftFrom, freshDraft, loadDraft, normalizedDraft, storeDraft } from '../src/packDraft';
import {
  draftLocales,
  getAt,
  issuesAt,
  pathKey,
  ruleChoice,
  setAt,
  uniqueId,
  withGoalKind,
  withLocales,
  withNewRule,
  withRuleChoice,
  withRuleId,
  withScenarioCopy,
  withSetupPart,
  withoutRule,
  withoutScenario,
  writeText,
} from '../src/packEditorModel';
import type { SetupPart } from '../src/packEditorModel';

/**
 * Senaryo editörü (Tur 68): taslağın modeli (yollar, diller, hedef türü,
 * devrin parçaları, kurallar), sorunların yeri ve editörün kendisi.
 */
registerMessages('en', {});

const base = (): Pack => draftFrom(SCENARIO_BY_ID['rescue']!);
const valid = (doc: Pack) => {
  const result = validatePack(JSON.parse(JSON.stringify(doc)));
  assert.ok(result.ok, JSON.stringify(!result.ok && result.issues));
};

describe('taslağın yolları', () => {
  test('yolun yazımı doğrulayıcınınkiyle aynı; okuma, yazma, silme', () => {
    assert.equal(pathKey(['scenarios', 0, 'goal', 'target']), 'scenarios[0].goal.target');
    assert.equal(pathKey(['rules', 2, 'params', 'gapDays']), 'rules[2].params.gapDays');
    const doc = base();
    const next = setAt(doc, ['scenarios', 0, 'goal', 'target'], 5_000_000);
    assert.equal(getAt(next, ['scenarios', 0, 'goal', 'target']), 5_000_000);
    assert.notEqual(getAt(doc, ['scenarios', 0, 'goal', 'target']), 5_000_000, 'eski belge değişmedi');
    assert.equal(next.scenarios[0]!.setup, doc.scenarios[0]!.setup, 'yol dışı paylaşılıyor');
    const cleared = setAt(next, ['author'], undefined);
    assert.ok(!('author' in cleared));
    const withAuthor = setAt(doc, ['author'], 'Conforcus');
    assert.ok(!('author' in setAt(withAuthor, ['author'], undefined)), 'boşalan isteğe bağlı alan siliniyor');
  });

  test('alanın sorunları: tam yol, istenirse altındakiler', () => {
    const issues: PackIssue[] = [
      { path: 'scenarios[0].title', code: 'missing' },
      { path: 'scenarios[0].title.en', code: 'missing' },
      { path: 'scenarios[0].titleX', code: 'unknownField' },
      { path: 'scenarios[0].rules[1]', code: 'unknownRef' },
    ];
    assert.equal(issuesAt(issues, 'scenarios[0].title').length, 1);
    assert.equal(issuesAt(issues, 'scenarios[0].title', true).length, 2);
    assert.equal(issuesAt(issues, 'scenarios[0].rules', true).length, 1);
  });
});

describe('diller', () => {
  test('ikinci dil eklenince metinler dil başına, yenisi boş (doğrulayıcı "eksik"); çıkarınca yine düz', () => {
    const doc = base();
    assert.deepEqual(draftLocales(doc, 'tr'), ['tr']);
    const two = withLocales(doc, ['tr'], ['tr', 'en']);
    assert.deepEqual(two.scenarios[0]!.title, { tr: doc.scenarios[0]!.title, en: '' });
    assert.deepEqual(draftLocales(two, 'tr'), ['tr', 'en']);
    const result = validatePack(two);
    assert.ok(!result.ok);
    if (!result.ok) assert.ok(result.issues.every((issue) => issue.code === 'missing' && issue.path.endsWith('.en')), JSON.stringify(result.issues));

    const written = setAt(two, ['scenarios', 0, 'title'], writeText(two.scenarios[0]!.title, 'en', 'Rescue', ['tr', 'en']));
    assert.deepEqual(written.scenarios[0]!.title, { tr: doc.scenarios[0]!.title, en: 'Rescue' });
    const back = withLocales(written, ['tr', 'en'], ['en']);
    assert.equal(back.scenarios[0]!.title, 'Rescue');
    assert.equal(back.name, doc.name, 'İngilizcesi boş metin Türkçesiyle kalıyor');
  });
});

describe('hedef, devir, kurallar', () => {
  test('her hedef türüne geçiş geçerli bir senaryo veriyor; yıldız ölçüsü hedefe göre', () => {
    for (const kind of GOAL_KINDS) {
      const scenario = withGoalKind(base().scenarios[0]!, kind);
      valid({ ...base(), scenarios: [scenario] });
      assert.equal(scenario.goal.kind, kind);
    }
    const lead = withGoalKind(base().scenarios[0]!, 'leadAtEnd');
    assert.equal(lead.stars.metric, 'lead');
    const holding = withGoalKind(base().scenarios[0]!, 'holding');
    assert.ok(holding.setup.secondCity, 'holding ikinci şehirle');
  });

  test('devrin her parçası eklenince geçerli, çıkarınca gidiyor', () => {
    const parts: SetupPart[] = ['outlets', 'idle', 'builtDaysAgo', 'loan', 'raiderStake', 'crisis', 'consortium', 'projects', 'freeze', 'secondCity', 'feud'];
    let scenario = base().scenarios[0]!;
    for (const part of parts) {
      scenario = withSetupPart(scenario, part, true);
      valid({ ...base(), scenarios: [scenario] });
    }
    for (const part of parts) scenario = withSetupPart(scenario, part, false);
    assert.deepEqual(Object.keys(scenario.setup), ['cash']);
  });

  test('kural seçimi: hazır kural bir kez; paketin kuralı yerine geçiyor; silinen kural senaryodan da çıkıyor', () => {
    let doc = base();
    let scenario = withRuleChoice(doc, doc.scenarios[0]!, 'storms', 'storms');
    assert.deepEqual(scenario.rules, ['storms']);
    const added = withNewRule(doc, 'storms', 'Sert kış', 'Kriz sık');
    doc = added.doc;
    assert.equal(added.id, 'storms-ayar');
    scenario = withRuleChoice(doc, scenario, 'storms', added.id);
    assert.deepEqual(scenario.rules, ['storms-ayar'], 'aynı hazır kurala bağlı eski seçim çıktı');
    assert.equal(ruleChoice(doc, scenario, 'storms'), 'storms-ayar');
    doc = { ...doc, scenarios: [scenario] };
    valid(doc);
    doc = setAt(doc, ['rules', 0, 'params', 'firstDay'], 60);
    valid(doc);
    // Kimliği değişen kural: senaryo yeni kimliği izliyor.
    const renamed = withRuleId(doc, 0, 'sert-kis');
    assert.deepEqual(renamed.doc.scenarios[0]!.rules, ['sert-kis']);
    assert.equal(renamed.pending, null);
    valid(renamed.doc);
    const removed = withoutRule(doc, 0);
    assert.equal(removed.rules, undefined);
    assert.equal(removed.scenarios[0]!.rules, undefined);
    valid(removed);
    assert.equal(withNewRule(withNewRule(base(), 'storms', 'a', 'b').doc, 'storms', 'a', 'b').id, 'storms-ayar-2');
  });

  test('kimlik yazılırken başka kuralınkiyle çakışınca başvurular karışmıyor (Codex #98)', () => {
    // İki kural, iki ayrı hazır kurala bağlı; senaryo ikisini de seçmiş.
    let doc = withNewRule(base(), 'storms', 'A', 'a').doc;
    doc = withNewRule(doc, 'tight_credit', 'B', 'b').doc;
    doc = setAt(doc, ['rules', 0, 'id'], 'kural-a');
    doc = setAt(doc, ['rules', 1, 'id'], 'kural-b');
    doc = setAt(doc, ['scenarios', 0, 'rules'], ['kural-a', 'kural-b']);
    valid(doc);
    // A önce B'nin kimliğinden geçiyor (çakışma), sonra tek bir kimliğe varıyor.
    const clash = withRuleId(doc, 0, 'kural-b');
    assert.deepEqual(clash.doc.scenarios[0]!.rules, ['kural-a', 'kural-b'], 'çakışırken başvuru taşınmıyor');
    assert.equal(clash.pending, 'kural-a');
    const done = withRuleId(clash.doc, 0, 'kural-c', clash.pending!);
    assert.deepEqual(done.doc.scenarios[0]!.rules, ['kural-c', 'kural-b'], "B'nin seçimi yerinde");
    assert.equal(done.pending, null);
    valid(done.doc);
    // Hazır kuralın kimliği de çakışma.
    assert.equal(withRuleId(doc, 0, 'storms').pending, 'kural-a');
  });

  test('senaryo çoğaltma yeni kimlikle, en fazla 12; son senaryo silinmiyor', () => {
    let doc = base();
    for (let i = 1; i < PACK_LIMITS.scenarios; i++) doc = withScenarioCopy(doc, 0).doc;
    assert.equal(doc.scenarios.length, PACK_LIMITS.scenarios);
    assert.equal(new Set(doc.scenarios.map((s) => s.id)).size, PACK_LIMITS.scenarios);
    valid(doc);
    assert.equal(withScenarioCopy(doc, 0).doc.scenarios.length, PACK_LIMITS.scenarios);
    assert.equal(withoutScenario(base(), 0).scenarios.length, 1);
    assert.equal(uniqueId('Büyük Kurtarma!', []), 'b-y-k-kurtarma');
    assert.equal(uniqueId('rescue', ['rescue', 'rescue-2']), 'rescue-3');
  });
});

describe('sorunun yeri ve sayılar', () => {
  test('sorun yolu alan adıyla okunuyor', () => {
    setLocale('tr');
    const doc = withNewRule(base(), 'storms', 'Sert kış', 'x').doc;
    assert.equal(issuePlace(doc, 'scenarios[0].title.en', ['tr', 'en']), 'Kurtarma · Başlık (English)');
    assert.equal(issuePlace(doc, 'scenarios[0].setup.loan.amount', ['tr']), 'Kurtarma · Kalan anapara');
    assert.equal(issuePlace(doc, 'scenarios[0].setup.crisis.warningDays', ['tr']), 'Kurtarma · Uyarıda başlayan kriz');
    assert.equal(issuePlace(doc, 'rules[0].params.firstDay', ['tr']), 'Sert kış · İlk kriz uyarısı (gün)');
    assert.equal(issuePlace(doc, 'id', ['tr']), 'Paket kimliği');
    assert.equal(issuePlace(doc, 'scenarios[0].goal.target', ['tr']), 'Kurtarma · Hedef tutar');
    assert.equal(issuePlace(doc, 'garip', ['tr']), 'garip');
  });

  test('sayı etkin dilin ondalık işaretiyle; binlik ayraçları yok sayılıyor; okunamayan null', () => {
    setLocale('tr');
    assert.equal(parseNumber('1,5'), 1.5);
    assert.equal(parseNumber('1.500.000'), 1_500_000);
    assert.equal(parseNumber(' 12 000 '), 12_000);
    assert.equal(parseNumber('1.2'), 1.2, 'üçlü grup değilse nokta da ondalık');
    assert.equal(parseNumber('1.500'), 1500);
    assert.equal(parseNumber('abc'), null);
    assert.equal(parseNumber(''), null);
    setLocale('en');
    assert.equal(parseNumber('1.5'), 1.5);
    assert.equal(parseNumber('1,500'), 1500);
    assert.equal(parseNumber('1,5'), 1.5);
    setLocale('tr');
  });
});

describe('taslak', () => {
  test('raftan ya da örnekten açılan taslak kaydedilmiş sayılıyor; değişince değil', () => {
    const draft = freshDraft(base());
    assert.equal(draftDirty(draft), false);
    assert.equal(draftDirty({ ...draft, doc: setAt(draft.doc, ['name'], 'Başka') }), true);
    assert.equal(draftDirty(null), false);
  });

  test('bozuk taslak yerine yenisi; biçim ve sürüm yerinde', () => {
    assert.equal(normalizedDraft(null, base).id, 'paketim');
    assert.equal(normalizedDraft({ scenarios: [] }, base).id, 'paketim');
    const kept = normalizedDraft({ ...base(), id: 'benim', format: 'eski', version: 0 }, base);
    assert.equal(kept.id, 'benim');
    assert.equal(kept.format, 'capitalforge-pack');
    assert.equal(kept.version, 1);
  });

  test('depo varsa taslak saklanıp geri okunuyor; yoksa sessizce yok', () => {
    assert.equal(loadDraft(), null);
    storeDraft(freshDraft(base()));
    const memory = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
    };
    try {
      storeDraft({ ...freshDraft(base()), index: 0 });
      assert.equal(loadDraft()?.doc.id, 'paketim');
      assert.ok(memory.has('capitalforge.pack-draft.v1'));
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  });
});

describe('editör', () => {
  const render = (doc: Pack) =>
    renderToStaticMarkup(
      createElement(PackEditor, {
        draft: freshDraft(doc),
        example: SCENARIOS[0]!,
        onClose: () => undefined,
        onTry: () => undefined,
        onSaved: () => undefined,
      }),
    );

  test('geçerli taslak: alanlar sınırlarıyla, ön izleme kurulum ekranındaki kart, durum hazır', () => {
    setLocale('tr');
    const html = render(base());
    assert.match(html, /data-pack-editor/);
    assert.match(html, /data-editor-status="ok"/);
    assert.match(html, /data-editor-preview="live"/);
    assert.match(html, /data-edit-path="scenarios\[0\]\.goal\.target"/);
    assert.match(html, /Hedef tutar<\/label><span class="editor-aside">100 B ₺ – 100,00 Mr ₺<\/span>/, 'hedefin aralığı tablodan, para biçiminde');
    assert.match(html, /data-scenario="paketim\/rescue"/, 'ön izleme kartı');
    assert.ok(!/disabled=""[^>]*data-editor-try/.test(html), 'dene açık');
  });

  test('hatalı taslak: sorun alanın altında ve listede, dene ve kaydet kapalı, ön izleme yok', () => {
    setLocale('tr');
    const broken = setAt(base(), ['scenarios', 0, 'goal', 'target'], 10);
    const html = render(broken);
    assert.match(html, /data-editor-status="1"/);
    assert.match(html, /arasında olmalı/);
    assert.match(html, /Kurtarma · Hedef tutar/);
    assert.match(html, /disabled=""[^>]*data-editor-try|data-editor-try[^>]*disabled=""/);
    assert.match(html, /data-editor-preview="none"/);
  });
});
