import { EVENT_WEATHER, SEASON_WEATHER, WEATHER, WEATHERS, WEATHER_BY_ID } from '@capital/content';
import type { SeasonDef, WeatherDef, WeatherId } from '@capital/content';
import { createRng, nextFloat } from '../rng';
import type { GameState } from '../types';
import { seasonOf } from './living';

/**
 * Hava (Tur 62) — içerik ve gerekçe `@capital/content` weather.ts'te.
 *
 * DURUMSUZ ve yalnız okuyan: tohumdan, günden ve süren olaylardan
 * hesaplanıyor. Kayda alan girmiyor, `state.rng` çekilmiyor, simülasyon
 * havayı okumuyor; lig izi aynı kalıyor.
 */

/** Takvimin dönemi: üç günlük blok, tohuma göre kaydırılmış (bütün şehirlerde aynı gün dönmesin). */
function spellOf(seed: number, day: number): number {
  const shift = (seed >>> 0) % WEATHER.spellDays;
  return Math.floor((Math.max(0, day) + shift) / WEATHER.spellDays);
}

function spellWeather(seed: number, spell: number, season: SeasonDef): WeatherDef {
  const die = createRng(((seed ^ 0x3a7e_57a1) ^ Math.imul(spell + 1, 0x9e3779b1)) >>> 0);
  const weights = SEASON_WEATHER[season.id];
  const total = WEATHERS.reduce((sum, weather) => sum + (weights[weather.id] ?? 0), 0);
  let roll = nextFloat(die) * total;
  for (const weather of WEATHERS) {
    roll -= weights[weather.id] ?? 0;
    if (roll < 0) return weather;
  }
  return WEATHER_BY_ID.clear;
}

/**
 * Takvimin havası: tohumun o günkü dönemi, günün mevsiminin ağırlıklarıyla.
 * Olaylar hesaba katılmıyor; şehrin havası için `cityWeather`.
 */
export function weatherOn(seed: number, day: number): WeatherDef {
  return spellWeather(seed, spellOf(seed, day), seasonOf(day));
}

export interface CityWeather {
  weather: WeatherDef;
  season: SeasonDef;
  /** Yerdeki kar (0..1): kar yağarken 1, bittikten sonra birkaç günde eriyor. */
  snowCover: number;
  /** Havayı bir olay belirliyorsa olayın kimliği. */
  eventId?: string;
}

/** Süren olaylardan havası olanı: önce sert olan (havayı olduğu gibi belirleyen). */
function eventWeather(state: GameState, calendar: WeatherDef): { id: WeatherId; eventId: string } | null {
  let soft: { id: WeatherId; eventId: string } | null = null;
  for (const event of state.activeEvents) {
    const rule = EVENT_WEATHER[event.defId];
    if (!rule) continue;
    if (!rule.soft) return { id: rule.weather, eventId: event.defId };
    if (calendar.id === 'clear') soft ??= { id: rule.weather, eventId: event.defId };
  }
  return soft;
}

/**
 * Şehrin bugünkü havası: takvim, üstüne havası olan olay; yerdeki kar
 * son günlerin takviminden.
 *
 * Kuraklık karı da siliyor: yağmur yağmayan şehirde yerde kar kalmaz.
 */
export function cityWeather(state: GameState): CityWeather {
  const day = state.time.day;
  const seed = state.meta.seed;
  const season = seasonOf(day);
  const calendar = weatherOn(seed, day);
  const event = eventWeather(state, calendar);
  const weather = event ? WEATHER_BY_ID[event.id] : calendar;
  let snowCover = 0;
  if (weather.precipitation === 'snow') {
    snowCover = 1;
  } else if (weather.precipitation === 'none' && event?.id !== 'clear') {
    for (let ago = 1; ago <= WEATHER.snowMeltDays; ago++) {
      if (day - ago < 0) break;
      if (weatherOn(seed, day - ago).precipitation === 'snow') {
        snowCover = 1 - ago / (WEATHER.snowMeltDays + 1);
        break;
      }
    }
  }
  return { weather, season, snowCover, ...(event ? { eventId: event.eventId } : {}) };
}
