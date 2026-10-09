import { useState } from 'react';
import type { ReactElement } from 'react';
import { ISSUANCE } from '@capital/content';
import {
  CONTROL_THRESHOLD,
  capRemaining,
  confidence,
  dailyBuyCap,
  findOrder,
  formatMoney,
  freeFloat,
  getPlayer,
  issuanceEnabled,
  issueNetWorthEffect,
  issueQuote,
  marketCap,
  orderEstimate,
  ownerFraction,
  portfolioValue,
  sharePrice,
  sharesHeld,
  sharesOutstanding,
} from '@capital/core';
import type { CompanyState, GameState } from '@capital/core';
import { t } from './i18n';
import { useGame, useGameState } from './useGame';

/**
 * Borsa paneli.
 *
 * Turun vaadi tek cümle: **rakibini pazarda değil sahiplikte yenmek.**
 * Panelin işi o cümleyi tek bir tabloda okutmak — hisse fiyatı, güven,
 * senin payın ve kontrole ne kadar kaldığı.
 *
 * Fiyat türetilmiştir (`değer × güven`), simüle edilmiş bir piyasa
 * gürültüsü değil. Bu bilinçli: oyuncu "neden düştü" diye sorduğunda
 * cevabı hep aynı yerde — şirketin kârı düşmüş.
 */
export function MarketPanel(): ReactElement {
  const state = useGameState();
  const player = getPlayer(state);

  const others = Object.values(state.companies).filter((c) => c.id !== player.id);
  if (others.length === 0) {
    return (
      <p className="muted">{t('finance.market.empty')}</p>
    );
  }

  const portfolio = portfolioValue(state, player.id);

  return (
    <div className="bourse">
      <div className="statgrid small">
        <Stat label={t('finance.market.stat.cash')} value={formatMoney(player.cash)} />
        <Stat label={t('finance.market.stat.portfolio')} value={formatMoney(portfolio)} />
        <Stat label={t('finance.market.stat.netWorth')} value={formatMoney(player.netWorth)} />
      </div>

      <Defense state={state} />
      <Issuance state={state} />

      <p className="muted">
        {t('finance.market.controlRule', { threshold: Math.round(CONTROL_THRESHOLD * 100) })}
      </p>

      <div className="bourse-list">
        {others
          .sort((a, b) => marketCap(state, b.id) - marketCap(state, a.id))
          .map((company) => (
            <Listing key={company.id} company={company} state={state} />
          ))}
      </div>
    </div>
  );
}


/**
 * Kendi hissenin durumu — borsanın savunma tarafı.
 *
 * Rakipler artık oyuncunun hissesini toplayabiliyor; bu blok "kim, ne
 * kadar" sorusunun tek adresi. Geri alım düğmesi `BUY_SHARES`in kendisi:
 * savunma için ayrı bir mekanik yok, aynı piyasa iki yönde de çalışıyor.
 *
 * Tehdit yokken tek satırlık bir özet. Blok yalnızca biri gerçekten pay
 * topladığında büyür — panel her gün "saldırı yok" diye bağırmamalı.
 */
function Defense({ state }: { state: GameState }): ReactElement {
  const { run, toast } = useGame();
  const player = getPlayer(state);

  const price = sharePrice(state, player.id);
  const treasury = sharesHeld(state, player.id, player.id);
  const float = freeFloat(state, player.id);

  let topHolder: CompanyState | null = null;
  let topCount = 0;
  for (const company of Object.values(state.companies)) {
    if (company.id === player.id) continue;
    const count = sharesHeld(state, company.id, player.id);
    if (count > topCount) {
      topCount = count;
      topHolder = company;
    }
  }
  const percent = (topCount / sharesOutstanding(state, player.id)) * 100;

  const buyback = (count: number): void => {
    if (count <= 0) return;
    if (run({ type: 'BUY_SHARES', companyId: player.id, count })) {
      toast(t('finance.market.defense.buybackDone', { count, cost: formatMoney(count * price) }), 'good');
    }
  };
  // Geri alım da günlük tavanlı (Tur 20) — rakibin savunması gibi. Tek
  // tık bugünün tavanını kullanır; kalan yarına.
  const affordable = Math.min(capRemaining(state, player.id, player.id), Math.floor(player.cash / Math.max(1, price)), float);

  return (
    <div className={topCount > 0 ? 'defense threatened' : 'defense'}>
      <div className="defense-head">
        <h3>{t('finance.market.defense.title')}</h3>
        <span className="muted">
          {t('finance.market.defense.summary', { float, treasury, price: formatMoney(price) })}
        </span>
      </div>
      {topHolder ? (
        <div className="defense-threat">
          <span>
            <strong>{topHolder.name}</strong>{' '}
            {t('finance.market.defense.threat', {
              percent: percent.toFixed(1),
              threshold: Math.round(CONTROL_THRESHOLD * 100),
            })}
          </span>
          <button type="button" disabled={affordable <= 0} onClick={() => buyback(affordable)}>
            {affordable > 0
              ? t('finance.market.defense.buyback', { count: affordable })
              : t('finance.market.defense.capFull')}
          </button>
        </div>
      ) : (
        <p className="muted">{t('finance.market.defense.noThreat')}</p>
      )}
    </div>
  );
}

/**
 * Sermaye artırımı — ilki halka arz.
 *
 * Formun işi bedeli sayıyla göstermek: kasaya girecek nakit, kurucu
 * payının nereye ineceği ve net değerin ihraç günü ne yapacağı. Piyasa
 * primliyken (güven yüksek) son satır artı, iskontoluyken eksi — oyuncu
 * zamanlamayı bu satırdan okur.
 */
function Issuance({ state }: { state: GameState }): ReactElement | null {
  const { run, toast } = useGame();
  const [wanted, setWanted] = useState<number | null>(null);
  if (!issuanceEnabled(state)) return null;
  const player = getPlayer(state);
  const quote = issueQuote(state, player.id);
  const outstanding = sharesOutstanding(state, player.id);
  const investors = player.investorShares ?? 0;
  const founder = ownerFraction(player);
  const count = Math.max(ISSUANCE.minShares, Math.min(quote.maxShares, wanted ?? quote.maxShares));
  const raised = count * quote.price;
  const effect = issueNetWorthEffect(state, player.id, count);
  const founderAfter = 1 - (investors + count) / (outstanding + count);
  const title = quote.ipo ? t('finance.market.issuance.title.ipo') : t('finance.market.issuance.title.rights');

  return (
    <section className="defense issuance" data-issuance={quote.ok ? 'open' : 'closed'}>
      <div className="defense-head">
        <h3>{title}</h3>
        <span className="muted">
          {t('finance.market.issuance.summary', {
            outstanding: outstanding.toLocaleString('tr-TR'),
            founder: Math.round(founder * 100),
          })}
        </span>
      </div>
      <p className="muted">{t('finance.market.issuance.blurb')}</p>
      {quote.ok && quote.defense && (
        <p className="issuance-defense" data-issuance-defense="on">
          {t('finance.market.issuance.defense', {
            threshold: Math.round(ISSUANCE.defenseAt * 100),
            cooldown: ISSUANCE.cooldownDays,
            floor: Math.round(ISSUANCE.minFounderShare * 100),
          })}
        </p>
      )}
      {quote.ok ? (
        <>
          <label className="bank-amount">
            <span>
              <strong>{count.toLocaleString('tr-TR')}</strong> {t('finance.market.issuance.newShares')}{' '}
              <span className="muted">
                {t('finance.market.issuance.max', { max: quote.maxShares.toLocaleString('tr-TR') })}
              </span>
            </span>
            <input
              type="range"
              min={ISSUANCE.minShares}
              max={quote.maxShares}
              step={50}
              value={count}
              onChange={(event) => setWanted(Number(event.target.value))}
            />
          </label>
          <p className="muted bank-terms">
            {t('finance.market.issuance.terms', {
              price: formatMoney(quote.price),
              discount: Math.round(ISSUANCE.discount * 100),
              raised: formatMoney(raised),
              founder: Math.round(founder * 100),
              founderAfter: Math.round(founderAfter * 100),
            })}{' '}
            <span className={effect >= 0 ? 'pos' : 'neg'}>
              {effect >= 0 ? '+' : '−'}
              {formatMoney(Math.abs(effect))}
            </span>
          </p>
          <button
            type="button"
            className="primary issue-go"
            onClick={() => {
              if (run({ type: 'ISSUE_SHARES', count })) {
                toast(t('finance.market.issuance.done', { title, amount: formatMoney(raised) }), 'good');
                setWanted(null);
              }
            }}
          >
            {quote.ipo ? t('finance.market.issuance.go.ipo') : t('finance.market.issuance.go.rights')}
          </button>
        </>
      ) : (
        <p className="muted">{quote.reason}</p>
      )}
    </section>
  );
}

function Listing({ company, state }: { company: CompanyState; state: GameState }): ReactElement {
  const { run, toast } = useGame();
  const [amount, setAmount] = useState<string>('');

  const player = getPlayer(state);
  const price = sharePrice(state, company.id);
  const held = sharesHeld(state, player.id, company.id);
  const outstanding = sharesOutstanding(state, company.id);
  const stake = held / outstanding;
  const available = freeFloat(state, company.id);
  const trust = confidence(state, company.id);

  /** Kontrole kaç hisse kaldı. */
  const toControl = Math.max(0, Math.floor(outstanding * CONTROL_THRESHOLD) + 1 - held);
  const controlCost = toControl * price;
  // Kurucu kilidinde hisse piyasada değil (oyun başı rakipler ısınma
  // süresince, yeni gelenler bir yıl).
  const lockedDays =
    company.lockedUntilDay !== undefined ? Math.max(0, company.lockedUntilDay - state.time.day) : 0;
  const affordable =
    lockedDays > 0 ? 0 : Math.min(available, Math.floor(player.cash / Math.max(1, price)));
  const investors = company.investorShares ?? 0;
  // Günlük tavan (Tur 20): rakiplerin baskını gibi oyuncunun alımı da.
  const cap = dailyBuyCap(state, company.id);
  const capLeft = capRemaining(state, player.id, company.id);
  const buyable = Math.min(affordable, capLeft);
  const order = findOrder(state, player.id, company.id);
  const estimate = orderEstimate(state, player.id, company.id);
  const orderBlock =
    toControl === 0
      ? t('finance.market.order.block.controlled')
      : lockedDays > 0
        ? t('finance.market.order.block.locked')
        : estimate.floatShort
          ? t('finance.market.order.block.floatShort', {
              available: available.toLocaleString('tr-TR'),
              needed: toControl.toLocaleString('tr-TR'),
            })
          : null;

  const trade = (type: 'BUY_SHARES' | 'SELL_SHARES', count: number): void => {
    if (count <= 0) return;
    if (run({ type, companyId: company.id, count })) {
      toast(
        type === 'BUY_SHARES'
          ? t('finance.market.trade.bought', { count, cost: formatMoney(count * price) })
          : t('finance.market.trade.sold', { count, cost: formatMoney(count * price) }),
        'good',
      );
      setAmount('');
    }
  };

  const placeOrder = (): void => {
    if (run({ type: 'PLACE_TAKEOVER_ORDER', companyId: company.id })) {
      toast(t('finance.market.order.placed', { name: company.name, cap: cap.toLocaleString('tr-TR') }), 'good');
    }
  };
  const cancelOrder = (): void => {
    if (run({ type: 'CANCEL_TAKEOVER_ORDER', companyId: company.id })) {
      toast(t('finance.market.order.cancelled'), 'info');
    }
  };

  return (
    <section
      className="bourse-row"
      aria-label={t('finance.market.listing.ariaLabel', { name: company.name })}
      data-company={company.id}
      data-order={order ? 'active' : undefined}
    >
      <header className="bourse-head">
        <span className="bourse-name">
          <span className="chain-dot" style={{ background: company.color }} />
          {company.name}
        </span>
        <span className="bourse-price">
          {price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
          {/* Güven fiyatın NEDEN o olduğunu söylüyor. Tek başına bir sayı
              olsaydı oyuncu "pahalı mı ucuz mu" sorusuna cevap bulamazdı. */}
          <span className={trust >= 1 ? 'bourse-trust pos' : 'bourse-trust neg'}>
            {trust >= 1 ? t('finance.market.listing.premium') : t('finance.market.listing.discount')} ×{trust.toFixed(2)}
          </span>
        </span>
      </header>

      <div className="bourse-meta">
        <span>{t('finance.market.listing.value', { value: formatMoney(marketCap(state, company.id)) })}</span>
        <span>{t('finance.market.listing.profit', { profit: formatMoney(company.today.profit) })}</span>
        <span>{t('finance.market.listing.float', { count: available.toLocaleString('tr-TR') })}</span>
        {investors > 0 && (
          <span>{t('finance.market.listing.investors', { percent: Math.round((investors / outstanding) * 100) })}</span>
        )}
      </div>
      {lockedDays > 0 && (
        <p className="muted bourse-locked" data-locked={lockedDays}>
          {t('finance.market.listing.locked', { days: lockedDays })}
        </p>
      )}

      {/* Kontrol göstergesi: payın ve eşik. Çubuk süs değil, "ne kadar
          kaldı" sorusunun cevabı. */}
      <div className="bourse-stake">
        <span className="bourse-bar" aria-hidden="true">
          <span className="bourse-bar-fill" style={{ width: `${Math.min(100, stake * 100)}%` }} />
          <span className="bourse-bar-mark" style={{ left: `${CONTROL_THRESHOLD * 100}%` }} />
        </span>
        <span className="bourse-stake-text">
          {t('finance.market.listing.stake')} <strong>%{(stake * 100).toFixed(1)}</strong>
          {stake > CONTROL_THRESHOLD
            ? t('finance.market.listing.stakeControlled')
            : t('finance.market.listing.stakeToControl', {
                count: toControl.toLocaleString('tr-TR'),
                cost: formatMoney(controlCost),
              })}
        </span>
      </div>

      {/* Süren emir: ilerleme yukarıdaki çubukta, burada durum ve iptal. */}
      {order && (
        <div className={order.waitingCash ? 'bourse-order waiting' : 'bourse-order'}>
          <span>
            <strong>{t('finance.market.order.title')}</strong> ·{' '}
            {t('finance.market.order.progress', {
              day: order.placedDay,
              remaining: toControl.toLocaleString('tr-TR'),
              days: estimate.days,
            })}
            {order.waitingCash ? t('finance.market.order.waitingCash') : ''}
          </span>
          <button type="button" className="order-cancel" onClick={cancelOrder}>
            {t('finance.market.order.cancel')}
          </button>
        </div>
      )}

      <div className="bourse-actions">
        <button
          type="button"
          disabled={buyable < 100}
          onClick={() => trade('BUY_SHARES', 100)}
        >
          {t('finance.market.trade.buyLot', { count: 100, cost: formatMoney(100 * price) })}
        </button>
        {!order && (
          <button
            type="button"
            className={orderBlock === null && controlCost <= player.cash ? 'primary order-go' : 'order-go'}
            disabled={orderBlock !== null}
            title={orderBlock ?? t('finance.market.order.hint', { cap: cap.toLocaleString('tr-TR') })}
            onClick={placeOrder}
          >
            {toControl === 0
              ? t('finance.market.order.controlled')
              : t('finance.market.order.go', { days: estimate.days })}
          </button>
        )}
        <label className="auction-custom">
          <input
            type="number"
            min={1}
            max={Math.max(1, buyable)}
            step={50}
            value={amount}
            placeholder={t('finance.market.trade.amountPlaceholder')}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={lockedDays > 0 || Number(amount) <= 0 || Number(amount) > buyable}
            onClick={() => trade('BUY_SHARES', Number(amount))}
          >
            {t('finance.market.trade.buy')}
          </button>
          <button
            type="button"
            disabled={held <= 0 || Number(amount) <= 0 || Number(amount) > held}
            onClick={() => trade('SELL_SHARES', Number(amount))}
          >
            {t('finance.market.trade.sell')}
          </button>
        </label>
      </div>
      <p className="muted bourse-cap" data-cap-left={capLeft}>
        {t('finance.market.cap.summary', { cap: cap.toLocaleString('tr-TR'), left: capLeft.toLocaleString('tr-TR') })}
        {orderBlock && toControl > 0 && lockedDays === 0 ? ` · ${orderBlock}` : ''}
      </p>

      {held > 0 && (
        <p className="muted">
          {t('finance.market.listing.holding', { count: held.toLocaleString('tr-TR'), value: formatMoney(held * price) })}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
