import * as THREE from 'three';

/**
 * CSS renk dizgisinin ayrıştırılmış hâli (Tur 65).
 *
 * Sahne her state eşitlemesinde karelerin ve binaların rengini dizgiden
 * kuruyordu (`color.set('#12171f')`): three her seferinde dizgiyi
 * ayrıştırıp renk uzayına çeviriyor. Telefonda (CPU 4× yavaş) bu, günün
 * JS'inin ~%3'üydü. Renkler sınırlı bir küme (palet, bölge, şirket
 * renkleri); her biri bir kez ayrıştırılıyor, sonra kopyalanıyor. Sonuç
 * `set` ile birebir aynı.
 */
const PARSED = new Map<string, THREE.Color>();

export function paint(target: THREE.Color, css: string): THREE.Color {
  let parsed = PARSED.get(css);
  if (!parsed) {
    parsed = new THREE.Color(css);
    PARSED.set(css, parsed);
  }
  return target.copy(parsed);
}
