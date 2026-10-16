/**
 * Ana ekranın parçaları (iOS HeaderView, Cards, ChainCard, L3Views, L4Views,
 * L8Views karşılıkları): başlık ve kampanya, olay şeridi, zincir kartları,
 * Genel Müdür, holding, halka arz ve borsa, meclis, görevler, lig kartı.
 */
import {
  ArrowUp,
  BadgeCheck,
  Bell,
  Building2,
  ChartLine,
  Clock,
  Flag,
  Flame,
  Gift,
  Hand,
  Hourglass,
  Landmark,
  Lock,
  Map as MapIcon,
  Megaphone,
  Package,
  Settings as SettingsIcon,
  Sparkles,
  Star,
  Sun,
  TriangleAlert,
  Trophy,
  UserCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  CAMPAIGN,
  CHAIN_BY_ID,
  COUNCIL_PAIRS,
  DISTRICTS,
  GOALS,
  IPO_SHARE,
  IPO_UNLOCK,
  MANAGER_MAX,
  MILESTONES,
  STAGES,
  campaignActive,
  campaignMultiplier,
  chainReport,
  chainUnlocked,
  cityTheme,
  companyValue,
  currentGoal,
  districtUnlocked,
  featuredChain,
  goalMet,
  goalReward,
  gridPowered,
  incomePerSecond,
  ipoProceeds,
  ipoUnlocked,
  managerCost,
  newGame,
  nextMilestone,
  offlineCap,
  prestigePreview,
  sharePrice,
  stageRate,
  tradeRouteChain,
  type ChainId,
  type EventKind,
  type LiteState,
  type Stage,
} from '@capital/lite-model';
import { duration, money, number, percent } from './format';
import { useNight, useStore } from './hooks';
import { chainName, districtName, eventBody, eventTitle, goalTitle, policyBody, policyTitle, stageName, stageRole, t, upper } from './l10n';
import { chainColors, css, type Rgb } from './theme';
import { ChainTile, Coin, Gloss, Glass, IconTile, Pill, PillPicker, ProgressBar } from './ui';
import type { BuyAmount } from './store';

const district = (id: ChainId) => DISTRICTS.find((d) => d.id === CHAIN_BY_ID[id].district)!;

// ------------------------------------------------------------ başlık

export function Header({ onSettings }: { onSettings: () => void }) {
  const store = useStore();
  const state = store.state;
  const featured = featuredChain(state);
  // Kasa adımlar arasında gelirle süsleniyor (modele girmiyor).
  const shown = state.cash + (store.isScenario ? 0 : incomePerSecond(state) * store.fraction);
  return (
    <div className="row" style={{ padding: '4px 16px 10px', gap: 10, paddingTop: 'max(4px, env(safe-area-inset-top))' }}>
      <div className="col grow" style={{ gap: 3 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="caps muted nowrap" style={{ fontSize: 11, letterSpacing: '0.05em' }} data-testid="city-label">
            {upper(t('header.cash'))} · {upper(t('city.label', state.city + 1))}
          </span>
          {featured && <FeaturedChip chain={featured} />}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Coin size={30} />
          <span className="display nowrap" style={{ fontSize: 'clamp(24px, 8vw, 34px)', lineHeight: 1.1 }} data-testid="cash">
            {money(shown)}
          </span>
        </div>
        <div className="row money" style={{ gap: 5 }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--money)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <ArrowUp size={10} strokeWidth={4} />
          </span>
          <span className="display" style={{ fontSize: 14.5 }}>
            {t('header.income', money(incomePerSecond(state)))}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="plain"
        onClick={onSettings}
        aria-label={t('settings.title')}
        data-testid="settings"
        style={{ width: 44, height: 44, borderRadius: 15, background: 'var(--card)', boxShadow: '0 3px 0 var(--track-edge)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }}
      >
        <SettingsIcon size={20} strokeWidth={2.6} />
      </button>
      <CampaignButton />
    </div>
  );
}

function FeaturedChip({ chain }: { chain: ChainId }) {
  const night = useNight();
  const [a, b] = chainColors(chain, night);
  return (
    <span className="row nowrap" style={{ gap: 4, padding: '2px 8px 2px 5px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--card-border)', fontSize: 11, fontWeight: 800 }}>
      <i style={{ width: 12, height: 12, borderRadius: 4, background: `linear-gradient(180deg, ${css(a)}, ${css(b)})`, display: 'inline-block' }} />
      {t('city.featured', chainName(chain))}
    </span>
  );
}

function CampaignButton() {
  const store = useStore();
  const state = store.state;
  const active = campaignActive(state);
  const ready = state.clock >= state.campaignReadyAt;
  const title = active ? t('campaign.active', duration(state.campaignUntil - state.clock)) : t('campaign.start', String(Math.trunc(campaignMultiplier(state))));
  const subtitle = active ? t('campaign.running') : ready ? duration(CAMPAIGN.duration) : t('campaign.wait', duration(state.campaignReadyAt - state.clock));
  return (
    <Gloss gloss={active ? 'green' : ready ? 'orange' : null} radius={19} edge={5} disabled={!ready && !active} onClick={() => store.campaign()} testId="campaign" style={{ width: 116, height: 58, flexDirection: 'column', gap: 1, flex: 'none' }}>
      <Megaphone size={17} strokeWidth={2.6} />
      <span className="display nowrap" style={{ fontSize: 14 }}>
        {title}
      </span>
      <span className="caps" style={{ fontSize: 9.5, opacity: 0.85 }}>
        {upper(subtitle)}
      </span>
    </Gloss>
  );
}

// ------------------------------------------------------------ olay şeridi

const EVENT_ICON: Record<EventKind, LucideIcon> = { tourism: Sun, crisis: TriangleAlert, strike: Hand, fashionWeek: Sparkles, exportBoom: Package, rivalPush: Flame };
const goodEvent = (kind: EventKind) => kind === 'tourism' || kind === 'fashionWeek' || kind === 'exportBoom';
function eventTone(kind: EventKind): [Rgb, Rgb] {
  if (kind === 'tourism') return [0xffd45e, 0xffb020];
  if (kind === 'fashionWeek') return [0xe59bf5, 0xc062de];
  if (kind === 'exportBoom') return [0x6fd4ff, 0x2e9ce8];
  return [0xff8a8a, 0xe04848];
}

export function EventBanner() {
  const { state } = useStore();
  const event = state.event;
  const good = event ? goodEvent(event.kind) : true;
  return (
    <div style={{ padding: '0 14px' }}>
      <div
        className="row"
        style={{
          height: 50,
          padding: '0 12px',
          borderRadius: 17,
          background: event ? (good ? 'var(--event-fill)' : 'var(--bad-fill)') : 'var(--card)',
          border: `1px solid ${event ? 'var(--event-edge)' : 'var(--card-border)'}`,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        {event ? (
          <>
            <IconTile icon={EVENT_ICON[event.kind]} colors={eventTone(event.kind)} size={30} />
            <div className="col grow" data-testid={`event-${event.kind}`}>
              <span className="display" style={{ fontSize: 15, color: good ? 'var(--event-title)' : 'var(--bad)' }}>
                {eventTitle(event)}
              </span>
              <span className="nowrap" style={{ fontSize: 11.5, color: 'var(--event-text)' }}>
                {eventBody(event)}
              </span>
            </div>
          </>
        ) : (
          <>
            <span style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--soft)' }}>
              <Clock size={16} strokeWidth={2.8} />
            </span>
            <span className="grow muted" style={{ fontSize: 12.5 }}>
              {state.nextEventAt - state.clock < 1 ? t('event.soon') : t('event.next', duration(state.nextEventAt - state.clock))}
            </span>
          </>
        )}
        <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
          {event && (
            <span className="display" style={{ fontSize: 13.5, padding: '2px 8px', borderRadius: 10, background: 'var(--tile)', color: good ? 'var(--event-title)' : 'var(--bad)' }}>
              {duration(event.until - state.clock)}
            </span>
          )}
          {state.policy && (
            <span className="muted nowrap" style={{ fontSize: 10, fontWeight: 800 }} data-testid="policy">
              {policyTitle(state.policy.kind)} · {duration(state.policy.until - state.clock)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ toplu alım

export function BuyAmountPicker() {
  const store = useStore();
  const label = (amount: BuyAmount) => (amount === 'one' ? t('buy.one') : amount === 'ten' ? t('buy.ten') : t('buy.max'));
  return <PillPicker value={store.buyAmount} options={['one', 'ten', 'max'] as const} label={label} onChange={(amount) => store.setBuyAmount(amount)} />;
}

// ------------------------------------------------------------ zincir

/** Açık zincirler ve sıradaki kilitli zincir. */
export function visibleChains(state: LiteState): ChainId[] {
  const ids = Object.keys(state.chains) as ChainId[];
  const open = ids.filter((id) => chainUnlocked(state, id));
  const next = ids.find((id) => !chainUnlocked(state, id));
  return next ? [...open, next] : open;
}

export function ChainCard({ chain }: { chain: ChainId }) {
  const store = useStore();
  const night = useNight();
  const state = store.state;
  const colors = chainColors(chain, night);
  if (!chainUnlocked(state, chain)) {
    const target = Math.max(CHAIN_BY_ID[chain].unlockAt, district(chain).unlockAt);
    return (
      <Glass className="col" style={{ gap: 9, opacity: 0.85 }}>
        <div className="row" style={{ gap: 9 }}>
          <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--track)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--soft)' }}>
            <Lock size={14} strokeWidth={3} />
          </span>
          <span className="display muted" style={{ fontSize: 18 }}>
            {chainName(chain)}
          </span>
          <span className="caps soft" style={{ fontSize: 9.5 }}>
            {upper(districtName(CHAIN_BY_ID[chain].district))}
          </span>
        </div>
        <ProgressBar value={state.earned / Math.max(1, target)} colors={colors} />
        <span className="muted" style={{ fontSize: 11.5 }}>
          {t('chain.locked', money(target))}
        </span>
      </Glass>
    );
  }
  const report = chainReport(state, chain);
  const hasRetail = state.chains[chain].levels[2] > 0;
  const powered = gridPowered(state);
  return (
    <Glass className="col" style={{ gap: 10 }} id={`chain-${chain}`}>
      <div className="row" style={{ gap: 9 }}>
        <ChainTile chain={chain} />
        <span className="display" style={{ fontSize: 20 }}>
          {chainName(chain)}
        </span>
        <span className="caps soft nowrap" style={{ fontSize: 9.5 }}>
          {upper(districtName(CHAIN_BY_ID[chain].district))}
        </span>
        {featuredChain(state) === chain && <Pill text="×2" icon={Star} />}
        <span className="grow" />
        <span className="display money nowrap" style={{ fontSize: 16 }}>
          {t('header.income', money(report.income))}
        </span>
      </div>
      <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
        {STAGES.map((stage) => (
          <StageButton key={stage} chain={chain} stage={stage} bottleneck={hasRetail && report.bottleneck === stage} />
        ))}
      </div>
      {hasRetail ? (
        <div className="row muted" style={{ gap: 10, fontSize: 12 }}>
          <span className="nowrap">{t('chain.margin', percent(report.margin))}</span>
          <ProgressBar value={report.share} colors={colors} height={10} track="var(--rival-track)" />
          <span className="nowrap">{t('chain.share', percent(report.share))}</span>
        </div>
      ) : (
        <span className="warn" style={{ fontSize: 12 }}>
          {t('chain.noRetail', stageName(chain, 2))}
        </span>
      )}
      {chain === 'energy' && (
        <span className="row" style={{ gap: 5, fontSize: 11.5, fontWeight: 800, color: powered ? 'var(--money)' : 'var(--muted)' }}>
          <Zap size={13} strokeWidth={3} />
          {t(powered ? 'energy.gridOn' : 'energy.grid')}
        </span>
      )}
    </Glass>
  );
}

function StageButton({ chain, stage, bottleneck }: { chain: ChainId; stage: Stage; bottleneck: boolean }) {
  const store = useStore();
  const level = store.state.chains[chain].levels[stage];
  const count = store.count(chain, stage);
  return (
    <div className={`stage ${bottleneck ? 'neck' : ''}`}>
      <div className="row" style={{ gap: 2, minHeight: 15 }}>
        <span className="caps soft nowrap grow" style={{ fontSize: 9 }}>
          {upper(stageRole(stage))}
        </span>
        {bottleneck && <Pill text={upper(t('chain.bottleneck'))} icon={Zap} size={7.5} />}
      </div>
      <span className="display nowrap" style={{ fontSize: 13 }}>
        {stageName(chain, stage)}
      </span>
      <span className="muted nowrap" style={{ fontSize: 10.5 }}>
        {t('stage.level', level)}
        {level > 0 ? ` · ${t('stage.rate', number(stageRate(stage, level)))}` : ''}
      </span>
      <MilestoneBar level={level} />
      <Gloss
        gloss={store.canBuy(chain, stage) ? 'orange' : null}
        radius={13}
        onClick={() => store.buy(chain, stage)}
        testId={`stage-${chain}-${stage}`}
        style={{ marginTop: 3, minHeight: 34, width: '100%', fontSize: 14, padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden' }}
      >
        <span className="nowrap">
          {money(store.cost(chain, stage))}
          {count > 1 ? ` ×${count}` : ''}
        </span>
      </Gloss>
    </div>
  );
}

/** Kilometre taşına (hız ×2) ilerleme: bir önceki taştan bir sonrakine. */
function MilestoneBar({ level }: { level: number }) {
  const previous = [...MILESTONES].reverse().find((m) => m <= level) ?? 0;
  const next = nextMilestone(level);
  const progress = next === null ? 1 : (level - previous) / Math.max(1, next - previous);
  return <ProgressBar value={level > 0 ? progress : 0} colors={[0x8ed36c, 0x4fbf4a]} height={6} />;
}

// ------------------------------------------------------------ Genel Müdür, holding

export function ManagerCard() {
  const store = useStore();
  const state = store.state;
  const maxed = state.manager >= MANAGER_MAX;
  const cost = managerCost(state.manager);
  return (
    <Glass className="row" style={{ gap: 11 }}>
      <IconTile icon={UserCheck} colors={[0x9fa8ff, 0x6c78f0]} size={38} />
      <div className="col grow" style={{ gap: 1 }}>
        <span className="display" style={{ fontSize: 16 }}>
          {t('manager.title')} · {t('stage.level', state.manager)}
        </span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {t('manager.body', duration(offlineCap(state)))}
        </span>
      </div>
      <Gloss gloss={!maxed && cost <= state.cash ? 'orange' : null} disabled={maxed} onClick={() => store.buyManager()} testId="manager" style={{ fontSize: 13.5, padding: '0 12px', minHeight: 38 }}>
        <span className="nowrap">{maxed ? t('manager.max') : money(cost)}</span>
      </Gloss>
    </Glass>
  );
}

export function HoldingCard({ onSell, onMap }: { onSell: () => void; onMap: () => void }) {
  const { state } = useStore();
  const preview = prestigePreview(state);
  const next = featuredChain(newGame(state.city + 1));
  return (
    <Glass className="col" style={{ gap: 9 }} id="holding">
      <div className="row" style={{ gap: 10 }}>
        <IconTile icon={Building2} colors={[0xffe08a, 0xffb938]} />
        <span className="display grow" style={{ fontSize: 18 }}>
          {t('holding.title')}
        </span>
        <Gloss gloss="blue" radius={11} edge={3} onClick={onMap} testId="holding-map" style={{ fontSize: 12.5, padding: '0 10px', minHeight: 30 }}>
          <MapIcon size={13} strokeWidth={2.8} />
          {t('map.open')}
        </Gloss>
        <span className="row money" style={{ gap: 3, fontSize: 11.5, fontWeight: 800 }}>
          <Star size={12} fill="#ffb938" color="#ffb938" />
          {t('holding.stars', state.stars, state.stars * 2)}
        </span>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {t('holding.body')}
      </span>
      {next && (
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>
          {t('holding.theme', t(`theme.${cityTheme(state.city + 1)}`))} · {t('holding.next', chainName(next))}
        </span>
      )}
      <span className="muted" style={{ fontSize: 11.5 }}>
        {t('holding.route', chainName(tradeRouteChain(state.city)))}
      </span>
      <Gloss gloss={preview > 0 ? 'gold' : null} radius={15} disabled={preview < 1} onClick={onSell} testId="holding" style={{ fontSize: 14.5, minHeight: 42, width: '100%' }}>
        {preview > 0 ? `${t('holding.sell')} · ${t('holding.preview', preview)}` : t('holding.notYet')}
      </Gloss>
    </Glass>
  );
}

// ------------------------------------------------------------ halka arz ve borsa

export function IpoOffer() {
  const store = useStore();
  const state = store.state;
  if (state.listed || !ipoUnlocked(state)) return null;
  return (
    <Glass className="col" style={{ gap: 10, outline: '2px solid var(--neck-ring)', outlineOffset: -2 }}>
      <div className="row" style={{ gap: 10 }}>
        <IconTile icon={Bell} colors={[0xffe08a, 0xffb938]} size={36} />
        <div className="col grow" style={{ gap: 1 }}>
          <span className="display" style={{ fontSize: 18 }}>
            {t('ipo.title')}
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {t('ipo.body')}
          </span>
        </div>
      </div>
      <Gloss gloss="green" radius={16} edge={5} onClick={() => store.goPublic()} testId="ipo" style={{ fontSize: 16, minHeight: 46, width: '100%' }}>
        {t('ipo.action', money(ipoProceeds(state)))}
      </Gloss>
    </Glass>
  );
}

export function MarketCard() {
  const store = useStore();
  const state = store.state;
  if (state.listed) return <StockCard />;
  if (ipoUnlocked(state) || !districtUnlocked(state, 'industry')) return null;
  return (
    <Glass className="col" style={{ gap: 9, opacity: 0.85 }} id="market">
      <div className="row" style={{ gap: 9 }}>
        <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--track)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--soft)' }}>
          <Lock size={14} strokeWidth={3} />
        </span>
        <span className="display muted" style={{ fontSize: 18 }}>
          {t('ipo.title')}
        </span>
      </div>
      <ProgressBar value={state.earned / IPO_UNLOCK} colors={[0xffe08a, 0xffb938]} />
      <span className="muted" style={{ fontSize: 11.5 }}>
        {t('ipo.locked', money(IPO_UNLOCK))}
      </span>
    </Glass>
  );
}

function StockCard() {
  const store = useStore();
  const state = store.state;
  const price = sharePrice(state);
  const history = store.priceHistory;
  const first = history[0] ?? price;
  const change = first > 0 ? price / first - 1 : 0;
  const stake = companyValue(state) * (1 - IPO_SHARE);
  return (
    <Glass className="col" style={{ gap: 8 }} id="market">
      <div className="row" style={{ gap: 10 }}>
        <IconTile icon={ChartLine} colors={[0x4fd88c, 0x22b262]} />
        <div className="col grow">
          <span className="display" style={{ fontSize: 18 }}>
            {t('stock.title')}
          </span>
          <span className="caps soft" style={{ fontSize: 9.5 }}>
            {upper(t('stock.price'))}
          </span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
          <span className="display" style={{ fontSize: 18 }} data-testid="share-price">
            {money(price)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: change >= 0 ? 'var(--good)' : 'var(--bad)' }}>
            {t('stock.since', change >= 0 ? '+' : '−', percent(Math.abs(change)))}
          </span>
        </div>
      </div>
      <PriceChart values={[...history, price]} />
      <div className="row muted" style={{ fontSize: 10.5, justifyContent: 'space-between' }}>
        <span>{t('stock.stake', money(stake))}</span>
        <span>{t('stock.premium')}</span>
      </div>
    </Glass>
  );
}

/** Yuvarlak uçlu kalın çizgi, yeşil alan dolgusu, uç noktada parlayan nokta. */
function PriceChart({ values }: { values: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const night = useNight();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = 78;
    const ratio = devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const green = night ? 0x5be39a : 0x0e9f5a;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (values.length < 2) {
      ctx.strokeStyle = css(green);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(high - low, high * 0.02);
    const inset = 6;
    const point = (i: number) => [inset + ((width - 2 * inset) * i) / (values.length - 1), inset + (height - 2 * inset) * (1 - (values[i]! - low) / span)] as const;
    ctx.beginPath();
    values.forEach((_, i) => (i === 0 ? ctx.moveTo(...point(i)) : ctx.lineTo(...point(i))));
    const line = new Path2D();
    values.forEach((_, i) => (i === 0 ? line.moveTo(...point(i)) : line.lineTo(...point(i))));
    ctx.lineTo(width - inset, height);
    ctx.lineTo(inset, height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, css(green, 0.28));
    fill.addColorStop(1, css(green, 0.02));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = css(green);
    ctx.lineWidth = 3;
    ctx.stroke(line);
    const [ex, ey] = point(values.length - 1);
    ctx.fillStyle = css(green, 0.25);
    ctx.beginPath();
    ctx.arc(ex, ey, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(green);
    ctx.beginPath();
    ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  return <canvas ref={ref} style={{ width: '100%', height: 78, display: 'block', margin: '2px 0' }} aria-hidden />;
}

// ------------------------------------------------------------ meclis ve görevler

export function CouncilCard() {
  const store = useStore();
  const pair = store.state.council;
  if (pair === null) return null;
  return (
    <Glass className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 10 }}>
        <IconTile icon={Landmark} colors={[0x7db4ff, 0x4683e8]} />
        <div className="col grow">
          <span className="display" style={{ fontSize: 17 }}>
            {t('council.title')}
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {t('council.body')}
          </span>
        </div>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
        {([0, 1] as const).map((choice) => {
          const kind = COUNCIL_PAIRS[pair]![choice];
          return (
            <Gloss
              key={choice}
              gloss={choice === 0 ? 'blue' : 'orange'}
              radius={15}
              onClick={() => store.chooseCouncil(choice)}
              testId={`council-${choice}`}
              style={{ flex: 1, minHeight: 58, padding: '9px 11px', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', gap: 2 }}
            >
              <span className="display" style={{ fontSize: 14 }}>
                {policyTitle(kind)}
              </span>
              <span style={{ fontFamily: 'var(--text)', fontSize: 11, opacity: 0.9, fontWeight: 700 }}>{policyBody(kind)}</span>
            </Gloss>
          );
        })}
      </div>
    </Glass>
  );
}

export function GoalCard() {
  const store = useStore();
  const state = store.state;
  const goal = currentGoal(state);
  if (!goal) {
    return (
      <Glass className="row" style={{ gap: 10 }}>
        <IconTile icon={Trophy} colors={[0xffe08a, 0xffb938]} />
        <span className="muted grow" style={{ fontSize: 12.5 }}>
          {t('goal.done')}
        </span>
      </Glass>
    );
  }
  const met = goalMet(state, goal);
  const inGroup = state.goal % 4;
  return (
    <Glass className="row" style={{ gap: 11 }}>
      <IconTile icon={met ? BadgeCheck : Flag} colors={met ? [0x4fd88c, 0x22b262] : [0x7db4ff, 0x4683e8]} size={38} />
      <div className="col grow" style={{ gap: 2 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="caps soft" style={{ fontSize: 10 }}>
            {upper(t('goal.title', state.goal + 1, GOALS.length))}
          </span>
          <span className="row" style={{ gap: 2 }} aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < inGroup ? 'var(--money)' : 'var(--track)', display: 'inline-block' }} />
            ))}
          </span>
        </div>
        <span className="display nowrap" style={{ fontSize: 16.5 }}>
          {goalTitle(goal.kind)}
        </span>
      </div>
      <Gloss
        gloss={met ? 'green' : null}
        radius={15}
        disabled={!met}
        onClick={() => store.claimGoal()}
        testId="goal-claim"
        label={met ? t('goal.claim', money(goalReward(state, goal))) : t('goal.pending', duration(goal.rewardSeconds))}
        style={{ fontSize: 14, padding: '0 12px', height: 40 }}
      >
        {met ? <Gift size={14} strokeWidth={2.8} /> : <Hourglass size={14} strokeWidth={2.8} />}
        <span className="nowrap">{met ? `+${money(goalReward(state, goal))}` : t('goal.pendingShort', duration(goal.rewardSeconds))}</span>
      </Gloss>
    </Glass>
  );
}

// ------------------------------------------------------------ lig kartı

export function divisionColors(division: number): [Rgb, Rgb] {
  if (division === 1) return [0xe3e9f2, 0x9aa8bd];
  if (division === 2) return [0xffe08a, 0xffb938];
  if (division === 3) return [0xa6e9ff, 0x4fb8f0];
  return [0xf0b585, 0xc27a45];
}

export function divisionName(division: number): string {
  const keys = ['bronze', 'silver', 'gold', 'diamond'];
  return t(`league.division.${keys[Math.max(0, Math.min(3, division))]}`);
}

export function LeagueCard({ onOpen }: { onOpen: () => void }) {
  const store = useStore();
  const status = store.leagueStatus;
  const standings = store.standings;
  const division = standings?.division ?? 0;
  const mine = standings?.group.find((row) => row.me);
  const subtitle = mine && standings
    ? `${t('league.rank', mine.rank, standings.group.length)} · ${t('league.ends', duration(Math.max(0, standings.endsAt / 1000 - Date.now() / 1000)))}`
    : status === 'unnamed'
      ? t('league.joinBody')
      : t('league.body', 5, 5);
  return (
    <Glass className="row" style={{ gap: 11 }} id="league">
      <IconTile icon={Trophy} colors={divisionColors(division)} size={38} />
      <div className="col grow" style={{ gap: 2 }}>
        <span className="display" style={{ fontSize: 16 }}>
          {t('league.title')}
          {status === 'ready' ? ` · ${divisionName(division)}` : ''}
        </span>
        <span className="muted" style={{ fontSize: 11.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {subtitle}
        </span>
      </div>
      <Gloss gloss="blue" onClick={onOpen} testId="league" style={{ fontSize: 13.5, padding: '0 12px', minHeight: 38 }}>
        {status === 'unnamed' ? t('league.join') : t('league.open')}
      </Gloss>
    </Glass>
  );
}

// ------------------------------------------------------------ yokken

export function OfflineCard({ report, onCollect }: { report: { earned: number; seconds: number; cap: number }; onCollect: () => void }) {
  return (
    <div className="col" style={{ alignItems: 'center', gap: 12, padding: '26px 6px 6px', textAlign: 'center' }}>
      <Coin size={46} />
      <span className="caps muted" style={{ fontSize: 12, letterSpacing: '0.1em' }}>
        {upper(t('offline.title'))}
      </span>
      <span className="display money" style={{ fontSize: 36 }}>
        +{money(report.earned)}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{t('offline.body', duration(report.seconds))}</span>
      <span className="muted" style={{ fontSize: 11.5 }}>
        {t('offline.cap', duration(report.cap))}
      </span>
      <Gloss gloss="green" radius={17} edge={5} onClick={onCollect} testId="offline-collect" style={{ fontSize: 17, minHeight: 50, width: '100%' }}>
        {t('offline.collect')}
      </Gloss>
    </div>
  );
}

