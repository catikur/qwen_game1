import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { LENSES, SCHEMA_VERSION, customerFlows, getPlayer, routeSignature, scenarioDefOf, supplyRoutes, weatherOn } from '@capital/core';
import type { GameCommand, GameEngine, GameSpeed } from '@capital/core';
import { BUILDING_BY_ID, GOOD_BY_ID } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { CityRenderer } from '@capital/render-three';
import { AUTOSAVE_SLOT, NewerSaveError, exportToJson, importFromJson, loadGame, saveGame } from '@capital/persistence';
import {
  ActiveEvents,
  BuildPanel,
  Coach,
  DOCK_PANELS,
  DecisionCard,
  GameContext,
  GameOverScreen,
  Inspector,
  LeagueResultScreen,
  VictoryScreen,
  LensBar,
  fileSlug,
  ModalHost,
  NewsFeed,
  OpportunityBubble,
  MomentBanner,
  MoneyTags,
  ScenarioBriefScreen,
  ScenarioResultScreen,
  Toasts,
  TopBar,
  getSettings,
  inputMode,
  loadProblemText,
  onInputMode,
  reducedMotion,
  setCityDaylight,
  subscribeSettings,
  t,
  tutorialStepOf,
  useCareerWatch,
  useGameVersion,
  watchInputMode,
} from '@capital/ui';
import type { ExportOutcome, FocusTarget, GameContextValue, LeagueBoard, ToastMessage, ViewState } from '@capital/ui';
import { setBeforeUpdate } from './pwa';
import { setLiveGame } from './report';
import { deliverImageFile, deliverTextFile } from './host';
import { createLeagueBoard, fallbackLeagueBoard, leagueServerConfigured } from './league-board';
import { Soundscape } from './audio';
import { focusFirst, setMapHandler } from './padBridge';

/**
 * Oyun ekranı: şehir sahnesi, HUD ve paneller (Tur 46).
 *
 * Ayrı bir parça. Kurulum ekranı bu modülü beklemiyor: three, şehir
 * çizimi, paneller ve simülasyonun geri kalanı kurulum ekranı açıkken
 * arka planda iniyor (`App.tsx`). Kurulumun oyunu başlatmak için
 * istediği motor ve yeni oyun işlevleri de buradan geliyor.
 */
export { GameEngine, createLeagueGame, createNewGame, leagueDayId, leagueWeekId, startScenario } from '@capital/core';
export { startTutorial } from '@capital/ui';

const AUTOSAVE_INTERVAL_MS = 30_000;

export function GameRoot({
  engine,
  bootMessage,
  onRequestNewGame,
  onReplayScenario,
}: {
  engine: GameEngine;
  bootMessage: string | null;
  onRequestNewGame: () => void;
  /** Koşunun kendi tanımıyla (Tur 68): editörden denenen taslak da, yüklü başka sürüm değil. */
  onReplayScenario: (scenario: string | ScenarioDef, companyName: string, ceoId: string | null) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const version = useGameVersion(engine);
  // Sahne harita boyutuyla kuruluyor (örnekli ağların kapasitesi, kamera
  // sınırları). Yeni oyun ya da kayıt farklı boyutta bir şehir getirince
  // (Tur 21: büyük şehir) sahne yeniden kurulmalı; aynı motor üstünde
  // `replaceState` bunu kendiliğinden tetiklemiyordu.
  //
  // Holding (Tur 22): şehir değişince harita aynı boyutta ama başka bir
  // şehir olabilir; anahtar şehrin tohumunu da taşıyor. Seçim ve
  // yerleştirme hayaleti eski şehrin karelerine işaret etmesin diye
  // anahtar değişince temizleniyor.
  const mapKey = `${engine.getState().map.width}x${engine.getState().map.height}:${engine.getState().meta.seed}`;

  const [view, setViewState] = useState<ViewState>({
    // Açılışta şehir görünsün; lensler oyuncunun bilinçli seçimi olsun.
    lens: 'none',
    selectedTileId: null,
    ghostDefId: null,
    openPanel: 'none',
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(1);

  // Render geri çağrıları React state'ini okumadan güncel görüşe erişsin.
  const viewRef = useRef(view);
  viewRef.current = view;

  const setView = useCallback((partial: Partial<ViewState>) => {
    setViewState((current) => ({ ...current, ...partial }));
  }, []);

  const lastMapKey = useRef(mapKey);
  useEffect(() => {
    if (lastMapKey.current === mapKey) return;
    lastMapKey.current = mapKey;
    setViewState((current) => ({ ...current, selectedTileId: null, ghostDefId: null }));
  }, [mapKey]);

  const toast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = toastId.current++;
    setToasts((current) => [...current, { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3600);
  }, []);

  // Kariyer (Tur 41): koşu kariyere işleniyor, açılan rozet bildiriliyor.
  useCareerWatch(engine, version, toast);

  const run = useCallback(
    (command: GameCommand) => {
      const result = engine.dispatch(command);
      if (!result.ok && result.reason) toast(result.reason, 'bad');
      return result.ok;
    },
    [engine, toast],
  );

  // ---- Sahne kurulumu ve kare döngüsü ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = engine.getState();
    const renderer = new CityRenderer(
      canvas,
      {
        onHover: () => {
          /* hover yalnızca sahnede yaşar; React'i tetiklemez */
        },
        onSelect: (tileId) => {
          const current = viewRef.current;
          setViewState({ ...current, selectedTileId: tileId });

          // Yerleştirme modundaysa ve arsa uygunsa doğrudan inşa et:
          // "seç → inşa et" iki tıkla bitsin.
          if (current.ghostDefId) {
            const tile = engine.getState().map.tiles[tileId];
            if (tile && tile.ownerId === engine.getState().playerCompanyId && !tile.buildingId) {
              const result = engine.dispatch({
                type: 'BUILD',
                tileId,
                defId: current.ghostDefId,
              });
              if (result.ok) setViewState({ ...current, selectedTileId: tileId, ghostDefId: null });
            }
          }
        },
      },
      state.map.width,
      state.map.height,
    );
    rendererRef.current = renderer;
    // Erişilebilirlik ayarları (Tur 47): palet ve hareket sahneye de iniyor.
    const applyAccessibility = () => {
      const settings = getSettings();
      renderer.setAccessibility({ safePalette: settings.palette === 'safe', reducedMotion: reducedMotion(settings) });
      renderer.setWeatherEffects(settings.weather);
    };
    applyAccessibility();
    const stopAccessibility = subscribeSettings(applyAccessibility);
    // Klavye ve kumanda (Tur 72): imleç kameranın ortasındaki parsel; fare oynayınca farede.
    watchInputMode(window);
    const syncCursor = () => renderer.setCenterCursor(inputMode() !== 'pointer');
    syncCursor();
    const stopCursor = onInputMode(syncCursor);

    let frame = 0;
    let last = performance.now();
    let warmBefore = false;
    const loop = (now: number) => {
      // Üst sınır yalnızca sekmeden dönüşteki devasa sıçramayı keser.
      // Fazla dar tutulursa düşük kare hızında oyun saati gerçek zamanın
      // gerisine düşüyor ve seçilen hız kademesi yalan söylüyordu.
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      // Gölgelendiriciler derlenirken şehir çizilmiyor; oyun saati de bekliyor
      // (Tur 42). Derlemenin bittiği karenin ardındaki kare de saymıyor:
      // paralel derleme yoksa programlar o karede eşzamanlı derleniyor ve
      // süresi bir sonraki `dt`'ye düşüyordu (Codex #71).
      const warm = renderer.shadersWarm();
      if (warm && warmBefore) engine.advance(dt * 1000);
      warmBefore = warm;
      renderer.render(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      stopAccessibility();
      stopCursor();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [engine, mapKey]);

  // ---- State veya görünüm değişince sahneyi tazele ----
  useEffect(() => {
    rendererRef.current?.syncState(engine.getState(), {
      lens: view.lens,
      selectedTileId: view.selectedTileId,
      ghostDefId: view.ghostDefId,
      playerCompanyId: engine.getState().playerCompanyId,
    });
  }, [engine, version, view.lens, view.selectedTileId, view.ghostDefId]);

  // ---- Otomatik kayıt ----
  // Slotta yeni sürümün kaydı varsa yazılmıyor (Tur 75, `NewerSaveError`): oyuncuya bir kez söyleniyor.
  const autosaveBlocked = useRef(false);
  const autosave = useCallback(() => {
    void saveGame(engine.getState(), AUTOSAVE_SLOT).catch((error) => {
      if (error instanceof NewerSaveError) {
        if (!autosaveBlocked.current) toast(t('app.save.newerAutosave'), 'info');
        autosaveBlocked.current = true;
        return;
      }
      console.warn('Otomatik kayıt başarısız:', error);
    });
  }, [engine, toast]);
  useEffect(() => {
    const timer = setInterval(autosave, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autosave]);
  // Yeni sürüme geçmeden önce (Tur 48): yenilenen oyun kaldığı günden açılsın.
  useEffect(() => setBeforeUpdate(() => saveGame(engine.getState(), AUTOSAVE_SLOT)), [engine]);
  // Hata raporunun kaydı (Tur 74): oyun açıkken o anki durum.
  useEffect(() => {
    setLiveGame(() => engine.getState());
    return () => setLiveGame(null);
  }, [engine]);

  // ---- Senaryonun dönüm noktalarında hemen kayıt (Tur 39) ----
  // Başla, bitiş ve sonuç ekranının kapanışı otomatik kaydın 30 saniyesini
  // beklemiyor: yenilenen sayfa ön tarihe ya da bitmemiş koşuya dönmesin.
  const scenarioRun = engine.getState().scenario;
  const scenarioMark = scenarioRun ? `${scenarioRun.briefSeen ?? false}:${scenarioRun.finishedDay ?? ''}:${scenarioRun.resultSeen ?? false}` : null;
  useEffect(() => {
    if (scenarioMark !== null) autosave();
  }, [autosave, scenarioMark]);

  // ---- Haritada imleç (Tur 72): klavye ve kumanda ----
  /** Haritada mı: kipli bir katman yok, odak bir denetimde değil. */
  const onMap = useCallback(() => {
    if (document.querySelector('[aria-modal="true"], [role="alertdialog"]')) return false;
    const active = document.activeElement;
    return !(active instanceof HTMLElement) || active === document.body || active === canvasRef.current;
  }, []);

  /**
   * Ortadaki parsel (Enter, A): fareyle tıklamanın aynısı; yerleştirmedeyse
   * oraya kuruyor. Sonra odak detayda: kumandayla ilk eyleminde (A yine
   * basınca satın al), klavyeyle detayın kendisinde (Tab içine giriyor;
   * ikinci Enter bir şey satın almıyor). B ve Escape haritaya döndürüyor.
   */
  const selectCenter = useCallback((device: 'keyboard' | 'pad') => {
    if (rendererRef.current?.selectCenter() == null) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const inspector = document.querySelector<HTMLElement>('.inspector.has-selection');
        if (!inspector) return;
        if (device === 'pad') focusFirst(inspector, '.inspector-head button');
        else inspector.focus({ preventScroll: true });
      }),
    );
  }, []);

  // Yerleştirmeye geçince odak haritaya: A ve Enter ortadaki parsele kuruyor.
  useEffect(() => {
    if (!view.ghostDefId || inputMode() === 'pointer') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }, [view.ghostDefId]);

  // Kumandanın harita işleri; kurulum ekranında yalnız arayüzde gezinme var.
  useEffect(() => {
    setMapHandler({
      drive: (pan, orbit, zoom) => rendererRef.current?.drive(pan, orbit, zoom),
      select: () => selectCenter('pad'),
      panel: (step) =>
        setViewState((current) => {
          const index = DOCK_PANELS.indexOf(current.openPanel as (typeof DOCK_PANELS)[number]);
          const next = index < 0 ? (step > 0 ? 0 : DOCK_PANELS.length - 1) : (index + step + DOCK_PANELS.length) % DOCK_PANELS.length;
          return { ...current, openPanel: DOCK_PANELS[next]! };
        }),
      pause: () => engine.dispatch({ type: 'TOGGLE_PAUSE' }),
      // Duraklatılmışsa 1; sonra 1 → 2 → 3 → 1.
      speed: () => engine.dispatch({ type: 'SET_SPEED', speed: ((engine.getState().time.speed % 3) + 1) as GameSpeed }),
      lens: () =>
        setViewState((current) => {
          const index = LENSES.findIndex((lens) => lens.id === current.lens);
          return { ...current, lens: LENSES[(index + 1) % LENSES.length]!.id };
        }),
      settings: () => setViewState((current) => ({ ...current, openPanel: current.openPanel === 'settings' ? 'none' : 'settings' })),
      placing: () => viewRef.current.ghostDefId !== null,
    });
    return () => setMapHandler(null);
  }, [engine, selectCenter]);

  // ---- Klavye kısayolları ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape her yerden pencereyi kapatıyor: Ayarlar'da odak çoğu zaman bir
      // kaydırıcıda ya da onay kutusunda (Tur 47). Kapatacak bir şey yoksa
      // (Tur 72) sırayla: odağı arayüzden haritaya ver, seçimi bırak.
      // Kumandanın B'si de buraya geliyor.
      if (e.code === 'Escape') {
        const current = viewRef.current;
        if (current.openPanel !== 'none' || current.ghostDefId) {
          setViewState((latest) => ({ ...latest, ghostDefId: null, openPanel: 'none' }));
          return;
        }
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body && active !== canvasRef.current) {
          active.blur();
          return;
        }
        if (current.selectedTileId !== null) setViewState((latest) => ({ ...latest, selectedTileId: null }));
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      // Enter (Tur 72): haritada ortadaki parseli seç; odak bir düğmedeyse düğmenin.
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && onMap()) {
        e.preventDefault();
        selectCenter('keyboard');
        return;
      }

      const digit = /^(?:Digit|Numpad)([123])$/.exec(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        engine.dispatch({ type: 'TOGGLE_PAUSE' });
      } else if (digit) {
        // Hız kısayolları (Tur 47): üst bardaki ▶ ▶▶ ▶▶▶ düğmeleriyle aynı komut.
        engine.dispatch({ type: 'SET_SPEED', speed: Number(digit[1]) as GameSpeed });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, onMap, selectCenter]);

  useEffect(() => {
    if (bootMessage) toast(bootMessage, 'info');
  }, [bootMessage, toast]);

  /**
   * Geliştirici kancası.
   *
   * Motoru ve seçimi dışarı açar; uçtan uca testler ile debug konsolu
   * bunun üzerinden çalışır. Arayüzün kendi yolunu kullanır — state'e
   * doğrudan yazmaz — böylece test ettiği şey gerçek akışın aynısı olur.
   */
  useEffect(() => {
    const globals = window as unknown as Record<string, unknown>;
    globals['__capital'] = {
      engine,
      getState: () => engine.getState(),
      selectTile: (tileId: number | null) =>
        setViewState((current) => ({ ...current, selectedTileId: tileId })),
      // Seçili parsel: test, Enter'ın ve A'nın ortadaki parseli seçtiğini görsün (Tur 72).
      selectedTile: () => viewRef.current.selectedTileId,
      setLens: (lens: ViewState['lens']) =>
        setViewState((current) => ({ ...current, lens })),
      renderInfo: () => rendererRef.current?.getDebugInfo() ?? null,
      schemaVersion: SCHEMA_VERSION,
      setTimeOfDay: (value: number) => rendererRef.current?.setTimeOfDay(value),
      setQuality: (tier: number) => rendererRef.current?.setQuality(tier),
      groundAt: (ndcX: number, ndcY: number) => rendererRef.current?.groundAt(ndcX, ndcY) ?? null,
      routeCount: () => supplyRoutes(engine.getState()).length,
      routeSignature: () => routeSignature(supplyRoutes(engine.getState())),
      customerFlows: () => customerFlows(engine.getState()),
      cameraTarget: () => rendererRef.current?.cameraTarget() ?? null,
      // Olay yerine gitmenin kamerası (Tur 47): azaltılmış harekette atlıyor.
      focusWorld: (x: number, z: number) => rendererRef.current?.focusWorld(x, z),
      setView: (view: { x: number; z: number; distance?: number; azimuth?: number; polar?: number }) =>
        rendererRef.current?.setView(view),
      tutorialStep: () => tutorialStepOf(engine.getState()),
      // Ürünün taban fiyatı: test, pazarın o anki krizini nötrleyebilsin diye (Tur 32).
      basePrice: (goodId: string) => GOOD_BY_ID[goodId]?.basePrice ?? null,
      // Bina tanımının rolü: test, dumanın yalnızca üretim yapan tesisten çıktığını sayabilsin diye (Tur 34).
      buildingRole: (defId: string) => BUILDING_BY_ID[defId]?.role ?? null,
      // Bina tanımının kategorisi: test, rakibin oyuncuyla ortak rafını bulabilsin diye (Tur 59).
      buildingCategory: (defId: string) => BUILDING_BY_ID[defId]?.category ?? null,
      // Takvimin havası: test, istediği havanın gününü bulabilsin diye (Tur 62).
      weatherOn: (seed: number, day: number) => weatherOn(seed, day).id,
      // Binanın çatı rengi: test, devralma dalgasının yeni sahibin rengine vardığını görsün (Tur 63).
      buildingAccent: (id: string) => rendererRef.current?.buildingAccent(id) ?? null,
      // Karenin ekrandaki yeri: test, tuval boyut değiştirince izdüşümün yeni yeri okuduğunu görsün (Tur 65).
      screenOfTile: (tileId: number) => rendererRef.current?.screenOfTile(tileId) ?? null,
      // Kameranın açısı ve uzaklığı: test Q/E'yi, +/−'yi ve kumandanın çubuklarını ölçsün (Tur 72).
      cameraPose: () => rendererRef.current?.cameraPose() ?? null,
    };
    return () => {
      delete globals['__capital'];
    };
  }, [engine]);

  // ---- Kayıt işlemleri ----
  const saveTo = useCallback(
    async (slot: number, name?: string) => {
      try {
        await saveGame(engine.getState(), slot, name);
        toast(t('app.save.saved', { slot }), 'good');
      } catch (error) {
        if (error instanceof NewerSaveError) toast(t('app.save.newerSlot', { slot }), 'bad');
        else toast(t('app.save.failed', { message: (error as Error).message }), 'bad');
      }
    },
    [engine, toast],
  );

  const loadFrom = useCallback(
    async (slot: number) => {
      const outcome = await loadGame(slot);
      if (!outcome.ok) {
        toast(loadProblemText(outcome), 'bad');
        return;
      }
      engine.replaceState(outcome.state);
      setViewState((current) => ({ ...current, selectedTileId: null, ghostDefId: null, openPanel: 'none' }));
      toast(
        outcome.migratedFrom ? t('app.load.migrated', { version: outcome.migratedFrom }) : t('app.load.loaded'),
        'good',
      );
    },
    [engine, toast],
  );

  // "Yeni oyun" doğrudan rastgele bir şehir açmaz; oyuncuyu kurulum
  // ekranına götürür ki şirketini ve CEO'sunu yeniden seçebilsin.
  const newGame = useCallback(() => {
    setViewState((current) => ({ ...current, openPanel: 'none' }));
    onRequestNewGame();
  }, [onRequestNewGame]);

  const exportSaveText = useCallback(() => exportToJson(engine.getState()), [engine]);

  const exportSave = useCallback(async (): Promise<ExportOutcome> => {
    const state = engine.getState();
    // Dosya adı ASCII (Tur 65): harfli ad bazı sistemlerde indirmede "download"a dönüyordu.
    const filename = `capitalforge-${fileSlug(getPlayer(state).name)}-gun${state.time.day}.json`;
    const outcome = await deliverTextFile(filename, exportToJson(state));
    /*
     * OYUN OYUNCUYA YALAN SÖYLEMEZ — dışa aktarmada da.
     *
     * Eski hâli her durumda "Kayıt dosyası indirildi" diyordu; yayınlanmış
     * sayfada tarayıcı indirmeyi engellerken bile. Şimdi cümle sonucu
     * izliyor: doğrulanmış kayıt, başlatılmış indirme, panoya kopyalama
     * ya da açık bir "engellendi" — sonuncusunda panel metin kutusunu
     * açıp elle kopyalamayı öneriyor.
     */
    const messages: Record<ExportOutcome, [string, ToastMessage['tone']]> = {
      saved: [t('app.export.saved'), 'good'],
      downloads: [t('app.export.downloads'), 'good'],
      started: [t('app.export.started'), 'good'],
      copied: [t('app.export.copied'), 'info'],
      declined: [t('app.export.declined'), 'info'],
      blocked: [t('app.export.blocked'), 'bad'],
    };
    const [text, tone] = messages[outcome];
    toast(text, tone);
    return outcome;
  }, [engine, toast]);

  const applyImported = useCallback(
    (raw: string, label: string) => {
      const outcome = importFromJson(raw);
      if (!outcome.ok) {
        toast(loadProblemText(outcome), 'bad');
        return;
      }
      engine.replaceState(outcome.state);
      setViewState((current) => ({ ...current, selectedTileId: null, ghostDefId: null, openPanel: 'none' }));
      toast(label, 'good');
    },
    [engine, toast],
  );

  const importSave = useCallback(
    async (file: File) => applyImported(await file.text(), t('app.import.file')),
    [applyImported],
  );

  const importSaveText = useCallback(
    (text: string) => applyImported(text, t('app.import.text')),
    [applyImported],
  );

  /*
   * Olay yerine git: kare verilirse seçilir ve kamera ona kayar; bölge
   * verilirse merkezine. Açık panel kapanıyor — haritayı göstermek için
   * çağrıldı, modalın arkasında kalmasın.
   */
  // Ses manzarası: tek örnek, ilk dokunuşta kendini başlatıyor.
  const soundscape = useMemo(() => new Soundscape(), []);
  // Menüye dönünce ses ve müzik susuyor (Tur 49).
  useEffect(() => {
    soundscape.attach();
    return () => soundscape.dispose();
  }, [soundscape]);
  const [muted, setMuted] = useState(() => soundscape.isMuted());
  useEffect(() => soundscape.subscribe(() => setMuted(soundscape.isMuted())), [soundscape]);
  useEffect(() => {
    const timer = setInterval(() => {
      soundscape.update(engine.getState(), rendererRef.current?.daylight() ?? 1);
    }, 500);
    return () => clearInterval(timer);
  }, [engine, soundscape]);
  // Görünüm (Tur 35): Otomatik seçimde arayüz şehrin gecesine uyuyor.
  useEffect(() => {
    const timer = setInterval(() => setCityDaylight(rendererRef.current?.daylight() ?? null), 500);
    return () => {
      clearInterval(timer);
      setCityDaylight(null);
    };
  }, []);
  const audio = useMemo(
    () => ({ muted, toggle: () => soundscape.setMuted(!soundscape.isMuted()) }),
    [muted, soundscape],
  );
  // Test kancası: ses durumu (bağlam, sessiz, tetiklenen olaylar). Köprü
  // motor değişince yeniden kurulduğu için motor da bağımlılıkta.
  useEffect(() => {
    const bridge = (window as unknown as Record<string, Record<string, unknown> | undefined>)['__capital'];
    if (bridge) bridge['audio'] = () => soundscape.debug();
  }, [engine, soundscape]);

  // Lig tablosu: yerel tabloyla açılır, barındırıcı paylaşılanı ya da lig
  // sunucusu (Tur 51) hazırsa ona geçer. Sunucu ilk denemede yoksa (bağlantı
  // yok, yavaş açılış, eski sürüm) yerelde kalmıyor: bağlantı gelince, sayfaya
  // dönünce ve beş dakikada bir yeniden deneniyor; bulunca bir kez geçiyor.
  const [league, setLeague] = useState<LeagueBoard>(fallbackLeagueBoard);
  useEffect(() => {
    let cancelled = false;
    let current: LeagueBoard['kind'] = 'local';
    // Ekran kapanınca kullanılan tablo bırakılıyor (kalıcı dinleyicileri kalkıyor).
    let active: LeagueBoard | null = null;
    const adopt = (board: LeagueBoard) => {
      if (cancelled) {
        board.close?.();
        return;
      }
      current = board.kind;
      active = board;
      setLeague(board);
    };
    let trying = false;
    const pick = () => {
      if (current !== 'local' || trying || !leagueServerConfigured()) return;
      trying = true;
      void createLeagueBoard()
        .then((board) => {
          if (board.kind !== 'local') adopt(board);
        })
        .finally(() => {
          trying = false;
        });
    };
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') pick();
    };
    trying = true;
    void createLeagueBoard()
      .then((board) => {
        // Yerel tablodan yerel tabloya geçiş yok: sonuç ekranının gönderimi tablo değişince yeniden açılıyor.
        if (board.kind !== 'local') adopt(board);
      })
      .finally(() => {
        trying = false;
      });
    const timer = window.setInterval(pick, 5 * 60_000);
    window.addEventListener('online', pick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', pick);
      document.removeEventListener('visibilitychange', onVisible);
      active?.close?.();
    };
  }, []);

  const focusOn = useCallback(
    (target: FocusTarget) => {
      const state = engine.getState();
      if (target.tileId !== undefined) {
        const tile = state.map.tiles[target.tileId];
        if (!tile) return;
        setViewState((current) => ({ ...current, selectedTileId: tile.id, openPanel: 'none' }));
        rendererRef.current?.focusWorld(tile.x, tile.y);
        return;
      }
      if (target.districtId !== undefined) {
        const district = state.districts[target.districtId];
        if (!district) return;
        setViewState((current) => ({ ...current, openPanel: 'none' }));
        rendererRef.current?.focusWorld((district.x0 + district.x1) / 2, (district.y0 + district.y1) / 2);
      }
    },
    [engine],
  );

  const projectTile = useCallback((tileId: number) => rendererRef.current?.screenOfTile(tileId) ?? null, []);

  // Şehir kartı (Tur 64). Veri lensi şehri boyuyor: kart şehrin kendisini
  // gösteriyor, lens bir anlığına kapanıp geri geliyor (sahne iki karede
  // yeni görünüme geçiyor). Gölgelendiriciler derlenirken (açılışta, kalite
  // değişince) sahne çizilmiyor: kart onları bekliyor, şehirsiz bir gök
  // çizmiyor (Codex #94). Yarım dakikada da hazır değilse kart çizilemedi.
  const snapshotCity = useCallback(async (width: number, height: number) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const lens = viewRef.current.lens;
    if (lens !== 'none') {
      setViewState((current) => ({ ...current, lens: 'none' }));
      await frame();
      await frame();
    }
    try {
      const started = performance.now();
      while (rendererRef.current && !rendererRef.current.shadersWarm() && performance.now() - started < 30_000) await frame();
      return rendererRef.current?.snapshot(width, height) ?? null;
    } finally {
      if (lens !== 'none') setViewState((current) => ({ ...current, lens }));
    }
  }, []);
  const saveImage = useCallback((filename: string, blob: Blob) => deliverImageFile(filename, blob), []);

  const context = useMemo<GameContextValue>(
    () => ({
      engine,
      view,
      setView,
      run,
      toast,
      toasts,
      newGame,
      saveTo,
      loadFrom,
      exportSave,
      exportSaveText,
      importSave,
      importSaveText,
      focusOn,
      projectTile,
      snapshotCity,
      saveImage,
      league,
      audio,
    }),
    [
      engine,
      view,
      setView,
      run,
      toast,
      toasts,
      newGame,
      saveTo,
      loadFrom,
      exportSave,
      exportSaveText,
      importSave,
      importSaveText,
      focusOn,
      projectTile,
      snapshotCity,
      saveImage,
      league,
      audio,
    ],
  );

  return (
    <GameContext.Provider value={context}>
      <div className="app">
        <canvas ref={canvasRef} className="scene" />
        {/* Klavye ve kumanda (Tur 72): imleç kameranın ortasındaki parsel. */}
        <div className="map-reticle" aria-hidden="true" />
        <div className="hud">
          <TopBar />
          <div className="leftcol">
            <LensBar />
            <BuildPanel />
          </div>
          <ActiveEvents />
          <NewsFeed />
          <Inspector />
        </div>
        <MoneyTags />
        <OpportunityBubble />
        <ModalHost />
        <DecisionCard />
        <Coach />
        <Toasts />
        <MomentBanner />
        <GameOverScreen onNewGame={newGame} />
        <VictoryScreen onNewGame={newGame} />
        <LeagueResultScreen onNewGame={newGame} />
        <ScenarioBriefScreen />
        <ScenarioResultScreen
          onNewGame={newGame}
          onReplay={(id) => {
            const state = engine.getState();
            const player = getPlayer(state);
            onReplayScenario(scenarioDefOf(state) ?? id, player.name, player.ceoId);
          }}
        />
      </div>
    </GameContext.Provider>
  );
}
