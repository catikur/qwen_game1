/**
 * Swift eşitlik fikstürlerini yeniden yazar. Model ya da içerik değişince
 * çalıştırılır: node tools/run-node-script.mjs packages/lite-model/test/write-fixtures.ts
 */
import { writeFileSync } from 'node:fs';
import { buildFixtures } from './fixtures';
import { FIXTURE_PATH } from './fixture-path';

const fixtures = buildFixtures();
writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixtures, null, 1)}\n`);
const ops = fixtures.scenarios.reduce((n, s) => n + s.ops.length, 0);
const snaps = fixtures.scenarios.reduce((n, s) => n + s.snapshots.length, 0);
console.log(`${FIXTURE_PATH}: ${fixtures.scenarios.length} senaryo · ${ops} adım · ${snaps} anlık görüntü`);
for (const s of fixtures.scenarios) {
  const last = s.snapshots[s.snapshots.length - 1]!;
  console.log(`  ${s.name}: şehir ${last.city} · yıldız ${last.stars} · kazanç ${last.earned.toExponential(3)} · saat ${(last.clock / 3600).toFixed(2)} sa`);
}
