import type { CategoryId, DistrictArchetypeId } from './types';
import { localizeList } from './localize';

/**
 * Şehir projeleri (Tur 37d): belediyenin dev projesine katkı yarışı.
 *
 * Kullanıcı mega projeyi "ihale" biçiminde seçti: belediye bir proje
 * açıyor (metro, stadyum…), oyuncu ve rakipler 90 gün boyunca katkı
 * veriyor; en çok veren projeye adını veriyor ve kalıcı bir ayrıcalık
 * alıyor. Katkı geri dönmüyor (herkes öder, biri kazanır): rakibin ne
 * kadar istediğini tabloda görmek kararın kendisi.
 *
 * Proje kimin olursa olsun bölgeye yarar: bittiğinde bölgedeki ve
 * komşulardaki talep kalıcı olarak artıyor, arsa değerleniyor, nüfus
 * tavanı yükseliyor. Sponsor bunun üstüne bölgedeki mağazalarında
 * çekicilik ve projenin kategorisinde marka alıyor. Yani soru "bu bölgede
 * olacak mıyım" ve "rakibim orada güçlenmeli mi".
 */

export type ProjectId = 'metro' | 'stadium' | 'convention' | 'tech_campus' | 'city_mall' | 'food_hall';

export interface ProjectDef {
  id: ProjectId;
  name: string;
  /** Duyuru haberinin gövdesi. */
  pitch: string;
  /** Bittiğinde haritada duracak yapı (`STRUCTURES`). */
  structureId: string;
  /** Tercih edilen bölge arketipleri — yoksa en kalabalık açık bölge. */
  archetypes: readonly DistrictArchetypeId[];
  /** Bölgedeki kalıcı talep çarpanı. */
  demand: Partial<Record<CategoryId, number>>;
  /** Komşu bölgeler etkinin bu kadarını alıyor. */
  neighborShare: number;
  /** Bittiği gün bölgedeki arsa değeri çarpanı (bir kez). */
  landValue: number;
  /** Bölgenin altyapısına ekleme (nüfus tavanı). */
  infrastructure: number;
  /** Sponsorun marka aldığı kategori. */
  leadCategory: CategoryId;
}

export const PROJECTS: ProjectDef[] = [
  {
    id: 'metro',
    name: 'Metro Hattı',
    pitch: 'Belediye yeni metro hattının istasyonunu açıyor. Katkı veren şirketlerin adı tabloda; en büyük katkı, istasyona adını veriyor.',
    structureId: 'metro_station',
    archetypes: ['downtown', 'mid_residential', 'student'],
    demand: { grocery: 1.06, dining: 1.08, retail: 1.08, electronics: 1.06, services: 1.06 },
    neighborShare: 0.5,
    landValue: 1.15,
    infrastructure: 1,
    leadCategory: 'services',
  },
  {
    id: 'stadium',
    name: 'Şehir Stadyumu',
    pitch: 'Belediye bir stadyum yaptırıyor. Maç günleri çevre kafe ve dükkânları doldurur; en büyük katkı stadyuma adını veriyor.',
    structureId: 'stadium',
    archetypes: ['mid_residential', 'student', 'retail_strip'],
    demand: { dining: 1.16, retail: 1.06, grocery: 1.04 },
    neighborShare: 0.4,
    landValue: 1.1,
    infrastructure: 0,
    leadCategory: 'dining',
  },
  {
    id: 'convention',
    name: 'Kongre Merkezi',
    pitch: 'Fuarlar ve kongreler için bir merkez yapılıyor. İş dünyası gelir; en büyük katkı merkeze adını veriyor.',
    structureId: 'convention_center',
    archetypes: ['downtown', 'tech_park', 'lux_residential'],
    demand: { services: 1.14, dining: 1.08, electronics: 1.04 },
    neighborShare: 0.4,
    landValue: 1.12,
    infrastructure: 0,
    leadCategory: 'services',
  },
  {
    id: 'tech_campus',
    name: 'Teknoloji Kampüsü',
    pitch: 'Üniversite ve şirketler ortak bir kampüs kuruyor. Gençler ve mühendisler gelir; en büyük katkı kampüse adını veriyor.',
    structureId: 'tech_campus',
    archetypes: ['tech_park', 'student'],
    demand: { electronics: 1.16, services: 1.06, dining: 1.04 },
    neighborShare: 0.4,
    landValue: 1.12,
    infrastructure: 1,
    leadCategory: 'electronics',
  },
  {
    id: 'city_mall',
    name: 'Şehir AVM\'si',
    pitch: 'Belediye bölgeye büyük bir alışveriş merkezi kazandırıyor. Hafta sonu bütün şehir oraya akar; en büyük katkı AVM\'ye adını veriyor.',
    structureId: 'city_mall',
    archetypes: ['retail_strip', 'downtown', 'mid_residential'],
    demand: { retail: 1.16, electronics: 1.06, grocery: 1.04 },
    neighborShare: 0.3,
    landValue: 1.1,
    infrastructure: 0,
    leadCategory: 'retail',
  },
  {
    id: 'food_hall',
    name: 'Kapalı Çarşı ve Yemek Pazarı',
    pitch: 'Tarihi çarşı yenilenip yemek pazarıyla birlikte açılıyor. Turist ve mahalleli bir arada; en büyük katkı çarşıya adını veriyor.',
    structureId: 'food_hall',
    archetypes: ['retail_strip', 'student', 'port'],
    demand: { grocery: 1.12, dining: 1.1 },
    neighborShare: 0.4,
    landValue: 1.08,
    infrastructure: 0,
    leadCategory: 'grocery',
  },
];

export const PROJECT_BY_ID: Record<ProjectId, ProjectDef> = Object.fromEntries(
  PROJECTS.map((project) => [project.id, project]),
) as Record<ProjectId, ProjectDef>;

export const PROJECT_TIMING = {
  /** İlk proje: oyuncu birkaç bölgede mağaza açmış olsun. */
  firstDay: [210, 270] as const,
  /** Bir projenin bitişinden sonrakinin açılışına. */
  gapDays: [260, 380] as const,
  /** Katkı penceresi. */
  windowDays: 90,
  /** Pencere kapandıktan sonra inşaat. */
  buildDays: 40,
  /** En küçük katkı. */
  minContribution: 10_000,
  /** Sponsorun bölgedeki mağazalarına kalıcı çekicilik. */
  sponsorAttraction: 1.08,
  /**
   * Sponsorun bölgedeki BÜTÜN binalarında bakım çarpanı (belediye ayrıcalığı).
   * Çekicilik dolu mağazada satışa dönmüyor (ölçüldü: bölgedeki mağazaların
   * çoğu kapasitenin %87–100'ünde); bakım indirimi kapasiteden bağımsız ve
   * bölgede ne kadar bina varsa o kadar değerli.
   */
  sponsorUpkeep: 0.7,
  /** Sponsora projenin kategorisinde marka. */
  sponsorBrand: 0.05,
  /** Diğer katkıcılara, katkı payları oranında en çok bu kadar marka. */
  supporterBrand: 0.02,
};

localizeList(PROJECTS, 'project', ['name', 'pitch']);
