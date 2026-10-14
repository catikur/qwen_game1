import { useState } from 'react';
import type { ReactElement } from 'react';
import { CITY_SIZES, HOLDING } from '@capital/content';
import type { CitySizeId } from '@capital/content';
import {
  buybackToLock,
  carriedBrand,
  cityDirective,
  cityDividend,
  cityNameAt,
  cityTrend,
  cityValue,
  formatMoney,
  getPlayer,
  holdingLadder,
  holdingNetWorth,
  openCityQuote,
  raidStatus,
  remoteIncome,
  sharePrice,
} from '@capital/core';
import type { DormantCity, GameState, RemotePayout } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';

/**
 * Holding paneli (Tur 22): şehirler, kasa ve yeni şehir.
 *
 * Panel üç soruyu cevaplıyor: holding'in toplamda ne değerde, uzaktaki
 * şehirler kasaya günde ne getiriyor (ve orada bir baskın var mı), ve yeni
 * bir şehre açılırsam yanımda ne gider. Sonuncusu kararın kendisi: sermaye
 * bu şehrin kasasından çıkıyor. Tur 30'dan beri uzaktaki şehirler yaşıyor;
 * satır dünkü gerçek kâr payını ve %10'u geçen baskını gösteriyor.
 *
 * Tur 32: uzaktaki her şehrin satırında yerel müdürün talimatı (kâr payı,
 * savunma) — geçiş yapmadan. Kasa uzaktaki şehre de aktarılıyor. Üstte
 * holding'in hedef merdiveni; kaybedilen şehir kapatılabiliyor.
 */
export function HoldingPanel(): ReactElement {
  const state = useGameState();
  const holding = state.holding;

  return (
    <div className="holding">
      <p className="muted">{t('hud.holding.blurb')}</p>
      {holding && (
        <div className="holding-stats">
          <HoldingStat label={t('hud.holding.stat.total')} value={formatMoney(holdingNetWorth(state))} />
          <HoldingStat label={t('hud.holding.stat.treasury')} value={formatMoney(holding.treasury)} />
          <HoldingStat label={t('hud.holding.stat.remote')} value={formatMoney(remoteIncome(state))} />
        </div>
      )}
      <HoldingLadder state={state} />
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

/** Holding hedefleri: dört basamak, sırayla (Tur 32). */
function HoldingLadder({ state }: { state: GameState }): ReactElement {
  const steps = holdingLadder(state);
  const done = steps.filter((step) => step.done).length;
  const completed = state.holding?.completedDay;
  return (
    <section className="defense holding-ladder" data-holding-ladder={done}>
      <div className="defense-head">
        <h3>{t('hud.holding.ladder.title')}</h3>
        <span className="muted">
          {completed !== undefined
            ? t('hud.holding.ladder.complete', { day: completed })
            : t('hud.holding.ladder.progress', { done, total: steps.length })}
        </span>
      </div>
      <ol className="ladder-steps">
        {steps.map((step, index) => (
          <li key={step.id} className={step.done ? 'done' : undefined} data-step={step.id} data-done={step.done ? 'yes' : 'no'}>
            <span className="ladder-mark" aria-hidden="true">
              {step.done ? '✓' : index + 1}
            </span>
            <span>{t(`hud.holding.ladder.${step.id}`)}</span>
            <span className="muted ladder-count">
              {step.count} / {step.target}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
        const raid = lost ? null : raidStatus(other);
        const raider = raid?.holderId ? other.companies[raid.holderId] : undefined;
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
                  {t('hud.holding.flowLine', { flow: formatMoney(cityDividend(city)) })}
                </>
              )}
            </span>
            {raid && raid.stage >= 1 && raider && (
              <span className="city-raid" data-city-raid={raid.stage}>
                {t('hud.holding.raidLine', { name: raider.name, percent: Math.round(raid.fraction * 100) })}
              </span>
            )}
            {lost ? (
              <>
                <span className="muted city-note">{t('hud.holding.closeHint')}</span>
                <button
                  type="button"
                  className="ghost city-switch"
                  data-close-city={index}
                  onClick={() => {
                    if (run({ type: 'CLOSE_CITY', index })) toast(t('hud.holding.closed', { name }), 'good');
                  }}
                >
                  {t('hud.holding.close')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="ghost city-switch"
                onClick={() => {
                  if (run({ type: 'SWITCH_CITY', index })) toast(t('hud.holding.switched', { name }), 'good');
                }}
              >
                {t('hud.holding.switch')}
              </button>
            )}
            {!lost && <CityDirectiveControls city={city} index={index} />}
          </li>
        );
      })}
    </ul>
  );
}

const PAYOUTS: readonly RemotePayout[] = ['keep', 'half', 'all'];

/** Uzaktaki şehrin talimatı: kâr payı ve savunma (Tur 32). */
function CityDirectiveControls({ city, index }: { city: DormantCity; index: number }): ReactElement {
  const { run } = useGame();
  const directive = cityDirective(city.state);
  const name = city.state.cityName ?? '';
  return (
    <div className="city-directive" data-city-directive={index}>
      <span className="muted">{t('hud.holding.payout.title')}</span>
      <div className="difficulty-picker mode-picker" role="radiogroup" aria-label={t('hud.holding.payout.aria', { name })}>
        {PAYOUTS.map((payout) => (
          <button
            key={payout}
            type="button"
            role="radio"
            aria-checked={payout === directive.payout}
            className={`difficulty-option${payout === directive.payout ? ' selected' : ''}`}
            data-payout={payout}
            onClick={() => run({ type: 'SET_CITY_DIRECTIVE', index, payout })}
          >
            {t(`hud.holding.payout.${payout}`)}
          </button>
        ))}
      </div>
      <p className="muted">{t(`hud.holding.payout.${directive.payout}Hint`)}</p>
      <label className="city-defend">
        <input
          type="checkbox"
          checked={directive.defend}
          data-defend={index}
          onChange={(e) => run({ type: 'SET_CITY_DIRECTIVE', index, defend: e.target.checked })}
        />
        <span>{t('hud.holding.defense.toggle')}</span>
      </label>
      <p className="muted" data-defense-line>
        {defenseLine(city)}
      </p>
    </div>
  );
}

/** Savunmanın durumu tek cümleyle: ne yaptı, ne bekliyor, kilide ne kaldı. */
function defenseLine(city: DormantCity): string {
  const s = city.state;
  const me = s.companies[s.playerCompanyId]!;
  const directive = cityDirective(s);
  const raid = raidStatus(s);
  const toLock = buybackToLock(s, me.id);
  const lockCost = Number.isFinite(toLock) ? toLock * sharePrice(s, me.id) : null;
  const remaining =
    toLock > 0 && lockCost !== null ? ' ' + t('hud.holding.defense.toLock', { shares: toLock, cost: formatMoney(lockCost) }) : '';
  if (city.lastDefense) {
    return t('hud.holding.defense.yesterday', { shares: city.lastDefense.shares, cost: formatMoney(city.lastDefense.cost) }) + remaining;
  }
  if (toLock === 0) return t('hud.holding.defense.locked');
  if (!directive.defend) {
    return raid.fraction >= HOLDING.defendAt ? t('hud.holding.defense.offUnderRaid') + remaining : t('hud.holding.defense.offHint');
  }
  if (raid.fraction < HOLDING.defendAt) {
    return t('hud.holding.defense.waiting', { percent: Math.round(HOLDING.defendAt * 100) });
  }
  return t('hud.holding.defense.noCash', { reserve: formatMoney(HOLDING.defenseReserve) }) + remaining;
}

function TransferForm({ state }: { state: GameState }): ReactElement | null {
  const { run } = useGame();
  const [amount, setAmount] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const holding = state.holding;
  if (!holding) return null;
  // Hedefler: oynanan şehir (kaybedilmediyse) ve ayakta olan uzak şehirler.
  const targets: Array<{ index: number | null; name: string; city: GameState }> = [];
  if (!state.gameOver) targets.push({ index: null, name: state.cityName ?? '', city: state });
  holding.dormant.forEach((dormant, index) => {
    if (!dormant.state.gameOver) targets.push({ index, name: dormant.state.cityName ?? '', city: dormant.state });
  });
  const chosen = targets.find((option) => option.index === target) ?? targets[0];
  if (!chosen) return null;
  const player = chosen.city.companies[chosen.city.playerCompanyId]!;
  const toCityMax = Math.floor(holding.treasury);
  const toHoldingMax = Math.floor(Math.max(0, player.cash));
  const max = Math.max(toCityMax, toHoldingMax);
  const step = Math.max(10_000, Math.round(max / 200 / 10_000) * 10_000);
  const value = Math.min(amount, max);
  const command = (signed: number) =>
    chosen.index === null
      ? ({ type: 'HOLDING_TRANSFER', amount: signed } as const)
      : ({ type: 'HOLDING_TRANSFER', amount: signed, index: chosen.index } as const);

  return (
    <section className="defense holding-transfer">
      <div className="defense-head">
        <h3>{t('hud.holding.transfer.title')}</h3>
      </div>
      <p className="muted">{t('hud.holding.transfer.blurb')}</p>
      {targets.length > 1 && (
        <div className="difficulty-picker mode-picker" role="radiogroup" aria-label={t('hud.holding.transfer.target')}>
          {targets.map((option) => (
            <button
              key={option.index ?? 'current'}
              type="button"
              role="radio"
              aria-checked={option === chosen}
              className={`difficulty-option${option === chosen ? ' selected' : ''}`}
              data-transfer-target={option.index ?? 'current'}
              onClick={() => {
                setTarget(option.index);
                setAmount(0);
              }}
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
      {max <= 0 ? (
        <p className="muted">{t('hud.holding.transfer.empty')}</p>
      ) : (
        <>
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
                if (run(command(value))) setAmount(0);
              }}
            >
              {t('hud.holding.transfer.toCity', { name: chosen.name })}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={value <= 0 || value > toHoldingMax}
              data-transfer="to-holding"
              onClick={() => {
                if (run(command(-value))) setAmount(0);
              }}
            >
              {t('hud.holding.transfer.toHolding', { name: chosen.name })}
            </button>
          </div>
        </>
      )}
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
