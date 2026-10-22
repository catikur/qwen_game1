import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { codeOf, keyOf } from '../src/leagueVerify';
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
