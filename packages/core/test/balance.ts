/**
 * Başlıksız denge simülasyonu.
 *
 * Oyunu UI olmadan yüzlerce gün koşturur ve ekonominin sağlıklı olup
 * olmadığını raporlar. Amaç, denge bozukluğunu tarayıcıyı açmadan görmek:
 * oyuncu hiç kaybedemiyorsa oyun kolay, NPC'ler hep batıyorsa rekabet yok.
 *
 * Node altında koşuyor ama `@types/node` bağımlılığı taşımıyoruz; tek
 * kullandığımız şey çıkış kodu.
 */
declare const process: { exit(code: number): never };

import {
  BUILDINGS,
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  GOODS_BY_CATEGORY,
  NPC_PROFILES,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  chainCards,
  companyRanking,
  competitionCards,
  createNewGame,
  districtOpportunity,
  estimateInvestment,
  formatMoney,
  getPlayer,
  goodShares,
  marketingLeverage,
  researchCeiling,
  routeSignature,
  shelfReach,
  supplyRoutes,
  tilePrice,
  MARKETING_CAP,
  RESEARCH_CAP,
} from '../src/index';
import { build, buyTile } from '../src/actions';
import type { GameState } from '../src/types';

/**
 * Oyuncu vekili — oyunun oyuncuya ÖNERDİĞİ oynanış.
 *
 * Önce zincir kartının hamlesi (kart "henüz erken" demiyorsa), sonra
 * fırsat lensinin gösterdiği yere mağaza. Vekilin akıllanması bilinçli:
 * harness "bilgili bir oyuncu ne yaşar" sorusunu ölçmeli, oyunun
 * tavsiyesini görmezden gelen birini değil.
 */
function playerStrategy(engine: GameEngine): void {
  if (followChainAdvice(engine)) return;
  expandOutlets(engine);
}

/** Zincir kartının önerdiği hamleyi uygular; "erken" olanı atlar. */
function followChainAdvice(engine: GameEngine): boolean {
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
    if (engine.dispatch({ type: 'BUILD', tileId: move.tileId, defId: move.defId }).ok) return true;
  }
  return false;
}

function expandOutlets(engine: GameEngine): void {
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
    // Yalnızca gerçekten satın alınabilir boş parseller.
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
  const tile = state.map.tiles.find(
    (t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId,
  )!;
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
// Üretim üniteleri imar kısıtlı olduğu için parsel de ona göre seçilir.
const engine = new GameEngine(createNewGame({ seed: 5 }));
const player = getPlayer(engine.getState());
player.cash = 50_000_000;
player.netWorth = 50_000_000;
let built = 0;
for (const def of BUILDINGS) {
  const s = engine.getState();
  const tile = s.map.tiles.find((t) => {
    if (t.kind !== 'plot' || t.ownerId || t.structureId || t.buildingId) return false;
    const district = s.districts[t.districtId]!;
    return !def.zones || def.zones.includes(district.archetype);
  });
  if (!tile) {
    console.log(`  parsel bulunamadı: ${def.id}`);
    continue;
  }
  engine.dispatch({ type: 'BUY_TILE', tileId: tile.id });
  if (engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: def.id }).ok) built++;
  else console.log(`  kurulamadı: ${def.id}`);
}
expect('katalogdaki her bina kurulabiliyor', built === BUILDINGS.length, `${built}/${BUILDINGS.length}`);

// Parsel kısıtı: şehir gerçekten kıt olmalı ama tıkanmamalı.
{
  const state = createNewGame({ seed: 3 });
  const total = state.map.tiles.length;
  const roads = state.map.tiles.filter((t) => t.kind === 'road').length;
  const civic = state.map.tiles.filter((t) => t.kind === 'civic').length;
  const occupied = state.map.tiles.filter((t) => t.kind === 'plot' && t.structureId).length;
  const vacant = state.map.tiles.filter((t) => t.kind === 'plot' && !t.structureId).length;

  console.log(
    `\nŞehir dokusu: ${roads} sokak, ${civic} kamu, ${occupied} dolu parsel, ${vacant} boş parsel (toplam ${total})`,
  );
  expect('şehrin çoğu zaten dolu', (roads + civic + occupied) / total > 0.7, `%${Math.round(((roads + civic + occupied) / total) * 100)}`);
  expect('yine de yeterli boş parsel var', vacant >= 80 && vacant <= 180, `${vacant} boş parsel`);
  expect(
    'her bölgede en az bir boş parsel var',
    state.districts.every((d) =>
      state.map.tiles.some((t) => t.districtId === d.id && t.kind === 'plot' && !t.structureId),
    ),
    'tüm bölgeler girilebilir',
  );
}

// Devralma: dolu parsel primli alınabilmeli, kamu alanı hiçbir fiyata alınmamalı.
{
  const engine2 = new GameEngine(createNewGame({ seed: 4 }));
  const s = engine2.getState();
  getPlayer(s).cash = 5_000_000;

  const occupied = s.map.tiles.find((t) => t.kind === 'plot' && t.structureId)!;
  const directBuy = engine2.dispatch({ type: 'BUY_TILE', tileId: occupied.id });
  const buyout = engine2.dispatch({ type: 'BUYOUT_TILE', tileId: occupied.id });
  expect('dolu parsel doğrudan alınamıyor', !directBuy.ok, directBuy.reason ?? '');
  expect(
    'dolu parsel devralınabiliyor',
    buyout.ok && s.map.tiles[occupied.id]!.structureId === null,
    buyout.reason ?? 'devralındı, yapı yıkıldı',
  );

  const civicTile = s.map.tiles.find((t) => t.kind === 'civic');
  if (civicTile) {
    const attempt = engine2.dispatch({ type: 'BUYOUT_TILE', tileId: civicTile.id });
    expect('kamu alanı satın alınamıyor', !attempt.ok, attempt.reason ?? '');
  }

  const roadTile = s.map.tiles.find((t) => t.kind === 'road')!;
  const roadAttempt = engine2.dispatch({ type: 'BUY_TILE', tileId: roadTile.id });
  expect('sokak satın alınamıyor', !roadAttempt.ok, roadAttempt.reason ?? '');
}

// CEO etkileri gerçekten ekonomiye dokunuyor mu?
{
  const plain = new GameEngine(createNewGame({ seed: 8, ceoId: null }));
  const developer = new GameEngine(createNewGame({ seed: 8, ceoId: 'muteahhit' }));
  const heir = new GameEngine(createNewGame({ seed: 8, ceoId: 'mirasci' }));

  const plot = plain.getState().map.tiles.find((t) => t.kind === 'plot' && !t.structureId)!;
  const basePrice = tilePrice(plain.getState(), plot.id, 'player');
  const devPrice = tilePrice(developer.getState(), plot.id, 'player');

  expect('CEO arsa pazarlığı fiyata yansıyor', devPrice < basePrice, `${basePrice} → ${devPrice}`);
  expect(
    'CEO başlangıç sermayesi farklı',
    getPlayer(heir.getState()).cash > getPlayer(plain.getState()).cash,
    `${formatMoney(getPlayer(plain.getState()).cash)} → ${formatMoney(getPlayer(heir.getState()).cash)}`,
  );
}

// ---------------------------------------------------------------- Zincir
//
// Tur 1'in asıl sınavı. Dört soruyu ayrı ayrı cevaplıyoruz:
//   1. Zincir kurmamış oyuncunun ekonomisi zincir öncesiyle aynı mı?
//   2. Zincir gerçekten marj açıyor mu, ne kadar sürede geri dönüyor?
//   3. Aşırı üretim cezalandırılıyor mu (spot fiyat kırılıyor mu)?
//   4. Tedarik krizi zinciri olmayanı vurup olanı es geçiyor mu?

console.log('\n=== Tedarik zinciri ===\n');

/** İzole senaryo: rakipsiz, olaysız, sınırsız sermaye. */
function labEngine(seed: number): GameEngine {
  const engine = new GameEngine(createNewGame({ seed, companyName: 'Lab AŞ' }));
  const state = engine.getState();
  state.flags.npcCompetition = false;
  state.flags.randomEvents = false;
  const lab = getPlayer(state);
  lab.cash = 500_000_000;
  lab.netWorth = 500_000_000;
  return engine;
}

/** Belirli bir arketipteki ilk uygun parsele istenen binayı diker. */
function place(engine: GameEngine, defId: string, archetype: string): boolean {
  const state = engine.getState();
  const tile = state.map.tiles.find((t) => {
    if (t.kind !== 'plot' || t.ownerId || t.structureId || t.buildingId) return false;
    return state.districts[t.districtId]!.archetype === archetype;
  });
  if (!tile) return false;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) return false;
  return engine.dispatch({ type: 'BUILD', tileId: tile.id, defId }).ok;
}

/** Şirketin outlet'lerinin toplam günlük satış maliyeti / satılan birim. */
function outletUnitCost(state: GameState): number {
  let cogs = 0;
  let units = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== state.playerCompanyId) continue;
    if (BUILDING_BY_ID[building.defId]?.role !== 'outlet') continue;
    cogs += building.last.cogs;
    units += building.last.unitsSold;
  }
  return units > 0 ? cogs / units : 0;
}

// ---- 1. Zincirsiz ekonomi bozulmadı ----
// Kural: bir tüketici ürününün "her şeyi pazardan alan" oyuncuya birim
// maliyeti kategorinin basePrice × costRatio değerine BİREBİR eşit olmalı.
// Bu tutmazsa zincir eklemek mevcut kalibrasyonu çöpe atmış demektir.
{
  const engine2 = labEngine(21);
  for (let i = 0; i < 5; i++) place(engine2, 'cafe', 'student');
  for (let i = 0; i < 40; i++) engine2.runDay();

  const state = engine2.getState();
  const actual = outletUnitCost(state);
  const expected = CATEGORIES.dining.basePrice * CATEGORIES.dining.costRatio;
  const drift = Math.abs(actual - expected) / expected;

  expect(
    'zincirsiz birim maliyet eski dengeyle aynı',
    drift < 0.02,
    `beklenen ${expected.toFixed(2)} ₺, gerçek ${actual.toFixed(2)} ₺ (sapma %${(drift * 100).toFixed(1)})`,
  );
}

// ---- 2. Zincir marj açıyor, ne kadar sürede dönüyor? ----
{
  const plain = labEngine(21);
  const chained = labEngine(21);

  for (const engine2 of [plain, chained]) {
    for (let i = 0; i < 5; i++) place(engine2, 'cafe', 'student');
  }
  place(chained, 'coffee_roastery', 'industrial');
  place(chained, 'coffee_estate', 'industrial');

  for (let i = 0; i < 120; i++) {
    plain.runDay();
    chained.runDay();
  }

  const plainProfit = getPlayer(plain.getState()).today.profit;
  const chainedProfit = getPlayer(chained.getState()).today.profit;
  const plainCost = outletUnitCost(plain.getState());
  const chainedCost = outletUnitCost(chained.getState());

  const investment = BUILDING_BY_ID['coffee_roastery']!.cost + BUILDING_BY_ID['coffee_estate']!.cost;
  const gain = chainedProfit - plainProfit;
  const payback = gain > 0 ? investment / gain : Infinity;

  console.log(
    `  5 kafe          → günlük kâr ${formatMoney(plainProfit).padStart(11)} | birim maliyet ${plainCost.toFixed(2)} ₺`,
  );
  console.log(
    `  5 kafe + zincir → günlük kâr ${formatMoney(chainedProfit).padStart(11)} | birim maliyet ${chainedCost.toFixed(2)} ₺`,
  );
  console.log(
    `  zincir yatırımı ${formatMoney(investment)} · günlük kazanç ${formatMoney(gain)} · geri ödeme ${payback.toFixed(0)} gün\n`,
  );

  expect('zincir birim maliyeti düşürüyor', chainedCost < plainCost * 0.6, `${plainCost.toFixed(2)} → ${chainedCost.toFixed(2)} ₺`);
  expect('zincir günlük kârı artırıyor', gain > 0, `+${formatMoney(gain)}/gün`);
  expect(
    'zincirin geri ödemesi makul (100–260 gün)',
    payback >= 100 && payback <= 260,
    `${payback.toFixed(0)} gün`,
  );
}

// ---- 3. Aşırı üretimin cezası var mı? ----
// Hiç mağazası olmadan üç kavurma tesisi kuran oyuncu, ürettiğini pazara
// dökmek zorunda kalır ve fiyatı kendi eliyle kırar.
{
  const engine2 = labEngine(33);
  const before = engine2.getState().market.spot['roasted_coffee']!;
  for (let i = 0; i < 3; i++) place(engine2, 'coffee_roastery', 'industrial');
  for (let i = 0; i < 90; i++) engine2.runDay();
  const after = engine2.getState().market.spot['roasted_coffee']!;

  expect(
    'aşırı üretim spot fiyatı kırıyor',
    after < before * 0.95,
    `${before.toFixed(2)} → ${after.toFixed(2)} ₺ (%${(((after - before) / before) * 100).toFixed(1)})`,
  );
}

// ---- 4. Tedarik krizi asimetrisi ----
// Kahve rekoltesi kötüyse pazardan alan zamma yakalanır, kendi bahçesi
// olan aynı maliyetle üretmeye devam eder. Zincirin asıl vaadi bu.
{
  const buyer = labEngine(44);
  const grower = labEngine(44);

  for (const engine2 of [buyer, grower]) {
    for (let i = 0; i < 5; i++) place(engine2, 'cafe', 'student');
  }
  place(grower, 'coffee_roastery', 'industrial');
  place(grower, 'coffee_estate', 'industrial');

  for (let i = 0; i < 40; i++) {
    buyer.runDay();
    grower.runDay();
  }

  const calmBuyer = getPlayer(buyer.getState()).unitCost['coffee']!;
  const calmGrower = getPlayer(grower.getState()).unitCost['coffee']!;

  // Krizi zorla başlat; rastgeleliğe güvenmeyelim.
  for (const engine2 of [buyer, grower]) {
    engine2.getState().activeEvents.push({
      defId: 'coffee_blight',
      startedDay: engine2.getState().time.day,
      remainingDays: 60,
    });
  }
  for (let i = 0; i < 40; i++) {
    buyer.runDay();
    grower.runDay();
  }

  const crisisBuyer = getPlayer(buyer.getState()).unitCost['coffee']!;
  const crisisGrower = getPlayer(grower.getState()).unitCost['coffee']!;

  console.log(
    `  kriz öncesi → pazardan alan ${calmBuyer.toFixed(2)} ₺ | kendi üreten ${calmGrower.toFixed(2)} ₺`,
  );
  console.log(
    `  kriz anında → pazardan alan ${crisisBuyer.toFixed(2)} ₺ | kendi üreten ${crisisGrower.toFixed(2)} ₺\n`,
  );

  expect(
    'tedarik krizi pazardan alanı vuruyor',
    crisisBuyer > calmBuyer * 1.1,
    `${calmBuyer.toFixed(2)} → ${crisisBuyer.toFixed(2)} ₺`,
  );
  expect(
    'tedarik krizi kendi üretene dokunmuyor',
    Math.abs(crisisGrower - calmGrower) / calmGrower < 0.05,
    `${calmGrower.toFixed(2)} → ${crisisGrower.toFixed(2)} ₺`,
  );
}

// ---- 5. Zincir kartı ----
// Oyuncunun gördüğü katman motorla aynı şeyi söylemeli. Kart yanlış
// sayı gösteriyorsa oyun oyuncuya yalan söylüyor demektir.
{
  const engine2 = labEngine(21);
  for (let i = 0; i < 5; i++) place(engine2, 'cafe', 'student');
  for (let i = 0; i < 40; i++) engine2.runDay();

  const before = chainCards(engine2.getState(), engine2.getState().playerCompanyId);
  const coffee = before.find((card) => card.goodId === 'coffee');

  expect('zincir kartı sattığın ürün için çıkıyor', coffee !== undefined, `${before.length} kart`);

  if (coffee) {
    // Kart yalnızca sattığın ürünleri listeler.
    expect(
      'zincir kartı yalnızca satılan ürünü listeliyor',
      before.length === 1,
      before.map((c) => c.goodName).join(', '),
    );
    expect(
      'kart birim maliyeti motorunkiyle aynı',
      Math.abs(coffee.unitCost - outletUnitCost(engine2.getState())) < 0.01,
      `kart ${coffee.unitCost.toFixed(2)} ₺ / motor ${outletUnitCost(engine2.getState()).toFixed(2)} ₺`,
    );
    expect('zincirsiz kartta dört yuva var', coffee.slots.length === 4, `${coffee.slots.length} yuva`);
    expect(
      'zincirsiz kartta üretim halkaları pazardan',
      coffee.slots[0]!.state === 'market' && coffee.slots[1]!.state === 'market',
      `${coffee.slots[0]!.stateLabel} / ${coffee.slots[1]!.stateLabel}`,
    );

    // Kartın önerdiği hamle, zincirin ilk EKSİK halkası olmalı: kafeler
    // kavrulmuş kahve tüketiyor, henüz kimse çekirdek tüketmiyor.
    expect(
      'kart doğru hamleyi öneriyor (önce kavurma)',
      coffee.move?.defId === 'coffee_roastery',
      coffee.move ? `${coffee.move.name} · ${Math.round(coffee.move.paybackDays)} gün` : 'hamle yok',
    );
    expect(
      'önerilen hamle marjı yükseltiyor',
      (coffee.move?.projectedMargin ?? 0) > coffee.margin,
      `%${Math.round(coffee.margin * 100)} → %${Math.round((coffee.move?.projectedMargin ?? 0) * 100)}`,
    );
  }

  // Hamleyi uygula: kart bir sonraki halkaya geçmeli.
  place(engine2, 'coffee_roastery', 'industrial');
  for (let i = 0; i < 40; i++) engine2.runDay();
  const mid = chainCards(engine2.getState(), engine2.getState().playerCompanyId)[0]!;

  expect('kavurma kurulunca yuva "Sende" oluyor', mid.slots[1]!.state === 'own', mid.slots[1]!.stateLabel);
  expect(
    'kart sıradaki halkayı öneriyor (bahçe)',
    mid.move?.defId === 'coffee_estate',
    mid.move ? mid.move.name : 'hamle yok',
  );
  expect(
    'kartın vaat ettiği marj gerçekleşti',
    mid.margin > (coffee?.margin ?? 0),
    `%${Math.round((coffee?.margin ?? 0) * 100)} → %${Math.round(mid.margin * 100)}`,
  );

  // Zinciri tamamla: önerilecek hamle kalmamalı.
  place(engine2, 'coffee_estate', 'industrial');
  for (let i = 0; i < 40; i++) engine2.runDay();
  const full = chainCards(engine2.getState(), engine2.getState().playerCompanyId)[0]!;

  expect(
    'zincir tamamlanınca hamle önerisi susuyor',
    full.move === null,
    full.move ? full.move.name : 'öneri yok',
  );
  expect(
    'tam zincirde iki üretim halkası da Sende',
    full.slots[0]!.state === 'own' && full.slots[1]!.state === 'own',
    `${full.slots[0]!.stateLabel} / ${full.slots[1]!.stateLabel}`,
  );

  console.log(
    `  kart marjı: zincirsiz %${Math.round((coffee?.margin ?? 0) * 100)}` +
      ` → kavurma %${Math.round(mid.margin * 100)}` +
      ` → tam zincir %${Math.round(full.margin * 100)}\n`,
  );
}

// Ölçek uyarısı: tek kafeyle kavurma tesisi kurmak teknik olarak mümkün
// ama kapasitenin altıda biri dolar. Kart bunu gizlemek yerine söylemeli.
{
  const small = labEngine(63);
  place(small, 'cafe', 'student');
  for (let i = 0; i < 40; i++) small.runDay();
  const card = chainCards(small.getState(), small.getState().playerCompanyId)[0]!;

  expect(
    'tek mağazada hamle "henüz erken" işaretleniyor',
    card.move?.premature === true,
    card.move
      ? `kapasitenin %${Math.round((card.move.utilisation ?? 0) * 100)}'i dolar, ${Math.round(card.move.paybackDays)} gün`
      : 'hamle yok',
  );
  expect(
    'erken hamlenin gerekçesi ölçeği açıklıyor',
    (card.move?.reason ?? '').includes('kapasitenin'),
    card.move?.reason ?? '',
  );
}

// ---- 6. Rakipler de zincir kuruyor mu? ----
// Tur 1'in C parçası. Rakipler zincir kurmazsa oyuncu, kurduğu anda
// kalıcı ve tek taraflı bir maliyet avantajı elde eder — yani zincir
// bir rekabet ekseni değil, bedava bir kazanç olur.
{
  const engine2 = new GameEngine(createNewGame({ seed: 1, companyName: 'Test AŞ' }));
  for (let day = 1; day <= 400; day++) {
    if (day % 5 === 0) playerStrategy(engine2);
    engine2.runDay();
  }
  const s = engine2.getState();

  const byProfile = new Map<string, { name: string; trait: string; chain: number; netWorth: number; debt: number }>();
  for (const profile of NPC_PROFILES) {
    const company = s.companies[profile.id];
    if (!company) continue;
    const chain = Object.values(s.buildings).filter((b) => {
      if (b.companyId !== profile.id) return false;
      const def = BUILDING_BY_ID[b.defId];
      return def?.role === 'extract' || def?.role === 'process';
    }).length;
    byProfile.set(profile.id, {
      name: profile.name,
      trait: profile.trait,
      chain,
      netWorth: company.netWorth,
      debt: company.debt,
    });
  }

  console.log('\n--- rakiplerin zincir yatırımı (400 gün) ---');
  for (const row of byProfile.values()) {
    console.log(
      `  ${row.name.padEnd(16)} ${row.trait.padEnd(14)} zincir ${String(row.chain).padStart(2)}` +
        ` · değer ${formatMoney(row.netWorth).padStart(11)} · borç ${formatMoney(row.debt)}`,
    );
  }

  const builders = [...byProfile.values()].filter((row) => row.chain > 0);
  expect(
    'rakipler zincir kuruyor',
    builders.length >= 2,
    `${builders.length}/${byProfile.size} rakip zincir kurdu`,
  );
  expect(
    'arsa spekülatörü zincire girmiyor (kişilik ayrışıyor)',
    (byProfile.get('atlas_yapi')?.chain ?? 0) === 0,
    `${byProfile.get('atlas_yapi')?.chain ?? 0} ünite`,
  );
  expect(
    'zincir yatırımı rakipleri batırmıyor',
    [...byProfile.values()].every((row) => row.debt < Math.max(200_000, row.netWorth)),
    [...byProfile.values()].map((r) => `${r.name}: ${formatMoney(r.debt)}`).join(' · '),
  );
}

// ---- 7. Zinciri izlemek gerçekten kazandırıyor mu? ----
// Kartın tavsiyesi işe yaramıyorsa oyun oyuncuyu yanlış yönlendiriyor
// demektir. Kontrollü karşılaştırma: aynı seed, aynı mağaza stratejisi,
// tek fark zincir kartını izleyip izlememek.
{
  function runStrategy(seed: number, useChain: boolean): { netWorth: number; profit: number; chain: number } {
    const engine2 = new GameEngine(createNewGame({ seed, companyName: 'Test AŞ' }));
    for (let day = 1; day <= 500; day++) {
      if (day % 5 === 0) {
        if (!(useChain && followChainAdvice(engine2))) expandOutlets(engine2);
      }
      engine2.runDay();
    }
    const s = engine2.getState();
    const player = getPlayer(s);
    const chain = Object.values(s.buildings).filter((b) => {
      if (b.companyId !== player.id) return false;
      const def = BUILDING_BY_ID[b.defId];
      return def?.role === 'extract' || def?.role === 'process';
    }).length;
    return { netWorth: player.netWorth, profit: player.today.profit, chain };
  }

  console.log('\n--- zincir kartını izleyen vs izlemeyen (500 gün) ---');
  let plainProfit = 0;
  let chainProfit = 0;
  let wins = 0;

  for (const seed of [1, 7, 42]) {
    const plain = runStrategy(seed, false);
    const chained = runStrategy(seed, true);
    plainProfit += plain.profit;
    chainProfit += chained.profit;
    if (chained.profit > plain.profit) wins++;
    console.log(
      `  seed ${String(seed).padStart(2)} | zincirsiz ${formatMoney(plain.netWorth).padStart(11)} · ${formatMoney(plain.profit).padStart(9)}/gün` +
        ` | zincirli ${formatMoney(chained.netWorth).padStart(11)} · ${formatMoney(chained.profit).padStart(9)}/gün · ${chained.chain} ünite`,
    );
  }

  const gain = plainProfit > 0 ? chainProfit / plainProfit - 1 : 0;
  expect(
    'zincir kartını izlemek günlük kârı artırıyor',
    gain > 0.1,
    `ortalama %${Math.round(gain * 100)} daha yüksek günlük kâr`,
  );
  expect(
    'kazanç seed\'e bağlı bir tesadüf değil',
    wins === 3,
    `${wins}/3 seed'de zincirli strateji önde`,
  );
}

// ---- 8. İkinci ürün: raf seçimi gerçek bir karar mı? ----
// Denge kimliği yüzünden aynı kategorideki iki ürünün birim maliyeti
// AYNIDIR. Karar ancak ürünler bölgeye göre ayrışırsa doğar — ve her
// ürünün en az bir bölgede kazanması gerekir, yoksa seçim sahtedir.
{
  console.log('\n--- ürünlerin bölgesel üstünlüğü ---');
  let fake = 0;

  for (const categoryId of CONSUMER_CATEGORIES) {
    const goods = GOODS_BY_CATEGORY[categoryId] ?? [];
    if (goods.length < 2) continue;

    const wins = new Map<string, number>();
    let spread = 0;
    for (const archetype of Object.keys(DISTRICT_ARCHETYPES) as Array<keyof typeof DISTRICT_ARCHETYPES>) {
      const rows = goodShares(archetype, categoryId).slice().sort((a, b) => b.share - a.share);
      wins.set(rows[0]!.good.id, (wins.get(rows[0]!.good.id) ?? 0) + 1);
      spread = Math.max(spread, rows[0]!.share - rows[rows.length - 1]!.share);
    }

    const never = goods.filter((good) => !wins.has(good.id));
    if (never.length > 0) fake++;
    console.log(
      `  ${CATEGORIES[categoryId].name.padEnd(12)} ${goods
        .map((g) => `${g.name} ${wins.get(g.id) ?? 0} bölge`)
        .join(' · ')} · en geniş fark %${Math.round(spread * 100)}`,
    );
  }

  expect('her ürün en az bir bölgede kazanıyor', fake === 0, `${fake} kategoride sahte seçim`);

  // Bölge payları normalize edilir: ikinci ürün eklemek kategorinin
  // TOPLAM talebini değiştirmemeli, yoksa mevcut kalibrasyon bozulurdu.
  let worst = 0;
  for (const categoryId of CONSUMER_CATEGORIES) {
    for (const archetype of Object.keys(DISTRICT_ARCHETYPES) as Array<keyof typeof DISTRICT_ARCHETYPES>) {
      const rows = goodShares(archetype, categoryId);
      if (rows.length === 0) continue;
      const total = rows.reduce((sum, row) => sum + row.share, 0);
      worst = Math.max(worst, Math.abs(total - 1));
    }
  }
  expect('paylar normalize (kategori talebi korunuyor)', worst < 1e-9, `en büyük sapma ${worst.toExponential(1)}`);
}

// ---- 9. Raf yuvaları ----
{
  const engine2 = labEngine(77);
  // Süpermarket üç yuvalı: kategorinin tamamını toplar.
  // Bakkal tek yuvalı: uzmanlaşmak zorunda, diğerini rakibe bırakır.
  place(engine2, 'supermarket', 'mid_residential');
  place(engine2, 'corner_shop', 'mid_residential');
  for (let i = 0; i < 20; i++) engine2.runDay();

  const s = engine2.getState();
  const own = Object.values(s.buildings).filter((b) => b.companyId === s.playerCompanyId);
  const market = own.find((b) => b.defId === 'supermarket')!;
  const shop = own.find((b) => b.defId === 'corner_shop')!;
  const archetype = s.districts[market.districtId]!.archetype;

  expect(
    'çok yuvalı mağaza kategorinin tamamını taşıyor',
    market.stocked.length === 2,
    market.stocked.join(', '),
  );
  expect('tek yuvalı dükkân tek ürün taşıyor', shop.stocked.length === 1, shop.stocked.join(', '));
  expect(
    'tek yuvalı dükkân talebin bir kısmını rakibe bırakıyor',
    shelfReach(archetype, 'grocery', shop.stocked) < 0.95,
    `erişim %${Math.round(shelfReach(archetype, 'grocery', shop.stocked) * 100)}`,
  );
  expect(
    'çok yuvalı mağaza talebin tamamına erişiyor',
    Math.abs(shelfReach(archetype, 'grocery', market.stocked) - 1) < 1e-9,
    'erişim %100',
  );

  // Raf değiştirme komutu: yuva sayısını aşamaz, boş bırakılamaz.
  const both = GOODS_BY_CATEGORY.grocery.map((g) => g.id);
  expect(
    'bakkal iki ürünü birden rafa koyamıyor',
    !engine2.dispatch({ type: 'SET_STOCK', buildingId: shop.id, goodIds: both }).ok,
    'yuva sınırı uygulanıyor',
  );
  expect(
    'raf boş bırakılamıyor',
    !engine2.dispatch({ type: 'SET_STOCK', buildingId: shop.id, goodIds: [] }).ok,
    'en az bir ürün gerekli',
  );
  const other = both.find((id) => id !== shop.stocked[0])!;
  expect(
    'raf değiştirilebiliyor',
    engine2.dispatch({ type: 'SET_STOCK', buildingId: shop.id, goodIds: [other] }).ok &&
      s.buildings[shop.id]!.stocked[0] === other,
    `${other} rafa kondu`,
  );
}

// ---- 10. Pazar payı ve sıra bağımsızlığı ----
// Bir outlet komşu bölgelere de satar. Kapasiteyi bölgeleri sırayla
// gezerek harcarsak hangi bölgenin doyacağını haritadaki İNDEKS SIRASI
// belirler — kendi mahallesindeki süpermarket tüm kapasitesini komşuya
// satıp kendi bölgesini "%100 boş" bırakabiliyordu. Kapasite artık
// bölgelere talep oranında ayrılıyor; bu iki kontrol o düzeltmeyi tutuyor.
{
  const engine2 = new GameEngine(createNewGame({ seed: 31, companyName: 'Test AŞ' }));
  for (let day = 1; day <= 220; day++) {
    if (day % 5 === 0) playerStrategy(engine2);
    engine2.runDay();
  }
  const s = engine2.getState();

  let worstShare = 0;

  for (const district of s.districts) {
    for (const categoryId of CONSUMER_CATEGORIES) {
      let shareSum = 0;
      for (const building of Object.values(s.buildings)) {
        if (building.districtId !== district.id) continue;
        const def = BUILDING_BY_ID[building.defId];
        if (def?.role !== 'outlet' || def.category !== categoryId) continue;
        shareSum += building.last.share;
      }
      if (shareSum > 0) worstShare = Math.max(worstShare, shareSum);
    }
  }

  // Kapasite artık bölgelere PARÇALI dağıtılıyor; parçaların toplamı
  // kapasiteyi aşarsa bir outlet birden çok bölgeye aynı malı satar.
  let worstFill = 0;
  for (const building of Object.values(s.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet' || def.capacity <= 0) continue;
    worstFill = Math.max(worstFill, building.last.unitsSold / def.capacity);
  }

  expect(
    'bölge payları toplamı %100\'ü aşmıyor',
    worstShare <= 1.001,
    `en yüksek toplam %${Math.round(worstShare * 100)}`,
  );
  expect(
    'hiçbir outlet kapasitesinden fazla satmıyor',
    worstFill <= 1.001,
    `en yüksek doluluk %${Math.round(worstFill * 100)}`,
  );
}

// ---- 11. İmar kısıtı ----
{
  const engine2 = labEngine(55);
  const state = engine2.getState();

  const downtown = state.districts.find((d) => d.archetype === 'downtown')!;
  const industrial = state.districts.find((d) => d.archetype === 'industrial')!;

  const cityTile = state.map.tiles.find(
    (t) => t.districtId === downtown.id && t.kind === 'plot' && !t.structureId && !t.ownerId,
  )!;
  engine2.dispatch({ type: 'BUY_TILE', tileId: cityTile.id });
  const cityAttempt = engine2.dispatch({ type: 'BUILD', tileId: cityTile.id, defId: 'coffee_estate' });

  expect('merkeze hammadde ünitesi kurulamıyor', !cityAttempt.ok, cityAttempt.reason ?? '');
  expect(
    'sanayiye hammadde ünitesi kurulabiliyor',
    place(engine2, 'coffee_estate', 'industrial'),
    `${industrial.name} bölgesine kuruldu`,
  );
}

// ---- 12. Tedarik rotaları (kamyonların izlediği bacaklar) ----
//
// Kamyonlar görsel bir katman ama besledikleri veri kural işi: yanlış
// bacak, oyuncuya yanlış zincir gösterir. Ekranı açmadan burada
// doğruluyoruz.
{
  const engine2 = labEngine(61);
  const state = engine2.getState();

  expect('zincirsiz şehirde rota yok', supplyRoutes(state).length === 0, `${supplyRoutes(state).length} bacak`);

  // Zincirsiz mağaza: tesis olmadığı için kamyon çıkmamalı.
  place(engine2, 'corner_shop', 'mid_residential');
  expect(
    'tesissiz mağazaya kamyon gitmiyor',
    supplyRoutes(state).length === 0,
    `${supplyRoutes(state).length} bacak`,
  );

  // Tam zincir: buğday çiftliği + değirmen + mağaza.
  place(engine2, 'wheat_farm', 'industrial');
  place(engine2, 'flour_mill', 'industrial');
  const withChain = supplyRoutes(state);

  const rawLegs = withChain.filter((leg) => leg.kind === 'raw');
  const deliveryLegs = withChain.filter((leg) => leg.kind === 'delivery');
  expect('çiftlikten tesise bacak var', rawLegs.length === 1, `${rawLegs.length} hammadde bacağı`);
  expect('tesisten mağazaya bacak var', deliveryLegs.length === 1, `${deliveryLegs.length} teslimat bacağı`);
  expect(
    'hammadde bacağı buğday taşıyor',
    rawLegs[0]?.goodId === 'wheat',
    rawLegs[0]?.goodId ?? '—',
  );
  expect(
    'teslimat bacağı raftaki ürünü taşıyor',
    deliveryLegs[0]?.goodId === 'bread',
    deliveryLegs[0]?.goodId ?? '—',
  );
  expect(
    'her bacağın iki ucu farklı',
    withChain.every((leg) => leg.fromTileId !== leg.toTileId),
    `${withChain.length} bacak`,
  );

  // Depo devreye girince akış onun üzerinden geçmeli: tesis → depo → mağaza.
  const outletTile = state.map.tiles[deliveryLegs[0]!.toTileId]!;
  const depotTile = state.map.tiles.find(
    (t) =>
      t.kind === 'plot' &&
      !t.ownerId &&
      !t.structureId &&
      !t.buildingId &&
      Math.abs(t.x - outletTile.x) + Math.abs(t.y - outletTile.y) <= 4,
  );
  if (depotTile) {
    engine2.dispatch({ type: 'BUY_TILE', tileId: depotTile.id });
    engine2.dispatch({ type: 'BUILD', tileId: depotTile.id, defId: 'warehouse' });
    const withDepot = supplyRoutes(state);
    const hub = withDepot.filter((leg) => leg.kind === 'intermediate');
    const toOutlet = withDepot.filter(
      (leg) => leg.kind === 'delivery' && leg.toTileId === outletTile.id,
    );
    expect('depo varsa tesisten depoya bacak açılıyor', hub.length === 1, `${hub.length} ara bacak`);
    expect(
      'mağazaya giden kamyon artık depodan çıkıyor',
      toOutlet.length === 1 && toOutlet[0]!.fromTileId === depotTile.id,
      toOutlet.length === 1 ? `kaynak parsel ${toOutlet[0]!.fromTileId}` : `${toOutlet.length} bacak`,
    );
  }

  // Determinizm: çizim katmanı imzaya bakıp kamyonları koruyor, imza
  // aynı state'te oynarsa kamyonlar her gün ışınlanır.
  const first = routeSignature(supplyRoutes(state));
  const second = routeSignature(supplyRoutes(state));
  expect('rota imzası deterministik', first === second, `${first.split('|').length} bacak`);
}

// ---- 13. Rotalar rekabet altında da makul mü? ----
{
  const engine2 = new GameEngine(createNewGame({ seed: 71, companyName: 'Rota AŞ' }));
  const player = getPlayer(engine2.getState());
  player.cash = 40_000_000;
  for (let day = 1; day <= 400; day++) {
    if (day % 5 === 0) playerStrategy(engine2);
    engine2.runDay();
  }
  const state = engine2.getState();
  const legs = supplyRoutes(state);

  expect('gelişmiş şehirde rotalar oluşuyor', legs.length > 0, `${legs.length} bacak`);
  expect('rota sayısı tavanı aşmıyor', legs.length <= 64, `${legs.length} bacak`);

  const playerLegs = legs.filter((leg) => leg.companyId === state.playerCompanyId);
  const rivalLegs = legs.filter((leg) => leg.companyId !== state.playerCompanyId);
  // Tavan bağlarsa kırpılan taraf rakip olmalı — kendi lojistiğin her
  // zaman görünür kalsın diye oyuncu başa sıralanıyor.
  expect(
    'oyuncunun bacakları listenin başında',
    legs.slice(0, playerLegs.length).every((leg) => leg.companyId === state.playerCompanyId),
    `${playerLegs.length} oyuncu / ${rivalLegs.length} rakip bacağı`,
  );

  const chainOwners = new Set(
    Object.values(state.buildings)
      .filter((b) => BUILDING_BY_ID[b.defId]?.role === 'process')
      .map((b) => b.companyId),
  );
  expect(
    'yalnızca tesisi olan şirketin kamyonu var',
    legs.every((leg) => chainOwners.has(leg.companyId)),
    `${chainOwners.size} tesisli şirket`,
  );
}

// ================================================================ Tur 2
//
// Rekabet kolları: Ar-Ge (kalite) ve pazarlama (marka). Sorular:
//   1. Kolları kullanmayan oyuncunun ekonomisi Tur 1 ile aynı mı?
//   2. Ar-Ge gerçekten rakipten pay alıyor mu?
//   3. Ar-Ge boş pazarda değersiz mi (tasarımın iddiası)?
//   4. Tavan ve azalan verim görünür mü, prim geri eriyor mu?
//   5. Pazarlama düşük payda daha mı çok işe yarıyor?

console.log('\n=== Rekabet kolları ===\n');

const RIVAL_ID = NPC_PROFILES[0]!.id;

/** Belirli bir ŞİRKET için parsel alıp bina diker. */
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

/**
 * Kontrollü düello kurar: oyuncunun ve rakibin AYNI bölgelerde eşit
 * sayıda süpermarketi. Rakip isteğe bağlı — "boş pazar" senaryosu için
 * kapatılıyor.
 *
 * İki tasarım kararı da bir hatadan çıktı:
 *
 * 1. Mağaza SÜPERMARKET (1400 kapasite), bakkal değil. Bakkalla kurulan
 *    ilk sürüm hiçbir şey ölçmüyordu: iki taraf da kapasitesinin tamamını
 *    satıyordu, yani pay yarışı hiç yaşanmıyordu. Çekiciliğin bir işe
 *    yaraması için toplam kapasitenin talebi AŞMASI gerekiyor.
 * 2. Bölgeler NÜFUSA GÖRE ARTAN sırayla seçiliyor. En kalabalık bölgede
 *    (8155 birim talep) tek bir süpermarket bile kapasite sınırında
 *    kalıyor; küçük bölgelerde ise kapasite talebi rahatça aşıyor ve
 *    kazananı gerçekten çekicilik belirliyor.
 */
function duel(seed: number, outlets: number, withRival: boolean): { engine: GameEngine; districtIds: number[] } {
  const engine = labEngine(seed);
  const state = engine.getState();
  const rival = state.companies[RIVAL_ID]!;
  rival.cash = 500_000_000;
  rival.netWorth = 500_000_000;

  const order = [...state.districts].sort((a, b) => a.population - b.population).map((d) => d.id);
  const districtIds: number[] = [];

  for (let i = 0; i < outlets; i++) {
    const districtId = order[i % order.length]!;
    districtIds.push(districtId);
    placeFor(engine, state.playerCompanyId, 'supermarket', districtId);
    if (withRival) placeFor(engine, RIVAL_ID, 'supermarket', districtId);
  }
  return { engine, districtIds };
}

/** Oyuncunun bir kategorideki günlük satış birimi. */
function unitsIn(state: GameState, companyId: string, category: string): number {
  let units = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    if (BUILDING_BY_ID[building.defId]?.category !== category) continue;
    units += building.last.unitsSold;
  }
  return units;
}

/** Şirketin outlet'lerinin ortalama fiyat çarpanı. */
function avgPrice(state: GameState, companyId: string): number {
  let total = 0;
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    if (BUILDING_BY_ID[building.defId]?.role !== 'outlet') continue;
    total += building.priceMultiplier;
    count++;
  }
  return count > 0 ? total / count : 1;
}

/** Kategoriye atanmış N Ar-Ge merkezi kurar. */
function addLabs(engine: GameEngine, companyId: string, districtId: number, count: number, category: CategoryId): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = placeFor(engine, companyId, 'research_center', districtId);
    if (!id) continue;
    engine.getState().buildings[id]!.focus = category;
    ids.push(id);
  }
  return ids;
}

// ---- 1. Denge kimliği: kol kullanılmadığında hiçbir şey değişmiyor ----
{
  const { engine } = duel(11, 4, true);
  for (let day = 0; day < 200; day++) engine.runDay();
  const state = engine.getState();

  let maxResearch = 0;
  let maxLeverage = 0;
  for (const company of Object.values(state.companies)) {
    for (const category of CONSUMER_CATEGORIES) {
      maxResearch = Math.max(maxResearch, Math.abs(company.research[category] ?? 0));
      maxLeverage = Math.max(maxLeverage, marketingLeverage(state, company.id, category));
    }
  }

  // Her iki katkı da TOPLAMSAL ve tabanı sıfır. İkisi de tam sıfırsa
  // kalite ve marka formülleri Tur 1'deki hallerine indirgeniyor demektir.
  expect('Ar-Ge merkezi yokken prim tam sıfır', maxResearch === 0, `en yüksek ${maxResearch}`);
  expect('pazarlama ofisi yokken kaldıraç tam sıfır', maxLeverage === 0, `en yüksek ${maxLeverage}`);
}

// ---- 2. Arz-kıt pazar: kol MARJDAN ödüyor ----
//
// Tasarımın ilk hali kaliteyi yalnızca paya bağlıyordu. Ölçüm onu
// çürüttü: bu şehirde talep kronik olarak kapasiteyi aştığı için herkes
// zaten kapasitesinin tamamını satıyor, pay yarışı hiç yaşanmıyor.
// Kolun karşılığı burada hacim değil FİYAT.
{
  const control = duel(11, 4, true);
  for (let day = 0; day < 400; day++) control.engine.runDay();
  const baseState = control.engine.getState();
  const baseUnits = unitsIn(baseState, baseState.playerCompanyId, 'grocery');
  const baseProfit = getPlayer(baseState).today.profit;
  const basePrice = avgPrice(baseState, baseState.playerCompanyId);

  const test = duel(11, 4, true);
  addLabs(test.engine, test.engine.getState().playerCompanyId, test.districtIds[0]!, 3, 'grocery');
  for (let day = 0; day < 400; day++) test.engine.runDay();
  const testState = test.engine.getState();
  const units = unitsIn(testState, testState.playerCompanyId, 'grocery');
  const profit = getPlayer(testState).today.profit;
  const price = avgPrice(testState, testState.playerCompanyId);

  console.log(
    `  arz-kıt pazar (4 süpermarket/taraf): fiyat ×${basePrice.toFixed(2)} → ×${price.toFixed(2)}, ` +
      `kâr ${formatMoney(baseProfit)} → ${formatMoney(profit)} (%${((profit / baseProfit - 1) * 100).toFixed(0)}), ` +
      `hacim %${((units / baseUnits - 1) * 100).toFixed(1)}`,
  );
  expect('arz-kıt pazarda Ar-Ge kâr getiriyor', profit > baseProfit * 1.08,
    `+%${((profit / baseProfit - 1) * 100).toFixed(0)}`);
  expect('kazanç FİYATTAN geliyor, hacimden değil',
    price > basePrice * 1.05 && Math.abs(units / baseUnits - 1) < 0.02,
    `fiyat +%${((price / basePrice - 1) * 100).toFixed(0)}, hacim +%${((units / baseUnits - 1) * 100).toFixed(1)}`);
  expect(
    'Ar-Ge primi tavanına yaklaşmış',
    (getPlayer(testState).research.grocery ?? 0) > RESEARCH_CAP * 0.9,
    `prim ${(getPlayer(testState).research.grocery ?? 0).toFixed(3)}`,
  );
}

// ---- 3. Doymuş pazar: kol HACİMDEN ödüyor ----
//
// Kapasite talebe yaklaştıkça fiyat primi kapanıyor (kıtlık kalmıyor) ve
// kol asıl kanalına, çekiciliğe dönüyor. Aynı mekanik, pazarın durumuna
// göre iki farklı ödeme biçimi.
{
  const control = duel(31, 20, true);
  for (let day = 0; day < 300; day++) control.engine.runDay();
  const baseState = control.engine.getState();
  const baseUnits = unitsIn(baseState, baseState.playerCompanyId, 'grocery');
  let unmet = 0;
  for (const district of baseState.districts) unmet += district.unmet.grocery ?? 0;
  unmet /= baseState.districts.length;

  const test = duel(31, 20, true);
  addLabs(test.engine, test.engine.getState().playerCompanyId, test.districtIds[0]!, 3, 'grocery');
  for (let day = 0; day < 300; day++) test.engine.runDay();
  const testState = test.engine.getState();
  const units = unitsIn(testState, testState.playerCompanyId, 'grocery');

  console.log(
    `  doymuş pazar (20 süpermarket/taraf, boş talep %${(unmet * 100).toFixed(0)}): ` +
      `${baseUnits.toFixed(0)} → ${units.toFixed(0)} birim (%${((units / baseUnits - 1) * 100).toFixed(1)})`,
  );
  expect('pazar gerçekten doymuş', unmet < 0.3, `boş talep %${(unmet * 100).toFixed(0)}`);
  expect('doymuş pazarda Ar-Ge hacim alıyor', units > baseUnits * 1.012,
    `+%${((units / baseUnits - 1) * 100).toFixed(1)}`);
}

// ---- 4. Tavan, azalan verim ve erime ----
{
  const { engine, districtIds } = duel(11, 2, true);
  const districtId = districtIds[0]!;
  const state = engine.getState();
  const playerId = state.playerCompanyId;

  const one = addLabs(engine, playerId, districtId, 1, 'grocery');
  expect('bir merkez tavanı 0,12', Math.abs(researchCeiling(state, playerId, 'grocery') - 0.12) < 1e-9,
    researchCeiling(state, playerId, 'grocery').toFixed(3));

  addLabs(engine, playerId, districtId, 1, 'grocery');
  expect('iki merkez tavanı 0,24', Math.abs(researchCeiling(state, playerId, 'grocery') - 0.24) < 1e-9,
    researchCeiling(state, playerId, 'grocery').toFixed(3));

  addLabs(engine, playerId, districtId, 2, 'grocery');
  expect('tavan 0,30 ile kesiliyor (azalan verim)',
    Math.abs(researchCeiling(state, playerId, 'grocery') - RESEARCH_CAP) < 1e-9,
    researchCeiling(state, playerId, 'grocery').toFixed(3));

  for (let day = 0; day < 300; day++) engine.runDay();
  const peak = state.companies[playerId]!.research.grocery ?? 0;
  expect('prim tavanına ulaşıyor', peak > RESEARCH_CAP * 0.97, peak.toFixed(4));

  // Bütün merkezleri yık: prim geri erimeli. Kalite kiralanır, satın
  // alınmaz — yoksa doğru strateji "kur, tavana çık, yık" olurdu.
  for (const id of [...one, ...Object.values(state.buildings).filter((b) => BUILDING_BY_ID[b.defId]?.role === 'research').map((b) => b.id)]) {
    const building = state.buildings[id];
    if (building) engine.dispatch({ type: 'DEMOLISH', tileId: building.tileId });
  }
  expect('merkezler yıkıldı', researchCeiling(state, playerId, 'grocery') === 0, 'tavan 0');
  for (let day = 0; day < 200; day++) engine.runDay();
  const decayed = state.companies[playerId]!.research.grocery ?? 0;
  expect('prim geri eriyor', decayed < peak * 0.02, `${peak.toFixed(3)} → ${decayed.toFixed(4)}`);
}

// ---- 5. Odak değiştirme ----
{
  const { engine, districtIds } = duel(11, 2, true);
  const districtId = districtIds[0]!;
  const state = engine.getState();
  const playerId = state.playerCompanyId;
  const labId = addLabs(engine, playerId, districtId, 1, 'grocery')[0]!;

  const wrongRole = engine.dispatch({ type: 'SET_FOCUS', buildingId: Object.values(state.buildings).find((b) => BUILDING_BY_ID[b.defId]?.role === 'outlet')!.id, category: 'dining' });
  expect('mağazaya odak atanamıyor', !wrongRole.ok, wrongRole.reason ?? '');

  const moved = engine.dispatch({ type: 'SET_FOCUS', buildingId: labId, category: 'dining' });
  expect('odak değiştirilebiliyor', moved.ok, moved.reason ?? 'dining');
  expect('eski kategorinin tavanı düştü', researchCeiling(state, playerId, 'grocery') === 0, 'grocery 0');
  expect('yeni kategorinin tavanı açıldı',
    Math.abs(researchCeiling(state, playerId, 'dining') - 0.12) < 1e-9, 'dining 0,12');
}

// ---- 6. Pazarlama: kaldıraç ve asimetri ----
{
  const { engine, districtIds } = duel(11, 4, true);
  const districtId = districtIds[0]!;
  const state = engine.getState();
  const playerId = state.playerCompanyId;

  const officeId = placeFor(engine, playerId, 'marketing_office', districtId)!;
  state.buildings[officeId]!.focus = 'grocery';
  expect('bir ofis kaldıracı 0,15',
    Math.abs(marketingLeverage(state, playerId, 'grocery') - 0.15) < 1e-9,
    marketingLeverage(state, playerId, 'grocery').toFixed(3));

  for (let i = 0; i < 3; i++) {
    const id = placeFor(engine, playerId, 'marketing_office', districtId);
    if (id) state.buildings[id]!.focus = 'grocery';
  }
  expect('kaldıraç 0,35 ile kesiliyor',
    Math.abs(marketingLeverage(state, playerId, 'grocery') - MARKETING_CAP) < 1e-9,
    marketingLeverage(state, playerId, 'grocery').toFixed(3));

  for (let day = 0; day < 300; day++) engine.runDay();
  const share = state.companies[playerId]!.marketShare.grocery ?? 0;
  const brand = state.companies[playerId]!.brand.grocery ?? 0;
  const expectedTarget = Math.min(1, share * 1.15 + MARKETING_CAP);
  expect('marka kaldıraçlı hedefine yakınsıyor', Math.abs(brand - expectedTarget) < 0.02,
    `marka ${brand.toFixed(3)}, hedef ${expectedTarget.toFixed(3)}`);
  expect('marka payının üstünde', brand > share * 1.15 + 0.1,
    `pay %${(share * 100).toFixed(0)}, marka ${brand.toFixed(2)}`);

  // Tasarımın asimetri iddiası: kaldıraç DÜŞÜK markada oransal olarak
  // daha çok kazandırır. Çekicilik formülü marka için doğrusal
  // (0,45 + 0,55 × marka) olduğu için bu doğrudan hesaplanabilir.
  const attract = (b: number): number => 0.45 + 0.55 * b;
  const lowGain = attract(0.115 + MARKETING_CAP) / attract(0.115);
  const highGain = attract(Math.min(1, 0.69 + MARKETING_CAP)) / attract(0.69);
  console.log(
    `  pazarlama kazancı: payı %10 olanda ×${lowGain.toFixed(3)}, payı %60 olanda ×${highGain.toFixed(3)}`,
  );
  expect('pazarlama giriş silahı (düşük payda daha güçlü)', lowGain > highGain,
    `${lowGain.toFixed(3)} > ${highGain.toFixed(3)}`);
}

/** 7. bölümde ölçülüyor, 8. bölümde pazarlamayla karşılaştırılıyor. */
let researchPayback = Infinity;

// ---- 7. Kalibrasyon: Ar-Ge ölçekle birlikte ucuzluyor mu? ----
//
// Ar-Ge'nin sabit gideri var, faydası outlet sayınla çarpılıyor. Az
// mağazalı oyuncuya tuzak, çok mağazalıya en iyi hamle olmalı.
{
  const measure = (outlets: number): number => {
    const control = duel(23, outlets, true);
    for (let day = 0; day < 400; day++) control.engine.runDay();
    const base = getPlayer(control.engine.getState()).today.profit;

    const test = duel(23, outlets, true);
    const labs = addLabs(test.engine, test.engine.getState().playerCompanyId, test.districtIds[0]!, 2, 'grocery');
    for (let day = 0; day < 400; day++) test.engine.runDay();
    const withLabs = getPlayer(test.engine.getState()).today.profit;

    const investment = labs.length * (BUILDING_BY_ID['research_center']!.cost);
    const gain = withLabs - base;
    return gain > 0 ? investment / gain : Infinity;
  };

  const small = measure(1);
  const large = measure(4);
  console.log(`  Ar-Ge geri ödemesi: 1 mağazada ${fmtDays(small)}, 4 mağazada ${fmtDays(large)}`);
  expect('Ar-Ge ölçekle ucuzluyor', large < small, `${fmtDays(large)} < ${fmtDays(small)}`);
  expect('tek mağazalı oyuncu için Ar-Ge erken', small > 260, fmtDays(small));
  // Zincirin bandı 170–174 gün. Ar-Ge ondan YAVAŞ olmalı: getirisi kalıcı
  // ve rakip azaldıkça büyüyor, yani sabırlı sermayenin işi.
  expect('Ar-Ge zincirden yavaş dönüyor', large > 180 && large < 280, fmtDays(large));
  researchPayback = large;
}

// ---- 8. Pazarlama ofisi de kalibre mi? ----
{
  const control = duel(23, 4, true);
  for (let day = 0; day < 400; day++) control.engine.runDay();
  const base = getPlayer(control.engine.getState()).today.profit;

  const test = duel(23, 4, true);
  const state = test.engine.getState();
  const offices: string[] = [];
  for (let i = 0; i < 2; i++) {
    const id = placeFor(test.engine, state.playerCompanyId, 'marketing_office', test.districtIds[0]!);
    if (!id) continue;
    state.buildings[id]!.focus = 'grocery';
    offices.push(id);
  }
  for (let day = 0; day < 400; day++) test.engine.runDay();
  const gain = getPlayer(state).today.profit - base;
  const payback = gain > 0 ? (offices.length * BUILDING_BY_ID['marketing_office']!.cost) / gain : Infinity;

  console.log(`  pazarlama geri ödemesi (4 mağaza): ${fmtDays(payback)}`);
  expect('pazarlama kâr getiriyor', gain > 0, formatMoney(gain) + '/gün');
  // Pazarlama Ar-Ge'den HIZLI dönmeli: etkisi anında başlıyor (birikim
  // yok) ve ofisi yıktığın gün bitiyor. Daha ucuz, daha kısa vadeli bir kol.
  expect(
    "pazarlama Ar-Ge'den hızlı dönüyor",
    payback < researchPayback,
    `${fmtDays(payback)} < ${fmtDays(researchPayback)}`,
  );
  // ...ama en iyi mağazadan (60–110 gün) hızlı DEĞİL. Olsaydı düşünmeden
  // kurulacak bir bina olurdu ve "hangi parsele ne" sorusu ölürdü.
  expect('pazarlama mağazanın önüne geçmiyor', payback > 110, fmtDays(payback));
}

/** Sonsuz geri ödemeyi okunur yazar. */
function fmtDays(days: number): string {
  return Number.isFinite(days) ? `${Math.round(days)} gün` : 'hiç dönmüyor';
}

// ---- 9. Rekabet kartı ----
//
// Kart tamamen türetilmiş; sorulan şey oyuncuya DOĞRU şeyi söyleyip
// söylemediği. Yanlış kanal ("kalite paya döner" derken aslında fiyata
// dönüyorsa) oyuncuyu haklı ama yanlış bir sonuca götürür.
{
  const { engine, districtIds } = duel(11, 4, true);
  const state = engine.getState();
  const playerId = state.playerCompanyId;
  getPlayer(state).netWorth = 50_000_000;
  for (let day = 0; day < 200; day++) engine.runDay();

  const cards = competitionCards(state, playerId);
  const grocery = cards.find((card) => card.category === 'grocery');
  expect('sattığın kategori için kart çıkıyor', Boolean(grocery), `${cards.length} kart`);
  expect(
    'satmadığın kategori için kart çıkmıyor',
    cards.every((card) => card.outlets > 0),
    cards.map((card) => `${card.categoryName}:${card.outlets}`).join(' · '),
  );

  if (grocery) {
    expect('kartta rakip lider görünüyor', grocery.leader !== null, grocery.leader?.name ?? '—');
    expect(
      'kartın payı motorun payıyla aynı',
      Math.abs(grocery.share - (getPlayer(state).marketShare.grocery ?? 0)) < 1e-9,
      `%${Math.round(grocery.share * 100)}`,
    );
    // Bu düelloda mağazalar kapasitesinde çalışıyor; ölçüm de aynı
    // kurulumda kârın tamamının fiyattan geldiğini gösteriyordu. Kart
    // aynı şeyi söylemeli.
    expect('kanal doğru okunuyor', grocery.channel === 'price',
      `${grocery.channel} · doluluk %${Math.round(grocery.utilisation * 100)}`);
    expect('kart bir hamle öneriyor', grocery.move !== null, grocery.move?.name ?? grocery.blocked ?? '—');
    expect('4 mağazada hamle erken sayılmıyor', grocery.move?.premature === false,
      `${grocery.outlets} mağaza`);
  }

  // Kartın kalite değeri motorun kullandığıyla aynı olmalı: Ar-Ge kurunca
  // ikisi birlikte yükseliyor mu?
  const beforeQuality = grocery?.quality ?? 0;
  addLabs(engine, playerId, districtIds[0]!, 2, 'grocery');
  for (let day = 0; day < 300; day++) engine.runDay();
  const after = competitionCards(state, playerId).find((card) => card.category === 'grocery')!;
  expect('Ar-Ge kartın kalitesine yansıyor', after.quality > beforeQuality + 0.15,
    `${beforeQuality.toFixed(2)} → ${after.quality.toFixed(2)}`);
  const arm = after.arms.find((a) => a.kind === 'research')!;
  expect('kol tavanı doğru gösteriyor', Math.abs(arm.ceiling - 0.24) < 1e-9, arm.detail);
}

// ---- 10. Kart tek mağazalı oyuncuyu uyarıyor mu? ----
{
  const { engine } = duel(11, 1, true);
  const state = engine.getState();
  getPlayer(state).netWorth = 50_000_000;
  for (let day = 0; day < 60; day++) engine.runDay();

  const card = competitionCards(state, state.playerCompanyId).find((c) => c.category === 'grocery');
  expect('tek mağazalı oyuncuya hamle "erken" işaretleniyor', card?.move?.premature === true,
    card?.move ? `${card.move.name} · erken=${card.move.premature}` : (card?.blocked ?? '—'));
  expect('erken hamlenin gerekçesi ölçeği açıklıyor',
    Boolean(card?.move?.reason.includes('mağaza')), card?.move?.reason ?? '—');
}

// ---- 11. Payı düşük oyuncuya pazarlama, yüksekse Ar-Ge öneriliyor mu? ----
{
  // Rakip dört mağaza açar, oyuncu bir tane: payı düşük kalır.
  const engine = labEngine(41);
  const state = engine.getState();
  const rival = state.companies[RIVAL_ID]!;
  rival.cash = 500_000_000;
  rival.netWorth = 500_000_000;
  getPlayer(state).netWorth = 50_000_000;

  // Rakip altı, oyuncu bir mağaza: pay gerçekten düşük kalsın. İlk
  // denemede 4'e 3 kurulmuştu ve oyuncunun payı %42 çıkıyordu — yani
  // senaryo "payı düşük oyuncu" üretmiyordu.
  const order = [...state.districts].sort((a, b) => a.population - b.population).map((d) => d.id);
  for (let i = 0; i < 6; i++) placeFor(engine, RIVAL_ID, 'supermarket', order[i % 3]!);
  placeFor(engine, state.playerCompanyId, 'supermarket', order[0]!);
  for (let day = 0; day < 200; day++) engine.runDay();

  const card = competitionCards(state, state.playerCompanyId).find((c) => c.category === 'grocery');
  console.log(
    `  payı %${Math.round((card?.share ?? 0) * 100)} olan oyuncuya önerilen kol: ${card?.move?.kind ?? '—'}`,
  );
  expect('payı düşükken pazarlama öneriliyor (giriş silahı)',
    card !== undefined && card.share < 0.35 && card.move?.kind === 'marketing',
    `pay %${Math.round((card?.share ?? 0) * 100)}, kol ${card?.move?.kind ?? '—'}`);
}

console.log(`\n=== ${failures === 0 ? 'TÜMÜ GEÇTİ' : `${failures} KONTROL KALDI`} ===`);
process.exit(failures === 0 ? 0 : 1);
