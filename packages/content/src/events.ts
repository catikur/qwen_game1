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
    /**
     * Belirli ürünlerin spot fiyatına çarpan.
     *
     * Tedarik krizinin oyundaki karşılığı bu: zinciri kuran oyuncu kendi
     * maliyetiyle üretmeye devam eder, pazardan alan ise zamma yakalanır.
     */
    goodPriceMultiplier?: Record<string, number>;
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

  // ---- Tedarik zinciri olayları ----
  // Bunlar kendi üretimi olan oyuncuyu vurmaz; pazardan alanı vurur.
  {
    id: 'coffee_blight',
    title: 'Kahve Rekoltesi Kötü',
    body: 'Hasat yarıya düştü; çekirdek fiyatı uçtu. Kendi bahçesi olan gülüyor.',
    durationDays: 30,
    weight: 8,
    tone: 'bad',
    effects: { goodPriceMultiplier: { coffee_bean: 1.55, roasted_coffee: 1.3 } },
  },
  {
    id: 'cotton_glut',
    title: 'Pamukta Bereket',
    body: 'Rekor hasat pazarı doldurdu; pamuk ve kumaş ucuzladı.',
    durationDays: 26,
    weight: 7,
    tone: 'good',
    effects: { goodPriceMultiplier: { cotton: 0.72, fabric: 0.85 } },
  },
  {
    id: 'chip_shortage',
    title: 'Çip Krizi',
    body: 'Küresel arz tıkandı. Kendi fabrikası olmayan elektronikçi zor günler geçirecek.',
    durationDays: 35,
    weight: 6,
    tone: 'bad',
    effects: { goodPriceMultiplier: { silicon: 1.35, chip: 1.6 } },
  },
];
