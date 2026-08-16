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
  rankedBuildOptions,
  researchCeiling,
  routeSignature,
  shelfReach,
  bookValue,
  confidence,
  freeFloat,
  marketCap,
  portfolioValue,
  sharePrice,
  supplyRoutes,
  tilePrice,
  valuationFor,
  TOTAL_SHARES,
  MARKETING_CAP,
  RESEARCH_CAP,
} from '../src/index';
import { build, buyTile } from '../src/actions';
import { buyShares } from '../src/systems/equity';
import type { GameState } from '../src/types';

/**
 * Oyuncu vekili — oyunun oyuncuya ÖNERDİĞİ oynanış.
 *
 * Önce zincir kartının hamlesi (kart "henüz erken" demiyorsa), sonra
 * fırsat lensinin gösterdiği yere mağaza. Vekilin akıllanması bilinçli:
 * harness "bilgili bir oyuncu ne yaşar" sorusunu ölçmeli, oyunun
 * tavsiyesini görmezden gelen birini değil.
 */
/*
 * OYUNDA OLAN RAKİPLER, KATALOGDAKİLER DEĞİL.
 *
 * Test bugüne kadar `NPC_PROFILES` üzerinde dönüyordu ve profil sayısı
 * ile şirket sayısı aynı olduğu sürece bu doğru çalışıyordu. Rakip
 * sayısı haritayla ölçeklenmeye başlayınca varsayım kırıldı: katalogda
 * sekiz profil var, varsayılan haritada dört şirket kuruluyor ve kalan
 * dördü için `state.companies[id]` undefined dönüyor.
 *
 * Doğru kaynak state: kimin sahaya çıktığını dünya kurulumu belirliyor.
 */
function activeProfiles(state: GameState) {
  return NPC_PROFILES.filter((profile) => state.companies[profile.id]);
}

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

  let best: { tileId: number; defId: string; profit: number } | null = null;

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
      // SIRALAMA GERİ ÖDEMEYE GÖRE DEĞİL, GÜNLÜK KÂRA GÖRE.
      //
      // Bir bina bir parsel kaplıyor ve ölçüm oyunun kıt kaynağının
      // toprak olduğunu gösterdi (sınırsız nakitle bile karşılanmayan
      // talep %52). O yüzden doğru ölçüt paranın getirisi değil
      // PARSELİN getirisi — o da tam olarak `dailyProfit`.
      //
      // Geri ödeme sınırı elenmiş adayları ayıklamak için duruyor;
      // seçimi artık o yapmıyor.
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
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
  // ORAN, MUTLAK SAYI DEĞİL.
  //
  // Burada eskiden `vacant >= 80 && vacant <= 180` yazıyordu ve Tur 8'de
  // harita büyüyünce kırıldı — oysa ölçmek istediği şey (şehrin ne kadar
  // boş başladığı) hiç değişmemişti: 108/285 = %38, 193/500 = %39. Bir
  // eşiği haritanın mutlak boyutuna bağlamak, harita her değiştiğinde
  // gerçek bir sorun varmış gibi kırmızı yakar.
  const plots = occupied + vacant;
  const vacantShare = vacant / plots;
  expect(
    'yine de yeterli boş parsel var',
    vacantShare >= 0.25 && vacantShare <= 0.55,
    `${vacant}/${plots} parsel boş — %${Math.round(vacantShare * 100)}`,
  );
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
  for (const profile of activeProfiles(s)) {
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
  // KÂR SON GÜNDEN DEĞİL SON 60 GÜNDEN OKUNUYOR.
  //
  // Burada `player.today.profit` vardı: 500 günlük bir deneyin sonucu
  // tek bir günün kârıyla veriliyordu. Kontrol geçiyordu, ama geçmesi
  // ölçtüğü şeyin doğru olduğunu göstermiyordu — benchmark aynı soruyu
  // 60 günlük ortalamayla sorunca ters işaret çıktı ve fark buradan
  // geldi. Tek günlük örneklem bir olayın, bir fiyat dalgasının ya da o
  // gün açılan bir mağazanın üstüne denk gelebilir.
  function runStrategy(seed: number, useChain: boolean): { netWorth: number; profit: number; chain: number } {
    const engine2 = new GameEngine(createNewGame({ seed, companyName: 'Test AŞ' }));
    let tail = 0;
    for (let day = 1; day <= 500; day++) {
      if (day % 5 === 0) {
        if (!(useChain && followChainAdvice(engine2))) expandOutlets(engine2);
      }
      engine2.runDay();
      if (day > 440) tail += getPlayer(engine2.getState()).today.profit;
    }
    const s = engine2.getState();
    const player = getPlayer(s);
    const chain = Object.values(s.buildings).filter((b) => {
      if (b.companyId !== player.id) return false;
      const def = BUILDING_BY_ID[b.defId];
      return def?.role === 'extract' || def?.role === 'process';
    }).length;
    return { netWorth: player.netWorth, profit: tail / 60, chain };
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

// ---- 7. Kalibrasyon: kollar bir ÖLÇEK EŞİĞİNDEN sonra açılıyor mu? ----
//
// Tur 3'ün nüfus düzeltmesinden sonra eğri keskinleşti: pazar artık
// gerçekten doyduğu için kolun değeri ölçekle birlikte hızla büyüyor.
// Aranan şey bir bant değil, net bir EŞİK — az mağazalı oyuncuya tuzak,
// çok mağazalıya en iyi hamle.
{
  const measure = (outlets: number, defId: string, count: number): number => {
    const control = duel(23, outlets, true);
    for (let day = 0; day < 400; day++) control.engine.runDay();
    const base = getPlayer(control.engine.getState()).today.profit;

    const test = duel(23, outlets, true);
    const state = test.engine.getState();
    const built: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = placeFor(test.engine, state.playerCompanyId, defId, test.districtIds[0]!);
      if (!id) continue;
      state.buildings[id]!.focus = 'grocery';
      built.push(id);
    }
    for (let day = 0; day < 400; day++) test.engine.runDay();
    const gain = getPlayer(state).today.profit - base;
    return gain > 0 ? (built.length * BUILDING_BY_ID[defId]!.cost) / gain : Infinity;
  };

  const small = measure(4, 'research_center', 2);
  const large = measure(8, 'research_center', 2);
  console.log(`  Ar-Ge geri ödemesi: 4 mağazada ${fmtDays(small)}, 8 mağazada ${fmtDays(large)}`);
  expect('Ar-Ge ölçekle ucuzluyor', large < small, `${fmtDays(large)} < ${fmtDays(small)}`);
  expect('az mağazalı oyuncu için Ar-Ge erken', small > 400, fmtDays(small));
  expect('ölçek yeterken Ar-Ge kazandırıyor', large < 200, fmtDays(large));
  researchPayback = large;
}

// ---- 8. Pazarlama: ucuz, hızlı, düşük tavanlı giriş silahı ----
{
  const measure = (outlets: number): number => {
    const control = duel(23, outlets, true);
    for (let day = 0; day < 400; day++) control.engine.runDay();
    const base = getPlayer(control.engine.getState()).today.profit;

    const test = duel(23, outlets, true);
    const state = test.engine.getState();
    const built: string[] = [];
    for (let i = 0; i < 2; i++) {
      const id = placeFor(test.engine, state.playerCompanyId, 'marketing_office', test.districtIds[0]!);
      if (!id) continue;
      state.buildings[id]!.focus = 'grocery';
      built.push(id);
    }
    for (let day = 0; day < 400; day++) test.engine.runDay();
    const gain = getPlayer(state).today.profit - base;
    return gain > 0 ? (built.length * BUILDING_BY_ID['marketing_office']!.cost) / gain : Infinity;
  };

  const small = measure(4);
  const large = measure(8);
  console.log(`  pazarlama geri ödemesi: 4 mağazada ${fmtDays(small)}, 8 mağazada ${fmtDays(large)}`);
  expect('az mağazalı oyuncu için pazarlama da erken', small > 400, fmtDays(small));
  expect('ölçek yeterken pazarlama kazandırıyor', large < 200, fmtDays(large));
  // Tasarımın kararı: pazarlama Ar-Ge'den ucuz ve hızlı olmalı, tavanı
  // ise Ar-Ge kadar kalıcı değil. Kalibrasyon bunu bir kez ters çevirmişti.
  expect(
    "pazarlama Ar-Ge'den hızlı dönüyor",
    large < researchPayback,
    `${fmtDays(large)} < ${fmtDays(researchPayback)}`,
  );
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
    // Eşik ölçümle 6'ya çıktı; 4 mağazalı oyuncuya hamle ERKEN
    // işaretlenmeli. Kartın işi cesaret vermek değil, doğruyu söylemek.
    expect('4 mağazada hamle erken işaretleniyor', grocery.move?.premature === true,
      `${grocery.outlets} mağaza · erken=${grocery.move?.premature}`);
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

// ---- 12. Rakip doktrinleri ----
//
// Asıl sorulan şey "rakip zorlaştı mı" değil, "rakip AYRIŞTI mı":
// her kişiliğin farklı bir silahı ve dolayısıyla farklı bir karşı
// hamlesi olmalı. Hepsi aynı şeyi yapıyorsa doktrin diye bir şey yok.
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Doktrin AŞ' }));
  const player = getPlayer(engine.getState());
  player.cash = 40_000_000;
  for (let day = 1; day <= 500; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }
  const state = engine.getState();

  console.log('\n--- rakiplerin kol yatırımı (500 gün) ---');
  const rows = activeProfiles(state).map((profile) => {
    let research = 0;
    let marketing = 0;
    for (const building of Object.values(state.buildings)) {
      if (building.companyId !== profile.id) continue;
      const role = BUILDING_BY_ID[building.defId]?.role;
      if (role === 'research') research += 1;
      if (role === 'marketing') marketing += 1;
    }
    const company = state.companies[profile.id]!;
    return { profile, research, marketing, company };
  });

  for (const row of rows) {
    console.log(
      `  ${row.profile.name.padEnd(16)} ${row.profile.trait.padEnd(14)}` +
        ` Ar-Ge ${String(row.research).padStart(2)} · pazarlama ${String(row.marketing).padStart(2)}` +
        ` · değer ${formatMoney(row.company.netWorth).padStart(11)} · borç ${formatMoney(row.company.debt)}`,
    );
  }

  const armed = rows.filter((row) => row.research + row.marketing > 0);
  expect('rakipler kol kuruyor', armed.length >= 2, `${armed.length}/${rows.length} rakip`);

  // KOL KARARI TOPRAĞA DUYARLI OLMAMALI.
  //
  // Tur 8'in bulduğu hata tam buydu: kol "kârlı genişleme bulunamazsa"
  // kuruluyordu, yani örtük olarak toprağın tükenmesini bekliyordu.
  // Harita büyüyünce genişleme hiç tıkanmadı ve rakipler 0/4 kol kurdu.
  //
  // Kontrol iki dünyayı yan yana koşuyor: biri bugünkü harita, diğeri
  // boş parseli iki katına çıkarılmış bir harita. Kol sayısı ikincide
  // çökerse kapı yine toprağa bağlanmış demektir.
  {
    const roomy = new GameEngine(createNewGame({ seed: 12, companyName: 'Doktrin AŞ' }));
    const roomyState = roomy.getState();
    // Yapılı parsellerin yarısını boşalt — genişleme asla tıkanmasın.
    let cleared = 0;
    for (const tile of roomyState.map.tiles) {
      if (tile.kind !== 'plot' || !tile.structureId) continue;
      if (cleared % 2 === 0) {
        tile.structureId = null;
        tile.structureHeight = 0;
      }
      cleared++;
    }
    const roomyPlayer = getPlayer(roomyState);
    roomyPlayer.cash = 40_000_000;
    for (let day = 1; day <= 500; day++) {
      if (day % 5 === 0) playerStrategy(roomy);
      roomy.runDay();
    }
    const after = roomy.getState();
    let roomyArms = 0;
    for (const building of Object.values(after.buildings)) {
      if (building.companyId === after.playerCompanyId) continue;
      const role = BUILDING_BY_ID[building.defId]?.role;
      if (role === 'research' || role === 'marketing') roomyArms++;
    }
    const baseArms = rows.reduce((sum, row) => sum + row.research + row.marketing, 0);
    const freeAfter = after.map.tiles.filter(
      (t) => t.kind === 'plot' && !t.ownerId && !t.structureId,
    ).length;
    expect(
      'toprak bollaşınca da kol kuruluyor',
      roomyArms > 0,
      `bol toprakta ${roomyArms} kol (normalde ${baseArms}) · ${freeAfter} parsel hâlâ boş`,
    );
  }

  const quality = rows.find((row) => row.profile.trait === 'premium');
  const cutter = rows.find((row) => row.profile.trait === 'price_cutter');
  if (quality && cutter) {
    expect(
      'kalite avcısı ucuzcudan daha çok Ar-Ge kuruyor',
      quality.research > cutter.research,
      `${quality.research} > ${cutter.research}`,
    );
  }

  const landlord = rows.find((row) => row.profile.trait === 'landlord');
  expect('arsa spekülatörü kola girmiyor (kişilik ayrışıyor)',
    (landlord?.research ?? 0) + (landlord?.marketing ?? 0) === 0,
    `${(landlord?.research ?? 0) + (landlord?.marketing ?? 0)} bina`);

  expect(
    'kol yatırımı rakipleri batırmıyor',
    rows.every((row) => row.company.debt < row.company.netWorth),
    rows.map((row) => `${row.company.name}: ${formatMoney(row.company.debt)}`).join(' · '),
  );

  // Doktrinler birbirinden gerçekten ayrışıyor mu? Tek tip davranıyorlarsa
  // "kişilik" bir etiketten ibaret demektir.
  const shapes = new Set(rows.map((row) => `${Math.min(row.research, 3)}/${Math.min(row.marketing, 3)}`));
  expect('doktrinler birbirinden ayrışıyor', shapes.size >= 3,
    `${shapes.size} farklı kol profili: ${[...shapes].join(' ')}`);

  // Kol kuran rakip onu boşa kurmasın: atadığı kategoride mağazası olsun.
  let misfocused = 0;
  for (const building of Object.values(state.buildings)) {
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role !== 'research' && role !== 'marketing') continue;
    if (building.companyId === state.playerCompanyId) continue;
    const outlets = Object.values(state.buildings).filter(
      (other) =>
        other.companyId === building.companyId &&
        BUILDING_BY_ID[other.defId]?.role === 'outlet' &&
        BUILDING_BY_ID[other.defId]?.category === building.focus,
    ).length;
    if (outlets === 0) misfocused += 1;
  }
  expect('rakip kolunu boşa çalıştırmıyor', misfocused === 0, `${misfocused} yanlış atama`);

  // Doktrin OYUNCUYA GÖRÜNÜR mü? Ayrışma yalnızca bina sayısında kalırsa
  // oyuncu için hiçbir şey değişmemiş demektir. Rekabet kartındaki rakip
  // sütunu farkı taşımalı.
  const cards = competitionCards(state, state.playerCompanyId);
  const withLeader = cards.filter((card) => card.leader !== null);
  console.log(
    `  kartta görünen rakip kaliteleri: ${withLeader
      .map((card) => `${card.categoryName} ${card.leader!.name.split(' ')[0]} ${card.leader!.quality.toFixed(2)}`)
      .join(' · ')}`,
  );

  // Kartın raporladığı kalite, motorun kullandığının AYNISI olmalı.
  // İlk denemede bunu "kategoriler arası kalite yayılımı" ile ölçüyordum;
  // o zayıf bir vekildi — farklı kategorilerin taban bina kaliteleri
  // zaten farklı olduğu için yayılım doktrin hakkında hiçbir şey
  // söylemiyordu. Doğru soru: kart rakibin Ar-Ge primini gizliyor mu?
  let worstGap = 0;
  for (const card of withLeader) {
    const leaderId = card.leader!.companyId;
    let sum = 0;
    let count = 0;
    for (const building of Object.values(state.buildings)) {
      if (building.companyId !== leaderId) continue;
      const def = BUILDING_BY_ID[building.defId];
      if (def?.role !== 'outlet' || def.category !== card.category) continue;
      sum += def.quality + (state.companies[leaderId]!.research[card.category] ?? 0);
      count += 1;
    }
    if (count === 0) continue;
    worstGap = Math.max(worstGap, Math.abs(card.leader!.quality - sum / count));
  }
  expect('kart rakibin Ar-Ge primini gizlemiyor', worstGap < 0.02,
    `en büyük sapma ${worstGap.toFixed(3)}`);

  const premiumResearch = Math.max(
    ...CONSUMER_CATEGORIES.map((c) => state.companies[NPC_PROFILES.find((p) => p.trait === 'premium')!.id]!.research[c] ?? 0),
  );
  const cutterResearch = Math.max(
    ...CONSUMER_CATEGORIES.map((c) => state.companies[NPC_PROFILES.find((p) => p.trait === 'price_cutter')!.id]!.research[c] ?? 0),
  );
  expect('kalite avcısının kalite primi ucuzcununkinden yüksek',
    premiumResearch > cutterResearch + 0.05,
    `${premiumResearch.toFixed(2)} > ${cutterResearch.toFixed(2)}`);

}

// ---- 13. Tur 3: rekabet gerçekten iş görüyor mu? ----
//
// Turun tek sorusu bu. Nüfus düzeltmesinden önce şehir hiç doymuyordu:
// herkes kapasitesinin tamamını satıyor, çekicilik formülünün hiçbir
// değişkeni bir işe yaramıyordu. Aşağıdaki üç kontrol o durumun geri
// gelmediğini garanti ediyor.
{
  const { engine } = duel(29, 16, true);
  const state = engine.getState();
  for (let day = 0; day < 400; day++) engine.runDay();

  let cap = 0;
  let sold = 0;
  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    cap += def.capacity;
    sold += building.last.unitsSold;
  }
  const utilisation = cap > 0 ? sold / cap : 0;

  let unmetUnits = 0;
  let demandUnits = 0;
  for (const district of state.districts) {
    for (const category of CONSUMER_CATEGORIES) {
      const demand = district.demand[category] ?? 0;
      demandUnits += demand;
      unmetUnits += demand * (district.unmet[category] ?? 0);
    }
  }
  const cityUnmet = demandUnits > 0 ? unmetUnits / demandUnits : 0;

  console.log(
    `  16 süpermarket/taraf · doluluk %${(utilisation * 100).toFixed(0)} · ` +
      `market boş talebi %${(cityUnmet * 100).toFixed(0)}`,
  );
  // Doluluk %100'e dayanıyorsa çekicilik ölüdür: kimse rakipten müşteri
  // alamaz, çünkü zaten satabildiğinin tamamını satıyor.
  expect('kapasite talebe yetişebiliyor (rekabet için boşluk var)', utilisation < 0.9,
    `doluluk %${(utilisation * 100).toFixed(0)}`);

  // Fiyat kırmak gerçekten pay almalı. Tur 3 öncesi bu da ölüydü.
  const own = Object.values(state.buildings).filter(
    (b) => b.companyId === state.playerCompanyId && BUILDING_BY_ID[b.defId]?.role === 'outlet',
  );
  const before = own.reduce((sum, b) => sum + b.last.unitsSold, 0);
  for (const building of own) {
    building.autoPrice = false;
    building.priceMultiplier = 0.75;
  }
  for (let day = 0; day < 60; day++) engine.runDay();
  const after = own.reduce((sum, b) => sum + b.last.unitsSold, 0);
  const lift = before > 0 ? after / before - 1 : 0;
  console.log(`  fiyatı %25 kırınca hacim: ${before.toFixed(0)} → ${after.toFixed(0)} (%${(lift * 100).toFixed(0)})`);
  expect('fiyat kırmak pay alıyor', lift > 0.1, `+%${(lift * 100).toFixed(0)}`);
}

// ---- 14. Perakende istihdamı nüfus çekmiyor ----
//
// Tur 3'ün düzeltmesinin kendisi. Mağaza kendi müşterisini üretemez;
// fabrika ve ofis ise gerçekten yeni sakin çeker.
{
  const grow = (defId: string, districtId: number): number => {
    const engine = labEngine(37);
    const state = engine.getState();
    const before = state.districts[districtId]!.population;
    for (let i = 0; i < 6; i++) placeFor(engine, state.playerCompanyId, defId, districtId);
    for (let day = 0; day < 300; day++) engine.runDay();
    return state.districts[districtId]!.population / before - 1;
  };

  const industrial = labEngine(37).getState().districts.find((d) => d.archetype === 'industrial')!.id;
  const shops = grow('supermarket', industrial);
  const plants = grow('coffee_estate', industrial);

  console.log(
    `  sanayi bölgesinde 300 gün: 6 süpermarket → nüfus %${(shops * 100).toFixed(1)} · ` +
      `6 çiftlik → nüfus %${(plants * 100).toFixed(1)}`,
  );
  expect('perakende istihdamı nüfusu şişirmiyor', shops < 0.1, `%${(shops * 100).toFixed(1)}`);
  expect('üretim istihdamı nüfus çekiyor', plants > shops * 2, `%${(plants * 100).toFixed(1)}`);
}

// ================================================================ İhale
//
// Sorulan şey "ihale çalışıyor mu" değil, "arazi gerçekten çekişiyor mu":
// oyuncu kaybedebiliyor mu, rakip mantıklı bir fiyat veriyor mu, ve
// mekanik oyunu kilitliyor mu.

console.log('\n=== Parsel ihalesi ===\n');

{
  const engine = new GameEngine(createNewGame({ seed: 17, companyName: 'İhale AŞ' }));
  const state = engine.getState();
  const player = getPlayer(state);
  player.cash = 20_000_000;

  // İlk ihaleye kadar koş.
  for (let day = 0; day < 31 && !state.auction; day++) engine.runDay();
  expect('belediye ihale açıyor', state.auction !== null, `${state.time.day}. gün`);

  if (state.auction) {
    const auction = state.auction;
    const tile = state.map.tiles[auction.tileId]!;
    expect('ihaledeki parsel boş ve sahipsiz',
      tile.kind === 'plot' && !tile.ownerId && !tile.structureId && !tile.buildingId,
      `parsel ${tile.id}`);
    expect('taban fiyat normal parsel fiyatına eşit',
      Math.abs(auction.reserve - tilePrice(state, auction.tileId)) < 1,
      `${Math.round(auction.reserve)} ₺`);

    // İhaledeki parsel normal yoldan alınamamalı; yoksa ihale sadece bir
    // bildirim olurdu.
    const direct = engine.dispatch({ type: 'BUY_TILE', tileId: auction.tileId });
    expect('ihaledeki parsel doğrudan satın alınamıyor', !direct.ok, direct.reason ?? '');

    // Taban altı teklif reddedilmeli.
    const low = engine.dispatch({ type: 'PLACE_BID', amount: auction.reserve - 1 });
    expect('taban altı teklif reddediliyor', !low.ok, low.reason ?? '');

    const ok = engine.dispatch({ type: 'PLACE_BID', amount: auction.reserve });
    expect('taban fiyattan teklif kabul ediliyor', ok.ok, ok.reason ?? `${Math.round(auction.reserve)} ₺`);
    expect('en yüksek teklif oyuncunun', auction.bidderId === state.playerCompanyId, auction.bidderId ?? '—');

    const again = engine.dispatch({ type: 'PLACE_BID', amount: auction.reserve * 2 });
    expect('kendi teklifinin üstüne çıkılamıyor', !again.ok, again.reason ?? '');
  }
}

// ---- Oyuncu ihaleyi kaybedebiliyor mu? ----
//
// Kaybedemiyorsa mekanik bir çekişme değil, sadece ikinci bir satın alma
// düğmesi olurdu.
{
  const engine = new GameEngine(createNewGame({ seed: 17, companyName: 'İhale AŞ' }));
  const state = engine.getState();
  // Oyuncu fakir: taban fiyatı verse bile rakip üstüne çıkabilmeli.
  getPlayer(state).cash = 3_000;

  // İhaleleri HABERDEN saymak yanlıştı: haber listesi kapaklı, yeni
  // öğeler eskileri düşürüyor ve delta sıfıra iniyor. Bunun yerine
  // `state.auction` geçişlerini izliyoruz.
  let opened = 0;
  let settledWithWinner = 0;
  let noSale = 0;
  let previous: { bidderId: string | null } | null = null;

  for (let day = 0; day < 400; day++) {
    const before = state.auction;
    engine.runDay();
    if (!before && state.auction) opened += 1;
    if (before && !state.auction) {
      if (previous?.bidderId) settledWithWinner += 1;
      else noSale += 1;
    }
    previous = state.auction ? { bidderId: state.auction.bidderId } : previous;
  }

  console.log(`  400 günde: ${opened} ihale açıldı, ${settledWithWinner} kazananla kapandı, ${noSale} sonuçsuz`);
  expect('ihaleler düzenli açılıyor', opened >= 10, `${opened} ihale`);
  expect('ihaleler sonuçlanıyor', settledWithWinner + noSale >= 10,
    `${settledWithWinner + noSale} kapanış`);
  expect('rakipler ihale kazanıyor (oyuncu kaybedebiliyor)', settledWithWinner > 0,
    `${settledWithWinner} kez`);
  expect('kazanan parselin sahibi oluyor',
    Object.values(state.companies).some((company) =>
      state.map.tiles.some((tile) => tile.ownerId === company.id),
    ),
    'sahiplik devredildi',
  );
}

// ---- Rakip değerlemesi mantıklı mı? ----
{
  const engine = new GameEngine(createNewGame({ seed: 17, companyName: 'İhale AŞ' }));
  const state = engine.getState();
  for (let day = 0; day < 60; day++) engine.runDay();

  const merkez = [...state.districts].sort((a, b) => b.population - a.population)[0]!;
  const sanayi = state.districts.find((d) => d.archetype === 'industrial');

  const tileIn = (districtId: number): number | null =>
    state.map.tiles.find(
      (t) => t.districtId === districtId && t.kind === 'plot' && !t.ownerId && !t.structureId,
    )?.id ?? null;

  const rival = NPC_PROFILES[0]!.id;
  const busy = tileIn(merkez.id);
  const quiet = sanayi ? tileIn(sanayi.id) : null;

  if (busy !== null && quiet !== null) {
    const busyValue = valuationFor(state, rival, busy);
    const quietValue = valuationFor(state, rival, quiet);
    console.log(
      `  rakip değerlemesi: ${merkez.name} ${formatMoney(busyValue)} · Sanayi ${formatMoney(quietValue)}`,
    );
    expect('rakip kalabalık bölgeye daha çok değer biçiyor', busyValue > quietValue,
      `${formatMoney(busyValue)} > ${formatMoney(quietValue)}`);
  }

  // Değerleme bir NİYET, ödeme gücü ayrı bir kısıt. Nakit sınırını
  // değerlemenin içine koymak her parseli aynı değere indiriyordu (ikisi
  // de nakdin yarısı) — yani teklif hiçbir bilgi taşımıyordu. Sınır artık
  // teklif anında uygulanıyor; doğrulanması gereken değişmez bu.
  const engine2 = new GameEngine(createNewGame({ seed: 19, companyName: 'İhale AŞ' }));
  const state2 = engine2.getState();
  getPlayer(state2).cash = 5_000;
  for (const profile of activeProfiles(state2)) state2.companies[profile.id]!.cash = 60_000;

  let overBid = 0;
  for (let day = 0; day < 300; day++) {
    engine2.runDay();
    const auction = state2.auction;
    if (!auction?.bidderId) continue;
    const bidder = state2.companies[auction.bidderId]!;
    if (auction.bid > bidder.cash) overBid += 1;
  }
  expect('kimse nakdinin üstüne teklif vermiyor', overBid === 0, `${overBid} ihlal`);
}

// ---- İhale kapatılabiliyor mu, ekonomi bozuluyor mu? ----
{
  const withAuctions = new GameEngine(createNewGame({ seed: 21, companyName: 'A' }));
  const without = new GameEngine(createNewGame({ seed: 21, companyName: 'A' }));
  without.getState().flags.landAuctions = false;

  for (const engine of [withAuctions, without]) {
    getPlayer(engine.getState()).cash = 40_000_000;
    for (let day = 1; day <= 400; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      engine.runDay();
    }
  }

  const on = getPlayer(withAuctions.getState()).netWorth;
  const off = getPlayer(without.getState()).netWorth;
  console.log(`  ihaleli oyuncu ${formatMoney(on)} · ihalesiz ${formatMoney(off)}`);
  expect('ihale bayrağı kapatılabiliyor', without.getState().auction === null, 'açık ihale yok');
  // İhale araziyi ZORLAŞTIRIR ama oyunu kilitlememeli: %35'ten fazla fark
  // mekaniğin ekonomiyi ele geçirdiği anlamına gelirdi.
  expect('ihale ekonomiyi ele geçirmiyor', Math.abs(on / off - 1) < 0.35,
    `%${Math.round((on / off - 1) * 100)} fark`);
}

/** Sonsuz geri ödemeyi okunur yazar. */
function fmtDays(days: number): string {
  return Number.isFinite(days) ? `${Math.round(days)} gün` : 'hiç dönmüyor';
}

// ================================================================ Borsa
//
// Turun vaadi: rakibini pazarda değil SAHİPLİKTE yenmek. Sorulan şeyler:
// değerleme tutarlı mı, para yaratılıyor mu, devralma kaçak veriyor mu,
// ve hisse almayan oyuncunun ekonomisi bozuluyor mu.

console.log('\n=== Borsa ===\n');

// ---- 1. Denge kimliği: hisse almayanın ekonomisi değişmiyor ----
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Borsa AŞ' }));
  const state = engine.getState();
  getPlayer(state).cash = 40_000_000;
  for (let day = 1; day <= 300; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }

  let maxPortfolio = 0;
  for (const company of Object.values(state.companies)) {
    maxPortfolio = Math.max(maxPortfolio, portfolioValue(state, company.id));
  }
  expect('kimse hisse almadıysa portföy değeri tam sıfır', maxPortfolio === 0, `${maxPortfolio}`);

  // Değerleme tutarlılığı: piyasa değeri = defter × güven.
  const player = getPlayer(state);
  const cap = marketCap(state, player.id);
  const expected = Math.max(0, bookValue(state, player.id)) * confidence(state, player.id);
  expect('piyasa değeri = defter × güven', Math.abs(cap - expected) < 1, formatMoney(cap));
  expect('hisse fiyatı piyasa değerinin 1/10.000\'i',
    Math.abs(sharePrice(state, player.id) * TOTAL_SHARES - cap) < 1,
    `${sharePrice(state, player.id).toFixed(2)} ₺`);
  expect('serbest dolaşım başlangıçta tam', freeFloat(state, NPC_PROFILES[0]!.id) === TOTAL_SHARES,
    `${freeFloat(state, NPC_PROFILES[0]!.id)} hisse`);

  // Güvenin TEK işi şirketleri birbirinden ayırmak. İlk kalibrasyonda
  // referans getiri çok düşüktü ve dört rakipten üçü tavana yapışıyordu —
  // ekranda hepsi aynı görünüyordu, yani sinyal ölüydü.
  const trusts = Object.values(state.companies).map((c) => confidence(state, c.id));
  const spread = Math.max(...trusts) - Math.min(...trusts);
  console.log(`  güven aralığı: ${trusts.map((t) => t.toFixed(2)).join(' · ')}`);
  expect('güven şirketleri ayırıyor', spread > 0.1, `yayılım ${spread.toFixed(2)}`);

  // Zarar eden şirket defter değerinin ALTINDA işlem görmeli.
  const sick = state.companies[NPC_PROFILES[1]!.id]!;
  const healthy = confidence(state, sick.id);
  sick.today.profit = -Math.abs(bookValue(state, sick.id)) * 0.01;
  const ill = confidence(state, sick.id);
  expect('zarar eden şirket iskontolu işlem görüyor', ill < 1 && ill < healthy,
    `${healthy.toFixed(2)} → ${ill.toFixed(2)}`);
}

// ---- 2. Alım-satım ve temettü ----
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Borsa AŞ' }));
  const state = engine.getState();
  const player = getPlayer(state);
  player.cash = 60_000_000;
  const targetId = NPC_PROFILES[0]!.id;
  for (let day = 1; day <= 200; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }

  const price = sharePrice(state, targetId);
  const cashBefore = player.cash;
  const buy = engine.dispatch({ type: 'BUY_SHARES', companyId: targetId, count: 1_000 });
  expect('hisse alınabiliyor', buy.ok, buy.reason ?? `${Math.round(price)} ₺/hisse`);
  expect('nakit doğru düşüyor', Math.abs(cashBefore - player.cash - price * 1_000) < 1,
    formatMoney(cashBefore - player.cash));
  expect('serbest dolaşım azalıyor', freeFloat(state, targetId) === TOTAL_SHARES - 1_000,
    `${freeFloat(state, targetId)} hisse`);

  const own = engine.dispatch({ type: 'BUY_SHARES', companyId: player.id, count: 10 });
  expect('kendi hisseni alamıyorsun', !own.ok, own.reason ?? '');
  const tooMany = engine.dispatch({ type: 'SELL_SHARES', companyId: targetId, count: 5_000 });
  expect('elinde olmayanı satamıyorsun', !tooMany.ok, tooMany.reason ?? '');

  // Temettü: para yaratılmıyor, el değiştiriyor.
  //
  // ÖLÇÜLEN GÜN İZOLE EDİLMELİ. İddia "şehir geneli nakit değişimi =
  // günlük kâr toplamı" ve bu yalnızca SERMAYE hareketi olmadığında
  // doğru: bir rakibin o gün arsa alması ya da inşaat yapması nakdi
  // varlığa çevirir, kârda görünmez ve identite kırılır. Kontrol
  // eskiden bunu garanti etmiyordu, sadece o senaryoda rakipler
  // tesadüfen hareketsizdi — yani şans eseri geçiyordu.
  state.flags.npcCompetition = false;
  state.flags.landAuctions = false;

  const totalBefore = Object.values(state.companies).reduce((sum, c) => sum + c.cash, 0);
  const playerBefore = player.cash;
  const rival = state.companies[targetId]!;
  const rivalBefore = rival.cash;
  engine.runDay();
  const totalAfter = Object.values(state.companies).reduce((sum, c) => sum + c.cash, 0);
  const dayProfit = Object.values(state.companies).reduce((sum, c) => sum + c.today.profit, 0);

  console.log(
    `  ${Math.round(price)} ₺/hisse · 1.000 hisse = ${formatMoney(price * 1000)} · ` +
      `rakip günlük kâr ${formatMoney(rival.today.profit)}`,
  );
  expect('temettü para yaratmıyor', Math.abs(totalAfter - totalBefore - dayProfit) < 1,
    `${Math.round(totalAfter - totalBefore - dayProfit)} ₺ sapma`);
  expect('temettü hissedara ödeniyor',
    rival.today.profit <= 0 || player.cash - playerBefore > rival.today.profit * 0.001,
    formatMoney(player.cash - playerBefore),
  );
  void rivalBefore;
}

// ---- 3. Devralma ----
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Borsa AŞ' }));
  const state = engine.getState();
  const player = getPlayer(state);
  player.cash = 400_000_000;
  const targetId = NPC_PROFILES[0]!.id;
  for (let day = 1; day <= 250; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }

  const targetName = state.companies[targetId]!.name;
  const targetBuildings = Object.values(state.buildings).filter((b) => b.companyId === targetId).length;
  const targetTiles = state.map.tiles.filter((t) => t.ownerId === targetId).length;
  const price = sharePrice(state, targetId);
  const ownBefore = Object.values(state.buildings).filter((b) => b.companyId === player.id).length;

  // Azınlık hissedar kur: ikinci bir rakip de biraz alsın.
  const minorityId = NPC_PROFILES[1]!.id;
  const minority = state.companies[minorityId]!;
  minority.cash = 50_000_000;
  buyShares(state, minorityId, targetId, 500);
  const minorityCashBefore = minority.cash;

  const cost = price * 5_100;
  const bought = engine.dispatch({ type: 'BUY_SHARES', companyId: targetId, count: 5_100 });
  expect('kontrol payı satın alınabiliyor', bought.ok, bought.reason ?? formatMoney(cost));
  console.log(`  ${targetName} devralma maliyeti: ${formatMoney(cost)} (%51 · ${targetBuildings} bina)`);

  engine.runDay();

  expect('devralınan şirket oyundan çıkıyor', state.companies[targetId] === undefined, targetName);
  const ownAfter = Object.values(state.buildings).filter((b) => b.companyId === player.id).length;
  expect('binalar devralana geçiyor', ownAfter === ownBefore + targetBuildings,
    `${ownBefore} → ${ownAfter} (+${targetBuildings})`);
  expect('devralınan şirkete ait bina kalmıyor',
    Object.values(state.buildings).every((b) => b.companyId !== targetId), 'temiz');
  expect('parseller devralana geçiyor',
    state.map.tiles.filter((t) => t.ownerId === targetId).length === 0,
    `${targetTiles} parsel devredildi`);
  expect('azınlık hissedar nakde çevrildi', minority.cash > minorityCashBefore,
    formatMoney(minority.cash - minorityCashBefore));
  expect('kimsenin elinde ölü şirketin hissesi kalmıyor',
    Object.values(state.companies).every((c) => (c.shares[targetId] ?? 0) === 0), 'temiz');
  expect('devralma haberi düşüyor',
    state.news.some((n) => n.title.includes('devraldı')),
    state.news.find((n) => n.title.includes('devraldı'))?.title ?? '—');
}

// ---- 4. Devralma bir KAÇAK değil: ucuza şirket alınamıyor ----
{
  const engine = new GameEngine(createNewGame({ seed: 33, companyName: 'Borsa AŞ' }));
  const state = engine.getState();
  getPlayer(state).cash = 400_000_000;
  for (let day = 1; day <= 250; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }

  const targetId = NPC_PROFILES[0]!.id;
  const target = state.companies[targetId]!;
  const cost = sharePrice(state, targetId) * TOTAL_SHARES * 0.51;
  const ratio = cost / Math.max(1, target.netWorth);
  console.log(
    `  %51 maliyeti ${formatMoney(cost)} · hedefin net değeri ${formatMoney(target.netWorth)} · oran ${ratio.toFixed(2)}`,
  );
  // Tasarım hedefi: net değerin %50–90'ı (güvene göre). Bunun altına
  // inerse şirket toplamak bedava para basmak olurdu.
  expect('devralma bedavaya gelmiyor', ratio > 0.35, `oran ${ratio.toFixed(2)}`);
}

// ================================================================
//  PARSEL GETİRİSİ — oyunun kıt kaynağı para değil toprak
// ================================================================
//
// Bu bölüm Tur 7'nin bulgusunu SABİTLİYOR. Ölçüm şunu gösterdi:
// sınırsız nakitle koşulan bir oyunda bile karşılanmayan talep %52'de
// kalıyor ve 1200 denemenin 1167'sinde "boş parsel yok" çıkıyor. Yani
// kısıt sermaye değil parsel.
//
// Bir bina bir parsel kapladığına göre doğru ölçüt paranın getirisi
// (geri ödeme) değil PARSELİN getirisi (günlük kâr). İkisi aynı şeyi
// söylemiyor: geri ödeme dar bir aralıkta düz, parsel başına kapasite
// ise 41 kat değişiyor.
console.log('\n--- parsel getirisi ---');
{
  const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Parsel AŞ' }));
  const state = engine.getState();
  const player = getPlayer(state);
  player.cash = 50_000_000;
  player.netWorth = 50_000_000;
  for (let day = 1; day <= 60; day++) engine.runDay();

  const district = state.districts.find((d) => d.archetype === 'mid_residential')!;
  const ranked = rankedBuildOptions(state, district.id);
  const buildable = ranked.filter((r) => r.unlocked && r.affordable && r.estimate?.direct);

  // Kilitli ya da pahalı seçenekler listenin sonuna düşmeli: tepede
  // bugün dokunamayacağın bir bina durması tavsiye değil.
  const reachable = ranked.filter((r) => r.unlocked && r.affordable).length;
  const firstUnreachable = ranked.findIndex((r) => !(r.unlocked && r.affordable));
  expect(
    'kilitli ve pahalı seçenekler listenin sonunda',
    firstUnreachable === -1 || firstUnreachable === reachable,
    `${reachable} ulaşılabilir seçenek, ilk ulaşılamayan ${firstUnreachable}. sırada`,
  );

  const profits = buildable.map((r) => r.estimate!.dailyProfit);
  const sortedByProfit = profits.every((value, i) => i === 0 || profits[i - 1]! >= value);
  expect('sıralama günlük kâra göre azalan', sortedByProfit,
    profits.slice(0, 3).map((p) => formatMoney(p)).join(' > '));

  const best = ranked.find((r) => r.bestPick);
  expect('en iyi seçim işaretleniyor ve en kârlı olan',
    Boolean(best) && best!.estimate!.dailyProfit === Math.max(...profits),
    best ? `${best.def.name} · ${formatMoney(best.estimate!.dailyProfit)}/gün` : 'yok');

  // BULGUNUN KENDİSİ: geri ödemeye göre sıralamak farklı bir bina
  // seçtiriyor. Bu iki sıralama bir gün aynı çıkarsa ya kalibrasyon
  // değişmiştir ya da bulgu geçersizleşmiştir — ikisi de bilinmeli.
  const byPayback = [...buildable].sort(
    (a, b) => a.estimate!.paybackDays - b.estimate!.paybackDays,
  );
  const paybackPick = byPayback[0]!;
  expect(
    'geri ödemeye göre seçmek FARKLI bina seçtiriyor',
    paybackPick.def.id !== best?.def.id,
    `geri ödeme → ${paybackPick.def.name} (${paybackPick.def.capacity} kapasite) · ` +
      `parsel getirisi → ${best?.def.name} (${best?.def.capacity} kapasite)`,
  );
  expect(
    'parsel getirisi daha yüksek kapasiteli binayı seçiyor',
    (best?.def.capacity ?? 0) > paybackPick.def.capacity,
    `${paybackPick.def.capacity} → ${best?.def.capacity} birim`,
  );

  // Yapısal tavan: harita kendi nüfus tavanının talebini karşılayabilmeli.
  // Karşılayamıyorsa hiçbir strateji doygunluğa ulaşamaz.
  const plots = state.map.tiles.filter((t) => t.kind === 'plot').length;
  const ceilingRatio =
    state.districts.reduce((s, d) => s + DISTRICT_ARCHETYPES[d.archetype].population * 2.6, 0) /
    state.districts.reduce((s, d) => s + d.population, 0);
  let neededPlots = 0;
  for (const category of CONSUMER_CATEGORIES) {
    let demand = 0;
    for (const d of state.districts) demand += (d.demand[category] ?? 0) * ceilingRatio;
    const options = BUILDINGS.filter((b) => b.role === 'outlet' && b.category === category);
    if (!options.length) continue;
    const bestCapacity = Math.max(...options.map((o) => o.capacity));
    neededPlots += Math.ceil(demand / bestCapacity);
  }
  //
  // ABONMAN ORANI — Tur 8'in ölçtüğü sayı.
  //
  // Nüfus tavanındaki talebi karşılamak için gereken parsel sayısının
  // haritadaki parsele oranı. Tur 8 öncesi ~%100'dü: şehir ancak HER
  // parsel kategorisinin en büyük outlet'i olursa doyuyordu, fabrikaya
  // ve dört rakibe yer kalmıyordu.
  //
  // Izgara geometrisi (bölge 8→10, ada 4→5) bunu %57'ye indirdi. Eşik
  // ÇİFT TARAFLI, çünkü iki yönde de bozulabilir:
  //
  //   üst sınır — %75'i geçerse şehir yine tıkanır
  //   alt sınır — %35'in altına inerse toprak bedava olur ve oyunun
  //               konum kararı anlamını yitirir
  //
  // İkinci sınır olmadan "haritayı büyütmek her zaman iyidir" gibi
  // yanlış bir yöne kayılabilirdi; bu kontrol o yönü kapatıyor.
  const subscription = neededPlots / plots;
  expect(
    'harita nüfus tavanının talebini karşılayabiliyor',
    neededPlots <= plots,
    `gereken ${neededPlots} / mevcut ${plots} parsel — abonman %${Math.round(subscription * 100)}`,
  );
  expect(
    'abonman oranı bandında — ne tıkalı ne bedava',
    subscription >= 0.35 && subscription <= 0.75,
    `abonman %${Math.round(subscription * 100)} (bant %35–%75)`,
  );
  console.log(
    `  NOT: abonman %${Math.round(subscription * 100)} — geriye fabrika, depo ve ` +
      `rakipler için ${plots - neededPlots} parsel kalıyor.`,
  );
}

console.log(`\n=== ${failures === 0 ? 'TÜMÜ GEÇTİ' : `${failures} KONTROL KALDI`} ===`);
process.exit(failures === 0 ? 0 : 1);
