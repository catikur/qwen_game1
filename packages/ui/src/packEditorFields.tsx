import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { numberLocale } from '@capital/content';
import type { NumberRange, Pack, PackIssue } from '@capital/content';
import { formatMoney } from '@capital/core';
import { LOCALE_NAMES } from './i18n/locale';
import { et } from './packEditorMessages';
import { issueText } from './packMessages';
import { getAt, issuesAt, pathKey, textIn, writeText } from './packEditorModel';
import type { Path } from './packEditorModel';

/*
 * Editörün form alanları (Tur 68). Her alan belgede bir yola bağlı; sınırı
 * doğrulayıcının tablosundan (`NumberRange`, `PACK_LIMITS`), sorunları
 * doğrulayıcının o yol için söyledikleri. Girdinin kendisi `data-edit-path`
 * taşıyor: sorun listesindeki "alana git" onu buluyor.
 */

export interface EditorContextValue {
  doc: Pack;
  issues: readonly PackIssue[];
  locales: readonly string[];
  set: (path: Path, value: unknown) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('editor context missing');
  return value;
}

function IssueLines({ issues }: { issues: readonly PackIssue[] }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <ul className="editor-issues">
      {issues.map((issue, index) => (
        <li key={`${issue.path}:${issue.code}:${index}`} className="editor-issue" data-edit-issue={issue.code}>
          {issueText(issue)}
        </li>
      ))}
    </ul>
  );
}

/** Alanın kabuğu: etiket, girdi, sınır ya da ipucu, sorunlar. */
export function Field({
  label,
  hint,
  aside,
  issues,
  id,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  aside?: string;
  issues: readonly PackIssue[];
  id: string;
  children: ReactNode;
  wide?: boolean;
}): ReactElement {
  return (
    <div className={`editor-field${wide ? ' wide' : ''}${issues.length > 0 ? ' invalid' : ''}`}>
      <div className="editor-label-row">
        <label htmlFor={id}>{label}</label>
        {aside && <span className="editor-aside">{aside}</span>}
      </div>
      {children}
      {hint && <p className="editor-hint">{hint}</p>}
      <IssueLines issues={issues} />
    </div>
  );
}

function decimalSeparator(): string {
  return new Intl.NumberFormat(numberLocale()).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
}

/**
 * Girdiye yazılan sayı. Etkin dilin ondalık işareti ondalık; öteki işaret
 * yalnız üçlü gruplar ayırıyorsa binlik ("1.500.000"), yoksa o da ondalık:
 * Türkçe arayüzde "1.2" 12 değil 1,2 (Tur 68: çarpanlar böyle yazılıyor).
 */
export function parseNumber(text: string): number | null {
  const decimal = decimalSeparator();
  const group = decimal === ',' ? '.' : ',';
  let compact = text.replace(/[\s_]/g, '');
  if (compact.includes(decimal)) compact = compact.split(group).join('').replace(decimal, '.');
  else if (compact.includes(group)) {
    const grouped = new RegExp(`^-?\\d{1,3}(\\${group}\\d{3})+$`).test(compact);
    compact = grouped ? compact.split(group).join('') : compact.replace(group, '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(compact)) return null;
  return Number(compact);
}

function showNumber(value: number): string {
  return new Intl.NumberFormat(numberLocale(), { useGrouping: false, maximumFractionDigits: 6 }).format(value);
}

function scaled(value: number, scale: number): number {
  return Math.round(value * scale * 1e6) / 1e6;
}

/**
 * Sayı alanı. `scale` gösterimin katı (pay %40 yazılıyor, belgede 0,4).
 * Okunamayan metin belgeye metin olarak gidiyor: doğrulayıcı "sayı olmalı"
 * diyor, oyuncu alanın altında görüyor. Boş alan isteğe bağlıysa siliniyor.
 */
export function NumberField({
  path,
  label,
  range,
  hint,
  unit,
  scale = 1,
  money,
}: {
  path: Path;
  label: string;
  range: NumberRange;
  hint?: string;
  unit?: string;
  scale?: number;
  money?: boolean;
}): ReactElement {
  const { doc, issues, set } = useEditor();
  const id = useId();
  const key = pathKey(path);
  const value = getAt(doc, path);
  const fromDoc = typeof value === 'number' ? showNumber(scaled(value, scale)) : typeof value === 'string' ? value : '';
  const [text, setText] = useState(fromDoc);
  // Belge dışarıdan değişti (hedef türü, baştan başla, başka senaryo): yazılanı belgeyle eşitle.
  useEffect(() => {
    const parsed = parseNumber(text);
    const current = parsed === null ? null : Math.round((parsed / scale) * 1e9) / 1e9;
    if (!(typeof value === 'number' && current === value) && !(typeof value === 'string' && value === text)) setText(fromDoc);
  }, [value]);
  const format = (n: number) => (money ? formatMoney(n) : showNumber(scaled(n, scale)));
  const range_ = et('hud.editor.range', { min: format(range.min), max: format(range.max) }) + (unit ? ` ${unit}` : '');
  const own = issuesAt(issues, key);
  return (
    <Field label={label} hint={hint} aside={range_} issues={own} id={id}>
      <input
        id={id}
        type="text"
        inputMode={range.integer && scale === 1 ? 'numeric' : 'decimal'}
        value={text}
        spellCheck={false}
        aria-invalid={own.length > 0}
        data-edit-path={key}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === '') return set(path, undefined);
          const parsed = parseNumber(raw);
          set(path, parsed === null ? raw : Math.round((parsed / scale) * 1e9) / 1e9);
        }}
      />
    </Field>
  );
}

/** Metin alanı: dil başına bir girdi (tek dilde bir), karakter sayacı sınırla. */
export function TextField({
  path,
  label,
  max,
  hint,
  multiline,
  optional,
}: {
  path: Path;
  label: string;
  max: number;
  hint?: string;
  multiline?: boolean;
  optional?: boolean;
}): ReactElement {
  const { doc, issues, locales, set } = useEditor();
  const id = useId();
  const key = pathKey(path);
  const value = getAt(doc, path);
  const own = issuesAt(issues, key);
  const single = locales.length <= 1;
  return (
    <Field label={label} hint={hint} aside={single ? et('hud.editor.chars', { count: textIn(value, locales[0] ?? '').length, max }) : undefined} issues={own} id={`${id}-0`} wide={multiline}>
      <div className={`editor-locales n${locales.length}`}>
        {locales.map((locale, index) => {
          const text = textIn(value, locale);
          const localeKey = locales.length > 1 ? `${key}.${locale}` : key;
          const localeIssues = locales.length > 1 ? issuesAt(issues, localeKey) : [];
          const common = {
            id: `${id}-${index}`,
            value: text,
            lang: locale,
            'aria-invalid': own.length + localeIssues.length > 0,
            'data-edit-path': localeKey,
            onChange: (e: { target: { value: string } }) => {
              const next = e.target.value;
              set(path, optional && next === '' && locales.length <= 1 ? undefined : writeText(value, locale, next, locales));
            },
          };
          return (
            <div key={locale} className="editor-locale">
              {locales.length > 1 && (
                <span className="editor-locale-name" aria-hidden="true">
                  {LOCALE_NAMES[locale] ?? locale}
                </span>
              )}
              {multiline ? <textarea rows={4} {...common} aria-label={locales.length > 1 ? `${label} · ${LOCALE_NAMES[locale] ?? locale}` : undefined} /> : <input type="text" {...common} aria-label={locales.length > 1 ? `${label} · ${LOCALE_NAMES[locale] ?? locale}` : undefined} />}
              {!single && <span className={`editor-count${text.length > max ? ' over' : ''}`}>{et('hud.editor.chars', { count: text.length, max })}</span>}
              <IssueLines issues={localeIssues} />
            </div>
          );
        })}
      </div>
    </Field>
  );
}

/** Kimlik ya da düz metin (dile bağlı değil). `onWrite` yazmayı çağırana bırakıyor (kuralın kimliği, başvurularıyla). */
export function PlainField({
  path,
  label,
  hint,
  max,
  optional,
  onWrite,
}: {
  path: Path;
  label: string;
  hint?: string;
  max: number;
  optional?: boolean;
  onWrite?: (value: string) => void;
}): ReactElement {
  const { doc, issues, set } = useEditor();
  const id = useId();
  const key = pathKey(path);
  const value = getAt(doc, path);
  const own = issuesAt(issues, key);
  return (
    <Field label={label} hint={hint} aside={et('hud.editor.chars', { count: typeof value === 'string' ? value.length : 0, max })} issues={own} id={id}>
      <input
        id={id}
        type="text"
        value={typeof value === 'string' ? value : ''}
        spellCheck={false}
        autoCapitalize="off"
        aria-invalid={own.length > 0}
        data-edit-path={key}
        onChange={(e) => (onWrite ? onWrite(e.target.value) : set(path, optional && e.target.value === '' ? undefined : e.target.value))}
      />
    </Field>
  );
}

export interface Choice {
  value: string;
  label: string;
}

export function ChoiceField({
  path,
  label,
  choices,
  hint,
  onChoose,
}: {
  path: Path;
  label: string;
  choices: readonly Choice[];
  hint?: string;
  /** Seçim belgeye yazılmadan önce başka bir şey de değiştirecekse (hedef türü). */
  onChoose?: (value: string) => void;
}): ReactElement {
  const { doc, issues, set } = useEditor();
  const id = useId();
  const key = pathKey(path);
  const value = getAt(doc, path);
  const own = issuesAt(issues, key);
  const known = choices.some((choice) => choice.value === value);
  return (
    <Field label={label} hint={hint} issues={own} id={id}>
      <select id={id} value={typeof value === 'string' ? value : ''} aria-invalid={own.length > 0} data-edit-path={key} onChange={(e) => (onChoose ? onChoose(e.target.value) : set(path, e.target.value))}>
        {!known && <option value={typeof value === 'string' ? value : ''}>{typeof value === 'string' && value ? value : '—'}</option>}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Açık/kapalı. `path` yoksa denetimi çağıran yönetiyor (parçayı ekle/çıkar). */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
  dataKey,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  dataKey?: string;
}): ReactElement {
  return (
    <label className="editor-toggle">
      <input type="checkbox" checked={checked} data-edit-toggle={dataKey} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="editor-hint">{hint}</span>}
      </span>
    </label>
  );
}
