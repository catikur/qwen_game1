import {useEffect, useState} from 'react';
import type { ReactElement } from 'react';
import {
  BUILDING_BY_ID,
  CATEGORIES,
  DISTRICT_ARCHETYPES,
  CONSUMER_CATEGORIES,
  GOODS_BY_CATEGORY,
  GOOD_BY_ID,
  STRUCTURE_BY_ID,
} from '@capital/content';
import {
  buildOptions,
  categoryBreakdown,
  companyRanking,
  districtOpportunity,
  districtPressure,
  estimateInvestment,
  formatMoney,
  freePlotsIn,
  getBuildingOnTile,
  getPlayer,
  goodShares,
  headquarters,
  PROJECTION_DAYS,
  projectBuilding,
  rankedBuildOptions,
  tilePrice,
} from '@capital/core';
import type { IndirectEstimate, InvestmentEstimate, Projection } from '@capital/core';
import { AUTOSAVE_SLOT, MAX_SLOTS, listSaves } from '@capital/persistence';
import type { SaveMeta } from '@capital/persistence';
import { ChainPanel } from './ChainPanel';
import { useCollapsible } from './collapse';
import { CompetitionPanel } from './CompetitionPanel';
import { AuctionPanel } from './AuctionPanel';
import { MarketPanel } from './MarketPanel';
import { GoalsPanel } from './GoalsPanel';
import { CouncilPanel } from './CouncilPanel';
import { LeaguePanel } from './LeaguePanel';
import { BankSection, WorkforceSection } from './CompanyFinance';
import { t } from './i18n';
import type { MessageKey } from './i18n';
import { useGame, useGameState } from './useGame';

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
                    {CATEGORIES[def.category].name}
                    {def.role === 'rental' && t('panels.build.role.rental')}
                    {def.role === 'logistics' && t('panels.build.role.logistics')}
                    {def.role === 'extract' && t('panels.build.role.extract')}
                    {def.role === 'process' && t('panels.build.role.process')}
                    {def.zones && t('panels.build.zoned')}
                  </span>
                  {!unlocked ? (
                    <span className="buildcard-lock">
                      {t('panels.build.locked', { netWorth: formatMoney(def.unlockNetWorth) })}
                    </span>
                  ) : estimate ? (
                    <EstimateLine estimate={estimate} indirect={indirect} role={def.role} />
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
  logistics: 'panels.estimate.indirectHint.logistics',
  research: 'panels.estimate.indirectHint.research',
  marketing: 'panels.estimate.indirectHint.marketing',
};

function EstimateLine({
  estimate,
  indirect,
  role,
}: {
  estimate: InvestmentEstimate;
  indirect?: IndirectEstimate | null;
  role: string;
}): ReactElement {
  if (!estimate.direct) {
    const hint = t(INDIRECT_HINT[role] ?? 'panels.estimate.indirectHint.default');
    if (!indirect) return <span className="buildcard-hint">{hint}</span>;
    if (indirect.none) return <span className="buildcard-hint">{hint} {indirect.none}</span>;
    // Dolaylı katkı: bugünkü şehirde, etkisi oturduğunda (Tur 21).
    const where =
      indirect.covered !== undefined
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
      </span>
    );
  }
  // "İyi" ölçütü artık geri ödeme değil, kârın kendisi. Geri ödeme
  // ikinci sırada duruyor çünkü paranın ne zaman döneceği hâlâ önemli —
  // ama parsel kıtken belirleyici olan soru bu değil.
  const good = estimate.dailyProfit > 0;
  return (
    <span className={`estimate ${good ? 'ok' : 'weak'}`}>
      {t('panels.estimate.directProfit', { profit: formatMoney(estimate.dailyProfit) })}{' '}
      {Number.isFinite(estimate.paybackDays)
        ? t('panels.estimate.payback', { days: Math.round(estimate.paybackDays) })
        : t('panels.estimate.loss')}
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
    <aside className="inspector has-selection">
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
        <Stat label={t('panels.inspector.stat.population')} value={Math.round(district.population).toLocaleString('tr-TR')} />
        <Stat label={t('panels.inspector.stat.incomeLevel')} value={`%${Math.round(district.incomeLevel * 100)}`} />
        <Stat label={t('panels.inspector.stat.landValue')} value={formatMoney(tile.landValue)} />
        <Stat label={t('panels.inspector.stat.openDemand')} value={`%${Math.round(districtOpportunity(district) * 100)}`} />
        {/*
          Gelişme basıncı: şehrin BURAYA ne kadar yığıldığı. Yüksekse
          boş parseller yakında yapılaşır ve devralma primi devreye
          girer — yani bu sayı "acele et" demenin sayısal hâli.
        */}
        <Stat label={t('panels.inspector.stat.development')} value={`%${Math.round(districtPressure(state, district) * 100)}`} />
      </div>

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
            <button type="button" onClick={() => run({ type: 'SELL_TILE', tileId: tile.id })}>
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
          {t('panels.plot.buyoutNote', { multiplier: structure.buyoutMultiplier?.toFixed(1) ?? '' })}
        </p>
      </div>
    );
  }

  return (
    <div className="actions">
      <p className="plot-note vacant">{t('panels.plot.vacant')}</p>
      <button
        type="button"
        className="primary"
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
    def.role === 'logistics' || def.role === 'research' || def.role === 'marketing';

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
          <div className="ledger">
            <LedgerRow label={t('panels.building.ledger.upkeep')} value={-ledger.upkeep} />
            <LedgerRow label={t('panels.building.ledger.wages')} value={-ledger.wages} />
            <LedgerRow label={t('panels.building.ledger.dailyCost')} value={-(ledger.upkeep + ledger.wages)} strong />
          </div>
          <p className="muted">
            {def.role === 'logistics'
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

          <div className="statgrid small">
            <Stat label={t('panels.building.stat.utilization')} value={`%${Math.round(ledger.capacityUsed * 100)}`} />
            <Stat label={t('panels.building.stat.share')} value={`%${Math.round(ledger.share * 100)}`} />
            <Stat label={t('panels.building.stat.price')} value={`×${building.priceMultiplier.toFixed(2)}`} />
          </div>
        </>
      )}

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
  const shares = new Map(
    goodShares(district.archetype, def.category).map((entry) => [entry.good.id, entry.share]),
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
                <span className="shelf-share">%{Math.round((shares.get(good.id) ?? 0) * 100)}</span>
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
  const { view, setView } = useGame();
  if (view.openPanel === 'none') return null;

  const titles: Record<string, string> = {
    chain: t('panels.modal.title.chain'),
    rivalry: t('panels.modal.title.rivalry'),
    auction: t('panels.modal.title.auction'),
    bourse: t('panels.modal.title.bourse'),
    company: t('panels.modal.title.company'),
    rivals: t('panels.modal.title.rivals'),
    saves: t('panels.modal.title.saves'),
    help: t('panels.modal.title.help'),
    goals: t('panels.modal.title.goals'),
    council: t('panels.modal.title.council'),
    league: t('panels.modal.title.league'),
  };

  return (
    <div className="modal-backdrop" onClick={() => setView({ openPanel: 'none' })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{titles[view.openPanel]}</h2>
          <button type="button" className="icon" onClick={() => setView({ openPanel: 'none' })} aria-label={t('panels.common.close')}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {view.openPanel === 'chain' && <ChainPanel />}
          {view.openPanel === 'rivalry' && <CompetitionPanel />}
          {view.openPanel === 'auction' && <AuctionPanel />}
          {view.openPanel === 'bourse' && <MarketPanel />}
          {view.openPanel === 'company' && <CompanyPanel />}
          {view.openPanel === 'rivals' && <RivalsPanel />}
          {view.openPanel === 'saves' && <SavePanel />}
          {view.openPanel === 'help' && <HelpPanel />}
          {view.openPanel === 'goals' && <GoalsPanel />}
          {view.openPanel === 'council' && <CouncilPanel />}
          {view.openPanel === 'league' && <LeaguePanel />}
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
                <td>%{Math.round(row.share * 100)}</td>
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
        <polyline points={points} fill="none" stroke="#7fd4ff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
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
                  ? `${CATEGORIES[best[0] as keyof typeof CATEGORIES].name} %${Math.round(best[1] * 100)}`
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
                  {new Date(meta.updatedAtIso).toLocaleString('tr-TR')}
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

function HelpPanel(): ReactElement {
  return (
    <div className="help">
      <ol>
        <li>
          <strong>{t('panels.help.step.opportunity.title')}</strong>
          {t('panels.help.step.opportunity.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.land.title')}</strong>
          {t('panels.help.step.land.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.invest.title')}</strong>
          {t('panels.help.step.invest.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.losses.title')}</strong>
          {t('panels.help.step.losses.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.pricing.title')}</strong>
          {t('panels.help.step.pricing.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.bank.title')}</strong>
          {t('panels.help.step.bank.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.workforce.title')}</strong>
          {t('panels.help.step.workforce.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.ipo.title')}</strong>
          {t('panels.help.step.ipo.body')}
        </li>
        <li>
          <strong>{t('panels.help.step.takeover.title')}</strong>
          {t('panels.help.step.takeover.body')}
        </li>
      </ol>
      <p className="muted">
        {t('panels.help.controls')}
      </p>
    </div>
  );
}
