import { afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_EVENTS,
  baseText,
  BUBBLES,
  BUILDINGS,
  CARDS,
  CATEGORIES,
  CEOS,
  CITY_SIZES,
  CREDIT_RATINGS,
  CRISES,
  DIFFICULTIES,
  MODIFIERS,
  PATHS,
  WEATHERS,
  DISTRICT_ARCHETYPES,
  ERAS,
  formatPercent,
  formatShortMoney,
  formatUnitMoney,
  GOALS,
  GOODS,
  hasMessage,
  MOTION_TEXT,
  NPC_PROFILES,
  PROJECTS,
  SCENARIOS,
  ACHIEVEMENTS,
  QUESTS,
  RIVAL_LINES,
  RELATION_LINES,
  RIVAL_BIO_BY_TRAIT,
  RIVAL_CEOS,
  TEMPERAMENTS,
  availableLocales,
  loadLocale,
  registerLocaleLoader,
  registerMessages,
  SEASONS,
  setLocale,
  STRUCTURES,
  translate,
  fillTemplate,
  WAGE_POLICIES,
} from '@capital/content';
import { contentEn } from '../../content/src/i18n/en';
import { tr as uiTr } from '../../ui/src/i18n/tr';
import { en as uiEn } from '../../ui/src/i18n/en';
import { coreTr } from '../src/i18n';
import { coreEn } from '../src/i18n/en';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { formatMoney } from '../src/selectors';
import { chainCards } from '../src/chain';
import { competitionCards } from '../src/competition';
import { playerStrategy } from './proxy';

/** Türkçeye özgü harfler — İngilizce metinde kalmamalı. */
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

function placeholders(text: string): string {
  // Tekil/çoğul biçimi (`{days|# day|# days}`) de aynı yer tutucu.
  return [...text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)]
    .map((m) => m[1]!)
    .sort()
    .join(',');
}

/** Sözlüğün İngilizce karşılığı eksiksiz ve yer tutucuları birebir mi. */
function assertComplete(name: string, tr: Record<string, string>, en: Record<string, string>): void {
  const missing = Object.keys(tr).filter((key) => en[key] === undefined);
  assert.deepEqual(missing, [], `${name}: İngilizcesi olmayan anahtarlar`);
  const extra = Object.keys(en).filter((key) => tr[key] === undefined);
  assert.deepEqual(extra, [], `${name}: Türkçede olmayan anahtarlar`);
  for (const key of Object.keys(tr)) {
    assert.equal(placeholders(en[key]!), placeholders(tr[key]!), `${name}: ${key} yer tutucuları farklı`);
    assert.ok(!TURKISH.test(en[key]!), `${name}: ${key} Türkçe harf içeriyor: ${en[key]}`);
  }
}

/** Oyunun state'e yazdığı görünen metin alanları: haber, önerge, sözleşme, bölge ve şirket adı. */
const TEXT_FIELDS = new Set(['title', 'body', 'summary', 'name']);

/** Görünen metinler çıkarılmış durum; kimlikler, sayılar ve yapı olduğu gibi. */
function withoutText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutText);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = TEXT_FIELDS.has(key) && typeof item === 'string' ? '<metin>' : withoutText(item);
    }
    return out;
  }
  return value;
}

function byId<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((entry) => [entry.id, entry]));
}

function play(locale: string, days: number): GameEngine {
  setLocale(locale);
  const engine = new GameEngine(createNewGame({ seed: 5 }));
  for (let day = 1; day <= days; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine;
}

// İngilizce sözlükler dil seçilince iniyor (Tur 46); testler önce indiriyor.
before(async () => {
  assert.equal(await loadLocale('en'), true);
});

afterEach(() => {
  setLocale('tr');
});

describe('sözlük motoru', () => {
  test('eksik anahtar Türkçeye, o da yoksa yedeğe, o da yoksa anahtara düşer', () => {
    registerMessages('tr', { 'test.onlyTr': 'yalnız Türkçe {n}' });
    setLocale('en');
    assert.equal(translate('test.onlyTr', { n: 3 }), 'yalnız Türkçe 3');
    assert.equal(translate('test.none', undefined, 'yedek'), 'yedek');
    assert.equal(translate('test.none'), 'test.none');
  });

  test('parametrede olmayan yer tutucu olduğu gibi kalır', () => {
    registerMessages('en', { 'test.partial': '{a} and {b}' });
    setLocale('en');
    assert.equal(translate('test.partial', { a: 1 }), '1 and {b}');
  });

  test('sayıya göre tekil ya da çoğul: "{days|# day|# days}" (Tur 50)', () => {
    registerMessages('en', { 'test.plural': 'ends in {days|# day|# days} · {count|one rival is|# rivals are} left' });
    setLocale('en');
    assert.equal(translate('test.plural', { days: 1, count: 1 }), 'ends in 1 day · one rival is left');
    assert.equal(translate('test.plural', { days: 12, count: 3 }), 'ends in 12 days · 3 rivals are left');
    assert.equal(translate('test.plural', { days: '1', count: 0 }), 'ends in 1 day · 0 rivals are left');
    assert.equal(translate('test.plural', { count: 2 }), 'ends in {days|# day|# days} · 2 rivals are left');
  });

  test('sonradan yüklenen dil: seçilebilir görünüyor, inmeden geçilmiyor, bir kez iniyor (Tur 46)', async () => {
    let calls = 0;
    registerLocaleLoader('xa', async () => {
      calls++;
      registerMessages('xa', { 'test.late': 'geç geldi' });
    });
    assert.ok(availableLocales().includes('xa'), 'seçicide görünüyor');
    assert.equal(setLocale('xa'), false, 'sözlük inmeden geçilmiyor');
    const [first, second] = await Promise.all([loadLocale('xa'), loadLocale('xa')]);
    assert.equal(first && second, true);
    assert.equal(await loadLocale('xa'), true);
    assert.equal(calls, 1, 'aynı anda iki istek de tek indirme');
    assert.equal(setLocale('xa'), true);
    assert.equal(translate('test.late'), 'geç geldi');
  });

  test('sonradan yüklenen dil inmezse hata dönüyor, sonraki çağrı yeniden deniyor (Tur 46)', async () => {
    let fail = true;
    registerLocaleLoader('xb', async () => {
      if (fail) throw new Error('ağ yok');
      registerMessages('xb', { 'test.retry': 'ikinci denemede' });
    });
    await assert.rejects(loadLocale('xb'));
    assert.equal(setLocale('xb'), false);
    fail = false;
    assert.equal(await loadLocale('xb'), true);
    assert.equal(setLocale('xb'), true);
    assert.equal(translate('test.retry'), 'ikinci denemede');
  });

  test('kayıtlı olmayan dile geçilmez', () => {
    assert.equal(setLocale('xx'), false);
    assert.equal(translate('core.npc.pruneCity'), coreTr['core.npc.pruneCity']);
  });

  test('yüzde ve para dile göre biçimleniyor', () => {
    assert.equal(formatPercent(45), '%45');
    assert.equal(formatMoney(1_234_000), '1,23 M ₺');
    assert.equal(formatMoney(2_500_000_000), '2,50 Mr ₺');
    assert.equal(formatMoney(-45_600), '-46 B ₺');
    assert.equal(formatMoney(1234), '1.234 ₺');
    assert.equal(formatShortMoney(1_200_000), '1,2M ₺');
    assert.equal(formatUnitMoney(2.8), '2,80 ₺');
    setLocale('en');
    assert.equal(formatPercent(45), '45%');
    assert.equal(formatMoney(1_234_000), '₺1.23M');
    assert.equal(formatMoney(2_500_000_000), '₺2.50B');
    assert.equal(formatMoney(-45_600), '-₺46K');
    assert.equal(formatMoney(1234), '₺1,234');
    assert.equal(formatShortMoney(1_200_000), '₺1.2M');
    assert.equal(formatUnitMoney(2.8), '₺2.80');
  });

  /*
   * Türkçede ondalık virgül, binlik nokta (Tur 44). Para eskiden "1.23 M ₺"
   * yazıyordu; hemen yanında "1.234 ₺" bin iki yüz otuz dört demek. Yüzde ve
   * ondalıklar zaten virgüllüydü ("%3,5").
   */
  test('Türkçe metinlerde ondalık ayırıcı virgül', () => {
    const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Virgül AŞ' }));
    for (let day = 1; day <= 400; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    const state = engine.getState();
    // Kartların bütün metin alanları; sayı alanları (oranlar) metin değil.
    const strings = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(strings)
          : [];
    const texts = [
      ...state.news.map((item) => `${item.title} ${item.body}`),
      ...strings(chainCards(state, state.playerCompanyId)),
      ...strings(competitionCards(state, state.playerCompanyId)),
    ].join('\n');
    // "12.34" biçimi Türkçede yalnız binlik olabilir: üç haneden az ondalık kuyruğu nokta değil.
    assert.equal(texts.match(/\d\.\d{1,2}(?!\d)/)?.[0], undefined, 'Türkçe metinde noktalı ondalık');
  });
});

describe('İngilizce sözlükler', () => {
  test('sayıdan sonra gelen isim tekilini de taşıyor: "1 days" yok (Tur 50)', () => {
    // Geri sayım 1'e indiğinde "Auction · 1 days" yazıyordu. Sayı alan her
    // çoğul isim `{n|# day|# days}` biçiminde; "(s)" eki de yok.
    const nouns = 'days|shares|stores|plots|rivals|cities|runs|stars|partners|quests|buildings|projects';
    const bare = new RegExp(`\\{\\w+\\} (${nouns})\\b|\\(s\\)`);
    // Biçim yalnız sayı alır: ay, semt, kategori adı tekil/çoğul olmaz
    // ("{month|# quest|# quests}" Mart görevlerini sayı sanıyordu; Codex #79).
    const words = /\{(month|district|category|name|good|place|title|company|player|ceo|city|members|leader)\|/;
    const found: string[] = [];
    for (const [name, dictionary] of [['arayüz', uiEn], ['çekirdek', coreEn], ['içerik', contentEn]] as const) {
      for (const [key, text] of Object.entries(dictionary as Record<string, string>)) {
        if (bare.test(text) || words.test(text)) found.push(`${name} ${key}: ${text}`);
      }
    }
    assert.deepEqual(found, []);
  });

  test('tekil biçimde fiil de tekil: "1 share are" yok (Codex #79)', () => {
    // Biçim yalnız ismi değiştirirse fiil dışarıda çoğul kalıyordu. Her
    // tekil/çoğul metni bütün sayıları 1 vererek doldur, isimden sonra
    // çoğul fiil arama.
    const found: string[] = [];
    for (const [name, dictionary] of [['arayüz', uiEn], ['çekirdek', coreEn], ['içerik', contentEn]] as const) {
      for (const [key, text] of Object.entries(dictionary as Record<string, string>)) {
        const plural = [...text.matchAll(/\{(\w+)\|[^|{}]*\|[^|{}]*\}/g)].map((m) => m[1]!);
        if (plural.length === 0) continue;
        const ones = Object.fromEntries(plural.map((p) => [p, 1]));
        const singular = fillTemplate(text, ones);
        if (/\b1 [a-z]+ (are|were|have|go|reach|need)\b/.test(singular)) found.push(`${name} ${key}: ${singular}`);
      }
    }
    assert.deepEqual(found, []);
  });

  test('çekirdek metinlerinin hepsi İngilizcede var', () => {
    const en: Record<string, string> = {};
    for (const key of Object.keys(coreTr)) {
      setLocale('en');
      if (hasMessage(key, 'en')) en[key] = translate(key);
    }
    setLocale('tr');
    assertComplete('çekirdek', coreTr, en);
  });

  test('arayüz metinlerinin hepsi İngilizcede var', () => {
    assertComplete('arayüz', uiTr, uiEn);
  });

  test('her içerik metninin İngilizcesi var, fazlası yok', () => {
    // localize.ts'in bağladığı alanların tam listesi; kimliği değişen bir
    // binanın eski çevirisi sessizce kalmasın, yeni bir olay çevrilmeden girmesin.
    const lists: [string, Record<string, object>, string[]][] = [
      ['building', byId(BUILDINGS), ['name', 'description']],
      ['good', byId(GOODS), ['name']],
      ['category', CATEGORIES, ['name']],
      ['district', DISTRICT_ARCHETYPES, ['name']],
      ['citySize', byId(CITY_SIZES), ['name', 'blurb', 'facts']],
      ['event', byId(ALL_EVENTS), ['title', 'body']],
      ['era', byId(ERAS), ['title', 'body']],
      ['structure', byId(STRUCTURES), ['name', 'description']],
      ['goal', byId(GOALS), ['title', 'hint']],
      ['difficulty', byId(DIFFICULTIES), ['name', 'blurb', 'facts']],
      ['modifier', byId(MODIFIERS), ['name', 'blurb', 'facts']],
      ['path', byId(PATHS), ['name', 'blurb']],
      ['weather', byId(WEATHERS), ['name']],
      ['motion', MOTION_TEXT, ['title', 'summary']],
      ['wage', WAGE_POLICIES, ['name', 'blurb']],
      ['rating', CREDIT_RATINGS, ['blurb']],
      ['ceo', byId(CEOS), ['title', 'perk', 'drawback', 'bio']],
      ['rival', byId(NPC_PROFILES), ['description']],
      ['crisis', byId(CRISES), ['title', 'warningTitle', 'warningBody', 'body', 'endTitle', 'endBody']],
      ['card', byId(CARDS), ['title', 'body']],
      ...CARDS.map((card): [string, Record<string, object>, string[]] => [
        `card.${card.id}.choice`,
        byId(card.choices),
        ['label', 'flavor', 'result', 'failResult'],
      ]),
      ['rivalLine', RIVAL_LINES, Object.keys(RIVAL_LINES.expansionist)],
      ['temperament', TEMPERAMENTS, ['name', 'description']],
      ['rivalCeo', RIVAL_CEOS, ['bio']],
      ['rivalBio', RIVAL_BIO_BY_TRAIT, ['bio']],
      ['relationLine', RELATION_LINES, Object.keys(RELATION_LINES.vindictive)],
      ['bubble', byId(BUBBLES), ['title', 'caught']],
      ['quest', byId(QUESTS), ['title', 'hint']],
      ['season', byId(SEASONS), ['name', 'news']],
      ['project', byId(PROJECTS), ['name', 'pitch']],
      ['scenario', byId(SCENARIOS), ['title', 'tagline', 'brief', 'goalText', 'facts']],
      ['achievement', byId(ACHIEVEMENTS), ['title', 'hint']],
    ];
    const expected = new Set<string>();
    for (const [kind, record, fields] of lists) {
      for (const [id, entry] of Object.entries(record)) {
        for (const field of fields) {
          const value = (entry as Record<string, unknown>)[field];
          if (Array.isArray(value)) value.forEach((_, index) => expected.add(`content.${kind}.${id}.${field}.${index}`));
          else if (typeof value === 'string') expected.add(`content.${kind}.${id}.${field}`);
        }
      }
    }
    const english = new Set(Object.keys(contentEn));
    assert.deepEqual([...expected].filter((key) => !english.has(key)), [], 'İngilizcesi olmayan içerik alanları');
    assert.deepEqual([...english].filter((key) => !expected.has(key)), [], 'karşılığı olmayan İngilizce içerik anahtarları');
    for (const [key, text] of Object.entries(contentEn)) assert.ok(!TURKISH.test(text), `${key} Türkçe harf içeriyor: ${text}`);
  });

  test('içerik alanı etkin dili okuyor, temel metin Türkçe kalıyor', () => {
    const building = BUILDINGS[0]!;
    const turkish = building.name;
    setLocale('en');
    assert.equal(building.name, contentEn[`content.building.${building.id}.name` as keyof typeof contentEn]);
    assert.notEqual(building.name, turkish);
    assert.equal(baseText(building, 'name'), turkish);
    setLocale('tr');
    assert.equal(building.name, turkish);
  });
});

describe('dil ve simülasyon', () => {
  test('aynı tohum iki dilde aynı oyunu oynuyor', () => {
    const turkish = withoutText(play('tr', 150).getState());
    const english = withoutText(play('en', 150).getState());
    const { meta: _a, ...tr } = turkish as Record<string, unknown>;
    const { meta: _b, ...en } = english as Record<string, unknown>;
    assert.deepEqual(en, tr);
  });

  test('İngilizce oyunun haberlerinde ham anahtar ya da doldurulmamış yer tutucu yok', () => {
    const state = play('en', 150).getState();
    assert.ok(state.news.length > 5, 'haber üretilmedi');
    for (const item of state.news) {
      for (const text of [item.title, item.body]) {
        assert.ok(!/\b(core|content)\.\w+\.\w+/.test(text), `ham anahtar: ${text}`);
        assert.ok(!/\{\w+\}/.test(text), `doldurulmamış yer tutucu: ${text}`);
      }
    }
  });
});
