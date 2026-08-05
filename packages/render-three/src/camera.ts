import * as THREE from 'three';

/**
 * RTS kamera denetleyicisi.
 *
 * "Casual ve akıcı" hissin büyük kısmı buradan gelir: her girdi hedef bir
 * değere yazılır, kamera o hedefe kare bazında yumuşayarak yaklaşır.
 * Böylece sürükleme bırakıldığında hareket sertçe kesilmez, zoom kademeli
 * akar ve düşük kare hızında bile kontrol tutarlı kalır.
 */

const MIN_DISTANCE = 8;
const MAX_DISTANCE = 46;
const MIN_POLAR = 0.32;
const MAX_POLAR = 1.16;
const DAMPING = 9;
const KEY_PAN_SPEED = 14;

export interface CameraBounds {
  width: number;
  height: number;
}

export class RtsCameraController {
  readonly camera: THREE.PerspectiveCamera;

  private target = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private distance = 30;
  private desiredDistance = 30;
  private azimuth = Math.PI * 0.25;
  private desiredAzimuth = Math.PI * 0.25;
  private polar = 0.82;
  private desiredPolar = 0.82;

  private keys = new Set<string>();
  private bounds: CameraBounds;

  constructor(aspect: number, bounds: CameraBounds) {
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.5, 400);
    this.bounds = bounds;
    this.desiredTarget.set(bounds.width / 2, 0, bounds.height / 2);
    this.target.copy(this.desiredTarget);
    this.apply();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Ekran düzleminde kaydır — yön kameranın bakış açısına göre döner. */
  pan(dx: number, dy: number): void {
    const scale = this.distance * 0.0016;
    const sin = Math.sin(this.azimuth);
    const cos = Math.cos(this.azimuth);
    this.desiredTarget.x -= (dx * cos - dy * sin) * scale;
    this.desiredTarget.z -= (dx * sin + dy * cos) * scale;
    this.clampTarget();
  }

  rotate(dx: number, dy: number): void {
    this.desiredAzimuth -= dx * 0.005;
    this.desiredPolar = clamp(this.desiredPolar - dy * 0.004, MIN_POLAR, MAX_POLAR);
  }

  zoom(delta: number): void {
    // Yakınken küçük, uzaktayken büyük adım — her mesafede aynı his.
    this.desiredDistance = clamp(
      this.desiredDistance * (1 + delta * 0.0016),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
  }

  focusOn(x: number, z: number): void {
    this.desiredTarget.set(x, 0, z);
    this.clampTarget();
  }

  onKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys(): void {
    this.keys.clear();
  }

  update(dt: number): void {
    const step = Math.min(1, dt * KEY_PAN_SPEED);
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;

    if (kx !== 0 || kz !== 0) {
      const sin = Math.sin(this.azimuth);
      const cos = Math.cos(this.azimuth);
      const speed = step * this.distance * 0.08;
      this.desiredTarget.x += (kx * cos - kz * sin) * speed;
      this.desiredTarget.z += (kx * sin + kz * cos) * speed;
      this.clampTarget();
    }

    const t = 1 - Math.exp(-DAMPING * dt);
    this.target.lerp(this.desiredTarget, t);
    this.distance += (this.desiredDistance - this.distance) * t;
    this.azimuth += (this.desiredAzimuth - this.azimuth) * t;
    this.polar += (this.desiredPolar - this.polar) * t;
    this.apply();
  }

  /** Ekran koordinatını zemin düzlemindeki (y=0) noktaya çevirir. */
  screenToGround(ndcX: number, ndcY: number, out: THREE.Vector3): boolean {
    const origin = this.camera.position;
    const direction = new THREE.Vector3(ndcX, ndcY, 0.5)
      .unproject(this.camera)
      .sub(origin)
      .normalize();

    if (Math.abs(direction.y) < 1e-6) return false;
    const t = -origin.y / direction.y;
    if (t <= 0) return false;

    out.copy(origin).addScaledVector(direction, t);
    return true;
  }

  private clampTarget(): void {
    const margin = 6;
    this.desiredTarget.x = clamp(this.desiredTarget.x, -margin, this.bounds.width + margin);
    this.desiredTarget.z = clamp(this.desiredTarget.z, -margin, this.bounds.height + margin);
  }

  private apply(): void {
    const sinPolar = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * sinPolar * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * sinPolar * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
