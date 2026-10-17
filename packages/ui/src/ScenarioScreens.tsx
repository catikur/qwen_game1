import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { formatDecimal, formatPercent } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import { formatMoney, getPlayer, scenarioDefOf, scenarioGoalText, scenarioProgress, scenarioScoreText } from '@capital/core';
import type { GameState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { recordScenarioResult, scenarioRecord, scenarioRunKey } from './scenarioBest';
import { t } from './i18n';

/**
 * Senaryo ekranları (Tur 39): açılış (durum, hedef, süre — oyun duraklamış
 * başlıyor), sonuç (yıldız, cihazdaki en iyi) ve hedef panelindeki bölüm.
 */

/** "★★☆" — yıldızlar okunur metin değil, yanında sayısı yazıyor. */
export function starRow(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
}

/** İki ve üç yıldızın eşikleri, senaryonun ölçüsünde. */
export function starThresholds(def: ScenarioDef): string {
  const { metric, two, three } = def.stars;
  return metric === 'days'
    ? t('hud.scenario.thresholdsDays', { two, three })
    : t('hud.scenario.thresholdsLead', { two: formatDecimal(two, 2), three: formatDecimal(three, 2) });
}

/** Sonuç ekranı bekliyor mu — oyun sonu ve zafer ekranı o sırada çekiliyor. */
export function scenarioResultPending(state: GameState): boolean {
  const run = state.scenario;
  return run !== undefined && run.finishedDay !== undefined && !run.resultSeen;
}

export function ScenarioBriefScreen(): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  if (!scenario || !def || scenario.briefSeen || scenario.finishedDay !== undefined) return null;
  const player = getPlayer(state);
  const rival = scenario.rivalId ? state.companies[scenario.rivalId] : undefined;

  return (
    <div className="gameover scenario-brief" role="alertdialog" aria-label={t('hud.scenario.briefLabel')} data-scenario-brief={def.id}>
      <div className="gameover-card">
        <p className="newgame-eyebrow">{t('hud.scenario.eyebrow', { day: state.time.day })}</p>
        <h2>{def.title}</h2>
        <p>{def.brief}</p>
        <p className="scenario-goal">
          <span className="tag good">{t('hud.scenario.goal')}</span> {scenarioGoalText(def)}
        </p>
        <ul className="scenario-facts">
          {def.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <p className="muted">
          {t('hud.scenario.briefCompany', { company: player.name, cash: formatMoney(player.cash), worth: formatMoney(player.netWorth) })}
          {rival ? ` ${t('hud.scenario.briefRaider', { rival: rival.name })}` : ''}
        </p>
        <p className="muted scenario-stars">{starThresholds(def)}</p>
        <div className="gameover-actions">
          <button type="button" className="primary" data-scenario-begin onClick={() => run({ type: 'DISMISS_SCENARIO', screen: 'brief' })}>
            {t('hud.scenario.begin')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScenarioResultScreen({ onNewGame, onReplay }: { onNewGame: () => void; onReplay: (id: string) => void }): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  const pending = scenarioResultPending(state);
  const runKey = scenario
    ? scenarioRunKey({ createdAtIso: state.meta.createdAtIso, finishedDay: scenario.finishedDay, outcome: scenario.outcome, score: scenario.score })
    : '';
  const [best, setBest] = useState(false);

  // Sonuç cihazda bir kez sayılıyor (sonuç ekranı yeniden açılsa da).
  useEffect(() => {
    if (!pending || !scenario || !def) return;
    setBest(recordScenarioResult(def.id, runKey, scenario.stars ?? 0, scenario.score ?? 0));
  }, [pending, runKey]);

  if (!pending || !scenario || !def) return null;
  const won = scenario.outcome === 'won';
  const record = scenarioRecord(def.id);
  const used = (scenario.finishedDay ?? state.time.day) - scenario.startDay;

  return (
    <div className="gameover scenario-result" role="alertdialog" aria-label={t('hud.scenario.resultLabel')} data-scenario-result={scenario.outcome}>
      <div className="gameover-card">
        <h2>{won ? t('hud.scenario.wonTitle', { title: def.title }) : t('hud.scenario.lostTitle', { title: def.title })}</h2>
        <p className="scenario-result-stars" aria-label={t('hud.scenario.starsLabel', { stars: scenario.stars ?? 0 })} data-stars={scenario.stars ?? 0}>
          {starRow(scenario.stars ?? 0)}
        </p>
        <p>
          {won
            ? def.stars.metric === 'days'
              ? t('hud.scenario.wonBodyDays', { days: used })
              : t('hud.scenario.wonBodyLead', { score: scenarioScoreText(def, scenario.score ?? 0) })
            : state.gameOver
              ? t('hud.scenario.lostTakeover', { days: used })
              : def.goal.kind === 'netWorth'
                ? t('hud.scenario.lostTimeMoney', { percent: formatPercent(Math.round((scenario.score ?? 0) * 100)) })
                : t('hud.scenario.lostTimeLead', { score: scenarioScoreText(def, scenario.score ?? 0) })}
        </p>
        <p className="muted" data-scenario-best>
          {best
            ? t('hud.scenario.newBest')
            : record.best
              ? t('hud.scenario.best', { stars: starRow(record.best.stars), score: scenarioScoreText(def, record.best.score) })
              : t('hud.scenario.noBest')}
        </p>
        <p className="muted scenario-stars">{starThresholds(def)}</p>
        <div className="gameover-actions">
          <button type="button" className="primary" data-scenario-replay onClick={() => onReplay(def.id)}>
            {t('hud.scenario.replay')}
          </button>
          {!state.gameOver && (
            <button
              type="button"
              className="ghost-invert"
              data-scenario-continue
              onClick={() => {
                run({ type: 'DISMISS_SCENARIO', screen: 'result' });
                // Aynı gün zafer de geldiyse onun ekranı sırada: takvimi o yürütür.
                if (!state.victory || state.victory.dismissed) run({ type: 'SET_SPEED', speed: 1 });
              }}
            >
              {t('hud.scenario.continue')}
            </button>
          )}
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            {t('hud.scenario.list')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hedef panelinin başındaki senaryo bölümü: hedef, ilerleme, kalan süre, yıldız eşikleri. */
export function ScenarioGoalSection(): ReactElement | null {
  const state = useGameState();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  const status = scenarioProgress(state);
  if (!scenario || !def || !status) return null;
  const finished = scenario.finishedDay !== undefined;
  return (
    <section className="scenario-goals" data-scenario-goals={def.id}>
      <header className="quest-head">
        <h3>{t('hud.scenario.panelTitle', { title: def.title })}</h3>
        <span className="quest-days">
          {finished ? starRow(scenario.stars ?? 0) : t('hud.scenario.daysLeft', { days: status.daysLeft })}
        </span>
      </header>
      <p className="scenario-goal">{scenarioGoalText(def)}</p>
      {!finished && (
        <div
          className="goal-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(status.progress * 100)}
          aria-label={def.title}
        >
          <span style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
      )}
      <p className="goal-detail">
        {finished
          ? scenario.outcome === 'won'
            ? t('hud.scenario.panelWon', { score: scenarioScoreText(def, scenario.score ?? 0) })
            : t('hud.scenario.panelLost')
          : status.detail}
      </p>
      <p className="muted scenario-stars">{starThresholds(def)}</p>
    </section>
  );
}
