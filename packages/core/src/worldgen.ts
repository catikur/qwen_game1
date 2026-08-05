import {
  CATEGORY_LIST,
  CONTENT_VERSION,
  DISTRICT_ARCHETYPES,
  DISTRICT_LAYOUT,
  NPC_PROFILES,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import { createRng, nextRange } from './rng';
import { SCHEMA_VERSION } from './types';
import type { CompanyState, DistrictState, GameState, Tile } from './types';

export const GAME_VERSION = '0.1.0';

export const DISTRICT_COLS = DISTRICT_LAYOUT[0]!.length;
export const DISTRICT_ROWS = DISTRICT_LAYOUT.length;
export const DISTRICT_SIZE = 8;
export const MAP_WIDTH = DISTRICT_COLS * DISTRICT_SIZE;
export const MAP_HEIGHT = DISTRICT_ROWS * DISTRICT_SIZE;

export const PLAYER_COMPANY_ID = 'player';
export const STARTING_CASH = 250_000;

export function zeroByCategory(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const cat of CATEGORY_LIST) out[cat.id] = 0;
  return out;
}

function initialBrand(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  // Yeni şirketin markası yok ama sıfır da değil; bilinirlik 0 olsa hiç
  // müşteri gelmez ve oyuncu ilk mağazasından sonuç alamazdı.
  for (const cat of CATEGORY_LIST) out[cat.id] = 0.12;
  return out;
}

function makeCompany(
  id: string,
  name: string,
  isPlayer: boolean,
  color: string,
  cash: number,
  profileId: string | null,
): CompanyState {
  return {
    id,
    name,
    isPlayer,
    profileId,
    color,
    cash,
    debt: 0,
    brand: initialBrand(),
    netWorth: cash,
    marketShare: zeroByCategory(),
    today: { revenue: 0, cogs: 0, upkeep: 0, wages: 0, interest: 0, profit: 0 },
    netWorthHistory: [cash],
  };
}

export interface NewGameOptions {
  seed?: number;
  companyName?: string;
  npcCount?: number;
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);

  // ---- District'ler ----
  const districts: DistrictState[] = [];
  for (let dy = 0; dy < DISTRICT_ROWS; dy++) {
    for (let dx = 0; dx < DISTRICT_COLS; dx++) {
      const archetypeId = DISTRICT_LAYOUT[dy]![dx]!;
      const archetype = DISTRICT_ARCHETYPES[archetypeId];
      const id = dy * DISTRICT_COLS + dx;

      districts.push({
        id,
        name: archetype.name,
        archetype: archetypeId,
        x0: dx * DISTRICT_SIZE,
        y0: dy * DISTRICT_SIZE,
        x1: dx * DISTRICT_SIZE + DISTRICT_SIZE - 1,
        y1: dy * DISTRICT_SIZE + DISTRICT_SIZE - 1,
        // Nüfusa hafif sapma ver ki her oyun aynı olmasın.
        population: Math.round(archetype.population * nextRange(rng, 0.9, 1.1)),
        incomeLevel: archetype.incomeLevel,
        demand: zeroByCategory(),
        unmet: zeroByCategory(),
        priceIndex: zeroByCategory(),
        outletCount: zeroByCategory(),
      });
    }
  }

  // ---- Arsalar ----
  const tiles: Tile[] = [];
  const centerX = (MAP_WIDTH - 1) / 2;
  const centerY = (MAP_HEIGHT - 1) / 2;
  const maxDistance = centerX + centerY;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const districtId =
        Math.floor(y / DISTRICT_SIZE) * DISTRICT_COLS + Math.floor(x / DISTRICT_SIZE);
      const archetype = DISTRICT_ARCHETYPES[districts[districtId]!.archetype];

      // Arsa değeri: district tabanı + merkeze yakınlık primi + gürültü.
      const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
      const centrality = 1 - distance / maxDistance;
      const landValue =
        archetype.baseLandValue * (0.72 + 0.55 * centrality) * nextRange(rng, 0.88, 1.12);

      tiles.push({
        id: y * MAP_WIDTH + x,
        x,
        y,
        districtId,
        ownerId: null,
        buildingId: null,
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
    STARTING_CASH,
    null,
  );

  const npcCount = Math.min(options.npcCount ?? NPC_PROFILES.length, NPC_PROFILES.length);
  for (let i = 0; i < npcCount; i++) {
    const profile = NPC_PROFILES[i]!;
    companies[profile.id] = makeCompany(
      profile.id,
      profile.name,
      false,
      profile.color,
      profile.startingCash,
      profile.id,
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
    map: { width: MAP_WIDTH, height: MAP_HEIGHT, tiles },
    districts,
    companies,
    playerCompanyId: PLAYER_COMPANY_ID,
    buildings: {},
    activeEvents: [],
    news: [
      {
        id: 1,
        day: 0,
        tone: 'neutral',
        title: 'Şirket kuruldu',
        body: 'Sermayen hazır. Talebin yüksek olduğu bir bölgede arsa al ve ilk mağazanı aç.',
      },
    ],
    nextId: 2,
    flags: {
      npcCompetition: true,
      randomEvents: true,
      manualPricing: false,
      landValueDrift: true,
    },
  };
}
