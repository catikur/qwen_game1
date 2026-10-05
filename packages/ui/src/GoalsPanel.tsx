import type { ReactElement } from 'react';
import { getDifficulty } from '@capital/content';
import { companyRanking, formatMoney, getPlayer, goalLadder, nextGoal } from '@capital/core';
import { useGame, useGameState } from './useGame';

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
        {difficulty.name} şehir · {done} / {ladder.length} basamak. Zafer: {formatMoney(difficulty.victoryNetWorth)} şirket
        değeri ve bir numara — ya da bütün rakipleri devralmak.
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
                  {goal.completedDay !== null ? `${goal.completedDay}. gün` : `%${Math.round(goal.progress * 100)}`}
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
    <div className="gameover victory" role="alertdialog" aria-label="Zafer">
      <div className="gameover-card">
        <h2>{victory.kind === 'monopoly' ? 'Tekel kuruldu' : 'Şehrin sahibi'}</h2>
        <p>
          {victory.day}. gün, {difficulty.name} şehir: {player.name} {formatMoney(player.netWorth)} değerinde,
          {' '}
          {buildings} binayla
          {runnerUp
            ? ` en yakın rakibi ${runnerUp.company.name}'in (${formatMoney(runnerUp.company.netWorth)}) önünde.`
            : ' şehirde tek başına.'}
        </p>
        <p className="muted">
          Devam edersen takvim yürür ve şehir büyümeye devam eder; zafer kaydında kalır.
        </p>
        <div className="gameover-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              run({ type: 'DISMISS_VICTORY' });
              run({ type: 'SET_SPEED', speed: 1 });
            }}
          >
            Serbest oyuna devam
          </button>
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            Yeni imparatorluk kur
          </button>
        </div>
      </div>
    </div>
  );
}
