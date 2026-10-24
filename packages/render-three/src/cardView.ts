import * as THREE from 'three';
import type { GameState } from '@capital/core';

/**
 * Şehir kartının kadrajı (Tur 64).
 *
 * Kart 1200 × 630: solda koşunun özeti, sağda şehir. Kamera oyuncunun
 * kendi kamerası değil; şirketin binalarını (yoksa şehrin bütün binalarını,
 * o da yoksa haritayı) kartın sağ bölümüne sığdıran sabit bir kuşbakışı.
 * Hesap WebGL'siz: yalnız izdüşüm, birim testi köşeleri ölçüyor.
 */
export const CARD_VIEW = {
  /** Kameranın açısı: oyunun açılış bakışı (kuzeydoğudan), biraz daha yukarıdan. */
  azimuth: Math.PI * 0.25,
  polar: 0.92,
  fov: 46,
  /** Şehrin kartta durduğu yatay bant (NDC); solda yazı paneli. */
  left: -0.05,
  right: 0.95,
  /** Dikey pay: üstte gök, altta kenar. */
  top: 0.86,
  bottom: -0.9,
  /** Binaların hesaba katılan boyu: kulelerin tepesi de kadrajda kalsın. */
  height: 5,
  /** Kadrajın çevresine bırakılan pay (kare). */
  margin: 1.5,
  minDistance: 10,
  maxDistance: 95,
} as const;

export interface CardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CardPose {
  x: number;
  z: number;
  distance: number;
  azimuth: number;
  polar: number;
}

/** Kartın göstereceği yer: şirketin binaları, yoksa şehrin binaları, o da yoksa harita. */
export function cardBounds(state: GameState, companyId: string): CardBounds {
  const tiles = state.map.tiles;
  const buildings = Object.values(state.buildings);
  const own = buildings.filter((building) => building.companyId === companyId);
  const chosen = own.length > 0 ? own : buildings;
  if (chosen.length === 0) {
    return { minX: 0, maxX: state.map.width - 1, minZ: 0, maxZ: state.map.height - 1 };
  }
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const building of chosen) {
    const tile = tiles[building.tileId];
    if (!tile) continue;
    bounds.minX = Math.min(bounds.minX, tile.x);
    bounds.maxX = Math.max(bounds.maxX, tile.x);
    bounds.minZ = Math.min(bounds.minZ, tile.y);
    bounds.maxZ = Math.max(bounds.maxZ, tile.y);
  }
  if (!Number.isFinite(bounds.minX)) return { minX: 0, maxX: state.map.width - 1, minZ: 0, maxZ: state.map.height - 1 };
  return bounds;
}

/** Kamerayı denetleyicinin formülüyle yerleştirir (bkz. `RtsCameraController`). */
export function placeCardCamera(camera: THREE.PerspectiveCamera, pose: CardPose): void {
  const sinPolar = Math.sin(pose.polar);
  camera.position.set(
    pose.x + pose.distance * sinPolar * Math.sin(pose.azimuth),
    pose.distance * Math.cos(pose.polar),
    pose.z + pose.distance * sinPolar * Math.cos(pose.azimuth),
  );
  camera.lookAt(pose.x, 0, pose.z);
  camera.updateMatrixWorld();
}

const PROBE = new THREE.Vector3();

/** Kadrajın köşelerinin ekrandaki (NDC) sınırları. */
export function projectedExtent(
  camera: THREE.PerspectiveCamera,
  bounds: CardBounds,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const m = CARD_VIEW.margin;
  const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const x of [bounds.minX - m, bounds.maxX + m]) {
    for (const z of [bounds.minZ - m, bounds.maxZ + m]) {
      for (const y of [0, CARD_VIEW.height]) {
        PROBE.set(x, y, z).project(camera);
        out.minX = Math.min(out.minX, PROBE.x);
        out.maxX = Math.max(out.maxX, PROBE.x);
        out.minY = Math.min(out.minY, PROBE.y);
        out.maxY = Math.max(out.maxY, PROBE.y);
      }
    }
  }
  return out;
}

/**
 * Kadrajı kartın sağ bandına sığdıran en yakın bakış.
 *
 * Uzaklık ikili aramayla; her uzaklıkta bakılan nokta kameranın sağ ve ileri
 * eksenleri boyunca kaydırılıyor ki kadrajın ortası bandın ortasına düşsün
 * (yakın bakışta izdüşüm doğrusal değil; birkaç adımda oturuyor).
 */
export function cardView(bounds: CardBounds, aspect: number): CardPose {
  const camera = new THREE.PerspectiveCamera(CARD_VIEW.fov, aspect, 0.5, 400);
  camera.updateProjectionMatrix();
  const { azimuth, polar } = CARD_VIEW;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  // Kameranın yerdeki sağ ve ileri eksenleri.
  const right = { x: Math.cos(azimuth), z: -Math.sin(azimuth) };
  const forward = { x: -Math.sin(azimuth), z: -Math.cos(azimuth) };
  const goalX = (CARD_VIEW.left + CARD_VIEW.right) / 2;
  const goalY = (CARD_VIEW.top + CARD_VIEW.bottom) / 2;
  const spanX = CARD_VIEW.right - CARD_VIEW.left;
  const spanY = CARD_VIEW.top - CARD_VIEW.bottom;
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(CARD_VIEW.fov / 2));

  const fit = (distance: number): { pose: CardPose; fits: boolean } => {
    let side = 0;
    let ahead = 0;
    const pose: CardPose = { x: centerX, z: centerZ, distance, azimuth, polar };
    for (let step = 0; step < 8; step++) {
      pose.x = centerX - right.x * side - forward.x * ahead;
      pose.z = centerZ - right.z * side - forward.z * ahead;
      placeCardCamera(camera, pose);
      const extent = projectedExtent(camera, bounds);
      // NDC'de bir birimlik kayma, bu uzaklıkta kabaca şu kadar dünya birimi;
      // ileri eksende yer, bakışın eğimiyle kısalarak görünüyor.
      const unitY = distance * halfHeight;
      const unitX = unitY * aspect;
      side += (goalX - (extent.minX + extent.maxX) / 2) * unitX;
      ahead += ((goalY - (extent.minY + extent.maxY) / 2) * unitY) / Math.cos(polar);
    }
    pose.x = centerX - right.x * side - forward.x * ahead;
    pose.z = centerZ - right.z * side - forward.z * ahead;
    placeCardCamera(camera, pose);
    const extent = projectedExtent(camera, bounds);
    const fits =
      extent.maxX - extent.minX <= spanX &&
      extent.maxY - extent.minY <= spanY &&
      extent.minX >= CARD_VIEW.left - 0.01 &&
      extent.maxX <= CARD_VIEW.right + 0.01 &&
      extent.minY >= CARD_VIEW.bottom - 0.01 &&
      extent.maxY <= CARD_VIEW.top + 0.01;
    return { pose, fits };
  };

  let low: number = CARD_VIEW.minDistance;
  let high: number = CARD_VIEW.maxDistance;
  if (fit(low).fits) return fit(low).pose;
  if (!fit(high).fits) return fit(high).pose;
  for (let step = 0; step < 18; step++) {
    const mid = (low + high) / 2;
    if (fit(mid).fits) high = mid;
    else low = mid;
  }
  return fit(high).pose;
}
