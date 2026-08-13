/**
 * Şehir dokusu.
 *
 * Oyuncunun kurmadığı, şehrin zaten orada olan yapıları. İki işi var:
 *
 *  1. Görsel — boş bir tahta yerine dolu bir şehir. Yollar, apartmanlar,
 *     parklar, okullar; aralarında birkaç boş parsel.
 *  2. Kısıt — gerçek şehirde istediğin yeri satın alamazsın. Boş parsel
 *     azdır; dolu parseli almak istiyorsan mevcut sahibine primli ödeme
 *     yapıp yapıyı yıkman gerekir.
 *
 * Bu yapılar pazarda rekabet etmez; talebi ve nüfusu district düzeyinde
 * zaten modelliyoruz. Buradaki rolleri şehri şehir yapmak ve araziyi
 * kıtlaştırmak.
 */

export type StructureKind = 'residential' | 'commercial' | 'civic';

export interface StructureDef {
  id: string;
  name: string;
  kind: StructureKind;
  /** Görsel yükseklik aralığı (tile birimi). */
  minHeight: number;
  maxHeight: number;
  color: string;
  /**
   * Mevcut sahibinden çıkarma primi. Arsa değerinin kaç katına satın
   * alınabilir; `null` ise hiçbir fiyata satılmaz (kamu malı).
   */
  buyoutMultiplier: number | null;
  description: string;
}

export const STRUCTURES: StructureDef[] = [
  {
    id: 'row_houses',
    name: 'Sıra Evler',
    kind: 'residential',
    minHeight: 0.5,
    maxHeight: 0.95,
    color: '#c6b7a4',
    buyoutMultiplier: 1.9,
    description: 'Eski mahalle dokusu. Sahiplerini ikna etmek en ucuz seçenek.',
  },
  {
    id: 'apartment_block',
    name: 'Apartman Bloğu',
    kind: 'residential',
    minHeight: 1.2,
    maxHeight: 2.4,
    color: '#b3bcc6',
    buyoutMultiplier: 2.6,
    description: 'Çok haneli yapı. Kamulaştırması pahalı, yıkımı gürültülü.',
  },
  {
    id: 'tower_block',
    name: 'Rezidans',
    kind: 'residential',
    minHeight: 2.6,
    maxHeight: 4.4,
    color: '#a4adbc',
    buyoutMultiplier: 3.6,
    description: 'Merkezin dikey dokusu. Bu parseli almak servete mal olur.',
  },
  {
    id: 'old_shopfront',
    name: 'Esnaf Dükkânı',
    kind: 'commercial',
    minHeight: 0.55,
    maxHeight: 0.9,
    color: '#d0bb92',
    buyoutMultiplier: 2.1,
    description: 'Yerleşik esnaf. Devretmeye razı olur ama fiyatını bilir.',
  },
  {
    id: 'warehouse_old',
    name: 'Eski Depo',
    kind: 'commercial',
    minHeight: 0.7,
    maxHeight: 1.1,
    color: '#bdb5a9',
    buyoutMultiplier: 1.7,
    description: 'Atıl sanayi yapısı. Dönüşüme en açık parseller bunlar.',
  },
  {
    id: 'park',
    name: 'Park',
    kind: 'civic',
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
 * District arketipine göre doku karışımı.
 * Ağırlıklar bir parsele hangi yapının düşeceğini belirler; `null` = boş parsel.
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
    { structureId: null, weight: 44 },
    { structureId: 'warehouse_old', weight: 38 },
    { structureId: 'row_houses', weight: 12 },
    { structureId: 'park', weight: 6 },
  ],
  port: [
    { structureId: null, weight: 46 },
    { structureId: 'warehouse_old', weight: 34 },
    { structureId: 'row_houses', weight: 14 },
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
