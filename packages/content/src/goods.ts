import { CATEGORIES } from './categories';
import type { CategoryId, GoodDef } from './types';

/**
 * Ürün kataloğu — tedarik zincirinin içeriği.
 *
 * Zincir derinliği her ürün için sabit üç kademedir:
 *
 *     hammadde  →  ara mal  →  tüketici ürünü
 *     (çiftlik)    (tesis)     (mağaza rafı)
 *
 * Değişken derinlik esneklik verirdi ama zincir kartını okunmaz yapardı;
 * sabit derinlik sayesinde tek bir arayüz şablonu her ürünü anlatabiliyor.
 *
 * DENGE KISITI: Bir tüketici ürününün "her şeyi pazardan alan" oyuncuya
 * maliyeti, kategorinin bugünkü `basePrice × costRatio` değerine BİREBİR
 * eşittir. Yani zincir kurmamış oyuncu için ekonomi hiç değişmez; zincir
 * o maliyeti aşağı çeker, tedarik krizi yukarı iter. Bu kısıt sayesinde
 * mevcut kalibrasyon (60–110 gün outlet geri ödemesi) geçerliliğini korur.
 *
 *     basePrice(ara mal) + retailCost(tüketici) === basePrice × costRatio
 */
export const GOODS: GoodDef[] = [
  // ---- Ekmek zinciri (Market · 12 ₺ × 0,68 = 8,16) ----
  {
    id: 'wheat',
    name: 'Buğday',
    tier: 'raw',
    category: null,
    inputGoodId: null,
    basePrice: 3.4,
    retailCost: 0,
    demandShare: 0,
    color: '#c9a227',
  },
  {
    id: 'flour',
    name: 'Un',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'wheat',
    basePrice: 5.8,
    retailCost: 0,
    demandShare: 0,
    color: '#e0d3b0',
  },
  {
    id: 'bread',
    name: 'Ekmek',
    tier: 'consumer',
    category: 'grocery',
    inputGoodId: 'flour',
    basePrice: 0,
    retailCost: 2.36,
    demandShare: 0.5,
    archetypeWeights: {
      mid_residential: 1.3,
      student: 1.3,
      industrial: 1.2,
      port: 1.2,
      retail_strip: 1.1,
      downtown: 0.9,
      lux_residential: 0.7,
    },
    color: '#7bc47f',
  },
  {
    id: 'starch',
    name: 'Nişasta',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'wheat',
    basePrice: 5.2,
    retailCost: 0,
    demandShare: 0,
    color: '#efe6cf',
  },
  {
    id: 'biscuit',
    name: 'Bisküvi',
    tier: 'consumer',
    category: 'grocery',
    inputGoodId: 'starch',
    basePrice: 0,
    retailCost: 2.96,
    demandShare: 0.5,
    archetypeWeights: {
      tourism: 1.4,
      downtown: 1.2,
      lux_residential: 1.1,
      tech_park: 1.1,
      student: 1.1,
      industrial: 0.7,
    },
    color: '#c7a15e',
  },

  // ---- Kahve zinciri (Yeme-içme · 28 ₺ × 0,45 = 12,60) ----
  {
    id: 'coffee_bean',
    name: 'Kahve Çekirdeği',
    tier: 'raw',
    category: null,
    inputGoodId: null,
    basePrice: 5.6,
    retailCost: 0,
    demandShare: 0,
    color: '#6b4423',
  },
  {
    id: 'roasted_coffee',
    name: 'Kavrulmuş Kahve',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'coffee_bean',
    basePrice: 10,
    retailCost: 0,
    demandShare: 0,
    color: '#8a5a2b',
  },
  {
    id: 'coffee',
    name: 'Kahve',
    tier: 'consumer',
    category: 'dining',
    inputGoodId: 'roasted_coffee',
    basePrice: 0,
    retailCost: 2.6,
    demandShare: 0.5,
    archetypeWeights: {
      student: 1.4,
      downtown: 1.3,
      tourism: 1.3,
      tech_park: 1.3,
      industrial: 0.6,
    },
    color: '#f2a65a',
  },

  // ---- Hazır yemek zinciri (Yeme-içme · 28 ₺ × 0,45 = 12,60) ----
  {
    id: 'vegetable',
    name: 'Sebze',
    tier: 'raw',
    category: null,
    inputGoodId: null,
    basePrice: 4.3,
    retailCost: 0,
    demandShare: 0,
    color: '#6f9b4a',
  },
  {
    id: 'prepared_food',
    name: 'Hazır Gıda',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'vegetable',
    basePrice: 8.9,
    retailCost: 0,
    demandShare: 0,
    color: '#b4823f',
  },
  {
    id: 'meal',
    name: 'Hazır Yemek',
    tier: 'consumer',
    category: 'dining',
    inputGoodId: 'prepared_food',
    basePrice: 0,
    retailCost: 3.7,
    demandShare: 0.5,
    archetypeWeights: {
      industrial: 1.5,
      port: 1.4,
      mid_residential: 1.2,
      retail_strip: 1.1,
      lux_residential: 0.7,
      tourism: 0.6,
    },
    color: '#d1743f',
  },

  // ---- Giyim zinciri (Perakende · 65 ₺ × 0,50 = 32,50) ----
  {
    id: 'cotton',
    name: 'Pamuk',
    tier: 'raw',
    category: null,
    inputGoodId: null,
    basePrice: 11,
    retailCost: 0,
    demandShare: 0,
    color: '#e8e2d6',
  },
  {
    id: 'fabric',
    name: 'Kumaş',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'cotton',
    basePrice: 26,
    retailCost: 0,
    demandShare: 0,
    color: '#b98fc4',
  },
  {
    id: 'apparel',
    name: 'Giyim',
    tier: 'consumer',
    category: 'retail',
    inputGoodId: 'fabric',
    basePrice: 0,
    retailCost: 6.5,
    demandShare: 0.5,
    archetypeWeights: {
      lux_residential: 1.4,
      tourism: 1.3,
      downtown: 1.2,
      retail_strip: 1.2,
      industrial: 0.5,
    },
    color: '#c98bdb',
  },
  {
    id: 'upholstery',
    name: 'Döşemelik',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'cotton',
    basePrice: 23,
    retailCost: 0,
    demandShare: 0,
    color: '#8f7fa8',
  },
  {
    id: 'home_textile',
    name: 'Ev Tekstili',
    tier: 'consumer',
    category: 'retail',
    inputGoodId: 'upholstery',
    basePrice: 0,
    retailCost: 9.5,
    demandShare: 0.5,
    archetypeWeights: {
      mid_residential: 1.4,
      student: 1.2,
      tech_park: 1.1,
      port: 1.1,
      lux_residential: 0.9,
      tourism: 0.5,
    },
    color: '#9b6fae',
  },

  // ---- Telefon zinciri (Elektronik · 260 ₺ × 0,62 = 161,20) ----
  {
    id: 'silicon',
    name: 'Silikon',
    tier: 'raw',
    category: null,
    inputGoodId: null,
    basePrice: 44,
    retailCost: 0,
    demandShare: 0,
    color: '#8d9aa8',
  },
  {
    id: 'chip',
    name: 'Çip',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'silicon',
    basePrice: 135,
    retailCost: 0,
    demandShare: 0,
    color: '#4f9dd6',
  },
  {
    id: 'phone',
    name: 'Telefon',
    tier: 'consumer',
    category: 'electronics',
    inputGoodId: 'chip',
    basePrice: 0,
    retailCost: 26.2,
    demandShare: 0.5,
    archetypeWeights: {
      tech_park: 1.5,
      tourism: 1.2,
      downtown: 1.2,
      retail_strip: 1.1,
      student: 1.1,
      industrial: 0.6,
    },
    color: '#5bb8e8',
  },
  {
    id: 'sensor',
    name: 'Sensör',
    tier: 'intermediate',
    category: null,
    inputGoodId: 'silicon',
    basePrice: 118,
    retailCost: 0,
    demandShare: 0,
    color: '#6a86a8',
  },
  {
    id: 'home_electronics',
    name: 'Ev Elektroniği',
    tier: 'consumer',
    category: 'electronics',
    inputGoodId: 'sensor',
    basePrice: 0,
    retailCost: 43.2,
    demandShare: 0.5,
    archetypeWeights: {
      lux_residential: 1.4,
      mid_residential: 1.3,
      port: 1.1,
      tech_park: 1.1,
      student: 0.7,
    },
    color: '#4b93b8',
  },

  // ---- Zincirsiz: hizmet (Hizmet · 45 ₺ × 0,30 = 13,50) ----
  /**
   * Hizmet kategorisi bilinçli olarak zincirsizdir: spor salonu, kuaför,
   * ofis hizmeti — fiziksel tedariki olmayan, tedarik krizinden
   * etkilenmeyen bir iş. Oyuna bir güvenli liman koyuyor: marjı sabit,
   * tavanı düşük. "Zincir kurmak zorunlu değil" sözünü içerik düzeyinde
   * de tutan şey bu.
   */
  {
    id: 'service',
    name: 'Hizmet',
    tier: 'consumer',
    category: 'services',
    inputGoodId: null,
    basePrice: 0,
    retailCost: 13.5,
    demandShare: 1,
    color: '#e8c85b',
  },
];

export const GOOD_BY_ID: Record<string, GoodDef> = Object.fromEntries(
  GOODS.map((good) => [good.id, good]),
);

/** Tüketiciye satılan ürünler — pazar payı yarışı bunların üzerinden döner. */
export const CONSUMER_GOODS: GoodDef[] = GOODS.filter((good) => good.tier === 'consumer');

/**
 * Spot pazarda işlem gören ürünler. Tüketici ürünleri buraya girmez:
 * onlar şirketler arasında değil, tüketiciye satılır.
 */
export const TRADED_GOODS: GoodDef[] = GOODS.filter((good) => good.tier !== 'consumer');

/** Kategori → o kategoride satılan tüketici ürünleri. */
export const GOODS_BY_CATEGORY: Record<CategoryId, GoodDef[]> = (() => {
  const out = {} as Record<CategoryId, GoodDef[]>;
  for (const id of Object.keys(CATEGORIES) as CategoryId[]) out[id] = [];
  for (const good of CONSUMER_GOODS) {
    if (good.category) out[good.category].push(good);
  }
  return out;
})();

/** Bir outlet'in raflarına varsayılan olarak konan ürün. */
export function defaultGoodFor(category: CategoryId): string | null {
  return GOODS_BY_CATEGORY[category]?.[0]?.id ?? null;
}

/**
 * Bir ürünün kökten yaprağa zinciri: [hammadde, ara mal, tüketici ürünü].
 * Zincirsiz ürünlerde tek elemanlı döner.
 */
export function chainOf(goodId: string): GoodDef[] {
  const chain: GoodDef[] = [];
  let current: GoodDef | undefined = GOOD_BY_ID[goodId];
  while (current) {
    chain.unshift(current);
    current = current.inputGoodId ? GOOD_BY_ID[current.inputGoodId] : undefined;
  }
  return chain;
}
