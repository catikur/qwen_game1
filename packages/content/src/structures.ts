/**
 * Şehir dokusu.
 *
 * Oyuncunun kurmadığı, şehrin zaten orada olan yapıları. Üç işi var:
 *
 *  1. Görsel — boş bir tahta yerine yaşayan bir şehir. Yollar, evler,
 *     apartmanlar, tarlalar, depolar, parklar.
 *  2. Kısıt — gerçek şehirde istediğin yeri satın alamazsın. Boş parsel
 *     azdır; dolu parseli almak istiyorsan mevcut sahibine primli ödeme
 *     yapıp yapıyı yıkman gerekir.
 *  3. Kimlik — bir bölgeye bakınca ne olduğu ANLAŞILMALI. Sanayi
 *     hangarları, konutun beşik çatıları, merkezin kuleleri; bunlar
 *     etiketten önce siluetten okunur.
 *
 * Bu yapılar pazarda rekabet etmez; talebi ve nüfusu district düzeyinde
 * zaten modelliyoruz. Buradaki rolleri şehri şehir yapmak ve araziyi
 * kıtlaştırmak.
 */

export type StructureKind = 'residential' | 'commercial' | 'civic';

/**
 * Kütle formu — bir yapının SİLUETİ.
 *
 * Renk bir bölgeyi ayırt etmeye yetmiyordu: dokuz arketip, dokuz soluk
 * ton ve hepsi aynı kutu. Form, ayrımı geometriye taşıyor; uzaktan
 * bakıldığında bile "burası sanayi" okunuyor.
 */
export type MassForm =
  /** Kule: kademeli gövde, teras, çatı ekipmanı. Merkezin dikey dokusu. */
  | 'tower'
  /** Blok: korniş bantlı orta yükseklik. Apartman, okul, ofis. */
  | 'block'
  /** Ev: alçak, dar, beşik çatılı. Sıra evler ve esnaf dükkânı. */
  | 'house'
  /** Hangar: geniş, alçak, bacalı. Depo ve fabrika. */
  | 'shed'
  /** Tarla: zemine yakın, karık şeritli. Bostan ve çiftlik. */
  | 'field'
  /** Düzlük: yalnızca bir platform. Park ve meydan. */
  | 'flat';

export interface StructureDef {
  id: string;
  name: string;
  kind: StructureKind;
  form: MassForm;
  /** Görsel yükseklik aralığı (tile birimi). */
  minHeight: number;
  maxHeight: number;
  color: string;
  /**
   * Mevcut sahibinden çıkarma primi. Arsa değerinin kaç katına satın
   * alınabilir; `null` ise hiçbir fiyata satılmaz (kamu malı).
   */
  buyoutMultiplier: number | null;
  /**
   * Bölge olgunlaştıkça bu yapının dönüştüğü bir üst kademe.
   *
   * Şehrin zaman içinde geliştiğini gösteren asıl mekanizma bu:
   * tarla → depo → fabrika, sıra ev → apartman → rezidans. Zincirin
   * KÖKÜ aynı zamanda kuruluş günü dokusudur — oyun, şehrin bugününden
   * değil dününden başlıyor.
   */
  upgradesTo?: string;
  description: string;
}

export const STRUCTURES: StructureDef[] = [
  // ---- Konut zinciri: sıra ev → apartman → rezidans ----
  {
    id: 'row_houses',
    name: 'Sıra Evler',
    kind: 'residential',
    form: 'house',
    minHeight: 0.5,
    maxHeight: 0.95,
    color: '#c9b49c',
    buyoutMultiplier: 1.9,
    upgradesTo: 'apartment_block',
    description: 'Eski mahalle dokusu. Sahiplerini ikna etmek en ucuz seçenek.',
  },
  {
    id: 'apartment_block',
    name: 'Apartman Bloğu',
    kind: 'residential',
    form: 'block',
    minHeight: 1.2,
    maxHeight: 2.4,
    color: '#b3bcc6',
    buyoutMultiplier: 2.6,
    upgradesTo: 'tower_block',
    description: 'Çok haneli yapı. Kamulaştırması pahalı, yıkımı gürültülü.',
  },
  {
    id: 'tower_block',
    name: 'Rezidans',
    kind: 'residential',
    form: 'tower',
    minHeight: 2.6,
    maxHeight: 4.4,
    color: '#a4adbc',
    buyoutMultiplier: 3.6,
    description: 'Merkezin dikey dokusu. Bu parseli almak servete mal olur.',
  },

  // ---- Ticaret ----
  {
    id: 'old_shopfront',
    name: 'Esnaf Dükkânı',
    kind: 'commercial',
    form: 'house',
    minHeight: 0.55,
    maxHeight: 0.9,
    color: '#d3bb8c',
    buyoutMultiplier: 2.1,
    upgradesTo: 'apartment_block',
    description: 'Yerleşik esnaf. Devretmeye razı olur ama fiyatını bilir.',
  },

  // ---- Sanayi zinciri: bostan → depo → fabrika ----
  {
    id: 'allotments',
    name: 'Bostan',
    kind: 'commercial',
    form: 'field',
    minHeight: 0.05,
    maxHeight: 0.1,
    color: '#93a565',
    buyoutMultiplier: 1.35,
    upgradesTo: 'warehouse_old',
    description: 'Şehir kıyısının ekili arazisi. Sanayiye dönüşmesi an meselesi.',
  },
  {
    id: 'warehouse_old',
    name: 'Eski Depo',
    kind: 'commercial',
    form: 'shed',
    minHeight: 0.7,
    maxHeight: 1.1,
    color: '#bdb5a9',
    buyoutMultiplier: 1.7,
    upgradesTo: 'factory_shed',
    description: 'Atıl sanayi yapısı. Dönüşüme en açık parseller bunlar.',
  },
  {
    id: 'factory_shed',
    name: 'Fabrika',
    kind: 'commercial',
    form: 'shed',
    minHeight: 1.0,
    maxHeight: 1.8,
    color: '#a89a84',
    buyoutMultiplier: 2.4,
    description: 'Çalışan tesis. Bacası tütüyorsa sahibi kolay bırakmaz.',
  },

  // ---- Kamu: satılmaz, bölgeyi okunur kılar ----
  {
    id: 'park',
    name: 'Park',
    kind: 'civic',
    form: 'flat',
    minHeight: 0.04,
    maxHeight: 0.12,
    color: '#7fa878',
    buyoutMultiplier: null,
    description: 'Belediye parkı. Satılık değil — çevresindeki arsayı değerlendirir.',
  },
  {
    id: 'school',
    name: 'Okul',
    kind: 'civic',
    form: 'block',
    minHeight: 0.6,
    maxHeight: 0.8,
    color: '#d8cda2',
    buyoutMultiplier: null,
    description: 'Kamu binası. Satılık değil — bölgeye aile nüfusu çeker.',
  },
  {
    id: 'plaza',
    name: 'Meydan',
    kind: 'civic',
    form: 'flat',
    minHeight: 0.03,
    maxHeight: 0.06,
    color: '#b0b8c2',
    buyoutMultiplier: null,
    description: 'Kent meydanı. Satılık değil — yaya trafiğini yükseltir.',
  },
];

export const STRUCTURE_BY_ID: Record<string, StructureDef> = Object.fromEntries(
  STRUCTURES.map((s) => [s.id, s]),
);

/**
 * Bir yapının kademe zincirindeki KÖKÜ — yani kuruluş günündeki hâli.
 *
 * Şehir gün 0'da olgun dokusuyla değil, o dokunun atasıyla başlıyor:
 * merkezde rezidans yerine sıra evler, sanayide fabrika yerine bostan.
 * Böylece "şehir seninle birlikte gelişti" cümlesi bir animasyon değil,
 * gerçekten yaşanmış bir tarih oluyor.
 */
export function rootStructureOf(structureId: string): string {
  // Zincir tersine taranıyor: kime yükseliyorsa onun atası bu.
  let current = structureId;
  for (let guard = 0; guard < STRUCTURES.length; guard++) {
    const parent = STRUCTURES.find((s) => s.upgradesTo === current);
    if (!parent) return current;
    current = parent.id;
  }
  return current;
}

/**
 * District arketipine göre doku karışımı.
 *
 * Ağırlıklar bir parsele hangi yapının düşeceğini belirler; `null` = boş
 * parsel. Bu tablo şehrin OLGUN hâlini tarif ediyor — kuruluşta her
 * seçim `rootStructureOf` ile atasına indiriliyor, sonra şehir yıllar
 * içinde bu karışıma doğru büyüyor.
 */
export type FabricWeights = Array<{ structureId: string | null; weight: number }>;

export const DISTRICT_FABRIC: Record<string, FabricWeights> = {
  downtown: [
    { structureId: null, weight: 26 },
    { structureId: 'tower_block', weight: 26 },
    { structureId: 'apartment_block', weight: 22 },
    { structureId: 'old_shopfront', weight: 14 },
    { structureId: 'plaza', weight: 7 },
    { structureId: 'park', weight: 5 },
  ],
  retail_strip: [
    { structureId: null, weight: 32 },
    { structureId: 'old_shopfront', weight: 30 },
    { structureId: 'apartment_block', weight: 20 },
    { structureId: 'row_houses', weight: 12 },
    { structureId: 'plaza', weight: 6 },
  ],
  industrial: [
    { structureId: null, weight: 40 },
    { structureId: 'factory_shed', weight: 22 },
    { structureId: 'warehouse_old', weight: 22 },
    { structureId: 'row_houses', weight: 10 },
    { structureId: 'park', weight: 6 },
  ],
  port: [
    { structureId: null, weight: 42 },
    { structureId: 'warehouse_old', weight: 28 },
    { structureId: 'factory_shed', weight: 14 },
    { structureId: 'row_houses', weight: 10 },
    { structureId: 'plaza', weight: 6 },
  ],
  tech_park: [
    { structureId: null, weight: 36 },
    { structureId: 'apartment_block', weight: 24 },
    { structureId: 'tower_block', weight: 16 },
    { structureId: 'park', weight: 14 },
    { structureId: 'old_shopfront', weight: 10 },
  ],
  lux_residential: [
    { structureId: null, weight: 28 },
    { structureId: 'tower_block', weight: 24 },
    { structureId: 'apartment_block', weight: 26 },
    { structureId: 'park', weight: 14 },
    { structureId: 'school', weight: 8 },
  ],
  mid_residential: [
    { structureId: null, weight: 30 },
    { structureId: 'apartment_block', weight: 30 },
    { structureId: 'row_houses', weight: 24 },
    { structureId: 'school', weight: 9 },
    { structureId: 'park', weight: 7 },
  ],
  student: [
    { structureId: null, weight: 34 },
    { structureId: 'apartment_block', weight: 28 },
    { structureId: 'row_houses', weight: 18 },
    { structureId: 'school', weight: 12 },
    { structureId: 'plaza', weight: 8 },
  ],
  tourism: [
    { structureId: null, weight: 32 },
    { structureId: 'old_shopfront', weight: 26 },
    { structureId: 'row_houses', weight: 20 },
    { structureId: 'plaza', weight: 12 },
    { structureId: 'park', weight: 10 },
  ],
};
