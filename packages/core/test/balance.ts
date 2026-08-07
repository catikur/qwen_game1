/**
 * Başlıksız denge simülasyonu.
 *
 * Oyunu UI olmadan yüzlerce gün koşturur ve ekonominin sağlıklı olup
 * olmadığını raporlar. Amaç, denge bozukluğunu tarayıcıyı açmadan görmek:
 * oyuncu hiç kaybedemiyorsa oyun kolay, NPC'ler hep batıyorsa rekabet yok.
 */
import { BUILDINGS, BUILDING_BY_ID, CATEGORIES } from '@capital/content';
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

// ---- 5. İmar kısıtı ----
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

console.log(`\n=== ${failures === 0 ? 'TÜMÜ GEÇTİ' : `${failures} KONTROL KALDI`} ===`);
process.exit(failures === 0 ? 0 : 1);
