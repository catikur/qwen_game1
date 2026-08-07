import type { ReactElement } from 'react';
import { competitionCards, formatMoney, getPlayer, moveTotalCost } from '@capital/core';
import type { CompetitionArm, CompetitionCard, CompetitionMove } from '@capital/core';
import { useGame, useGameState } from './useGame';

/**
 * Rekabet paneli.
 *
 * Zincir paneli "maliyetim nereden geliyor" diyor; bu panel onun karşı
 * tarafı: **aynı rafta duran rakibime karşı neredeyim.**
 *
 * Kartın taşıdığı tek zor fikir şu: kolun karşılığı pazarın durumuna
 * göre değişiyor. Talep kapasiteyi aşıyorsa kalite FİYATA, pazar
 * doymuşsa PAYA dönüyor. Bunu oyuncuya açıkça söylüyoruz, yoksa
 * "kaliteyi artırdım ama daha çok satmıyorum" diye haklı ama yanlış bir
 * sonuca varır.
 */
export function CompetitionPanel(): ReactElement {
  const state = useGameState();
  const player = getPlayer(state);
  const cards = competitionCards(state, player.id);

  if (cards.length === 0) {
    return (
      <p className="muted">
        Henüz bir mağazan yok. Bir kategoride satış yapmaya başladığında rakibine
        karşı nerede olduğunu — kalite, marka ve fiyat olarak — burada görürsün.
      </p>
    );
  }

  return (
    <div className="rivalry">
      {cards.map((card) => (
        <CompetitionCardView key={card.category} card={card} />
      ))}
    </div>
  );
}

function pct(value: number): string {
  return `%${Math.round(value * 100)}`;
}

function CompetitionCardView({ card }: { card: CompetitionCard }): ReactElement {
  const leader = card.leader;
  const ahead = leader ? card.share >= leader.share : true;

  return (
    <section className="rival-card" aria-label={`${card.categoryName} rekabeti`}>
      <header className="rival-head">
        <span className="rival-title">
          <span className="chain-dot" style={{ background: card.color }} />
          {card.categoryName}
        </span>
        <span className="rival-meta">
          {card.outlets} mağaza · pay{' '}
          <strong className={ahead ? 'pos' : 'neg'}>{pct(card.share)}</strong>
        </span>
      </header>

      <p className={`rival-channel channel-${card.channel}`}>{card.channelLabel}</p>

      {/* Üç sütun: sen, lider, fark. Renk tek başına anlam taşımıyor —
          her satırda sayı da yazılı. */}
      <table className="rival-table">
        <thead>
          <tr>
            <th scope="col">&nbsp;</th>
            <th scope="col">Sen</th>
            <th scope="col">{leader ? leader.name : 'Rakip yok'}</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Pay" mine={pct(card.share)} theirs={leader ? pct(leader.share) : '—'} good={ahead} />
          <Row
            label="Kalite"
            mine={card.quality.toFixed(2)}
            theirs={leader ? leader.quality.toFixed(2) : '—'}
            good={!leader || card.quality >= leader.quality}
          />
          <Row
            label="Marka"
            mine={card.brand.toFixed(2)}
            theirs={leader ? leader.brand.toFixed(2) : '—'}
            good={!leader || card.brand >= leader.brand}
          />
          {/* Fiyat NÖTR: ucuz olmak iyi, pahalı olmak kötü değil —
              ikisi de strateji. Yeşile boyamak oyuncuya yanlış bir
              "öndesin" sinyali veriyordu. */}
          <Row
            label="Fiyat"
            mine={`×${card.price.toFixed(2)}`}
            theirs={leader ? `×${leader.price.toFixed(2)}` : '—'}
          />
        </tbody>
      </table>

      {card.note && <p className="rival-note">{card.note}</p>}

      <ul className="rival-arms">
        {card.arms.map((arm) => (
          <li key={arm.kind}>
            <ArmView arm={arm} />
          </li>
        ))}
      </ul>

      {card.move ? (
        <MoveView card={card} move={card.move} />
      ) : (
        <p className="chain-settled">
          {card.blocked ?? 'Şu an atılacak bir kol hamlesi yok.'}
        </p>
      )}
    </section>
  );
}

function Row({
  label,
  mine,
  theirs,
  good,
}: {
  label: string;
  mine: string;
  theirs: string;
  /** Verilmezse satır nötr çizilir — her ölçüde "iyi/kötü" yoktur. */
  good?: boolean;
}): ReactElement {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={good === undefined ? '' : good ? 'pos' : 'neg'}>{mine}</td>
      <td>{theirs}</td>
    </tr>
  );
}

/** Kolun doluluğu: sayı + çubuk. Çubuk süs değil, tavana uzaklık. */
function ArmView({ arm }: { arm: CompetitionArm }): ReactElement {
  return (
    <div className={`rival-arm arm-${arm.kind}`}>
      <span className="rival-arm-head">
        <strong>{arm.label}</strong>
        <span className="rival-arm-value">
          +{arm.value.toFixed(2)} / {arm.cap.toFixed(2)}
        </span>
      </span>
      <span className="rival-bar" aria-hidden="true">
        {/* İki katman: koyu olan mevcut binaların tavanı, açık olan
            bugün ulaşılmış değer. Aradaki boşluk "ilerliyor" demek. */}
        <span className="rival-bar-ceiling" style={{ width: `${(arm.ceiling / arm.cap) * 100}%` }} />
        <span className="rival-bar-value" style={{ width: `${(arm.value / arm.cap) * 100}%` }} />
      </span>
      <span className="rival-arm-detail">{arm.detail}</span>
    </div>
  );
}

function MoveView({ card, move }: { card: CompetitionCard; move: CompetitionMove }): ReactElement {
  const { run, toast, setView } = useGame();
  const state = useGameState();

  const total = moveTotalCost(state, move, state.playerCompanyId);
  const canPay = getPlayer(state).cash >= total;

  const build = (): void => {
    const acquired = move.needsBuyout
      ? run({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : run({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired) return;
    if (!run({ type: 'BUILD', tileId: move.tileId, defId: move.defId })) return;

    // Yeni bina varsayılan olarak EN ÇOK mağazan olan kategoriye atanır;
    // kartın önerdiği kategori o değilse hemen düzeltiyoruz. Oyuncunun
    // "kur" dediği hamle ile olan şey aynı olmalı.
    const tile = state.map.tiles[move.tileId];
    if (tile?.buildingId) {
      run({ type: 'SET_FOCUS', buildingId: tile.buildingId, category: card.category });
    }
    toast(`${move.name} kuruldu — ${card.categoryName}.`, 'good');
    setView({ selectedTileId: move.tileId });
  };

  return (
    <div className={move.premature ? 'chain-move early' : 'chain-move'}>
      <p className="chain-reason">{move.reason}</p>
      <div className="chain-action">
        <button
          type="button"
          className={move.premature ? '' : 'primary'}
          onClick={build}
          disabled={!canPay}
        >
          {move.name} kur · {formatMoney(total)}
        </button>
        <span className="chain-gain">
          {move.districtName}
          {move.needsBuyout && ' · parsel devralınacak'} · {card.categoryName} kategorisine atanacak
        </span>
      </div>
      {move.premature && (
        <p className="chain-early">
          Henüz erken — bu kol, mağaza sayın büyüdüğünde asıl karşılığını verir.
        </p>
      )}
      {!canPay && <p className="chain-warn">Nakit yetersiz — {formatMoney(total)} gerekiyor.</p>}
    </div>
  );
}
