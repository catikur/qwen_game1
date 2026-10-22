import type { LeagueBoard, LeagueEntry, LeagueSubmitOutcome } from '@capital/ui';
import { hostCapability } from './host';
import { createServerBoard } from './league-server';

/**
 * Tohum Ligi tablosunun depoları.
 *
 * Paylaşılan: claude.ai'de yayınlanmış sayfada `db` + `user` yetenekleri.
 * Her kişi `league/<kendi kimliği>` belgesine yalnızca kendi koşusunu
 * yazabiliyor (yayın kuralı `league/{self}`), herkes hepsini okuyor. Belge
 * kişi başına tek — haftanın en iyi koşusu orada durur, yeni hafta onu
 * ezer. Günün koşusu (Tur 53) aynı belgenin `day` alanında: ikisi birbirini
 * ezmiyor (Codex #82). Kimliği ve skoru üst düzeyde de (`dayWeekId`,
 * `dayScore`): tablo sorgusu haftanınki gibi süzüp sıralıyor, iç alanda
 * sorguya güvenmiyor. Ad saklanmıyor: kimlik saklanıyor, ad her çizimde
 * `profiles()` ile çözülüyor.
 *
 * Lig sunucusu (Tur 51): GitHub Pages'teki oyun. Lite'ın sunucusu ana
 * oyunun koşularını da alıyor; tablo herkese açık (`league-server.ts`).
 *
 * Yerel: barındırıcı ve sunucu yoksa (geliştirme sunucusu, indirilen dosya,
 * sunucu eski sürümde) bu tarayıcının kendi koşuları. Arayüz farkı oyuncuya
 * `kind` ile söylüyor.
 */

/**
 * Lig sunucusunun adresi. Paket derlenirken veriliyor (`VITE_LEAGUE_URL`;
 * Pages'te `ios-lite/App/project.yml` → `LiteLeagueURL`), varsayılan boş:
 * yerel derleme ve testler canlı sunucuya hiç gitmiyor. Tarayıcı testi
 * yerel sunucuyu `window.__capitalLeagueUrl` ile veriyor.
 */
declare const __LEAGUE_URL__: string | undefined;

/** Bu pakette lig sunucusu var mı (yoksa yeniden denemenin anlamı yok). */
export function leagueServerConfigured(): boolean {
  return leagueServerUrl() !== '';
}

function leagueServerUrl(): string {
  const override = (window as unknown as { __capitalLeagueUrl?: unknown }).__capitalLeagueUrl;
  const url = typeof override === 'string' ? override : typeof __LEAGUE_URL__ === 'string' ? __LEAGUE_URL__ : '';
  return url.replace(/\/+$/, '');
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnapshot {
  docs: DocSnapshot[];
}
interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: { code: string }) => void): () => void;
}
interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface Db {
  collection(path: string): Query & { doc(id: string): DocRef };
}
interface User {
  id(): Promise<string | null>;
  profiles(ids: readonly string[]): Promise<Record<string, { name: string }>>;
}

const LOCAL_KEY = 'capitalforge.league.local';

function readLocal(): LeagueEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LeagueEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: LeagueEntry[]): boolean {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(-40)));
    return true;
  } catch {
    return false;
  }
}

function localBoard(): LeagueBoard {
  const listeners = new Set<() => void>();
  // Aynı tarayıcının başka sekmesi koşu gönderince tablo burada da tazeleniyor.
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_KEY || event.key === null) listeners.forEach((emit) => emit());
  };
  return {
    kind: 'local',
    subscribe(weekId, onChange) {
      const emit = () => onChange(readLocal().filter((entry) => entry.weekId === weekId).map((e) => ({ ...e, mine: true })));
      if (listeners.size === 0) window.addEventListener('storage', onStorage);
      listeners.add(emit);
      emit();
      return () => {
        listeners.delete(emit);
        if (listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
    async submit(entry): Promise<LeagueSubmitOutcome> {
      const all = readLocal();
      const saved = writeLocal([...all, { ...entry, id: `local-${Date.now()}` }]);
      listeners.forEach((emit) => emit());
      return saved ? 'saved' : 'error';
    },
  };
}

/** Günün koşusunun kimliği ("2026-10-22"); hafta "2026-W43". */
const DAY_ID = /^\d{4}-\d{2}-\d{2}$/;

/** Belgenin koşusu: haftanınki üst düzeyde, günün koşusu `day` alanında. */
function toEntry(doc: DocSnapshot, me: string | null, day = false): LeagueEntry | null {
  const data = doc.data();
  const inner = day ? data?.['day'] : data;
  const body = inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : undefined;
  if (!body || typeof body['score'] !== 'number' || typeof body['code'] !== 'string') return null;
  return {
    id: doc.id,
    weekId: String(body['weekId'] ?? ''),
    companyName: String(body['companyName'] ?? 'Bir şirket').slice(0, 40),
    ceoId: typeof body['ceoId'] === 'string' ? body['ceoId'] : null,
    score: body['score'],
    curve: Array.isArray(body['curve']) ? (body['curve'] as unknown[]).filter((v): v is number => typeof v === 'number') : [],
    code: body['code'],
    submittedAt: String(body['submittedAt'] ?? ''),
    mine: doc.id === me,
  };
}

export function sharedBoard(db: Db, user: User | null): LeagueBoard {
  const meP = user ? user.id().catch(() => null) : Promise.resolve(null);
  return {
    kind: 'shared',
    subscribe(weekId, onChange) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      const day = DAY_ID.test(weekId);
      void meP.then((me) => {
        if (cancelled) return;
        // Süzgeç ve sıra sınırdan önce, sorguda (Codex #82): günün koşusu üst düzeydeki kopyasıyla.
        const query = day
          ? db.collection('league').where('dayWeekId', '==', weekId).orderBy('dayScore', 'desc').limit(50)
          : db.collection('league').where('weekId', '==', weekId).orderBy('score', 'desc').limit(50);
        stop = query.onSnapshot(
          (snap) => {
            const entries = snap.docs.map((doc) => toEntry(doc, me, day)).filter((e): e is LeagueEntry => e !== null && e.weekId === weekId);
            onChange(entries);
            // Adlar kaydedilmiyor; her teslimatta çözülüyor.
            if (user && entries.length > 0) {
              void user
                .profiles(entries.map((e) => e.id))
                .then((profiles) => {
                  if (!cancelled) onChange(entries.map((e) => ({ ...e, who: profiles[e.id]?.name || '' })));
                })
                .catch(() => undefined);
            }
          },
          () => onChange([]),
        );
      });
      return () => {
        cancelled = true;
        stop?.();
      };
    },
    async submit(entry): Promise<LeagueSubmitOutcome> {
      const me = await meP;
      if (!me) return 'error';
      try {
        const ref = db.collection('league').doc(me);
        const existing = await ref.get();
        const body = existing.exists ? existing.data() : undefined;
        const day = DAY_ID.test(entry.weekId);
        const current = (day ? body?.['day'] : body) as Record<string, unknown> | undefined;
        if (current && current['weekId'] === entry.weekId && typeof current['score'] === 'number' && current['score'] >= entry.score) {
          return 'kept-better';
        }
        // Kişi başına tek belge: haftanın koşusu günün koşusunu, günün koşusu haftanınkini silmesin.
        const daily = day
          ? { day: { ...entry }, dayWeekId: entry.weekId, dayScore: entry.score }
          : body?.['day']
            ? { day: body['day'], dayWeekId: body['dayWeekId'], dayScore: body['dayScore'] }
            : {};
        await ref.set(day ? { ...(body ?? {}), ...daily } : { ...entry, ...daily });
        return 'saved';
      } catch {
        return 'error';
      }
    },
  };
}

/**
 * Tabloyu kurar: barındırıcı `db` verirse paylaşılan; değilse lig sunucusu
 * ayakta ve bu sürümdeyse onun tablosu; o da yoksa yerel. Bağlantısız
 * açılışta sunucu daha önce görüldüyse yine sunucu tablosu (son görülen
 * tablo, gönderim bağlantı gelince). Barındırıcının cevabı geç gelebilir
 * (en çok 10 sn); arayüz o arada yerel tabloyla açılıyor ve hazır olunca
 * bir kez geçiyor.
 */
export async function createLeagueBoard(): Promise<LeagueBoard> {
  const db = await hostCapability<Db>('db');
  if (db) {
    const user = await hostCapability<User>('user');
    return sharedBoard(db, user);
  }
  const url = leagueServerUrl();
  if (url) {
    const board = createServerBoard({
      url,
      fetch: (input, init) => fetch(input, init),
      storage: browserStorage(),
      online: window,
      visibility: { target: document, visible: () => document.visibilityState !== 'hidden' },
    });
    // Cevap gelmediyse (bağlantı yok ya da açılışta sayfa meşgul: yazılımsal
    // GPU'da gölgelendirici derlerken sağlık isteğinin cevabı 7 sn'yi
    // buluyordu) iki kez daha. Eski sürümde hemen vazgeçiliyor.
    for (const wait of PROBE_RETRIES) {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const status = await board.probe();
      if (status === 'ok') return board;
      if (status === 'old') break;
      // Bağlantı yok ama sunucu daha önce görüldü: son görülen tablo, gönderim beklemede.
      if (board.seen()) return board;
    }
  }
  return localBoard();
}

/** Sunucu denemeleri arası bekleme (ms): ilk deneme hemen. */
const PROBE_RETRIES = [0, 10_000, 30_000];

export const fallbackLeagueBoard: LeagueBoard = localBoard();
