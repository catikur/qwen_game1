import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  CONTROL_THRESHOLD,
  TOTAL_SHARES,
  confidence,
  formatMoney,
  freeFloat,
  getPlayer,
  marketCap,
  portfolioValue,
  sharePrice,
  sharesHeld,
} from '@capital/core';
import type { CompanyState, GameState } from '@capital/core';
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
      <p className="muted">
        Şehirde başka şirket kalmadı. Borsa boş — rakiplerin hepsini
        devraldın.
      </p>
    );
  }

  const portfolio = portfolioValue(state, player.id);

  return (
    <div className="bourse">
      <div className="statgrid small">
        <Stat label="Nakit" value={formatMoney(player.cash)} />
        <Stat label="Portföy değeri" value={formatMoney(portfolio)} />
        <Stat label="Şirket değeri" value={formatMoney(player.netWorth)} />
      </div>

      <Defense state={state} />

      <p className="muted">
        Bir şirketin hisselerinin %{Math.round(CONTROL_THRESHOLD * 100)}'ini
        geçersen onu devralırsın: bütün binaları ve parselleri senin olur.
        Azınlık hissesi de kendi başına kazandırır — şirket kârının dörtte
        birini hissedarlarına dağıtır.
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
  const percent = (topCount / TOTAL_SHARES) * 100;

  const buyback = (count: number): void => {
    if (count <= 0) return;
    if (run({ type: 'BUY_SHARES', companyId: player.id, count })) {
      toast(`${count} hisse hazineye çekildi — ${formatMoney(count * price)}.`, 'good');
    }
  };
  const affordable = Math.min(100, Math.floor(player.cash / Math.max(1, price)), float);

  return (
    <div className={topCount > 0 ? 'defense threatened' : 'defense'}>
      <div className="defense-head">
        <h3>Kendi Hissen</h3>
        <span className="muted">
          dolaşımda {float} · hazinede {treasury} · {formatMoney(price)}/hisse
        </span>
      </div>
      {topHolder ? (
        <div className="defense-threat">
          <span>
            <strong>{topHolder.name}</strong> payının %{percent.toFixed(1)}
            {"'"}ini topladı — eşik %{Math.round(CONTROL_THRESHOLD * 100)}.
          </span>
          <button type="button" disabled={affordable <= 0} onClick={() => buyback(affordable)}>
            {affordable} hisse geri al
          </button>
        </div>
      ) : (
        <p className="muted">
          Hissene talip yok. Rakipler zayıflayan şirketlerin payını toplar —
          sıralamada düşersen burası ilk bakacağın yer.
        </p>
      )}
    </div>
  );
}

function Listing({ company, state }: { company: CompanyState; state: GameState }): ReactElement {
  const { run, toast } = useGame();
  const [amount, setAmount] = useState<string>('');

  const player = getPlayer(state);
  const price = sharePrice(state, company.id);
  const held = sharesHeld(state, player.id, company.id);
  const stake = held / TOTAL_SHARES;
  const available = freeFloat(state, company.id);
  const trust = confidence(state, company.id);

  /** Kontrole kaç hisse kaldı. */
  const toControl = Math.max(0, Math.floor(TOTAL_SHARES * CONTROL_THRESHOLD) + 1 - held);
  const controlCost = toControl * price;
  const affordable = Math.min(available, Math.floor(player.cash / Math.max(1, price)));

  const trade = (type: 'BUY_SHARES' | 'SELL_SHARES', count: number): void => {
    if (count <= 0) return;
    if (run({ type, companyId: company.id, count })) {
      toast(
        type === 'BUY_SHARES'
          ? `${count} hisse alındı — ${formatMoney(count * price)}.`
          : `${count} hisse satıldı — ${formatMoney(count * price)}.`,
        'good',
      );
      setAmount('');
    }
  };

  return (
    <section className="bourse-row" aria-label={`${company.name} hissesi`}>
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
            {trust >= 1 ? 'primli' : 'iskontolu'} ×{trust.toFixed(2)}
          </span>
        </span>
      </header>

      <div className="bourse-meta">
        <span>değer {formatMoney(marketCap(state, company.id))}</span>
        <span>günlük kâr {formatMoney(company.today.profit)}</span>
        <span>serbest {available.toLocaleString('tr-TR')} hisse</span>
      </div>

      {/* Kontrol göstergesi: payın ve eşik. Çubuk süs değil, "ne kadar
          kaldı" sorusunun cevabı. */}
      <div className="bourse-stake">
        <span className="bourse-bar" aria-hidden="true">
          <span className="bourse-bar-fill" style={{ width: `${Math.min(100, stake * 100)}%` }} />
          <span className="bourse-bar-mark" style={{ left: `${CONTROL_THRESHOLD * 100}%` }} />
        </span>
        <span className="bourse-stake-text">
          payın <strong>%{(stake * 100).toFixed(1)}</strong>
          {stake > CONTROL_THRESHOLD
            ? ' · kontrol sende'
            : ` · kontrol için ${toControl.toLocaleString('tr-TR')} hisse daha (${formatMoney(controlCost)})`}
        </span>
      </div>

      <div className="bourse-actions">
        <button
          type="button"
          disabled={affordable < 100}
          onClick={() => trade('BUY_SHARES', Math.min(100, affordable))}
        >
          100 al · {formatMoney(100 * price)}
        </button>
        <button
          type="button"
          className={toControl > 0 && affordable >= toControl ? 'primary' : ''}
          disabled={toControl === 0 || affordable < toControl}
          onClick={() => trade('BUY_SHARES', toControl)}
        >
          {toControl === 0 ? 'Kontrol sende' : `Devral · ${formatMoney(controlCost)}`}
        </button>
        <label className="auction-custom">
          <input
            type="number"
            min={1}
            step={100}
            value={amount}
            placeholder="adet"
            onChange={(e) => setAmount(e.target.value)}
          />
          <button type="button" disabled={Number(amount) <= 0} onClick={() => trade('BUY_SHARES', Number(amount))}>
            Al
          </button>
          <button
            type="button"
            disabled={held <= 0 || Number(amount) <= 0 || Number(amount) > held}
            onClick={() => trade('SELL_SHARES', Number(amount))}
          >
            Sat
          </button>
        </label>
      </div>

      {held > 0 && (
        <p className="muted">
          Elinde {held.toLocaleString('tr-TR')} hisse ·{' '}
          {formatMoney(held * price)} değerinde
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
