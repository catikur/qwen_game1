import type { ReactElement } from 'react';
import { BUILDING_BY_ID, REAL_ESTATE, formatDecimal, formatPercent, numberLocale } from '@capital/content';
import { formatMoney, rentalOutlook } from '@capital/core';
import { t } from './i18n';
import { useGame, useGameState } from './useGame';
import './i18n/playTr';

/**
 * Kiralığın masası (Tur 58): kaç birim, ne kadar dolu, bu kirayla nereye
 * gidiyor; oyuncunun kiralığında kira ayarı.
 *
 * Projede doluluk bir durum: kiracılar gün gün geliyor, hedef düşerse gün
 * gün gidiyor. Masa bugünkü dolulukla hedefi yan yana söylüyor, kira
 * düğmelerinin yanında bir adım aşağı ve yukarı neye varacağını da. Kira
 * düşerse hedef yükseliyor; gelirin en yüksek olduğu kira piyasaya bağlı.
 */
export function RentDesk({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const building = state.buildings[buildingId];
  const def = building ? BUILDING_BY_ID[building.defId] : undefined;
  const outlook = rentalOutlook(state, buildingId);
  if (!building || !def || !outlook) return null;

  const isPlayer = building.companyId === state.playerCompanyId;
  const { min, max, step } = REAL_ESTATE.rent;
  const shifted = (delta: number): number | null => {
    const next = Math.round((outlook.rent + delta) * 100) / 100;
    return next < min - 1e-9 || next > max + 1e-9 ? null : next;
  };
  const lower = shifted(-step);
  const higher = shifted(step);
  const pct = (value: number): string => formatPercent(Math.round(value * 100));
  const preview = (rent: number | null): string | null => {
    if (rent === null) return null;
    const next = rentalOutlook(state, buildingId, rent);
    if (!next) return null;
    return t('panels.rent.option', { rent: formatDecimal(rent, 2), target: pct(next.target), income: formatMoney(next.rentAtTarget) });
  };
  const development = building.development;
  const site =
    outlook.opensIn !== null && development
      ? Math.min(1, (state.time.day - building.builtDay) / Math.max(1, development.opensOnDay - building.builtDay))
      : null;

  return (
    <div className="rent-desk" data-rent-desk={building.id}>
      <h4>{t(development ? 'panels.rent.projectTitle' : 'panels.rent.title')}</h4>

      {site !== null && (
        <div className="rent-site" data-opens-in={outlook.opensIn}>
          <p>{t('panels.rent.underConstruction', { days: outlook.opensIn ?? 0 })}</p>
          <span className="bar" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${Math.round(site * 100)}%` }} />
          </span>
          <p className="muted">
            {t('panels.rent.siteNote', {
              share: pct(REAL_ESTATE.siteUpkeep),
              prelease: pct(REAL_ESTATE.prelease[def.category] ?? 0),
            })}
          </p>
        </div>
      )}

      <div className="statgrid small">
        <div className="stat">
          <span className="stat-label">{t('panels.rent.units')}</span>
          <span className="stat-value" data-rent-units={outlook.units}>
            {outlook.units.toLocaleString(numberLocale())}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.rent.occupancy')}</span>
          <span className="stat-value" data-occupancy={Math.round(outlook.occupancy * 100)}>
            {site !== null ? '—' : pct(outlook.occupancy)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.rent.target')}</span>
          <span
            className={`stat-value${outlook.target > outlook.occupancy + 0.005 ? ' pos' : outlook.target < outlook.occupancy - 0.005 ? ' neg' : ''}`}
            data-occupancy-target={Math.round(outlook.target * 100)}
          >
            {pct(outlook.target)}
          </span>
        </div>
      </div>

      {development && site === null && outlook.daysToTarget > 0 && (
        <p className="muted" data-lease-days={outlook.daysToTarget}>
          {t(outlook.target > outlook.occupancy ? 'panels.rent.leasing' : 'panels.rent.movingOut', { days: outlook.daysToTarget })}
        </p>
      )}
      {outlook.rightHolders > 0 && (
        <p className="muted renewal-note" data-right-holders={outlook.rightHolders}>
          {t('panels.rent.rightHolders', {
            count: outlook.rightHolders,
            bonus: pct(REAL_ESTATE.renewal.capacityBonus),
          })}
        </p>
      )}

      {isPlayer && (
        <>
          <div className="rent-control">
            <button
              type="button"
              disabled={lower === null}
              onClick={() => lower !== null && run({ type: 'SET_RENT', buildingId, rent: lower })}
              aria-label={t('panels.rent.lower')}
              data-rent-down
            >
              −
            </button>
            <span className="rent-level" data-rent-level={outlook.rent.toFixed(2)}>
              {t('panels.rent.level', { rent: formatDecimal(outlook.rent, 2), income: formatMoney(outlook.rentAtTarget) })}
            </span>
            <button
              type="button"
              disabled={higher === null}
              onClick={() => higher !== null && run({ type: 'SET_RENT', buildingId, rent: higher })}
              aria-label={t('panels.rent.raise')}
              data-rent-up
            >
              +
            </button>
          </div>
          <p className="muted rent-options">
            {[preview(lower), preview(higher)].filter(Boolean).join(' · ')}
          </p>
        </>
      )}
      <p className="muted">{t('panels.rent.note')}</p>
    </div>
  );
}
