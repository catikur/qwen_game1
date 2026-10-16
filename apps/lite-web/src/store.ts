/**
 * Oyunun tek kaynağı (iOS `GameStore.swift` karşılığı). Model saf
 * (`@capital/lite-model`); burada zaman, kayıt, eşitleme ve kullanıcı eylemleri.
 *
 * Zaman sabit 1 sn adımlarla (`SyncedGame.tick`): sunucu aynı adımları
 * oynatıyor. Ekrandaki kasa adımlar arasında gelirle süsleniyor, modele
 * girmiyor. Sekme gizliyken geçen süre bir dakikadan uzunsa "yokken
 * kazandın" (`applyOffline`); kısa ayrılışlar sayılmıyor (iOS ile aynı).
 */
import {
  CHAIN_IDS,
  DEAL_LIFETIME,
  SyncedGame,
  catchDeal,
  chainUnlocked,
  dealReward,
  maxAffordable,
  milestonesReached,
  offlineCap,
  sharePrice,
  upgradeCost,
  type ActiveDeal,
  type ChainId,
  type DealKind,
  type LiteState,
  type Stage,
  type SyncOp,
} from '@capital/lite-model';
import { LeagueClient, LeagueError, type PrivateLeague, type Standings, type StarsBoard } from './league';
import { mockLeague } from './mock';
import { PRICE_INTERVAL, PRICE_LIMIT, buildScenario } from './scenario';
import { applySettings, loadSettings, saveSettings, type Settings } from './settings';
import { cancelNotifications, isNative, nativeHaptic, notificationPermission, onAppState, requestNotifications, scheduleNotifications } from './native';
import { haptic, play, type Cue } from './sound';
import { t } from './l10n';

export type BuyAmount = 'one' | 'ten' | 'max';

export interface OfflineReport {
  earned: number;
  seconds: number;
  cap: number;
}

/** Son yakalanan fırsat (şehirde uçuş için). */
export interface DealCatch {
  id: number;
  deal: ActiveDeal;
  reward: number;
  at: number;
  /** CI karesi: uçuş yarı yolda donuk. */
  frozen?: boolean;
}

interface SaveFile {
  version: 1;
  state: LiteState;
  /** Sunucuya henüz gitmemiş günlük. */
  ops: SyncOp[];
  /** Sunucudaki sürüm (bu durumun üstüne oynandığı). */
  base: number | null;
  lastSeen: number;
  prices: number[];
}

const SAVE_KEY = 'lite.save';
/**
 * Kaydı şu an oynatan örnek: en son açılan sekme ya da pencere (Android'de
 * etkinlik yeniden kurulunca arkada kalan eski WebView de bir örnek). Eskisi
 * duruyor; aynı kayıt iki yerde birden oynanıp birbirinin üstüne yazılmıyor.
 */
const OWNER_KEY = 'lite.owner';
/** İki eşitleme arası (ms). */
const SYNC_EVERY = 30_000;
/** Bir dakikadan kısa ayrılışlar "yokken" sayılmıyor. */
const AWAY_MIN = 60;
/**
 * Sessiz hesap ancak bu kadar oynanınca (sn) ya da lig penceresi açılınca:
 * her ziyaret (özel pencere, bir bakıp çıkan) sunucuda boş hesap bırakmasın.
 * Önceki oyun sunucuda yeniden oynanıyor (yeni hesaba en çok 1 saatlik pay).
 */
const REGISTER_AFTER = 60;

export type LeagueStatus = 'unconfigured' | 'connecting' | 'unnamed' | 'ready';

export class GameStore {
  game: SyncedGame;
  settings: Settings;
  buyAmount: BuyAmount = 'one';
  /** Başarılı alım, başarısız alım, büyük an: dokunsal geri bildirimin tetikleri. */
  purchases = 0;
  refusals = 0;
  triumphs = 0;
  catches = 0;
  lastCatch: DealCatch | null = null;
  priceHistory: number[] = [];
  offlineReport: OfflineReport | null = null;
  /** Kısa bilgi (alt kenarda birkaç saniye). */
  notice: string | null = null;
  /** Adımlar arasında geçen kesir (0–1): ekrandaki kasa bununla süsleniyor. */
  fraction = 0;

  readonly scenario: string | null;
  readonly params: URLSearchParams;
  readonly league: LeagueClient;
  /** Sunucudaki sürüm; hesap yoksa null. */
  base: number | null = null;
  standings: Standings | null = null;
  privateLeagues: PrivateLeague[] = [];
  stars: StarsBoard | null = null;
  /** Lig penceresinde gösterilecek hata (L10n anahtarı). */
  problem: string | null = null;
  busy = false;
  /** Android: bildirim izni reddedildi (anahtar açılamıyor). */
  notificationsDenied = false;
  /** Kayıt başka bir örnekte açıldı: bu örnek durdu, kayda ve sunucuya bir daha yazmıyor. */
  superseded = false;

  private listeners = new Set<() => void>();
  private revisionValue = 0;
  private lastTick = performance.now();
  private hiddenAt: number | null = null;
  /** Uygulama arka planda (sekme gizli ya da Android'de arka plan); iki olay aynı ayrılışı iki kez saymasın. */
  private paused = false;
  private lastSample = -Infinity;
  private sinceSave = 0;
  private syncing = false;
  private registering = false;
  private lastSync = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  /** Hesap ya da oyun değişince artıyor: eski hesabın yolda kalan yanıtı yeni oyunun üstüne yazılmasın. */
  private epoch = 0;
  /** Yolda olan sessiz hesap açılışı: taşıma kodu bunu bekliyor (sonradan gelen yeni hesap alınanın üstüne yazmasın). */
  private registration: Promise<unknown> | null = null;

  // Android CI karesi: kabukta adres çubuğu yok; senaryo derleme anında verilebiliyor (VITE_SCENARIO_QUERY).
  constructor(search: string = typeof location !== 'undefined' ? location.search || (import.meta.env.VITE_SCENARIO_QUERY ?? '') : '') {
    this.params = new URLSearchParams(search);
    this.scenario = this.params.get('scenario');
    const ephemeral = this.scenario !== null;
    this.settings = loadSettings(ephemeral);
    const lang = this.params.get('lang');
    if (lang === 'tr' || lang === 'en') this.settings.language = lang;
    const theme = this.params.get('theme');
    if (theme === 'day' || theme === 'night') this.settings.appearance = theme;
    applySettings(this.settings);
    this.league = new LeagueClient(ephemeral ? '' : __LEAGUE_URL__, ephemeral);

    if (this.scenario !== null) {
      const built = buildScenario(this.scenario);
      this.game = new SyncedGame(built.state);
      this.priceHistory = built.prices;
      const offline = Number(this.params.get('offline'));
      if (offline > 0) this.away(offline);
      this.applyScenarioDeal();
      if (this.params.has('league')) {
        Object.assign(this, mockLeague(built.state));
        this.league.account = { id: 'mock', token: '', name: 'Atilla Holding' };
      }
      this.lastSample = this.game.state.clock;
      return;
    }
    const saved = GameStore.load();
    if (saved) {
      this.game = new SyncedGame(saved.state);
      for (const op of saved.ops) this.game.journal.push(op);
      this.base = saved.base;
      this.priceHistory = saved.prices;
      this.lastSample = this.game.state.clock;
      this.away((Date.now() - saved.lastSeen) / 1000);
    } else {
      this.game = new SyncedGame(buildScenario('start').state);
      this.lastSample = 0;
    }
  }

  get state(): LiteState {
    return this.game.state;
  }

  get revision(): number {
    return this.revisionValue;
  }

  get isScenario(): boolean {
    return this.scenario !== null;
  }

  get leagueStatus(): LeagueStatus {
    if (this.isScenario) return this.standings ? 'ready' : 'unconfigured';
    if (!this.league.configured) return 'unconfigured';
    if (!this.league.account || this.base === null) return 'connecting';
    return this.league.account.name === '' ? 'unnamed' : 'ready';
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revisionValue;

  private changed(): void {
    this.revisionValue += 1;
    for (const listener of this.listeners) listener();
  }

  // ------------------------------------------------------------ zaman

  start(): void {
    if (this.isScenario || this.timer || this.superseded) return;
    try {
      localStorage.setItem(OWNER_KEY, this.owner);
    } catch {
      // Depo yok (özel pencere): kilit de yok, tek örnek varsayılıyor.
    }
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 100);
    document.addEventListener('visibilitychange', this.visibility);
    addEventListener('pagehide', this.leave);
    addEventListener('storage', this.storageChanged);
    if (isNative) {
      void onAppState((active) => (active ? this.resume() : this.pause()));
      void this.refreshNotifications();
    }
    void this.connect();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.visibility);
    removeEventListener('pagehide', this.leave);
    removeEventListener('storage', this.storageChanged);
  }

  private storageChanged = (event: StorageEvent): void => {
    if (event.key === OWNER_KEY && event.newValue !== null && event.newValue !== this.owner) this.standDown();
  };

  /** Kayıt hâlâ bu örnekte mi (olay kaçarsa yazmadan önce de bakılıyor); değilse dur. */
  private owns(): boolean {
    if (this.superseded) return false;
    let current: string | null = null;
    try {
      current = localStorage.getItem(OWNER_KEY);
    } catch {
      return true;
    }
    if (current !== null && current !== this.owner) {
      this.standDown();
      return false;
    }
    return true;
  }

  private standDown(): void {
    if (this.superseded) return;
    this.superseded = true;
    this.stop();
    this.changed();
  }

  private tick(): void {
    if (document.hidden || this.paused) return;
    const now = performance.now();
    let dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    // Uyku ya da duraklama sonrası büyük sıçrama: dakikadan uzunsa "yokken", değilse sayılmıyor.
    if (dt > 3) {
      if (dt > AWAY_MIN) this.away(dt);
      dt = 0;
    }
    this.fraction += dt;
    const steps = Math.floor(this.fraction);
    if (steps > 0) {
      this.fraction -= steps;
      const hadEvent = this.state.event !== null;
      this.game.tick(steps);
      if (!hadEvent && this.state.event !== null) this.cue('event');
      this.samplePrice();
      this.sinceSave += steps;
      if (this.sinceSave >= 5) this.save();
      if (Date.now() - this.lastSync >= SYNC_EVERY) void this.sync();
    }
    this.changed();
  }

  private visibility = (): void => {
    if (document.hidden) this.pause();
    else this.resume();
  };

  /** Arka plana geçiş: kaydet, eşitle; Android'de bildirimleri zamanla. */
  private pause(): void {
    if (this.paused || this.superseded) return;
    this.paused = true;
    this.hiddenAt = Date.now();
    this.save();
    void this.sync(true);
    if (isNative && this.settings.notifications && !this.isScenario) void scheduleNotifications(this.state).catch(() => undefined);
  }

  /** Öne dönüş: yokken geçen süre, bildirimler silinir, başka cihaz ilerlediyse onun durumu. */
  private resume(): void {
    if (!this.paused || this.superseded) return;
    this.paused = false;
    if (isNative) void cancelNotifications().catch(() => undefined);
    if (this.hiddenAt !== null) this.away((Date.now() - this.hiddenAt) / 1000);
    this.hiddenAt = null;
    this.lastTick = performance.now();
    void this.refresh();
  }

  private leave = (): void => {
    this.save();
    void this.sync(true);
  };

  /** Uygulama kapalıyken geçen süre (bir dakikadan kısası sayılmıyor). */
  private away(seconds: number): void {
    if (!(seconds > AWAY_MIN)) {
      // Kısa ayrılış "yokken" sayılmıyor; ama duran fırsat kapalıyken kaçıyor (günlükte, sunucu da aynısını oynatsın).
      if (seconds > 0 && this.state.deal) {
        this.game.away(0);
        this.changed();
      }
      return;
    }
    const result = this.game.away(seconds);
    if (this.state.listed) this.pushPrice();
    this.lastSample = this.state.clock;
    if (result.earned > 0) this.offlineReport = { earned: result.earned, seconds: result.seconds, cap: offlineCap(this.state) };
    this.changed();
  }

  private samplePrice(): void {
    if (!this.state.listed || this.state.clock - this.lastSample < PRICE_INTERVAL) return;
    this.lastSample = this.state.clock;
    this.pushPrice();
  }

  private pushPrice(): void {
    this.priceHistory.push(sharePrice(this.state));
    if (this.priceHistory.length > PRICE_LIMIT) this.priceHistory.splice(0, this.priceHistory.length - PRICE_LIMIT);
  }

  // ------------------------------------------------------------ kayıt

  private static load(): SaveFile | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const file = JSON.parse(raw) as SaveFile;
      return file.version === 1 && file.state ? { ...file, ops: file.ops ?? [], prices: file.prices ?? [] } : null;
    } catch {
      return null;
    }
  }

  save(): void {
    this.sinceSave = 0;
    if (this.isScenario || !this.owns()) return;
    const file: SaveFile = { version: 1, state: this.state, ops: this.game.journal.ops, base: this.base, lastSeen: Date.now(), prices: this.priceHistory };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    } catch {
      // Özel pencere ya da dolu depo: oyun sürüyor, kayıt sunucuda.
    }
  }

  // ------------------------------------------------------------ eşitleme

  /**
   * Hesap varsa sunucunun durumuna bak; yoksa (bir dakika oynandıysa ya da
   * `force`) sessizce aç.
   */
  private async connect(force = false): Promise<void> {
    if (!this.league.configured || this.isScenario || this.superseded) return;
    try {
      if (this.league.account) {
        await this.refresh();
        return;
      }
      if (this.registering || (!force && this.state.clock < REGISTER_AFTER)) return;
      this.registering = true;
      const registration = this.league.register();
      this.registration = registration.catch(() => undefined);
      const save = await registration;
      // Yeni hesabın oyunu sıfırdan; buradaki günlük de sıfırdan oynandı.
      this.base = save.version;
      this.save();
      this.changed();
      await this.sync();
    } catch {
      // Ağ yok: sonraki eşitlemede yeniden.
    } finally {
      this.registering = false;
      this.registration = null;
    }
  }

  /** Başka cihaz ilerlediyse onun durumuna geç (günlükte bekleyen yoksa sessizce). */
  async refresh(): Promise<void> {
    if (!this.league.account || this.isScenario || this.superseded) return;
    const epoch = this.epoch;
    try {
      const save = await this.league.loadSave();
      if (epoch !== this.epoch) return;
      // Hesap açıldı ama sürüm kaydedilmeden sayfa kapandı: sunucu hâlâ sıfırda, buradaki günlük onun üstünde.
      if (this.base === null && save.version === 0) {
        this.base = 0;
        await this.sync();
        return;
      }
      if (this.base === null || save.version > this.base) {
        if (this.game.journal.pending === 0 || this.base === null) {
          this.adopt(save.state, save.version, this.base !== null && save.version > this.base);
        } else {
          await this.sync();
        }
      }
    } catch (error) {
      if (epoch === this.epoch) this.handleSyncError(error);
    }
  }

  async sync(keepalive = false): Promise<void> {
    if (!this.league.account && !keepalive) {
      void this.connect();
      return;
    }
    if (this.syncing || this.isScenario || !this.league.account || this.base === null) return;
    if (this.game.journal.pending === 0 || !this.owns()) return;
    this.syncing = true;
    this.lastSync = Date.now();
    const ops = this.game.journal.take();
    const rest = this.game.journal.pending - ops.length;
    const batch = `${this.league.account.id.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const epoch = this.epoch;
    try {
      const result = await this.league.sync(this.base, batch, ops, rest, keepalive);
      // Bu arada hesap ya da oyun değişti (taşıma kodu, silme): yanıt eski hesabın.
      // Gönderilenler (oyun değişmediyse) yeni hesaba sürümüyle gidip uzlaşıyor.
      if (epoch !== this.epoch) {
        this.game.journal.release();
        return;
      }
      this.base = result.version;
      const before = JSON.stringify(this.state);
      this.game.accepted(result.state);
      if (result.skipped > 0 || result.clipped > 10 || (rest === 0 && JSON.stringify(this.state) !== before)) this.toast(t('sync.corrected'));
      this.save();
      this.changed();
      // Günlükte gönderilecek başka kayıt varsa hemen.
      if (this.game.journal.pending > 0 && rest > 0) setTimeout(() => void this.sync(), 2_100);
    } catch (error) {
      this.game.journal.release();
      if (epoch === this.epoch) this.handleSyncError(error);
    } finally {
      this.syncing = false;
    }
  }

  private handleSyncError(error: unknown): void {
    if (!(error instanceof LeagueError)) return;
    if (error.status === 409 && error.code === 'stale') {
      const body = error.body as { version: number; state: LiteState };
      this.adopt(body.state, body.version, true);
    } else if (error.status === 400 && error.code === 'body') {
      // Sunucu günlüğü geçersiz buldu: aynısını sonsuza dek denemek yerine sunucunun durumuna dön.
      void this.recover();
    } else if (error.status === 401) {
      // Hesap silinmiş (başka cihazdan): yeni sessiz hesap, oyun sıfırdan.
      this.epoch += 1;
      this.league.forget();
      this.base = null;
      this.game.replaced(buildScenario('start').state);
      this.toast(t('sync.signedOut'));
      void this.connect();
    } else if (error.status === 404 && error.code === 'save') {
      this.base = null;
    }
    this.changed();
  }

  /** Günlüğü sunucu kabul etmedi (400): bekleyenler gidiyor, sunucunun durumu geçerli. */
  private async recover(): Promise<void> {
    const epoch = this.epoch;
    try {
      const save = await this.league.loadSave();
      if (epoch === this.epoch) this.adopt(save.state, save.version, true);
    } catch {
      // Ağ yok: sonraki eşitlemede yeniden.
    }
  }

  /** Sunucunun durumuna geç: bekleyen günlük gidiyor. */
  private adopt(state: LiteState, version: number, tell: boolean): void {
    this.game.replaced(state);
    this.base = version;
    this.lastSample = state.clock;
    if (tell) this.toast(t('sync.replaced'));
    this.save();
    this.changed();
  }

  toast(text: string): void {
    this.notice = text;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.changed();
    }, 4_000);
    this.changed();
  }

  // ------------------------------------------------------------ eylemler

  /** Seçili toplu alım miktarına göre kaç seviye alınacağı. */
  count(chain: ChainId, stage: Stage): number {
    const level = this.state.chains[chain].levels[stage];
    if (this.buyAmount === 'one') return 1;
    if (this.buyAmount === 'ten') return 10;
    return Math.max(1, maxAffordable(this.state.cash, chain, stage, level));
  }

  cost(chain: ChainId, stage: Stage): number {
    return upgradeCost(chain, stage, this.state.chains[chain].levels[stage], this.count(chain, stage));
  }

  canBuy(chain: ChainId, stage: Stage): boolean {
    return chainUnlocked(this.state, chain) && this.cost(chain, stage) <= this.state.cash;
  }

  setBuyAmount(amount: BuyAmount): void {
    this.buyAmount = amount;
    this.changed();
  }

  buy(chain: ChainId, stage: Stage): void {
    const before = this.state.chains[chain].levels[stage];
    if (this.game.act(['b', chain, stage, this.count(chain, stage)]).ok) {
      const after = this.state.chains[chain].levels[stage];
      if (milestonesReached(after) > milestonesReached(before)) this.triumph('milestone');
      else this.purchase('buy');
    } else {
      this.refuse();
    }
    this.changed();
  }

  buyManager(): void {
    if (this.game.act(['m']).ok) this.purchase('buy');
    else this.refuse();
    this.changed();
  }

  campaign(): void {
    if (this.game.act(['c']).ok) this.purchase('milestone');
    this.changed();
  }

  chooseCouncil(choice: 0 | 1): void {
    if (this.game.act(['p', choice]).ok) this.triumph('reward');
    this.changed();
  }

  catchDeal(): void {
    const deal = this.state.deal;
    if (!deal) return;
    const reward = dealReward(this.state);
    if (!this.game.act(['d']).ok) return;
    this.catches += 1;
    this.lastCatch = { id: this.catches, deal, reward, at: performance.now() };
    this.triumph(deal.kind === 'investor' ? 'fanfare' : 'reward');
    this.changed();
  }

  claimGoal(): void {
    if (this.game.act(['g']).ok) this.triumph('reward');
    else this.refuse();
    this.changed();
  }

  goPublic(): void {
    if (!this.game.act(['i']).ok) return;
    this.priceHistory = [sharePrice(this.state)];
    this.lastSample = this.state.clock;
    this.triumph('fanfare');
    this.save();
    this.changed();
  }

  sellCity(): void {
    if (!this.game.act(['s']).ok) return;
    this.priceHistory = [];
    this.lastSample = this.state.clock;
    this.triumph('fanfare');
    this.save();
    void this.sync();
    this.changed();
  }

  resetGame(): void {
    this.game.act(['r']);
    this.priceHistory = [];
    this.lastSample = this.state.clock;
    this.offlineReport = null;
    this.save();
    void this.sync();
    this.changed();
  }

  dismissOffline(): void {
    this.offlineReport = null;
    this.changed();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings, this.isScenario);
    applySettings(this.settings);
    this.changed();
  }

  private purchase(cue: Cue): void {
    this.purchases += 1;
    this.cue(cue);
    this.vibrate('selection');
  }

  private refuse(): void {
    this.refusals += 1;
    this.cue('refuse');
    this.vibrate('warning');
  }

  private triumph(cue: Cue): void {
    this.triumphs += 1;
    this.cue(cue);
    this.vibrate('success');
  }

  private vibrate(kind: 'selection' | 'warning' | 'success'): void {
    if (!this.settings.haptics || this.isScenario) return;
    if (isNative) void nativeHaptic(kind).catch(() => undefined);
    else haptic(kind);
  }

  // ------------------------------------------------------------ bildirimler (Android)

  /** Bildirim anahtarı: açarken izin iste; reddedildiyse kapalı kal. */
  async setNotifications(on: boolean): Promise<void> {
    this.updateSettings({ notificationsOffered: true });
    if (!on) {
      this.updateSettings({ notifications: false });
      void cancelNotifications().catch(() => undefined);
      return;
    }
    const permission = await notificationPermission().catch(() => 'denied' as const);
    const granted = permission === 'granted' || (permission === 'prompt' && (await requestNotifications().catch(() => false)));
    this.notificationsDenied = !granted;
    this.updateSettings({ notifications: granted });
  }

  /** Açılışta iznin hâlâ geçerli olduğunu doğrula (telefonun ayarlarından kapatılmış olabilir). */
  private async refreshNotifications(): Promise<void> {
    const permission = await notificationPermission().catch(() => 'prompt' as const);
    this.notificationsDenied = permission === 'denied';
    if (permission === 'denied' && this.settings.notifications) this.updateSettings({ notifications: false });
    this.changed();
  }

  private cue(cue: Cue): void {
    if (this.settings.sound && !this.isScenario) play(cue);
  }

  // ------------------------------------------------------------ lig

  private async run<T>(work: () => Promise<T>): Promise<T | null> {
    this.busy = true;
    this.problem = null;
    this.changed();
    try {
      return await work();
    } catch (error) {
      this.problem = GameStore.problemOf(error);
      return null;
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  private static problemOf(error: unknown): string {
    if (!(error instanceof LeagueError)) return 'league.error.network';
    if (error.code === 'name-blocked') return 'league.error.blocked';
    if (error.code === 'name') return 'league.error.name';
    if (error.code === 'full') return 'league.error.full';
    if (error.code === 'limit') return 'league.error.limit';
    if (error.status === 404 && error.code === 'code') return 'league.error.code';
    return 'league.error.network';
  }

  /** Lig penceresi açılınca: grup, özel ligler, yıldız tablosu. */
  async refreshLeague(): Promise<void> {
    if (this.isScenario) return;
    if (!this.league.account) await this.connect(true);
    if (!this.league.account) return;
    await this.sync();
    try {
      const [standings, leagues, stars] = await Promise.all([this.league.standings(), this.league.leagues(), this.league.stars()]);
      this.standings = standings;
      this.privateLeagues = leagues;
      this.stars = stars;
    } catch (error) {
      this.problem = GameStore.problemOf(error);
    }
    this.changed();
  }

  async joinLeague(name: string): Promise<void> {
    await this.run(() => this.league.rename(name.trim()));
    await this.refreshLeague();
  }

  async rename(name: string): Promise<void> {
    await this.run(() => this.league.rename(name.trim()));
    await this.refreshLeague();
  }

  async createLeague(name: string): Promise<boolean> {
    const ok = await this.run(() => this.league.createLeague(name.trim()));
    await this.refreshLeague();
    return ok !== null;
  }

  async joinPrivate(code: string): Promise<boolean> {
    const ok = await this.run(() => this.league.joinLeague(code.trim().toUpperCase()));
    await this.refreshLeague();
    return ok !== null;
  }

  async leavePrivate(code: string): Promise<void> {
    await this.run(() => this.league.leaveLeague(code));
    await this.refreshLeague();
  }

  /** Hesabı sil: sunucudan her iz gidiyor; bu cihazda yeni, adsız hesapla oyun sıfırdan. */
  async deleteAccount(): Promise<void> {
    const ok = await this.run(() => this.league.deleteAccount());
    if (ok === null) return;
    this.epoch += 1;
    this.standings = null;
    this.privateLeagues = [];
    this.stars = null;
    this.base = null;
    this.game.replaced(buildScenario('start').state);
    this.priceHistory = [];
    this.save();
    this.changed();
    void this.connect();
  }

  /** Başka cihaza taşıma kodu. */
  async createLink(): Promise<{ code: string; expiresAt: number } | null> {
    await this.sync();
    return this.run(() => this.league.createLink());
  }

  /** Kodla başka cihazdaki hesabı buraya al: buradaki oyun yerine o geliyor. */
  async claimLink(code: string): Promise<boolean> {
    await this.registration;
    const before = this.league.account?.id;
    const save = await this.run(() => this.league.claimLink(code.trim().toUpperCase()));
    // Hesap değiştiyse eski hesabın yolda kalan eşitlemesi yok sayılıyor.
    if (this.league.account?.id !== before) this.epoch += 1;
    if (this.problem === 'league.error.code') this.problem = 'link.error.code';
    if (save === null) return false;
    this.adopt(save.state, save.version, false);
    this.toast(t('link.done'));
    await this.refreshLeague();
    return true;
  }

  // ------------------------------------------------------------ CI kareleri

  /** `?deal=order|vip|investor` fırsatla açılıyor; `&caught` yakalanmış (uçuş donuk). */
  private applyScenarioDeal(): void {
    const state = this.game.state;
    state.deal = null;
    const kind = this.params.get('deal') as DealKind | null;
    if (kind !== 'order' && kind !== 'vip' && kind !== 'investor') return;
    const selling = CHAIN_IDS.filter((id) => state.chains[id].levels[2] > 0);
    const chain = kind === 'investor' ? null : selling.includes('coffee') ? 'coffee' : (selling[0] ?? null);
    state.deal = { kind, chain, until: state.clock + DEAL_LIFETIME * 0.7 };
    state.deals = 9;
    if (this.params.has('caught')) {
      const deal = state.deal;
      const reward = dealReward(state);
      const next = catchDeal(state);
      if (next.ok) {
        this.game.state = next.state;
        this.lastCatch = { id: 1, deal, reward, at: performance.now(), frozen: true };
      }
    }
  }
}
