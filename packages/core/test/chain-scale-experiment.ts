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
  createNewGame,
  formatMoney,
  getPlayer,
  tilePrice,
} from '../src/index';
import { expandOutlets, followChainAdvice, ownUnits } from './proxy';

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

/** Tur 14 vekilinin zincir yarısı + ünite tavanı + satın alma günlüğü. */
function followChain(engine: GameEngine, cap: number, log: PurchaseLog[] | null): void {
  // Fren SONRASI davranış ölçülür: erteleme de atlanır. Tavan kolları
  // frene rağmen kalan hamle sayısını gösterir — fren doğru çalışıyorsa
  // "sınırsız" kol kendiliğinden küçük kalmalı.
  const state = engine.getState();
  const player = getPlayer(state);
  followChainAdvice(engine, {
    ...(Number.isFinite(cap) ? { maxUnits: cap } : {}),
    onBuilt: (move, price) =>
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
      }),
  });
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
      expandOutlets(engine);
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
