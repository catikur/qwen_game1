import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_ACCENT, SCENARIO_BY_ID, getDifficulty, setLocale } from '@capital/content';
import { GameEngine, companyRanking, createLeagueGame, createNewGame, createScenarioGame, formatMoney, getPlayer } from '@capital/core';
import type { GameState } from '@capital/core';
import { cardFilename, cityCardFacts } from '../src/cardFacts';
import { fileSlug } from '../src/fileName';
import { fitText } from '../src/cardDraw';
import { chooseLocale } from '../src/i18n/locale';

/** Şehir kartı (Tur 64): kartın söyledikleri, tarayıcısız. */

function grownCity(): GameState {
  const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Kart AŞ' }));
  for (let day = 0; day < 40 && Object.keys(engine.getState().buildings).length < 6; day++) engine.runDay();
  return engine.getState();
}

const stat = (facts: ReturnType<typeof cityCardFacts>, id: string) => facts.stats.find((s) => s.id === id)?.value;

describe('şehir kartının özeti', () => {
  test('süren koşu: şirket, tür, gün, dört sayı ve dosya adı', () => {
    const state = grownCity();
    const player = getPlayer(state);
    const facts = cityCardFacts(state);
    assert.equal(facts.company, 'Kart AŞ');
    assert.equal(facts.tone, 'live');
    assert.equal(facts.outcome, 'Koşu sürüyor');
    assert.equal(facts.mode, `Serbest oyun · ${getDifficulty(state.difficulty).name} şehir`);
    assert.match(facts.when, new RegExp(`^${state.time.day}\\. gün · `));
    assert.deepEqual(facts.stats.map((s) => s.id), ['worth', 'buildings', 'takeovers', 'rank']);
    assert.equal(stat(facts, 'worth'), formatMoney(player.netWorth));
    const ranking = companyRanking(state);
    const row = ranking.find((entry) => entry.company.id === player.id)!;
    assert.equal(stat(facts, 'buildings'), String(row.buildings));
    assert.equal(stat(facts, 'rank'), `${row.rank}. / ${ranking.length}`);
    assert.equal(facts.filename, `capitalforge-Kart-AS-gun${state.time.day}.png`);
    assert.equal(facts.color, PLAYER_ACCENT.standard);
    assert.equal(cityCardFacts(state, true).color, PLAYER_ACCENT.safe, 'renk körlüğüne uygun palette limon');
    // Paylaşım ve ekran okuyucu metni kartın bütün söylediklerini taşıyor.
    for (const piece of [facts.company, facts.outcome, facts.mode, facts.when, ...facts.stats.map((s) => s.value)]) {
      assert.ok(facts.summary.includes(piece), `${piece} → ${facts.summary}`);
    }
  });

  test('zafer: başlık ve günü; kapatılıp oyun sürse de kart zaferi söylüyor, yol zafer gününün', () => {
    const state = grownCity();
    state.sources = { retail: 95, realestate: 5 };
    state.victory = { day: 412, kind: 'monopoly', path: 'realestate', shares: { retail: 0.3, realestate: 0.7, energy: 0, freight: 0 }, acquisitions: 2 };
    const facts = cityCardFacts(state);
    assert.equal(facts.tone, 'win');
    assert.equal(facts.outcome, 'Tekel kuruldu · 412. gün');
    assert.equal(facts.path?.title, 'Zafere giden yol');
    assert.deepEqual(facts.path?.sources.map((s) => [s.id, s.share]), [['realestate', 70], ['retail', 30]], 'büyükten küçüğe');
    assert.equal(facts.path?.legend, 'Kira %70 · Perakende ve zincir %30');
    state.victory.dismissed = true;
    assert.equal(cityCardFacts(state).outcome, 'Tekel kuruldu · 412. gün');
  });

  test('kâr yoksa yol yok; canlı yol "Şirketin yolu"', () => {
    const state = createNewGame({ seed: 1, companyName: 'Yol AŞ' });
    assert.equal(cityCardFacts(state).path, null);
    state.sources = { retail: 60, realestate: 40 };
    assert.equal(cityCardFacts(state).path?.title, 'Şirketin yolu');
    assert.match(cityCardFacts(state).summary, /Yol: .+ \(.+%60 · .+%40\)/);
    // Tek kaynaklı yolda kaynak, yolun adını yinelemiyor.
    state.sources = { retail: 100 };
    assert.match(cityCardFacts(state).summary, /Yol: Perakende ve zincir\.$/);
  });

  test('devralınan koşu kayıp', () => {
    const state = grownCity();
    const rival = Object.values(state.companies).find((c) => !c.isPlayer)!;
    state.gameOver = { day: state.time.day, byCompanyId: rival.id } as GameState['gameOver'];
    const facts = cityCardFacts(state);
    assert.equal(facts.tone, 'loss');
    assert.equal(facts.outcome, 'İmparatorluk el değiştirdi');
  });

  test('senaryo: adı türde, sonuç yıldızlarıyla; aynı gün gelen zafer senaryonun sonucunu örtmüyor', () => {
    const state = createScenarioGame('rescue', { companyName: 'Senaryo AŞ' });
    const def = SCENARIO_BY_ID.rescue!;
    state.scenario = { ...state.scenario!, finishedDay: state.time.day, outcome: 'won', stars: 2, score: 1 };
    let facts = cityCardFacts(state);
    assert.equal(facts.mode, `Senaryo: ${def.title}`);
    assert.equal(facts.tone, 'win');
    assert.equal(facts.outcome, 'Senaryo kazanıldı ★★☆');
    state.scenario = { ...state.scenario, outcome: 'lost', stars: 0 };
    state.victory = { day: state.time.day, kind: 'tycoon' };
    facts = cityCardFacts(state);
    assert.equal(facts.tone, 'loss');
    assert.equal(facts.outcome, 'Senaryo kaybedildi');
  });

  test('lig: haftası türde, sıralamanın yerinde skor', () => {
    const state = createLeagueGame('2026-W43', 'Lig AŞ', null);
    state.league = { ...state.league!, finishedDay: 90, score: 1_250_000, outcome: 'finished' };
    let facts = cityCardFacts(state);
    assert.equal(facts.mode, 'Tohum Ligi · 2026-W43');
    assert.equal(facts.tone, 'done');
    assert.equal(facts.outcome, 'Hafta tamamlandı');
    assert.deepEqual(facts.stats.map((s) => s.id), ['score', 'worth', 'buildings', 'takeovers']);
    assert.equal(stat(facts, 'score'), formatMoney(1_250_000));
    state.league = { ...state.league, outcome: 'lost' };
    facts = cityCardFacts(state);
    assert.equal(facts.tone, 'loss');
    assert.equal(stat(facts, 'score'), formatMoney(0), 'devralınan lig koşusunun skoru sıfır');
  });

  test('dosya adına giren metin: kaydın dışa aktarması da aynı yardımcıyı kullanıyor (Tur 65)', () => {
    assert.equal(fileSlug('Karaca Holding'), 'Karaca-Holding');
    assert.equal(fileSlug('Yeni Girişim'), 'Yeni-Girisim');
    assert.equal(fileSlug('  ÇĞİÖŞÜ çğıöşü  '), 'CGIOSU-cgiosu');
    assert.equal(fileSlug('???'), 'capitalforge');
    assert.equal(fileSlug('???', 'kayit'), 'kayit');
    assert.ok(/^[A-Za-z0-9._-]+$/.test(fileSlug('Şen & Oğlu: "Yapı" <AŞ> 🏙️')));
  });

  test('dosya adı ASCII: Türkçe harfler eşine, sorunlu karakterler düşüyor', () => {
    assert.equal(cardFilename('Şen & Oğlu: "Yapı" <AŞ> İzmir Çağ Gün', 7), 'capitalforge-Sen-Oglu-Yapi-AS-Izmir-Cag-Gun-gun7.png');
    assert.equal(cardFilename('Café 🏙️ Ltd.', 2), 'capitalforge-Cafe-Ltd.-gun2.png');
    assert.equal(cardFilename('???', 3), 'capitalforge-capitalforge-gun3.png');
    assert.ok(cardFilename('x'.repeat(80), 1).length <= 'capitalforge--gun1.png'.length + 40);
  });

  test('İngilizce kart', async () => {
    assert.equal(await chooseLocale('en'), true);
    try {
      const state = grownCity();
      const facts = cityCardFacts(state);
      assert.equal(facts.outcome, 'Run in progress');
      assert.match(facts.when, new RegExp(`^Day ${state.time.day} · `));
      assert.match(stat(facts, 'rank') ?? '', /^#\d+ of \d+$/);
      assert.equal(facts.filename, `capitalforge-Kart-AS-day${state.time.day}.png`);
    } finally {
      setLocale('tr');
    }
  });
});

describe('kartın yazısı', () => {
  // Her harf boyun yarısı genişliğinde.
  const measure = (text: string, font: string) => Array.from(text).length * Number(/(\d+)px/.exec(font)![1]) * 0.5;
  const font = (size: number) => `700 ${size}px X`;

  test('sığan en büyük boyut seçiliyor', () => {
    assert.deepEqual(fitText(measure, 'abcdefghij', 300, [60, 40, 20], font), { text: 'abcdefghij', size: 60 });
    assert.deepEqual(fitText(measure, 'abcdefghij', 200, [60, 40, 20], font), { text: 'abcdefghij', size: 40 });
  });

  test('en küçükte de sığmayan metin kısalıyor, emoji bölünmüyor', () => {
    const fitted = fitText(measure, 'Çok uzun bir şirket adı 🏙️ AŞ', 100, [20], font);
    assert.equal(fitted.size, 20);
    assert.ok(fitted.text.endsWith('…'));
    assert.ok(measure(fitted.text, font(20)) <= 100, fitted.text);
    const emoji = fitText(measure, '🏙🏙🏙🏙🏙🏙', 40, [10], font);
    assert.ok(!/[\uD800-\uDBFF]…$/.test(emoji.text), 'yarım vekil çifti yok');
  });
});
