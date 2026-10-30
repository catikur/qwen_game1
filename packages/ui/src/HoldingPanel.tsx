import { useState } from 'react';
import type { ReactElement } from 'react';
import { BUILDING_BY_ID, CITY_SIZES, CITY_TYPES, DEFAULT_CITY_TYPE, GOOD_BY_ID, HOLDING, TRADED_GOODS, TRADE_LINE, formatNumber, formatUnitMoney, getCityType } from '@capital/content';
import type { CitySizeId, CityTypeId } from '@capital/content';
import {
  buybackToLock,
  carriedBrand,
  cityBySeed,
  cityDirective,
  cityDividend,
  cityNameAt,
  cityTrend,
  cityValue,
  fleetUsed,
  formatMoney,
  getPlayer,
  holdingLadder,
  holdingNetWorth,
  inboundByLine,
  lineCapacity,
  lineDailyCost,
  lineMargins,
  lineProfitToday,
  lineQuote,
  openCityQuote,
  priceBoard,
  rivalCopyCountdown,
  rivalLineOn,
  raidStatus,
  remoteIncome,
  sharePrice,
  tradeCities,
  tradeLines,
} from '@capital/core';
import type { DormantCity, GameState, LineOutlook, RemotePayout, TradeLine } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { t } from './i18n';
import './i18n/tradeTr';
import './i18n/playTr';

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
 *
 * Tur 77: şehirlerin altında şehirler arası hatlar.
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
      {holding && <LinesSection state={state} />}
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
      <div className="difficulty-picker" role="radiogroup" aria-label={t('hud.holding.payout.aria', { name })}>
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

/**
 * Şehirler arası hatlar (Tur 77): iki şehrin terminalini bir malla bağlıyor.
 *
 * Satır hattın üç ölçüsünü (kapasite, yol, bedel), bugünkü seferi ve yoldaki
 * malı yazıyor; yük eksikse sebebini (çıkışta fazla yok ya da varış şehrinin
 * kasası yetmedi). Yeni hatta çıkış şehrinin fazlası ve varış şehrinin açığı
 * yan yana: kamyon sayısı ikisinin küçüğünden öneriliyor.
 *
 * Tur 78: şehirlerin fiyat tablosu; satırda birim hesabı (alış, satış,
 * nakliye, pazara ve ihtiyaca birim kâr), eksiği pazardan alma ayarı ve
 * rakip: kopyaladıysa adı ve kamyonu, yol kârlıysa kaç gün kaldığı.
 */
function LinesSection({ state }: { state: GameState }): ReactElement {
  const lines = tradeLines(state);
  return (
    <section className="defense holding-lines" data-holding-lines={lines.length}>
      <div className="defense-head">
        <h3>{t('trade.lines.title')}</h3>
        <span className="muted">{t('trade.lines.count', { count: lines.length, max: TRADE_LINE.maxLines })}</span>
      </div>
      <p className="muted">{t('trade.lines.blurb', { units: formatNumber(TRADE_LINE.truckUnits), cost: formatMoney(TRADE_LINE.truckCostPerTransitDay) })}</p>
      <PriceBoard state={state} />
      {lines.length === 0 ? (
        <p className="muted">{t('trade.lines.empty')}</p>
      ) : (
        <ul className="line-list">
          {lines.map((line) => (
            <LineRow key={line.id} state={state} line={line} />
          ))}
        </ul>
      )}
      {lines.length < TRADE_LINE.maxLines && <OpenLineForm state={state} />}
    </section>
  );
}

/**
 * Şehirlerin fiyatları (Tur 78): her malın holding'in şehirlerindeki fiyatı
 * ve pazardan alıp pazara satmanın en kârlı yönü. En ucuz ve en pahalı şehir
 * renkle ve sözle işaretli.
 */
function PriceBoard({ state }: { state: GameState }): ReactElement | null {
  const rows = priceBoard(state);
  if (rows.length === 0) return null;
  const cities = tradeCities(state).filter((city) => !city.gameOver);
  const nameOf = (seed: number) => cities.find((city) => city.meta.seed === seed)?.cityName ?? '';
  const profitable = rows.filter((row) => row.best).length;
  return (
    <details className="price-board" data-price-board={profitable}>
      <summary>
        <strong>{t('trade.prices.title')}</strong>
        <span className="muted">{profitable > 0 ? t('trade.prices.summary', { count: profitable }) : t('trade.prices.summaryNone')}</span>
      </summary>
      <p className="muted">{t('trade.prices.blurb')}</p>
      <div className="price-board-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('trade.prices.good')}</th>
              {cities.map((city) => (
                <th scope="col" key={city.meta.seed}>
                  {city.cityName}
                </th>
              ))}
              <th scope="col">{t('trade.prices.best')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const spots = row.prices.map((price) => price.spot);
              const low = Math.min(...spots);
              const high = Math.max(...spots);
              return (
                <tr key={row.goodId} data-price-row={row.goodId} data-price-best={row.best ? `${row.best.from}>${row.best.to}` : 'none'}>
                  <th scope="row">{GOOD_BY_ID[row.goodId]?.name ?? row.goodId}</th>
                  {row.prices.map((price) => {
                    const mark = high - low > 1e-9 ? (price.spot === low ? 'cheap' : price.spot === high ? 'dear' : '') : '';
                    return (
                      <td key={price.seed} className={mark} data-price-mark={mark || 'none'}>
                        {formatUnitMoney(price.spot)}
                        {mark && <span className="visually-hidden"> ({t(`trade.prices.${mark}`)})</span>}
                      </td>
                    );
                  })}
                  <td>
                    {row.best ? (
                      t('trade.prices.route', { from: nameOf(row.best.from), to: nameOf(row.best.to), margin: formatUnitMoney(row.best.margin) })
                    ) : (
                      <span className="muted">{t('trade.prices.none')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Hattın kendi etkisi (Tur 80): bu kamyonlarla pazar oturunca fiyatlar,
 * birim ve günlük kâr; günlük kârı en yüksek kamyon başkaysa o. Kâr eksiye
 * düşüyorsa kırmızı.
 */
function LineOutlookNote({ outlook, trucks }: { outlook: LineOutlook; trucks: number }): ReactElement {
  const best = outlook.bestTrucks > 0 && outlook.bestTrucks !== trucks
    ? ` ${t('trade.lines.open.outlookBest', { trucks: outlook.bestTrucks, daily: formatMoney(outlook.bestDaily) })}`
    : '';
  const data = { 'data-line-outlook': outlook.margin.toFixed(2), 'data-line-outlook-best': outlook.bestTrucks };
  if (outlook.margin > 0) {
    return (
      <p className="muted" {...data}>
        {t('trade.lines.open.outlook', {
          days: outlook.days,
          buy: formatUnitMoney(outlook.originSpot),
          spot: formatUnitMoney(outlook.destinationSpot),
          margin: formatUnitMoney(outlook.margin),
          daily: formatMoney(outlook.daily),
        })}
        {best}
      </p>
    );
  }
  return (
    <p className="line-loss" {...data}>
      {t(outlook.bestTrucks > 0 ? 'trade.lines.open.outlookLoss' : 'trade.lines.open.outlookNone', {
        days: outlook.days,
        margin: formatUnitMoney(outlook.margin),
      })}
      {best}
    </p>
  );
}

/** Hattın bugünkü seferi tek cümleyle: ne yüklendi (pazardan alınanı), eksikse neden. */
function lineToday(line: TradeLine): string {
  const last = line.last;
  if (!last) return t('trade.lines.waiting');
  if (last.units <= 0) return t(last.short === 'cash' ? 'trade.lines.noCash' : 'trade.lines.idle', { freight: formatMoney(lineDailyCost(line)) });
  const today = last.bought
    ? t('trade.lines.todayBought', {
        units: formatNumber(Math.round(last.units)),
        bought: formatNumber(Math.round(last.bought)),
        goods: formatMoney(last.goods),
        freight: formatMoney(last.freight),
      })
    : t('trade.lines.today', { units: formatNumber(Math.round(last.units)), goods: formatMoney(last.goods), freight: formatMoney(last.freight) });
  if (last.short === 'cash') return `${today} ${t('trade.lines.shortCash')}`;
  if (last.short === 'surplus') return `${today} ${t('trade.lines.shortSurplus')}`;
  return today;
}

function LineRow({ state, line }: { state: GameState; line: TradeLine }): ReactElement {
  const { run, toast } = useGame();
  const source = cityBySeed(state, line.from);
  const target = cityBySeed(state, line.to);
  const road = target ? inboundByLine(target)[line.id] : undefined;
  const arrived = target?.trade?.arrived?.[line.id] ?? 0;
  const terminal = source?.buildings[line.fromTerminalId];
  const fleet = terminal ? (BUILDING_BY_ID[terminal.defId]?.fleet ?? 0) : 0;
  const spare = source && terminal ? fleet - fleetUsed(source, terminal.id) : 0;
  const goods = (line.goodsPaid ?? 0) + (line.freightPaid ?? 0);
  const margins = lineMargins(state, line.from, line.to, line.goodId);
  const profit = lineProfitToday(state, line);
  const rival = rivalLineOn(state, line.from, line.to, line.goodId);
  const countdown = rivalCopyCountdown(state, line);
  return (
    <li className="line-row" data-line={line.id} data-line-short={line.last?.short ?? 'none'} data-line-buy={line.buy ? 'on' : 'off'}>
      <div className="city-head">
        <strong>{t('trade.lines.route', { from: source?.cityName ?? '', to: target?.cityName ?? '' })}</strong>
        <span className="city-tag">{GOOD_BY_ID[line.goodId]?.name ?? line.goodId}</span>
      </div>
      <span className="muted" data-line-spec>
        {t('trade.lines.spec', {
          trucks: line.trucks,
          capacity: formatNumber(lineCapacity(line.trucks)),
          days: line.transitDays,
          cost: formatMoney(lineDailyCost(line)),
        })}
      </span>
      <span data-line-today>{lineToday(line)}</span>
      {profit !== undefined && (
        <span className={profit < 0 ? 'line-loss' : 'muted'} data-line-profit={Math.round(profit)}>
          {t('trade.lines.profit', { profit: formatMoney(profit) })}
        </span>
      )}
      {margins && (
        <span className="muted" data-line-margin={margins.market.toFixed(2)}>
          {t('trade.lines.margin', {
            buy: formatUnitMoney(margins.buyPrice),
            spot: formatUnitMoney(margins.destinationSpot),
            freight: formatUnitMoney(margins.freight),
            market: formatUnitMoney(margins.market),
            need: formatUnitMoney(margins.need),
          })}
        </span>
      )}
      {line.buy && <span className="muted">{t('trade.lines.buy.on')}</span>}
      {rival ? (
        <span className="line-rival" data-line-rival={rival.trucks}>
          {t('trade.lines.rival', { name: target?.companies[rival.companyId]?.name ?? '', trucks: rival.trucks })}
        </span>
      ) : (
        countdown && (
          <span className="muted" data-line-rival-soon={countdown.left}>
            {countdown.left > 0
              ? t('trade.lines.rivalSoon', { days: countdown.days, left: countdown.left })
              : t('trade.lines.rivalReady', { days: countdown.days })}
          </span>
        )
      )}
      <span className="muted" data-line-road={Math.round(road?.units ?? 0)}>
        {road
          ? t('trade.lines.onRoad', { units: formatNumber(Math.round(road.units)), shipments: road.shipments, value: formatMoney(road.value) })
          : t('trade.lines.noRoad')}
        {arrived > 0 && ` · ${t('trade.lines.arrived', { units: formatNumber(Math.round(arrived)) })}`}
      </span>
      {(line.shipped ?? 0) > 0 && (
        <span className="muted">{t('trade.lines.total', { units: formatNumber(Math.round(line.shipped ?? 0)), paid: formatMoney(goods) })}</span>
      )}
      <div className="holding-actions">
        <button
          type="button"
          className="ghost"
          disabled={line.trucks <= 1}
          data-line-trucks="down"
          onClick={() => run({ type: 'SET_LINE_TRUCKS', lineId: line.id, trucks: line.trucks - 1 })}
        >
          {t('trade.lines.fewer')}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={spare <= 0}
          data-line-trucks="up"
          onClick={() => run({ type: 'SET_LINE_TRUCKS', lineId: line.id, trucks: line.trucks + 1 })}
        >
          {t('trade.lines.more')}
        </button>
        <button
          type="button"
          className="ghost"
          data-line-buy-toggle={line.buy ? 'on' : 'off'}
          onClick={() => run({ type: 'SET_LINE_BUY', lineId: line.id, buy: !line.buy })}
        >
          {t(line.buy ? 'trade.lines.buy.disable' : 'trade.lines.buy.enable')}
        </button>
        <button
          type="button"
          className="ghost"
          data-line-close
          onClick={() => {
            if (run({ type: 'CLOSE_LINE', lineId: line.id })) toast(t('trade.lines.closed'), 'good');
          }}
        >
          {t('trade.lines.close')}
        </button>
      </div>
    </li>
  );
}

function OpenLineForm({ state }: { state: GameState }): ReactElement | null {
  const { run, toast } = useGame();
  const cities = tradeCities(state).filter((city) => !city.gameOver);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [goodId, setGoodId] = useState<string>(TRADED_GOODS[0]!.id);
  const [trucks, setTrucks] = useState<number | null>(null);
  const [buy, setBuy] = useState(false);
  if (cities.length < 2) return null;
  const fromSeed = cities.find((city) => city.meta.seed === from)?.meta.seed ?? cities[0]!.meta.seed;
  const targets = cities.filter((city) => city.meta.seed !== fromSeed);
  const toSeed = targets.find((city) => city.meta.seed === to)?.meta.seed ?? targets[0]!.meta.seed;
  const suggested = lineQuote(state, fromSeed, toSeed, goodId, 1, buy).suggestedTrucks;
  const count = trucks ?? suggested;
  const quote = lineQuote(state, fromSeed, toSeed, goodId, count, buy);
  const nameOf = (seed: number) => cities.find((city) => city.meta.seed === seed)?.cityName ?? '';

  return (
    <div className="line-open" data-line-open={quote.ok ? 'ok' : 'refused'}>
      <h4>{t('trade.lines.open.title')}</h4>
      <div className="line-open-grid">
        <label>
          <span>{t('trade.lines.open.from')}</span>
          <select
            value={String(fromSeed)}
            data-line-from
            onChange={(e) => {
              setFrom(Number(e.target.value));
              setTrucks(null);
            }}
          >
            {cities.map((city) => (
              <option key={city.meta.seed} value={String(city.meta.seed)}>
                {city.cityName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('trade.lines.open.to')}</span>
          <select
            value={String(toSeed)}
            data-line-to
            onChange={(e) => {
              setTo(Number(e.target.value));
              setTrucks(null);
            }}
          >
            {targets.map((city) => (
              <option key={city.meta.seed} value={String(city.meta.seed)}>
                {city.cityName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('trade.lines.open.good')}</span>
          <select
            value={goodId}
            data-line-good
            onChange={(e) => {
              setGoodId(e.target.value);
              setTrucks(null);
            }}
          >
            {TRADED_GOODS.map((good) => (
              <option key={good.id} value={good.id}>
                {good.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('trade.lines.open.trucks')}</span>
          <input
            type="number"
            min={1}
            max={Math.max(1, quote.freeTrucks)}
            step={1}
            value={count}
            data-line-count
            onChange={(e) => setTrucks(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
        </label>
      </div>
      <label className="line-open-buy">
        <input
          type="checkbox"
          checked={buy}
          data-line-open-buy
          onChange={(e) => {
            setBuy(e.target.checked);
            setTrucks(null);
          }}
        />
        <span>{t('trade.lines.open.buy')}</span>
      </label>
      <p className="muted" data-line-quote>
        {t('trade.lines.open.quote', {
          surplus: formatNumber(Math.round(quote.surplus)),
          need: formatNumber(Math.round(quote.need)),
        })}
      </p>
      {quote.margins && (
        <p className="muted" data-line-open-margin={quote.margins.market.toFixed(2)}>
          {t('trade.lines.open.margins', {
            market: formatUnitMoney(quote.margins.market),
            need: formatUnitMoney(quote.margins.need),
            freight: formatUnitMoney(quote.margins.freight),
          })}
        </p>
      )}
      {quote.outlook && <LineOutlookNote outlook={quote.outlook} trucks={count} />}
      <p className="muted" data-line-terms>
        {t(buy && quote.margins ? 'trade.lines.open.termsBuy' : 'trade.lines.open.terms', {
          capacity: formatNumber(quote.capacity),
          days: quote.transitDays,
          cost: formatMoney(quote.dailyCost),
          price: formatUnitMoney(quote.unitPrice),
          buy: formatUnitMoney(quote.margins?.buyPrice ?? quote.unitPrice),
          spot: formatUnitMoney(quote.destinationSpot),
        })}
      </p>
      {!quote.ok && (
        <p className="muted line-refused" data-line-refused>
          {quote.reason}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={!quote.ok}
        data-line-go
        onClick={() => {
          if (run({ type: 'OPEN_LINE', from: fromSeed, to: toSeed, goodId, trucks: count, ...(buy ? { buy: true } : {}) })) {
            toast(t('trade.lines.open.done', { from: nameOf(fromSeed), to: nameOf(toSeed), good: GOOD_BY_ID[goodId]?.name ?? goodId }), 'good');
            setTrucks(null);
          }
        }}
      >
        {t('trade.lines.open.go')}
      </button>
    </div>
  );
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
        <div className="difficulty-picker target-picker" role="radiogroup" aria-label={t('hud.holding.transfer.target')}>
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
  // Yeni şehrin türü (Tur 76).
  const [kind, setKind] = useState<CityTypeId>(DEFAULT_CITY_TYPE);
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
          <span className="muted">{t('hud.holding.open.type')}</span>
          <div className="difficulty-picker mode-picker city-type-picker" role="radiogroup" aria-label={t('hud.holding.open.type')}>
            {CITY_TYPES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === kind}
                className={`difficulty-option${option.id === kind ? ' selected' : ''}`}
                data-holding-type={option.id}
                style={{ ['--city-type' as string]: option.color }}
                onClick={() => setKind(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <p className="muted" data-holding-type-blurb>{getCityType(kind).blurb}</p>
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
              if (run({ type: 'OPEN_CITY', citySize: size, capital, ...(kind !== DEFAULT_CITY_TYPE ? { cityType: kind } : {}) })) {
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

/**
 * Üst bardaki şehrin türü (Tur 76): liman, sanayi ya da başkent. Dengeli
 * şehirde yok; bugünkü üst bar değişmiyor.
 */
export function CityTypeChip(): ReactElement | null {
  const state = useGameState();
  if (!state.cityType) return null;
  const kind = getCityType(state.cityType);
  return (
    <span
      className="brand-city-type"
      data-city-type-chip={kind.id}
      style={{ ['--city-type' as string]: kind.color }}
      title={t('hud.cityType.chipTitle', { type: kind.name, blurb: kind.blurb })}
    >
      {kind.name}
    </span>
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
