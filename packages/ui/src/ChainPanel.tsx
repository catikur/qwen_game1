import type { ReactElement } from 'react';
import { chainCards, formatMoney, getPlayer, tilePrice } from '@capital/core';
import type { ChainCard, ChainMove, ChainSlot } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';

/**
 * Birim ekonomisi kuruşla okunur.
 *
 * `formatMoney` bin ve milyon ölçeği için; burada ₺2,80 ile ₺3,40
 * arasındaki fark kararın kendisi olduğu için yuvarlanamaz.
 */
function unit(value: number): string {
  return `₺${value.toFixed(2)}`;
}

/**
 * Zincir paneli.
 *
 * Oyunun "sofistike simülasyon, casual oynanış" sözünün tutulduğu yer.
 * Arkada dönen şey stok, arz oranı, spot fiyat ve kapasite kısıtı;
 * oyuncunun gördüğü şey dört kutu, dört durum ve tek bir buton.
 *
 * Yalnızca SATTIĞIN ürünler listelenir. Hiçbir şey satmıyorsan panel
 * seni bir tabloyla değil, ne yapman gerektiğini söyleyen tek bir
 * cümleyle karşılar.
 */
export function ChainPanel(): ReactElement {
  const state = useGameState();
  const player = getPlayer(state);
  const cards = chainCards(state, player.id);

  if (cards.length === 0) {
    return (
      <p className="muted">{t('app.chain.empty')}</p>
    );
  }

  return (
    <div className="chains">
      {cards.map((card) => (
        <ChainCardView key={card.goodId} card={card} />
      ))}
    </div>
  );
}

function ChainCardView({ card }: { card: ChainCard }): ReactElement {
  return (
    <section className="chain" aria-label={t('app.chain.cardLabel', { good: card.goodName })}>
      <header className="chain-head">
        <span className="chain-title">
          <span className="chain-dot" style={{ background: card.color }} />
          {card.goodName}
        </span>
        <span className="chain-meta">
          {t('app.chain.meta', { unit: unit(card.unitCost), sale: unit(card.salePrice) })}{' '}
          <strong className={card.margin >= 0.3 ? 'pos' : card.margin >= 0 ? '' : 'neg'}>
            %{Math.round(card.margin * 100)}
          </strong>{' '}
          {t('app.chain.share', { share: Math.round(card.marketShare * 100) })}
        </span>
      </header>

      <ol className="chain-slots">
        {card.slots.map((slot, index) => (
          <li key={slot.kind + index}>
            <SlotView slot={slot} />
          </li>
        ))}
      </ol>

      {card.move ? <MoveView card={card} move={card.move} /> : <SettledView card={card} />}
    </section>
  );
}

function SlotView({ slot }: { slot: ChainSlot }): ReactElement {
  return (
    <div className={`chain-slot state-${slot.state}`}>
      <span className="chain-state">{slot.stateLabel}</span>
      <span className="chain-name">{slot.label}</span>
      <span className="chain-detail">{slot.detail}</span>
      {slot.ratio > 0 && slot.ratio < 1 && (
        <span className="chain-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(slot.ratio * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

/**
 * Karttaki tek karar.
 *
 * Tıklayınca parseli satın alıp binayı kurar — oyuncu haritada doğru
 * bölgeyi arayıp bulmak zorunda kalmaz. Kurulacak yer ve fiyat butonun
 * altında yazılı, yani hamle sürpriz olmuyor.
 */
function MoveView({ card, move }: { card: ChainCard; move: ChainMove }): ReactElement {
  const { run, toast, setView } = useGame();
  const state = useGameState();

  const landPrice = tilePrice(state, move.tileId, state.playerCompanyId);
  const total = move.cost + landPrice;
  const player = getPlayer(state);
  const canPay = player.cash >= total;

  const build = (): void => {
    // Parsel doluysa önce sahibinden devralınır — oyuncunun elle yaptığı
    // iki adımın aynısı, aynı fiyattan.
    const acquired = move.needsBuyout
      ? run({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : run({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired) return;
    if (!run({ type: 'BUILD', tileId: move.tileId, defId: move.defId })) return;
    toast(t('app.chain.built', { name: move.name, district: move.districtName }), 'good');
    setView({ selectedTileId: move.tileId });
  };

  // İki bekleme hali de aynı gri stili giyer; ayrım metinde. Buton yine
  // de çalışır durumda: kart tavsiye verir, karar oyuncunundur.
  const waiting = move.premature || move.deferred;

  return (
    <div className={waiting ? 'chain-move early' : 'chain-move'}>
      <p className="chain-reason">{move.reason}</p>
      <div className="chain-action">
        <button
          type="button"
          className={waiting ? '' : 'primary'}
          onClick={build}
          disabled={!canPay}
        >
          {t('app.chain.buildButton', { name: move.name, cost: formatMoney(total) })}
        </button>
        <span className="chain-gain">
          {move.districtName}
          {move.needsBuyout && t('app.chain.buyout')}
          {t('app.chain.gain', { days: Math.round(move.paybackDays), margin: Math.round(card.margin * 100) })}{' '}
          <strong className="pos">%{Math.round(move.projectedMargin * 100)}</strong>
        </span>
      </div>
      {move.premature && (
        <p className="chain-early">{t('app.chain.premature')}</p>
      )}
      {!move.premature && move.deferred && (
        <p className="chain-early">{t('app.chain.deferred')}</p>
      )}
      {!canPay && <p className="chain-warn">{t('app.chain.noCash', { cost: formatMoney(total) })}</p>}
    </div>
  );
}

/**
 * Hamle yoksa neden yok.
 *
 * Sessiz bir "hamle yok" oyuncuya zincirin bittiğini sandırıyordu; oysa
 * sebep çoğu zaman geçici: sermaye yetmiyor ya da sanayide parsel kalmamış.
 */
function SettledView({ card }: { card: ChainCard }): ReactElement {
  if (card.blocked) return <p className="chain-settled">{card.blocked}</p>;

  const complete = card.slots.every((slot) => slot.state === 'own' || slot.kind === 'distribution');
  return (
    <p className="chain-settled">
      {complete
        ? t('app.chain.settled.complete')
        : t('app.chain.settled.idle')}
    </p>
  );
}
