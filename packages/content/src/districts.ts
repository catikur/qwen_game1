import type { DistrictArchetypeDef, DistrictArchetypeId } from './types';

/**
 * District arketipleri.
 *
 * Talep ağırlıkları haritayı bir "oyun alanı" yapan asıl şey: öğrenci
 * bölgesinde yeme-içme patlar ama elektronik satmaz; lüks konutta tam tersi.
 * Oyuncunun okuması gereken sinyal budur.
 */
export const DISTRICT_ARCHETYPES: Record<DistrictArchetypeId, DistrictArchetypeDef> = {
  downtown: {
    id: 'downtown',
    name: 'Merkez',
    population: 4_200,
    incomeLevel: 0.82,
    baseLandValue: 5_400,
    demandWeights: { dining: 1.5, retail: 1.3, electronics: 1.4, services: 1.2, grocery: 0.8 },
    color: '#aab6cc',
  },
  retail_strip: {
    id: 'retail_strip',
    name: 'Çarşı',
    population: 3_100,
    incomeLevel: 0.55,
    baseLandValue: 3_200,
    demandWeights: { retail: 1.6, grocery: 1.3, dining: 1.2, services: 1.0 },
    color: '#c0aecb',
  },
  industrial: {
    id: 'industrial',
    name: 'Sanayi',
    population: 1_400,
    incomeLevel: 0.38,
    baseLandValue: 1_100,
    demandWeights: { grocery: 1.2, dining: 0.9, retail: 0.4, electronics: 0.3, services: 0.5 },
    color: '#c8bfa1',
  },
  port: {
    id: 'port',
    name: 'Liman',
    population: 1_100,
    incomeLevel: 0.42,
    baseLandValue: 1_500,
    demandWeights: { grocery: 1.1, dining: 1.0, retail: 0.5, services: 0.6 },
    color: '#a3c0c9',
  },
  tech_park: {
    id: 'tech_park',
    name: 'Teknopark',
    population: 2_300,
    incomeLevel: 0.9,
    baseLandValue: 4_100,
    demandWeights: { electronics: 1.8, dining: 1.3, services: 1.3, grocery: 0.8, retail: 0.9 },
    color: '#9dc4c6',
  },
  lux_residential: {
    id: 'lux_residential',
    name: 'Lüks Konut',
    population: 2_600,
    incomeLevel: 0.95,
    baseLandValue: 6_200,
    demandWeights: { retail: 1.7, dining: 1.4, services: 1.5, electronics: 1.2, grocery: 1.0 },
    color: '#adc4b8',
  },
  mid_residential: {
    id: 'mid_residential',
    name: 'Orta Gelir Konut',
    population: 5_800,
    incomeLevel: 0.5,
    baseLandValue: 2_400,
    demandWeights: { grocery: 1.5, dining: 1.0, services: 1.1, retail: 0.9, electronics: 0.7 },
    color: '#a8c2ac',
  },
  student: {
    id: 'student',
    name: 'Üniversite',
    population: 4_600,
    incomeLevel: 0.28,
    baseLandValue: 1_900,
    demandWeights: { dining: 1.9, grocery: 1.3, services: 0.9, retail: 0.7, electronics: 0.6 },
    color: '#b3b0d0',
  },
  tourism: {
    id: 'tourism',
    name: 'Turizm',
    population: 1_900,
    incomeLevel: 0.72,
    baseLandValue: 4_600,
    demandWeights: { dining: 1.8, retail: 1.5, services: 1.0, grocery: 0.7 },
    color: '#ccadb2',
  },
};

/**
 * 3x3 district yerleşimi. Şehir mantıklı okunsun diye elle dizildi:
 * liman ve sanayi bir kenarda, merkez ortada, konut alanları çevresinde.
 */
export const DISTRICT_LAYOUT: DistrictArchetypeId[][] = [
  ['port', 'industrial', 'tech_park'],
  ['retail_strip', 'downtown', 'lux_residential'],
  ['student', 'mid_residential', 'tourism'],
];

/**
 * 5×5 yerleşim (Tur 21, "büyük şehir"). Aynı arketip ailesi: çekirdek 3×3
 * standart şehrin dizilişini koruyor, çeper aynı yönlere genişliyor
 * (liman ve sanayi kuzeybatıda, konut ve turizm güneydoğuda). Ölçüm
 * düzeneklerinde (`constraint.ts`, `land-experiment.ts`) kullanılan
 * yerleşimin aynısı.
 */
export const DISTRICT_LAYOUT_LARGE: DistrictArchetypeId[][] = [
  ['port', 'port', 'industrial', 'industrial', 'tech_park'],
  ['port', 'retail_strip', 'industrial', 'tech_park', 'tech_park'],
  ['retail_strip', 'retail_strip', 'downtown', 'lux_residential', 'lux_residential'],
  ['student', 'student', 'mid_residential', 'lux_residential', 'tourism'],
  ['student', 'mid_residential', 'mid_residential', 'tourism', 'tourism'],
];

export type CitySizeId = 'standard' | 'large';

export interface CitySizeDef {
  id: CitySizeId;
  name: string;
  blurb: string;
  layout: DistrictArchetypeId[][];
  /** Zafer eşiğine çarpan: büyük şehirde ekonomi de büyük. */
  victoryScale: number;
  facts: string[];
}

export const CITY_SIZES: CitySizeDef[] = [
  {
    id: 'standard',
    name: 'Standart',
    blurb: 'Dokuz bölge, dört rakip. Oyunun ölçülüp kalibre edildiği şehir.',
    layout: DISTRICT_LAYOUT,
    victoryScale: 1,
    facts: ['3×3 bölge, ~500 parsel', '4 rakip', 'Köşeler sırayla imara açılır'],
  },
  {
    id: 'large',
    name: 'Büyük',
    blurb: 'Yirmi beş bölge, sekiz rakip. Çekirdek kalabalık başlar, dış halka dört dalgada imara açılır.',
    layout: DISTRICT_LAYOUT_LARGE,
    victoryScale: 1.5,
    facts: ['5×5 bölge, ~1.500 parsel', '8 rakip, iki kat hızlı inşaat', 'Dış halkanın 16 bölgesi 130–520. günlerde açılır', 'Zafer eşiği 1,5 katı'],
  },
];

export const DEFAULT_CITY_SIZE: CitySizeId = 'standard';

export function getCitySize(id: CitySizeId | undefined): CitySizeDef {
  return CITY_SIZES.find((size) => size.id === (id ?? DEFAULT_CITY_SIZE)) ?? CITY_SIZES[0]!;
}
