/**
 * Benchmark — oyunun ölçülebilir durumu.
 *
 * `balance.ts` bir SINAV: geçti/kaldı der. Bu dosya bir TERMOMETRE:
 * geçip kalmayı değil, sayının kendisini raporlar. İkisi farklı işler
 * yapıyor — sınav bir şey bozulduğunda bağırır, termometre neyin ne
 * kadar değiştiğini gösterir.
 *
 * Çalıştırma: `pnpm bench`
 *
 * Çıktı bilerek tek ekrana sığıyor ve sayılar birim taşıyor; iki sürüm
 * arasındaki farkı gözle karşılaştırabilmek gerekiyor.
 */
declare const process: { exit(code: number): never; hrtime: { bigint(): bigint } };

import { BUILDINGS, BUILDING_BY_ID, CONSUMER_CATEGORIES, GOODS, NPC_PROFILES } from '@capital/content';
import {
  GameEngine,
  SCHEMA_VERSION,
  buildOptions,
  chainCards,
  competitionCards,
  createNewGame,
  districtOpportunity,
  estimateInvestment,
  formatMoney,
  getPlayer,
  sharePrice,
  supplyRoutes,
  tilePrice,
  TOTAL_SHARES,
} from '../src/index';
import { build, buyTile } from '../src/actions';
import type { GameState } from '../src/types';

const SEEDS = [1, 7, 42];
const DAYS = 360;

// --------------------------------------------------------------- yardımcı

/** Oyunun oyuncuya ÖNERDİĞİ oynanış — harness'takinin aynısı. */
function playerStrategy(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  for (const card of chainCards(state, player.id)) {
    const move = card.move;
    if (!move || move.premature) continue;
    if (move.cost + tilePrice(state, move.tileId, player.id) > player.cash * 0.6) continue;
    const acquired = move.needsBuyout
      ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : engine.dispatch({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired.ok) continue;
    if (engine.dispatch({ type: 'BUILD', tileId: move.tileId, defId: move.defId }).ok) return;
  }

  const budget = player.cash * 0.5;
  if (budget < 30_000) return;
  const districts = [...state.districts].sort((a, b) => districtOpportunity(b) - districtOpportunity(a));
  let best: { tileId: number; defId: string; payback: number } | null = null;
  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId)
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

/** Zincir kartını GÖRMEZDEN GELEN strateji — A/B'nin kontrol grubu. */
function expandOnly(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);
  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts].sort((a, b) => districtOpportunity(b) - districtOpportunity(a));
  let best: { tileId: number; defId: string; payback: number } | null = null;
  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId)
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

function labEngine(seed: number): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Bench' }));
  const state = engine.getState();
  state.flags.npcCompetition = false;
  state.flags.randomEvents = false;
  state.flags.landAuctions = false;
  const player = getPlayer(state);
  player.cash = 500_000_000;
  player.netWorth = 500_000_000;
  return engine;
}

function placeFor(engine: GameEngine, companyId: string, defId: string, districtId: number): string | null {
  const state = engine.getState();
  const tile = state.map.tiles.find(
    (t) =>
      t.districtId === districtId && t.kind === 'plot' && !t.ownerId && !t.structureId && !t.buildingId,
  );
  if (!tile) return null;
  if (!buyTile(state, companyId, tile.id).ok) return null;
  if (!build(state, companyId, tile.id, defId).ok) return null;
  return state.map.tiles[tile.id]!.buildingId;
}

/** Şehir geneli karşılanmayan talep — BİRİM ağırlıklı. */
function cityUnmet(state: GameState): number {
  let unmetUnits = 0;
  let total = 0;
  for (const district of state.districts) {
    for (const category of CONSUMER_CATEGORIES) {
      const demand = district.demand[category] ?? 0;
      total += demand;
      unmetUnits += demand * (district.unmet[category] ?? 0);
    }
  }
  return total > 0 ? unmetUnits / total : 0;
}

/** Şehirdeki bütün outlet'lerin ortalama kapasite doluluğu. */
function cityUtilisation(state: GameState): number {
  let sold = 0;
  let capacity = 0;
  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    sold += building.last.unitsSold;
    capacity += def.capacity;
  }
  return capacity > 0 ? sold / capacity : 0;
}

const pct = (value: number): string => `%${(value * 100).toFixed(0)}`;
const row = (label: string, ...cells: string[]): void =>
  console.log(`  ${label.padEnd(32)}${cells.map((c) => c.padStart(15)).join(' ')}`);
const head = (title: string): void => console.log(`\n\x1b[1m${title}\x1b[0m`);

// ------------------------------------------------------------------ koşu

const started = process.hrtime.bigint();

console.log(`\x1b[1mCAPITAL — BENCHMARK\x1b[0m   şema v${SCHEMA_VERSION} · ${DAYS} gün · ${SEEDS.length} tohum`);

// ---- 1. Büyüme ve rekabet dengesi ----
head('1 · BÜYÜME VE REKABET DENGESİ');
row('', ...SEEDS.map((s) => `tohum ${s}`), 'ortalama');

const finals = SEEDS.map((seed) => {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Bench AŞ' }));
  for (let day = 1; day <= DAYS; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  const state = engine.getState();
  const player = getPlayer(state);
  const rivals = NPC_PROFILES.map((p) => state.companies[p.id]).filter(Boolean);
  const topRival = rivals.reduce((best, c) => (c!.netWorth > (best?.netWorth ?? 0) ? c : best), rivals[0]);
  return {
    state,
    netWorth: player.netWorth,
    profit: player.today.profit,
    buildings: Object.values(state.buildings).filter((b) => b.companyId === player.id).length,
    topRival: topRival?.netWorth ?? 0,
    unmet: cityUnmet(state),
    utilisation: cityUtilisation(state),
    debt: player.debt,
  };
});

const avg = (pick: (f: (typeof finals)[number]) => number): number =>
  finals.reduce((sum, f) => sum + pick(f), 0) / finals.length;

row('Oyuncu net değeri', ...finals.map((f) => formatMoney(f.netWorth)), formatMoney(avg((f) => f.netWorth)));
row('En iyi rakip', ...finals.map((f) => formatMoney(f.topRival)), formatMoney(avg((f) => f.topRival)));
row(
  'Oyuncu / rakip oranı',
  ...finals.map((f) => (f.netWorth / Math.max(1, f.topRival)).toFixed(2)),
  (avg((f) => f.netWorth) / Math.max(1, avg((f) => f.topRival))).toFixed(2),
);
row('Oyuncu bina sayısı', ...finals.map((f) => String(f.buildings)), avg((f) => f.buildings).toFixed(0));
row('Günlük kâr', ...finals.map((f) => formatMoney(f.profit)), formatMoney(avg((f) => f.profit)));
row('Borç', ...finals.map((f) => formatMoney(f.debt)), formatMoney(avg((f) => f.debt)));

// ---- 2. Pazarın doygunluğu ----
head('2 · PAZARIN DOYGUNLUĞU  (Tur 3 buranın sayısını değiştirdi)');
row('Karşılanmayan talep (ağırlıklı)', ...finals.map((f) => pct(f.unmet)), pct(avg((f) => f.unmet)));
row('Outlet doluluğu', ...finals.map((f) => pct(f.utilisation)), pct(avg((f) => f.utilisation)));
console.log(
  '  \x1b[2mDoluluk %100\'e dayanırsa çekicilik (kalite/marka/fiyat) ölür:\x1b[0m',
);
console.log('  \x1b[2mherkes zaten satabildiğinin tamamını satıyor demektir.\x1b[0m');

// Pazar NE ZAMAN doyuyor? 360 gün sermaye kısıtı yüzünden yetmiyor.
{
  const engine = new GameEngine(createNewGame({ seed: 1, companyName: 'Uzun' }));
  const marks: Array<{ day: number; utilisation: number; unmet: number }> = [];
  for (let day = 1; day <= 1200; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
    if (day === 360 || day === 700 || day === 1200) {
      const state = engine.getState();
      marks.push({ day, utilisation: cityUtilisation(state), unmet: cityUnmet(state) });
    }
  }
  row('', ...marks.map((m) => `${m.day}. gün`));
  row('Outlet doluluğu (uzun koşu)', ...marks.map((m) => pct(m.utilisation)));
  row('Karşılanmayan talep', ...marks.map((m) => pct(m.unmet)));
  console.log('  \x1b[2mCANLI OYUNDA PAZAR DOYMUYOR. Tur 3 patolojik döngüyü (dükkânın\x1b[0m');
  console.log('  \x1b[2mkendi müşterisini üretmesi) kapattı ve kontrollü düelloda doluluk\x1b[0m');
  console.log('  \x1b[2m%66\'ya iniyor; ama canlı oyunda oyuncunun sermayesi talebin\x1b[0m');
  console.log('  \x1b[2mbileşik büyümesine yetişemiyor. Sıradaki denge işi burada.\x1b[0m');
}

// ---- 3. Stratejilerin karşılığı ----
head('3 · STRATEJİLERİN KARŞILIĞI  (aynı tohum, tek değişken)');

/** Kontrollü düello: iki tarafta eşit süpermarket. */
function duel(seed: number, outlets: number): { engine: GameEngine; districtIds: number[] } {
  const engine = labEngine(seed);
  const state = engine.getState();
  const rivalId = NPC_PROFILES[0]!.id;
  const rival = state.companies[rivalId]!;
  rival.cash = 500_000_000;
  rival.netWorth = 500_000_000;
  const order = [...state.districts].sort((a, b) => a.population - b.population).map((d) => d.id);
  const districtIds: number[] = [];
  for (let i = 0; i < outlets; i++) {
    const districtId = order[i % order.length]!;
    districtIds.push(districtId);
    placeFor(engine, state.playerCompanyId, 'supermarket', districtId);
    placeFor(engine, rivalId, 'supermarket', districtId);
  }
  return { engine, districtIds };
}

function armLift(outlets: number, defId: string, count: number): { profit: number; payback: number } {
  const control = duel(23, outlets);
  for (let d = 0; d < 400; d++) control.engine.runDay();
  const base = getPlayer(control.engine.getState()).today.profit;

  const test = duel(23, outlets);
  const state = test.engine.getState();
  let built = 0;
  for (let i = 0; i < count; i++) {
    const id = placeFor(test.engine, state.playerCompanyId, defId, test.districtIds[0]!);
    if (!id) continue;
    state.buildings[id]!.focus = 'grocery';
    built += 1;
  }
  for (let d = 0; d < 400; d++) test.engine.runDay();
  const gain = getPlayer(state).today.profit - base;
  return {
    profit: base > 0 ? gain / base : 0,
    payback: gain > 0 ? (built * BUILDING_BY_ID[defId]!.cost) / gain : Infinity,
  };
}

const days = (value: number): string => (Number.isFinite(value) ? `${Math.round(value)} gün` : '—');

const research8 = armLift(8, 'research_center', 2);
const marketing8 = armLift(8, 'marketing_office', 2);
const research4 = armLift(4, 'research_center', 2);

row('', 'kâr etkisi', 'geri ödeme');
row('Ar-Ge · 4 mağaza', pct(research4.profit), days(research4.payback));
row('Ar-Ge · 8 mağaza', pct(research8.profit), days(research8.payback));
row('Pazarlama · 8 mağaza', pct(marketing8.profit), days(marketing8.payback));

// Fiyat kırmanın hacme etkisi.
{
  const { engine } = duel(29, 16);
  const state = engine.getState();
  for (let d = 0; d < 400; d++) engine.runDay();
  const own = Object.values(state.buildings).filter(
    (b) => b.companyId === state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'outlet',
  );
  const before = own.reduce((sum, b) => sum + b.last.unitsSold, 0);
  for (const building of own) {
    building.autoPrice = false;
    building.priceMultiplier = 0.75;
  }
  for (let d = 0; d < 60; d++) engine.runDay();
  const after = own.reduce((sum, b) => sum + b.last.unitsSold, 0);
  row('Fiyatı %25 kırmak', pct(after / before - 1), 'hacim');
}

// Zincir: kartı izleyen vs YALNIZCA mağaza açan.
//
// Kontrol grubu zinciri hiç denemiyor. İlk sürümde kurup yıkıyordu ve
// bu para yaktığı için farkı şişiriyordu — kontrol grubuna ceza
// vermeyen bir A/B kurmak gerekiyor.
{
  const runChain = (follow: boolean): number => {
    const engine = new GameEngine(createNewGame({ seed: 5, companyName: 'Bench' }));
    getPlayer(engine.getState()).cash = 20_000_000;
    for (let day = 1; day <= 400; day++) {
      if (day % 5 === 0) {
        if (follow) playerStrategy(engine);
        else expandOnly(engine);
      }
      engine.runDay();
    }
    return getPlayer(engine.getState()).today.profit;
  };
  const withChain = runChain(true);
  const without = runChain(false);
  row('Zincir kurmak (tohum 5)', pct(withChain / Math.max(1, without) - 1), 'günlük kâr');
}

// ---- 4. Kalibrasyon bantları ----
head('4 · KALİBRASYON BANTLARI');
{
  const engine = new GameEngine(createNewGame({ seed: 11, companyName: 'Bench' }));
  const state = engine.getState();
  for (let d = 0; d < 20; d++) engine.runDay();
  const district = [...state.districts].sort((a, b) => districtOpportunity(b) - districtOpportunity(a))[0]!;

  const paybacks: Array<{ name: string; days: number }> = [];
  for (const def of BUILDINGS) {
    if (def.role !== 'outlet') continue;
    const estimate = estimateInvestment(state, district.id, def.id, state.playerCompanyId);
    if (estimate?.direct && Number.isFinite(estimate.paybackDays)) {
      paybacks.push({ name: def.name, days: estimate.paybackDays });
    }
  }
  paybacks.sort((a, b) => a.days - b.days);
  row(
    'Outlet geri ödemesi',
    `${Math.round(paybacks[0]?.days ?? 0)}–${Math.round(paybacks[paybacks.length - 1]?.days ?? 0)} gün`,
    `${paybacks.length} bina`,
  );
}
{
  const engine = labEngine(1);
  const state = engine.getState();
  for (let i = 0; i < 5; i++) placeFor(engine, state.playerCompanyId, 'cafe', state.districts[0]!.id);
  const industrial = state.districts.find((d) => d.archetype === 'industrial')!.id;
  for (let d = 0; d < 30; d++) engine.runDay();
  const card = chainCards(state, state.playerCompanyId)[0];
  row('Zincir geri ödemesi', card?.move ? days(card.move.paybackDays) : '—', 'kart önerisi');
  void industrial;
}
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Bench' }));
  const state = engine.getState();
  getPlayer(state).cash = 40_000_000;
  for (let day = 1; day <= 300; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  const targetId = NPC_PROFILES[0]!.id;
  const target = state.companies[targetId]!;
  const cost = sharePrice(state, targetId) * TOTAL_SHARES * 0.51;
  row('Devralma maliyeti', formatMoney(cost), `${(cost / Math.max(1, target.netWorth)).toFixed(2)}× net değer`);
}

// ---- 5. Sağlık ----
head('5 · SAĞLIK');
{
  const a = new GameEngine(createNewGame({ seed: 99, companyName: 'A' }));
  const b = new GameEngine(createNewGame({ seed: 99, companyName: 'A' }));
  for (let d = 0; d < 200; d++) {
    a.runDay();
    b.runDay();
  }
  const same = getPlayer(a.getState()).netWorth === getPlayer(b.getState()).netWorth;
  row('Determinizm', same ? 'birebir' : 'BOZUK', '');
}
{
  const engine = new GameEngine(createNewGame({ seed: 3, companyName: 'Hız' }));
  const t0 = process.hrtime.bigint();
  for (let d = 0; d < 1000; d++) engine.runDay();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  row('Simülasyon hızı', `${(1000 / (ms / 1000)).toFixed(0)} gün/sn`, `${ms.toFixed(0)} ms/1000 gün`);
}
{
  const state = finals[0]!.state;
  const broke = Object.values(state.companies).filter((c) => c.debt > c.netWorth).length;
  row('Batan şirket', String(broke), `${Object.keys(state.companies).length} şirket`);
  row('Tedarik rotası', String(supplyRoutes(state).length), 'bacak');
  const cards = competitionCards(state, state.playerCompanyId);
  row('Rekabet kartı', String(cards.length), 'kategori');
}

// ---- 6. Kapsam ----
head('6 · KAPSAM');
row('Bina tanımı', String(BUILDINGS.length), '');
row('Ürün', String(GOODS.length), `${GOODS.filter((g) => g.tier === 'consumer').length} tüketici`);
row('Kategori', String(CONSUMER_CATEGORIES.length), '');
row('Rakip profili', String(NPC_PROFILES.length), '');

const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
console.log(`\n\x1b[2mBenchmark ${elapsed.toFixed(1)} saniyede tamamlandı.\x1b[0m`);
process.exit(0);
