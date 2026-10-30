import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement } from 'react';
import { useGame } from './useGame';
import type { ExportOutcome } from './useGame';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { cityCardFacts } from './cardFacts';
import type { CityCardFacts } from './cardFacts';
import { CARD, renderCityCard } from './cardDraw';
import { getSettings } from './settings';
import { useDialogFocus } from './dialog';
import './i18n/playTr';

/**
 * Şehir kartı (Tur 64): zafer, senaryo ve lig sonucu, oyun sonu ekranlarında
 * ve Hedefler'de bir düğme. Kart açılınca bir kez çiziliyor: o anki şehir ve
 * koşunun özeti. İndirme barındırıcının yoluyla (yayınlanmış sayfada
 * `downloads`), paylaşım cihazın paylaşım sayfasıyla (dosya paylaşılabiliyorsa).
 *
 * Sonuç bildirimi pencerenin içinde: bitiş ekranları bildirimlerin üstünde,
 * bildirim orada görünmezdi. Pencere sayfanın kökünde (portal): bitiş
 * kartının içinde açılınca onun ortalı yazısını ve ters renkli düğmelerini
 * devralıyordu.
 */
export function CityCardButton({ className = 'ghost-invert' }: { className?: string }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} data-city-card-open aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t('hud.card.open')}
      </button>
      {open && createPortal(<CityCardDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

type CardState = { status: 'making' } | { status: 'failed' } | { status: 'ready'; url: string; blob: Blob; facts: CityCardFacts };

const OUTCOME_TEXT: Record<ExportOutcome, MessageKey> = {
  saved: 'hud.card.saved',
  downloads: 'hud.card.downloads',
  started: 'hud.card.started',
  copied: 'hud.card.saved',
  declined: 'hud.card.declined',
  blocked: 'hud.card.blocked',
};

function CityCardDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { engine, snapshotCity, saveImage } = useGame();
  const [card, setCard] = useState<CardState>({ status: 'making' });
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setCard({ status: 'making' });
    setNote(null);
    void (async () => {
      const facts = cityCardFacts(engine.getState(), getSettings().palette === 'safe');
      const city = snapshotCity ? await snapshotCity(CARD.width, CARD.height) : null;
      // Sahne varken karesi gelmediyse kart şehirsiz çizilmiyor: yeniden denenebilir bir hata (Codex #94).
      if (snapshotCity && !city) throw new Error('şehrin karesi yok');
      const blob = await renderCityCard(facts, city);
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setCard({ status: 'ready', url, blob, facts });
    })().catch((error: unknown) => {
      console.warn('Şehir kartı çizilemedi:', error);
      if (!cancelled) setCard({ status: 'failed' });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [engine, snapshotCity, attempt]);

  // Escape yalnız en üstteki katmanı kapatıyor: kartı. Oyunun Escape'i
  // (açık paneli kapatan, GameRoot) aynı hedefte ve sonra çalışıyor; yakalama
  // evresinde durduruluyor, Hedefler'den açılan kart kapanınca panel kalıyor.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const file = useMemo(
    () => (card.status === 'ready' && typeof File === 'function' ? new File([card.blob], card.facts.filename, { type: 'image/png' }) : null),
    [card],
  );
  const canShare = file !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const download = async () => {
    if (card.status !== 'ready' || !saveImage) return;
    const outcome = await saveImage(card.facts.filename, card.blob);
    setNote(t(OUTCOME_TEXT[outcome]));
  };

  const share = async () => {
    if (card.status !== 'ready' || !file) return;
    try {
      await navigator.share({ files: [file], title: card.facts.company, text: card.facts.summary });
    } catch (error) {
      // Paylaşım sayfasını kapatmak bir hata değil.
      if ((error as DOMException).name !== 'AbortError') setNote(t('hud.card.shareFailed'));
    }
  };

  return (
    <div className="card-dialog" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="card-dialog-body"
        role="dialog"
        aria-modal="true"
        aria-label={t('hud.card.title')}
        tabIndex={-1}
        data-city-card={card.status}
      >
        <h3>{t('hud.card.title')}</h3>
        <div className="card-frame" style={{ aspectRatio: `${CARD.width} / ${CARD.height}` }}>
          {card.status === 'ready' ? (
            <img src={card.url} width={CARD.width} height={CARD.height} alt={card.facts.summary} data-city-card-image />
          ) : (
            <p className="muted" role="status">
              {t(card.status === 'making' ? 'hud.card.making' : 'hud.card.failed')}
            </p>
          )}
        </div>
        {note && (
          <p className="muted" role="status" data-city-card-note>
            {note}
          </p>
        )}
        <div className="card-actions">
          {card.status === 'ready' && saveImage && (
            <button type="button" className="primary" data-city-card-download onClick={() => void download()}>
              {t('hud.card.download')}
            </button>
          )}
          {card.status === 'ready' && canShare && (
            <button type="button" className="ghost" data-city-card-share onClick={() => void share()}>
              {t('hud.card.share')}
            </button>
          )}
          {card.status === 'failed' && (
            <button type="button" className="primary" onClick={() => setAttempt((value) => value + 1)}>
              {t('hud.card.retry')}
            </button>
          )}
          <button type="button" className="ghost" data-city-card-close onClick={onClose}>
            {t('hud.card.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
