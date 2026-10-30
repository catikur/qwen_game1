/**
 * Pencereler (iOS L4Views, L7Views, L8Views karşılıkları): Ayarlar, haftalık
 * lig (grup, özel ligler, yıldız tablosu, başka cihazda oyna), holding
 * haritası, "yokken kazandın".
 */
import {
  ArrowUpRight,
  Bell,
  CircleArrowDown,
  CircleArrowUp,
  Clock,
  Copy,
  Diamond,
  Globe,
  HandHelping,
  RotateCcw,
  Shield,
  Smartphone,
  Star,
  TriangleAlert,
  Trophy,
  UserRound,
  Vibrate,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CHAIN_IDS, LEAGUE, tradeRoutes } from '@capital/lite-model';
import { HoldingMap } from './map';
import { divisionColors, divisionName, OfflineCard } from './cards';
import { duration, money } from './format';
import { useStore } from './hooks';
import { chainName, lang, t, upper } from './l10n';
import type { LeagueRow, StarRow } from './league';
import { isNative } from './native';
import type { AppearanceChoice, LanguageChoice } from './settings';
import { ChainTile, Gloss, Glass, IconTile, Pill, PillPicker, Sheet, Switch } from './ui';

const done = () => t('settings.done');

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Glass className="col" style={{ gap: 10 }}>
      {title && (
        <span className="caps soft" style={{ fontSize: 10, letterSpacing: '0.08em' }}>
          {upper(title)}
        </span>
      )}
      {children}
    </Glass>
  );
}

function ToggleRow({ title, icon, colors, checked, onChange }: { title: string; icon: LucideIcon; colors: [number, number]; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <IconTile icon={icon} colors={colors} size={30} />
      <span className="display grow" style={{ fontSize: 15 }}>
        {title}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function LinkRow({ title, icon, colors, href }: { title: string; icon: LucideIcon; colors: [number, number]; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="row" style={{ gap: 10, color: 'inherit', textDecoration: 'none', minHeight: 34 }}>
      <IconTile icon={icon} colors={colors} size={30} />
      <span className="display grow" style={{ fontSize: 15 }}>
        {title}
      </span>
      <ArrowUpRight size={15} strokeWidth={3} color="var(--soft)" />
    </a>
  );
}

// ------------------------------------------------------------ Ayarlar

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const settings = store.settings;
  const [confirm, setConfirm] = useState(false);
  const anchor = lang() === 'tr' ? '' : '#en';
  // Android kabuğunda sayfalar sistem tarayıcısında (yayındaki adres).
  const site = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ? 'https://catikur.github.io/qwen_game1/lite/' : '';
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  return (
    <Sheet title={t('settings.title')} onClose={onClose} done={done()} testId="settings-sheet">
      <Section title={t('settings.appearance')}>
        <PillPicker<AppearanceChoice> value={settings.appearance} options={['system', 'day', 'night']} label={(o) => t(`settings.appearance.${o}`)} onChange={(appearance) => store.updateSettings({ appearance })} />
      </Section>
      <Section title={t('settings.language')}>
        <PillPicker<LanguageChoice> value={settings.language} options={['system', 'tr', 'en']} label={(o) => t(`settings.lang.${o}`)} onChange={(language) => store.updateSettings({ language })} />
      </Section>
      <Section>
        <ToggleRow title={t('settings.sound')} icon={Volume2} colors={[0xffa65c, 0xff7a2a]} checked={settings.sound} onChange={(sound) => store.updateSettings({ sound })} />
        {canVibrate && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: 0 }} />
            <ToggleRow title={t('settings.haptics')} icon={Vibrate} colors={[0xda8bf0, 0xb85dd6]} checked={settings.haptics} onChange={(haptics) => store.updateSettings({ haptics })} />
          </>
        )}
        {isNative && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: 0 }} />
            <ToggleRow title={t('settings.notifications')} icon={Bell} colors={[0x7db4ff, 0x4683e8]} checked={settings.notifications} onChange={(on) => void store.setNotifications(on)} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: store.notificationsDenied ? 'var(--bad)' : 'var(--muted)' }}>
              {store.notificationsDenied ? t('settings.notifications.denied') : t('settings.notifications.body')}
            </span>
          </>
        )}
      </Section>
      <Section>
        <LinkRow title={t('settings.privacy')} icon={Shield} colors={[0x7be08f, 0x3ba85e]} href={`${site}privacy.html${anchor}`} />
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: 0 }} />
        <LinkRow title={t('settings.support')} icon={HandHelping} colors={[0x7dd3f0, 0x3b9fd6]} href={`${site}support.html${anchor}`} />
      </Section>
      {confirm ? (
        <Glass className="col" style={{ gap: 10 }}>
          <span className="display" style={{ fontSize: 16 }}>
            {t('settings.reset.confirm')}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('settings.reset.body')}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Gloss gloss="red" radius={14} onClick={() => (store.resetGame(), onClose())} style={{ flex: 1, minHeight: 40, fontSize: 14 }}>
              {t('settings.reset.action')}
            </Gloss>
            <Gloss gloss={null} radius={14} onClick={() => setConfirm(false)} style={{ flex: 1, minHeight: 40, fontSize: 14 }}>
              {t('common.cancel')}
            </Gloss>
          </div>
        </Glass>
      ) : (
        <Gloss gloss="red" radius={15} onClick={() => setConfirm(true)} testId="reset" style={{ width: '100%', minHeight: 44, fontSize: 15 }}>
          <RotateCcw size={16} strokeWidth={3} />
          {t('settings.reset')}
        </Gloss>
      )}
      <span className="soft" style={{ fontSize: 10.5, textAlign: 'center', paddingTop: 4 }}>
        {t('settings.footer', __APP_VERSION__, store.state.city + 1, money(store.state.totalEarned))}
      </span>
    </Sheet>
  );
}

// ------------------------------------------------------------ yokken

export function OfflineSheet() {
  const store = useStore();
  const report = store.offlineReport;
  if (!report) return null;
  return (
    <Sheet onClose={() => store.dismissOffline()} done={done()} center testId="offline-sheet">
      <OfflineCard report={report} onCollect={() => store.dismissOffline()} />
    </Sheet>
  );
}

// ------------------------------------------------------------ holding haritası

export function MapSheet({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const active = CHAIN_IDS.filter((id) => tradeRoutes(state.city, id) > 0);
  return (
    <Sheet title={t('map.title')} onClose={onClose} done={done()} testId="map-sheet">
      <span className="muted" style={{ fontSize: 12.5, padding: '0 4px' }}>
        {t('map.body')}
      </span>
      <Glass padding={8}>
        <HoldingMap state={state} />
      </Glass>
      <Section title={t('map.routes')}>
        {active.length === 0 ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {t('map.noRoutes')}
          </span>
        ) : (
          active.map((chain) => {
            const count = tradeRoutes(state.city, chain);
            return (
              <div key={chain} className="row" style={{ gap: 10 }}>
                <ChainTile chain={chain} size={30} />
                <span className="display grow" style={{ fontSize: 15 }}>
                  {t('map.route', chainName(chain), count * 10)}
                </span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                  ×{count}
                </span>
              </div>
            );
          })
        )}
      </Section>
    </Sheet>
  );
}

// ------------------------------------------------------------ lig

type Tab = 'group' | 'private' | 'stars';

const PLATFORM_ICON: Record<string, LucideIcon> = { ios: Smartphone, android: Smartphone, web: Globe };

function PlatformMark({ platform }: { platform?: string }) {
  if (!platform) return null;
  const Icon = PLATFORM_ICON[platform] ?? Globe;
  return (
    <span title={t(`platform.${platform}`)} aria-label={t(`platform.${platform}`)} style={{ color: 'var(--soft)', display: 'inline-flex' }}>
      <Icon size={12} strokeWidth={2.6} />
    </span>
  );
}

function Row({ rank, name, me, value, move, platform }: { rank: number; name: string; me: boolean; value: string; move?: number; platform?: string }) {
  return (
    <div className="row" style={{ gap: 10, padding: '5px 8px', borderRadius: 12, background: me ? 'var(--neck)' : 'transparent', border: `1.5px solid ${me ? 'var(--neck-ring)' : 'transparent'}` }}>
      <span
        className="display"
        style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: rank <= 3 ? '#ffd25e' : 'var(--track)', color: rank <= 3 ? '#5a3a00' : 'var(--muted)' }}
      >
        {rank}
      </span>
      <span className={`nowrap grow ${me ? 'display' : ''}`} style={{ fontSize: me ? 14 : 13.5, fontWeight: 800 }}>
        {me ? `${name} · ${t('league.you')}` : name}
      </span>
      <PlatformMark platform={platform} />
      {move !== undefined && move !== 0 && (move > 0 ? <CircleArrowUp size={14} color="var(--good)" strokeWidth={2.8} aria-label={t('league.up')} /> : <CircleArrowDown size={14} color="var(--bad)" strokeWidth={2.8} aria-label={t('league.down')} />)}
      <span className="display money nowrap" style={{ fontSize: 13.5, minWidth: 72, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

const leagueRow = (row: LeagueRow) => <Row key={`${row.rank}-${row.name}`} rank={row.rank} name={row.name} me={row.me} value={money(row.score)} move={row.move} platform={row.platform} />;
const starRow = (row: StarRow) => <Row key={`${row.rank}-${row.name}`} rank={row.rank} name={row.name} me={row.me} value={`${row.stars} ★`} platform={row.platform} />;

export function LeagueSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const status = store.leagueStatus;
  const [tab, setTab] = useState<Tab>(() => (store.params.has('private') ? 'private' : store.params.has('stars') ? 'stars' : 'group'));
  const [name, setName] = useState('');
  const [newLeague, setNewLeague] = useState('');
  const [code, setCode] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [link, setLink] = useState<{ code: string; expiresAt: number } | null>(null);
  const [claim, setClaim] = useState('');
  useEffect(() => {
    void store.refreshLeague();
  }, [store]);
  const standings = store.standings;
  const division = standings?.division ?? 0;
  const left = standings ? Math.max(0, standings.endsAt / 1000 - Date.now() / 1000) : null;
  const score = standings?.group.find((r) => r.me)?.score ?? 0;
  return (
    <Sheet title={t('league.title')} onClose={onClose} done={done()} testId="league-sheet">
      <Glass className="col" style={{ gap: 9 }}>
        <div className="row" style={{ gap: 12 }}>
          <IconTile icon={division >= 3 ? Diamond : Trophy} colors={divisionColors(division)} size={46} />
          <div className="col grow" style={{ gap: 2 }}>
            <span className="display" style={{ fontSize: 19 }}>
              {t('league.divisionLine', divisionName(division))}
            </span>
            <span className="money" style={{ fontSize: 13, fontWeight: 800 }}>
              {t('league.score', money(score))}
            </span>
          </div>
          {left !== null && <Pill text={t('league.ends', duration(left))} icon={Clock} size={10} />}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {t('league.body', LEAGUE.promote, LEAGUE.demote)}
        </span>
      </Glass>
      {store.problem && (
        <span className="row warn" style={{ gap: 6, fontSize: 12, fontWeight: 800, padding: '0 4px' }}>
          <TriangleAlert size={14} strokeWidth={3} />
          {t(store.problem)}
        </span>
      )}
      {status === 'unconfigured' && (
        <Glass>
          <span className="muted" style={{ fontSize: 13 }}>
            {t('league.soon')}
          </span>
        </Glass>
      )}
      {status === 'connecting' && (
        <Glass>
          <span className="muted" style={{ fontSize: 13 }}>
            {t('sync.connecting')}
          </span>
        </Glass>
      )}
      {status === 'unnamed' && (
        <Glass className="col" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('league.joinBody')}
          </span>
          <input className="field" placeholder={t('league.namePlaceholder')} value={name} maxLength={16} onChange={(e) => setName(e.target.value)} autoComplete="off" data-testid="league-name" />
          <span className="muted" style={{ fontSize: 11.5 }}>
            {t('league.nameHint')}
          </span>
          <Gloss gloss={name.trim().length >= 3 && !store.busy ? 'green' : null} radius={15} disabled={name.trim().length < 3 || store.busy} onClick={() => void store.joinLeague(name)} testId="league-join" style={{ width: '100%', minHeight: 44, fontSize: 15 }}>
            {t('league.join')}
          </Gloss>
        </Glass>
      )}
      {(status === 'ready' || status === 'unnamed') && (
        <>
          <PillPicker<Tab> value={tab} options={['group', 'private', 'stars']} label={(o) => t(o === 'group' ? 'league.tabGroup' : o === 'private' ? 'league.tabPrivate' : 'league.tabStars')} onChange={setTab} />
          {tab === 'group' && (
            <Glass className="col" padding={8} style={{ gap: 5 }}>
              {standings && standings.group.length > 0 ? (
                standings.group.map(leagueRow)
              ) : (
                <span className="muted" style={{ fontSize: 12.5, padding: 4 }}>
                  {t('league.empty')}
                </span>
              )}
            </Glass>
          )}
          {tab === 'private' && (
            <>
              {store.privateLeagues.length === 0 && (
                <Glass>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {t('league.noPrivate')} {t('league.privateBody')}
                  </span>
                </Glass>
              )}
              {store.privateLeagues.map((item) => (
                <Glass key={item.code} className="col" padding={10} style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="display grow" style={{ fontSize: 17 }}>
                      {item.name}
                    </span>
                    <Gloss gloss="gold" radius={10} edge={2} label={t('league.copy')} onClick={() => void navigator.clipboard?.writeText(item.code).then(() => store.toast(t('league.copy')))} style={{ fontSize: 11.5, fontFamily: 'var(--text)', fontWeight: 800, padding: '0 10px', minHeight: 28 }}>
                      <Copy size={12} strokeWidth={3} />
                      {t('league.code', item.code)}
                    </Gloss>
                  </div>
                  {item.members.map(leagueRow)}
                  <button type="button" className="link bad" style={{ alignSelf: 'flex-start', paddingTop: 2 }} onClick={() => void store.leavePrivate(item.code)}>
                    {t('league.leave')}
                  </button>
                </Glass>
              ))}
              <Glass className="row" padding={10} style={{ gap: 8 }}>
                <input className="field" placeholder={t('league.createPlaceholder')} value={newLeague} maxLength={24} onChange={(e) => setNewLeague(e.target.value)} disabled={status !== 'ready'} />
                <Gloss gloss={newLeague.trim().length >= 3 && status === 'ready' ? 'orange' : null} radius={13} disabled={newLeague.trim().length < 3 || store.busy || status !== 'ready'} onClick={() => void store.createLeague(newLeague).then((ok) => ok && setNewLeague(''))} style={{ fontSize: 13.5, padding: '0 12px', minHeight: 40 }}>
                  {t('league.create')}
                </Gloss>
              </Glass>
              <Glass className="row" padding={10} style={{ gap: 8 }}>
                <input className="field" placeholder={t('league.codePlaceholder')} value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={status !== 'ready'} style={{ textTransform: 'uppercase' }} />
                <Gloss gloss={code.length === 6 && status === 'ready' ? 'blue' : null} radius={13} disabled={code.length !== 6 || store.busy || status !== 'ready'} onClick={() => void store.joinPrivate(code).then((ok) => ok && setCode(''))} style={{ fontSize: 13.5, padding: '0 12px', minHeight: 40 }}>
                  {t('league.joinCode')}
                </Gloss>
              </Glass>
            </>
          )}
          {tab === 'stars' && (
            <Glass className="col" padding={8} style={{ gap: 5 }}>
              <div className="row" style={{ gap: 8, padding: '2px 4px 6px' }}>
                <Star size={16} fill="#ffb938" color="#ffb938" />
                <span className="display grow" style={{ fontSize: 15 }}>
                  {t('stars.title')}
                </span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                  {store.stars?.me.rank ? t('stars.me', store.stars.me.rank) : t('stars.unranked')}
                </span>
              </div>
              <span className="caps soft" style={{ fontSize: 9.5, padding: '0 4px' }}>
                {upper(t('stars.world'))}
              </span>
              {(store.stars?.top ?? []).map(starRow)}
              <span className="caps soft" style={{ fontSize: 9.5, padding: '8px 4px 0' }}>
                {upper(t('stars.friends'))}
              </span>
              {store.stars && store.stars.friends.length > 0 ? (
                store.stars.friends.map(starRow)
              ) : (
                <span className="muted" style={{ fontSize: 12, padding: 4 }}>
                  {t('stars.empty')}
                </span>
              )}
            </Glass>
          )}
          {status === 'ready' && store.league.account && (
            <Glass className="row" padding={10} style={{ gap: 8 }}>
              <UserRound size={20} color="var(--muted)" />
              {renaming !== null ? (
                <>
                  <input className="field" value={renaming} maxLength={16} onChange={(e) => setRenaming(e.target.value)} aria-label={t('league.renameTitle')} />
                  <Gloss gloss="green" radius={12} edge={3} disabled={renaming.trim().length < 3 || store.busy} onClick={() => void store.rename(renaming).then(() => setRenaming(null))} style={{ fontSize: 13, padding: '0 10px', minHeight: 36 }}>
                    {t('league.save')}
                  </Gloss>
                </>
              ) : (
                <>
                  <span className="nowrap grow" style={{ fontSize: 14, fontWeight: 800 }}>
                    {store.league.account.name}
                  </span>
                  <button type="button" className="link" onClick={() => setRenaming(store.league.account?.name ?? '')} disabled={store.busy}>
                    {t('league.rename')}
                  </button>
                  <button type="button" className="link bad" onClick={() => setConfirmDelete(true)} disabled={store.busy} data-testid="league-delete">
                    {t('league.delete')}
                  </button>
                </>
              )}
            </Glass>
          )}
          {/* Adsız hesabın da sunucuda kaydı var: silinebilmeli (Tur 81, mağazaların kuralı). */}
          {status === 'unnamed' && store.league.account && (
            <Glass className="row" padding={10} style={{ gap: 8 }}>
              <UserRound size={20} color="var(--muted)" />
              <span className="grow muted" style={{ fontSize: 12.5 }}>
                {t('league.unnamedAccount')}
              </span>
              <button type="button" className="link bad" onClick={() => setConfirmDelete(true)} disabled={store.busy} data-testid="league-delete">
                {t('league.delete')}
              </button>
            </Glass>
          )}
          {confirmDelete && (
            <Glass className="col" style={{ gap: 10 }}>
              <span className="display" style={{ fontSize: 16 }}>
                {t('league.deleteTitle')}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('league.deleteBody')}
              </span>
              <div className="row" style={{ gap: 8 }}>
                <Gloss gloss="red" radius={14} onClick={() => void store.deleteAccount().then(() => setConfirmDelete(false))} testId="league-delete-confirm" style={{ flex: 1, minHeight: 40, fontSize: 14 }}>
                  {t('league.deleteConfirm')}
                </Gloss>
                <Gloss gloss={null} radius={14} onClick={() => setConfirmDelete(false)} style={{ flex: 1, minHeight: 40, fontSize: 14 }}>
                  {t('common.cancel')}
                </Gloss>
              </div>
            </Glass>
          )}
        </>
      )}
      {status !== 'unconfigured' && (
        <Section title={t('link.title')}>
          <span className="muted" style={{ fontSize: 12 }}>
            {t('link.body')}
          </span>
          {link ? (
            <div className="row" style={{ gap: 10 }}>
              <span className="display" style={{ fontSize: 26, letterSpacing: '0.12em' }} data-testid="link-code">
                {link.code}
              </span>
              <span className="muted grow" style={{ fontSize: 11.5 }}>
                {t('link.expires', duration(Math.max(0, (link.expiresAt - Date.now()) / 1000)))}
              </span>
            </div>
          ) : (
            <Gloss gloss={status === 'connecting' ? null : 'blue'} radius={14} disabled={status === 'connecting' || store.busy} onClick={() => void store.createLink().then(setLink)} testId="link-create" style={{ width: '100%', minHeight: 40, fontSize: 14 }}>
              {t('link.create')}
            </Gloss>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '4px 0' }} />
          <span className="display" style={{ fontSize: 14 }}>
            {t('link.claimTitle')}
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {t('link.claimBody')}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <input className="field" placeholder={t('link.claimPlaceholder')} value={claim} maxLength={6} onChange={(e) => setClaim(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} data-testid="link-claim-code" />
            <Gloss gloss={claim.length === 6 ? 'orange' : null} radius={13} disabled={claim.length !== 6 || store.busy} onClick={() => void store.claimLink(claim).then((ok) => ok && setClaim(''))} testId="link-claim" style={{ fontSize: 13.5, padding: '0 12px', minHeight: 40 }}>
              {t('link.claim')}
            </Gloss>
          </div>
        </Section>
      )}
    </Sheet>
  );
}
