/**
 * Lite denge raporu: iki bot, aynı model.
 *
 *   Aktif oyuncu — her saniye önerilen hamleyi (kasası yettikçe) alıyor,
 *   kampanyayı hazır oldukça açıyor. "Ne kadar hızlı ilerleyebilir" sorusu.
 *   Gündelik oyuncu — 3 saatte bir 4 dakika oynuyor, arada çevrimdışı.
 *   "Telefonu cebinde unutan biri bir haftada nereye varır" sorusu.
 *
 * Çalıştırma: node tools/run-node-script.mjs packages/lite-model/test/balance.ts
 */
import {
  CHAIN_IDS,
  DISTRICTS,
  GOALS,
  STAGES,
  bestMove,
  buy,
  buyManager,
  chainReport,
  chooseCouncil,
  claimGoal,
  chainUnlocked,
  featuredChain,
  goPublic,
  incomePerSecond,
  ipoProceeds,
  ipoUnlocked,
  managerCost,
  applyOffline,
  advance,
  prestige,
  prestigePreview,
  startCampaign,
  newGame,
  type LiteState,
} from '../src/index';

const fmt = (n: number): string => {
  const units: Array<[number, string]> = [
    [1e15, 'Ka'],
    [1e12, 'Tn'],
    [1e9, 'Mr'],
    [1e6, 'M'],
    [1e3, 'B'],
  ];
  for (const [v, u] of units) if (Math.abs(n) >= v) return `${(n / v).toFixed(2)} ${u}`;
  return n.toFixed(1);
};
const clock = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}sa ${String(m).padStart(2, '0')}dk` : `${m}dk ${String(sec).padStart(2, '0')}sn`;
};

const picks = { raw: 0, process: 0, retail: 0 };
const goalsClaimed: number[] = [];
/** L4: halka arz anı ve kasaya giren para (aktif koşu raporu için). */
let ipoAt: { clock: number; proceeds: number; income: number } | null = null;

/** Aktif oyuncunun bir saniyesi: kasa yettikçe önerilen hamleyi al. */
function play(state: LiteState, campaign: boolean): LiteState {
  let s = state;
  if (campaign) {
    const c = startCampaign(s);
    if (c.ok) s = c.state;
  }
  // L3: tutan görevi al; mecliste o an daha çok kazandıran seçeneği seç.
  for (let g = 0; g < 3; g++) {
    const r = claimGoal(s);
    if (!r.ok) break;
    s = r.state;
    goalsClaimed.push(s.clock);
  }
  if (s.council !== null) {
    const a = chooseCouncil(s, 0);
    const b = chooseCouncil(s, 1);
    if (a.ok && b.ok) s = incomePerSecond(a.state) >= incomePerSecond(b.state) ? a.state : b.state;
  }
  // L4: halka arz açılır açılmaz.
  if (!s.listed && ipoUnlocked(s)) {
    const proceeds = ipoProceeds(s);
    const r = goPublic(s);
    if (r.ok) {
      ipoAt = { clock: s.clock, proceeds, income: incomePerSecond(s) };
      s = r.state;
    }
  }
  for (let guard = 0; guard < 200; guard++) {
    const move = bestMove(s);
    // Genel Müdür: gelirin 2 dakikasından ucuzsa al (gündelik oyuncu için tavan).
    if (managerCost(s.manager) < incomePerSecond(s) * 120) {
      const m = buyManager(s);
      if (m.ok) {
        s = m.state;
        continue;
      }
    }
    if (!move || move.cost > s.cash) break;
    const r = buy(s, move.chain, move.stage, 1);
    if (!r.ok) break;
    s = r.state;
    picks[(['raw', 'process', 'retail'] as const)[move.stage]]++;
  }
  return s;
}

function activeRun(hours: number, start: LiteState = newGame(), label = ''): LiteState {
  const featured = featuredChain(start);
  console.log(
    `\n== Aktif oyuncu${label} (${hours} saat, kampanya açık${start.stars > 0 ? `, ${start.stars} yıldız` : ''}${featured ? `, öne çıkan ${featured} ×2` : ''}) ==`,
  );
  let s = start;
  ipoAt = null;
  const seen = new Set<string>();
  const checkpoints = [60, 300, 600, 1800, 3600, 7200, 14400, 28800];
  for (let t = 0; t < hours * 3600; t++) {
    s = play(s, true);
    s = advance(s, 1);
    for (const d of DISTRICTS) {
      if (!seen.has(d.id) && s.earned >= d.unlockAt) {
        seen.add(d.id);
        if (d.unlockAt > 0) console.log(`  ${clock(s.clock).padStart(10)}  mahalle açıldı: ${d.id}`);
      }
    }
    for (const id of CHAIN_IDS) {
      const key = `chain:${id}`;
      if (!seen.has(key) && chainUnlocked(s, id)) {
        seen.add(key);
        if (id !== 'bakery') console.log(`  ${clock(s.clock).padStart(10)}  zincir açıldı: ${id}`);
      }
    }
    if (checkpoints.includes(s.clock)) {
      const parts = CHAIN_IDS.filter((id) => s.chains[id].levels[2] > 0).map((id) => {
        const r = chainReport(s, id);
        const l = s.chains[id].levels;
        return `${id} ${l.join('/')} marj %${(r.margin * 100).toFixed(0)} pay %${(r.share * 100).toFixed(0)}`;
      });
      console.log(
        `  ${clock(s.clock).padStart(10)}  gelir ${fmt(incomePerSecond(s))}/sn · kazanç ${fmt(s.earned)} · yıldız önizleme ${prestigePreview(s)} · müdür ${s.manager}`,
      );
      for (const p of parts) console.log(`              ${p}`);
    }
  }
  if (ipoAt) {
    console.log(
      `  halka arz: ${clock(ipoAt.clock).trim()} · kasaya ${fmt(ipoAt.proceeds)} (o anki gelirin ${(ipoAt.proceeds / ipoAt.income / 60).toFixed(1)} dakikası)`,
    );
  }
  console.log(`  görevler: ${goalsClaimed.length}/${GOALS.length} · ${goalsClaimed.map((t) => clock(t).trim()).join(', ')}`);
  console.log(`  olay: ${s.events} · meclis kararı: ${s.policies}`);
  goalsClaimed.length = 0;
  const total = picks.raw + picks.process + picks.retail;
  console.log(
    `  hamle dağılımı: satış %${((picks.retail / total) * 100).toFixed(0)} · işleme %${((picks.process / total) * 100).toFixed(0)} · ham %${((picks.raw / total) * 100).toFixed(0)}`,
  );
  console.log(`  satış önizlemesi: ${prestigePreview(s)} yıldız${s.listed ? ' (halka açık, ×1,2)' : ''}`);
  return s;
}

function casualRun(days: number): void {
  console.log(`\n== Gündelik oyuncu (${days} gün: 3 saatte bir 4 dakika) ==`);
  let s = newGame();
  let realTime = 0;
  for (let day = 1; day <= days; day++) {
    let offlineTotal = 0;
    for (let session = 0; session < 8; session++) {
      for (let t = 0; t < 240; t++) {
        s = play(s, true);
        s = advance(s, 1);
      }
      realTime += 240;
      const away = 3 * 3600 - 240;
      const off = applyOffline(s, away);
      s = off.state;
      offlineTotal += off.earned;
      realTime += away;
    }
    const unlocked = CHAIN_IDS.filter((id) => chainUnlocked(s, id)).length;
    console.log(
      `  gün ${day}: gelir ${fmt(incomePerSecond(s))}/sn · kazanç ${fmt(s.earned)} · çevrimdışı ${fmt(offlineTotal)} · zincir ${unlocked}/${CHAIN_IDS.length} · yıldız önizleme ${prestigePreview(s)} · müdür ${s.manager}`,
    );
  }
  void realTime;
  void STAGES;
}

const first = activeRun(Number(process.argv[2] ?? 8));
// L4: şehri sat, ikinci şehirde aynı bot — yıldız ve öne çıkan zincirle ne kadar hızlı?
const sold = prestige(first);
if (sold.ok) activeRun(Number(process.argv[4] ?? 3), sold.state, ' · ikinci şehir');
casualRun(Number(process.argv[3] ?? 5));
