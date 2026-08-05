import * as THREE from 'three';

/**
 * Trafik.
 *
 * Şehrin "yaşıyor" hissinin en ucuz ve en etkili kaynağı: sokaklarda akan
 * araçlar. Tamamı tek bir instanced mesh, tek çizim çağrısı; simülasyonla
 * hiçbir bağı yok — sadece göze hareket verir.
 *
 * Araçlar sokak ızgarasını takip eder: yatay sokaklarda x ekseninde, dikey
 * sokaklarda z ekseninde ilerler, sağdan gitsin diye şeride kaydırılır.
 */

const CAR_COLORS = ['#d8dde6', '#c9553f', '#3f6fa8', '#e0b45c', '#5a6470', '#7fbfa0'];
const BODY_HEIGHT = 0.16;

interface Car {
  axis: 0 | 1;
  /** Sokağın sabit koordinatı. */
  lane: number;
  /** Sokak boyunca konum. */
  position: number;
  direction: 1 | -1;
  speed: number;
}

export class TrafficSystem {
  readonly mesh: THREE.InstancedMesh;
  private cars: Car[] = [];
  private dummy = new THREE.Object3D();

  constructor(
    private width: number,
    private height: number,
    blockSize: number,
    count: number,
  ) {
    const geometry = new THREE.BoxGeometry(0.34, BODY_HEIGHT, 0.2);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25 });
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    const horizontalLanes: number[] = [];
    for (let y = 0; y < height; y += blockSize) horizontalLanes.push(y);
    const verticalLanes: number[] = [];
    for (let x = 0; x < width; x += blockSize) verticalLanes.push(x);

    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const axis: 0 | 1 = i % 2 === 0 ? 0 : 1;
      const lanes = axis === 0 ? horizontalLanes : verticalLanes;
      const lane = lanes[Math.floor((i / 2) % lanes.length)] ?? 0;
      const direction: 1 | -1 = i % 4 < 2 ? 1 : -1;

      this.cars.push({
        axis,
        lane,
        position: ((i * 7.3) % (axis === 0 ? width : height)) - 0.5,
        direction,
        speed: 1.6 + ((i * 13) % 9) * 0.16,
      });

      color.set(CAR_COLORS[i % CAR_COLORS.length]!);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      const span = car.axis === 0 ? this.width : this.height;

      car.position += car.speed * car.direction * dt;
      if (car.position > span) car.position = -1;
      else if (car.position < -1) car.position = span;

      // Karşı yön için şerit kaydırması.
      const offset = car.direction === 1 ? 0.22 : -0.22;
      if (car.axis === 0) {
        this.dummy.position.set(car.position, BODY_HEIGHT / 2 + 0.02, car.lane + offset);
        this.dummy.rotation.y = 0;
      } else {
        this.dummy.position.set(car.lane + offset, BODY_HEIGHT / 2 + 0.02, car.position);
        this.dummy.rotation.y = Math.PI / 2;
      }

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
