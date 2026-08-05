import type { CategoryId } from './types';

/**
 * CEO profilleri.
 *
 * Avatar seçimi kozmetik değil: her CEO'nun ekonomiye dokunan bir tavrı var.
 * Böylece "kimi seçtim" sorusu ilk günden itibaren oynanışta karşılık buluyor
 * ve oyuncu masaya bir kimlikle oturuyor.
 *
 * Portreler dış dosya değil, parametrelerden çizilen SVG'dir — asset
 * bağımlılığı yok, her CEO tek bakışta ayırt ediliyor.
 */

export interface CeoModifiers {
  /** Başlangıç sermayesi çarpanı. */
  startingCash: number;
  /** Arsa alım fiyatı çarpanı. */
  landCost: number;
  /** İnşaat maliyeti çarpanı. */
  buildCost: number;
  /** Günlük işletme gideri çarpanı. */
  upkeep: number;
  /** Marka gücünün büyüme hızı çarpanı. */
  brandGrowth: number;
  /** Oyunun başındaki marka bilinirliği. */
  startingBrand: number;
  /** Belirli bir sektörde kalite primi (0..1 ölçeğinde ekleme). */
  categoryQuality?: { category: CategoryId; bonus: number };
}

export interface CeoPortrait {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bun' | 'curly' | 'bald' | 'wave' | 'crop';
  clothes: string;
  accent: string;
  glasses: boolean;
  facialHair: boolean;
  background: string;
}

export interface CeoDef {
  id: string;
  name: string;
  title: string;
  bio: string;
  /** Oyuncuya gösterilen tek cümlelik avantaj/dezavantaj özeti. */
  perk: string;
  drawback: string;
  modifiers: CeoModifiers;
  portrait: CeoPortrait;
}

const BASE: CeoModifiers = {
  startingCash: 1,
  landCost: 1,
  buildCost: 1,
  upkeep: 1,
  brandGrowth: 1,
  startingBrand: 0.12,
};

export const CEOS: CeoDef[] = [
  {
    id: 'bakkal_ciragi',
    name: 'Selin Aktaş',
    title: 'Bakkal Çırağı',
    bio: 'Babasının bakkalında büyüdü. Rafın hangi saatte boşaldığını gözüyle bilir.',
    perk: 'Market ve yeme-içme işletmeleri daha kaliteli, inşaat %8 ucuz',
    drawback: 'Marka bilinirliği yavaş oturur',
    modifiers: {
      ...BASE,
      buildCost: 0.92,
      brandGrowth: 0.85,
      categoryQuality: { category: 'grocery', bonus: 0.1 },
    },
    portrait: {
      skin: '#d99b73',
      hair: '#2f2320',
      hairStyle: 'bun',
      clothes: '#3f6f5a',
      accent: '#8fd4b0',
      glasses: false,
      facialHair: false,
      background: '#1c3a30',
    },
  },
  {
    id: 'muteahhit',
    name: 'Kemal Doruk',
    title: 'Müteahhit',
    bio: 'Şehri parsel parsel tanır. Hangi sokağın değerleneceğini herkesten önce sezer.',
    perk: 'Arsa alımları %22 ucuz, kira gelirleri güçlü',
    drawback: 'İşletme giderleri %6 yüksek',
    modifiers: {
      ...BASE,
      landCost: 0.78,
      upkeep: 1.06,
      categoryQuality: { category: 'housing', bonus: 0.12 },
    },
    portrait: {
      skin: '#c98a5e',
      hair: '#4a3b2f',
      hairStyle: 'crop',
      clothes: '#7a5c3a',
      accent: '#e0b070',
      glasses: false,
      facialHair: true,
      background: '#3a2c1e',
    },
  },
  {
    id: 'pazarlamaci',
    name: 'Deniz Yalın',
    title: 'Pazarlamacı',
    bio: 'Ürünü değil hikâyeyi satar. Açılış günü kuyruk oluşturmayı bilir.',
    perk: 'Marka gücü 2 kat hızlı büyür, işe bilinirlikle başlar',
    drawback: 'İnşaat maliyetleri %10 yüksek',
    modifiers: {
      ...BASE,
      brandGrowth: 2.0,
      startingBrand: 0.26,
      buildCost: 1.1,
    },
    portrait: {
      skin: '#e8b48c',
      hair: '#b8452f',
      hairStyle: 'wave',
      clothes: '#5b3f7a',
      accent: '#d9a2f0',
      glasses: true,
      facialHair: false,
      background: '#2e2145',
    },
  },
  {
    id: 'muhendis',
    name: 'Aras Tunç',
    title: 'Operasyon Mühendisi',
    bio: 'Fabrikada vardiya yönetti. Bir kuruşluk israfı üç adım öteden görür.',
    perk: 'İşletme giderleri %14 düşük',
    drawback: 'Başlangıç sermayesi %15 az',
    modifiers: {
      ...BASE,
      upkeep: 0.86,
      startingCash: 0.85,
    },
    portrait: {
      skin: '#b57a52',
      hair: '#1f1b18',
      hairStyle: 'short',
      clothes: '#3a5a78',
      accent: '#7fd4ff',
      glasses: true,
      facialHair: false,
      background: '#1b3040',
    },
  },
  {
    id: 'finansci',
    name: 'Ela Berk',
    title: 'Finansçı',
    bio: 'Yatırım bankasından geldi. Parayı bekletmenin de bir maliyeti olduğunu bilir.',
    perk: 'Başlangıç sermayesi %60 fazla',
    drawback: 'İşletme giderleri %10 yüksek, arsalar %8 pahalı',
    modifiers: {
      ...BASE,
      startingCash: 1.6,
      upkeep: 1.1,
      landCost: 1.08,
    },
    portrait: {
      skin: '#f0c9a8',
      hair: '#d8b25a',
      hairStyle: 'short',
      clothes: '#2c3550',
      accent: '#f0d68a',
      glasses: false,
      facialHair: false,
      background: '#232a3d',
    },
  },
  {
    id: 'mirasci',
    name: 'Batu Rende',
    title: 'İkinci Kuşak',
    bio: 'Aile şirketinin devamı. Kasada para var ama kimse onu ciddiye almıyor.',
    perk: 'Başlangıç sermayesi 2,3 kat',
    drawback: 'Marka gücü çok yavaş büyür, işletme giderleri %8 yüksek',
    modifiers: {
      ...BASE,
      startingCash: 2.3,
      brandGrowth: 0.55,
      upkeep: 1.08,
    },
    portrait: {
      skin: '#e4b189',
      hair: '#6b4a2f',
      hairStyle: 'curly',
      clothes: '#8a3f4a',
      accent: '#f0a0a8',
      glasses: false,
      facialHair: true,
      background: '#3d2028',
    },
  },
];

export const CEO_BY_ID: Record<string, CeoDef> = Object.fromEntries(CEOS.map((c) => [c.id, c]));

export const DEFAULT_CEO_ID = CEOS[0]!.id;

export function getCeoModifiers(ceoId: string | null): CeoModifiers {
  return (ceoId && CEO_BY_ID[ceoId]?.modifiers) || BASE;
}
