import type { ReactElement } from 'react';
import { EVENT_BY_ID } from '@capital/content';
import type { WeatherId } from '@capital/content';
import { cityWeather } from '@capital/core';
import type { GameState } from '@capital/core';
import { t } from './i18n';

/**
 * Üst barda mevsim ve hava (Tur 62), tarihin yanında.
 *
 * Mevsim talebi Tur 37d'den beri kaydırıyordu ama yalnız Rekabet panelinin
 * nabzında yazıyordu. Şehir artık mevsimi ve havayı gösteriyor; adı da
 * burada: "Kış · Karlı". Havayı bir olay belirliyorsa (sahilde fırtına)
 * ipucu olayı da söylüyor. Dar ekranda yalnız ikon kalıyor; ad ipucunda
 * ve ekran okuyucuda.
 */
export function WeatherChip({ state }: { state: GameState }): ReactElement {
  const { weather, season, snowCover, eventId } = cityWeather(state);
  const label = t('hud.topbar.weather', { season: season.name, weather: weather.name });
  const event = eventId ? EVENT_BY_ID[eventId] : undefined;
  const title = event ? t('hud.topbar.weatherEvent', { label, event: event.title }) : label;
  return (
    <span
      className="brand-weather"
      data-weather={weather.id}
      data-season={season.id}
      data-snow={snowCover > 0 ? 'yes' : 'no'}
      data-weather-event={eventId ?? undefined}
      title={title}
    >
      <WeatherIcon id={weather.id} />
      <span className="brand-weather-label">{label}</span>
    </span>
  );
}

/** Havanın ikonu: metrik ikonlarıyla aynı çizgi dili. */
function WeatherIcon({ id }: { id: WeatherId }): ReactElement {
  const cloud = <path d="M7 17h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 3.75 3.75 0 0 0 7 17Z" />;
  const paths: Record<WeatherId, ReactElement> = {
    clear: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </>
    ),
    cloudy: cloud,
    rain: (
      <>
        <path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 3.75 3.75 0 0 0 7 14Z" />
        <path d="M8 17.5l-1 2.5M12 17.5l-1 2.5M16 17.5l-1 2.5" />
      </>
    ),
    storm: (
      <>
        <path d="M7 14h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6.6 3.75 3.75 0 0 0 7 14Z" />
        <path d="M12.5 14.5 10 18.5h3.5L11 22" />
      </>
    ),
    snow: (
      <>
        <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
        <path d="M10 4.5 12 6l2-1.5M10 19.5 12 18l2 1.5" />
      </>
    ),
    fog: (
      <>
        <path d="M7 12h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 4.6 3.75 3.75 0 0 0 7 12Z" />
        <path d="M4 15.5h16M6 19h12" />
      </>
    ),
  };
  return (
    <svg
      className="metric-icon weather-icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[id]}
    </svg>
  );
}
