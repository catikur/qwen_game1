import type { LeagueBoard, LeagueEntry, LeagueSubmitOutcome } from '@capital/ui';
import { hostCapability } from './host';

/**
 * Tohum Ligi tablosunun iki deposu.
 *
 * Paylaşılan: claude.ai'de yayınlanmış sayfada `db` + `user` yetenekleri.
 * Her kişi `league/<kendi kimliği>` belgesine yalnızca kendi koşusunu
 * yazabiliyor (yayın kuralı `league/{self}`), herkes hepsini okuyor. Belge
 * kişi başına tek — haftanın en iyi koşusu orada durur, yeni hafta onu
 * ezer. Ad saklanmıyor: kimlik saklanıyor, ad her çizimde `profiles()`
 * ile çözülüyor.
 *
 * Yerel: barındırıcı yoksa (geliştirme sunucusu, indirilen dosya) bu
 * tarayıcının kendi koşuları. Arayüz farkı oyuncuya `kind` ile söylüyor.
 */

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
  return {
    kind: 'local',
    subscribe(weekId, onChange) {
      const emit = () => onChange(readLocal().filter((entry) => entry.weekId === weekId).map((e) => ({ ...e, mine: true })));
      listeners.add(emit);
      emit();
      return () => listeners.delete(emit);
    },
    async submit(entry): Promise<LeagueSubmitOutcome> {
      const all = readLocal();
      const saved = writeLocal([...all, { ...entry, id: `local-${Date.now()}` }]);
      listeners.forEach((emit) => emit());
      return saved ? 'saved' : 'error';
    },
  };
}

function toEntry(doc: DocSnapshot, me: string | null): LeagueEntry | null {
  const body = doc.data();
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

function sharedBoard(db: Db, user: User | null): LeagueBoard {
  const meP = user ? user.id().catch(() => null) : Promise.resolve(null);
  return {
    kind: 'shared',
    subscribe(weekId, onChange) {
      let stop: (() => void) | null = null;
      let cancelled = false;
      void meP.then((me) => {
        if (cancelled) return;
        stop = db
          .collection('league')
          .where('weekId', '==', weekId)
          .orderBy('score', 'desc')
          .limit(50)
          .onSnapshot(
            (snap) => {
              const entries = snap.docs.map((doc) => toEntry(doc, me)).filter((e): e is LeagueEntry => e !== null);
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
        if (body && body['weekId'] === entry.weekId && typeof body['score'] === 'number' && body['score'] >= entry.score) {
          return 'kept-better';
        }
        await ref.set({ ...entry });
        return 'saved';
      } catch {
        return 'error';
      }
    },
  };
}

/**
 * Tabloyu kurar: barındırıcı `db` verirse paylaşılan, yoksa yerel.
 * Barındırıcının cevabı geç gelebilir (en çok 10 sn); arayüz o arada
 * yerel tabloyla açılıyor ve paylaşılan hazır olunca bir kez ona geçiyor.
 */
export async function createLeagueBoard(): Promise<LeagueBoard> {
  const db = await hostCapability<Db>('db');
  if (!db) return localBoard();
  const user = await hostCapability<User>('user');
  return sharedBoard(db, user);
}

export const fallbackLeagueBoard: LeagueBoard = localBoard();
