import {
  CATEGORY_LIST,
  CONTENT_VERSION,
  DISTRICT_ARCHETYPES,
  DISTRICT_FABRIC,
  DISTRICT_LAYOUT,
  GOODS,
  GOOD_BY_ID,
  NPC_PROFILES,
  STRUCTURE_BY_ID,
  getCeoModifiers,
} from '@capital/content';
import type { CategoryId, DistrictArchetypeId } from '@capital/content';
import { createRng, nextRange, pickWeighted } from './rng';
import { seedSpotPrices, zeroByGood } from './systems/supply';
import { estimateBaselineDemand, goodShares, zeroByCategory } from './systems/demand';
import { SCHEMA_VERSION } from './types';
import type { CompanyState, DistrictState, GameState, MarketState, Tile, TileKind } from './types';

export const GAME_VERSION = '0.2.0';

/**
 * Bir bölgenin kenar uzunluğu (kare).
 *
 * Haritanın genişliği burada DEĞİL, `createNewGame`'in aldığı
 * yerleşimden çıkar; çalışma anında tek doğru kaynak `state.map.width`.
 * Eskiden burada duran `MAP_WIDTH`/`MAP_HEIGHT`/`DISTRICT_COLS` sabitleri
 * silindi: yerleşim argüman olduktan sonra artık hiçbir şeyi
 * belirlemiyorlardı, yalnızca belirliyormuş gibi duruyorlardı.
 */
export const DISTRICT_SIZE = 10;

/**
 * Her 5 karede bir sokak; aralarda 4x4'lük yapı adaları kalır.
 *
 * Bu sayı bölge sayısından daha belirleyici. Bir bölge eklemek hem arzı
 * hem talebi büyüttüğü için abonman oranını yerinde bırakır; adayı
 * büyütmek ise nüfusu sabit tutarken parsel üretir. Ölçüm
 * `land-experiment.ts` içinde.
 */
export const BLOCK_SIZE = 5;

export const PLAYER_COMPANY_ID = 'player';
export const STARTING_CASH = 250_000;

export { estimateBaselineDemand, zeroByCategory } from './systems/demand';

function brandRecord(value: number): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const cat of CATEGORY_LIST) out[cat.id] = value;
  return out;
}

function makeCompany(
  id: string,
  name: string,
  isPlayer: boolean,
  color: string,
  cash: number,
  profileId: string | null,
  ceoId: string | null,
  startingBrand: number,
): CompanyState {
  return {
    id,
    name,
    isPlayer,
    profileId,
    ceoId,
    color,
    cash,
    debt: 0,
    brand: brandRecord(startingBrand),
    research: brandRecord(0),
    shares: {},
    netWorth: cash,
    marketShare: zeroByCategory(),
    today: { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, profit: 0 },
    netWorthHistory: [cash],
    supplyRatio: zeroByGood(),
    unitCost: seedSpotPrices(),
  };
}

/**
 * Spot pazarın referans hacmi — fazla üretimin fiyatı ne kadar kırdığını
 * ölçekler.
 *
 * Haritadan türetiliyor, sabit değil: şehir büyürse referans da büyür,
 * yani bir fabrikanın fiyat üzerindeki etkisi harita boyutuna göre
 * kendiliğinden dengelenir.
 */
function referenceVolumes(districts: DistrictState[]): Record<string, number> {
  const reference = zeroByGood();

  for (const good of GOODS) {
    if (good.tier !== 'consumer' || !good.category) continue;

    let cityDemand = 0;
    for (const district of districts) {
      const share =
        goodShares(district.archetype, good.category).find((entry) => entry.good.id === good.id)
          ?.share ?? good.demandShare;
      cityDemand += estimateBaselineDemand(district, good.category) * share;
    }

    // Tüketici ürününün talebi zincirin her kademesine 1:1 iner.
    let current = GOOD_BY_ID[good.inputGoodId ?? ''];
    while (current) {
      reference[current.id] = (reference[current.id] ?? 0) + cityDemand;
      current = GOOD_BY_ID[current.inputGoodId ?? ''];
    }
  }

  return reference;
}

function makeMarket(districts: DistrictState[]): MarketState {
  return {
    spot: seedSpotPrices(),
    produced: zeroByGood(),
    consumed: zeroByGood(),
    reference: referenceVolumes(districts),
  };
}

/** Sokak mı? Şehir ızgarasının değişmez kuralı. */
export function isRoad(x: number, y: number): boolean {
  return x % BLOCK_SIZE === 0 || y % BLOCK_SIZE === 0;
}

export interface NewGameOptions {
  seed?: number;
  companyName?: string;
  ceoId?: string | null;
  npcCount?: number;
  /**
   * Bölge yerleşimi. Varsayılan `DISTRICT_LAYOUT`.
   *
   * Parametre olmasının sebebi ölçüm: "haritayı büyütmek işe yarıyor mu"
   * sorusu ancak farklı yerleşimler yan yana koşulabilirse
   * cevaplanabilir (`land-experiment.ts`, `constraint.ts`). Harita boyutu
   * zaten yerleşimden türetiliyordu; burada sabit yerine argüman oluyor.
   */
  layout?: DistrictArchetypeId[][];
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const ceoId = options.ceoId ?? null;
  const ceo = getCeoModifiers(ceoId);

  const layout = options.layout ?? DISTRICT_LAYOUT;
  const cols = layout[0]!.length;
  const rows = layout.length;
  const mapWidth = cols * DISTRICT_SIZE;
  const mapHeight = rows * DISTRICT_SIZE;

  // ---- District'ler ----
  const districts: DistrictState[] = [];
  for (let dy = 0; dy < rows; dy++) {
    for (let dx = 0; dx < cols; dx++) {
      const archetypeId = layout[dy]![dx]!;
      const archetype = DISTRICT_ARCHETYPES[archetypeId];
      const id = dy * cols + dx;

      districts.push({
        id,
        name: archetype.name,
        archetype: archetypeId,
        x0: dx * DISTRICT_SIZE,
        y0: dy * DISTRICT_SIZE,
        x1: dx * DISTRICT_SIZE + DISTRICT_SIZE - 1,
        y1: dy * DISTRICT_SIZE + DISTRICT_SIZE - 1,
        population: Math.round(archetype.population * nextRange(rng, 0.9, 1.1)),
        incomeLevel: archetype.incomeLevel,
        demand: zeroByCategory(),
        unmet: zeroByCategory(),
        priceIndex: zeroByCategory(),
        outletCount: zeroByCategory(),
      });
    }
  }

  // ---- Parseller ve şehir dokusu ----
  const tiles: Tile[] = [];
  const centerX = (mapWidth - 1) / 2;
  const centerY = (mapHeight - 1) / 2;
  const maxDistance = centerX + centerY;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const districtId = Math.floor(y / DISTRICT_SIZE) * cols + Math.floor(x / DISTRICT_SIZE);
      const district = districts[districtId]!;
      const archetype = DISTRICT_ARCHETYPES[district.archetype];

      const road = isRoad(x, y);
      let kind: TileKind = road ? 'road' : 'plot';
      let structureId: string | null = null;
      let structureHeight = 0;

      if (!road) {
        const fabric = DISTRICT_FABRIC[district.archetype] ?? [{ structureId: null, weight: 1 }];
        const choice = pickWeighted(rng, fabric, (entry) => entry.weight);
        structureId = choice.structureId;

        if (structureId) {
          const def = STRUCTURE_BY_ID[structureId];
          if (def) {
            structureHeight = nextRange(rng, def.minHeight, def.maxHeight);
            // Kamu yapıları hiçbir fiyata satılmaz; parsel değil civic olur.
            if (def.buyoutMultiplier === null) kind = 'civic';
          } else {
            structureId = null;
          }
        }
      }

      // Arsa değeri: district tabanı + merkeze yakınlık primi + gürültü.
      const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
      const centrality = 1 - distance / maxDistance;
      const landValue =
        archetype.baseLandValue * (0.72 + 0.55 * centrality) * nextRange(rng, 0.88, 1.12);

      tiles.push({
        id: y * mapWidth + x,
        x,
        y,
        districtId,
        kind,
        ownerId: null,
        buildingId: null,
        structureId,
        structureHeight,
        landValue: Math.round(landValue),
      });
    }
  }

  // ---- Şirketler ----
  const companies: Record<string, CompanyState> = {};
  companies[PLAYER_COMPANY_ID] = makeCompany(
    PLAYER_COMPANY_ID,
    options.companyName?.trim() || 'Yeni Girişim',
    true,
    '#4cc9f0',
    Math.round(STARTING_CASH * ceo.startingCash),
    null,
    ceoId,
    ceo.startingBrand,
  );

  /*
   * RAKİP SAYISI HARİTAYLA ÖLÇEKLENİYOR.
   *
   * Tur 8'de 5×5 yerleşim denendi ve ertelendi: 2,7 kat büyük şehirde
   * 360. günde boş talep %13'ten %53'e fırlıyordu. Tek değişkenli deney
   * sorunun harita değil İNŞAATÇI SAYISI olduğunu gösterdi — bot
   * temposu artırılınca açık %13'e geri iniyordu.
   *
   * Ölçüt parsel: rakip sayısı haritanın kaç bina alabileceğine bağlı,
   * kaç bölgesi olduğuna değil. Bölge sayısına bağlasaydık bölgeleri
   * küçültüp çoğaltmak sahte bir rakip enflasyonu yaratırdı.
   *
   * 3×3 (504 parsel) → 4 rakip, yani bugünkü denge birebir korunuyor.
   * 5×5 (1377 parsel) → 8, listenin tavanı.
   */
  const plotCapacity = tiles.filter((tile) => tile.kind === 'plot').length;
  const scaledNpcCount = Math.max(4, Math.round(plotCapacity / 126));
  const npcCount = Math.min(
    options.npcCount ?? scaledNpcCount,
    NPC_PROFILES.length,
  );
  for (let i = 0; i < npcCount; i++) {
    const profile = NPC_PROFILES[i]!;
    companies[profile.id] = makeCompany(
      profile.id,
      profile.name,
      false,
      profile.color,
      profile.startingCash,
      profile.id,
      null,
      0.12,
    );
  }

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: CONTENT_VERSION,
      gameVersion: GAME_VERSION,
      seed,
      createdAtIso: new Date().toISOString(),
      playTimeMs: 0,
    },
    time: { day: 0, speed: 1, accumulatorMs: 0 },
    rng,
    map: { width: mapWidth, height: mapHeight, tiles },
    districts,
    companies,
    playerCompanyId: PLAYER_COMPANY_ID,
    buildings: {},
    market: makeMarket(districts),
    activeEvents: [],
    news: [
      {
        id: 1,
        day: 0,
        tone: 'neutral',
        title: 'Şirket kuruldu',
        body: 'Sermayen hazır. Boş bir parsel bul, ya da dolu bir parseli sahibinden devral.',
      },
    ],
    nextId: 2,
    flags: {
      npcCompetition: true,
      randomEvents: true,
      manualPricing: false,
      landValueDrift: true,
      landAuctions: true,
    },
    auction: null,
  };
}
