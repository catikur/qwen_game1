/**
 * Gün başına süre — senaryo şehirlerinde (Tur 43).
 *
 * `benchmark.ts` gibi bir TERMOMETRE: geçip kalmayı değil sayının kendisini
 * raporluyor. Tarayıcıda bir oyun günü kareyi bekletiyor; büyük şehirde ve
 * geç oyunda günün süresi akıcılığın sınırı. Ortalamanın yanında en yavaş
 * günler de yazılıyor: takılmayı ortalama değil yavaş gün yapıyor.
 *
 * Sondaki iz, günün sonundaki durumun parmak izi. Hızlandırma sonucu
 * değiştirmemeli: iki sürümün izleri birebir aynı olmalı. Zaman damgaları
 * (`…AtIso`) ize girmiyor; her koşuda değişiyorlar.
 *
 * Çalıştırma: `pnpm dayperf [senaryo…] [--days N]`
 */
declare const process: { argv: string[]; hrtime: { bigint(): bigint } };

import { GameEngine, createScenarioGame } from '../src/index';
import type { GameState } from '../src/types';

const args = process.argv.slice(2);
const daysAt = args.indexOf('--days');
const DAYS = daysAt >= 0 ? Number(args[daysAt + 1]) : 120;
const named = args.filter((arg, index) => !arg.startsWith('--') && (daysAt < 0 || index !== daysAt + 1));
const SCENARIOS = named.length > 0 ? named : ['conquest', 'holding', 'chain', 'consortium', 'crisis', 'rescue', 'sponsor'];
/** Devirden sonraki ilk günler ölçülmüyor: senaryo açılışının tek seferlik işleri. */
const WARM_DAYS = 10;

function fingerprint(state: GameState): string {
  const text = JSON.stringify(state, (key, value) => (key.endsWith('AtIso') ? undefined : value));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const now = (): number => Number(process.hrtime.bigint()) / 1e6;

console.log(`Gün başına süre · ${DAYS} gün · ms`);
console.log('senaryo       bina  ort    p50    p95   en çok  iz');
for (const id of SCENARIOS) {
  const engine = new GameEngine(createScenarioGame(id, { companyName: 'Ölçüm' }));
  for (let day = 0; day < WARM_DAYS; day++) engine.runDay();
  const times: number[] = [];
  for (let day = 0; day < DAYS; day++) {
    const start = now();
    engine.runDay();
    times.push(now() - start);
  }
  const state = engine.getState();
  times.sort((a, b) => a - b);
  const at = (q: number): number => times[Math.min(times.length - 1, Math.floor(q * times.length))]!;
  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  console.log(
    `${id.padEnd(12)} ${String(Object.keys(state.buildings).length).padStart(5)}` +
      ` ${mean.toFixed(1).padStart(5)}  ${at(0.5).toFixed(1).padStart(5)}  ${at(0.95).toFixed(1).padStart(5)}  ${times.at(-1)!.toFixed(1).padStart(6)}  ${fingerprint(state)}`,
  );
}
