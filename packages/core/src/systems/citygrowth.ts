import { DISTRICT_ARCHETYPES, DISTRICT_FABRIC, STRUCTURE_BY_ID, rootStructureOf } from '@capital/content';
import { createRng, nextFloat } from '../rng';
import { pushNews } from '../news';
import { isDistrictOpen } from './city';
import type { DistrictState, GameState, Tile } from '../types';

/**
 * Şehir zamanla gelişir.
 *
 * Bugüne kadar harita gün 0'da ne ise 1200. günde de oydu: kurulmuş,
 * bitmiş, donmuş bir dekor. Oyuncu şehri değiştiriyordu ama şehir
 * oyuncuya cevap vermiyordu.
 *
 * Burada üç ayrı hareket var ve üçü de aynı basınçtan besleniyor:
 *
 *   YAYILMA  — boş parseller yapılaşır (çekirdekten dışa)
 *   YÜKSELME — mevcut yapılar kat kazanır
 *   DÖNÜŞÜM  — yapı kademe atlar: bostan → depo → fabrika,
 *              sıra ev → apartman → rezidans
 *
 * Basınç iki kaynaklı: ZAMAN (şehir kendi başına da büyür) ve NÜFUS
 * (oyuncunun kurduğu üretim istihdam çeker, istihdam nüfusu). İkincisi
 * mekaniğin can alıcı yeri — şehir oyuncuyla birlikte büyüyor, ona
 * rağmen değil.
 *
 * ZAR DIŞSAL. Dönemler ve olaylarla aynı ilke: hangi parselin
 * geliştiğini tohum+gün belirliyor, oyuncunun harcadığı rng değil.
 * Böylece eşli deneylerin iki kolu aynı günlerde aynı şehir hareketini
 * görüyor; aralarındaki fark yalnızca ölçülen değişkenden geliyor.
 *
 * Şema değişmiyor: `structureId` ve `structureHeight` zaten vardı, bu
 * sistem yalnızca onları zaman içinde oynatıyor. Eski kayıtlar olgun
 * şehirleriyle açılır ve oradan itibaren büyümeye devam eder.
 */

/** Kaç günde bir şehir bir adım gelişir. */
const GROWTH_PERIOD_DAYS = 3;

/** Dışsal zarın tohum karışım sabiti (dönemler/olaylardan farklı). */
const GROWTH_SALT = 1_013_904_223;

/** Şehir kendi başına bu sürede olgunlaşır (oyuncu hiçbir şey yapmasa da). */
const SELF_GROWTH_DAYS = 900;

/** Zaman ve nüfusun basınçtaki payı. */
const TIME_WEIGHT = 0.45;
const POPULATION_WEIGHT = 0.55;

/** Gelişme oranı tabanı ve olgun şehirdeki tavanı. */
const DEVELOPED_FLOOR = 0.32;
const DEVELOPED_CEILING = 0.78;

/**
 * Bir bölgede bu sayıdan az boş parsel kalırsa şehir büyümeyi durdurur.
 *
 * Şehrin oyuncuyla arazi için yarışması istenen bir baskı; oyuncuyu
 * tamamen dışarıda bırakması değil. Bu taban, "gidecek yer kalmadı"
 * hâlini imkânsız kılıyor.
 */
const MIN_FREE_PLOTS = 4;

/** Bir adımda kaç mevcut yapıya dokunulur (yükseklik/dönüşüm). */
const TOUCHES_PER_DISTRICT = 3;

/** Bir dokunuşta yüksekliğin aralığa göre artışı. */
const HEIGHT_STEP = 0.09;

/** Kademe atlamak için gereken en düşük basınç ve zar. */
const UPGRADE_PRESSURE = 0.45;
const UPGRADE_CHANCE = 0.45;

/** Yeni yapı bu basıncın üstünde bir üst kademeden başlar. */
const SECOND_TIER_PRESSURE = 0.55;

/** Nüfus tavanı taban nüfusun 2,6 katı; aradaki 1,6'lık aralık tam basınç. */
const POPULATION_SPAN = 1.6;

/**
 * Bölgenin gelişme basıncı 0..1.
 *
 * Nüfus payı `population / archetype.population - 1` üzerinden okunuyor
 * ve ÖNCE aralığa bölünüp SONRA kırpılıyor. Sıra önemli: ilk sürüm
 * fazlalığı 1'e kırpıp sonra 1,6'ya bölüyordu, yani nüfus bileşeni
 * tavanda 0,625'te kalıyor ve toplam basınç 900 günden sonra bile
 * 0,794'ü geçemiyordu. Kalabalıklaşan bölge hak ettiği hızda
 * gelişmiyor, arayüzdeki "Gelişme" göstergesi de %100'ü hiç
 * göremiyordu.
 */
export function districtPressure(state: GameState, district: DistrictState): number {
  const archetype = DISTRICT_ARCHETYPES[district.archetype];
  const time = Math.min(1, state.time.day / SELF_GROWTH_DAYS);
  const excess = district.population / archetype.population - 1;
  const population = Math.max(0, Math.min(1, excess / POPULATION_SPAN));
  return TIME_WEIGHT * time + POPULATION_WEIGHT * population;
}

/**
 * Bölgedeki parseller ve şehrin kendi dokusunun doluluğu.
 *
 * ÖLÇÜ ŞEHRİN KENDİ ARAZİSİ, bölgenin tamamı değil. İlk sürüm şirket
 * parsellerini de "gelişmiş" sayıyordu ve ölçüm bunun sistemi fiilen
 * kapattığını gösterdi: rakipler ilk 120 günde 58 parsel kapatınca
 * doluluk hedefi zaten aşılıyor, şehir TEK bir yapı bile eklemiyordu
 * (gün 0'da 87 yapı, gün 120'de yine 87). Oysa şirketlerin aldığı
 * arazi şehrin gelişebileceği yer değil; hedefi onunla ölçmek
 * "başkası inşa etti, ben durayım" demek oluyordu.
 *
 * Şimdi payda `şehrin elindeki parseller` — şirket toprağı denklemin
 * dışında. Şehir kendi kalan arazisini dolduruyor, oyuncunun mahallesine
 * yığılmıyor.
 */
function surveyDistrict(state: GameState, districtId: number) {
  const plots: Tile[] = [];
  const free: Tile[] = [];
  const structured: Tile[] = [];
  let cityPlots = 0;

  for (const tile of state.map.tiles) {
    if (tile.districtId !== districtId || tile.kind === 'road') continue;
    plots.push(tile);

    // KAMU KARESİ PAYDAYA GİRMEZ. Park, meydan ve okul ne şehrin
    // yapılaşabileceği ne de şirketin alabileceği arazi; paydada
    // durunca park ağırlıklı bölgeler (lüks konut, teknopark: %14 park)
    // hep "az gelişmiş" okunuyor ve şehir hedefe varamadığı için boş
    // parsel tabanına kadar yayılmaya devam ediyordu. Oran, ancak
    // GELİŞEBİLİR arazi üzerinden anlamlı.
    if (tile.kind !== 'plot') continue;

    const companyLand = Boolean(tile.ownerId || tile.buildingId);
    if (!companyLand) cityPlots++;
    if (!companyLand && !tile.structureId) free.push(tile);
    if (tile.structureId) structured.push(tile);
  }

  return { plots, free, structured, cityPlots };
}

/** Bir parselin çevresinde kaç gelişmiş komşu var (0..8)? */
function developedNeighbours(state: GameState, tile: Tile): number {
  const { width, height, tiles } = state.map;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbour = tiles[ny * width + nx];
      if (neighbour?.structureId || neighbour?.buildingId) count++;
    }
  }
  return count;
}

/**
 * Yeni yapılaşma için bir yapı seçer.
 *
 * KAMU YAPISI SEÇİLMEZ. Park ve meydan hiçbir fiyata satılmaz; şehrin
 * bir gecede oyuncunun gözüne kestirdiği parseli parka çevirmesi, geri
 * alınamaz bir kayıp olurdu. Şehir yalnızca DEVREDİLEBİLİR doku üretir —
 * yani her yeni yapı, primi ödeyen için hâlâ bir fırsat.
 */
function pickNewStructure(
  state: GameState,
  district: DistrictState,
  dice: { s: number },
  pressure: number,
): string | null {
  const fabric = DISTRICT_FABRIC[district.archetype] ?? [];
  const candidates = fabric.filter((entry) => {
    if (!entry.structureId) return false;
    const def = STRUCTURE_BY_ID[entry.structureId];
    return Boolean(def) && def!.buyoutMultiplier !== null;
  });
  if (candidates.length === 0) return null;

  let total = 0;
  for (const entry of candidates) total += entry.weight;
  let roll = nextFloat(dice) * total;
  let chosen = candidates[candidates.length - 1]!.structureId!;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll <= 0) {
      chosen = entry.structureId!;
      break;
    }
  }

  // Her şey küçük başlar; olgun bir bölge bir kademe yukarıdan başlar.
  const root = rootStructureOf(chosen);
  if (pressure > SECOND_TIER_PRESSURE) {
    const next = STRUCTURE_BY_ID[root]?.upgradesTo;
    if (next) return next;
  }
  return root;
}

export function runCityGrowthTick(state: GameState): void {
  if (state.time.day % GROWTH_PERIOD_DAYS !== 0) return;

  const dice = createRng((state.meta.seed ^ (state.time.day * GROWTH_SALT)) >>> 0);

  for (const district of state.districts) {
    // İmara kapalı bölge gelişmez: kilitliyken köy kalır, açıldığı gün
    // gelişmeye başlar. Tur 14'ün takvimi böylece görünür bir sonuç
    // kazanıyor — açılan bölge gerçekten şehre dönüşüyor.
    if (!isDistrictOpen(state, district.id)) continue;

    const pressure = districtPressure(state, district);
    const survey = surveyDistrict(state, district.id);
    if (survey.cityPlots === 0) continue;

    // ---- 1. Yayılma ----
    const target = DEVELOPED_FLOOR + (DEVELOPED_CEILING - DEVELOPED_FLOOR) * pressure;
    const ratio = survey.structured.length / survey.cityPlots;
    const buildable = survey.free.filter(
      (tile) => tile.kind === 'plot' && !tile.ownerId && state.auction?.tileId !== tile.id,
    );

    if (ratio < target && buildable.length > MIN_FREE_PLOTS && nextFloat(dice) < pressure + 0.25) {
      // Şehirler lekeler hâlinde değil, kenarlardan büyür: birkaç aday
      // arasından komşusu en gelişmiş olanı seçiliyor.
      let best: Tile | null = null;
      let bestScore = -1;
      for (let i = 0; i < 4; i++) {
        const candidate = buildable[Math.floor(nextFloat(dice) * buildable.length)];
        if (!candidate) continue;
        const score = developedNeighbours(state, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      const structureId = best ? pickNewStructure(state, district, dice, pressure) : null;
      if (best && structureId) {
        const def = STRUCTURE_BY_ID[structureId];
        if (def) {
          best.structureId = structureId;
          best.structureHeight = def.minHeight;
        }
      }
    }

    // ---- 2. Yükselme ve 3. dönüşüm ----
    for (let i = 0; i < TOUCHES_PER_DISTRICT; i++) {
      const tile = survey.structured[Math.floor(nextFloat(dice) * survey.structured.length)];
      if (!tile?.structureId) continue;
      const def = STRUCTURE_BY_ID[tile.structureId];
      if (!def) continue;

      const span = def.maxHeight - def.minHeight;
      if (tile.structureHeight < def.maxHeight - span * 0.05) {
        // Kat kazanmak basınçla hızlanır: canlı bölge hızlı yükselir.
        tile.structureHeight = Math.min(
          def.maxHeight,
          tile.structureHeight + span * HEIGHT_STEP * (0.5 + pressure),
        );
        continue;
      }

      // Tavana varmış yapı, basınç yeterse kademe atlar.
      if (!def.upgradesTo || pressure < UPGRADE_PRESSURE) continue;
      if (nextFloat(dice) > UPGRADE_CHANCE) continue;
      const next = STRUCTURE_BY_ID[def.upgradesTo];
      if (!next || next.buyoutMultiplier === null) continue;

      // Siluetin ilk kez değiştiği an bir haber: oyuncu şehrin
      // büyüdüğünü haber akışından da görmeli, yalnızca gözüyle değil.
      const firstOfKind =
        next.form === 'tower' &&
        !state.map.tiles.some(
          (other) =>
            other.districtId === district.id &&
            other.structureId === next.id &&
            other.id !== tile.id,
        );

      tile.structureId = next.id;
      tile.structureHeight = next.minHeight;

      if (firstOfKind) {
        pushNews(
          state,
          'neutral',
          `${district.name} yükseliyor`,
          `${district.name} bölgesinde ilk ${next.name.toLowerCase()} yükseldi. Arsa değerleri onu izleyecek.`,
        );
      }
    }
  }
}
