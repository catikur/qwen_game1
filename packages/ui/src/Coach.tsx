import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useGame, useGameState } from './useGame';
import { TUTORIAL_STEPS, advance, setTutorial, tutorialKey, useTutorial } from './tutorial';
import type { TutorialProgress, TutorialStepId } from './tutorial';
import { t } from './i18n';
import type { MessageKey } from './i18n';

/** Dar ekran: `collapse.ts` ve stil sayfasıyla aynı kırılım. */
const NARROW = '(max-width: 860px)';
/** Halka ve kartın yerini ölçme aralığı (ms). Düzen kaydırma ve katlamayla değişiyor. */
const MEASURE_MS = 200;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Öğe gerçekten görünüyor mu: ortasındaki en üst öğe kendisi (ya da bir
 * parçası) mı? Telefonda yapı listesi parsel detayının arkasında kalabiliyor;
 * kutusu ekranda ama dokunulamıyor. Rehberin kendi kartı sayılmıyor —
 * sayılsaydı kart hedefi örtünce hedef değişir, kart kayar, hedef geri
 * gelirdi.
 */
function unobstructed(element: Element, rect: DOMRect): boolean {
  if (!document.elementsFromPoint) return true;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (const top of document.elementsFromPoint(x, y)) {
    if (top.closest('.coach, .coach-pill')) continue;
    return top === element || element.contains(top) || top.contains(element);
  }
  return true;
}

/** İlk görünür eşleşme; hiçbiri görünmüyorsa null. */
function firstVisible(selectors: string[]): Box | null {
  for (const selector of selectors) {
    let elements: NodeListOf<Element>;
    try {
      elements = document.querySelectorAll(selector);
    } catch {
      continue; // `:has` desteklemeyen tarayıcı: sıradaki seçiciye düş.
    }
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (!unobstructed(element, rect)) continue;
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
  }
  return null;
}

const TITLES: Record<TutorialStepId, MessageKey> = {
  welcome: 'app.coach.welcome.title',
  lens: 'app.coach.lens.title',
  pick: 'app.coach.pick.title',
  buy: 'app.coach.buy.title',
  choose: 'app.coach.choose.title',
  build: 'app.coach.build.title',
  play: 'app.coach.play.title',
  goals: 'app.coach.goals.title',
  chain: 'app.coach.chain.title',
  rivals: 'app.coach.rivals.title',
  done: 'app.coach.done.title',
};

const BODIES: Record<TutorialStepId, MessageKey> = {
  welcome: 'app.coach.welcome.body',
  lens: 'app.coach.lens.body',
  pick: 'app.coach.pick.body',
  buy: 'app.coach.buy.body',
  choose: 'app.coach.choose.body',
  build: 'app.coach.build.body',
  play: 'app.coach.play.body',
  goals: 'app.coach.goals.body',
  chain: 'app.coach.chain.body',
  rivals: 'app.coach.rivals.body',
  done: 'app.coach.done.body',
};

/** Panel adımlarında panel açıkken gösterilen anlatım. */
const OPEN_BODIES: Partial<Record<TutorialStepId, MessageKey>> = {
  goals: 'app.coach.goals.open',
  chain: 'app.coach.chain.open',
  rivals: 'app.coach.rivals.open',
};

/**
 * Rehber kartı ve hedef halkası.
 *
 * Kart haritanın üstünde duruyor, önünde değil: arkasındaki her şey
 * tıklanabilir kalıyor, halka da dokunuşu geçiriyor (`pointer-events:
 * none`). Yer ölçülerek seçiliyor: önce üst, hedefi örtüyorsa sıradaki
 * aday (aşağıdaki ölçüm bloğu).
 */
export function Coach(): ReactElement | null {
  const { view, setView, run, toast } = useGame();
  const state = useGameState();
  const key = tutorialKey(state);
  const progress = useTutorial(key);
  const [minimized, setMinimized] = useState(false);
  const [ring, setRing] = useState<Box | null>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  const cardRef = useRef<HTMLDivElement>(null);

  const step = progress ? TUTORIAL_STEPS[progress.step] : undefined;

  /*
   * Karşılama adımı zamanı durduruyor: oyuncu okurken rakipler koşmasın.
   * Her BAŞLATIŞTA bir kez — işaret ilerleme nesnesinin kendisi. Oyun
   * başına tutulduğunda Yardım'dan yeniden başlatılan rehber zamanı
   * durdurmuyordu (oynanış testi yakaladı); karşılamada ▶'ye basan
   * oyuncuyu ise yeniden durdurmuyor, çünkü nesne aynı kalıyor.
   */
  const paused = useRef<TutorialProgress | null>(null);
  useEffect(() => {
    if (step?.id !== 'welcome' || !progress || paused.current === progress) return;
    paused.current = progress;
    if (state.time.speed !== 0) run({ type: 'SET_SPEED', speed: 0 });
  }, [step?.id, progress, state.time.speed, run]);

  // Panel adımı: panel açıldıysa "okundu" işaretlenir; kapanınca biter.
  useEffect(() => {
    if (!progress || !step?.panel || progress.seen) return;
    if (view.openPanel === step.panel) setTutorial(key, { ...progress, seen: true });
  }, [progress, step, view.openPanel, key]);

  // Durumdan tamamlanma: her çizimde sorulur (gün ve komutlar çizimi tetikliyor).
  useEffect(() => {
    if (!progress || !step?.done) return;
    if (step.done({ state, view, progress })) setTutorial(key, advance(progress, state, view));
  });

  // Hedefin ve kartın yeri: düzen kaydırma, katlama ve dönmeyle değişiyor.
  const targets = step?.targets ?? [];
  const targetKey = targets.join('|');
  const modalOpen = view.openPanel !== 'none';
  useEffect(() => {
    if (!step) return;
    const measure = (): void => {
      const target = modalOpen ? null : firstVisible(targets);
      setRing((current) =>
        current && target && current.left === target.left && current.top === target.top &&
        current.width === target.width && current.height === target.height
          ? current
          : target,
      );

      /*
       * Yer: önce üst (üst bar ve masaüstünde gündem şeridinin altı).
       * Masaüstünde alt orta haber akışının yeri; üst orta haritanın
       * gökyüzü, kart orada en az şeyi örtüyor.
       */
      const narrow = window.matchMedia?.(NARROW).matches ?? false;
      const rectOf = (selector: string): DOMRect | null => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect && rect.height > 0 ? rect : null;
      };
      const bar = rectOf('.topbar');
      const agenda = narrow ? null : rectOf('.active-events');
      const card = cardRef.current?.getBoundingClientRect();
      const height = card?.height ?? 170;
      const width = card?.width ?? 380;
      const topY = Math.max(8, (bar?.bottom ?? 0) + 8, (agenda?.bottom ?? 0) + 10);
      const cardLeft = narrow ? 0 : (window.innerWidth - width) / 2;
      const cardRight = narrow ? window.innerWidth : cardLeft + width;
      const covers = (y: number): boolean =>
        target !== null &&
        target.top < y + height &&
        target.top + target.height > y &&
        target.left < cardRight &&
        target.left + target.width > cardLeft;
      /*
       * Adaylar sırayla: üst; dar ekranda parsel detayının üstü, sonra
       * rıhtımın hemen üstü (detayın ÜSTÜNE binerek — hedef detayda
       * değilse orası boş sayılır); masaüstünde alt kenar. İlk örtmeyen
       * seçiliyor. Telefonda ekranın ortası parsel detayına ayrılmış;
       * yapı paneli o sırada detayın arkasındaki sütunda kalıyor ve kart
       * üstte sabit dursaydı katlama başlığını örtüyordu (ölçüldü).
       */
      const candidates = [topY];
      if (narrow) {
        const dock = rectOf('.topbar-actions');
        const sheet = rectOf('.inspector.has-selection');
        if (sheet) candidates.push(sheet.top - 8 - height);
        candidates.push((dock?.top ?? window.innerHeight) - 8 - height);
      } else {
        candidates.push(window.innerHeight - 18 - height);
      }
      const free = candidates.find((y) => y >= 8 && !covers(y));
      const y = Math.round(free ?? topY);
      setPlace((current) => (current.top === y ? current : { top: y }));
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
    // `targets` her çizimde yeni dizi; anahtarı izliyoruz.
  }, [step, targetKey, modalOpen]);

  if (!progress || !step) return null;

  const index = progress.step;
  const total = TUTORIAL_STEPS.length;
  const close = (): void => {
    setTutorial(key, null);
    toast(t('app.coach.closedToast'), 'info');
  };
  const next = (): void => {
    if (step.id === 'done') {
      setTutorial(key, null);
      return;
    }
    // Panel adımında "İleri" paneli de kapatıyor: kart ve panel üst üste kalmasın.
    if (step.panel && view.openPanel === step.panel) setView({ openPanel: 'none' });
    setTutorial(key, advance(progress, state, view));
  };
  const showNext = Boolean(step.action) || Boolean(step.panel);
  const body = step.panel && view.openPanel === step.panel ? OPEN_BODIES[step.id] ?? BODIES[step.id] : BODIES[step.id];

  if (minimized) {
    return (
      <button
        type="button"
        className="coach-pill"
        style={place}
        data-coach-step={step.id}
        onClick={() => setMinimized(false)}
        aria-label={t('app.coach.expand')}
      >
        {t('app.coach.pill', { step: index + 1, total })}
      </button>
    );
  }

  return (
    <>
      {ring && !minimized && (
        <div
          className="coach-ring"
          aria-hidden="true"
          style={{ left: ring.left - 4, top: ring.top - 4, width: ring.width + 8, height: ring.height + 8 }}
        />
      )}
      <div
        ref={cardRef}
        className="coach"
        role="dialog"
        aria-live="polite"
        aria-label={t('app.coach.label')}
        data-coach-step={step.id}
        style={place}
      >
        <div className="coach-head">
          <span className="coach-count">{t('app.coach.count', { step: index + 1, total })}</span>
          <h2 className="coach-title">{t(TITLES[step.id])}</h2>
          <button
            type="button"
            className="icon coach-min"
            onClick={() => setMinimized(true)}
            aria-label={t('app.coach.minimize')}
            title={t('app.coach.minimize')}
          >
            –
          </button>
        </div>
        <p className="coach-body">{t(body)}</p>
        <div className="coach-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }} />
        </div>
        <div className="coach-actions">
          {step.id !== 'done' && (
            <button type="button" className="ghost" data-coach="close" onClick={close}>
              {t('app.coach.close')}
            </button>
          )}
          {showNext ? (
            <button type="button" className="primary" data-coach="next" onClick={next}>
              {t(step.action ?? 'app.coach.next')}
            </button>
          ) : (
            // Eylem adımında da çıkış var: nakdi yetmeyen ya da başka yoldan
            // gitmek isteyen oyuncu takılı kalmasın.
            <button type="button" className="ghost" data-coach="skip-step" onClick={next}>
              {t('app.coach.skipStep')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
