import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import {
  RUN_LIMITS,
  computeSimFingerprint,
  createLeagueGame,
  decodeRun,
  decodeRunChecked,
  encodeRun,
  rankLeague,
  replayRun,
  runFromState,
  simFingerprint,
  verifyRun,
} from '../src/league';
import type { LeagueRun, RunVerdict } from '../src/league';
import { BUBBLE_TIMING, CONSORTIUM, FAD, PROJECT_BY_ID, PROJECT_TIMING, setLocale } from '@capital/content';
import { LEAGUE_DAYS, leagueSeed, leagueWeekId } from '../src/systems/league';
import { createNewGame } from '../src/worldgen';
import type { GameState } from '../src/types';
import { playerStrategy } from './proxy';

/** Vekil oyuncuyla bir lig koşusu; isteğe bağlı olarak ortada "yeniden yükleme". */
function playLeague(options: { reloadAt?: number; cheatAt?: number } = {}): GameState {
  let engine = new GameEngine(createLeagueGame('2026-W40', 'Lig AŞ', null));
  while (engine.getState().league!.finishedDay === undefined) {
    const day = engine.getState().time.day;
    if (day === options.reloadAt) {
      // Sayfa yenileme: kayıttan yeni bir motor.
      engine = new GameEngine(JSON.parse(JSON.stringify(engine.getState())) as GameState);
    }
    if (day === options.cheatAt) engine.getState().companies['player']!.cash += 5_000_000;
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  return engine.getState();
}

describe('lig takvimi', () => {
  test('ISO hafta kimliği', () => {
    assert.equal(leagueWeekId(new Date(Date.UTC(2026, 9, 4))), '2026-W40');
    assert.equal(leagueWeekId(new Date(Date.UTC(2026, 0, 1))), '2026-W01');
    assert.equal(leagueWeekId(new Date(Date.UTC(2027, 0, 3))), '2026-W53');
  });

  test('aynı hafta aynı şehir, farklı hafta farklı şehir', () => {
    assert.equal(leagueSeed('2026-W40'), leagueSeed('2026-W40'));
    assert.notEqual(leagueSeed('2026-W40'), leagueSeed('2026-W41'));
    const a = createLeagueGame('2026-W40', 'A', null);
    const b = createLeagueGame('2026-W40', 'B', null);
    assert.equal(a.meta.seed, b.meta.seed);
    assert.equal(a.difficulty, undefined, 'lig Dengeli');
  });

  test('ligde kural değiştirilemez', () => {
    const engine = new GameEngine(createLeagueGame('2026-W40', 'A', null));
    assert.equal(engine.dispatch({ type: 'SET_FLAG', flag: 'npcCompetition', value: false }).ok, false);
    const free = new GameEngine(createNewGame({ seed: 1 }));
    assert.ok(free.dispatch({ type: 'SET_FLAG', flag: 'npcCompetition', value: false }).ok);
  });
});

describe('koşu doğrulaması', () => {
  test('360 gün sonunda skor kayda geçiyor, eğri örnekleniyor', () => {
    const state = playLeague();
    assert.equal(state.league!.finishedDay, LEAGUE_DAYS);
    assert.ok((state.league!.score ?? 0) > 0);
    assert.equal(state.league!.curve.length, LEAGUE_DAYS / 10 + 1);
    assert.ok((state.commandLog?.length ?? 0) > 20, 'vekil komutları günlükte');
  });

  test('koşu kodu tekrarla aynı skoru veriyor', async () => {
    const run = runFromState(playLeague())!;
    const decoded = decodeRun(encodeRun(run))!;
    assert.deepEqual(decoded, run);
    const result = await replayRun(decoded);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });

  test('ortada sayfa yenilense de tekrar tutuyor', async () => {
    const run = runFromState(playLeague({ reloadAt: 137 }))!;
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
  });

  test('konsoldan eklenen nakit tekrarda bulunamıyor', async () => {
    const run = runFromState(playLeague({ cheatAt: 90 }))!;
    const result = await replayRun(run);
    assert.equal(result.ok, false);
    assert.ok(result.score < run.score);
  });

  test('bozuk kod reddediliyor', () => {
    assert.equal(decodeRun('selam'), null);
    assert.equal(decodeRun('CF1.@@@'), null);
  });
});

/*
 * Lig güvenliği (Tur 31). Tablo sunucusuz: her tarayıcı her koşuyu kendisi
 * yeniden oynatıyor, sıralama yalnızca doğrulanmış koşulardan ve tekrarın
 * skoruyla. Satırın beyanı (skor, ad, CEO, eğri) sıralamaya girmiyor.
 */
describe('lig güvenliği', () => {
  // Bir dürüst koşu yeter; her test kendi kopyasını bozuyor.
  const honest = (() => {
    let cached: LeagueRun | null = null;
    return (): LeagueRun => (cached ??= runFromState(playLeague())!);
  })();
  const edited = (change: (run: LeagueRun) => void): string => {
    const run = JSON.parse(JSON.stringify(honest())) as LeagueRun;
    change(run);
    return encodeRun(run);
  };

  test('koşu kodu v2: simülasyon parmak izini taşıyor; iz kararlı ve dilden bağımsız', () => {
    const run = honest();
    assert.equal(run.version, 2);
    assert.equal(run.sim, simFingerprint());
    assert.match(run.sim!, /^[0-9a-f]{16}$/);
    const tr = computeSimFingerprint();
    setLocale('en');
    try {
      assert.equal(computeSimFingerprint(), tr, 'dil izi değiştirmiyor');
    } finally {
      setLocale('tr');
    }
  });

  test('iz fırsatları da işletiyor: balon takvimi ya da ödülü değişince iz değişiyor (Codex #63)', () => {
    const base = computeSimFingerprint();
    const timing = BUBBLE_TIMING as { firstDay: number; amountMin: number };
    const { firstDay, amountMin } = timing;
    try {
      timing.firstDay = firstDay + 3;
      assert.notEqual(computeSimFingerprint(), base, 'balon takvimi izi değiştirmiyor');
      timing.firstDay = firstDay;
      timing.amountMin = amountMin + 7_000;
      assert.notEqual(computeSimFingerprint(), base, 'balon ödülü izi değiştirmiyor');
    } finally {
      timing.firstDay = firstDay;
      timing.amountMin = amountMin;
    }
    assert.equal(computeSimFingerprint(), base);
    // Şehir projesi takvimi de izde (Tur 37d).
    const projects = PROJECT_TIMING as { firstDay: readonly [number, number] };
    const first = projects.firstDay;
    try {
      projects.firstDay = [first[0] + 5, first[1] + 5];
      assert.notEqual(computeSimFingerprint(), base, 'proje takvimi izi değiştirmiyor');
    } finally {
      projects.firstDay = first;
    }
  });

  test('iz geç oyunu da sınıyor: proje etkisi ve konsorsiyum alımı değişince iz değişiyor (Codex #64)', () => {
    const base = computeSimFingerprint();
    const projects = PROJECT_TIMING as { buildDays: number };
    const consortium = CONSORTIUM as unknown as { memberBudget: number };
    const { buildDays } = projects;
    const { memberBudget } = consortium;
    // Bölge talebi çarpanı: ayarın kendisi değil, bitmiş projenin etkisi.
    const metro = PROJECT_BY_ID.tech_campus.demand as Record<string, number>;
    const electronics = metro.electronics!;
    try {
      metro.electronics = electronics + 0.01;
      assert.notEqual(computeSimFingerprint(), base, 'proje etkisi izi değiştirmiyor');
      metro.electronics = electronics;
      consortium.memberBudget = memberBudget * 0.5;
      assert.notEqual(computeSimFingerprint(), base, 'konsorsiyum alımı izi değiştirmiyor');
      consortium.memberBudget = memberBudget;
      projects.buildDays = buildDays + 1;
      assert.notEqual(computeSimFingerprint(), base, 'inşaat süresi izi değiştirmiyor');
    } finally {
      metro.electronics = electronics;
      consortium.memberBudget = memberBudget;
      projects.buildDays = buildDays;
    }
    assert.equal(computeSimFingerprint(), base);
  });

  test('iz moda etkisini de taşıyor: ürün ağırlığı ya da kategori eki değişince iz değişiyor (Codex #64)', () => {
    const base = computeSimFingerprint();
    const fad = FAD as { weight: number; categoryBoost: number };
    const { weight, categoryBoost } = fad;
    try {
      fad.weight = weight + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'moda ağırlığı izi değiştirmiyor');
      fad.weight = weight;
      fad.categoryBoost = categoryBoost + 0.01;
      assert.notEqual(computeSimFingerprint(), base, 'moda kategori eki izi değiştirmiyor');
    } finally {
      fad.weight = weight;
      fad.categoryBoost = categoryBoost;
    }
    assert.equal(computeSimFingerprint(), base);
  });

  test('dürüst koşu doğrulanıyor; skor, eğri, ad ve CEO tekrarın kendisinden', async () => {
    const run = honest();
    const verdict = await verifyRun(encodeRun(run), { weekId: run.weekId, score: run.score, companyName: run.companyName, ceoId: run.ceoId });
    assert.equal(verdict.status, 'ok');
    if (verdict.status !== 'ok') return;
    assert.equal(verdict.score, run.score);
    assert.deepEqual(verdict.curve, run.curve);
    assert.equal(verdict.companyName, 'Lig AŞ');
    assert.equal(verdict.idle, false);
  });

  test('satırın beyanı koda uymazsa tekrar başlamadan reddediliyor', async () => {
    const run = honest();
    const code = encodeRun(run);
    for (const claim of [
      { weekId: run.weekId, score: run.score + 1 },
      { weekId: '2026-W41', score: run.score },
      { weekId: run.weekId, score: run.score, companyName: 'Başka AŞ' },
      { weekId: run.weekId, score: run.score, ceoId: 'muteahhit' },
    ]) {
      const verdict = await verifyRun(code, claim);
      assert.deepEqual(verdict, { status: 'bad', kind: 'mismatch' }, JSON.stringify(claim));
    }
  });

  test('kodla birlikte şişirilen skor tekrarda tutmuyor', async () => {
    const verdict = await verifyRun(edited((run) => (run.score += 5_000_000)));
    assert.equal(verdict.status, 'bad');
    if (verdict.status === 'bad') {
      assert.equal(verdict.kind, 'replay');
      assert.equal(verdict.score, honest().score, 'tekrar gerçek skoru buluyor');
    }
  });

  test('skor doğru, eğri sahte: hayalet de yalan söyleyemiyor', async () => {
    const verdict = await verifyRun(edited((run) => (run.curve = run.curve.map((v) => v * 2))));
    assert.equal(verdict.status, 'bad');
    if (verdict.status === 'bad') assert.equal(verdict.kind, 'curve');
  });

  test('başka sürümde oynanmış koşu "sahte" değil "farklı sürüm"; izsiz eski kod ayrı', async () => {
    const other = await verifyRun(edited((run) => {
      run.sim = '0123456789abcdef';
      run.score += 1;
    }));
    assert.deepEqual(other.status === 'bad' && other.kind, 'version');
    const legacy = await verifyRun(edited((run) => {
      run.version = 1;
      delete run.sim;
      run.score += 1;
    }));
    assert.deepEqual(legacy.status === 'bad' && legacy.kind, 'unknownVersion');
  });

  test('bozuk, dev ve tanınmayan komutlu kod tekrar başlamadan reddediliyor', () => {
    const kind = (code: string) => {
      const out = decodeRunChecked(code);
      return 'error' in out ? out.error : 'ok';
    };
    assert.equal(kind(encodeRun(honest())), 'ok');
    assert.equal(kind('CF1.' + 'A'.repeat(RUN_LIMITS.codeLength)), 'tooLarge');
    assert.equal(kind('selam'), 'unreadable');
    assert.equal(kind(edited((run) => run.log.push([12, { type: 'EVAL', code: 'alert(1)' } as never]))), 'malformed');
    assert.equal(kind(edited((run) => run.log.push([LEAGUE_DAYS + 1, { type: 'BUY_TILE', tileId: 1 }]))), 'malformed');
    assert.equal(kind(edited((run) => (run.score = Number.NaN))), 'malformed');
    assert.equal(kind(edited((run) => (run.ceoId = 'yok_boyle_ceo'))), 'malformed');
    assert.equal(kind(edited((run) => (run.companyName = 'x'.repeat(RUN_LIMITS.nameLength + 1)))), 'malformed');
    assert.equal(kind(edited((run) => (run.curve = new Array(400).fill(1)))), 'malformed');
    const flood = edited((run) => {
      run.log = new Array(RUN_LIMITS.logEntries + 1).fill([5, { type: 'SET_AUTO_PRICE', buildingId: 'b1', enabled: true }]);
    });
    assert.ok(['malformed', 'tooLarge'].includes(kind(flood)));
  });

  test('bilinen sınır: adı değiştirilmiş kopya da doğrulanıyor, sıralama onu "aynı koşu" diye ayırıyor', async () => {
    // Şirket adı simülasyonu değiştirmiyor: kopyacı başkasının kodunu kendi
    // adıyla yazabilir. Sunucusuz tabloda önlenemiyor; görünür kılınıyor.
    const run = honest();
    const copy = edited((r) => (r.companyName = 'Kopya AŞ'));
    const verdict = await verifyRun(copy, { weekId: run.weekId, score: run.score, companyName: 'Kopya AŞ', ceoId: run.ceoId });
    assert.equal(verdict.status, 'ok');
    const original = await verifyRun(encodeRun(run));
    const rows = [
      { id: 'asıl', submittedAt: '2026-10-05T10:00:00Z', v: original },
      { id: 'kopya', submittedAt: '2026-10-05T11:00:00Z', v: verdict },
    ];
    const standing = rankLeague(rows, (row) => row.v);
    assert.deepEqual(standing.ranked.map((r) => r.entry.id), ['asıl']);
    assert.deepEqual(standing.copies.map((c) => c.entry.id), ['kopya']);
  });

  test('sıralama yalnızca doğrulanmış koşular ve tekrarın skoruyla; kopya bir kez sayılıyor', () => {
    const ok = (score: number, curve: number[], idle = false): RunVerdict => ({ status: 'ok', score, curve, companyName: 'A', ceoId: null, idle });
    const rows = [
      { id: 'sahte', submittedAt: '2026-10-05T10:00:00Z' },
      { id: 'dürüst', submittedAt: '2026-10-05T11:00:00Z' },
      { id: 'kopya', submittedAt: '2026-10-05T12:00:00Z' },
      { id: 'ikinci', submittedAt: '2026-10-05T09:00:00Z' },
      { id: 'bekleyen', submittedAt: '2026-10-05T08:00:00Z' },
      { id: 'boş1', submittedAt: '2026-10-05T07:00:00Z' },
      { id: 'boş2', submittedAt: '2026-10-05T07:30:00Z' },
    ];
    const verdicts: Record<string, RunVerdict | undefined> = {
      sahte: { status: 'bad', kind: 'replay', score: 1_000 },
      dürüst: ok(9_000_000, [1, 2, 3]),
      kopya: ok(9_000_000, [1, 2, 3]),
      ikinci: ok(8_000_000, [1, 2, 4]),
      boş1: ok(500_000, [1, 1, 1], true),
      boş2: ok(500_000, [1, 1, 1], true),
    };
    const standing = rankLeague(rows, (row) => verdicts[row.id]);
    assert.deepEqual(standing.ranked.map((r) => r.entry.id), ['dürüst', 'ikinci', 'boş1', 'boş2']);
    assert.deepEqual(standing.copies.map((c) => [c.entry.id, c.of.id]), [['kopya', 'dürüst']]);
    assert.deepEqual(standing.rejected.map((r) => r.entry.id), ['sahte']);
    assert.deepEqual(standing.pending.map((r) => r.id), ['bekleyen']);
  });
});
