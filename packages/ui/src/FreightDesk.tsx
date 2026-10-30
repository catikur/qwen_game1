import { useState } from 'react';
import type { ReactElement } from 'react';
import { BUILDING_BY_ID, formatPercent } from '@capital/content';
import { FREIGHT, FREIGHT_SHARE, fleetUsed, formatMoney, freightPenalty, freightProspects, freightStanding, getPlayer, reliefOf } from '@capital/core';
import type { FreightDeal } from '@capital/core';
import { t } from './i18n';
import './i18n/tradeTr';
import './i18n/playTr';
import { useGame, useGameState } from './useGame';

/**
 * Terminalin taşıma masası (Tur 56): filo, masadaki teklifler, süren
 * sözleşmeler.
 *
 * Teklif gündemde de görünüyor ama karar burada: hangi terminalden, kaç
 * kamyonla, kime taşıdığın ancak terminalin yanında okunuyor. Sözleşmeyi
 * bitirmek iki adımda, cayma bedeli düğmenin üstünde yazıyor.
 */
export function FreightDesk({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const [ending, setEnding] = useState<string | null>(null);
  const terminal = state.buildings[buildingId];
  const def = terminal ? BUILDING_BY_ID[terminal.defId] : undefined;
  if (!terminal || !def?.fleet) return null;

  const used = fleetUsed(state, terminal.id);
  const contracts = (state.freight?.contracts ?? []).filter((deal) => deal.terminalId === terminal.id);
  const offers = (state.freight?.offers ?? []).filter((deal) => deal.terminalId === terminal.id);
  // Bugünkü ücret terminalin defterinden, toplanan terminalin kendi
  // toplamından: biten sözleşmenin ücreti de sayılıyor (Codex #86).
  // Şehirler arası hattın cirosu (Tur 77) ücret değil.
  const today = terminal.last.revenue - (terminal.last.lineRevenue ?? 0);
  const earned = terminal.freightEarned ?? 0;
  const name = (deal: FreightDeal): string => state.companies[deal.companyId]?.name ?? deal.companyId;
  const color = (deal: FreightDeal): string | undefined => state.companies[deal.companyId]?.color;

  return (
    <div className="freight-desk" data-freight-desk={terminal.id}>
      <h4>{t('panels.freight.title')}</h4>
      <div className="statgrid small">
        <div className="stat">
          <span className="stat-label">{t('panels.freight.fleet')}</span>
          <span className="stat-value" data-freight-fleet={`${used}/${def.fleet}`}>
            {used}/{def.fleet}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.freight.today')}</span>
          <span className="stat-value">{formatMoney(today)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('panels.freight.earned')}</span>
          <span className="stat-value" data-freight-earned={Math.round(earned)}>
            {formatMoney(earned)}
          </span>
        </div>
      </div>
      {(terminal.lineTrucks ?? 0) > 0 && (
        <p className="muted" data-freight-lines={terminal.lineTrucks}>
          {t('trade.freightDesk', { trucks: terminal.lineTrucks ?? 0 })}
        </p>
      )}

      {offers.map((offer) => {
        const left = Math.max(0, offer.offeredDay + FREIGHT.offerLifetimeDays - state.time.day);
        const fits = used + offer.outletIds.length <= def.fleet!;
        // Müşterinin yarıştaki yeri (Tur 61): en yakın rakibe taşımak onu da büyütüyor.
        const client = freightStanding(state, offer);
        const clientLine = client
          ? t(client.challenger ? 'panels.freight.challenger' : 'panels.freight.client', {
              rank: client.rank,
              worth: formatMoney(state.companies[offer.companyId]?.netWorth ?? 0),
              mine: formatMoney(getPlayer(state).netWorth),
              saving: formatMoney(client.saving),
            })
          : null;
        return (
          <div key={offer.id} className="freight-offer" data-freight-offer={offer.id}>
            <p>
              <span className="freight-client" style={{ color: color(offer) }}>
                {name(offer)}
              </span>{' '}
              {t('panels.freight.offer', { count: offer.outletIds.length, fee: formatMoney(offer.estimate), days: offer.durationDays })}
              <span className="muted"> · {t('panels.freight.offerLeft', { days: left })}</span>
            </p>
            {clientLine && (
              <p className={client?.challenger ? 'freight-client-note warn' : 'freight-client-note muted'} data-freight-standing={client?.challenger ? 'challenger' : 'other'}>
                {clientLine}
              </p>
            )}
            <div className="manual-actions">
              <button
                type="button"
                className="primary"
                disabled={!fits}
                onClick={() => run({ type: 'ACCEPT_FREIGHT', offerId: offer.id })}
                data-freight-accept={offer.id}
              >
                {fits ? t('panels.freight.accept') : t('panels.freight.fleetFull')}
              </button>
              <button type="button" className="ghost" onClick={() => run({ type: 'DECLINE_FREIGHT', offerId: offer.id })} data-freight-decline={offer.id}>
                {t('panels.freight.decline')}
              </button>
            </div>
          </div>
        );
      })}

      {contracts.length > 0 && (
        <ul className="freight-contracts">
          {contracts.map((deal) => (
            <li key={deal.id} data-freight-contract={deal.id}>
              <p>
                <span className="freight-client" style={{ color: color(deal) }}>
                  {name(deal)}
                </span>{' '}
                {t('panels.freight.contract', {
                  count: deal.outletIds.length,
                  fee: formatMoney(deal.lastFee ?? 0),
                  days: Math.max(0, (deal.endDay ?? state.time.day) - state.time.day),
                })}
              </p>
              <div className="manual-actions">
                {ending === deal.id ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => run({ type: 'CANCEL_FREIGHT', contractId: deal.id }) && setEnding(null)}
                      data-freight-cancel="confirm"
                    >
                      {t('panels.freight.cancelConfirm', { penalty: formatMoney(freightPenalty(state, deal)) })}
                    </button>
                    <button type="button" className="ghost" onClick={() => setEnding(null)}>
                      {t('panels.freight.keep')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="ghost" onClick={() => setEnding(deal.id)} data-freight-cancel="ask">
                    {t('panels.freight.cancel')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {contracts.length === 0 && offers.length === 0 && (
        <p className="muted" data-freight-prospects>
          {(() => {
            const count = freightProspects(state, terminal).length;
            return count > 0 ? t('panels.freight.waiting', { count }) : t('panels.freight.noProspects');
          })()}
        </p>
      )}
      <p className="muted">
        {t('panels.freight.note', { relief: formatPercent(Math.round(reliefOf(def) * 100)), share: formatPercent(Math.round(FREIGHT_SHARE * 100)) })}
      </p>
    </div>
  );
}
