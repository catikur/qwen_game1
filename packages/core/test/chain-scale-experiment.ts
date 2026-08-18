/**
 * Zincir ölçek deneyi — DURUM §4.8 teşhisi.
 *
 * Soru: kartı harfiyen izleyen oyuncu kaç üniteden sonra ve NEDEN zarar
 * etmeye başlıyor? Tur 14'ün ölçümü belirtiyi verdi (27-43 ünitede kol
 * −%1…−%22) ama sebebini vermedi. Adaylar:
 *
 *   a) DELTA EKSİYE DÖNÜYOR — şehir geneli arz fazlası spotu çökertmiş,
 *      kendi üretimin pazardan pahalı; yeni ünite maliyeti YÜKSELTİYOR
 *      ama kart delta'ya bakmıyor.
 *   b) DEVRALMA PRİMİ — sanayi dolunca ünite 1,7-3,6× parsel primiyle
 *      geliyor; tahminde parsel fiyatı yok, gerçek geri ödeme uzuyor.
 *   c) TAHMİN İYİMSERLİĞİ — geri ödeme, spotun bugünkü haliyle statik
 *      hesaplanıyor; kendi arzının yaratacağı düşüşü görmüyor.
 *
 * Düzenek: Tur 14 vekilinin degenerate konfigürasyonu (zincir + mağaza
 * aynı tikte, devralma açık) — çünkü belirti orada ölçüldü. Kollar
 * yalnızca ünite TAVANIYLA ayrılıyor; tavan 0 = hiç zincir kurmayan
 * taban. Ortam A/B ile aynı: olaylar AÇIK, dönemler ve baskınlar KAPALI
 * (eşleme), imar takvimi AÇIK (oyunun kendisi).
 *
 * Çalıştırma: node tools/run-node-script.mjs packages/core/test/chain-scale-experiment.ts
 */
declare const process: { exit(code: number): never };

import {
  GameEngine,
  buildOptions,
  chainCards,
  createNewGame,
  districtOpportunity,
  estimateInvestment,
  formatMoney,
  getPlayer,
  isDistrictOpen,
  tilePrice,
} from '../src/index';
import { BUILDING_BY_ID } from '@capital/content';
import type { GameState } from '../src/types';

const SEEDS = [1, 7, 42];
const DAYS = 560;
const TAIL_START = 440;
const CAPS = [0, 8, 16, 24, 32, Number.POSITIVE_INFINITY];

interface PurchaseLog {
  day: number;
  defId: string;
  unitNo: number;
  needsBuyout: boolean;
  tilePrice: number;
  buildCost: number;
  estPayback: number;
  costDelta: number;
  utilisation: number;
}

function ownUnits(state: GameState, companyId: string): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role === 'extract' || def?.role === 'process') count++;
  }
  return count;
}

/** Tur 14 vekilinin zincir yarısı + ünite tavanı + satın alma günlüğü. */
function followChain(engine: GameEngine, cap: number, log: PurchaseLog[] | null): void {
  const state = engine.getState();
  const player = getPlayer(state);
  if (ownUnits(state, player.id) >= cap) return;

  for (const card of chainCards(state, player.id)) {
    const move = card.move;
    // Fren SONRASI davranış ölçülür: erteleme de atlanır. Tavan kolları
    // frene rağmen kalan hamle sayısını gösterir — fren doğru çalışıyorsa
    // "sınırsız" kol kendiliğinden küçük kalmalı.
    if (!move || move.premature || move.deferred) continue;
    if (move.cost + tilePrice(state, move.tileId, player.id) > player.cash * 0.6) continue;

    const price = tilePrice(state, move.tileId, player.id);
    const acquired = move.needsBuyout
      ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : engine.dispatch({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired.ok) continue;
    if (engine.dispatch({ type: 'BUILD', tileId: move.tileId, defId: move.defId }).ok) {
      log?.push({
        day: state.time.day,
        defId: move.defId,
        unitNo: ownUnits(state, player.id),
        needsBuyout: move.needsBuyout,
        tilePrice: price,
        buildCost: move.cost,
        estPayback: move.paybackDays,
        costDelta: move.costDelta,
        utilisation: move.utilisation,
      });
      return;
    }
  }
}

/** Tur 14 vekilinin genişleme yarısı (devralma dahil) — balance.ts ile aynı. */
function expand(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);
  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts]
    .filter((district) => isDistrictOpen(state, district.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a));

  let best: { tileId: number; defId: string; profit: number } | null = null;
  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.buildingId)
      .map((t) => ({ tile: t, price: tilePrice(state, t.id, player.id) }))
      .filter((entry) => entry.price > 0)
      .sort(
        (a, b) =>
          (a.tile.structureId !== null ? 1 : 0) - (b.tile.structureId !== null ? 1 : 0) ||
          a.price - b.price,
      )[0]?.tile;
    if (!tile) continue;
    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;
      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
      }
    }
  }
  if (!best) return;
  const needsBuyout = state.map.tiles[best.tileId]!.structureId !== null;
  const bought = needsBuyout
    ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: best.tileId })
    : engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId });
  if (!bought.ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

function runArm(
  seed: number,
  cap: number,
  log: PurchaseLog[] | null,
): { tailProfit: number; units: number; buildings: number; netWorth: number } {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Deney AŞ' }));
  const state = engine.getState();
  state.flags.eras = false;
  state.flags.raids = false;

  let tail = 0;
  for (let day = 1; day <= DAYS; day++) {
    if (day % 5 === 0) {
      followChain(engine, cap, log);
      expand(engine);
    }
    engine.runDay();
    if (day > TAIL_START) tail += getPlayer(state).today.profit;
  }

  const player = getPlayer(state);
  return {
    tailProfit: tail / (DAYS - TAIL_START),
    units: ownUnits(state, player.id),
    buildings: Object.values(state.buildings).filter((b) => b.companyId === player.id).length,
    netWorth: player.netWorth,
  };
}

console.log(`ZİNCİR ÖLÇEK DENEYİ — ${DAYS} gün, kuyruk ${TAIL_START}+, tohumlar ${SEEDS.join('/')}\n`);

console.log('1 · TAVAN EĞRİSİ  (kuyruk kârı ₺/gün — satır: tavan, sütun: tohum)');
const header = ['tavan'.padEnd(8), ...SEEDS.map((s) => `tohum ${s}`.padStart(12)), 'ünite'.padStart(10)].join('');
console.log(`  ${header}`);
for (const cap of CAPS) {
  const row: string[] = [];
  const unitCounts: number[] = [];
  for (const seed of SEEDS) {
    const result = runArm(seed, cap, null);
    row.push(formatMoney(result.tailProfit).padStart(12));
    unitCounts.push(result.units);
  }
  const label = Number.isFinite(cap) ? String(cap) : 'sınırsız';
  console.log(`  ${label.padEnd(8)}${row.join('')}${unitCounts.join('/').padStart(10)}`);
}

console.log('\n2 · SATIN ALMA GÜNLÜĞÜ  (sınırsız kol, tohum 7 — belirtinin en sert olduğu yer)');
const purchases: PurchaseLog[] = [];
runArm(7, Number.POSITIVE_INFINITY, purchases);
console.log(
  `  ${'gün'.padStart(4)} ${'ünite'.padStart(5)} ${'yapı'.padEnd(16)} ${'parsel'.padStart(9)} ` +
    `${'devral'.padEnd(6)} ${'t.geri ödeme'.padStart(12)} ${'delta ₺/br'.padStart(10)} ${'doluluk'.padStart(8)}`,
);
for (const p of purchases) {
  console.log(
    `  ${String(p.day).padStart(4)} ${String(p.unitNo).padStart(5)} ${p.defId.padEnd(16)} ` +
      `${formatMoney(p.tilePrice).padStart(9)} ${(p.needsBuyout ? 'EVET' : '—').padEnd(6)} ` +
      `${`${Math.round(p.estPayback)}g`.padStart(12)} ${p.costDelta.toFixed(2).padStart(10)} ` +
      `${`%${Math.round(p.utilisation * 100)}`.padStart(8)}`,
  );
}

const negativeDelta = purchases.filter((p) => p.costDelta <= 0).length;
const buyouts = purchases.filter((p) => p.needsBuyout).length;
const longPayback = purchases.filter((p) => p.estPayback > 260).length;
console.log(
  `\n  özet: ${purchases.length} alım · delta≤0 olan ${negativeDelta} · devralmayla gelen ${buyouts} · ` +
    `tahmini geri ödemesi 260g üstü ${longPayback}`,
);
process.exit(0);
