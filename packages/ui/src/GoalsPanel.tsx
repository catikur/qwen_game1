import type { ReactElement } from 'react';
import { QUEST_BY_ID, QUEST_TIMING, getDifficulty, formatPercent } from '@capital/content';
import {
  companyRanking,
  formatDate,
  formatMoney,
  getPlayer,
  goalLadder,
  monthName,
  nextGoal,
  nextMonthStart,
  openCityQuote,
  questProgress,
  questTitle,
  questValue,
  questsEnabled,
  scenarioResultPending,
  victoryNetWorth,
} from '@capital/core';
import type { GameState, QuestBoard, QuestState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';
import { ScenarioGoalSection } from './ScenarioScreens';
import { CareerRunLine, useCareerRevision } from './CareerPanel';
import { careerSummary } from './career';
import { ModifierLine } from './ModifierLine';

/** Görevin "şu an / hedef" satırı, görevin kendi biriminde. */
function questNumbers(state: GameState, board: QuestBoard, quest: QuestState): string {
  const value = questValue(state, board, quest);
  switch (quest.defId) {
    case 'share':
      return `${formatPercent(Math.round(value * 100))} / ${formatPercent(Math.round(quest.target * 100))}`;
    case 'revenue':
    case 'cash':
      return `${formatMoney(value)} / ${formatMoney(quest.target)}`;
    case 'overtake':
      return formatPercent(Math.round(questProgress(state, board, quest) * 100));
    default:
      return `${Math.max(0, Math.min(value, quest.target))} / ${quest.target}`;
  }
}

/**
 * Ayın görev panosu (Tur 37c): üç kısa görev, ilerleme, ödül. Ödül
 * tamamlandığı gün kasaya giriyor; satır "Tamam" diye kalıyor.
 */
function QuestBoardView(): ReactElement | null {
  const state = useGameState();
  const { run, toast } = useGame();
  if (!questsEnabled(state) || state.gameOver) return null;
  const board = state.quests;
  if (!board) {
    // İlk ay: panonun ne zaman kurulacağı (ilk ay başı, `firstDay`'den sonra).
    const opens = nextMonthStart(Math.max(state.time.day, QUEST_TIMING.firstDay - 1));
    return (
      <section className="quest-board quest-board-empty" data-quests="none">
        <p className="muted">{t('hud.quests.none', { date: formatDate(opens) })}</p>
      </section>
    );
  }
  return (
    <section className="quest-board" data-quests={board.startDay}>
      <header className="quest-head">
        <h3>{t('hud.quests.title', { month: monthName(board.startDay) })}</h3>
        <span className="quest-days">{t('hud.quests.daysLeft', { days: Math.max(0, board.endDay - state.time.day) })}</span>
      </header>
      <p className="muted quest-lead">{t('hud.quests.lead')}</p>
      <ul className="quest-list">
        {board.items.map((quest, index) => {
          const def = QUEST_BY_ID[quest.defId];
          const done = quest.doneDay !== undefined;
          const ready = done && !quest.claimed;
          const progress = questProgress(state, board, quest);
          const title = questTitle(state, quest);
          return (
            <li
              key={quest.defId}
              className={`quest${quest.claimed ? ' quest-done' : ''}${ready ? ' quest-ready' : ''}`}
              data-quest={quest.defId}
            >
              <span className="quest-check" aria-hidden="true">
                {quest.claimed ? '✓' : ready ? '!' : ''}
              </span>
              <div className="quest-body">
                <div className="quest-row">
                  <span className="quest-title">{title}</span>
                  <span className="quest-reward">
                    {t(def.brand && quest.category ? 'hud.quests.rewardBrand' : 'hud.quests.reward', {
                      amount: formatMoney(quest.reward),
                    })}
                  </span>
                </div>
                {ready ? (
                  <div className="quest-claim">
                    <button
                      type="button"
                      className="primary"
                      data-quest-claim={index}
                      onClick={() => {
                        if (run({ type: 'CLAIM_QUEST', index })) {
                          toast(t('hud.quests.claimedToast', { amount: formatMoney(quest.reward) }), 'good');
                        }
                      }}
                    >
                      {t('hud.quests.claim')}
                    </button>
                    <span className="quest-detail">{t('hud.quests.claimHint')}</span>
                  </div>
                ) : done ? (
                  <p className="quest-detail">{t('hud.quests.done', { day: quest.doneDay ?? 0 })}</p>
                ) : (
                  <>
                    <div
                      className="goal-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress * 100)}
                      aria-label={title}
                    >
                      <span style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <p className="quest-detail">
                      {questNumbers(state, board, quest)} — {def.hint}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Hedef merdiveni paneli.
 *
 * Basamaklar sırayla diziliyor; tamamlanan basamak gününü, sıradaki
 * basamak ipucunu ve ilerlemesini gösteriyor. Sonraki basamaklar da
 * görünür — oyuncu merdivenin nereye çıktığını baştan bilmeli, zafer
 * sürpriz bir ekran değil bir hedef.
 */
export function GoalsPanel(): ReactElement {
  const state = useGameState();
  const { setView } = useGame();
  const canExpand = openCityQuote(state).ok;
  const ladder = goalLadder(state);
  const next = nextGoal(state);
  const difficulty = getDifficulty(state.difficulty);
  const done = ladder.filter((goal) => goal.completedDay !== null).length;
  useCareerRevision();
  const career = careerSummary();

  return (
    <div className="goals">
      {/* Kariyer (Tur 41): rozetler ve koşu geçmişi; oyun içinde buradan. */}
      <button type="button" className="ghost career-open" data-career-open onClick={() => setView({ openPanel: 'career' })}>
        {t('hud.career.open', {
          done: career.statuses.filter((status) => career.unlocked[status.def.id]).length,
          total: career.statuses.length,
        })}
      </button>
      <ScenarioGoalSection />
      <QuestBoardView />
      <h3 className="goals-ladder-title">{t('hud.quests.ladder')}</h3>
      <p className="muted">
        {t('hud.goals.summary', {
          difficulty: difficulty.name,
          done,
          total: ladder.length,
          target: formatMoney(victoryNetWorth(state)),
        })}
      </p>
      <ModifierLine modifiers={state.modifiers} />
      <ol className="goal-list">
        {ladder.map((goal) => {
          const isNext = next?.def.id === goal.def.id;
          const status = goal.completedDay !== null ? 'done' : isNext ? 'next' : 'later';
          return (
            <li key={goal.def.id} className={`goal goal-${status}`} data-goal={goal.def.id}>
              <div className="goal-head">
                <span className="goal-title">{goal.def.title}</span>
                <span className="goal-state">
                  {goal.completedDay !== null
                    ? t('hud.goals.completedDay', { day: goal.completedDay })
                    : formatPercent(Math.round(goal.progress * 100))}
                </span>
              </div>
              {goal.completedDay === null && (
                <>
                  <div
                    className="goal-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(goal.progress * 100)}
                    aria-label={goal.def.title}
                  >
                    <span style={{ width: `${Math.round(goal.progress * 100)}%` }} />
                  </div>
                  <p className="goal-detail">
                    {goal.detail}
                    {isNext ? ` — ${goal.def.hint}` : ''}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {canExpand && (
        <p className="goals-holding">
          {t('hud.holding.goalsCta')}{' '}
          <button type="button" className="ghost" data-goals-open-city onClick={() => setView({ openPanel: 'cities' })}>
            {t('hud.victory.openCity')}
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Zafer ekranı — oyun sonu ekranının ikizi, ama kapı açık.
 *
 * Motor zafer gününde oyunu duraklatıyor; ekran iki çıkış sunuyor:
 * serbest oyuna devam (takvim yürür, merdiven tamam kalır) ya da yeni
 * imparatorluk. Kaybetmek bir SON'du; kazanmak bir dönemeç.
 */
export function VictoryScreen({ onNewGame }: { onNewGame: () => void }): ReactElement | null {
  const { run, setView } = useGame();
  const state = useGameState();
  const victory = state.victory;
  if (!victory || victory.dismissed || state.gameOver || scenarioResultPending(state)) return null;

  const player = getPlayer(state);
  const ranking = companyRanking(state);
  const runnerUp = ranking.find((row) => !row.company.isPlayer);
  const difficulty = getDifficulty(state.difficulty);
  const buildings = Object.values(state.buildings).filter((b) => b.companyId === player.id).length;

  return (
    <div className="gameover victory" role="alertdialog" aria-label={t('hud.victory.label')}>
      <div className="gameover-card">
        <h2>{victory.kind === 'monopoly' ? t('hud.victory.titleMonopoly') : t('hud.victory.titleNetWorth')}</h2>
        <p>
          {t('hud.victory.summary', {
            day: victory.day,
            difficulty: difficulty.name,
            player: player.name,
            worth: formatMoney(player.netWorth),
            buildings,
            outcome: runnerUp
              ? t('hud.victory.runnerUp', {
                  rival: runnerUp.company.name,
                  rivalWorth: formatMoney(runnerUp.company.netWorth),
                })
              : t('hud.victory.alone'),
          })}
        </p>
        <ModifierLine modifiers={state.modifiers} />
        <p className="muted">{t('hud.victory.note')}</p>
        <CareerRunLine state={state} />
        <div className="gameover-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              run({ type: 'DISMISS_VICTORY' });
              run({ type: 'SET_SPEED', speed: 1 });
            }}
          >
            {t('hud.victory.continue')}
          </button>
          {/*
           * Holding (Tur 22): zafer bir dönemeç — yeni şehre açılmak üçüncü
           * çıkış. Panel açılıyor, karar (sermaye, boyut) orada veriliyor.
           */}
          {openCityQuote(state).ok && (
            <button
              type="button"
              className="ghost-invert"
              data-victory-open-city
              onClick={() => {
                run({ type: 'DISMISS_VICTORY' });
                setView({ openPanel: 'cities' });
              }}
            >
              {t('hud.victory.openCity')}
            </button>
          )}
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            {t('hud.victory.newEmpire')}
          </button>
        </div>
      </div>
    </div>
  );
}
