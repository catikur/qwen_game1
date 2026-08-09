/**
 * TUR 8 · ÖLÇÜM — "haritayı büyütmek" abonman oranını düşürüyor mu?
 *
 * DURUM.md §4.5 sıradaki iş olarak "haritayı büyütmek" diyor. Gerekçesi
 * §4.1'deki abonman oranı: şehrin doyması için gereken parsel sayısı
 * haritadaki parselin ~%100'ü. Ama "harita büyüsün" tavsiyesi HİÇ
 * SINANMADI — Tur 7'nin dersi tam olarak buydu.
 *
 * Burada sınanıyor. Önce analitik model gerçek üretece karşı doğrulanıyor
 * (bugünkü geometri için aynı sayıyı vermeli), sonra varyantlar aynı
 * modelden geçiriliyor.
 */
declare const process: { exit(code: number): never };

import {
  BUILDINGS,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  DISTRICT_ARCHETYPES,
  DISTRICT_FABRIC,
  DISTRICT_LAYOUT,
  STRUCTURE_BY_ID,
} from '@capital/content';
import type { CategoryId, DistrictArchetypeId } from '@capital/content';
import { createNewGame, DISTRICT_SIZE, BLOCK_SIZE } from '../src/index';

/** Nüfus tavanı: bölge nüfusu zamanla arketip tabanının 2,6 katına çıkar. */
const CEILING = 2.6;

// ---------------------------------------------------------------- ölçüm

/** Bir arketip parselinin kamu yapısı (satılamaz) olma olasılığı. */
function civicShare(archetype: DistrictArchetypeId): number {
  const fabric = DISTRICT_FABRIC[archetype] ?? [];
  let total = 0;
  let civic = 0;
  for (const entry of fabric) {
    total += entry.weight;
    if (!entry.structureId) continue;
    const def = STRUCTURE_BY_ID[entry.structureId];
    if (def && def.buyoutMultiplier === null) civic += entry.weight;
  }
  return total > 0 ? civic / total : 0;
}

/** Yol dışı kare sayısı: S boyutlu bir bölgede B aralıklı ızgara. */
function nonRoadTiles(districtSize: number, blockSize: number): number {
  let columns = 0;
  for (let i = 0; i < districtSize; i++) if (i % blockSize !== 0) columns++;
  return columns * columns;
}

/** Bir arketip bölgenin ortalama parsel sayısı. */
function plotsPerDistrict(
  archetype: DistrictArchetypeId,
  districtSize: number,
  blockSize: number,
): number {
  return nonRoadTiles(districtSize, blockSize) * (1 - civicShare(archetype));
}

/** Tavan nüfusundaki kategori talebi. */
function ceilingDemand(archetype: DistrictArchetypeId, categoryId: CategoryId): number {
  const arch = DISTRICT_ARCHETYPES[archetype];
  const category = CATEGORIES[categoryId];
  const weight = arch.demandWeights[categoryId] ?? 1;
  const incomeFactor = 1 + (arch.incomeLevel - 0.5) * 2 * category.incomeSensitivity * 0.5;
  return arch.population * CEILING * category.demandPerCapita * weight * Math.max(0.2, incomeFactor);
}

const BEST_CAPACITY: Record<string, number> = {};
for (const categoryId of CONSUMER_CATEGORIES) {
  const options = BUILDINGS.filter((b) => b.role === 'outlet' && b.category === categoryId);
  if (options.length) BEST_CAPACITY[categoryId] = Math.max(...options.map((o) => o.capacity));
}

interface Geometry {
  label: string;
  layout: DistrictArchetypeId[][];
  districtSize: number;
  blockSize: number;
  populationScale?: number;
}

interface Measured {
  districts: number;
  mapSide: string;
  plots: number;
  needed: number;
  subscription: number;
  spare: number;
}

function measure(geo: Geometry): Measured {
  const flat = geo.layout.flat();
  const scale = geo.populationScale ?? 1;

  let plots = 0;
  for (const archetype of flat) {
    plots += plotsPerDistrict(archetype, geo.districtSize, geo.blockSize);
  }

  let needed = 0;
  for (const categoryId of CONSUMER_CATEGORIES) {
    let demand = 0;
    for (const archetype of flat) demand += ceilingDemand(archetype, categoryId) * scale;
    const capacity = BEST_CAPACITY[categoryId];
    if (capacity) needed += Math.ceil(demand / capacity);
  }

  return {
    districts: flat.length,
    mapSide: `${geo.layout[0]!.length * geo.districtSize} × ${geo.layout.length * geo.districtSize}`,
    plots: Math.round(plots),
    needed,
    subscription: needed / plots,
    spare: Math.round(plots) - needed,
  };
}

// ------------------------------------------------ modelin doğrulanması

const real = createNewGame({ seed: 20_260_809, npcCount: 4 });
const realPlots = real.map.tiles.filter((t) => t.kind === 'plot').length;

const today: Geometry = {
  label: 'bugün · 3×3',
  layout: DISTRICT_LAYOUT,
  districtSize: DISTRICT_SIZE,
  blockSize: BLOCK_SIZE,
};
const modelled = measure(today);

console.log('=== MODELİN DOĞRULANMASI ===\n');
console.log(`gerçek üreteç : ${realPlots} parsel`);
console.log(`analitik model: ${modelled.plots} parsel`);
const drift = Math.abs(realPlots - modelled.plots) / realPlots;
console.log(`sapma         : %${(drift * 100).toFixed(1)}`);
if (drift > 0.05) {
  console.log('\nMODEL GÜVENİLİR DEĞİL — varyant sayıları okunmamalı.');
  process.exit(1);
}
console.log('\nModel gerçek üreteci %5 içinde tutturuyor; varyantlar okunabilir.\n');

// ----------------------------------------------------------- varyantlar

const A: DistrictArchetypeId[][] = DISTRICT_LAYOUT;

/** Aynı arketip ailesinden 5×5 — "haritayı büyüt" tavsiyesinin harfi harfine hali. */
const B: DistrictArchetypeId[][] = [
  ['port', 'port', 'industrial', 'industrial', 'tech_park'],
  ['port', 'retail_strip', 'industrial', 'tech_park', 'tech_park'],
  ['retail_strip', 'retail_strip', 'downtown', 'lux_residential', 'lux_residential'],
  ['student', 'student', 'mid_residential', 'lux_residential', 'tourism'],
  ['student', 'mid_residential', 'mid_residential', 'tourism', 'tourism'],
];

const VARIANTS: Geometry[] = [
  today,
  { label: 'A · 5×5 bölge', layout: B, districtSize: DISTRICT_SIZE, blockSize: BLOCK_SIZE },
  { label: 'B · bölge 8→12', layout: A, districtSize: 12, blockSize: BLOCK_SIZE },
  { label: 'C · ada 4→5', layout: A, districtSize: 10, blockSize: 5 },
  { label: 'D · ada 4→6', layout: A, districtSize: 12, blockSize: 6 },
  { label: 'E · 5×5 + ada 4→6', layout: B, districtSize: 12, blockSize: 6 },
  { label: 'F · nüfus ×0,6', layout: A, districtSize: DISTRICT_SIZE, blockSize: BLOCK_SIZE, populationScale: 0.6 },
];

console.log('=== ABONMAN ORANI ===\n');
console.log(
  'varyant'.padEnd(20),
  'harita'.padStart(9),
  'bölge'.padStart(6),
  'parsel'.padStart(7),
  'gereken'.padStart(8),
  'abonman'.padStart(8),
  'artan'.padStart(7),
);
for (const geo of VARIANTS) {
  const m = measure(geo);
  console.log(
    geo.label.padEnd(20),
    m.mapSide.padStart(9),
    String(m.districts).padStart(6),
    String(m.plots).padStart(7),
    String(m.needed).padStart(8),
    `%${Math.round(m.subscription * 100)}`.padStart(8),
    String(m.spare).padStart(7),
  );
}

console.log('\n=== BÖLGE BAŞINA ARKETİP DENGESİ ===\n');
console.log(
  'arketip'.padEnd(18),
  'nüfus'.padStart(7),
  'parsel'.padStart(7),
  'gereken'.padStart(8),
  'abonman'.padStart(8),
);
const byArchetype = Object.keys(DISTRICT_ARCHETYPES) as DistrictArchetypeId[];
for (const archetype of byArchetype) {
  const plots = plotsPerDistrict(archetype, DISTRICT_SIZE, BLOCK_SIZE);
  let needed = 0;
  for (const categoryId of CONSUMER_CATEGORIES) {
    const capacity = BEST_CAPACITY[categoryId];
    if (capacity) needed += ceilingDemand(archetype, categoryId) / capacity;
  }
  console.log(
    DISTRICT_ARCHETYPES[archetype].name.padEnd(18),
    String(DISTRICT_ARCHETYPES[archetype].population).padStart(7),
    plots.toFixed(1).padStart(7),
    needed.toFixed(1).padStart(8),
    `%${Math.round((needed / plots) * 100)}`.padStart(8),
  );
}
