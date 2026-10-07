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
        <span className="tag bad">Talep</span>
        <strong>Sendika {pct(demand.raise, 1)} zam istiyor</strong>
        <span className="agenda-days">{left}g</span>
      </header>
      <p className="muted">
        Cevapsız kalırsa Ret sayılır. Grev: {LABOR.strikeDays} gün mağazalar ve fabrikalar {pct(LABOR.strikeCapacity)}{' '}
        kapasite; sonunda {pct(demand.raise * LABOR.strikeSettlement, 1)} zamla sözleşme.
      </p>
      <div className="labor-choices" role="group" aria-label="Sendikaya cevap">
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'accept' })}>
          <span className="labor-choice-title">Kabul</span>
          <span className="muted">ücretler +{pct(demand.raise, 1)}</span>
        </button>
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'compromise' })}>
          <span className="labor-choice-title">Uzlaşma</span>
          <span className="muted">
            {pct(offer, 1)} teklif · tutma {pct(compromiseOdds(state, labor))}
          </span>
        </button>
        <button type="button" onClick={() => run({ type: 'RESPOND_UNION', response: 'reject' })}>
          <span className="labor-choice-title">Ret</span>
          <span className="muted">grev ihtimali {pct(strikeOdds(labor))}</span>
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
      <h3 id="labor-title">İşgücü</h3>
      <div className="statgrid small">
        <div className="stat">
          <span className="stat-label">Çalışan</span>
          <span className="stat-value">{employees.toLocaleString('tr-TR')}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Ücret/gün</span>
          <span className="stat-value">{formatMoney(player.today.wages)}</span>
        </div>
        <div className="stat" title="Bölgelerin iş piyasası (çalışan ağırlıklı) × toplu sözleşmeler">
          <span className="stat-label">Piyasa · sözleşme</span>
          <span className="stat-value">
            ×{index.toFixed(2)} · ×{(labor?.agreement ?? 1).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="labor-policy" role="group" aria-label="Ücret politikası">
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
        {cooldown > 0 && ` Yeniden değiştirmek için ${cooldown} gün.`}
      </p>

      {strike ? (
        <p className="labor-strike" data-labor="strike">
          <span className="tag bad">Grev</span> {strikeLeft} gün kaldı · kapasite {pct(LABOR.strikeCapacity)} · sonunda{' '}
          {pct(strike.raise, 1)} zam
        </p>
      ) : labor?.demand ? (
        <UnionDemandCard labor={labor} />
      ) : (
        <div className="labor-pressure">
          <div className="labor-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pressure * 100)} aria-label="Sendika baskısı">
            <span style={{ width: `${Math.round(pressure * 100)}%` }} className={pressure >= 0.75 ? 'hot' : undefined} />
          </div>
          <span className="muted">
            {employees < LABOR.minEmployees
              ? `${LABOR.minEmployees} çalışanın altında sendika yok.`
              : `Sendika baskısı ${pct(pressure)} — dolunca zam talebi gelir.`}
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
      <div className="labor-policy" role="group" aria-label="Kredi türü">
        <button type="button" aria-pressed={kind === 'term'} onClick={() => setKind('term')}>
          Vadeli
        </button>
        <button type="button" aria-pressed={kind === 'secured'} onClick={() => setKind('secured')}>
          Arsa teminatlı
        </button>
        <button type="button" aria-pressed={bond} onClick={() => setKind('bond')}>
          Tahvil
        </button>
      </div>
      <div className="labor-policy" role="group" aria-label="Vade">
        {terms.map((option) => (
          <button key={option.days} type="button" aria-pressed={days === option.days} onClick={() => setTermDays(option.days)}>
            {option.days} gün
          </button>
        ))}
      </div>
      {quote.ok ? (
        <>
          <label className="bank-amount">
            <span>
              Tutar <strong>{formatMoney(amount)}</strong> <span className="muted">/ en fazla {formatMoney(quote.max)}</span>
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
            Yıllık {pct(quote.rate, 1)} · {bond ? 'kupon' : 'taksit'} {formatMoney(payment)}/gün · toplam faiz{' '}
            {formatMoney(totalInterest)}
            {kind === 'secured' && ` · rehne açık arsa ${formatMoney(quote.collateralValue ?? 0)}`}
          </p>
          {bond && (
            <p className="muted bank-terms">
              Anapara {days}. günde tek seferde: {formatMoney(amount)}. O gün kasada yoksa fark kredili hesaba geçer.
            </p>
          )}
          <p className="muted bank-terms">
            Dosya masrafı %{CREDIT.originationFee * 100} · sonraki başvuru {CREDIT.applyCooldownDays} gün sonra · not D'ye
            düşersen krediler muaccel olur.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (run({ type: 'TAKE_LOAN', kind, amount, termDays: days })) setWanted(null);
            }}
          >
            {bond ? 'Tahvil ihraç et' : 'Krediyi çek'}
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
      <h3 id="bank-title">Banka</h3>
      <div className="bank-head">
        <span className={`bank-rating rating-${rating}`} title={CREDIT_RATINGS[rating].blurb}>
          {rating}
        </span>
        <div className="statgrid small">
          <div className="stat">
            <span className="stat-label">Kaldıraç</span>
            <span className="stat-value">{pct(leverage)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Kredili hesap</span>
            <span className={overdraft > 0 ? 'stat-value neg' : 'stat-value'}>
              {formatMoney(overdraft)} <span className="muted">/ {formatMoney(limit)}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Faiz/gün</span>
            <span className="stat-value">{formatMoney(dailyInterest(state, player))}</span>
          </div>
        </div>
      </div>
      <p className="muted">
        {CREDIT_RATINGS[rating].blurb} Kasa eksiye düşerse kredili hesap devreye girer (yıllık{' '}
        {pct(overdraftRate(state, player), 0)}); kasaya giren para önce onu kapatır.
      </p>
      {arrears > 0 && (
        <p className="bank-warning" data-bank="arrears">
          <span className="tag bad">İhtar</span> {Math.max(0, CREDIT.graceDays - arrears + 1)} gün içinde kredili hesabı{' '}
          {formatMoney(limit)} altına indir; yoksa haciz başlar.
        </p>
      )}

      {loans.length > 0 && (
        <div className="table-scroll">
          <table className="table bank-loans">
            <thead>
              <tr>
                <th>Kredi</th>
                <th>Kalan</th>
                <th>Faiz</th>
                <th>Taksit/gün</th>
                <th>Bitiş</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => (
                <tr key={loan.id}>
                  <td>
                    {loan.kind === 'secured'
                      ? `Teminatlı · ${loan.collateral?.length ?? 0} arsa`
                      : loan.kind === 'bond'
                        ? 'Tahvil · vadede tek ödeme'
                        : 'Vadeli'}
                  </td>
                  <td>{formatMoney(loan.balance)}</td>
                  <td>{pct(loan.rate, 1)}</td>
                  <td>{formatMoney(loan.payment)}</td>
                  <td>{Math.max(0, loan.startDay + loan.termDays - state.time.day)}g</td>
                  <td>
                    <button
                      type="button"
                      disabled={player.cash < loan.balance}
                      onClick={() => run({ type: 'REPAY_LOAN', loanId: loan.id })}
                    >
                      Kapat
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
