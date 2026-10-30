import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { CATEGORIES, GOOD_BY_ID, formatDecimal, formatNumber, formatPercent, ruleName } from '@capital/content';
import type { ScenarioDef } from '@capital/content';
import {
  chainGoalStatus,
  formatMoney,
  freightGoalStatus,
  freightTerminals,
  holdingCities,
  hostileRivals,
  rentalGoalStatus,
  getPlayer,
  scenarioDefOf,
  scenarioGoalText,
  scenarioProgress,
  scenarioResultPending,
  scenarioScoreText,
  tradeCities,
  tradeLines,
  tradeProfitToday,
} from '@capital/core';
import type { GameState, ScenarioState } from '@capital/core';
import { useGame, useGameState } from './useGame';
import { recordScenarioResult, scenarioRecord, scenarioRunKey } from './scenarioBest';
import { t } from './i18n';
import './i18n/tradeTr';
import { CareerRunLine } from './CareerPanel';
import { starRow, starThresholds } from './stars';
import { VICTORY_DELAY_MS, useMomentDelay } from './MomentLayers';
import { CityCardButton } from './CityCard';

/**
 * Senaryo ekranları (Tur 39): açılış (durum, hedef, süre — oyun duraklamış
 * başlıyor), sonuç (yıldız, cihazdaki en iyi) ve hedef panelindeki bölüm.
 */

// Kurulum ekranı da okuyor; hafif modülde (Tur 46).
export { starRow, starThresholds } from './stars';

/** Sonuç ekranının cümlesi: kazanılan skor ya da kaybın nedeni. */
export function scenarioResultText(def: ScenarioDef, scenario: ScenarioState): string {
  const used = (scenario.finishedDay ?? scenario.startDay) - scenario.startDay;
  const score = scenario.score ?? 0;
  if (scenario.outcome === 'won') {
    return def.stars.metric === 'days'
      ? t('hud.scenario.wonBodyDays', { days: used })
      : t('hud.scenario.wonBodyLead', { score: scenarioScoreText(def, score) });
  }
  const goal = def.goal;
  const sponsor = goal.kind === 'sponsor' ? { done: scenario.sponsored ?? 0, total: goal.projects } : null;
  switch (scenario.lostReason) {
    case 'takeover':
      return t('hud.scenario.lostTakeover', { days: used });
    case 'rank':
      return t('hud.scenario.lostRank', {
        max: goal.kind === 'sponsor' ? goal.maxRank : 0,
        grace: goal.kind === 'sponsor' ? goal.graceDays : 0,
        done: sponsor?.done ?? 0,
        total: sponsor?.total ?? 0,
      });
    case 'project':
      return t('hud.scenario.lostProject', { days: used, done: sponsor?.done ?? 0, total: sponsor?.total ?? 0 });
    case 'city':
      return t('hud.scenario.lostCity', { days: used, won: score });
    default:
      break;
  }
  switch (goal.kind) {
    case 'netWorth':
      return t('hud.scenario.lostTimeMoney', { percent: formatPercent(Math.round(score * 100)) });
    case 'victory':
      // Değer hedefteyse eksik olan birincilik.
      return score >= 1
        ? t('hud.scenario.lostTimeVictoryRank')
        : t('hud.scenario.lostTimeVictory', { percent: formatPercent(Math.floor(score * 100)) });
    case 'chain':
      return t('hud.scenario.lostTimeChain');
    case 'sponsor':
      return t('hud.scenario.lostTimeSponsor', { done: sponsor?.done ?? 0, total: sponsor?.total ?? 0 });
    case 'monopoly':
      // Skor kalan rakip sayısı.
      return t('hud.scenario.lostTimeMonopoly', { left: score });
    case 'holding':
      // Skor zafer kazanılan şehir sayısı.
      return t('hud.scenario.lostTimeHolding', { won: score });
    case 'leadAtEnd':
      return t('hud.scenario.lostTimeLead', { score: scenarioScoreText(def, score) });
    case 'freight':
      // Skor taşınan mağazanın hedefe oranı; yettiyse eksik olan ayrı rakip.
      return score >= 1
        ? t('hud.scenario.lostTimeFreightRivals', { rivals: goal.rivals })
        : t('hud.scenario.lostTimeFreight', { percent: formatPercent(Math.floor(score * 100)) });
    case 'power':
      return t('hud.scenario.lostTimePower', { percent: formatPercent(Math.floor(score * 100)) });
    case 'trade':
      // Skor ticaretin kârının hedefe oranı (zararda sıfır).
      return t('hud.scenario.lostTimeTrade', { percent: formatPercent(Math.floor(score * 100)) });
    case 'rental':
      // Skor dolu birimin hedefe oranı; yettiyse eksik olan dönüşüm projesi (Codex #90).
      return score >= 1
        ? t('hud.scenario.lostTimeRentalRenewals', { renewals: goal.renewals })
        : t('hud.scenario.lostTimeRental', { percent: formatPercent(Math.floor(score * 100)) });
  }
}

/** Açılış ekranında senaryonun karşı tarafı: baskıncı, konsorsiyum ya da ihale takvimi. */
function briefExtras(state: GameState, def: ScenarioDef, scenario: ScenarioState): string[] {
  const lines: string[] = [];
  const consortium = state.consortium;
  if (consortium) {
    lines.push(
      t('hud.scenario.briefConsortium', {
        leader: state.companies[consortium.leaderId]?.name ?? consortium.names[0] ?? '',
        count: consortium.memberIds.length - 1,
        days: Math.max(0, consortium.startsDay - state.time.day),
      }),
    );
  } else if (scenario.rivalId && state.companies[scenario.rivalId]) {
    lines.push(t('hud.scenario.briefRaider', { rival: state.companies[scenario.rivalId]!.name }));
  }
  if (def.setup.projects && state.nextProjectDay !== undefined && !state.project) {
    lines.push(t('hud.scenario.briefProjects', { days: Math.max(0, state.nextProjectDay - state.time.day) }));
  }
  if (def.setup.freeze) {
    lines.push(t('hud.scenario.briefFreeze', { count: Object.values(state.companies).filter((company) => !company.isPlayer).length }));
  }
  if (def.setup.secondCity) {
    for (const city of holdingCities(state).filter((entry) => !entry.active)) {
      lines.push(t('hud.scenario.briefFounding', { city: city.name, value: formatMoney(Math.max(0, city.value)), rank: city.rank }));
    }
  }
  // Tur 60: devralınan husumet ve senaryonun ek kuralı.
  if (def.setup.feud) {
    const foes = hostileRivals(state).map((company) => company.name);
    if (foes.length > 0) lines.push(t('hud.scenario.briefFeud', { names: foes.join(', ') }));
  }
  if (def.modifiers && def.modifiers.length > 0) {
    lines.push(t('hud.scenario.briefRules', { rules: def.modifiers.map((id) => ruleName(def, id)).join(', ') }));
  }
  return lines;
}

export function ScenarioBriefScreen(): ReactElement | null {
  const state = useGameState();
  const { run } = useGame();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  if (!scenario || !def || scenario.briefSeen || scenario.finishedDay !== undefined) return null;
  const player = getPlayer(state);
  const extras = briefExtras(state, def, scenario);

  return (
    <div className="gameover scenario-brief" role="alertdialog" aria-label={t('hud.scenario.briefLabel')} data-scenario-brief={def.id}>
      <div className="gameover-card">
        <p className="newgame-eyebrow">
          {def.setup.secondCity && state.cityName
            ? t('hud.scenario.eyebrowCity', { city: state.cityName })
            : t('hud.scenario.eyebrow', { day: state.time.day })}
        </p>
        <h2>{def.title}</h2>
        <p>{def.brief}</p>
        <p className="scenario-goal">
          <span className="tag good">{t('hud.scenario.goal')}</span> {scenarioGoalText(def)}
        </p>
        <ul className="scenario-facts">
          {def.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <p className="muted">
          {t('hud.scenario.briefCompany', { company: player.name, cash: formatMoney(player.cash), worth: formatMoney(player.netWorth) })}
          {extras.map((line) => ` ${line}`).join('')}
        </p>
        <p className="muted scenario-stars">{starThresholds(def)}</p>
        <div className="gameover-actions">
          <button type="button" className="primary" data-scenario-begin onClick={() => run({ type: 'DISMISS_SCENARIO', screen: 'brief' })}>
            {t('hud.scenario.begin')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScenarioResultScreen({ onNewGame, onReplay }: { onNewGame: () => void; onReplay: (id: string) => void }): ReactElement | null {
  const state = useGameState();
  const { run, view } = useGame();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  const pending = scenarioResultPending(state);
  const runKey = scenario
    ? scenarioRunKey({ createdAtIso: state.meta.createdAtIso, finishedDay: scenario.finishedDay, outcome: scenario.outcome, score: scenario.score })
    : '';
  const [best, setBest] = useState(false);
  // Önemli an (Tur 63): kazanılan senaryoda da havai fişek önce, sonuç ekranı
  // zafer ekranı gibi biraz sonra; yoksa kutlama sonucun perdesinin altında
  // başlıyordu (Codex #93). Kayıttan açılan sonuç, azaltılmış hareket ve veri
  // lensi (şehir gizli) beklemiyor.
  // Kaybedilen senaryoda da, aynı gün normal bir zafer geldiyse: kutlama o zaferin (Codex #93).
  const celebrating =
    scenario?.outcome === 'won' || (state.victory !== undefined && !state.victory.dismissed && state.victory.day === scenario?.finishedDay);
  const ready = useMomentDelay(pending && celebrating ? `scenario:${scenario?.finishedDay}` : null, VICTORY_DELAY_MS, state, view.lens !== 'none');

  // Sonuç cihazda bir kez sayılıyor (sonuç ekranı yeniden açılsa da).
  useEffect(() => {
    if (!pending || !scenario || !def) return;
    setBest(recordScenarioResult(def.id, runKey, scenario.stars ?? 0, scenario.score ?? 0, def));
  }, [pending, runKey]);

  if (!pending || !scenario || !def) return null;
  const won = scenario.outcome === 'won';
  if (celebrating && !ready) return null;
  const record = scenarioRecord(def.id, def);

  return (
    <div className="gameover scenario-result" role="alertdialog" aria-label={t('hud.scenario.resultLabel')} data-scenario-result={scenario.outcome}>
      <div className="gameover-card">
        <h2>{won ? t('hud.scenario.wonTitle', { title: def.title }) : t('hud.scenario.lostTitle', { title: def.title })}</h2>
        <p className="scenario-result-stars" aria-label={t('hud.scenario.starsLabel', { stars: scenario.stars ?? 0 })} data-stars={scenario.stars ?? 0}>
          {starRow(scenario.stars ?? 0)}
        </p>
        <p data-scenario-reason={won ? 'won' : (scenario.lostReason ?? 'time')}>{scenarioResultText(def, scenario)}</p>
        <p className="muted" data-scenario-best>
          {best
            ? t('hud.scenario.newBest')
            : record.best
              ? t('hud.scenario.best', { stars: starRow(record.best.stars), score: scenarioScoreText(def, record.best.score) })
              : t('hud.scenario.noBest')}
        </p>
        <p className="muted scenario-stars">{starThresholds(def)}</p>
        <CareerRunLine state={state} />
        <div className="gameover-actions">
          <button type="button" className="primary" data-scenario-replay onClick={() => onReplay(def.id)}>
            {t('hud.scenario.replay')}
          </button>
          {!state.gameOver && (
            <button
              type="button"
              className="ghost-invert"
              data-scenario-continue
              onClick={() => {
                run({ type: 'DISMISS_SCENARIO', screen: 'result' });
                // Aynı gün zafer de geldiyse onun ekranı sırada: takvimi o yürütür.
                if (!state.victory || state.victory.dismissed) run({ type: 'SET_SPEED', speed: 1 });
              }}
            >
              {t('hud.scenario.continue')}
            </button>
          )}
          <CityCardButton />
          <button type="button" className="ghost-invert" onClick={onNewGame}>
            {t('hud.scenario.list')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hedef panelinin başındaki senaryo bölümü: hedef, ilerleme, kalan süre, yıldız eşikleri. */
export function ScenarioGoalSection(): ReactElement | null {
  const state = useGameState();
  const scenario = state.scenario;
  const def = scenarioDefOf(state);
  const status = scenarioProgress(state);
  if (!scenario || !def || !status) return null;
  const finished = scenario.finishedDay !== undefined;
  return (
    <section className="scenario-goals" data-scenario-goals={def.id}>
      <header className="quest-head">
        <h3>{t('hud.scenario.panelTitle', { title: def.title })}</h3>
        <span className="quest-days">
          {finished ? starRow(scenario.stars ?? 0) : t('hud.scenario.daysLeft', { days: status.daysLeft })}
        </span>
      </header>
      <p className="scenario-goal">{scenarioGoalText(def)}</p>
      {!finished && (
        <div
          className="goal-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(status.progress * 100)}
          aria-label={def.title}
        >
          <span style={{ width: `${Math.round(status.progress * 100)}%` }} />
        </div>
      )}
      <p className="goal-detail">
        {finished
          ? scenario.outcome === 'won'
            ? t('hud.scenario.panelWon', { score: scenarioScoreText(def, scenario.score ?? 0) })
            : t('hud.scenario.panelLost')
          : status.detail}
      </p>
      {!finished && def.goal.kind === 'chain' && <ChainChecklist state={state} goodId={def.goal.goodId} target={def.goal.share} />}
      {!finished && def.goal.kind === 'holding' && <HoldingChecklist state={state} />}
      {!finished && def.goal.kind === 'trade' && <TradeChecklist state={state} />}
      {!finished && def.goal.kind === 'freight' && <FreightChecklist state={state} rivals={def.goal.rivals} outlets={def.goal.outlets} />}
      {!finished && def.goal.kind === 'rental' && <RentalChecklist state={state} units={def.goal.units} renewals={def.goal.renewals} />}
      <p className="muted scenario-stars">{starThresholds(def)}</p>
    </section>
  );
}

/**
 * Zincir ustası: hedefin beş koşulu, her biri sağlandı mı. Üçü aynı gün
 * sağlanmalı (zincir, maliyet, pay); oyuncu hangisinin eksik olduğunu
 * buradan görüyor.
 */
function ChainChecklist({ state, goodId, target }: { state: GameState; goodId: string; target: number }): ReactElement | null {
  const status = chainGoalStatus(state, goodId, target);
  const good = GOOD_BY_ID[goodId];
  if (!status || !good?.category) return null;
  const rawName = GOOD_BY_ID[status.rawGoodId]?.name ?? status.rawGoodId;
  const intermediateName = GOOD_BY_ID[status.intermediateId]?.name ?? status.intermediateId;
  const items: Array<{ key: string; done: boolean; label: string }> = [
    { key: 'raw', done: status.raw, label: t('hud.scenario.chainRaw', { good: rawName }) },
    { key: 'process', done: status.process, label: t('hud.scenario.chainProcess', { good: intermediateName }) },
    { key: 'outlet', done: status.outlet, label: t('hud.scenario.chainOutlet', { good: good.name }) },
    {
      key: 'cost',
      done: status.cost < status.spot,
      label: status.process
        ? t('hud.scenario.chainCost', { good: intermediateName, cost: formatMoney(status.cost), spot: formatMoney(status.spot) })
        : t('hud.scenario.chainCostNone', { good: intermediateName, spot: formatMoney(status.spot) }),
    },
    {
      key: 'share',
      done: status.share >= target,
      label: t('hud.scenario.chainShare', {
        category: CATEGORIES[good.category].name,
        share: Math.floor(status.share * 100),
        target: Math.round(target * 100),
      }),
    },
  ];
  return (
    <ul className="scenario-checklist" aria-label={t('hud.scenario.chainLabel')}>
      {items.map((item) => (
        <li key={item.key} className={item.done ? 'done' : undefined} data-chain-item={item.key} data-done={item.done ? '1' : '0'}>
          <span aria-hidden="true">{item.done ? '✓' : '○'}</span> {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Holding: iki şehir — her şehrin zafer durumu; oynanan şehir başta. */
function HoldingChecklist({ state }: { state: GameState }): ReactElement {
  return (
    <ul className="scenario-checklist" aria-label={t('hud.scenario.holdingLabel')}>
      {holdingCities(state).map((city) => (
        <li
          key={city.name}
          className={city.won ? 'done' : undefined}
          data-holding-city={city.active ? 'active' : 'away'}
          data-done={city.won ? '1' : '0'}
        >
          <span aria-hidden="true">{city.won ? '✓' : city.lost ? '✗' : '○'}</span>{' '}
          {t(city.active ? 'hud.scenario.holdingHere' : 'hud.scenario.holdingAway', {
            city: city.name,
            value: formatMoney(Math.max(0, city.value)),
            target: formatMoney(city.target),
            rank: city.rank,
          })}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ticaret hedefi (Tur 79): hattın iki ucu terminal istiyor. Her şehrin
 * terminali, açık hatlar ve bugün hatlardan gelen kâr; zarar eden gün
 * kırmızı (toplam ondan düşüyor).
 */
function TradeChecklist({ state }: { state: GameState }): ReactElement {
  const lines = tradeLines(state);
  const trucks = lines.reduce((sum, line) => sum + line.trucks, 0);
  const today = tradeProfitToday(state);
  return (
    <ul className="scenario-checklist" aria-label={t('trade.goal.label')}>
      {tradeCities(state).map((city) => {
        const count = freightTerminals(city).length;
        return (
          <li key={city.meta.seed} className={count > 0 ? 'done' : undefined} data-trade-terminal={city === state ? 'active' : 'away'} data-done={count > 0 ? '1' : '0'}>
            <span aria-hidden="true">{count > 0 ? '✓' : '○'}</span>{' '}
            {count > 0 ? t('trade.goal.terminal', { city: city.cityName ?? '', count }) : t('trade.goal.noTerminal', { city: city.cityName ?? '' })}
          </li>
        );
      })}
      <li className={lines.length > 0 ? 'done' : undefined} data-trade-lines={lines.length} data-done={lines.length > 0 ? '1' : '0'}>
        <span aria-hidden="true">{lines.length > 0 ? '✓' : '○'}</span>{' '}
        {lines.length > 0 ? t('trade.goal.lines', { count: lines.length, trucks }) : t('trade.goal.noLines')}
      </li>
      {lines.length > 0 && (
        <li className={today < 0 ? 'line-loss' : undefined} data-trade-today={Math.round(today)}>
          {t('trade.goal.today', { profit: formatMoney(today) })}
        </li>
      )}
    </ul>
  );
}

/**
 * Herkesin nakliyecisi (Tur 60): rakip rakip bugün taşınan mağaza; kinli
 * rakip teklif getirmiyor, satırında yazıyor.
 */
function FreightChecklist({ state, rivals, outlets }: { state: GameState; rivals: number; outlets: number }): ReactElement {
  const status = freightGoalStatus(state, rivals, outlets);
  return (
    <ul className="scenario-checklist" aria-label={t('hud.scenario.freightLabel')}>
      {status.rivals.map((rival) => (
        <li
          key={rival.companyId}
          className={rival.outlets > 0 ? 'done' : undefined}
          data-freight-rival={rival.companyId}
          data-hostile={rival.hostile ? '1' : '0'}
          data-done={rival.outlets > 0 ? '1' : '0'}
        >
          <span aria-hidden="true">{rival.outlets > 0 ? '✓' : rival.hostile ? '✗' : '○'}</span>{' '}
          {t(rival.hostile ? 'hud.scenario.freightRivalHostile' : 'hud.scenario.freightRival', { name: rival.name, outlets: rival.outlets })}
        </li>
      ))}
    </ul>
  );
}

/** Kentsel dönüşüm (Tur 60): dolu birim, inşaattaki birim ve açılmış dönüşüm projeleri. */
function RentalChecklist({ state, units, renewals }: { state: GameState; units: number; renewals: number }): ReactElement {
  const status = rentalGoalStatus(state);
  const items: Array<{ key: string; done: boolean; label: string }> = [
    {
      key: 'units',
      done: status.occupied >= units,
      label: t('hud.scenario.rentalUnits', { occupied: formatNumber(status.occupied), target: formatNumber(units), total: formatNumber(status.units) }),
    },
  ];
  // Dönüşüm istemeyen hedefte (paketten, `renewals: 0`) o madde yok.
  if (renewals > 0) {
    items.push({
      key: 'renewals',
      done: status.renewals >= renewals,
      label: t('hud.scenario.rentalRenewals', { done: status.renewals, target: renewals, building: status.renewalsBuilding }),
    });
  }
  if (status.building > 0) items.push({ key: 'building', done: false, label: t('hud.scenario.rentalBuilding', { units: formatNumber(status.building) }) });
  return (
    <ul className="scenario-checklist" aria-label={t('hud.scenario.rentalLabel')}>
      {items.map((item) => (
        <li key={item.key} className={item.done ? 'done' : undefined} data-rental-item={item.key} data-done={item.done ? '1' : '0'}>
          <span aria-hidden="true">{item.done ? '✓' : '○'}</span> {item.label}
        </li>
      ))}
    </ul>
  );
}
