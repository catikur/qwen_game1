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
declare const process: { exit(code: number): never; argv: string[] };

import {
  BUILDINGS,
  BUILDING_BY_ID,
  CRISES,
  STRUCTURES,
  STRUCTURE_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  GOODS_BY_CATEGORY,
  ISSUANCE,
  NPC_PROFILES,
  TEMPERAMENTS,
  getCeoModifiers,
  rootStructureOf,
} from '@capital/content';
import type { CategoryId, ModifierId } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  chainCards,
  companyRanking,
  competitionCards,
  createNewGame,
  districtOpportunity,
  DISTRICT_UNLOCK_DAYS,
  estimateInvestment,
  formatMoney,
  getPlayer,
  goalLadder,
  goodShares,
  isDistrictOpen,
  marketingLeverage,
  rankedBuildOptions,
  researchCeiling,
  routeSignature,
  shelfReach,
  bookValue,
  confidence,
  collectEventModifiers,
  controllerOf,
  freeFloat,
  freightTerminals,
  powerPlants,
  projectUnits,
  rentalOutlook,
  marketCap,
  portfolioValue,
  sharePrice,
  supplyRoutes,
  tilePrice,
  valuationFor,
  TOTAL_SHARES,
  MARKETING_CAP,
  RESEARCH_CAP,
  LEAGUE_DAILY_DAYS,
  LEAGUE_RULE_ROTATION,
  createLeagueGame,
  leagueRule,
} from '../src/index';
import { build, buyTile } from '../src/actions';
import { buyShares } from '../src/systems/equity';
import { PRUNE_MEMORY_DAYS, isPrunable } from '../src/systems/npc';
import { WAGE_PER_JOB } from '../src/systems/labor';
import { overheadMultiplier } from '../src/systems/economy';
import { loanQuote } from '../src/systems/credit';
import { issueQuote } from '../src/systems/issuance';
import { capRemaining, dailyBuyCap, findOrder, orderEstimate } from '../src/systems/orders';
import { cityTrend, holdingNetWorth, raidStatus } from '../src/holding';
import { createScenarioGame } from '../src/scenario';
import { PROJECT_TIMING, SCENARIO_BY_ID } from '@capital/content';
import { projectStandings } from '../src/systems/projects';
import { holdingCities, rivalsLeft } from '../src/systems/scenario';
import { buybackToLock, ownerFraction, sharesHeld, sharesOutstanding } from '../src/systems/equity';
import type { GameEngine as Engine } from '../src/engine';
import type { GameState, RemotePayout } from '../src/types';
import {
  activeProfiles,
  defendAgainstRaids,
  developerStrategy,
  expandOutletsVacantOnly,
  followChainAdvice,
  energyStrategy,
  freightStrategy,
  playerStrategy,
  rivalryStrategy,
} from './proxy';
import { stanceOf, temperamentOf } from '../src/systems/relations';

// Oyuncu vekili ve aktif rakip listesi tek kopya: `./proxy`.

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

/*
 * BÖLÜM SEÇİMİ — hızlı geri bildirim.
 *
 * `pnpm balance imar` yalnızca adında "imar" geçen bölümleri koşar;
 * birden çok süzgeç verilebilir (`pnpm balance borsa devralma`). Süzgeç
 * yoksa hepsi. Her bölüm kendi süresini yazıyor: yavaşlayan bölüm
 * ölçümün kendisinde görünsün, tahminle aranmasın.
 */
const ONLY = process.argv.slice(2).map((arg) => arg.toLocaleLowerCase('tr'));
const timings: Array<[string, number]> = [];
function section(name: string, body: () => void): void {
  const key = name.toLocaleLowerCase('tr');
  if (ONLY.length > 0 && !ONLY.some((filter) => key.includes(filter))) return;
  console.log(`\n=== ${name} ===\n`);
  const started = Date.now();
  body();
  timings.push([name, Date.now() - started]);
}

// Birden çok bölümün ortak düzenekleri.

/**
 * İzole senaryo: rakipsiz, olaysız, sınırsız sermaye, imar takvimi yok.
 *
 * `districtUnlocks: false` şart: laboratuvar ölçümleri (zincir birim
 * maliyet kimliği, geri ödeme penceresi) Tur 1'den beri student/port gibi
 * SABİT bölgeler üzerinde kurulu. İmar takvimi açık olsaydı bu bölgeler
 * kilitli köşe çıkabilir, senaryo hiç kurulamaz ve ölçüm kalibrasyonu
 * değil takvimi ölçerdi.
 */
function labEngine(seed: number): GameEngine {
  const engine = new GameEngine(
    createNewGame({ seed, companyName: 'Lab AŞ', districtUnlocks: false }),
  );
  const state = engine.getState();
  state.flags.npcCompetition = false;
  state.flags.randomEvents = false;
  // Tur 37a: 500 M ₺ kasada servet vergisi stratejiyi değil kasanın büyüklüğünü ölçerdi.
  state.flags.lateCosts = false;
  const lab = getPlayer(state);
  lab.cash = 500_000_000;
  lab.netWorth = 500_000_000;
  return engine;
}

/** Sonsuz geri ödemeyi okunur yazar. */
function fmtDays(days: number): string {
  return Number.isFinite(days) ? `${Math.round(days)} gün` : 'hiç dönmüyor';
}

section('Genel denge', () => {
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

  // Yalnızca imara AÇIK bölgeler: kilitli bölgede kimse kuramadığı için boş
  // talep ~%100 ve sıralamanın tepesine çıkabiliyor. Bölgeler arası erişim
  // Tur 21'de düzelince sıralama değişti ve kontrol kilitli Teknopark'ı
  // seçip hiç bina kuramadan çöktü — önceden açık bölge şans eseri seçiliyordu.
  const district = [...state.districts]
    .filter((d) => isDistrictOpen(state, d.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a))[0]!;
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
// Parsel AÇIK bölgeden seçilir: gün 0'da köşeler kilitli ve bu doğru —
// katalog kontrolünün iddiası "her bina bir yerde kurulabilir", "her
// bina limanda kurulabilir" değil (üretim için sanayi hep açık).
const engine = new GameEngine(createNewGame({ seed: 5 }));
const player = getPlayer(engine.getState());
player.cash = 50_000_000;
player.netWorth = 50_000_000;
let built = 0;
for (const def of BUILDINGS) {
  const s = engine.getState();
  const tile = s.map.tiles.find((t) => {
    if (t.kind !== 'plot' || t.ownerId || t.structureId || t.buildingId) return false;
    if (!isDistrictOpen(s, t.districtId)) return false;
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
//
// Doku oranları AÇIK şehirden ölçülür: kilitli köşeler bilerek boş
// (açılınca kurulacak arazi onlar) ve pazarda değiller — onları saymak
// "bol arsa var" yalanı söylerdi. Kilitli taraf ayrıca raporlanır.
{
  const state = createNewGame({ seed: 3 });
  const openTiles = state.map.tiles.filter((t) => isDistrictOpen(state, t.districtId));
  const lockedTiles = state.map.tiles.length - openTiles.length;
  const roads = openTiles.filter((t) => t.kind === 'road').length;
  const civic = openTiles.filter((t) => t.kind === 'civic').length;
  const occupied = openTiles.filter((t) => t.kind === 'plot' && t.structureId).length;
  const vacant = openTiles.filter((t) => t.kind === 'plot' && !t.structureId).length;

  console.log(
    `\nAçık şehir dokusu: ${roads} sokak, ${civic} kamu, ${occupied} dolu parsel, ` +
      `${vacant} boş parsel (açık ${openTiles.length} + kilitli ${lockedTiles} kare)`,
  );
  /*
   * KURULUŞ ARTIK SEYREK — ve bu bir gerileme değil, Tur 16'nın kararı.
   *
   * Eskiden bu satır "açık şehrin çoğu zaten dolu (>%70)" diyordu ve
   * doğruydu: harita gün 0'da bitmiş bir dekordu. Şehir zamanla
   * geliştiğine göre kuruluşun ölçüsü de değişti — bant, "kasaba ama
   * boş arazi değil" aralığını koruyor. Kıtlığın kendisi kaybolmadı,
   * ZAMANA yayıldı; yoğunlaşmanın gerçekten yaşandığı aşağıdaki
   * "Şehir zamanla gelişiyor" bölümünde ölçülüyor.
   */
  const seedDensity = occupied / (occupied + vacant);
  expect(
    'kuruluşta şehir bir kasaba: seyrek ama boş değil',
    seedDensity >= 0.18 && seedDensity <= 0.45,
    `açık parsellerin %${Math.round(seedDensity * 100)}'i dolu (${roads} sokak, ${civic} kamu)`,
  );
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
    'kuruluşta genişlemeye yer var',
    vacantShare >= 0.55 && vacantShare <= 0.85,
    `${vacant}/${plots} açık parsel boş — %${Math.round(vacantShare * 100)}`,
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

  const occupied = s.map.tiles.find(
    (t) => t.kind === 'plot' && t.structureId && isDistrictOpen(s, t.districtId),
  )!;
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

});

section('Tedarik zinciri', () => {
// ---------------------------------------------------------------- Zincir
//
// Tur 1'in asıl sınavı. Dört soruyu ayrı ayrı cevaplıyoruz:
//   1. Zincir kurmamış oyuncunun ekonomisi zincir öncesiyle aynı mı?
//   2. Zincir gerçekten marj açıyor mu, ne kadar sürede geri dönüyor?
//   3. Aşırı üretim cezalandırılıyor mu (spot fiyat kırılıyor mu)?
//   4. Tedarik krizi zinciri olmayanı vurup olanı es geçiyor mu?


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

// ---- 5b. Fırsat maliyeti freni (§4.8): tempo, yasak değil ----
//
// Sınanan üç şey: (1) taze bir üniteden hemen sonra, iyi mağaza fırsatı
// varken kart SIRADAKİ üniteyi erteliyor; (2) erteleme premature değil
// (iki durum ayrı sorulara cevap); (3) tempo dolunca — başka hiçbir şey
// değişmeden — aynı hamle öneriye dönüyor. Üçüncüsü durum ameliyatıyla
// (builtDay geri çekilir): 45 gün koşmak aynı şeyi daha yavaş ve daha
// gürültülü sınardı.
{
  const engine2 = new GameEngine(createNewGame({ seed: 65, companyName: 'Fren AŞ' }));
  const s = engine2.getState();
  s.flags.raids = false;
  const player = getPlayer(s);
  player.cash = 30_000_000;
  player.netWorth = 30_000_000;

  for (let i = 0; i < 6; i++) place(engine2, 'cafe', 'mid_residential');
  for (let i = 0; i < 30; i++) engine2.runDay();
  place(engine2, 'coffee_estate', 'industrial');

  const freshCard = chainCards(s, player.id)[0];
  const freshMove = freshCard?.move;
  expect(
    'taze üniteden sonra kart sıradakini erteliyor',
    Boolean(freshMove && !freshMove.premature && freshMove.deferred),
    freshMove
      ? `${freshMove.name}: premature=${freshMove.premature} deferred=${freshMove.deferred}`
      : 'hamle yok',
  );
  expect(
    'erteleme gerekçesi fırsat maliyetini söylüyor',
    (freshMove?.reason ?? '').includes('acelesi yok'),
    freshMove?.reason ?? '',
  );

  // Tempo çapasını geriye çek: son ünite 50 gün önce kurulmuş olsun.
  for (const building of Object.values(s.buildings)) {
    if (building.companyId !== player.id) continue;
    if (BUILDING_BY_ID[building.defId]?.role === 'extract') building.builtDay -= 50;
  }
  const pacedMove = chainCards(s, player.id)[0]?.move;
  expect(
    'tempo dolunca aynı hamle öneriye dönüyor',
    Boolean(pacedMove && !pacedMove.premature && !pacedMove.deferred),
    pacedMove
      ? `${pacedMove.name}: premature=${pacedMove.premature} deferred=${pacedMove.deferred}`
      : 'hamle yok',
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
  /*
   * PENCERE 560 GÜNDE KALIYOR — ve bu bir REJİM kararı.
   *
   * Tur 16'da seed 42 kırılınca iki "düzeltme" denendi, ikisi de ölçtüğü
   * şeyi değiştirdi:
   *
   *   ufuk 900 gün → oyuncu 28-46 M ₺'ye çıkıyor ve deney NAKİT KISITLI
   *   rejimden BOL NAKİT rejimine geçiyor; zincir üç tohumda da
   *   kaybediyor (−%21). Bu yeni bir bulgu değil, benchmark'ın yıllardır
   *   yazdığı satır: "bol nakitle parseli outlet'le doldurmak zinciri
   *   geçer". Zincirin yeri erken-orta oyun.
   *
   *   districtUnlocks: false → harita baştan açık, arazi bollaşıyor,
   *   oyuncu 77-85 M ₺ ile yine bol nakit rejimine düşüyor (−%10).
   *   Takvimi kapatmak ortamı düzeltmiyor, başka bir ortam kuruyor.
   *
   * Kalan gerçek sorun basit ve dar: bazı tohumlarda sanayi 520. güne
   * kadar kilitli, zincir kurulamıyor. Cevabı pencereyi değil KONTROLÜ
   * düzeltmek — kurulamamış bir zincir ölçülemez (aşağıda).
   */
  interface StrategyRun {
    netWorth: number;
    profit: number;
    chain: number;
  }

  const CHAIN_AB_DAYS = 560;
  const CHAIN_AB_TAIL_START = 440;

  function runStrategy(seed: number, useChain: boolean): StrategyRun {
    const engine2 = new GameEngine(createNewGame({ seed, companyName: 'Test AŞ' }));
    /*
     * DÖNEMLER KAPALI, KISA OLAYLAR AÇIK — ve bu ayrım bir ölçümün ta
     * kendisi. İlk düzeltme denemesi ikisini birden kapatmıştı ve zincir
     * 0/3'e düştü (−%3): meğer +%12'lik avantajın bir kısmı kısa krizlere
     * karşı SİGORTA değeriymiş — "Çip Krizi"nde pazardan alan zamma
     * yakalanır, zinciri olan kendi maliyetiyle üretir. Olayları kapatmak
     * zincirin sigortaladığı riski de silmişti; mekanizmayı riskiyle
     * birlikte sınamak gerekiyor.
     *
     * Dönemler ise farklı: 240 günlük bir mevsim 60 günlük kuyruk
     * penceresine bütünüyle oturuyor ve kıyası iklim belirliyor —
     * Sıkılaşma'da fazla kapasite gerçekten yüke dönüyor (bu bir oyun
     * derinliği, benchmark'ın konusu). Bu kontrolün sorusu mekanizma:
     * o yüzden yalnızca dönemler dışarıda.
     */
    engine2.getState().flags.eras = false;
    /*
     * Baskınlar da kapalı — dönemlerle aynı gerekçenin daha serti:
     * NPC-NPC devralmaları kollar arasında YAPISAL fark yaratıyor (bir
     * kolda rakip 370. günde yutuluyor, ötekinde yaşıyor) ve 60 günlük
     * kuyruk penceresi iki farklı rakip manzarasını kıyaslıyor. Kısa
     * olaylar gürültü, devralma kalıcı — gürültü eşlemede sönümlenir,
     * yapısal fark sönümlenmez.
     */
    engine2.getState().flags.raids = false;
    /*
     * Meclis de kapalı — aynı ailenin üçüncü üyesi. Önergeler dışsal
     * zardan geliyor ama SONUÇ lobiden doğuyor ve lobi kolların pazar
     * payına bakıyor: bir kolda kategori vergisi geçip ötekinde
     * reddedilince kuyruk penceresi iki farklı vergi rejimini kıyaslıyor.
     * Ölçüldü: meclis açıkken zincir farkı +%29'dan +%1'e iniyordu —
     * zincir değil kararlar ayrışıyordu.
     */
    engine2.getState().flags.council = false;
    /*
     * İşgücü ve banka da kapalı (Tur 18) — aynı aile. Grev 12 günlük
     * kesikli bir şok ve kolların çalışan sayısı farklı olduğu için
     * baskı farklı günlerde doluyor; rakip kredisi ve haczi de kollar
     * arasında farklı rakip manzarası kuruyor. Ölçüldü: açıkken iki
     * tohum "sanayi geç açıldı" ölçüm dışına düşüyordu.
     */
    engine2.getState().flags.labor = false;
    engine2.getState().flags.credit = false;
    // Rakip ihracı da (Tur 19): kolların rakip manzarasını ayırıyor.
    engine2.getState().flags.issuance = false;
    let tail = 0;
    for (let day = 1; day <= CHAIN_AB_DAYS; day++) {
      if (day % 5 === 0) {
        /*
         * KOL FARKI TEK: bugünün zincir tavsiyesini izlemek.
         *
         * Genişleme politikası iki kolda da aynı ve dondurulmuş
         * (`expandOutletsVacantOnly`) — deneyin kıyaslanabilirliği
         * oradan geliyor. Zincir kolu ise ARTIK GÜNCEL kartı izliyor
         * (Tur 15 freni dahil).
         *
         * Frensiz kopya (eski `followChainAdviceFrozen`, artık silindi)
         * 560 günlük pencerede kalibre edilmişti; ufuk 900 güne çıkınca ölçüm onun kusurunu
         * gösterdi: frensiz tavsiye 11-24 ünite biriktirip üç tohumda da
         * kaybediyor (−%22). Yani uzun pencerede o kol "zincir
         * kazandırıyor mu"yu değil "§4.8 sarmalı hâlâ zararlı mı"yı
         * ölçüyordu — cevabı bilinen ve düzeltilmiş bir soru.
         *
         * Deney bugün oyuncunun gördüğü tavsiyeyi sınıyor; kartın eski
         * hâlini korumak, ölçtüğü şeyi kaybetmek pahasına bir tarih
         * kaydı tutmak olurdu.
         *
         * ZİNCİR VE MAĞAZA AYNI TİKTE (Tur 25) — `playerStrategy`'nin
         * Tur 14'te öğrendiği ders, burada geç uygulandı. Eskiden
         * `if (!zincir) mağaza` idi: zincir hamlesi olan hafta mağaza
         * açılmıyordu, yani zincirli kol hem ünite ekliyor HEM mağaza
         * eksiltiyordu (10-11 ünite = 10-11 eksik mağaza). Deney "kartı
         * izlemek kazandırıyor mu"yu değil "bir ünite bir mağazadan iyi
         * mi"yi soruyordu. Nakit ve parsel kısıtı yerinde: ünite parasını
         * ve parselini mağazadan önce alıyor, mağaza kalan bütçeyle kuruluyor.
         */
        if (useChain) followChainAdvice(engine2);
        expandOutletsVacantOnly(engine2);
      }
      engine2.runDay();
      /*
       * Kuyruk 120 gün — ama İLERİ doğru uzatılmış (440-560), geriye
       * değil. İlk deneme 380'den başlatmıştı ve Tur 8'in horizon dersini
       * çiğniyordu: zincirin geri ödemesi ~190 gün, erken pencere henüz
       * amorti olmamış üniteleri ölçüyor ve avantajı yarıya gösteriyordu
       * (tohumlar arası fark da büyüyordu, çünkü kolların kuruluş
       * temposu farklı). Uzun pencere olay gürültüsünü eşitliyor, geç
       * başlangıç olgun zinciri ölçüyor.
       */
      if (day > CHAIN_AB_TAIL_START) tail += getPlayer(engine2.getState()).today.profit;
    }
    const s = engine2.getState();
    const player = getPlayer(s);
    const chain = Object.values(s.buildings).filter((b) => {
      if (b.companyId !== player.id) return false;
      const def = BUILDING_BY_ID[b.defId];
      return def?.role === 'extract' || def?.role === 'process';
    }).length;
    return { netWorth: player.netWorth, profit: tail / (CHAIN_AB_DAYS - CHAIN_AB_TAIL_START), chain };
  }

  console.log(`\n--- zincir kartını izleyen vs izlemeyen (${CHAIN_AB_DAYS} gün) ---`);

  const seedRows: Array<{ seed: number; plain: StrategyRun; chained: StrategyRun }> = [];
  for (const seed of [1, 7, 42]) {
    const plain = runStrategy(seed, false);
    const chained = runStrategy(seed, true);
    seedRows.push({ seed, plain, chained });
    console.log(
      `  seed ${String(seed).padStart(2)} | zincirsiz ${formatMoney(plain.netWorth).padStart(11)} · ${formatMoney(plain.profit).padStart(9)}/gün` +
        ` | zincirli ${formatMoney(chained.netWorth).padStart(11)} · ${formatMoney(chained.profit).padStart(9)}/gün · ${chained.chain} ünite`,
    );
  }

  /*
   * ÖNKOŞUL AÇIKÇA YAZILIYOR: zincir KURULABİLDİĞİ tohumlarda kazanmalı.
   *
   * İmar takvimi bazı tohumlarda sanayiyi 520. güne kadar kilitliyor;
   * o koşuda zincir kolu 3 ünitede kalıyor ve ölçüm mekanizmayı değil
   * mekanizmanın yokluğunu tartıyor. Böyle bir tohumu "kayıp" saymak,
   * kurulamamış bir fabrikanın kâr etmemesine şaşırmak olurdu.
   *
   * Eşik 2 ünite: bir zincirin var olabildiği en küçük sayı (hammadde +
   * işleme). Tur 15 freni üniteleri 45 günlük tempoya bağladığı için
   * sayılar zaten küçük; eşiği yükseltmek ölçümü değil örneklemi
   * kısıtlardı. Atlanan tohum sessizce düşmüyor,
   * detayda adıyla yazılıyor — "temiz" diyen bir kontrolün yalan
   * söyleyebileceğini Tur 13'te öğrendik.
   */
  const established = seedRows.filter((row) => row.chained.chain >= 2);
  const skipped = seedRows.filter((row) => row.chained.chain < 2);

  /*
   * ORTALAMA DA ÖLÇÜM DIŞI TOHUMLARI SAYMIYOR.
   *
   * İlk sürüm toplamı bütün tohumlardan alıyordu: rapor "seed 42 ölçüm
   * dışı" derken aynı tohum ortalamayı aşağı çekmeye devam ediyordu —
   * yani kontrol, dışladığını söylediği veriyle karar veriyordu. İki
   * iddia da aynı örneklem üzerinden konuşmalı.
   */
  const establishedPlain = established.reduce((sum, row) => sum + row.plain.profit, 0);
  const establishedChain = established.reduce((sum, row) => sum + row.chained.profit, 0);
  const gain = establishedPlain > 0 ? establishedChain / establishedPlain - 1 : 0;

  /*
   * EŞİK %10'DAN %0'A — ve sebebi bir ölçüm hatası (Tur 21).
   *
   * +%12 / +%19 / +%30 serisi DURAN bir vekille ölçülmüştü: dondurulmuş
   * genişleme kopyası kilitli bölgeleri elemiyor, alımı reddedilince o
   * hafta hiçbir şey kurmuyordu (Tur 14'ten beri). Vekil 560 günde 2–6 M
   * ₺'de kalıyor, zincirin birkaç ünitesi küçük bir tabana göre büyük
   * görünüyordu. Kilit filtresiyle vekil 68–86 M ₺'ye çıktı ve zincirli kol
   * üç tohumda da KAYBETTİ (−%11; main'de de −%5). İki çekirdek hatası
   * buldu: üretim adımı tüketimi kapasiteden ve rafa eşit bölerek sayıyordu
   * (defter üretimden önce sıfırlanıyor), fazla üretim satılmıyordu. Ürün
   * başına gerçek satışla kart isabetli (hamle tahminleri 120 günlük
   * projeksiyonla örtüşüyor) ve zincir her tohumda önde — ama ortalama
   * +%2: boş parsele genişleyen oyuncu için ünite bir mağaza parseli
   * kaplıyor ve parsel başına mağazadan az getiriyor (Tur 7: kıt kaynak
   * toprak). %10'luk eşik yanılsamanın kalibrasyonuydu; iddia "zincir
   * kazandırıyor", her tohumda ayrıca sınanıyor.
   */
  expect(
    'zincir kartını izlemek günlük kârı artırıyor',
    gain > 0,
    `ölçülen ${established.length} tohumda ortalama %${Math.round(gain * 100)} daha yüksek günlük kâr`,
  );
  expect(
    'zincir kurulabilen her tohumda kazandırıyor',
    established.length >= 2 && established.every((row) => row.chained.profit > row.plain.profit),
    `${established.filter((r) => r.chained.profit > r.plain.profit).length}/${established.length} tohum önde` +
      (skipped.length > 0
        ? ` · ölçüm dışı: ${skipped.map((r) => `seed ${r.seed} (${r.chained.chain} ünite — sanayi geç açıldı)`).join(', ')}`
        : ''),
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

});

section('Rekabet kolları', () => {

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
  // Baskınlar kapalı: bu bölüm doktrinlerin İNŞAAT davranışını ölçüyor
  // ve yutulmuş bir rakip hiç kol kuramaz — devralma, ayrışma sinyalini
  // örnekten silip kontrolü kişiliklerle ilgisi olmayan bir sebepten
  // kırıyordu.
  engine.getState().flags.raids = false;
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
  //
  // Şapka 3'ten 6'ya çıktı — ENSTRÜMAN SİNYALİ EZİYORDU: Tur 15'te
  // vekil güçlenince iki kol kuran rakip de 3'ün üstüne çıktı ve
  // `min(x,3)` 3/6 ile 3/4'ü aynı "3/3"e indirip gerçek ayrışmayı
  // (tabloda apaçık) kontrolden sildi. 6, küçük sayıları hâlâ sabit
  // tutarken "yoğun yatırım" farklarını ayırt ediyor.
  const shapes = new Set(rows.map((row) => `${Math.min(row.research, 6)}/${Math.min(row.marketing, 6)}`));
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
      // Motorun formülü: bina kalitesi + CEO kategori bonusu + Ar-Ge, [0,05; 1]
      // aralığında. Tur 25'e kadar bonuslu bir CEO hiçbir kategoriyi
      // önde götürmediği için bonussuz kopya da tutuyordu.
      const leader = state.companies[leaderId]!;
      const ceo = getCeoModifiers(leader.ceoId ?? null);
      const bonus = ceo.categoryQuality?.category === def.category ? ceo.categoryQuality.bonus : 0;
      sum += Math.max(0.05, Math.min(1, def.quality + bonus + (leader.research[card.category] ?? 0)));
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

});

section('Parsel ihalesi', () => {

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
  // Baskınlar kapalı: kasıtlı fakir bırakılan oyuncu ~250. günde yutulup
  // takvimi donduruyor ve 400 günlük sayım 8 ihalede kalıyordu. Senaryo
  // ihale temposunu ölçüyor — baskın kaybedilebilirlik bölümünün konusu.
  state.flags.raids = false;

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


// ================================================================ Borsa
//
// Turun vaadi: rakibini pazarda değil SAHİPLİKTE yenmek. Sorulan şeyler:
// değerleme tutarlı mı, para yaratılıyor mu, devralma kaçak veriyor mu,
// ve hisse almayan oyuncunun ekonomisi bozuluyor mu.

});

section('Borsa', () => {

// ---- 1. Denge kimliği: hisse almayanın ekonomisi değişmiyor ----
{
  const engine = new GameEngine(createNewGame({ seed: 12, companyName: 'Borsa AŞ' }));
  const state = engine.getState();
  getPlayer(state).cash = 40_000_000;
  for (let day = 1; day <= 300; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    engine.runDay();
  }

  /*
   * ESKİ KONTROL "kimse hisse almadıysa portföy tam sıfır" İDİ ve
   * rakipler baskın yapmaya başlayınca ÖNCÜLÜ bozuldu: 160. günden sonra
   * NPC'ler kendiliğinden hisse topluyor, yani 300 günlük koşuda "kimse
   * almadı" varsayımı artık yanlış. Denge kimliğinin kendisi duruyor —
   * hisse TUTMAYAN şirketin portföyü sıfırdır — ve oyuncu bu koşuda hiç
   * almadığı için kimlik onun üzerinden sınanıyor.
   */
  expect(
    'hisse almayan şirketin portföyü tam sıfır',
    portfolioValue(state, getPlayer(state).id) === 0,
    `${portfolioValue(state, getPlayer(state).id)}`,
  );
  // Baskının POZİTİF kanıtı: 300 günde en az bir rakip pay toplamış olmalı.
  let raidedPortfolio = 0;
  for (const company of Object.values(state.companies)) {
    if (!company.isPlayer) raidedPortfolio = Math.max(raidedPortfolio, portfolioValue(state, company.id));
  }
  expect('rakipler kendiliğinden hisse topluyor', raidedPortfolio > 0, formatMoney(raidedPortfolio));

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
  const floatStart = freeFloat(state, targetId);
  // Günlük tavan (Tur 20): oyuncu da rakip gibi günde en fazla zorluğun tavanı kadar alır (Dengeli %4,5, Tur 38'e kadar %3,5).
  const cap = dailyBuyCap(state, targetId);
  const lot = cap - 50;
  const buy = engine.dispatch({ type: 'BUY_SHARES', companyId: targetId, count: lot });
  expect('hisse alınabiliyor', buy.ok, buy.reason ?? `${Math.round(price)} ₺/hisse`);
  expect('nakit doğru düşüyor', Math.abs(cashBefore - player.cash - price * lot) < 1,
    formatMoney(cashBefore - player.cash));
  expect('serbest dolaşım azalıyor', freeFloat(state, targetId) === floatStart - lot,
    `${floatStart} → ${freeFloat(state, targetId)} hisse`);
  const overCap = engine.dispatch({ type: 'BUY_SHARES', companyId: targetId, count: 100 });
  expect('günlük tavanın üstü alınamıyor', !overCap.ok, overCap.reason ?? `tavan ${cap} aşıldı`);

  /*
   * ESKİ KURAL "kendi hisseni alamazsın" idi — tek yönlü borsanın
   * kalıntısı. Baskınlar gelince geri alım tek savunma oldu: hazineye
   * çekilen her hisse dolaşımdan düşer.
   */
  const floatBefore = freeFloat(state, player.id);
  const own = engine.dispatch({ type: 'BUY_SHARES', companyId: player.id, count: 10 });
  expect('geri alım yapılabiliyor', own.ok, own.ok ? '10 hisse hazinede' : ((own as { reason?: string }).reason ?? ''));
  expect('geri alım dolaşımı düşürüyor', freeFloat(state, player.id) === floatBefore - 10,
    `${floatBefore} → ${freeFloat(state, player.id)}`);
  expect('hazine payı kontrol saymıyor', controllerOf(state, player.id) === null, 'kontrol boş');
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

  // Nakit EKSİ borç: kredi taksitinin anaparası kasadan çıkıp borçtan
  // düşüyor — kâra girmeyen ama para da yok etmeyen tek hareket (Tur 18).
  const money = () => Object.values(state.companies).reduce((sum, c) => sum + c.cash - c.debt, 0);
  const totalBefore = money();
  const playerBefore = player.cash;
  const rival = state.companies[targetId]!;
  const rivalBefore = rival.cash;
  engine.runDay();
  const totalAfter = money();
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
  // Azınlık hissedar kur: ikinci bir rakip de biraz alsın.
  const minorityId = NPC_PROFILES[1]!.id;
  const minority = state.companies[minorityId]!;
  minority.cash = 50_000_000;
  buyShares(state, minorityId, targetId, 500);

  /*
   * EMİRLE, GÜNLER İÇİNDE (Tur 20). Eskiden %51 tek komutla alınıyordu.
   * Emir her gün tavan kadar alır; hedef savunabilir. Bu senaryonun hedefi
   * (Nova, genişlemeci) ihraç doktrini olmayan bir rakip: geri alımla
   * savunuyor ama 400 M ₺'lik alıcıya karşı dolaşımı kapatamıyor.
   */
  const estimate = orderEstimate(state, player.id, targetId);
  const placed = engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: targetId });
  expect('devralma emri veriliyor', placed.ok, placed.reason ?? `${estimate.need} hisse · ${formatMoney(estimate.cost)}`);
  // Gün sayısı alım günü sayısı: emrin verildiği gün de alım yapıyor.
  let days = 1;
  let theirIds: string[] = [];
  let theirTiles: number[] = [];
  let minorityCashBefore = minority.cash;
  while (state.companies[targetId] && days < 90) {
    // Son günün fotoğrafı: devir o gün olacak, öncesi iş gürültüsü.
    theirIds = Object.values(state.buildings).filter((b) => b.companyId === targetId).map((b) => b.id);
    theirTiles = state.map.tiles.filter((t) => t.ownerId === targetId).map((t) => t.id);
    minorityCashBefore = minority.cash;
    engine.runDay();
    days += 1;
  }
  console.log(
    `  ${targetName} devralması: ${days} gün (tavanla en az ${estimate.days}) · ` +
      `${estimate.need} hisse, bugünkü fiyattan ${formatMoney(estimate.cost)} · ${targetBuildings} bina`,
  );
  expect('devralma günlere yayılıyor', days >= estimate.days, `${days} gün ≥ ${estimate.days}`);

  expect('devralınan şirket oyundan çıkıyor', state.companies[targetId] === undefined, `${targetName} · ${days} gün`);
  // Son gün hedef bir şube kapatmış olabilir; kalan HER bina devralanın.
  const survivors = theirIds.filter((id) => state.buildings[id]);
  const moved = survivors.filter((id) => state.buildings[id]!.companyId === player.id).length;
  expect('binalar devralana geçiyor', survivors.length > 0 && moved === survivors.length,
    `${moved}/${survivors.length} bina (${theirIds.length - survivors.length} son gün kapandı)`);
  expect('devralınan şirkete ait bina kalmıyor',
    Object.values(state.buildings).every((b) => b.companyId !== targetId), 'temiz');
  expect('parseller devralana geçiyor',
    state.map.tiles.filter((t) => t.ownerId === targetId).length === 0 &&
      theirTiles.every((id) => [player.id, null].includes(state.map.tiles.find((t) => t.id === id)?.ownerId ?? null)),
    `${targetTiles} parsel devredildi`);
  expect('emir devralmayla kapanıyor', !findOrder(state, player.id, targetId), 'kapandı');
  expect('azınlık hissedar nakde çevrildi', minority.cash > minorityCashBefore,
    formatMoney(minority.cash - minorityCashBefore));
  // Detay statik "temiz" idi ve kontrol kırıldığında bile öyle yazıyordu —
  // kırık bir kontrolün detayı SUÇLUYU göstermeli.
  const deadHolders = Object.values(state.companies)
    .filter((c) => (c.shares[targetId] ?? 0) > 0)
    .map((c) => `${c.id}:${c.shares[targetId]}`);
  expect('kimsenin elinde ölü şirketin hissesi kalmıyor', deadHolders.length === 0,
    deadHolders.join(' ') || 'temiz');
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




});

section('Sözleşmeler: dışarıdan gelen hedef', () => {

/*
 * Sözleşme, "en kârlı hamleyi bul" döngüsünün dışına çıkan ilk sebep.
 * Sınanan dört şey: teklif kendiliğinden geliyor, kabul çalışıyor,
 * teslimat ödülü ödüyor, süre aşımı cezayı kesiyor.
 */
{
  // Organik yol: teklifler gerçekten üretiliyor mu?
  const engine = new GameEngine(createNewGame({ seed: 9, companyName: 'Taahhüt AŞ' }));
  const state = engine.getState();
  getPlayer(state).cash = 80_000_000; // baskın yemesin, takvim donmasın
  let offers = 0;
  let seenId = -1;
  for (let day = 1; day <= 400; day++) {
    engine.runDay();
    for (const item of state.news) {
      if (item.id <= seenId) break;
      if (item.title.includes('sözleşme teklifi')) offers++;
    }
    seenId = state.news[0]?.id ?? seenId;
    // Teklifler masada beklemesin: sayaç yalnızca ÜRETİMİ ölçüyor.
    if (state.contractOffer) engine.dispatch({ type: 'DECLINE_CONTRACT' });
  }
  expect('teklifler kendiliğinden geliyor', offers >= 2, `400 günde ${offers} teklif`);

  // Kurgulu yol: inşaat sözleşmesinin tam döngüsü.
  const engine2 = new GameEngine(createNewGame({ seed: 10, companyName: 'Teslimat AŞ' }));
  const s2 = engine2.getState();
  getPlayer(s2).cash = 5_000_000;
  // AÇIK bölge şartı: ilk aday (0 = Liman) artık kilitli köşe olabiliyor
  // ve oradaki kurulum "imara kapalı" kapısından döner. Motorun kendi
  // teklif üreticisi de aynı filtreyi uyguluyor — kurgu gerçeği taklit
  // etmeli.
  const district = s2.districts.find(
    (d) =>
      isDistrictOpen(s2, d.id) &&
      s2.map.tiles.some(
        (t) => t.districtId === d.id && t.kind === 'plot' && !t.buildingId && !t.structureId,
      ),
  )!;
  s2.contractOffer = {
    kind: 'build',
    title: `${district.name} bölgesine 2 Market işletmesi`,
    districtId: district.id,
    category: 'grocery',
    targetCount: 2,
    targetShare: 0,
    durationDays: 120,
    reward: 44_000,
    penalty: 17_600,
    offeredDay: s2.time.day,
    acceptedDay: s2.time.day,
    deadlineDay: s2.time.day + 120,
  };

  const accept = engine2.dispatch({ type: 'ACCEPT_CONTRACT' });
  expect('teklif kabul edilebiliyor', accept.ok, accept.ok ? 'aktif' : (accept as { reason?: string }).reason ?? '');
  expect('kabul teklifi masadan kaldırıyor', !s2.contractOffer && Boolean(s2.contract), 'masada tek kopya');

  /*
   * Ödül İÇERİDE ödeniyor: ikinci bina kurulup gün işlediği anda
   * `runContractTick` teslimatı görüyor ve parayı AYNI runDay içinde
   * yatırıyor. İlk yazdığım kontrol ödemeyi sonraki güne bakarak arıyordu
   * ve "+2125" (sıradan günlük kâr) ölçtü — ödeme çoktan olmuştu.
   * Para hareketi güvenilir pencereye sığmadığı için doğrulama OLAYDAN:
   * teslimat haberi + sözleşmenin kapanması.
   */
  const spots = s2.map.tiles
    .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.buildingId && !t.structureId)
    .slice(0, 2);
  for (const tile of spots) {
    engine2.dispatch({ type: 'BUY_TILE', tileId: tile.id });
    const built = engine2.dispatch({ type: 'BUILD', tileId: tile.id, defId: 'corner_shop' });
    if (!built.ok) console.log('  kurulum hatası:', (built as { reason?: string }).reason);
    engine2.runDay();
  }
  engine2.runDay();
  const delivered = s2.news.find((n) => n.title === 'Sözleşme teslim edildi');
  expect('teslimat ödülü ödeniyor', !s2.contract && Boolean(delivered),
    delivered ? delivered.body : 'teslimat haberi yok');

  // Süre aşımı: hedefi imkânsız bir sözleşme cezayla kapanıyor.
  s2.contract = {
    kind: 'build',
    title: 'imkânsız hedef',
    districtId: district.id,
    category: 'grocery',
    targetCount: 99,
    targetShare: 0,
    durationDays: 3,
    reward: 10_000,
    penalty: 4_000,
    offeredDay: s2.time.day,
    acceptedDay: s2.time.day,
    deadlineDay: s2.time.day + 3,
  };
  // Aynı gerekçe: dükkânların günlük kârı cezayı gölgeliyor (5 günde
  // +10 B ₺ kazanç, −4 B ₺ ceza = net artı). Doğrulama olaydan.
  for (let i = 0; i < 5; i++) engine2.runDay();
  const expired = s2.news.find((n) => n.title === 'Sözleşme süresi doldu');
  expect('süre aşımı cezayı kesiyor', !s2.contract && Boolean(expired),
    expired ? expired.body : 'süre aşımı haberi yok');
}

});

section('Dönemler: şehrin makro iklimi', () => {

/*
 * "Oyun bir süre sonra tekrara düşüyor" şikâyetinin cevaplarından biri:
 * 300. gün ile 900. gün aynı zeminde oynanmasın. Sınanan üç kural —
 *
 *   1. dönem HEP vardır: ilk dönem 60. gün civarında başlar, biten
 *      dönemin yerine anında yenisi gelir (iklimsiz gün yok)
 *   2. aynı dönem üst üste gelmez (mevsimin işi değişim)
 *   3. kapanış 20 gün önceden haber verilir (dönem sonu plan penceresi)
 */
{
  const engine = new GameEngine(createNewGame({ seed: 77, companyName: 'İklim AŞ' }));
  const state = engine.getState();
  // Oyuncu güçlü tutuluyor: boştaki oyuncu ~500. günde devralınıyor ve
  // takvim donunca dönemler de duruyor — bu test iklimi ölçüyor,
  // kaybedilebilirliği değil (o bir sonraki bölümün işi).
  getPlayer(state).cash = 120_000_000;

  const eraLog: string[] = [];
  let closingNotices = 0;
  let gapDays = 0;
  let seenId = -1;
  for (let day = 1; day <= 1500; day++) {
    engine.runDay();
    if (day >= 61 && !state.era) gapDays++;
    if (state.era && eraLog[eraLog.length - 1] !== state.era.defId) eraLog.push(state.era.defId);
    for (const item of state.news) {
      if (item.id <= seenId) break;
      if (item.title.includes('kapanıyor')) closingNotices++;
    }
    seenId = state.news[0]?.id ?? seenId;
  }

  expect('ilk dönem 60. gün civarında başlıyor', eraLog.length > 0 && gapDays === 0,
    `${eraLog.length} dönem, iklimsiz gün ${gapDays}`);
  expect('1500 günde en az 4 dönem yaşanıyor', eraLog.length >= 4, eraLog.join(' → '));
  const repeated = eraLog.some((id, i) => i > 0 && eraLog[i - 1] === id);
  expect('aynı dönem üst üste gelmiyor', !repeated, eraLog.join(' → '));
  expect('dönem kapanışları önceden haber veriliyor', closingNotices >= eraLog.length - 1,
    `${closingNotices} uyarı / ${eraLog.length} dönem`);

  // Çarpan boru hattı: dönemin talep çarpanı birleşik etkiye giriyor.
  //
  // Aktif OLAYLAR önce temizleniyor: kontrol dönemin katkısını ölçüyor
  // ve o an yaşayan bir tüketim patlaması (yeme-içme ×1,22) dönemin
  // 0,88'ini 1,07'ye çevirip kontrolü yalancı çıkarabiliyor — çıkardı da:
  // sözleşme sistemi rng akışını kaydırınca tam o güne bir olay denk
  // geldi ve kontrol kırıldı. Paylaşılan rng'ye yaslanan her kontrol,
  // akıştaki her yeni tüketiciyle kayar; yalıtım şart.
  //
  // Canlı pazar da (Tur 37d) aynı çarpana giriyor ve dönemden bağımsız:
  // seed 77'de oyun 1297. günde donuyor, o gün yeme-içme eğilim ve mevsimle
  // ×1,17 ve dönemin 0,88'i birleşikte 1,03 çıkıyordu. Dönemin katkısı,
  // dönemli ve dönemsiz çarpanın oranı; canlı pazar ikisinde de aynı.
  state.activeEvents.length = 0;
  state.era = undefined;
  const calm = collectEventModifiers(state).demand.dining ?? 1;
  state.era = { defId: 'era_sikilasma', startedDay: state.time.day, remainingDays: 100 };
  const mods = collectEventModifiers(state);
  const eraFactor = (mods.demand.dining ?? 1) / calm;
  expect('dönem çarpanı pazara ulaşıyor', eraFactor < 1,
    `yeme-içme çarpanı ${eraFactor.toFixed(2)} (canlı pazarla birlikte ${(mods.demand.dining ?? 1).toFixed(2)})`);
}

});

section('Düşmanca devralma: oyun kaybedilebiliyor', () => {

/*
 * Oyunun bugüne kadarki en büyük eksiği ölçülebilir bir cümleydi:
 * benchmark her koşuda "batan şirket 0/5" diyordu — kaybetme riski
 * olmayan bir büyümenin gerilimi de olmuyordu.
 *
 * Senaryo kasıtlı olarak eğik: oyuncu küçük kalıyor, bir rakip nakit
 * zengini. Sınanan zincir üç halka —
 *
 *   1. baskın eşik uyarıları SIRAYLA düşüyor (%10 → %25 → %40); oyuncu
 *      kaybı gelirken görmeli, bitince öğrenmemeli
 *   2. eşik aşılınca `gameOver` doluyor ve oyuncu şirketi SİLİNMİYOR
 *      (arayüz son duruma bakmaya devam edebilmeli)
 *   3. takvim duruyor — kaybedilmiş oyunda günler akmaya devam etmiyor
 */
{
  const engine = new GameEngine(createNewGame({ seed: 41, companyName: 'Av AŞ' }));
  const state = engine.getState();
  const raiderId = NPC_PROFILES[0]!.id;
  state.companies[raiderId]!.cash = 60_000_000;

  /*
   * Uyarılar KOŞU SIRASINDA toplanıyor, sondan okunmuyor. İlk sürüm
   * bitişte `state.news`e bakıyordu ve "1 uyarı" diye kırıldı — haber
   * tamponu 60 kayıt tutuyor ve 500 günlük koşuda erken uyarılar çoktan
   * dışarı itilmişti. Tampon bir EKRAN aracı, olay kaydı değil; kalıcı
   * bir şey sınanacaksa akarken yakalanmalı.
   */
  const warnings: { title: string; companyId?: string }[] = [];
  let seenNewsId = -1;
  for (let day = 1; day <= 900 && !state.gameOver; day++) {
    engine.runDay();
    // Haberler tamponda YENİDEN ESKİYE duruyor; günün yenilerini önce
    // kendi içinde eskiden yeniye çevirip sona ekliyoruz — yoksa günler
    // arası sıra tersine döner ve kontrol kendi topladığı listeyi yanlış
    // diye işaretler (ilk koşuda tam olarak bu oldu).
    const fresh: { title: string; companyId?: string }[] = [];
    for (const item of state.news) {
      if (item.id <= seenNewsId) break;
      if (
        item.title.includes('göz dikti') ||
        item.title.includes('payını') ||
        item.title.includes('kontrolüne yaklaşıyor')
      ) {
        fresh.unshift({ title: item.title, ...(item.companyId ? { companyId: item.companyId } : {}) });
      }
    }
    warnings.push(...fresh);
    seenNewsId = state.news[0]?.id ?? seenNewsId;
  }
  expect('baskın uyarıları düşüyor', warnings.length >= 3, `${warnings.length} uyarı`);
  const ordered =
    warnings.findIndex((n) => n.title.includes('göz dikti')) <
      warnings.findIndex((n) => n.title.includes('payını')) &&
    warnings.findIndex((n) => n.title.includes('payını')) <
      warnings.findIndex((n) => n.title.includes('kontrolüne yaklaşıyor'));
  expect('uyarılar eşik sırasında', ordered,
    warnings.map((n) => n.title.split(' ').slice(-2).join(' ')).join(' → '));
  /*
   * Yüz kontrolü "hep aynı baskıncı" DEMİYOR — birden fazla rakip aynı
   * anda pay topluyor ve en büyük hissedar el değiştirebiliyor; uyarı o
   * anki lideri gösterir. Sınanan şey her uyarının BİR yüz taşıması.
   */
  expect('uyarılar bir baskıncının yüzünü taşıyor', warnings.every((n) => Boolean(n.companyId)),
    warnings.map((n) => n.companyId).join(', '));

  expect('devralma oyunu bitiriyor', Boolean(state.gameOver),
    state.gameOver ? `${state.gameOver.day}. gün, ${state.companies[state.gameOver.byCompanyId]?.name}` : 'bitmedi');
  expect('oyuncu şirketi silinmiyor', Boolean(state.companies[state.playerCompanyId]), 'duruyor');

  const frozenDay = state.time.day;
  engine.runDay();
  engine.runDay();
  expect('kaybedilmiş oyunda takvim duruyor', state.time.day === frozenDay, `gün ${state.time.day}`);
}

});

section('Kademeli imar: arazi kıtlığı yenileniyor', () => {

/*
 * Sınanan iddia üç katmanlı:
 *
 *   1. YAPI — köşeler kilitli başlar, takvim `DISTRICT_UNLOCK_DAYS`
 *   2. KURAL — açılıştan önce O BÖLGEYE HİÇ KİMSE giremez (oyuncu, NPC,
 *      ihale; hepsi aynı kapıdan geçtiği için ihlal tek sayıyla ölçülür)
 *   3. YAŞAM — açılış duyurulur, haber olur, göç gelir, parsel satılır
 */
{
  const engine3 = new GameEngine(createNewGame({ seed: 19, companyName: 'İmar AŞ' }));
  const state = engine3.getState();
  // Baskın değil harita sınanıyor: atıl oyuncu 560 günde yutulup takvimi
  // dondurabilirdi — `flags.raids` tam bu tür eşli/izole ölçümler için var.
  state.flags.raids = false;

  const locked = state.districts.filter((d) => d.opensOnDay !== undefined);
  expect(
    'köşe bölgeler kilitli başlıyor',
    locked.length === 4,
    locked.map((d) => `${d.name}@${d.opensOnDay}`).join(', '),
  );
  const unlockDays = locked.map((d) => d.opensOnDay!).sort((a, b) => a - b);
  expect(
    'açılış takvimi kademeli',
    JSON.stringify(unlockDays) === JSON.stringify(DISTRICT_UNLOCK_DAYS),
    unlockDays.join(', '),
  );

  const firstDistrict = locked.reduce((a, b) => (a.opensOnDay! < b.opensOnDay! ? a : b));
  const lastDistrict = locked.reduce((a, b) => (a.opensOnDay! > b.opensOnDay! ? a : b));
  const imarPlayer = getPlayer(state);
  imarPlayer.cash = 30_000_000;
  imarPlayer.netWorth = 30_000_000;

  const vacantPlotIn = (districtId: number) =>
    state.map.tiles.find(
      (t) => t.districtId === districtId && t.kind === 'plot' && !t.ownerId && !t.structureId,
    );

  const early = engine3.dispatch({ type: 'BUY_TILE', tileId: vacantPlotIn(firstDistrict.id)!.id });
  expect(
    'kilitli parsel satın alınamıyor',
    !early.ok && (early.reason ?? '').includes('imara kapalı'),
    early.reason ?? 'alındı!',
  );

  // Haberler ve ihlaller KOŞU SIRASINDA toplanıyor — tampon 60 kayıt,
  // baskın senaryosundaki dersin aynısı.
  let notices = 0;
  let openings = 0;
  let violations = 0;
  let seenNewsId = -1;
  let lateBuy: ReturnType<typeof engine3.dispatch> | null = null;
  for (let day = 1; day <= 560; day++) {
    engine3.runDay();
    // Son bölge açıldığı gün alınabiliyor mu? Açılıştan 160 gün sonra
    // değil: geç oyunda rakipler yeni bölgeyi de dolduruyor (Tur 37a'da
    // yönetim yükü bu tohumda son bölgenin 64 parselini 560. güne kadar
    // bitirdi) — sınanan imar kapısı, arazinin bolluğu değil.
    if (lateBuy === null && state.time.day >= lastDistrict.opensOnDay!) {
      const plot = vacantPlotIn(lastDistrict.id);
      lateBuy = plot
        ? engine3.dispatch({ type: 'BUY_TILE', tileId: plot.id })
        : { ok: false, reason: 'açılış gününde boş parsel yok' };
    }
    for (const item of state.news) {
      if (item.id <= seenNewsId) break;
      if (item.title.includes('İmar planı açıklandı')) notices++;
      if (item.title.includes('imara açıldı')) openings++;
    }
    seenNewsId = state.news[0]?.id ?? seenNewsId;
    for (const district of locked) {
      if (state.time.day >= district.opensOnDay!) continue;
      if (state.map.tiles.some((t) => t.districtId === district.id && t.ownerId !== null)) {
        violations++;
      }
    }
  }

  expect('açılışlar 30 gün önceden duyuruluyor', notices === 4, `${notices}/4 duyuru`);
  expect('her açılış haber oluyor', openings === 4, `${openings}/4 haber`);
  expect(
    'kilitli bölgeye açılıştan önce kimse giremiyor',
    violations === 0,
    violations === 0 ? 'oyuncu + NPC + ihale — 560 günde 0 ihlal' : `${violations} gün×bölge ihlali`,
  );

  const firstArchetype = DISTRICT_ARCHETYPES[firstDistrict.archetype];
  expect(
    'açılan bölgeye göç geliyor',
    firstDistrict.population >= firstArchetype.population * 0.95,
    `${firstDistrict.name} nüfusu ${Math.round(firstDistrict.population)} / taban ${firstArchetype.population}`,
  );

  expect(
    'açılan bölgeden parsel alınabiliyor',
    lateBuy?.ok === true,
    lateBuy?.reason ?? `${lastDistrict.name} — açılış günü alındı`,
  );

  // Laboratuvar kapısı: takvim kapalıyken eski dünya birebir geri gelmeli.
  const flat = createNewGame({ seed: 19, districtUnlocks: false });
  expect(
    'imar takvimi kapatılabiliyor (laboratuvar zemini)',
    flat.districts.every((d) => d.opensOnDay === undefined),
    'tüm bölgeler baştan açık',
  );
}

});

section('Şehir zamanla gelişiyor', () => {

/*
 * Tur 16'nın iddiası: harita bir dekor değil, yaşayan bir yer.
 *
 * Dört hareket sınanıyor — yayılma (boş parseller doluyor), yükselme
 * (yapılar kat kazanıyor), dönüşüm (kademe atlıyor) ve SINIRLAR. Sonuncu
 * en az diğerleri kadar önemli: şehrin oyuncuyla arazi için yarışması
 * istenen bir baskı, oyuncuyu dışarı itmesi değil.
 */
{
  const engine3 = new GameEngine(createNewGame({ seed: 23, companyName: 'Zaman AŞ' }));
  const state = engine3.getState();
  // Baskınlar kapalı: atıl oyuncu yutulup takvim donarsa şehir de durur.
  state.flags.raids = false;
  getPlayer(state).cash = 40_000_000;

  const survey = () => {
    let built = 0;
    let height = 0;
    let civicTiles = 0;
    const forms = new Set<string>();
    for (const tile of state.map.tiles) {
      if (tile.kind === 'civic') civicTiles++;
      if (!tile.structureId) continue;
      built++;
      height += tile.structureHeight;
      const form = STRUCTURE_BY_ID[tile.structureId]?.form;
      if (form) forms.add(form);
    }
    return { built, civicTiles, forms, avgHeight: built > 0 ? height / built : 0 };
  };

  const start = survey();
  const startTiers = new Set(
    state.map.tiles.flatMap((tile) => (tile.structureId ? [tile.structureId] : [])),
  );
  // Oyuncunun parseli: şehir buraya ASLA yapı dikmemeli.
  const ownedTile = state.map.tiles.find(
    (t) => t.kind === 'plot' && !t.structureId && !t.ownerId && isDistrictOpen(state, t.districtId),
  )!;
  ownedTile.ownerId = state.playerCompanyId;

  // Kilitli bir bölge seç ve açılana dek gelişmediğini doğrula.
  const lockedDistrict = state.districts.find((d) => d.opensOnDay !== undefined)!;
  const lockedBuiltAtStart = state.map.tiles.filter(
    (t) => t.districtId === lockedDistrict.id && t.structureId,
  ).length;

  const districtStats = () =>
    state.districts.map((district) => {
      let structures = 0;
      let free = 0;
      for (const tile of state.map.tiles) {
        if (tile.districtId !== district.id || tile.kind === 'road') continue;
        if (tile.structureId) structures++;
        else if (!tile.ownerId && !tile.buildingId) free++;
      }
      return { structures, free };
    });

  let lockedViolations = 0;
  let ownedViolations = 0;
  let cityBuiltOnLastPlots = 0;
  // Şehrin kendi diktiği yapılar ve rakiplerin devralıp kaldırdıkları, ayrı ayrı.
  let spread = 0;
  let removed = 0;
  for (let day = 1; day <= 700; day++) {
    const before = districtStats();
    const structuresBefore = state.map.tiles.map((t) => t.structureId);
    engine3.runDay();
    state.map.tiles.forEach((tile, i) => {
      if (!structuresBefore[i] && tile.structureId) spread++;
      if (structuresBefore[i] && !tile.structureId) removed++;
    });
    const after = districtStats();
    for (let i = 0; i < after.length; i++) {
      // Şehir bu bölgeye yapı ekledi mi, eklediyse taban korunmuş muydu?
      if (after[i]!.structures > before[i]!.structures && before[i]!.free <= 4) {
        cityBuiltOnLastPlots++;
      }
    }
    if (state.time.day < lockedDistrict.opensOnDay!) {
      const now = state.map.tiles.filter(
        (t) => t.districtId === lockedDistrict.id && t.structureId,
      ).length;
      if (now !== lockedBuiltAtStart) lockedViolations++;
    }
    if (ownedTile.structureId) ownedViolations++;
  }

  const end = survey();

  console.log(
    `  gün 0   → ${start.built} yapı · ort. yükseklik ${start.avgHeight.toFixed(2)} · siluet: ${[...start.forms].join(', ')}`,
  );
  console.log(
    `  gün 700 → ${end.built} yapı · ort. yükseklik ${end.avgHeight.toFixed(2)} · siluet: ${[...end.forms].join(', ')}`,
  );

  /*
   * ŞEHRİN KENDİ YAYILMASI, NET SAYI DEĞİL (Tur 25).
   *
   * Kontrol 700. gündeki yapı sayısını başlangıçla kıyaslıyordu (> %25).
   * O sayı iki hareketin farkı: şehrin boş parsele diktiği yapılar eksi
   * rakiplerin devralıp yıktıkları. Atıl oyunculu bu senaryoda bütün şehir
   * rakiplerin; Tur 25'te rakip boşta nakdiyle haftada iki mağaza denemeye
   * başlayınca devralma arttı (67 → 77 yapı) ve net sayı %59'dan %20'ye
   * indi — şehir yavaşlamadan (kendi yapısı 120 → 105). İddia "boş
   * parseller yapılaşıyor"; ölçülen de artık o: şehrin kendi diktiği yapı.
   * Eşik başlangıcın yarısı (ölçülen ~%104; Tur 24'te ~%119).
   */
  expect(
    'şehir yayılıyor: boş parseller yapılaşıyor',
    spread > start.built * 0.5,
    `şehrin yeni yapısı ${spread} (başlangıç ${start.built}) · rakip devralmasıyla kalkan ${removed} · net ${start.built} → ${end.built}`,
  );
  expect(
    'şehir yükseliyor: yapılar kat kazanıyor',
    end.avgHeight > start.avgHeight * 1.3,
    `${start.avgHeight.toFixed(2)} → ${end.avgHeight.toFixed(2)}`,
  );
  /*
   * Dönüşüm KADEMEDEN okunuyor, sayıdan değil.
   *
   * Kuruluşta şehir zincirlerin kökünden ibaret (sıra ev, esnaf, bostan);
   * kademe atlamış bir yapı (apartman, rezidans, depo, fabrika) ancak
   * dönüşüm gerçekten olduysa haritada bulunabilir. Yani bu kontrol
   * "yükseklik arttı" ile aynı şeyi iki kez ölçmüyor.
   *
   * İlk sürüm SİLUETİ (formu) sayıyordu ve bir çakışmayı kaçırıyordu
   * (Tur 21): okul da 'block' formunda, kuruluşta zaten var. Sıra ev →
   * apartman adımı listede hiç görünmüyor, kontrol fiilen "700 günde
   * hem bostan → depo HEM sıra ev → apartman → rezidans" istiyordu. Zincir
   * düzeltmesinden sonra seed 23'te 15 apartman ve 20 fabrika doğdu ama
   * rezidans doğmadı ve kontrol düştü. Sekiz tohumda rezidans sayısı main'de 59, dalda
   * 57 — gerileme yok, tek tohumun kademe zarı. Kademe sayımı iddiayı
   * aynı sertlikte tutuyor: İKİ zincir de dönüşmeli ve en az biri iki
   * kademe atlamalı.
   */
  const tiersOf = () => {
    const tiers = new Map<string, number>();
    for (const tile of state.map.tiles) {
      if (tile.structureId) tiers.set(tile.structureId, (tiers.get(tile.structureId) ?? 0) + 1);
    }
    return tiers;
  };
  const depthOf = (structureId: string) => {
    let depth = 0;
    let current = structureId;
    for (let guard = 0; guard < 8; guard++) {
      const parent = STRUCTURES.find((def) => def.upgradesTo === current);
      if (!parent) break;
      depth++;
      current = parent.id;
    }
    return depth;
  };
  const grownTiers = [...tiersOf().entries()].filter(
    ([id]) => !startTiers.has(id) && depthOf(id) > 0,
  );
  const grownChains = new Set(grownTiers.map(([id]) => rootStructureOf(id)));
  const deepest = Math.max(0, ...grownTiers.map(([id]) => depthOf(id)));
  expect(
    'şehir dönüşüyor: kuruluşta olmayan kademeler doğuyor',
    grownChains.size >= 2 && deepest >= 2,
    grownTiers.length > 0
      ? `${grownTiers.map(([id, n]) => `${STRUCTURE_BY_ID[id]?.name ?? id} ${n}`).join(', ')} · ${grownChains.size} zincir · en derin ${deepest} kademe`
      : 'kademe atlayan yapı yok',
  );
  expect(
    'kilitli bölge açılana dek gelişmiyor',
    lockedViolations === 0,
    lockedViolations === 0
      ? `${lockedDistrict.name} ${lockedDistrict.opensOnDay}. güne kadar dokunulmadı`
      : `${lockedViolations} gün ihlal`,
  );
  expect(
    'şehir oyuncunun parseline yapı dikmiyor',
    ownedViolations === 0,
    ownedViolations === 0 ? `parsel ${ownedTile.id} 700 gün boyunca temiz` : `${ownedViolations} gün ihlal`,
  );
  /*
   * Kamu yapısı üretilmiyor: park ve meydan hiçbir fiyata satılmaz.
   * Şehrin bir gecede oyuncunun gözüne kestirdiği parseli parka
   * çevirmesi geri alınamaz bir kayıp olurdu — büyüme yalnızca
   * DEVREDİLEBİLİR doku üretiyor.
   */
  expect(
    'büyüme kamu alanı üretmiyor (parsel kaybolmuyor)',
    end.civicTiles === start.civicTiles,
    `${start.civicTiles} → ${end.civicTiles} kamu karesi`,
  );

  /*
   * ŞEHRİN FRENİ: son parselleri almıyor.
   *
   * İlk yazdığım kontrol "hiçbir bölge tıkanmasın" diyordu ve kırıldı —
   * ama kırdığı şey şehir değil RAKİPLERDİ: geç oyunda haritayı
   * şirketler satın alıp bitiriyor ve bu Tur 8'den beri bilinen,
   * belgelenmiş bir olgunlaşma (§4.1). Kontrol iki farklı aktörü tek
   * sayıda topladığı için, düzeltilemeyecek bir şeyi hata diye
   * gösteriyordu.
   *
   * Doğru soru dar: ŞEHİR, bir bölgede boş parsel tabanının altına
   * inerken yapı dikiyor mu? `MIN_FREE_PLOTS` tam olarak bunu
   * engelliyor; ölçüm de tam olarak onu izliyor.
   */
  expect(
    'şehir son boş parselleri almıyor',
    cityBuiltOnLastPlots === 0,
    cityBuiltOnLastPlots === 0
      ? '700 günde taban ihlali yok'
      : `${cityBuiltOnLastPlots} kez tabanın altında yapı dikildi`,
  );
}

});

section('Rakipler zarar eden şubeyi kapatıyor', () => {
  /*
   * Değerlendirmenin D4 bulgusu: oyuncu baskısı altında geç oyunda
   * rakipler süreğen zararlı mağazaları açık tutuyordu — tohum 7'de
   * 900. günde 21 zararda outlet, 14'ü 60 gündür hiç kâr görmemiş.
   *
   * Üç iddia sınanıyor:
   *   1. süreğen zararlı şube birikmiyor (kapatma gerçekten oluyor),
   *   2. kapatılan şube aynı yere aynı türden geri gelmiyor (hafıza),
   *   3. zarar etmeyen rakip şube kapatmıyor (kural seçici).
   */
  const engine = new GameEngine(createNewGame({ seed: 7, companyName: 'Baskı AŞ' }));
  const trail = new Map<string, number[]>();
  const closures: Array<{ companyId: string; districtId: number; defId: string; day: number }> = [];
  const seenPruned = new Set<string>();
  const builds: Array<{ companyId: string; districtId: number; defId: string; day: number }> = [];
  const known = new Set<string>();
  let healthyClosed = 0;
  // Kapatma kuralına uyan rakip şube kaç gündür açık (bina → ardışık gün).
  const prunableSince = new Map<string, number>();
  let everPrunable = 0;
  let longestWait = 0;

  for (let day = 1; day <= 900; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    const before = new Map(
      Object.values(engine.getState().buildings).map((b) => [b.id, b.profitTrend ?? 0] as const),
    );
    engine.runDay();
    const state = engine.getState();

    for (const building of Object.values(state.buildings)) {
      if (!state.companies[building.companyId]?.isPlayer && isPrunable(state, building)) {
        if (!prunableSince.has(building.id)) {
          prunableSince.set(building.id, day);
          everPrunable++;
        }
        longestWait = Math.max(longestWait, day - prunableSince.get(building.id)!);
      } else {
        prunableSince.delete(building.id);
      }
      const list = trail.get(building.id) ?? [];
      list.push(building.last.profit);
      if (list.length > 60) list.shift();
      trail.set(building.id, list);
      if (!known.has(building.id)) {
        known.add(building.id);
        builds.push({ companyId: building.companyId, districtId: building.districtId, defId: building.defId, day });
      }
    }
    for (const company of Object.values(state.companies)) {
      for (const entry of company.pruned ?? []) {
        const key = `${company.id}:${entry.districtId}:${entry.defId}:${entry.day}`;
        if (seenPruned.has(key)) continue;
        seenPruned.add(key);
        closures.push({ companyId: company.id, ...entry });
      }
    }
    // Bugün kapanan her bina dün zararda mıydı?
    for (const [id, trend] of before) {
      if (state.buildings[id]) continue;
      const wasPruned = closures.some((c) => c.day === day);
      if (wasPruned && trend >= 0) healthyClosed++;
    }
  }

  const state = engine.getState();
  let chronic = 0;
  for (const building of Object.values(state.buildings)) {
    const company = state.companies[building.companyId];
    if (!company || company.isPlayer) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role !== 'outlet' && role !== 'rental') continue;
    if (state.time.day - building.builtDay < 120) continue;
    const list = trail.get(building.id) ?? [];
    if (list.length >= 60 && list.every((profit) => profit <= 0)) chronic++;
  }

  const churn = closures.filter((closure) =>
    builds.some(
      (b) =>
        b.companyId === closure.companyId &&
        b.districtId === closure.districtId &&
        b.defId === closure.defId &&
        b.day > closure.day &&
        b.day - closure.day < PRUNE_MEMORY_DAYS,
    ),
  ).length;

  /*
   * KAPANIŞ SAYISI DEĞİL, BEKLEME SÜRESİ (Tur 25).
   *
   * Kontrol "900 günde en az bir kapanış" idi. Yatırım tahmini kendi
   * şubelerinden çalınan satışı düşmeye başlayınca rakip zararlı şubeyi bu
   * tohumda hiç açmıyor: kapanış sıfır, ama sıfır hem "kural çalışmıyor"
   * hem "kapatacak bir şey yok" demek olabiliyordu. Mekanizma artık birim
   * testinde (prune.test.ts) zarar elle kurularak sınanıyor; burada sorulan
   * oyundaki sonucu: kurala uyan şube açık kalıyor mu? Rakip karar başına
   * bir şube kapatıyor ve kararlar haftalık — iki hafta tavan.
   */
  expect(
    'rakipler zararlı şubeyi kapatıyor',
    longestWait <= 14 && (everPrunable === 0 || closures.length > 0),
    `${closures.length} kapanış / 900 gün · kurala uyan ${everPrunable} şube, en uzun bekleme ${longestWait} gün`,
  );
  expect(
    'süreğen zararlı rakip şubesi birikmiyor',
    chronic <= 2,
    `900. günde 60 gündür kâr görmemiş ${chronic} rakip mağazası (kapatma yokken 14)`,
  );
  expect(
    'kapanan şube hafıza süresinde aynı yere dönmüyor',
    churn === 0,
    churn === 0 ? `${PRUNE_MEMORY_DAYS} gün içinde yeniden açılış yok` : `${churn} tekrar açılış`,
  );
  expect(
    'kâr eden şube kapatılmıyor',
    healthyClosed === 0,
    healthyClosed === 0 ? 'kapanan her bina eğilimde zarardaydı' : `${healthyClosed} kârlı bina kapandı`,
  );
});

section('Hedefler, zafer ve zorluk', () => {
  /*
   * İ1 + İ2 (değerlendirme): oyunun kaybetme koşulu vardı, kazanma
   * koşulu yoktu; zorluk tekti. Kalibrasyon iki vekille yapıldı —
   * bilgili (5 günde bir hamle) ve yavaş (15 günde bir, savunmasız).
   *
   * Ölçülen eğri (bilgili: tohum 1/7/42 · yavaş: tohum 1/7/42/101/202):
   *   Rahat     bilgili 449-467. günde kazanıyor · yavaş hayatta kalıyor
   *   Dengeli   bilgili 608-779                  · yavaş 589-835'te düşüyor (4/5)
   *   Acımasız  bilgili ~900                     · yavaş 432-548'de düşüyor (5/5)
   * (Meclis, yeni rakip girişi ve baskın kilidi düzeltmesinden sonra.
   * Girişler ilk ölçümde oyunu kaybedilemez yapmıştı — sebep girişin
   * kendisi değil, hissesi tükenmiş hedefe çakılan baskıncılardı.)
   *
   * Tur 38'de eğri kaymıştı: geç oyun giderleri (Tur 37a) çok bina kuran
   * rakipleri yavaşlatıyor, savunmasız yavaş oyuncu onları geçip baskın
   * hedefi olmaktan çıkıyordu (Dengeli'de 8 tohumda 2 düşüş, 4 zafer).
   * Rakip bütçesi üç kademede 1,5 katına, günlük tavan Dengeli ve
   * Acımasız'da +%1'e çıktı. Yeni eğri (8 tohum: 1/7/42/101/202/3/5/11):
   *   Rahat     bilgili 390-503   · yavaş hayatta kalıyor (8/8)
   *   Dengeli   bilgili 625-752   · yavaş 754-886'da düşüyor (7/8), savunan 0/8
   *   Acımasız  bilgili 809-929 (5/8; üçü düşüyor) · yavaş 367-815'te (8/8)
   *
   * Sınanan iddialar: zafer erişilebilir ama bedava değil; kademeler
   * sıralı; oyun Dengeli ve Acımasız'da kaybedilebilir kalıyor, Rahat'ta
   * yavaş oyuncu affediliyor; uyarıyı okuyup savunan yavaş oyuncu
   * Dengeli'de hayatta kalıyor.
   */
  type Outcome = { victoryDay: number | null; lostDay: number | null; ladder: ReturnType<typeof goalLadder> };
  function play(seed: number, difficulty: 'easy' | 'normal' | 'hard', every: number, defend: boolean, days: number): Outcome {
    const engine = new GameEngine(createNewGame({ seed, difficulty, companyName: 'Hedef AŞ' }));
    for (let day = 1; day <= days; day++) {
      if (day % every === 0) playerStrategy(engine);
      if (defend && day % 3 === 0) defendAgainstRaids(engine);
      engine.runDay();
      const state = engine.getState();
      if (state.gameOver) return { victoryDay: null, lostDay: day, ladder: goalLadder(state) };
      if (state.victory) return { victoryDay: state.victory.day, lostDay: null, ladder: goalLadder(state) };
    }
    return { victoryDay: null, lostDay: null, ladder: goalLadder(engine.getState()) };
  }

  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const victoryDays: Record<string, number[]> = {};
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    // Süre bütçesi: bilgili koşular zafere dek sürüyor ve geç oyun pahalı.
    // Dengeli iki tohum, Rahat bir tohum (tam eğri yukarıdaki notta).
    //
    // Acımasız İKİ TOHUM (Tur 37b). Tek tohumla (1) ölçülüyordu; karar
    // kartları ve rakip kampanyası birlikte açıkken bu tohumda en büyük
    // rakip 900. günden sonra öne geçiyor ve 2.200 güne kadar zafer yok
    // (kart ya da kampanya tek başına açıkken 914 / 897). Beş tohumluk
    // ölçümde diğer dördü zafere aynı ya da daha erken ulaşıyor: 7: 981 →
    // 974 · 42: 792 → 792 · 5: 942 → 919 · 3: 888 → 831. Acımasız'da bir
    // tohumun kaybettirmesi kademenin adına uygun; iddia artık "Acımasız
    // kazanılabilir ve ortalaması Dengeli'den geç".
    const seeds = difficulty === 'normal' ? [1, 42] : difficulty === 'hard' ? [1, 3] : [1];
    victoryDays[difficulty] = [];
    for (const seed of seeds) {
      const outcome = play(seed, difficulty, 5, false, 1300);
      if (outcome.victoryDay !== null) victoryDays[difficulty]!.push(outcome.victoryDay);
      if (difficulty === 'normal' && seed === 1) {
        const first = outcome.ladder.find((g) => g.def.id === 'first_shop')?.completedDay ?? null;
        const done = outcome.ladder.filter((g) => g.completedDay !== null).length;
        expect(
          'merdiven ilk basamaktan başlıyor ve tırmanılıyor',
          first !== null && first <= 10 && done >= 7,
          `ilk dükkân ${first}. gün · ${done}/${outcome.ladder.length} basamak`,
        );
      }
    }
  }
  const normal = victoryDays['normal']!;
  expect(
    'Dengeli: bilgili oyuncu kazanabiliyor',
    normal.length === 2,
    normal.length === 2 ? `zafer günleri ${normal.join(', ')}` : `${normal.length}/2 tohumda zafer`,
  );
  expect(
    'Dengeli: zafer bedava değil (400. günden önce yok)',
    normal.every((day) => day >= 400),
    `en erken ${Math.min(...normal)}. gün`,
  );
  const easyMean = mean(victoryDays['easy']!);
  const normalMean = mean(normal);
  const hardMean = mean(victoryDays['hard']!);
  expect(
    'kademeler sıralı: Rahat < Dengeli < Acımasız',
    victoryDays['easy']!.length === 1 && victoryDays['hard']!.length >= 1 && easyMean < normalMean && normalMean < hardMean,
    `ortalama zafer günü ${Math.round(easyMean)} / ${Math.round(normalMean)} / ${Math.round(hardMean)}` +
      ` · Acımasız ${victoryDays['hard']!.length}/2 tohumda zafer`,
  );

  /*
   * Kaybedilebilirlik tek tohumla (7) ölçülüyordu ve o tohum sınırdaydı:
   * Dengeli'de 824. günde, 900 günlük pencerenin sonunda düşüyordu. Canlı
   * pazar (Tur 37d) bu tohumu pencerenin dışına itti; 12 tohumluk ölçümde
   * düşme oranı değişmedi (Dengeli 3/12 açık · 2/12 kapalı, Acımasız
   * 10/12 · 10/12). Kontrol artık kalibrasyon notundaki beş tohumu
   * koşuyor; iddia aynı: Dengeli kaybedilebilir, Acımasız daha sık ve daha
   * erken düşürüyor.
   */
  const SLOW_SEEDS = [1, 7, 42, 101, 202];
  const falls = (difficulty: 'normal' | 'hard'): number[] =>
    SLOW_SEEDS.map((seed) => play(seed, difficulty, 15, false, 900).lostDay).filter((day): day is number => day !== null);
  const normalFalls = falls('normal');
  const hardFalls = falls('hard');
  const slowEasy = play(7, 'easy', 15, false, 900);
  const slowDefended = play(7, 'normal', 15, true, 900);
  const list = (days: number[]): string => (days.length > 0 ? days.join(', ') : '—');
  // Tur 38: iddia "düşebilir"den (≥1/5) Tur 17'nin cümlesine döndü —
  // savunmasız yavaş oyuncu Dengeli'de çoğunlukla düşüyor (ölçüm 5/5).
  expect(
    'oyun kaybedilebilir: savunmasız yavaş oyuncu Dengeli\'de çoğunlukla, Acımasız\'da neredeyse hep düşüyor',
    normalFalls.length >= 3 && hardFalls.length >= 4,
    `Dengeli ${normalFalls.length}/5 (${list(normalFalls)}) · Acımasız ${hardFalls.length}/5 (${list(hardFalls)})`,
  );
  // İkisi de 5/5'e yaklaşınca "daha sık" beş tohumla ayırt edilemiyor; ayıran erken düşüş.
  expect(
    'Acımasız en az o kadar sık ve daha erken düşürüyor',
    hardFalls.length >= normalFalls.length && normalFalls.length > 0 && mean(hardFalls) < mean(normalFalls),
    `${hardFalls.length} ≥ ${normalFalls.length} · ortalama ${Math.round(mean(hardFalls))} < ${normalFalls.length > 0 ? Math.round(mean(normalFalls)) : '—'}`,
  );
  expect('Rahat yavaş oyuncuyu affediyor', slowEasy.lostDay === null, slowEasy.lostDay === null ? '900 gün ayakta' : `${slowEasy.lostDay}. günde düştü`);
  expect(
    'uyarıyı okuyup savunan yavaş oyuncu Dengeli\'de hayatta kalıyor',
    slowDefended.lostDay === null,
    slowDefended.lostDay === null ? '900 gün ayakta' : `${slowDefended.lostDay}. günde düştü`,
  );
});

section('Belediye meclisi ve yeni rakipler', () => {
  /*
   * Y1 + İ3. Sınanan iddialar:
   *   - meclis takvimine uyuyor (120. günden sonra her 90 günde bir),
   *   - önergeler hem geçiyor hem reddediliyor (tek yönlü bir "her şey
   *     geçer" değil),
   *   - rakipler çıkarına göre lobi yapıyor: vergi gelen kategoride en
   *     büyük paylı (ve bağışa nakdi yeten) rakip aleyhte bağış yapıyor,
   *   - devralmalarla boşalan koltuk doluyor ve kadro erimiyor,
   *   - ekonomi sağlıklı kalıyor (oyuncu büyüyor).
   */
  const engine = new GameEngine(createNewGame({ seed: 1, companyName: 'Meclis AŞ' }));
  const sessions = new Set<number>();
  const decided = new Map<string, boolean>();
  let taxMotions = 0;
  let taxOpposedByLeader = 0;
  let minRivalsLate = Infinity;

  for (let day = 1; day <= 900; day++) {
    if (day % 5 === 0) playerStrategy(engine);
    const before = engine.getState().council?.session ?? null;
    if (before && engine.getState().time.day + 1 >= before.voteDay) {
      // Oylamadan hemen önce: vergi önergesinde en büyük paylı rakip ne yaptı?
      const state = engine.getState();
      for (const motion of before.motions) {
        if (motion.kind !== 'category_tax' || decided.has(motion.id)) continue;
        const leader = Object.values(state.companies)
          .filter((c) => !c.isPlayer)
          .sort((a, b) => (b.marketShare[motion.category!] ?? 0) - (a.marketShare[motion.category!] ?? 0))[0];
        // Bütçesi yetmeyen rakip bağış yapamaz (rakip lobisi nakdinin %4'ü,
        // 10 binin altı gürültü sayılıyor) — iddia "çıkarı VE imkânı olan".
        if (!leader || (leader.marketShare[motion.category!] ?? 0) < 0.05 || leader.cash < 1_000_000) continue;
        taxMotions++;
        if ((motion.lobby[leader.id] ?? 0) < 0) taxOpposedByLeader++;
      }
    }
    engine.runDay();
    const state = engine.getState();
    if (state.council?.session) sessions.add(state.council.session.openedDay);
    for (const motion of state.council?.history ?? []) {
      if (motion.result && !decided.has(motion.id)) decided.set(motion.id, motion.result.passed);
    }
    if (day >= 400) minRivalsLate = Math.min(minRivalsLate, Object.values(state.companies).filter((c) => !c.isPlayer).length);
  }

  const state = engine.getState();
  const passed = [...decided.values()].filter(Boolean).length;
  const rejected = decided.size - passed;
  const entrants = (state.rivalHistory?.length ?? 0) - 4;
  const firstSession = Math.min(...sessions);

  expect(
    'meclis takvime uyuyor',
    sessions.size >= 8 && firstSession === 120,
    `${sessions.size} oturum, ilki ${firstSession}. gün`,
  );
  expect('önergeler hem geçiyor hem reddediliyor', passed >= 2 && rejected >= 2, `${passed} kabul · ${rejected} ret`);
  expect(
    'vergide en büyük paylı rakip aleyhte lobi yapıyor',
    taxMotions === 0 || taxOpposedByLeader === taxMotions,
    taxMotions === 0 ? 'bu tohumda pay sahibi rakibe vergi önergesi gelmedi' : `${taxOpposedByLeader}/${taxMotions} vergi önergesinde`,
  );
  expect(
    'boşalan rakip koltuğu doluyor, kadro erimiyor',
    minRivalsLate >= 3,
    `400. günden sonra en az ${minRivalsLate} rakip · ${Math.max(0, entrants)} yeni giriş`,
  );
  expect(
    'meclis ve yeni rakiplerle oyuncu büyümeye devam ediyor',
    getPlayer(state).netWorth > 50_000_000,
    `900. günde ${formatMoney(getPlayer(state).netWorth)}`,
  );
});

section('İşgücü ve sendika', () => {
  /*
   * Tur 18. Sınanan iddialar:
   *   - sendika orta oyunun sistemi: talep erken oyunda gelmiyor, 720
   *     günde geliyor;
   *   - ücret çarpanı birikiyor ama ezmiyor — ödenen ücretin Tur 17
   *     formülüne oranı (aynı koşuda, aynı binalarla: eşli ve mekanik)
   *     %3 ile %35 arasında;
   *   - sanayi kümesi ücret endeksini yükseltiyor;
   *   - rakiplerin de sendikası var;
   *   - Ret gerçekten grev getirebiliyor ve grev kapasiteyi düşürüyor.
   */
  function laborRun(seed: number, response: 'compromise' | 'reject') {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Emek AŞ' }));
    let paid = 0;
    let base = 0;
    let firstDemand: number | null = null;
    let demands = 0;
    let strikeSeen = false;
    let strikeShare = 1;
    for (let day = 1; day <= 720; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      const before = engine.getState();
      const labor = getPlayer(before).labor;
      if (labor?.demand) {
        firstDemand ??= labor.demand.offeredDay;
        demands++;
        engine.dispatch({ type: 'RESPOND_UNION', response });
      }
      engine.runDay();
      const state = engine.getState();
      const player = getPlayer(state);
      paid += player.today.wages;
      // Yönetim yükü (Tur 37a) ücretin üstüne ayrı bir kalem; sınanan
      // sendikanın çarpanı, o yüzden yük tabana da giriyor.
      const overhead = overheadMultiplier(state, player.id);
      for (const building of Object.values(state.buildings)) {
        if (building.companyId !== player.id) continue;
        const def = BUILDING_BY_ID[building.defId]!;
        base += def.jobs * WAGE_PER_JOB * (0.6 + state.districts[building.districtId]!.incomeLevel) * overhead;
      }
      const strike = player.labor?.strike;
      if (strike && state.time.day >= strike.startedDay && !strikeSeen) {
        strikeSeen = true;
        const outlets = Object.values(state.buildings).filter(
          (b) => b.companyId === player.id && BUILDING_BY_ID[b.defId]!.role === 'outlet',
        );
        const used = outlets.reduce((sum, b) => sum + b.last.unitsSold, 0);
        const capacity = outlets.reduce((sum, b) => sum + BUILDING_BY_ID[b.defId]!.capacity, 0);
        strikeShare = capacity > 0 ? used / capacity : 1;
      }
    }
    const state = engine.getState();
    const rivals = Object.values(state.companies).filter((c) => !c.isPlayer);
    return {
      ratio: paid / Math.max(1, base),
      firstDemand,
      demands,
      agreement: getPlayer(state).labor?.agreement ?? 1,
      strikeDays: getPlayer(state).labor?.strikeDays ?? 0,
      strikeShare,
      maxIndex: Math.max(...state.districts.map((d) => d.wageIndex ?? 1)),
      rivalUnion: rivals.filter((c) => (c.labor?.agreement ?? 1) > 1 || (c.labor?.strikeDays ?? 0) > 0).length,
    };
  }

  const runs = [1, 7].map((seed) => ({ seed, run: laborRun(seed, 'compromise') }));
  for (const { seed, run } of runs) {
    console.log(
      `  seed ${String(seed).padStart(2)} | ilk talep ${run.firstDemand ?? '-'}. gün · ${run.demands} talep · ` +
        `sözleşme ×${run.agreement.toFixed(3)} · ücret/Tur17 ×${run.ratio.toFixed(3)} · ` +
        `endeks en çok ×${run.maxIndex.toFixed(2)} · sendikalı rakip ${run.rivalUnion}`,
    );
  }
  expect(
    'sendika orta oyunun sistemi',
    runs.every(({ run }) => run.firstDemand !== null && run.firstDemand >= 200),
    runs.map(({ seed, run }) => `seed ${seed}: ${run.firstDemand ?? 'yok'}. gün`).join(' · '),
  );
  expect(
    'ücret çarpanı birikiyor ama ezmiyor',
    runs.every(({ run }) => run.ratio >= 1.03 && run.ratio <= 1.35),
    runs.map(({ seed, run }) => `seed ${seed}: ×${run.ratio.toFixed(3)}`).join(' · '),
  );
  expect(
    'sanayi kümesi ücret endeksini yükseltiyor',
    runs.every(({ run }) => run.maxIndex > 1.05),
    runs.map(({ run }) => `×${run.maxIndex.toFixed(2)}`).join(' · '),
  );
  expect('rakiplerin de sendikası var', runs.some(({ run }) => run.rivalUnion > 0),
    runs.map(({ run }) => `${run.rivalUnion} rakip`).join(' · '));

  const hard = laborRun(1, 'reject');
  console.log(`  Ret kolu | ${hard.demands} talep · grev ${hard.strikeDays} gün · ilk grev gününde mağaza doluluğu %${Math.round(hard.strikeShare * 100)}`);
  expect('Ret grev getirebiliyor', hard.strikeDays > 0, `${hard.strikeDays} gün grev`);
  expect('grev mağaza kapasitesini düşürüyor', hard.strikeShare <= 0.4, `doluluk %${Math.round(hard.strikeShare * 100)}`);
});

section('Banka ve kredi', () => {
  /*
   * Tur 18. Kredi bir hızlandırıcı, baskın strateji değil, ve bedeli
   * gerçek. Üç eşli kıyas (aynı tohum, tek değişken: borç):
   *
   *   - Becerikli ve aceleci: nakdinin %87,5'ini harcayan vekil, her
   *     fırsatta azami borçla ve borçsuz. Borç 180. günde öne geçiriyor,
   *     720. günde fark bunun yarısından az — kredi tempoyu öne çekiyor,
   *     tavanı değil. Kontrol kolu ŞART: ilk ölçümde "kaldıraç" vekili
   *     normal vekilden %36 öndeydi ama kıyas iki değişkenliydi (borç VE
   *     üç kat hızlı harcama); aynı hızda harcayan borçsuz kol farkın
   *     büyük kısmını tek başına açıklıyor.
   *   - Kötü gün: 90. günden itibaren maliyetin altında fiyat savaşı.
   *     İki kol da hacize düşüyor; borçlu olanın kredileri not D'de
   *     muaccel oluyor ve şirket sıfırlanıyor. İlk tasarım burada fark
   *     göstermemişti (limitler taksiti küçük tutuyor) — muacceliyet
   *     maddesi krediye özgü riski kuruyor. "Kötü yatırımcı" (tahmine
   *     bakmadan pahalı mağaza) denendi ve ayıramadı: o vekil zarar
   *     etmiyor, yalnızca verimsiz.
   *   - Rakipler doktrinle borçlanıyor.
   */
  function hurried(engine: Engine): void {
    playerStrategy(engine);
    playerStrategy(engine);
    playerStrategy(engine);
  }
  function bankRun(seed: number, days: number, borrow: boolean, warFromDay?: number) {
    // Banka iki kolda da açık (rakipler doktrinle borçlanıyor); tek fark
    // oyuncunun kredi çekip çekmediği.
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Kredi AŞ' }));
    const worth: Record<number, number> = {};
    let loans = 0;
    for (let day = 1; day <= days; day++) {
      if (day % 5 === 0 && borrow) {
        const termDays = warFromDay ? 360 : 180;
        const quote = loanQuote(engine.getState(), engine.getState().playerCompanyId, 'term', termDays);
        if (quote.ok && engine.dispatch({ type: 'TAKE_LOAN', kind: 'term', amount: quote.max, termDays }).ok) loans++;
      }
      if (day % 5 === 0 && (warFromDay === undefined || day < warFromDay)) {
        if (warFromDay === undefined) hurried(engine);
        else playerStrategy(engine);
      }
      if (day === warFromDay) {
        // Maliyetin altında fiyat savaşı: her mağaza ×0,6.
        for (const building of Object.values(engine.getState().buildings)) {
          if (building.companyId !== engine.getState().playerCompanyId) continue;
          if (BUILDING_BY_ID[building.defId]!.role !== 'outlet') continue;
          engine.dispatch({ type: 'SET_PRICE_MULTIPLIER', buildingId: building.id, multiplier: 0.6 });
        }
      }
      const labor = getPlayer(engine.getState()).labor;
      if (labor?.demand) engine.dispatch({ type: 'RESPOND_UNION', response: 'compromise' });
      engine.runDay();
      if (day === 180 || day === 360 || day === days) worth[day] = getPlayer(engine.getState()).netWorth;
    }
    const state = engine.getState();
    const rivalLoans = Object.values(state.companies)
      .filter((c) => !c.isPlayer)
      .reduce((sum, c) => sum + (c.credit?.loanSeq ?? 0), 0);
    return {
      worth,
      loans,
      rivalLoans,
      defaults: getPlayer(state).credit?.defaults ?? 0,
      land: state.map.tiles.filter((t) => t.ownerId === state.playerCompanyId).length,
    };
  }

  const seeds = [1, 7, 42];
  const pairs = seeds.map((seed) => ({ seed, with: bankRun(seed, 720, true), without: bankRun(seed, 720, false) }));
  const edge = (a: Record<number, number>, b: Record<number, number>, day: number) => a[day]! / b[day]! - 1;
  for (const { seed, with: a, without: b } of pairs) {
    console.log(
      `  aceleci seed ${String(seed).padStart(2)} | borçlu ${formatMoney(a.worth[180]!)} → ${formatMoney(a.worth[720]!)} (${a.loans} kredi) · ` +
        `borçsuz ${formatMoney(b.worth[180]!)} → ${formatMoney(b.worth[720]!)} · fark %${Math.round(edge(a.worth, b.worth, 180) * 100)} → %${Math.round(edge(a.worth, b.worth, 720) * 100)}`,
    );
  }
  expect('kredi erken oyunu öne çekiyor', pairs.every(({ with: a, without: b }) => edge(a.worth, b.worth, 180) > 0),
    pairs.map(({ with: a, without: b }) => `+%${Math.round(edge(a.worth, b.worth, 180) * 100)}`).join(' · '));
  // Tempo, tavan değil: 720. günde fark 180. günün yarısından az, her tohumda.
  expect(
    'kredinin avantajı zamanla eriyor (baskın değil)',
    pairs.every(({ with: a, without: b }) => edge(a.worth, b.worth, 720) < edge(a.worth, b.worth, 180) / 2),
    pairs.map(({ with: a, without: b }) => `%${Math.round(edge(a.worth, b.worth, 180) * 100)} → %${Math.round(edge(a.worth, b.worth, 720) * 100)}`).join(' · '),
  );
  expect('rakipler doktrinle borçlanıyor', pairs.some(({ with: a }) => a.rivalLoans > 0),
    pairs.map(({ with: a }) => `${a.rivalLoans} rakip kredisi`).join(' · '));

  const wars = [1, 7].map((seed) => ({ seed, with: bankRun(seed, 360, true, 90), without: bankRun(seed, 360, false, 90) }));
  for (const { seed, with: a, without: b } of wars) {
    console.log(
      `  fiyat savaşı seed ${String(seed).padStart(2)} | borçlu ${formatMoney(a.worth[360]!)} · ${a.defaults} haciz · ${a.land} arsa | ` +
        `borçsuz ${formatMoney(b.worth[360]!)} · ${b.defaults} haciz · ${b.land} arsa`,
    );
  }
  expect('zarar eden şirkete haciz geliyor', wars.every(({ with: a, without: b }) => a.defaults > 0 && b.defaults > 0),
    wars.map(({ with: a, without: b }) => `${a.defaults} / ${b.defaults} haciz`).join(' · '));
  expect('kötü günde borçlu şirket daha derine düşüyor', wars.every(({ with: a, without: b }) => a.worth[360]! < b.worth[360]! && a.land <= b.land),
    wars.map(({ with: a, without: b }) => `${formatMoney(a.worth[360]!)} < ${formatMoney(b.worth[360]!)}`).join(' · '));
});

section('Sermaye piyasası: halka arz ve kurucu kilidi', () => {
  /*
   * Tur 19. Sınanan iddialar:
   *   - halka arz bedava para değil: nakdi sıkışmayan şirkette erken ihraç
   *     720. günde net değeri düşürüyor (kalıcı ortaklık);
   *   - ama bir kontrol aracı: savunmasız yavaş oyuncu baskınla düşerken
   *     baskıncı %30'u geçince ihraç eden aynı oyuncu daha geç düşüyor ya
   *     da ayakta kalıyor (Tur 21'den beri baskın altında soğuma
   *     aranmıyor); düştüğü yer yalnızca kalkanın belgelenen sonu (Tur 27,
   *     aşağıda; Tur 37a'dan beri tehditli tohumların çoğunda);
   *   - oyun başı rakipler baskın ısınması bitene kadar kilitli: en ucuz
   *     rakibi alan vekil eskiden 5. günde devralıp tekel zaferine
   *     130–235. günde ulaşıyordu.
   */
  function ipoRun(seed: number, ipo: boolean) {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Arz AŞ' }));
    let issuedDay: number | null = null;
    for (let day = 1; day <= 720; day++) {
      const quote = issueQuote(engine.getState(), engine.getState().playerCompanyId);
      if (ipo && issuedDay === null && quote.ok && engine.dispatch({ type: 'ISSUE_SHARES', count: quote.maxShares }).ok) {
        issuedDay = day;
      }
      if (day % 5 === 0) playerStrategy(engine);
      const labor = getPlayer(engine.getState()).labor;
      if (labor?.demand) engine.dispatch({ type: 'RESPOND_UNION', response: 'compromise' });
      engine.runDay();
    }
    const player = getPlayer(engine.getState());
    return { worth: player.netWorth, issuedDay, founder: ownerFraction(player) };
  }
  const ipos = [1, 7].map((seed) => ({ seed, with: ipoRun(seed, true), without: ipoRun(seed, false) }));
  for (const { seed, with: a, without: b } of ipos) {
    console.log(
      `  erken halka arz seed ${String(seed).padStart(2)} | ${a.issuedDay}. gün · kurucu %${Math.round(a.founder * 100)} · ` +
        `720. gün ${formatMoney(a.worth)} · ihraçsız ${formatMoney(b.worth)}`,
    );
  }
  expect('halka arz bedava para değil', ipos.every(({ with: a, without: b }) => a.issuedDay !== null && a.worth < b.worth),
    ipos.map(({ with: a, without: b }) => `%${Math.round((a.worth / b.worth - 1) * 100)}`).join(' · '));

  /**
   * `bare`: savunmasız. `issue`: baskıncı %30'u geçince ihraç. `lock`
   * (Tur 28): aynı ihraç, ihraç kapanınca (kurucu tabanı) kilide yetecek
   * kadar piyasadan geri alım — günlük tavanla, nakdin yettiği kadar.
   */
  function defenseRun(seed: number, mode: 'bare' | 'issue' | 'lock') {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Kalkan AŞ' }));
    let lost: number | null = null;
    let issued = 0;
    let boughtBack = 0;
    let buybackCost = 0;
    for (let day = 1; day <= 900; day++) {
      const state = engine.getState();
      if (mode !== 'bare') {
        const id = state.playerCompanyId;
        let top = 0;
        for (const company of Object.values(state.companies)) {
          if (!company.isPlayer) top = Math.max(top, company.shares[id] ?? 0);
        }
        const threatened = top / sharesOutstanding(state, id) >= 0.3;
        const quote = issueQuote(state, id);
        if (threatened && quote.ok) {
          if (engine.dispatch({ type: 'ISSUE_SHARES', count: quote.maxShares }).ok) issued++;
        } else if (mode === 'lock' && threatened && issued > 0) {
          const toLock = buybackToLock(state, id);
          const price = sharePrice(state, id);
          const count = Math.min(toLock, capRemaining(state, id, id), freeFloat(state, id), Math.floor(getPlayer(state).cash / Math.max(1, price)));
          if (Number.isFinite(count) && count > 0 && engine.dispatch({ type: 'BUY_SHARES', companyId: id, count }).ok) {
            boughtBack += count;
            buybackCost += count * price;
          }
        }
      }
      if (day % 15 === 0) playerStrategy(engine);
      const labor = getPlayer(engine.getState()).labor;
      if (labor?.demand) engine.dispatch({ type: 'RESPOND_UNION', response: 'compromise' });
      engine.runDay();
      if (engine.getState().gameOver) {
        lost = day;
        break;
      }
    }
    const state = engine.getState();
    const player = getPlayer(state);
    // Düşüşte kontrolü alanın dışındaki en büyük rakip pay: ~0 ise baskıncı
    // serbest hissenin tamamını tek başına toplamış demek.
    const stakes = Object.values(state.companies)
      .filter((c) => !c.isPlayer && c.id !== state.gameOver?.byCompanyId)
      .map((c) => (c.shares[player.id] ?? 0) / sharesOutstanding(state, player.id));
    return {
      lost,
      issued,
      founder: ownerFraction(player),
      runnerUp: Math.max(0, ...stakes),
      boughtBack,
      buybackCost,
      locked: buybackToLock(state, player.id) === 0,
      worth: player.netWorth,
    };
  }
  /*
   * Dört tohum (Tur 21). Kontrol iki tohumla (7, 42) yazılmıştı ve ikisi
   * de şanslıydı: on tohumluk ölçümde savunmasız düşen dokuz oyuncudan
   * main'de üçü ihraçla da düşüyordu (5, 3, 19), seed 42 ise iki baskıncı
   * serbest hisseyi bölüşüp tıkandığı için ayaktaydı. Zincir düzeltmesi
   * rakip ekonomisini kaydırınca seed 42 de düştü (723 → 725). Savunma
   * ihracı (soğumasız) ile dokuzun sekizi ayakta; 5 ve 31 eski kuralla
   * düşen tohumlar, o yüzden burada.
   *
   * Tur 37a: yönetim yükü büyük rakipleri yavaş oyuncudan çok frenliyor,
   * sıralama sıkışıyor. 20 tohumda savunmasız yavaş oyuncu 9 yerine 5
   * tohumda düşüyor (1, 2, 7, 9, 12); 42, 5 ve 31'de artık savunmasız da
   * ayakta, yani kalkanı ölçemiyorlardı. Tohumlar tehdidin gerçekleştiği
   * yerden yeniden seçildi.
   *
   * Tur 37d: şehir projeleri bitince bölgede ve komşularda talep kalıcı
   * artıyor, arsa değerleniyor; en çok bölgede bulunan oyuncu en çok
   * kazanıyor. Seed 1'de savunmasız oyuncu 700. günde %6 daha zengin ve
   * baskıncının %90 eşiğinin üstünde kalıyor (79,2 > 75,6 M ₺). 20 tohumda
   * savunmasız düşüş oranı değişmiyor (projesiz 4/20: 1, 4, 9, 13; projeli
   * 3/20: 9, 13, 17), tehdit başka tohumlara kayıyor. Tohumlar yine
   * tehdidin gerçekleştiği yerden.
   */
  const shields = [9, 13, 17].map((seed) => ({ seed, bare: defenseRun(seed, 'bare'), issue: defenseRun(seed, 'issue') }));
  for (const { seed, bare, issue } of shields) {
    console.log(
      `  baskın seed ${String(seed).padStart(2)} | savunmasız ${bare.lost ? `${bare.lost}. günde düşüyor` : 'ayakta'} · ` +
        `ihraçla ${issue.lost ? `${issue.lost}. günde düşüyor` : 'ayakta'} (${issue.issued} ihraç, kurucu %${Math.round(issue.founder * 100)})`,
    );
  }
  /*
   * ÖNKOŞUL AÇIKÇA YAZILIYOR (Tur 25) — zincir kontrolüyle aynı ilke:
   * kalkan ancak bir baskının oyuncuyu düşürdüğü tohumda sınanabilir.
   *
   * Yatırım tahmini kendi şubelerinden çalınan satışı düşmeye başlayınca
   * 15 günde bir oynayan vekil belirgin güçlendi; bazı tohumlarda
   * savunmasızken de ayakta kalıyor. Orada "ihraçla da ayakta" bir şey
   * kanıtlamıyor, "savunmasız ayakta" da kalkanın yokluğunu. Ölçüm
   * tehdidin gerçekleştiği tohumlar üzerinden; en az iki tohumda tehdit
   * şart (yoksa kontrol hiçbir şey ölçmüyor demektir) ve atlanan tohum
   * detayda adıyla yazılıyor.
   */
  /*
   * KALKANIN SONU AÇIKÇA SINANIYOR (Tur 27).
   *
   * Tur 21'den beri belgede "kalkanın bir sonu var" yazıyordu, kontrol
   * ise her tehditli tohumda 900. güne kadar ayakta kalmayı istiyordu.
   * Aradaki fark hesapta: kurucu tabanı (%51) yatırımcıyı en çok %48,8'de
   * bırakıyor, kalan %51,2 serbest. Serbest hissenin TAMAMINI tek başına
   * toplayan baskıncı eşiği geçer. Main'de seed 7 bu yüzden değil, iki
   * baskıncı hisseyi bölüştüğü için ayaktaydı (%27 + %24, serbest sıfır).
   * Yeni olaylar rakip ekonomisini kaydırınca Meridyen tek kaldı: üç
   * ihraç 671–791. günde, 885. günde %50,7.
   *
   * 18 tohumda ölçüldü (savunmasız düşenler, ihraçla): main 8/8 ayakta,
   * dal 9/10. Düşen tek tohum seed 7. Seed 2, 6 ve 42'de tek baskıncı
   * 900. günde %49, %40 ve %47'de; oradaki "ayakta" ufkun sonu. İddia
   * artık iki parça:
   *   - kalkan tehditli tohumların çoğunu ayakta tutuyor (en az iki);
   *   - kalkanla düşüş YALNIZCA belgelenen sondan geçebilir: kurucu
   *     tabanına inilmiş, baskıncı serbest hissenin tamamını tek başına
   *     toplamış (kontrol dışındaki en büyük pay %2'nin altında) ve
   *     düşüş savunmasızdan sonra.
   * Bölüşülmüş paydan, blok satıştan ya da tabana inmeden gelen bir
   * düşüş bir hata demek ve kontrolü kırar.
   *
   * Tur 37a: "çoğunu ayakta tutuyor" parçası düştü. Yönetim yükü ikinci
   * sıradaki rakipleri de frenleyince gelen baskın hep tek baskıncılı:
   * yeni dört tohumda ihraç yalnızca birinde (2) ayakta tutuyor, üçünde
   * düşüş belgelenen sondan ve 33–71 gün geç (main'de iki tehditli
   * tohumun ikisi de ayaktaydı). Kalıcı kalkan Tur 28'den beri ihraç +
   * piyasadan geri alım; aşağıdaki kontrol onu dört tohumun dördünde
   * sınıyor. Buradaki iddia artık: ihraç düşüşü erteliyor ve kalkanla
   * düşüş YALNIZCA belgelenen sondan geçebilir.
   */
  const threatened = shields.filter(({ bare }) => bare.lost !== null);
  const calm = shields.filter(({ bare }) => bare.lost === null);
  const atTheEnd = ({ bare, issue }: (typeof shields)[number]): boolean =>
    issue.founder <= ISSUANCE.minFounderShare + 0.01 && issue.runnerUp < 0.02 && issue.lost! > bare.lost!;
  expect(
    'ihraç baskına karşı kalkan',
    threatened.length >= 2 && threatened.every((s) => s.issue.lost === null || atTheEnd(s)),
    threatened
      .map((s) =>
        s.issue.lost === null
          ? `seed ${s.seed}: ${s.bare.lost} → ayakta`
          : `seed ${s.seed}: ${s.bare.lost} → ${s.issue.lost} (${atTheEnd(s) ? 'kalkanın sonu: tek baskıncı, taban' : 'BEKLENMEYEN düşüş'}` +
            `, kurucu %${Math.round(s.issue.founder * 100)}, ikinci pay %${(s.issue.runnerUp * 100).toFixed(1)})`,
      )
      .join(' · ') +
      (calm.length > 0 ? ` · ölçüm dışı: ${calm.map(({ seed }) => `seed ${seed} (savunmasız da ayakta)`).join(', ')}` : ''),
  );

  /*
   * KALKANIN SONU KAPANIYOR (Tur 28): geri alım piyasadan.
   *
   * Tur 27'de kalkanın sonu tek baskıncının serbest hissenin tamamını
   * toplamasıydı ve oyuncunun elinde savunma kalmıyordu: ihraçtan sonra
   * geri alım yatırımcı payını geri alıyor, serbest hisseyi azaltmıyordu.
   * Geri alım artık serbest hisseden hazineye. Kurucu tabanında yatırımcı
   * %48,8'de; hazineye ~%1,2 çekilince tek baskıncı kalan her şeyi alsa da
   * %50'yi geçemiyor.
   *
   * Sınanan: aynı tehditli tohumlarda, ihraç kapanınca kilide yetecek
   * kadar geri alan oyuncu 900. güne ayakta; ihraçla düşen tohumda geri
   * alım gerçekten iş görmüş (hisse hazineye çekilmiş).
   */
  const locks = threatened.map((s) => ({ ...s, lock: defenseRun(s.seed, 'lock') }));
  for (const { seed, lock } of locks) {
    console.log(
      `  kilit seed ${String(seed).padStart(2)} | ${lock.lost ? `${lock.lost}. günde düşüyor` : 'ayakta'} · ` +
        `${lock.issued} ihraç · ${lock.boughtBack} hisse geri alım (${formatMoney(lock.buybackCost)}) · ` +
        `${lock.locked ? 'kilitli' : 'kilitsiz'} · 900. gün ${formatMoney(lock.worth)}`,
    );
  }
  expect(
    'ihraç + piyasadan geri alım kalkanı kalıcı yapıyor',
    locks.length >= 2 &&
      locks.every(({ lock }) => lock.lost === null) &&
      locks.every(({ issue, lock }) => issue.lost === null || lock.boughtBack > 0),
    locks
      .map(({ seed, issue, lock }) =>
        `seed ${seed}: ihraçla ${issue.lost ?? 'ayakta'} → kilitle ${lock.lost ?? 'ayakta'} (${lock.boughtBack} hisse)`,
      )
      .join(' · '),
  );

  // Kurucu kilidi: oyun başında hiçbir rakip satın alınamıyor.
  const early = new GameEngine(createNewGame({ seed: 3, companyName: 'Erken AŞ' }));
  for (let day = 1; day <= 5; day++) early.runDay();
  const rival = Object.values(early.getState().companies).find((c) => !c.isPlayer)!;
  const attempt = early.dispatch({ type: 'BUY_SHARES', companyId: rival.id, count: 100 });
  expect('oyun başı rakipler kurucu kilidinde', !attempt.ok, attempt.reason ?? 'alım geçti');

  // Devralmacı: en ucuz rakibe, kontrole yetecek nakdi olunca emir veren vekil.
  // Tur 20'den beri devralma bir emir; ilk devralma emrin BİTTİĞİ gün.
  const raider = new GameEngine(createNewGame({ seed: 1, companyName: 'Avcı AŞ' }));
  let firstTakeover: number | null = null;
  for (let day = 1; day <= 420; day++) {
    if (day % 5 === 0) {
      playerStrategy(raider);
      const state = raider.getState();
      const player = getPlayer(state);
      let best: { id: string; cost: number } | null = null;
      if (!player.orders) {
        for (const company of Object.values(state.companies)) {
          if (company.isPlayer) continue;
          if (company.lockedUntilDay !== undefined && state.time.day < company.lockedUntilDay) continue;
          const estimate = orderEstimate(state, player.id, company.id);
          if (estimate.need > 0 && !estimate.floatShort && (!best || estimate.cost < best.cost)) best = { id: company.id, cost: estimate.cost };
        }
      }
      if (best && best.cost < player.cash * 0.9) raider.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: best.id });
    }
    raider.runDay();
    if (firstTakeover === null && (getPlayer(raider.getState()).acquisitions ?? 0) > 0) firstTakeover = day;
  }
  const victory = raider.getState().victory;
  console.log(`  devralmacı vekil | ilk devralma ${firstTakeover ?? '-'}. gün · 420. günde zafer ${victory ? `${victory.kind} ${victory.day}. gün` : 'yok'}`);
  expect('devralmacı vekil kilit bitmeden devralamıyor', firstTakeover !== null && firstTakeover >= 160, `${firstTakeover ?? '-'}. gün`);
  expect('tekel zaferi 400. günden önce gelmiyor', !victory || victory.day >= 400, victory ? `${victory.kind} ${victory.day}. gün` : 'zafer yok');
});

/*
 * GÜÇLÜ AMA PASİF OYUNCU (Tur 37d-3).
 *
 * Tek baskıncı yalnızca kendinden belirgin küçüğe saldırıyor; öne geçip el
 * çeken oyuncu baskından kurtuluyordu. Konsorsiyumdan önce 400. günde el
 * çeken vekil on tohumun onunda 1200. güne ayakta kaldı ve zafere ulaştı.
 * İddia iki parça: el çeken lider konsorsiyuma düşüyor; uyarı gelince
 * yatırıma dönen (vekil yeniden oynuyor) ayakta kalıyor ve zafere ulaşıyor.
 * Etkin oynayan lidere kurulmaması birim testinde (`consortium.test.ts`).
 */
section('Rakip konsorsiyumu: güçlü ama pasif oyuncu', () => {
  function passiveRun(seed: number, respond: boolean) {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Pasif AŞ' }));
    let formed: number | null = null;
    let lost: number | null = null;
    for (let day = 1; day <= 800; day++) {
      const state = engine.getState();
      if ((day <= 400 || (respond && state.consortium)) && day % 5 === 0) playerStrategy(engine);
      const labor = getPlayer(engine.getState()).labor;
      if (labor?.demand) engine.dispatch({ type: 'RESPOND_UNION', response: 'compromise' });
      engine.runDay();
      const after = engine.getState();
      if (after.consortium && formed === null) formed = day;
      if (after.gameOver) {
        lost = day;
        break;
      }
    }
    const state = engine.getState();
    return { formed, lost, by: state.gameOver?.byCompanyId ?? null, victory: state.victory?.day ?? null };
  }
  const runs = [1, 2, 3].map((seed) => ({ seed, idle: passiveRun(seed, false), respond: passiveRun(seed, true) }));
  for (const { seed, idle, respond } of runs) {
    console.log(
      `  seed ${seed} | el çeken: konsorsiyum ${idle.formed ?? '-'}. gün · ${idle.lost ? `${idle.lost}. günde düşüyor` : 'ayakta'} · ` +
        `cevap veren: ${respond.lost ? `${respond.lost}. günde düşüyor` : 'ayakta'}, zafer ${respond.victory ?? '-'}`,
    );
  }
  const fell = runs.filter(({ idle }) => idle.lost !== null && idle.formed !== null && idle.formed < idle.lost);
  expect(
    'güçlü ama pasif oyuncu konsorsiyuma düşüyor',
    fell.length >= 2,
    runs.map(({ seed, idle }) => `seed ${seed}: ${idle.lost ?? 'ayakta'}`).join(' · '),
  );
  /*
   * Tur 38: rakip bütçesi büyüyünce seed 3'te 400. günde el çeken oyuncu
   * hiç 1,3 kat öne geçmiyor: konsorsiyum kurulmuyor, "cevap veren" vekil de
   * yalnız konsorsiyum varken oynadığı için el çekmiş kalıyor. İddia
   * konsorsiyuma cevap veren lider hakkında; konsorsiyumun kurulduğu
   * tohumlarda ölçülüyor (en az ikisinde).
   */
  const answered = runs.filter(({ respond }) => respond.formed !== null);
  expect(
    'konsorsiyuma yatırımla cevap veren lider ayakta kalıyor ve zafere ulaşıyor',
    answered.length >= 2 && answered.every(({ respond }) => respond.lost === null && respond.victory !== null),
    runs
      .map(({ seed, respond }) => `seed ${seed}: ${respond.formed === null ? 'konsorsiyum yok' : `${respond.lost ?? 'ayakta'}, zafer ${respond.victory ?? '-'}`}`)
      .join(' · '),
  );
});

section('Devralma emri: günlük tavan ve savunma', () => {
  /*
   * Tur 20: oyuncunun alımı da rakiplerinki gibi günde %3,5 (Dengeli; Tur 38'den beri %4,5).
   * Devralma tek tık değil bir emir; hedef %30'u görünce geri alım (ve
   * doktrini varsa ihraç) ile savunuyor, dolaşım kontrole yetmez hâle
   * gelirse emir düşüyor.
   *
   * Ölçüm (900 gün, tohum 1/7/42, en ucuz rakibe emir veren vekil):
   *   savunmasız hedef 14 günde düşüyor (5.001 / 350)
   *   geri alımla savunan Nova 14–19 gün, bir tohumda savuşturuyor
   *   ihraçla savunan Meridyen iki tohumda savuşturuyor
   *   değer zaferi 503/716/634 → 519/793/636. gün
   * Sınanan iddialar: emir tavanı aşmıyor; savunma gerçek (en az bir emir
   * düşüyor) ama aşılmaz değil (her tohumda devralma var).
   */
  type Outcome = { id: string; placed: number; minDays: number; end: number | null; defended: boolean };
  function orderRun(seed: number, days: number): Outcome[] {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Emir AŞ' }));
    const outcomes: Outcome[] = [];
    let open: Outcome | null = null;
    let seen = 0;
    for (let day = 1; day <= days; day++) {
      const state = engine.getState();
      if (day % 5 === 0) {
        playerStrategy(engine);
        const player = getPlayer(state);
        if (!player.orders) {
          let best: { id: string; cost: number; days: number } | null = null;
          for (const company of Object.values(state.companies)) {
            if (company.isPlayer) continue;
            if (company.lockedUntilDay !== undefined && state.time.day < company.lockedUntilDay) continue;
            const e = orderEstimate(state, player.id, company.id);
            if (e.need > 0 && !e.floatShort && (!best || e.cost < best.cost)) best = { id: company.id, cost: e.cost, days: e.days };
          }
          if (best && best.cost < player.cash * 0.9 && engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: best.id }).ok) {
            open = { id: best.id, placed: day, minDays: best.days, end: null, defended: false };
            outcomes.push(open);
          }
        }
      }
      engine.runDay();
      if (state.gameOver) break;
      if (open && !state.companies[open.id]) {
        open.end = day;
        open = null;
      }
      for (const n of state.news) {
        if (n.id <= seen) break;
        if (open && n.companyId === open.id && n.title.includes('savuşturdu')) {
          open.defended = true;
          open.end = day;
          open = null;
        }
      }
      seen = state.news[0]?.id ?? seen;
    }
    return outcomes;
  }

  const runs = [7, 42].map((seed) => ({ seed, outcomes: orderRun(seed, 520) }));
  for (const { seed, outcomes } of runs) {
    console.log(
      `  emir seed ${String(seed).padStart(2)} | ` +
        outcomes
          .map((o) => `${o.id.slice(0, 6)} ${o.placed}→${o.end ?? '…'} ${o.defended ? 'savuşturdu' : o.end ? `${o.end - o.placed + 2} gün` : 'sürüyor'}`)
          .join(' · '),
    );
  }
  const done = runs.flatMap((r) => r.outcomes.filter((o) => o.end !== null && !o.defended));
  /*
   * Alım günü = bitiş − veriliş + 2: emir döngü gününden ÖNCE veriliyor
   * (takvim bir gün geride) ve o gün de alım yapıyor. Tahmin emir
   * günündeki payı hesaba katıyor; emir sürerken başka bir devirle pay
   * gelirse daha kısa sürebilir — bu tohumlarda yok.
   */
  const span = (o: Outcome) => o.end! - o.placed + 2;
  const tooFast = done.filter((o) => span(o) < o.minDays);
  expect('emir günlük tavanı aşmıyor', done.length > 0 && tooFast.length === 0,
    tooFast.map((o) => `${o.id} ${span(o)}<${o.minDays}`).join(' ') || `${done.length} devralma, hepsi ≥ tahmin`);
  expect('hedef savunabiliyor: en az bir emir düşüyor', runs.some((r) => r.outcomes.some((o) => o.defended)),
    runs.map((r) => `seed ${r.seed}: ${r.outcomes.filter((o) => o.defended).length} düştü`).join(' · '));
  expect('savunma aşılmaz değil: her tohumda devralma var', runs.every((r) => r.outcomes.some((o) => o.end !== null && !o.defended)),
    runs.map((r) => `seed ${r.seed}: ${r.outcomes.filter((o) => o.end !== null && !o.defended).length} devralma`).join(' · '));
});

section('Büyük şehir (5×5)', () => {
  /*
   * Tur 21. Ölçülen (900 gün, tohum 1/7/42, savunan bilgili vekil):
   *   standart  360. gün boş talep %4–7 · zafer 619 / 796 / yok
   *   büyük     ilk sürüm (köşe kilidi, tempo 1): 360. gün %18–24, oyuncu
   *             720. günde 184–199 M ₺, zafer 498–529 — kolay mod
   *   büyük     dış halka kilitli + tempo 2 + eşik ×1,5: 360. gün %12–13,
   *             zafer 682 / 732 / yok
   * Sınanan iddialar: şehir 360. günde doluyor (boş talep bandı), rakipler
   * rekabetçi (en iyi rakip oyuncunun en az %60'ı), zafer 600. günden önce
   * gelmiyor, geç oyunda bir gün 3x hızın (480 ms) altında kalıyor.
   */
  for (const seed of [7, 42]) {
    const engine = new GameEngine(createNewGame({ seed, citySize: 'large', companyName: 'Büyük AŞ' }));
    const state = engine.getState();
    let unmet360 = 0;
    let lateMs = 0;
    for (let day = 1; day <= 720; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      if (day % 3 === 0) defendAgainstRaids(engine);
      const t0 = performance.now();
      engine.runDay();
      if (day > 660) lateMs += performance.now() - t0;
      if (day === 360) {
        let weighted = 0;
        let total = 0;
        for (const district of state.districts) {
          if (district.opensOnDay !== undefined && day < district.opensOnDay) continue;
          const demand = Object.values(district.demand).reduce((a, b) => a + b, 0);
          weighted += districtOpportunity(district) * demand;
          total += demand;
        }
        unmet360 = total > 0 ? weighted / total : 0;
      }
      if (state.gameOver) break;
    }
    const player = getPlayer(state);
    const best = Object.values(state.companies).filter((c) => !c.isPlayer).reduce((a, c) => Math.max(a, c.netWorth), 0);
    console.log(
      `  büyük seed ${String(seed).padStart(2)} | 360. gün boş talep %${Math.round(unmet360 * 100)} · 720. gün oyuncu ${formatMoney(player.netWorth)} · ` +
        `en iyi rakip ${formatMoney(best)} · zafer ${state.victory ? `${state.victory.day}. gün` : 'yok'} · geç oyun ${(lateMs / 60).toFixed(0)} ms/gün`,
    );
    expect(`büyük seed ${seed}: şehir doluyor (360. gün boş talep < %25)`, unmet360 < 0.25, `%${Math.round(unmet360 * 100)}`);
    expect(`büyük seed ${seed}: rakipler rekabetçi`, best >= player.netWorth * 0.6, `${formatMoney(best)} / ${formatMoney(player.netWorth)}`);
    expect(`büyük seed ${seed}: zafer 600. günden önce gelmiyor`, !state.victory || state.victory.day >= 600,
      state.victory ? `${state.victory.day}. gün` : 'zafer yok');
    expect(`büyük seed ${seed}: geç oyun günü 3x hızın altında`, lateMs / 60 < 480, `${(lateMs / 60).toFixed(0)} ms/gün`);
  }
});

interface DirectiveRun {
  peak: number;
  lostDay: number | null;
  defense: number;
  worth: number;
  treasury: number;
  /** Kurucu şehirden kasaya çıkan sermaye (importedCapital düşüşü). */
  exported: number;
  holding: number;
}

/** Açılış anından, kurucu şehre bir talimatla `days` gün (Tur 32). */
function directiveRun(snapshot: GameState, days: number, payout: RemotePayout, defend: boolean): DirectiveRun {
  const engine = new GameEngine(structuredClone(snapshot));
  engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, payout, defend });
  const city = engine.getState();
  const away = city.holding!.dormant[0]!;
  const imported = away.state.importedCapital ?? 0;
  let peak = 0;
  let defense = 0;
  for (let day = 0; day < days; day++) {
    if (city.time.day % 5 === 0) playerStrategy(engine);
    if (city.time.day % 3 === 0) defendAgainstRaids(engine);
    engine.runDay();
    peak = Math.max(peak, raidStatus(away.state).fraction);
    defense += away.lastDefense?.cost ?? 0;
    if (city.gameOver) break;
  }
  return {
    peak,
    lostDay: away.state.gameOver?.day ?? null,
    defense,
    worth: getPlayer(away.state).netWorth,
    treasury: city.holding!.treasury,
    exported: imported - (away.state.importedCapital ?? 0),
    holding: holdingNetWorth(city),
  };
}

section('Holding: ikinci şehir', () => {
  /*
   * Tur 22. Zafer kazanılan şehirden yeni şehre açılınca:
   *   - sermaye taşınıyor, kurucu şehir donuyor (takvimi ilerlemiyor) —
   *     Tur 30'dan beri yaşıyor, aşağıda;
   *   - kurucu şehrin kâr eğiliminin yarısı her gün holding kasasına —
   *     Tur 30'dan beri o günkü gerçek kârının yarısı;
   *   - ikinci şehrin zaferi getirilen sermayeyle değil şehirde yaratılan
   *     değerle: dışarıdan gelen 10 M ₺'lik kasa zaferi bedavaya getirmemeli.
   * Ölçülen (tohum 1/7/42, sermaye nakdin %25'i): 1. şehir 647/808/700. gün,
   * 2. şehir 700/627/715. gün; kasa 55–105 M ₺.
   *
   * Tur 25: bölüm üç tohumun üçünde de koşuyor. Tek tohum (1) kıl payı bir
   * yarıştı — main'de de ikinci şehirde 114 M'ye 106 M ile kazanılıyordu.
   * Elektroniğe iki yeni bina gelince elektronik uzmanı rakip o tohumda
   * 1.200. günde 258 M'ye 249 M öne geçti, diğer iki tohumda ise zafer
   * öne geldi (584 ve 613. gün). "İkinci şehir kazanılabilir" iddiası artık
   * üç şehrin en az ikisinde ölçülüyor; "bedava değil" sınırı (400. gün) ve
   * holding mekaniği her tohumda.
   */
  const results: { seed: number; second: number | null }[] = [];
  const directives: { seed: number; half: number; halfLost: number | null; all: DirectiveRun; allDefended: DirectiveRun; keep: DirectiveRun }[] = [];
  for (const seed of [1, 7, 42]) {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Holding AŞ' }));
    const state = () => engine.getState();
    let awayPeak = 0;
    const play = (limit: number) => {
      for (let day = 0; day < limit; day++) {
        const s = state();
        if (s.time.day % 5 === 0) playerStrategy(engine);
        if (s.time.day % 3 === 0) defendAgainstRaids(engine);
        engine.runDay();
        const away = s.holding?.dormant[0]?.state;
        if (away) awayPeak = Math.max(awayPeak, raidStatus(away).fraction);
        if (s.gameOver || s.victory) return;
      }
    };
    play(1200);
    const founding = state();
    const firstVictory = founding.victory?.day ?? null;
    const foundingDay = founding.time.day;
    const capital = Math.max(2_000_000, Math.round(getPlayer(founding).cash * 0.25));
    const trend = cityTrend(founding);
    if (founding.victory) engine.dispatch({ type: 'DISMISS_VICTORY' });
    const opened = engine.dispatch({ type: 'OPEN_CITY', citySize: 'standard', capital });
    expect(`tohum ${seed}: zafer kazanılan şehirden yeni şehir açılıyor`, opened.ok && firstVictory !== null,
      opened.reason ?? `${firstVictory}. gün zafer · ${formatMoney(capital)} sermaye · ${state().cityName}`);
    if (!opened.ok) continue;

    const city = state();
    // Talimat ölçümü (Tur 32) aynı açılış anından, ayrı motorlarda.
    const snapshot = structuredClone(city);
    const away = city.holding!.dormant[0]!.state;
    const awayWorth = getPlayer(away).netWorth;
    const awayImported = away.importedCapital ?? 0;
    play(1200);
    const secondVictory = city.victory?.day ?? null;
    const days = city.time.day;
    const treasury = city.holding?.treasury ?? 0;
    const dormantDay = away.time.day;
    const leader = Object.values(city.companies).sort((a, b) => b.netWorth - a.netWorth)[0]!;
    const awayStage = raidStatus(away);
    console.log(
      `  tohum ${seed}: 1. şehir ${firstVictory}. gün zafer (eğilim ${formatMoney(trend)}/gün) · 2. şehir ${secondVictory ?? '-'}. gün · ` +
        `kasa ${formatMoney(treasury)} (donuk modelde ${formatMoney(Math.max(0, trend) * 0.5 * days)}) · holding ${formatMoney(holdingNetWorth(city))} · ` +
        `lider ${leader.name} ${formatMoney(leader.netWorth)}`,
    );
    console.log(
      `    kurucu şehir uzakta: ${away.gameOver ? `${away.gameOver.day}. günde kaybedildi` : 'ayakta'} · değer ${formatMoney(awayWorth)} → ` +
        `${formatMoney(getPlayer(away).netWorth)} · en büyük dış pay %${Math.round(awayStage.fraction * 100)}`,
    );
    /*
     * Tur 30: şehirler eşzamanlı yaşıyor. Tur 22'nin iki iddiası ("bekleyen
     * şehrin takvimi duruyor", "kasaya her gün eğilimin yarısı akıyor")
     * bilerek değişti. Yerlerine:
     *   - kurucu şehir de yaşıyor: takvimi ikinci şehirle birlikte ilerliyor
     *     (kaybedilirse o gün duruyor);
     *   - kasaya akan her lira kurucu şehirden çıktı: kasa, kurucu şehrin
     *     "şehirden çıkan sermaye" defterinin (importedCapital) düşüşüne
     *     eşit. Para yoktan doğmuyor; donuk modelde doğuyordu.
     */
    const lostDay = away.gameOver?.day;
    expect(
      `tohum ${seed}: kurucu şehir de yaşıyor (takvimler birlikte)`,
      lostDay !== undefined ? dormantDay === lostDay : dormantDay === foundingDay + days,
      `${dormantDay}. günde · ayrılış ${foundingDay} + ${days} gün${lostDay !== undefined ? ` · ${lostDay}. günde kaybedildi` : ''}`,
    );
    expect(
      `tohum ${seed}: kasaya akan her lira kurucu şehirden çıktı`,
      treasury > 0 && Math.abs(treasury - (awayImported - (away.importedCapital ?? 0))) < 1,
      `kasa ${formatMoney(treasury)} · kurucu şehirden çıkan ${formatMoney(awayImported - (away.importedCapital ?? 0))}`,
    );
    expect(
      `tohum ${seed}: getirilen sermaye zaferi bedavaya getirmiyor (400. günden önce değil)`,
      secondVictory === null || secondVictory >= 400,
      `${secondVictory ?? '-'}. gün · getirilen ${formatMoney(capital)}`,
    );
    expect(`tohum ${seed}: holding tek şehirden büyük`, holdingNetWorth(city) > getPlayer(city).netWorth, formatMoney(holdingNetWorth(city)));
    results.push({ seed, second: secondVictory });

    const all = directiveRun(snapshot, days, 'all', false);
    const allDefended = directiveRun(snapshot, days, 'all', true);
    const keep = directiveRun(snapshot, days, 'keep', false);
    directives.push({ seed, half: awayPeak, halfLost: away.gameOver?.day ?? null, all, allDefended, keep });
    const line = (label: string, run: DirectiveRun) =>
      `${label}: ${run.lostDay !== null ? `${run.lostDay}. günde kaybedildi` : 'ayakta'} · tepe dış pay %${Math.round(run.peak * 100)} · ` +
      `savunma ${formatMoney(run.defense)} · kurucu ${formatMoney(run.worth)} · kasa ${formatMoney(run.treasury)} · holding ${formatMoney(run.holding)}`;
    console.log(`    talimat (yarısı: tepe dış pay %${Math.round(awayPeak * 100)}) · ${line('hepsi', all)}`);
    console.log(`      ${line('hepsi + savunma', allDefended)} · ${line('şehirde tut', keep)}`);
  }
  /*
   * Tur 32: uzaktaki şehrin talimatı. Ölçülen (tohum 1/7/42, 470 gün):
   *   - kârın HEPSİNİ çeken şehir nakitsiz kalıyor, hissesi ucuzluyor:
   *     tepe dış pay %7/42/0 → %14/53/53, iki tohumda kurucu şehir
   *     kaybedildi;
   *   - hepsi + savunma: %14/21/25, şehir ayakta; bedeli ~40 M ₺ (kilit
   *     şirketin yarısını hazineye çekmek demek);
   *   - şehirde tutulan kâr baskını caydırıyor (%0), holding değeri
   *     yarısıyla aynı: para kasada değil şehirde duruyor.
   *
   * Tur 37a: yönetim yükü büyük şehrin kârını kısınca kârın hepsini
   * çeken şehrin savunma bütçesi de küçüldü. Tohum 1'de baskın eskiden
   * %14'te kalıyordu, savunma tetiklenmiyordu (%20 eşiği); artık geliyor,
   * savunma 37 M ₺ harcıyor ve şehri %32'de tutuyor (main %14/21/25 →
   * %32/21/21). İddianın özü — şehir ayakta, baskıncı kontrolden uzak —
   * yerinde; geç oyunda büyük şehrin daha kırılgan olması 37a'nın
   * amacı. Eşik %30'dan %35'e.
   *
   * Tur 38: rakip bütçesi büyüyünce varsayılan talimat (yarısı, savunmasız)
   * da iki tohumda kurucu şehri kaybediyor (7 ve 42: 955-956. gün, dış pay
   * %54). Uzak şehir tanımı gereği pasif ve oyuncu %25/%40'ta uyarılıyor;
   * savunmasız pasif şirketin avlanması Dengeli'nin kuralı. Kârın hepsini
   * çeken şehir artık "daha derin" değil "daha derin ya da daha erken"
   * düşüyor (915/936 < 955/956); iki talimat da tavana vurunca derinlik
   * ayırt edemiyor.
   *
   * Tur 57: enerji krizi takvime girince kriz sırası değişti ve tohum 7'de
   * yarısını çeken şehir de 936. günde, kârın hepsini çekenle aynı baskında
   * düşüyor (main 955 → 936). İddia "hepsini çekmek şehri korumuyor":
   * baskın daha derin ya da şehir en geç aynı gün düşüyor.
   */
  expect(
    'kârın hepsini çeken uzak şehre baskın derinleşiyor ya da şehir en geç aynı gün düşüyor (üç tohumda)',
    directives.every((d) => d.all.peak > d.half || (d.all.lostDay !== null && (d.halfLost === null || d.all.lostDay <= d.halfLost))),
    directives
      .map((d) => `tohum ${d.seed}: %${Math.round(d.half * 100)}${d.halfLost ? ` (${d.halfLost})` : ''} → %${Math.round(d.all.peak * 100)}${d.all.lostDay ? ` (${d.all.lostDay})` : ''}`)
      .join(' · '),
  );
  expect(
    'savunma talimatı uzak şehri tutuyor: kâr hepsi kasaya giderken de ayakta, dış pay %35\'in altında',
    directives.every((d) => d.allDefended.lostDay === null && d.allDefended.peak < 0.35),
    directives.map((d) => `tohum ${d.seed}: %${Math.round(d.allDefended.peak * 100)}${d.allDefended.lostDay !== null ? ' kayıp' : ''}`).join(' · '),
  );
  expect(
    'savunmanın parası şehrin kendi kasasından: kasaya akan her lira yine şehirden çıktı',
    directives.every((d) => d.allDefended.defense > 0 || d.allDefended.peak < 0.2) &&
      directives.every((d) => Math.abs(d.allDefended.treasury - d.allDefended.exported) < 1),
    directives.map((d) => `tohum ${d.seed}: savunma ${formatMoney(d.allDefended.defense)} · kasa ${formatMoney(d.allDefended.treasury)}`).join(' · '),
  );
  expect(
    'şehirde tutulan kâr baskını caydırıyor (dış pay yarısındakinden büyük değil)',
    directives.every((d) => d.keep.peak <= d.half && d.keep.lostDay === null),
    directives.map((d) => `tohum ${d.seed}: %${Math.round(d.keep.peak * 100)}`).join(' · '),
  );
  const won = results.filter((r) => r.second !== null);
  expect(
    'ikinci şehirde de zafer var (üç tohumun en az ikisinde)',
    won.length >= 2,
    results.map((r) => `tohum ${r.seed}: ${r.second ?? '-'}. gün`).join(' · '),
  );
});

section('Rakip koltukları dolu kalıyor', () => {
  /*
   * Tur 22. Devralma yapan vekil büyük şehirde (sekiz koltuk, kataloğun
   * sekizi de baştan sahnede) ilk devralmada kataloğu bitiriyordu; 178.
   * günden 1.200. güne sekiz koltuk üç-dört rakibe iniyordu ve yerine
   * kimse gelmiyordu. Katalog bitince yeni rakip üretiliyor ve giriş
   * beklemesi koltuk sayısıyla ölçekli (büyükte 60 gün).
   *
   * Ölçülen (1.200 gün, tohum 1/7/42): önce 4 / 3 / 3 rakip, sonra 7 / 8 / 7.
   * Sınanan iddialar: katalog gerçekten bitiyor (kontrol anlamlı), en az üç
   * rakip üretiliyor, geç oyunda koltukların en az altısı dolu, sahnedeki
   * adlar ve renkler tekrar etmiyor.
   */
  const engine = new GameEngine(createNewGame({ seed: 7, citySize: 'large', companyName: 'Avcı AŞ' }));
  const state = engine.getState();
  let exhaustedDay: number | null = null;
  for (let day = 1; day <= 800; day++) {
    if (day % 5 === 0) {
      playerStrategy(engine);
      const player = getPlayer(state);
      if (!player.orders) {
        let best: { id: string; cost: number } | null = null;
        for (const company of Object.values(state.companies)) {
          if (company.isPlayer) continue;
          if (company.lockedUntilDay !== undefined && day < company.lockedUntilDay) continue;
          const estimate = orderEstimate(state, player.id, company.id);
          if (estimate.need > 0 && !estimate.floatShort && (!best || estimate.cost < best.cost)) best = { id: company.id, cost: estimate.cost };
        }
        if (best && best.cost < player.cash * 0.9) engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: best.id });
      }
    }
    if (day % 3 === 0) defendAgainstRaids(engine);
    engine.runDay();
    if (state.gameOver) break;
    if (exhaustedDay === null) {
      const history = new Set(state.rivalHistory ?? []);
      const rivals = Object.values(state.companies).filter((c) => !c.isPlayer).length;
      if (rivals < (state.rivalSlots ?? 0) && NPC_PROFILES.every((p) => history.has(p.id))) exhaustedDay = day;
    }
  }
  const onStage = Object.values(state.companies).filter((c) => !c.isPlayer);
  const generated = state.extraProfiles ?? [];
  console.log(
    `  büyük seed  7 · avcı vekil | katalog ${exhaustedDay ?? '-'}. günde bitti · ${generated.length} rakip üretildi · ` +
      `800. günde ${onStage.length}/${state.rivalSlots} koltuk · sahnede: ${onStage.map((c) => c.name).join(', ')}`,
  );
  expect('katalog bitiyor (kontrol anlamlı)', exhaustedDay !== null, `${exhaustedDay ?? '-'}. gün`);
  expect('katalog bitince yeni rakip geliyor', generated.length >= 3, `${generated.length} üretilen`);
  expect('geç oyunda koltuklar dolu', onStage.length >= 6, `${onStage.length}/${state.rivalSlots}`);
  expect(
    'sahnedeki adlar ve renkler tekrar etmiyor',
    new Set(onStage.map((c) => c.name)).size === onStage.length && new Set(onStage.map((c) => c.color)).size === onStage.length,
    onStage.map((c) => `${c.name} ${c.color}`).join(' · '),
  );
});

section('Senaryolar: kazanılabilir ama bedava değil', () => {
  /*
   * Tur 39. Her senaryo vekille oynanıyor: hiçbir şey yapmayan, yalnızca
   * savunan, yalnızca büyüyen, ikisini de yapan ve daha keskin oynayan.
   * İddia: el sürmeyen kaybediyor, oyunun tavsiyesine uyan kazanıyor, üç
   * yıldız vekilin en iyisinden iyi oyun istiyor. Ön tarih senaryo başına
   * bir kez; her kol kopyasıyla.
   */
  interface Plan {
    /** Vekilin kaç günde bir kurduğu (0: hiç). */
    every: number;
    /** Baskına karşı geri alım: 0 hiç, 1 her gün, 3 üç günde bir. */
    defend: number;
    /** Boşa çalışan Ar-Ge ve pazarlamayı ilk gün yık. */
    prune?: boolean;
  }
  const bases = new Map<string, string>();
  function play(id: string, plan: Plan, crises = true) {
    if (!bases.has(id)) bases.set(id, JSON.stringify(createScenarioGame(id, { companyName: 'Senaryo AŞ' })));
    const state = JSON.parse(bases.get(id)!) as GameState;
    // Kriz kapalı kol (Krizin ortasında): fırsatın krizden geldiğini ölçmek için.
    if (!crises) state.flags.crises = false;
    const engine = new GameEngine(state);
    engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' });
    const start = state.time.day;
    if (plan.prune) {
      for (const building of Object.values(state.buildings)) {
        const role = BUILDING_BY_ID[building.defId]?.role;
        if (building.companyId === state.playerCompanyId && (role === 'research' || role === 'marketing')) {
          engine.dispatch({ type: 'DEMOLISH', tileId: building.tileId });
        }
      }
    }
    while (state.scenario!.finishedDay === undefined) {
      const day = state.time.day - start;
      if (plan.every > 0 && day % plan.every === 0) playerStrategy(engine);
      if (plan.defend > 0 && day % plan.defend === 0) defendAgainstRaids(engine);
      engine.runDay();
    }
    const run = state.scenario!;
    return { won: run.outcome === 'won', stars: run.stars ?? 0, score: run.score ?? 0, taken: state.gameOver !== undefined, day: run.finishedDay! - start };
  }
  const show = (result: ReturnType<typeof play>) =>
    `${result.won ? `kazandı ${result.stars}★` : result.taken ? 'devralındı' : 'süre doldu'} · ${result.day}. gün · skor ${result.score}`;

  const rescue = SCENARIO_BY_ID.rescue!;
  const r = {
    passive: play('rescue', { every: 0, defend: 0 }),
    defend: play('rescue', { every: 0, defend: 3 }),
    grow: play('rescue', { every: 5, defend: 0 }),
    informed: play('rescue', { every: 5, defend: 3 }),
    prune: play('rescue', { every: 5, defend: 3, prune: true }),
    sharp: play('rescue', { every: 3, defend: 1, prune: true }),
    slow: play('rescue', { every: 15, defend: 3 }),
  };
  for (const [name, result] of Object.entries(r)) console.log(`  Kurtarma · ${name.padEnd(8)} ${show(result)}`);
  expect(
    'Kurtarma: el sürmeyen, yalnız savunan ve yalnız büyüyen devralınıyor',
    [r.passive, r.defend, r.grow].every((result) => result.taken),
    [r.passive, r.defend, r.grow].map(show).join(' | '),
  );
  expect('Kurtarma: savunup büyüyen hedefe ulaşıyor', r.informed.won, show(r.informed));
  expect(
    'Kurtarma: boşa çalışan binaları da yıkan daha erken (en az iki yıldız)',
    r.prune.won && r.prune.stars >= 2 && r.prune.day < r.informed.day,
    `${show(r.prune)} < ${r.informed.day}`,
  );
  expect(
    'Kurtarma: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    r.sharp.won && r.sharp.day > rescue.stars.three,
    `${show(r.sharp)} > ${rescue.stars.three}`,
  );
  expect('Kurtarma: on beş günde bir kuran süreyi dolduruyor', !r.slow.won, show(r.slow));

  const crisis = SCENARIO_BY_ID.crisis!;
  const c = {
    passive: play('crisis', { every: 0, defend: 0 }),
    slow: play('crisis', { every: 15, defend: 3 }),
    informed: play('crisis', { every: 5, defend: 3 }),
    calm: play('crisis', { every: 5, defend: 3 }, false),
    sharp: play('crisis', { every: 3, defend: 1 }),
  };
  for (const [name, result] of Object.entries(c)) console.log(`  Krizin ortasında · ${name.padEnd(8)} ${show(result)}`);
  expect('Krizin ortasında: kasada bekleyen geride kalıyor', !c.passive.won && c.passive.score < 0.5, show(c.passive));
  expect('Krizin ortasında: on beş günde bir kuran yetişemiyor', !c.slow.won, show(c.slow));
  expect('Krizin ortasında: beş günde bir kuran en değerli şirket', c.informed.won, show(c.informed));
  expect(
    'Krizin ortasında: fırsat krizden geliyor (kriz kapalıyken aynı oyun daha geride)',
    c.calm.score < c.informed.score,
    `kriz yok ${c.calm.score} < kriz ${c.informed.score}`,
  );
  expect(
    'Krizin ortasında: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    c.sharp.won && c.sharp.score < crisis.stars.three,
    `${show(c.sharp)} < ${crisis.stars.three}`,
  );
});

section('Senaryolar II: konsorsiyum, zincir ve sponsor', () => {
  /*
   * Tur 39b. Aynı yöntem: el sürmeyen kaybediyor, oyunun tavsiyesine uyan
   * kazanıyor, üç yıldız vekilin en keskin oyunundan iyisini istiyor.
   * Zincir ustası için büyüme vekili yetmiyor (zincir kurmuyor): zincir
   * vekili önce hammadde ve işlemeyi, sonra ürünü satan mağazayı kuruyor.
   * Şehrin sponsoru için ihale vekili katkı penceresinin sonunda lideri bir
   * payla geçiyor.
   */
  interface Plan {
    /** Vekilin kaç günde bir oynadığı (0: hiç). */
    every: number;
    /** Baskına karşı geri alım: 0 hiç, n günde bir. */
    defend: number;
    /** Büyüme vekili (oyunun tavsiyesi). */
    general?: boolean;
    /** Zincir vekili. */
    chain?: boolean;
    /** Açılmış halka eksikken büyüme bekliyor, nakit halkaya. */
    chainFirst?: boolean;
    /** İhale: son `last` günde lideri `margin` payla geç. */
    sponsor?: { margin: number; last: number };
  }
  // Zincir ustasının zinciri; hedef ürün değişirse vekil de değişmeli.
  const CHAIN = { goodId: 'phone', raw: 'silicon_mine', process: 'chip_fab', small: 'phone_shop', big: 'electronics_store' };
  const chainGoal = SCENARIO_BY_ID.chain!.goal;
  expect('Zincir ustası: vekilin zinciri senaryonun ürünü', chainGoal.kind === 'chain' && chainGoal.goodId === CHAIN.goodId, JSON.stringify(chainGoal));

  /** Açık bir arsaya (kendi boş arsası da olur) binayı kurar; mağazanın rafına hedef ürünü koyar. */
  function buildAt(engine: Engine, defId: string, zones: string[] | null): boolean {
    const state = engine.getState();
    const player = getPlayer(state);
    const def = BUILDING_BY_ID[defId]!;
    if (player.netWorth < def.unlockNetWorth) return false;
    const tiles = state.map.tiles
      .filter((t) => t.kind === 'plot' && (!t.ownerId || t.ownerId === player.id) && !t.buildingId && isDistrictOpen(state, t.districtId))
      .filter((t) => !zones || zones.includes(state.districts[t.districtId]!.archetype))
      .map((t) => ({ t, price: t.ownerId === player.id ? 0 : tilePrice(state, t.id, player.id) }))
      .filter((e) => e.price > 0 || e.t.ownerId === player.id)
      .sort((a, b) => {
        if (def.role === 'outlet') {
          const ua = state.districts[a.t.districtId]!.unmet[def.category] ?? 0;
          const ub = state.districts[b.t.districtId]!.unmet[def.category] ?? 0;
          if (ua !== ub) return ub - ua;
        }
        return (a.t.structureId ? 1 : 0) - (b.t.structureId ? 1 : 0) || a.price - b.price;
      });
    for (const { t, price } of tiles.slice(0, 6)) {
      if (price + def.cost > player.cash * 0.8) continue;
      const bought =
        t.ownerId === player.id ||
        engine.dispatch(t.structureId ? { type: 'BUYOUT_TILE', tileId: t.id } : { type: 'BUY_TILE', tileId: t.id }).ok;
      if (!bought || !engine.dispatch({ type: 'BUILD', tileId: t.id, defId }).ok) continue;
      const building = state.buildings[state.map.tiles[t.id]!.buildingId!]!;
      if (def.role === 'outlet' && !building.stocked.includes(CHAIN.goodId)) {
        const goodIds = [CHAIN.goodId, ...building.stocked.filter((g) => g !== CHAIN.goodId)].slice(0, def.slots ?? 1);
        engine.dispatch({ type: 'SET_STOCK', buildingId: building.id, goodIds });
      }
      return true;
    }
    return false;
  }
  const owns = (state: GameState, defId: string) =>
    Object.values(state.buildings).some((b) => b.companyId === state.playerCompanyId && b.defId === defId);
  /** Eksik halkalardan açılmış olan var mı (nakit ona saklanıyor). */
  function linkWaiting(state: GameState): boolean {
    const player = getPlayer(state);
    return [CHAIN.raw, CHAIN.process].some((d) => !owns(state, d) && player.netWorth >= BUILDING_BY_ID[d]!.unlockNetWorth);
  }
  function chainStep(engine: Engine): void {
    const state = engine.getState();
    const player = getPlayer(state);
    const missing = [CHAIN.raw, CHAIN.process].filter((d) => !owns(state, d));
    let built = false;
    for (const d of missing) built = buildAt(engine, d, ['industrial', 'port']) || built;
    if (!built && linkWaiting(state)) return;
    const big = BUILDING_BY_ID[CHAIN.big]!;
    buildAt(engine, player.netWorth >= big.unlockNetWorth && player.cash > big.cost * 2 ? CHAIN.big : CHAIN.small, null);
  }
  function sponsorStep(engine: Engine, margin: number, last: number): void {
    const state = engine.getState();
    const project = state.project;
    if (!project || project.phase !== 'funding' || project.closesDay - state.time.day > last) return;
    const mine = project.contributions[state.playerCompanyId] ?? 0;
    const top = projectStandings(state, project).filter((row) => row.companyId !== state.playerCompanyId)[0]?.amount ?? 0;
    const need = Math.max(PROJECT_TIMING.minContribution, Math.ceil(top * (1 + margin) - mine));
    if (top * (1 + margin) > mine && getPlayer(state).cash > need) engine.dispatch({ type: 'CONTRIBUTE_PROJECT', amount: need });
  }

  const bases = new Map<string, string>();
  function play(id: string, plan: Plan) {
    if (!bases.has(id)) bases.set(id, JSON.stringify(createScenarioGame(id, { companyName: 'Senaryo AŞ' })));
    const state = JSON.parse(bases.get(id)!) as GameState;
    const engine = new GameEngine(state);
    engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' });
    const start = state.time.day;
    while (state.scenario!.finishedDay === undefined) {
      const day = state.time.day - start;
      if (plan.every > 0 && day % plan.every === 0) {
        if (plan.chain) chainStep(engine);
        if (plan.general && !(plan.chainFirst && linkWaiting(state))) playerStrategy(engine);
      }
      if (plan.sponsor) sponsorStep(engine, plan.sponsor.margin, plan.sponsor.last);
      if (plan.defend > 0 && day % plan.defend === 0) defendAgainstRaids(engine);
      engine.runDay();
    }
    const run = state.scenario!;
    return {
      won: run.outcome === 'won',
      stars: run.stars ?? 0,
      score: run.score ?? 0,
      reason: run.lostReason,
      sponsored: run.sponsored ?? 0,
      day: run.finishedDay! - start,
    };
  }
  const show = (result: ReturnType<typeof play>) =>
    `${result.won ? `kazandı ${result.stars}★` : `kaybetti (${result.reason})`} · ${result.day}. gün · skor ${result.score}`;

  const consortium = SCENARIO_BY_ID.consortium!;
  const k = {
    passive: play('consortium', { every: 0, defend: 0 }),
    slow: play('consortium', { every: 15, defend: 3, general: true }),
    informed: play('consortium', { every: 5, defend: 3, general: true }),
    sharp: play('consortium', { every: 3, defend: 1, general: true }),
  };
  for (const [name, result] of Object.entries(k)) console.log(`  Konsorsiyuma karşı · ${name.padEnd(8)} ${show(result)}`);
  expect('Konsorsiyuma karşı: el sürmeyen devralınıyor', k.passive.reason === 'takeover', show(k.passive));
  expect('Konsorsiyuma karşı: on beş günde bir kuran zafere yetişemiyor', !k.slow.won, show(k.slow));
  expect('Konsorsiyuma karşı: beş günde bir kurup savunan zaferde', k.informed.won, show(k.informed));
  expect(
    'Konsorsiyuma karşı: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    k.sharp.won && k.sharp.day > consortium.stars.three,
    `${show(k.sharp)} > ${consortium.stars.three}`,
  );

  const chain = SCENARIO_BY_ID.chain!;
  const z = {
    passive: play('chain', { every: 0, defend: 0 }),
    growth: play('chain', { every: 3, defend: 1, general: true }),
    chain: play('chain', { every: 5, defend: 3, general: true, chain: true }),
    first: play('chain', { every: 3, defend: 1, general: true, chain: true, chainFirst: true }),
    slow: play('chain', { every: 15, defend: 5, general: true, chain: true }),
  };
  for (const [name, result] of Object.entries(z)) console.log(`  Zincir ustası · ${name.padEnd(8)} ${show(result)}`);
  expect('Zincir ustası: el sürmeyen kaybediyor', !z.passive.won, show(z.passive));
  expect('Zincir ustası: zinciri kurmayan büyüme yetmiyor (üç günde bir kursa da)', !z.growth.won, show(z.growth));
  expect('Zincir ustası: beş günde bir oynayıp zinciri kuran hedefte', z.chain.won, show(z.chain));
  expect(
    'Zincir ustası: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    z.first.won && z.first.day > chain.stars.three,
    `${show(z.first)} > ${chain.stars.three}`,
  );
  expect(
    'Zincir ustası: on beş günde bir oynayan da zinciri kurarsa yetişiyor; yıldızı hız veriyor',
    z.slow.won && z.slow.stars === 1,
    show(z.slow),
  );

  const sponsor = SCENARIO_BY_ID.sponsor!;
  const p = {
    passive: play('sponsor', { every: 0, defend: 0 }),
    slow: play('sponsor', { every: 15, defend: 3, general: true, sponsor: { margin: 0.1, last: 7 } }),
    informed: play('sponsor', { every: 5, defend: 3, general: true, sponsor: { margin: 0.1, last: 7 } }),
    sharp: play('sponsor', { every: 3, defend: 1, general: true, sponsor: { margin: 0.05, last: 3 } }),
  };
  for (const [name, result] of Object.entries(p)) console.log(`  Şehrin sponsoru · ${name.padEnd(8)} ${show(result)} · sponsor ${result.sponsored}`);
  expect('Şehrin sponsoru: el sürmeyen ilk ikiden düşüyor', p.passive.reason === 'rank', show(p.passive));
  expect('Şehrin sponsoru: on beş günde bir kuran yetişemiyor', !p.slow.won, show(p.slow));
  expect('Şehrin sponsoru: beş günde bir kurup son haftada lideri geçen iki ihaleyi de alıyor', p.informed.won, show(p.informed));
  expect(
    'Şehrin sponsoru: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    p.sharp.won && p.sharp.score < sponsor.stars.three,
    `${show(p.sharp)} < ${sponsor.stars.three}`,
  );
});

section('Senaryolar III: fetih ve holding', () => {
  /*
   * Tur 39c. Büyük şehir fethi: tekel. Avcı vekil her seferinde en ucuz
   * alınabilir rakibe devralma emri veriyor; sızan vekil ayrıca her
   * rakipte payı savunma eşiğinin altında (%29) tutuyor, sonra vuruyor.
   * Holding: iki şehir: vekil şehirler arasında gidip geliyor, uzaktaki
   * şehrin talimatı "şehirde tut + savun".
   */
  const bases = new Map<string, string>();
  const base = (id: string) => {
    if (!bases.has(id)) bases.set(id, JSON.stringify(createScenarioGame(id, { companyName: 'Senaryo AŞ' })));
    return JSON.parse(bases.get(id)!) as GameState;
  };
  const result = (state: GameState) => {
    const run = state.scenario!;
    return { won: run.outcome === 'won', stars: run.stars ?? 0, score: run.score ?? 0, reason: run.lostReason, day: run.finishedDay! - run.startDay };
  };
  type Result = ReturnType<typeof result>;
  const show = (r: Result) => `${r.won ? `kazandı ${r.stars}★` : `kaybetti (${r.reason})`} · ${r.day}. gün · skor ${r.score}`;

  /** En ucuz alınabilir rakibe emir (bedeli kasanın %90'ından azsa). */
  function hunt(engine: Engine): void {
    const state = engine.getState();
    const player = getPlayer(state);
    if (player.orders && player.orders.length > 0) return;
    let best: { id: string; cost: number } | null = null;
    for (const company of Object.values(state.companies)) {
      if (company.isPlayer || (company.lockedUntilDay !== undefined && state.time.day < company.lockedUntilDay)) continue;
      const estimate = orderEstimate(state, player.id, company.id);
      if (estimate.need > 0 && !estimate.floatShort && (!best || estimate.cost < best.cost)) best = { id: company.id, cost: estimate.cost };
    }
    if (best && best.cost < player.cash * 0.9) engine.dispatch({ type: 'PLACE_TAKEOVER_ORDER', companyId: best.id });
  }
  /** Her rakipte payı %29'a kadar, günlük tavanla, 2 M ₺ yedek bırakarak. */
  function creep(engine: Engine): void {
    const state = engine.getState();
    const player = getPlayer(state);
    const rivals = Object.values(state.companies).filter((c) => !c.isPlayer).sort((a, b) => a.netWorth - b.netWorth);
    for (const company of rivals) {
      if (player.orders?.some((order) => order.issuerId === company.id)) continue;
      const want = Math.floor(sharesOutstanding(state, company.id) * 0.29) - sharesHeld(state, player.id, company.id);
      const price = sharePrice(state, company.id);
      const count = Math.min(want, capRemaining(state, player.id, company.id), freeFloat(state, company.id), Math.floor((player.cash - 2_000_000) / Math.max(1, price)));
      if (count > 0) engine.dispatch({ type: 'BUY_SHARES', companyId: company.id, count });
    }
  }
  function conquest(plan: { every: number; defend: number; hunt?: boolean; creep?: boolean }): Result {
    const state = base('conquest');
    const engine = new GameEngine(state);
    engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' });
    const start = state.time.day;
    while (state.scenario!.finishedDay === undefined) {
      const day = state.time.day - start;
      if (plan.every > 0 && day % plan.every === 0) {
        if (plan.hunt) hunt(engine);
        playerStrategy(engine);
      }
      if (plan.creep) creep(engine);
      if (plan.defend > 0 && day % plan.defend === 0) defendAgainstRaids(engine);
      engine.runDay();
    }
    return result(state);
  }
  const conquestDef = SCENARIO_BY_ID.conquest!;
  const f = {
    passive: conquest({ every: 0, defend: 0 }),
    grow: conquest({ every: 5, defend: 3 }),
    hunter: conquest({ every: 5, defend: 3, hunt: true }),
    creep: conquest({ every: 5, defend: 3, hunt: true, creep: true }),
    sharp: conquest({ every: 3, defend: 1, hunt: true, creep: true }),
  };
  for (const [name, r] of Object.entries(f)) console.log(`  Büyük şehir fethi · ${name.padEnd(8)} ${show(r)}`);
  expect('Büyük şehir fethi: el sürmeyen ve yalnız büyüyen tekele ulaşamıyor', !f.passive.won && !f.grow.won, `${show(f.passive)} | ${show(f.grow)}`);
  expect('Büyük şehir fethi: devralma emriyle avlanan tekelde', f.hunter.won, show(f.hunter));
  expect('Büyük şehir fethi: payı savunma eşiğinin altında toplayıp vuran daha erken', f.creep.won && f.creep.day < f.hunter.day, `${show(f.creep)} < ${f.hunter.day}`);
  expect(
    'Büyük şehir fethi: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    f.sharp.won && f.sharp.day > conquestDef.stars.three,
    `${show(f.sharp)} > ${conquestDef.stars.three}`,
  );

  function holding(plan: { every: number; defend: number; mode: 'none' | 'second' | 'alternate' | 'focus'; period?: number; keep?: boolean }): Result {
    const engine = new GameEngine(base('holding'));
    engine.dispatch({ type: 'DISMISS_SCENARIO', screen: 'brief' });
    const directive = () => {
      if (plan.keep) engine.dispatch({ type: 'SET_CITY_DIRECTIVE', index: 0, payout: 'keep', defend: true });
    };
    directive();
    while (engine.getState().scenario!.finishedDay === undefined) {
      const state = engine.getState();
      const day = state.time.day - state.scenario!.startDay;
      const cities = holdingCities(state);
      const swap =
        (plan.mode === 'alternate' && day > 0 && day % plan.period! === 0) ||
        (plan.mode === 'focus' && cities[0]!.won && !cities[1]!.won);
      if (swap) {
        engine.dispatch({ type: 'SWITCH_CITY', index: 0 });
        directive();
      }
      if (plan.every > 0 && day % plan.every === 0) playerStrategy(engine);
      if (plan.defend > 0 && day % plan.defend === 0) defendAgainstRaids(engine);
      engine.runDay();
    }
    return result(engine.getState());
  }
  const holdingDef = SCENARIO_BY_ID.holding!;
  const h = {
    passive: holding({ every: 0, defend: 0, mode: 'none' }),
    second: holding({ every: 5, defend: 3, mode: 'second', keep: true }),
    focus: holding({ every: 5, defend: 3, mode: 'focus', keep: true }),
    half: holding({ every: 5, defend: 3, mode: 'alternate', period: 60 }),
    alternate: holding({ every: 5, defend: 3, mode: 'alternate', period: 60, keep: true }),
    sharp: holding({ every: 3, defend: 1, mode: 'alternate', period: 45, keep: true }),
  };
  for (const [name, r] of Object.entries(h)) console.log(`  Holding: iki şehir · ${name.padEnd(9)} ${show(r)}`);
  expect('Holding: el sürmeyen kaybediyor', !h.passive.won, show(h.passive));
  expect('Holding: yalnız yeni şehri oynayan bir şehirde kalıyor', !h.second.won && h.second.score === 1, show(h.second));
  expect('Holding: önce yeni şehri bitirip dönen de yetişemiyor (kurucu şehir ihmal edilince sırası düşüyor)', !h.focus.won, show(h.focus));
  expect('Holding: kârın yarısını kasaya akıtıp savunmasız bırakan gidip gelse de yetişemiyor', !h.half.won, show(h.half));
  expect('Holding: şehirler arasında gidip gelen, talimatı "şehirde tut + savun" olan iki şehirde de zaferde', h.alternate.won, show(h.alternate));
  expect(
    'Holding: üç yıldız vekilin en keskin oyunundan iyisini istiyor',
    h.sharp.won && h.sharp.day > holdingDef.stars.three,
    `${show(h.sharp)} > ${holdingDef.stars.three}`,
  );
});

section('Zorluk değiştiricileri', () => {
  /*
   * Tur 45. Dört ek kural; her biri yazdığını yapıyor (birim testi) ve oyunu
   * zorlaştırıyor (burası). Dengeli, beş tohum; bilgili vekil 5 günde bir ve
   * savunmasız, yavaş vekil 15 günde bir ve savunmasız. Zafersiz ya da düşen
   * bilgili koşu 1000. gün, düşmeyen yavaş koşu 1000. gün sayılıyor.
   *
   * Ölçüm (8 tohum, DURUM Tur 45): bilgili vekilin ortalama zaferi 680 →
   * Fırtınalı yıllar +%5 · Aç gözlü rakipler −%1 · Sıkı banka +%19 · Kıt arsa
   * +%7 · dördü +%19; yavaş vekilin düşüşü 842 → %5 · %13 · %20 · %2 · %26
   * erken. İlk sürümde Fırtınalı yıllar oyunu KOLAYLAŞTIRIYORDU (durgunlukta
   * ucuz inşaat), Sıkı banka kredi çekmeyene dokunmuyordu, Kıt arsa gürültüde
   * kalıyordu; üçü de ölçümden sonra değişti.
   */
  const SEEDS = [1, 7, 42, 202, 3];
  const FOUR: ModifierId[] = ['storms', 'hungry_rivals', 'tight_credit', 'scarce_land'];
  type Run = { day: number; won: boolean; fell: boolean; crises: number };
  function play(seed: number, modifiers: ModifierId[], every: number): Run {
    const engine = new GameEngine(createNewGame({ seed, difficulty: 'normal', companyName: 'Kural AŞ', modifiers }));
    const state = engine.getState();
    let crises = 0;
    for (let day = 1; day <= 1000; day++) {
      if (day % every === 0) playerStrategy(engine);
      const calm = state.crisis === undefined;
      engine.runDay();
      if (calm && state.crisis) crises++;
      // Bilgili ölçüde düşüş kazanamamak (1000. gün); yavaşta düştüğü gün.
      if (state.gameOver) return { day: every === 5 ? 1000 : day, won: false, fell: true, crises };
      if (every === 5 && state.victory) return { day: state.victory.day, won: true, fell: false, crises };
    }
    return { day: 1000, won: false, fell: false, crises };
  }
  const runs = (modifiers: ModifierId[], every: number) => SEEDS.map((seed) => play(seed, modifiers, every));
  const mean = (list: Run[]) => list.reduce((sum, run) => sum + run.day, 0) / list.length;
  const line = (list: Run[]) => list.map((run) => (run.won ? `zafer ${run.day}` : run.fell ? 'düştü' : '—')).join(' · ');

  const base = { informed: runs([], 5), slow: runs([], 15) };
  const storms = runs(['storms'], 15);
  const hungry = runs(['hungry_rivals'], 15);
  const tight = { informed: runs(['tight_credit'], 5), slow: runs(['tight_credit'], 15) };
  const scarce = runs(['scarce_land'], 5);
  const four = { informed: runs(FOUR, 5), slow: runs(FOUR, 15) };
  const slowDay = (list: Run[]) => `${falls(list)} · ortalama ${Math.round(mean(list))} < ${Math.round(mean(base.slow))}`;
  const falls = (list: Run[]) => list.map((run) => (run.fell ? run.day : '—')).join(' · ');
  console.log(`  kuralsız   · bilgili ${line(base.informed)} | yavaş ${falls(base.slow)}`);

  const crisesBase = base.slow.reduce((sum, run) => sum + run.crises, 0) / base.slow.reduce((sum, run) => sum + run.day, 0);
  const crisesStorm = storms.reduce((sum, run) => sum + run.crises, 0) / storms.reduce((sum, run) => sum + run.day, 0);
  expect('Fırtınalı yıllar: krizler en az 1,5 kat sık', crisesStorm >= 1.5 * crisesBase,
    `bin günde ${(crisesBase * 1000).toFixed(1)} → ${(crisesStorm * 1000).toFixed(1)} kriz`);
  expect('Fırtınalı yıllar: savunmasız yavaş oyuncu daha erken düşüyor', mean(storms) < mean(base.slow) - 40, slowDay(storms));
  expect('Aç gözlü rakipler: savunmasız yavaş oyuncu daha erken düşüyor', mean(hungry) < mean(base.slow) - 40, slowDay(hungry));
  expect(
    'Sıkı banka: bilgili oyuncu daha geç kazanıyor ya da kazanamıyor, yavaş oyuncu daha erken düşüyor',
    mean(tight.informed) > mean(base.informed) * 1.05 && mean(tight.slow) < mean(base.slow) - 60,
    `bilgili ${line(tight.informed)} · ${slowDay(tight.slow)}`,
  );
  expect('Kıt arsa: bilgili oyuncu daha geç kazanıyor', mean(scarce) > mean(base.informed) * 1.03,
    `${line(scarce)} · ortalama ${Math.round(mean(scarce))} > ${Math.round(mean(base.informed))}`);
  expect(
    'Dört kural: bilgili oyuncu çoğunlukla yine kazanıyor ama en az %8 geç',
    four.informed.filter((run) => run.won).length >= 3 && mean(four.informed) > mean(base.informed) * 1.08,
    `${line(four.informed)} · ortalama ${Math.round(mean(four.informed))}`,
  );
  expect('Dört kural: savunmasız yavaş oyuncu çok daha erken düşüyor', mean(four.slow) < mean(base.slow) - 150, slowDay(four.slow));
});

section('Tohum Ligi: haftanın kuralı ve günün koşusu', () => {
  /*
   * Tur 53. Lig haftası 2026-W44'ten beri ek kurallardan birini sırayla
   * taşıyor; günün koşusu 90 gün, kuralsız. Bilgili vekil 5, yavaş vekil 15
   * günde bir hamle yapıyor. Kuralın etkisi aynı şehrin kuralsız hâliyle
   * ölçülüyor (Sıkı banka'nın kuruluş kredisi de geri alınarak).
   *
   * Ölçüm (DURUM Tur 53): bilgili vekil kural haftalarında yavaştan %52–68
   * önde; aynı şehirde kural iki vekilin ortalamasını Kıt arsa −%3, Aç gözlü
   * rakipler −%6, Fırtınalı yıllar −%9, Sıkı banka −%13 geriletiyor (Kıt arsa
   * bilgili vekilde +%2: gürültü). Günün koşusunda bilgili 1,5–2,0 M, yavaş
   * 1,15–1,35 M, hiç oynamayan 250 B (6–8 kat).
   */
  const WEEKS = ['2026-W44', '2026-W45', '2026-W46', '2026-W47'];
  const DAYS = ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'];
  type Score = { score: number; lost: boolean };
  function withoutRule(state: GameState): GameState {
    delete state.modifiers;
    const player = state.companies[state.playerCompanyId]!;
    const loan = player.credit?.loans.shift();
    if (loan) {
      player.debt -= loan.balance;
      player.netWorth += loan.balance;
      player.credit!.loanSeq = 0;
    }
    return state;
  }
  function play(id: string, every: number, plain = false): Score {
    const start = createLeagueGame(id, 'Lig AŞ', null);
    const engine = new GameEngine(plain ? withoutRule(start) : start);
    while (engine.getState().league!.finishedDay === undefined) {
      if (every > 0 && engine.getState().time.day % every === 0) playerStrategy(engine);
      engine.runDay();
    }
    const league = engine.getState().league!;
    return { score: league.score ?? 0, lost: league.outcome === 'lost' };
  }
  const m = (value: number) => `${(value / 1e6).toFixed(1)} M`;
  const pct = (a: number, b: number) => `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%`;
  const weeks = WEEKS.map((week) => ({
    week,
    rule: leagueRule(week)!,
    informed: play(week, 5),
    plain: play(week, 5, true),
    slow: play(week, 15),
    slowPlain: play(week, 15, true),
  }));
  for (const w of weeks) {
    console.log(`  ${w.week} ${w.rule.padEnd(13)} bilgili ${m(w.informed.score)} (kuralsız ${m(w.plain.score)}, ${pct(w.informed.score, w.plain.score)}) · yavaş ${m(w.slow.score)} (kuralsız ${m(w.slowPlain.score)}, ${pct(w.slow.score, w.slowPlain.score)})`);
  }
  expect('Dört haftada dört kural, sıra döngüde', weeks.map((w) => w.rule).join() === LEAGUE_RULE_ROTATION.join(), weeks.map((w) => w.rule).join(', '));
  expect(
    'Her kural haftasında bilgili vekil yavaştan en az %30 önde; kimse düşmüyor',
    weeks.every((w) => w.informed.score > w.slow.score * 1.3 && !w.informed.lost && !w.slow.lost),
    weeks.map((w) => `${w.rule} ${pct(w.informed.score, w.slow.score)}`).join(' · '),
  );
  const byRule = Object.fromEntries(weeks.map((w) => [w.rule, w]));
  // Tek şehirde tek vekilin farkı gürültüde kalabiliyor (Kıt arsa bilgili vekilde, Tur 45'teki gibi):
  // iki vekilin ortalaması.
  const effect = (w: (typeof weeks)[number]) => (w.informed.score / w.plain.score + w.slow.score / w.slowPlain.score) / 2;
  expect(
    'Her kural aynı şehirde iki vekilin ortalama skorunu düşürüyor',
    weeks.every((w) => effect(w) < 1),
    weeks.map((w) => `${w.rule} ${Math.round((effect(w) - 1) * 100)}%`).join(' · '),
  );
  expect(
    'Aç gözlü rakipler savunmasız yavaş vekili geriletiyor',
    byRule['hungry_rivals']!.slow.score < byRule['hungry_rivals']!.slowPlain.score,
    pct(byRule['hungry_rivals']!.slow.score, byRule['hungry_rivals']!.slowPlain.score),
  );

  const days = DAYS.map((day) => ({ day, informed: play(day, 5), slow: play(day, 15), idle: play(day, 0) }));
  for (const d of days) console.log(`  ${d.day} bilgili ${m(d.informed.score)} · yavaş ${m(d.slow.score)} · boş ${m(d.idle.score)}`);
  expect(
    `Günün koşusu (${LEAGUE_DAILY_DAYS} gün): her gün bilgili > yavaş > boş; bilgili boşun en az 4 katı`,
    days.every((d) => d.informed.score > d.slow.score && d.slow.score > d.idle.score && d.informed.score >= 4 * d.idle.score && !d.informed.lost),
    days.map((d) => `${pct(d.informed.score, d.slow.score)} / ×${(d.informed.score / d.idle.score).toFixed(1)}`).join(' · '),
  );
  expect(
    'Günün koşusunun şehirleri farklı: beş günün bilgili skoru beş ayrı sayı',
    new Set(days.map((d) => d.informed.score)).size === days.length,
    days.map((d) => m(d.informed.score)).join(' · '),
  );
});

section('Lojistik: nakliye terminali ve taşıma sözleşmeleri', () => {
  /*
   * Tur 56. Terminal rakip mağazalarına taşıyor, ücret rakibin
   * tasarrufundan. Sınanan: nakliyeci vekil her şehirde sözleşme alıyor,
   * iş kolu tuzak değil (temel vekilin gerisine düşmüyor) ama baskın da
   * değil, terminal kendi bedelini çıkarıyor, ve rakibe hizmet etmenin
   * bedeli görünüyor: müşteri rakipler güçleniyor.
   */
  const m = (v: number) => `${(v / 1_000_000).toFixed(1)} M`;
  const play = (seed: number, freight: boolean) => {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Nakliye AŞ' }));
    const state = engine.getState();
    const deals = new Set<string>();
    for (let day = 1; day <= DAYS; day++) {
      if (day % 5 === 0) {
        playerStrategy(engine);
        if (freight) freightStrategy(engine);
        for (const deal of state.freight?.contracts ?? []) deals.add(deal.id);
      }
      engine.runDay();
    }
    const rivals = Object.values(state.companies).filter((c) => !c.isPlayer);
    const terminals = freightTerminals(state);
    return {
      net: getPlayer(state).netWorth,
      rivals: rivals.reduce((sum, c) => sum + c.netWorth, 0),
      earned: state.freight?.earnedTotal ?? 0,
      deals: deals.size,
      terminals: terminals.length,
      trend: terminals.reduce((sum, t) => sum + (t.profitTrend ?? 0), 0) / Math.max(1, terminals.length),
      cost: terminals.reduce((sum, t) => sum + (BUILDING_BY_ID[t.defId]?.cost ?? 0), 0),
    };
  };
  const runs = [1, 7, 42].map((seed) => ({ seed, base: play(seed, false), freight: play(seed, true) }));
  for (const r of runs) {
    console.log(
      `  seed ${r.seed}: temel ${m(r.base.net)} · nakliyeci ${m(r.freight.net)} (${r.freight.terminals} terminal, ${r.freight.deals} sözleşme, ücret ${m(r.freight.earned)}, terminal kâr eğilimi ${Math.round(r.freight.trend)}/gün) · rakipler ${m(r.base.rivals)} → ${m(r.freight.rivals)}`,
    );
  }
  const gain = (r: (typeof runs)[number]) => r.freight.net / r.base.net - 1;
  const average = runs.reduce((sum, r) => sum + gain(r), 0) / runs.length;
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  expect('Nakliyeci vekil her şehirde sözleşme alıp ücret topluyor', runs.every((r) => r.freight.deals >= 2 && r.freight.earned > 0), runs.map((r) => `${r.freight.deals} sözleşme`).join(' · '));
  expect('Tuzak değil: her şehirde temel vekilin en az %98\'i, ortalama en az +%3', runs.every((r) => gain(r) >= -0.02) && average >= 0.03, `${runs.map((r) => pct(gain(r))).join(' · ')} (ortalama ${pct(average)})`);
  expect('Baskın değil: ortalama kazanç +%30\'un altında', average < 0.3, pct(average));
  expect(
    'Terminal kendi bedelini çıkarıyor: kâr eğilimi artıda, toplam ücret terminallerin bedelinin en az iki katı',
    runs.every((r) => r.freight.trend > 0 && r.freight.earned >= 2 * r.freight.cost),
    runs.map((r) => `×${(r.freight.earned / Math.max(1, r.freight.cost)).toFixed(1)}`).join(' · '),
  );
  // Rakibin kazancı aynı gün A/B'de ölçülüyor (`freight.test.ts`); burada
  // 360 günün sonunda rakiplerin değeri oyuncuyla yarışın da sonucu.
  const rivalGain = runs.reduce((sum, r) => sum + r.freight.rivals / r.base.rivals - 1, 0) / runs.length;
  console.log(`  NOT: rakiplerin toplam değeri nakliyeci koşuda ortalama ${pct(rivalGain)} (müşteri ucuzluyor, oyuncu da büyüyor).`);
});

section('Enerji: santraller, şebeke fiyatı ve enerji krizi', () => {
  /*
   * Tur 57. Santral menzilindeki binalara enerji veriyor: sahibinin
   * binalarının faturası kalkıyor, rakiplerinki santralin cirosu. Enerji
   * krizi şebeke fiyatını iki katına çıkarıyor. Sınanan iki şey:
   *   - İş kolu: enerjici vekil santral kuruyor, santraller bedelini
   *     çıkarıyor; sakin bir yılda tuzak değil, baskın da değil.
   *   - Sigorta: aynı şehrin 300. günü kopyalanıyor, kopyalarda 90 günlük
   *     enerji krizi var ya da yok. Kriz santralsiz oyuncuyu vuruyor;
   *     santrali olan daha az, yakıtını sabitleyen en az kaybediyor.
   */
  const m = (v: number) => `${(v / 1_000_000).toFixed(1)} M`;
  const play = (seed: number, energy: boolean) => {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Enerji AŞ' }));
    const state = engine.getState();
    for (let day = 1; day <= DAYS; day++) {
      if (day % 5 === 0) {
        playerStrategy(engine);
        if (energy) energyStrategy(engine);
      }
      engine.runDay();
    }
    const plants = powerPlants(state).filter((plant) => plant.companyId === state.playerCompanyId);
    const sum = (key: 'sold' | 'saved' | 'fuel') => plants.reduce((total, plant) => total + (plant.energyTotals?.[key] ?? 0), 0);
    return {
      net: getPlayer(state).netWorth,
      plants: plants.length,
      solar: plants.filter((plant) => BUILDING_BY_ID[plant.defId]?.solar).length,
      sold: sum('sold'),
      saved: sum('saved'),
      fuel: sum('fuel'),
      cost: plants.reduce((total, plant) => total + (BUILDING_BY_ID[plant.defId]?.cost ?? 0), 0),
    };
  };
  const runs = [1, 7, 42].map((seed) => ({ seed, base: play(seed, false), energy: play(seed, true) }));
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const gain = (r: (typeof runs)[number]) => r.energy.net / r.base.net - 1;
  const returned = (r: (typeof runs)[number]) => r.energy.sold + r.energy.saved - r.energy.fuel;
  for (const r of runs) {
    console.log(
      `  seed ${r.seed}: temel ${m(r.base.net)} · enerjici ${m(r.energy.net)} (${pct(gain(r))}; ${r.energy.plants} santral, ${r.energy.solar} güneş) · satış ${m(r.energy.sold)}, kazanç ${m(r.energy.saved)}, yakıt ${m(r.energy.fuel)}, bedel ${m(r.energy.cost)}`,
    );
  }
  const average = runs.reduce((sum, r) => sum + gain(r), 0) / runs.length;
  expect(
    'Enerjici vekil her şehirde santral kuruyor; santraller bedelinin en az iki katını getiriyor (satış + kazanç − yakıt)',
    runs.every((r) => r.energy.plants >= 2 && returned(r) >= 2 * r.energy.cost),
    runs.map((r) => `${r.energy.plants} santral, ×${(returned(r) / Math.max(1, r.energy.cost)).toFixed(1)}`).join(' · '),
  );
  expect('Sakin yılda tuzak değil: ortalama temel vekilin en az %95\'i', average >= -0.05, `${runs.map((r) => pct(gain(r))).join(' · ')} (ortalama ${pct(average)})`);
  expect('Baskın değil: ortalama kazanç +%25\'in altında', average < 0.25, pct(average));

  // Sigorta: 300. günün kopyalarında 90 günlük enerji krizi. Büyürken kriz
  // takvimi kapalı (kollar aynı yerden başlasın), kopyalarda takvim yok.
  const shock = CRISES.find((def) => (def.effects.energyPrice ?? 1) > 1)!;
  const AT = 300;
  const SPAN = 90;
  const grow = (seed: number, energy: boolean): string => {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Enerji AŞ' }));
    const state = engine.getState();
    state.flags.crises = false;
    for (let day = 1; day <= AT; day++) {
      if (day % 5 === 0) {
        playerStrategy(engine);
        if (energy) energyStrategy(engine);
      }
      engine.runDay();
    }
    state.flags.crises = true;
    return JSON.stringify(state);
  };
  const arm = (snapshot: string, crisis: boolean, lock: boolean): number => {
    const engine = new GameEngine(JSON.parse(snapshot) as GameState);
    const state = engine.getState();
    delete state.crisis;
    state.nextCrisisDay = Number.MAX_SAFE_INTEGER;
    if (lock) engine.dispatch({ type: 'LOCK_FUEL' });
    if (crisis) state.crisis = { defId: shock.id, phase: 'active', activeDay: state.time.day + 1, endDay: state.time.day + SPAN };
    let profit = 0;
    for (let i = 0; i < SPAN; i++) {
      engine.runDay();
      profit += getPlayer(state).today.profit;
    }
    return profit;
  };
  const hedges = [1, 7, 42].map((seed) => {
    const base = grow(seed, false);
    const energy = grow(seed, true);
    const calm = arm(energy, false, false);
    return {
      seed,
      plants: powerPlants(JSON.parse(energy) as GameState).filter((plant) => plant.companyId === 'player').length,
      baseCalm: arm(base, false, false),
      baseShock: arm(base, true, false),
      calm,
      shock: arm(energy, true, false),
      locked: arm(energy, true, true),
    };
  });
  const k = (v: number) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) / 1_000_000).toFixed(2)} M`;
  for (const h of hedges) {
    console.log(
      `  seed ${h.seed}: 90 günlük krizin kâra etkisi · santralsiz ${k(h.baseShock - h.baseCalm)} (${pct(h.baseShock / h.baseCalm - 1)}) · ${h.plants} santralle ${k(h.shock - h.calm)} · yakıtı sabit ${k(h.locked - h.calm)}`,
    );
  }
  expect('Enerji krizi santralsiz oyuncunun kârını vuruyor: 90 günde en az %5', hedges.every((h) => h.baseShock <= h.baseCalm * 0.95), hedges.map((h) => pct(h.baseShock / h.baseCalm - 1)).join(' · '));
  expect('Santrali olan krizi daha az kayıpla atlatıyor (her şehirde)', hedges.every((h) => h.calm - h.shock < h.baseCalm - h.baseShock), hedges.map((h) => `${k(h.shock - h.calm)} < ${k(h.baseShock - h.baseCalm)}`).join(' · '));
  expect('Yakıtı sabitleyen en az kaybediyor (her şehirde)', hedges.every((h) => h.locked > h.shock), hedges.map((h) => `${k(h.locked - h.calm)} > ${k(h.shock - h.calm)}`).join(' · '));
});

section('Gayrimenkul: proje, kira ve kentsel dönüşüm', () => {
  /*
   * Tur 58. Geliştiricinin projeleri (Konut Sitesi, Ofis Kampüsü) inşaatı
   * süren, kiracısı zamanla gelen büyük kiralıklar; kira hedef doluluğu
   * kaydırıyor; kentsel dönüşüm ihalesinden alınan parselde proje imar
   * artışıyla büyük. Geliştirici vekil (`developerStrategy`) temel vekilin
   * üstüne proje kuruyor, kirayı ayarlıyor, dönüşüm başvurusu yapıp kendi
   * ihalesinde artırıyor.
   *
   * Gayrimenkul uzun vadeli: proje 75–100 gün kira getirmiyor, bedeli
   * mağazalardan çekilen nakit. O yüzden iki gün ölçülüyor: 360. günde
   * bedel ödeniyor (en çok %10 geride), 540. günde tuzak değil ve baskın
   * değil.
   */
  const LONG = 540;
  const m = (v: number) => `${(v / 1_000_000).toFixed(1)} M`;
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const play = (seed: number, developer: boolean) => {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Gayrimenkul AŞ' }));
    const state = engine.getState();
    const earned = new Map<string, number>();
    let year = 0;
    for (let day = 1; day <= LONG; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      if (developer) developerStrategy(engine);
      engine.runDay();
      for (const b of Object.values(state.buildings)) {
        if (b.companyId === state.playerCompanyId && b.development?.occupancy !== undefined) earned.set(b.id, (earned.get(b.id) ?? 0) + b.last.profit);
      }
      if (day === DAYS) year = getPlayer(state).netWorth;
    }
    const projects = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && b.development);
    const open = projects.filter((b) => b.development!.occupancy !== undefined);
    const rented = Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && b.rent !== undefined);
    return {
      year,
      net: getPlayer(state).netWorth,
      projects: projects.length,
      renewals: projects.filter((b) => b.development!.renewal).length,
      open: open.length,
      earned: open.reduce((sum, b) => sum + (earned.get(b.id) ?? 0), 0),
      cost: open.reduce((sum, b) => sum + BUILDING_BY_ID[b.defId]!.cost, 0),
      occupancy: open.length ? open.reduce((sum, b) => sum + b.development!.occupancy!, 0) / open.length : 0,
      // Kira ayarının değeri: bugünkü hedefte, ayarlanan kirayla ve piyasa kirasıyla.
      rentGain: rented.reduce((sum, b) => sum + rentalOutlook(state, b.id)!.rentAtTarget - rentalOutlook(state, b.id, 1)!.rentAtTarget, 0),
      rentBase: rented.reduce((sum, b) => sum + rentalOutlook(state, b.id, 1)!.rentAtTarget, 0),
      rents: rented.map((b) => b.rent!),
    };
  };
  const runs = [1, 7, 42].map((seed) => ({ seed, base: play(seed, false), dev: play(seed, true) }));
  const at = (r: (typeof runs)[number], year: boolean) => (year ? r.dev.year / r.base.year : r.dev.net / r.base.net) - 1;
  for (const r of runs) {
    console.log(
      `  seed ${r.seed}: ${DAYS}. gün ${m(r.base.year)} → ${m(r.dev.year)} (${pct(at(r, true))}) · ${LONG}. gün ${m(r.base.net)} → ${m(r.dev.net)} (${pct(at(r, false))}) · ${r.dev.projects} proje (${r.dev.renewals} dönüşüm, ${r.dev.open} açık, doluluk %${Math.round(r.dev.occupancy * 100)}) · açılandan beri kâr ${m(r.dev.earned)} / bedel ${m(r.dev.cost)} · kira ${r.dev.rents.length} binada (${[...new Set(r.dev.rents)].sort().join(', ')}), hedefte günde ${pct(r.dev.rentGain / Math.max(1, r.dev.rentBase))}`,
    );
  }
  const mean = (year: boolean) => runs.reduce((sum, r) => sum + at(r, year), 0) / runs.length;
  expect(
    'Geliştirici vekil her şehirde proje kuruyor; açılan projeler açıldıklarından beri bedellerini çıkarıyor',
    runs.every((r) => r.dev.open >= 2 && r.dev.earned >= r.dev.cost),
    runs.map((r) => `${r.dev.open} açık, ×${(r.dev.earned / Math.max(1, r.dev.cost)).toFixed(1)}`).join(' · '),
  );
  expect(`İlk yıl bedel ödeniyor: ${DAYS}. günde ortalama temelin en az %90'ı`, mean(true) >= -0.1, `${runs.map((r) => pct(at(r, true))).join(' · ')} (ortalama ${pct(mean(true))})`);
  expect(`Uzun vadede tuzak değil: ${LONG}. günde ortalama temelin en az %95'i`, mean(false) >= -0.05, `${runs.map((r) => pct(at(r, false))).join(' · ')} (ortalama ${pct(mean(false))})`);
  expect(`Baskın değil: ${LONG}. günde ortalama kazanç +%25'in altında`, mean(false) < 0.25, pct(mean(false)));
  expect(
    'Kira ayarı kazandırıyor: ayarlanan kiralarla hedefteki kira geliri piyasa kirasındakinden az değil',
    runs.some((r) => r.dev.rents.length > 0) && runs.every((r) => r.dev.rentGain >= 0),
    runs.map((r) => `${pct(r.dev.rentGain / Math.max(1, r.dev.rentBase))} (${r.dev.rents.length} bina)`).join(' · '),
  );
  const estate = BUILDING_BY_ID.housing_estate!;
  const units = projectUnits(estate, true);
  expect(
    'Kentsel dönüşüm işliyor: vekil en az bir şehirde dönüşüm ihalesini kazanıp proje kuruyor; projesi imar artışıyla daha çok kiralık birim',
    runs.some((r) => r.dev.renewals > 0) && units.units > estate.capacity,
    `${runs.map((r) => `${r.dev.renewals} dönüşüm`).join(' · ')}; Konut Sitesi ${estate.capacity} → ${units.units} kiralık + ${units.rightHolders} hak sahibi`,
  );
});

section('Rakipler 2.0: husumet, ittifak ve tepkiler', () => {
  /*
   * Tur 59. Rakipler oyuncunun hamlelerini hatırlıyor: hisselerini
   * toplayan, ondan ucuz satan, ihalede geçen oyuncuya husumet; mağazasını
   * taşıyana, mecliste yanında durana dostluk. Husumetli rakip fiyat
   * savaşını sana açıyor (rövanş: senin en ucuz rafının altına iniyor),
   * mecliste çıkarına karşı bağış yapıyor, yeni mağazasını senin rafına
   * açıyor, ihalede inadına artırıyor.
   *
   * Beş kol, aynı şehirler, aynı temel vekil:
   *   - temel: rakiplere hiçbir şey yapmıyor;
   *   - saldırgan: rakibin rafı olan yerde ×0,90 fiyat (fiyat kırma eşiği),
   *     otuz günde bir en küçük rakipten %2 hisse;
   *   - kör: saldırganın aynısı, rakiplerin hafızası kapalı (tepkinin
   *     bedeli bu ikisinin farkı);
   *   - tövbekâr: 270. güne kadar saldırgan, sonra temel (kim ne kadar
   *     sürede unutuyor: mizaç);
   *   - uzlaşan: tövbekâr + 270. günden sonra husumetli rakiple uzlaşma.
   */
  const LONG = 540;
  const STOP = 270;
  const m = (v: number) => `${(v / 1_000_000).toFixed(1)} M`;
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  type Arm = 'base' | 'hostile' | 'blind' | 'reformed' | 'reconciled';
  const play = (seed: number, arm: Arm) => {
    const engine = new GameEngine(createNewGame({ seed, companyName: 'Hafıza AŞ' }));
    const state = engine.getState();
    if (arm === 'blind') state.flags.rivalRelations = false;
    let hostileDays = 0;
    let lateHostileDays = 0;
    let revenges = 0;
    let amends = 0;
    let firstHostile: number | null = null;
    const reform = arm === 'reformed' || arm === 'reconciled';
    // Tövbekâr: duruş gününde husumetli olan rakiplerin unutma süresi (mizaca göre).
    const forgiving = new Map<string, { temperament: string; ended: number | null }>();
    for (let day = 1; day <= LONG; day++) {
      if (day % 5 === 0) playerStrategy(engine);
      const before = new Map(Object.values(state.companies).map((c) => [c.id, c.relation?.amendsDay]));
      if (arm !== 'base' && (!reform || day <= STOP)) rivalryStrategy(engine, { undercut: 0.9, raidEvery: 30, raidShare: 0.02 });
      if (arm === 'reconciled' && day > STOP) rivalryStrategy(engine, { amends: true });
      if (reform && day === STOP + 1) {
        // Tövbe: fiyatlar piyasaya döner.
        for (const b of Object.values(state.buildings)) {
          if (b.companyId === state.playerCompanyId && b.priceMultiplier !== 1) engine.dispatch({ type: 'SET_PRICE_MULTIPLIER', buildingId: b.id, multiplier: 1 });
        }
        for (const c of Object.values(state.companies)) {
          if (stanceOf(state, c.id) === 'hostile') forgiving.set(c.id, { temperament: temperamentOf(state, c.id)!.id, ended: null });
        }
      }
      engine.runDay();
      for (const c of Object.values(state.companies)) {
        if (c.relation?.amendsDay !== undefined && c.relation.amendsDay !== before.get(c.id)) amends++;
        const hostile = stanceOf(state, c.id) === 'hostile';
        if (hostile) {
          hostileDays++;
          if (day > STOP) lateHostileDays++;
          firstHostile ??= day;
        }
        const f = forgiving.get(c.id);
        if (f && f.ended === null && !hostile) f.ended = day - STOP;
      }
      if (state.campaign?.revenge && state.campaign.startDay === state.time.day) revenges++;
    }
    return { net: getPlayer(state).netWorth, hostileDays, lateHostileDays, revenges, amends, firstHostile, forgiving };
  };
  const runs = [1, 7, 42].map((seed) => ({
    seed,
    base: play(seed, 'base'),
    hostile: play(seed, 'hostile'),
    blind: play(seed, 'blind'),
    reformed: play(seed, 'reformed'),
    reconciled: play(seed, 'reconciled'),
  }));
  for (const r of runs) {
    const forgive = [...r.reformed.forgiving.values()].map((f) => `${f.temperament} ${f.ended ?? `>${LONG - STOP}`}`).join(', ');
    console.log(
      `  seed ${r.seed}: ${LONG}. gün temel ${m(r.base.net)} · kör ${m(r.blind.net)} · saldırgan ${m(r.hostile.net)} (hafızanın bedeli ${pct(r.hostile.net / r.blind.net - 1)}) · ilk husumet ${r.hostile.firstHostile ?? '-'}. gün, ${r.hostile.revenges} rövanş · tövbekâr ${m(r.reformed.net)}, ${STOP}. günden sonra ${r.reformed.lateHostileDays} husumet günü (unutma: ${forgive || '-'}) · uzlaşan ${m(r.reconciled.net)} (${pct(r.reconciled.net / r.reformed.net - 1)}), ${r.reconciled.lateHostileDays} husumet günü, ${r.reconciled.amends} uzlaşma`,
    );
  }
  expect(
    'Husumet doğuyor: saldırgan vekil her şehirde en az bir rakibi husumete düşürüyor',
    runs.every((r) => r.hostile.firstHostile !== null),
    runs.map((r) => `${r.hostile.firstHostile ?? '-'}. gün`).join(' · '),
  );
  expect(
    'Tepki gerçek: husumetli rakip her şehirde rövanş fiyat savaşı açıyor',
    runs.every((r) => r.hostile.revenges > 0),
    runs.map((r) => `${r.hostile.revenges} rövanş`).join(' · '),
  );
  const cost = runs.reduce((sum, r) => sum + (r.hostile.net / r.blind.net - 1), 0) / runs.length;
  expect(
    `Hafızanın bedeli var ama ölümcül değil: aynı hamlelerle ${LONG}. günde ortalama %2–20 geride`,
    cost <= -0.02 && cost >= -0.2,
    `${runs.map((r) => pct(r.hostile.net / r.blind.net - 1)).join(' · ')} (ortalama ${pct(cost)})`,
  );
  const gain = runs.reduce((sum, r) => sum + (r.reconciled.net / r.reformed.net - 1), 0) / runs.length;
  expect(
    'Uzlaşma işe yarıyor: saldırmayı bırakıp uzlaşan, yalnız bırakandan daha az husumet günü görüyor ve ortalamada geride değil',
    runs.every((r) => r.reconciled.amends > 0 && r.reconciled.lateHostileDays < r.reformed.lateHostileDays) && gain >= 0,
    `${runs.map((r) => `${r.reformed.lateHostileDays} → ${r.reconciled.lateHostileDays} gün (${r.reconciled.amends} uzlaşma)`).join(' · ')}; değer ${pct(gain)}`,
  );
  // Mizaç: tövbeden sonra unutma süresi; sonuna kadar unutmayan sınır (270 gün) sayılıyor.
  const forget = (kind: string) => {
    const all = runs.flatMap((r) => [...r.reformed.forgiving.values()].filter((f) => f.temperament === kind));
    return all.length ? all.reduce((sum, f) => sum + (f.ended ?? LONG - STOP), 0) / all.length : null;
  };
  const kinds = (Object.keys(TEMPERAMENTS) as (keyof typeof TEMPERAMENTS)[]).filter((k) => forget(k) !== null);
  // Kini yavaş sönen geç unutuyor: sönüme göre sıralı mizaçların unutma süreleri de sıralı.
  const ordered = [...kinds].sort((a, b) => TEMPERAMENTS[a].fadeHostile - TEMPERAMENTS[b].fadeHostile);
  const times = ordered.map((k) => forget(k)!);
  expect(
    'Mizaç fark yaratıyor: kini yavaş sönen rakip tövbeden sonra geç unutuyor (en az iki mizaç)',
    kinds.length >= 2 && times.every((t, i) => i === 0 || t <= times[i - 1]!),
    ordered.map((k) => `${TEMPERAMENTS[k].name} (günde ${TEMPERAMENTS[k].fadeHostile}) ${Math.round(forget(k)!)} gün`).join(' · '),
  );
});

if (timings.length === 0) {
  console.log(`\nSüzgeçle eşleşen bölüm yok: ${ONLY.join(', ')}`);
  process.exit(1);
}
console.log('\nBölüm süreleri:');
for (const [name, ms] of timings) console.log(`  ${(ms / 1000).toFixed(1).padStart(6)} sn  ${name}`);
console.log(`\n=== ${failures === 0 ? 'TÜMÜ GEÇTİ' : `${failures} KONTROL KALDI`} ===`);
process.exit(failures === 0 ? 0 : 1);
