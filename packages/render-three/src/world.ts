import * as THREE from 'three';

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

  // Ağaç kümeleri: koyu, yumuşak lekeler.
  for (let i = 0; i < 260; i++) {
    const radius = 3 + hash(i * 2.9) * 9;
    const shade = 74 + Math.round(hash(i * 6.1) * 24);
    ctx.fillStyle = `rgba(${shade - 12}, ${shade + 22}, ${shade - 26}, 0.72)`;
    ctx.beginPath();
    ctx.arc(hash(i * 17.1) * size, hash(i * 19.3) * size, radius, 0, Math.PI * 2);
    ctx.fill();
  }

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

export class World {
  readonly group = new THREE.Group();

  private terrain: THREE.Mesh;
  private terrainMaterial: THREE.MeshStandardMaterial;
  private settlements: THREE.InstancedMesh;
  private settlementMaterial: THREE.MeshStandardMaterial;

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

  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrainMaterial.map?.dispose();
    this.terrainMaterial.dispose();
    this.settlements.geometry.dispose();
    this.settlementMaterial.dispose();
  }
}
