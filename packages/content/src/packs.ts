import { BUILDINGS } from './buildings';
import { CATEGORIES } from './categories';
import { CITY_TYPES } from './cityTypes';
import type { CityTypeId } from './cityTypes';
import { DIFFICULTIES } from './difficulty';
import type { DifficultyId } from './difficulty';
import { CITY_SIZES } from './districts';
import type { CitySizeId } from './districts';
import { CRISES } from './economy';
import { GOODS } from './goods';
import { textLocales } from './messages';
import { MODIFIERS, RULE_KEY } from './modifiers';
import type { ModifierId } from './modifiers';
import { SCENARIOS, SCENARIO_BY_ID, bindScenarioDef, embeddedScenarioDef } from './scenarios';
import type { ScenarioDef, ScenarioGoal, ScenarioSetup, ScenarioStars } from './scenarios';
import type { CategoryId } from './types';

/**
 * İçerik paketleri (Tur 67): senaryolar ve kurallar dosyadan.
 *
 * Bir paket düz bir JSON belgesi: kimliği, adı, isteğe bağlı kuralları ve
 * bir ya da birkaç senaryosu var. Senaryo hazır senaryoların tanımıyla aynı
 * parçalardan (`ScenarioDef`: tohum, ön tarih, süre, hedef, yıldız, devir);
 * kural hazır dört ek kuraldan birinin ayarları, sınırlar içinde
 * değiştirilmiş hâli ("sert kış": kriz arası 100–160 gün). Oyun yeni bir
 * mekanik okumuyor: paket yalnız var olanları bir araya getiriyor.
 *
 * Doğrulama her sorunu yeriyle söylüyor (`scenarios[0].goal.target`:
 * "100 bin ile 100 milyar arasında olmalı"); geçmeyen paket yüklenmiyor.
 * Metinler tek dilde ya da dil başına (`{ "tr": …, "en": … }`); oyun etkin
 * dildekini, yoksa Türkçeyi, o da yoksa ilkini gösteriyor.
 *
 * Paylaşım kodu (`CF1.…`) paketin sıkıştırılmış hâli: bir senaryo ve
 * kullandığı kurallar. Oyuna yapıştırılıyor ya da bağlantıyla geliyor.
 */
export const PACK_FORMAT = 'capitalforge-pack';
export const PACK_VERSION = 1;

/** Tek dilde ya da dil başına metin. */
export type PackText = string | Readonly<Record<string, string>>;

/** Kuralın ayarları: hazır kuralın değerleri (`MODIFIER_RULES`), sınırlar içinde. */
export interface RuleOverrides {
  storms?: { firstDay?: number; firstSpread?: number; gapDays?: readonly [number, number]; buildDiscount?: boolean };
  hungryRivals?: { budgetMultiplier?: number; raidWarmupMultiplier?: number };
  tightCredit?: { rateDelta?: number; limitMultiplier?: number; startingLoanShare?: number; startingLoanDays?: number };
  scarceLand?: { priceMultiplier?: number; unlockDelay?: number };
}


export interface PackRule {
  id: string;
  /** Hangi hazır kuralın ayarları. */
  base: ModifierId;
  name: PackText;
  blurb: PackText;
  params?: Record<string, unknown>;
}

export interface PackScenario {
  id: string;
  title: PackText;
  tagline: PackText;
  brief: PackText;
  goalText: PackText;
  facts?: readonly PackText[];
  seed: number;
  citySize: CitySizeId;
  /** Şehrin türü (Tur 79); yoksa dengeli. */
  cityType?: CityTypeId;
  difficulty: DifficultyId;
  preludeDays: number;
  /** Hazır kural kimlikleri ya da paketin kendi kurallarının kimlikleri. */
  rules?: readonly string[];
  days: number;
  goal: ScenarioGoal;
  stars: ScenarioStars;
  setup: ScenarioSetup;
}

export interface Pack {
  format: typeof PACK_FORMAT;
  version: number;
  id: string;
  name: PackText;
  author?: string;
  rules?: readonly PackRule[];
  scenarios: readonly PackScenario[];
}

/** Paketten gelen senaryonun kökü; kural ayarları ve kendi adlı kuralları onunla. */
export interface PackScenarioSource {
  packId: string;
  packName: string;
  author?: string;
  /** Senaryonun yeniden kurulabilmesi için tek senaryoluk paket (kayıtta ve paylaşım kodunda). */
  doc: Pack;
}

/** Arayüzün çevirdiği sorun kodları (`hud.pack.issue.<code>`). */
export type PackIssueCode =
  | 'type'
  | 'missing'
  | 'unknownField'
  | 'range'
  | 'integer'
  | 'enum'
  | 'id'
  | 'length'
  | 'duplicate'
  | 'unknownRef'
  | 'conflict'
  | 'count'
  | 'format'
  | 'version'
  | 'starsOrder'
  | 'metric'
  | 'needsSetup'
  | 'placeholder';

export interface PackIssue {
  path: string;
  code: PackIssueCode;
  params?: Record<string, string | number>;
}

export type PackResult = { ok: true; pack: Pack } | { ok: false; issues: PackIssue[] };

/** Metin uzunlukları ve liste sayıları (Tur 68'de editör de bunlardan). */
export const PACK_LIMITS = {
  scenarios: 12,
  rules: 8,
  facts: 6,
  title: 48,
  tagline: 140,
  brief: 700,
  goalText: 220,
  fact: 220,
  name: 60,
  author: 60,
  /** Devralınan şube sayısı. */
  outlets: 12,
  /** Boş duran (araştırma, pazarlama) bina sayısı. */
  idle: 8,
} as const;
const LIMITS = PACK_LIMITS;

/**
 * Bir sayı alanının sınırı. Doğrulayıcı ve editör (Tur 68) aynı tablolardan
 * okuyor: formda yazan aralık paketin kabul ettiği aralık.
 */
export interface NumberRange {
  min: number;
  max: number;
  integer?: boolean;
}

export type ScenarioGoalKind = ScenarioGoal['kind'];

export const GOAL_KINDS: readonly ScenarioGoalKind[] = ['netWorth', 'leadAtEnd', 'victory', 'chain', 'sponsor', 'monopoly', 'holding', 'freight', 'power', 'rental', 'trade'];

/** Senaryonun şehri ve süresi. */
export const SCENARIO_RANGES = {
  seed: { min: 1, max: 2_147_483_647, integer: true },
  preludeDays: { min: 0, max: 400, integer: true },
  days: { min: 30, max: 1000, integer: true },
} as const satisfies Record<string, NumberRange>;

/** Hedefin sayı alanları, türe göre (zincir hedefinin ürünü ayrıca: `PACK_CHOICES.chainGoods`). */
export const GOAL_RANGES: Readonly<Record<ScenarioGoalKind, Readonly<Record<string, NumberRange>>>> = {
  netWorth: { target: { min: 100_000, max: 100_000_000_000 } },
  leadAtEnd: {},
  victory: {},
  chain: { share: { min: 0.05, max: 1 } },
  sponsor: {
    projects: { min: 1, max: 5, integer: true },
    maxRank: { min: 1, max: 5, integer: true },
    graceDays: { min: 0, max: 120, integer: true },
  },
  monopoly: {},
  holding: {},
  freight: { rivals: { min: 1, max: 6, integer: true }, outlets: { min: 1, max: 60, integer: true } },
  power: { target: { min: 100_000, max: 10_000_000_000 } },
  rental: { units: { min: 1, max: 20_000, integer: true }, renewals: { min: 0, max: 5, integer: true } },
  trade: { target: { min: 10_000, max: 10_000_000_000 } },
};

/**
 * Hedef cümlesinin (`goalText`) oyunda dolan yer tutucuları, hedefe göre
 * (`scenarioGoalText`). Başkası metinde süslü parantezle kalırdı: Tur 68'de
 * editörde hedef türü değişince eski türün `{target}`'ı boş görünüyordu.
 */
export const GOAL_PLACEHOLDERS: Readonly<Record<ScenarioGoalKind, readonly string[]>> = {
  netWorth: ['days', 'target'],
  leadAtEnd: ['days'],
  victory: ['days'],
  chain: ['days', 'share'],
  sponsor: ['days'],
  monopoly: ['days'],
  holding: ['days'],
  freight: ['days', 'rivals', 'outlets'],
  power: ['days', 'target'],
  rental: ['days', 'units', 'renewals'],
  trade: ['days', 'target'],
};

/**
 * Yıldızın ölçüsü hedefin skoru (`systems/scenario.ts`): "bitişte en değerli
 * ol" ve sponsorluk bitişteki öndelikle, diğerleri hedefe ulaşma günüyle.
 */
export function starMetric(kind: ScenarioGoalKind): ScenarioStars['metric'] {
  return kind === 'leadAtEnd' || kind === 'sponsor' ? 'lead' : 'days';
}

/** Yıldız eşikleri: gün ölçüsünde üst sınır senaryonun süresi. */
export function starRange(metric: ScenarioStars['metric'], days: number | undefined): NumberRange {
  return metric === 'days' ? { min: 1, max: days ?? SCENARIO_RANGES.days.max, integer: true } : { min: 1, max: 10 };
}

/** Devrin sayı alanları; iç içe olanlar parçanın adıyla. */
export const SETUP_RANGES = {
  cash: { min: 0, max: 1_000_000_000 },
  builtDaysAgo: { min: 0, max: 400, integer: true },
  raiderStake: { min: 0, max: 0.45 },
  feud: { min: 0, max: 4, integer: true },
  loan: { amount: { min: 1_000, max: 1_000_000_000 }, termDays: { min: 30, max: 720, integer: true } },
  crisis: { warningDays: { min: 0, max: 120, integer: true } },
  consortium: { warningDays: { min: 5, max: 120, integer: true } },
  projects: { firstInDays: { min: 0, max: 400, integer: true }, gapDays: { min: 30, max: 400, integer: true } },
  secondCity: { capital: { min: 100_000, max: 1_000_000_000 } },
} as const;

/** Kuralların ayar sınırları: oyunu kırmayan, ölçülmüş aralıklar. */
export const RULE_PARAMS: Readonly<Record<ModifierId, Readonly<Record<string, NumberRange | 'boolean' | 'range'>>>> = {
  storms: {
    firstDay: { min: 30, max: 600, integer: true },
    firstSpread: { min: 0, max: 300, integer: true },
    gapDays: 'range',
    buildDiscount: 'boolean',
  },
  hungry_rivals: {
    budgetMultiplier: { min: 1, max: 2.5 },
    raidWarmupMultiplier: { min: 0.2, max: 1 },
  },
  // Kuruluş kredisinin payı ve vadesi (`startingLoanShare`, `startingLoanDays`) yok:
  // senaryoda ön tarihin şirketi devirde yenisiyle değişiyor, kredi devrin kendi
  // `setup.loan`'undan (Codex #97: ayar kabul edilip etkisiz kalıyordu).
  tight_credit: {
    rateDelta: { min: 0, max: 0.12 },
    limitMultiplier: { min: 0.1, max: 1 },
  },
  scarce_land: {
    priceMultiplier: { min: 1, max: 4 },
    unlockDelay: { min: 1, max: 3 },
  },
};
/** Kriz arası (`storms.gapDays`): `[en kısa, en uzun]` gün. */
export const GAP_RANGE: NumberRange = { min: 30, max: 900, integer: true };

/**
 * Kimlik alanlarının seçenekleri: doğrulayıcının kabul ettikleri, editörün
 * listeledikleri. Katalogların yalnız kendi kayıtları (`toString` gibi miras
 * adlar geçmiyor; Codex #97: hayalet kriz).
 */
export const PACK_CHOICES = {
  /** Zinciri olan tüketici ürünü: hammadde → ara mal → raf. */
  chainGoods: GOODS.filter((good) => good.tier === 'consumer' && good.inputGoodId).map((good) => good.id),
  /** Devralınan şube: mağaza ya da kiralık (hazır senaryolardaki gibi). */
  outlets: BUILDINGS.filter((def) => def.role === 'outlet' || def.role === 'rental').map((def) => def.id),
  /** Boş duran bina: araştırma ya da pazarlama. */
  idle: BUILDINGS.filter((def) => def.role === 'research' || def.role === 'marketing').map((def) => def.id),
  crises: CRISES.map((crisis) => crisis.id),
  categories: Object.keys(CATEGORIES) as CategoryId[],
  modifiers: MODIFIERS.map((modifier) => modifier.id),
  citySizes: CITY_SIZES.map((size) => size.id),
  /** Şehrin türü (Tur 79): senaryonun şehri ve ikinci şehir. */
  cityTypes: CITY_TYPES.map((type) => type.id),
  difficulties: DIFFICULTIES.map((difficulty) => difficulty.id),
} as const;

/** Paketin, kuralın ve senaryonun kimliği: küçük harf, rakam, tire; en fazla 32. */
export const PACK_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ID = PACK_ID;
const MODIFIER_IDS = PACK_CHOICES.modifiers;
const CITY_SIZE_IDS = PACK_CHOICES.citySizes;
const CITY_TYPE_IDS = PACK_CHOICES.cityTypes;
const DIFFICULTY_IDS = PACK_CHOICES.difficulties;
const CATEGORY_IDS = PACK_CHOICES.categories;

// ------------------------------------------------------------ Doğrulama

class Checker {
  readonly issues: PackIssue[] = [];

  add(path: string, code: PackIssueCode, params?: Record<string, string | number>): void {
    // Yüzlerce aynı hata göstermenin anlamı yok; ilk 40'ı yetiyor.
    if (this.issues.length < 40) this.issues.push(params ? { path, code, params } : { path, code });
  }

  object(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.add(path, 'type', { expected: 'object' });
      return null;
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!allowed.includes(key)) this.add(join(path, key), 'unknownField');
    }
    return record;
  }

  number(record: Record<string, unknown>, key: string, path: string, min: number, max: number, options: { integer?: boolean; optional?: boolean } = {}): number | undefined {
    const value = record[key];
    const at = join(path, key);
    if (value === undefined) {
      if (!options.optional) this.add(at, 'missing');
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.add(at, 'type', { expected: 'number' });
      return undefined;
    }
    if (options.integer && !Number.isInteger(value)) {
      this.add(at, 'integer');
      return undefined;
    }
    if (value < min || value > max) {
      this.add(at, 'range', { min, max });
      return undefined;
    }
    return value;
  }

  range(record: Record<string, unknown>, key: string, path: string, spec: NumberRange, optional = false): number | undefined {
    return this.number(record, key, path, spec.min, spec.max, { integer: spec.integer, optional });
  }

  boolean(record: Record<string, unknown>, key: string, path: string): boolean | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
      this.add(join(path, key), 'type', { expected: 'boolean' });
      return undefined;
    }
    return value;
  }

  choice<T extends string>(record: Record<string, unknown>, key: string, path: string, options: readonly T[], optional = false): T | undefined {
    const value = record[key];
    const at = join(path, key);
    if (value === undefined) {
      if (!optional) this.add(at, 'missing');
      return undefined;
    }
    if (typeof value !== 'string' || !options.includes(value as T)) {
      this.add(at, 'enum', { options: options.join(', ') });
      return undefined;
    }
    return value as T;
  }

  id(record: Record<string, unknown>, key: string, path: string): string | undefined {
    const value = record[key];
    const at = join(path, key);
    if (value === undefined) {
      this.add(at, 'missing');
      return undefined;
    }
    if (typeof value !== 'string' || !ID.test(value)) {
      this.add(at, 'id');
      return undefined;
    }
    return value;
  }

  text(record: Record<string, unknown>, key: string, path: string, max: number, optional = false): void {
    this.textValue(record[key], join(path, key), max, optional);
  }

  textValue(value: unknown, at: string, max: number, optional = false): void {
    if (value === undefined) {
      if (!optional) this.add(at, 'missing');
      return;
    }
    if (typeof value === 'string') {
      if (value.trim().length === 0) this.add(at, 'missing');
      else if (value.length > max) this.add(at, 'length', { max });
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.add(at, 'type', { expected: 'text' });
      return;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) this.add(at, 'missing');
    for (const [locale, text] of entries) {
      if (!/^[a-z]{2}$/.test(locale)) this.add(join(at, locale), 'format', { expected: 'tr, en' });
      else if (typeof text !== 'string' || text.trim().length === 0) this.add(join(at, locale), 'missing');
      else if (text.length > max) this.add(join(at, locale), 'length', { max });
    }
  }
}

/** Seçenek listesinde mi: liste, katalog nesnesi değil (miras adlar geçmiyor). */
function listed(choices: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && choices.includes(value);
}

function join(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path ? `${path}.${key}` : key;
}

/** Bir paketin doğrulanması. Geçerse `pack` girdinin kendisi (değiştirilmeden). */
export function validatePack(raw: unknown): PackResult {
  const check = new Checker();
  const doc = check.object(raw, '', ['format', 'version', 'id', 'name', 'author', 'rules', 'scenarios']);
  if (!doc) return { ok: false, issues: check.issues };

  if (doc['format'] !== PACK_FORMAT) check.add('format', 'format', { expected: PACK_FORMAT });
  if (doc['version'] !== PACK_VERSION) check.add('version', 'version', { expected: PACK_VERSION });
  check.id(doc, 'id', '');
  check.text(doc, 'name', '', LIMITS.name);
  if (doc['author'] !== undefined && (typeof doc['author'] !== 'string' || doc['author'].length > LIMITS.author)) {
    check.add('author', 'length', { max: LIMITS.author });
  }

  // Kurallar: kimlikleri hazır kurallarla ve birbiriyle çakışmıyor.
  const ruleBase = new Map<string, ModifierId>();
  for (const id of MODIFIER_IDS) ruleBase.set(id, id);
  const rules = doc['rules'];
  if (rules !== undefined) {
    if (!Array.isArray(rules)) check.add('rules', 'type', { expected: 'array' });
    else {
      if (rules.length > LIMITS.rules) check.add('rules', 'count', { max: LIMITS.rules });
      rules.slice(0, LIMITS.rules).forEach((rule, index) => {
        const path = join('rules', index);
        const record = check.object(rule, path, ['id', 'base', 'name', 'blurb', 'params']);
        if (!record) return;
        const id = check.id(record, 'id', path);
        const base = check.choice(record, 'base', path, MODIFIER_IDS);
        check.text(record, 'name', path, LIMITS.name);
        check.text(record, 'blurb', path, LIMITS.tagline);
        if (base) checkRuleParams(check, record['params'], join(path, 'params'), base);
        if (id && base) {
          if (ruleBase.has(id)) check.add(join(path, 'id'), 'duplicate');
          else ruleBase.set(id, base);
        }
      });
    }
  }

  const scenarios = doc['scenarios'];
  if (!Array.isArray(scenarios)) check.add('scenarios', scenarios === undefined ? 'missing' : 'type', scenarios === undefined ? undefined : { expected: 'array' });
  else {
    if (scenarios.length === 0) check.add('scenarios', 'missing');
    if (scenarios.length > LIMITS.scenarios) check.add('scenarios', 'count', { max: LIMITS.scenarios });
    const seen = new Set<string>();
    scenarios.slice(0, LIMITS.scenarios).forEach((scenario, index) => {
      const id = checkScenario(check, scenario, join('scenarios', index), ruleBase);
      if (id) {
        if (seen.has(id)) check.add(join(join('scenarios', index), 'id'), 'duplicate');
        seen.add(id);
      }
    });
  }

  return check.issues.length === 0 ? { ok: true, pack: raw as Pack } : { ok: false, issues: check.issues };
}

function checkRuleParams(check: Checker, value: unknown, path: string, base: ModifierId): void {
  if (value === undefined) return;
  const schema = RULE_PARAMS[base];
  const record = check.object(value, path, Object.keys(schema));
  if (!record) return;
  for (const [key, spec] of Object.entries(schema)) {
    if (record[key] === undefined) continue;
    if (spec === 'boolean') check.boolean(record, key, path);
    else if (spec === 'range') {
      const pair = record[key];
      const at = join(path, key);
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some((n) => typeof n !== 'number' || !Number.isInteger(n))) {
        check.add(at, 'type', { expected: '[min, max]' });
      } else if (pair[0] < GAP_RANGE.min || pair[1] > GAP_RANGE.max || pair[0] > pair[1]) {
        check.add(at, 'range', { min: GAP_RANGE.min, max: GAP_RANGE.max });
      }
    } else check.range(record, key, path, spec, true);
  }
}

function checkScenario(check: Checker, value: unknown, path: string, ruleBase: Map<string, ModifierId>): string | undefined {
  const record = check.object(value, path, [
    'id', 'title', 'tagline', 'brief', 'goalText', 'facts', 'seed', 'citySize', 'cityType', 'difficulty', 'preludeDays', 'rules', 'days', 'goal', 'stars', 'setup',
  ]);
  if (!record) return undefined;
  const id = check.id(record, 'id', path);
  check.text(record, 'title', path, LIMITS.title);
  check.text(record, 'tagline', path, LIMITS.tagline);
  check.text(record, 'brief', path, LIMITS.brief);
  check.text(record, 'goalText', path, LIMITS.goalText);
  const facts = record['facts'];
  if (facts !== undefined) {
    if (!Array.isArray(facts)) check.add(join(path, 'facts'), 'type', { expected: 'array' });
    else {
      if (facts.length > LIMITS.facts) check.add(join(path, 'facts'), 'count', { max: LIMITS.facts });
      facts.slice(0, LIMITS.facts).forEach((fact, index) => check.textValue(fact, join(join(path, 'facts'), index), LIMITS.fact));
    }
  }
  check.range(record, 'seed', path, SCENARIO_RANGES.seed);
  check.choice(record, 'citySize', path, CITY_SIZE_IDS);
  check.choice(record, 'cityType', path, CITY_TYPE_IDS, true);
  check.choice(record, 'difficulty', path, DIFFICULTY_IDS);
  check.range(record, 'preludeDays', path, SCENARIO_RANGES.preludeDays);
  const days = check.range(record, 'days', path, SCENARIO_RANGES.days);

  // Kurallar: aynı hazır kural iki kez (biri paketin ayarıyla) seçilemez.
  const rules = record['rules'];
  if (rules !== undefined) {
    if (!Array.isArray(rules)) check.add(join(path, 'rules'), 'type', { expected: 'array' });
    else {
      const bases = new Set<ModifierId>();
      rules.forEach((rule, index) => {
        const at = join(join(path, 'rules'), index);
        const base = typeof rule === 'string' ? ruleBase.get(rule) : undefined;
        if (!base) check.add(at, 'unknownRef', { value: String(rule) });
        else if (bases.has(base)) check.add(at, 'conflict', { value: base });
        else bases.add(base);
      });
    }
  }

  const goalKind = checkGoal(check, record['goal'], join(path, 'goal'));
  if (goalKind) checkPlaceholders(check, record['goalText'], join(path, 'goalText'), GOAL_PLACEHOLDERS[goalKind]);
  checkStars(check, record['stars'], join(path, 'stars'), goalKind, days);
  checkSetup(check, record['setup'], join(path, 'setup'), goalKind);
  return id;
}

/** Metindeki `{ad}` ve `{ad|tekil|çoğul}` yer tutucuları hedefin doldurduklarından mı. */
function checkPlaceholders(check: Checker, value: unknown, path: string, allowed: readonly string[]): void {
  const scan = (text: unknown, at: string) => {
    if (typeof text !== 'string') return;
    for (const match of text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)) {
      if (!allowed.includes(match[1]!)) {
        check.add(at, 'placeholder', { value: `{${match[1]}}` });
        return;
      }
    }
  };
  if (typeof value === 'string') scan(value, path);
  else if (value && typeof value === 'object' && !Array.isArray(value)) for (const [locale, text] of Object.entries(value)) scan(text, join(path, locale));
}

function checkGoal(check: Checker, value: unknown, path: string): ScenarioGoalKind | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    check.add(path, value === undefined ? 'missing' : 'type', value === undefined ? undefined : { expected: 'object' });
    return undefined;
  }
  const kind = (value as Record<string, unknown>)['kind'];
  if (!listed(GOAL_KINDS, kind)) {
    check.add(join(path, 'kind'), 'enum', { options: GOAL_KINDS.join(', ') });
    return undefined;
  }
  const ranges = GOAL_RANGES[kind as ScenarioGoalKind];
  const fields = kind === 'chain' ? ['goodId', ...Object.keys(ranges)] : Object.keys(ranges);
  const record = check.object(value, path, ['kind', ...fields])!;
  if (kind === 'chain' && !listed(PACK_CHOICES.chainGoods, record['goodId'])) {
    check.add(join(path, 'goodId'), 'unknownRef', { value: String(record['goodId']) });
  }
  for (const [key, spec] of Object.entries(ranges)) check.range(record, key, path, spec);
  return kind as ScenarioGoalKind;
}

function checkStars(check: Checker, value: unknown, path: string, goalKind: ScenarioGoalKind | undefined, days: number | undefined): void {
  const record = check.object(value, path, ['metric', 'two', 'three']);
  if (!record) return;
  const metric = check.choice(record, 'metric', path, ['days', 'lead'] as const);
  if (metric && goalKind) {
    const expected = starMetric(goalKind);
    if (metric !== expected) check.add(join(path, 'metric'), 'metric', { expected });
  }
  if (!metric) return;
  const spec = starRange(metric, days);
  const two = check.range(record, 'two', path, spec);
  const three = check.range(record, 'three', path, spec);
  // Günde üç yıldız daha erken, öndelikte daha geniş fark.
  if (two !== undefined && three !== undefined && (metric === 'days' ? three >= two : three <= two)) check.add(join(path, 'three'), 'starsOrder');
}

function checkSetup(check: Checker, value: unknown, path: string, goalKind: ScenarioGoalKind | undefined): void {
  const record = check.object(value, path, [
    'cash', 'outlets', 'idle', 'builtDaysAgo', 'loan', 'raiderStake', 'crisis', 'consortium', 'projects', 'freeze', 'secondCity', 'feud',
  ]);
  if (!record) return;
  check.range(record, 'cash', path, SETUP_RANGES.cash);
  const outlets = record['outlets'];
  if (outlets !== undefined) {
    if (!Array.isArray(outlets)) check.add(join(path, 'outlets'), 'type', { expected: 'array' });
    else {
      if (outlets.length > LIMITS.outlets) check.add(join(path, 'outlets'), 'count', { max: LIMITS.outlets });
      outlets.slice(0, LIMITS.outlets).forEach((defId, index) => {
        if (!listed(PACK_CHOICES.outlets, defId)) check.add(join(join(path, 'outlets'), index), 'unknownRef', { value: String(defId) });
      });
    }
  }
  if (record['idle'] !== undefined) {
    const idlePath = join(path, 'idle');
    const idle = check.object(record['idle'], idlePath, ['defIds', 'focus']);
    if (idle) {
      const defIds = idle['defIds'];
      if (!Array.isArray(defIds) || defIds.length === 0 || defIds.length > LIMITS.idle) check.add(join(idlePath, 'defIds'), 'count', { max: LIMITS.idle });
      else {
        defIds.forEach((defId, index) => {
          if (!listed(PACK_CHOICES.idle, defId)) check.add(join(join(idlePath, 'defIds'), index), 'unknownRef', { value: String(defId) });
        });
      }
      check.choice(idle, 'focus', idlePath, CATEGORY_IDS);
    }
  }
  check.range(record, 'builtDaysAgo', path, SETUP_RANGES.builtDaysAgo, true);
  // İç içe parçalar: varsa her alanı gerekli.
  const part = (key: 'loan' | 'consortium' | 'projects' | 'secondCity', ranges: Readonly<Record<string, NumberRange>>, extra: readonly string[] = []) => {
    if (record[key] === undefined) return null;
    const at = join(path, key);
    const nested = check.object(record[key], at, [...extra, ...Object.keys(ranges)]);
    if (nested) for (const [field, spec] of Object.entries(ranges)) check.range(nested, field, at, spec);
    return nested;
  };
  part('loan', SETUP_RANGES.loan);
  check.range(record, 'raiderStake', path, SETUP_RANGES.raiderStake, true);
  if (record['crisis'] !== undefined) {
    const crisisPath = join(path, 'crisis');
    const crisis = check.object(record['crisis'], crisisPath, ['id', 'warningDays']);
    if (crisis) {
      if (!listed(PACK_CHOICES.crises, crisis['id'])) check.add(join(crisisPath, 'id'), 'unknownRef', { value: String(crisis['id']) });
      check.range(crisis, 'warningDays', crisisPath, SETUP_RANGES.crisis.warningDays);
    }
  }
  part('consortium', SETUP_RANGES.consortium);
  part('projects', SETUP_RANGES.projects);
  if (record['freeze'] !== undefined) {
    const freezePath = join(path, 'freeze');
    const freeze = check.object(record['freeze'], freezePath, ['entrants', 'issuance']);
    if (freeze) {
      check.boolean(freeze, 'entrants', freezePath);
      check.boolean(freeze, 'issuance', freezePath);
    }
  }
  const city = part('secondCity', SETUP_RANGES.secondCity, ['citySize', 'cityType']);
  if (city) {
    check.choice(city, 'citySize', join(path, 'secondCity'), CITY_SIZE_IDS);
    check.choice(city, 'cityType', join(path, 'secondCity'), CITY_TYPE_IDS, true);
  } else if (record['secondCity'] === undefined && (goalKind === 'holding' || goalKind === 'trade')) {
    // Holding'in hedefi iki şehir, ticaretinki (Tur 79) iki şehrin arası: ikinci şehir kurulmadan ölçü yok.
    check.add(join(path, 'secondCity'), 'needsSetup');
  }
  check.range(record, 'feud', path, SETUP_RANGES.feud, true);
}

// --------------------------------------------------- Senaryoya çevirme

/** Paketten gelen senaryonun oyun içindeki kimliği; hazır senaryolarla çakışmıyor. */
export function packScenarioId(packId: string, scenarioId: string): string {
  return `${packId}/${scenarioId}`;
}

/**
 * Etkin dildeki metin; yoksa dilin yedekleri (Almancada İngilizce, Tur 69),
 * sonra Türkçe, o da yoksa ilki.
 */
export function packText(text: PackText): string {
  if (typeof text === 'string') return text;
  for (const locale of textLocales()) {
    const value = text[locale];
    if (value !== undefined) return value;
  }
  return Object.values(text)[0] ?? '';
}

function defineText(target: object, field: string, text: () => string): void {
  Object.defineProperty(target, field, { get: text, enumerable: true, configurable: true });
}

/** Paketteki bir senaryonun yalnız kendisini ve kullandığı kuralları taşıyan tek senaryoluk paket. */
export function packForScenario(pack: Pack, scenarioId: string): Pack {
  const scenario = pack.scenarios.find((entry) => entry.id === scenarioId);
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`);
  const used = new Set(scenario.rules ?? []);
  const rules = (pack.rules ?? []).filter((rule) => used.has(rule.id));
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: pack.id,
    name: pack.name,
    ...(pack.author ? { author: pack.author } : {}),
    ...(rules.length > 0 ? { rules } : {}),
    scenarios: [scenario],
  };
}

/**
 * Hazır bir senaryonun paketteki hâli: kurulum ekranının "örnek" düğmesi
 * (yazmaya başlamak için) ve testler. Metinler etkin dilde.
 */
export function packFromScenario(def: ScenarioDef, packId = 'ornek'): Pack {
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: packId,
    name: def.title,
    scenarios: [
      {
        id: def.id,
        title: def.title,
        tagline: def.tagline,
        brief: def.brief,
        goalText: def.goalText,
        facts: [...def.facts],
        seed: def.seed,
        citySize: def.citySize,
        ...(def.cityType ? { cityType: def.cityType } : {}),
        difficulty: def.difficulty,
        preludeDays: def.preludeDays,
        ...(def.modifiers ? { rules: [...def.modifiers] } : {}),
        days: def.days,
        goal: copy(def.goal),
        stars: { ...def.stars },
        setup: copy(def.setup),
      },
    ],
  };
}

/** Doğrulanmış paketin bir senaryosu oyunun senaryo tanımı olarak. */
export function scenarioFromPack(pack: Pack, scenario: PackScenario): ScenarioDef {
  const modifiers: ModifierId[] = [];
  const overrides: RuleOverrides = {};
  const customRules: Array<{ base: ModifierId; name: string; blurb: string }> = [];
  for (const ref of scenario.rules ?? []) {
    const builtin = MODIFIERS.find((modifier) => modifier.id === ref);
    if (builtin) {
      modifiers.push(builtin.id);
      continue;
    }
    const rule = (pack.rules ?? []).find((entry) => entry.id === ref);
    if (!rule) continue;
    modifiers.push(rule.base);
    if (rule.params && Object.keys(rule.params).length > 0) {
      (overrides as Record<string, unknown>)[RULE_KEY[rule.base]] = { ...rule.params };
    }
    const entry = { base: rule.base, name: '', blurb: '' };
    defineText(entry, 'name', () => packText(rule.name));
    defineText(entry, 'blurb', () => packText(rule.blurb));
    customRules.push(entry);
  }
  // Hazır kuralların katalog sırası (kayıttaki liste gibi).
  const ordered = MODIFIERS.map((modifier) => modifier.id).filter((id) => modifiers.includes(id));

  const def = {
    id: packScenarioId(pack.id, scenario.id),
    seed: scenario.seed,
    citySize: scenario.citySize,
    ...(scenario.cityType ? { cityType: scenario.cityType } : {}),
    difficulty: scenario.difficulty,
    preludeDays: scenario.preludeDays,
    ...(ordered.length > 0 ? { modifiers: ordered } : {}),
    ...(Object.keys(overrides).length > 0 ? { ruleOverrides: overrides } : {}),
    ...(customRules.length > 0 ? { customRules } : {}),
    days: scenario.days,
    goal: scenario.goal,
    stars: scenario.stars,
    setup: scenario.setup,
    source: {
      packId: pack.id,
      packName: '',
      ...(pack.author ? { author: pack.author } : {}),
      doc: packForScenario(pack, scenario.id),
    },
  } as ScenarioDef;
  // Paketin adı da etkin dilde (öteki metinler gibi; Codex #97).
  defineText(def.source!, 'packName', () => packText(pack.name));
  defineText(def, 'title', () => packText(scenario.title));
  defineText(def, 'tagline', () => packText(scenario.tagline));
  defineText(def, 'brief', () => packText(scenario.brief));
  defineText(def, 'goalText', () => packText(scenario.goalText));
  Object.defineProperty(def, 'facts', { get: () => (scenario.facts ?? []).map(packText), enumerable: true, configurable: true });
  return def;
}

/**
 * Paketin senaryolarını oyuna tanıtır (`SCENARIO_BY_ID`); aynı kimlikli
 * eski sürümün yerine geçer. Hazır senaryolar ezilemez.
 */
export function registerPack(pack: Pack): ScenarioDef[] {
  const defs: ScenarioDef[] = [];
  for (const scenario of pack.scenarios) {
    const def = scenarioFromPack(pack, scenario);
    if (SCENARIOS.some((builtin) => builtin.id === def.id)) continue;
    SCENARIO_BY_ID[def.id] = def;
    defs.push(def);
  }
  return defs;
}

/** Paketin senaryolarını oyundan çıkarır (oyuncu paketi silince). */
export function unregisterPack(packId: string): void {
  for (const id of Object.keys(SCENARIO_BY_ID)) {
    if (id.startsWith(`${packId}/`)) delete SCENARIO_BY_ID[id];
  }
}

/**
 * Kayda gömülü paketi doğrulayıp koşunun tanımını çıkarır; geçersizse null.
 * Kayıt defterine yalnız boşsa giriyor: oyuncunun yüklediği sürüm menülerde
 * kalıyor, koşu ise kendi tanımıyla sürüyor (`scenarioDefFor`).
 */
export function adoptPack(pack: Pack, scenarioId: string): ScenarioDef | null {
  const known = embeddedScenarioDef(pack);
  if (known) return known;
  const checked = validatePack(pack);
  if (!checked.ok) return null;
  const scenario = checked.pack.scenarios.find((entry) => packScenarioId(checked.pack.id, entry.id) === scenarioId);
  if (!scenario) return null;
  const def = scenarioFromPack(checked.pack, scenario);
  bindScenarioDef(pack, def);
  if (!SCENARIO_BY_ID[def.id]) SCENARIO_BY_ID[def.id] = def;
  return def;
}


// ------------------------------------------------------ Paylaşım kodu

/** Paylaşım kodunun öneki: biçimin sürümü. */
export const PACK_CODE_PREFIX = 'CF1.';
const MAX_CODE_LENGTH = 24_000;
const MAX_JSON_BYTES = 64 * 1024;

export class PackCodeError extends Error {
  constructor(readonly code: 'prefix' | 'length' | 'decode' | 'json') {
    super(`pack code: ${code}`);
  }
}

/**
 * Paketin paylaşım kodu: JSON, deflate, base64url. Çözücünün sınırlarını
 * aşan kod üretilmiyor (Codex #97): çok dilli uzun metinli geçerli bir
 * senaryo 24 bin karakteri geçebiliyor; o zaman `PackCodeError('length')`.
 */
export async function encodePackCode(pack: Pack): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack));
  if (json.length > MAX_JSON_BYTES) throw new PackCodeError('length');
  const packed = await pipe(json, new CompressionStream('deflate-raw'));
  const code = PACK_CODE_PREFIX + toBase64Url(packed);
  if (code.length > MAX_CODE_LENGTH) throw new PackCodeError('length');
  return code;
}

/**
 * Koddan paketin ham hâli (doğrulanmamış: `validatePack`'e gider). Boşluk
 * ve satır sonu yok sayılıyor (sohbetten kopyalanan kod bölünmüş olabilir).
 */
export async function decodePackCode(code: string): Promise<unknown> {
  const compact = code.replace(/\s+/g, '');
  if (!compact.startsWith(PACK_CODE_PREFIX)) throw new PackCodeError('prefix');
  if (compact.length > MAX_CODE_LENGTH) throw new PackCodeError('length');
  let bytes: Uint8Array;
  try {
    bytes = await pipe(fromBase64Url(compact.slice(PACK_CODE_PREFIX.length)), new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
  } catch (error) {
    throw error instanceof PackCodeError ? error : new PackCodeError('decode');
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new PackCodeError('json');
  }
}

async function pipe(input: Uint8Array, transform: CompressionStream | DecompressionStream, limit = Number.POSITIVE_INFINITY): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  void writer.write(new Uint8Array(input)).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    // Küçük kodun açılınca devleşmesine karşı (sıkıştırma bombası).
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new PackCodeError('length');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new PackCodeError('decode');
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
