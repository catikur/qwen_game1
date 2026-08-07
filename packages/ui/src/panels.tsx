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
  estimateInvestment,
  formatMoney,
  getBuildingOnTile,
  getPlayer,
  goodShares,
  tilePrice,
} from '@capital/core';
import type { InvestmentEstimate } from '@capital/core';
import { AUTOSAVE_SLOT, MAX_SLOTS, listSaves } from '@capital/persistence';
import type { SaveMeta } from '@capital/persistence';
import { ChainPanel } from './ChainPanel';
import { CompetitionPanel } from './CompetitionPanel';
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
export function BuildPanel(): ReactElement {
  const { view, setView, run, toast } = useGame();
  const state = useGameState();
  const player = getPlayer(state);

  const selectedTile = view.selectedTileId !== null ? state.map.tiles[view.selectedTileId] : undefined;
  const districtId = selectedTile?.districtId ?? null;
  const district = districtId !== null ? state.districts[districtId] : undefined;

  const options = buildOptions(state);

  return (
    <section className="buildpanel" aria-label="Yapı menüsü">
      <header>
        <h2>Yatırımlar</h2>
        <p className="muted">
          {district
            ? `Tahminler ${district.name} bölgesi için`
            : 'Bir arsa seç, tahminler o bölgeye göre hesaplansın'}
        </p>
      </header>

      <ul className="buildlist">
        {options.map(({ def, unlocked, affordable }) => {
          const estimate: InvestmentEstimate | null =
            districtId !== null ? estimateInvestment(state, districtId, def.id, player.id) : null;
          const selected = view.ghostDefId === def.id;

          return (
            <li key={def.id}>
              <button
                type="button"
                className={`buildcard${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`}
                disabled={!unlocked}
                onClick={() => {
                  if (!affordable) {
                    toast(`Nakit yetersiz — ${def.name} ${formatMoney(def.cost)}`, 'bad');
                    return;
                  }
                  setView({ ghostDefId: selected ? null : def.id });
                }}
                title={def.description}
              >
                <span className="buildcard-swatch" style={{ background: def.color }} />
                <span className="buildcard-body">
                  <span className="buildcard-top">
                    <span className="buildcard-name">{def.name}</span>
                    <span className={affordable ? 'buildcard-cost' : 'buildcard-cost short'}>
                      {formatMoney(def.cost)}
                    </span>
                  </span>
                  <span className="buildcard-meta">
                    {CATEGORIES[def.category].name}
                    {def.role === 'rental' && ' · kira'}
                    {def.role === 'logistics' && ' · lojistik'}
                    {def.role === 'extract' && ' · hammadde'}
                    {def.role === 'process' && ' · işleme'}
                    {def.zones && ' · sanayi/liman'}
                  </span>
                  {!unlocked ? (
                    <span className="buildcard-lock">
                      🔒 {formatMoney(def.unlockNetWorth)} şirket değeri gerekir
                    </span>
                  ) : estimate ? (
                    <EstimateLine estimate={estimate} />
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
            <strong>{BUILDING_BY_ID[view.ghostDefId]?.name}</strong> yerleştiriliyor — kendi boş
            arsana tıkla.
          </span>
          <button type="button" onClick={() => setView({ ghostDefId: null })}>
            Vazgeç
          </button>
        </div>
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
          Seçili arsaya inşa et
        </button>
      )}
    </section>
  );
}

function EstimateLine({ estimate }: { estimate: InvestmentEstimate }): ReactElement {
  if (!estimate.direct) {
    return <span className="buildcard-hint">Dolaylı fayda — kendi mağazalarının maliyetini düşürür.</span>;
  }
  const good = estimate.dailyProfit > 0 && estimate.paybackDays < 160;
  return (
    <span className={`estimate ${good ? 'ok' : 'weak'}`}>
      ≈ {formatMoney(estimate.dailyProfit)}/gün ·{' '}
      {Number.isFinite(estimate.paybackDays)
        ? `${Math.round(estimate.paybackDays)} günde geri öder`
        : 'zarar eder'}
    </span>
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
        <h2>Arsa Detayı</h2>
        <p className="muted">
          Haritadan bir arsa seç. Sol üstteki lenslerle nerede karşılanmamış talep olduğunu
          görebilirsin.
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
    <aside className="inspector">
      <header className="inspector-head">
        <div>
          <h2>{district.name}</h2>
          <p className="muted">
            Arsa {tile.x + 1}-{tile.y + 1} · {archetype.name}
          </p>
        </div>
        <button type="button" className="icon" onClick={() => setView({ selectedTileId: null })} aria-label="Kapat">
          ×
        </button>
      </header>

      <div className="statgrid">
        <Stat label="Nüfus" value={Math.round(district.population).toLocaleString('tr-TR')} />
        <Stat label="Gelir seviyesi" value={`%${Math.round(district.incomeLevel * 100)}`} />
        <Stat label="Arsa değeri" value={formatMoney(tile.landValue)} />
        <Stat label="Boş talep" value={`%${Math.round(districtOpportunity(district) * 100)}`} />
      </div>

      <div className="demandlist">
        <h3>Bölge talebi</h3>
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
                <span className="demandvalue">%{Math.round(unmet * 100)} boş</span>
              </div>
            );
          })}
      </div>

      {building ? (
        <BuildingDetail buildingId={building.id} />
      ) : owner ? (
        owner.id === player.id ? (
          <div className="actions">
            <p className="muted">Boş parselin. Soldan bir yatırım seç.</p>
            <button type="button" onClick={() => run({ type: 'SELL_TILE', tileId: tile.id })}>
              Parseli sat ({formatMoney(tile.landValue * 0.85)})
            </button>
          </div>
        ) : (
          <div className="actions">
            <p className="owner" style={{ color: owner.color }}>
              {owner.name} şirketine ait
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
        <p className="plot-note">🚧 Sokak — satılık değil.</p>
      </div>
    );
  }

  if (tile.kind === 'civic') {
    return (
      <div className="actions">
        <p className="plot-note">
          🏛️ {structure?.name ?? 'Kamu alanı'} — belediye malı, satılık değil.
        </p>
        {structure && <p className="muted">{structure.description}</p>}
      </div>
    );
  }

  if (structure) {
    return (
      <div className="actions">
        <p className="plot-note">🏚️ Parselde {structure.name} var.</p>
        <p className="muted">{structure.description}</p>
        <button
          type="button"
          className="primary"
          disabled={player.cash < price}
          onClick={() => run({ type: 'BUYOUT_TILE', tileId })}
        >
          Sahibinden devral · {formatMoney(price)}
        </button>
        <p className="muted">
          Devralınca yapı yıkılır ve parsel senin olur. Boş parsele göre{' '}
          {structure.buyoutMultiplier?.toFixed(1)}× fiyat ödersin.
        </p>
      </div>
    );
  }

  return (
    <div className="actions">
      <p className="plot-note vacant">✅ Boş parsel — doğrudan alınabilir.</p>
      <button
        type="button"
        className="primary"
        disabled={player.cash < price}
        onClick={() => run({ type: 'BUY_TILE', tileId })}
      >
        Parseli satın al · {formatMoney(price)}
      </button>
      {player.cash < price && <p className="muted">Nakit yetersiz.</p>}
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
          {owner.name} işletiyor
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
            <LedgerRow label="İşletme gideri" value={-ledger.upkeep} />
            <LedgerRow label="Personel" value={-ledger.wages} />
            <LedgerRow label="Günlük gider" value={-(ledger.upkeep + ledger.wages)} strong />
          </div>
          <p className="muted">
            {def.role === 'logistics'
              ? 'Bu bina satış yapmaz. Karşılığı, menzilindeki mağazalarının satış maliyetinde görünür.'
              : 'Bu bina satış yapmaz. Karşılığı, atandığı kategorideki mağazalarının kalitesinde ve markasında görünür — Rekabet panelinde ölçebilirsin.'}
          </p>
        </>
      ) : (
        <>
          <div className="ledger">
            <LedgerRow label="Ciro" value={ledger.revenue} />
            <LedgerRow label="Satılan malın maliyeti" value={-ledger.cogs} />
            <LedgerRow label="İşletme gideri" value={-ledger.upkeep} />
            <LedgerRow label="Personel" value={-ledger.wages} />
            <LedgerRow label="Günlük kâr" value={ledger.profit} strong />
          </div>

          <div className="statgrid small">
            <Stat label="Doluluk" value={`%${Math.round(ledger.capacityUsed * 100)}`} />
            <Stat label="Bölge payı" value={`%${Math.round(ledger.share * 100)}`} />
            <Stat label="Fiyat" value={`×${building.priceMultiplier.toFixed(2)}`} />
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
            Fiyatı oyun yönetsin
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
              aria-label="Fiyat çarpanı"
            />
          )}
          <p className="muted">
            Fiyatı düşürmek pazar payını artırır ama marjı yer. Yükseltmek tersini yapar.
          </p>
        </div>
      )}

      {isPlayer && (
        <button type="button" onClick={() => run({ type: 'DEMOLISH', tileId: building.tileId })}>
          Yık (maliyetin %25'i geri döner)
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
        toast('Rafta en az bir ürün kalmalı. Değiştirmek için diğerine tıkla.', 'info');
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
        toast(`${GOOD_BY_ID[weakest]?.name ?? 'Bir ürün'} raftan çıktı.`, 'info');
      }
      return;
    }

    run({ type: 'SET_STOCK', buildingId, goodIds: [...building.stocked, goodId] });
  };

  return (
    <div className="shelf">
      <div className="shelf-head">
        <span>Raf</span>
        <span className="muted">
          {building.stocked.length}/{slots} yuva · {district.name} talebi
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
          ? 'Tek yuvan var: diğerine tıklarsan raf değişir, taşımadığın ürünün payı rakibe kalır.'
          : 'Bu bölgede talebin ne kadarını yakaladığın rafına bağlı. Taşımadığın ürünün payı rakibe kalır.'}
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

  const arm = def.role === 'research' ? 'kalite' : 'marka';

  return (
    <div className="shelf">
      <div className="shelf-head">
        <span>Odak</span>
        <span className="muted">
          {building.focus ? CATEGORIES[building.focus].name : 'atanmamış'} · {arm} kolu
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
                    toast(`${def.name} artık ${CATEGORIES[categoryId].name} kategorisine çalışıyor.`, 'info');
                  }
                }}
                aria-pressed={on}
              >
                <span className="shelf-dot" style={{ background: CATEGORIES[categoryId].color }} />
                <span className="shelf-name">{CATEGORIES[categoryId].name}</span>
                <span className="shelf-share">{outlets} mağaza</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        {(outletCounts.get(building.focus ?? '') ?? 0) === 0
          ? 'Bu kategoride hiç mağazan yok — kol boşa çalışıyor. Mağazanın olduğu bir kategoriye ata.'
          : 'Kolun faydası mağaza sayınla çarpılır. Kategori değiştirirsen eski kategorideki birikim erimeye başlar.'}
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
    chain: 'Tedarik Zinciri',
    rivalry: 'Rekabet',
    company: 'Şirket',
    rivals: 'Rakipler',
    saves: 'Kayıtlar',
    help: 'Nasıl oynanır',
  };

  return (
    <div className="modal-backdrop" onClick={() => setView({ openPanel: 'none' })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{titles[view.openPanel]}</h2>
          <button type="button" className="icon" onClick={() => setView({ openPanel: 'none' })} aria-label="Kapat">
            ×
          </button>
        </header>
        <div className="modal-body">
          {view.openPanel === 'chain' && <ChainPanel />}
          {view.openPanel === 'rivalry' && <CompetitionPanel />}
          {view.openPanel === 'company' && <CompanyPanel />}
          {view.openPanel === 'rivals' && <RivalsPanel />}
          {view.openPanel === 'saves' && <SavePanel />}
          {view.openPanel === 'help' && <HelpPanel />}
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
        Şirket adı
        <input
          type="text"
          defaultValue={player.name}
          onBlur={(e) => run({ type: 'RENAME_COMPANY', name: e.target.value })}
          maxLength={32}
        />
      </label>

      <div className="statgrid">
        <Stat label="Nakit" value={formatMoney(player.cash)} />
        <Stat label="Borç" value={formatMoney(player.debt)} />
        <Stat label="Şirket değeri" value={formatMoney(player.netWorth)} />
        <Stat label="Günlük kâr" value={formatMoney(player.today.profit)} />
      </div>

      <Sparkline values={history} />

      <h3>Sektör kırılımı</h3>
      {rows.length === 0 ? (
        <p className="muted">Henüz işletmen yok.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Sektör</th>
              <th>Şube</th>
              <th>Ciro/gün</th>
              <th>Kâr/gün</th>
              <th>Pazar payı</th>
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
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Şirket değeri eğrisi">
        <polyline points={points} fill="none" stroke="#7fd4ff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="muted">
        Son {values.length} gün · {formatMoney(min)} → {formatMoney(max)}
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
          <th>Şirket</th>
          <th>Değer</th>
          <th>Bina</th>
          <th>Arsa</th>
          <th>Güçlü olduğu sektör</th>
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
                {row.company.isPlayer && ' (sen)'}
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
  const { saveTo, loadFrom, newGame, exportSave, importSave } = useGame();
  const state = useGameState();
  const [slots, setSlots] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);

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
        <button type="button" onClick={newGame}>Yeni oyun</button>
        <button type="button" onClick={exportSave}>JSON dışa aktar</button>
        <label className="fileinput">
          JSON içe aktar
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

      <ul className="slotlist">
        {rows.map(({ slot, meta }) => (
          <li key={slot} className="slot">
            <div className="slot-info">
              <strong>{slot === AUTOSAVE_SLOT ? 'Otomatik kayıt' : `Slot ${slot}`}</strong>
              {meta ? (
                <span className="muted">
                  {meta.companyName} · {meta.day}. gün · {formatMoney(meta.netWorth)} ·{' '}
                  {new Date(meta.updatedAtIso).toLocaleString('tr-TR')}
                </span>
              ) : (
                <span className="muted">boş</span>
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
                  Kaydet
                </button>
              )}
              <button type="button" disabled={!meta || busy} onClick={() => void loadFrom(slot)}>
                Yükle
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
          <strong>Fırsat lensini aç.</strong> Kırmızıya çalan bölgelerde karşılanmamış talep var —
          orası para bırakır.
        </li>
        <li>
          <strong>Bir arsa seç ve satın al.</strong> Merkeze yakın arsalar pahalı ama daha çok
          müşteri görür ve zamanla değerlenir.
        </li>
        <li>
          <strong>Soldan bir yatırım seç.</strong> Her kartta o bölge için tahmini günlük kâr ve
          geri ödeme süresi yazar. Rakipler de aynı hesabı yapıyor.
        </li>
        <li>
          <strong>Kâr etmeyen şubeye bak.</strong> Arsa panelinde ciro, maliyet, personel ve kâr
          kalem kalem yazılıdır — neden kaybettiğin hep görünür.
        </li>
        <li>
          <strong>Fiyatı oyuna bırak ya da devral.</strong> Varsayılan otomatik fiyat makul oynar;
          fiyat savaşı açmak istersen kontrolü sen alırsın.
        </li>
      </ol>
      <p className="muted">
        Kontroller: sürükle = kaydır · sağ tık sürükle = döndür · tekerlek = yakınlaş · WASD =
        kaydır · Boşluk = duraklat
      </p>
    </div>
  );
}
