import type * as THREE from 'three';

/**
 * Örnek tamponunun yalnız çizilen kısmını GPU'ya yükler (Tur 43).
 *
 * `needsUpdate` tek başına tamponun TAMAMINI yüklüyor. Tamponlar en kalabalık
 * hâle göre ayrılmış: araç türü başına bütün araçlar, en büyük şehrin
 * binaları. Çizilen ise `count` kadarı. Her karede yüklenen araç
 * tamponlarının çoğu hiç çizilmeyen yuvalardı; en ucuz kademede araçların
 * yalnız %30'u çiziliyor ve araçlar üç türe bölünüyor.
 *
 * Çağıranlar her yüklemede ilk `count` yuvanın hepsini yeniden yazıyor;
 * aralık bu yüzden her seferinde `[0, count)`. Çizilmeyen yuvaların GPU'daki
 * eski değeri görünmüyor. `count` sıfırsa hiçbir şey yüklenmiyor: WebGL'de
 * sıfır uzunluklu aralık "dizinin sonuna kadar" demek.
 */
export function uploadDrawn(attribute: THREE.BufferAttribute, count: number): void {
  if (count <= 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}
