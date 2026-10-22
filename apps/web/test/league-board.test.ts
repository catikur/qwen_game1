import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LeagueBoard } from '@capital/ui';
import { sharedBoard } from '../src/league-board';

/**
 * Paylaşılan tablo (claude.ai'nin `db` yeteneği) bellekte: kişi başına tek
 * belge (`league/{self}`), sorgu üst düzey alanlarda eşitlik, sıra ve sınır.
 */
function memoryDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const watchers = new Set<() => void>();
  const snapshot = (id: string) => ({ id, exists: docs.has(id), data: () => docs.get(id) });
  const query = (filters: Array<[string, unknown]>, order: string | null, cap: number) => ({
    where: (field: string, _op: string, value: unknown) => query([...filters, [field, value]], order, cap),
    orderBy: (field: string) => query(filters, field, cap),
    limit: (n: number) => query(filters, order, n),
    onSnapshot(next: (snap: { docs: ReturnType<typeof snapshot>[] }) => void) {
      const emit = () => {
        let ids = [...docs.keys()].filter((id) => filters.every(([field, value]) => docs.get(id)![field] === value));
        if (order) ids = ids.sort((a, b) => Number(docs.get(b)![order] ?? 0) - Number(docs.get(a)![order] ?? 0));
        next({ docs: ids.slice(0, cap).map(snapshot) });
      };
      watchers.add(emit);
      emit();
      return () => watchers.delete(emit);
    },
  });
  return {
    docs,
    collection: () => ({
      ...query([], null, Infinity),
      doc: (id: string) => ({
        get: async () => snapshot(id),
        set: async (data: Record<string, unknown>) => {
          docs.set(id, data);
          watchers.forEach((emit) => emit());
        },
      }),
    }),
  };
}

const user = (id: string) => ({ id: async () => id, profiles: async () => ({}) });

function entry(weekId: string, score: number): Parameters<LeagueBoard['submit']>[0] {
  return { weekId, companyName: 'Atilla Holding', ceoId: null, score, curve: [1, 2], code: `CF1.${weekId}.${score}`, submittedAt: '2026-10-26T10:00:00Z' };
}

async function rows(board: ReturnType<typeof sharedBoard>, weekId: string): Promise<Array<[string, number]>> {
  return new Promise((resolve) => {
    const stop = board.subscribe(weekId, (entries) => {
      queueMicrotask(() => stop());
      resolve(entries.map((e) => [e.weekId, e.score]));
    });
  });
}

test('paylaşılan tablo: günün koşusu haftanınkini ezmiyor, haftanınki de günün koşusunu (Codex #82)', async () => {
  const db = memoryDb();
  const board = sharedBoard(db, user('ben'));
  assert.equal(await board.submit(entry('2026-W44', 5_000_000)), 'saved');
  assert.equal(await board.submit(entry('2026-10-26', 900_000)), 'saved');
  assert.deepEqual(await rows(board, '2026-W44'), [['2026-W44', 5_000_000]], 'haftanın koşusu yerinde');
  assert.deepEqual(await rows(board, '2026-10-26'), [['2026-10-26', 900_000]]);

  // Daha iyi haftalık koşu günün koşusunu silmiyor; her tablonun "daha iyisi" kendi.
  assert.equal(await board.submit(entry('2026-W44', 6_000_000)), 'saved');
  assert.deepEqual(await rows(board, '2026-10-26'), [['2026-10-26', 900_000]]);
  assert.equal(await board.submit(entry('2026-10-26', 800_000)), 'kept-better');
  assert.equal(await board.submit(entry('2026-W44', 5_500_000)), 'kept-better');
  assert.deepEqual(await rows(board, '2026-W44'), [['2026-W44', 6_000_000]]);

  // Başka oyuncunun günün koşusu da tabloda, skora göre sıralı; başka günün koşusu görünmüyor.
  const other = sharedBoard(db, user('o'));
  assert.equal(await other.submit(entry('2026-10-26', 1_200_000)), 'saved');
  const third = sharedBoard(db, user('üç'));
  assert.equal(await third.submit(entry('2026-10-25', 2_000_000)), 'saved');
  assert.deepEqual(await rows(board, '2026-10-26'), [['2026-10-26', 1_200_000], ['2026-10-26', 900_000]]);
});
