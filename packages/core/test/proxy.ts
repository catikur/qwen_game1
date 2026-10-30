/**
 * Oyuncu vekili — oyunun oyuncuya ÖNERDİĞİ oynanış, tek kopya.
 *
 * Önce zincir kartının hamlesi (kart "henüz erken" ya da "ertelendi"
 * demiyorsa), sonra fırsat lensinin gösterdiği yere mağaza. Vekilin
 * akıllanması bilinçli: harness "bilgili bir oyuncu ne yaşar" sorusunu
 * ölçmeli, oyunun tavsiyesini görmezden gelen birini değil.
 *
 * Bu dosyadan önce aynı vekil dört yerde ayrı ayrı yazılıydı (denge,
 * benchmark, zincir ölçeği deneyi) ve her turda biri geride kalıyordu:
 * Tur 14'te devralma repertuvarı balance'a girdi, benchmark'a girmedi ve
 * iki ölçüm aynı soruya farklı cevap verdi. Artık vekil bir tane; deney
 * yalnızca seçeneklerle (tavan, günlük) ayrışıyor.
 */
import { BUILDINGS, BUILDING_BY_ID, CRISIS_BY_ID, ENERGY, GOOD_BY_ID, NPC_PROFILES, REAL_ESTATE } from '@capital/content';
import {
  GameEngine,
  buildOptions,
  capRemaining,
  chainCards,
  districtOpportunity,
  estimateInvestment,
  fleetUsed,
  freeFloat,
  freightTerminals,
  fuelLock,
  hasFuelPlant,
  indirectEstimate,
  isProject,
  minimumBid,
  plantCapacity,
  renewalBlocker,
  renewalFee,
  rentOf,
  rentalOutlook,
  underConstruction,
  powerPlants,
  getPlayer,
  isDistrictOpen,
  orderEstimate,
  sharePrice,
  sharesHeld,
  tilePrice,
  sharesOutstanding,
  amendsBlocker,
  amendsCost,
  hostileRivals,
  lineMargins,
  priceBoard,
  tradeLines,
} from '../src/index';
import type { ChainMove } from '../src/index';
import type { GameState } from '../src/types';

/*
 * OYUNDA OLAN RAKİPLER, KATALOGDAKİLER DEĞİL.
 *
 * Katalogda sekiz profil var, varsayılan haritada dört şirket kuruluyor;
 * kalan dördü için `state.companies[id]` undefined. Doğru kaynak state:
 * kimin sahaya çıktığını dünya kurulumu belirliyor.
 */
export function activeProfiles(state: GameState) {
  return NPC_PROFILES.filter((profile) => state.companies[profile.id]);
}

export interface ChainFollowOptions {
  /** Oyuncunun en fazla kaç üretim ünitesi olsun (deney tavanı). */
  maxUnits?: number;
  /** Kurulan her hamle için çağrılır (satın alma günlüğü). */
  onBuilt?: (move: ChainMove, tilePrice: number) => void;
}

/** Şirketin üretim ünitesi sayısı (ham madde + işleme). */
export function ownUnits(state: GameState, companyId: string): number {
  let count = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role === 'extract' || role === 'process') count++;
  }
  return count;
}

/** Zincir kartının önerdiği hamleyi uygular; "erken" ve "ertelendi" olanı atlar. */
export function followChainAdvice(engine: GameEngine, options: ChainFollowOptions = {}): boolean {
  const state = engine.getState();
  const player = getPlayer(state);
  if (options.maxUnits !== undefined && ownUnits(state, player.id) >= options.maxUnits) return false;

  for (const card of chainCards(state, player.id)) {
    const move = card.move;
    if (!move || move.premature || move.deferred) continue;
    const price = tilePrice(state, move.tileId, player.id);
    if (move.cost + price > player.cash * 0.6) continue;

    const acquired = move.needsBuyout
      ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: move.tileId })
      : engine.dispatch({ type: 'BUY_TILE', tileId: move.tileId });
    if (!acquired.ok) continue;
    if (engine.dispatch({ type: 'BUILD', tileId: move.tileId, defId: move.defId }).ok) {
      options.onBuilt?.(move, price);
      return true;
    }
  }
  return false;
}

/**
 * Fırsat lensinin gösterdiği bölgeye en kârlı mağaza.
 *
 * BOŞ PARSEL ÖNCE, YOKSA DEVRALMA — oyunun kendi öğretisi (Tur 8: "bölge
 * dolduğunda çıkış devralma") ve NPC'lerin oynadığı sıra. Vekil yalnızca
 * boş parsel ararken kademeli imar gerçek bir kör nokta açmıştı: dar
 * şehirde boş parsel ~60. günde bitiyor, NPC'ler devralmayla büyürken
 * vekil duruyordu — oyuncu/rakip oranı 1,58'den 0,20'ye düşen şey oyun
 * dengesi değil vekilin eksik repertuvarıydı.
 */
export function expandOutlets(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  // Nakdin yarısını riske at, gerisini yedekte tut.
  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts]
    // Kilitli bölge hedef değil: orada seçim yapıp satın alma kapısından
    // dönmek vekilin 5 günlük hamlesini boşa yakıyordu.
    .filter((district) => isDistrictOpen(state, district.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a));

  let best: { tileId: number; defId: string; profit: number } | null = null;

  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.buildingId)
      .map((t) => ({ tile: t, price: tilePrice(state, t.id, player.id) }))
      .filter((entry) => entry.price > 0)
      .sort(
        (a, b) =>
          (a.tile.structureId !== null ? 1 : 0) - (b.tile.structureId !== null ? 1 : 0) ||
          a.price - b.price,
      )[0]?.tile;
    if (!tile) continue;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      // Temel vekil proje kurmuyor (Tur 58): geliştirici yolu ayrı vekilde.
      if (isProject(option.def)) continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;

      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
      // SIRALAMA GERİ ÖDEMEYE GÖRE DEĞİL, GÜNLÜK KÂRA GÖRE.
      //
      // Bir bina bir parsel kaplıyor ve ölçüm oyunun kıt kaynağının
      // toprak olduğunu gösterdi (sınırsız nakitle bile karşılanmayan
      // talep %52). O yüzden doğru ölçüt paranın getirisi değil
      // PARSELİN getirisi — o da tam olarak `dailyProfit`. Geri ödeme
      // sınırı elenmiş adayları ayıklamak için duruyor.
      if (!estimate || estimate.paybackDays > 150) continue;
      if (!best || estimate.dailyProfit > best.profit) {
        best = { tileId: tile.id, defId: option.def.id, profit: estimate.dailyProfit };
      }
    }
  }

  if (!best) return;
  const needsBuyout = state.map.tiles[best.tileId]!.structureId !== null;
  const bought = needsBuyout
    ? engine.dispatch({ type: 'BUYOUT_TILE', tileId: best.tileId })
    : engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId });
  if (!bought.ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

/**
 * Zincir A/B'sinin TARİHSEL genişleme kolu — bilerek dondurulmuş kopya.
 *
 * `expandOutlets` devralmayı öğrendi; bu kopya öğrenmedi ve öğrenmeyecek.
 * Regresyon deneyi +%12/+%19/+%30 serisiyle bu düzenekte kalibre edildi;
 * düzeneği vekille birlikte evriltmek her turda "yeni bir deney" yaratır
 * ve seri kıyaslanamaz hale gelirdi.
 *
 * KİLİT FİLTRESİ İSTİSNA (Tur 21). Kopya karşılanmayan talebi en yüksek
 * dört bölgeye bakıyordu ve imara kapalı bölgeleri elemiyordu. Kilitli
 * bölgede kimse kuramadığı için boş talep ~%100: dört slotu onlar
 * doldurunca alım reddediliyor ve kol o hafta HİÇBİR ŞEY kurmuyordu. Hata
 * Tur 14'ten (kademeli imar) beri vardı; bölgeler arası erişim Tur 21'de
 * düzelince sıralama değişti ve vekil 560 günde 2–4 M ₺'de kaldı, yedi
 * tohumun altısında zincir 1 üniteye indi. Filtre kuralı değiştirmiyor
 * (yine yalnızca boş parsel, devralma yok), yalnızca yasak hamleyi eliyor.
 */
export function expandOutletsVacantOnly(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);

  const budget = player.cash * 0.5;
  if (budget < 30_000) return;

  const districts = [...state.districts]
    .filter((district) => isDistrictOpen(state, district.id))
    .sort((a, b) => districtOpportunity(b) - districtOpportunity(a));

  let best: { tileId: number; defId: string; profit: number } | null = null;

  for (const district of districts.slice(0, 4)) {
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.structureId)
      .sort((a, b) => a.landValue - b.landValue)[0];
    if (!tile) continue;

    for (const option of buildOptions(state)) {
      if (!option.unlocked) continue;
      if (option.def.role !== 'outlet' && option.def.role !== 'rental') continue;
      if (isProject(option.def)) continue;
      if (tilePrice(state, tile.id) + option.def.cost > budget) continue;

      const estimate = estimateInvestment(state, district.id, option.def.id, player.id);
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

/*
 * ZİNCİR VE MAĞAZA AYNI TİKTE — ya biri ya öteki değil.
 *
 * Eski hâli `if (followChainAdvice()) return;` idi: zincir hamlesi olan
 * hafta mağaza açılmıyordu. Devralma repertuvara girince bu, zincir
 * A/B'sini iki değişkenli bir deneye çevirdi — zincirli kol hem üretim
 * ekliyor HEM mağaza eksiltiyordu (42 ünite = 42 eksik mağaza) ve fark
 * −%1'e düştü. Gerçek oyuncu nakdi yetiyorsa ikisini de yapar; vekil de
 * öyle yapınca kollar arasında tek fark zincirin KENDİSİ kalıyor.
 */
export function playerStrategy(engine: GameEngine): void {
  followChainAdvice(engine);
  expandOutlets(engine);
}

/**
 * Baskın savunması — oyunun uyarısına uyan oyuncu.
 *
 * Motor %10/%25/%40 eşiklerinde "kendi hisseni geri al" diye haber
 * düşüyor. `playerStrategy` bunu BİLEREK yapmıyor (dengenin tarihsel
 * ölçümleri savunmasız vekille kalibre edildi); zorluk kalibrasyonu ise
 * uyarıyı okuyan bir oyuncuyla ölçülmeli — yoksa ölçülen şey zorluk
 * değil vekilin sağırlığı olur.
 */
export function defendAgainstRaids(engine: GameEngine): void {
  const state = engine.getState();
  const player = getPlayer(state);
  let threat = 0;
  for (const other of Object.values(state.companies)) {
    if (other.id === player.id) continue;
    threat = Math.max(threat, sharesHeld(state, other.id, player.id));
  }
  if (threat / sharesOutstanding(state, player.id) < 0.2) return;
  const price = sharePrice(state, player.id);
  if (price <= 0) return;
  // Günlük tavan (Tur 20): rakibin geri alımıyla aynı kural.
  const count = Math.min(capRemaining(state, player.id, player.id), freeFloat(state, player.id), Math.floor((player.cash * 0.4) / price));
  if (count > 0) engine.dispatch({ type: 'BUY_SHARES', companyId: player.id, count });
}

/**
 * Nakliyeci vekil (Tur 56): oyunun önerdiği oynanışa lojistik iş kolu.
 *
 * Masadaki her taşıma teklifini kabul ediyor; terminallerinin filosunun
 * %60'ı dolunca, terminali açacak değeri ve maliyetinin üç katı nakdi
 * varsa, henüz taşınmayan rakip mağazalarının en yoğun olduğu boş parsele
 * bir terminal daha (en az altı mağaza menzildeyse). Yalnızca komutla
 * oynuyor: lig koşusunda da tekrar tutuyor.
 */
export function freightStrategy(engine: GameEngine, maxTerminals = 3): void {
  const state = engine.getState();
  const player = getPlayer(state);
  for (const offer of [...(state.freight?.offers ?? [])]) engine.dispatch({ type: 'ACCEPT_FREIGHT', offerId: offer.id });

  const def = BUILDINGS.find((candidate) => (candidate.fleet ?? 0) > 0);
  if (!def) return;
  const terminals = freightTerminals(state);
  if (terminals.length >= maxTerminals) return;
  if (!terminals.every((terminal) => fleetUsed(state, terminal.id) >= def.fleet! * 0.6)) return;
  if (player.netWorth < def.unlockNetWorth || player.cash < def.cost * 3) return;

  const served = new Set<string>();
  for (const deal of state.freight?.contracts ?? []) for (const id of deal.outletIds) served.add(id);
  const rivals = Object.values(state.buildings).filter(
    (b) => b.companyId !== player.id && BUILDING_BY_ID[b.defId]?.role === 'outlet' && !served.has(b.id),
  );
  let best: { tileId: number; count: number } | null = null;
  for (const tile of state.map.tiles) {
    if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId || !isDistrictOpen(state, tile.districtId)) continue;
    let count = 0;
    for (const outlet of rivals) {
      const at = state.map.tiles[outlet.tileId]!;
      if (Math.abs(at.x - tile.x) + Math.abs(at.y - tile.y) <= def.radius) count++;
    }
    if (!best || count > best.count) best = { tileId: tile.id, count };
  }
  if (!best || best.count < 6) return;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: def.id });
}

/** Tüccar vekilin ayarları (Tur 79). Varsayılanlar Tur 78'in vekili. */
export interface TradeOptions {
  /** Kamyon eklemenin ve yeni hattın eşiği: birim kâr, alış fiyatının bu payı. */
  margin?: number;
  /** Hat başına en çok kamyon. */
  maxTrucks?: number;
  /** Birim kâr alış fiyatının bu payının altına inince bir kamyon çekiyor; yoksa çekmiyor. */
  drop?: number;
}

/**
 * Tüccar vekil (Tur 78): hatları fiyat tablosundan yönetiyor. Terminalleri
 * kurmuyor (senaryoda `tradeTerminals` kuruyor).
 *
 *  - Pazara satışta zarar eden hattı kapatıyor; birim kârı malın çıkıştaki
 *    alış fiyatının `margin` payını geçen hatta bir kamyon ekliyor (en çok
 *    `maxTrucks`). `drop` verilirse kâr o payın altına inince bir kamyon
 *    çekiyor (Tur 79): pazar doyunca fark kapanmadan küçülüyor.
 *  - Pazara satışta en kârlı yönleri, birim kâr katalog fiyatının `margin`
 *    payını geçiyorsa, pazardan alan bir hatla açıyor: mal başına bir hat,
 *    holding'de en çok altı.
 */
export function tradeStrategy(engine: GameEngine, options: TradeOptions = {}): void {
  const { margin = 0.1, maxTrucks = 4, drop } = options;
  const root = engine.getState();
  for (const line of [...tradeLines(root)]) {
    const m = lineMargins(root, line.from, line.to, line.goodId);
    if (!m || m.market < 0) engine.dispatch({ type: 'CLOSE_LINE', lineId: line.id });
    else if (m.market >= margin * m.buyPrice && line.trucks < maxTrucks) engine.dispatch({ type: 'SET_LINE_TRUCKS', lineId: line.id, trucks: line.trucks + 1 });
    else if (drop !== undefined && m.market < drop * m.buyPrice && line.trucks > 1) engine.dispatch({ type: 'SET_LINE_TRUCKS', lineId: line.id, trucks: line.trucks - 1 });
  }
  const rows = priceBoard(root)
    .filter((row) => row.best && row.best.margin >= margin * (GOOD_BY_ID[row.goodId]?.basePrice ?? Infinity))
    .sort((a, b) => b.best!.margin - a.best!.margin);
  for (const row of rows) {
    if (tradeLines(root).length >= 6) break;
    if (tradeLines(root).some((line) => line.goodId === row.goodId)) continue;
    engine.dispatch({ type: 'OPEN_LINE', from: row.best!.from, to: row.best!.to, goodId: row.goodId, trucks: 1, buy: true });
  }
}

/**
 * Holding'in her şehrine `perCity` nakliye terminali (Tur 79), oyuncunun
 * yaptığı gibi: oynanan şehirde kuruyor, uzaktaki şehre geçip orada kuruyor,
 * geri dönüyor (senaryo oyuncuyla geliyor). Boş parselin ilki; nakit
 * yetmezse kurulamayan kalıyor.
 */
export function tradeTerminals(engine: GameEngine, perCity = 1): void {
  const def = BUILDINGS.find((candidate) => (candidate.fleet ?? 0) > 0);
  if (!def) return;
  const build = () => {
    const state = engine.getState();
    for (let count = freightTerminals(state).length; count < perCity; count++) {
      const tile = state.map.tiles.find(
        (candidate) =>
          candidate.kind === 'plot' && !candidate.ownerId && !candidate.buildingId && !candidate.structureId && isDistrictOpen(state, candidate.districtId) &&
          (!def.zones || def.zones.includes(state.districts[candidate.districtId]!.archetype)),
      );
      if (!tile || !engine.dispatch({ type: 'BUY_TILE', tileId: tile.id }).ok) return;
      engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: def.id });
    }
  };
  build();
  const away = engine.getState().holding?.dormant.length ?? 0;
  // Her geçiş oynanan şehri listenin sonuna atıyor: sıradaki uzaktaki şehir hep başta.
  for (let i = 0; i < away; i++) {
    if (!engine.dispatch({ type: 'SWITCH_CITY', index: 0 }).ok) return;
    build();
  }
  if (away > 0) engine.dispatch({ type: 'SWITCH_CITY', index: 0 });
}

/**
 * Enerjici vekil (Tur 57).
 *
 *  - Yakıt: uyarısı gelen kriz enerji fiyatını artırıyorsa ve doğalgaz
 *    santrali varsa yakıtı sabitliyor (gündemdeki çipin yaptığı).
 *  - Santral: en çok `maxPlants`; yeterli değer ve maliyetin üç katı nakit.
 *    İzinli her boş parsel için iki santralin yapı menüsü tahmini (bugünkü
 *    fiyatla); parselle birlikte geri ödemesi en kısa olan, `maxPayback`
 *    günün altındaysa. Krizi beklemiyor: santral krize karşı sigorta ama
 *    sakin günlerde de kendini ödemeli.
 */
export function energyStrategy(engine: GameEngine, maxPlants = 4, maxPayback = 300): void {
  const state = engine.getState();
  const player = getPlayer(state);
  const coming = state.crisis?.phase === 'warning' ? CRISIS_BY_ID[state.crisis.defId] : undefined;
  if (coming && (coming.effects.energyPrice ?? 1) > 1 && hasFuelPlant(state, player.id) && !fuelLock(state, player.id)) {
    engine.dispatch({ type: 'LOCK_FUEL' });
  }

  if (powerPlants(state).filter((plant) => plant.companyId === player.id).length >= maxPlants) return;
  let best: { tileId: number; defId: string; payback: number } | null = null;
  const seasons = Object.values(ENERGY.solarSeason);
  const yearly = seasons.reduce((sum, factor) => sum + factor, 0) / seasons.length;
  for (const def of BUILDINGS) {
    if (def.role !== 'energy' || player.netWorth < def.unlockNetWorth || player.cash < def.cost * 3) continue;
    // Güneşin tahmini bugünkü mevsimle; vekil yıllık ortalamayla karar veriyor.
    const season = def.solar ? yearly / (plantCapacity(state, def) / (def.power ?? 1)) : 1;
    for (const tile of state.map.tiles) {
      if (tile.kind !== 'plot' || tile.ownerId || tile.buildingId || tile.structureId || !isDistrictOpen(state, tile.districtId)) continue;
      const archetype = state.districts[tile.districtId]?.archetype;
      if (def.zones && (!archetype || !def.zones.includes(archetype))) continue;
      const estimate = indirectEstimate(state, player.id, def.id, tile.districtId, tile.id);
      if (!estimate) continue;
      const profit = estimate.dailyGain * season - (estimate.dailyGain - estimate.dailyProfit);
      if (profit <= 0) continue;
      const payback = (def.cost + tilePrice(state, tile.id)) / profit;
      if (!best || payback < best.payback) best = { tileId: tile.id, defId: def.id, payback };
    }
  }
  if (!best || best.payback > maxPayback) return;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

/**
 * Geliştirici vekil (Tur 58): oyunun önerdiği oynanışa gayrimenkul.
 *
 * Her gün çağrılıyor (ihale üç gün açık); geri kalanı haftada bir:
 *   - Kira: her kiralıkta bir adım aşağı ya da yukarı, hedef dolulukta
 *     kira geliri artıyorsa (maliyet cironun payı: ciro en yüksekse kâr da).
 *   - Dönüşüm: bekleyen başvuru ve boş dönüşüm parseli yoksa, projesi en
 *     çok kazandıracak bölgede şehrin en ucuz satılabilir yapısı için
 *     başvuru. Dönüşüm ihalelerinde taban fiyatın `bidCeiling` katına kadar
 *     artırıyor; kazandığı parsele ilk iş proje.
 *   - Proje: en çok `maxProjects`, maliyetin iki katı nakit varsa yapı
 *     menüsünün tahminiyle günlük kârı en yüksek boş parsel, geri ödemesi
 *     (inşaat ve doluş dahil) `maxPayback` günün altındaysa.
 * Yalnızca komutla oynuyor: lig koşusunda da tekrar tutuyor.
 */
export function developerStrategy(
  engine: GameEngine,
  options: { maxProjects?: number; maxPayback?: number; bidCeiling?: number; rent?: boolean; renewal?: boolean } = {},
): void {
  const { maxProjects = 4, maxPayback = 330, bidCeiling = 4, rent = true, renewal = true } = options;
  const state = engine.getState();
  const player = getPlayer(state);
  const projects = BUILDINGS.filter((def) => isProject(def) && player.netWorth >= def.unlockNetWorth);

  // İhale: dönüşüm ihaleleri (parselde şehir yapısı var), proje açılmışsa.
  const auction = state.auction;
  if (renewal && auction && auction.bidderId !== player.id && state.map.tiles[auction.tileId]?.structureId) {
    const bid = minimumBid(auction);
    if (bid <= auction.reserve * bidCeiling && player.cash >= bid + Math.min(...projects.map((def) => def.cost), Infinity)) {
      engine.dispatch({ type: 'PLACE_BID', amount: bid });
    }
  }
  if (state.time.day % 7 !== 1) return;

  if (rent) {
    const { min, max, step } = REAL_ESTATE.rent;
    for (const building of Object.values(state.buildings)) {
      if (building.companyId !== player.id || BUILDING_BY_ID[building.defId]?.role !== 'rental' || underConstruction(building)) continue;
      const now = rentOf(building);
      let best = now;
      let value = rentalOutlook(state, building.id, now)?.rentAtTarget ?? 0;
      for (const next of [now - step, now + step]) {
        if (next < min - 1e-9 || next > max + 1e-9) continue;
        const outlook = rentalOutlook(state, building.id, next);
        if (outlook && outlook.rentAtTarget > value + 1) {
          best = next;
          value = outlook.rentAtTarget;
        }
      }
      if (best !== now) engine.dispatch({ type: 'SET_RENT', buildingId: building.id, rent: best });
    }
  }
  if (projects.length === 0) return;

  // Dönüşüm hakkı olan boş parsel: ilk iş proje (başka bina hakkı düşürür).
  const own = Object.values(state.buildings).filter((b) => b.companyId === player.id && b.development).length;
  for (const tile of state.map.tiles) {
    if (!tile.renewal || tile.ownerId !== player.id || tile.buildingId) continue;
    const pick = bestProject(state, projects, tile.districtId, tile.id);
    if (pick && player.cash >= BUILDING_BY_ID[pick]!.cost) engine.dispatch({ type: 'BUILD', tileId: tile.id, defId: pick });
    return;
  }
  if (renewal && !state.renewalRequest && state.auction?.tileId === undefined) {
    let target: { tileId: number; profit: number; price: number } | null = null;
    for (const tile of state.map.tiles) {
      if (renewalBlocker(state, tile.id) !== null) continue;
      const pick = bestProject(state, projects, tile.districtId);
      if (!pick) continue;
      const profit = estimateInvestment(state, tile.districtId, pick, player.id)!.dailyProfit;
      const price = tilePrice(state, tile.id, player.id);
      if (!target || profit > target.profit || (profit === target.profit && price < target.price)) target = { tileId: tile.id, profit, price };
    }
    const cost = Math.max(...projects.map((def) => def.cost));
    if (target && player.cash >= renewalFee(state, target.tileId) + target.price * bidCeiling + cost) {
      engine.dispatch({ type: 'REQUEST_RENEWAL', tileId: target.tileId });
    }
  }
  // Dönüşüm projeleri sınırın dışında: sınır boş parsele kurulanlar.
  if (own - renewals(state) >= maxProjects) return;

  let best: { tileId: number; defId: string; profit: number } | null = null;
  for (const district of state.districts) {
    if (!isDistrictOpen(state, district.id)) continue;
    const tile = state.map.tiles
      .filter((t) => t.districtId === district.id && t.kind === 'plot' && !t.ownerId && !t.buildingId && !t.structureId && state.auction?.tileId !== t.id)
      .sort((a, b) => a.landValue - b.landValue || a.id - b.id)[0];
    if (!tile) continue;
    for (const def of projects) {
      if (def.zones && !def.zones.includes(district.archetype)) continue;
      if (player.cash < (def.cost + tilePrice(state, tile.id, player.id)) * 2) continue;
      const estimate = estimateInvestment(state, district.id, def.id, player.id, tile.id);
      if (!estimate || estimate.paybackDays > maxPayback) continue;
      if (!best || estimate.dailyProfit > best.profit) best = { tileId: tile.id, defId: def.id, profit: estimate.dailyProfit };
    }
  }
  if (!best) return;
  if (!engine.dispatch({ type: 'BUY_TILE', tileId: best.tileId }).ok) return;
  engine.dispatch({ type: 'BUILD', tileId: best.tileId, defId: best.defId });
}

/** Oyuncunun dönüşüm parselindeki projeleri. */
function renewals(state: GameState): number {
  return Object.values(state.buildings).filter((b) => b.companyId === state.playerCompanyId && b.development?.renewal).length;
}

/** Bu bölgede (parselde) günlük kârı en yüksek proje; geri ödemesi sonsuzsa yok. */
function bestProject(state: GameState, projects: typeof BUILDINGS, districtId: number, tileId?: number): string | null {
  const district = state.districts[districtId];
  if (!district) return null;
  let best: { defId: string; profit: number } | null = null;
  for (const def of projects) {
    if (def.zones && !def.zones.includes(district.archetype)) continue;
    const estimate = estimateInvestment(state, districtId, def.id, state.playerCompanyId, tileId);
    if (!estimate || !Number.isFinite(estimate.paybackDays)) continue;
    if (!best || estimate.dailyProfit > best.profit) best = { defId: def.id, profit: estimate.dailyProfit };
  }
  return best?.defId ?? null;
}

export interface RivalryOptions {
  /** Rakiple aynı bölgede, aynı kategoride satan mağazaların fiyat çarpanı (haftada bir). */
  undercut?: number;
  /** Bu kadar günde bir en küçük rakipten hisse (payın `raidShare`'i). */
  raidEvery?: number;
  raidShare?: number;
  /** Husumetli rakiple uzlaşma: bedelin beş katı nakit varsa. */
  amends?: boolean;
}

/**
 * Rakiplerle ilişkisini yöneten vekil (Tur 59). Temel vekilin üstüne her
 * gün çağrılıyor; yalnızca komutla oynuyor (lig koşusunda da tekrar tutuyor).
 *   - fiyat kıran: rakibin rafı olan bölgede ve kategoride mağazasını ucuza
 *     çekiyor (oyuncunun açık seçimi: rakip bunu hatırlıyor);
 *   - hisse toplayan: en küçük rakipten düzenli alım;
 *   - diplomat: husumete düşen rakiple uzlaşıyor.
 */
export function rivalryStrategy(engine: GameEngine, options: RivalryOptions = {}): void {
  const state = engine.getState();
  const player = getPlayer(state);
  const day = state.time.day;
  if (options.undercut !== undefined && day % 7 === 0) {
    const shelves = new Set<string>();
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      if (building.companyId !== player.id && def?.role === 'outlet') shelves.add(`${building.districtId}|${def.category}`);
    }
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      if (building.companyId !== player.id || def?.role !== 'outlet' || !shelves.has(`${building.districtId}|${def.category}`)) continue;
      if (Math.abs(building.priceMultiplier - options.undercut) > 1e-9) {
        engine.dispatch({ type: 'SET_PRICE_MULTIPLIER', buildingId: building.id, multiplier: options.undercut });
      }
    }
  }
  if (options.raidEvery && day % options.raidEvery === 0) {
    const target = Object.values(state.companies)
      .filter((company) => !company.isPlayer && freeFloat(state, company.id) > 0)
      .sort((a, b) => a.netWorth - b.netWorth || (a.id < b.id ? -1 : 1))[0];
    if (target) {
      const price = sharePrice(state, target.id);
      const count = Math.min(
        freeFloat(state, target.id),
        Math.floor(sharesOutstanding(state, target.id) * (options.raidShare ?? 0.02)),
        price > 0 ? Math.floor((player.cash * 0.2) / price) : 0,
      );
      if (count > 0) engine.dispatch({ type: 'BUY_SHARES', companyId: target.id, count });
    }
  }
  if (options.amends) {
    for (const rival of hostileRivals(state)) {
      if (amendsBlocker(state, rival.id) === null && player.cash >= amendsCost(state, rival.id) * 5) {
        engine.dispatch({ type: 'MAKE_AMENDS', companyId: rival.id });
      }
    }
  }
}

/**
 * Devralmacı (Tur 61): her seferinde en ucuz alınabilir rakibe devralma
 * emri, bedeli kasanın %90'ından azsa (Senaryolar III'ün avcısı).
 */
export function takeoverStrategy(engine: GameEngine): void {
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

export type PathProxy = 'retail' | 'takeover' | 'realestate' | 'energy' | 'freight';

/**
 * Yol vekilleri (Tur 61): her yol için ayrı bir oyuncu, her gün çağrılıyor.
 * Hepsi baskın uyarısını okuyor (üç günde bir savunma). Tur 56–58'in
 * vekilleri temel vekilin üstüne bir iş kolu ekliyordu; yol vekili iş
 * kolunu öne alıyor:
 *   - perakende: temel vekil, beş günde bir;
 *   - devralma: beş günde bir önce devralma emri, sonra temel vekil;
 *   - gayrimenkul: geliştirici her gün, proje sınırı yok, geri ödeme
 *     500 güne kadar; temel vekil yedi günde bir (nakit önce projeye);
 *   - enerji: enerjici beş günde bir, santral sınırı yok, geri ödeme 400
 *     güne kadar; temel vekil yedi günde bir;
 *   - nakliye: nakliyeci beş günde bir, terminal sınırı yok, her teklifi
 *     kabul ediyor, kinli rakiple uzlaşıyor (kinli rakip teklif getirmiyor);
 *     temel vekil beş günde bir.
 * Yalnızca komutla oynuyor: lig koşusunda da tekrar tutuyor.
 */
export function pathStrategy(engine: GameEngine, path: PathProxy): void {
  const day = engine.getState().time.day;
  const every = (n: number) => day % n === 0;
  switch (path) {
    case 'retail':
      if (every(5)) playerStrategy(engine);
      break;
    case 'takeover':
      if (every(5)) {
        takeoverStrategy(engine);
        playerStrategy(engine);
      }
      break;
    case 'realestate':
      developerStrategy(engine, { maxProjects: Infinity, maxPayback: 500 });
      if (every(7)) playerStrategy(engine);
      break;
    case 'energy':
      if (every(5)) energyStrategy(engine, Infinity, 400);
      if (every(7)) playerStrategy(engine);
      break;
    case 'freight':
      if (every(5)) {
        freightStrategy(engine, Infinity);
        playerStrategy(engine);
      }
      rivalryStrategy(engine, { amends: true });
      break;
  }
  if (every(3)) defendAgainstRaids(engine);
}
