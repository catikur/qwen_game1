import type { CitySizeId } from './districts';
import { DISTRICT_LAYOUT, DISTRICT_LAYOUT_LARGE } from './districts';
import type { DistrictArchetypeId } from './types';
import { localizeList } from './localize';

/**
 * Şehrin kimliği (Tur 76): liman, sanayi ve başkent.
 *
 * Holding üç şehre kadar çıkıyordu ama şehirler aynı kalıptandı: aynı
 * dokuz bölge, aynı fiyatlar, aynı dört rakip. Artık her şehrin bir türü
 * var. Tür dört şeyi değiştiriyor:
 *
 * - BÖLGE DİZİLİŞİ. Çiftlik, tesis ve santral yalnız sanayi ve liman
 *   bölgesine kuruluyor (`buildings.ts`, `zones`). Dengeli şehirde dokuz
 *   bölgenin ikisi üretim arazisi; liman ve sanayi kentinde üçü, başkentte
 *   biri. Talep karışımı da dizilişten: başkentin merkezi ve lüks konutu
 *   elektronik ve hizmet ister, sanayi kentinin işçi mahalleleri market.
 * - HAMMADDE. Pazarın referans fiyatı türe göre: limana kahve ve pamuk
 *   gemiyle ucuz geliyor, sanayi kentinde silikon ve deri bol, başkent her
 *   hammaddeyi dışarıdan alıyor. Zincir kurmayan oyuncu için tüketici
 *   ürününün maliyeti değişmiyor (ara malın fiyatı aynı); fark tesisin
 *   girdisinde ve çiftliğin sattığında.
 * - RAKİPLER. Kadronun ilk dördü türden: limanın tüccarları pragmatik ve
 *   vefalı, sanayinin eski aileleri kindar ve gururlu, başkentin seçkinleri
 *   lüks mağazacı ve emlakçı. Firuze Grup (lüks, fiyatı ×1,35) hiçbir türün
 *   ilk dördünde değil: ölçümde sanayi kentinde ve başkentte 720. günde
 *   oyuncuyu geçiyor, zaferi kilitliyordu (dengeli şehirde de ilk dörtte yok).
 * - KURAL. Her türün bir kuralı: limanda nakliye, sanayide üretimin
 *   bakımı ve sendika, başkentte arsa ve gelir.
 *
 * DENGELİ bugünkü şehrin kendisi: eski kayıtların şehirleri, Tohum Ligi ve
 * senaryolar dengeli. Bütün çarpanları 1; dengeli şehir Tur 75'teki şehirle
 * birebir aynı (lig izi değişmiyor).
 */
export type CityTypeId = 'balanced' | 'port' | 'industrial' | 'capital';

/** Türün kuralı: sistemlerin okuduğu sayılar. Yoksa dengeli şehirdeki değer. */
export interface CityTypeRule {
  /** Taşıma sözleşmesinde ücretin terminale düşen payı (dengeli %60). */
  freightShare?: number;
  /** Bina başına inşaat maliyeti çarpanı. */
  buildCost?: Readonly<Partial<Record<string, number>>>;
  /** Çiftlik ve tesislerin (`extract`, `process`) bakımına çarpan. */
  productionUpkeep?: number;
  /** Sendikanın baskı artış hızına çarpan. */
  unionPressure?: number;
  /** Arsa değerine çarpan: kuruluşta ve sürüklenmenin hedefinde. */
  landValue?: number;
  /** Bölgelerin gelir düzeyine eklenen (kuruluşta, 0..1 içinde kalır). */
  income?: number;
}

export interface CityTypeDef {
  id: CityTypeId;
  name: string;
  blurb: string;
  facts: string[];
  /** Bölge dizilişi, şehrin boyutuna göre. */
  layouts: Readonly<Record<CitySizeId, DistrictArchetypeId[][]>>;
  /** Hammaddenin referans fiyatına çarpan: 1'in altı bol, üstü kıt. */
  goods: Readonly<Partial<Record<string, number>>>;
  /** Rakip kadrosunun başı (profil kimlikleri); kalanı katalog sırasıyla. */
  rivals: readonly string[];
  /** Zafer eşiğine çarpan (boyutunkinin üstüne). */
  victoryScale: number;
  rule: CityTypeRule;
  /** Rozetin rengi. */
  color: string;
}

export const CITY_TYPES: CityTypeDef[] = [
  {
    id: 'balanced',
    name: 'Dengeli',
    blurb: 'Her iş koluna biraz yer. Oyunun ölçülüp kalibre edildiği şehir.',
    facts: ['Bir liman, bir sanayi bölgesi', 'Hammadde fiyatları referansta', 'Rakipler karışık'],
    layouts: { standard: DISTRICT_LAYOUT, large: DISTRICT_LAYOUT_LARGE },
    goods: {},
    rivals: [],
    victoryScale: 1,
    rule: {},
    color: '#9fb3c8',
  },
  {
    id: 'port',
    name: 'Liman kenti',
    blurb: 'Şehir denizden yaşıyor. Kahve ve pamuk gemiyle ucuz geliyor, tarla az. Nakliye burada büyük iş.',
    facts: [
      'İki liman, bir sanayi bölgesi',
      'Kahve çekirdeği %20, pamuk %15 ucuz; buğday ve sebze %10 pahalı',
      'Nakliye terminali ve depo %25 ucuz; taşıma ücretinin %70’i senin',
      'Rakipler pragmatik ve vefalı tüccarlar',
    ],
    layouts: {
      standard: [
        ['port', 'port', 'tourism'],
        ['industrial', 'downtown', 'retail_strip'],
        ['student', 'mid_residential', 'lux_residential'],
      ],
      large: [
        ['port', 'port', 'port', 'tourism', 'tourism'],
        ['port', 'port', 'industrial', 'retail_strip', 'tourism'],
        ['industrial', 'retail_strip', 'downtown', 'lux_residential', 'lux_residential'],
        ['student', 'student', 'mid_residential', 'mid_residential', 'tech_park'],
        ['student', 'mid_residential', 'mid_residential', 'retail_strip', 'tech_park'],
      ],
    },
    goods: { coffee_bean: 0.8, cotton: 0.85, wheat: 1.1, vegetable: 1.1 },
    rivals: ['meridyen', 'anadolu_gida', 'veri_sanayi', 'atlas_yapi'],
    victoryScale: 1,
    rule: { freightShare: 0.7, buildCost: { freight_terminal: 0.75, warehouse: 0.75 } },
    color: '#5fa8c9',
  },
  {
    id: 'industrial',
    name: 'Sanayi kenti',
    blurb: 'Fabrika bacalarının şehri. Hammadde bol, tesisin bakımı ucuz; ama işçinin cebi dar, sendika güçlü.',
    facts: [
      'İki sanayi bölgesi, bir liman; işçi mahalleleri',
      'Silikon ve ham deri %20, buğday %10 ucuz; kahve çekirdeği %15 pahalı',
      'Çiftlik ve tesislerin bakımı %20 az; sendika daha hızlı örgütleniyor',
      'Gelir düşük',
      'Rakipler eski sanayi aileleri, ikisi kindar, biri gururlu; bir de kooperatif',
    ],
    layouts: {
      // İki sanayi bölgesi köşede değil: kuruluşta ikisi de açık.
      standard: [
        ['port', 'industrial', 'mid_residential'],
        ['industrial', 'downtown', 'retail_strip'],
        ['student', 'mid_residential', 'tech_park'],
      ],
      large: [
        ['industrial', 'industrial', 'industrial', 'port', 'port'],
        ['industrial', 'industrial', 'industrial', 'retail_strip', 'port'],
        ['mid_residential', 'mid_residential', 'downtown', 'retail_strip', 'tech_park'],
        ['student', 'mid_residential', 'mid_residential', 'student', 'tech_park'],
        ['student', 'retail_strip', 'mid_residential', 'tourism', 'lux_residential'],
      ],
    },
    goods: { silicon: 0.8, hide: 0.8, wheat: 0.9, coffee_bean: 1.15 },
    rivals: ['kilit_market', 'kule_gayrimenkul', 'nova_holding', 'anadolu_gida'],
    victoryScale: 1,
    rule: { productionUpkeep: 0.8, unionPressure: 1.3, income: -0.05 },
    color: '#c99a5f',
  },
  {
    id: 'capital',
    name: 'Başkent',
    blurb: 'Bakanlıklar, elçilikler, pahalı mahalleler. Halkın geliri yüksek, arsa pahalı. Fabrikaya tek bir sanayi bölgesi kalıyor; hammadde dışarıdan.',
    facts: [
      'İki merkez, iki lüks konut; tek sanayi bölgesi, liman yok',
      'Gelir yüksek, arsa %25 pahalı',
      'Hammaddelerin hepsi %10 pahalı',
      'Rakipler şehrin seçkinleri: lüks mağazacı, iki emlakçı, bir holding',
    ],
    layouts: {
      standard: [
        ['tech_park', 'industrial', 'lux_residential'],
        ['retail_strip', 'downtown', 'downtown'],
        ['student', 'lux_residential', 'mid_residential'],
      ],
      large: [
        ['tech_park', 'tech_park', 'industrial', 'lux_residential', 'lux_residential'],
        ['tech_park', 'downtown', 'industrial', 'lux_residential', 'tourism'],
        ['retail_strip', 'downtown', 'downtown', 'downtown', 'tourism'],
        ['student', 'retail_strip', 'mid_residential', 'lux_residential', 'mid_residential'],
        ['student', 'student', 'mid_residential', 'mid_residential', 'retail_strip'],
      ],
    },
    goods: { wheat: 1.1, coffee_bean: 1.1, vegetable: 1.1, cotton: 1.1, hide: 1.1, silicon: 1.1 },
    rivals: ['meridyen', 'kule_gayrimenkul', 'atlas_yapi', 'nova_holding'],
    victoryScale: 1,
    rule: { landValue: 1.25, income: 0.06 },
    color: '#b48ad6',
  },
];

export const DEFAULT_CITY_TYPE: CityTypeId = 'balanced';

export const CITY_TYPE_IDS: readonly CityTypeId[] = CITY_TYPES.map((type) => type.id);

export function getCityType(id: CityTypeId | undefined): CityTypeDef {
  return CITY_TYPES.find((type) => type.id === (id ?? DEFAULT_CITY_TYPE)) ?? CITY_TYPES[0]!;
}

export function isCityTypeId(value: unknown): value is CityTypeId {
  return typeof value === 'string' && (CITY_TYPE_IDS as readonly string[]).includes(value);
}

localizeList(CITY_TYPES, 'cityType', ['name', 'blurb', 'facts']);
