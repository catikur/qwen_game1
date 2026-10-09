import type { ReactElement } from 'react';
import { COUNCIL } from '@capital/content';
import { formatMoney, getPlayer, motionSupport } from '@capital/core';
import type { MotionState } from '@capital/core';
import { t } from './i18n';
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
        aria-label={t('finance.council.support.ariaLabel')}
      >
        <span className="council-bar-fill" style={{ width: `${percent}%` }} />
        <span className="council-bar-base" style={{ left: `${Math.round(breakdown.base * 100)}%` }} title={t('finance.council.support.baseTitle')} />
        <span className="council-bar-half" aria-hidden="true" />
      </div>
      <div className="council-support-text">
        <span className={breakdown.support >= 0.5 ? 'pos' : 'neg'}>{t('finance.council.support.percent', { percent })}</span>
        <span className="muted">
          {t('finance.council.support.status', {
            status: breakdown.support >= 0.5 ? t('finance.council.support.passing') : t('finance.council.support.failing'),
            base: Math.round(breakdown.base * 100),
          })}
        </span>
      </div>
    </div>
  );
}

function LobbyList({ motion }: { motion: MotionState }): ReactElement | null {
  const state = useGameState();
  const { contributions } = motionSupport(motion);
  if (contributions.length === 0) return <p className="muted council-empty">{t('finance.council.lobby.empty')}</p>;
  return (
    <ul className="council-lobby">
      {contributions.map((entry) => {
        const company = state.companies[entry.companyId];
        return (
          <li key={entry.companyId}>
            <span className="council-who">
              <span className="swatch" style={{ background: company?.color ?? 'currentColor' }} aria-hidden="true" />
              {company?.name ?? t('finance.council.lobby.someCompany')}
            </span>
            <span className={entry.delta >= 0 ? 'pos' : 'neg'}>
              {t('finance.council.lobby.entry', {
                side: entry.delta >= 0 ? t('finance.council.lobby.for') : t('finance.council.lobby.against'),
                spent: formatMoney(entry.spent),
                sign: entry.delta >= 0 ? '+' : '−',
                points: Math.abs(Math.round(entry.delta * 100)),
              })}
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
          {t('finance.council.session.open', { days: session.voteDay - state.time.day })}
        </p>
      ) : (
        <p className="muted">
          {t('finance.council.session.closed', {
            when: council
              ? t('finance.council.session.inDays', { days: Math.max(0, council.nextSessionDay - state.time.day) })
              : t('finance.council.session.onDay', { day: COUNCIL.firstSessionDay }),
            days: COUNCIL.lobbyWindowDays,
          })}
        </p>
      )}

      {session?.motions.map((motion) => (
        <article key={motion.id} className="council-motion" data-motion={motion.kind}>
          <h3>{motion.title}</h3>
          <p className="council-summary">{motion.summary}</p>
          <SupportBar motion={motion} />
          <div className="council-actions" role="group" aria-label={t('finance.council.motion.lobbyAriaLabel', { title: motion.title })}>
            {(['for', 'against'] as const).map((side) => (
              <div key={side} className="council-side">
                <span className="agenda-label">{side === 'for' ? t('finance.council.motion.for') : t('finance.council.motion.against')}</span>
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
          <h3>{t('finance.council.policies.title')}</h3>
          <ul>
            {state.policies!.map((policy) => (
              <li key={`${policy.title}-${policy.untilDay}`}>
                {policy.title}{' '}
                <span className="muted">{t('finance.council.policies.remaining', { days: policy.untilDay - state.time.day })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(council?.history.length ?? 0) > 0 && (
        <section className="council-history">
          <h3>{t('finance.council.history.title')}</h3>
          <ul>
            {council!.history.map((motion) => (
              <li key={motion.id}>
                <span className={motion.result?.passed ? 'tag good' : 'tag'}>
                  {motion.result?.passed ? t('finance.council.history.passed') : t('finance.council.history.rejected')}
                </span>{' '}
                {motion.title}{' '}
                <span className="muted">
                  {t('finance.council.history.detail', {
                    support: Math.round((motion.result?.support ?? 0) * 100),
                    day: motion.result?.day ?? '',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
