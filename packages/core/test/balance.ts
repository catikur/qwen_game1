/**
 * Başlıksız denge simülasyonu.
 *
 * Oyunu UI olmadan yüzlerce gün koşturur ve ekonominin sağlıklı olup
 * olmadığını raporlar. Amaç, denge bozukluğunu tarayıcıyı açmadan görmek:
 * oyuncu hiç kaybedemiyorsa oyun kolay, NPC'ler hep batıyorsa rekabet yok.
 */
import { BUILDINGS } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  companyRanking,
  createNewGame,
  districtOpportunity,
  estimateInvestment,
  formatMoney,
  getPlayer,
  tilePrice,
} from '../src/index';
import type { GameState } from '../src/types';

/**
 * Oyuncu vekili: "Fırsat lensine bakıp geri ödemesi iyi olan yere yatırım
 * yap" davranışını taklit eder. Yani oyunun oyuncuya önerdiği oynanışı.
 */
function playerStrategy(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  // Nakdin yarısını riske at, gerisini yedekte tut.
  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts].sort(
    (a, b) => districtOpportunity(b) - districtOpportunity(a),
  );

  let best: { tileId: number; defId: string; payback: number } | null = null;

  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && !t.ownerId && !t.buildingId)
      .sort((a, b) => a.landValue - b.landValue)[0];
    if (!tile) continue;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;

      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.paybackDays < best.payback) {
        best = { tileId: tile.id, defId: option.def.id, payback: estimate.paybackDays };
      }
    }
  }

  if (!best) return;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

interface Report {
  day: number;
  playerNetWorth: number;
  playerCash: number;
  playerProfit: number;
  playerDebt: number;
  buildings: number;
  topRival: string;
  topRivalNetWorth: number;
  avgUnmet: number;
}

function snapshot(state: GameState): Report {
  const player = getPlayer(state);
  const rivals = companyRanking(state).filter((r) => !r.company.isPlayer);
  const top = rivals[0];

  let unmet = 0;
  for (const district of state.districts) unmet += districtOpportunity(district);

  return {
    day: state.time.day,
    playerNetWorth: player.netWorth,
    playerCash: player.cash,
    playerProfit: player.today.profit,
    playerDebt: player.debt,
    buildings: Object.values(state.buildings).filter((b) => b.companyId === player.id).length,
    topRival: top?.company.name ?? '-',
    topRivalNetWorth: top?.company.netWorth ?? 0,
    avgUnmet: unmet / state.districts.length,
  };
}

function run(seed: number, days: number, invest: boolean): Report[] {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Test AŞ' }));
  const reports: Report[] = [];

  for (let day = 1; day <= days; day++) {
    if (invest && day % 5 === 0) playerStrategy(engine);
    engine.runDay();
    if (day % 60 === 0 || day === days) reports.push(snapshot(engine.getState()));
  }
  return reports;
}

const DAYS = 360;
console.log(`=== Denge simülasyonu — ${DAYS} gün, 3 seed ===\n`);

let failures = 0;
function expect(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
  if (!ok) failures++;
}

for (const seed of [1, 7, 42]) {
  const active = run(seed, DAYS, true);
  const idle = run(seed, DAYS, false);
  const final = active[active.length - 1]!;
  const idleFinal = idle[idle.length - 1]!;

  console.log(`\n--- seed ${seed} ---`);
  for (const r of active) {
    console.log(
      `  gün ${String(r.day).padStart(3)} | değer ${formatMoney(r.playerNetWorth).padStart(12)}` +
        ` | nakit ${formatMoney(r.playerCash).padStart(12)}` +
        ` | gün kârı ${formatMoney(r.playerProfit).padStart(11)}` +
        ` | bina ${String(r.buildings).padStart(2)}` +
        ` | en iyi rakip ${r.topRival} ${formatMoney(r.topRivalNetWorth)}` +
        ` | boş talep %${(r.avgUnmet * 100).toFixed(0)}`,
    );
  }

  expect(
    `seed ${seed}: yatırım yapan oyuncu büyüyor`,
    final.playerNetWorth > 250_000,
    `${formatMoney(final.playerNetWorth)}`,
  );
  expect(
    `seed ${seed}: hiçbir şey yapmayan oyuncu büyümüyor`,
    idleFinal.playerNetWorth < final.playerNetWorth,
    `atıl ${formatMoney(idleFinal.playerNetWorth)} < aktif ${formatMoney(final.playerNetWorth)}`,
  );
  expect(
    `seed ${seed}: rakipler de büyüyor (rekabet canlı)`,
    final.topRivalNetWorth > 300_000,
    `${final.topRival} ${formatMoney(final.topRivalNetWorth)}`,
  );
  expect(
    `seed ${seed}: pazar doymuyor (fırsat kalıyor)`,
    final.avgUnmet > 0.05,
    `boş talep %${(final.avgUnmet * 100).toFixed(0)}`,
  );
  expect(
    `seed ${seed}: oyuncu borç sarmalında değil`,
    final.playerDebt < final.playerNetWorth,
    `borç ${formatMoney(final.playerDebt)}`,
  );
}

// Tahmin doğruluğu: build menüsünde yazan "günlük kâr" gerçekleşenle
// tutmalı. Oyuncuya gösterilen sayı yanlışsa oyun ona yalan söylüyor demektir.
{
  const engine = new GameEngine(createNewGame({ seed: 11 }));
  const state = engine.getState();
  for (let i = 0; i < 20; i++) engine.runDay(); // talep rakamları otursun

  const district = [...state.districts].sort(
    (a, b) => districtOpportunity(b) - districtOpportunity(a),
  )[0]!;
  const tile = state.map.tiles.find((t) => t.districtId === district.id && !t.ownerId)!;
  const estimate = estimateInvestment(state, district.id, 'corner_shop', state.playerCompanyId)!;

  engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
  engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
  for (let i = 0; i < 30; i++) engine.runDay();

  const building = state.buildings[state.map.tiles[tile.id]!.buildingId!]!;
  const actual = building.last.profit;
  const error = Math.abs(actual - estimate.dailyProfit) / Math.max(1, Math.abs(estimate.dailyProfit));

  expect(
    'yatırım tahmini gerçekle tutuyor',
    error < 0.45,
    `tahmin ${formatMoney(estimate.dailyProfit)}/gün, gerçek ${formatMoney(actual)}/gün (sapma %${(error * 100).toFixed(0)})`,
  );
}

// Determinizm: aynı seed iki kez koşunca birebir aynı sonuç vermeli.
const a = JSON.stringify(run(99, 120, true));
const b = JSON.stringify(run(99, 120, true));
expect('determinizm: aynı seed = aynı sonuç', a === b, a === b ? 'birebir aynı' : 'FARKLI');

// Her binanın gerçekten kurulabildiğini doğrula (ölü içerik kalmasın).
const engine = new GameEngine(createNewGame({ seed: 5 }));
const player = getPlayer(engine.getState());
player.cash = 50_000_000;
player.netWorth = 50_000_000;
let built = 0;
for (const def of BUILDINGS) {
  const tile = engine.getState().map.tiles.find((t) => !t.ownerId && !t.buildingId);
  if (!tile) break;
  engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
  if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: def.id }).ok) built++;
  else console.log(`  kurulamadı: ${def.id}`);
}
expect('katalogdaki her bina kurulabiliyor', built === BUILDINGS.length, `${built}/${BUILDINGS.length}`);

console.log(`\n=== ${failures === 0 ? 'TÜMÜ GEÇTİ' : `${failures} KONTROL KALDI`} ===`);
process.exit(failures === 0 ? 0 : 1);
