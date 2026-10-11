import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type { ReactElement } from 'react';
import {
  GameEngine,
  SCHEMA_VERSION,
  createLeagueGame,
  createNewGame,
  customerFlows,
  getPlayer,
  leagueWeekId,
  routeSignature,
  supplyRoutes,
} from '@capital/core';
import type { GameCommand } from '@capital/core';
import type { CitySizeId, DifficultyId } from '@capital/content';
import { CityRenderer } from '@capital/render-three';
import {
  AUTOSAVE_SLOT,
  exportToJson,
  importFromJson,
  loadGame,
  saveGame,
} from '@capital/persistence';
import {
  ActiveEvents,
  BuildPanel,
  GameContext,
  GameOverScreen,
  Inspector,
  LeagueResultScreen,
  VictoryScreen,
  LensBar,
  ModalHost,
  NewGameScreen,
  NewsFeed,
  Toasts,
  TopBar,
  t,
  useGameVersion,
} from '@capital/ui';
import type { ExportOutcome, FocusTarget, GameContextValue, LeagueBoard, ToastMessage, ViewState } from '@capital/ui';
import { deliverTextFile } from './host';
import { createLeagueBoard, fallbackLeagueBoard } from './league-board';
import { Soundscape } from './audio';

const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * Açılış akışı.
 *
 * Devam eden bir oyun varsa doğrudan oraya döneriz; yoksa oyuncuyu boş bir
 * haritanın ortasına bırakmak yerine önce şirketini kurdururuz.
 */
export function App(): ReactElement {
  const [phase, setPhase] = useState<'loading' | 'menu' | 'playing'>('loading');
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [bootMessage, setBootMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadGame(AUTOSAVE_SLOT).then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        setEngine(new GameEngine(outcome.state));
        setBootMessage(
          outcome.migratedFrom
            ? t('app.boot.migrated', { version: outcome.migratedFrom })
            : t('app.boot.resumed'),
        );
        setPhase('playing');
      } else {
        setPhase('menu');
      }
    }).catch(() => {
      // Depolama tamamen kapalıysa açılış menüye düşer, oyun boot olmayı
      // bırakmaz — kayıt okumak oyuna girmenin ön koşulu değil.
      if (!cancelled) setPhase('menu');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = (companyName: string, ceoId: string, difficulty: DifficultyId, league: boolean, citySize: CitySizeId) => {
    const next = league
      ? createLeagueGame(leagueWeekId(), companyName, ceoId)
      : createNewGame({ companyName, ceoId, difficulty, citySize });
    if (engine) engine.replaceState(next);
    else setEngine(new GameEngine(next));
    setBootMessage(null);
    setPhase('playing');
  };

  if (phase === 'loading') return <div className="loading">{t('app.boot.loading')}</div>;

  if (phase === 'menu' || !engine) {
    return (
      <NewGameScreen
        onStart={start}
        {...(engine ? { onCancel: () => setPhase('playing') } : {})}
      />
    );
  }

  return (
    <GameRoot
      engine={engine}
      bootMessage={bootMessage}
      onRequestNewGame={() => setPhase('menu')}
    />
  );
}

function GameRoot({
  engine,
  bootMessage,
  onRequestNewGame,
}: {
  engine: GameEngine;
  bootMessage: string | null;
  onRequestNewGame: () => void;
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

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Üst sınır yalnızca sekmeden dönüşteki devasa sıçramayı keser.
      // Fazla dar tutulursa düşük kare hızında oyun saati gerçek zamanın
      // gerisine düşüyor ve seçilen hız kademesi yalan söylüyordu.
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      engine.advance(dt * 1000);
      renderer.render(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
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
  useEffect(() => {
    const timer = setInterval(() => {
      void saveGame(engine.getState(), AUTOSAVE_SLOT).catch((error) => {
        console.warn('Otomatik kayıt başarısız:', error);
      });
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [engine]);

  // ---- Klavye kısayolları ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        engine.dispatch({ type: 'TOGGLE_PAUSE' });
      } else if (e.code === 'Escape') {
        setViewState((current) => ({ ...current, ghostDefId: null, openPanel: 'none' }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine]);

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
        toast(t('app.save.failed', { message: (error as Error).message }), 'bad');
      }
    },
    [engine, toast],
  );

  const loadFrom = useCallback(
    async (slot: number) => {
      const outcome = await loadGame(slot);
      if (!outcome.ok) {
        toast(outcome.reason, 'bad');
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
    const filename = `capitalforge-${getPlayer(state).name}-gun${state.time.day}.json`;
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
        toast(outcome.reason, 'bad');
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
  const [muted, setMuted] = useState(() => soundscape.isMuted());
  useEffect(() => soundscape.subscribe(() => setMuted(soundscape.isMuted())), [soundscape]);
  useEffect(() => {
    const timer = setInterval(() => {
      soundscape.update(engine.getState(), rendererRef.current?.daylight() ?? 1);
    }, 500);
    return () => clearInterval(timer);
  }, [engine, soundscape]);
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

  // Lig tablosu: yerel tabloyla açılır, barındırıcı paylaşılanı verirse ona geçer.
  const [league, setLeague] = useState<LeagueBoard>(fallbackLeagueBoard);
  useEffect(() => {
    let cancelled = false;
    void createLeagueBoard().then((board) => {
      if (!cancelled) setLeague(board);
    });
    return () => {
      cancelled = true;
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
      league,
      audio,
    ],
  );

  return (
    <GameContext.Provider value={context}>
      <div className="app">
        <canvas ref={canvasRef} className="scene" />
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
        <ModalHost />
        <Toasts />
        <GameOverScreen onNewGame={newGame} />
        <VictoryScreen onNewGame={newGame} />
        <LeagueResultScreen onNewGame={newGame} />
      </div>
    </GameContext.Provider>
  );
}
