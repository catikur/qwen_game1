import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { agenda } from '../src/agenda';
import { foundCity } from '../src/holding';
import { lineDailyCost, lineProfitToday } from '../src/systems/trade';
import type { TradeLine } from '../src/types';
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

  test('aynı gün açılan bölgeler tek çip: büyük şehrin dalgası dört çip değil (Tur 38)', () => {
    const state = createNewGame({ seed: 2, citySize: 'large' });
    const days = state.districts.map((d) => d.opensOnDay).filter((d): d is number => d !== undefined);
    const first = Math.min(...days);
    const wave = state.districts.filter((d) => d.opensOnDay === first);
    assert.ok(wave.length >= 2, `ilk dalgada ${wave.length} bölge`);
    state.time.day = first - 10;
    const unlocks = agenda(state).filter((item) => item.kind === 'unlock');
    assert.equal(unlocks.length, new Set(days.filter((d) => d - state.time.day <= 30 && d > state.time.day)).size);
    const chip = unlocks.find((item) => item.daysLeft === 10)!;
    assert.equal(chip.districtId, wave[0]!.id);
    assert.match(chip.label, new RegExp(`${wave[0]!.name} ve ${wave.length - 1} bölge daha`));
    // Tek bölgelik dalga eskisi gibi.
    const standard = createNewGame({ seed: 2 });
    const single = Math.min(...standard.districts.map((d) => d.opensOnDay ?? Infinity));
    standard.time.day = single - 5;
    const item = agenda(standard).find((entry) => entry.kind === 'unlock')!;
    assert.match(item.label, /imara açılıyor$/);
    assert.ok(!/bölge daha/.test(item.label), item.label);
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

describe('gündem: lig çipi (Tur 53)', () => {
  test('haftanın koşusu haftayla, günün koşusu kendi adıyla', () => {
    const chip = (weekId: string) => agenda(createNewGame({ companyName: 'Lig AŞ', league: { weekId } })).find((item) => item.kind === 'league');
    assert.equal(chip('2026-W44')?.label, 'Lig 2026-W44');
    assert.equal(chip('2026-10-22')?.label, 'Günün koşusu');
    const done = createNewGame({ companyName: 'Lig AŞ', league: { weekId: '2026-10-22' } });
    done.league!.finishedDay = 90;
    assert.equal(agenda(done).find((item) => item.kind === 'league')?.label, 'Günün koşusu · tablo');
  });

  test('zarar eden hat gündemde: kârlı hat yok, boş giden kamyondan büyük zarar karar zamanı (Tur 79)', () => {
    const first = createNewGame({ seed: 11, companyName: 'Hat AŞ' });
    const root = foundCity(first, 'standard', 3_000_000);
    const away = root.holding!.dormant[0]!.state;
    const line: TradeLine = { id: 'line-1', from: away.meta.seed, to: root.meta.seed, goodId: 'wheat', trucks: 2, transitDays: 4, fromTerminalId: 'yok', toTerminalId: 'yok' };
    root.holding!.lines = [line];
    const spot = root.market.spot['wheat']!;
    // Kârlı gün: çip yok.
    line.last = { units: 600, goods: 600 * spot * 0.5, freight: lineDailyCost(line) };
    assert.ok(lineProfitToday(root, line)! > 0);
    assert.ok(!agenda(root).some((item) => item.kind === 'tradeLoss'));
    // Boş giden kamyon: zarar nakliye kadar, dikkat.
    line.last = { units: 0, goods: 0, freight: lineDailyCost(line), short: 'surplus' };
    const idle = agenda(root).find((item) => item.kind === 'tradeLoss')!;
    assert.equal(idle.urgency, 1);
    assert.equal(idle.tone, 'bad');
    assert.match(idle.label, /Hat zararda: Buğday/);
    // Mal varışın fiyatından pahalıya: karar zamanı.
    line.last = { units: 600, goods: 600 * spot * 2, freight: lineDailyCost(line) };
    const loss = agenda(root).find((item) => item.kind === 'tradeLoss')!;
    assert.equal(loss.urgency, 2);
    assert.equal(loss.key, 'tradeLoss:line-1');
  });
});
