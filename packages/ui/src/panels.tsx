import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BUILDING_BY_ID, CATEGORIES, DISTRICT_ARCHETYPES, CONSUMER_CATEGORIES, GOODS_BY_CATEGORY, GOOD_BY_ID, REAL_ESTATE, STRUCTURE_BY_ID, formatDecimal, formatPercent, getDifficulty, numberLocale } from '@capital/content';
import {
  AUCTION_PERIOD_DAYS,
  activeFad,
  buildOptions,
  categoryBreakdown,
  companyRanking,
  districtOpportunity,
  districtPressure,
  effectivePriceMultiplier,
  estimateInvestment,
  formatMoney,
  freightClient,
  freightPenalty,
  freePlotsIn,
  getBuildingOnTile,
  getPlayer,
  goodShares,
  headquarters,
  isProject,
  lateCostsEnabled,
  overheadRate,
  projectBuilding,
  PROJECTION_DAYS,
  rankedBuildOptions,
  renewalBlocker,
  renewalFee,
  renewalRight,
  tilePrice,
} from '@capital/core';
import type { IndirectEstimate, InvestmentEstimate, Projection } from '@capital/core';
import { AUTOSAVE_SLOT, MAX_SLOTS, listSaves } from '@capital/persistence';
import type { SaveMeta } from '@capital/persistence';
import { ChainPanel } from './ChainPanel';
import { FreightDesk } from './FreightDesk';
import { PowerDesk } from './PowerDesk';
import { RentDesk } from './RentDesk';
import { useCollapsible } from './collapse';
import { CompetitionPanel } from './CompetitionPanel';
import { AuctionPanel } from './AuctionPanel';
import { ProjectPanel, ProjectSiteNote } from './ProjectPanel';
import { MarketPanel } from './MarketPanel';
import { GoalsPanel } from './GoalsPanel';
import { HoldingPanel } from './HoldingPanel';
import { CareerPanel } from './CareerPanel';
import { CouncilPanel } from './CouncilPanel';
import { LeaguePanel } from './LeaguePanel';
import { SettingsPanel } from './SettingsPanel';
import { useDialogFocus } from './dialog';
import { BankSection, WorkforceSection } from './CompanyFinance';
import { BoostChips } from './DecisionCard';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { useGame, useGameState } from './useGame';
import { startTutorial } from './tutorial';

/* ------------------------------------------------------------------ yapı */

/**
 * Yapı menüsü.
 *
 * Her binanın yanında, SEÇİLİ BÖLGE için hesaplanmış tahmini günlük kâr ve
 * geri ödeme süresi yazar. Oyuncunun elektronik tablo tutması gerekmez —
 * hesabı oyun yapar, karar oyuncunun kalır. Bu tahmin, rakip yapay zekânın
 * kullandığı formülün birebir aynısıdır.
 */
/** Yapı menüsünün katlama ikonu — vinç/iskele. */
function BuildIcon(): ReactElement {
  return (
    <svg
      className="collapse-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 21V6l8-3v18" />
      <path d="M12 10h8v11" />
      <path d="M3 21h18" />
      <path d="M7 8v0M7 12v0M7 16v0M16 14v0" />
    </svg>
  );
}

export function BuildPanel(): ReactElement {
  const { view, setView, run, toast } = useGame();
  const state = useGameState();
  const player = getPlayer(state);

  const selectedTile = view.selectedTileId !== null ? state.map.tiles[view.selectedTileId] : undefined;
  const districtId = selectedTile?.districtId ?? null;
  const district = districtId !== null ? state.districts[districtId] : undefined;

  // Bölge seçiliyse liste PARSEL BAŞINA GETİRİYE göre sıralanır.
  //
  // Oyunun kıt kaynağı para değil toprak: sınırsız nakitle koşulan bir
  // oyunda bile karşılanmayan talep %52'de kalıyor ve denemelerin
  // neredeyse tamamında "boş parsel yok" çıkıyor. Bir bina bir parsel
  // kapladığına göre oyuncunun sorusu "param ne zaman geri döner" değil,
  // "bu parselden en çok ne çıkar" — cevabı da günlük kâr.
  const ranked = districtId !== null ? rankedBuildOptions(state, districtId, selectedTile?.id) : null;
  const options = ranked ?? buildOptions(state).map((o) => ({ ...o, estimate: null, bestPick: false, indirect: null }));
  const freePlots = districtId !== null ? freePlotsIn(state, districtId) : null;
  const { open, toggle } = useCollapsible();

  return (
    <section className={open ? 'buildpanel' : 'buildpanel closed'} aria-label={t('panels.build.ariaLabel')}>
      {/*
       * Katlama başlığı yalnızca dar ekranda görünüyor (CSS).
       *
       * Ölçüm: bu panel 390×664'lük bir ekranda 292 px kaplıyordu, yani
       * ekranın %44'ü. Sürekli açık durması gereken bir şey değil —
       * oyuncu bir arsa seçtikten SONRA bakıyor. Kapalıyken hangi
       * bölgeye baktığını ve kaç parsel kaldığını yine söylüyor, çünkü
       * katlamak durumu gizlemek anlamına gelmemeli.
       */}
      <button
        type="button"
        className="collapse-head"
        onClick={toggle}
        aria-expanded={open}
        data-collapse="build"
      >
        <BuildIcon />
        <span className="collapse-title">
          {district ? t('panels.build.titleWithDistrict', { district: district.name }) : t('panels.build.title')}
          {district && freePlots !== null && (
            <span className={freePlots === 0 ? 'collapse-badge tight' : 'collapse-badge'}>
              {freePlots === 0 ? t('panels.build.badge.noFreePlots') : t('panels.build.badge.freePlots', { count: freePlots })}
            </span>
          )}
        </span>
        <span className="collapse-chevron" aria-hidden="true" />
      </button>

      <header>
        <h2>{t('panels.build.title')}</h2>
        <p className="muted">
          {district
            ? t('panels.build.subtitle.district', { district: district.name })
            : t('panels.build.subtitle.noSelection')}
        </p>
        {/* Dönüşüm hakkı (Tur 58): proje imar artışıyla; başka bina hakkı düşürüyor. */}
        {selectedTile && selectedTile.ownerId === player.id && !selectedTile.buildingId && renewalRight(state, selectedTile.id) && (
          <p className="renewal-note" data-renewal-right={selectedTile.id}>
            {t('panels.build.renewalRight', {
              bonus: formatPercent(Math.round(REAL_ESTATE.renewal.capacityBonus * 100)),
              holders: formatPercent(Math.round(REAL_ESTATE.renewal.rightHolders * 100)),
            })}
          </p>
        )}
        {district && freePlots !== null && (
          <p className={freePlots <= 4 ? 'buildpanel-scarce tight' : 'buildpanel-scarce'}>
            {freePlots === 0
              ? t('panels.build.scarce.none')
              : t('panels.build.scarce.count', { count: freePlots })}
          </p>
        )}
      </header>

      <ul className="buildlist">
        {options.map(({ def, unlocked, affordable, estimate, bestPick, indirect }) => {
          const selected = view.ghostDefId === def.id;

          return (
            <li key={def.id}>
              <button
                type="button"
                className={`buildcard${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`}
                disabled={!unlocked}
                onClick={() => {
                  if (!affordable) {
                    toast(t('panels.build.toast.noCash', { name: def.name, cost: formatMoney(def.cost) }), 'bad');
                    return;
                  }
                  setView({ ghostDefId: selected ? null : def.id });
                }}
                title={def.description}
              >
                <span className="buildcard-swatch" style={{ background: def.color }} />
                <span className="buildcard-body">
                  <span className="buildcard-top">
                    <span className="buildcard-name">
                      {def.name}
                      {bestPick && <span className="buildcard-best">{t('panels.build.bestPick')}</span>}
                    </span>
                    <span className={affordable ? 'buildcard-cost' : 'buildcard-cost short'}>
                      {formatMoney(def.cost)}
                    </span>
                  </span>
                  <span className="buildcard-meta">
                    {def.role === 'energy' ? t('panels.build.role.energy') : CATEGORIES[def.category].name}
                    {def.role === 'rental' && t('panels.build.role.rental')}
                    {def.buildDays ? t('panels.build.project', { days: def.buildDays }) : ''}
                    {def.role === 'logistics' && t('panels.build.role.logistics')}
                    {def.role === 'extract' && t('panels.build.role.extract')}
                    {def.role === 'process' && t('panels.build.role.process')}
                    {def.zones && (def.role === 'rental' ? t(def.category === 'office' ? 'panels.build.zonedOffice' : 'panels.build.zonedHousing') : t('panels.build.zoned'))}
                  </span>
                  {!unlocked ? (
                    <span className="buildcard-lock">
                      {t('panels.build.locked', { netWorth: formatMoney(def.unlockNetWorth) })}
                    </span>
                  ) : estimate ? (
                    <EstimateLine estimate={estimate} indirect={indirect} role={def.role} buildDays={def.buildDays} />
                  ) : (
                    <span className="buildcard-hint">{def.description}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {view.ghostDefId && (
        <div className="placing">
          <span>
            <strong>{BUILDING_BY_ID[view.ghostDefId]?.name}</strong>
            {t('panels.build.placing')}
          </span>
          <button type="button" onClick={() => setView({ ghostDefId: null })}>
            {t('panels.build.cancelPlacing')}
          </button>
        </div>
      )}

      {view.ghostDefId && selectedTile && !selectedTile.buildingId && INDIRECT_ROLES.has(BUILDING_BY_ID[view.ghostDefId]?.role ?? '') && (
        <ProjectionBox key={`${view.ghostDefId}:${selectedTile.id}`} defId={view.ghostDefId} tileId={selectedTile.id} />
      )}

      {view.ghostDefId && selectedTile && selectedTile.ownerId === player.id && !selectedTile.buildingId && (
        <button
          type="button"
          className="primary"
          data-action="build-selected"
          onClick={() => {
            if (run({ type: 'BUILD', tileId: selectedTile.id, defId: view.ghostDefId! })) {
              setView({ ghostDefId: null });
            }
          }}
        >
          {t('panels.build.buildOnSelected')}
        </button>
      )}
    </section>
  );
}

const INDIRECT_ROLES = new Set(['logistics', 'research', 'marketing']);

// Anahtar tutuyor, metin değil: `t` çizim anında çağrılsın, dil değişince
// modül yüklendiği andaki metinde takılı kalmasın.
const INDIRECT_HINT: Record<string, MessageKey> = {
  energy: 'panels.estimate.indirectHint.energy',
  logistics: 'panels.estimate.indirectHint.logistics',
  research: 'panels.estimate.indirectHint.research',
  marketing: 'panels.estimate.indirectHint.marketing',
};

/** Santralin tahmini (Tur 57): kendi binalarına kazanç, rakiplere satış, yakıt; bugünkü fiyatla. */
function EnergyPotentialLine({ indirect }: { indirect: IndirectEstimate }): ReactElement | null {
  const energy = indirect.energy;
  if (!energy || energy.own + energy.rival === 0) return null;
  return (
    <span className="freight-potential" data-energy-potential={energy.own + energy.rival}>
      {t('panels.estimate.energy', {
        own: energy.own,
        rival: energy.rival,
        saved: formatMoney(energy.saved),
        sold: formatMoney(energy.sold),
        fuel: formatMoney(energy.fuel),
      })}
    </span>
  );
}

/** Terminalin taşıma potansiyeli (Tur 56): katkıya girmiyor, ayrı yazıyor. */
function FreightPotential({ indirect }: { indirect: IndirectEstimate }): ReactElement | null {
  const freight = indirect.freight;
  if (!freight || freight.outlets === 0) return null;
  return (
    <span className="freight-potential" data-freight-potential={freight.outlets}>
      {t('panels.estimate.freight', { count: freight.outlets, fee: formatMoney(freight.fee) })}
    </span>
  );
}

function EstimateLine({
  estimate,
  indirect,
  role,
  buildDays,
}: {
  estimate: InvestmentEstimate;
  indirect?: IndirectEstimate | null;
  role: string;
  /** Proje (Tur 58): kâr açılıp dolduktan sonra, geri ödeme inşaat ve doluş dahil. */
  buildDays?: number;
}): ReactElement {
  if (!estimate.direct) {
    const hint = t(INDIRECT_HINT[role] ?? 'panels.estimate.indirectHint.default');
    if (!indirect) return <span className="buildcard-hint">{hint}</span>;
    if (indirect.none)
      return (
        <span className="buildcard-hint">
          {hint} {indirect.none}
          <FreightPotential indirect={indirect} />
        </span>
      );
    // Dolaylı katkı: bugünkü şehirde, etkisi oturduğunda (Tur 21).
    const where = indirect.energy
      ? t('panels.estimate.where.powered', { count: indirect.covered ?? 0 })
      : indirect.covered !== undefined
        ? t('panels.estimate.where.covered', { count: indirect.covered })
        : indirect.focus
          ? t('panels.estimate.where.focus', { category: CATEGORIES[indirect.focus].name })
          : '';
    return (
      <span
        className={`estimate ${indirect.dailyProfit > 0 ? 'ok' : 'weak'}`}
        data-indirect={role}
        title={t('panels.estimate.indirectTitle')}
      >
        {t('panels.estimate.indirectGain', { gain: formatMoney(indirect.dailyGain), where })}{' '}
        {Number.isFinite(indirect.paybackDays) ? t('panels.estimate.payback', { days: Math.round(indirect.paybackDays) }) : t('panels.estimate.indirectNoPayback')}
        {indirect.rampDays > 0 ? t('panels.estimate.ramp', { days: indirect.rampDays }) : ''}
        <FreightPotential indirect={indirect} />
        <EnergyPotentialLine indirect={indirect} />
      </span>
    );
  }
  // "İyi" ölçütü artık geri ödeme değil, kârın kendisi. Geri ödeme
  // ikinci sırada duruyor çünkü paranın ne zaman döneceği hâlâ önemli —
  // ama parsel kıtken belirleyici olan soru bu değil.
  const good = estimate.dailyProfit > 0;
  // Kendi şubelerinden alınan kâr tahminden düşülüyor (Tur 25); oyuncu
  // "neden bu kadar az?" diye sormasın, söyleyelim. Küçük tutarlar gürültü.
  const cannibalized = Math.round(estimate.cannibalized);
  return (
    <span className={`estimate ${good ? 'ok' : 'weak'}`}>
      {t('panels.estimate.directProfit', { profit: formatMoney(estimate.dailyProfit) })}{' '}
      {Number.isFinite(estimate.paybackDays)
        ? t('panels.estimate.payback', { days: Math.round(estimate.paybackDays) })
        : t('panels.estimate.loss')}
      {cannibalized >= 50 ? (
        <span className="cannibal" data-cannibalized={cannibalized}>
          {t('panels.estimate.cannibalized', { amount: formatMoney(cannibalized) })}
        </span>
      ) : null}
      {buildDays ? (
        <span className="project-note" data-project-estimate={Math.round(estimate.utilisation * 100)}>
          {t('panels.estimate.project', { days: buildDays, occupancy: formatPercent(Math.round(estimate.utilisation * 100)) })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * İsteğe bağlı 120 günlük projeksiyon (Tur 21). Hızlı tahmin bugünkü şehri
 * ölçüyor; Ar-Ge ve pazarlamanın katkısı ise şehir büyüdükçe büyüyor. İki
 * kopya × 120 gün pahalı, o yüzden yalnızca düğmeye basınca.
 */
function ProjectionBox({ defId, tileId }: { defId: string; tileId: number }): ReactElement {
  const { engine } = useGame();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Projection | null | undefined>(undefined);
  return (
    <div className="projection" data-projection={result ? 'done' : busy ? 'busy' : 'idle'}>
      {result ? (
        <p>
          {t('panels.projection.atDay', { days: PROJECTION_DAYS })}{' '}
          <strong className={result.finalProfit > 0 ? 'pos' : 'neg'}>
            {result.finalProfit >= 0 ? '+' : '−'}
            {t('panels.projection.perDay', { amount: formatMoney(Math.abs(result.finalProfit)) })}
          </strong>{' '}
          {t('panels.projection.profitNote', { gain: formatMoney(result.finalGain) })}
        </p>
      ) : result === null ? (
        <p className="muted">{t('panels.projection.failed')}</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // Bir kare bekle: "hesaplanıyor" yazısı çizilsin.
            setTimeout(() => {
              const state = engine.getState();
              setResult(projectBuilding(state, state.playerCompanyId, defId, tileId));
              setBusy(false);
            }, 30);
          }}
        >
          {busy ? t('panels.projection.busy') : t('panels.projection.run', { days: PROJECTION_DAYS })}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- inspector */

/** Seçili arsanın tüm hikâyesi: bölge, fiyat, bina ve kâr/zarar kırılımı. */
export function Inspector(): ReactElement | null {
  const { view, setView, run } = useGame();
  const state = useGameState();
  const player = getPlayer(state);
  // Derli toplu hâl: istatistikler gizli, yalnızca başlık ve düğmeler. Dar
  // ekranda detay alt sayfa olduğu için yapı listesine yer açıyor (Tur 26).
  // Kare değişince kendiliğinden kalkıyor.
  const [compactTile, setCompactTile] = useState<number | null>(null);

  if (view.selectedTileId === null) {
    return (
      <aside className="inspector empty">
        <h2>{t('panels.inspector.emptyTitle')}</h2>
        <p className="muted">
          {t('panels.inspector.emptyHint')}
        </p>
      </aside>
    );
  }

  const tile = state.map.tiles[view.selectedTileId];
  if (!tile) return null;

  const district = state.districts[tile.districtId]!;
  const archetype = DISTRICT_ARCHETYPES[district.archetype];
  const building = getBuildingOnTile(state, tile.id);
  const owner = tile.ownerId ? state.companies[tile.ownerId] : null;
  const price = tilePrice(state, tile.id, player.id);

  return (
    // `has-selection`: dar ekranda bu panel haritanın HEMEN ALTINA
    // taşınıyor. Bir kareye dokunmak doğrudan bir eylem; detayının ve
    // satın alma butonunun kaydırma gerektirmeden görünmesi gerekiyor.
    <aside className={compactTile === tile.id ? 'inspector has-selection compact' : 'inspector has-selection'}>
      <header className="inspector-head">
        <div>
          <h2>{district.name}</h2>
          <p className="muted">
            {t('panels.inspector.tileLabel', { x: tile.x + 1, y: tile.y + 1, archetype: archetype.name })}
            {/*
             * Merkez rozeti burada, binanın satırında değil: oyuncu bir
             * kareye "burası neresi" diye bakıyor ve merkez o sorunun
             * cevabının parçası.
             */}
            {building && headquarters(state, player.id)?.id === building.id && (
              <span className="hq-badge" title={t('panels.inspector.hqBadgeTitle')}>
                {t('panels.inspector.hqBadge')}
              </span>
            )}
          </p>
        </div>
        <button type="button" className="icon" onClick={() => setView({ selectedTileId: null })} aria-label={t('panels.common.close')}>
          ×
        </button>
      </header>

      <div className="statgrid">
        <Stat label={t('panels.inspector.stat.population')} value={Math.round(district.population).toLocaleString(numberLocale())} />
        <Stat label={t('panels.inspector.stat.incomeLevel')} value={formatPercent(Math.round(district.incomeLevel * 100))} />
        <Stat label={t('panels.inspector.stat.landValue')} value={formatMoney(tile.landValue)} />
        <Stat label={t('panels.inspector.stat.openDemand')} value={formatPercent(Math.round(districtOpportunity(district) * 100))} />
        {/*
          Gelişme basıncı: şehrin BURAYA ne kadar yığıldığı. Yüksekse
          boş parseller yakında yapılaşır ve devralma primi devreye
          girer — yani bu sayı "acele et" demenin sayısal hâli.
        */}
        <Stat label={t('panels.inspector.stat.development')} value={formatPercent(Math.round(districtPressure(state, district) * 100))} />
      </div>

      <ProjectSiteNote tileId={tile.id} />

      <div className="demandlist">
        <h3>{t('panels.inspector.demandTitle')}</h3>
        {Object.entries(district.demand)
          .filter(([, value]) => value > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([categoryId, value]) => {
            const unmet = district.unmet[categoryId as keyof typeof district.unmet] ?? 0;
            return (
              <div key={categoryId} className="demandrow">
                <span>{CATEGORIES[categoryId as keyof typeof CATEGORIES].name}</span>
                <span className="bar">
                  <span className="bar-fill" style={{ width: `${Math.round(unmet * 100)}%` }} />
                </span>
                <span className="demandvalue">{t('panels.inspector.demandUnmet', { percent: Math.round(unmet * 100) })}</span>
              </div>
            );
          })}
      </div>

      {building ? (
        <BuildingDetail buildingId={building.id} />
      ) : owner ? (
        owner.id === player.id ? (
          <div className="actions">
            <p className="muted">{t('panels.inspector.ownVacant')}</p>
            {tile.renewal && (
              <p className="renewal-note" data-renewal-right={tile.id}>
                {t('panels.build.renewalRight', {
                  bonus: formatPercent(Math.round(REAL_ESTATE.renewal.capacityBonus * 100)),
                  holders: formatPercent(Math.round(REAL_ESTATE.renewal.rightHolders * 100)),
                })}
              </p>
            )}
            {/*
             * Telefonda yapı listesi bu detayın ARKASINDA kalıyor (detay alt
             * sayfa, liste sütunda). Rehber bunu ilk mobil yürüyüşte buldu
             * (Tur 26): oyuncu arsayı alıyor, sonra ne kuracağını göremiyordu.
             * İki düğme o boşluğu kapatıyor: bina seçiliyse doğrudan kur,
             * değilse listeyi aç ve öne getir (ikincisi yalnızca dar ekranda;
             * geniş ekranda liste zaten solda açık).
             */}
            {view.ghostDefId && BUILDING_BY_ID[view.ghostDefId] ? (
              <button
                type="button"
                className="primary"
                data-action="build-here"
                onClick={() => {
                  if (run({ type: 'BUILD', tileId: tile.id, defId: view.ghostDefId! })) setView({ ghostDefId: null });
                }}
              >
                {t('panels.inspector.buildHere', { name: BUILDING_BY_ID[view.ghostDefId]!.name })}
              </button>
            ) : (
              <button
                type="button"
                className="primary narrow-only"
                data-action="show-build"
                onClick={() => {
                  setCompactTile(tile.id);
                  revealBuildPanel();
                }}
              >
                {t('panels.inspector.chooseBuilding')}
              </button>
            )}
            <button type="button" data-secondary onClick={() => run({ type: 'SELL_TILE', tileId: tile.id })}>
              {t('panels.inspector.sellTile', { price: formatMoney(tile.landValue * 0.85) })}
            </button>
          </div>
        ) : (
          <div className="actions">
            <p className="owner" style={{ color: owner.color }}>
              {t('panels.inspector.ownedBy', { owner: owner.name })}
            </p>
          </div>
        )
      ) : (
        <PlotActions tileId={tile.id} price={price} />
      )}
    </aside>
  );
}

/**
 * Kentsel dönüşüm başvurusu (Tur 58): belediye sıradaki ihalesini bu
 * parsele açıyor. Satın almaktan farkı: ihalede rakipler de var, ama kazanan
 * dönüşüm hakkını alıyor (proje imar artışıyla, hak sahipleri yeni binada).
 */
function RenewalRequest({ tileId }: { tileId: number }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const player = getPlayer(state);
  const request = state.renewalRequest;
  if (request?.tileId === tileId) {
    const opens = (Math.floor(state.time.day / AUCTION_PERIOD_DAYS) + 1) * AUCTION_PERIOD_DAYS;
    return (
      <p className="renewal-note" data-renewal-pending={tileId}>
        {t('panels.plot.renewalPending', { days: opens - state.time.day })}
      </p>
    );
  }
  const blocker = renewalBlocker(state, tileId);
  if (blocker !== null) return request ? <p className="muted">{blocker}</p> : null;
  const fee = renewalFee(state, tileId);
  return (
    <>
      <button type="button" disabled={player.cash < fee} onClick={() => run({ type: 'REQUEST_RENEWAL', tileId })} data-renewal-request={tileId}>
        {t('panels.plot.renewalRequest', { fee: formatMoney(fee) })}
      </button>
      <p className="muted">
        {t('panels.plot.renewalNote', {
          bonus: formatPercent(Math.round(REAL_ESTATE.renewal.capacityBonus * 100)),
          holders: formatPercent(Math.round(REAL_ESTATE.renewal.rightHolders * 100)),
        })}
      </p>
    </>
  );
}

/** Yapı listesini açar ve görünür alana getirir (dar ekranda katlı ve detayın arkasında). */
function revealBuildPanel(): void {
  const head = document.querySelector<HTMLButtonElement>('[data-collapse="build"]');
  if (head?.getAttribute('aria-expanded') === 'false') head.click();
  requestAnimationFrame(() => {
    document.querySelector('.buildpanel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

/**
 * Sahipsiz bir parselin durumu.
 *
 * Gerçek şehirdeki gibi üç ayrı hâl var: satın alınamayan kamu alanı,
 * doğrudan alınabilen boş parsel, ve ancak mevcut sahibinden primli
 * devralınabilen dolu parsel.
 */
function PlotActions({ tileId, price }: { tileId: number; price: number }): ReactElement {
  const { run } = useGame();
  const state = useGameState();
  const player = getPlayer(state);
  const tile = state.map.tiles[tileId]!;
  const structure = tile.structureId ? STRUCTURE_BY_ID[tile.structureId] : null;

  if (tile.kind === 'road') {
    return (
      <div className="actions">
        <p className="plot-note">{t('panels.plot.road')}</p>
      </div>
    );
  }

  if (tile.kind === 'civic') {
    return (
      <div className="actions">
        <p className="plot-note">
          {t('panels.plot.civic', { name: structure?.name ?? t('panels.plot.civicDefaultName') })}
        </p>
        {structure && <p className="muted">{structure.description}</p>}
      </div>
    );
  }

  // Kilitli bölge: buton yerine takvim. Butonu gösterip komutu motorda
  // reddettirmek de "çalışırdı" ama oyuncuya neden'i söylemezdi.
  const district = state.districts[tile.districtId];
  if (district?.opensOnDay !== undefined && state.time.day < district.opensOnDay) {
    return (
      <div className="actions">
        <p className="plot-note">
          {t('panels.plot.lockedDistrict', { district: district.name, days: district.opensOnDay - state.time.day })}
        </p>
        <p className="muted">
          {t('panels.plot.lockedHint')}
        </p>
      </div>
    );
  }

  if (structure) {
    return (
      <div className="actions">
        <p className="plot-note">{t('panels.plot.structure', { name: structure.name })}</p>
        <p className="muted">{structure.description}</p>
        <button
          type="button"
          className="primary"
          disabled={player.cash < price}
          onClick={() => run({ type: 'BUYOUT_TILE', tileId })}
        >
          {t('panels.plot.buyout', { price: formatMoney(price) })}
        </button>
        <p className="muted">
          {/* Çarpan yoksa eskisi gibi boş kalır (React `undefined`'ı çizmiyordu). */}
          {t('panels.plot.buyoutNote', { multiplier: structure.buyoutMultiplier != null ? formatDecimal(structure.buyoutMultiplier, 1) : '' })}
        </p>
        <RenewalRequest tileId={tileId} />
      </div>
    );
  }

  return (
    <div className="actions">
      <p className="plot-note vacant">{t('panels.plot.vacant')}</p>
      <button
        type="button"
        className="primary"
        data-action="buy-tile"
        disabled={player.cash < price}
        onClick={() => run({ type: 'BUY_TILE', tileId })}
      >
        {t('panels.plot.buy', { price: formatMoney(price) })}
      </button>
      {player.cash < price && <p className="muted">{t('panels.plot.noCash')}</p>}
    </div>
  );
}

function BuildingDetail({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run } = useGame();
  const state = useGameState();
  const building = state.buildings[buildingId];
  if (!building) return null;

  const def = BUILDING_BY_ID[building.defId];
  const owner = state.companies[building.companyId];
  if (!def || !owner) return null;

  const isPlayer = owner.id === state.playerCompanyId;
  const ledger = building.last;
  const support =
    def.role === 'logistics' || def.role === 'research' || def.role === 'marketing' || def.role === 'energy';
  // Enerjisini bir santralden alan bina (Tur 57): oyuncunun santrali ya da oyuncunun binası.
  const power = ledger.power;
  const plant = power ? state.buildings[power.plantId] : undefined;
  const plantDef = plant ? BUILDING_BY_ID[plant.defId] : undefined;

  return (
    <div className="building">
      <h3>
        <span className="buildcard-swatch" style={{ background: def.color }} /> {def.name}
      </h3>
      {!isPlayer && (
        <p className="owner" style={{ color: owner.color }}>
          {t('panels.building.operatedBy', { owner: owner.name })}
        </p>
      )}

      {/*
        Destek binaları (depo, Ar-Ge, pazarlama) kendi defterlerinde
        ASLA kâr göstermez: değerleri başka binaların satırına dağılır.
        Onlara satış defteri çizmek "bu bina bozuk" dedirtiyordu — ciro 0,
        doluluk %0, bölge payı %0 ve kırmızı bir günlük kâr. Bunun yerine
        gideri dürüstçe gider diye yazıp ne işe yaradığını söylüyoruz.
      */}
      {support ? (
        <>
          {/* Santral (Tur 57): rakiplere satış ve yakıt; kendi binalarına verdiği masada. */}
          {def.role === 'energy' ? (
            <div className="ledger">
              <LedgerRow label={t('panels.building.ledger.powerSales')} value={ledger.revenue} />
              <LedgerRow label={t('panels.building.ledger.fuel')} value={-ledger.cogs} />
              <LedgerRow label={t('panels.building.ledger.upkeep')} value={-ledger.upkeep} />
              <LedgerRow label={t('panels.building.ledger.wages')} value={-ledger.wages} />
              <LedgerRow label={t('panels.building.ledger.dailyProfit')} value={ledger.profit} strong />
            </div>
          ) : /* Terminal (Tur 56) taşıma ücreti yazıyor: gideri ve kârı birlikte. */
          def.fleet ? (
            <div className="ledger">
              <LedgerRow label={t('panels.building.ledger.freight')} value={ledger.revenue} />
              <LedgerRow label={t('panels.building.ledger.upkeep')} value={-ledger.upkeep} />
              <LedgerRow label={t('panels.building.ledger.wages')} value={-ledger.wages} />
              <LedgerRow label={t('panels.building.ledger.dailyProfit')} value={ledger.profit} strong />
              {building.profitTrend !== undefined && (
                <LedgerRow label={t('panels.building.ledger.profitTrend')} value={Math.round(building.profitTrend)} />
              )}
            </div>
          ) : (
            <div className="ledger">
              <LedgerRow label={t('panels.building.ledger.upkeep')} value={-ledger.upkeep} />
              <LedgerRow label={t('panels.building.ledger.wages')} value={-ledger.wages} />
              <LedgerRow label={t('panels.building.ledger.dailyCost')} value={-(ledger.upkeep + ledger.wages)} strong />
            </div>
          )}
          <p className="muted">
            {def.role === 'energy'
              ? t('panels.building.supportNote.energy')
              : def.fleet
              ? t('panels.building.supportNote.terminal')
              : def.role === 'logistics'
                ? t('panels.building.supportNote.logistics')
                : t('panels.building.supportNote.focus')}
          </p>
        </>
      ) : (
        <>
          <div className="ledger">
            <LedgerRow label={t('panels.building.ledger.revenue')} value={ledger.revenue} />
            <LedgerRow label={t('panels.building.ledger.cogs')} value={-ledger.cogs} />
            <LedgerRow label={t('panels.building.ledger.upkeep')} value={-ledger.upkeep} />
            <LedgerRow label={t('panels.building.ledger.wages')} value={-ledger.wages} />
            <LedgerRow label={t('panels.building.ledger.dailyProfit')} value={ledger.profit} strong />
            {/*
              Tek günün defteri gürültülü; asıl soru "bu şube kazanıyor
              mu". Rakipler kapatma kararını bu eğilime bakarak veriyor —
              oyuncu da aynı sayıyı görmeli.
            */}
            {building.profitTrend !== undefined && (
              <LedgerRow label={t('panels.building.ledger.profitTrend')} value={Math.round(building.profitTrend)} />
            )}
          </div>

          {/* Kiralık (Tur 58): doluluk, hedef, kira; projede inşaat. Fiyat çarpanı kiralıkta işlemiyordu. */}
          {def.role === 'rental' ? (
            <RentDesk buildingId={buildingId} />
          ) : (
            <div className="statgrid small">
              <Stat label={t('panels.building.stat.utilization')} value={formatPercent(Math.round(ledger.capacityUsed * 100))} />
              <Stat label={t('panels.building.stat.share')} value={formatPercent(Math.round(ledger.share * 100))} />
              {/* Kampanyadaki rakibin satış fiyatı indirimli (Tur 37b): gösterilen, ödenen. */}
              <Stat
                label={t(
                  effectivePriceMultiplier(state, building) !== building.priceMultiplier
                    ? 'panels.building.stat.priceCampaign'
                    : 'panels.building.stat.price',
                )}
                value={`×${formatDecimal(effectivePriceMultiplier(state, building), 2)}`}
              />
            </div>
          )}
        </>
      )}

      {isPlayer && def.fleet ? <FreightDesk buildingId={buildingId} /> : null}
      {isPlayer && def.role === 'energy' ? <PowerDesk buildingId={buildingId} /> : null}

      {/* Enerjisi santralden (Tur 57): kendi binasında kazanç, rakibinkinde oyuncuya ödediği. */}
      {power && plant && plantDef && plant.companyId === state.playerCompanyId && (
        isPlayer ? (
          <p className="muted power-note" data-power-from={plant.id} data-power-saved={Math.round(power.saved)}>
            {t('panels.building.powerOwn', { plant: plantDef.name, saved: formatMoney(power.saved) })}
          </p>
        ) : (
          <p className="muted power-note" data-power-client={plant.id} data-power-bill={Math.round(power.bill)}>
            {t('panels.building.powerClient', { owner: owner.name, plant: plantDef.name, bill: formatMoney(power.bill) })}
          </p>
        )
      )}

      {/* Rakip mağazasının dağıtımını oyuncunun terminali yapıyorsa (Tur 56). */}
      {!isPlayer && def.role === 'outlet' && (() => {
        const client = freightClient(state, building);
        if (!client) return null;
        return (
          <p className="muted freight-client-note" data-freight-client={client.deal.id} data-freight-fee={Math.round(building.last.freight ?? 0)}>
            {t('panels.building.freightClient', { owner: owner.name, fee: formatMoney(building.last.freight ?? 0) })}
          </p>
        );
      })()}

      {isPlayer && def.role === 'outlet' && <ShelfEditor buildingId={buildingId} />}

      {isPlayer && (def.role === 'research' || def.role === 'marketing') && (
        <FocusEditor buildingId={buildingId} />
      )}

      {isPlayer && def.role === 'outlet' && (
        <div className="pricing">
          <label>
            <input
              type="checkbox"
              checked={building.autoPrice}
              onChange={(e) => run({ type: 'SET_AUTO_PRICE', buildingId, auto: e.target.checked })}
            />
            {t('panels.building.autoPrice')}
          </label>
          {!building.autoPrice && (
            <input
              type="range"
              min={0.6}
              max={1.8}
              step={0.02}
              value={building.priceMultiplier}
              onChange={(e) =>
                run({ type: 'SET_PRICE_MULTIPLIER', buildingId, multiplier: Number(e.target.value) })
              }
              aria-label={t('panels.building.priceMultiplierAria')}
            />
          )}
          <p className="muted">
            {t('panels.building.priceHint')}
          </p>
        </div>
      )}

      {isPlayer && def.fleet && (() => {
        // Terminali yıkmak sözleşmelerini bozar: bedel düğmeden önce yazsın.
        const deals = (state.freight?.contracts ?? []).filter((deal) => deal.terminalId === building.id);
        if (deals.length === 0) return null;
        const penalty = deals.reduce((sum, deal) => sum + freightPenalty(state, deal), 0);
        return <p className="muted" data-freight-demolish>{t('panels.freight.demolishWarning', { count: deals.length, penalty: formatMoney(penalty) })}</p>;
      })()}

      {isPlayer && (
        <button type="button" onClick={() => run({ type: 'DEMOLISH', tileId: building.tileId })}>
          {t('panels.building.demolish')}
        </button>
      )}
    </div>
  );
}

/**
 * Raf düzenleyici.
 *
 * Aynı kategorideki iki ürünün birim maliyeti denge kimliği yüzünden
 * AYNIDIR — yani raf seçimi bir maliyet kararı değil, bir KONUM kararı.
 * Bu yüzden her ürünün yanında o bölgedeki talep payı yazıyor: karar
 * verirken bakılacak tek sayı o.
 *
 * Yuva sayısı gerçek bir kısıt: tek yuvalı bakkal uzmanlaşmak zorunda,
 * kategorinin diğer ürününü rakibe bırakır.
 */
function ShelfEditor({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run, toast } = useGame();
  const state = useGameState();

  const building = state.buildings[buildingId];
  const def = building ? BUILDING_BY_ID[building.defId] : undefined;
  const district = building ? state.districts[building.districtId] : undefined;
  if (!building || !def || !district) return null;

  const goods = GOODS_BY_CATEGORY[def.category] ?? [];
  if (goods.length < 2) return null;

  const slots = def.slots ?? 1;
  // Bugünün payları: moda süresince satış da bunları kullanıyor (Codex #64).
  const shares = new Map(
    goodShares(district.archetype, def.category, activeFad(state)?.goodId ?? null).map((entry) => [entry.good.id, entry.share]),
  );

  const toggle = (goodId: string): void => {
    // Raftaki ürüne tıklamak onu çıkarır — son ürün değilse.
    if (building.stocked.includes(goodId)) {
      if (building.stocked.length === 1) {
        toast(t('panels.shelf.toast.lastItem'), 'info');
        return;
      }
      run({ type: 'SET_STOCK', buildingId, goodIds: building.stocked.filter((id) => id !== goodId) });
      return;
    }

    // Yuva doluysa DEĞİŞTİRİR, reddetmez. Reddetmek tek yuvalı dükkânı
    // çıkmaza sokuyordu: tek ürünü çıkaramıyor, ikinciyi ekleyemiyordu —
    // yani bakkalın "seçimi" hiç yapılamıyordu. Yerine bölgede en az
    // satan ürün rafı bırakır.
    if (building.stocked.length >= slots) {
      const weakest = [...building.stocked].sort(
        (a, b) => (shares.get(a) ?? 0) - (shares.get(b) ?? 0),
      )[0]!;
      const next = building.stocked.filter((id) => id !== weakest).concat(goodId);
      if (run({ type: 'SET_STOCK', buildingId, goodIds: next }) && slots > 1) {
        toast(t('panels.shelf.toast.removed', { good: GOOD_BY_ID[weakest]?.name ?? t('panels.shelf.someGood') }), 'info');
      }
      return;
    }

    run({ type: 'SET_STOCK', buildingId, goodIds: [...building.stocked, goodId] });
  };

  return (
    <div className="shelf">
      <div className="shelf-head">
        <span>{t('panels.shelf.title')}</span>
        <span className="muted">
          {t('panels.shelf.slots', { used: building.stocked.length, slots, district: district.name })}
        </span>
      </div>
      <ul className="shelf-list">
        {goods.map((good) => {
          const on = building.stocked.includes(good.id);
          return (
            <li key={good.id}>
              <button
                type="button"
                className={on ? 'shelf-chip on' : 'shelf-chip'}
                onClick={() => toggle(good.id)}
                aria-pressed={on}
              >
                <span className="shelf-dot" style={{ background: good.color }} />
                <span className="shelf-name">{good.name}</span>
                <span className="shelf-share">{formatPercent(Math.round((shares.get(good.id) ?? 0) * 100))}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        {slots === 1
          ? t('panels.shelf.hint.single')
          : t('panels.shelf.hint.multi')}
      </p>
    </div>
  );
}

/**
 * Odak düzenleyici — Ar-Ge merkezi ve pazarlama ofisi hangi kategoriye
 * çalışıyor.
 *
 * Bina tanımındaki `category` bu iki rol için anlamsız; asıl karar burada.
 * Her kategorinin yanında o kategorideki mağaza sayın yazıyor, çünkü
 * kolun faydası mağaza sayınla çarpılıyor — karar verirken bakılacak tek
 * sayı o. Sıfır mağazalı bir kategoriye atamak parayı boşa harcamaktır ve
 * arayüz bunu engellemek yerine SÖYLÜYOR.
 *
 * Kategori değiştirmek bedava değil: Ar-Ge primi eski kategoride tavansız
 * kalıp erimeye başlar. Ayrıca bir ceza yazılmadı, `runResearchTick` iki
 * yönlü çalıştığı için kendiliğinden oluyor.
 */
function FocusEditor({ buildingId }: { buildingId: string }): ReactElement | null {
  const { run, toast } = useGame();
  const state = useGameState();

  const building = state.buildings[buildingId];
  const def = building ? BUILDING_BY_ID[building.defId] : undefined;
  if (!building || !def) return null;

  const outletCounts = new Map<string, number>();
  for (const other of Object.values(state.buildings)) {
    if (other.companyId !== building.companyId) continue;
    const otherDef = BUILDING_BY_ID[other.defId];
    if (otherDef?.role !== 'outlet') continue;
    outletCounts.set(otherDef.category, (outletCounts.get(otherDef.category) ?? 0) + 1);
  }

  const arm = def.role === 'research' ? t('panels.focus.arm.research') : t('panels.focus.arm.marketing');

  return (
    <div className="shelf">
      <div className="shelf-head">
        <span>{t('panels.focus.title')}</span>
        <span className="muted">
          {t('panels.focus.summary', {
            category: building.focus ? CATEGORIES[building.focus].name : t('panels.focus.unassigned'),
            arm,
          })}
        </span>
      </div>
      <ul className="shelf-list">
        {CONSUMER_CATEGORIES.map((categoryId) => {
          const on = building.focus === categoryId;
          const outlets = outletCounts.get(categoryId) ?? 0;
          return (
            <li key={categoryId}>
              <button
                type="button"
                className={on ? 'shelf-chip on' : 'shelf-chip'}
                onClick={() => {
                  if (on) return;
                  if (run({ type: 'SET_FOCUS', buildingId, category: categoryId })) {
                    toast(t('panels.focus.toast.changed', { name: def.name, category: CATEGORIES[categoryId].name }), 'info');
                  }
                }}
                aria-pressed={on}
              >
                <span className="shelf-dot" style={{ background: CATEGORIES[categoryId].color }} />
                <span className="shelf-name">{CATEGORIES[categoryId].name}</span>
                <span className="shelf-share">{t('panels.focus.outletCount', { count: outlets })}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        {(outletCounts.get(building.focus ?? '') ?? 0) === 0
          ? t('panels.focus.hint.noOutlets')
          : t('panels.focus.hint.default')}
      </p>
    </div>
  );
}

function LedgerRow({ label, value, strong }: { label: string; value: number; strong?: boolean }): ReactElement {
  return (
    <div className={`ledgerrow${strong ? ' strong' : ''}`}>
      <span>{label}</span>
      <span className={value >= 0 ? 'pos' : 'neg'}>{formatMoney(value)}</span>
    </div>
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

/* ---------------------------------------------------------------- modallar */

export function ModalHost(): ReactElement | null {
  const { view } = useGame();
  if (view.openPanel === 'none') return null;
  // Panel değişince pencere yeniden kuruluyor: odak yeni panelin başına girsin.
  return <ModalFrame key={view.openPanel} />;
}

function ModalFrame(): ReactElement {
  const { view, setView } = useGame();
  const frame = useRef<HTMLDivElement>(null);
  useDialogFocus(frame);

  const titles: Record<string, string> = {
    chain: t('panels.modal.title.chain'),
    rivalry: t('panels.modal.title.rivalry'),
    auction: t('panels.modal.title.auction'),
    project: t('panels.modal.title.project'),
    bourse: t('panels.modal.title.bourse'),
    company: t('panels.modal.title.company'),
    rivals: t('panels.modal.title.rivals'),
    saves: t('panels.modal.title.saves'),
    help: t('panels.modal.title.help'),
    goals: t('panels.modal.title.goals'),
    council: t('panels.modal.title.council'),
    league: t('panels.modal.title.league'),
    cities: t('panels.modal.title.cities'),
    career: t('panels.modal.title.career'),
    settings: t('panels.modal.title.settings'),
  };

  return (
    <div className="modal-backdrop" onClick={() => setView({ openPanel: 'none' })}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={frame}
      >
        <header className="modal-head">
          <h2 id="modal-title">{titles[view.openPanel]}</h2>
          <button type="button" className="icon" onClick={() => setView({ openPanel: 'none' })} aria-label={t('panels.common.close')}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {view.openPanel === 'chain' && <ChainPanel />}
          {view.openPanel === 'rivalry' && <CompetitionPanel />}
          {view.openPanel === 'auction' && <AuctionPanel />}
          {view.openPanel === 'project' && <ProjectPanel />}
          {view.openPanel === 'bourse' && <MarketPanel />}
          {view.openPanel === 'company' && <CompanyPanel />}
          {view.openPanel === 'rivals' && <RivalsPanel />}
          {view.openPanel === 'saves' && <SavePanel />}
          {view.openPanel === 'help' && <HelpPanel />}
          {view.openPanel === 'goals' && <GoalsPanel />}
          {view.openPanel === 'council' && <CouncilPanel />}
          {view.openPanel === 'league' && <LeaguePanel />}
          {view.openPanel === 'cities' && <HoldingPanel />}
          {view.openPanel === 'career' && <CareerPanel />}
          {view.openPanel === 'settings' && <SettingsPanel />}
        </div>
      </div>
    </div>
  );
}

function CompanyPanel(): ReactElement {
  const { run } = useGame();
  const state = useGameState();
  const player = getPlayer(state);
  const rows = categoryBreakdown(state);
  const history = player.netWorthHistory;

  return (
    <div className="company">
      <label className="rename">
        {t('panels.company.nameLabel')}
        <input
          type="text"
          defaultValue={player.name}
          onBlur={(e) => run({ type: 'RENAME_COMPANY', name: e.target.value })}
          maxLength={32}
        />
      </label>

      <div className="statgrid">
        <Stat label={t('panels.company.stat.cash')} value={formatMoney(player.cash)} />
        <Stat label={t('panels.company.stat.debt')} value={formatMoney(player.debt)} />
        <Stat label={t('panels.company.stat.netWorth')} value={formatMoney(player.netWorth)} />
        <Stat label={t('panels.company.stat.dailyProfit')} value={formatMoney(player.today.profit)} />
      </div>
      {lateCostsEnabled(state) && (
        // Geç oyun giderleri (Tur 37a): büyüdükçe neden pahalılaştığını söyleyen iki satır.
        <div className="statgrid small" data-late-costs>
          <div className="stat" title={t('panels.company.stat.overheadTitle')}>
            <span className="stat-label">{t('panels.company.stat.overhead')}</span>
            <span className="stat-value">+{Math.round(overheadRate(state, player.id) * 100)}%</span>
          </div>
          <div className="stat" title={t('panels.company.stat.wealthTaxTitle')}>
            <span className="stat-label">{t('panels.company.stat.wealthTax')}</span>
            <span className="stat-value">{formatMoney(player.today.tax ?? 0)}</span>
          </div>
        </div>
      )}

      {player.boosts && player.boosts.length > 0 && (
        // Karar kartlarından süren etkiler (Tur 37b): neyin ne kadar daha süreceği.
        <div className="card-boosts" data-card-boosts>
          <span className="stat-label">{t('panels.company.boosts')}</span>
          <BoostChips boosts={player.boosts} day={state.time.day} />
        </div>
      )}

      <Sparkline values={history} />

      <BankSection />
      <WorkforceSection />

      <h3>{t('panels.company.breakdownTitle')}</h3>
      {rows.length === 0 ? (
        <p className="muted">{t('panels.company.noBusinesses')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('panels.company.col.sector')}</th>
              <th>{t('panels.company.col.outlets')}</th>
              <th>{t('panels.company.col.revenue')}</th>
              <th>{t('panels.company.col.profit')}</th>
              <th>{t('panels.company.col.share')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category}>
                <td>{CATEGORIES[row.category].name}</td>
                <td>{row.outlets}</td>
                <td>{formatMoney(row.revenue)}</td>
                <td className={row.profit >= 0 ? 'pos' : 'neg'}>{formatMoney(row.profit)}</td>
                <td>{formatPercent(Math.round(row.share * 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }): ReactElement | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <figure className="sparkline">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={t('panels.company.sparklineAria')}>
        <polyline className="sparkline-line" points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="muted">
        {t('panels.company.sparklineCaption', { days: values.length, min: formatMoney(min), max: formatMoney(max) })}
      </figcaption>
    </figure>
  );
}

function RivalsPanel(): ReactElement {
  const state = useGameState();
  const rows = companyRanking(state);

  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>{t('panels.rivals.col.company')}</th>
          <th>{t('panels.rivals.col.value')}</th>
          <th>{t('panels.rivals.col.buildings')}</th>
          <th>{t('panels.rivals.col.tiles')}</th>
          <th>{t('panels.rivals.col.strongest')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const best = Object.entries(row.company.marketShare).sort((a, b) => b[1] - a[1])[0];
          return (
            <tr key={row.company.id} className={row.company.isPlayer ? 'me' : undefined}>
              <td>{row.rank}</td>
              <td>
                <span className="dot" style={{ background: row.company.color }} /> {row.company.name}
                {row.company.isPlayer && t('panels.rivals.you')}
              </td>
              <td>{formatMoney(row.company.netWorth)}</td>
              <td>{row.buildings}</td>
              <td>{row.tiles}</td>
              <td>
                {best && best[1] > 0.01
                  ? `${CATEGORIES[best[0] as keyof typeof CATEGORIES].name} ${formatPercent(Math.round(best[1] * 100))}`
                  : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SavePanel(): ReactElement {
  const { saveTo, loadFrom, newGame, exportSave, exportSaveText, importSave, importSaveText } = useGame();
  const state = useGameState();
  const [slots, setSlots] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  /*
   * Elle aktarım kutusu — her ortamda çalışan tek yol.
   *
   * Yayınlanmış sayfada dosya indirme engelli olabilir ve dosya seçici
   * bazı çerçevelerde açılmaz. Metin her yerde kopyalanıp
   * yapıştırılabildiği için bu kutu son çare değil, eşit bir yol: dışa
   * aktarma engellenince kendiliğinden açılıyor.
   */
  const [manual, setManual] = useState<string | null>(null);

  const refresh = () => {
    void listSaves().then(setSlots);
  };
  useEffect(refresh, [state.time.day]);

  const rows = Array.from({ length: MAX_SLOTS }, (_, slot) => ({
    slot,
    meta: slots.find((m) => m.slot === slot),
  }));

  return (
    <div className="saves">
      <div className="saverow-actions">
        <button type="button" onClick={newGame}>{t('panels.saves.newGame')}</button>
        <button
          type="button"
          onClick={async () => {
            const outcome = await exportSave();
            if (outcome === 'blocked') setManual(exportSaveText());
          }}
        >
          {t('panels.saves.exportJson')}
        </button>
        <button
          type="button"
          onClick={() => setManual((current) => (current === null ? exportSaveText() : null))}
          aria-expanded={manual !== null}
        >
          {t('panels.saves.manualToggle')}
        </button>
        <label className="fileinput">
          {t('panels.saves.importJson')}
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await importSave(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {manual !== null && (
        <div className="manual-transfer">
          <p className="muted">
            {t('panels.saves.manualHint')}
          </p>
          <textarea
            className="manual-text"
            value={manual}
            spellCheck={false}
            onChange={(e) => setManual(e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-label={t('panels.saves.manualAria')}
          />
          <div className="manual-actions">
            <button
              type="button"
              className="primary"
              disabled={manual.trim().length === 0}
              onClick={() => importSaveText(manual)}
            >
              {t('panels.saves.manualLoad')}
            </button>
            <button type="button" onClick={() => setManual('')}>
              {t('panels.saves.manualClear')}
            </button>
          </div>
        </div>
      )}

      <ul className="slotlist">
        {rows.map(({ slot, meta }) => (
          <li key={slot} className="slot">
            <div className="slot-info">
              <strong>{slot === AUTOSAVE_SLOT ? t('panels.saves.autosave') : t('panels.saves.slot', { slot })}</strong>
              {meta ? (
                <span className="muted">
                  {t('panels.saves.slotMeta', { company: meta.companyName, day: meta.day, netWorth: formatMoney(meta.netWorth) })}{' '}
                  {new Date(meta.updatedAtIso).toLocaleString(numberLocale())}
                </span>
              ) : (
                <span className="muted">{t('panels.saves.empty')}</span>
              )}
            </div>
            <div className="slot-actions">
              {slot !== AUTOSAVE_SLOT && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await saveTo(slot);
                    refresh();
                    setBusy(false);
                  }}
                >
                  {t('panels.saves.save')}
                </button>
              )}
              <button type="button" disabled={!meta || busy} onClick={() => void loadFrom(slot)}>
                {t('panels.saves.load')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Yardımın maddeleri, oyunda karşılaşılma sırasıyla. Her sistem bir madde
 * (Tur 44: ihale, meclis, sözleşme, lig ve senaryo eksikti).
 */
const HELP_STEPS = [
  'opportunity',
  'land',
  'auction',
  'invest',
  'losses',
  'pricing',
  'bank',
  'workforce',
  'council',
  'contracts',
  'ipo',
  'takeover',
  'holding',
  'late',
  'stories',
  'opportunities',
  'living',
  'projects',
  'consortium',
  'scenario',
  'league',
  'modifiers',
  'career',
] as const;

function HelpPanel(): ReactElement {
  const { engine, setView } = useGame();
  return (
    <div className="help">
      <ol>
        {HELP_STEPS.map((step) => (
          <li key={step} data-help-step={step}>
            <strong>{t(`panels.help.step.${step}.title`)}</strong>
            {step === 'takeover'
              ? t('panels.help.step.takeover.body', {
                  // Günlük tavan zorluktan (Tur 38): metin eskiden Dengeli'nin %3,5'ini yazıyordu.
                  cap: formatPercent(formatDecimal(getDifficulty(engine.getState().difficulty).raidDailyCap / 100, 1)),
                })
              : t(`panels.help.step.${step}.body`)}
          </li>
        ))}
      </ol>
      <p className="muted">
        {t('panels.help.controls')}
      </p>
      <div className="help-locale">
        <span className="muted">{t('panels.help.settings.hint')}</span>
        <button type="button" data-open-settings onClick={() => setView({ openPanel: 'settings' })}>
          {t('panels.help.settings')}
        </button>
      </div>
      <button
        type="button"
        data-coach-restart
        onClick={() => {
          startTutorial(engine.getState());
          setView({ openPanel: 'none' });
        }}
      >
        {t('app.coach.restart')}
      </button>
    </div>
  );
}
