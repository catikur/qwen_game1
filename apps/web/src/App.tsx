import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { GameEngine, GameState, LeagueBoardKind } from '@capital/core';
import type { CitySizeId, DifficultyId, ModifierId, ScenarioDef } from '@capital/content';
import { AUTOSAVE_SLOT, loadGame } from '@capital/persistence';
import { NewGameScreen, t, useLocale } from '@capital/ui';

type GameModule = typeof import('./GameRoot');

/*
 * Oyun ekranı ayrı parça (Tur 46): three, şehir çizimi, HUD ve paneller
 * kurulum ekranının yolunda değil. İndirme açılışın ilk anında başlıyor;
 * kayıtla dönen oyuncu da, kurulumu dolduran yeni oyuncu da beklemiyor.
 * Bir kez istenir, sonra aynı söz döner.
 */
let gameModule: Promise<GameModule> | null = null;
function requestGame(): Promise<GameModule> {
  gameModule ??= import('./GameRoot').catch((error: unknown) => {
    // Yayından sonra eski sayfa eski parçayı bulamayabilir; yeniden denenebilsin.
    gameModule = null;
    throw error;
  });
  return gameModule;
}

/**
 * Açılış akışı.
 *
 * Devam eden bir oyun varsa doğrudan oraya döneriz; yoksa oyuncuyu boş bir
 * haritanın ortasına bırakmak yerine önce şirketini kurdururuz.
 */
export function App(): ReactElement {
  // Dil değişince bütün ağaç yeniden çiziliyor (bileşenler memo'lu değil);
  // oyun durumu ve sahne olduğu gibi kalıyor.
  useLocale();
  const [phase, setPhase] = useState<'loading' | 'menu' | 'preparing' | 'playing'>('loading');
  // Senaryonun ön tarihi parça parça koşuyor (Tur 39): ekran donmasın, ilerleme görünsün.
  const [preparing, setPreparing] = useState<{ title: string; done: number; total: number } | null>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [game, setGame] = useState<GameModule | null>(null);
  const [bootMessage, setBootMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const module = requestGame();
    void module.then((loaded) => {
      if (!cancelled) setGame(loaded);
    }, () => undefined);
    void loadGame(AUTOSAVE_SLOT).then(async (outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setPhase('menu');
        return;
      }
      const loaded = await module;
      if (cancelled) return;
      setEngine(new loaded.GameEngine(outcome.state));
      setBootMessage(
        outcome.migratedFrom
          ? t('app.boot.migrated', { version: outcome.migratedFrom })
          : t('app.boot.resumed'),
      );
      setPhase('playing');
    }).catch(() => {
      // Depolama tamamen kapalıysa ya da oyun parçası inmediyse açılış menüye
      // düşer, oyun boot olmayı bırakmaz — kayıt okumak oyuna girmenin ön
      // koşulu değil. Parça yine inmezse başlatırken söylenir.
      if (!cancelled) setPhase('menu');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Oyun parçası gerekince: inmişse hemen, değilse inince; inmezse açıkça söyle. */
  const withGame = (use: (loaded: GameModule) => void) => {
    if (game) {
      use(game);
      return;
    }
    setPhase('loading');
    void requestGame().then(
      (loaded) => {
        setGame(loaded);
        use(loaded);
      },
      () => setFailed(true),
    );
  };

  const begin = (loaded: GameModule, next: GameState) => {
    if (engine) engine.replaceState(next);
    else setEngine(new loaded.GameEngine(next));
    setBootMessage(null);
    setPreparing(null);
    setPhase('playing');
  };

  const launchScenario = (scenario: string | ScenarioDef, companyName: string, ceoId: string | null) => withGame((loaded) => {
    const builder = loaded.startScenario(scenario, { companyName, ceoId });
    setPreparing({ title: builder.def.title, done: 0, total: builder.totalDays });
    setPhase('preparing');
    const tick = () => {
      const finished = builder.step(10);
      setPreparing({ title: builder.def.title, done: builder.daysDone(), total: builder.totalDays });
      if (finished) begin(loaded, builder.finish());
      else setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });

  const start = (
    companyName: string,
    ceoId: string,
    difficulty: DifficultyId,
    league: LeagueBoardKind | null,
    citySize: CitySizeId,
    tutorial: boolean,
    scenario: string | ScenarioDef | null,
    modifiers: ModifierId[],
  ) => {
    if (scenario) {
      launchScenario(scenario, companyName, ceoId);
      return;
    }
    withGame((loaded) => {
      // Haftanın tohumu ya da günün koşusu (Tur 53): kimlik oyunu kuruyor.
      const next = league
        ? loaded.createLeagueGame(league === 'day' ? loaded.leagueDayId() : loaded.leagueWeekId(), companyName, ceoId)
        : loaded.createNewGame({ companyName, ceoId, difficulty, citySize, modifiers });
      if (tutorial) loaded.startTutorial(next);
      begin(loaded, next);
    });
  };

  if (failed) {
    return (
      <div className="loading" data-boot-failed>
        <div className="boot-failed-card">
          <p>{t('app.boot.failed')}</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            {t('app.boot.reload')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') return <div className="loading">{t('app.boot.loading')}</div>;

  if (phase === 'preparing' && preparing) {
    const percent = Math.round((preparing.done / Math.max(1, preparing.total)) * 100);
    return (
      <div className="loading scenario-preparing" data-scenario-preparing={percent}>
        <div className="scenario-preparing-card">
          <p className="newgame-eyebrow">{t('hud.newGame.preparing')}</p>
          <p>{t('hud.newGame.preparingBody', { title: preparing.title, days: preparing.done, percent })}</p>
          <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={preparing.title}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'menu' || !engine) {
    return (
      <NewGameScreen
        onStart={start}
        deliverFile={(filename, text) => import('./host').then((host) => host.deliverTextFile(filename, text))}
        {...(engine?.getState().scenario ? { initialScenario: engine.getState().scenario!.id } : {})}
        {...(engine ? { onCancel: () => setPhase('playing') } : {})}
      />
    );
  }

  if (!game) return <div className="loading">{t('app.boot.loading')}</div>;
  return (
    <game.GameRoot
      engine={engine}
      bootMessage={bootMessage}
      onRequestNewGame={() => setPhase('menu')}
      onReplayScenario={launchScenario}
    />
  );
}
