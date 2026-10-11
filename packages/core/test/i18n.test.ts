import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS,
  CATEGORIES,
  CEOS,
  CITY_SIZES,
  CREDIT_RATINGS,
  DIFFICULTIES,
  DISTRICT_ARCHETYPES,
  ERAS,
  EVENTS,
  GOALS,
  GOODS,
  MOTION_TEXT,
  NPC_PROFILES,
  STRUCTURES,
  WAGE_POLICIES,
  baseText,
  formatPercent,
  hasMessage,
  registerMessages,
  setLocale,
  translate,
} from '@capital/content';
import { contentEn } from '../../content/src/i18n/en';
import { tr as uiTr } from '../../ui/src/i18n/tr';
import { en as uiEn } from '../../ui/src/i18n/en';
import { coreTr } from '../src/i18n';
import { GameEngine } from '../src/engine';
import { createNewGame } from '../src/worldgen';
import { formatMoney } from '../src/selectors';
import { playerStrategy } from './proxy';

/** Türkçeye özgü harfler — İngilizce metinde kalmamalı. */
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

function placeholders(text: string): string {
  return [...text.matchAll(/\{(\w+)\}/g)]
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

  test('kayıtlı olmayan dile geçilmez', () => {
    assert.equal(setLocale('xx'), false);
    assert.equal(translate('core.npc.pruneCity'), coreTr['core.npc.pruneCity']);
  });

  test('yüzde ve para dile göre biçimleniyor', () => {
    assert.equal(formatPercent(45), '%45');
    assert.equal(formatMoney(1_234_000), '1.23 M ₺');
    assert.equal(formatMoney(-45_600), '-46 B ₺');
    assert.equal(formatMoney(1234), '1.234 ₺');
    setLocale('en');
    assert.equal(formatPercent(45), '45%');
    assert.equal(formatMoney(1_234_000), '₺1.23M');
    assert.equal(formatMoney(-45_600), '-₺46K');
    assert.equal(formatMoney(1234), '₺1,234');
  });
});

describe('İngilizce sözlükler', () => {
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
      ['event', byId(EVENTS), ['title', 'body']],
      ['era', byId(ERAS), ['title', 'body']],
      ['structure', byId(STRUCTURES), ['name', 'description']],
      ['goal', byId(GOALS), ['title', 'hint']],
      ['difficulty', byId(DIFFICULTIES), ['name', 'blurb', 'facts']],
      ['motion', MOTION_TEXT, ['title', 'summary']],
      ['wage', WAGE_POLICIES, ['name', 'blurb']],
      ['rating', CREDIT_RATINGS, ['blurb']],
      ['ceo', byId(CEOS), ['title', 'perk', 'drawback', 'bio']],
      ['rival', byId(NPC_PROFILES), ['description']],
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
