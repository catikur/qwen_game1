import type { ReactElement } from 'react';
import { COUNCIL } from '@capital/content';
import { formatMoney, getPlayer, motionSupport } from '@capital/core';
import type { MotionState } from '@capital/core';
import { useGame, useGameState } from './useGame';

/**
 * Belediye meclisi paneli.
 *
 * Açık önergeler: ne değiştireceği, bugünkü destek (meclisin eğilimi +
 * lobi) ve kimin hangi tarafta ne kadar bağış yaptığı. Bağışlar kamuya
 * açık — rakibin karşı lobisini görmek, cevap vermenin ön koşulu.
 *
 * Tutar düğmeleri nakde ölçekli değil sabit üç kademe: azalan verim
 * kuralını (√) oyuncunun kendisi hissetsin diye — ilk 50 bin destek
 * çubuğunu belirgin kıpırdatır, dördüncü 250 bin daha az.
 */
const AMOUNTS = [50_000, 250_000, 1_000_000];

function SupportBar({ motion }: { motion: MotionState }): ReactElement {
  const breakdown = motionSupport(motion);
  const percent = Math.round(breakdown.support * 100);
  return (
    <div className="council-support">
      <div
        className="council-bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Destek"
      >
        <span className="council-bar-fill" style={{ width: `${percent}%` }} />
        <span className="council-bar-base" style={{ left: `${Math.round(breakdown.base * 100)}%` }} title="Meclisin kendi eğilimi" />
        <span className="council-bar-half" aria-hidden="true" />
      </div>
      <div className="council-support-text">
        <span className={breakdown.support >= 0.5 ? 'pos' : 'neg'}>%{percent} destek</span>
        <span className="muted">
          {breakdown.support >= 0.5 ? 'şu an geçiyor' : 'şu an reddediliyor'} · eğilim %{Math.round(breakdown.base * 100)}
        </span>
      </div>
    </div>
  );
}

function LobbyList({ motion }: { motion: MotionState }): ReactElement | null {
  const state = useGameState();
  const { contributions } = motionSupport(motion);
  if (contributions.length === 0) return <p className="muted council-empty">Henüz bağış yok.</p>;
  return (
    <ul className="council-lobby">
      {contributions.map((entry) => {
        const company = state.companies[entry.companyId];
        return (
          <li key={entry.companyId}>
            <span className="council-who">
              <span className="swatch" style={{ background: company?.color ?? 'currentColor' }} aria-hidden="true" />
              {company?.name ?? 'Bir şirket'}
            </span>
            <span className={entry.delta >= 0 ? 'pos' : 'neg'}>
              {entry.delta >= 0 ? 'lehte' : 'aleyhte'} {formatMoney(entry.spent)} · {entry.delta >= 0 ? '+' : '−'}
              {Math.abs(Math.round(entry.delta * 100))} puan
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function CouncilPanel(): ReactElement {
  const state = useGameState();
  const { run } = useGame();
  const player = getPlayer(state);
  const council = state.council;
  const session = council?.session ?? null;

  return (
    <div className="council">
      {session ? (
        <p className="muted">
          Oylama {session.voteDay - state.time.day} gün sonra. Destek %50'yi geçen önerge kabul edilir; bağış geri
          alınmaz ve herkes görür.
        </p>
      ) : (
        <p className="muted">
          Meclis şu an toplantıda değil. Sıradaki oturum{' '}
          {council ? `${Math.max(0, council.nextSessionDay - state.time.day)} gün sonra` : `${COUNCIL.firstSessionDay}. günde`}
          ; önergeler açıklanınca {COUNCIL.lobbyWindowDays} gün lobi yapılabilir.
        </p>
      )}

      {session?.motions.map((motion) => (
        <article key={motion.id} className="council-motion" data-motion={motion.kind}>
          <h3>{motion.title}</h3>
          <p className="council-summary">{motion.summary}</p>
          <SupportBar motion={motion} />
          <div className="council-actions" role="group" aria-label={`${motion.title} için bağış`}>
            {(['for', 'against'] as const).map((side) => (
              <div key={side} className="council-side">
                <span className="agenda-label">{side === 'for' ? 'Lehte' : 'Aleyhte'}</span>
                {AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={side === 'for' ? 'council-give for' : 'council-give against'}
                    disabled={amount > player.cash}
                    onClick={() => run({ type: 'LOBBY', motionId: motion.id, side, amount })}
                  >
                    {formatMoney(amount)}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <LobbyList motion={motion} />
        </article>
      ))}

      {(state.policies?.length ?? 0) > 0 && (
        <section className="council-policies">
          <h3>Yürürlükte</h3>
          <ul>
            {state.policies!.map((policy) => (
              <li key={`${policy.title}-${policy.untilDay}`}>
                {policy.title} <span className="muted">· {policy.untilDay - state.time.day} gün</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(council?.history.length ?? 0) > 0 && (
        <section className="council-history">
          <h3>Son kararlar</h3>
          <ul>
            {council!.history.map((motion) => (
              <li key={motion.id}>
                <span className={motion.result?.passed ? 'tag good' : 'tag'}>
                  {motion.result?.passed ? 'Kabul' : 'Ret'}
                </span>{' '}
                {motion.title}{' '}
                <span className="muted">
                  · %{Math.round((motion.result?.support ?? 0) * 100)} · {motion.result?.day}. gün
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
