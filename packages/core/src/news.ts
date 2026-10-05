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
  /*
   * Haber kimliği kendi sayacından — binaların `nextId`'sinden DEĞİL.
   * Motorun bazı haberleri kayıt yüklenince yeniden düşüyor (aşılmış
   * değer eşikleri gibi); ortak sayaç bu yüzden bina kimliklerini
   * kaydırıyordu. Lig tekrarı komutları bina kimliğiyle oynattığı için
   * kayan bir kimlik tekrarı bozardı.
   */
  const newsId = (state.newsSeq ?? state.news.reduce((max, item) => Math.max(max, item.id), 0)) + 1;
  state.newsSeq = newsId;
  state.news.unshift({
    id: newsId,
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
