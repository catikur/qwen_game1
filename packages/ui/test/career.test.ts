import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from '@capital/content';
import { createNewGame, runFacts, victoryPaths } from '@capital/core';
import type { GameState } from '@capital/core';
import {
  MAX_CAREER_RUNS,
  MAX_FOLDED_RUNS,
  careerStoreSizeForTests,
  careerSummary,
  mergeRun,
  observeCareer,
  resetCareerForTests,
  syncCareer,
  unlockedInRun,
} from '../src/career';
import { recordScenarioResult } from '../src/scenarioBest';

/**
 * Kariyer deposu (Tur 41). Testte `localStorage` yok: depo bellekte
 * çalışıyor (depo kapalı tarayıcıdaki gibi); her test sıfırdan başlıyor.
 */
let seq = 0;
function game(seed = 5): GameState {
  const state = createNewGame({ seed, companyName: 'Kariyer AŞ', ceoId: 'muhendis' });
  // Aynı milisaniyede kurulan iki koşu ayrı olsun.
  state.meta.createdAtIso = new Date(Date.UTC(2026, 9, 1, 0, 0, seq++)).toISOString();
  return state;
}
const player = (state: GameState) => state.companies[state.playerCompanyId]!;
const ids = (defs: { id: string }[]) => defs.map((def) => def.id);

describe('kariyer deposu', () => {
  beforeEach(() => resetCareerForTests());

  test('rozet bir kez açılıyor; açıldığı koşu ve gün saklanıyor', () => {
    const state = game();
    assert.deepEqual(observeCareer(state), []);
    player(state).acquisitions = 1;
    state.time.day = 212;
    assert.deepEqual(ids(observeCareer(state)), ['first_takeover']);
    assert.deepEqual(observeCareer(state), [], 'ikinci kez açılmıyor');
    const record = careerSummary().unlocked.first_takeover!;
    assert.deepEqual([record.companyName, record.day], ['Kariyer AŞ', 212]);
    assert.deepEqual(ids(unlockedInRun(state)), ['first_takeover']);
    assert.deepEqual(unlockedInRun(game(9)), [], 'başka koşuda değil');
  });

  test('eski kayıttan dönmek kazanılanı geri almıyor: sayaç ve değer en yükseğinde', () => {
    const state = game();
    const older = JSON.parse(JSON.stringify(state)) as GameState;
    player(state).acquisitions = 3;
    player(state).cash = 260_000_000;
    player(state).netWorth = 260_000_000;
    observeCareer(state);
    observeCareer(older);
    const run = careerSummary().runs[0]!;
    assert.equal(careerSummary().runs.length, 1, 'aynı koşu');
    assert.equal(run.acquisitions, 3);
    assert.equal(run.worth, 260_000_000);
    assert.ok(careerSummary().unlocked.quarter_billion);
  });

  test('kariyer rozeti koşuların toplamından', () => {
    const a = game(1);
    a.bubblesCaught = 30;
    assert.deepEqual(observeCareer(a), []);
    const b = game(2);
    b.bubblesCaught = 25;
    assert.deepEqual(ids(observeCareer(b)), ['bubble_hunter']);
    assert.equal(careerSummary().runCount, 2);
  });

  test('senaryo büyüme rozetine sayılmıyor, rekabet rozetine sayılıyor', () => {
    const state = game();
    state.scenario = { id: 'conquest', startDay: 0, endDay: 400 };
    player(state).netWorth = 600_000_000;
    player(state).acquisitions = 1;
    // Kurtarma'da halka arz açık ve öneriliyor; Borsada büyüme rozeti (Codex #70).
    player(state).issues = 1;
    assert.deepEqual(ids(observeCareer(state)), ['first_takeover']);
    assert.equal(careerSummary().bestWorth, 0, 'en yüksek değer serbest oyundan');
  });

  test('senaryo yıldızları kurulum ekranında da rozet açıyor', () => {
    for (const scenario of SCENARIOS) recordScenarioResult(scenario.id, `career-test:${scenario.id}`, 1, 100);
    assert.deepEqual(ids(syncCareer()), ['scenario_tour']);
    assert.deepEqual(syncCareer(), []);
    assert.equal(careerSummary().scenarioStars, SCENARIOS.length);
  });

  test('budanan koşu toplamlara katlanıyor', () => {
    const first = game(1);
    first.bubblesCaught = 49;
    first.victory = { day: 600, kind: 'tycoon', dismissed: true };
    observeCareer(first);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(100 + i));
    const summary = careerSummary();
    assert.equal(summary.runs.length, MAX_CAREER_RUNS);
    assert.equal(summary.runCount, MAX_CAREER_RUNS + 1);
    assert.equal(summary.victories, 1, 'budanan koşunun zaferi özet sayıda');
    const last = game(999);
    last.bubblesCaught = 1;
    assert.deepEqual(ids(observeCareer(last)), ['bubble_hunter'], '49 + 1: budanan koşunun balonları sayılıyor');
  });

  test('zaferle budanan koşunun zaferden önceki kaydı geri gelince zafer kalıyor (Codex #70)', () => {
    const won = game(1);
    const before = JSON.parse(JSON.stringify(won)) as GameState;
    won.victory = { day: 600, kind: 'tycoon', dismissed: true };
    observeCareer(won);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(300 + i));
    assert.equal(careerSummary().victories, 1);
    observeCareer(before);
    const summary = careerSummary();
    assert.equal(summary.victories, 1, 'zafer sayısı düşmedi');
    assert.deepEqual(summary.runs[0]!.wins, [{ day: 600, citySize: 'standard' }]);
  });

  test('holding: aynı yerel günde iki şehrin zaferi iki yol sayılıyor (Codex #91)', () => {
    const base = runFacts(game(1));
    const at = '2026-10-23T00:00:00.000Z';
    const first = mergeRun(undefined, { ...base, wins: [] }, at);
    const next = {
      ...base,
      wins: [
        { day: 600, citySize: 'standard' as const, path: 'retail' as const },
        { day: 600, citySize: 'standard' as const, path: 'energy' as const },
      ],
    };
    const merged = mergeRun(first, next, at);
    assert.deepEqual(victoryPaths({ runs: [merged], scenarioStars: {} }).sort(), ['energy', 'retail']);
  });

  test('budanan koşunun zafer yolu Üç yol rozetinde kalıyor (Tur 61)', () => {
    const paths = () => careerSummary().statuses.find((s) => s.def.id === 'three_paths')!.value;
    const won = (seed: number, path: 'retail' | 'realestate' | 'freight') => {
      const state = game(seed);
      state.victory = { day: 600, kind: 'tycoon', path, dismissed: true };
      return state;
    };
    observeCareer(won(1, 'freight'));
    observeCareer(won(2, 'retail'));
    assert.equal(paths(), 2);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(700 + i));
    assert.equal(paths(), 2, 'budanan iki koşunun yolları arşivde');
    assert.deepEqual(ids(observeCareer(won(3, 'realestate'))), ['three_paths']);
  });

  test('budanan koşunun eski kaydı geri gelince koşu özetinin hiçbiri düşmüyor (Codex #70)', () => {
    const run = game(1);
    const before = JSON.parse(JSON.stringify(run)) as GameState;
    player(run).acquisitions = 4;
    player(run).issues = 1;
    observeCareer(run);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(400 + i));
    // Devralmalardan ve halka arzdan önceki kayıt.
    observeCareer(before);
    const back = careerSummary().runs[0]!;
    assert.deepEqual([back.acquisitions, back.ipo], [4, true]);
    assert.equal(careerSummary().statuses.find((s) => s.def.id === 'serial_acquirer')!.value, 4, '4/5 olarak kaldı');
  });

  test('budanan koşu, koşu rozetinin ilerlemesinde sayılmaya devam ediyor (Codex #70)', () => {
    const old = game(1);
    player(old).acquisitions = 4;
    old.bubblesCaught = 30;
    observeCareer(old);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(500 + i));
    const serial = () => careerSummary().statuses.find((s) => s.def.id === 'serial_acquirer')!;
    assert.equal(serial().value, 4, '4/5 budanınca düşmüyor');
    assert.equal(careerSummary().statuses.find((s) => s.def.id === 'bubble_hunter')!.value, 30, 'toplamlar iki kez sayılmıyor');
  });

  test('arşiv sınırlı: en eski özet yalnız en iyi değerlerde kalıyor (Codex #70)', () => {
    const first = game(1);
    player(first).acquisitions = 4;
    first.bubblesCaught = 30;
    observeCareer(first);
    const total = MAX_CAREER_RUNS + MAX_FOLDED_RUNS + 20;
    for (let i = 1; i < total; i++) observeCareer(game(2000 + i));
    assert.deepEqual(careerStoreSizeForTests(), { runs: MAX_CAREER_RUNS, folded: MAX_FOLDED_RUNS });
    const summary = careerSummary();
    assert.equal(summary.runCount, total);
    assert.equal(summary.statuses.find((s) => s.def.id === 'serial_acquirer')!.value, 4, 'koşu rozetinin en iyisi kalıyor');
    assert.equal(summary.statuses.find((s) => s.def.id === 'bubble_hunter')!.value, 30, 'toplam bir kez');
  });

  test('budanan koşunun kaydı geri gelirse iki kez sayılmıyor (Codex #70)', () => {
    const old = game(1);
    old.bubblesCaught = 30;
    observeCareer(old);
    for (let i = 0; i < MAX_CAREER_RUNS; i++) observeCareer(game(200 + i));
    assert.equal(careerSummary().runCount, MAX_CAREER_RUNS + 1);
    // Eski kaydın yüklendiği gün: aynı koşu, aynı 30 balon.
    assert.deepEqual(observeCareer(old), [], 'balonlar ikinci kez sayılıp rozet açmadı');
    const summary = careerSummary();
    assert.equal(summary.runCount, MAX_CAREER_RUNS + 1, 'koşu sayısı aynı');
    assert.equal(summary.statuses.find((s) => s.def.id === 'bubble_hunter')!.value, 30);
    assert.equal(summary.runs[0]!.bubbles, 30, 'geri gelen koşu listede, budanmadan önceki değeriyle');
    const next = game(999);
    next.bubblesCaught = 20;
    assert.deepEqual(ids(observeCareer(next)), ['bubble_hunter'], '30 + 20');
  });
});
