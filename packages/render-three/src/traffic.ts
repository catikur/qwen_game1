import * as THREE from 'three';
import type { CustomerFlow, SupplyLeg } from '@capital/core';

/**
 * Trafik: fon araçları + zincir kamyonları + müşteri araçları.
 *
 * ÜÇ KATMAN, ÜÇ İŞ — ve ikisi bilgi taşıyor.
 *
 * Fon araçları şehrin "yaşıyor" hissi: sokak ızgarasında rastgele akarlar,
 * simülasyonla hiçbir bağları yoktur, soluk gri tonlardadır. Tek işleri
 * boş sokak bırakmamak.
 *
 * Zincir kamyonları BİLGİDİR. Her kamyon gerçek bir tedarik bacağında
 * yürür — çiftlikten tesise, tesisten depoya, depodan mağazaya — ve sahibi
 * olan şirketin rengini taşır. Yüklüyken parlak, dönüşte sönük. Böylece
 * lojistiğin haritası tablo açmadan, akışa bakarak okunuyor: hangi tesis
 * hangi mağazayı besliyor, rakip nereye yayılıyor, deponun ne işe yaradığı.
 *
 * Müşteri araçları da bilgidir ama TERS YÖNDE akar, ve eksik olan buydu.
 * Kamyonlar senden dışarı gider: şehre yaptığın şeyi anlatırlar. Müşteri
 * araçları şehirden sana gelir — dün kaç birim sattığın (`unitsSold`)
 * mağazanın kapısına akan araç sayısına dönüşüyor. Rakip senden pay
 * aldığında bunu tabloda değil, sokakta görüyorsun: akış onun kapısına
 * bükülüyor.
 *
 * Üçü de sokakları takip eder. Rota L şeklinde kırılır: parselden en
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

/**
 * Müşteri aracı: fon aracı boyunda, kamyonun yarısı.
 *
 * SİLUET BİR SÖZLÜK. Sokakta üç şey akıyor ve üçü de renkli kutu olsaydı
 * hiçbiri okunmazdı. Ayrım şöyle kuruldu:
 *
 *   iri + renkli  → kamyon, yani tedarik (senden dışarı)
 *   küçük + renkli → müşteri, yani satış (şehirden sana)
 *   küçük + gri   → fon aracı, yani hiçbir şey
 *
 * İlk denemede müşteri 0,4 × 0,22 idi — kamyonun yalnızca üçte bir
 * altında. Ekran görüntüsünde ikisi ayırt edilemiyordu: "renkli kutu"
 * görüyordun ama hangisinin mal hangisinin müşteri taşıdığını
 * bilmiyordun. Boy farkı iki katına çıkarıldı.
 */
const SHOPPER_HEIGHT = 0.15;
const SHOPPER_LENGTH = 0.3;
const SHOPPER_WIDTH = 0.17;

/** Aynı anda yolda olabilecek en fazla müşteri aracı. */
const SHOPPER_CAP = 54;

/** Bir mağazaya düşebilecek en fazla araç — tek mağaza bütçeyi yutmasın. */
const SHOPPERS_PER_STORE_CAP = 6;

/**
 * Müşterinin mağaza önünde durduğu süre (sn).
 *
 * Bu bekleme olmadan araç kapıya değip anında geri dönüyordu ve "gelip
 * alışveriş etti" değil "U dönüşü yaptı" gibi okunuyordu. Varış bir an
 * olmalı ki gözle yakalanabilsin.
 */
const SHOPPER_DWELL = 1.1;

/**
 * Müşterinin geldiği mesafe, sokak bloğu cinsinden.
 *
 * Mahalleyi temsil ediyor: müşteri şehrin öbür ucundan değil, çevredeki
 * birkaç adadan geliyor. Uzak tutmak akışı okunmaz yapıyor (araç yolda
 * kayboluyor), çok yakın tutmak ise kapının önünde titreşim gibi duruyor.
 */
const SHOPPER_ORIGIN_BLOCKS = 2;

/** Müşterinin nereden geleceği: yön tablosu, araç sırasına göre dönüyor. */
const SHOPPER_ORIGINS: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, 1],
];

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

/** Bir müşteri akışının şehir üzerindeki karşılığı. */
export interface PlacedFlow {
  /** Mağazanın konumu. */
  at: { x: number; y: number };
  /** Mağaza sahibinin rengi. */
  color: string;
}

export type FlowResolver = (flow: CustomerFlow) => PlacedFlow | null;

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

/**
 * Müşteri aracı.
 *
 * Kamyondan tek farkı bekleme sayacı: uçlara varınca hemen dönmüyor,
 * mağazanın önünde duruyor. Rota mantığı aynı olduğu için `buildPath`
 * ikisi tarafından da kullanılıyor.
 */
interface Shopper {
  /** Hangi mağazaya gidiyor — filo güncellenirken kimin kalacağını bu belirliyor. */
  storeId: string;
  path: THREE.Vector2[];
  lengths: number[];
  totalLength: number;
  travelled: number;
  /** 1 = mağazaya gidiş, -1 = dönüş. */
  heading: 1 | -1;
  speed: number;
  /** Mağaza önünde kalan bekleme (sn); 0 ise yolda. */
  dwell: number;
  inboundColor: THREE.Color;
  outboundColor: THREE.Color;
  paintedInbound: boolean | null;
  offsetX: number;
  offsetZ: number;
}

export class TrafficSystem {
  /** Sahneye eklenecek tek nesne; üç instanced mesh içerir. */
  readonly group = new THREE.Group();

  private carMesh: THREE.InstancedMesh;
  private truckMesh: THREE.InstancedMesh;
  private shopperMesh: THREE.InstancedMesh;
  private cars: Car[] = [];
  private trucks: Truck[] = [];
  private shoppers: Shopper[] = [];
  private dummy = new THREE.Object3D();
  private scratch = new THREE.Color();
  private signature = '';
  private flowSignature = '';
  /**
   * En son uygulanan kalite bütçesi.
   *
   * Saklanması şart: filo state senkronunda yeniden kuruluyor, bütçe ise
   * kalite kademesi değişince. İkisi `count`'u ayrı ayrı yazsaydı hangisi
   * sonra çağrılırsa o kazanırdı — kalite düşürüp yeni mağaza açan oyuncu
   * bütçesini sessizce geri almış olurdu.
   */
  private budget = 1;

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

    this.shopperMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(SHOPPER_LENGTH, SHOPPER_HEIGHT, SHOPPER_WIDTH),
      // Kamyonlarla aynı gerekçe: müşteri akışı bilgi taşıyor, manzara
      // değil. Gece yarısında da gündüzkü kadar okunmalı.
      new THREE.MeshBasicMaterial(),
      SHOPPER_CAP,
    );
    this.shopperMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shopperMesh.frustumCulled = false;
    this.shopperMesh.count = 0;
    this.shopperMesh.setColorAt(0, this.scratch.set('#ffffff'));

    this.group.add(this.carMesh, this.truckMesh, this.shopperMesh);

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

  // ---------------------------------------------------------- müşteriler

  /**
   * Müşteri filosunu mağazaların dünkü satışına göre kurar.
   *
   * DAĞITIM SIRAYLA DEĞİL, ORANLA — ve bu bir düzeltme.
   *
   * İlk yazdığım sürüm bütçeyi sıralı turlarla dağıtıyordu: liste çoktan
   * aza sıralı, her mağazaya sırayla bir araç, bütçe bitene kadar. Mantıklı
   * görünüyordu ama ölçünce çöktü — 120. günde şehirde 42 satan mağaza ve
   * 54 araç vardı, yani ilk tur zaten 42'sini dağıtıyor, geriye 12 kalıyor.
   * Sonuç: mağazaların çoğu 1 araç, en işlekleri 2. Oyuncunun okumak
   * istediği şey ("benim kapım mı rakibinki mi daha kalabalık") tam olarak
   * bu farkın içinde kayboluyordu.
   *
   * Şimdi araçlar satış oranına göre, EN BÜYÜK KALAN yöntemiyle
   * paylaştırılıyor: tam sayı kısımlar dağıtılıyor, artan araçlar en büyük
   * kesirli paya sahip mağazalara gidiyor. Böylece iki katı satan mağazanın
   * kapısında iki katı araç oluyor.
   *
   * Sıfır araç alan mağaza olabilir ve bu KASITLI. Çok az satan bir dükkân
   * sessiz görünmeli; "her mağazaya en az bir araç" kuralı, işlemeyen bir
   * mağazayı işliyor gibi gösterip oyuncunun görmesi gereken tek şeyi —
   * nerede geride kaldığını — saklardı.
   */
  setShoppers(flows: CustomerFlow[], resolve: FlowResolver): void {
    if (flows.length === 0) {
      this.shoppers = [];
      this.shopperMesh.count = 0;
      this.flowSignature = '';
      return;
    }

    const placed = flows
      .map((flow) => ({ flow, spot: resolve(flow) }))
      .filter((entry): entry is { flow: CustomerFlow; spot: PlacedFlow } => entry.spot !== null);
    if (placed.length === 0) {
      this.shoppers = [];
      this.shopperMesh.count = 0;
      this.flowSignature = '';
      return;
    }

    const allocation = this.allocate(placed);

    /*
     * FİLO BAŞTAN KURULMUYOR, FARK KADAR GÜNCELLENİYOR.
     *
     * Kamyonlarda imza yöntemi yetiyordu çünkü bir tedarik bacağı ya var
     * ya yok. Müşteri dağıtımı ise satış oranına bağlı ve o oran her gün
     * oynuyor — filoyu her değişimde sıfırdan kursaydık bütün araçlar aynı
     * anda başa ışınlanırdı. Oysa asıl istediğimiz şey akışın KAYMASI:
     * rakip pay aldıkça onun kapısına bir araç ekleniyor, seninkinden bir
     * tanesi eksiliyor, kalanlar yollarına devam ediyor.
     *
     * Bu yüzden imza mağaza-başına-araç vektörü: dağıtım aynıysa hiçbir
     * şey yapılmıyor, değiştiyse yalnızca farkı olan mağazalara dokunuluyor.
     */
    const signature = allocation.map((a) => `${a.storeId}:${a.count}`).join('|');
    if (signature === this.flowSignature) return;
    this.flowSignature = signature;

    const surviving = new Map<string, Shopper[]>();
    for (const shopper of this.shoppers) {
      const list = surviving.get(shopper.storeId);
      if (list) list.push(shopper);
      else surviving.set(shopper.storeId, [shopper]);
    }

    this.shoppers = [];
    for (const { storeId, spot, count } of allocation) {
      // Hâlâ yolda olanlar korunuyor: konumlarını, hızlarını, bekleme
      // sayaçlarını kaybetmiyorlar.
      const kept = (surviving.get(storeId) ?? []).slice(0, count);
      this.shoppers.push(...kept);

      for (let n = kept.length; n < count; n++) {
        const index = this.shoppers.length;
        const [dx, dy] = SHOPPER_ORIGINS[(index + n) % SHOPPER_ORIGINS.length]!;
        const origin = {
          x: spot.at.x + dx * SHOPPER_ORIGIN_BLOCKS * this.blockSize,
          y: spot.at.y + dy * SHOPPER_ORIGIN_BLOCKS * this.blockSize,
        };

        const path = this.buildPath(origin, spot.at);
        if (path.length < 2) continue;

        const lengths: number[] = [];
        let totalLength = 0;
        for (let s = 0; s + 1 < path.length; s++) {
          const length = path[s]!.distanceTo(path[s + 1]!);
          lengths.push(length);
          totalLength += length;
        }
        if (totalLength <= 0.01) continue;

        const inboundColor = new THREE.Color(spot.color);
        // Dönüşteki sönüklük kamyonlardakiyle aynı dil: parlak = iş
        // oluyor, sönük = bitti. Aynı sahnede iki farklı "geri dönüş"
        // gösterimi olsaydı ikisi de okunmazdı.
        const outboundColor = inboundColor.clone().lerp(new THREE.Color('#39414f'), 0.58);

        this.shoppers.push({
          storeId,
          path,
          lengths,
          totalLength,
          // Aynı mağazaya giden araçlar rotaya yayılıyor: kapıda kuyruk
          // değil, süregelen bir akış görünsün.
          travelled: (totalLength * ((n + 0.17) / (count + 1))) % totalLength,
          heading: 1,
          speed: 1.35 + ((index * 11) % 7) * 0.11,
          dwell: 0,
          inboundColor,
          outboundColor,
          paintedInbound: null,
          offsetX: 0,
          offsetZ: 0,
        });
      }
    }

    /*
     * Sıra değişti: korunan araçlar yeni dizide başka indekslere düştü.
     * Renk buffer'ı indekse yazıldığı ve `paintedInbound` "zaten boyandım"
     * dediği için, sıfırlanmazsa bir aracın rengi başka bir mağazanın
     * aracında kalırdı — rakip yeşile, oyuncu kırmızıya boyanırdı.
     */
    for (const shopper of this.shoppers) shopper.paintedInbound = null;

    this.applyShopperBudget();
  }

  /**
   * Araç bütçesini mağazalara satış oranında böler — en büyük kalan yöntemi.
   *
   * Basit yuvarlama neden yetmiyor: 54 aracı 42 mağazaya oranla dağıtırken
   * paylar çoğunlukla 0,5'in altında kalır, `Math.round` hepsini sıfırlar
   * ve sokak boşalır. Tam sayı kısımları dağıtıp ARTANI en büyük kesirlere
   * vermek hem toplamı bütçeye eşitliyor hem de sıralamayı koruyor.
   */
  private allocate(
    placed: Array<{ flow: CustomerFlow; spot: PlacedFlow }>,
  ): Array<{ storeId: string; spot: PlacedFlow; count: number }> {
    let total = 0;
    for (const entry of placed) total += entry.flow.units;
    if (total <= 0) return [];

    const quotas = placed.map((entry, index) => {
      const exact = (entry.flow.units / total) * SHOPPER_CAP;
      const whole = Math.min(SHOPPERS_PER_STORE_CAP, Math.floor(exact));
      return {
        index,
        storeId: entry.flow.buildingId,
        spot: entry.spot,
        count: whole,
        remainder: exact - Math.floor(exact),
      };
    });

    let used = quotas.reduce((sum, q) => sum + q.count, 0);
    // Artan araçlar en büyük kesirden başlayarak dağıtılıyor. Eşitlik
    // hâlinde liste sırası (yani satış sırası) belirliyor — sabit bir
    // ölçüt olmasa filo her senkronda başka bir mağazaya kayardı.
    const byRemainder = [...quotas].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (const quota of byRemainder) {
      if (used >= SHOPPER_CAP) break;
      if (quota.count >= SHOPPERS_PER_STORE_CAP) continue;
      quota.count++;
      used++;
    }

    return quotas
      .filter((q) => q.count > 0)
      .map((q) => ({ storeId: q.storeId, spot: q.spot, count: q.count }));
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
    this.updateShoppers(dt);
  }

  private updateCars(dt: number): void {
    // Yalnızca çizilenleri güncelle: bütçe kısıldığında CPU tarafı da
    // kısılsın, sadece görüntü değil.
    const drawn = Math.min(this.cars.length, this.carMesh.count);
    for (let i = 0; i < drawn; i++) {
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

  private updateShoppers(dt: number): void {
    if (this.shoppers.length === 0) return;
    let repaint = false;

    const drawn = Math.min(this.shoppers.length, this.shopperMesh.count);
    for (let i = 0; i < drawn; i++) {
      const shopper = this.shoppers[i]!;

      // Mağaza önünde bekliyorsa yalnızca sayaç işliyor; araç duruyor ve
      // matris zaten doğru yerde olduğu için yeniden yazmaya gerek yok.
      if (shopper.dwell > 0) {
        shopper.dwell -= dt;
        if (shopper.dwell <= 0) shopper.heading = -1;
        continue;
      }

      shopper.travelled += shopper.speed * shopper.heading * dt;

      if (shopper.travelled >= shopper.totalLength) {
        shopper.travelled = shopper.totalLength;
        // Kapıya vardı: alışverişi bitene kadar duruyor. Dönüş kararı
        // bekleme bitince veriliyor, burada değil.
        shopper.dwell = SHOPPER_DWELL;
      } else if (shopper.travelled <= 0) {
        shopper.travelled = 0;
        shopper.heading = 1;
      }

      const inbound = shopper.heading === 1;
      if (shopper.paintedInbound !== inbound) {
        this.shopperMesh.setColorAt(i, inbound ? shopper.inboundColor : shopper.outboundColor);
        shopper.paintedInbound = inbound;
        repaint = true;
      }

      let remaining = shopper.travelled;
      let segment = 0;
      while (segment < shopper.lengths.length - 1 && remaining > shopper.lengths[segment]!) {
        remaining -= shopper.lengths[segment]!;
        segment++;
      }
      const a = shopper.path[segment]!;
      const b = shopper.path[segment + 1]!;
      const length = shopper.lengths[segment] || 1;
      const t = Math.max(0, Math.min(1, remaining / length));

      const x = a.x + (b.x - a.x) * t;
      const z = a.y + (b.y - a.y) * t;
      const dx = (b.x - a.x) * shopper.heading;
      const dz = (b.y - a.y) * shopper.heading;

      const targetX = Math.abs(dz) > Math.abs(dx) ? (dz > 0 ? LANE_OFFSET : -LANE_OFFSET) : 0;
      const targetZ = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -LANE_OFFSET : LANE_OFFSET) : 0;
      const settle = Math.min(1, OFFSET_SETTLE * dt);
      shopper.offsetX += (targetX - shopper.offsetX) * settle;
      shopper.offsetZ += (targetZ - shopper.offsetZ) * settle;

      this.dummy.position.set(x + shopper.offsetX, SHOPPER_HEIGHT / 2 + 0.07, z + shopper.offsetZ);
      this.dummy.rotation.y = Math.atan2(-dz, dx);
      this.dummy.updateMatrix();
      this.shopperMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.shopperMesh.instanceMatrix.needsUpdate = true;
    if (repaint && this.shopperMesh.instanceColor) this.shopperMesh.instanceColor.needsUpdate = true;
  }

  /**
   * Veri lensi modu.
   *
   * Fon araçları susar — lenste manzara gürültüdür. Kamyonlar ve müşteri
   * araçları KALIR, çünkü onlar da veridir: ısı haritasının üstünde akan
   * zincir ve müşteri, iki bilgiyi üst üste okumanı sağlıyor ("talep
   * burada yüksek, ama müşteri rakibin kapısına gidiyor").
   */
  setDataLens(active: boolean): void {
    this.carMesh.visible = !active;
  }

  /**
   * Kalite kademesi: fon araçlarının kaçta kaçı çizilsin.
   *
   * Kamyonlar bu bütçeye DAHİL DEĞİL — onlar zincirin nerede aktığını
   * anlatıyor, yani bilgi. Kısılacak ilk şey her zaman süs olmalı.
   */
  setCarBudget(ratio: number): void {
    this.budget = Math.max(0, Math.min(1, ratio));
    this.carMesh.count = Math.round(this.cars.length * this.budget);
    this.applyShopperBudget();
  }

  /**
   * Müşteri araçları da kısılıyor ama TABANLA.
   *
   * Kamyonlar hiç kısılmıyor çünkü sayıları zincirin kendi büyüklüğüyle
   * sınırlı. Müşteri araçları ise şehir büyüdükçe tavana dayanıyor, yani
   * zayıf cihazda gerçek bir yük. Buna karşılık sıfıra indirmek olmaz:
   * kısılacak ilk şey süs olmalı, bilgi değil. Taban, en düşük kademede
   * bile akışın hangi kapıya gittiğinin okunabildiği yer.
   */
  private applyShopperBudget(): void {
    const floor = 0.45;
    const ratio = floor + (1 - floor) * this.budget;
    this.shopperMesh.count = Math.round(this.shoppers.length * ratio);
  }

  /** Testler için: kaç kamyon yolda. */
  get truckCount(): number {
    return this.trucks.length;
  }

  /** Testler için: kaç müşteri aracı yolda. */
  get shopperCount(): number {
    return this.shoppers.length;
  }

  /** Testler için: müşteri araçlarının rota üzerindeki toplam ilerlemesi. */
  get shopperPositionSum(): number {
    let sum = 0;
    for (const shopper of this.shoppers) sum += shopper.travelled;
    return sum;
  }

  /**
   * Testler için: müşteri araçlarının rengi, sahiplerine göre.
   *
   * Rekabetin görünürlüğünü sınayan kontrol buradan okuyor — sokakta
   * yalnızca oyuncunun rengi varsa akış rakibi anlatmıyor demektir.
   */
  get shopperColors(): string[] {
    return this.shoppers.map((shopper) => `#${shopper.inboundColor.getHexString()}`);
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
    for (const mesh of [this.carMesh, this.truckMesh, this.shopperMesh]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

