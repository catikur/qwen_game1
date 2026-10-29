import { GOOD_BY_ID, NPC_PROFILES, getCityType } from '@capital/content';
import type { BuildingDef, CityTypeDef, CityTypeId, CityTypeRule, NpcProfileDef } from '@capital/content';
import type { GameState } from '../types';

/**
 * Şehrin türü (Tur 76): sistemlerin okuduğu tek kapı.
 *
 * Dengeli şehirde (alan yok) her yardımcı bugünkü sayıyı döndürüyor: çarpan
 * 1, kural yok. Çarpımlar 1 ile birebir aynı sonucu verdiği için dengeli
 * şehir Tur 75'teki şehirle bitine kadar aynı, lig izi değişmiyor.
 */
export function cityTypeOf(state: Pick<GameState, 'cityType'>): CityTypeDef {
  return getCityType(state.cityType);
}

/** Türün kuralı; dengeli şehirde boş. */
export function cityRule(state: Pick<GameState, 'cityType'>): CityTypeRule {
  return state.cityType ? getCityType(state.cityType).rule : {};
}

/** Bir malın bu şehirdeki referans fiyat çarpanı (hammadde bolluğu ya da kıtlığı). */
export function cityGoodScale(state: Pick<GameState, 'cityType'>, goodId: string): number {
  return state.cityType ? (getCityType(state.cityType).goods[goodId] ?? 1) : 1;
}

/**
 * Malın bu şehirdeki referans fiyatı: spot fiyat bunun etrafında dolaşıyor,
 * tabanı ve tavanı da bundan. Zincir kartının "kriz" eşiği de buna göre:
 * başkentte hammaddenin %10 pahalı olması kriz değil, şehrin fiyatı.
 */
export function referencePrice(state: Pick<GameState, 'cityType'>, goodId: string): number {
  const base = GOOD_BY_ID[goodId]?.basePrice ?? 0;
  return state.cityType ? base * cityGoodScale(state, goodId) : base;
}

/** Türün tohumladığı spot fiyatlar: yeni şehirde pazar ve şirketlerin birim maliyeti. */
export function scaleSpotPrices(prices: Record<string, number>, type: CityTypeId | undefined): Record<string, number> {
  if (!type) return prices;
  const goods = getCityType(type).goods;
  for (const [goodId, scale] of Object.entries(goods)) {
    if (scale !== undefined && prices[goodId] !== undefined) prices[goodId] = prices[goodId]! * scale;
  }
  return prices;
}

/**
 * Türün rakip kadrosu: önce türün profilleri, sonra kataloğun geri kalanı
 * kendi sırasıyla. Dengeli şehirde katalog sırasının kendisi.
 */
export function rivalRoster(type: CityTypeId | undefined): NpcProfileDef[] {
  const head = type ? getCityType(type).rivals : [];
  if (head.length === 0) return NPC_PROFILES;
  const first = head.map((id) => NPC_PROFILES.find((profile) => profile.id === id)).filter((profile): profile is NpcProfileDef => Boolean(profile));
  return [...first, ...NPC_PROFILES.filter((profile) => !head.includes(profile.id))];
}

/** Binanın bakımına türün çarpanı: sanayi kentinde çiftlik ve tesis ucuz işliyor. */
export function cityUpkeepScale(state: Pick<GameState, 'cityType'>, def: Pick<BuildingDef, 'role'>): number {
  if (!state.cityType) return 1;
  const scale = getCityType(state.cityType).rule.productionUpkeep;
  return scale !== undefined && (def.role === 'extract' || def.role === 'process') ? scale : 1;
}

/** Bina başına inşaat maliyeti çarpanı: limanda terminal ve depo ucuz. */
export function cityBuildCostScale(state: Pick<GameState, 'cityType'>, defId: string): number {
  return state.cityType ? (getCityType(state.cityType).rule.buildCost?.[defId] ?? 1) : 1;
}

/** Sendikanın baskı artışına çarpan: sanayi kentinde işçi daha örgütlü. */
export function cityUnionPressure(state: Pick<GameState, 'cityType'>): number {
  return state.cityType ? (getCityType(state.cityType).rule.unionPressure ?? 1) : 1;
}

/** Arsa değerinin sürüklendiği hedefe çarpan: başkentte arsa pahalı kalıyor. */
export function cityLandScale(state: Pick<GameState, 'cityType'>): number {
  return state.cityType ? (getCityType(state.cityType).rule.landValue ?? 1) : 1;
}

/** Zafer eşiğine türün çarpanı (boyutunkinin üstüne). */
export function cityVictoryScale(state: Pick<GameState, 'cityType'>): number {
  return state.cityType ? getCityType(state.cityType).victoryScale : 1;
}
