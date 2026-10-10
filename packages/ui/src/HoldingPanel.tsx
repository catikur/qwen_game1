import { useState } from 'react';
import type { ReactElement } from 'react';
import { CITY_SIZES, HOLDING } from '@capital/content';
import type { CitySizeId } from '@capital/content';
import {
  carriedBrand,
  cityNameAt,
  cityTrend,
  cityValue,
  formatMoney,
  getPlayer,
  holdingNetWorth,
  openCityQuote,
  remoteIncome,
} from '@capital/core';
import type { GameState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';

/**
 * Holding paneli (Tur 22): şehirler, kasa ve yeni şehir.
 *
 * Panel üç soruyu cevaplıyor: holding'in toplamda ne değerde, bekleyen
 * şehirler kasaya günde ne getiriyor, ve yeni bir şehre açılırsam yanımda
 * ne gider. Sonuncusu kararın kendisi: sermaye bu şehrin kasasından çıkıyor
 * ve bu şehir bekliyor.
 */
export function HoldingPanel(): ReactElement {
  const state = useGameState();
  const holding = state.holding;

  return (
    <div className="holding">
      <p className="muted">{t('hud.holding.blurb', { share: Math.round(HOLDING.remoteShare * 100) })}</p>
      {holding && (
        <div className="holding-stats">
          <HoldingStat label={t('hud.holding.stat.total')} value={formatMoney(holdingNetWorth(state))} />
          <HoldingStat label={t('hud.holding.stat.treasury')} value={formatMoney(holding.treasury)} />
          <HoldingStat label={t('hud.holding.stat.remote')} value={formatMoney(remoteIncome(state))} />
        </div>
      )}
      <CityList state={state} />
      {holding && <TransferForm state={state} />}
      <OpenCityForm state={state} />
    </div>
  );
}

function HoldingStat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function CityList({ state }: { state: GameState }): ReactElement {
  const { run, toast } = useGame();
  const player = getPlayer(state);
  const dormant = state.holding?.dormant ?? [];

  return (
    <ul className="city-list">
      <li className="city-row current" data-city="current">
        <div className="city-head">
          <strong>{state.cityName ?? cityNameAt(state.meta.seed, 0)}</strong>
          <span className="city-tag">{t('hud.holding.current')}</span>
        </div>
        <span className="muted">
          {t('hud.holding.cityLine', { day: state.time.day, worth: formatMoney(player.netWorth) })} ·{' '}
          {t('hud.holding.createdLine', { value: formatMoney(cityValue(state)) })}
        </span>
      </li>
      {dormant.map((city, index) => {
        const other = city.state;
        const lost = Boolean(other.gameOver);
        const otherPlayer = other.companies[other.playerCompanyId]!;
        const name = other.cityName ?? '';
        return (
          <li key={name || index} className={lost ? 'city-row lost' : 'city-row'} data-city={name}>
            <div className="city-head">
              <strong>{name}</strong>
              <span className="city-tag">{lost ? t('hud.holding.lost') : t('hud.holding.waiting')}</span>
            </div>
            <span className="muted">
              {t('hud.holding.cityLine', { day: other.time.day, worth: formatMoney(otherPlayer.netWorth) })}
              {!lost && (
                <>
                  {' · '}
                  {t('hud.holding.flowLine', { flow: formatMoney(Math.max(0, city.trend) * HOLDING.remoteShare) })}
                </>
              )}
            </span>
            <button
              type="button"
              className="ghost city-switch"
              onClick={() => {
                if (run({ type: 'SWITCH_CITY', index })) toast(t('hud.holding.switched', { name }), 'good');
              }}
            >
              {t('hud.holding.switch')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TransferForm({ state }: { state: GameState }): ReactElement | null {
  const { run } = useGame();
  const [amount, setAmount] = useState(0);
  const holding = state.holding;
  if (!holding || state.gameOver) return null;
  const player = getPlayer(state);
  const toCityMax = Math.floor(holding.treasury);
  const toHoldingMax = Math.floor(Math.max(0, player.cash));
  const max = Math.max(toCityMax, toHoldingMax);
  if (max <= 0) return null;
  const step = Math.max(10_000, Math.round(max / 200 / 10_000) * 10_000);
  const value = Math.min(amount, max);

  return (
    <section className="defense holding-transfer">
      <div className="defense-head">
        <h3>{t('hud.holding.transfer.title')}</h3>
      </div>
      <p className="muted">{t('hud.holding.transfer.blurb')}</p>
      <label className="bank-amount">
        <span>
          {t('hud.holding.transfer.amount')} <strong>{formatMoney(value)}</strong>
        </span>
        <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => setAmount(Number(e.target.value))} />
      </label>
      <div className="holding-actions">
        <button
          type="button"
          className="ghost"
          disabled={value <= 0 || value > toCityMax}
          data-transfer="to-city"
          onClick={() => {
            if (run({ type: 'HOLDING_TRANSFER', amount: value })) setAmount(0);
          }}
        >
          {t('hud.holding.transfer.toCity')}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={value <= 0 || value > toHoldingMax}
          data-transfer="to-holding"
          onClick={() => {
            if (run({ type: 'HOLDING_TRANSFER', amount: -value })) setAmount(0);
          }}
        >
          {t('hud.holding.transfer.toHolding')}
        </button>
      </div>
    </section>
  );
}

function OpenCityForm({ state }: { state: GameState }): ReactElement | null {
  const { run, toast, setView } = useGame();
  const [size, setSize] = useState<CitySizeId>('standard');
  const [wanted, setWanted] = useState<number | null>(null);
  const quote = openCityQuote(state);
  if (state.league) return null;
  const player = getPlayer(state);
  const min = HOLDING.minCapital;
  const capital = quote.ok ? Math.max(min, Math.min(quote.maxCapital, wanted ?? Math.round(quote.maxCapital / 4))) : 0;
  const step = Math.max(10_000, Math.round((quote.maxCapital - min) / 200 / 10_000) * 10_000);

  return (
    <section className="defense holding-open" data-open-city={quote.ok ? 'open' : 'closed'}>
      <div className="defense-head">
        <h3>{t('hud.holding.open.title', { name: quote.name })}</h3>
      </div>
      {quote.ok ? (
        <>
          <p className="muted">{t('hud.holding.open.blurb')}</p>
          <span className="muted">{t('hud.holding.open.size')}</span>
          <div className="difficulty-picker mode-picker" role="radiogroup" aria-label={t('hud.holding.open.size')}>
            {CITY_SIZES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === size}
                className={`difficulty-option${option.id === size ? ' selected' : ''}`}
                data-holding-size={option.id}
                onClick={() => setSize(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <label className="bank-amount">
            <span>
              {t('hud.holding.open.capital')} <strong>{formatMoney(capital)}</strong>
            </span>
            <input
              type="range"
              min={min}
              max={quote.maxCapital}
              step={step}
              value={capital}
              onChange={(e) => setWanted(Number(e.target.value))}
            />
          </label>
          <p className="muted bank-terms">
            {t('hud.holding.open.terms', {
              brand: Math.round(carriedBrand(state) * 100),
              left: formatMoney(player.cash - capital),
            })}
          </p>
          <button
            type="button"
            className="primary"
            data-open-city-go
            onClick={() => {
              if (run({ type: 'OPEN_CITY', citySize: size, capital })) {
                toast(t('hud.holding.open.done', { name: quote.name }), 'good');
                setView({ openPanel: 'none', selectedTileId: null, ghostDefId: null });
              }
            }}
          >
            {t('hud.holding.open.go', { name: quote.name })}
          </button>
        </>
      ) : (
        <p className="muted">{quote.reason}</p>
      )}
    </section>
  );
}

/** Üst bardaki şehir adı — holding varken panele açılan düğme. */
export function CityChip(): ReactElement | null {
  const state = useGameState();
  const { view, setView } = useGame();
  if (!state.holding || !state.cityName) return null;
  return (
    <button
      type="button"
      className="brand-city"
      data-city-chip
      title={t('hud.holding.chipTitle')}
      onClick={() => setView({ openPanel: view.openPanel === 'cities' ? 'none' : 'cities' })}
    >
      {state.cityName}
    </button>
  );
}

/** Bekleyen şehirlerin günlük kâr eğilimi — oyun sonu ekranının "holding ayakta" satırı için. */
export function aliveDormant(state: GameState): Array<{ index: number; name: string; trend: number }> {
  return (state.holding?.dormant ?? [])
    .map((city, index) => ({ index, name: city.state.cityName ?? '', trend: cityTrend(city.state), lost: Boolean(city.state.gameOver) }))
    .filter((city) => !city.lost)
    .map(({ index, name, trend }) => ({ index, name, trend }));
}
