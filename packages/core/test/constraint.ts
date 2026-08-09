/**
 * KISIT DENEYİ — oyunun bağlayıcı kısıtı hangisi?
 *
 * Tur 7 bu deneyi bir kez koştu ve §4.1'in dört tur boyunca yanlış olan
 * teşhisini ("sermaye yetişemiyor") çürüttü. Ama deneyin kendisi repoda
 * kalmadı, yalnızca sayıları alıntılandı — yani sonraki tur onu
 * tekrarlayamadı, sadece güvenebildi.
 *
 * Bu dosya o boşluğu kapatıyor. Deney artık bir koşum:
 *
 *     pnpm constraint
 *
 * Yöntem: oyuncunun politikası sabit tutulur, tek değişken KISITTIR.
 * Her gün inşa denenir ve deneme başarısız olduğunda SEBEBİ sayılır.
 * Sermaye sonsuz yapıldığında hiçbir şey düzelmiyorsa kısıt para
 * değildir; sayaç hangi duvara çarpıldığını söyler.
 */
declare const process: { exit(code: number): never };
declare const Date: { now(): number };

import { CONSUMER_CATEGORIES, DISTRICT_LAYOUT } from '@capital/content';
import type { DistrictArchetypeId } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  createNewGame,
  estimateInvestment,
  getPlayer,
  tilePrice,
} from '../src/index';
import type { GameState } from '../src/types';

const DAYS = 1200;
const SEED = 20_260_809;
const UNLIMITED = 1_000_000_000;

type Reason = 'kuruldu' | 'parsel yok' | 'pahalı' | 'geri ödeme yavaş';

interface Run {
  label: string;
  /** Her gün mü inşa denensin, yoksa N günde bir mi? */
  cadence: number;
  /** Kaç bölgeye baksın? */
  districtLimit: number;
  /** Nakit her gün tazelensin mi? */
  unlimitedCash: boolean;
}

interface Result {
  label: string;
  buildings: number;
  unmet: number;
  netWorth: number;
  reasons: Record<Reason, number>;
  census: { empty: number; buyable: number; owned: number };
}

/**
 * Şehir geneli karşılanmayan talep — talep ağırlıklı, bölge ortalaması DEĞİL.
 *
 * `district.unmet` BİRİM DEĞİL ORAN tutuyor; birime çevirmek için talep
 * ile çarpılması gerekiyor. Doğrudan toplanırsa payda (binlerce birimlik
 * talep) payı (bölge başına en fazla 5 oran) ezer ve sonuç her koşulda
 * %0 çıkar — yani kontrol hiçbir zaman kırmızı yanmaz.
 */
function cityUnmet(state: GameState): number {
  let total = 0;
  let unmetUnits = 0;
  for (const district of state.districts) {
    for (const category of CONSUMER_CATEGORIES) {
      const demand = district.demand[category] ?? 0;
      total += demand;
      unmetUnits += demand * (district.unmet[category] ?? 0);
    }
  }
  return total > 0 ? unmetUnits / total : 0;
}

/**
 * Parsel muhasebesi.
 *
 * "Boş parsel yok" ile "toprak bitti" AYNI ŞEY DEĞİL: üzerinde eski yapı
 * duran parseller devralınabilir, yani gizli arzdır. Sayaç yalnızca boşu
 * görüyor; bu ayrımı yapmazsak toprak kıtlığını olduğundan büyük
 * okuruz.
 */
function plotCensus(state: GameState): { empty: number; buyable: number; owned: number } {
  let empty = 0;
  let buyable = 0;
  let owned = 0;
  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot') continue;
    if (tile.ownerId) owned++;
    else if (tile.structureId) buyable++;
    else empty++;
  }
  return { empty, buyable, owned };
}

/**
 * Tek bir inşa denemesi ve SEBEBİ.
 *
 * Sebep sıralaması önemli: "parsel yok" bölge düzeyinde belirlenir, para
 * ve geri ödeme ise aday bina düzeyinde. Bir bölgede parsel varsa ama
 * hiçbir bina sığmıyorsa bu "pahalı"dır, "parsel yok" değil — aksi halde
 * sayaç toprak kıtlığını olduğundan büyük gösterirdi.
 */
function attemptBuild(engine: GameEngine, run: Run): Reason {
  const state = engine.getState();
  const player = getPlayer(state);
  const budget = run.unlimitedCash ? player.cash : player.cash * 0.5;

  const districts = [...state.districts].sort(
    (a, b) => (b.population ?? 0) - (a.population ?? 0),
  );

  let sawPlot = false;
  let sawAffordable = false;
  let best: { tileId: number; defId: string; profit: number } | null = null;

  for (const district of districts.slice(0, run.districtLimit)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId)
      .sort((a, b) => a.landValue - b.landValue)[0];
    if (!tile) continue;
    sawPlot = true;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;
      sawAffordable = true;
      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
      }
    }
  }

  if (!sawPlot) return 'parsel yok';
  if (!sawAffordable) return 'pahalı';
  if (!best) return 'geri ödeme yavaş';

  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return 'pahalı';
  if (!engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId }).ok) return 'pahalı';
  return 'kuruldu';
}

function runExperiment(run: Run): Result {
  const engine = new GameEngine(createNewGame({ seed: SEED, npcCount: 4 }));
  const reasons: Record<Reason, number> = {
    'kuruldu': 0,
    'parsel yok': 0,
    'pahalı': 0,
    'geri ödeme yavaş': 0,
  };

  for (let day = 0; day < DAYS; day++) {
    if (run.unlimitedCash) getPlayer(engine.getState()).cash = UNLIMITED;
    if (day % run.cadence === 0) reasons[attemptBuild(engine, run)]++;
    engine.runDay();
  }

  const state = engine.getState();
  const player = getPlayer(state);
  return {
    label: run.label,
    buildings: Object.values(state.buildings).filter((b) => b.companyId === player.id).length,
    unmet: cityUnmet(state),
    netWorth: player.netWorth,
    reasons,
    census: plotCensus(state),
  };
}

// --------------------------------------------------------------------

const RUNS: Run[] = [
  { label: 'A · bugünkü bot (5 günde bir, 4 bölge)', cadence: 5, districtLimit: 4, unlimitedCash: false },
  { label: 'B · her gün, 4 bölge', cadence: 1, districtLimit: 4, unlimitedCash: false },
  { label: 'C · her gün, TÜM bölgeler', cadence: 1, districtLimit: 99, unlimitedCash: false },
  { label: 'D · her gün, tüm bölgeler, SERMAYE SINIRSIZ', cadence: 1, districtLimit: 99, unlimitedCash: true },
];

const reference = new GameEngine(createNewGame({ seed: SEED, npcCount: 4 })).getState();
const totalPlots = reference.map.tiles.filter((t) => t.kind === 'plot').length;

console.log(`\nKISIT DENEYİ — ${DAYS} gün, tohum ${SEED}, ${totalPlots} parsel\n`);
console.log(
  'politika'.padEnd(44),
  'bina'.padStart(6),
  'boş talep'.padStart(10),
  'net değer'.padStart(12),
);

const results: Result[] = [];
for (const run of RUNS) {
  const result = runExperiment(run);
  results.push(result);
  console.log(
    result.label.padEnd(44),
    String(result.buildings).padStart(6),
    `%${Math.round(result.unmet * 100)}`.padStart(10),
    `${(result.netWorth / 1e6).toFixed(1)} M ₺`.padStart(12),
  );
}

console.log('\n--- inşa denemesi neden başarısız oldu? ---\n');
console.log(
  'politika'.padEnd(44),
  'kuruldu'.padStart(8),
  'boş yok'.padStart(9),
  'pahalı'.padStart(7),
  'geri öd.'.padStart(9),
);
for (const result of results) {
  console.log(
    result.label.padEnd(44),
    String(result.reasons['kuruldu']).padStart(8),
    String(result.reasons['parsel yok']).padStart(9),
    String(result.reasons['pahalı']).padStart(7),
    String(result.reasons['geri ödeme yavaş']).padStart(9),
  );
}

console.log('\n--- 1200. günde parsel muhasebesi ---\n');
console.log(
  'politika'.padEnd(44),
  'boş'.padStart(6),
  'devralınabilir'.padStart(15),
  'sahipli'.padStart(9),
);
for (const result of results) {
  console.log(
    result.label.padEnd(44),
    String(result.census.empty).padStart(6),
    String(result.census.buyable).padStart(15),
    String(result.census.owned).padStart(9),
  );
}

// ---- Sonucun okunması ----
//
// Deneyin cevabı D satırındadır: sermaye sonsuzken bile boş talep
// yüksek kalıyorsa kısıt para değildir. Hangi duvar olduğunu sayaç
// söyler.
const unlimited = results[results.length - 1]!;
const dominant = (Object.entries(unlimited.reasons) as [Reason, number][])
  .filter(([reason]) => reason !== 'kuruldu')
  .sort((a, b) => b[1] - a[1])[0];

console.log('\n--- okuma ---\n');
console.log(`Sınırsız sermayeyle karşılanmayan talep: %${Math.round(unlimited.unmet * 100)}`);
if (dominant && dominant[1] > unlimited.reasons['kuruldu']) {
  console.log(`Baskın engel: "${dominant[0]}" (${dominant[1]} kez, ${unlimited.reasons['kuruldu']} inşaya karşı)`);
} else {
  console.log(
    `Baskın engel YOK: ${unlimited.reasons['kuruldu']} inşa, en yakın engel ` +
      `"${dominant?.[0]}" ${dominant?.[1]} kez. Kısıt artık botun temposu.`,
  );
}
console.log(
  `1200. günde toprak: ${unlimited.census.empty} boş · ` +
    `${unlimited.census.buyable} devralınabilir · ${unlimited.census.owned} sahipli ` +
    `(toplam ${totalPlots})`,
);

// ==================================================================
// BÖLGE SAYISI — şehri büyütmek oynanışta ne yapıyor?
// ==================================================================
//
// `land-experiment.ts` abonman oranının bölge sayısına duyarsız
// olduğunu gösteriyor (hem arz hem talep aynı oranda büyüyor). Geriye
// ölçülecek asıl şey kalıyor: büyük şehir OYNANIŞTA ne yapıyor ve
// simülasyon ne kadar yavaşlıyor?

const LAYOUT_3x3 = DISTRICT_LAYOUT;

/** Aynı arketip ailesinden 5×5 — çekirdek korunur, çeper genişler. */
const LAYOUT_5x5: DistrictArchetypeId[][] = [
  ['port', 'port', 'industrial', 'industrial', 'tech_park'],
  ['port', 'retail_strip', 'industrial', 'tech_park', 'tech_park'],
  ['retail_strip', 'retail_strip', 'downtown', 'lux_residential', 'lux_residential'],
  ['student', 'student', 'mid_residential', 'lux_residential', 'tourism'],
  ['student', 'mid_residential', 'mid_residential', 'tourism', 'tourism'],
];

interface LayoutResult {
  label: string;
  plots: number;
  side: number;
  unmet: number[];
  buildings: number;
  ratio: number;
  daysPerSecond: number;
}

function runLayout(label: string, layout: DistrictArchetypeId[][], run: Run): LayoutResult {
  const engine = new GameEngine(createNewGame({ seed: SEED, npcCount: 4, layout }));
  const marks = [360, 700, 1200];
  const unmet: number[] = [];
  const started = Date.now();

  for (let day = 0; day < DAYS; day++) {
    if (day % run.cadence === 0) attemptBuild(engine, run);
    engine.runDay();
    if (marks.includes(day + 1)) unmet.push(cityUnmet(engine.getState()));
  }

  const elapsed = (Date.now() - started) / 1000;
  const state = engine.getState();
  const player = getPlayer(state);
  const bestRival = Math.max(
    ...Object.values(state.companies)
      .filter((c) => !c.isPlayer)
      .map((c) => c.netWorth),
  );

  return {
    label,
    plots: state.map.tiles.filter((t) => t.kind === 'plot').length,
    side: state.map.width,
    unmet,
    buildings: Object.values(state.buildings).filter((b) => b.companyId === player.id).length,
    ratio: bestRival > 0 ? player.netWorth / bestRival : 0,
    daysPerSecond: DAYS / elapsed,
  };
}

console.log('\n\n=== BÖLGE SAYISI: 3×3 mü 5×5 mi? ===\n');
console.log(
  'yerleşim'.padEnd(12),
  'harita'.padStart(9),
  'parsel'.padStart(7),
  '360g'.padStart(6),
  '700g'.padStart(6),
  '1200g'.padStart(6),
  'bina'.padStart(6),
  'oyn/rak'.padStart(8),
  'gün/sn'.padStart(8),
);

// Üçüncü satır bir AYIRT ETME deneyi: 5×5'in erken oyundaki açığı
// şehrin büyüklüğünden mi geliyor, yoksa aynı beş inşaatçının 2,7 kat
// toprağa yetişememesinden mi? Tek değişken inşa temposu.
const CASES: [string, DistrictArchetypeId[][], Run][] = [
  ['3×3', LAYOUT_3x3, RUNS[0]!],
  ['5×5', LAYOUT_5x5, RUNS[0]!],
  ['5×5 · hızlı bot', LAYOUT_5x5, RUNS[2]!],
];

for (const [label, layout, run] of CASES) {
  const r = runLayout(label, layout, run);
  console.log(
    r.label.padEnd(12),
    `${r.side}×${r.side}`.padStart(9),
    String(r.plots).padStart(7),
    ...r.unmet.map((u) => `%${Math.round(u * 100)}`.padStart(6)),
    String(r.buildings).padStart(6),
    r.ratio.toFixed(2).padStart(8),
    r.daysPerSecond.toFixed(0).padStart(8),
  );
}

process.exit(0);
