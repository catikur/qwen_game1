import type { ReactElement } from 'react';
import { BUILDING_BY_ID, ENERGY, formatDecimal, formatPercent } from '@capital/content';
import { energyPrice, formatMoney, fuelCost, fuelLock, fuelLockQuote } from '@capital/core';
import { t } from './i18n';
import { useGame, useGameState } from './useGame';
import './i18n/playTr';

/**
 * Santralin masası (Tur 57): güç, kimlere verdiği, şebeke fiyatı, yakıt.
 *
 * Sahibinin binalarına verdiği enerji o binaların bakımından düşüyor;
 * santralin defterinde yalnız rakiplere satış ve yakıt var. Masa ikisini
 * yan yana söylüyor, yoksa santral "zararda" görünürdü. Doğalgazda yakıtı
 * sabitleme düğmesi burada; gündemdeki çip enerji krizi uyarısında buraya
 * getiriyor.
 */
export function PowerDesk({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const plant = state.buildings[buildingId];
  const def = plant ? BUILDING_BY_ID[plant.defId] : undefined;
  if (!plant || !def || def.role !== 'energy') return null;

  const today = plant.last.plant;
  const used = today ? today.ownMwh + today.rivalMwh : 0;
  const capacity = today?.capacity ?? def.power ?? 0;
  const price = energyPrice(state);
  const lock = def.fuel ? fuelLock(state, plant.companyId) : null;
  const totals = plant.energyTotals;
  const mwh = (value: number): string => formatDecimal(value, Number.isInteger(value) ? 0 : 1);

  return (
    <div className="power-desk" data-power-desk={plant.id}>
      <h4>{t('panels.power.title')}</h4>
      <div className="statgrid small">
        <div className="stat">
          <span className="stat-label">{t('panels.power.output')}</span>
          <span className="stat-value" data-power-used={`${Math.round(used * 10) / 10}/${Math.round(capacity * 10) / 10}`}>
            {t('panels.power.mwh', { used: mwh(used), capacity: mwh(capacity) })}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.power.price')}</span>
          <span className={`stat-value${price > 1 ? ' neg' : price < 1 ? ' pos' : ''}`} data-energy-price={price.toFixed(2)}>
            {t('panels.power.perMwh', { price: formatMoney(ENERGY.unitPrice * price) })}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.power.fuel')}</span>
          <span className="stat-value">
            {def.fuel ? t('panels.power.perMwh', { price: formatMoney(fuelCost(state, plant, def, price)) }) : t('panels.power.noFuel')}
          </span>
        </div>
      </div>

      {today && today.buildings > 0 ? (
        <ul className="power-customers">
          <li data-power-own={Math.round(today.saved)}>
            {t('panels.power.own', { mwh: mwh(today.ownMwh), saved: formatMoney(today.saved) })}
          </li>
          <li data-power-sold={Math.round(plant.last.revenue)}>
            {t('panels.power.rival', { mwh: mwh(today.rivalMwh), sold: formatMoney(plant.last.revenue) })}
          </li>
        </ul>
      ) : (
        <p className="muted" data-power-idle>
          {t('panels.power.idle')}
        </p>
      )}

      {totals && (
        <p className="muted" data-energy-totals={Math.round(totals.sold + totals.saved - totals.fuel)}>
          {t('panels.power.totals', { sold: formatMoney(totals.sold), saved: formatMoney(totals.saved), fuel: formatMoney(totals.fuel) })}
        </p>
      )}

      {def.fuel ? (
        lock ? (
          <p className="power-lock" data-fuel-locked={lock.untilDay - state.time.day}>
            {t('panels.power.locked', { price: formatMoney(ENERGY.unitPrice * lock.price), days: lock.untilDay - state.time.day })}
          </p>
        ) : (
          <div className="manual-actions">
            <button type="button" onClick={() => run({ type: 'LOCK_FUEL' })} data-fuel-lock>
              {t('panels.power.lock', { price: formatMoney(ENERGY.unitPrice * fuelLockQuote(state)), days: ENERGY.lockDays })}
            </button>
          </div>
        )
      ) : null}

      <p className="muted">
        {t('panels.power.note', {
          discount: formatPercent(Math.round(ENERGY.rivalDiscount * 100)),
          premium: formatPercent(Math.round(ENERGY.lockPremium * 100)),
        })}
      </p>
    </div>
  );
}
