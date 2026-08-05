import type { CategoryId, DistrictArchetypeId } from './types';

/**
 * Ekonomik olaylar.
 *
 * Olaylar oyuncuya modal dayatmaz — piyasayı değiştirir ve haber akışına
 * düşer. Oyuncu isterse tepki verir, istemezse oyun akmaya devam eder.
 * "Casual oynanış" kuralı burada da geçerli: hiçbir olay oyunu durdurmaz.
 */
export interface EventDef {
  id: string;
  title: string;
  body: string;
  /** Kaç gün sürer. */
  durationDays: number;
  /** Görülme ağırlığı (yüksek = daha sık). */
  weight: number;
  tone: 'good' | 'bad' | 'neutral';
  effects: {
    /** Kategori talebine çarpan. */
    demandMultiplier?: Partial<Record<CategoryId, number>>;
    /** Sadece bu arketipteki district'leri etkiler. */
    districtArchetype?: DistrictArchetypeId;
    /** Tüm şirketlerin satış maliyetine çarpan. */
    costMultiplier?: number;
    /** Arsa değerine günlük çarpan. */
    landValueDrift?: number;
  };
}

export const EVENTS: EventDef[] = [
  {
    id: 'consumer_boom',
    title: 'Tüketim Patlaması',
    body: 'Maaş zamları cebe girdi; perakende ve yeme-içme talebi yükseldi.',
    durationDays: 21,
    weight: 10,
    tone: 'good',
    effects: { demandMultiplier: { retail: 1.28, dining: 1.22, electronics: 1.15 } },
  },
  {
    id: 'recession',
    title: 'Durgunluk',
    body: 'Ekonomi soğuyor. Zorunlu olmayan harcamalar kısılıyor.',
    durationDays: 30,
    weight: 8,
    tone: 'bad',
    effects: {
      demandMultiplier: { retail: 0.72, electronics: 0.65, dining: 0.82, services: 0.8 },
      landValueDrift: -0.0015,
    },
  },
  {
    id: 'supply_shock',
    title: 'Tedarik Krizi',
    body: 'Navlun fiyatları fırladı; satılan malın maliyeti arttı.',
    durationDays: 18,
    weight: 8,
    tone: 'bad',
    effects: { costMultiplier: 1.16 },
  },
  {
    id: 'tech_wave',
    title: 'Teknoloji Dalgası',
    body: 'Yeni cihaz kuşağı çıktı; elektronik talebi tavan yaptı.',
    durationDays: 24,
    weight: 7,
    tone: 'good',
    effects: { demandMultiplier: { electronics: 1.55 } },
  },
  {
    id: 'campus_festival',
    title: 'Kampüs Festivali',
    body: 'Üniversite bölgesinde festival haftası; yeme-içme trafiği katlandı.',
    durationDays: 10,
    weight: 9,
    tone: 'good',
    effects: { demandMultiplier: { dining: 1.9, grocery: 1.2 }, districtArchetype: 'student' },
  },
  {
    id: 'tourist_season',
    title: 'Turizm Sezonu',
    body: 'Şehre gelen ziyaretçi sayısı arttı; sahil hattı doldu.',
    durationDays: 28,
    weight: 9,
    tone: 'good',
    effects: { demandMultiplier: { dining: 1.6, retail: 1.45 }, districtArchetype: 'tourism' },
  },
  {
    id: 'zoning_reform',
    title: 'İmar Düzenlemesi',
    body: 'Belediye merkez bölgede yoğunluğu artırdı; arsa değerleri tırmanıyor.',
    durationDays: 40,
    weight: 6,
    tone: 'neutral',
    effects: { landValueDrift: 0.0022 },
  },
  {
    id: 'energy_crunch',
    title: 'Enerji Sıkışması',
    body: 'Elektrik tarifesi zamlandı; işletme maliyetleri yükseldi.',
    durationDays: 20,
    weight: 7,
    tone: 'bad',
    effects: { costMultiplier: 1.1 },
  },
];
