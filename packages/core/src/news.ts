import type { GameState, NewsTone } from './types';

/** Haberin kime ve nereye bağlı olduğu — hepsi seçime bağlı. */
export interface NewsRef {
  companyId?: string;
  tileId?: number;
  districtId?: number;
}

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
   * Haberin bir yüzü (şirket) ve yeri (kare/bölge) varsa.
   *
   * Hepsi seçime bağlı ve eski kayıtlarda yok — bu yüzden şema sürümü
   * değişmiyor: alanı olmayan bir haber yalnızca portresiz ve yersiz
   * görünür. Düz metin verilirse şirket kimliği sayılır (eski çağrılar).
   */
  ref?: string | NewsRef,
): void {
  const where: NewsRef = typeof ref === 'string' ? { companyId: ref } : (ref ?? {});
  state.news.unshift({
    id: state.nextId++,
    day: state.time.day,
    tone,
    title,
    body,
    ...(where.companyId !== undefined ? { companyId: where.companyId } : {}),
    ...(where.tileId !== undefined ? { tileId: where.tileId } : {}),
    ...(where.districtId !== undefined ? { districtId: where.districtId } : {}),
  });
  if (state.news.length > MAX_NEWS) state.news.length = MAX_NEWS;
}
