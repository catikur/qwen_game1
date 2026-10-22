import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { rankLeague } from '@capital/core';
import { codeOf, keyOf, progressFor, verdictFor } from '../src/leagueVerify';
import type { LeagueEntry } from '../src/useGame';

/**
 * Lig sunucusunun satırında kod yok, özeti var (Tur 51): doğrulama
 * önbelleği özetle anahtarlanıyor, kod sırası gelince iniyor.
 */
const base: LeagueEntry = {
  id: 'r1',
  weekId: '2026-W42',
  companyName: 'Atilla Holding',
  ceoId: null,
  score: 1000,
  curve: [1, 2],
  code: 'CF1.e30=',
  submittedAt: '',
};

describe('doğrulama kuyruğu: lig sunucusunun satırları', () => {
  test('anahtar: özet varsa özet, yoksa kodun kendisi; beyan da anahtarda', () => {
    const local = keyOf(base);
    const server = keyOf({ ...base, code: '', codeKey: 'a'.repeat(64) });
    assert.match(server, /^a{64}:/);
    assert.notEqual(local, server);
    assert.notEqual(keyOf({ ...base, code: '', codeKey: 'a'.repeat(64), score: 999 }), server, 'beyan değişince anahtar da');
  });

  test('kod: satırdaysa o; yoksa iniyor; inmezse sonuçsuz (null)', async () => {
    assert.equal(await codeOf(base), 'CF1.e30=');
    let calls = 0;
    const remote = { ...base, code: '', codeKey: 'b'.repeat(64), loadCode: async () => (calls++, 'CF1.uzak') };
    assert.equal(await codeOf(remote), 'CF1.uzak');
    assert.equal(calls, 1);
    assert.equal(await codeOf({ ...remote, loadCode: async () => Promise.reject(new Error('bağlantı yok')) }), null);
    assert.equal(await codeOf({ ...base, code: '' }), '', 'kodsuz ve indirilemeyen satır boş kodla doğrulanıp reddediliyor');
  });
});

describe('doğrulama kuyruğu: sunucunun doğruladığı satırlar (Tur 52)', () => {
  test('sunucunun doğruladığı satır tekrar beklemeden sıralamada; kod inmiyor', () => {
    let downloads = 0;
    const verified: LeagueEntry = {
      ...base,
      id: 'v1',
      code: '',
      codeKey: 'c'.repeat(64),
      loadCode: async () => (downloads++, 'CF1.uzak'),
      verified: true,
      idle: false,
    };
    const verdict = verdictFor(verified);
    assert.deepEqual(verdict, { status: 'ok', score: 1000, curve: [1, 2], companyName: 'Atilla Holding', ceoId: null, idle: false });
    assert.equal(progressFor(verified), null, 'doğrulama sırasında değil');
    const standing = rankLeague([verified], verdictFor);
    assert.equal(standing.ranked.length, 1);
    assert.equal(standing.pending.length, 0);
    assert.equal(downloads, 0, 'kod indirilmedi');
  });

  test('sunucunun boş dediği iki koşu kopya sayılmıyor', () => {
    const idle = (id: string, submittedAt: string): LeagueEntry => ({ ...base, id, code: '', codeKey: id.repeat(64).slice(0, 64), verified: true, idle: true, submittedAt });
    const standing = rankLeague([idle('d', '2026-10-15T12:00:00Z'), idle('e', '2026-10-15T12:01:00Z')], verdictFor);
    assert.equal(standing.ranked.length, 2);
    assert.equal(standing.copies.length, 0);
  });
});
