import * as THREE from 'three';
import type { SupplyLeg } from '@capital/core';

/**
 * Trafik: fon araçları + zincir kamyonları.
 *
 * İKİ KATMAN, İKİ İŞ.
 *
 * Fon araçları şehrin "yaşıyor" hissi: sokak ızgarasında rastgele akarlar,
 * simülasyonla hiçbir bağları yoktur, soluk gri tonlardadır. Tek işleri
 * boş sokak bırakmamak.
 *
 * Zincir kamyonları ise BİLGİDİR. Her kamyon gerçek bir tedarik bacağında
 * yürür — çiftlikten tesise, tesisten depoya, depodan mağazaya — ve sahibi
 * olan şirketin rengini taşır. Yüklüyken parlak, dönüşte sönük. Böylece
 * lojistiğin haritası tablo açmadan, akışa bakarak okunuyor: hangi tesis
 * hangi mağazayı besliyor, rakip nereye yayılıyor, deponun ne işe yaradığı.
 *
 * Kamyonlar sokakları takip eder. Rota L şeklinde kırılır: parselden en
 * yakın yatay sokağa çıkar, o sokakta hedefin sütununa kadar gider, dikey
 * sokakta hedefin satırına iner, oradan parsele sapar. Köşelerde şerit
 * kayması ani olmasın diye yumuşatılır.
 */

const CAR_COLORS = ['#aeb6c2', '#8b939f', '#c0c7d1', '#77808d', '#9aa3b0', '#b4bcc7'];
const CAR_HEIGHT = 0.16;

// Kamyonlar fon araçlarından belirgin biçimde iri. İlk denemede 0,46 ×
// 0,26 idi ve şehir görünümünde kayboluyorlardı: gökdelenler sokakları
// örtüyor, kalan boşlukta araç bir noktaya iniyordu. Yarım kareye yakın
// bir gövde, bir mağazanın yanından geçerken hâlâ görülebiliyor.
const TRUCK_HEIGHT = 0.3;
const TRUCK_LENGTH = 0.6;
const TRUCK_WIDTH = 0.3;

/** Aynı anda yolda olabilecek en fazla kamyon. */
const TRUCK_CAP = 44;

/** Bir bacağa düşebilecek en fazla kamyon — az bacakta yol boş kalmasın. */
const TRUCKS_PER_LEG_CAP = 3;

/** Şerit kayması: sağdan gitsinler. */
const LANE_OFFSET = 0.2;

/** Köşe dönüşünde şerit kaymasının oturma hızı (1/s). */
const OFFSET_SETTLE = 6;

/**
 * Kademeye göre parlaklık artışı — hammadde koyu, teslimat açık.
 *
 * Kamyonlar ışıktan bağımsız çizildiği için buradaki değerler doğrudan
 * ekrana çıkıyor; ilk denemede (0,16 / 0,32) teslimat kamyonları beyaza
 * yaklaşıp şirket rengini kaybediyordu.
 */
const TIER_LIFT: Record<SupplyLeg['kind'], number> = {
  raw: 0,
  intermediate: 0.1,
  delivery: 0.2,
};

/** Bir bacağın şehir üzerindeki karşılığı; içerik bilgisi çizime buradan girer. */
export interface PlacedLeg {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Bacağın sahibi şirketin rengi. */
  color: string;
}

export type LegResolver = (leg: SupplyLeg) => PlacedLeg | null;

interface Car {
  axis: 0 | 1;
  /** Sokağın sabit koordinatı. */
  lane: number;
  /** Sokak boyunca konum. */
  position: number;
  direction: 1 | -1;
  speed: number;
}

interface Truck {
  /** Rotanın kırılma noktaları, sırayla. */
  path: THREE.Vector2[];
  /** Her parçanın uzunluğu; hız hesabını her karede tekrarlamamak için. */
  lengths: number[];
  totalLength: number;
  /** Rota başından itibaren kat edilen mesafe. */
  travelled: number;
  /** 1 = yüklü gidiş, -1 = boş dönüş. */
  heading: 1 | -1;
  speed: number;
  loadedColor: THREE.Color;
  emptyColor: THREE.Color;
  /** En son yazılan renk yükleme durumu; gereksiz buffer yüklemesini önler. */
  paintedLoaded: boolean | null;
  /** Yumuşatılmış şerit kayması. */
  offsetX: number;
  offsetZ: number;
}

export class TrafficSystem {
  /** Sahneye eklenecek tek nesne; iki instanced mesh içerir. */
  readonly group = new THREE.Group();

  private carMesh: THREE.InstancedMesh;
  private truckMesh: THREE.InstancedMesh;
  private cars: Car[] = [];
  private trucks: Truck[] = [];
  private dummy = new THREE.Object3D();
  private scratch = new THREE.Color();
  private signature = '';

  constructor(
    private width: number,
    private height: number,
    private blockSize: number,
    carCount: number,
  ) {
    this.carMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.34, CAR_HEIGHT, 0.2),
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25 }),
      carCount,
    );
    this.carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.carMesh.frustumCulled = false;

    this.truckMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(TRUCK_LENGTH, TRUCK_HEIGHT, TRUCK_WIDTH),
      // IŞIKTAN BAĞIMSIZ. Kamyon bilgi taşıyor, manzara değil: gece
      // yarısında ve gökdelen gölgesinde de gündüzkü kadar okunmalı.
      // Zemin veri lensinde tam olarak bu sebeple `MeshBasicMaterial`
      // kullanıyor — aynı gerekçe, aynı çözüm.
      new THREE.MeshBasicMaterial(),
      TRUCK_CAP,
    );
    this.truckMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.truckMesh.frustumCulled = false;
    this.truckMesh.count = 0;
    // instanceColor'ı şimdiden ayır; ilk setRoutes çağrısında hazır olsun.
    this.truckMesh.setColorAt(0, this.scratch.set('#ffffff'));

    this.group.add(this.carMesh, this.truckMesh);

    const horizontalLanes: number[] = [];
    for (let y = 0; y < height; y += blockSize) horizontalLanes.push(y);
    const verticalLanes: number[] = [];
    for (let x = 0; x < width; x += blockSize) verticalLanes.push(x);

    for (let i = 0; i < carCount; i++) {
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

      this.scratch.set(CAR_COLORS[i % CAR_COLORS.length]!);
      this.carMesh.setColorAt(i, this.scratch);
    }
    if (this.carMesh.instanceColor) this.carMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- rotalar

  /**
   * Kamyon filosunu tedarik bacaklarına göre kurar.
   *
   * Liste değişmediyse HİÇBİR ŞEY yapmaz. State her gün senkronlandığı için
   * bu önemli: yoksa kamyonlar her gün başa ışınlanır ve akış yerine
   * titreşim görürsün.
   */
  setRoutes(legs: SupplyLeg[], resolve: LegResolver): void {
    const signature = legs.map((leg) => `${leg.companyId}:${leg.fromTileId}>${leg.toTileId}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;

    this.trucks = [];
    if (legs.length === 0) {
      this.truckMesh.count = 0;
      return;
    }

    const perLeg = Math.max(1, Math.min(TRUCKS_PER_LEG_CAP, Math.floor(TRUCK_CAP / legs.length)));

    for (let round = 0; round < perLeg && this.trucks.length < TRUCK_CAP; round++) {
      for (let i = 0; i < legs.length && this.trucks.length < TRUCK_CAP; i++) {
        const leg = legs[i]!;
        const placed = resolve(leg);
        if (!placed) continue;

        const path = this.buildPath(placed.from, placed.to);
        if (path.length < 2) continue;

        const lengths: number[] = [];
        let totalLength = 0;
        for (let s = 0; s + 1 < path.length; s++) {
          const length = path[s]!.distanceTo(path[s + 1]!);
          lengths.push(length);
          totalLength += length;
        }
        if (totalLength <= 0.01) continue;

        const loadedColor = new THREE.Color(placed.color);
        // Kademeyi parlaklık taşıyor: hammadde en koyu, mağazaya inen
        // teslimat en açık. Renk kimin olduğunu, ton neyi taşıdığını söyler
        // — ikisini de renge yüklemek okunmaz olurdu.
        loadedColor.lerp(new THREE.Color('#ffffff'), TIER_LIFT[leg.kind]);
        const emptyColor = loadedColor.clone().lerp(new THREE.Color('#3a4250'), 0.62);

        this.trucks.push({
          path,
          lengths,
          totalLength,
          // Aynı bacaktaki kamyonlar üst üste binmesin: rotaya eşit aralıkla
          // dağıtılıyorlar.
          travelled: (totalLength * ((round + (i % 3) * 0.31) / perLeg)) % totalLength,
          heading: 1,
          speed: 1.05 + ((i * 7) % 5) * 0.13,
          loadedColor,
          emptyColor,
          paintedLoaded: null,
          offsetX: 0,
          offsetZ: 0,
        });
      }
    }

    this.truckMesh.count = this.trucks.length;
  }

  /**
   * İki binanın kapısı önünü birleştiren, TAMAMI SOKAKTA geçen L rotası.
   *
   * Kırılma noktaları: kaynağın önündeki yatay sokak → hedefin dikey
   * sokağı → hedefin yatay sokağı → hedefin önü. Sıfır uzunluklu parçalar
   * atılır.
   *
   * Rota binanın kendi karesine GİRMİYOR, önündeki sokakta bitiyor. İlk
   * denemede kamyon parsele sapıyordu ve blok içindeki bir bina sokağa iki
   * kare uzaksa aradaki parselin — çoğu zaman başka bir binanın — içinden
   * geçiyordu. Sokakta durup geri dönmek hem doğru hem zaten gerçek bir
   * dağıtım kamyonunun yaptığı şey.
   */
  private buildPath(from: { x: number; y: number }, to: { x: number; y: number }): THREE.Vector2[] {
    const startRow = this.nearestLane(from.y, this.height);
    const endRow = this.nearestLane(to.y, this.height);
    const column = this.nearestLane(to.x, this.width);

    const raw = [
      new THREE.Vector2(from.x, startRow),
      new THREE.Vector2(column, startRow),
      new THREE.Vector2(column, endRow),
      new THREE.Vector2(to.x, endRow),
    ];

    const path: THREE.Vector2[] = [];
    for (const point of raw) {
      const last = path[path.length - 1];
      if (last && last.distanceTo(point) < 0.01) continue;
      path.push(point);
    }
    return path;
  }

  /** Verilen koordinata en yakın sokak hattı. */
  private nearestLane(value: number, span: number): number {
    const maxLane = Math.floor((span - 1) / this.blockSize) * this.blockSize;
    const lane = Math.round(value / this.blockSize) * this.blockSize;
    return Math.max(0, Math.min(maxLane, lane));
  }

  // -------------------------------------------------------------- döngü

  update(dt: number): void {
    this.updateCars(dt);
    this.updateTrucks(dt);
  }

  private updateCars(dt: number): void {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i]!;
      const span = car.axis === 0 ? this.width : this.height;

      car.position += car.speed * car.direction * dt;
      if (car.position > span) car.position = -1;
      else if (car.position < -1) car.position = span;

      const offset = car.direction === 1 ? LANE_OFFSET : -LANE_OFFSET;
      if (car.axis === 0) {
        this.dummy.position.set(car.position, CAR_HEIGHT / 2 + 0.02, car.lane + offset);
        this.dummy.rotation.y = 0;
      } else {
        this.dummy.position.set(car.lane + offset, CAR_HEIGHT / 2 + 0.02, car.position);
        this.dummy.rotation.y = Math.PI / 2;
      }

      this.dummy.updateMatrix();
      this.carMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.carMesh.instanceMatrix.needsUpdate = true;
  }

  private updateTrucks(dt: number): void {
    if (this.trucks.length === 0) return;
    let repaint = false;

    for (let i = 0; i < this.trucks.length; i++) {
      const truck = this.trucks[i]!;

      truck.travelled += truck.speed * truck.heading * dt;
      // Uçlara varınca döner: yüklü gitti, boş geliyor. Işınlanma yok —
      // kamyon geri geldiği için akış iki yönlü ve sürekli okunuyor.
      if (truck.travelled >= truck.totalLength) {
        truck.travelled = truck.totalLength;
        truck.heading = -1;
      } else if (truck.travelled <= 0) {
        truck.travelled = 0;
        truck.heading = 1;
      }

      const loaded = truck.heading === 1;
      if (truck.paintedLoaded !== loaded) {
        this.truckMesh.setColorAt(i, loaded ? truck.loadedColor : truck.emptyColor);
        truck.paintedLoaded = loaded;
        repaint = true;
      }

      // Rota üzerindeki konum ve o parçanın yönü.
      let remaining = truck.travelled;
      let segment = 0;
      while (segment < truck.lengths.length - 1 && remaining > truck.lengths[segment]!) {
        remaining -= truck.lengths[segment]!;
        segment++;
      }
      const a = truck.path[segment]!;
      const b = truck.path[segment + 1]!;
      const length = truck.lengths[segment] || 1;
      const t = Math.max(0, Math.min(1, remaining / length));

      const x = a.x + (b.x - a.x) * t;
      const z = a.y + (b.y - a.y) * t;

      // Gidiş yönü: dönüşte parça ters yönde kat ediliyor.
      const dx = (b.x - a.x) * truck.heading;
      const dz = (b.y - a.y) * truck.heading;

      // Şerit kayması gidiş yönüne diktir. Köşede hedef değeri bir anda
      // değişiyor; yumuşatma sayesinde kamyon yana zıplamak yerine kayıyor.
      const targetX = Math.abs(dz) > Math.abs(dx) ? (dz > 0 ? LANE_OFFSET : -LANE_OFFSET) : 0;
      const targetZ = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -LANE_OFFSET : LANE_OFFSET) : 0;
      const settle = Math.min(1, OFFSET_SETTLE * dt);
      truck.offsetX += (targetX - truck.offsetX) * settle;
      truck.offsetZ += (targetZ - truck.offsetZ) * settle;

      // Parsel blokları y=0,07'de bitiyor; kamyon onların üstünde kalsın ki
      // bir parselin kenarından geçerken gövdesi yarıya gömülmesin.
      this.dummy.position.set(x + truck.offsetX, TRUCK_HEIGHT / 2 + 0.07, z + truck.offsetZ);
      this.dummy.rotation.y = Math.atan2(-dz, dx);
      this.dummy.updateMatrix();
      this.truckMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.truckMesh.instanceMatrix.needsUpdate = true;
    if (repaint && this.truckMesh.instanceColor) this.truckMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Veri lensi modu.
   *
   * Fon araçları susar — lenste manzara gürültüdür. Kamyonlar KALIR, çünkü
   * onlar da veridir: ısı haritasının üstünde akan zincir, iki bilgiyi
   * üst üste okumanı sağlıyor ("talep burada yüksek, ama kamyonlarım
   * oraya gitmiyor").
   */
  setDataLens(active: boolean): void {
    this.carMesh.visible = !active;
  }

  /** Testler için: kaç kamyon yolda. */
  get truckCount(): number {
    return this.trucks.length;
  }

  /** Testler için: kamyonların rota üzerindeki toplam ilerlemesi. */
  get truckPositionSum(): number {
    let sum = 0;
    for (const truck of this.trucks) sum += truck.travelled;
    return sum;
  }

  /** Testler için: fon araçları görünür mü. */
  get carsVisible(): boolean {
    return this.carMesh.visible;
  }

  dispose(): void {
    for (const mesh of [this.carMesh, this.truckMesh]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

