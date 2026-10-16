/**
 * CapitalForge Lite — sunucu yetkili kayıt (L10).
 *
 * Web ve Android'de cihaz kanıtı (App Attest) yok. Onun yerine istemci son
 * eşitlemeden beri yaptığı her şeyi bir günlük olarak gönderiyor; sunucu aynı
 * modeli kendi kayıtlı durumundan oynatıyor. İki taraf aynı kodu aynı sırayla
 * çalıştırdığı için sonuç bit bit aynı; farklıysa istemci hile yapmış ya da
 * saati kaymıştır ve sunucunun durumuna dönüyor.
 *
 * Zaman sabit adımlarla: istemci modeli yalnızca `advance(state, 1)` ile
 * ilerletiyor (arada kalan kesir ekranda süsleniyor, modele girmiyor). Günlükte
 * `['t', n]` art arda n adım demek. Uygulama kapalıyken geçen süre
 * `['o', saniye]`: `applyOffline` (tavanı ve verimi model uyguluyor).
 *
 * Sunucu süreyi kendi saatiyle sınırlıyor: bir hesabın günlüğündeki toplam
 * süre, hesap açıldığından beri gerçekten geçen süreyi aşamıyor. Fazlası
 * kırpılıyor; tutmayan eylemler (yetmeyen para, olmayan fırsat) atlanıyor.
 */
import { CHAIN_IDS, COUNCIL_PAIRS, EVENT_KINDS, STAGES, type ChainId, type DealKind, type Stage } from './content';
import {
  advance,
  applyOffline,
  buy,
  buyManager,
  catchDeal,
  chooseCouncil,
  claimGoal,
  goPublic,
  newGame,
  offlineCap,
  prestige,
  startCampaign,
  type ActionResult,
  type LiteState,
} from './model';
import { starFree } from './league';

/** Günlükteki tek kayıt. Kısa diziler: gövde küçük kalsın. */
export type SyncOp =
  /** n çevrimiçi adım (her biri `advance(state, 1)`). */
  | ['t', number]
  /** Uygulama kapalıyken geçen süre (sn). */
  | ['o', number]
  /** Seviye al: zincir, kademe, adet. */
  | ['b', ChainId, Stage, number]
  /** Genel Müdür. */
  | ['m']
  /** Kampanya. */
  | ['c']
  /** Meclis kararı (0 ya da 1). */
  | ['p', 0 | 1]
  /** Görev ödülü. */
  | ['g']
  /** Fırsat balonu. */
  | ['d']
  /** Halka arz. */
  | ['i']
  /** Şehri sat (holding yeni şehre). */
  | ['s']
  /** Kaydı sıfırla: baştan yeni oyun (Ayarlar). */
  | ['r'];

export const SYNC = {
  /** Çevrimiçi adım (sn). */
  step: 1,
  /** Bir gönderimde en çok çevrimiçi adım: sunucunun işlemci sınırı (ücretsiz katman 10 ms). */
  maxSteps: 600,
  /** Bir gönderimde en çok kayıt. */
  maxOps: 1_000,
  /** Saat payı (sn): istemci ile sunucunun saati arasındaki küçük fark. */
  slack: 10,
  /**
   * Yeni hesaba, açılmadan önce oynanmış süre için en çok (sn): ilk açılışta
   * internetsiz oynanan oyun da `maxBank` kadar sayılıyor (bir dakika pay:
   * hesap açılışıyla ilk gönderim arasındaki süre pencereden düşmesin).
   */
  headStart: 86_400 - 60,
  /** Bir çevrimdışı kaydın en çok süresi (sn); tavanı zaten model uyguluyor. */
  maxAway: 30 * 86_400,
  /**
   * Sunucunun görmediği çevrimiçi oyun en çok (sn): çevrimiçi adımlar yalnızca
   * bütçenin son bu kadarına yerleşebiliyor. İnternetsiz açık oynanan bir gün
   * (uçak, yolculuk) bağlanınca tam sayılıyor; günlerce boşluk sonradan
   * "çevrimiçiydim" diye doldurulamıyor (çevrimdışı tavanı ve yarım verim
   * aşılmasın). Bundan eski adımlar çevrimdışı kazanç sayılıyor (ayrılış gibi).
   */
  maxBank: 86_400,
} as const;

/** Oynatmanın sonucu. */
export interface Replay {
  state: LiteState;
  /** Uygulanan ve atlanan kayıt sayısı. */
  applied: number;
  skipped: number;
  /** Kullanılan gerçek süre (sn): çevrimiçi adımlar ve çevrimdışı kayıtlar. */
  seconds: number;
  /** Kırpılan süre (sn): sunucunun saatine sığmayan. */
  clipped: number;
  /**
   * Haftalık puan dilimleri: her zaman kaydının kullandığı süre ve o sürede
   * kazanılanın yıldızsız karşılığı. Sunucu dilimi gerçek zamana yerleştirip
   * haftasına yazıyor.
   */
  spans: Array<{ seconds: number; score: number }>;
  /**
   * Açık kalan ayrılışın kalan kazanç tavanı (sn): günlük bir ayrılışla
   * bittiyse; sonraki gönderim aynı ayrılışla başlarsa tavan ondan sürüyor.
   * Çevrimiçi adımla biten günlükte null.
   */
  awayLeft: number | null;
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** Gelen kaydın biçimi doğru mu (sunucuya ne gelirse gelsin). */
export function validOp(op: unknown): op is SyncOp {
  if (!Array.isArray(op) || typeof op[0] !== 'string') return false;
  switch (op[0]) {
    case 't':
      return op.length === 2 && isInt(op[1], 1, SYNC.maxSteps);
    case 'o':
      return op.length === 2 && typeof op[1] === 'number' && Number.isFinite(op[1]) && op[1] >= 0 && op[1] <= SYNC.maxAway;
    case 'b':
      return op.length === 4 && CHAIN_IDS.includes(op[1] as ChainId) && STAGES.includes(op[2] as Stage) && isInt(op[3], 1, 10_000);
    case 'p':
      return op.length === 2 && (op[1] === 0 || op[1] === 1);
    case 'm':
    case 'c':
    case 'g':
    case 'd':
    case 'i':
    case 's':
    case 'r':
      return op.length === 1;
    default:
      return false;
  }
}

const DEAL_KINDS: readonly DealKind[] = ['order', 'vip', 'investor'];
const POLICY_KINDS = new Set(COUNCIL_PAIRS.flat());

function finite(value: unknown, max = 1e300): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
}

/**
 * Cihazın yüklediği kayıt (iOS, App Attest onaylı) biçimce doğru mu: bütün
 * alanlar var, sayılar sonlu ve eksi değil, türler bilinen değerlerden. Değer
 * olarak akla yatkınlığı App Attest ve haftalık gönderimin denetimi sağlıyor.
 */
export function validState(value: unknown): value is LiteState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  if (s.version !== 1 || !isInt(s.city, 0, 10_000) || !isInt(s.stars, 0, 1e9) || !isInt(s.manager, 0, 1_000)) return false;
  for (const key of ['cash', 'earned', 'totalEarned', 'clock', 'campaignUntil', 'campaignReadyAt', 'nextEventAt', 'nextCouncilAt', 'nextDealAt']) {
    if (!finite(s[key])) return false;
  }
  for (const key of ['events', 'sessions', 'policies', 'campaigns', 'goal', 'deals']) if (!isInt(s[key], 0, 1e9)) return false;
  if (typeof s.listed !== 'boolean') return false;
  const chains = s.chains as Record<string, unknown> | null;
  if (!chains || typeof chains !== 'object' || Object.keys(chains).length !== CHAIN_IDS.length) return false;
  for (const id of CHAIN_IDS) {
    const chain = chains[id] as { levels?: unknown; rival?: unknown } | undefined;
    if (!chain || !Array.isArray(chain.levels) || chain.levels.length !== 3 || !chain.levels.every((l) => isInt(l, 0, 10_000)) || !finite(chain.rival)) return false;
  }
  const event = s.event as { kind?: unknown; chain?: unknown; until?: unknown } | null;
  if (event !== null && (typeof event !== 'object' || !EVENT_KINDS.includes(event.kind as never) || !(event.chain === null || CHAIN_IDS.includes(event.chain as ChainId)) || !finite(event.until))) return false;
  const policy = s.policy as { kind?: unknown; until?: unknown } | null;
  if (policy !== null && (typeof policy !== 'object' || !POLICY_KINDS.has(policy.kind as never) || !finite(policy.until))) return false;
  const deal = s.deal as { kind?: unknown; chain?: unknown; until?: unknown } | null;
  if (deal !== null && (typeof deal !== 'object' || !DEAL_KINDS.includes(deal.kind as DealKind) || !(deal.chain === null || CHAIN_IDS.includes(deal.chain as ChainId)) || !finite(deal.until))) return false;
  if (!(s.council === null || isInt(s.council, 0, COUNCIL_PAIRS.length - 1))) return false;
  if (!Array.isArray(s.history) || s.history.length > 10_000) return false;
  return s.history.every((r: unknown) => {
    const record = r as { stars?: unknown; listed?: unknown; earned?: unknown } | null;
    return !!record && isInt(record.stars, 0, 1e9) && typeof record.listed === 'boolean' && finite(record.earned);
  });
}

/**
 * Swift'in kodladığı kayıt TS biçimine: zincirler dizi (CHAIN_IDS sırasıyla)
 * yerine nesne, boş isteğe bağlı alanlar (Swift yazmıyor) null.
 */
export function normalizeState(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const s = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(s.chains) && s.chains.length === CHAIN_IDS.length) {
    const chains: Record<string, unknown> = {};
    CHAIN_IDS.forEach((id, index) => (chains[id] = (s.chains as unknown[])[index]));
    s.chains = chains;
  }
  for (const key of ['event', 'policy', 'deal', 'council']) if (s[key] === undefined) s[key] = null;
  // Olay ve fırsatta zinciri olmayan (yatırımcı, turizm…) Swift'te alanı hiç yazmıyor.
  for (const key of ['event', 'deal']) {
    const value = s[key] as Record<string, unknown> | null;
    if (value && typeof value === 'object' && value.chain === undefined) s[key] = { ...value, chain: null };
  }
  if (s.history === undefined) s.history = [];
  return s;
}

/** Zaman dışı tek eylem. */
export function applyAction(state: LiteState, op: SyncOp): ActionResult {
  switch (op[0]) {
    case 'b':
      return buy(state, op[1], op[2], op[3]);
    case 'm':
      return buyManager(state);
    case 'c':
      return startCampaign(state);
    case 'p':
      return chooseCouncil(state, op[1]);
    case 'g':
      return claimGoal(state);
    case 'd':
      return catchDeal(state);
    case 'i':
      return goPublic(state);
    case 's':
      return prestige(state);
    case 'r':
      return { ok: true, state: newGame() };
    default:
      return { ok: false, reason: 'none' };
  }
}

/** n çevrimiçi adım: istemcinin yaptığıyla aynı çağrılar. */
export function step(state: LiteState, steps: number): LiteState {
  let next = state;
  for (let k = 0; k < steps; k++) next = advance(next, SYNC.step);
  return next;
}

/**
 * Günlüğü oynat. `budget`: kullanılabilecek gerçek süre (sn; sunucunun saatine
 * göre, saat payıyla). Kayıtlar gerçek zamana art arda yerleşiyor: `complete`
 * (günlük şimdiye kadar tam) ise şimdide bitiyor, baştaki boşluk oynanmamış
 * geçmiş süre; değilse (sırada başka kayıt var) imleçten başlıyor.
 *
 * Çevrimiçi adımlar ayrıca `SYNC.maxSteps` ile sınırlı ve yalnızca bütçenin
 * son `SYNC.maxBank` saniyesinde çevrimiçi sayılıyor: daha eskiye düşen adım
 * çevrimdışı kazanç getiriyor (ayrılış gibi: yarım verim, yanındaki ayrılışlarla
 * ortak tavan); sonraki kayıtlar yerinde kalıyor. Bütçeyi aşan süre kırpılıyor.
 */
export function replay(start: LiteState, ops: readonly SyncOp[], budget: number = Infinity, complete = false, awayFrom: number | null = null): Replay {
  let state = start;
  // Arada çevrimiçi adım olmayan ayrılışlar tek ayrılış: kazanç tavanını paylaşıyor
  // (uzun bir ayrılış birçok kayda bölünüp her birine yeni tavan alınamasın).
  let awayLeft = awayFrom;
  let applied = 0;
  let skipped = 0;
  let seconds = 0;
  let clipped = 0;
  let steps = 0;
  const spans: Replay['spans'] = [];
  const bounded = Number.isFinite(budget);
  const onlineFrom = bounded ? Math.max(0, budget - SYNC.maxBank) : 0;
  if (bounded && complete) {
    const total = ops.reduce((sum, op) => sum + (op[0] === 't' ? op[1] * SYNC.step : op[0] === 'o' ? op[1] : 0), 0);
    const lead = Math.max(0, budget - SYNC.slack - total);
    if (lead > 0) {
      seconds = lead;
      spans.push({ seconds: lead, score: 0 });
    }
  }
  for (const op of ops) {
    if (op[0] === 't' || op[0] === 'o') {
      let before = state;
      let used: number;
      if (op[0] === 't') {
        const dead = Math.min(op[1], Math.ceil(Math.max(0, onlineFrom - seconds) / SYNC.step), Math.floor(Math.max(0, budget - seconds) / SYNC.step));
        if (dead > 0) {
          // Pencereden önceye düşen adımlar çevrimiçi sayılmıyor: o süre ayrılış gibi
          // çevrimdışı kazanç getiriyor (tavan yanındaki ayrılışlarla ortak).
          const span = dead * SYNC.step;
          if (awayLeft === null) awayLeft = offlineCap(state);
          const earning = Math.min(span, awayLeft);
          awayLeft -= earning;
          state = applyOffline(state, earning).state;
          seconds += span;
          clipped += span;
          spans.push({ seconds: span, score: starFree(state.totalEarned - before.totalEarned, before.stars) });
          before = state;
        }
        const want = op[1] - dead;
        const n = Math.min(want, Math.floor(Math.max(0, budget - seconds) / SYNC.step), SYNC.maxSteps - steps);
        clipped += (want - n) * SYNC.step;
        if (n <= 0) {
          // Hepsi pencereden eskiyse kayıt çevrimdışı kazanç olarak uygulandı; hiçbiri sığmadıysa atlandı.
          if (dead > 0) applied += 1;
          else skipped += 1;
          continue;
        }
        state = step(state, n);
        steps += n;
        used = n * SYNC.step;
        awayLeft = null;
      } else {
        used = Math.min(op[1], Math.max(0, budget - seconds));
        clipped += op[1] - used;
        if (awayLeft === null) awayLeft = offlineCap(state);
        // Tavanı aşan süre geçiyor ama kazanç getirmiyor.
        const earning = Math.min(used, awayLeft);
        awayLeft -= earning;
        state = applyOffline(state, earning).state;
      }
      seconds += used;
      applied += 1;
      spans.push({ seconds: used, score: starFree(state.totalEarned - before.totalEarned, before.stars) });
      continue;
    }
    const result = applyAction(state, op);
    if (result.ok) {
      state = result.state;
      applied += 1;
    } else {
      skipped += 1;
    }
  }
  return { state, applied, skipped, seconds, clipped, spans, awayLeft };
}

/**
 * İstemcinin günlüğü: eylemler sırayla, art arda çevrimiçi adımlar tek kayıtta.
 * Gönderilen kayıtlar `take` ile alınıyor ve yanıta kadar donuk (yeni adımlar
 * onlara eklenmiyor); yanıt gelince `drop`, gönderim düşerse `release`.
 */
export class SyncJournal {
  ops: SyncOp[] = [];
  /** Baştan kaç kayıt gönderimde (donuk). */
  private sent = 0;

  /** n çevrimiçi adım (tek kayıt en çok `SYNC.maxSteps`: sunucu daha büyüğünü kabul etmiyor). */
  steps(n: number): void {
    for (; n > SYNC.maxSteps; n -= SYNC.maxSteps) this.steps(SYNC.maxSteps);
    if (n <= 0) return;
    const last = this.ops.length > this.sent ? this.ops[this.ops.length - 1] : undefined;
    if (last && last[0] === 't' && last[1] + n <= SYNC.maxSteps) last[1] += n;
    else this.ops.push(['t', n]);
  }

  push(op: SyncOp): void {
    this.ops.push(op);
  }

  get pending(): number {
    return this.ops.length;
  }

  /** Gönderimde (donuk) kaç kayıt. */
  get frozen(): number {
    return this.sent;
  }

  /** Yanıtı belirsiz kalan gönderimin aynısı: aynı kayıtlar (aynı kimlikle yinelensin, sunucu ikinci kez uygulamasın). */
  resend(): SyncOp[] {
    return this.ops.slice(0, this.sent).map((op) => [...op] as SyncOp);
  }

  /** Kayıttan yüklenince: baştaki n kayıt yanıtı belirsiz bir gönderimde (donuk). */
  freeze(n: number): void {
    this.sent = Math.max(0, Math.min(n, this.ops.length));
  }

  /** Bir gönderime sığan baştaki kayıtlar (en çok `SYNC.maxSteps` adım, `SYNC.maxOps` kayıt). */
  take(): SyncOp[] {
    const batch: SyncOp[] = [];
    let steps = 0;
    for (const op of this.ops) {
      if (batch.length >= SYNC.maxOps) break;
      if (op[0] === 't') {
        if (steps + op[1] > SYNC.maxSteps) break;
        steps += op[1];
      }
      batch.push([...op] as SyncOp);
    }
    this.sent = batch.length;
    return batch;
  }

  /** Sunucu gönderimi aldı: baştaki kayıtları sil. */
  drop(): void {
    this.ops.splice(0, this.sent);
    this.sent = 0;
  }

  /** Gönderim düştü: kayıtlar yerinde, sonraki gönderimde yeniden. */
  release(): void {
    this.sent = 0;
  }

  /** Sunucunun durumuna dönülünce bekleyen her şey gidiyor. */
  clear(): void {
    this.ops = [];
    this.sent = 0;
  }
}

/**
 * İstemcinin oyunu (web, Android): durum ve günlük birlikte. Her değişiklik
 * hem duruma uygulanıyor hem günlüğe yazılıyor; sunucu aynısını oynatıyor.
 */
export class SyncedGame {
  readonly journal = new SyncJournal();

  constructor(public state: LiteState) {}

  /** n çevrimiçi adım (her biri 1 sn). */
  tick(steps = 1): void {
    if (steps <= 0) return;
    this.state = step(this.state, steps);
    this.journal.steps(steps);
  }

  /** Eylem: tutarsa uygulanıp günlüğe yazılıyor. */
  act(op: SyncOp): ActionResult {
    const result = applyAction(this.state, op);
    if (result.ok) {
      this.state = result.state;
      this.journal.push(op);
    }
    return result;
  }

  /** Uygulama kapalıyken geçen süre (sunucunun kabul ettiği en uzun kayda kırpılıyor; kazanç tavanı zaten daha kısa). */
  away(seconds: number): ReturnType<typeof applyOffline> {
    const kept = Number.isFinite(seconds) ? Math.min(Math.max(0, seconds), SYNC.maxAway) : 0;
    const result = applyOffline(this.state, kept);
    this.state = result.state;
    this.journal.push(['o', kept]);
    return result;
  }

  /**
   * Sunucu gönderimi aldı: gönderilenler siliniyor, durum sunucununki oluyor,
   * o arada yapılanlar (gönderilmemiş kayıtlar) üstüne yeniden uygulanıyor.
   * İki taraf aynı kodu oynattığı için dürüst istemcide hiçbir şey değişmiyor.
   */
  accepted(server: LiteState): void {
    this.journal.drop();
    this.state = replay(server, this.journal.ops).state;
  }

  /**
   * Sunucu başka yerden ilerledi (başka cihaz, kapanan eski sekme): bekleyen
   * kayıtlar onun durumunun üstüne yeniden uygulanıyor. Gönderilince sunucu
   * yine doğruluyor; süre bütçesi aynı zamanı iki kez saydırmıyor.
   */
  rebased(server: LiteState): void {
    this.journal.release();
    this.state = replay(server, this.journal.ops).state;
  }

  /** Kayıt başka cihazda ilerledi: sunucunun durumuna dön, bekleyenler gidiyor. */
  replaced(server: LiteState): void {
    this.journal.clear();
    this.state = server;
  }
}
