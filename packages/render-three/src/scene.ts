import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BUILDING_BY_ID, DISTRICT_ARCHETYPES, STRUCTURE_BY_ID } from '@capital/content';
import { BLOCK_SIZE, customerFlows, lensValue, supplyRoutes } from '@capital/core';
import type { GameState, LensId } from '@capital/core';
import { RtsCameraController } from './camera';
import { TrafficSystem } from './traffic';
import { BuildingMass, tileByInstanceScale } from './mass';
import {
  makeFacadeTexture,
  makeRoadTexture,
  makeSkyEnvironment,
  makeWindowTexture,
} from './textures';

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

/**
 * Çift dokunuş penceresi.
 *
 * 400 ms, iOS ve Android'in tipik 300–500 ms bandının ortası. Daha dar bir
 * pencere (ilk denediğimiz 320 ms) hızlı dokunamayanlar için jesti fiilen
 * erişilemez yapıyor.
 */
const DOUBLE_TAP_MS = 400;

/** Dokunuşun "tıklama" sayılması için izin verilen kayma (piksel toplamı). */
const TAP_SLOP = 6;

/** İnşaatın yerden yükselme süresi. */
const BUILD_ANIM_MS = 900;

/**
 * Kalite kademeleri.
 *
 * Önceki sürümde tek bir karar vardı: "gölge açık" ya da "gölge kapalı".
 * Bu iki sorunu birden yaratıyordu — zayıf bir cihazda gölgeyi kapatmak
 * yetmiyor (asıl yük piksel sayısında), güçlü bir telefonda ise gereksiz
 * yere gölgeden vazgeçiliyordu. Kademeler pahalıdan ucuza sırayla iner ve
 * her kademede önce SÜS kısılır: piksel yoğunluğu, gölge çözünürlüğü,
 * gölgenin kendisi, en son fon araçları.
 */
interface QualityLevel {
  name: string;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  carBudget: number;
  /** Bloom zinciri — tam ekran ek geçişler demek, ilk kısılan şey. */
  postProcessing: boolean;
  /**
   * Ortam haritası (IBL). Güzel ama ucuz değil: her parçacık için
   * ön-filtrelenmiş küpten örnekleme demek ve zayıf GPU'larda kare
   * hızının hatırı sayılır kısmını yiyor.
   */
  environment: boolean;
}

const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'yüksek', maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, carBudget: 1, postProcessing: true, environment: true },
  { name: 'orta', maxPixelRatio: 1.75, shadows: true, shadowMapSize: 1024, carBudget: 1, postProcessing: true, environment: true },
  { name: 'düşük', maxPixelRatio: 1.35, shadows: false, shadowMapSize: 1024, carBudget: 0.6, postProcessing: false, environment: false },
  { name: 'asgari', maxPixelRatio: 1, shadows: false, shadowMapSize: 512, carBudget: 0.3, postProcessing: false, environment: false },
];

/**
 * Bloom ayarları.
 *
 * Eşik yüksek tutuluyor: yalnızca pencere ışıkları ve güneş gören en
 * parlak yüzeyler taşsın. Düşük eşikte bütün sahne pusa dönüyor ve
 * şehir okunmaz oluyor — bloom atmosfer katmalı, bilgi silmemeli.
 */
const BLOOM_STRENGTH = 0.62;
const BLOOM_RADIUS = 0.45;
const BLOOM_THRESHOLD = 0.82;

/** Ölçüm penceresi: bu kadar saniye ve bu kadar kare toplanmadan karar yok. */
const QUALITY_WINDOW_SECONDS = 2.5;
const QUALITY_WINDOW_FRAMES = 12;
/** Altına düşülürse kademe iner. */
const QUALITY_FLOOR_FPS = 24;
/** Üstüne çıkılırsa kademe yükselir — ama yalnızca hiç düşülmemiş kademeye. */
const QUALITY_CEILING_FPS = 52;

/**
 * Açılış kademesi.
 *
 * Cihazı ölçmeden önce makul bir tahmin gerekiyor, yoksa zayıf bir telefon
 * ilk 2,5 saniyeyi en pahalı kademede geçirir — yani oyunun ilk izlenimi
 * en kötü hali olur. Tahmin yanlışsa uyarlama zaten düzeltiyor.
 */
function initialQualityTier(): number {
  if (typeof navigator === 'undefined') return 0;
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  if (cores <= 2) return 3;
  if (touch && cores <= 6) return 2;
  if (touch) return 1;
  return 0;
}

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
  /** Çizilen kare sayısı — testler "bir kare geçti mi" diye sorabilsin. */
  private frameCount = 0;
  private scene = new THREE.Scene();
  private ground: THREE.InstancedMesh;
  private groundLit!: THREE.MeshStandardMaterial;
  private groundFlat!: THREE.MeshBasicMaterial;
  /** Sokaklar ayrı bir mesh: asfalt dokusunu ve yön döndürmesini taşıyor. */
  private roads: THREE.InstancedMesh;
  private roadMaterial!: THREE.MeshStandardMaterial;
  private roadFlat!: THREE.MeshBasicMaterial;
  private buildings: BuildingMass;
  /** Şehrin mevcut dokusu — oyuncuya ait olmayan yapılar. */
  private fabric: BuildingMass;
  private bodyMaterials: THREE.MeshStandardMaterial[] = [];
  private traffic: TrafficSystem;
  private sun!: THREE.DirectionalLight;
  private hemisphere!: THREE.HemisphereLight;
  private skyColor = new THREE.Color();
  /** Işığın kamera hedefine göre ötelemesi — gün döngüsünden gelir. */
  private sunOffset = new THREE.Vector3();
  /** Son işlem zinciri; yalnızca üst kalite kademelerinde kurulur. */
  private composer: EffectComposer | null = null;
  /** Ortam haritası; kademe düşünce sahneden sökülür, yükselince takılır. */
  private envTexture: THREE.Texture | null = null;
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
  /** Kare kimliğinden zemin örnek yuvasına eşleme; sokaklarda -1. */
  private groundSlotOfTile = new Int32Array(0);
  /** Bina kimliği → inşaatın başladığı an (0 = animasyonsuz). */
  private buildStart = new Map<string, number>();
  private sawBuildings = false;
  private buildingsGrowing = false;
  private pointer = new THREE.Vector2();
  private groundPoint = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private disposed = false;
  private cleanups: Array<() => void> = [];
  private frameSamples = 0;
  private frameTimeSum = 0;
  /** Şu anki kalite kademesi (0 = en yüksek). */
  private qualityTier = 0;
  /** Bir kez inilen kademenin üstüne bir daha çıkılmaz — salınımı keser. */
  private qualityCeilingTier = 0;
  /** Elle sabitlendiyse uyarlama susar. */
  private qualityLocked = false;
  /** Son iki dokunuş arasındaki süre — çift dokunuş testinin okuduğu sayı. */
  private lastTapGapMs = Number.POSITIVE_INFINITY;

  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: RendererCallbacks,
    private mapWidth: number,
    private mapHeight: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    this.ground.count = 0;
    this.scene.add(this.ground);

    // Sokaklar parsellerden ayrıldı. Haritanın %44'ü sokak ve hepsi tek
    // düz renkti; asfalt dokusu yolun yönünü (kesikli orta çizgi) ve
    // kenarını (kaldırım bandı) anlatıyor. Yön, örnek matrisinin
    // döndürülmesiyle geliyor — ikinci bir doku gerekmiyor.
    const roadTexture = makeRoadTexture();
    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: roadTexture,
      roughness: 0.95,
      metalness: 0.0,
    });
    // Zeminle aynı gerekçe: veri lensinde sahne bir haritaya dönüşüyor ve
    // ışıktan bağımsız çizilmesi gerekiyor, yoksa akşam olunca okunmuyor.
    this.roadFlat = new THREE.MeshBasicMaterial({ map: roadTexture, color: '#6b7788' });
    this.roads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.0, 0.08, 1.0),
      this.roadMaterial,
      tileCount,
    );
    this.roads.receiveShadow = true;
    this.roads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.roads.count = 0;
    this.scene.add(this.roads);

    // Pencere ve cephe dokuları gövde parçasına gidiyor; taban ve çatı
    // düz kalıyor. Bu bir tercih değil zorunluluk: doku örnek ölçeğine
    // göre döşendiği için gövdenin üst yüzüne de pencere düşerdi, çatı
    // kapağı o yüzü örtüyor.
    const windowTexture = makeWindowTexture();
    const facadeTexture = makeFacadeTexture();

    const makeBody = (roughness: number, metalness: number): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial({
        map: facadeTexture,
        emissiveMap: windowTexture,
        emissive: new THREE.Color('#ffd79a'),
        emissiveIntensity: 0,
        roughness,
        metalness,
      });
      // Birim başına doku tekrarı = kat yoğunluğu. 1,35'te pencereler ince
      // bir tanecik gibi okunuyordu; 1,05 kat çizgilerini ayırt edilebilir
      // tutuyor.
      tileByInstanceScale(material, 1.05);
      this.bodyMaterials.push(material);
      return material;
    };

    this.buildings = new BuildingMass(
      tileCount,
      makeBody(0.62, 0.1),
      new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.06 }),
    );
    this.fabric = new BuildingMass(
      tileCount,
      makeBody(0.82, 0.04),
      new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.02 }),
    );
    this.scene.add(...this.buildings.meshes, ...this.fabric.meshes);

    // Ortam haritası: camlar ve metal yüzeyler artık gökyüzünü yansıtıyor.
    // Doku saklanıyor çünkü kalite kademesi düşünce sahneden sökülüp
    // yükselince geri takılıyor — her seferinde yeniden üretmek gereksiz.
    this.envTexture = makeSkyEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.35;

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
    // Cihaz tahmininden başla; uyarlama ilk 2,5 saniyede düzeltir.
    this.applyQuality(initialQualityTier());
  }

  private setupLights(width: number, height: number): void {
    this.hemisphere = new THREE.HemisphereLight('#8fb6d9', '#12161d', 1.15);
    this.scene.add(this.hemisphere);

    const sun = new THREE.DirectionalLight('#ffe9c7', 2.1);
    this.sun = sun;
    sun.position.set(width * 0.55, 42, height * 0.15);
    sun.target.position.set(width / 2, 0, height / 2);
    sun.castShadow = true;
    // Çözünürlük kalite kademesinden geliyor (bkz. QUALITY_LEVELS);
    // buradaki değer yalnızca ilk kare için geçerli.
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

  /**
   * Girdi.
   *
   * Tek işaretçi (fare ya da tek parmak) kaydırır; sağ tık veya Shift ile
   * döndürür. İKİ PARMAK ise ayrı bir kip: parmakların arasındaki mesafe
   * oranı zoom'a, orta noktanın kayması döndürme ve eğime gider.
   *
   * Bunun neden gerektiği: zoom eskiden YALNIZCA `wheel` olayından
   * çağrılıyordu. Dokunmatik bir cihazda tekerlek yoktur, canvas'ta
   * `touch-action: none` olduğu için tarayıcının kendi pinch'i de
   * bastırılıyordu — yani telefonda hiçbir şekilde yakınlaşılamıyordu.
   * Döndürme de sağ tuş ya da Shift istediği için erişilemezdi.
   */
  private bindInput(): void {
    let dragging: 'none' | 'pan' | 'rotate' = 'none';
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    /** Ekranda o an basılı olan işaretçiler. */
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchX = 0;
    let pinchY = 0;
    let lastTapMs = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    const setNdc = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    /** Ekran pikselini NDC'ye çevirir — kaydırma bunu kameraya veriyor. */
    const toNdc = (clientX: number, clientY: number): [number, number] => {
      const rect = this.canvas.getBoundingClientRect();
      return [
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ];
    };

    /** İki parmağın mesafesi ve orta noktası. */
    const gesture = () => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return null;
      return {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    };

    const beginPinch = () => {
      const g = gesture();
      if (!g) return;
      pinchDistance = g.distance;
      pinchX = g.x;
      pinchY = g.y;
      dragging = 'none';
    };

    const onPointerDown = (e: PointerEvent) => {
      this.canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        beginPinch();
        return;
      }

      dragging = e.button === 2 || e.shiftKey ? 'rotate' : 'pan';
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;

      // DOKUNUŞTA BU ŞART. Seçim `hoveredTile`'a bakıyor, o da eskiden
      // yalnızca `pointermove`'da güncelleniyordu. Parmakla dokunup
      // kaldırmakta hareket olmadığı için hover hep boş kalıyor ve
      // hiçbir parsel seçilemiyordu.
      setNdc(e.clientX, e.clientY);
      this.updateHover();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        // Basılı değilken de imleç takip edilir (fare).
        setNdc(e.clientX, e.clientY);
        this.updateHover();
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        const g = gesture();
        if (g && pinchDistance > 0) {
          // Mesafe oranı → zoom. Eşik, tek parmakla başlayan bir jestin
          // ikinci parmak değince zıplamasını engelliyor.
          if (Math.abs(g.distance - pinchDistance) > 1) {
            this.controller.zoomBy(g.distance / pinchDistance);
          }
          // Orta noktanın kayması → azimut ve eğim.
          this.controller.rotate(g.x - pinchX, g.y - pinchY);
          pinchDistance = g.distance;
          pinchX = g.x;
          pinchY = g.y;
        }
        return;
      }

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (dragging === 'pan') {
        moved += Math.abs(dx) + Math.abs(dy);
        // Yaklaşık `pan` yerine KESİN kaydırma: tutulan zemin noktası
        // parmağın altında kalıyor. Sürüklemede mutlak iki ekran noktası
        // olduğu için doğrusu bu.
        const [fromX, fromY] = toNdc(e.clientX - dx, e.clientY - dy);
        const [toX, toY] = toNdc(e.clientX, e.clientY);
        this.controller.panFromGround(fromX, fromY, toX, toY);
      } else if (dragging === 'rotate') {
        moved += Math.abs(dx) + Math.abs(dy);
        this.controller.rotate(dx, dy);
      }

      setNdc(e.clientX, e.clientY);
      this.updateHover();
    };

    const onPointerUp = (e: PointerEvent) => {
      const wasPinching = pointers.size >= 2;
      pointers.delete(e.pointerId);

      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }

      if (wasPinching) {
        // İki parmaktan bire düşerken kalan parmağın konumunu tazele,
        // yoksa sahne bir kare boyunca sıçrar.
        const rest = [...pointers.values()][0];
        if (rest) {
          lastX = rest.x;
          lastY = rest.y;
          dragging = 'pan';
          moved = 999; // bu artık bir tıklama sayılmaz
        }
        return;
      }

      if (dragging === 'pan' && moved < TAP_SLOP && this.hoveredTile !== null) {
        this.callbacks.onSelect(this.hoveredTile);

        // Çift dokunuş: seçilen kareye odaklan. Dokunmatikte klavye
        // kısayolu olmadığı için haritada gezinmenin hızlı yolu bu.
        const now = performance.now();
        const near = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 32;
        this.lastTapGapMs = lastTapMs > 0 ? now - lastTapMs : Number.POSITIVE_INFINITY;
        if (now - lastTapMs < DOUBLE_TAP_MS && near && this.state) {
          const tile = this.state.map.tiles[this.hoveredTile];
          if (tile) this.controller.focusOn(tile.x, tile.y);
          lastTapMs = 0;
        } else {
          lastTapMs = now;
          lastTapX = e.clientX;
          lastTapY = e.clientY;
        }
      }

      dragging = 'none';
    };

    const onPointerCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      dragging = 'none';
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
    this.canvas.addEventListener('pointercancel', onPointerCancel);
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
      this.canvas.removeEventListener('pointercancel', onPointerCancel);
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
    this.roads.material = dataLens ? this.roadFlat : this.roadMaterial;
    this.roads.receiveShadow = !dataLens;

    const shadows = QUALITY_LEVELS[this.qualityTier]!.shadows;
    for (const mass of [this.buildings, this.fabric]) {
      for (const mesh of mass.meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        if (material.transparent !== dataLens) {
          material.transparent = dataLens;
          material.needsUpdate = true;
        }
        material.opacity = dataLens ? SILHOUETTE_OPACITY : 1;
        material.depthWrite = !dataLens;
      }
      mass.setShadows(!dataLens && shadows, !dataLens);
    }

    this.traffic.setDataLens(dataLens);
    this.renderer.shadowMap.enabled = !dataLens && shadows;

    // Pencere parıltısını burada da sıfırla. Bir sonraki gün-döngüsü
    // karesini beklemek, lens açılırken bir karelik amber parlama
    // bırakıyordu.
    if (dataLens) for (const material of this.bodyMaterials) material.emissiveIntensity = 0;
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
      let plotIndex = 0;
      let roadIndex = 0;
      this.groundSlotOfTile = new Int32Array(tiles.length).fill(-1);

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]!;
        if (tile.kind === 'road') {
          // Yolun yönü örnek döndürmesinden geliyor: doku kesikli çizgiyi
          // +X ekseninde taşıyor, yani yatay sokak (y sabit) dönmeden
          // doğru duruyor; düşey sokak çeyrek tur dönüyor.
          const horizontal = tile.y % BLOCK_SIZE === 0;
          this.dummy.position.set(tile.x, -0.02, tile.y);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.rotation.set(0, horizontal ? 0 : Math.PI / 2, 0);
          this.dummy.updateMatrix();
          this.roads.setMatrixAt(roadIndex, this.dummy.matrix);
          roadIndex++;
          continue;
        }

        this.dummy.position.set(tile.x, 0, tile.y);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.ground.setMatrixAt(plotIndex, this.dummy.matrix);
        this.groundSlotOfTile[i] = plotIndex;
        plotIndex++;
      }

      this.ground.count = plotIndex;
      this.roads.count = roadIndex;
      this.ground.instanceMatrix.needsUpdate = true;
      this.roads.instanceMatrix.needsUpdate = true;
      this.groundPlaced = true;
    }

    // Sokaklar renk taşımıyor — her lenste sokak kalıyorlar. Yalnızca
    // parsellerin rengi lense göre değişiyor.
    for (let i = 0; i < tiles.length; i++) {
      const slot = this.groundSlotOfTile[i]!;
      if (slot < 0) continue;
      this.ground.setColorAt(slot, this.tileColor(state, tiles[i]!.id, view));
    }
    if (this.ground.instanceColor) this.ground.instanceColor.needsUpdate = true;

    // Şehrin mevcut dokusu: oyuncuya ait olmayan yapılar.
    this.fabric.begin();
    for (const tile of tiles) {
      if (!tile.structureId) continue;
      const structure = STRUCTURE_BY_ID[tile.structureId];
      if (!structure) continue;

      // Aynı yapı tipinden sıkıcı bir tekrar çıkmasın diye kareye göre
      // deterministik küçük bir renk sapması veriyoruz.
      const jitter = ((tile.id * 37) % 17) / 17 - 0.5;
      this.color.set(structure.color).offsetHSL(jitter * 0.02, 0, jitter * 0.07);

      this.fabric.place({
        x: tile.x,
        z: tile.y,
        height: Math.max(0.03, tile.structureHeight) * 1.5,
        width: 0.8,
        groundY: 0.07,
        color: this.color,
      });
    }
    this.fabric.end();

    this.syncBuildings(state);

    if (view.selectedTileId !== null) {
      const tile = tiles[view.selectedTileId];
      this.selection.visible = Boolean(tile);
      if (tile) this.selection.position.set(tile.x, 0.1, tile.y);
    } else {
      this.selection.visible = false;
    }

    this.syncRoutes(state, view.playerCompanyId);
    this.syncShoppers(state);
    this.syncGhost(width);
  }

  /**
   * Oyuncunun ve rakiplerin binaları.
   *
   * Ayrı bir yöntem olmasının sebebi inşaat animasyonu: bina yerden
   * yükselirken her karede yeniden yerleştirilmesi gerekiyor, ama şehrin
   * geri kalanı (221 yapı, zemin, sokaklar) yalnızca state değişince.
   */
  private syncBuildings(state: GameState): void {
    const tiles = state.map.tiles;
    let growing = false;

    this.buildings.begin();
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      const tile = tiles[building.tileId];
      if (!def || !tile) continue;

      // Rakip binaları sahibinin rengiyle hafifçe boyanır: kimin nerede
      // olduğu haritaya bakınca anlaşılmalı.
      const company = state.companies[building.companyId];
      this.color.set(def.color);
      if (company && !company.isPlayer) this.color.lerp(new THREE.Color(company.color), 0.55);
      else this.color.lerp(new THREE.Color('#8ef0c0'), 0.12);

      const growth = this.growthOf(building.id);
      if (growth < 1) growing = true;

      this.buildings.place({
        x: tile.x,
        z: tile.y,
        height: Math.max(0.3, def.height) * 1.5,
        width: 0.68,
        groundY: 0.07,
        color: this.color,
        growth,
      });
    }
    this.buildings.end();

    this.buildingsGrowing = growing;
    this.sawBuildings = true;

    // Yıkılan binaların kaydı birikmesin.
    if (this.buildStart.size > Object.keys(state.buildings).length * 2 + 16) {
      for (const id of this.buildStart.keys()) {
        if (!state.buildings[id]) this.buildStart.delete(id);
      }
    }
  }

  /**
   * İnşaat ilerlemesi.
   *
   * Bina kurmak bugüne kadar "pat" diye oluyordu — tıklıyorsun, kutu
   * beliriyor. Yerden yükselmesi hem eylemi görünür kılıyor hem de
   * gözün yeni binayı bulmasını sağlıyor.
   *
   * İLK senkronda var olan binalar animasyonsuz: kayıt yüklerken bütün
   * şehrin yerden bitmesi doğru olmazdı.
   */
  private growthOf(id: string): number {
    let start = this.buildStart.get(id);
    if (start === undefined) {
      start = this.sawBuildings ? performance.now() : 0;
      this.buildStart.set(id, start);
    }
    if (start === 0) return 1;
    const t = Math.min(1, (performance.now() - start) / BUILD_ANIM_MS);
    // Yumuşak giriş-çıkış: sert bir doğrusal yükseliş mekanik duruyor.
    return t * t * (3 - 2 * t);
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

  /**
   * Müşteri araçlarını state'e bağlar.
   *
   * `syncRoutes` ile aynı disiplin: akışı motor türetiyor
   * (`customerFlows`), burada yapılan tek şey mağazayı şehir koordinatına
   * ve sahibinin rengine çevirmek.
   *
   * Renk kuralı kamyonlarınkiyle AYNI olmak zorunda. Oyuncunun kamyonu
   * nane yeşili, müşterisi başka bir yeşil olsaydı sokakta iki ayrı
   * "benim" rengi olurdu ve hangisinin ne anlattığı karışırdı.
   */
  private syncShoppers(state: GameState): void {
    this.traffic.setShoppers(customerFlows(state), (flow) => {
      const tile = state.map.tiles[flow.tileId];
      if (!tile) return null;
      const company = state.companies[flow.companyId];
      return {
        at: { x: tile.x, y: tile.y },
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
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
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
    // Konum değil ÖTELEME saklanıyor: gölge hacmi kameranın baktığı yere
    // taşındığında ışığın yönü aynı kalsın diye ışık da onunla birlikte
    // taşınıyor (bkz. updateShadowVolume).
    this.sunOffset.set(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle * 0.6) * radius * 0.4,
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

    // Ortam yansıması da günle birlikte kısılıyor: gece gökyüzü karanlık,
    // dolayısıyla camların yansıttığı şey de karanlık olmalı.
    this.scene.environmentIntensity = 0.12 + daylight * 0.3;

    // PENCERE IŞIKLARI.
    //
    // Bu değer eskiden 0,03 gibi bir "ima" seviyesindeydi ve bilinçliydi:
    // emissive binanın TÜM yüzeyine düz uygulandığı için yükseltmek bütün
    // şehri tek parça amber bir kütleye çeviriyordu. Artık emisyon bir
    // DOKUDAN geliyor — siyah zemin üzerinde yalnızca pencereler parlıyor.
    // Ödünleşim ortadan kalktığı için parlaklık serbestçe yükselebiliyor
    // ve gece şehrin en iyi göründüğü an oluyor.
    const glow = this.dataLensActive ? 0 : Math.max(0, 1.15 - daylight * 1.5);
    for (const material of this.bodyMaterials) material.emissiveIntensity = glow;
  }

  /**
   * Gölge kamerasını görüş alanına oturtur.
   *
   * Tek bir gölge haritası bütün şehri kaplıyordu: harita kenarı ne
   * kadarsa o alan 1024 texel'e yayılıyor, texel başına düşen alan
   * büyüdükçe gölge kenarları bulanıklaşıyordu. Kamera nereye bakıyorsa
   * gölge hacmini oraya daraltmak, aynı çözünürlükte belirgin şekilde
   * daha keskin bir gölge veriyor — maliyeti yok, sadece doğru yeri
   * kaplıyor.
   *
   * Harita boyutundan bağımsız olması bu yüzden önemli: Tur 8 şehri
   * 24×24'ten 30×30'a çıkardı ve gölge kalitesi hiç etkilenmedi.
   */
  private updateShadowVolume(): void {
    const target = this.controller.targetPoint;
    const distance = this.controller.currentDistance;
    // Görüş alanı uzaklıkla büyüyor; pay ekliyoruz ki kadraja giren ama
    // merkezden uzak binalar gölgesiz kalmasın.
    const extent = Math.max(10, distance * 0.85);

    const shadowCamera = this.sun.shadow.camera;
    if (shadowCamera.left !== -extent) {
      shadowCamera.left = -extent;
      shadowCamera.right = extent;
      shadowCamera.top = extent;
      shadowCamera.bottom = -extent;
      shadowCamera.updateProjectionMatrix();
    }
    this.sun.position.set(
      target.x + this.sunOffset.x,
      this.sunOffset.y,
      target.z + this.sunOffset.z,
    );
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.target.updateMatrixWorld();
  }

  render(dt: number): void {
    if (this.disposed) return;

    /*
     * Kare sayacı — testlerin "bir kare çizildi mi" sorusunu sorabilmesi
     * için.
     *
     * Sondajlar bunu önce `timeOfDay`'in ilerlemesinden çıkarıyordu ve o
     * çıkarım oyun DURAKLATILMIŞKEN yanlıştı: saat durunca sondaj hiç
     * tatmin olmuyor, zaman aşımına düşüyor ve çalışan bir özelliği
     * hatalı raporluyordu. Çizim döngüsü simülasyon saatinden bağımsız
     * döndüğü için doğru gösterge bu sayaç.
     */
    this.frameCount++;

    this.controller.update(dt);
    this.updateDaylight(dt);
    this.updateShadowVolume();
    this.traffic.update(dt);

    // İnşaat animasyonu sürerken binalar her karede yeniden yerleşiyor;
    // şehrin geri kalanı yalnızca state değişince.
    if (this.buildingsGrowing && this.state) this.syncBuildings(this.state);

    if (this.hoveredTile !== null && this.state) {
      const tile = this.state.map.tiles[this.hoveredTile];
      this.hover.visible = Boolean(tile);
      if (tile) this.hover.position.set(tile.x, 0.09, tile.y);
    } else {
      this.hover.visible = false;
    }

    if (this.state) this.syncGhost(this.state.map.width);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.controller.camera);
    this.adaptQuality(dt);
  }

  /**
   * Bloom zincirini kurar ya da söker.
   *
   * Zincir kurulunca ton eşleme ve renk uzayı dönüşümü `OutputPass`'e
   * geçiyor — three, ara hedeflere çizerken ton eşlemeyi zaten atlıyor,
   * yani çifte uygulanma riski yok.
   *
   * Ara hedef çok örneklemeli (`samples: 4`): zincir devreye girdiğinde
   * tuvalin kendi MSAA'sı devre dışı kalır ve bina kenarları tırtıklanır.
   */
  private setPostProcessing(enabled: boolean): void {
    if (enabled === Boolean(this.composer)) return;

    if (!enabled) {
      this.composer?.dispose();
      this.composer = null;
      return;
    }

    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const target = new THREE.WebGLRenderTarget(width, height, {
      samples: 4,
      type: THREE.HalfFloatType,
    });

    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.controller.camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(width, height),
        BLOOM_STRENGTH,
        BLOOM_RADIUS,
        BLOOM_THRESHOLD,
      ),
    );
    composer.addPass(new OutputPass());
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(width, height);
    this.composer = composer;
  }

  /** Bir kalite kademesini sahneye uygular. */
  private applyQuality(tier: number): void {
    const level = QUALITY_LEVELS[Math.max(0, Math.min(QUALITY_LEVELS.length - 1, tier))]!;
    this.qualityTier = tier;

    this.renderer.setPixelRatio(Math.min(devicePixelRatio, level.maxPixelRatio));
    this.resize();

    // Gölge haritasının boyutu çalışma anında değişebilmesi için eskisinin
    // atılması gerekiyor; three aksi halde ilk ayrılan dokuyu kullanmayı
    // sürdürür ve `mapSize` sessizce etkisiz kalır.
    if (this.sun.shadow.map && this.sun.shadow.mapSize.width !== level.shadowMapSize) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sun.shadow.mapSize.set(level.shadowMapSize, level.shadowMapSize);

    const shadows = level.shadows && !this.dataLensActive;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = level.shadows;
    this.buildings.setShadows(shadows, shadows);
    this.fabric.setShadows(shadows, shadows);
    this.ground.receiveShadow = shadows;
    this.roads.receiveShadow = shadows;

    this.traffic.setCarBudget(level.carBudget);
    this.setPostProcessing(level.postProcessing);
    this.scene.environment = level.environment ? this.envTexture : null;

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.material) (mesh.material as THREE.Material).needsUpdate = true;
    });
  }

  /**
   * Uyarlanabilir kalite.
   *
   * Her 2,5 saniyede bir kare hızını ölçer ve kademeyi değiştirir. Ölçüm
   * penceresi KARE sayısıyla değil GEÇEN SÜREYLE kapanır: kare sayısına
   * baksaydık en yavaş cihazda karar en geç verilirdi — yani tam tersi.
   *
   * Yukarı çıkış, bir kez inilen kademenin üstüne ASLA geçmiyor. Aksi
   * halde kademe düşer, hız artar, kademe yükselir, hız düşer diye
   * salınan bir döngü olurdu ve oyuncu bunu titreme olarak görürdü.
   */
  private adaptQuality(dt: number): void {
    if (this.qualityLocked) return;
    this.frameSamples++;
    this.frameTimeSum += dt;

    if (this.frameTimeSum < QUALITY_WINDOW_SECONDS || this.frameSamples < QUALITY_WINDOW_FRAMES) {
      return;
    }

    const averageFps = this.frameSamples / this.frameTimeSum;
    this.frameSamples = 0;
    this.frameTimeSum = 0;

    if (averageFps < QUALITY_FLOOR_FPS && this.qualityTier < QUALITY_LEVELS.length - 1) {
      const next = this.qualityTier + 1;
      this.qualityCeilingTier = next;
      this.applyQuality(next);
      console.info(
        `Kare hızı ${averageFps.toFixed(0)} — kalite "${QUALITY_LEVELS[next]!.name}" kademesine indi.`,
      );
      return;
    }

    if (averageFps > QUALITY_CEILING_FPS && this.qualityTier > this.qualityCeilingTier) {
      const next = this.qualityTier - 1;
      this.applyQuality(next);
      console.info(
        `Kare hızı ${averageFps.toFixed(0)} — kalite "${QUALITY_LEVELS[next]!.name}" kademesine çıktı.`,
      );
    }
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
    /** Mağazalara akan müşteri aracı sayısı. */
    shopperCount: number;
    /** Müşteri konumlarının toplamı; hareket ettiklerini ölçmek için. */
    shopperPositionSum: number;
    /** Müşteri araçlarının rengi — akışın kime gittiğini sınamak için. */
    shopperColors: string[];
    /** Kameranın hedef uzaklığı — pinch jestini doğrulamak için. */
    cameraDistance: number;
    /** Kameranın hedef azimutu — döndürme jestini doğrulamak için. */
    cameraAzimuth: number;
    /** Kameranın baktığı nokta — odaklanma jestini doğrulamak için. */
    cameraTarget: { x: number; z: number };
    /** Çift dokunuş penceresi ve son gözlenen dokunuş aralığı. */
    doubleTapWindowMs: number;
    lastTapGapMs: number;
    /** Kalite kademesi: 0 en yüksek. */
    qualityTier: number;
    qualityName: string;
    pixelRatio: number;
    shadowMapSize: number;
    /** Bloom zinciri açık mı. */
    postProcessing: boolean;
    /** Çizilen bina parçası sayısı — kütlenin üç parçalı olduğunu doğrular. */
    massParts: number;
    /** En az bir bina hâlâ yerden yükseliyor mu. */
    buildingsGrowing: boolean;
    /** Sokak ve parsel örnek sayıları — ikisinin ayrıldığını doğrular. */
    roadInstances: number;
    plotInstances: number;
    /**
     * Emisyon bir dokudan mı geliyor.
     *
     * Ayrım kritik: düz emisyon binanın tüm yüzeyini parlatır ve şehri
     * tek parça amber bir kütleye çevirir. Dokudan gelen emisyon
     * yalnızca pencerelerden çıkar. Parlaklığın yüksek olabilmesi tam
     * olarak buna bağlı.
     */
    emissiveMapped: boolean;
    /**
     * Son karede yapılan çizim çağrısı sayısı.
     *
     * Şehrin tamamı InstancedMesh ile çizildiği için bu sayının harita
     * boyutundan BAĞIMSIZ olması gerekiyor. Tur 8 haritayı 576'dan 900
     * kareye çıkardı; sayı sabit kaldıysa toplu çizim çalışıyor, arttıysa
     * bir yerde kare başına çizime düşmüşüz demektir ve haritayı bir daha
     * büyütmek mümkün olmaz.
     */
    drawCalls: number;
    /** Çizilen kare sayısı; sondajlar kare beklemek için okur. */
    frameCount: number;
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
      buildingOpacity: (this.buildings.body.material as THREE.MeshStandardMaterial).opacity,
      fabricEmissive: (this.fabric.body.material as THREE.MeshStandardMaterial).emissiveIntensity,
      groundColorSum,
      timeOfDay: this.timeOfDay,
      truckCount: this.traffic.truckCount,
      truckPositionSum: this.traffic.truckPositionSum,
      carsVisible: this.traffic.carsVisible,
      shopperCount: this.traffic.shopperCount,
      shopperPositionSum: this.traffic.shopperPositionSum,
      shopperColors: this.traffic.shopperColors,
      cameraDistance: this.controller.targetDistance,
      cameraAzimuth: this.controller.targetAzimuth,
      cameraTarget: this.controller.targetPoint,
      doubleTapWindowMs: DOUBLE_TAP_MS,
      lastTapGapMs: this.lastTapGapMs,
      qualityTier: this.qualityTier,
      qualityName: QUALITY_LEVELS[this.qualityTier]!.name,
      pixelRatio: this.renderer.getPixelRatio(),
      shadowMapSize: this.sun.shadow.mapSize.width,
      postProcessing: Boolean(this.composer),
      massParts: this.buildings.meshes.length,
      buildingsGrowing: this.buildingsGrowing,
      roadInstances: this.roads.count,
      plotInstances: this.ground.count,
      emissiveMapped: this.bodyMaterials.every((material) => Boolean(material.emissiveMap)),
      drawCalls: this.renderer.info.render.calls,
      frameCount: this.frameCount,
    };
  }

  /**
   * Bir ekran noktasının altındaki zemin koordinatı.
   *
   * Kaydırmanın DOĞRULUĞUNU ölçmenin tek dürüst yolu bu: parmağın
   * tuttuğu dünya noktası, sürükleme boyunca parmağın altında kalmalı.
   * Kameranın ne kadar hareket ettiğine bakmak yönü doğrulamaz.
   */
  groundAt(ndcX: number, ndcY: number): { x: number; z: number } | null {
    const point = new THREE.Vector3();
    if (!this.controller.screenToGround(ndcX, ndcY, point)) return null;
    return { x: point.x, z: point.z };
  }

  /** Testlerin gün döngüsünü beklemeden istediği saate atlaması için. */
  setTimeOfDay(value: number): void {
    this.timeOfDay = ((value % 1) + 1) % 1;
  }

  /**
   * Kalite kademesini elle sabitler.
   *
   * Testler için gerekli: GPU'su olmayan bir ortamda uyarlama hemen en
   * ucuz kademeye iniyor ve üst kademelerin kodu (bloom zinciri, 2048'lik
   * gölge) hiç çalışmıyor — yani hiç sınanmıyor olurdu. Sabitleme
   * uyarlamayı da durduruyor, yoksa bir sonraki ölçüm penceresi kademeyi
   * geri düşürürdü.
   */
  setQuality(tier: number, lock = true): void {
    this.applyQuality(Math.max(0, Math.min(QUALITY_LEVELS.length - 1, tier)));
    this.qualityLocked = lock;
    this.frameSamples = 0;
    this.frameTimeSum = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.groundLit.dispose();
    this.groundFlat.dispose();
    this.roadMaterial.dispose();
    this.roadFlat.dispose();
    this.roadMaterial.map?.dispose();
    for (const material of this.bodyMaterials) {
      material.map?.dispose();
      material.emissiveMap?.dispose();
    }
    this.buildings.dispose();
    this.fabric.dispose();
    // `scene.environment` düşük kademede null oluyor; dokunun kendisini
    // saklayan alandan atmak gerekiyor, yoksa sızar.
    this.envTexture?.dispose();
    this.envTexture = null;
    this.composer?.dispose();
    this.composer = null;
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
