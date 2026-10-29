import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { PACK_CODE_PREFIX, PackCodeError, SCENARIOS, decodePackCode, encodePackCode, packFromScenario, packScenarioId, packText, validatePack } from '@capital/content';
import type { PackIssue, ScenarioDef } from '@capital/content';
import { ScenarioCard } from './ScenarioCard';
import { canLinkPacks, clearPackLink, packLink, packLinkCode } from './packLink';
import { issueText, pt } from './packMessages';
import type { PackMessageKey } from './packMessages';
import { MAX_PACKS, addPack, refreshWorkshop, removePack, useInstalledPacks, useWorkshopDownloading } from './packStore';
import type { InstalledPack } from './packStore';
import { WORKSHOP_TEXT_BYTES, WORKSHOP_TITLE_BYTES, fitUtf8, openWorkshopPage, publishedItem, rememberPublished, useWorkshopBridge } from './workshop';
import type { WorkshopPage, WorkshopPublished } from './workshop';
import { closeEditor, draftDirty, draftFrom, freshDraft, loadDraft, normalizedDraft, openEditor, takeTrial, useOpenDraft } from './packDraft';

/*
 * Paket rafı (Tur 67): kurulum ekranının senaryo sekmesinde, geç inen
 * parça. Üç parçası var: oyuncunun yüklediği senaryoların listesi, seçili
 * paket senaryosunun paylaş/kaldır düğmeleri ve ekleme kutusu. Doğrulayıcı,
 * paylaşım kodu ve bu metinler yalnız sekme açılınca iniyor.
 *
 * Steam açıkken (Tur 73) rafta Workshop'un paketleri de var, salt okunur;
 * oyuncunun kendi paketi Workshop'a yükleniyor.
 */

/** Yapıştırılan JSON'un sınırı; paylaşım kodunun açılmış hâliyle aynı. */
const MAX_INPUT_BYTES = 64 * 1024;
/** Sorun listesinde kaç satır; kalanı tek satırda sayılıyor. */
const SHOWN_ISSUES = 8;
/** Steam öğe indirirken listenin yenilenme aralığı, ms. */
const WORKSHOP_POLL_MS = 5000;

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

/** Workshop'taki açıklama: paketin senaryoları, adı ve kısa tanımıyla. */
function workshopDescription(entry: InstalledPack): string {
  return fitUtf8(entry.scenarios.map((def) => `• ${def.title} — ${def.tagline}`).join('\n'), WORKSHOP_TEXT_BYTES);
}

/** Oyuncunun yüklediği paketlerin senaryoları, hazır senaryoların altında. */
export function PackList({
  selectedId,
  onSelect,
  onChange,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  /** Yüklü paketler değişti (ilk yükleme dahil): kayıt defteri yeni sürümle, ekran yeniden çizilsin. */
  onChange: () => void;
}): ReactElement {
  const packs = useInstalledPacks();
  const bridge = useWorkshopBridge();
  const downloading = useWorkshopDownloading();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Raf ilk açılışta depodaki sürümleri tanıtıyor; kayıttan gelen başka bir sürüm kayıt
  // defterindeyse yerine geçiyor ve kurulum ekranı eski tanımı gösteriyordu (Codex #97).
  useEffect(() => onChange(), [packs]);
  // Workshop'un listesi raf açılınca ve pencereye dönünce: Steam'de abone olup gelen oyuncu paketi bulsun.
  useEffect(() => {
    void refreshWorkshop();
    const onFocus = () => void refreshWorkshop();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [bridge]);
  // İnen öğe varken liste birkaç saniyede bir: inen paket pencere odakta kalsa da rafa gelsin (Codex #103).
  const pending = bridge !== null && downloading > 0;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => void refreshWorkshop(), WORKSHOP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending]);
  const browse = async () => {
    if (bridge && !(await openWorkshopPage(bridge, 'workshop'))) setNotice({ tone: 'info', text: pt('hud.pack.workshop.openFailed') });
  };
  const scenarios = packs.flatMap((entry) => entry.scenarios.map((def) => ({ def, packName: packText(entry.pack.name), workshop: entry.workshop })));
  return (
    <section className="pack-shelf" data-pack-shelf={scenarios.length}>
      <div className="pack-shelf-head">
        <h3 className="pack-shelf-title">{pt('hud.pack.title')}</h3>
        {bridge && (
          <button type="button" className="ghost" data-pack-workshop-browse onClick={() => void browse()}>
            {pt('hud.pack.workshop.browse')}
          </button>
        )}
      </div>
      {bridge && downloading > 0 && (
        <p className="muted pack-empty" data-pack-downloading={downloading}>
          {pt('hud.pack.workshop.downloading', { count: downloading })}
        </p>
      )}
      {scenarios.length === 0 ? (
        <p className="muted pack-empty">{pt(bridge ? 'hud.pack.emptyWorkshop' : 'hud.pack.empty')}</p>
      ) : (
        <ul className="scenario-list" role="radiogroup" aria-label={pt('hud.pack.title')}>
          {scenarios.map(({ def, packName, workshop }) => (
            <li key={def.id} data-pack-workshop={workshop}>
              <ScenarioCard
                def={def}
                selected={def.id === selectedId}
                onSelect={onSelect}
                note={pt(workshop ? 'hud.pack.fromWorkshop' : 'hud.pack.from', { pack: packName })}
              />
            </li>
          ))}
        </ul>
      )}
      {notice && <NoticeLine notice={notice} />}
    </section>
  );
}

/**
 * Seçili paket senaryosunun paylaşım kodu ve paketin kaldırılması. Steam
 * açıkken (Tur 73) oyuncunun paketi Workshop'a yükleniyor; Workshop'tan
 * gelen paket kaldırılmıyor, Steam'deki sayfası açılıyor.
 */
export function PackActions({ def, onRemoved }: { def: ScenarioDef; onRemoved: () => void }): ReactElement | null {
  const packs = useInstalledPacks();
  const bridge = useWorkshopBridge();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [publishing, setPublishing] = useState<'confirm' | 'busy' | null>(null);
  const [published, setPublished] = useState<WorkshopPublished | null>(null);
  const source = def.source;
  // Tanım değişince (başka senaryo ya da aynı kimlikle yeni sürüm) eski sürümün kodu kutuda kalmasın (Codex #97).
  useEffect(() => {
    setNotice(null);
    setFallback(null);
    setConfirming(false);
    setReplacing(false);
    setPublishing(null);
    setPublished(null);
  }, [def]);
  if (!source) return null;
  // Kayıttan açılan ama bu cihazda yüklü olmayan paket: paylaşılabilir, kaldırılacak bir şey yok.
  const installed = packs.find((entry) => entry.pack.id === source.packId);
  // Oyuncunun kendi paketi Workshop'a yüklendiyse öğesi: sonraki yükleme onu güncelliyor.
  const own = installed && !installed.workshop ? installed : undefined;
  const ownItem = own ? publishedItem(own.pack.id) : undefined;
  const workshopItem = installed?.workshop;

  // Editörde (Tur 68): yüklü paketin bütünü, yoksa kayıttaki tek senaryoluk paket. Kaydedilmemiş taslak soruluyor.
  const edit = (confirmed: boolean) => {
    const doc = installed?.pack ?? source.doc;
    if (!confirmed && draftDirty(loadDraft())) {
      setReplacing(true);
      return;
    }
    setReplacing(false);
    const index = Math.max(0, doc.scenarios.findIndex((entry) => packScenarioId(doc.id, entry.id) === def.id));
    openEditor(freshDraft(JSON.parse(JSON.stringify(doc)), index));
  };

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

  const openPage = async (page: WorkshopPage) => {
    if (bridge && !(await openWorkshopPage(bridge, page))) setNotice({ tone: 'info', text: pt('hud.pack.workshop.openFailed') });
  };

  const publish = async () => {
    if (!bridge || !own) return;
    const name = packText(own.pack.name);
    setPublishing('busy');
    setPublished(null);
    setNotice({ tone: 'info', text: pt('hud.pack.workshop.uploading') });
    try {
      const result = await bridge.publish({
        ...(ownItem ? { item: ownItem } : {}),
        title: fitUtf8(name, WORKSHOP_TITLE_BYTES),
        description: workshopDescription(own),
        pack: JSON.stringify(own.pack),
      });
      // Öğe Steam'de silinmişse kabuk yenisini açtı: kimlik değişebiliyor. Öğe açılıp
      // paket gitmediyse de kimlik saklanıyor: yeniden deneyince aynı öğe güncelleniyor.
      rememberPublished(own.pack.id, result.id);
      if (result.failed) {
        console.warn('Workshop öğesi açıldı, paket yüklenemedi:', result.failed);
        setNotice({ tone: 'bad', text: pt('hud.pack.workshop.incomplete') });
        return;
      }
      setPublished(result);
      const done = pt(ownItem ? 'hud.pack.workshop.updated' : 'hud.pack.workshop.published', { name });
      setNotice({ tone: 'good', text: result.agreement ? `${done} ${pt('hud.pack.workshop.agreement')}` : done });
    } catch (error) {
      console.warn('Workshop yüklemesi başarısız:', error);
      setNotice({ tone: 'bad', text: pt('hud.pack.workshop.failed') });
    } finally {
      setPublishing(null);
    }
  };

  const remove = () => {
    if (!own) return;
    const name = packText(own.pack.name);
    removePack(own.pack.id);
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
        <button type="button" className="ghost" data-pack-edit onClick={() => edit(false)}>
          {pt('hud.pack.edit')}
        </button>
        {workshopItem && (
          <button type="button" className="ghost" data-pack-workshop-open onClick={() => void openPage({ item: workshopItem })}>
            {pt('hud.pack.workshop.open')}
          </button>
        )}
        {own && bridge && !publishing && (
          <button type="button" className="ghost" data-pack-publish={ownItem ? 'update' : 'new'} onClick={() => setPublishing('confirm')}>
            {pt(ownItem ? 'hud.pack.workshop.update' : 'hud.pack.workshop.publish')}
          </button>
        )}
        {own && !confirming && (
          <button type="button" className="ghost danger" data-pack-remove onClick={() => setConfirming(true)}>
            {pt('hud.pack.remove')}
          </button>
        )}
      </div>
      {workshopItem && (
        <p className="muted" data-pack-workshop-note>
          {pt('hud.pack.workshop.note')}
        </p>
      )}
      {own && publishing === 'confirm' && (
        <div className="pack-confirm" role="group" aria-label={pt(ownItem ? 'hud.pack.workshop.update' : 'hud.pack.workshop.publish')}>
          <p>{pt(ownItem ? 'hud.pack.workshop.updateConfirm' : 'hud.pack.workshop.publishConfirm', { name: packText(own.pack.name) })}</p>
          <div className="pack-buttons">
            <button type="button" className="primary" data-pack-publish-yes onClick={() => void publish()}>
              {pt(ownItem ? 'hud.pack.workshop.updateYes' : 'hud.pack.workshop.publishYes')}
            </button>
            <button type="button" className="ghost" onClick={() => setPublishing(null)}>
              {pt('hud.pack.removeNo')}
            </button>
          </div>
        </div>
      )}
      {own && confirming && (
        <div className="pack-confirm" role="group" aria-label={pt('hud.pack.remove')}>
          <p>{pt('hud.pack.removeConfirm', { name: packText(own.pack.name) })}</p>
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
      {replacing && (
        <div className="pack-confirm" role="group" aria-label={pt('hud.pack.edit')}>
          <p>{pt('hud.pack.replaceConfirm', { name: packText((installed?.pack ?? source.doc).name) })}</p>
          <div className="pack-buttons">
            <button type="button" className="primary" data-pack-edit-yes onClick={() => edit(true)}>
              {pt('hud.pack.replaceYes')}
            </button>
            <button type="button" className="ghost" onClick={() => setReplacing(false)}>
              {pt('hud.pack.removeNo')}
            </button>
          </div>
        </div>
      )}
      {notice && <NoticeLine notice={notice} />}
      {published && (
        <div className="pack-buttons">
          <button type="button" className="ghost" data-pack-workshop-open onClick={() => void openPage({ item: published.id })}>
            {pt('hud.pack.workshop.open')}
          </button>
          {published.agreement && (
            <button type="button" className="ghost" data-pack-workshop-agreement onClick={() => void openPage('agreement')}>
              {pt('hud.pack.workshop.openAgreement')}
            </button>
          )}
        </div>
      )}
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

const Editor = lazy(() => import('./PackEditor'));

/**
 * Senaryo editörü (Tur 68): açan düğme ve açıkken editörün kendisi (geç
 * iniyor). "Dene"den dönen oyuncu editörü kaldığı yerden buluyor.
 */
export function PackEditorHost({
  example,
  onTry,
  onSaved,
  deliverFile,
}: {
  example: ScenarioDef;
  onTry: (def: ScenarioDef) => void;
  onSaved: (scenarioId: string) => void;
  deliverFile?: (filename: string, text: string) => Promise<string>;
}): ReactElement {
  const open = useOpenDraft();
  useEffect(() => {
    if (!takeTrial()) return;
    const stored = loadDraft();
    if (stored) openEditor(stored);
  }, []);
  // Düğmenin adı: taslak varsa "devam et".
  const stored = useMemo(() => (open ? null : loadDraft()), [open]);
  const start = () => {
    const current = loadDraft();
    openEditor(current ? { ...current, doc: normalizedDraft(current.doc, () => draftFrom(example)) } : freshDraft(draftFrom(example)));
  };
  return (
    <div className="pack-editor-launch">
      <button type="button" className="ghost" data-editor-open onClick={start}>
        {pt(stored ? 'hud.pack.editorResume' : 'hud.pack.editorOpen')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <Editor
            key={open.revision}
            draft={open.draft}
            example={example}
            onClose={closeEditor}
            onTry={(def) => {
              closeEditor();
              onTry(def);
            }}
            onSaved={onSaved}
            {...(deliverFile ? { deliverFile } : {})}
          />
        </Suspense>
      )}
    </div>
  );
}
