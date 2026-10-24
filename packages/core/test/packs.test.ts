import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACK_CODE_PREFIX,
  PACK_FORMAT,
  PACK_VERSION,
  PackCodeError,
  SCENARIOS,
  SCENARIO_BY_ID,
  decodePackCode,
  encodePackCode,
  packFromScenario,
  packScenarioId,
  registerMessages,
  registerPack,
  setLocale,
  unregisterPack,
  validatePack,
} from '@capital/content';
import type { Pack, PackScenario, ScenarioDef } from '@capital/content';
import { exportToJson, importFromJson } from '../../persistence/src/index';
// Belgedeki örnek paket: test onu her koşuda doğruluyor (paketleyici JSON'u gömüyor).
import samplePack from '../../../docs/ornek-paket.json';
import { GameEngine } from '../src/engine';
import { createScenarioGame } from '../src/scenario';
import { scenarioDefOf, scenarioProgress } from '../src/systems/scenario';
import { tilePrice } from '../src/systems/city';
import { ruleValues } from '../src/systems/rules';

/**
 * İçerik paketleri (Tur 67): biçim, doğrulama, senaryoya çevirme, kural
 * ayarları, kayıt ve paylaşım kodu.
 */
registerMessages('en', {});

/** Hazır bir senaryonun paketteki hâli: biçim hazır senaryoların hepsini taşıyabiliyor mu. */
function asPackScenario(def: ScenarioDef, id = def.id): PackScenario {
  return {
    id,
    title: def.title,
    tagline: def.tagline,
    brief: def.brief,
    goalText: def.goalText,
    facts: [...def.facts],
    seed: def.seed,
    citySize: def.citySize,
    difficulty: def.difficulty,
    preludeDays: def.preludeDays,
    ...(def.modifiers ? { rules: [...def.modifiers] } : {}),
    days: def.days,
    goal: JSON.parse(JSON.stringify(def.goal)),
    stars: { ...def.stars },
    setup: JSON.parse(JSON.stringify(def.setup)),
  };
}

function pack(scenarios: PackScenario[], extra: Partial<Pack> = {}): Pack {
  return { format: PACK_FORMAT, version: PACK_VERSION, id: 'deneme', name: 'Deneme paketi', scenarios, ...extra };
}

const rescue = () => asPackScenario(SCENARIO_BY_ID['rescue']!, 'kurtarma');

describe('paketin biçimi', () => {
  test('hazır on senaryonun hepsi paket olarak yazılabiliyor ve doğrulanıyor', () => {
    const all = pack(SCENARIOS.map((def) => asPackScenario(def)));
    const result = validatePack(JSON.parse(JSON.stringify(all)));
    assert.ok(result.ok, JSON.stringify(!result.ok && result.issues));
  });

  test('hazır senaryonun örnek paketi doğrulanıyor ve aynı şehri kuruyor', () => {
    for (const def of SCENARIOS) {
      const result = validatePack(JSON.parse(JSON.stringify(packFromScenario(def))));
      assert.ok(result.ok, `${def.id}: ${JSON.stringify(!result.ok && result.issues)}`);
    }
    const [def] = registerPack(packFromScenario(SCENARIO_BY_ID['rescue']!));
    assert.equal(def!.id, 'ornek/rescue');
    const copy = createScenarioGame(def!.id);
    const builtin = createScenarioGame('rescue');
    assert.deepEqual(copy.map, builtin.map);
    assert.deepEqual(copy.companies, builtin.companies);
    unregisterPack('ornek');
  });

  test('belgedeki örnek paket (docs/ornek-paket.json) geçerli ve oynanıyor', () => {
    const result = validatePack(JSON.parse(JSON.stringify(samplePack)));
    assert.ok(result.ok, JSON.stringify(!result.ok && result.issues));
    if (!result.ok) return;
    const defs = registerPack(result.pack);
    assert.deepEqual(defs.map((def) => def.id), ['zor-kis/kista-kurtarma', 'zor-kis/karanlik-ve-pahali']);
    const winter = createScenarioGame(defs[0]!.id);
    assert.equal(ruleValues(winter).storms.firstDay, 60);
    const dark = createScenarioGame(defs[1]!.id);
    assert.equal(ruleValues(dark).tightCredit.rateDelta, 0.06);
    unregisterPack('zor-kis');
  });

  test('her sorun yeriyle ve nedeniyle söyleniyor', () => {
    const cases: Array<[string, (doc: Record<string, any>) => void, string, string]> = [
      ['biçim', (d) => (d.format = 'baska'), 'format', 'format'],
      ['sürüm', (d) => (d.version = 2), 'version', 'version'],
      ['kimlik', (d) => (d.id = 'Büyük Harf'), 'id', 'id'],
      ['bilinmeyen alan', (d) => (d.scenarios[0].renk = 'mavi'), 'scenarios[0].renk', 'unknownField'],
      ['hedef aralığı', (d) => (d.scenarios[0].goal.target = 10), 'scenarios[0].goal.target', 'range'],
      ['tamsayı', (d) => (d.scenarios[0].days = 120.5), 'scenarios[0].days', 'integer'],
      ['ürün', (d) => (d.scenarios[0].goal = { kind: 'chain', goodId: 'yok', share: 0.4 }), 'scenarios[0].goal.goodId', 'unknownRef'],
      ['ölçü', (d) => (d.scenarios[0].stars.metric = 'lead'), 'scenarios[0].stars.metric', 'metric'],
      ['yıldız sırası', (d) => (d.scenarios[0].stars = { metric: 'days', two: 200, three: 250 }), 'scenarios[0].stars.three', 'starsOrder'],
      ['holding', (d) => (d.scenarios[0].goal = { kind: 'holding' }), 'scenarios[0].setup.secondCity', 'needsSetup'],
      ['kural', (d) => (d.scenarios[0].rules = ['yok']), 'scenarios[0].rules[0]', 'unknownRef'],
      ['şube', (d) => (d.scenarios[0].setup.outlets = ['research_center']), 'scenarios[0].setup.outlets[0]', 'unknownRef'],
      // Miras adlar katalogda yok (Codex #97): `toString` krizi doğrulamadan geçiyordu.
      ['miras kriz', (d) => (d.scenarios[0].setup.crisis = { id: 'toString', warningDays: 10 }), 'scenarios[0].setup.crisis.id', 'unknownRef'],
      ['miras bina', (d) => (d.scenarios[0].setup.outlets = ['constructor']), 'scenarios[0].setup.outlets[0]', 'unknownRef'],
      ['miras ürün', (d) => (d.scenarios[0].goal = { kind: 'chain', goodId: 'hasOwnProperty', share: 0.4 }), 'scenarios[0].goal.goodId', 'unknownRef'],
      ['metin', (d) => (d.scenarios[0].title = 'x'.repeat(80)), 'scenarios[0].title', 'length'],
      ['dil', (d) => (d.scenarios[0].title = { türkçe: 'Kurtarma' }), 'scenarios[0].title.türkçe', 'format'],
      ['çok senaryo', (d) => (d.scenarios = Array.from({ length: 13 }, (_, i) => ({ ...d.scenarios[0], id: `s${i}` }))), 'scenarios', 'count'],
      ['aynı kimlik', (d) => d.scenarios.push({ ...d.scenarios[0] }), 'scenarios[1].id', 'duplicate'],
    ];
    for (const [label, mutate, path, code] of cases) {
      const doc = JSON.parse(JSON.stringify(pack([rescue()])));
      mutate(doc);
      const result = validatePack(doc);
      assert.ok(!result.ok, label);
      if (result.ok) continue;
      assert.ok(result.issues.some((issue) => issue.path === path && issue.code === code), `${label}: ${JSON.stringify(result.issues)}`);
    }
    assert.deepEqual(validatePack(null), { ok: false, issues: [{ path: '', code: 'type', params: { expected: 'object' } }] });
  });

  test('kurallar: hazır kuralın ayarları sınırlar içinde, aynı kural iki kez seçilemiyor', () => {
    const rules = [{ id: 'sert-kis', base: 'storms', name: 'Sert kış', blurb: 'Kriz sık', params: { firstDay: 60, gapDays: [90, 120] } }];
    const ok = validatePack(pack([{ ...rescue(), rules: ['sert-kis'] }], { rules: rules as Pack['rules'] }));
    assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.issues));

    const bad = (params: Record<string, unknown>, scenarioRules = ['sert-kis']) =>
      validatePack(JSON.parse(JSON.stringify(pack([{ ...rescue(), rules: scenarioRules }], { rules: [{ ...rules[0]!, params }] as Pack['rules'] }))));
    const tooEarly = bad({ firstDay: 5 });
    assert.ok(!tooEarly.ok && tooEarly.issues.some((i) => i.path === 'rules[0].params.firstDay' && i.code === 'range'));
    const reversed = bad({ gapDays: [200, 100] });
    assert.ok(!reversed.ok && reversed.issues.some((i) => i.path === 'rules[0].params.gapDays' && i.code === 'range'));
    const unknown = bad({ hiz: 2 });
    assert.ok(!unknown.ok && unknown.issues.some((i) => i.path === 'rules[0].params.hiz' && i.code === 'unknownField'));
    // Senaryoda etkisiz kalan ayar kabul edilmiyor (Codex #97): kuruluş kredisi devirde yenisiyle değişiyor.
    const loanRule = validatePack(JSON.parse(JSON.stringify(pack([{ ...rescue(), rules: ['pahali'] }], {
      rules: [{ id: 'pahali', base: 'tight_credit', name: 'Pahalı', blurb: 'Faiz yüksek', params: { startingLoanShare: 0.8 } }],
    }))));
    assert.ok(!loanRule.ok && loanRule.issues.some((i) => i.path === 'rules[0].params.startingLoanShare' && i.code === 'unknownField'));
    const twice = bad({ firstDay: 60 }, ['sert-kis', 'storms']);
    assert.ok(!twice.ok && twice.issues.some((i) => i.path === 'scenarios[0].rules[1]' && i.code === 'conflict'));
    const shadow = validatePack(pack([rescue()], { rules: [{ ...rules[0]!, id: 'storms' }] as Pack['rules'] }));
    assert.ok(!shadow.ok && shadow.issues.some((i) => i.path === 'rules[0].id' && i.code === 'duplicate'));
  });
});

describe('paketin senaryosu oyunda', () => {
  test('kural ayarı simülasyona giriyor: kıt arsa kendi çarpanıyla, hazır kural değişmeden', () => {
    const base = asPackScenario(SCENARIO_BY_ID['renewal']!, 'pahali-arsa');
    const doc = pack([{ ...base, rules: ['cok-kit'] }], {
      id: 'arsa',
      rules: [{ id: 'cok-kit', base: 'scarce_land', name: 'Çok kıt arsa', blurb: 'Arsa üç kat', params: { priceMultiplier: 3 } }],
    });
    assert.ok(validatePack(doc).ok);
    const [def] = registerPack(doc);
    assert.equal(def!.id, packScenarioId('arsa', 'pahali-arsa'));
    assert.deepEqual(def!.modifiers, ['scarce_land']);
    assert.equal(def!.customRules?.[0]?.name, 'Çok kıt arsa');

    const custom = createScenarioGame(def!.id);
    const builtin = createScenarioGame('renewal');
    assert.equal(ruleValues(custom).scarceLand.priceMultiplier, 3);
    assert.equal(ruleValues(builtin).scarceLand.priceMultiplier, 1.7);
    assert.equal(builtin.ruleOverrides, undefined);
    // Aynı tohum, aynı şehir: aynı boş parselin fiyatı kuralın oranında.
    const tile = custom.map.tiles.find((t) => t.kind === 'plot' && !t.ownerId && !t.structureId && builtin.map.tiles[t.id]!.kind === 'plot' && !builtin.map.tiles[t.id]!.ownerId)!;
    const ratio = tilePrice(custom, tile.id) / tilePrice(builtin, tile.id);
    assert.ok(ratio > 1.5 && ratio < 2, `oran ${ratio}`);
    assert.equal(custom.scenario?.pack?.scenarios[0]?.id, 'pahali-arsa');
    unregisterPack('arsa');
  });

  test('kayıt paket yüklü olmayan cihazda da açılıyor ve koşu kendi tanımıyla sürüyor', () => {
    registerPack(pack([rescue()], { id: 'tasinan', name: { tr: 'Taşınan', en: 'Carried' } }));
    const id = packScenarioId('tasinan', 'kurtarma');
    const state = createScenarioGame(id);
    const json = exportToJson(state);
    unregisterPack('tasinan');
    // Okuma bir işlevden: TypeScript aşağıdaki kaydı "hâlâ yok" diye daraltmasın.
    const lookup = (key: string): ScenarioDef | undefined => SCENARIO_BY_ID[key];
    assert.equal(lookup(id), undefined);

    const loaded = importFromJson(json);
    assert.ok(loaded.ok);
    if (!loaded.ok) return;
    const engine = new GameEngine(loaded.state);
    const def = lookup(id);
    assert.ok(def, 'kayıttaki tanım oyuna tanıtıldı');
    assert.equal(def!.title, SCENARIO_BY_ID['rescue']!.title);
    assert.equal(def!.source?.packName, 'Taşınan');
    engine.getState().time.speed = 1;
    for (let i = 0; i < 10; i++) engine.runDay();
    assert.equal(engine.getState().scenario?.id, id);
    unregisterPack('tasinan');
  });

  test('dönüşüm istemeyen kiralık hedefi: ilerleme sayı, NaN değil (Codex #97)', () => {
    const base = asPackScenario(SCENARIO_BY_ID['renewal']!, 'yalniz-kira');
    const [def] = registerPack(pack([{ ...base, goal: { kind: 'rental', units: 400, renewals: 0 } }], { id: 'kira' }));
    const engine = new GameEngine(createScenarioGame(def!.id));
    const progress = scenarioProgress(engine.getState());
    assert.ok(progress && Number.isFinite(progress.progress) && progress.progress >= 0.25, JSON.stringify(progress));
    unregisterPack('kira');
  });

  test('aynı paketin yeni sürümü yüklense de süren koşu kendi tanımıyla (kayıttaki)', () => {
    const v1 = pack([rescue()], { id: 'surum' });
    registerPack(v1);
    const id = packScenarioId('surum', 'kurtarma');
    const engine = new GameEngine(createScenarioGame(id));
    const target = (engine.getState().scenario?.pack?.scenarios[0]?.goal as { target: number }).target;
    // Oyuncu raftan yeni sürümü yükledi: kayıt defterinde artık o.
    const v2 = pack([{ ...rescue(), goal: { kind: 'netWorth', target: target * 2 } }], { id: 'surum' });
    unregisterPack('surum');
    registerPack(v2);
    assert.equal((SCENARIO_BY_ID[id]!.goal as { target: number }).target, target * 2);
    assert.equal((scenarioDefOf(engine.getState())!.goal as { target: number }).target, target, 'koşu ilk sürümün hedefiyle');
    unregisterPack('surum');
    assert.equal((scenarioDefOf(engine.getState())!.goal as { target: number }).target, target, 'paket silinse de');
  });

  test('paketi kaldırılan süren koşu yeniden başlatılabiliyor: kayıttaki sürümle (Codex #97)', () => {
    registerPack(pack([rescue()], { id: 'kaldirilan' }));
    const id = packScenarioId('kaldirilan', 'kurtarma');
    new GameEngine(createScenarioGame(id));
    unregisterPack('kaldirilan');
    assert.equal(SCENARIO_BY_ID[id], undefined);
    const replay = createScenarioGame(id);
    assert.equal(replay.scenario?.id, id);
    assert.equal(replay.scenario?.pack?.id, 'kaldirilan');
  });

  test('metinler dil başına: etkin dil, yoksa Türkçe', () => {
    const scenario = { ...rescue(), title: { tr: 'Kurtarma operasyonu', en: 'Rescue mission' }, tagline: { en: 'Only English' } };
    const [def] = registerPack(pack([scenario], { id: 'iki-dil', name: { tr: 'İki dil', en: 'Two languages' } }));
    assert.equal(def!.title, 'Kurtarma operasyonu');
    assert.equal(def!.tagline, 'Only English');
    assert.equal(def!.source?.packName, 'İki dil');
    setLocale('en');
    try {
      assert.equal(def!.title, 'Rescue mission');
      assert.equal(def!.source?.packName, 'Two languages', 'paketin adı da dil değişince (Codex #97)');
    } finally {
      setLocale('tr');
      unregisterPack('iki-dil');
    }
  });
});

/** Kodlayıcının sınırları olmadan sıkıştırılmış kod (çözücünün kendi savunmasını sınamak için). */
async function rawCode(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return PACK_CODE_PREFIX + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('paylaşım kodu', () => {
  test('kod paketi aynen geri getiriyor; boşluk ve satır sonu sorun değil', async () => {
    const doc = pack([rescue()], { id: 'kodlu', author: 'Conforcus' });
    const code = await encodePackCode(doc);
    assert.ok(code.startsWith(PACK_CODE_PREFIX));
    assert.ok(/^CF1\.[A-Za-z0-9_-]+$/.test(code), code.slice(0, 40));
    assert.ok(code.length < JSON.stringify(doc).length, `kod ${code.length} > JSON ${JSON.stringify(doc).length}`);
    assert.deepEqual(await decodePackCode(code), JSON.parse(JSON.stringify(doc)));
    const wrapped = `${code.slice(0, 40)}\n  ${code.slice(40)} `;
    assert.deepEqual(await decodePackCode(wrapped), JSON.parse(JSON.stringify(doc)));
  });

  test('çözücünün kabul etmeyeceği kod üretilmiyor: uzun çok dilli senaryo "length" (Codex #97)', async () => {
    // Geçerli ama sıkışmayan uzun metinler: 80 dilde 690 harflik açıklama (~55 KB).
    let seed = 12345;
    const letter = () => {
      // Park–Miller: çarpım 2^53'ün altında kalıyor (büyük çarpanla sayı kesinliğini yitirip dizi tekrara düşüyordu).
      seed = (seed * 48271) % 2147483647;
      return String.fromCharCode(97 + (seed % 26));
    };
    const locales = Array.from({ length: 80 }, (_, i) => String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26)));
    const brief = Object.fromEntries(locales.map((locale) => [locale, Array.from({ length: 690 }, letter).join('')]));
    const doc = pack([{ ...rescue(), brief }], { id: 'uzun' });
    assert.ok(validatePack(JSON.parse(JSON.stringify(doc))).ok, 'paket geçerli');
    let reason = 'ok';
    try {
      await encodePackCode(doc);
    } catch (error) {
      reason = error instanceof PackCodeError ? error.code : String(error);
    }
    assert.equal(reason, 'length');
  });

  test('bozuk kod açık bir hatayla reddediliyor; büyük açılan kod da', async () => {
    const reason = async (code: string) => {
      try {
        await decodePackCode(code);
        return 'ok';
      } catch (error) {
        return error instanceof PackCodeError ? error.code : String(error);
      }
    };
    assert.equal(await reason('XYZ.abc'), 'prefix');
    assert.equal(await reason('CF1.@@@'), 'decode');
    const code = await encodePackCode(pack([rescue()]));
    assert.equal(await reason(code.slice(0, code.length - 12)), 'decode');
    // Sıkıştırma bombası: küçük kod, açılınca 64 KB'tan büyük. Kodlayıcı böyle kod
    // üretmiyor (Codex #97); başka bir araçla üretilmiş gibi elle sıkıştırılıyor.
    const bomb = await rawCode(JSON.stringify({ ...pack([rescue()]), name: 'a'.repeat(200_000) }));
    assert.ok(bomb.length < 2000, `bomba kodu ${bomb.length}`);
    assert.equal(await reason(bomb), 'length');
  });
});
