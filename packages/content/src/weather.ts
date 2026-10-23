import type { SeasonId } from './living';
import { localizeList } from './localize';

/**
 * Hava (Tur 62): şehrin gökyüzü ve yağışı.
 *
 * Mevsim simülasyonda Tur 37d'den beri var (talebi ay ay kaydırıyor) ama
 * şehirde görünmüyordu: ocakta da ağustosta da aynı yeşil çimen, aynı
 * gökyüzü. Hava, mevsimi şehre taşıyan katman.
 *
 * Hava GÖRÜNÜM, simülasyon değil:
 *   - durumsuz: tohumdan ve günden hesaplanıyor, kayda alan girmiyor,
 *     `state.rng` çekilmiyor; lig izi ve tekrar etkilenmiyor;
 *   - talebe dokunmuyor: mevsimin talep çarpanı zaten var, havanın ayrıca
 *     talep oynatması aynı şeyi iki kez saymak olurdu.
 *
 * Takvim üç günlük dönemlerden oluşuyor (`WEATHER.spellDays`): her dönemin
 * havası mevsimin ağırlıklarıyla seçiliyor; art arda aynı hava gelince
 * dönem uzuyor. Havası olan bir olay sürerken (sahilde fırtına, kuraklık,
 * grip mevsimi) şehrin havası olaydan: oyuncunun haberde okuduğu fırtına
 * şehirde de esiyor.
 */
export type WeatherId = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

export interface WeatherDef {
  id: WeatherId;
  name: string;
  /** Bulut örtüsü (0..1): güneşi kısıyor, göğü griye çekiyor. */
  overcast: number;
  /** Yağış türü. */
  precipitation: 'none' | 'rain' | 'snow';
  /** Yağışın yoğunluğu (0..1): ekrandaki damla ya da tane payı. */
  intensity: number;
  /** Sisin yakınlığı (1 olağan; büyüdükçe ufuk yaklaşıyor). */
  fog: number;
}

export const WEATHERS: WeatherDef[] = [
  { id: 'clear', name: 'Açık', overcast: 0, precipitation: 'none', intensity: 0, fog: 1 },
  { id: 'cloudy', name: 'Bulutlu', overcast: 0.55, precipitation: 'none', intensity: 0, fog: 1.15 },
  { id: 'rain', name: 'Yağmurlu', overcast: 0.75, precipitation: 'rain', intensity: 0.6, fog: 1.3 },
  { id: 'storm', name: 'Fırtınalı', overcast: 0.9, precipitation: 'rain', intensity: 1, fog: 1.5 },
  { id: 'snow', name: 'Karlı', overcast: 0.7, precipitation: 'snow', intensity: 0.7, fog: 1.35 },
  { id: 'fog', name: 'Sisli', overcast: 0.45, precipitation: 'none', intensity: 0, fog: 2.2 },
];

export const WEATHER_BY_ID: Record<WeatherId, WeatherDef> = Object.fromEntries(
  WEATHERS.map((weather) => [weather.id, weather]),
) as Record<WeatherId, WeatherDef>;

/**
 * Mevsimin havası: bir dönemin havası bu ağırlıklarla seçiliyor.
 *
 * Kar yalnız kışta, fırtına en çok yazın (sağanak) ve sonbaharda; sis
 * sonbahar ve kış sabahlarının. Yaz çoğunlukla açık: mevsimin şehirdeki
 * en belirgin farkı ışık olsun.
 */
export const SEASON_WEATHER: Record<SeasonId, Partial<Record<WeatherId, number>>> = {
  winter: { clear: 3, cloudy: 3, snow: 4, fog: 2, rain: 1 },
  spring: { clear: 4, cloudy: 3, rain: 3, fog: 1 },
  summer: { clear: 7, cloudy: 2, storm: 1 },
  autumn: { clear: 3, cloudy: 3, rain: 3, fog: 2, storm: 1 },
};

/**
 * Havası olan olaylar: sürerken şehrin havası olaydan.
 *
 * Grip mevsimi kışın karlı, öbür mevsimlerde bulutlu olmasın diye yalnız
 * "açık" havayı bulutluya çeviriyor (`soft`); fırtına ve kuraklık havayı
 * olduğu gibi belirliyor.
 */
export const EVENT_WEATHER: Record<string, { weather: WeatherId; soft?: boolean }> = {
  coastal_storm: { weather: 'storm' },
  drought: { weather: 'clear' },
  flu_season: { weather: 'cloudy', soft: true },
};

export const WEATHER = {
  /** Bir hava döneminin gün sayısı. */
  spellDays: 3,
  /** Kar yağışı bittikten sonra örtünün eridiği gün sayısı. */
  snowMeltDays: 4,
} as const;

localizeList(WEATHERS, 'weather', ['name']);
