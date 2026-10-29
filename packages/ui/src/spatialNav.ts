import type { Direction } from './padInput';

/**
 * Yönle odak (Tur 72): kumandanın yön tuşu ekranda o yöndeki en yakın
 * düğmeye gidiyor. Kurallar Android'in odak bulucusundan (`FocusFinder`):
 * - aday o yönde olmalı; kaynağı içine alan kutu (kap) aday değil;
 * - kaynağın hizasındaki (ışınındaki) aday hizanın dışındakini yeniyor:
 *   sağa-solada her zaman, yukarı-aşağıda dışarıdaki tümüyle daha yakın
 *   değilse. Haritanın ortasından sola basınca sol sütundaki kart, üst
 *   bardaki bir sekmeden önce geliyor;
 * - gerisi uzaklıkla: ana eksendeki uzaklık ağır basıyor (13 × karesi), yan
 *   eksende merkezler arası uzaklık karesiyle.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const horizontal = (dir: Direction) => dir === 'left' || dir === 'right';

/** Aday o yönde mi: iki kenarı da ötede (Android'in `isCandidate`'i). */
function isCandidate(from: Box, box: Box, dir: Direction): boolean {
  switch (dir) {
    case 'left':
      return (from.right > box.right || from.left >= box.right) && from.left > box.left;
    case 'right':
      return (from.left < box.left || from.right <= box.left) && from.right < box.right;
    case 'up':
      return (from.bottom > box.bottom || from.top >= box.bottom) && from.top > box.top;
    case 'down':
      return (from.top < box.top || from.bottom <= box.top) && from.bottom < box.bottom;
  }
}

/** Kutu kaynağın hizasında mı: yan eksende örtüşüyor. */
function inBeam(from: Box, box: Box, dir: Direction): boolean {
  return horizontal(dir) ? box.bottom > from.top && box.top < from.bottom : box.right > from.left && box.left < from.right;
}

/** Kutu tümüyle o yönde mi (kaynağın kenarını geçmiş). */
function beyond(from: Box, box: Box, dir: Direction): boolean {
  switch (dir) {
    case 'left':
      return from.left >= box.right;
    case 'right':
      return from.right <= box.left;
    case 'up':
      return from.top >= box.bottom;
    case 'down':
      return from.bottom <= box.top;
  }
}

/** Ana eksende kaynağın kenarından kutunun yakın kenarına. */
function major(from: Box, box: Box, dir: Direction): number {
  const gap = dir === 'left' ? from.left - box.right : dir === 'right' ? box.left - from.right : dir === 'up' ? from.top - box.bottom : box.top - from.bottom;
  return Math.max(0, gap);
}

/** Ana eksende kaynağın kenarından kutunun uzak kenarına. */
function majorToFarEdge(from: Box, box: Box, dir: Direction): number {
  const gap = dir === 'left' ? from.left - box.left : dir === 'right' ? box.right - from.right : dir === 'up' ? from.top - box.top : box.bottom - from.bottom;
  return Math.max(1, gap);
}

function minor(from: Box, box: Box, dir: Direction): number {
  return horizontal(dir)
    ? Math.abs((from.top + from.bottom) / 2 - (box.top + box.bottom) / 2)
    : Math.abs((from.left + from.right) / 2 - (box.left + box.right) / 2);
}

/** Hizadaki `a`, hizanın dışındaki `b`'yi yeniyor mu (Android'in `beamBeats`'i). */
function beamBeats(from: Box, a: Box, b: Box, dir: Direction): boolean {
  if (inBeam(from, b, dir) || !inBeam(from, a, dir)) return false;
  // `b` o yönde bile değilse (sola basınca aşağıda), oraya başka yönle gidiliyor.
  if (!beyond(from, b, dir)) return true;
  if (horizontal(dir)) return true;
  return major(from, a, dir) < majorToFarEdge(from, b, dir);
}

function score(from: Box, box: Box, dir: Direction): number {
  const along = major(from, box, dir);
  const across = minor(from, box, dir);
  return 13 * along * along + across * across;
}

/** `a`, `b`'den iyi aday mı. */
function better(from: Box, a: Box, b: Box, dir: Direction): boolean {
  if (beamBeats(from, a, b, dir)) return true;
  if (beamBeats(from, b, a, dir)) return false;
  return score(from, a, dir) < score(from, b, dir);
}

/** `from`dan `dir` yönünde en yakın kutunun sırası; yoksa -1. Eşitlikte ilk kutu. */
export function nearestBox(from: Box, boxes: readonly Box[], dir: Direction): number {
  let best = -1;
  boxes.forEach((box, index) => {
    if (!isCandidate(from, box, dir)) return;
    if (best < 0 || better(from, box, boxes[best]!, dir)) best = index;
  });
  return best;
}
