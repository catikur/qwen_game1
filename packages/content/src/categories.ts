import type { CategoryDef, CategoryId } from './types';

/**
 * Sektörler. Rakamlar "gerçekçi ama okunabilir" olacak şekilde seçildi:
 * temel ihtiyaç kategorileri yüksek esneklik + düşük marj, lüks olanlar
 * düşük esneklik + yüksek marj.
 */
export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  grocery: {
    id: 'grocery',
    name: 'Market',
    basePrice: 12,
    costRatio: 0.68,
    elasticity: 1.6,
    demandPerCapita: 0.9,
    incomeSensitivity: 0.25,
    color: '#7bc47f',
  },
  dining: {
    id: 'dining',
    name: 'Yeme-İçme',
    basePrice: 28,
    costRatio: 0.45,
    elasticity: 1.2,
    demandPerCapita: 0.35,
    incomeSensitivity: 0.7,
    color: '#f2a65a',
  },
  retail: {
    id: 'retail',
    name: 'Perakende',
    basePrice: 65,
    costRatio: 0.5,
    elasticity: 1.0,
    demandPerCapita: 0.12,
    incomeSensitivity: 0.9,
    color: '#c98bdb',
  },
  electronics: {
    id: 'electronics',
    name: 'Elektronik',
    basePrice: 260,
    costRatio: 0.62,
    elasticity: 0.8,
    demandPerCapita: 0.03,
    incomeSensitivity: 1.1,
    color: '#5bb8e8',
  },
  services: {
    id: 'services',
    name: 'Hizmet',
    basePrice: 45,
    costRatio: 0.3,
    elasticity: 1.1,
    demandPerCapita: 0.1,
    incomeSensitivity: 0.8,
    color: '#e8c85b',
  },
  // Kira kategorilerinde basePrice = birim başına GÜNLÜK kira.
  housing: {
    id: 'housing',
    name: 'Konut',
    basePrice: 34,
    costRatio: 0.2,
    elasticity: 0.6,
    demandPerCapita: 0.05,
    incomeSensitivity: 1.0,
    color: '#8fa9d8',
  },
  office: {
    id: 'office',
    name: 'Ofis',
    basePrice: 46,
    costRatio: 0.18,
    elasticity: 0.7,
    demandPerCapita: 0.02,
    incomeSensitivity: 1.2,
    color: '#9aa7b8',
  },
};

export const CATEGORY_LIST: CategoryDef[] = Object.values(CATEGORIES);

/** Tüketiciye satılan, pazar payı yarışının geçtiği kategoriler. */
export const CONSUMER_CATEGORIES: CategoryId[] = [
  'grocery',
  'dining',
  'retail',
  'electronics',
  'services',
];
