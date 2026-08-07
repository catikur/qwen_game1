import * as THREE from 'three';
import { BUILDING_BY_ID, DISTRICT_ARCHETYPES, STRUCTURE_BY_ID } from '@capital/content';
import { BLOCK_SIZE, lensValue, supplyRoutes } from '@capital/core';
import type { GameState, LensId } from '@capital/core';
import { RtsCameraController } from './camera';
import { TrafficSystem } from './traffic';

/**
 * Şehir sahnesi.
 *
 * Bu katman oyun kurallarını bilmez: elindeki `GameState`'i alır ve çizer.
 * Ne satın alma kuralı ne fiyat formülü burada geçer — sadece "hangi karede
 * ne renk, ne yükseklikte kutu var" sorusu.
 *
 * Performans için her şey instanced: 576 zemin karesi tek çizim çağrısı,
 * tüm binalar tek çizim çağrısı.
 */

export interface ViewOptions {
  lens: LensId;
  selectedTileId: number | null;
  ghostDefId: string | null;
  playerCompanyId: string;
}

export interface RendererCallbacks {
  onHover(tileId: number | null): void;
  onSelect(tileId: number): void;
}

/** Veri lensinde binaların siluet saydamlığı. */
const SILHOUETTE_OPACITY = 0.26;

/** Gün döngüsünün iki ucu — ton üzerinden geçmemek için sabit renkler. */
const MOONLIGHT = new THREE.Color('#9db9e8');
const SUNLIGHT = new THREE.Color('#ffe6bd');
const NIGHT_SKY_LIGHT = new THREE.Color('#5f7796');
const DAY_SKY_LIGHT = new THREE.Color('#8fb6d9');

const LENS_COLD = new THREE.Color('#1d3b57');
const LENS_HOT = new THREE.Color('#f0654a');
const OWN_COLOR = new THREE.Color('#3ba55d');
const FREE_COLOR = new THREE.Color('#2a3446');

export class CityRenderer {
  readonly controller: RtsCameraController;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private ground: THREE.InstancedMesh;
  private groundLit!: THREE.MeshStandardMaterial;
  private groundFlat!: THREE.MeshBasicMaterial;
  private buildings: THREE.InstancedMesh;
  /** Şehrin mevcut dokusu — oyuncuya ait olmayan yapılar. */
  private fabric: THREE.InstancedMesh;
  private traffic: TrafficSystem;
  private sun!: THREE.DirectionalLight;
  private hemisphere!: THREE.HemisphereLight;
  private skyColor = new THREE.Color();
  /** 0..1 arasında dönen gün döngüsü; simülasyondan bağımsız, tamamen görsel. */
  private timeOfDay = 0.28;
  /** Veri lensi açıkken sahne "bilgi modu"na geçer. */
  private dataLensActive = false;
  private activeLens: LensId = 'none';
  private hover: THREE.Mesh;
  private selection: THREE.Mesh;
  private ghost: THREE.Mesh;
  private districtLines: THREE.LineSegments;

  private state: GameState | null = null;
  private view: ViewOptions = {
    lens: 'none',
    selectedTileId: null,
    ghostDefId: null,
    playerCompanyId: 'player',
  };

  private hoveredTile: number | null = null;
  private groundPlaced = false;
  private pointer = new THREE.Vector2();
  private groundPoint = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private disposed = false;
  private cleanups: Array<() => void> = [];
  private frameSamples = 0;
  private frameTimeSum = 0;
  private qualityReduced = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: RendererCallbacks,
    private mapWidth: number,
    private mapHeight: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color('#0a1017');
    this.scene.fog = new THREE.Fog('#0a1017', 55, 130);

    this.controller = new RtsCameraController(canvas.clientWidth / canvas.clientHeight, {
      width: mapWidth,
      height: mapHeight,
    });

    this.setupLights(mapWidth, mapHeight);

    const tileCount = mapWidth * mapHeight;

    // Zemin için iki malzeme: şehir görünümünde ışık alan, veri lensinde
    // ışıktan bağımsız. Bir ısı haritası akşam olunca okunaksızlaşmamalı —
    // lens bilgi taşır, manzara değil.
    this.groundLit = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 });
    this.groundFlat = new THREE.MeshBasicMaterial();

    this.ground = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.94, 0.14, 0.94),
      this.groundLit,
      tileCount,
    );
    this.ground.receiveShadow = true;
    this.ground.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.ground);

    this.buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.68, 1, 0.68),
      new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08 }),
      tileCount,
    );
    this.buildings.castShadow = true;
    this.buildings.receiveShadow = true;
    this.buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.buildings.count = 0;
    this.scene.add(this.buildings);

    this.fabric = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.8, 1, 0.8),
      new THREE.MeshStandardMaterial({
        roughness: 0.85,
        metalness: 0.03,
        emissive: new THREE.Color('#ffcf7a'),
        emissiveIntensity: 0,
      }),
      tileCount,
    );
    this.fabric.castShadow = true;
    this.fabric.receiveShadow = true;
    this.fabric.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fabric.count = 0;
    this.scene.add(this.fabric);

    // Fon aracı sayısı 72'den 48'e indi: kamyonlar geldiğinde sokaklar
    // eskisinden daha kalabalıktı ve zincir akışı gürültünün içinde
    // kayboluyordu. Fon araçları ortamı kurar, kamyonlar bilgi taşır.
    this.traffic = new TrafficSystem(mapWidth, mapHeight, BLOCK_SIZE, 48);
    this.scene.add(this.traffic.group);

    this.hover = makeMarker('#7fd4ff', 0.32);
    this.selection = makeMarker('#ffd166', 0.85);
    this.scene.add(this.hover, this.selection);

    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 1, 0.68),
      new THREE.MeshStandardMaterial({
        color: '#7fd4ff',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.districtLines = makeDistrictLines(mapWidth, mapHeight);
    this.scene.add(this.districtLines);

    this.bindInput();
    this.resize();
  }

  private setupLights(width: number, height: number): void {
    this.hemisphere = new THREE.HemisphereLight('#8fb6d9', '#12161d', 1.15);
    this.scene.add(this.hemisphere);

    const sun = new THREE.DirectionalLight('#ffe9c7', 2.1);
    this.sun = sun;
    sun.position.set(width * 0.55, 42, height * 0.15);
    sun.target.position.set(width / 2, 0, height / 2);
    sun.castShadow = true;
    // 1024, şehir ölçeğinde 2048 ile neredeyse aynı görünüyor ama gölge
    // geçişinin dolgu maliyetini dörtte bire indiriyor — zayıf cihazlarda
    // fark ciddi.
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    const extent = Math.max(width, height) * 0.75;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
  }

  // ------------------------------------------------------------- girdi

  private bindInput(): void {
    let dragging: 'none' | 'pan' | 'rotate' = 'none';
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      this.canvas.setPointerCapture(e.pointerId);
      dragging = e.button === 2 || e.shiftKey ? 'rotate' : 'pan';
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (dragging === 'pan') {
        moved += Math.abs(dx) + Math.abs(dy);
        this.controller.pan(dx, dy);
      } else if (dragging === 'rotate') {
        moved += Math.abs(dx) + Math.abs(dy);
        this.controller.rotate(dx, dy);
      }

      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.updateHover();
    };

    const onPointerUp = (e: PointerEvent) => {
      // Sürükleme değil tıklama ise seçim yap.
      if (dragging === 'pan' && moved < 6 && this.hoveredTile !== null) {
        this.callbacks.onSelect(this.hoveredTile);
      }
      dragging = 'none';
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.controller.zoom(e.deltaY);
    };

    const onLeave = () => {
      this.hoveredTile = null;
      this.callbacks.onHover(null);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      this.controller.onKey(e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => this.controller.onKey(e.code, false);
    const onBlur = () => this.controller.clearKeys();

    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', onPointerUp);
    this.canvas.addEventListener('pointerleave', onLeave);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      this.canvas.removeEventListener('pointermove', onPointerMove);
      this.canvas.removeEventListener('pointerup', onPointerUp);
      this.canvas.removeEventListener('pointerleave', onLeave);
      this.canvas.removeEventListener('wheel', onWheel);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  private updateHover(): void {
    if (!this.state) return;

    const hit = this.controller.screenToGround(this.pointer.x, this.pointer.y, this.groundPoint);
    let tileId: number | null = null;

    if (hit) {
      const x = Math.round(this.groundPoint.x);
      const y = Math.round(this.groundPoint.z);
      if (x >= 0 && y >= 0 && x < this.state.map.width && y < this.state.map.height) {
        tileId = y * this.state.map.width + x;
      }
    }

    if (tileId !== this.hoveredTile) {
      this.hoveredTile = tileId;
      this.callbacks.onHover(tileId);
    }
  }

  // ------------------------------------------------------------ senkron

  /**
   * Görünüm modunu uygular.
   *
   * "Şehir" görünümünde sahne bir şehirdir: ışık, gölge, trafik, katı
   * binalar. Herhangi bir veri lensinde sahne bir haritaya dönüşür:
   * zemin ışıktan bağımsız çizilir (renk tam olarak veriyi gösterir),
   * binalar saydam siluete iner, gölge ve trafik susar.
   */
  private applyLensMode(lens: LensId): void {
    const dataLens = lens !== 'none';
    this.dataLensActive = dataLens;
    this.activeLens = lens;

    this.ground.material = dataLens ? this.groundFlat : this.groundLit;
    this.ground.receiveShadow = !dataLens;

    for (const mesh of [this.buildings, this.fabric]) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.transparent !== dataLens) {
        material.transparent = dataLens;
        material.needsUpdate = true;
      }
      material.opacity = dataLens ? SILHOUETTE_OPACITY : 1;
      material.depthWrite = !dataLens;
      mesh.castShadow = !dataLens && !this.qualityReduced;
      mesh.receiveShadow = !dataLens;
    }

    this.traffic.setDataLens(dataLens);
    this.renderer.shadowMap.enabled = !dataLens && !this.qualityReduced;

    // Pencere parıltısını burada da sıfırla. Bir sonraki gün-döngüsü
    // karesini beklemek, lens açılırken bir karelik amber parlama
    // bırakıyordu.
    if (dataLens) (this.fabric.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  }

  /** State veya görünüm değiştiğinde çağrılır; her karede değil. */
  syncState(state: GameState, view: ViewOptions): void {
    this.state = state;
    this.view = view;
    this.applyLensMode(view.lens);

    const { width, tiles } = state.map;

    // Zemin karelerinin konumu hiç değişmez; matrisleri yalnızca bir kez yaz.
    // Her günde 576 matris yeniden hesaplamak boşa işti.
    if (!this.groundPlaced) {
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]!;
        // Sokaklar biraz alçak ve kenarsız; parseller yükseltilmiş bloklar.
        const road = tile.kind === 'road';
        this.dummy.position.set(tile.x, road ? -0.03 : 0, tile.y);
        this.dummy.scale.set(road ? 1.07 : 1, road ? 0.55 : 1, road ? 1.07 : 1);
        this.dummy.updateMatrix();
        this.ground.setMatrixAt(i, this.dummy.matrix);
      }
      this.ground.instanceMatrix.needsUpdate = true;
      this.groundPlaced = true;
    }

    for (let i = 0; i < tiles.length; i++) {
      this.ground.setColorAt(i, this.tileColor(state, tiles[i]!.id, view));
    }
    if (this.ground.instanceColor) this.ground.instanceColor.needsUpdate = true;

    // Şehrin mevcut dokusu: oyuncuya ait olmayan yapılar.
    let fabricIndex = 0;
    for (const tile of tiles) {
      if (!tile.structureId) continue;
      const structure = STRUCTURE_BY_ID[tile.structureId];
      if (!structure) continue;

      const height = Math.max(0.03, tile.structureHeight) * 1.5;
      this.dummy.position.set(tile.x, height / 2 + 0.07, tile.y);
      this.dummy.scale.set(1, height, 1);
      this.dummy.updateMatrix();
      this.fabric.setMatrixAt(fabricIndex, this.dummy.matrix);

      // Aynı yapı tipinden sıkıcı bir tekrar çıkmasın diye kareye göre
      // deterministik küçük bir renk sapması veriyoruz.
      const jitter = ((tile.id * 37) % 17) / 17 - 0.5;
      this.color.set(structure.color).offsetHSL(jitter * 0.02, 0, jitter * 0.07);
      this.fabric.setColorAt(fabricIndex, this.color);
      fabricIndex++;
    }
    this.fabric.count = fabricIndex;
    this.fabric.instanceMatrix.needsUpdate = true;
    if (this.fabric.instanceColor) this.fabric.instanceColor.needsUpdate = true;

    let index = 0;
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      const tile = tiles[building.tileId];
      if (!def || !tile) continue;

      const height = Math.max(0.3, def.height) * 1.5;
      this.dummy.position.set(tile.x, height / 2 + 0.07, tile.y);
      this.dummy.scale.set(1, height, 1);
      this.dummy.rotation.y = 0;
      this.dummy.updateMatrix();
      this.buildings.setMatrixAt(index, this.dummy.matrix);

      // Rakip binaları sahibinin rengiyle hafifçe boyanır: kimin nerede
      // olduğu haritaya bakınca anlaşılmalı.
      const company = state.companies[building.companyId];
      this.color.set(def.color);
      if (company && !company.isPlayer) this.color.lerp(new THREE.Color(company.color), 0.55);
      else this.color.lerp(new THREE.Color('#8ef0c0'), 0.12);
      this.buildings.setColorAt(index, this.color);
      index++;
    }
    this.buildings.count = index;
    this.buildings.instanceMatrix.needsUpdate = true;
    if (this.buildings.instanceColor) this.buildings.instanceColor.needsUpdate = true;

    if (view.selectedTileId !== null) {
      const tile = tiles[view.selectedTileId];
      this.selection.visible = Boolean(tile);
      if (tile) this.selection.position.set(tile.x, 0.1, tile.y);
    } else {
      this.selection.visible = false;
    }

    this.syncRoutes(state, view.playerCompanyId);
    this.syncGhost(width);
  }

  /**
   * Zincir kamyonlarını state'e bağlar.
   *
   * Rotanın kendisini motor türetiyor (`supplyRoutes`); burada yapılan tek
   * şey bacakları şehir koordinatına ve şirket rengine çevirmek. Liste
   * değişmediyse `setRoutes` erken çıkıyor, yani kamyonlar her gün
   * yeniden kurulmuyor.
   */
  private syncRoutes(state: GameState, playerCompanyId: string): void {
    const legs = supplyRoutes(state, playerCompanyId);
    this.traffic.setRoutes(legs, (leg) => {
      const from = state.map.tiles[leg.fromTileId];
      const to = state.map.tiles[leg.toTileId];
      if (!from || !to) return null;
      const company = state.companies[leg.companyId];
      return {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        // Oyuncunun kamyonları kendi şirket rengini değil, binalarında
        // kullanılan nane yeşilinin daha doygun tonunu taşıyor: "benimki"
        // tek bakışta ayrılsın ama ışıksız çizildiği için beyaza kaçmasın.
        color: company?.isPlayer ? '#3fd39a' : (company?.color ?? '#8899aa'),
      };
    });
  }

  private syncGhost(width: number): void {
    const def = this.view.ghostDefId ? BUILDING_BY_ID[this.view.ghostDefId] : undefined;
    if (!def || this.hoveredTile === null || !this.state) {
      this.ghost.visible = false;
      return;
    }

    const tile = this.state.map.tiles[this.hoveredTile];
    if (!tile) {
      this.ghost.visible = false;
      return;
    }

    const valid = tile.ownerId === this.view.playerCompanyId && !tile.buildingId;
    const height = Math.max(0.3, def.height) * 1.5;
    this.ghost.position.set(this.hoveredTile % width, height / 2 + 0.07, Math.floor(this.hoveredTile / width));
    this.ghost.scale.set(1, height, 1);
    (this.ghost.material as THREE.MeshStandardMaterial).color.set(valid ? '#7fd4ff' : '#e2574c');
    this.ghost.visible = true;
  }

  private tileColor(state: GameState, tileId: number, view: ViewOptions): THREE.Color {
    const tile = state.map.tiles[tileId]!;
    const district = state.districts[tile.districtId];

    // Sokaklar her lenste sokak kalır — şehrin okunabilirliği lensin
    // altında kaybolmamalı.
    if (tile.kind === 'road') return this.color.set('#12171f');

    if (view.lens === 'ownership') {
      if (!tile.ownerId) return this.color.copy(FREE_COLOR);
      const owner = state.companies[tile.ownerId];
      return this.color.set(owner?.color ?? '#888888').multiplyScalar(0.7);
    }

    if (view.lens === 'none') {
      if (tile.kind === 'civic') return this.color.set('#25382c');
      const base = district ? DISTRICT_ARCHETYPES[district.archetype].color : '#2a3446';
      this.color.set(base);
      // Boş parsel biraz daha aydınlık: "burası alınabilir" sinyali.
      if (!tile.structureId && !tile.ownerId) this.color.offsetHSL(0, 0.02, 0.07);
      // Kendi arsan hafif yeşile çalsın; sahiplik lens açmadan da okunsun.
      if (tile.ownerId === view.playerCompanyId) this.color.lerp(OWN_COLOR, 0.35);
      else if (tile.ownerId) {
        const owner = state.companies[tile.ownerId];
        if (owner) this.color.lerp(new THREE.Color(owner.color), 0.28);
      }
      return this.color;
    }

    const value = Math.max(0, Math.min(1, lensValue(state, tile, view.lens)));
    return this.color.copy(LENS_COLD).lerp(LENS_HOT, value);
  }

  // ------------------------------------------------------------- döngü

  resize(): void {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.controller.setAspect(width / height);
  }

  /**
   * Gün döngüsü.
   *
   * Simülasyon gününe bağlamıyoruz: 1× hızda bir oyun günü 2,6 saniye
   * sürüyor, güneş o tempoda dönse ekran titrerdi. Bunun yerine sakin,
   * bağımsız bir ritim — şehir sabaha ve akşama dönüyor, oyun akışı
   * bozulmuyor.
   */
  private updateDaylight(dt: number): void {
    const CYCLE_SECONDS = 210;
    this.timeOfDay = (this.timeOfDay + dt / CYCLE_SECONDS) % 1;

    const angle = this.timeOfDay * Math.PI * 2;
    const elevation = Math.sin(angle);
    const daylight = Math.max(0, Math.min(1, elevation * 1.6 + 0.35));

    const radius = Math.max(this.mapWidth, this.mapHeight) * 0.9;
    // Işık kaynağı ASLA yer düzleminin altına inmez. İnerse sahne alttan
    // aydınlanır: binaların altı parlar, üstleri kararır ve şehir sarı bir
    // kütleye dönüşür. Gece "güneş batar" değil, "ay yükselir" demek.
    const height = 14 + Math.max(0.2, elevation) * 38;
    this.sun.position.set(
      this.mapWidth / 2 + Math.cos(angle) * radius,
      height,
      this.mapHeight / 2 + Math.sin(angle * 0.6) * radius * 0.4,
    );

    // TABANLAR ÖNEMLİ: gece atmosfer olmalı, karartma değil. Önceki
    // değerlerde döngünün gece yarısında sahne fiilen görünmez oluyordu ve
    // sadece binaların amber emissive'i kalıyordu — oyun oynanamaz hale
    // geliyordu. Artık en karanlık anda bile şehir okunuyor.
    this.sun.intensity = 1.1 + daylight * 1.35;
    // Renk iki sabit ton arasında geçer: gece soğuk ay ışığı, gündüz ılık
    // güneş. Ton (hue) üzerinden geçmek yeşilden geçirirdi.
    this.sun.color.copy(MOONLIGHT).lerp(SUNLIGHT, daylight);
    this.hemisphere.intensity = 1.0 + daylight * 0.4;
    this.hemisphere.color.copy(NIGHT_SKY_LIGHT).lerp(DAY_SKY_LIGHT, daylight);

    // Gökyüzü ve sis birlikte kayar: gündüz açık mavi, gece koyu lacivert.
    this.skyColor.setHSL(0.58, 0.44 - daylight * 0.16, 0.13 + daylight * 0.3);
    (this.scene.background as THREE.Color).copy(this.skyColor);
    this.scene.fog?.color.copy(this.skyColor);

    // Karanlıkta hafif bir pencere sıcaklığı.
    //
    // DİKKAT: emissive burada binanın TÜM yüzeyine düz uygulanıyor, gerçek
    // pencerelere değil. Yüksek tutulursa gece bütün yapılar aynı amber
    // tona yakınsıyor, kendi renklerini ve gölgelenmelerini kaybediyor —
    // şehir tek parça altın bir kütleye dönüşüyordu. Değer bilinçli olarak
    // "ima" seviyesinde; veri lensinde ise tamamen susuyor.
    const material = this.fabric.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = this.dataLensActive ? 0 : Math.max(0, 0.03 - daylight * 0.04);
  }

  render(dt: number): void {
    if (this.disposed) return;

    this.controller.update(dt);
    this.updateDaylight(dt);
    this.traffic.update(dt);

    if (this.hoveredTile !== null && this.state) {
      const tile = this.state.map.tiles[this.hoveredTile];
      this.hover.visible = Boolean(tile);
      if (tile) this.hover.position.set(tile.x, 0.09, tile.y);
    } else {
      this.hover.visible = false;
    }

    if (this.state) this.syncGhost(this.state.map.width);
    this.renderer.render(this.scene, this.controller.camera);
    this.adaptQuality(dt);
  }

  /**
   * Uyarlanabilir kalite.
   *
   * Zayıf bir GPU'da (ya da yazılım rasterizasyonunda) gölgeler kare
   * hızının çoğunu yiyor. İlk saniyelerde ölçüp gerekiyorsa gölgeleri
   * kapatıyoruz: oyun biraz daha düz görünür ama akıcı kalır. Akıcılık
   * bu oyunda görsel şıklıktan önce gelir.
   */
  private adaptQuality(dt: number): void {
    if (this.qualityReduced || this.frameSamples < 0) return;

    this.frameSamples++;
    this.frameTimeSum += dt;

    // Ölçüm penceresi KARE sayısıyla değil GEÇEN SÜREYLE kapanır. Kare
    // sayısına baksaydık, en yavaş cihazda en geç tetiklenirdi — yani tam
    // tersi. 2,5 saniye her hızda aynı sürede karar verdirir.
    if (this.frameTimeSum < 2.5 || this.frameSamples < 12) return;

    const averageFps = this.frameSamples / this.frameTimeSum;
    if (averageFps < 24) {
      this.qualityReduced = true;
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.fabric.castShadow = false;
      this.buildings.castShadow = false;
      this.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.material) (mesh.material as THREE.Material).needsUpdate = true;
      });
      console.info(`Düşük kare hızı (${averageFps.toFixed(0)} FPS) — gölgeler kapatıldı.`);
    }
    // Ölçüm penceresini kapat: bir daha denemeyelim.
    this.frameSamples = -1;
  }

  /**
   * Testler ve hata ayıklama için sahnenin ölçülebilir durumu.
   * Piksel okumak WebGL'de güvenilir değil; bunun yerine sahnenin kendi
   * sayılarını doğruluyoruz.
   */
  getDebugInfo(): {
    /** Sahnenin GERÇEKTEN uyguladığı lens; testler buna göre senkronlanır. */
    activeLens: LensId;
    dataLens: boolean;
    sunIntensity: number;
    hemisphereIntensity: number;
    skyLightness: number;
    sunHeight: number;
    buildingOpacity: number;
    fabricEmissive: number;
    groundColorSum: number;
    timeOfDay: number;
    /** Yolda olan zincir kamyonu sayısı. */
    truckCount: number;
    /** Kamyon konumlarının toplamı; hareket ettiklerini ölçmek için. */
    truckPositionSum: number;
    /** Fon araçları görünür mü (veri lensinde susarlar). */
    carsVisible: boolean;
  } {
    const hsl = { h: 0, s: 0, l: 0 };
    this.skyColor.getHSL(hsl);

    let groundColorSum = 0;
    const colors = this.ground.instanceColor?.array;
    if (colors) for (let i = 0; i < colors.length; i++) groundColorSum += colors[i]!;

    return {
      activeLens: this.activeLens,
      dataLens: this.dataLensActive,
      sunIntensity: this.sun.intensity,
      hemisphereIntensity: this.hemisphere.intensity,
      skyLightness: hsl.l,
      sunHeight: this.sun.position.y,
      buildingOpacity: (this.buildings.material as THREE.MeshStandardMaterial).opacity,
      fabricEmissive: (this.fabric.material as THREE.MeshStandardMaterial).emissiveIntensity,
      groundColorSum,
      timeOfDay: this.timeOfDay,
      truckCount: this.traffic.truckCount,
      truckPositionSum: this.traffic.truckPositionSum,
      carsVisible: this.traffic.carsVisible,
    };
  }

  /** Testlerin gün döngüsünü beklemeden istediği saate atlaması için. */
  setTimeOfDay(value: number): void {
    this.timeOfDay = ((value % 1) + 1) % 1;
  }

  dispose(): void {
    this.disposed = true;
    this.groundLit.dispose();
    this.groundFlat.dispose();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.traffic.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    this.renderer.dispose();
  }
}

function makeMarker(color: string, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

/** District sınırlarını ince çizgilerle göster — şehir okunur olsun. */
function makeDistrictLines(width: number, height: number): THREE.LineSegments {
  const points: number[] = [];
  const step = 8;
  const y = 0.1;

  for (let x = 0; x <= width; x += step) {
    points.push(x - 0.5, y, -0.5, x - 0.5, y, height - 0.5);
  }
  for (let z = 0; z <= height; z += step) {
    points.push(-0.5, y, z - 0.5, width - 0.5, y, z - 0.5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: '#5d7692', transparent: true, opacity: 0.35 }),
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}
