import * as THREE from 'three';
import type { SeasonId, WeatherDef } from '@capital/content';

/**
 * Mevsimin ve havanın görünümü (Tur 62).
 *
 * Simülasyon mevsimi talepte yaşıyordu, şehir ise yıl boyu aynı yazdı.
 * Bu modül sahnenin okuduğu SAF görünüm değerlerini veriyor: ağaçların
 * rengi, kırsal çimenin tonu, yerdeki kar, bulutun ışığa ve göğe etkisi.
 * Hesap burada, sahne yalnızca uyguluyor; böylece görünüm WebGL olmadan
 * sınanabiliyor.
 *
 * Renkler sahnenin mevcut yeşilleriyle aynı aileden. Kış yaprak döken
 * ağaçları çıplak gri-kahve, iğne yapraklılar koyulaşıyor; kar her ikisini
 * de beyaza çekiyor. İlkbahar taze yeşil ve az sayıda çiçekli ağaç,
 * sonbahar turuncu-kızıl-sarı.
 */

const AUTUMN = ['#d9822b', '#c4552d', '#e0b03a', '#b8692c', '#9a9a3c'];
const SPRING_FRESH = new THREE.Color('#8cc463');
const BLOSSOM = new THREE.Color('#eaa9c4');
const BARE = new THREE.Color('#8a7a6a');
const SNOW = new THREE.Color('#eef3f7');

/** Ağacın yaprak tipi: iğne yapraklılar kışın da yeşil. */
export type FoliageKind = 'broadleaf' | 'conifer';

export interface SeasonLook {
  season: SeasonId;
  /** Yerdeki kar (0..1). */
  snow: number;
  /** Kırsal çimen dokusunun çarpanı (r, g, b). */
  terrain: [number, number, number];
}

/** Kırsalın mevsim tonu: yaz sıcak, sonbahar sararmış, kış soğuk ve soluk. */
const TERRAIN: Record<SeasonId, [number, number, number]> = {
  spring: [0.98, 1.04, 0.94],
  summer: [1.04, 1.0, 0.86],
  autumn: [1.12, 0.94, 0.68],
  winter: [0.9, 0.94, 1.0],
};

export function seasonLook(season: SeasonId, snow: number): SeasonLook {
  return { season, snow: Math.max(0, Math.min(1, snow)), terrain: TERRAIN[season] };
}

/**
 * Bir ağacın mevsimdeki rengi.
 *
 * `base` ağacın yaz yeşili (sahnenin seçtiği), `tone` ağaca özgü 0..1 bir
 * sayı: aynı ağaç her sonbahar aynı renge dönsün, orman tek renk olmasın.
 */
export function foliageColor(base: THREE.Color, tone: number, kind: FoliageKind, look: SeasonLook, out: THREE.Color): THREE.Color {
  out.copy(base);
  const t = ((tone % 1) + 1) % 1;
  if (kind === 'conifer') {
    if (look.season === 'winter') out.multiplyScalar(0.82);
  } else if (look.season === 'spring') {
    if (t < 0.14) out.lerp(BLOSSOM, 0.85);
    else out.lerp(SPRING_FRESH, 0.35);
  } else if (look.season === 'autumn') {
    if (t < 0.85) out.set(AUTUMN[Math.floor((t / 0.85) * AUTUMN.length) % AUTUMN.length]!);
  } else if (look.season === 'winter') {
    out.copy(BARE).lerp(base, 0.12);
  }
  if (look.snow > 0) out.lerp(SNOW, look.snow * (kind === 'conifer' ? 0.45 : 0.6));
  return out;
}

/** Ağacın kendi rengi bilinmeyen yerler (sokak ağacı) için renkten bir ton. */
export function toneOf(color: THREE.Color, salt = 0): number {
  const x = Math.sin((color.r * 12.9898 + color.g * 78.233 + color.b * 37.719 + salt * 0.618) * 43758.5453);
  return x - Math.floor(x);
}

/** Bulutun ve yağışın sahneye etkisi; `weatherLook` geçişte iki ucun arası. */
export interface WeatherLook {
  /** Güneşin şiddet çarpanı. */
  sun: number;
  /** Gökyüzü ışığının çarpanı (bulut ışığı dağıtır, gölgesiz aydınlık). */
  hemisphere: number;
  /** Gökyüzü doygunluğunun çarpanı (bulutlu gök gri). */
  skySaturation: number;
  /** Gökyüzü açıklığına eklenen (bulutlu gündüz biraz koyu). */
  skyLightness: number;
  /** Sisin uzaklık çarpanı (küçüldükçe ufuk yaklaşıyor). */
  fogDistance: number;
  /** Yağmur ve kar payı (0..1): ekrandaki parçacık bütçesinin ne kadarı. */
  rain: number;
  snowfall: number;
}

export function weatherLook(weather: WeatherDef): WeatherLook {
  const o = weather.overcast;
  return {
    sun: 1 - o * 0.55,
    hemisphere: 1 + o * 0.12,
    skySaturation: 1 - o * 0.7,
    skyLightness: -o * 0.06,
    fogDistance: 1 / weather.fog,
    rain: weather.precipitation === 'rain' ? weather.intensity : 0,
    snowfall: weather.precipitation === 'snow' ? weather.intensity : 0,
  };
}

/** İki görünümün arası (geçiş): `t` 0'da `from`, 1'de `to`. */
export function mixWeather(from: WeatherLook, to: WeatherLook, t: number, out: WeatherLook): WeatherLook {
  const k = Math.max(0, Math.min(1, t));
  for (const key of Object.keys(to) as (keyof WeatherLook)[]) out[key] = from[key] + (to[key] - from[key]) * k;
  return out;
}
