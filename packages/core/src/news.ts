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
  /**
   * Haberin bir yüzü varsa hangi şirketin.
   *
   * Seçime bağlı ve eski kayıtlarda yok — bu yüzden şema sürümü
   * değişmiyor: alanı olmayan bir haber yalnızca portresiz görünür.
   */
  companyId?: string,
): void {
  state.news.unshift({ id: state.nextId++, day: state.time.day, tone, title, body, companyId });
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS;
}
