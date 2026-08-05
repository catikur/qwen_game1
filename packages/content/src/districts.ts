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
    color: '#33415c',
  },
  retail_strip: {
    id: 'retail_strip',
    name: 'Çarşı',
    population: 3_100,
    incomeLevel: 0.55,
    baseLandValue: 3_200,
    demandWeights: { retail: 1.6, grocery: 1.3, dining: 1.2, services: 1.0 },
    color: '#4a3554',
  },
  industrial: {
    id: 'industrial',
    name: 'Sanayi',
    population: 1_400,
    incomeLevel: 0.38,
    baseLandValue: 1_100,
    demandWeights: { grocery: 1.2, dining: 0.9, retail: 0.4, electronics: 0.3, services: 0.5 },
    color: '#4a4230',
  },
  port: {
    id: 'port',
    name: 'Liman',
    population: 1_100,
    incomeLevel: 0.42,
    baseLandValue: 1_500,
    demandWeights: { grocery: 1.1, dining: 1.0, retail: 0.5, services: 0.6 },
    color: '#24444f',
  },
  tech_park: {
    id: 'tech_park',
    name: 'Teknopark',
    population: 2_300,
    incomeLevel: 0.9,
    baseLandValue: 4_100,
    demandWeights: { electronics: 1.8, dining: 1.3, services: 1.3, grocery: 0.8, retail: 0.9 },
    color: '#1f4a52',
  },
  lux_residential: {
    id: 'lux_residential',
    name: 'Lüks Konut',
    population: 2_600,
    incomeLevel: 0.95,
    baseLandValue: 6_200,
    demandWeights: { retail: 1.7, dining: 1.4, services: 1.5, electronics: 1.2, grocery: 1.0 },
    color: '#3c5148',
  },
  mid_residential: {
    id: 'mid_residential',
    name: 'Orta Gelir Konut',
    population: 5_800,
    incomeLevel: 0.5,
    baseLandValue: 2_400,
    demandWeights: { grocery: 1.5, dining: 1.0, services: 1.1, retail: 0.9, electronics: 0.7 },
    color: '#2f4a3c',
  },
  student: {
    id: 'student',
    name: 'Üniversite',
    population: 4_600,
    incomeLevel: 0.28,
    baseLandValue: 1_900,
    demandWeights: { dining: 1.9, grocery: 1.3, services: 0.9, retail: 0.7, electronics: 0.6 },
    color: '#3d3a5e',
  },
  tourism: {
    id: 'tourism',
    name: 'Turizm',
    population: 1_900,
    incomeLevel: 0.72,
    baseLandValue: 4_600,
    demandWeights: { dining: 1.8, retail: 1.5, services: 1.0, grocery: 0.7 },
    color: '#553a42',
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
