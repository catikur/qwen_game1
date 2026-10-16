declare const process: { env: Record<string, string | undefined> };
/**
 * Uzun oyun termometresi (Tur 37): kartopu ne kadar hızlı?
 * Çalıştırma: node tools/run-node-script.mjs packages/core/test/longrun.ts
 */
import { NPC_PROFILES } from '@capital/content';
import { GameEngine, createNewGame, formatMoney, getPlayer } from '../src/index';
import { playerStrategy } from './proxy';

const SEEDS = (process.env.SEEDS ?? "1,7,42").split(",").map(Number);
const MARKS = [180, 360, 720, 1080, 1440];

for (const seed of SEEDS) {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Uzun AŞ' }));
  if (process.env.OFF === '1') {
    engine.getState().flags.lateCosts = false;
    engine.getState().flags.crises = false;
  }
  console.log(`\ntohum ${seed}`);
  console.log('  gün   nakit        net değer    en iyi rakip  oran   bina  günlük kâr   zafer   | ciro / smm / bakım / ücret / faiz (30 gün ort.)');
  const sums = { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, n: 0 };
  let victoryDay: number | null = null;
  for (let day = 1; day <= MARKS[MARKS.length - 1]!; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
    const state = engine.getState();
    if (state.victory && victoryDay === null) {
      victoryDay = state.victory.day;
      state.victory.dismissed = true;
    }
    if (state.gameOver) {
      console.log(`  oyun bitti: gün ${day}`);
      break;
    }
    {
      const t = getPlayer(state).today;
      sums.revenue += t.revenue; sums.cogs += t.cogs; sums.upkeep += t.upkeep; sums.wages += t.wages; sums.interest += t.interest; sums.n++;
    }
    if (MARKS.includes(day)) {
      const player = getPlayer(state);
      const k = (v: number) => formatMoney(v / Math.max(1, sums.n));
      const ledger = `| ${k(sums.revenue)} / ${k(sums.cogs)} / ${k(sums.upkeep)} / ${k(sums.wages)} / ${k(sums.interest)}`;
      sums.revenue = sums.cogs = sums.upkeep = sums.wages = sums.interest = sums.n = 0;
      const rivals = Object.values(state.companies).filter((c) => !c.isPlayer);
      const top = rivals.reduce((m, c) => Math.max(m, c.netWorth), 0);
      const count = Object.values(state.buildings).filter((b) => b.companyId === player.id).length;
      const crisis = state.crisis ? `${state.crisis.defId}:${state.crisis.phase}` : '';
      console.log(
        `  ${String(day).padStart(4)}  ${formatMoney(player.cash).padEnd(12)} ${formatMoney(player.netWorth).padEnd(12)} ${formatMoney(top).padEnd(13)} ${(player.netWorth / Math.max(1, top)).toFixed(2).padStart(5)}  ${String(count).padStart(4)}  ${formatMoney(player.today.profit).padEnd(12)} ${String(victoryDay ?? '-').padEnd(7)} ${ledger} | vergi ${formatMoney((player.today.tax ?? 0))} ${crisis}`,
      );
    }
  }
  void NPC_PROFILES;
}
