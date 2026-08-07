import {
  BUILDING_BY_ID,
  DISTRICT_ARCHETYPES,
  STRUCTURE_BY_ID,
  getCeoModifiers,
} from '@capital/content';
import { portfolioValue } from './equity';
import type { GameState } from '../types';

/** Sahip olunan arsanın satılabileceği oran (alım-satım sürtünmesi). */
export const LAND_SELL_RATIO = 0.85;
/** Binanın net değere katkısı (amortisman). */
export const BUILDING_BOOK_RATIO = 0.65;

/**
 * Arsa değeri dinamikleri.
 *
 * Bir arsanın değeri çevresindeki gelişmeyle birlikte artar. Bu, oyuna
 * gayrimenkul katmanını katan şey: doğru bölgeyi erken alan oyuncu, hiçbir
 * şey inşa etmeden de kazanır.
 */
export function runLandValueTick(state: GameState, eventDrift: number): void {
  if (!state.flags.landValueDrift) return;

  const { width, height, tiles } = state.map;

  for (const tile of tiles) {
    const district = state.districts[tile.districtId];
    if (!district) continue;
    const archetype = DISTRICT_ARCHETYPES[district.archetype];

    // 3x3 komşulukta ne kadar gelişme var? Park ve meydan komşuluğu
    // gerçek şehirlerde olduğu gibi arsayı ayrıca değerlendirir.
    let developed = 0;
    let neighbors = 0;
    let amenity = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        neighbors++;
        const neighbor = tiles[ny * width + nx];
        if (!neighbor) continue;
        if (neighbor.buildingId || neighbor.structureId) developed++;
        if (neighbor.kind === 'civic') amenity++;
      }
    }

    const developmentRatio = neighbors > 0 ? developed / neighbors : 0;
    const amenityBonus = neighbors > 0 ? (amenity / neighbors) * 0.25 : 0;
    // Nüfus arttıkça taban değer de yükselir.
    const populationFactor = district.population / Math.max(1, archetype.population);
    const target =
      archetype.baseLandValue *
      (0.7 + 0.55 * developmentRatio + amenityBonus + 0.35 * (populationFactor - 1));

    // Hedefe yavaş yaklaş, üstüne olayların sürüklemesini ekle.
    tile.landValue += (target - tile.landValue) * 0.004 + tile.landValue * eventDrift;
    tile.landValue = Math.max(200, tile.landValue);
  }
}

/**
 * Şehir büyümesi.
 *
 * Nüfus yavaşça artar ve istihdam yaratan bölgelerde daha hızlı artar.
 * Bu olmadan toplam talep sabit kalıyor, pazar bir yıl içinde doyuyor ve
 * oyunun geç safhasında yapacak bir şey kalmıyordu.
 */
const BASE_GROWTH_PER_DAY = 0.0002;
const JOB_GROWTH_FACTOR = 0.00004;

export function runPopulationTick(state: GameState): void {
  const jobsByDistrict = new Map<number, number>();
  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    // YALNIZCA TEMEL İSTİHDAM nüfus çeker.
    //
    // Perakende istihdamı nüfusu çekmez, nüfusu TAKİP eder: bir mahalleye
    // süpermarket açılması oraya yeni sakin getirmez, oradaki sakinlere
    // hizmet eder. Üretim, ofis, lojistik ve Ar-Ge ise gerçekten dışarıdan
    // insan çeker — şehir ekonomisinde buna "temel/temel olmayan istihdam"
    // ayrımı deniyor.
    //
    // Bu ayrım olmadan oyunun en temel döngüsü kısır bir hale geliyordu:
    // açtığın dükkân istihdam yaratıyor, istihdam nüfusu, nüfus da o
    // dükkânın hizmet ettiği talebi büyütüyordu. Yani DÜKKÂN KENDİ
    // MÜŞTERİSİNİ ÜRETİYORDU. Ölçüm: talebe orantılı 30 süpermarketle
    // 200 günde nüfus %93 artıyor, mağazalar %100 dolu çalışıyor ve
    // talebin %57'si karşılanamıyor — kapasite asla yetişemiyor.
    //
    // Kapasite yetişemeyince de çekicilik formülünün (kalite, marka,
    // fiyat) hiçbir değişkeni bir işe yaramıyor: herkes zaten satabildiği
    // kadarını satıyor. Aynı kurulum temel istihdam modeliyle %69 doluluk
    // veriyor — yani müşteriyi artık gerçekten REKABET belirliyor.
    if (def.role === 'outlet') continue;
    jobsByDistrict.set(building.districtId, (jobsByDistrict.get(building.districtId) ?? 0) + def.jobs);
  }

  for (const district of state.districts) {
    const archetype = DISTRICT_ARCHETYPES[district.archetype];
    const ceiling = archetype.population * 2.6;
    if (district.population >= ceiling) continue;

    const jobs = jobsByDistrict.get(district.id) ?? 0;
    const growth = BASE_GROWTH_PER_DAY + jobs * JOB_GROWTH_FACTOR;
    district.population = Math.min(ceiling, district.population * (1 + growth));
  }
}

/**
 * Bir parselin şirkete göre fiyatı.
 *
 * Boş parsel arsa değerine alınır; üzerinde mevcut yapı varsa sahibinden
 * çıkarma primi uygulanır (yapı tipine göre 1,7x–3,6x). CEO'nun arsa
 * pazarlığı da buraya girer.
 */
export function tilePrice(state: GameState, tileId: number, companyId?: string): number {
  const tile = state.map.tiles[tileId];
  if (!tile) return 0;

  let price = tile.landValue;
  if (tile.structureId) {
    const structure = STRUCTURE_BY_ID[tile.structureId];
    if (!structure || structure.buyoutMultiplier === null) return 0;
    price *= structure.buyoutMultiplier;
  }

  const company = companyId ? state.companies[companyId] : undefined;
  price *= getCeoModifiers(company?.ceoId ?? null).landCost;

  return Math.round(price);
}

/** Parsel satın alınabilir mi? Yol ve kamu alanları hiçbir koşulda satılmaz. */
export function isPurchasable(tile: { kind: string; ownerId: string | null }): boolean {
  return tile.kind === 'plot' && tile.ownerId === null;
}

export function recomputeNetWorth(state: GameState): void {
  const assets: Record<string, number> = {};
  for (const id of Object.keys(state.companies)) assets[id] = 0;

  for (const tile of state.map.tiles) {
    if (tile.ownerId && assets[tile.ownerId] !== undefined) {
      assets[tile.ownerId]! += tile.landValue;
    }
  }

  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (!def) continue;
    if (assets[building.companyId] !== undefined) {
      assets[building.companyId]! += def.cost * BUILDING_BOOK_RATIO;
    }
  }

  for (const company of Object.values(state.companies)) {
    // Portföy değeri de net değere girer: başka bir şirketin %20'sine
    // sahipsen onun büyümesi seni de büyütür. Hiç hisse almamış şirkette
    // `portfolioValue` sıfır döner ve formül Tur 3'teki haline birebir
    // indirgenir — denge kimliği bu sayede korunuyor.
    company.netWorth =
      company.cash + (assets[company.id] ?? 0) - company.debt + portfolioValue(state, company.id);
    company.netWorthHistory.push(Math.round(company.netWorth));
    if (company.netWorthHistory.length > 120) company.netWorthHistory.shift();
  }
}
