import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASON_WEATHER, WEATHER, WEATHERS } from '@capital/content';
import type { WeatherId } from '@capital/content';
import { createNewGame } from '../src/worldgen';
import { cityWeather, weatherOn } from '../src/systems/weather';
import { seasonOf } from '../src/systems/living';
import type { GameState } from '../src/types';

const YEARS = 5;
const DAYS = 365 * YEARS;

function at(state: GameState, day: number): GameState {
  state.time.day = day;
  return state;
}

describe('hava (Tur 62)', () => {
  test('tohumdan ve günden: aynı tohum aynı havayı, başka tohum başka takvimi yaşıyor', () => {
    const first = Array.from({ length: 365 }, (_, day) => weatherOn(7, day).id);
    const again = Array.from({ length: 365 }, (_, day) => weatherOn(7, day).id);
    const other = Array.from({ length: 365 }, (_, day) => weatherOn(8, day).id);
    assert.deepEqual(first, again);
    assert.notDeepEqual(first, other);
  });

  test('kar yalnız kışta, fırtına yalnız yaz ve sonbaharda; her mevsimin her havası çıkıyor', () => {
    const seen: Record<string, Set<WeatherId>> = { winter: new Set(), spring: new Set(), summer: new Set(), autumn: new Set() };
    for (const seed of [1, 7, 42, 101, 202]) {
      for (let day = 0; day < DAYS; day++) seen[seasonOf(day).id]!.add(weatherOn(seed, day).id);
    }
    for (const [season, weathers] of Object.entries(seen)) {
      const allowed = new Set(Object.keys(SEASON_WEATHER[season as keyof typeof SEASON_WEATHER]));
      assert.deepEqual([...weathers].sort(), [...allowed].sort(), season);
    }
    assert.ok(seen.winter!.has('snow') && !seen.summer!.has('snow'));
  });

  test('hava üç günlük dönemlerle değişiyor; yazın çoğunlukla açık', () => {
    const seed = 42;
    const shift = seed % WEATHER.spellDays;
    let summer = 0;
    let summerClear = 0;
    for (let day = 1; day < DAYS; day++) {
      const changed = weatherOn(seed, day).id !== weatherOn(seed, day - 1).id;
      const boundary = (day + shift) % WEATHER.spellDays === 0 || seasonOf(day).id !== seasonOf(day - 1).id;
      if (changed) assert.ok(boundary, `${day}. gün dönem ortasında değişti`);
      if (seasonOf(day).id === 'summer') {
        summer++;
        if (weatherOn(seed, day).id === 'clear') summerClear++;
      }
    }
    assert.ok(summerClear / summer > 0.5, `yazın açık gün payı ${(summerClear / summer).toFixed(2)}`);
  });

  test('şehrin havası durumu değiştirmiyor; takvimle aynı (olay yokken)', () => {
    const state = createNewGame({ seed: 11 });
    state.activeEvents = [];
    const before = JSON.stringify(state);
    for (let day = 0; day < 400; day += 7) {
      const city = cityWeather(at(state, day));
      assert.equal(city.weather.id, weatherOn(11, day).id);
      assert.equal(city.season.id, seasonOf(day).id);
      assert.equal(city.eventId, undefined);
    }
    state.time.day = JSON.parse(before).time.day;
    assert.equal(JSON.stringify(state), before);
  });

  test('havası olan olay şehrin havasını belirliyor; grip yalnız açık havayı bulutluya çeviriyor', () => {
    const state = createNewGame({ seed: 11 });
    const event = (defId: string) => [{ defId, startedDay: 0, remainingDays: 5 }];
    state.activeEvents = event('coastal_storm');
    assert.deepEqual([cityWeather(at(state, 10)).weather.id, cityWeather(state).eventId], ['storm', 'coastal_storm']);

    // Grip: takvim açıksa bulutlu, başka bir havaysa takvimin havası.
    const clearDay = Array.from({ length: DAYS }, (_, day) => day).find((day) => weatherOn(11, day).id === 'clear')!;
    const rainyDay = Array.from({ length: DAYS }, (_, day) => day).find((day) => weatherOn(11, day).id === 'rain')!;
    state.activeEvents = event('flu_season');
    assert.equal(cityWeather(at(state, clearDay)).weather.id, 'cloudy');
    assert.equal(cityWeather(at(state, rainyDay)).weather.id, 'rain');
    assert.equal(cityWeather(state).eventId, undefined, 'havayı grip belirlemedi');

    // Sert olay grip'ten önce geliyor.
    state.activeEvents = [...event('flu_season'), ...event('coastal_storm')];
    assert.equal(cityWeather(at(state, clearDay)).weather.id, 'storm');
  });

  test('kar yağınca yer beyazlıyor, birkaç günde eriyor; kuraklık karı siliyor', () => {
    const seed = 7;
    // Kar döneminin bittiği ve ardından yağışsız günlerin geldiği ilk yer.
    const end = Array.from({ length: DAYS }, (_, day) => day).find(
      (day) =>
        day > 0 &&
        weatherOn(seed, day - 1).id === 'snow' &&
        [0, 1, 2, 3].every((ago) => weatherOn(seed, day + ago).precipitation === 'none'),
    );
    assert.ok(end !== undefined, 'kardan sonra kuru günler bulunmalı');
    const state = createNewGame({ seed });
    state.activeEvents = [];
    assert.equal(cityWeather(at(state, end - 1)).snowCover, 1);
    const melting = [0, 1, 2, 3].map((ago) => cityWeather(at(state, end + ago)).snowCover);
    for (let i = 1; i < melting.length; i++) assert.ok(melting[i]! < melting[i - 1]!, `eriyor: ${melting.join(', ')}`);
    assert.ok(melting[0]! < 1 && melting[0]! > 0);
    const gone = Array.from({ length: 40 }, (_, ago) => end + WEATHER.snowMeltDays + ago).find(
      (day) => [1, 2, 3, 4].every((ago) => weatherOn(seed, day - ago).precipitation !== 'snow') && weatherOn(seed, day).precipitation === 'none',
    )!;
    assert.equal(cityWeather(at(state, gone)).snowCover, 0, 'son kardan beri dört gün geçti');

    state.activeEvents = [{ defId: 'drought', startedDay: 0, remainingDays: 20 }];
    const city = cityWeather(at(state, end));
    assert.deepEqual([city.weather.id, city.snowCover], ['clear', 0]);
  });

  test('her havanın adı ve görünümü tanımlı', () => {
    for (const weather of WEATHERS) {
      assert.ok(weather.name.length > 0);
      assert.ok(weather.overcast >= 0 && weather.overcast <= 1);
      assert.ok(weather.intensity >= 0 && weather.intensity <= 1);
      assert.equal(weather.precipitation === 'none', weather.intensity === 0, weather.id);
    }
  });
});
