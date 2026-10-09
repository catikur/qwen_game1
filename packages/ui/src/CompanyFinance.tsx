import { useState } from 'react';
import type { ReactElement } from 'react';
import { CREDIT, CREDIT_RATINGS, LABOR, WAGE_POLICIES } from '@capital/content';
import type { LoanKind, WagePolicy } from '@capital/content';
import {
  annuityPayment,
  compromiseOdds,
  creditEnabled,
  dailyInterest,
  formatMoney,
  getPlayer,
  grossAssets,
  laborEnabled,
  loanQuote,
  loansOf,
  overdraftLimit,
  overdraftOf,
  overdraftRate,
  ratingOf,
  strikeOdds,
  workforce,
} from '@capital/core';
import type { LaborState } from '@capital/core';
import { t } from './i18n';
import { useGame, useGameState } from './useGame';

/**
 * Şirket panelinin iki yeni bölümü: İşgücü ve Banka.
 *
 * İkisi de aynı ilkeyle çiziliyor: her karar düğmesinin yanında SONUCU
 * yazıyor. "Uzlaşma" düğmesi tutma ihtimalini, "Ret" grev ihtimalini,
 * kredi formu günlük taksiti ve toplam faizi gösteriyor — oyuncu bir
 * zarı değil bir bedeli seçiyor.
 */

function pct(rate: number, digits = 0): string {
  const value = (rate * 100).toFixed(digits);
  return `%${value.replace('.', ',')}`;
}

const POLICY_ORDER: WagePolicy[] = ['low', 'market', 'high'];

function UnionDemandCard({ labor }: { labor: LaborState }): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  const demand = labor.demand;
  if (!demand) return null;
  const left = Math.max(0, demand.deadlineDay - state.time.day);
  const offer = demand.raise * LABOR.compromiseShare;
  return (
    <article className="labor-demand" data-labor="demand">
      <header>
        <span className="tag bad">{t('finance.labor.demand.tag')}</span>
        <strong>{t('finance.labor.demand.title', { raise: pct(demand.raise, 1) })}</strong>
        <span className="agenda-days">{t('finance.labor.demand.daysLeft', { days: left })}</span>
      </header>
      <p className="muted">
        {t('finance.labor.demand.terms', {
          days: LABOR.strikeDays,
          capacity: pct(LABOR.strikeCapacity),
          raise: pct(demand.raise * LABOR.strikeSettlement, 1),
        })}
      </p>
      <div className="labor-choices" role="group" aria-label={t('finance.labor.demand.ariaLabel')}>
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'accept' })}>
          <span className="labor-choice-title">{t('finance.labor.demand.accept')}</span>
          <span className="muted">{t('finance.labor.demand.acceptEffect', { raise: pct(demand.raise, 1) })}</span>
        </button>
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'compromise' })}>
          <span className="labor-choice-title">{t('finance.labor.demand.compromise')}</span>
          <span className="muted">
            {t('finance.labor.demand.compromiseEffect', { offer: pct(offer, 1), odds: pct(compromiseOdds(state, labor)) })}
          </span>
        </button>
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'reject' })}>
          <span className="labor-choice-title">{t('finance.labor.demand.reject')}</span>
          <span className="muted">{t('finance.labor.demand.rejectEffect', { odds: pct(strikeOdds(labor)) })}</span>
        </button>
      </div>
    </article>
  );
}

export function WorkforceSection(): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  if (!laborEnabled(state)) return null;
  const player = getPlayer(state);
  const labor = player.labor;
  const { employees, index } = workforce(state, player.id);
  const policy = labor?.policy ?? 'market';
  const sinceChange = labor?.policyDay !== undefined ? state.time.day - labor.policyDay : Number.POSITIVE_INFINITY;
  const cooldown = Math.max(0, LABOR.policyCooldownDays - sinceChange);
  const pressure = labor?.pressure ?? 0;
  const strike = labor?.strike;
  const strikeLeft = strike ? strike.endsOnDay - state.time.day + 1 : 0;

  return (
    <section className="labor" aria-labelledby="labor-title">
      <h3 id="labor-title">{t('finance.labor.title')}</h3>
      <div className="statgrid small">
        <div className="stat">
          <span className="stat-label">{t('finance.labor.stat.employees')}</span>
          <span className="stat-value">{employees.toLocaleString('tr-TR')}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('finance.labor.stat.wages')}</span>
          <span className="stat-value">{formatMoney(player.today.wages)}</span>
        </div>
        <div className="stat" title={t('finance.labor.stat.indexTitle')}>
          <span className="stat-label">{t('finance.labor.stat.index')}</span>
          <span className="stat-value">
            ×{index.toFixed(2)} · ×{(labor?.agreement ?? 1).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="labor-policy" role="group" aria-label={t('finance.labor.policy.ariaLabel')}>
        {POLICY_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={policy === id}
            disabled={policy !== id && cooldown > 0}
            onClick={() => policy !== id && run({ type: 'SET_WAGE_POLICY', policy: id })}
          >
            {WAGE_POLICIES[id].name}
          </button>
        ))}
      </div>
      <p className="muted labor-blurb">
        {WAGE_POLICIES[policy].blurb}
        {cooldown > 0 && t('finance.labor.policy.cooldown', { days: cooldown })}
      </p>

      {strike ? (
        <p className="labor-strike" data-labor="strike">
          <span className="tag bad">{t('finance.labor.strike.tag')}</span>{' '}
          {t('finance.labor.strike.status', {
            days: strikeLeft,
            capacity: pct(LABOR.strikeCapacity),
            raise: pct(strike.raise, 1),
          })}
        </p>
      ) : labor?.demand ? (
        <UnionDemandCard labor={labor} />
      ) : (
        <div className="labor-pressure">
          <div className="labor-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pressure * 100)} aria-label={t('finance.labor.pressure.ariaLabel')}>
            <span style={{ width: `${Math.round(pressure * 100)}%` }} className={pressure >= 0.75 ? 'hot' : undefined} />
          </div>
          <span className="muted">
            {employees < LABOR.minEmployees
              ? t('finance.labor.pressure.noUnion', { min: LABOR.minEmployees })
              : t('finance.labor.pressure.level', { pressure: pct(pressure) })}
          </span>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------ banka

function LoanForm(): ReactElement {
  const state = useGameState();
  const { run } = useGame();
  const player = getPlayer(state);
  const [kind, setKind] = useState<LoanKind>('term');
  const [termDays, setTermDays] = useState(360);
  const [wanted, setWanted] = useState<number | null>(null);
  const bond = kind === 'bond';
  const terms = bond ? CREDIT.bond.terms : CREDIT.terms;
  // Tür değişince vade listesi değişir; listede olmayan vade ilkine düşer.
  const days = terms.some((option) => option.days === termDays) ? termDays : terms[0]!.days;
  const quote = loanQuote(state, player.id, kind, days);
  const floor = bond ? CREDIT.bond.minAmount : CREDIT.minLoan;
  const amount = Math.max(floor, Math.min(quote.max, wanted ?? quote.max));
  // Tahvil yalnızca kupon öder: toplam faiz kupon × vade, anapara vadede.
  const payment = bond ? (amount * quote.rate) / 365 : annuityPayment(amount, quote.rate, days);
  const totalInterest = bond ? payment * days : payment * days - amount;

  return (
    <div className="bank-form">
      <div className="labor-policy" role="group" aria-label={t('finance.bank.loanForm.kindAriaLabel')}>
        <button type="button" aria-pressed={kind === 'term'} onClick={() => setKind('term')}>
          {t('finance.bank.loanForm.kind.term')}
        </button>
        <button type="button" aria-pressed={kind === 'secured'} onClick={() => setKind('secured')}>
          {t('finance.bank.loanForm.kind.secured')}
        </button>
        <button type="button" aria-pressed={bond} onClick={() => setKind('bond')}>
          {t('finance.bank.loanForm.kind.bond')}
        </button>
      </div>
      <div className="labor-policy" role="group" aria-label={t('finance.bank.loanForm.termAriaLabel')}>
        {terms.map((option) => (
          <button key={option.days} type="button" aria-pressed={days === option.days} onClick={() => setTermDays(option.days)}>
            {t('finance.bank.loanForm.termDays', { days: option.days })}
          </button>
        ))}
      </div>
      {quote.ok ? (
        <>
          <label className="bank-amount">
            <span>
              {t('finance.bank.loanForm.amount')} <strong>{formatMoney(amount)}</strong>{' '}
              <span className="muted">{t('finance.bank.loanForm.max', { max: formatMoney(quote.max) })}</span>
            </span>
            <input
              type="range"
              min={floor}
              max={quote.max}
              step={bond ? 50_000 : 10_000}
              value={amount}
              onChange={(event) => setWanted(Number(event.target.value))}
            />
          </label>
          <p className="muted bank-terms">
            {t('finance.bank.loanForm.terms', {
              rate: pct(quote.rate, 1),
              payKind: bond ? t('finance.bank.loanForm.coupon') : t('finance.bank.loanForm.installment'),
              payment: formatMoney(payment),
              total: formatMoney(totalInterest),
            })}
            {kind === 'secured' &&
              t('finance.bank.loanForm.collateral', { value: formatMoney(quote.collateralValue ?? 0) })}
          </p>
          {bond && (
            <p className="muted bank-terms">
              {t('finance.bank.loanForm.bondPrincipal', { day: days, amount: formatMoney(amount) })}
            </p>
          )}
          <p className="muted bank-terms">
            {t('finance.bank.loanForm.fees', { fee: CREDIT.originationFee * 100, days: CREDIT.applyCooldownDays })}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (run({ type: 'TAKE_LOAN', kind, amount, termDays: days })) setWanted(null);
            }}
          >
            {bond ? t('finance.bank.loanForm.issueBond') : t('finance.bank.loanForm.takeLoan')}
          </button>
        </>
      ) : (
        <p className="muted">{quote.reason}</p>
      )}
    </div>
  );
}

export function BankSection(): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  if (!creditEnabled(state)) return null;
  const player = getPlayer(state);
  const rating = ratingOf(player);
  const gross = grossAssets(player);
  const leverage = gross > 0 ? player.debt / gross : 0;
  const overdraft = overdraftOf(player);
  const limit = overdraftLimit(player);
  const loans = loansOf(player);
  const arrears = player.credit?.arrearsDays ?? 0;

  return (
    <section className="bank" aria-labelledby="bank-title">
      <h3 id="bank-title">{t('finance.bank.title')}</h3>
      <div className="bank-head">
        <span className={`bank-rating rating-${rating}`} title={CREDIT_RATINGS[rating].blurb}>
          {rating}
        </span>
        <div className="statgrid small">
          <div className="stat">
            <span className="stat-label">{t('finance.bank.stat.leverage')}</span>
            <span className="stat-value">{pct(leverage)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('finance.bank.stat.overdraft')}</span>
            <span className={overdraft > 0 ? 'stat-value neg' : 'stat-value'}>
              {formatMoney(overdraft)} <span className="muted">/ {formatMoney(limit)}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">{t('finance.bank.stat.interest')}</span>
            <span className="stat-value">{formatMoney(dailyInterest(state, player))}</span>
          </div>
        </div>
      </div>
      <p className="muted">
        {CREDIT_RATINGS[rating].blurb}{' '}
        {t('finance.bank.overdraftInfo', { rate: pct(overdraftRate(state, player), 0) })}
      </p>
      {arrears > 0 && (
        <p className="bank-warning" data-bank="arrears">
          <span className="tag bad">{t('finance.bank.arrears.tag')}</span>{' '}
          {t('finance.bank.arrears.warning', {
            days: Math.max(0, CREDIT.graceDays - arrears + 1),
            limit: formatMoney(limit),
          })}
        </p>
      )}

      {loans.length > 0 && (
        <div className="table-scroll">
          <table className="table bank-loans">
            <thead>
              <tr>
                <th>{t('finance.bank.loans.loan')}</th>
                <th>{t('finance.bank.loans.balance')}</th>
                <th>{t('finance.bank.loans.rate')}</th>
                <th>{t('finance.bank.loans.payment')}</th>
                <th>{t('finance.bank.loans.ends')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td>
                    {loan.kind === 'secured'
                      ? t('finance.bank.loans.kind.secured', { count: loan.collateral?.length ?? 0 })
                      : loan.kind === 'bond'
                        ? t('finance.bank.loans.kind.bond')
                        : t('finance.bank.loans.kind.term')}
                  </td>
                  <td>{formatMoney(loan.balance)}</td>
                  <td>{pct(loan.rate, 1)}</td>
                  <td>{formatMoney(loan.payment)}</td>
                  <td>
                    {t('finance.bank.loans.daysLeft', { days: Math.max(0, loan.startDay + loan.termDays - state.time.day) })}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={player.cash < loan.balance}
                      onClick={() => run({ type: 'REPAY_LOAN', loanId: loan.id })}
                    >
                      {t('finance.bank.loans.repay')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LoanForm />
    </section>
  );
}
