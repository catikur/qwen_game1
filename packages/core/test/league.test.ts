import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine';
import {
  RUN_LIMITS,
  computeSimFingerprint,
  simFingerprintParts,
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
import { BUBBLE_TIMING, BUILDING_BY_ID, CONSORTIUM, CRISES, ENERGY, FAD, MODIFIER_RULES, PROJECTS, PROJECT_BY_ID, PROJECT_TIMING, REAL_ESTATE, RELATION, TEMPERAMENTS, loadLocale, setLocale } from '@capital/content';
import { FREIGHT } from '../src/systems/freight';
import { hasFuelPlant } from '../src/systems/energy';
import { LEAGUE_DAILY_DAYS, LEAGUE_DAYS, LEAGUE_RULE_ROTATION, leagueBoardKind, leagueDayId, leagueLength, leagueRule, leagueSeed, leagueWeekId } from '../src/systems/league';
import { createNewGame } from '../src/worldgen';
import type { GameState } from '../src/types';
import { developerStrategy, energyStrategy, freightStrategy, playerStrategy, rivalryStrategy } from './proxy';

/** Vekil oyuncuyla bir lig koşusu; isteğe bağlı olarak ortada "yeniden yükleme". */
function playLeague(options: { reloadAt?: number; cheatAt?: number; board?: string } = {}): GameState {
  let engine = new GameEngine(createLeagueGame(options.board ?? '2026-W40', 'Lig AŞ', null));
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

// İngilizce sözlük dil seçilince iniyor (Tur 46).
before(async () => {
  assert.equal(await loadLocale('en'), true);
});

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

  test('iz her projenin saha kuralını taşıyor: yoklamanın açmadığı projelerin tercih ettiği bölge de (Codex #64)', () => {
    const base = computeSimFingerprint();
    for (const def of PROJECTS) {
      const mutable = def as { archetypes: readonly string[] };
      const { archetypes } = mutable;
      try {
        mutable.archetypes = [];
        assert.notEqual(computeSimFingerprint(), base, `${def.id} saha kuralı izi değiştirmiyor`);
      } finally {
        mutable.archetypes = archetypes;
      }
    }
    assert.equal(computeSimFingerprint(), base);
  });

  test('iz modanın satış yolunu da işletiyor: moda gününde gerçek bir pazar günü (Codex #64)', () => {
    const market = (): string => {
      const part = simFingerprintParts().find((entry) => entry.startsWith('fad-market:'));
      assert.ok(part, 'izde moda pazarı yok');
      return part;
    };
    const base = market();
    const [, shop, store] = base.split(':');
    assert.notEqual(shop, '-', 'tek yuvalı yoklama mağazası kurulmadı');
    assert.notEqual(store, '-', 'büyük yoklama mağazası kurulmadı');
    assert.match(base, new RegExp(`${shop}=\\{"[a-z_]+":[1-9]`), 'yoklama mağazası satmıyor');
    // Parça modayı pazarın içinden görüyor: ağırlık değişince satış ve
    // karşılanmayan talep değişiyor.
    const fad = FAD as { weight: number };
    const { weight } = fad;
    try {
      fad.weight = weight + 0.4;
      assert.notEqual(market(), base, 'moda pazarı ağırlığa bakmıyor');
    } finally {
      fad.weight = weight;
    }
    assert.equal(market(), base);
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

describe('haftanın kuralı ve günün koşusu (Tur 53)', () => {
  test('tablo kimlikleri: hafta ya da takvimde olan gün', () => {
    assert.equal(leagueDayId(new Date(Date.UTC(2026, 9, 22, 23, 59))), '2026-10-22');
    assert.equal(leagueBoardKind('2026-W43'), 'week');
    assert.equal(leagueBoardKind('2026-10-22'), 'day');
    assert.equal(leagueBoardKind('2028-02-29'), 'day', 'artık gün');
    for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-W00', '2026-W54', '2026-10-2', 'x']) {
      assert.equal(leagueBoardKind(bad), null, bad);
    }
    assert.equal(leagueLength('2026-W43'), LEAGUE_DAYS);
    assert.equal(leagueLength('2026-10-22'), LEAGUE_DAILY_DAYS);
  });

  test('her hafta sıradaki kural; öncesi ve günün koşusu kuralsız; yıl dönümünde sıra kaymıyor', () => {
    assert.equal(leagueRule('2026-W42'), null, 'kurallardan önceki hafta');
    // Tur 53 W43'ün ortasında geldi: o hafta açıktı, koşuları kuralsız oynandı (Codex #82).
    assert.equal(leagueRule('2026-W43'), null, 'açılmış hafta kuralsız kalıyor');
    assert.deepEqual(
      ['2026-W44', '2026-W45', '2026-W46', '2026-W47', '2026-W48'].map(leagueRule),
      [...LEAGUE_RULE_ROTATION, LEAGUE_RULE_ROTATION[0]],
    );
    // 2026'nın 53 haftası var: 2026-W53'ten sonra 2027-W01, sıra kesintisiz.
    const w53 = LEAGUE_RULE_ROTATION.indexOf(leagueRule('2026-W53')!);
    assert.equal(leagueRule('2027-W01'), LEAGUE_RULE_ROTATION[(w53 + 1) % LEAGUE_RULE_ROTATION.length]);
    assert.equal(leagueRule(leagueWeekId(new Date(Date.UTC(2027, 0, 4)))), leagueRule('2027-W01'));
    assert.equal(leagueRule('2026-10-22'), null);
  });

  test('kurallı hafta: herkes aynı kuralla, oyuncu değiştiremiyor; kuralsız haftada kural yok', () => {
    const a = createLeagueGame('2026-W44', 'A', null);
    const b = createNewGame({ companyName: 'B', league: { weekId: '2026-W44' }, modifiers: ['storms', 'tight_credit'], seed: 7, difficulty: 'hard' });
    assert.deepEqual(a.modifiers, [leagueRule('2026-W44')]);
    assert.deepEqual(b.modifiers, a.modifiers, 'kurulumun kuralları yok sayılıyor');
    assert.equal(b.meta.seed, a.meta.seed);
    assert.equal(b.difficulty, undefined);
    assert.equal(createLeagueGame('2026-W40', 'C', null).modifiers, undefined);
  });

  test('kurallı haftanın koşusu tekrarda tutuyor; kural koşuyu gerçekten değiştiriyor', async () => {
    // Kıt arsa: arsa pahalı, aynı vekil daha az değerle bitiriyor.
    const ruled = playLeague({ board: '2026-W44' });
    assert.deepEqual(ruled.modifiers, ['scarce_land']);
    const run = runFromState(ruled)!;
    const result = await replayRun(run);
    assert.ok(result.ok, result.reason);
    const plain = createLeagueGame('2026-W44', 'Lig AŞ', null);
    delete plain.modifiers;
    let engine = new GameEngine(plain);
    while (engine.getState().league!.finishedDay === undefined) {
      if (engine.getState().time.day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
    assert.notEqual(engine.getState().league!.score, run.score, 'kural skoru değiştirmiyor');
    engine = new GameEngine(createLeagueGame('2026-W44', 'Lig AŞ', null));
    assert.deepEqual(engine.getState().modifiers, ['scarce_land']);
  });

  test('günün koşusu: 90 gün, kuralsız, her gün başka şehir; kod tekrarla doğrulanıyor', async () => {
    const day = createLeagueGame('2026-10-22', 'Gün AŞ', null);
    assert.equal(day.league!.endDay, LEAGUE_DAILY_DAYS);
    assert.equal(day.modifiers, undefined);
    assert.notEqual(day.meta.seed, createLeagueGame('2026-10-23', 'Gün AŞ', null).meta.seed);
    assert.notEqual(day.meta.seed, createLeagueGame('2026-W44', 'Gün AŞ', null).meta.seed);
    const state = playLeague({ board: '2026-10-22' });
    assert.equal(state.league!.finishedDay, LEAGUE_DAILY_DAYS);
    assert.equal(state.league!.curve.length, LEAGUE_DAILY_DAYS / 10 + 1);
    const run = runFromState(state)!;
    assert.equal(run.weekId, '2026-10-22');
    assert.ok(run.score > 0);
    const code = encodeRun(run);
    assert.deepEqual(decodeRunChecked(code), { run });
    const verdict = await verifyRun(code, { weekId: run.weekId, score: run.score });
    assert.equal(verdict.status, 'ok');
    assert.equal(verdict.status === 'ok' && verdict.score, run.score);
  });

  test('günün koşusunun kodu kendi sınırlarında: 90. günden sonraki hamle, uzun eğri, takvimde olmayan gün', () => {
    const run = runFromState(playLeague({ board: '2026-10-22' }))!;
    const malformed = (changed: Partial<LeagueRun>) => decodeRunChecked(encodeRun({ ...run, ...changed }));
    assert.deepEqual(malformed({ log: [[LEAGUE_DAILY_DAYS + 1, { type: 'SET_FOCUS', focus: 'growth' } as never]] }), { error: 'malformed' });
    assert.deepEqual(malformed({ curve: Array(LEAGUE_DAILY_DAYS / 10 + 2).fill(1) }), { error: 'malformed' });
    assert.deepEqual(malformed({ weekId: '2026-02-30' }), { error: 'malformed' });
    // Haftanın koşusunun sınırı değişmedi.
    assert.ok('run' in malformed({ weekId: '2026-W40', curve: Array(LEAGUE_DAYS / 10 + 1).fill(1) }));
  });

  test('iz kuralları da taşıyor: bir kuralın değeri değişince iz değişiyor', () => {
    const base = computeSimFingerprint();
    assert.ok(simFingerprintParts().some((part) => part.startsWith('rules:')));
    const land = MODIFIER_RULES.scarceLand as { priceMultiplier: number };
    const credit = MODIFIER_RULES.tightCredit as { rateDelta: number };
    const { priceMultiplier } = land;
    const { rateDelta } = credit;
    try {
      land.priceMultiplier = priceMultiplier + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'arsa kuralı izi değiştirmiyor');
      land.priceMultiplier = priceMultiplier;
      credit.rateDelta = rateDelta + 0.01;
      assert.notEqual(computeSimFingerprint(), base, 'banka kuralı izi değiştirmiyor');
    } finally {
      land.priceMultiplier = priceMultiplier;
      credit.rateDelta = rateDelta;
    }
    assert.equal(computeSimFingerprint(), base);
  });

  test('iz taşımayı da işletiyor: terminalin payı ya da teklifin boyu değişince iz değişiyor (Tur 56)', () => {
    const base = computeSimFingerprint();
    const probe = simFingerprintParts().find((part) => part.startsWith('probe-freight:'))!;
    assert.ok(probe.includes(':true:'), `yoklama sözleşme kurmadı: ${probe}`);
    const terminal = BUILDING_BY_ID.freight_terminal as { relief: number };
    const freight = FREIGHT as { maxOutlets: number };
    const { relief } = terminal;
    const { maxOutlets } = freight;
    try {
      terminal.relief = relief + 0.01;
      assert.notEqual(computeSimFingerprint(), base, 'terminalin payı izi değiştirmiyor');
      terminal.relief = relief;
      freight.maxOutlets = maxOutlets - 1;
      assert.notEqual(computeSimFingerprint(), base, 'teklifin boyu izi değiştirmiyor');
    } finally {
      terminal.relief = relief;
      freight.maxOutlets = maxOutlets;
    }
    assert.equal(computeSimFingerprint(), base);
  });

  test('iz enerjiyi de işletiyor: santral, tarife, yakıt ve kriz tablosu değişince iz değişiyor (Tur 57)', () => {
    const base = computeSimFingerprint();
    const parts = simFingerprintParts();
    const probe = parts.find((part) => part.startsWith('probe-energy:'))!;
    assert.ok(probe && !probe.endsWith(':-'), `yoklama santral kurmadı: ${probe}`);
    assert.ok(/=b\d+\//.test(probe), `santral kimseye enerji vermedi: ${probe}`);
    const shock = parts.find((part) => part.startsWith('probe-energy-shock:'))!;
    assert.ok(shock.startsWith('probe-energy-shock:true:2.000000:'), `kriz yoklaması: ${shock.slice(0, 60)}`);
    const gas = BUILDING_BY_ID.gas_plant as { power: number };
    const energy = ENERGY as { rivalDiscount: number };
    const crisis = CRISES.find((def) => (def.effects.energyPrice ?? 1) > 1)!;
    const { power } = gas;
    const { rivalDiscount } = energy;
    const { weight } = crisis;
    try {
      gas.power = power + 1;
      assert.notEqual(computeSimFingerprint(), base, 'santralin gücü izi değiştirmiyor');
      gas.power = power;
      energy.rivalDiscount = rivalDiscount + 0.01;
      assert.notEqual(computeSimFingerprint(), base, 'rakip tarifesi izi değiştirmiyor');
      energy.rivalDiscount = rivalDiscount;
      crisis.weight = weight + 1;
      assert.notEqual(computeSimFingerprint(), base, 'kriz tablosu izi değiştirmiyor');
    } finally {
      gas.power = power;
      energy.rivalDiscount = rivalDiscount;
      crisis.weight = weight;
    }
    assert.equal(computeSimFingerprint(), base);
  });
});

describe('gayrimenkul izi (Tur 58)', () => {
  test('iz gayrimenkulü de işletiyor: proje, kira ve dönüşüm ayarları değişince iz değişiyor', () => {
    const base = computeSimFingerprint();
    const parts = simFingerprintParts();
    const site = parts.find((part) => part.startsWith('probe-realestate-site:'))!;
    assert.ok(site && !/:-:/.test(site.slice(0, 40)), `yoklama proje kurmadı: ${site?.slice(0, 80)}`);
    const open = parts.find((part) => part.startsWith('probe-realestate-open:'))!;
    assert.ok(open.includes('"renewal":true'), `dönüşüm projesi yok: ${open.slice(0, 120)}`);
    assert.ok(/"occupancy":0\.\d+/.test(open), `projeler açılmadı: ${open.slice(0, 120)}`);
    assert.ok(parts.some((part) => part.startsWith('probe-realestate-rent:true:')), 'kira yoklaması yok');
    const estate = BUILDING_BY_ID.housing_estate as { capacity: number };
    const real = REAL_ESTATE as unknown as { siteUpkeep: number; elasticity: Record<string, number>; renewal: { capacityBonus: number } };
    const { capacity } = estate;
    const { siteUpkeep } = real;
    const elasticity = real.elasticity.housing!;
    const bonus = real.renewal.capacityBonus;
    try {
      estate.capacity = capacity + 10;
      assert.notEqual(computeSimFingerprint(), base, 'projenin kapasitesi izi değiştirmiyor');
      estate.capacity = capacity;
      real.siteUpkeep = siteUpkeep + 0.05;
      assert.notEqual(computeSimFingerprint(), base, 'şantiye gideri izi değiştirmiyor');
      real.siteUpkeep = siteUpkeep;
      real.elasticity.housing = elasticity + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'kira esnekliği izi değiştirmiyor');
      real.elasticity.housing = elasticity;
      real.renewal.capacityBonus = bonus + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'imar artışı izi değiştirmiyor');
    } finally {
      estate.capacity = capacity;
      real.siteUpkeep = siteUpkeep;
      real.elasticity.housing = elasticity;
      real.renewal.capacityBonus = bonus;
    }
    assert.equal(computeSimFingerprint(), base);
  });
});

describe('rakip hafızası izi (Tur 59)', () => {
  test('iz rakiplerin hafızasını da işletiyor: olay, sönüm, eşik, tepki ve uzlaşma ayarları değişince iz değişiyor', () => {
    const base = computeSimFingerprint();
    const parts = simFingerprintParts();
    const memory = parts.find((part) => part.startsWith('probe-relations-memory:'))!;
    assert.ok(memory && memory.includes(':hostile:') && memory.includes(':allied:'), `yoklama duruş üretmedi: ${memory?.slice(0, 160)}`);
    const lobby = parts.find((part) => part.startsWith('probe-relations-lobby:'))!;
    assert.ok(/"[a-z_0-9]+":-\d/.test(lobby), `karşı bağış yok: ${lobby}`);
    assert.ok(parts.some((part) => part.startsWith('probe-relations-amends:true:')), 'uzlaşma yoklaması yok');
    const real = RELATION as unknown as { events: { shares: number }; hostileAt: number; counterLobby: number; spite: number; amends: { share: number } };
    const kind = TEMPERAMENTS.vindictive as { fadeHostile: number };
    const { shares } = real.events;
    const { hostileAt, counterLobby, spite } = real;
    const amends = real.amends.share;
    const fade = kind.fadeHostile;
    try {
      real.events.shares = shares - 1;
      assert.notEqual(computeSimFingerprint(), base, 'hisse olayının değeri izi değiştirmiyor');
      real.events.shares = shares;
      real.hostileAt = hostileAt - 5;
      assert.notEqual(computeSimFingerprint(), base, 'husumet eşiği izi değiştirmiyor');
      real.hostileAt = hostileAt;
      real.counterLobby = counterLobby + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'karşı lobi izi değiştirmiyor');
      real.counterLobby = counterLobby;
      real.spite = spite + 0.1;
      assert.notEqual(computeSimFingerprint(), base, 'inadına teklif izi değiştirmiyor');
      real.spite = spite;
      real.amends.share = amends * 2;
      assert.notEqual(computeSimFingerprint(), base, 'uzlaşma bedeli izi değiştirmiyor');
      real.amends.share = amends;
      kind.fadeHostile = fade + 0.05;
      assert.notEqual(computeSimFingerprint(), base, 'mizacın sönümü izi değiştirmiyor');
    } finally {
      real.events.shares = shares;
      real.hostileAt = hostileAt;
      real.counterLobby = counterLobby;
      real.spite = spite;
      real.amends.share = amends;
      kind.fadeHostile = fade;
    }
    assert.equal(computeSimFingerprint(), base);
  });
});

describe('rakip hafızalı lig koşusu (Tur 59)', () => {
  test('fiyat kıran, hisse toplayan, uzlaşan koşu tekrarda tutuyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W43', 'Hafıza AŞ', null));
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      rivalryStrategy(engine, { undercut: 0.85, raidEvery: 15, raidShare: 0.03, amends: true });
      engine.runDay();
    }
    const state = engine.getState();
    const remembered = Object.values(state.companies).filter((c) => (c.relation?.memory.length ?? 0) > 0);
    assert.ok(remembered.length > 0, 'koşuda hafıza yok');
    const log = (state.commandLog ?? []).map(([, command]) => command.type);
    assert.ok(log.includes('MAKE_AMENDS'), 'uzlaşma günlükte yok');
    const run = runFromState(state)!;
    const result = await replayRun(decodeRun(encodeRun(run))!);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});

describe('gayrimenkullü lig koşusu (Tur 58)', () => {
  test('proje kuran, kira ayarlayan, dönüşüm başvurusu yapan koşu tekrarda tutuyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W42', 'Gayrimenkul AŞ', null));
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) playerStrategy(engine);
      developerStrategy(engine);
      engine.runDay();
    }
    const state = engine.getState();
    const projects = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && b.development);
    assert.ok(projects.length > 0, 'koşuda proje yok');
    const log = (state.commandLog ?? []).map(([, command]) => command.type);
    assert.ok(log.includes('SET_RENT'), 'kira günlükte yok');
    assert.ok(log.includes('REQUEST_RENEWAL'), 'dönüşüm başvurusu günlükte yok');
    const run = runFromState(state)!;
    const result = await replayRun(decodeRun(encodeRun(run))!);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});

describe('enerjili lig koşusu (Tur 57)', () => {
  test('santral kuran, yakıtını sabitleyen koşu tekrarda tutuyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W41', 'Enerji AŞ', null));
    while (engine.getState().league!.finishedDay === undefined) {
      const state = engine.getState();
      if (state.time.day % 5 === 0) {
        playerStrategy(engine);
        energyStrategy(engine);
        if (hasFuelPlant(state, state.playerCompanyId) && !state.energy?.fuelLocks[state.playerCompanyId]) engine.dispatch({ type: 'LOCK_FUEL' });
      }
      engine.runDay();
    }
    const state = engine.getState();
    const plants = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'energy');
    assert.ok(plants.length > 0, 'koşuda santral yok');
    assert.ok(plants.some((plant) => (plant.energyTotals?.saved ?? 0) + (plant.energyTotals?.sold ?? 0) > 0), 'santral enerji vermedi');
    assert.ok((state.commandLog ?? []).some(([, command]) => command.type === 'LOCK_FUEL'), 'sabitleme günlükte yok');
    const run = runFromState(state)!;
    const result = await replayRun(decodeRun(encodeRun(run))!);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});

describe('taşıma sözleşmeli lig koşusu (Tur 56)', () => {
  test('terminal kuran, teklif kabul eden koşu tekrarda tutuyor', async () => {
    const engine = new GameEngine(createLeagueGame('2026-W40', 'Nakliye AŞ', null));
    while (engine.getState().league!.finishedDay === undefined) {
      const day = engine.getState().time.day;
      if (day % 5 === 0) {
        playerStrategy(engine);
        freightStrategy(engine);
      }
      engine.runDay();
    }
    const state = engine.getState();
    assert.ok((state.freight?.earnedTotal ?? 0) > 0, 'koşuda taşıma ücreti yok');
    assert.ok((state.commandLog ?? []).some(([, command]) => command.type === 'ACCEPT_FREIGHT'), 'kabul günlükte yok');
    const run = runFromState(state)!;
    const result = await replayRun(decodeRun(encodeRun(run))!);
    assert.ok(result.ok, result.reason);
    assert.equal(result.score, run.score);
  });
});
