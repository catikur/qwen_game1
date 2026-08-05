import type { GameState, NewsTone } from './types';

const MAX_NEWS = 60;

/**
 * Haber akışı, "neden bu oldu?" sorusunun tek adresi. Oyunu durduran modal
 * yerine akan bir kayıt tutuyoruz; oyuncu istediğinde bakar.
 */
export function pushNews(
  state: GameState,
  tone: NewsTone,
  title: string,
  body: string,
): void {
  state.news.unshift({ id: state.nextId++, day: state.time.day, tone, title, body });
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS;
}
