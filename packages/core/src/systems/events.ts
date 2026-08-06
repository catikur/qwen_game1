import { EVENTS } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { nextFloat, pickWeighted } from '../rng';
import { pushNews } from '../news';
import type { GameState } from '../types';

export interface EventModifiers {
  demand: Record<CategoryId, number>;
  /** Sadece belirli arketipe uygulanan çarpanlar. */
  archetypeDemand: Array<{ archetype: string; multipliers: Partial<Record<CategoryId, number>> }>;
  /** Ürün → spot fiyat çarpanı. Zinciri olan oyuncu bundan etkilenmez. */
  goodPrice: Record<string, number>;
  costMultiplier: number;
  landValueDrift: number;
}

/**
 * Aktif olayların birleşik etkisi.
 *
 * Hem pazar hem tedarik adımı bunu okur; olayların nereye dokunduğu tek
 * yerde toplansın diye olay sisteminde durur.
 */
export function collectEventModifiers(state: GameState): EventModifiers {
  const demand = {} as Record<CategoryId, number>;

  const mods: EventModifiers = {
    demand,
    archetypeDemand: [],
    goodPrice: {},
    costMultiplier: 1,
    landValueDrift: 0,
  };

  for (const active of state.activeEvents) {
    const def = EVENTS.find((e) => e.id === active.defId);
    if (!def) continue;

    if (def.effects.costMultiplier) mods.costMultiplier *= def.effects.costMultiplier;
    if (def.effects.landValueDrift) mods.landValueDrift += def.effects.landValueDrift;

    if (def.effects.goodPriceMultiplier) {
      for (const [goodId, mult] of Object.entries(def.effects.goodPriceMultiplier)) {
        mods.goodPrice[goodId] = (mods.goodPrice[goodId] ?? 1) * mult;
      }
    }

    if (def.effects.demandMultiplier) {
      if (def.effects.districtArchetype) {
        mods.archetypeDemand.push({
          archetype: def.effects.districtArchetype,
          multipliers: def.effects.demandMultiplier,
        });
      } else {
        for (const [cat, mult] of Object.entries(def.effects.demandMultiplier)) {
          const key = cat as CategoryId;
          mods.demand[key] = (mods.demand[key] ?? 1) * (mult as number);
        }
      }
    }
  }

  return mods;
}

const MAX_CONCURRENT = 2;
/** Günlük olay tetikleme olasılığı. */
const DAILY_CHANCE = 0.035;
/** İlk olay bu günden önce çıkmaz — oyuncu önce oturmalı. */
const GRACE_DAYS = 12;

export function runEventTick(state: GameState): void {
  // Süresi dolanları kapat.
  for (let i = state.activeEvents.length - 1; i >= 0; i--) {
    const active = state.activeEvents[i]!;
    active.remainingDays -= 1;
    if (active.remainingDays > 0) continue;

    const def = EVENTS.find((e) => e.id === active.defId);
    state.activeEvents.splice(i, 1);
    if (def) pushNews(state, 'neutral', `${def.title} sona erdi`, 'Piyasa normale dönüyor.');
  }

  if (!state.flags.randomEvents) return;
  if (state.time.day < GRACE_DAYS) return;
  if (state.activeEvents.length >= MAX_CONCURRENT) return;
  if (nextFloat(state.rng) > DAILY_CHANCE) return;

  const available = EVENTS.filter((e) => !state.activeEvents.some((a) => a.defId === e.id));
  if (available.length === 0) return;

  const def = pickWeighted(state.rng, available, (e) => e.weight);
  state.activeEvents.push({
    defId: def.id,
    startedDay: state.time.day,
    remainingDays: def.durationDays,
  });
  pushNews(state, def.tone, def.title, def.body);
}
