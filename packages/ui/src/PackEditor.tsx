import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  BUILDING_BY_ID,
  CATEGORIES,
  CITY_SIZES,
  CRISIS_BY_ID,
  DIFFICULTIES,
  GOAL_KINDS,
  GOAL_PLACEHOLDERS,
  GOAL_RANGES,
  GOOD_BY_ID,
  MODIFIERS,
  MODIFIER_BY_ID,
  MODIFIER_RULES,
  PACK_CHOICES,
  PACK_LIMITS,
  RULE_KEY,
  RULE_PARAMS,
  SCENARIO_RANGES,
  SETUP_RANGES,
  GAP_RANGE,
  availableLocales,
  currentLocale,
  packScenarioId,
  packText,
  scenarioFromPack,
  validatePack,
} from '@capital/content';
import type { ModifierId, Pack, PackIssue, PackRule, PackScenario, ScenarioDef, ScenarioGoalKind } from '@capital/content';
import { useDialogFocus } from './dialog';
import { fileSlug } from './fileName';
import { LOCALE_NAMES } from './i18n/locale';
import { ScenarioCard } from './ScenarioCard';
import { ScenarioDetail } from './ScenarioDetail';
import { ChoiceField, EditorContext, Field, NumberField, PlainField, TextField, Toggle, parseNumber, useEditor } from './packEditorFields';
import type { Choice, EditorContextValue } from './packEditorFields';
import { et } from './packEditorMessages';
import type { EditorMessageKey } from './packEditorMessages';
import { issueText } from './packMessages';
import { MAX_PACKS, addPack } from './packStore';
import { draftBytes, draftJson, draftLocales, getAt, issuesAt, MAX_DRAFT_BYTES, pathKey, randomSeed, ruleChoice, setAt, starsRange, textIn, withGoalKind, withLocales, withNewRule, withRuleChoice, withScenarioCopy, withSetupPart, ruleIdTaken, withRuleId, withoutRule, withoutScenario } from './packEditorModel';
import type { Path, SetupPart } from './packEditorModel';
import { draftFrom, freshDraft, markTrial, storeDraft } from './packDraft';
import type { Draft } from './packDraft';

/*
 * Senaryo editörü (Tur 68): paketin bütün alanları formda. Doğrulayıcı her
 * değişiklikte koşuyor; sorun alanın altında, hepsi altta bir listede (alana
 * git). Ön izleme kurulum ekranındaki kart ve ayrıntının kendisi. "Dene"
 * taslağı kaydetmeden başlatıyor; "Rafa kaydet" paketi yüklüyor (aynı
 * kimlik yeni sürüm). Taslak her değişiklikte bu cihaza yazılıyor.
 */

/** Sorun listesinde kaç satır; kalanı sayılıyor. */
const SHOWN_ISSUES = 10;
/** Taslağın depoya yazılması yazmayı bekliyor (masaüstünde her yazma bir dosya); sayfa kapanırken hemen. */
const STORE_DELAY_MS = 250;

const SETUP_PARTS: readonly SetupPart[] = ['outlets', 'idle', 'builtDaysAgo', 'loan', 'raiderStake', 'crisis', 'consortium', 'projects', 'freeze', 'secondCity', 'feud'];

type Notice = { tone: 'good' | 'bad' | 'info'; text: string };

export interface PackEditorProps {
  draft: Draft;
  /** "Baştan başla"nın senaryosu: kurulum ekranında seçili hazır senaryo. */
  example: ScenarioDef;
  onClose: () => void;
  onTry: (def: ScenarioDef) => void;
  onSaved: (scenarioId: string) => void;
  /** Dosya indirme (kabuğun; masaüstünde İndirilenler). Yoksa düğme yok. */
  deliverFile?: (filename: string, text: string) => Promise<string>;
}

function names<T extends string>(ids: readonly T[], label: (id: T) => string): Choice[] {
  return ids.map((id) => ({ value: id, label: label(id) }));
}

const GOAL_FIELD_KEYS: Record<string, EditorMessageKey> = {
  target: 'hud.editor.field.goal.target',
  share: 'hud.editor.field.goal.share',
  projects: 'hud.editor.field.goal.projects',
  maxRank: 'hud.editor.field.goal.maxRank',
  graceDays: 'hud.editor.field.goal.graceDays',
  rivals: 'hud.editor.field.goal.rivals',
  outlets: 'hud.editor.field.goal.outlets',
  units: 'hud.editor.field.goal.units',
  renewals: 'hud.editor.field.goal.renewals',
};

const PARAM_LABELS: Record<string, EditorMessageKey> = {
  firstDay: 'hud.editor.param.firstDay',
  firstSpread: 'hud.editor.param.firstSpread',
  gapDays: 'hud.editor.param.gapDays',
  buildDiscount: 'hud.editor.param.buildDiscount',
  budgetMultiplier: 'hud.editor.param.budgetMultiplier',
  raidWarmupMultiplier: 'hud.editor.param.raidWarmupMultiplier',
  rateDelta: 'hud.editor.param.rateDelta',
  limitMultiplier: 'hud.editor.param.limitMultiplier',
  priceMultiplier: 'hud.editor.param.priceMultiplier',
  unlockDelay: 'hud.editor.param.unlockDelay',
};

/** Sorun yolunun alan adı (`s` senaryo, `r` kural; dizin ve dil yolda yok). */
const FIELD_LABELS: Record<string, EditorMessageKey> = {
  id: 'hud.editor.field.packId',
  name: 'hud.editor.field.packName',
  author: 'hud.editor.field.author',
  scenarios: 'hud.editor.section.scenarios',
  rules: 'hud.editor.section.packRules',
  's.id': 'hud.editor.field.scenarioId',
  's.title': 'hud.editor.field.title',
  's.tagline': 'hud.editor.field.tagline',
  's.brief': 'hud.editor.field.brief',
  's.goalText': 'hud.editor.field.goalText',
  's.facts': 'hud.editor.field.facts',
  's.seed': 'hud.editor.field.seed',
  's.citySize': 'hud.editor.field.citySize',
  's.difficulty': 'hud.editor.field.difficulty',
  's.preludeDays': 'hud.editor.field.preludeDays',
  's.days': 'hud.editor.field.days',
  's.rules': 'hud.editor.section.rules',
  's.goal': 'hud.editor.section.goal',
  's.goal.kind': 'hud.editor.field.goalKind',
  's.goal.goodId': 'hud.editor.field.goal.goodId',
  's.stars': 'hud.editor.section.goal',
  's.stars.two': 'hud.editor.field.starsTwo',
  's.stars.three': 'hud.editor.field.starsThree',
  's.setup': 'hud.editor.section.setup',
  's.setup.cash': 'hud.editor.field.cash',
  's.setup.loan.amount': 'hud.editor.field.loanAmount',
  's.setup.loan.termDays': 'hud.editor.field.loanTerm',
  's.setup.idle.focus': 'hud.editor.field.idleFocus',
  's.setup.crisis.id': 'hud.editor.field.crisisId',
  's.setup.secondCity.capital': 'hud.editor.field.capital',
  'r.id': 'hud.editor.field.ruleId',
  'r.base': 'hud.editor.field.ruleBase',
  'r.name': 'hud.editor.field.ruleName',
  'r.blurb': 'hud.editor.field.ruleBlurb',
};
for (const [key, label] of Object.entries(GOAL_FIELD_KEYS)) FIELD_LABELS[`s.goal.${key}`] = label;
for (const part of SETUP_PARTS) FIELD_LABELS[`s.setup.${part}`] = `hud.editor.part.${part}` as EditorMessageKey;
for (const [key, label] of Object.entries(PARAM_LABELS)) FIELD_LABELS[`r.params.${key}`] = label;

/**
 * Sorunun yeri okunur: "Kurtarma · Başlık (English)". Yol tabloda yoksa en
 * yakın üst yolun adı; o da yoksa yolun kendisi.
 */
export function issuePlace(doc: Pack, path: string, locales: readonly string[]): string {
  let owner = '';
  let rest = path;
  const scenario = /^scenarios\[(\d+)\]\.?/.exec(rest);
  const rule = /^rules\[(\d+)\]\.?/.exec(rest);
  if (scenario) {
    const entry = doc.scenarios[Number(scenario[1])];
    owner = entry ? textIn(entry.title, locales[0] ?? '') || entry.id : '';
    rest = `s${rest.length > scenario[0].length ? '.' : ''}${rest.slice(scenario[0].length)}`;
  } else if (rule) {
    const entry = (doc.rules ?? [])[Number(rule[1])];
    owner = entry ? textIn(entry.name, locales[0] ?? '') || entry.id : '';
    rest = `r${rest.length > rule[0].length ? '.' : ''}${rest.slice(rule[0].length)}`;
  }
  let locale = '';
  const segments = rest.replace(/\[\d+\]/g, '').split('.').filter(Boolean);
  const last = segments[segments.length - 1];
  if (segments.length > 1 && last && /^[a-z]{2}$/.test(last) && (locales.includes(last) || last in LOCALE_NAMES)) {
    locale = LOCALE_NAMES[last] ?? last;
    segments.pop();
  }
  let label = '';
  for (let n = segments.length; n > 0 && !label; n--) {
    const key = FIELD_LABELS[segments.slice(0, n).join('.')];
    if (key) label = et(key);
  }
  if (!label) return path;
  return [owner, locale ? `${label} (${locale})` : label].filter(Boolean).join(' · ');
}

export default function PackEditor({ draft, example, onClose, onTry, onSaved, deliverFile }: PackEditorProps): ReactElement {
  const [doc, setDoc] = useState<Pack>(draft.doc);
  const [saved, setSaved] = useState(draft.saved);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, draft.index), Math.max(0, draft.doc.scenarios.length - 1)));
  const [locales, setLocales] = useState(() => draftLocales(draft.doc, currentLocale()));
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'removeScenario' | null>(null);
  // JSON bölümü açık mı (indirme verilemeyince açılıyor); metin hep belgenin şimdiki hâli.
  const [jsonOpen, setJsonOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const lastGood = useRef<Map<string, ScenarioDef>>(new Map());
  useDialogFocus(frame);

  const scenario = doc.scenarios[Math.min(index, doc.scenarios.length - 1)]!;
  const result = useMemo(() => validatePack(doc), [doc]);
  const issues: readonly PackIssue[] = result.ok ? [] : result.issues;
  const bytes = useMemo(() => draftBytes(doc), [doc]);
  const tooLarge = bytes > MAX_DRAFT_BYTES;
  const ready = result.ok && !tooLarge;

  // Taslak her değişiklikte bu cihaza; yazma kısa bir süre bekliyor, kapanırken hemen.
  const latest = useRef({ doc, saved, index });
  latest.current = { doc, saved, index };
  useEffect(() => {
    const timer = window.setTimeout(() => storeDraft(latest.current), STORE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, saved, index]);
  useEffect(() => {
    // Sayfa yenilenir ya da kapanırsa bekleyen yazma kaybolmasın (Tur 68 tarayıcı testi).
    const flush = () => storeDraft(latest.current);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const set = (path: Path, value: unknown) => {
    setDoc((current) => setAt(current, path, value));
    setNotice(null);
  };
  const setScenario = (next: PackScenario) => set(['scenarios', index], next);
  const context: EditorContextValue = { doc, issues, locales, set };
  const at = (...rest: (string | number)[]): Path => ['scenarios', index, ...rest];

  // Ön izleme: paket geçerliyse senaryonun oyundaki tanımı; değilse son geçerli hâli.
  const previewKey = `${index}`;
  let preview: ScenarioDef | null = null;
  let stale = false;
  if (result.ok) {
    preview = scenarioFromPack(result.pack, scenario);
    lastGood.current.set(previewKey, preview);
  } else {
    preview = lastGood.current.get(previewKey) ?? null;
    stale = preview !== null;
  }

  const scenarioIssues = (i: number) => issues.filter((issue) => issue.path.startsWith(`scenarios[${i}]`)).length;

  /** Sorunun alanına git: başka senaryodaysa önce ona geç; tam yol yoksa en yakın üst yol. */
  const goTo = (issue: PackIssue) => {
    const match = /^scenarios\[(\d+)\]/.exec(issue.path);
    if (match) setIndex(Number(match[1]));
    window.requestAnimationFrame(() => {
      const root = frame.current;
      if (!root) return;
      let key = issue.path;
      for (;;) {
        const target = root.querySelector<HTMLElement>(`[data-edit-path="${CSS.escape(key)}"]`);
        if (target) {
          target.focus();
          target.scrollIntoView({ block: 'center' });
          return;
        }
        const cut = Math.max(key.lastIndexOf('.'), key.lastIndexOf('['));
        if (cut <= 0) return;
        key = key.slice(0, cut);
      }
    });
  };

  const toggleLocale = (locale: string, on: boolean) => {
    const next = on ? [...locales, locale] : locales.filter((id) => id !== locale);
    if (next.length === 0) return;
    setDoc((current) => withLocales(current, locales, next));
    setLocales(next);
  };

  const tryIt = () => {
    if (!result.ok) return;
    const def = scenarioFromPack(result.pack, scenario);
    storeDraft({ doc, saved, index });
    markTrial();
    onTry(def);
  };

  const save = () => {
    if (!ready) return;
    const copy = JSON.parse(JSON.stringify(doc)) as Pack;
    const outcome = addPack(copy);
    if (outcome.status === 'full') {
      setNotice({ tone: 'bad', text: et('hud.editor.full', { count: MAX_PACKS }) });
      return;
    }
    const json = JSON.stringify(doc);
    setSaved(json);
    storeDraft({ doc, saved: json, index });
    const name = packText(doc.name);
    setNotice({ tone: 'good', text: et(outcome.status === 'added' ? 'hud.editor.saved' : 'hud.editor.updated', { name }) });
    onSaved(packScenarioId(doc.id, scenario.id));
  };

  const download = async () => {
    if (!deliverFile) return;
    const text = draftJson(doc);
    const outcome = await deliverFile(`${fileSlug(doc.id || packText(doc.name), 'paket')}.capitalforge.json`, text);
    if (outcome === 'copied') setNotice({ tone: 'info', text: et('hud.editor.downloadCopied') });
    else if (outcome === 'blocked' || outcome === 'declined') {
      setJsonOpen(true);
      setNotice({ tone: 'info', text: et('hud.editor.downloadBlocked') });
    } else setNotice({ tone: 'good', text: et('hud.editor.downloaded') });
  };

  const reset = () => {
    const next = freshDraft(draftFrom(example));
    setDoc(next.doc);
    setSaved(next.saved);
    setIndex(0);
    setLocales(draftLocales(next.doc, currentLocale()));
    lastGood.current.clear();
    setConfirm(null);
    setNotice(null);
  };

  const titleOf = (entry: PackScenario) => textIn(entry.title, locales.includes(currentLocale()) ? currentLocale() : locales[0]!) || et('hud.editor.untitled');

  return (
    <div className="modal-backdrop editor-overlay">
      <div className="modal editor-modal" role="dialog" aria-modal="true" aria-labelledby="pack-editor-title" tabIndex={-1} ref={frame} data-pack-editor>
        <header className="modal-head">
          <h2 id="pack-editor-title">{et('hud.editor.title')}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label={et('hud.editor.close')} data-editor-close>
            ×
          </button>
        </header>
        <EditorContext.Provider value={context}>
          <div className="modal-body pack-editor">
            <div className="editor-main">
              <p className="muted editor-lead">{et('hud.editor.lead')}</p>

              <fieldset className="editor-section" data-editor-section="pack">
                <legend>{et('hud.editor.section.pack')}</legend>
                <div className="editor-grid">
                  <PlainField path={['id']} label={et('hud.editor.field.packId')} hint={et('hud.editor.hint.packId')} max={32} />
                  <TextField path={['name']} label={et('hud.editor.field.packName')} max={PACK_LIMITS.name} />
                  <PlainField path={['author']} label={et('hud.editor.field.author')} hint={et('hud.editor.hint.author')} max={PACK_LIMITS.author} optional />
                  <div className="editor-field">
                    <span className="editor-label">{et('hud.editor.field.languages')}</span>
                    <div className="editor-checks" role="group" aria-label={et('hud.editor.field.languages')}>
                      {[...new Set([...availableLocales(), ...locales])].map((locale) => (
                        <Toggle
                          key={locale}
                          label={LOCALE_NAMES[locale] ?? locale}
                          checked={locales.includes(locale)}
                          dataKey={`locale-${locale}`}
                          onChange={(on) => toggleLocale(locale, on)}
                        />
                      ))}
                    </div>
                    <p className="editor-hint">{et('hud.editor.hint.languages')}</p>
                  </div>
                </div>
              </fieldset>

              <fieldset className="editor-section" data-editor-section="scenarios">
                <legend>{et('hud.editor.section.scenarios')}</legend>
                <div className="editor-tabs" role="tablist" aria-label={et('hud.editor.section.scenarios')}>
                  {doc.scenarios.map((entry, i) => {
                    const count = scenarioIssues(i);
                    return (
                      <button
                        key={`${i}:${entry.id}`}
                        type="button"
                        role="tab"
                        aria-selected={i === index}
                        className={`editor-tab${i === index ? ' selected' : ''}`}
                        data-editor-tab={i}
                        onClick={() => {
                          setIndex(i);
                          setConfirm(null);
                        }}
                      >
                        {titleOf(entry)}
                        {count > 0 && <span className="editor-badge" aria-label={et('hud.editor.status.issues', { count })}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="pack-buttons">
                  <button
                    type="button"
                    className="ghost"
                    data-editor-scenario-add
                    disabled={doc.scenarios.length >= PACK_LIMITS.scenarios}
                    onClick={() => {
                      const next = withScenarioCopy(doc, index);
                      setDoc(next.doc);
                      setIndex(next.index);
                    }}
                  >
                    {et('hud.editor.scenarioAdd')}
                  </button>
                  {doc.scenarios.length > 1 && confirm !== 'removeScenario' && (
                    <button type="button" className="ghost danger" data-editor-scenario-remove onClick={() => setConfirm('removeScenario')}>
                      {et('hud.editor.scenarioRemove')}
                    </button>
                  )}
                  <span className="muted">{et('hud.editor.scenarioCount', { count: doc.scenarios.length, max: PACK_LIMITS.scenarios })}</span>
                </div>
                {confirm === 'removeScenario' && (
                  <div className="pack-confirm" role="group">
                    <p>{et('hud.editor.scenarioRemoveConfirm', { title: titleOf(scenario) })}</p>
                    <div className="pack-buttons">
                      <button
                        type="button"
                        className="danger"
                        data-editor-scenario-remove-yes
                        onClick={() => {
                          setDoc(withoutScenario(doc, index));
                          setIndex(Math.max(0, index - 1));
                          lastGood.current.clear();
                          setConfirm(null);
                        }}
                      >
                        {et('hud.editor.scenarioRemoveYes')}
                      </button>
                      <button type="button" className="ghost" onClick={() => setConfirm(null)}>
                        {et('hud.editor.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </fieldset>

              <ScenarioForm key={index} scenario={scenario} at={at} setScenario={setScenario} />
              <PackRules />

              <details className="editor-section editor-json" open={jsonOpen} onToggle={(e) => setJsonOpen(e.currentTarget.open)} data-editor-json>
                <summary>{et('hud.editor.section.json')}</summary>
                <textarea readOnly rows={12} value={jsonOpen ? draftJson(doc) : ''} onFocus={(e) => e.currentTarget.select()} aria-label={et('hud.editor.section.json')} />
              </details>
            </div>

            <aside className="editor-side" aria-label={et('hud.editor.section.preview')}>
              <h3>{et('hud.editor.section.preview')}</h3>
              <div className={`editor-preview${stale ? ' stale' : ''}`} data-editor-preview={preview ? (stale ? 'stale' : 'live') : 'none'}>
                {preview ? (
                  <>
                    {stale && <p className="muted">{et('hud.editor.preview.stale')}</p>}
                    <ScenarioCard def={preview} selected onSelect={() => undefined} />
                    <ScenarioDetail def={preview} />
                  </>
                ) : (
                  <p className="muted">{et('hud.editor.preview.none')}</p>
                )}
              </div>
            </aside>
          </div>
        </EditorContext.Provider>

        <footer className="editor-footer">
          <div className="editor-status" role="status" data-editor-status={ready ? 'ok' : issues.length}>
            {tooLarge ? (
              <p className="bad">{et('hud.editor.status.tooLarge', { size: (bytes / 1024).toFixed(1) })}</p>
            ) : issues.length === 0 ? (
              <p className="good">{et('hud.editor.status.ok')}</p>
            ) : (
              <>
                <p className="bad">{et('hud.editor.status.issues', { count: issues.length })}</p>
                <ul className="editor-issue-list">
                  {issues.slice(0, SHOWN_ISSUES).map((issue, i) => (
                    <li key={`${issue.path}:${issue.code}:${i}`}>
                      <button type="button" className="link" data-editor-goto={issue.path} onClick={() => goTo(issue)} title={`${et('hud.editor.status.goTo')} · ${issue.path}`}>
                        {issuePlace(doc, issue.path, locales)}
                      </button>
                      {': '}
                      {issueText(issue)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="muted editor-size">{et('hud.editor.size', { size: (bytes / 1024).toFixed(1) })}</p>
            {notice && (
              <p className={`pack-notice ${notice.tone}`} data-editor-notice={notice.tone}>
                {notice.text}
              </p>
            )}
          </div>
          {confirm === 'reset' ? (
            <div className="pack-confirm" role="group">
              <p>{et('hud.editor.resetConfirm')}</p>
              <div className="pack-buttons">
                <button type="button" className="danger" data-editor-reset-yes onClick={reset}>
                  {et('hud.editor.resetYes')}
                </button>
                <button type="button" className="ghost" onClick={() => setConfirm(null)}>
                  {et('hud.editor.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="pack-buttons editor-actions">
              <button type="button" className="primary" disabled={!ready} data-editor-try onClick={tryIt} title={et('hud.editor.tryHint')}>
                {et('hud.editor.try')}
              </button>
              <button type="button" disabled={!ready} data-editor-save onClick={save}>
                {et('hud.editor.save')}
              </button>
              {deliverFile && (
                <button type="button" className="ghost" data-editor-download onClick={() => void download()}>
                  {et('hud.editor.download')}
                </button>
              )}
              <button type="button" className="ghost danger" data-editor-reset onClick={() => setConfirm('reset')}>
                {et('hud.editor.reset')}
              </button>
            </div>
          )}
          <p className="muted editor-try-hint">{et('hud.editor.tryHint')}</p>
        </footer>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Senaryo

function ScenarioForm({ scenario, at, setScenario }: { scenario: PackScenario; at: (...rest: (string | number)[]) => Path; setScenario: (next: PackScenario) => void }): ReactElement {
  return (
    <>
      <ScenarioTexts scenario={scenario} at={at} />
      <ScenarioCity at={at} />
      <ScenarioGoal scenario={scenario} at={at} setScenario={setScenario} />
      <ScenarioRules scenario={scenario} at={at} setScenario={setScenario} />
      <ScenarioSetupForm scenario={scenario} at={at} setScenario={setScenario} />
    </>
  );
}

function ScenarioTexts({ scenario, at }: { scenario: PackScenario; at: (...rest: (string | number)[]) => Path }): ReactElement {
  const { set, locales } = useEditor();
  const facts = scenario.facts ?? [];
  return (
    <fieldset className="editor-section" data-editor-section="texts">
      <legend>{et('hud.editor.section.texts')}</legend>
      <div className="editor-grid">
        <PlainField path={at('id')} label={et('hud.editor.field.scenarioId')} hint={et('hud.editor.hint.scenarioId')} max={32} />
        <TextField path={at('title')} label={et('hud.editor.field.title')} max={PACK_LIMITS.title} />
        <TextField path={at('tagline')} label={et('hud.editor.field.tagline')} hint={et('hud.editor.hint.tagline')} max={PACK_LIMITS.tagline} />
        <TextField path={at('brief')} label={et('hud.editor.field.brief')} hint={et('hud.editor.hint.brief')} max={PACK_LIMITS.brief} multiline />
        <TextField
          path={at('goalText')}
          label={et('hud.editor.field.goalText')}
          hint={et('hud.editor.hint.goalText', { vars: (GOAL_PLACEHOLDERS[scenario.goal.kind] ?? ['days']).map((name) => `{${name}}`).join(', ') })}
          max={PACK_LIMITS.goalText}
          multiline
        />
      </div>
      <div className="editor-list" data-editor-facts={facts.length}>
        <span className="editor-label">{et('hud.editor.field.facts')}</span>
        {facts.map((_, j) => (
          <div key={j} className="editor-list-row">
            <TextField path={at('facts', j)} label={`${et('hud.editor.field.facts')} ${j + 1}`} max={PACK_LIMITS.fact} />
            <button type="button" className="ghost small" aria-label={et('hud.editor.factRemove')} data-editor-fact-remove={j} onClick={() => set(at('facts'), facts.filter((__, k) => k !== j))}>
              ×
            </button>
          </div>
        ))}
        {facts.length < PACK_LIMITS.facts && (
          <button type="button" className="ghost small" data-editor-fact-add onClick={() => set(at('facts'), [...facts, locales.length > 1 ? Object.fromEntries(locales.map((l) => [l, ''])) : ''])}>
            {et('hud.editor.factAdd')}
          </button>
        )}
      </div>
    </fieldset>
  );
}

function ScenarioCity({ at }: { at: (...rest: (string | number)[]) => Path }): ReactElement {
  const { set } = useEditor();
  const days = et('hud.editor.unit.days');
  return (
    <fieldset className="editor-section" data-editor-section="city">
      <legend>{et('hud.editor.section.city')}</legend>
      <div className="editor-grid">
        <div className="editor-with-button">
          <NumberField path={at('seed')} label={et('hud.editor.field.seed')} hint={et('hud.editor.hint.seed')} range={SCENARIO_RANGES.seed} />
          <button type="button" className="ghost small" data-editor-seed-random onClick={() => set(at('seed'), randomSeed())}>
            {et('hud.editor.seedRandom')}
          </button>
        </div>
        <ChoiceField path={at('citySize')} label={et('hud.editor.field.citySize')} choices={CITY_SIZES.map((size) => ({ value: size.id, label: size.name }))} />
        <ChoiceField path={at('difficulty')} label={et('hud.editor.field.difficulty')} choices={DIFFICULTIES.map((level) => ({ value: level.id, label: level.name }))} />
        <NumberField path={at('preludeDays')} label={et('hud.editor.field.preludeDays')} hint={et('hud.editor.hint.preludeDays')} range={SCENARIO_RANGES.preludeDays} unit={days} />
        <NumberField path={at('days')} label={et('hud.editor.field.days')} hint={et('hud.editor.hint.days')} range={SCENARIO_RANGES.days} unit={days} />
      </div>
    </fieldset>
  );
}

function ScenarioGoal({ scenario, at, setScenario }: { scenario: PackScenario; at: (...rest: (string | number)[]) => Path; setScenario: (next: PackScenario) => void }): ReactElement {
  const { locales } = useEditor();
  const kind = scenario.goal.kind;
  const ranges = GOAL_RANGES[kind] ?? {};
  const metric = scenario.stars?.metric ?? 'days';
  const stars = starsRange(scenario);
  const days = et('hud.editor.unit.days');
  return (
    <fieldset className="editor-section" data-editor-section="goal">
      <legend>{et('hud.editor.section.goal')}</legend>
      <div className="editor-grid">
        <ChoiceField
          path={at('goal', 'kind')}
          label={et('hud.editor.field.goalKind')}
          choices={names(GOAL_KINDS, (id) => et(`hud.editor.goal.${id}` as EditorMessageKey))}
          onChoose={(value) => setScenario(withGoalKind(scenario, value as ScenarioGoalKind, locales))}
        />
        {kind === 'chain' && (
          <ChoiceField path={at('goal', 'goodId')} label={et('hud.editor.field.goal.goodId')} choices={names(PACK_CHOICES.chainGoods, (id) => GOOD_BY_ID[id]?.name ?? id)} />
        )}
        {Object.entries(ranges).map(([key, range]) => (
          <NumberField
            key={key}
            path={at('goal', key)}
            label={et(GOAL_FIELD_KEYS[key] ?? 'hud.editor.field.goal.target')}
            range={range}
            money={key === 'target'}
            scale={key === 'share' ? 100 : 1}
            unit={key === 'share' ? et('hud.editor.unit.percent') : key === 'graceDays' ? days : undefined}
          />
        ))}
      </div>
      <p className="editor-hint" data-editor-stars={metric}>{et(metric === 'lead' ? 'hud.editor.stars.lead' : 'hud.editor.stars.days')}</p>
      <div className="editor-grid">
        <NumberField path={at('stars', 'two')} label={et('hud.editor.field.starsTwo')} range={stars} unit={metric === 'days' ? days : '×'} />
        <NumberField path={at('stars', 'three')} label={et('hud.editor.field.starsThree')} range={stars} unit={metric === 'days' ? days : '×'} />
      </div>
    </fieldset>
  );
}

function ScenarioRules({ scenario, at, setScenario }: { scenario: PackScenario; at: (...rest: (string | number)[]) => Path; setScenario: (next: PackScenario) => void }): ReactElement {
  const { doc, issues } = useEditor();
  const own = issuesAt(issues, pathKey(at('rules')), true);
  return (
    <fieldset className="editor-section" data-editor-section="rules">
      <legend>{et('hud.editor.section.rules')}</legend>
      <p className="editor-hint">{et('hud.editor.rulesHint')}</p>
      <div className="editor-grid">
        {MODIFIERS.map((modifier) => {
          const custom = (doc.rules ?? []).filter((rule) => rule.base === modifier.id);
          const value = ruleChoice(doc, scenario, modifier.id);
          return (
            <Field key={modifier.id} label={modifier.name} hint={modifier.blurb} issues={[]} id={`editor-rule-${modifier.id}`}>
              <select id={`editor-rule-${modifier.id}`} value={value} data-edit-rule={modifier.id} data-edit-path={pathKey(at('rules'))} onChange={(e) => setScenario(withRuleChoice(doc, scenario, modifier.id, e.target.value))}>
                <option value="">{et('hud.editor.rule.none')}</option>
                <option value={modifier.id}>{et('hud.editor.rule.builtin')}</option>
                {custom.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {et('hud.editor.rule.custom', { name: packText(rule.name) || rule.id })}
                  </option>
                ))}
              </select>
            </Field>
          );
        })}
      </div>
      {own.length > 0 && (
        <ul className="editor-issues">
          {own.map((issue, i) => (
            <li key={i} className="editor-issue" data-edit-issue={issue.code}>
              <code>{issue.path}</code> {issueText(issue)}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function ScenarioSetupForm({ scenario, at, setScenario }: { scenario: PackScenario; at: (...rest: (string | number)[]) => Path; setScenario: (next: PackScenario) => void }): ReactElement {
  const { set, issues } = useEditor();
  const setup = (scenario.setup ?? {}) as unknown as Record<string, unknown>;
  const days = et('hud.editor.unit.days');
  const part = (id: SetupPart): EditorMessageKey => `hud.editor.part.${id}` as EditorMessageKey;
  const hint = (id: SetupPart): string | undefined => {
    const key = `hud.editor.hint.${id}`;
    return key === 'hud.editor.hint.outlets' || key === 'hud.editor.hint.idle' || key === 'hud.editor.hint.secondCity' || key === 'hud.editor.hint.feud' ? et(key) : undefined;
  };
  const setupKey = pathKey(at('setup'));
  const partIssues = (id: SetupPart) => issuesAt(issues, `${setupKey}.${id}`).filter((issue) => issue.code === 'needsSetup');
  return (
    <fieldset className="editor-section" data-editor-section="setup">
      <legend>{et('hud.editor.section.setup')}</legend>
      <div className="editor-grid">
        <NumberField path={at('setup', 'cash')} label={et('hud.editor.field.cash')} range={SETUP_RANGES.cash} money />
      </div>
      {SETUP_PARTS.map((id) => {
        const on = setup[id] !== undefined;
        const needs = partIssues(id);
        return (
          <div key={id} className={`editor-part${on ? ' on' : ''}${needs.length > 0 ? ' invalid' : ''}`} data-editor-part={id}>
            <Toggle label={et(part(id))} hint={hint(id)} checked={on} dataKey={`part-${id}`} onChange={(checked) => setScenario(withSetupPart(scenario, id, checked))} />
            {needs.length > 0 && (
              <ul className="editor-issues" data-edit-path={`${setupKey}.${id}`} tabIndex={-1}>
                {needs.map((issue, i) => (
                  <li key={i} className="editor-issue" data-edit-issue={issue.code}>
                    {issueText(issue)}
                  </li>
                ))}
              </ul>
            )}
            {on && <SetupPartFields id={id} at={at} setup={setup} set={set} days={days} />}
          </div>
        );
      })}
    </fieldset>
  );
}

function IdList({ path, ids, choices, label, max }: { path: Path; ids: readonly string[]; choices: readonly string[]; label: (id: string) => string; max: number }): ReactElement {
  const { set, issues } = useEditor();
  const [adding, setAdding] = useState(choices[0] ?? '');
  const key = pathKey(path);
  const own = issuesAt(issues, key, true);
  return (
    <div className="editor-idlist" data-edit-path={key} tabIndex={-1}>
      <ul>
        {ids.map((id, i) => (
          <li key={`${i}:${id}`} className="editor-chip">
            <span>{label(id)}</span>
            <button type="button" className="icon small" aria-label={et('hud.editor.outletRemove', { name: label(id) })} onClick={() => set(path, ids.filter((_, k) => k !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {ids.length < max && (
        <div className="editor-with-button">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={et('hud.editor.outletAdd')} data-editor-add-choice={key}>
            {choices.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
          <button type="button" className="ghost small" data-editor-add={key} onClick={() => set(path, [...ids, adding])}>
            {et('hud.editor.outletAdd')}
          </button>
        </div>
      )}
      <span className="muted">{et('hud.editor.chars', { count: ids.length, max })}</span>
      {own.length > 0 && (
        <ul className="editor-issues">
          {own.map((issue, i) => (
            <li key={i} className="editor-issue" data-edit-issue={issue.code}>
              {issueText(issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetupPartFields({ id, at, setup, set, days }: { id: SetupPart; at: (...rest: (string | number)[]) => Path; setup: Record<string, unknown>; set: (path: Path, value: unknown) => void; days: string }): ReactElement | null {
  const building = (defId: string) => BUILDING_BY_ID[defId]?.name ?? defId;
  switch (id) {
    case 'outlets':
      return <IdList path={at('setup', 'outlets')} ids={(setup['outlets'] as string[] | undefined) ?? []} choices={PACK_CHOICES.outlets} label={building} max={PACK_LIMITS.outlets} />;
    case 'idle': {
      const idle = (setup['idle'] as { defIds?: string[] } | undefined) ?? {};
      return (
        <div className="editor-grid">
          <IdList path={at('setup', 'idle', 'defIds')} ids={idle.defIds ?? []} choices={PACK_CHOICES.idle} label={building} max={PACK_LIMITS.idle} />
          <ChoiceField path={at('setup', 'idle', 'focus')} label={et('hud.editor.field.idleFocus')} choices={names(PACK_CHOICES.categories, (cat) => CATEGORIES[cat]?.name ?? cat)} />
        </div>
      );
    }
    case 'builtDaysAgo':
      return <NumberField path={at('setup', 'builtDaysAgo')} label={et('hud.editor.part.builtDaysAgo')} range={SETUP_RANGES.builtDaysAgo} unit={days} />;
    case 'loan':
      return (
        <div className="editor-grid">
          <NumberField path={at('setup', 'loan', 'amount')} label={et('hud.editor.field.loanAmount')} range={SETUP_RANGES.loan.amount} money />
          <NumberField path={at('setup', 'loan', 'termDays')} label={et('hud.editor.field.loanTerm')} range={SETUP_RANGES.loan.termDays} unit={days} />
        </div>
      );
    case 'raiderStake':
      return <NumberField path={at('setup', 'raiderStake')} label={et('hud.editor.part.raiderStake')} range={SETUP_RANGES.raiderStake} scale={100} unit={et('hud.editor.unit.percent')} />;
    case 'crisis':
      return (
        <div className="editor-grid">
          <ChoiceField path={at('setup', 'crisis', 'id')} label={et('hud.editor.field.crisisId')} choices={names(PACK_CHOICES.crises, (crisis) => CRISIS_BY_ID[crisis]?.title ?? crisis)} />
          <NumberField path={at('setup', 'crisis', 'warningDays')} label={et('hud.editor.field.warningDays')} range={SETUP_RANGES.crisis.warningDays} unit={days} />
        </div>
      );
    case 'consortium':
      return <NumberField path={at('setup', 'consortium', 'warningDays')} label={et('hud.editor.field.warningDays')} range={SETUP_RANGES.consortium.warningDays} unit={days} />;
    case 'projects':
      return (
        <div className="editor-grid">
          <NumberField path={at('setup', 'projects', 'firstInDays')} label={et('hud.editor.field.projectsFirst')} range={SETUP_RANGES.projects.firstInDays} unit={days} />
          <NumberField path={at('setup', 'projects', 'gapDays')} label={et('hud.editor.field.projectsGap')} range={SETUP_RANGES.projects.gapDays} unit={days} />
        </div>
      );
    case 'freeze': {
      const freeze = (setup['freeze'] as Record<string, boolean> | undefined) ?? {};
      return (
        <div className="editor-checks">
          {(['entrants', 'issuance'] as const).map((key) => (
            <Toggle
              key={key}
              label={et(key === 'entrants' ? 'hud.editor.field.freezeEntrants' : 'hud.editor.field.freezeIssuance')}
              checked={freeze[key] === true}
              dataKey={`freeze-${key}`}
              onChange={(checked) => set(at('setup', 'freeze', key), checked ? true : undefined)}
            />
          ))}
        </div>
      );
    }
    case 'secondCity':
      return (
        <div className="editor-grid">
          <NumberField path={at('setup', 'secondCity', 'capital')} label={et('hud.editor.field.capital')} range={SETUP_RANGES.secondCity.capital} money />
          <ChoiceField path={at('setup', 'secondCity', 'citySize')} label={et('hud.editor.field.citySize')} choices={CITY_SIZES.map((size) => ({ value: size.id, label: size.name }))} />
        </div>
      );
    case 'feud':
      return <NumberField path={at('setup', 'feud')} label={et('hud.editor.part.feud')} range={SETUP_RANGES.feud} />;
  }
}

// ------------------------------------------------------------ Paketin kuralları

function PackRules(): ReactElement {
  const { doc, set } = useEditor();
  const rules = doc.rules ?? [];
  const [base, setBase] = useState<ModifierId>(MODIFIERS[0]!.id);
  const setDoc = (next: Pack) => set([], next);
  return (
    <fieldset className="editor-section" data-editor-section="packRules">
      <legend>{et('hud.editor.section.packRules')}</legend>
      <p className="editor-hint">{et('hud.editor.packRulesHint')}</p>
      {rules.map((rule, i) => (
        <RuleForm key={i} rule={rule} index={i} onRemove={() => setDoc(withoutRule(doc, i))} />
      ))}
      {rules.length < PACK_LIMITS.rules && (
        <div className="editor-with-button">
          <select value={base} onChange={(e) => setBase(e.target.value as ModifierId)} aria-label={et('hud.editor.field.ruleBase')} data-editor-rule-base>
            {MODIFIERS.map((modifier) => (
              <option key={modifier.id} value={modifier.id}>
                {modifier.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost small"
            data-editor-rule-add
            onClick={() => {
              const modifier = MODIFIER_BY_ID[base];
              setDoc(withNewRule(doc, base, modifier.name, modifier.blurb).doc);
            }}
          >
            {et('hud.editor.ruleAdd')}
          </button>
        </div>
      )}
    </fieldset>
  );
}

function RuleForm({ rule, index, onRemove }: { rule: PackRule; index: number; onRemove: () => void }): ReactElement {
  const { set, doc } = useEditor();
  const path: Path = ['rules', index];
  const defaults = MODIFIER_RULES[RULE_KEY[rule.base]] as Record<string, unknown>;
  const schema = RULE_PARAMS[rule.base] ?? {};
  const shown = (value: unknown) => (Array.isArray(value) ? value.join('–') : typeof value === 'boolean' ? et(value ? 'hud.editor.yes' : 'hud.editor.no') : String(value));
  return (
    <div className="editor-rule" data-editor-rule={rule.id}>
      <div className="editor-grid">
        <RuleIdField rule={rule} index={index} />
        <ChoiceField
          path={[...path, 'base']}
          label={et('hud.editor.field.ruleBase')}
          choices={MODIFIERS.map((modifier) => ({ value: modifier.id, label: modifier.name }))}
          // Başka kurala geçince ayarlar o kuralın değil: sıfırlanıyor.
          onChoose={(value) => set(path, { ...rule, base: value as ModifierId, params: {} })}
        />
        <TextField path={[...path, 'name']} label={et('hud.editor.field.ruleName')} max={PACK_LIMITS.name} />
        <TextField path={[...path, 'blurb']} label={et('hud.editor.field.ruleBlurb')} max={PACK_LIMITS.tagline} />
        {Object.entries(schema).map(([key, spec]) => {
          const label = et(PARAM_LABELS[key] ?? 'hud.editor.param.firstDay');
          const hint = et('hud.editor.paramDefault', { value: shown(defaults[key]) });
          const paramPath: Path = [...path, 'params', key];
          if (spec === 'boolean') {
            const value = getAt(doc, paramPath);
            return (
              <Field key={key} label={label} issues={[]} id={`editor-param-${index}-${key}`}>
                <select
                  id={`editor-param-${index}-${key}`}
                  value={value === true ? 'yes' : value === false ? 'no' : ''}
                  data-edit-path={pathKey(paramPath)}
                  onChange={(e) => set(paramPath, e.target.value === '' ? undefined : e.target.value === 'yes')}
                >
                  <option value="">{et('hud.editor.boolDefault', { value: shown(defaults[key]) })}</option>
                  <option value="yes">{et('hud.editor.yes')}</option>
                  <option value="no">{et('hud.editor.no')}</option>
                </select>
              </Field>
            );
          }
          if (spec === 'range') return <GapField key={key} path={paramPath} label={label} hint={hint} />;
          return (
            <NumberField
              key={key}
              path={paramPath}
              label={label}
              hint={hint}
              range={spec}
              scale={key === 'rateDelta' ? 100 : 1}
              unit={key === 'rateDelta' ? et('hud.editor.unit.points') : key === 'firstDay' || key === 'firstSpread' ? et('hud.editor.unit.days') : undefined}
            />
          );
        })}
      </div>
      <button type="button" className="ghost danger small" data-editor-rule-remove={rule.id} onClick={onRemove}>
        {et('hud.editor.ruleRemove')}
      </button>
    </div>
  );
}

/**
 * Kuralın kimliği. Yazılan başka bir kuralın ya da hazır kuralın kimliğiyse
 * belgeye gitmiyor (kural eski kimliğiyle kalıyor, başvurular karışmıyor);
 * alanın altında söyleniyor. Alandan çıkınca kuralın gerçek kimliğine
 * dönüyor: başka kuralı düzenlemek ya da silmek odağı aldığından, alan
 * belgede olmayan bir kimliği hiç göstermiyor (Codex #98).
 */
function RuleIdField({ rule, index }: { rule: PackRule; index: number }): ReactElement {
  const { doc, set, issues } = useEditor();
  const [text, setText] = useState(rule.id);
  useEffect(() => setText(rule.id), [rule.id]);
  const key = pathKey(['rules', index, 'id']);
  const taken = text !== rule.id && ruleIdTaken(doc, index, text);
  const own = issuesAt(issues, key);
  const id = `editor-rule-id-${index}`;
  return (
    <Field label={et('hud.editor.field.ruleId')} aside={et('hud.editor.chars', { count: text.length, max: 32 })} issues={own} id={id}>
      <input
        id={id}
        type="text"
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        aria-invalid={taken || own.length > 0}
        data-edit-path={key}
        onChange={(e) => {
          setText(e.target.value);
          set([], withRuleId(doc, index, e.target.value));
        }}
        onBlur={() => setText(rule.id)}
      />
      {taken && (
        <ul className="editor-issues">
          <li className="editor-issue" data-edit-issue="ruleIdTaken">
            {et('hud.editor.ruleIdTaken', { id: text })}
          </li>
        </ul>
      )}
    </Field>
  );
}

/** Kriz arası: iki sayı, `[en kısa, en uzun]`; ikisi de boşsa hazır değer. */
function GapField({ path, label, hint }: { path: Path; label: string; hint: string }): ReactElement {
  const { doc, set, issues } = useEditor();
  const value = getAt(doc, path);
  const pair = Array.isArray(value) ? value : [];
  const fromDoc = (): [string, string] => [pair[0] !== undefined ? String(pair[0]) : '', pair[1] !== undefined ? String(pair[1]) : ''];
  const [texts, setTexts] = useState<[string, string]>(fromDoc);
  // Belge dışarıdan değişti (kural silinince yerine kayan kural, baştan başla): yazılanı belgeyle eşitle (Codex #98).
  useEffect(() => {
    const typed = texts.map((text) => (text.trim() === '' ? undefined : parseNumber(text) ?? text));
    if (typed[0] !== pair[0] || typed[1] !== pair[1]) setTexts(fromDoc());
  }, [pair[0], pair[1]]);
  const key = pathKey(path);
  const own = issuesAt(issues, key);
  const write = (next: [string, string]) => {
    setTexts(next);
    if (next[0].trim() === '' && next[1].trim() === '') return set(path, undefined);
    set(path, next.map((text) => parseNumber(text) ?? text));
  };
  return (
    <Field label={label} hint={hint} aside={et('hud.editor.range', { min: GAP_RANGE.min, max: GAP_RANGE.max })} issues={own} id={`${key}-0`}>
      <div className="editor-pair">
        <input id={`${key}-0`} type="text" inputMode="numeric" value={texts[0]} data-edit-path={key} aria-invalid={own.length > 0} onChange={(e) => write([e.target.value, texts[1]])} />
        <span aria-hidden="true">–</span>
        <input type="text" inputMode="numeric" value={texts[1]} aria-label={`${label} (2)`} aria-invalid={own.length > 0} onChange={(e) => write([texts[0], e.target.value])} />
      </div>
    </Field>
  );
}

