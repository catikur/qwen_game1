/**
 * Canlı denetimin simülasyon adımı (`simCheck.ts`, `.github/workflows/lite-league.yml`):
 *
 *   node tools/run-node-script.mjs packages/lite-league/scripts/sim-check.ts <url> [--strict] [--wait]
 *
 * `--strict`: fark ya da eski sunucu hata (main); yoksa uyarı (PR).
 * `--wait`: sunucu az önce dağıtıldı, yeni sürümün yayılmasını bir dakikaya kadar bekle.
 */
import { SERVER_REPLAY } from '../src/seed';
import { simCheck, simReport } from './simCheck';

const [url, ...flags] = process.argv.slice(2);
if (!url) {
  console.error('kullanım: node tools/run-node-script.mjs packages/lite-league/scripts/sim-check.ts <url> [--strict] [--wait]');
  process.exit(2);
}
const local = SERVER_REPLAY.sim();
const result = await simCheck(url, local, fetch, flags.includes('--wait') ? { attempts: 7, delayMs: 10_000 } : {});
const { line, code } = simReport(result, local, flags.includes('--strict'));
console.log(line);
process.exit(code);
