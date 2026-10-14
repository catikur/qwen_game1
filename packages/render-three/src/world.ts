import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Şehrin dışındaki dünya.
 *
 * Oyun raporu: *"belirlediğin harita dışı uzay gibi boşlukta. Orayı da
 * yeşillik yapsana, hafif yuvarlağımsı — dünyada olduğunu ve birçok alan
 * olduğunu belirtmek için."*
 *
 * Rapor haklıydı ve sebebi koddaydı: zemin yalnızca harita KARELERİNDEN
 * oluşuyordu (`ground` örnek ağı). Onun bittiği yerde hiçbir şey yoktu,
 * arkadaki gökyüzü rengi görünüyordu. Yani şehir bir gezegenin üstünde
 * değil, boşlukta yüzen bir tepsiydi.
 *
 * Burada üç şey yapılıyor:
 *
 * 1. KIRSAL — şehri çevreleyen, haritanın birkaç katı büyüklükte bir
 *    zemin. Şehir artık bir yerin İÇİNDE.
 * 2. EĞRİLİK — zemin uzaklaştıkça alçalıyor. Düz bir tabak da boşluğu
 *    doldururdu ama ufuk çizgisi bıçak gibi düz kalırdı; alçalan bir
 *    yüzey "burası bir küre" diyor.
 * 3. UZAK YERLEŞİMLER — ufukta birkaç küçük yerleşim kümesi. "Birçok
 *    alan" fikrini taşıyan şey bu: şehrin tek yer olmadığı, gidilecek
 *    başka yerler bulunduğu.
 *
 * Hiçbiri simülasyona bağlı değil ve bilinçli: bu katman MANZARA, bilgi
 * değil. Sokakta akan kamyon ve müşteriden farkı tam olarak bu — onlar
 * veriyi anlatıyor, burası yalnızca oyunun geçtiği yeri.
 */

/** Kırsalın yarıçapı, harita kenarının katı olarak. */
const WORLD_SPAN = 4.2;

/**
 * Sanal gezegen yarıçapı.
 *
 * Zemin `y = -(r² / 2R)` ile alçalıyor — küre yüzeyinin küçük açılardaki
 * yaklaşımı. Değer büyüdükçe eğrilik azalıyor. 520, haritanın kenarında
 * eğriliğin fark edilmediği ama ufukta belirgin olduğu yer: şehrin
 * düzlüğü bozulmuyor, uzak kenar aşağı kıvrılıyor.
 *
 * Küçük denendi (180) ve şehir bir tepenin üstünde duruyor gibi oldu —
 * kameranın alçak açılarında harita kenarları görüş alanından çıkıyordu.
 */
const PLANET_RADIUS = 520;

/** Kırsal ağının bölünme sayısı — eğriliğin pürüzsüz görünmesi için. */
const TERRAIN_SEGMENTS = 96;

/** Uzak yerleşim sayısı ve her birindeki bina sayısı. */
const SETTLEMENTS = 7;
const BUILDINGS_PER_SETTLEMENT = 26;

/**
 * Kırsal ağaçları (Tur 34): orman kümeleri ve tek tük ağaçlar. Sayı en üst
 * kademe için; düşük kademede bütçe kadarı çiziliyor (sıra karıştırılmış,
 * yani baştaki her kesit kırsala eşit dağılıyor).
 */
const FOREST_CLUSTERS = 46;
const SCATTERED_TREES = 260;

/** Yaprak dökenler ve iğne yapraklılar — eski dokunun yeşilleriyle aynı aile. */
const BROADLEAF_GREENS = ['#5e9a4a', '#4f8a3f', '#6aa556', '#5a8f47', '#78a85a'];
const CONIFER_GREENS = ['#3f6e3c', '#476f3e', '#365f35', '#4c7a44'];

/** Deterministik gürültü: dünya her açılışta aynı olsun. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Kırsal dokusu.
 *
 * Tek düz yeşil, oyunun geri kalanının yanında ucuz duruyor. Doku üç şey
 * taşıyor: tarla parçaları (insanın işlediği toprak), koyu ağaç kümeleri
 * ve hafif bir tonal gürültü. Hepsi düşük doygunlukta — kırsal, şehrin
 * ve arayüzün önüne geçmemeli.
 */
function makeTerrainTexture(): THREE.CanvasTexture {
  const size = 512;
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D bağlamı alınamadı — kırsal dokusu üretilemez.');

  ctx.fillStyle = '#8ea375';
  ctx.fillRect(0, 0, size, size);

  // Tarlalar: eksene hizalı, farklı tonlarda dikdörtgenler. Hizalı
  // olmaları tesadüf değil — işlenmiş toprak parsellere bölünür ve bu,
  // oyunun kendi konusunun kırsaldaki karşılığı.
  for (let i = 0; i < 120; i++) {
    const w = 18 + hash(i * 1.7) * 70;
    const h = 14 + hash(i * 3.3) * 52;
    const tone = hash(i * 5.9);
    const r = 128 + Math.round(tone * 34);
    const g = 148 + Math.round(tone * 26);
    const b = 102 + Math.round(tone * 30);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(hash(i * 11.3) * size, hash(i * 13.7) * size, w, h);
  }

  // Ağaç kümeleri artık dokuda değil (Tur 34): boyalı koyu lekeler yukarıdan
  // "ağaç" değil "leke" okunuyordu. Kırsalın ağaçları gerçek, örneklenmiş
  // 3B ağaçlar (`CountrysideTrees`).

  // Tanecik: düz alanlarda bantlaşmayı kırıyor.
  for (let i = 0; i < 5200; i++) {
    const v = hash(i * 23.7);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + v * 0.05})`;
    ctx.fillRect(hash(i * 29.1) * size, hash(i * 31.3) * size, 1.6, 1.6);
  }

  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Bir parçayı tek renge boyar (köşe rengi); dizinsiz, UV'siz. */
function painted(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const color = new THREE.Color(hex);
  const count = g.attributes['position']!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Yaprak döken: gövde + yirmiyüzlü taç (şehrin sokak ağaçlarıyla aynı aile), taban y=0. */
function broadleafGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.42, 5);
  trunk.translate(0, 0.21, 0);
  const crown = new THREE.IcosahedronGeometry(0.38, 0);
  crown.scale(1, 1.12, 1);
  crown.translate(0, 0.78, 0);
  const merged = mergeGeometries([painted(trunk, '#6b4f36'), painted(crown, '#ffffff')]);
  merged.computeVertexNormals();
  return merged;
}

/** İğne yapraklı: gövde + iki üst üste koni, taban y=0. */
function coniferGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.05, 0.08, 0.34, 5);
  trunk.translate(0, 0.17, 0);
  const lower = new THREE.ConeGeometry(0.36, 0.7, 7);
  lower.translate(0, 0.6, 0);
  const upper = new THREE.ConeGeometry(0.26, 0.56, 7);
  upper.translate(0, 0.98, 0);
  const merged = mergeGeometries([painted(trunk, '#5e4430'), painted(lower, '#f0f0f0'), painted(upper, '#ffffff')]);
  merged.computeVertexNormals();
  return merged;
}

export class World {
  readonly group = new THREE.Group();

  private terrain: THREE.Mesh;
  private terrainMaterial: THREE.MeshStandardMaterial;
  private settlements: THREE.InstancedMesh;
  private settlementMaterial: THREE.MeshStandardMaterial;
  private broadleaf: THREE.InstancedMesh;
  private conifers: THREE.InstancedMesh;
  private treeMaterial: THREE.MeshStandardMaterial;
  private broadleafTotal = 0;
  private coniferTotal = 0;

  constructor(mapWidth: number, mapHeight: number) {
    const cx = (mapWidth - 1) / 2;
    const cz = (mapHeight - 1) / 2;
    const span = Math.max(mapWidth, mapHeight) * WORLD_SPAN;

    const geometry = new THREE.PlaneGeometry(span, span, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    /*
     * EĞRİLİK VE ŞEHRİN DÜZLÜĞÜ BİR ARADA.
     *
     * Yalnızca `y = -(r²/2R)` uygulasaydım şehrin altındaki zemin de
     * kıvrılırdı ve harita kareleri (hepsi y=0 düzleminde) kırsalın
     * içine gömülürdü. Bu yüzden alçalma şehir yarıçapına kadar
     * bastırılıyor: içeride tam düz, dışarıda kübik bir geçişle
     * küresel forma açılıyor.
     */
    const position = geometry.attributes['position'] as THREE.BufferAttribute;
    const flatRadius = Math.max(mapWidth, mapHeight) * 0.62;
    const falloff = span * 0.5 - flatRadius;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const r = Math.hypot(x, z);
      if (r <= flatRadius) continue;
      const t = Math.min(1, (r - flatRadius) / Math.max(1, falloff));
      const eased = t * t * (3 - 2 * t);
      position.setY(i, -((r * r) / (2 * PLANET_RADIUS)) * eased);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const texture = makeTerrainTexture();
    texture.repeat.set(span / 26, span / 26);

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.97,
      metalness: 0,
    });
    this.terrain = new THREE.Mesh(geometry, this.terrainMaterial);
    this.terrain.position.set(cx, -0.02, cz);
    // Gölge ALIYOR ama vermiyor: şehrin gölgeleri kırsala düşsün,
    // kırsalın kendisi gölge haritasına yazılıp bütçe yemesin.
    this.terrain.receiveShadow = true;
    this.terrain.frustumCulled = false;
    this.group.add(this.terrain);

    /*
     * UZAK YERLEŞİMLER.
     *
     * "Birçok alan" fikrini taşıyan parça. Şehirden uzakta, birbirinden
     * ayrı kümeler hâlinde duruyorlar; küçük ve alçaklar, çünkü ufukta
     * bir SİLUET olmaları yeterli — oynanabilir bir yer değiller.
     *
     * Işıktan bağımsız değiller: gece onların da kararması gerekiyor,
     * yoksa karanlık bir dünyanın üstünde parlayan lekeler olurlardı.
     */
    this.settlementMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.02,
      color: '#9aa08c',
    });
    this.settlements = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      this.settlementMaterial,
      SETTLEMENTS * BUILDINGS_PER_SETTLEMENT,
    );
    this.settlements.frustumCulled = false;
    this.settlements.castShadow = false;
    this.settlements.receiveShadow = false;

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let slot = 0;
    for (let s = 0; s < SETTLEMENTS; s++) {
      // Kümeler bir halka üzerine dağılıyor: şehre çok yakın olsalar
      // haritanın devamı sanılır, çok uzak olsalar sisin içinde kaybolur.
      const angle = (s / SETTLEMENTS) * Math.PI * 2 + hash(s * 3.7) * 0.9;
      const distance = flatRadius * (1.55 + hash(s * 7.1) * 1.15);
      const sx = cx + Math.cos(angle) * distance;
      const sz = cz + Math.sin(angle) * distance;
      const drop = (distance * distance) / (2 * PLANET_RADIUS);

      for (let b = 0; b < BUILDINGS_PER_SETTLEMENT; b++) {
        const n = s * 100 + b;
        /*
         * Yayılım dar tutuluyor. İlk denemede 3–12 birimdi ve kümeler
         * ufukta köy gibi değil, zemine saçılmış moloz gibi okunuyordu.
         * Bir yerleşimin okunması için binaların birbirine YAKIN olması
         * gerekiyor — mesafeyi kümelerin arası taşır, kümenin içi değil.
         */
        const spread = 1.6 + hash(n * 1.9) * 3.4;
        const bx = sx + (hash(n * 5.3) - 0.5) * spread * 2;
        const bz = sz + (hash(n * 9.7) - 0.5) * spread * 2;
        const height = 0.5 + hash(n * 13.1) * 2.4;
        const width = 0.7 + hash(n * 15.9) * 0.9;

        dummy.position.set(bx, -drop + height / 2, bz);
        dummy.scale.set(width, height, width);
        dummy.rotation.y = hash(n * 21.3) * Math.PI;
        dummy.updateMatrix();
        this.settlements.setMatrixAt(slot, dummy.matrix);

        const shade = 0.72 + hash(n * 27.7) * 0.28;
        tint.setRGB(shade * 0.62, shade * 0.6, shade * 0.55);
        this.settlements.setColorAt(slot, tint);
        slot++;
      }
    }
    this.settlements.count = slot;
    this.settlements.instanceMatrix.needsUpdate = true;
    if (this.settlements.instanceColor) this.settlements.instanceColor.needsUpdate = true;
    this.group.add(this.settlements);

    /*
     * KIRSAL AĞAÇLARI (Tur 34).
     *
     * Eski kırsalda ağaçlar dokuya boyanmış koyu lekelerdi ve oyuncu
     * haklı olarak "ağaç değil leke" dedi. Artık gerçek ağaçlar: orman
     * kümeleri (biri iğne yapraklı ağırlıklı, biri karışık) ve tarlaların
     * arasında tek tük ağaçlar. Hepsi iki örnek ağında, iki çizim çağrısı.
     *
     * Yerleşim kuralları:
     *   - şehrin karesinin DIŞINDA (bir kare pay ile) — harita ağaçla
     *     karışmasın;
     *   - uzak yerleşimlerin içinde değil;
     *   - zeminin eğriliğini izliyor (`heightAt`), havada kalmıyor;
     *   - sisin tam içine kadar değil: oradaki ağaç zaten görünmüyor.
     *
     * Gölge düşürmüyorlar: güneşin gölge kamerası şehri kapsıyor, kırsal
     * ağaçları onun dışında ve her kare yeniden çizilmeleri boşa bütçe.
     */
    const settlementCenters: { x: number; z: number }[] = [];
    for (let s = 0; s < SETTLEMENTS; s++) {
      const angle = (s / SETTLEMENTS) * Math.PI * 2 + hash(s * 3.7) * 0.9;
      const distance = flatRadius * (1.55 + hash(s * 7.1) * 1.15);
      settlementCenters.push({ x: cx + Math.cos(angle) * distance, z: cz + Math.sin(angle) * distance });
    }
    const heightAt = (x: number, z: number): number => {
      const r = Math.hypot(x - cx, z - cz);
      if (r <= flatRadius) return 0;
      const t = Math.min(1, (r - flatRadius) / Math.max(1, falloff));
      const eased = t * t * (3 - 2 * t);
      return -((r * r) / (2 * PLANET_RADIUS)) * eased;
    };
    const halfW = mapWidth / 2 + 1;
    const halfH = mapHeight / 2 + 1;
    const maxR = span * 0.4;
    const allowed = (x: number, z: number): boolean => {
      if (Math.abs(x - cx) < halfW && Math.abs(z - cz) < halfH) return false;
      if (Math.hypot(x - cx, z - cz) > maxR) return false;
      for (const c of settlementCenters) if (Math.hypot(x - c.x, z - c.z) < 7) return false;
      return true;
    };

    interface TreeSpot { x: number; z: number; scale: number; yaw: number; conifer: boolean; tone: number }
    const spots: TreeSpot[] = [];
    for (let k = 0; k < FOREST_CLUSTERS; k++) {
      const angle = hash(k * 4.3 + 0.7) * Math.PI * 2;
      const radius = Math.max(halfW, halfH) * 1.1 + hash(k * 6.1 + 1.3) * (maxR - Math.max(halfW, halfH) * 1.1);
      const fx = cx + Math.cos(angle) * radius;
      const fz = cz + Math.sin(angle) * radius;
      const pine = hash(k * 8.9 + 2.1);
      const size = 10 + Math.floor(hash(k * 2.3 + 0.4) * 24);
      const extent = 1.6 + hash(k * 5.7) * 2.6;
      for (let t = 0; t < size; t++) {
        const n = k * 97 + t;
        // Kümenin ortası sık, kenarı seyrek: kare kök dağılım.
        const r = Math.sqrt(hash(n * 1.31)) * extent;
        const a = hash(n * 2.17) * Math.PI * 2;
        const x = fx + Math.cos(a) * r;
        const z = fz + Math.sin(a) * r;
        if (!allowed(x, z)) continue;
        spots.push({ x, z, scale: 0.85 + hash(n * 3.7) * 0.6, yaw: hash(n * 4.9) * Math.PI * 2, conifer: hash(n * 6.3) < pine, tone: hash(n * 7.7) });
      }
    }
    for (let t = 0; t < SCATTERED_TREES; t++) {
      const angle = hash(t * 9.13 + 3.1) * Math.PI * 2;
      const radius = Math.max(halfW, halfH) + hash(t * 11.7 + 0.9) * (maxR - Math.max(halfW, halfH));
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (!allowed(x, z)) continue;
      spots.push({ x, z, scale: 0.8 + hash(t * 13.1) * 0.5, yaw: hash(t * 15.3) * Math.PI * 2, conifer: hash(t * 17.9) < 0.25, tone: hash(t * 19.7) });
    }
    // Sıra karıştırılıyor: düşük kademe baştan bir kesit çizince kırsala eşit dağılsın.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(hash(i * 1.618 + 0.33) * (i + 1));
      [spots[i], spots[j]] = [spots[j]!, spots[i]!];
    }

    this.treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const broadSpots = spots.filter((spot) => !spot.conifer);
    const pineSpots = spots.filter((spot) => spot.conifer);
    const place = (geometry: THREE.BufferGeometry, list: TreeSpot[], greens: string[]): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(geometry, this.treeMaterial, Math.max(1, list.length));
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      list.forEach((spot, i) => {
        dummy.position.set(spot.x, heightAt(spot.x, spot.z) - 0.04, spot.z);
        dummy.scale.setScalar(spot.scale);
        dummy.rotation.set(0, spot.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.set(greens[Math.floor(spot.tone * greens.length)]!);
        mesh.setColorAt(i, tint);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      return mesh;
    };
    this.broadleaf = place(broadleafGeometry(), broadSpots, BROADLEAF_GREENS);
    this.conifers = place(coniferGeometry(), pineSpots, CONIFER_GREENS);
    this.broadleafTotal = broadSpots.length;
    this.coniferTotal = pineSpots.length;
  }

  /** Kalite kademesi: kırsal ağaçlarının ne kadarı çizilsin (0..1). */
  setTreeBudget(fraction: number): void {
    const f = Math.max(0, Math.min(1, fraction));
    this.broadleaf.count = Math.round(this.broadleafTotal * f);
    this.conifers.count = Math.round(this.coniferTotal * f);
  }

  /**
   * Kırsalı günün saatine bağlar.
   *
   * Şehir zaten ışıkla kararıyor ama kırsal çok geniş bir yüzey: aynı
   * ışıkla bırakılınca gece boyunca şehirden daha aydınlık kalıyor ve
   * göz oraya kayıyordu. Ek bir karartma, şehri sahnenin merkezinde
   * tutuyor.
   */
  setDaylight(daylight: number): void {
    const level = 0.34 + daylight * 0.66;
    this.terrainMaterial.color.setRGB(level, level, level);
    this.settlementMaterial.color.setRGB(
      level * 0.62,
      level * 0.63,
      level * 0.56,
    );
    this.treeMaterial.color.setRGB(level, level, level);
  }

  /** Veri lensinde kırsal susuyor: lens bir harita, manzara gürültü. */
  setDataLens(active: boolean): void {
    this.group.visible = !active;
  }

  /** Testler için: kırsalın kapladığı kenar uzunluğu. */
  get span(): number {
    return (this.terrain.geometry as THREE.PlaneGeometry).parameters.width;
  }

  /** Testler için: ufuktaki yerleşim binası sayısı. */
  get settlementCount(): number {
    return this.settlements.count;
  }

  /** Testler için: kırsalda çizilen ağaç sayısı (kademe bütçesiyle). */
  get treeCount(): number {
    return this.broadleaf.count + this.conifers.count;
  }

  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrainMaterial.map?.dispose();
    this.terrainMaterial.dispose();
    this.settlements.geometry.dispose();
    this.settlementMaterial.dispose();
    this.broadleaf.geometry.dispose();
    this.conifers.geometry.dispose();
    this.treeMaterial.dispose();
  }
}
