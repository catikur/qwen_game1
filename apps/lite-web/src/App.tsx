/**
 * Ana ekran (iOS `RootView.swift` karşılığı). Telefonda tek sütun, dikey:
 * üstte kasa ve kampanya, ortada gökyüzünde süzülen şehir, altta kartlar.
 * Geniş ekranda aynı parçalar dağılıyor:
 * - yatay: solda büyük şehir, sağda kartlar;
 * - dikey: üstte geniş şehir, altta iki sütun kart.
 */
import { useEffect, useRef, useState } from 'react';
import { prestigePreview } from '@capital/lite-model';
import {
  BuyAmountPicker,
  ChainCard,
  CouncilCard,
  EventBanner,
  GoalCard,
  Header,
  HoldingCard,
  IpoOffer,
  LeagueCard,
  ManagerCard,
  MarketCard,
  visibleChains,
} from './cards';
import { CityView } from './city/CityView';
import { DealLayer } from './deals';
import { useNight, useStore, useViewport } from './hooks';
import { t } from './l10n';
import { LeagueSheet, MapSheet, OfflineSheet, SettingsSheet } from './sheets';
import { Gloss, Glass, Sheet } from './ui';

type Layout = 'phone' | 'tabletPortrait' | 'tabletLandscape';

/** İki sütun kart için gereken genişlik: zincir kartı telefondaki kadar ferah kalsın. */
const TWO_COLUMN_WIDTH = 760;

function layoutFor(width: number, height: number): Layout {
  if (width < 700) return 'phone';
  return width > height * 1.05 ? 'tabletLandscape' : 'tabletPortrait';
}

export function App() {
  const store = useStore();
  const night = useNight();
  const { width, height } = useViewport();
  const sheet = store.params.get('sheet');
  const [showSettings, setShowSettings] = useState(sheet === 'settings');
  const [showLeague, setShowLeague] = useState(sheet === 'league');
  const [showMap, setShowMap] = useState(sheet === 'map');
  const [confirmSell, setConfirmSell] = useState(false);
  const layout = layoutFor(width, height);
  const state = store.state;
  const island = Number(store.params.get('island') ?? NaN);

  // Klavye: 1/2/3 toplu alım, K kampanya.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      if (event.key === '1') store.setBuyAmount('one');
      else if (event.key === '2') store.setBuyAmount('ten');
      else if (event.key === '3') store.setBuyAmount('max');
      else if (event.key.toLowerCase() === 'k') store.campaign();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [store]);

  const city = (cityHeight: number | string) => (
    <div className="city-host" style={{ height: cityHeight, position: 'relative' }}>
      <CityView
        state={state}
        night={night}
        height="100%"
        initialIsland={Number.isFinite(island) ? island : undefined}
        overlay={(args) => <DealLayer {...args} />}
      />
    </div>
  );

  const columns = layout === 'phone' ? 1 : layout === 'tabletPortrait' ? (width - 28 >= TWO_COLUMN_WIDTH ? 2 : 1) : width - Math.min(620, width * 0.46) - 28 >= TWO_COLUMN_WIDTH ? 2 : 1;
  const cards = <Cards columns={columns} onSell={() => setConfirmSell(true)} onMap={() => setShowMap(true)} onLeague={() => setShowLeague(true)} />;
  const header = <Header onSettings={() => setShowSettings(true)} />;

  return (
    <>
      {layout === 'tabletLandscape' ? (
        <div className="app landscape">
          <div className="side">
            {header}
            <EventBanner />
            {city('auto')}
          </div>
          <div className="col grow" style={{ paddingTop: 8, minHeight: 0 }}>
            {cards}
          </div>
        </div>
      ) : (
        <div className="app">
          <div style={layout === 'tabletPortrait' ? { maxWidth: 900, margin: '0 auto', width: '100%' } : undefined}>
            {header}
            <EventBanner />
          </div>
          {city(layout === 'phone' ? 214 : Math.min(460, height * 0.36))}
          {cards}
        </div>
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      {showLeague && <LeagueSheet onClose={() => setShowLeague(false)} />}
      {showMap && <MapSheet onClose={() => setShowMap(false)} />}
      <OfflineSheet />
      {confirmSell && (
        <Sheet onClose={() => setConfirmSell(false)} done={t('common.cancel')} center>
          <Glass className="col" style={{ gap: 10, marginTop: 20 }}>
            <span className="display" style={{ fontSize: 18 }}>
              {t('holding.confirm')}
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {t('holding.confirmBody', prestigePreview(state))}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <Gloss gloss="gold" radius={14} onClick={() => (store.sellCity(), setConfirmSell(false))} style={{ flex: 1, minHeight: 42, fontSize: 14.5 }}>
                {t('holding.sell')}
              </Gloss>
              <Gloss gloss={null} radius={14} onClick={() => setConfirmSell(false)} style={{ flex: 1, minHeight: 42, fontSize: 14.5 }}>
                {t('common.cancel')}
              </Gloss>
            </div>
          </Glass>
        </Sheet>
      )}
      {store.notice && (
        <div className="toast" role="status">
          {store.notice}
        </div>
      )}
    </>
  );
}

function Cards({ columns, onSell, onMap, onLeague }: { columns: number; onSell: () => void; onMap: () => void; onLeague: () => void }) {
  const store = useStore();
  const ref = useRef<HTMLDivElement>(null);
  // CI kareleri: `?scroll=market|holding|league` listeyi o karta kaydırıyor.
  useEffect(() => {
    const target = store.params.get('scroll');
    if (!target) return;
    const element = ref.current?.querySelector(`#${CSS.escape(target)}`);
    element?.scrollIntoView({ block: 'start' });
  }, [store]);
  const chains = visibleChains(store.state).map((chain) => <ChainCard key={chain} chain={chain} />);
  const rest = (
    <>
      <MarketCard />
      <ManagerCard />
      <HoldingCard onSell={onSell} onMap={onMap} />
      <LeagueCard onOpen={onLeague} />
    </>
  );
  return (
    <div className="cards" ref={ref}>
      <div className={`cards-inner ${columns > 1 ? 'two' : ''}`}>
        <CouncilCard />
        <GoalCard />
        <IpoOffer />
        <BuyAmountPicker />
        {columns > 1 ? (
          <div className="grid two">
            {chains}
            {rest}
          </div>
        ) : (
          <>
            {chains}
            {rest}
          </>
        )}
      </div>
    </div>
  );
}
