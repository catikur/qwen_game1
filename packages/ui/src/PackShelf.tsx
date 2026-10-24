import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { PACK_CODE_PREFIX, PackCodeError, SCENARIOS, decodePackCode, encodePackCode, packFromScenario, packText, validatePack } from '@capital/content';
import type { PackIssue, ScenarioDef } from '@capital/content';
import { ScenarioCard } from './ScenarioCard';
import { canLinkPacks, clearPackLink, packLink, packLinkCode } from './packLink';
import { issueText, pt } from './packMessages';
import type { PackMessageKey } from './packMessages';
import { MAX_PACKS, addPack, removePack, useInstalledPacks } from './packStore';

/*
 * Paket rafı (Tur 67): kurulum ekranının senaryo sekmesinde, geç inen
 * parça. Üç parçası var: oyuncunun yüklediği senaryoların listesi, seçili
 * paket senaryosunun paylaş/kaldır düğmeleri ve ekleme kutusu. Doğrulayıcı,
 * paylaşım kodu ve bu metinler yalnız sekme açılınca iniyor.
 */

/** Yapıştırılan JSON'un sınırı; paylaşım kodunun açılmış hâliyle aynı. */
const MAX_INPUT_BYTES = 64 * 1024;
/** Sorun listesinde kaç satır; kalanı tek satırda sayılıyor. */
const SHOWN_ISSUES = 8;

class InputError extends Error {}

type Tone = 'good' | 'bad' | 'info';

interface Notice {
  tone: Tone;
  text: string;
  issues?: PackIssue[];
}

/** Kutudaki metin: paylaşım kodu ya da JSON; ikisi de değilse açık bir hata. */
async function parseInput(text: string): Promise<unknown> {
  if (text.startsWith(PACK_CODE_PREFIX)) {
    try {
      return await decodePackCode(text);
    } catch (error) {
      const code = error instanceof PackCodeError ? error.code : 'decode';
      throw new InputError(pt(`hud.pack.error.code.${code}` as PackMessageKey));
    }
  }
  if (text.startsWith('{')) {
    if (new TextEncoder().encode(text).length > MAX_INPUT_BYTES) throw new InputError(pt('hud.pack.error.tooLarge'));
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new InputError(pt('hud.pack.error.json', { reason: (error as Error).message }));
    }
  }
  throw new InputError(pt('hud.pack.error.unknown'));
}

function NoticeLine({ notice }: { notice: Notice }): ReactElement {
  const issues = notice.issues ?? [];
  return (
    <div className={`pack-notice ${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} data-pack-notice={notice.tone}>
      <p>{notice.text}</p>
      {issues.length > 0 && (
        <ul className="pack-issues" data-pack-issues={issues.length}>
          {issues.slice(0, SHOWN_ISSUES).map((issue, index) => (
            <li key={`${issue.path}:${issue.code}:${index}`} data-pack-issue={issue.code}>
              {issue.path && <code>{issue.path}</code>} {issueText(issue)}
            </li>
          ))}
          {issues.length > SHOWN_ISSUES && <li className="muted">{pt('hud.pack.more', { count: issues.length - SHOWN_ISSUES })}</li>}
        </ul>
      )}
    </div>
  );
}

/** Oyuncunun yüklediği paketlerin senaryoları, hazır senaryoların altında. */
export function PackList({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }): ReactElement {
  const packs = useInstalledPacks();
  const scenarios = packs.flatMap((entry) => entry.scenarios.map((def) => ({ def, packName: packText(entry.pack.name) })));
  return (
    <section className="pack-shelf" data-pack-shelf={scenarios.length}>
      <h3 className="pack-shelf-title">{pt('hud.pack.title')}</h3>
      {scenarios.length === 0 ? (
        <p className="muted pack-empty">{pt('hud.pack.empty')}</p>
      ) : (
        <ul className="scenario-list" role="radiogroup" aria-label={pt('hud.pack.title')}>
          {scenarios.map(({ def, packName }) => (
            <li key={def.id}>
              <ScenarioCard def={def} selected={def.id === selectedId} onSelect={onSelect} note={pt('hud.pack.from', { pack: packName })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Seçili paket senaryosunun paylaşım kodu ve paketin kaldırılması. */
export function PackActions({ def, onRemoved }: { def: ScenarioDef; onRemoved: () => void }): ReactElement | null {
  const packs = useInstalledPacks();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const source = def.source;
  useEffect(() => {
    setNotice(null);
    setFallback(null);
    setConfirming(false);
  }, [def.id]);
  if (!source) return null;
  // Kayıttan açılan ama bu cihazda yüklü olmayan paket: paylaşılabilir, kaldırılacak bir şey yok.
  const installed = packs.find((entry) => entry.pack.id === source.packId);

  const copy = async (link: boolean) => {
    // Kod için fazla uzun senaryo (çok dilli uzun metinler): paketin JSON'u, ekleme kutusu onu da alıyor.
    let text: string;
    let done: PackMessageKey;
    try {
      const code = await encodePackCode(source.doc);
      text = link ? packLink(code) : code;
      done = link ? 'hud.pack.linkCopied' : 'hud.pack.copied';
    } catch (error) {
      if (!(error instanceof PackCodeError)) throw error;
      text = JSON.stringify(source.doc);
      done = 'hud.pack.copiedJson';
    }
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setNotice({ tone: 'good', text: pt(done) });
    } catch {
      // Pano kapalı (izin yok, gömülü görünüm): kod seçilebilir metin olarak.
      setFallback(text);
      setNotice({ tone: 'info', text: pt('hud.pack.copyFailed') });
    }
  };

  const remove = () => {
    if (!installed) return;
    const name = packText(installed.pack.name);
    removePack(installed.pack.id);
    setConfirming(false);
    setNotice({ tone: 'good', text: pt('hud.pack.removed', { name }) });
    onRemoved();
  };

  return (
    <div className="pack-actions" data-pack-actions={source.packId}>
      <div className="pack-buttons">
        <button type="button" className="ghost" data-pack-copy="code" onClick={() => void copy(false)}>
          {pt('hud.pack.copyCode')}
        </button>
        {canLinkPacks() && (
          <button type="button" className="ghost" data-pack-copy="link" onClick={() => void copy(true)}>
            {pt('hud.pack.copyLink')}
          </button>
        )}
        {installed && !confirming && (
          <button type="button" className="ghost danger" data-pack-remove onClick={() => setConfirming(true)}>
            {pt('hud.pack.remove')}
          </button>
        )}
      </div>
      {installed && confirming && (
        <div className="pack-confirm" role="group" aria-label={pt('hud.pack.remove')}>
          <p>{pt('hud.pack.removeConfirm', { name: packText(installed.pack.name) })}</p>
          <div className="pack-buttons">
            <button type="button" className="danger" data-pack-remove-yes onClick={remove}>
              {pt('hud.pack.removeYes')}
            </button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              {pt('hud.pack.removeNo')}
            </button>
          </div>
        </div>
      )}
      {notice && <NoticeLine notice={notice} />}
      {fallback && (
        <textarea className="pack-code" readOnly value={fallback} rows={3} data-pack-code onFocus={(e) => e.currentTarget.select()} aria-label={pt('hud.pack.copyCode')} />
      )}
    </div>
  );
}

/** Ekleme kutusu: kod ya da JSON yapıştırılıyor, dosya seçiliyor ya da hazır senaryoyla dolduruluyor. */
export function PackAdd({ example, onSelect }: { example: ScenarioDef | null; onSelect: (id: string) => void }): ReactElement {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // Bağlantıyla gelen kod kutuya yazılıyor; eklemek oyuncunun kararı.
  useEffect(() => {
    const linked = packLinkCode();
    if (!linked) return;
    setInput(linked);
    setOpen(true);
    setNotice({ tone: 'info', text: pt('hud.pack.linked') });
    clearPackLink();
  }, []);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setNotice({ tone: 'bad', text: pt('hud.pack.error.empty') });
      return;
    }
    setBusy(true);
    setNotice({ tone: 'info', text: pt('hud.pack.checking') });
    try {
      const result = validatePack(await parseInput(trimmed));
      if (!result.ok) {
        setNotice({ tone: 'bad', text: pt('hud.pack.rejected', { count: result.issues.length }), issues: result.issues });
        return;
      }
      const outcome = addPack(result.pack);
      if (outcome.status === 'full') {
        setNotice({ tone: 'bad', text: pt('hud.pack.error.full', { count: MAX_PACKS }) });
        return;
      }
      const name = packText(result.pack.name);
      const count = outcome.entry.scenarios.length;
      setNotice({ tone: 'good', text: pt(outcome.status === 'added' ? 'hud.pack.added' : 'hud.pack.updated', { name, count }) });
      setInput('');
      const first = outcome.entry.scenarios[0];
      if (first) onSelect(first.id);
    } catch (error) {
      setNotice({ tone: 'bad', text: error instanceof InputError ? error.message : pt('hud.pack.error.unknown') });
    } finally {
      setBusy(false);
    }
  };

  const pick = async (chosen: File | undefined) => {
    if (!chosen) return;
    if (chosen.size > MAX_INPUT_BYTES) {
      setNotice({ tone: 'bad', text: pt('hud.pack.error.tooLarge') });
      return;
    }
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setNotice({ tone: 'bad', text: pt('hud.pack.error.file') });
      return;
    }
    setInput(text);
    await submit(text);
  };

  const fillExample = () => {
    setInput(JSON.stringify(packFromScenario(example ?? SCENARIOS[0]!), null, 2));
    setNotice({ tone: 'info', text: pt('hud.pack.exampleHint') });
  };

  return (
    <details className="pack-add" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-pack-add>
      <summary>{pt('hud.pack.add')}</summary>
      <p className="muted">{pt('hud.pack.addHint')}</p>
      <textarea
        className="pack-input"
        value={input}
        rows={6}
        spellCheck={false}
        placeholder={pt('hud.pack.placeholder')}
        aria-label={pt('hud.pack.inputLabel')}
        data-pack-input
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="pack-buttons">
        <button type="button" className="primary" disabled={busy} data-pack-submit onClick={() => void submit(input)}>
          {pt('hud.pack.addButton')}
        </button>
        <button type="button" className="ghost" disabled={busy} data-pack-file onClick={() => file.current?.click()}>
          {pt('hud.pack.file')}
        </button>
        <button type="button" className="ghost" disabled={busy} data-pack-example onClick={fillExample}>
          {pt('hud.pack.example')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json,text/plain"
          hidden
          data-pack-file-input
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            void pick(chosen);
          }}
        />
      </div>
      {notice && <NoticeLine notice={notice} />}
    </details>
  );
}
