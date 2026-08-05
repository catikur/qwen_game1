import { EVENTS } from '@capital/content';
import { nextFloat, pickWeighted } from '../rng';
import { pushNews } from '../news';
import type { GameState } from '../types';

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
