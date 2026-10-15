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
import { CHAIN_IDS, STAGES, type ChainId, type Stage } from './content';
import {
  advance,
  applyOffline,
  buy,
  buyManager,
  catchDeal,
  chooseCouncil,
  claimGoal,
  goPublic,
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
  | ['s'];

export const SYNC = {
  /** Çevrimiçi adım (sn). */
  step: 1,
  /** Bir gönderimde en çok çevrimiçi adım: sunucunun işlemci sınırı (ücretsiz katman 10 ms). */
  maxSteps: 600,
  /** Bir gönderimde en çok kayıt. */
  maxOps: 1_000,
  /** Saat payı (sn): istemci ile sunucunun saati arasındaki küçük fark. */
  slack: 10,
  /** Yeni hesaba, açılmadan önce oynanmış süre için en çok (sn). */
  headStart: 3_600,
  /** Bir çevrimdışı kaydın en çok süresi (sn); tavanı zaten model uyguluyor. */
  maxAway: 30 * 86_400,
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
      return op.length === 1;
    default:
      return false;
  }
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
 * göre). Çevrimiçi adımlar ayrıca `SYNC.maxSteps` ile sınırlı. Bütçeyi aşan
 * süre kırpılıyor.
 */
export function replay(start: LiteState, ops: readonly SyncOp[], budget: number = Infinity): Replay {
  let state = start;
  let applied = 0;
  let skipped = 0;
  let seconds = 0;
  let clipped = 0;
  let steps = 0;
  const spans: Replay['spans'] = [];
  for (const op of ops) {
    if (op[0] === 't' || op[0] === 'o') {
      const left = Math.max(0, budget - seconds);
      const before = state;
      let used: number;
      if (op[0] === 't') {
        const n = Math.min(op[1], Math.floor(left / SYNC.step), SYNC.maxSteps - steps);
        clipped += (op[1] - n) * SYNC.step;
        if (n <= 0) {
          skipped += 1;
          continue;
        }
        state = step(state, n);
        steps += n;
        used = n * SYNC.step;
      } else {
        used = Math.min(op[1], left);
        clipped += op[1] - used;
        state = applyOffline(state, used).state;
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
  return { state, applied, skipped, seconds, clipped, spans };
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

  /** n çevrimiçi adım. */
  steps(n: number): void {
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

  /** Uygulama kapalıyken geçen süre. */
  away(seconds: number): ReturnType<typeof applyOffline> {
    const result = applyOffline(this.state, seconds);
    this.state = result.state;
    this.journal.push(['o', seconds]);
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

  /** Kayıt başka cihazda ilerledi: sunucunun durumuna dön, bekleyenler gidiyor. */
  replaced(server: LiteState): void {
    this.journal.clear();
    this.state = server;
  }
}
