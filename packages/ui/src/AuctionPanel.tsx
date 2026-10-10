import { useState } from 'react';
import { STRUCTURE_BY_ID } from '@capital/content';
import type { ReactElement } from 'react';
import { auctionHint, getPlayer, minimumBid } from '@capital/core';
import { t } from './i18n';
import { useGame, useGameState } from './useGame';

/**
 * İhalede rakam TAM yazılır.
 *
 * `formatMoney` bin ölçeğine yuvarlıyor ve ihalede bu okunmaz oluyordu:
 * "en yüksek teklif 16 B ₺" ile "en az teklifi ver · 16 B ₺" aynı
 * görünüyordu, oysa aradaki 776 ₺ kararın kendisi. Zincir panelinde
 * birim maliyet için aynı kararı vermiştik.
 */
function exact(value: number): string {
  return `${Math.round(value).toLocaleString('tr-TR')} ₺`;
}

/**
 * Parsel ihalesi — çip ve teklif paneli.
 *
 * İhale oyunu DURAKLATMIYOR. Üstte bir çip olarak duruyor, oyuncu
 * ilgilenmezse kendiliğinden sonuçlanıyor. Kaçırılan ihale bir ceza
 * değil, kaçırılmış bir fırsat — `Capitalism.md`'deki "casual oynanış"
 * sözü bunu gerektiriyor.
 *
 * Panelin taşıdığı asıl bilgi rakibin DEĞERLEMESİ. Kapalı zarf yerine
 * açık artırma seçilmesinin sebebi bu: oyuncu kaybettiğinde neden
 * kaybettiğini görüyor ve rakibin o parselde ne gördüğünü öğreniyor.
 */
export function AuctionChip(): ReactElement | null {
  const state = useGameState();
  const { view, setView } = useGame();
  const auction = state.auction;
  if (!auction) return null;

  const tile = state.map.tiles[auction.tileId];
  const district = tile ? state.districts[tile.districtId] : undefined;
  const days = Math.max(0, auction.endsOnDay - state.time.day);
  const leading = auction.bidderId === state.playerCompanyId;

  return (
    <button
      type="button"
      className={`event-chip auction-chip${leading ? ' leading' : ''}`}
      onClick={() => setView({ openPanel: view.openPanel === 'auction' ? 'none' : 'auction' })}
      title={t('finance.auction.chip.title')}
    >
      {t('finance.auction.chip.label', {
        place: district?.name ?? t('finance.auction.city'),
        price: auction.bidderId ? exact(auction.bid) : t('finance.auction.chip.reserve', { reserve: exact(auction.reserve) }),
        days,
      })}
    </button>
  );
}

export function AuctionPanel(): ReactElement {
  const state = useGameState();
  const { run, toast } = useGame();
  const auction = state.auction;
  const [amount, setAmount] = useState<string>('');

  if (!auction) {
    return (
      <p className="muted">{t('finance.auction.noAuction')}</p>
    );
  }

  const tile = state.map.tiles[auction.tileId];
  const district = tile ? state.districts[tile.districtId] : undefined;
  const player = getPlayer(state);
  const minimum = minimumBid(auction);
  const leader = auction.bidderId ? state.companies[auction.bidderId] : null;
  const leading = auction.bidderId === state.playerCompanyId;
  const hint = auctionHint(state, player.id);
  const days = Math.max(0, auction.endsOnDay - state.time.day);

  const bid = (value: number): void => {
    const result = run({ type: 'PLACE_BID', amount: Math.round(value) });
    if (result) {
      toast(t('finance.auction.bidPlaced', { amount: exact(value) }), 'good');
      setAmount('');
    }
  };

  return (
    <div className="auction">
      <div className="auction-head">
        <span className="auction-place">{district?.name ?? t('finance.auction.city')}</span>
        <span className="muted">
          {t('finance.auction.place', { tile: tile ? `${tile.x}-${tile.y}` : '—', days })}
        </span>
      </div>

      <div className="statgrid small">
        <Cell label={t('finance.auction.stat.reserve')} value={exact(auction.reserve)} />
        <Cell
          label={t('finance.auction.stat.highestBid')}
          value={auction.bidderId ? exact(auction.bid) : t('finance.auction.stat.noBid')}
          tone={leading ? 'pos' : auction.bidderId ? 'neg' : undefined}
        />
        <Cell label={t('finance.auction.stat.rounds')} value={`${auction.rounds}`} />
      </div>

      <p className={leading ? 'auction-state pos' : 'auction-state'}>
        {leading
          ? t('finance.auction.state.leading')
          : leader
            ? t('finance.auction.state.rival', { name: leader.name, bid: exact(auction.bid) })
            : t('finance.auction.state.noBid')}
      </p>

      {/* Oyuncunun ne aldığını bilmesi gerekiyor: aynı tahmin motoru,
          aynı sayı — rakibin teklif verirken kullandığının aynısı. */}
      {hint && <p className="muted">{hint}</p>}
      {/* Dolu parsel (Tur 21): taban, sahibinden devralma bedeli. */}
      {tile?.structureId && (
        <p className="muted auction-occupied" data-occupied={tile.structureId}>
          {t('finance.auction.occupied', {
            structure: STRUCTURE_BY_ID[tile.structureId]?.name ?? t('finance.auction.occupied.someStructure'),
          })}
        </p>
      )}

      <div className="auction-actions">
        <button
          type="button"
          className="primary"
          disabled={leading || player.cash < minimum}
          onClick={() => bid(minimum)}
        >
          {leading ? t('finance.auction.leading') : t('finance.auction.bidMinimum', { amount: exact(minimum) })}
        </button>
        <label className="auction-custom">
          <span className="muted">{t('finance.auction.customBid')}</span>
          <input
            type="number"
            min={Math.ceil(minimum)}
            step={1000}
            value={amount}
            placeholder={String(Math.ceil(minimum))}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            disabled={leading || Number(amount) < minimum || Number(amount) > player.cash}
            onClick={() => bid(Number(amount))}
          >
            {t('finance.auction.placeBid')}
          </button>
        </label>
      </div>

      {player.cash < minimum && (
        <p className="chain-warn">{t('finance.auction.noCash', { amount: exact(minimum) })}</p>
      )}

      <p className="muted">{t('finance.auction.footer')}</p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
}): ReactElement {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={tone ? `stat-value ${tone}` : 'stat-value'}>{value}</span>
    </div>
  );
}
