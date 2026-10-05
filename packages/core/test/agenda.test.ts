import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { agenda } from '../src/agenda';
import { pushNews } from '../src/news';
import { createNewGame } from '../src/worldgen';

describe('gündem', () => {
  test('yeni oyunda sıradaki hedef gündemde', () => {
    const items = agenda(createNewGame({ seed: 2 }));
    assert.ok(items.some((item) => item.kind === 'goal' && item.label === 'İlk dükkân'));
  });

  test('imar açılışı 30 gün kala gündeme giriyor, önce değil', () => {
    const state = createNewGame({ seed: 2 });
    const first = Math.min(...state.districts.map((d) => d.opensOnDay ?? Infinity));
    state.time.day = first - 31;
    assert.ok(!agenda(state).some((item) => item.kind === 'unlock'));
    state.time.day = first - 30;
    const unlock = agenda(state).find((item) => item.kind === 'unlock');
    assert.equal(unlock?.daysLeft, 30);
    assert.ok(unlock?.districtId !== undefined);
  });

  test('kontrole yaklaşan baskın en başa geçiyor', () => {
    const state = createNewGame({ seed: 2 });
    const raider = Object.values(state.companies).find((c) => !c.isPlayer)!;
    raider.shares[state.playerCompanyId] = 4_200;
    state.time.day = state.districts.find((d) => d.opensOnDay !== undefined)!.opensOnDay! - 10;
    const items = agenda(state);
    assert.equal(items[0]!.kind, 'raid');
    assert.equal(items[0]!.urgency, 3);
  });

  test('aciliyet eşitse yakın bitiş önce', () => {
    const state = createNewGame({ seed: 2 });
    const urgencies = agenda(state).map((item) => item.urgency);
    assert.deepEqual(urgencies, [...urgencies].sort((a, b) => b - a));
  });
});

describe('haber yeri', () => {
  test('kare ve bölge habere işleniyor, eski imza şirket kimliği', () => {
    const state = createNewGame({ seed: 2 });
    pushNews(state, 'neutral', 'a', 'b', { tileId: 12, companyId: 'npc' });
    assert.equal(state.news[0]!.tileId, 12);
    assert.equal(state.news[0]!.companyId, 'npc');
    pushNews(state, 'neutral', 'c', 'd', 'eski');
    assert.equal(state.news[0]!.companyId, 'eski');
    assert.equal(state.news[0]!.tileId, undefined);
  });
});
