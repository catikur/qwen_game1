import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEATHER_BY_ID, WEATHERS } from '@capital/content';
import { foliageColor, mixWeather, seasonLook, toneOf, weatherLook } from '../src/season';
import { MAX_RAIN, MAX_SNOW, Precipitation } from '../src/precipitation';

/**
 * Mevsimin ve havanın görünümü (Tur 62). Hesap WebGL'siz: sahne yalnızca
 * bu değerleri uyguluyor.
 */
const GREEN = new THREE.Color('#5e9a4a');

function hsl(color: THREE.Color): { h: number; s: number; l: number } {
  const out = { h: 0, s: 0, l: 0 };
  return color.getHSL(out);
}

describe('mevsimin görünümü', () => {
  test('yazın ağaç kendi yeşilinde; sonbaharda yeşil değil, kışın yaprak döken çıplak', () => {
    const out = new THREE.Color();
    assert.equal(foliageColor(GREEN, 0.5, 'broadleaf', seasonLook('summer', 0), out).getHex(), GREEN.getHex());
    let green = 0;
    for (let i = 0; i < 40; i++) {
      const { h } = hsl(foliageColor(GREEN, i / 40, 'broadleaf', seasonLook('autumn', 0), out));
      if (h > 0.2 && h < 0.45) green++;
    }
    assert.ok(green <= 6, `sonbaharda ${green}/40 ağaç yeşil kaldı`);
    const bare = hsl(foliageColor(GREEN, 0.5, 'broadleaf', seasonLook('winter', 0), out));
    const summer = hsl(GREEN.clone());
    assert.ok(bare.s < summer.s / 2, `kışın yaprak döken soluk (doygunluk ${bare.s.toFixed(2)}, yazın ${summer.s.toFixed(2)})`);
    const pine = hsl(foliageColor(new THREE.Color('#3f6e3c'), 0.5, 'conifer', seasonLook('winter', 0), out));
    assert.ok(pine.h > 0.25 && pine.h < 0.45, 'iğne yapraklı kışın da yeşil');
  });

  test('ilkbaharda birkaç ağaç çiçekli, gerisi taze yeşil; aynı ağaç her yıl aynı renk', () => {
    const out = new THREE.Color();
    const colors = Array.from({ length: 50 }, (_, i) => foliageColor(GREEN, i / 50, 'broadleaf', seasonLook('spring', 0), out).getHex());
    const pink = colors.filter((hex) => hsl(new THREE.Color(hex)).h > 0.85 || hsl(new THREE.Color(hex)).h < 0.05).length;
    assert.ok(pink >= 3 && pink <= 12, `${pink}/50 çiçekli`);
    assert.equal(foliageColor(GREEN, 0.37, 'broadleaf', seasonLook('autumn', 0), out).getHex(),
      foliageColor(GREEN, 0.37, 'broadleaf', seasonLook('autumn', 0), new THREE.Color()).getHex());
    assert.equal(toneOf(GREEN, 3), toneOf(GREEN.clone(), 3));
  });

  test('kar ağaçları beyaza çekiyor; örtü arttıkça açılıyor', () => {
    const out = new THREE.Color();
    const levels = [0, 0.5, 1].map((snow) => hsl(foliageColor(GREEN, 0.5, 'broadleaf', seasonLook('winter', snow), out)).l);
    assert.ok(levels[0]! < levels[1]! && levels[1]! < levels[2]!, levels.join(', '));
    assert.equal(seasonLook('winter', 3).snow, 1, 'örtü 0..1');
  });

  test('açık havada ışık olağan; bulut güneşi kısıyor, sis ufku yaklaştırıyor, yağış payı yalnız kendi türünde', () => {
    const clear = weatherLook(WEATHER_BY_ID.clear);
    assert.deepEqual(clear, { sun: 1, hemisphere: 1, skySaturation: 1, skyLightness: -0, fogDistance: 1, rain: 0, snowfall: 0 });
    const storm = weatherLook(WEATHER_BY_ID.storm);
    assert.ok(storm.sun < 0.6 && storm.rain === 1 && storm.snowfall === 0);
    const snow = weatherLook(WEATHER_BY_ID.snow);
    assert.ok(snow.snowfall > 0 && snow.rain === 0);
    assert.ok(weatherLook(WEATHER_BY_ID.fog).fogDistance < 0.5);
    for (const weather of WEATHERS) {
      const look = weatherLook(weather);
      assert.ok(look.sun > 0.4 && look.sun <= 1, weather.id);
    }
    const mid = mixWeather(clear, storm, 0.5, { ...clear });
    assert.ok(Math.abs(mid.sun - (clear.sun + storm.sun) / 2) < 1e-9);
    assert.deepEqual(mixWeather(clear, storm, 2, { ...clear }), storm);
  });
});

describe('yağış', () => {
  test('pay ve bütçe kadar tane; kapalıyken (azaltılmış hareket, lens, ayar) hiç', () => {
    const fall = new Precipitation();
    const center = { x: 20, z: 20 };
    fall.update(0.016, center, 20, 1, 0, 1, true);
    assert.deepEqual(fall.stats(), { rain: MAX_RAIN, snow: 0 });
    fall.setBudget(0.3);
    fall.update(0.016, center, 20, 0.6, 0.7, 1, true);
    assert.deepEqual(fall.stats(), { rain: Math.round(MAX_RAIN * 0.6 * 0.3), snow: Math.round(MAX_SNOW * 0.7 * 0.3) });
    fall.update(0.016, center, 20, 1, 1, 1, false);
    assert.deepEqual(fall.stats(), { rain: 0, snow: 0 });
    fall.dispose();
  });

  test('taneler düşüyor ve kameranın baktığı kutunun içinde kalıyor', () => {
    const fall = new Precipitation();
    const center = { x: 100, z: -40 };
    fall.update(0.016, center, 15, 0, 1, 1, true);
    const before = fall.heightSum();
    fall.update(0.05, center, 15, 0, 1, 1, true);
    assert.ok(fall.heightSum() < before, 'kar iniyor');
    const positions = ((fall.group.children[1] as THREE.Points).geometry.attributes['position'] as THREE.BufferAttribute);
    for (let i = 0; i < fall.stats().snow; i++) {
      assert.ok(Math.abs(positions.getX(i) - center.x) <= 15 + 1e-6, 'x kutuda');
      assert.ok(Math.abs(positions.getZ(i) - center.z) <= 15 + 1e-6, 'z kutuda');
      assert.ok(positions.getY(i) >= 0 && positions.getY(i) <= 16, 'y yerin üstünde');
    }
    fall.dispose();
  });
});
