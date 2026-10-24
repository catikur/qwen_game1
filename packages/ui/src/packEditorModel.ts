import { BASE_LOCALE, GOAL_KINDS, GOAL_PLACEHOLDERS, MODIFIERS, PACK_CHOICES, PACK_ID, PACK_LIMITS, SCENARIOS, SCENARIO_RANGES, baseText, messageIn, packFromScenario, starMetric, starRange } from '@capital/content';
import type { ModifierId, Pack, PackIssue, PackRule, PackScenario, PackText, ScenarioGoalKind, ScenarioSetup } from '@capital/content';

/*
 * Senaryo editörünün modeli (Tur 68): taslağın kendisi bir paket belgesi
 * (`Pack`), yarım kalmış da olabilir (boş alan, aralık dışı sayı). Form
 * alanları belgedeki yollara bağlı; doğrulayıcının sorun yolları
 * (`scenarios[0].goal.target`) aynı biçimde, sorun alanın altında çıkıyor.
 * Bu dosya saf: arayüz yok, testler doğrudan çağırıyor.
 */

export type Path = readonly (string | number)[];

/** Yolun doğrulayıcıdaki yazımı: `scenarios[0].goal.target`. */
export function pathKey(path: Path): string {
  let out = '';
  for (const part of path) out = typeof part === 'number' ? `${out}[${part}]` : out ? `${out}.${part}` : part;
  return out;
}

export function getAt(doc: unknown, path: Path): unknown {
  let node = doc;
  for (const part of path) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string | number, unknown>)[part];
  }
  return node;
}

/**
 * Yeni belge: yol üzerindeki nesneler kopyalanıyor, gerisi paylaşılıyor.
 * `undefined` alanı siliyor (isteğe bağlı alan boşaldı); dizide öğe kalıyor.
 */
export function setAt<T>(doc: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const node = (doc && typeof doc === 'object' ? doc : typeof head === 'number' ? [] : {}) as Record<string | number, unknown>;
  const next = rest.length === 0 ? value : setAt(node[head!], rest, value);
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[head as number] = next;
    return copy as T;
  }
  const copy = { ...node };
  if (next === undefined) delete copy[head!];
  else copy[head!] = next;
  return copy as T;
}

/** Dizideki öğeyi çıkarır. */
export function removeAt<T>(doc: T, path: Path, index: number): T {
  const list = getAt(doc, path);
  return Array.isArray(list) ? setAt(doc, path, list.filter((_, i) => i !== index)) : doc;
}

/** Bir alanın sorunları: tam o yol ya da altındakiler (`title` için `title.en`). */
export function issuesAt(issues: readonly PackIssue[], key: string, deep = false): PackIssue[] {
  return issues.filter((issue) => issue.path === key || (deep && (issue.path.startsWith(`${key}.`) || issue.path.startsWith(`${key}[`))));
}

// ------------------------------------------------------------ Diller

/** Belgedeki metin alanlarının yolları (paketin adı, kurallar, senaryolar, maddeler). */
export function textPaths(doc: Pack): Path[] {
  const paths: Path[] = [['name']];
  (doc.rules ?? []).forEach((_, i) => paths.push(['rules', i, 'name'], ['rules', i, 'blurb']));
  (doc.scenarios ?? []).forEach((scenario, i) => {
    for (const field of ['title', 'tagline', 'brief', 'goalText'] as const) paths.push(['scenarios', i, field]);
    (scenario.facts ?? []).forEach((_, j) => paths.push(['scenarios', i, 'facts', j]));
  });
  return paths;
}

/**
 * Taslağın dilleri: dil başına yazılmış metinlerin dilleri; hiçbiri yoksa
 * tek dil (metinler düz, her dilde aynı görünüyor). Türkçe başta.
 */
export function draftLocales(doc: Pack, fallback: string): string[] {
  const found = new Set<string>();
  for (const path of textPaths(doc)) {
    const value = getAt(doc, path);
    if (value && typeof value === 'object') for (const locale of Object.keys(value)) found.add(locale);
  }
  if (found.size === 0) return [fallback];
  return [...found].sort((a, b) => (a === BASE_LOCALE ? -1 : b === BASE_LOCALE ? 1 : a.localeCompare(b)));
}

/** Metnin bir dildeki hâli; düz metin her dilde aynı. */
export function textIn(value: unknown, locale: string): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>)[locale];
    return typeof text === 'string' ? text : '';
  }
  return '';
}

/**
 * Metnin bir dildeki hâlini yazar. Tek dilde düz metin; birden çok dilde
 * dil başına (düz metin öteki dillerde olduğu gibi kalıyor).
 */
export function writeText(value: unknown, locale: string, text: string, locales: readonly string[]): PackText {
  if (locales.length <= 1) return text;
  const map: Record<string, string> = {};
  for (const id of locales) map[id] = textIn(value, id);
  map[locale] = text;
  return map;
}

/**
 * Dil ekle ya da çıkar. Eklenen dilin metinleri boş (doğrulayıcı "eksik"
 * diyor, oyuncu yazıyor); düz metin ilk dilin metni oluyor. Tek dil
 * kalınca metinler yeniden düz.
 */
export function withLocales(doc: Pack, current: readonly string[], next: readonly string[]): Pack {
  if (next.length === 0) return doc;
  const primary = current[0] ?? next[0]!;
  let out = doc;
  for (const path of textPaths(doc)) {
    const value = getAt(doc, path);
    let text: PackText;
    if (next.length === 1) {
      const keep = typeof value === 'string' ? value : textIn(value, next[0]!) || textIn(value, primary);
      text = keep;
    } else {
      const map: Record<string, string> = {};
      for (const locale of next) {
        if (typeof value === 'string') map[locale] = locale === primary || current.includes(locale) ? value : '';
        else map[locale] = textIn(value, locale);
      }
      text = map;
    }
    out = setAt(out, path, text);
  }
  return out;
}

// ------------------------------------------------------------ Kimlikler

/** Tabandan geçerli, kullanılmamış bir kimlik: `kurtarma`, `kurtarma-2`, … */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'senaryo';
  const root = PACK_ID.test(clean) ? clean : `s-${clean}`.slice(0, 28);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const id = `${root}-${n}`;
    if (!used.has(id)) return id;
  }
}

// ------------------------------------------------------------ Taslaklar

/** Pakete yeni senaryo: seçili senaryonun kopyası, yeni kimlikle. */
export function withScenarioCopy(doc: Pack, index: number): { doc: Pack; index: number } {
  const scenarios = doc.scenarios ?? [];
  if (scenarios.length >= PACK_LIMITS.scenarios) return { doc, index };
  const source = scenarios[index] ?? packFromScenario(SCENARIOS[0]!).scenarios[0]!;
  const copy: PackScenario = { ...JSON.parse(JSON.stringify(source)), id: uniqueId(source.id, scenarios.map((s) => s.id)) };
  return { doc: { ...doc, scenarios: [...scenarios, copy] }, index: scenarios.length };
}

/** Senaryoyu çıkarır; son senaryo kalmıyorsa çıkmıyor (paketin en az bir senaryosu var). */
export function withoutScenario(doc: Pack, index: number): Pack {
  if ((doc.scenarios ?? []).length <= 1) return doc;
  return removeAt(doc, ['scenarios'], index);
}

/** Bir hedef türünün başlangıç değerleri: o türü kullanan hazır senaryodan. */
export function goalDefaults(kind: ScenarioGoalKind): PackScenario['goal'] {
  const builtin = SCENARIOS.find((def) => def.goal.kind === kind);
  return builtin ? (JSON.parse(JSON.stringify(builtin.goal)) as PackScenario['goal']) : ({ kind } as PackScenario['goal']);
}

/** Metin bu hedefin doldurmadığı bir yer tutucu taşıyor mu (`{target}` öndelik hedefinde). */
function strayPlaceholder(text: string, kind: ScenarioGoalKind): boolean {
  return [...text.matchAll(/\{(\w+)(?:\|[^|{}]*\|[^|{}]*)?\}/g)].some((match) => !GOAL_PLACEHOLDERS[kind].includes(match[1]!));
}

/** Hazır senaryonun o hedef türündeki cümlesi, istenen dilde (dil inmediyse yok). */
function builtinGoalText(kind: ScenarioGoalKind, locale: string): string | undefined {
  const builtin = SCENARIOS.find((def) => def.goal.kind === kind);
  if (!builtin) return undefined;
  return locale === BASE_LOCALE ? baseText(builtin, 'goalText') : messageIn(locale, `content.scenario.${builtin.id}.goalText`);
}

/**
 * Hedef cümlesi yeni türle: eski türün yer tutucusunu taşıyan dil hazır
 * senaryonun o türdeki cümlesine geçiyor (o dil inmişse); yazarın kendi
 * cümlesi yer tutucusu uyuyorsa kalıyor.
 */
function goalTextFor(value: PackText, kind: ScenarioGoalKind, locales: readonly string[]): PackText {
  if (typeof value === 'string') {
    if (!strayPlaceholder(value, kind)) return value;
    return builtinGoalText(kind, locales[0] ?? BASE_LOCALE) ?? value;
  }
  const map: Record<string, string> = { ...value };
  for (const [locale, text] of Object.entries(map)) if (strayPlaceholder(text, kind)) map[locale] = builtinGoalText(kind, locale) ?? text;
  return map;
}

/**
 * Hedef türünü değiştirir. Yıldızın ölçüsü hedefe bağlı (`starMetric`):
 * ölçü değişince eşikler yeni ölçüye uygun başlıyor. Holding ikinci şehir
 * istiyor: yoksa kuruluyor. Hedef cümlesinin uymayan yer tutucusu da
 * (`goalTextFor`).
 */
export function withGoalKind(scenario: PackScenario, kind: ScenarioGoalKind, locales: readonly string[] = [BASE_LOCALE]): PackScenario {
  if (!GOAL_KINDS.includes(kind)) return scenario;
  const metric = starMetric(kind);
  const days = typeof scenario.days === 'number' ? scenario.days : 360;
  const stars = scenario.stars?.metric === metric
    ? scenario.stars
    : metric === 'days'
      ? { metric, two: Math.max(2, Math.round(days * 0.8)), three: Math.max(1, Math.round(days * 0.6)) }
      : { metric, two: 1.2, three: 1.5 };
  const setup = kind === 'holding' && !scenario.setup?.secondCity ? { ...scenario.setup, secondCity: { ...PART_DEFAULTS.secondCity } } : scenario.setup;
  return { ...scenario, goal: goalDefaults(kind), stars, setup, goalText: goalTextFor(scenario.goalText, kind, locales) };
}

/** Devrin isteğe bağlı parçalarının başlangıç değerleri (formda "ekle" denince). */
export const PART_DEFAULTS = {
  outlets: ['supermarket', 'cafe'],
  idle: { defIds: [PACK_CHOICES.idle[0]!], focus: PACK_CHOICES.categories[0]! },
  builtDaysAgo: 120,
  loan: { amount: 1_500_000, termDays: 360 },
  raiderStake: 0.2,
  crisis: { id: PACK_CHOICES.crises[0]!, warningDays: 30 },
  consortium: { warningDays: 45 },
  projects: { firstInDays: 30, gapDays: 120 },
  freeze: { entrants: true },
  secondCity: { capital: 3_000_000, citySize: 'standard' },
  feud: 1,
} as const satisfies { [K in keyof ScenarioSetup]?: ScenarioSetup[K] };

export type SetupPart = keyof typeof PART_DEFAULTS;

/** Parçayı ekler (başlangıç değeriyle) ya da çıkarır. */
export function withSetupPart(scenario: PackScenario, part: SetupPart, on: boolean): PackScenario {
  const setup = { ...scenario.setup } as Record<string, unknown>;
  if (on) setup[part] = JSON.parse(JSON.stringify(PART_DEFAULTS[part]));
  else delete setup[part];
  return { ...scenario, setup: setup as unknown as ScenarioSetup };
}

/** Aynı tohumla aynı şehir; "rastgele" yeni bir tohum. */
export function randomSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * (SCENARIO_RANGES.seed.max - 1));
}

// ------------------------------------------------------------ Kurallar

/** Senaryoda bir hazır kuralın yeri: yok, hazır ayarlarla ya da paketin bir kuralıyla. */
export function ruleChoice(doc: Pack, scenario: PackScenario, base: ModifierId): string {
  for (const ref of scenario.rules ?? []) {
    if (ref === base) return base;
    const rule = (doc.rules ?? []).find((entry) => entry.id === ref);
    if (rule?.base === base) return rule.id;
  }
  return '';
}

/** Kuralın seçimini yazar: aynı hazır kurala bağlı eski seçim çıkıyor (biri yetiyor). */
export function withRuleChoice(doc: Pack, scenario: PackScenario, base: ModifierId, choice: string): PackScenario {
  const baseOf = (ref: string) => (ref === base ? base : (doc.rules ?? []).find((entry) => entry.id === ref)?.base);
  const rules = (scenario.rules ?? []).filter((ref) => baseOf(ref) !== base);
  if (choice) rules.push(choice);
  const next: PackScenario = { ...scenario, rules };
  if (rules.length === 0) delete (next as { rules?: unknown }).rules;
  return next;
}

/** Pakete yeni kural: hazır kuralın adıyla başlıyor, ayarları hazır değerler. */
export function withNewRule(doc: Pack, base: ModifierId, name: string, blurb: string): { doc: Pack; id: string } {
  const rules = doc.rules ?? [];
  const taken = [...rules.map((rule) => rule.id), ...MODIFIERS.map((modifier) => modifier.id)];
  const id = uniqueId(`${base.replace(/_/g, '-')}-ayar`, taken);
  const rule: PackRule = { id, base, name, blurb, params: {} };
  return { doc: { ...doc, rules: [...rules, rule].slice(0, PACK_LIMITS.rules) }, id };
}

/**
 * Kuralın kimliğini değiştirir; onu seçen senaryolar yeni kimliği izliyor.
 * Yazılırken kimlik bir an başka bir kuralınkiyle (ya da hazır kuralınkiyle)
 * çakışabiliyor: o an başvurular taşınmıyor, kuralın son tek kimliğinde
 * (`anchor`) bekliyor; kimlik yeniden tekleşince oradan taşınıyor. Yoksa
 * çakışılan kuralın başvuruları da bu kurala geçiyordu (Codex #98).
 * Dönen `pending` bir sonraki yazmanın `anchor`'u (çakışma yoksa null).
 */
export function withRuleId(doc: Pack, index: number, id: string, anchor?: string): { doc: Pack; pending: string | null } {
  const list = doc.rules ?? [];
  const rule = list[index];
  if (!rule) return { doc, pending: null };
  const from = anchor ?? rule.id;
  const rules = list.map((entry, i) => (i === index ? { ...entry, id } : entry));
  const taken = list.some((entry, i) => i !== index && entry.id === id) || MODIFIERS.some((modifier) => modifier.id === id);
  if (taken) return { doc: { ...doc, rules }, pending: from };
  const scenarios = (doc.scenarios ?? []).map((scenario) =>
    scenario.rules?.includes(from) ? { ...scenario, rules: scenario.rules.map((ref) => (ref === from ? id : ref)) } : scenario,
  );
  return { doc: { ...doc, rules, scenarios }, pending: null };
}

/** Kuralı siler; onu kullanan senaryolardan da çıkıyor. */
export function withoutRule(doc: Pack, index: number): Pack {
  const rule = (doc.rules ?? [])[index];
  if (!rule) return doc;
  const rules = (doc.rules ?? []).filter((_, i) => i !== index);
  const scenarios = (doc.scenarios ?? []).map((scenario) => {
    if (!scenario.rules?.includes(rule.id)) return scenario;
    const refs = scenario.rules.filter((ref) => ref !== rule.id);
    const next = { ...scenario, rules: refs };
    if (refs.length === 0) delete (next as { rules?: unknown }).rules;
    return next;
  });
  const out: Pack = { ...doc, scenarios };
  if (rules.length > 0) out.rules = rules;
  else delete (out as { rules?: unknown }).rules;
  return out;
}

// ------------------------------------------------------------ Kaydetme

/** Paylaşım kutusunun ve kodun sınırı: paket JSON'u 64 KB'ı geçmesin. */
export const MAX_DRAFT_BYTES = 64 * 1024;

export function draftBytes(doc: Pack): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

/** Yıldız eşiklerinin aralığı: gün ölçüsünde senaryonun süresi üst sınır. */
export function starsRange(scenario: PackScenario) {
  return starRange(scenario.stars?.metric ?? starMetric(scenario.goal.kind), typeof scenario.days === 'number' ? scenario.days : undefined);
}
