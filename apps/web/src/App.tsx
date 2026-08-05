import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type { ReactElement } from 'react';
import { GameEngine, createNewGame, getPlayer } from '@capital/core';
import type { GameCommand } from '@capital/core';
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
  Inspector,
  LensBar,
  ModalHost,
  NewsFeed,
  Toasts,
  TopBar,
  useGameVersion,
} from '@capital/ui';
import type { GameContextValue, ToastMessage, ViewState } from '@capital/ui';

const AUTOSAVE_INTERVAL_MS = 30_000;

/** Açılışta otomatik kaydı dener; yoksa yeni şehir kurar. */
async function boot(): Promise<{ engine: GameEngine; message: string | null }> {
  const outcome = await loadGame(AUTOSAVE_SLOT);
  if (outcome.ok) {
    return {
      engine: new GameEngine(outcome.state),
      message: outcome.migratedFrom
        ? `Kayıt v${outcome.migratedFrom} sürümünden taşındı.`
        : 'Otomatik kayıt yüklendi.',
    };
  }
  return { engine: new GameEngine(createNewGame()), message: null };
}

export function App(): ReactElement {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [bootMessage, setBootMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void boot().then((result) => {
      if (cancelled) return;
      setEngine(result.engine);
      setBootMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!engine) return <div className="loading">Şehir hazırlanıyor…</div>;
  return <GameRoot engine={engine} bootMessage={bootMessage} onNewEngine={setEngine} />;
}

function GameRoot({
  engine,
  bootMessage,
}: {
  engine: GameEngine;
  bootMessage: string | null;
  onNewEngine: (engine: GameEngine) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const version = useGameVersion(engine);

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
      const dt = Math.min(0.1, (now - last) / 1000);
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
  }, [engine]);

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

  // ---- Kayıt işlemleri ----
  const saveTo = useCallback(
    async (slot: number, name?: string) => {
      try {
        await saveGame(engine.getState(), slot, name);
        toast(`Slot ${slot} kaydedildi.`, 'good');
      } catch (error) {
        toast(`Kayıt başarısız: ${(error as Error).message}`, 'bad');
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
        outcome.migratedFrom ? `Yüklendi (v${outcome.migratedFrom} → güncel şema).` : 'Oyun yüklendi.',
        'good',
      );
    },
    [engine, toast],
  );

  const newGame = useCallback(() => {
    engine.replaceState(createNewGame());
    setViewState((current) => ({ ...current, selectedTileId: null, ghostDefId: null, openPanel: 'none' }));
    toast('Yeni şehir kuruldu.', 'good');
  }, [engine, toast]);

  const exportSave = useCallback(() => {
    const state = engine.getState();
    const blob = new Blob([exportToJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capitalforge-${getPlayer(state).name}-gun${state.time.day}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Kayıt dosyası indirildi.', 'good');
  }, [engine, toast]);

  const importSave = useCallback(
    async (file: File) => {
      const outcome = importFromJson(await file.text());
      if (!outcome.ok) {
        toast(outcome.reason, 'bad');
        return;
      }
      engine.replaceState(outcome.state);
      setViewState((current) => ({ ...current, selectedTileId: null, ghostDefId: null, openPanel: 'none' }));
      toast('Kayıt içe aktarıldı.', 'good');
    },
    [engine, toast],
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
      importSave,
    }),
    [engine, view, setView, run, toast, toasts, newGame, saveTo, loadFrom, exportSave, importSave],
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
      </div>
    </GameContext.Provider>
  );
}
