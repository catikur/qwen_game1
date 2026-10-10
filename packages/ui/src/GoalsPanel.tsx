import type { ReactElement } from 'react';
import { getDifficulty } from '@capital/content';
import { companyRanking, formatMoney, getPlayer, goalLadder, nextGoal, victoryNetWorth } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';

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
  const ladder = goalLadder(state);
  const next = nextGoal(state);
  const difficulty = getDifficulty(state.difficulty);
  const done = ladder.filter((goal) => goal.completedDay !== null).length;

  return (
    <div className="goals">
      <p className="muted">
        {t('hud.goals.summary', {
          difficulty: difficulty.name,
          done,
          total: ladder.length,
          target: formatMoney(victoryNetWorth(state)),
        })}
      </p>
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
                    : `%${Math.round(goal.progress * 100)}`}
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
  const { run } = useGame();
  const state = useGameState();
  const victory = state.victory;
  if (!victory || victory.dismissed || state.gameOver) return null;

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
        <p className="muted">{t('hud.victory.note')}</p>
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
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            {t('hud.victory.newEmpire')}
          </button>
        </div>
      </div>
    </div>
  );
}
