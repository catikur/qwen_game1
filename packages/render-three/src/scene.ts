import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SharedKernelBloomPass, postProcessingMaterials } from './bloom';
import { isSoftwareRenderer } from './gpu';
import { BUILDING_BY_ID, DISTRICT_ARCHETYPES, STRUCTURE_BY_ID, WEATHER_BY_ID } from '@capital/content';
import type { BuildingDef, MassForm, StructureDef } from '@capital/content';
import { BLOCK_SIZE, cityWeather, customerFlows, headquarters, lensValue, supplyRoutes } from '@capital/core';
import type { CityWeather, GameState, LensId } from '@capital/core';
import { RtsCameraController } from './camera';
import { TrafficSystem } from './traffic';
import { StreetLife, type SmokeEmitter } from './street';
import { World } from './world';
import { BuildingMass } from './mass';
import { ContactShadows, DecorKit, DecorLayer } from './decor';
import type { DecorPart } from './decor';
import { decorateBuilding, decorateSite, decorateStructure, placeStreetTrees, streetSide } from './recipes';

/** İnşaattaki projenin beton iskeleti (Tur 58). */
const SITE_CONCRETE = '#bdb8ae';
/** Şantiyenin açılış günündeki boyu, binanın tam boyuna oranla (Tur 63: açılış buradan yükseliyor). */
const SITE_TOP = 0.8;
import { LampLight } from './lamplight';
import { Precipitation } from './precipitation';
import { Fireworks, MOMENT, RingPulses, smooth, waveDelay } from './moments';
import { mixWeather, seasonLook, weatherLook } from './season';
import type { SeasonLook, WeatherLook } from './season';
import { FACADE, buildingSurface, setWindowLateNight, windowLateNight } from './surface';
import type { FacadeStyle } from './surface';
import {
  makeFacadeAtlas,
  makeRoadTexture,
  makePlotTexture,
  roadAtlasSurface,
  ROAD_CELL,
  makeSkyEnvironment,
  makeWindowAtlas,
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

/** Sisin olağan uzaklığı; hava çarpanıyla yaklaşıyor (Tur 62). */
const FOG_NEAR = 78;
const FOG_FAR = 195;
/** Yeni havanın ışığa ve göğe yerleşme süresi (sn). */
const WEATHER_FADE_SECONDS = 4;

/** Ölçüm penceresi: bu kadar saniye ve bu kadar kare toplanmadan karar yok. */
const QUALITY_WINDOW_SECONDS = 2.5;
const QUALITY_WINDOW_FRAMES = 12;
/**
 * Çok yavaş cihazın hızlı çıkışı (Tur 24).
 *
 * Pencere 12 kare istiyor; karesi 1,5 saniye süren bir cihazda bu 18
 * saniye en pahalı kademede donmak demekti — açılışın ilk izlenimi ve
 * oynanış testinin yazılımsal GPU'daki zaman aşımı. Ölçülen hız tabanın
 * dörtte birinin altındaysa üç kare yetiyor ve kademe iki basamak iniyor.
 * Kademe değişince ilk iki kare sayılmıyor: gölgelendirici derlemesi
 * güçlü bir GPU'da da ilk kareyi uzatır, onu yavaşlık sanmamak gerekiyor.
 */
const QUALITY_FAST_FRAMES = 3;
const QUALITY_WARMUP_FRAMES = 2;
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
 *
 * Yazılımsal GPU (Tur 42) doğrudan en ucuz kademeden başlıyor. Eskiden en
 * pahalı kademeden başlıyordu: ilk kareler saniyelerce sürüyor, uyarlama
 * kademeyi indiriyor ve her malzeme yeni kademe için ikinci kez
 * derleniyordu. Uyarlama yine çalışıyor; yazılımsal GPU zaten en alt
 * kademeye iniyordu.
 */
function initialQualityTier(software: boolean): number {
  if (software) return QUALITY_LEVELS.length - 1;
  if (typeof navigator === 'undefined') return 0;
  const cores = navigator.hardwareConcurrency ?? 8;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  if (cores <= 2) return 3;
  if (touch && cores <= 6) return 2;
  if (touch) return 1;
  return 0;
}

/**
 * Gölgelendiricilerin ilk kareden önce derlenmesi için üst sınır (Tur 42).
 * Hazır olduğunu hiç bildirmeyen bir sürücüde sahne sonsuza dek boş kalmasın.
 */
const SHADER_WARMUP_LIMIT_MS = 10_000;
/** `clearUntilReady`'nin eski silme rengini tuttuğu yer; her karede yeni renk ayrılmasın. */
const CLEAR_SCRATCH = new THREE.Color();
/**
 * Son işlem malzemelerinin ön derlemesi için tam ekran dörtgen. three'nin
 * `FullScreenQuad`'ı gibi kendi başına bir sahne (ışık yok) ve yalnız konum
 * ile uv taşıyor: normal olsaydı program `HAS_NORMAL` ile ayrı derlenirdi,
 * gerçek çizim yine kendi programını derlerdi.
 */
const FULLSCREEN_QUAD = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).deleteAttribute('normal'));
const FULLSCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Gün döngüsünün iki ucu — ton üzerinden geçmemek için sabit renkler. */
const MOONLIGHT = new THREE.Color('#9db9e8');
const SUNLIGHT = new THREE.Color('#ffe6bd');
const NIGHT_SKY_LIGHT = new THREE.Color('#5f7796');
const DAY_SKY_LIGHT = new THREE.Color('#8fb6d9');

const LENS_COLD = new THREE.Color('#1d3b57');
const LENS_HOT = new THREE.Color('#f0654a');
const OWN_COLOR = new THREE.Color('#3ba55d');
/*
 * Renk körlüğüne uygun palette oyuncunun rengi (Tur 47). Nane yeşili on
 * altı rakip rengine karşı döteranopide OKLab ΔE 7,6'ya, sahiplik lensinde
 * (×0,7) normal görüşte bile 7,5'e iniyordu (Atlas'ın camgöbeği). Limon en
 * kötü renk körlüğünde 17,1; lenste parlak kaldığı için (×0,9) 28,3.
 */
const SAFE_PLAYER_ACCENT = '#fff36b';
const SAFE_OWN_COLOR = new THREE.Color('#e6db60');
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
  private roadCells: THREE.InstancedBufferAttribute;
  private roadMaterial!: THREE.MeshStandardMaterial;
  private roadFlat!: THREE.MeshBasicMaterial;
  private buildings: BuildingMass;
  /** Şehrin mevcut dokusu — oyuncuya ait olmayan yapılar. */
  private fabric: BuildingMass;
  private bodyMaterials: THREE.MeshStandardMaterial[] = [];
  /** Binaların ve şehir dokusunun altındaki temas gölgeleri (Tur 24). */
  private buildingShadows: ContactShadows;
  private fabricShadows: ContactShadows;
  /** Detay katmanı (Tur 24): binalar, şehir dokusu ve sokak ağaçları. */
  private decorKit: DecorKit;
  private buildingDecor: DecorLayer;
  private fabricDecor: DecorLayer;
  private streetDecor: DecorLayer;
  private lampLight: LampLight;
  private traffic: TrafficSystem;
  /** Yayalar ve tüten bacalar (Tur 34). */
  private street: StreetLife;
  private world!: World;
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
  /**
   * Genel merkez işareti — direk + bayrak.
   *
   * Tek bina için tek nesne; örnek ağı (InstancedMesh) gereksiz olurdu.
   * `Group` olmasının sebebi iki parçadan oluşması: ince bir direk ve
   * ucunda şirket renginde bir bayrak.
   */
  private hqMarker: THREE.Group;
  private hqFlag: THREE.Mesh;
  private districtLines: THREE.LineSegments;

  private state: GameState | null = null;
  /** Erişilebilirlik (Tur 47): renk körlüğüne uygun palet, azaltılmış hareket. */
  private safePalette = false;
  private reducedMotion = false;
  /**
   * Mevsim ve hava (Tur 62). Hava durumdan okunuyor (`cityWeather`), ışığa
   * ve göğe geçişle yansıyor; mevsim ağaçları ve çimeni boyuyor.
   */
  private precipitation = new Precipitation();
  /** Önemli anlar (Tur 63): yerde halka, zafer gecesi havai fişek. */
  private rings = new RingPulses();
  private fireworks = new Fireworks();
  /** Bina kimliği → son çizildiği sahip ve çatı rengi; sahibi değişince renk dalgası. */
  private buildingOwners = new Map<string, { companyId: string; accent: number }>();
  /** Bina kimliği → çatının dönmeye başladığı an (ms) ve eski renk. */
  private ownerShifts = new Map<string, { start: number; from: number }>();
  private buildingsShifting = false;
  /** Yükselen binalar: yükseliş bitince yerde halka. */
  private risingIds = new Set<string>();
  /** Şantiyesi süren projeler (Tur 58): açılınca şantiyenin boyundan yükseliyor. */
  private siteIds = new Set<string>();
  /** Bina kimliği → yükselişin başladığı oran (proje açılışı 0 değil). */
  private growFrom = new Map<string, number>();
  /** Kutlanan zafer; `undefined` ilk senkrondan önce (kayıttaki zafer kutlanmıyor). */
  private celebrationKey: string | null | undefined = undefined;
  /** Bu senkronda yapısı kalkan dokunun kareleri: yıkım tozu. */
  private fabricRemoved: number[] = [];
  private shiftTo = new THREE.Color();
  private weather: CityWeather | null = null;
  private weatherKey = '';
  private seasonKey = '';
  private season: SeasonLook = seasonLook('summer', 0);
  private weatherFrom: WeatherLook = weatherLook(WEATHER_BY_ID.clear);
  private weatherTo: WeatherLook = weatherLook(WEATHER_BY_ID.clear);
  private weatherNow: WeatherLook = weatherLook(WEATHER_BY_ID.clear);
  private weatherBlend = 1;
  /** Havanın son okunduğu gün: gün atlayınca (kayıt, şehir değişimi) geçiş yok. */
  private weatherDay = -1;
  /** Ayarlardaki "yağmur ve kar" (Tur 62); kapalıyken mevsim yine görünüyor. */
  private weatherEffects = true;
  /** `screenOfTile` için tekrar kullanılan vektör (her karede çağrılıyor). */
  private readonly projected = new THREE.Vector3();
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
  /**
   * Şehir dokusunun son yerleştirildiği hâl, kare başına (Tur 43): yapı ve
   * yüksekliği. Doku günlerin yarısından çoğunda değişmiyor; değişmediyse
   * yapılar, süsleri ve gölgeleri yeniden yerleştirilmiyor.
   */
  private fabricStructures: Array<string | null> = [];
  private fabricHeights = new Float64Array(0);
  /** Hata ayıklama: kaç state eşitlemesi, dokuyu kaçında yeniden yerleştirdi. */
  private stateSyncs = 0;
  private fabricSyncs = 0;
  /** Bina kimliği → inşaatın başladığı an (0 = animasyonsuz). */
  private buildStart = new Map<string, number>();
  private sawBuildings = false;
  private buildingsGrowing = false;
  private pointer = new THREE.Vector2();
  private groundPoint = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private ownerColor = new THREE.Color();
  private categoryColor = new THREE.Color();
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
  /** Kademe değişiminden sonra sayılmayacak kare sayısı (derleme takılması). */
  private qualityWarmup = QUALITY_WARMUP_FRAMES;
  /** Yazılımsal GPU mu (Tur 42): açılış kademesi ve hata ayıklama bilgisi için. */
  private softwareRenderer = false;
  /**
   * Gölgelendiricilerin ön derlemesi (Tur 42): ilk karede görünen sahne
   * önceden derleniyor, paralel derleme varsa çizim döngüsü beklemiyor.
   */
  private shaderWarmup: 'idle' | 'compiling' | 'done' = 'idle';
  private shaderWarmupStarted = 0;
  private shaderWarmupMs: number | null = null;
  /**
   * Kademe değişince ön derleme yeniden (Tur 42): yeni kademenin
   * programları paralel derleniyor, o sırada son kare ekranda kalıyor.
   */
  private shaderRewarm = false;
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
    // three 0.185 PCFSoftShadowMap'i kaldırdı: her açılışta uyarıyla PCFShadowMap'e
    // düşüyordu (Tur 40). Görüntü aynı, konsol temiz.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    /*
     * İlk kare de aydınlık. Eski değer koyu laciverttir ve sahne
     * yüklenirken bir an karanlık bir kare görünüyordu; tema aydınlığa
     * dönünce bu bir "yanıp sönme" hâline gelirdi.
     */
    this.scene.background = new THREE.Color('#bcd0dc');
    /*
     * Sis artık ŞEHRİN KENARINI GİZLEMİYOR, ufku yumuşatıyor.
     *
     * Eski aralık (55–130) haritanın bittiği yerdeki boşluğu saklamak
     * içindi. Kırsal eklendikten sonra saklanacak bir kenar kalmadı;
     * sisin işi değişti ve aralık dışarı taşındı: şehir tamamen berrak,
     * uzak kırsal gökyüzüne karışıyor.
     */
    this.scene.fog = new THREE.Fog('#bcd0dc', FOG_NEAR, FOG_FAR);

    this.controller = new RtsCameraController(canvas.clientWidth / canvas.clientHeight, {
      width: mapWidth,
      height: mapHeight,
    });

    this.setupLights(mapWidth, mapHeight);

    const tileCount = mapWidth * mapHeight;

    // Zemin için iki malzeme: şehir görünümünde ışık alan, veri lensinde
    // ışıktan bağımsız. Bir ısı haritası akşam olunca okunaksızlaşmamalı —
    // lens bilgi taşır, manzara değil.
    // Tur 36: şehir görünümünde kaldırım bandı ve döşeme dokusu (renk
    // taşımıyor, bölge tonu örnek renginden). Lens malzemesi dokusuz kalıyor.
    this.groundLit = new THREE.MeshStandardMaterial({ map: makePlotTexture(), roughness: 0.92, metalness: 0.02 });
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
    // Tur 36: doku üç hücre (düz, yaya geçidi, kavşak); hücre örnek başına.
    roadAtlasSurface(this.roadMaterial);
    roadAtlasSurface(this.roadFlat);
    const roadGeometry = new THREE.BoxGeometry(1.0, 0.08, 1.0);
    this.roadCells = new THREE.InstancedBufferAttribute(new Float32Array(tileCount), 1);
    roadGeometry.setAttribute('aRoadCell', this.roadCells);
    this.roads = new THREE.InstancedMesh(roadGeometry, this.roadMaterial, tileCount);
    this.roads.receiveShadow = true;
    this.roads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.roads.count = 0;
    this.scene.add(this.roads);

    // Pencere ve cephe dokuları gövde parçasına gidiyor; taban ve çatı
    // düz kalıyor. Bu bir tercih değil zorunluluk: doku örnek ölçeğine
    // göre döşendiği için gövdenin üst yüzüne de pencere düşerdi, çatı
    // kapağı o yüzü örtüyor.
    //
    // Tur 24: dokular dört cephe türünü taşıyan atlaslar; hangi binanın
    // hangi türü giydiği örnek başına (bkz. surface.ts). Taban ve çatı
    // da aynı yüzey gölgelendiricisinden geçiyor (zemine yakın karartma,
    // kenar vurgusu), yalnızca dokusuz.
    const windowTexture = makeWindowAtlas();
    const facadeTexture = makeFacadeAtlas();

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
      buildingSurface(material, { tilesPerUnit: 1.05, atlas: true, groundY: 0.07 });
      this.bodyMaterials.push(material);
      return material;
    };
    const makeTrim = (roughness: number, metalness: number): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial({ roughness, metalness });
      buildingSurface(material, { tilesPerUnit: 1.05, atlas: false, groundY: 0.07 });
      return material;
    };

    this.buildings = new BuildingMass(tileCount, makeBody(0.62, 0.1), makeTrim(0.7, 0.06));
    this.fabric = new BuildingMass(tileCount, makeBody(0.82, 0.04), makeTrim(0.88, 0.02));
    this.buildingShadows = new ContactShadows(tileCount);
    this.fabricShadows = new ContactShadows(tileCount);
    this.scene.add(this.buildingShadows.mesh, this.fabricShadows.mesh);

    // Detay katmanı: parça başına kapasite bina başına en kalabalık reçeteye göre.
    this.decorKit = new DecorKit();
    const perTile = (roof: number, box: number, cylinder: number, glass: number, awning: number, sign: number, tree: number, lamp: number): Record<DecorPart, number> => ({
      roof: tileCount * roof,
      box: tileCount * box,
      cylinder: tileCount * cylinder,
      glass: tileCount * glass,
      awning: tileCount * awning,
      sign: tileCount * sign,
      tree: tileCount * tree,
      lamp: tileCount * lamp,
    });
    this.buildingDecor = new DecorLayer(this.decorKit, perTile(3, 3, 3, 2, 1, 2, 9, 0));
    // Kutu: kapı, baca, balkon + Tur 36 bahçesi (çim, iki çit, yürüyüş yolu).
    this.fabricDecor = new DecorLayer(this.decorKit, perTile(3, 7, 2, 0, 1, 2, 7, 0));
    this.streetDecor = new DecorLayer(this.decorKit, perTile(0, 0.5, 0, 0, 0, 0, 1, 0.5));
    this.scene.add(this.buildingDecor.group, this.fabricDecor.group, this.streetDecor.group);
    this.scene.add(this.precipitation.group);
    this.scene.add(this.rings.group, this.fireworks.group);
    // Gece lambaların altına düşen ışık (Tur 36); yer yollar yerleşince geliyor.
    this.lampLight = new LampLight(Math.ceil(tileCount * 0.5));
    this.scene.add(this.lampLight.mesh);
    this.scene.add(...this.buildings.meshes, ...this.fabric.meshes);

    // Ortam haritası: camlar ve metal yüzeyler artık gökyüzünü yansıtıyor.
    // Doku saklanıyor çünkü kalite kademesi düşünce sahneden sökülüp
    // yükselince geri takılıyor — her seferinde yeniden üretmek gereksiz.
    this.envTexture = makeSkyEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.35;

    // Fon aracı sayısı 72'den 48'e indi: kamyonlar geldiğinde sokaklar
    // eskisinden daha kalabalıktı ve zincir akışı gürültünün içinde
    // kayboluyordu. Fon araçları ortamı kurar, kamyonlar bilgi taşır.
    // Tur 34: 48 → 60; araçlar artık üç tür ve doğal renkli, kamyon ve
    // müşterilerin şirket rengini bastırmıyor.
    this.traffic = new TrafficSystem(mapWidth, mapHeight, BLOCK_SIZE, 60);
    this.scene.add(this.traffic.group);
    this.street = new StreetLife(mapWidth, mapHeight, BLOCK_SIZE, 90);
    this.scene.add(this.street.group);

    // Şehrin dışındaki dünya. Trafik'ten SONRA ekleniyor ki sahnedeki
    // sıra "önce şehir, sonra çevresi" okunsun; çizim sırası açısından
    // farkı yok, okuma açısından var.
    this.world = new World(mapWidth, mapHeight);
    this.scene.add(this.world.group);

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

    /*
     * GENEL MERKEZ İŞARETİ.
     *
     * Şirketin bir adı vardı ama bir yeri yoktu. Bu işaret haritada
     * "burası benim merkezim" diyen tek şey.
     *
     * Işıktan bağımsız çizilmiyor — kamyon ve müşteriden farklı olarak
     * bu bir VERİ değil, bir mülkiyet nişanı; şehrin ışığına uyması
     * gerekiyor ki sahnenin parçası gibi dursun, üstüne yapıştırılmış
     * bir arayüz öğesi gibi değil.
     */
    this.hqMarker = new THREE.Group();
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 1.5, 6),
      new THREE.MeshStandardMaterial({ color: '#d8d3c6', roughness: 0.6, metalness: 0.3 }),
    );
    mast.position.y = 0.75;
    this.hqFlag = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.3, 0.04),
      new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }),
    );
    this.hqFlag.position.set(0.26, 1.32, 0);
    this.hqMarker.add(mast, this.hqFlag);
    this.hqMarker.visible = false;
    this.scene.add(this.hqMarker);

    this.districtLines = makeDistrictLines(mapWidth, mapHeight);
    this.scene.add(this.districtLines);

    this.bindInput();
    this.resize();
    // Cihaz tahmininden başla; uyarlama ilk 2,5 saniyede düzeltir.
    this.softwareRenderer = isSoftwareRenderer(this.renderer.getContext());
    this.applyQuality(initialQualityTier(this.softwareRenderer));
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
    this.street.setDataLens(dataLens);
    this.world.setDataLens(dataLens);
    // Anlar (Tur 63) şehrin manzarası: veri haritasında halka da havai fişek de yok.
    this.rings.group.visible = !dataLens;
    this.fireworks.group.visible = !dataLens;
    // Veri lensi zemini düz renkli bir haritaya çeviriyor; leke o rengi kirletirdi.
    this.buildingShadows.setVisible(!dataLens);
    this.fabricShadows.setVisible(!dataLens);
    // Detaylar bilgi taşımıyor: lens açıkken siluet kalabalığı yapmasınlar.
    for (const layer of [this.buildingDecor, this.fabricDecor, this.streetDecor]) {
      layer.setVisible(!dataLens);
      layer.setShadows(!dataLens && shadows, !dataLens);
    }
    this.renderer.shadowMap.enabled = !dataLens && shadows;

    // Pencere parıltısını burada da sıfırla. Bir sonraki gün-döngüsü
    // karesini beklemek, lens açılırken bir karelik amber parlama
    // bırakıyordu.
    if (dataLens) for (const material of this.bodyMaterials) material.emissiveIntensity = 0;
  }

  /** State veya görünüm değiştiğinde çağrılır; her karede değil. */
  syncState(state: GameState, view: ViewOptions): void {
    this.stateSyncs++;
    this.state = state;
    this.view = view;
    this.applyLensMode(view.lens);
    this.syncWeather(state);

    const { width, tiles } = state.map;

    // Zemin karelerinin konumu hiç değişmez; matrisleri yalnızca bir kez yaz.
    // Her günde 576 matris yeniden hesaplamak boşa işti.
    if (!this.groundPlaced) {
      let plotIndex = 0;
      let roadIndex = 0;
      this.groundSlotOfTile = new Int32Array(tiles.length).fill(-1);

      const isRoad = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < state.map.height && tiles[y * width + x]?.kind === 'road';
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i]!;
        if (tile.kind === 'road') {
          // Yolun yönü örnek döndürmesinden geliyor: doku kesikli çizgiyi
          // +X ekseninde taşıyor, yani yatay sokak (y sabit) dönmeden
          // doğru duruyor; düşey sokak çeyrek tur dönüyor.
          //
          // Tur 36: kavşak (iki eksende de yol komşusu) ve kavşağa giren
          // karo (yaya geçidi) ayrı hücre. Geçit dokuda -X ucunda; döndürme
          // onu kavşağa çeviriyor. Y ekseni etrafında +90° yerel -X'i +Z'ye
          // götürüyor.
          const { cell, yaw } = roadCellOf(tile.x, tile.y, isRoad);
          this.dummy.position.set(tile.x, -0.02, tile.y);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.rotation.set(0, yaw, 0);
          this.dummy.updateMatrix();
          this.roads.setMatrixAt(roadIndex, this.dummy.matrix);
          this.roadCells.setX(roadIndex, cell);
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
      this.lampLight.place(placeStreetTrees(this.streetDecor, tiles, BLOCK_SIZE));
      this.ground.instanceMatrix.needsUpdate = true;
      this.roads.instanceMatrix.needsUpdate = true;
      this.roadCells.needsUpdate = true;
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

    // Şehrin mevcut dokusu: oyuncuya ait olmayan yapılar. Değişmediyse dünkü yerleşim duruyor.
    if (this.fabricChanged(tiles)) this.syncFabric(tiles);
    // Yıkım (Tur 63): yapısı kalkan karede toz; satın alınıp boşaltılan arsa görünür bir an.
    if (this.momentsOn() && this.sawBuildings) {
      for (const index of this.fabricRemoved) {
        const tile = tiles[index];
        if (tile) this.street.burst(tile.x, tile.y, 1.1);
      }
    }
    this.fabricRemoved.length = 0;

    this.syncBuildings(state);
    this.syncCelebration(state);

    if (view.selectedTileId !== null) {
      const tile = tiles[view.selectedTileId];
      this.selection.visible = Boolean(tile);
      if (tile) this.selection.position.set(tile.x, 0.1, tile.y);
    } else {
      this.selection.visible = false;
    }

    this.syncRoutes(state, view.playerCompanyId);
    this.syncShoppers(state);
    this.syncHeadquarters(state, view.playerCompanyId);
    this.syncGhost(width);
  }

  /**
   * Doku dünden beri değişti mi; değiştiyse yeni hâli aklında tutar (Tur 43).
   * Yerleşim yalnızca karenin yapısına ve yüksekliğine bakıyor (renk sapması
   * ve cephe karenin kimliğinden), yani bu ikisi aynıysa çıktı da aynı.
   */
  private fabricChanged(tiles: GameState['map']['tiles']): boolean {
    const fresh = this.fabricStructures.length !== tiles.length;
    let changed = fresh;
    if (changed) {
      this.fabricStructures = new Array<string | null>(tiles.length).fill(null);
      this.fabricHeights = new Float64Array(tiles.length);
    }
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]!;
      const structure = tile.structureId ?? null;
      const height = structure ? tile.structureHeight : 0;
      if (this.fabricStructures[i] === structure && this.fabricHeights[i] === height) continue;
      if (!fresh && structure === null && this.fabricStructures[i] !== null) this.fabricRemoved.push(i);
      this.fabricStructures[i] = structure;
      this.fabricHeights[i] = height;
      changed = true;
    }
    return changed;
  }

  /** Şehrin mevcut dokusu: oyuncuya ait olmayan yapılar, süsleri, gölgeleri ve bacaları. */
  private syncFabric(tiles: GameState['map']['tiles']): void {
    this.fabricSyncs++;
    this.fabric.begin();
    this.fabricShadows.begin();
    this.fabricDecor.begin();
    const fabricSmoke: SmokeEmitter[] = [];
    for (const tile of tiles) {
      if (!tile.structureId) continue;
      const structure = STRUCTURE_BY_ID[tile.structureId];
      if (!structure) continue;

      // Aynı yapı tipinden sıkıcı bir tekrar çıkmasın diye kareye göre
      // deterministik küçük bir renk sapması veriyoruz.
      const jitter = ((tile.id * 37) % 17) / 17 - 0.5;
      this.color.set(structure.color).offsetHSL(jitter * 0.02, 0, jitter * 0.07);

      // Müstakil ev parselin ortasında, bahçesiyle (Tur 36): 0,8 genişlikte
      // parseli kaplıyor, çim ve çit evin altında kalıyordu.
      const yard = structure.form === 'house' && structure.id !== 'old_shopfront';
      const width = yard ? 0.62 : 0.8;
      const footprint = this.fabric.place({
        x: tile.x,
        z: tile.y,
        height: Math.max(0.03, tile.structureHeight) * 1.5,
        width,
        groundY: 0.07,
        color: this.color,
        form: structure.form,
        facade: structureFacade(structure, tile.id),
        pitchedRoof: structure.form === 'house',
      });
      decorateStructure(this.fabricDecor, structure, footprint, tile.x, tile.y, streetSide(tile.x, tile.y, BLOCK_SIZE));
      // Çalışan fabrika tütüyor; eski depo atıl, tütmüyor.
      if (structure.id === 'factory_shed' && footprint.stack) fabricSmoke.push(smokeFrom(footprint.stack));
      if (structure.form !== 'flat' && structure.form !== 'field') {
        this.fabricShadows.place(tile.x, 0.07, tile.y, width, Math.min(1, tile.structureHeight));
      }
    }
    this.fabric.end();
    this.fabricShadows.end();
    this.fabricDecor.end();
    this.street.setEmitters('fabric', fabricSmoke);
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
    let shifting = false;
    const now = performance.now();
    const moments = this.momentsOn() && this.sawBuildings;
    // Devralma dalgasının çıkış noktası: yeni sahibin genel merkezi (şirket başına bir kez).
    const origins = new Map<string, { x: number; y: number } | null>();
    const originOf = (companyId: string): { x: number; y: number } | null => {
      if (!origins.has(companyId)) {
        const hq = headquarters(state, companyId);
        const at = hq ? tiles[hq.tileId] : undefined;
        origins.set(companyId, at ? { x: at.x, y: at.y } : null);
      }
      return origins.get(companyId)!;
    };

    this.buildings.begin();
    this.buildingShadows.begin();
    this.buildingDecor.begin();
    const producing: SmokeEmitter[] = [];
    for (const building of Object.values(state.buildings)) {
      const def = BUILDING_BY_ID[building.defId];
      const tile = tiles[building.tileId];
      if (!def || !tile) continue;

      /*
       * SAHİBİN RENGİ ÇATIDA (Tur 36).
       *
       * Eskiden gövdenin tamamı sahibin rengine çekiliyordu (%55): rakibin
       * moru ya da pembesi şehrin yarısını boyuyor, şehir oyuncak gibi
       * duruyordu. Artık gövde doğal malzemede (sıva/tuğla, cam/çelik,
       * sanayi paneli; kategori renginden yalnızca bir ima). Kimin nerede
       * olduğu çatı kapağından, kornişten, kırma çatıdan, tenteden ve
       * tabeladan okunuyor; kamera yukarıdan baktığı için en çok görünen
       * yüzey zaten çatı. Kullanıcı A/B karelerinden B'yi seçti.
       */
      const company = state.companies[building.companyId];
      naturalColor(this.color, buildingFacade(def), tile.x, tile.y).lerp(this.categoryColor.set(def.color), 0.18);
      this.ownerColor.set(company && !company.isPlayer ? company.color : this.playerAccent());

      /*
       * DEVRALMA (Tur 63): sahibi değişen binanın çatısı bir karede dönmüyor.
       * Eski renkten yenisine geçiyor; geçiş yeni sahibin genel merkezinden
       * dışa doğru bir dalga, her binada yerde bir halka. Rakibi yutan
       * oyuncu şehrin kendi rengine boyandığını görüyor.
       */
      const accent = this.ownerColor.getHex();
      const owner = this.buildingOwners.get(building.id);
      if (moments && owner && owner.companyId !== building.companyId) {
        const origin = originOf(building.companyId);
        const delay = origin ? waveDelay(Math.hypot(tile.x - origin.x, tile.y - origin.y)) : 0;
        this.ownerShifts.set(building.id, { start: now + delay * 1000, from: owner.accent });
        this.rings.pulse(tile.x, tile.y, accent, delay);
      }
      this.buildingOwners.set(building.id, { companyId: building.companyId, accent });
      const shift = this.ownerShifts.get(building.id);
      if (shift) {
        const k = (now - shift.start) / (MOMENT.shiftSeconds * 1000);
        if (k >= 1 || !this.momentsOn()) this.ownerShifts.delete(building.id);
        else {
          shifting = true;
          this.ownerColor.setHex(shift.from).lerp(this.shiftTo.setHex(accent), smooth(k));
        }
      }

      // İnşaattaki proje (Tur 58): beton iskelet gün gün yükseliyor, vinç başında.
      const development = building.development;
      const site =
        development && development.occupancy === undefined
          ? Math.min(1, Math.max(0, (state.time.day - building.builtDay) / Math.max(1, development.opensOnDay - building.builtDay)))
          : null;

      // Proje açılışı (Tur 63): şantiye bitince bina iskeletin boyundan tam boyuna yükseliyor, tozuyla.
      if (site !== null) this.siteIds.add(building.id);
      else if (this.siteIds.delete(building.id) && moments) {
        this.growFrom.set(building.id, SITE_TOP);
        this.buildStart.set(building.id, now);
        this.street.burst(tile.x, tile.y, 1.25);
      }

      // İnşaat (Tur 63): temel atılırken toz, yükseliş bitince yerde halka.
      const fresh = !this.buildStart.has(building.id);
      const growth = this.growthOf(building.id);
      if (growth < 1) {
        growing = true;
        if (fresh) this.street.burst(tile.x, tile.y, 0.9 + Math.min(0.5, def.height * 0.25));
        this.risingIds.add(building.id);
      } else if (this.risingIds.delete(building.id) && moments) {
        this.rings.pulse(tile.x, tile.y, accent);
      }
      if (site !== null) this.color.set(SITE_CONCRETE);
      const form = site !== null ? 'block' : massFormOf(def);
      const height = Math.max(0.3, def.height) * 1.5 * (site !== null ? 0.2 + (SITE_TOP - 0.2) * site : 1);
      const footprint = this.buildings.place({
        x: tile.x,
        z: tile.y,
        height,
        width: 0.68,
        groundY: 0.07,
        color: this.color,
        growth,
        form,
        facade: site !== null ? FACADE.industrial : buildingFacade(def),
        pitchedRoof: form === 'house' && growth >= 1,
        // Şantiyenin kornişi de beton: sahibin rengi açılışta.
        accent: site !== null ? this.color : this.ownerColor,
      });
      // Detaylar bina tamamlanınca: yükselen kütleye tente asmak tuhaf durur.
      // Kırma çatı da sahibin renginde (çatı rengi = `tint`).
      if (growth >= 1 && site !== null) {
        decorateSite(this.buildingDecor, footprint, tile.x, tile.y, streetSide(tile.x, tile.y, BLOCK_SIZE), height);
      } else if (growth >= 1) {
        decorateBuilding(this.buildingDecor, def, footprint, tile.x, tile.y, streetSide(tile.x, tile.y, BLOCK_SIZE), this.ownerColor, this.ownerColor);
      }
      if (def.role !== 'extract' && !def.solar) this.buildingShadows.place(tile.x, 0.07, tile.y, 0.68 * Math.max(0.3, growth), Math.min(1, def.height));
      // Duman bilgi: yalnızca dün gerçekten üretim yapmış tesis tütüyor.
      // Girdisi kesilen tesisin bacası susuyor.
      if (def.role === 'process' && growth >= 1 && building.last.producedUnits > 0 && footprint.stack) {
        producing.push(smokeFrom(footprint.stack));
      }
      // Doğalgaz santrali (Tur 57): dün enerji verdiyse bacası tütüyor.
      const power = building.last.plant;
      if (def.role === 'energy' && def.fuel && growth >= 1 && power && power.ownMwh + power.rivalMwh > 0 && footprint.stack) {
        producing.push(smokeFrom(footprint.stack));
      }
    }
    this.street.setEmitters('buildings', producing);
    this.buildings.end();
    this.buildingShadows.end();
    this.buildingDecor.end();

    this.buildingsGrowing = growing;
    this.buildingsShifting = shifting;
    this.sawBuildings = true;

    // Yıkılan binaların kaydı birikmesin.
    if (this.buildStart.size > Object.keys(state.buildings).length * 2 + 16) {
      for (const id of this.buildStart.keys()) {
        if (!state.buildings[id]) this.buildStart.delete(id);
      }
    }
    if (this.buildingOwners.size > Object.keys(state.buildings).length * 2 + 16) {
      for (const id of this.buildingOwners.keys()) {
        if (!state.buildings[id]) {
          this.buildingOwners.delete(id);
          this.siteIds.delete(id);
          this.risingIds.delete(id);
          this.growFrom.delete(id);
        }
      }
    }
  }

  /**
   * Zafer gecesi (Tur 63): motor zaferi ilan edince (ya da senaryo
   * kazanılınca) şehrin üstünde havai fişek. Kayıt açılırken zaten
   * kazanılmış olan zafer kutlanmıyor; kutlama bir kez.
   */
  private syncCelebration(state: GameState): void {
    const victory = state.victory && !state.victory.dismissed ? `victory:${state.victory.day}` : null;
    const scenario = state.scenario?.outcome === 'won' ? `scenario:${state.scenario.finishedDay ?? state.time.day}` : null;
    const key = victory ?? scenario;
    if (key === this.celebrationKey) return;
    const first = this.celebrationKey === undefined;
    this.celebrationKey = key;
    if (key && !first && this.momentsOn()) {
      this.fireworks.start((state.meta.seed ^ Math.imul(state.time.day + 1, 0x9e3779b1)) >>> 0, this.playerAccent());
    }
  }

  /** Anlar çiziliyor mu: azaltılmış harekette hiçbiri (toz, halka, dalga, havai fişek). */
  private momentsOn(): boolean {
    return !this.reducedMotion;
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
      // Azaltılmış harekette (Tur 63) yeni bina da yerinde beliriyor.
      start = this.sawBuildings && this.momentsOn() ? performance.now() : 0;
      this.buildStart.set(id, start);
    }
    if (start === 0) return 1;
    const t = (performance.now() - start) / BUILD_ANIM_MS;
    if (t >= 1 || !this.momentsOn()) {
      this.buildStart.set(id, 0);
      this.growFrom.delete(id);
      return 1;
    }
    // Yumuşak giriş-çıkış: sert bir doğrusal yükseliş mekanik duruyor.
    const from = this.growFrom.get(id) ?? 0;
    return from + (1 - from) * smooth(t);
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
        color: company?.isPlayer ? this.playerAccent() : (company?.color ?? '#8899aa'),
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
        color: company?.isPlayer ? this.playerAccent() : (company?.color ?? '#8899aa'),
      };
    });
  }

  /**
   * Genel merkez işaretini oyuncunun en eski binasının tepesine koyar.
   *
   * Merkez state'te saklanmıyor, `headquarters()` türetiyor: en eski
   * bina. Kural kendini onarıyor — merkezi yıkarsan işaret bir sonraki
   * en eski binaya taşınıyor.
   */
  private syncHeadquarters(state: GameState, playerCompanyId: string): void {
    const hq = headquarters(state, playerCompanyId);
    if (!hq) {
      this.hqMarker.visible = false;
      return;
    }
    const tile = state.map.tiles[hq.tileId];
    const def = BUILDING_BY_ID[hq.defId];
    if (!tile || !def) {
      this.hqMarker.visible = false;
      return;
    }

    // Bina yüksekliği `syncBuildings` ile aynı formülden geliyor; iki
    // yerde farklı hesaplanırsa bayrak çatının içine gömülür.
    const height = Math.max(0.3, def.height) * 1.5;
    const company = state.companies[playerCompanyId];
    (this.hqFlag.material as THREE.MeshStandardMaterial).color.set(
      company?.isPlayer ? this.playerAccent() : (company?.color ?? '#8899aa'),
    );
    this.hqMarker.position.set(tile.x, 0.07 + height * this.growthOf(hq.id), tile.y);
    this.hqMarker.visible = true;
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

  private roadCellCounts(): { straight: number; crosswalk: number; intersection: number } {
    const counts = { straight: 0, crosswalk: 0, intersection: 0 };
    for (let i = 0; i < this.roads.count; i++) {
      const cell = this.roadCells.getX(i);
      if (cell === ROAD_CELL.intersection) counts.intersection++;
      else if (cell === ROAD_CELL.crosswalk) counts.crosswalk++;
      else counts.straight++;
    }
    return counts;
  }

  private tileColor(state: GameState, tileId: number, view: ViewOptions): THREE.Color {
    const tile = state.map.tiles[tileId]!;
    const district = state.districts[tile.districtId];

    // Sokaklar her lenste sokak kalır — şehrin okunabilirliği lensin
    // altında kaybolmamalı.
    if (tile.kind === 'road') return this.color.set('#12171f');

    // Kilitli bölge HER lenste kırsal yeşil: oradaki veri henüz karar
    // verisi değil, lens orayı boyasaydı "oynanabilir alan" gibi
    // okunurdu. Renk ailesi dünya zeminiyle aynı (#8ea375), kare başına
    // hafif kırpma — düz tek renk halı gibi durmasın.
    if (district?.opensOnDay !== undefined && state.time.day < district.opensOnDay) {
      const jitter = ((tile.x * 73 + tile.y * 151) % 7) - 3;
      return this.color.set('#7f9468').offsetHSL(jitter * 0.004, 0, jitter * 0.012);
    }

    if (view.lens === 'ownership') {
      if (!tile.ownerId) return this.color.copy(FREE_COLOR);
      const owner = state.companies[tile.ownerId];
      if (owner?.isPlayer && this.safePalette) return this.color.set(SAFE_PLAYER_ACCENT).multiplyScalar(0.9);
      return this.color.set(owner?.color ?? '#888888').multiplyScalar(0.7);
    }

    if (view.lens === 'none') {
      if (tile.kind === 'civic') return this.color.set('#25382c');
      const base = district ? DISTRICT_ARCHETYPES[district.archetype].color : '#2a3446';
      this.color.set(base);
      // Boş parsel biraz daha aydınlık: "burası alınabilir" sinyali.
      if (!tile.structureId && !tile.ownerId) this.color.offsetHSL(0, 0.02, 0.07);
      // Kendi arsan hafif yeşile çalsın; sahiplik lens açmadan da okunsun.
      if (tile.ownerId === view.playerCompanyId) this.color.lerp(this.safePalette ? SAFE_OWN_COLOR : OWN_COLOR, 0.35);
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
    // Hava (Tur 62): yeni hava birkaç saniyede geliyor, bulut güneşi kısıyor.
    if (this.weatherBlend < 1) {
      this.weatherBlend = Math.min(1, this.weatherBlend + dt / WEATHER_FADE_SECONDS);
      mixWeather(this.weatherFrom, this.weatherTo, this.weatherBlend, this.weatherNow);
    }
    const weather = this.weatherNow;
    // Bulut yalnız gün ışığını kısıyor; gecenin tabanı (1,1) olduğu gibi:
    // fırtınalı gece de okunur kalmalı (tarayıcı testi, "güneş sönmüyor").
    this.sun.intensity = 1.1 + daylight * 1.35 * weather.sun;
    // Renk iki sabit ton arasında geçer: gece soğuk ay ışığı, gündüz ılık
    // güneş. Ton (hue) üzerinden geçmek yeşilden geçirirdi.
    this.sun.color.copy(MOONLIGHT).lerp(SUNLIGHT, daylight);
    this.hemisphere.intensity = (1.0 + daylight * 0.4) * weather.hemisphere;
    this.hemisphere.color.copy(NIGHT_SKY_LIGHT).lerp(DAY_SKY_LIGHT, daylight);

    /*
     * Gökyüzü ve sis birlikte kayar: gündüz açık mavi, gece lacivert.
     *
     * Aydınlık tema gökyüzünü de yukarı çekti. Eski aralık (L 0,13–0,43)
     * gündüzü bile alacakaranlıkta bırakıyordu; şehir güzel görünüyordu
     * ama oyunun tamamı koyu bir yerde geçiyordu. Gece hâlâ gece —
     * pencere ışıkları oyunun en iyi göründüğü an ve o korundu — ama
     * gündüz artık gerçekten gündüz.
     */
    this.skyColor.setHSL(0.57, (0.4 - daylight * 0.17) * weather.skySaturation, 0.2 + daylight * (0.38 + weather.skyLightness));
    (this.scene.background as THREE.Color).copy(this.skyColor);
    this.scene.fog?.color.copy(this.skyColor);
    // Sis havayla yaklaşıyor: sisli günde ufuk şehrin kenarında.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = FOG_NEAR * weather.fogDistance;
      fog.far = FOG_FAR * weather.fogDistance;
    }

    // Ortam yansıması da günle birlikte kısılıyor: gece gökyüzü karanlık,
    // dolayısıyla camların yansıttığı şey de karanlık olmalı.
    this.scene.environmentIntensity = 0.12 + daylight * 0.3;

    // Kırsal da günle birlikte kararıyor; sebebi `world.ts` içinde.
    this.world.setDaylight(daylight);

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
    // Gece yarısına doğru pencereler tek tek sönüyor (Tur 36, surface.ts).
    setWindowLateNight(-elevation);
    this.decorKit.setNightGlow(glow);
    this.lampLight.setGlow(glow);
    this.traffic.setNightGlow(this.dataLensActive ? 0 : glow);
    this.street.setDaylight(daylight);

    // Yerdeki kar (Tur 62): zemin, kırsal ve çatılar beyaza çekiliyor; gece sönük.
    const snowGlow = this.dataLensActive ? 0 : this.season.snow * (0.06 + daylight * 0.2);
    // Parseller bölge rengini taşıyor: kar onları örtmesin, yalnız açsın.
    this.groundLit.emissive.setRGB(0.86, 0.9, 0.95).multiplyScalar(snowGlow * 0.7);
    this.world.setSnowGlow(snowGlow * 1.5);
    this.decorKit.setSnowGlow(snowGlow * 1.8);
  }

  /**
   * Şehrin havası ve mevsimi (Tur 62). Her durum eşitlemesinde okunuyor
   * (birkaç zar, durum değişmiyor); değişen bir şey varsa uygulanıyor.
   * Hava günden güne birkaç saniyelik bir geçişle değişiyor; ilk
   * eşitlemede, azaltılmış harekette ve takvim atlayınca (kayıt açıldı,
   * başka şehre geçildi) geçişsiz geliyor.
   */
  private syncWeather(state: GameState): void {
    const city = cityWeather(state);
    this.weather = city;
    const jumped = Math.abs(state.time.day - this.weatherDay) > 1;
    this.weatherDay = state.time.day;
    if (city.weather.id !== this.weatherKey) {
      const instant = this.weatherKey === '' || this.reducedMotion || jumped;
      this.weatherKey = city.weather.id;
      this.weatherFrom = { ...this.weatherNow };
      this.weatherTo = weatherLook(city.weather);
      this.weatherBlend = instant ? 1 : 0;
      if (instant) Object.assign(this.weatherNow, this.weatherTo);
    }
    // Kar örtüsü yirmide bir adımla: eriyen kar her gün ağaçları yeniden boyamasın.
    const snow = Math.round(city.snowCover * 20) / 20;
    const key = `${city.season.id}|${snow}`;
    if (key === this.seasonKey) return;
    this.seasonKey = key;
    this.season = seasonLook(city.season.id, snow);
    this.world.setSeason(this.season);
    for (const layer of [this.buildingDecor, this.fabricDecor, this.streetDecor]) layer.setFoliage(this.season);
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
    if (!this.shadersReady()) return;

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
    this.street.update(dt);
    // Yağış kameranın baktığı yerin çevresinde; kutu yakınlaştıkça daralıyor.
    this.precipitation.update(
      dt,
      this.controller.targetPoint,
      Math.max(10, Math.min(42, this.controller.targetDistance * 0.75)),
      this.weatherNow.rain,
      this.weatherNow.snowfall,
      this.daylight(),
      this.weatherEffects && !this.reducedMotion && !this.dataLensActive,
    );

    // Anlar (Tur 63): halkalar ve zafer gecesi; veri lensinde ikisi de susuyor.
    this.rings.update(dt);
    this.fireworks.update(dt, this.controller.targetPoint, Math.max(8, Math.min(30, this.controller.targetDistance * 0.5)));

    // İnşaat animasyonu ve devralma dalgası sürerken binalar her karede
    // yeniden yerleşiyor; şehrin geri kalanı yalnızca state değişince.
    if ((this.buildingsGrowing || this.buildingsShifting) && this.state) this.syncBuildings(this.state);

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
   * Gölgelendiricileri ilk kareden önce derler (Tur 42).
   *
   * Eskiden programlar ilk karenin içinde, sahne çizilirken teker teker
   * derleniyordu: ilk kare derleme bitene dek bekliyordu. Şimdi sahne
   * durumu geldiğinde ilk karede görünen bütün malzemeler bir kerede
   * derleniyor; tarayıcı paralel derlemeyi destekliyorsa
   * (`KHR_parallel_shader_compile`) çizim döngüsü bu sırada beklemiyor,
   * arayüz canlı kalıyor. Hazır olana dek tuval gökyüzü rengiyle
   * siliniyor; siyah bir kare görünmüyor.
   *
   * Yan kazanç: three ilk karede gölge geçişini ışıklar sayılmadan
   * çiziyordu; derinlik programları önce "ışıksız" anahtarla, ikinci
   * karede yeniden derleniyordu. Ön derleme ışıkları önceden sayıyor.
   *
   * Programın anahtarı çizilen hedefe bağlı: bloom açıkken sahne ara
   * hedefe çiziliyor (ton eşlemesi `OutputPass`'te), ön derleme de oraya.
   * Bloom ve çıkış geçişlerinin tam ekran malzemeleri sahnede değil; onlar
   * `postProcessingMaterials`'tan, kendi hedefleriyle derleniyor.
   */
  private shadersReady(): boolean {
    if (this.shaderWarmup === 'done') return true;
    if (!this.state) return this.shaderRewarm ? false : this.clearUntilReady();
    if (this.shaderWarmup === 'idle') {
      this.shaderWarmup = 'compiling';
      this.shaderWarmupStarted = performance.now();
      const previous = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.composer ? this.composer.readBuffer : null);
      try {
        // Yalnız ilk karede görünenler. Görünmeyenler (yerleştirme hayaleti,
        // genel merkez işareti, veri merceğinin düz malzemeleri) eskisi gibi
        // ilk kullanıldıklarında derleniyor; açılışı uzatmıyorlar.
        const camera = this.controller.camera;
        // Yağış (Tur 62) ve anlar (Tur 63) ilk karede görünmüyor; ilk
        // yağmurda, ilk devralmada, zafer gecesinde kare takılmasın diye
        // programları şimdi derleniyor. Halka seçim işaretiyle, havai fişek
        // kar noktalarıyla aynı program: birer örnek yetiyor.
        const hidden = [
          ...this.precipitation.group.children,
          this.rings.group.children[0],
          this.fireworks.group.children[0],
        ];
        for (const object of hidden) {
          const drawable = object as (THREE.Mesh | THREE.Line | THREE.Points) | undefined;
          if (!drawable) continue;
          const visible = drawable.visible;
          drawable.visible = true;
          this.renderer.compile(drawable, camera, this.scene);
          drawable.visible = visible;
        }
        this.scene.traverseVisible((object) => {
          const drawable = object as THREE.Mesh & { isLine?: boolean; isPoints?: boolean };
          if ((drawable.isMesh || drawable.isLine || drawable.isPoints) && drawable.material) {
            this.renderer.compile(drawable, camera, this.scene);
          }
        });
        // Bloom ve çıkış geçişlerinin malzemeleri sahnede değil (Codex #71).
        if (this.composer) {
          for (const { material, toScreen } of postProcessingMaterials(this.composer, this.renderer)) {
            this.renderer.setRenderTarget(toScreen ? null : this.composer.readBuffer);
            FULLSCREEN_QUAD.material = material;
            this.renderer.compile(FULLSCREEN_QUAD, FULLSCREEN_CAMERA);
          }
        }
      } finally {
        this.renderer.setRenderTarget(previous);
      }
    }
    const programs = this.renderer.info.programs ?? [];
    const ready = programs.every((program) => (program as THREE.WebGLProgram & { isReady?: () => boolean }).isReady?.() ?? true);
    if (!ready && performance.now() - this.shaderWarmupStarted < SHADER_WARMUP_LIMIT_MS) {
      // Oyun içinde kademe değişiyorsa son kare ekranda kalsın; tuval silinmesin.
      return this.shaderRewarm ? false : this.clearUntilReady();
    }
    this.shaderWarmup = 'done';
    this.shaderWarmupMs ??= Math.round(performance.now() - this.shaderWarmupStarted);
    this.shaderRewarm = false;
    return true;
  }

  /**
   * Gölgelendiriciler hazır mı, yani `render` şehri çiziyor mu (Tur 42).
   * Ön derleme sürerken oyun döngüsü oyun saatini de ilerletmiyor
   * (Codex #71): yoksa oyuncu göremediği günleri kaçırırdı.
   */
  shadersWarm(): boolean {
    return this.shaderWarmup === 'done';
  }

  /**
   * Ön derleme sürerken tuvali gökyüzü rengiyle siler; kare çizilmedi sayılır.
   * three'nin silme rengi sahne çizilene dek siyah: rengi burada vermek gerekiyor.
   */
  private clearUntilReady(): false {
    const previous = this.renderer.getClearColor(CLEAR_SCRATCH);
    const alpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.scene.background as THREE.Color, 1);
    this.renderer.clear();
    this.renderer.setClearColor(previous, alpha);
    return false;
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
      new SharedKernelBloomPass(
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
    this.qualityWarmup = QUALITY_WARMUP_FRAMES;

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
    for (const layer of [this.buildingDecor, this.fabricDecor, this.streetDecor]) layer.setShadows(shadows, shadows);
    this.ground.receiveShadow = shadows;
    this.roads.receiveShadow = shadows;

    this.traffic.setCarBudget(level.carBudget);
    // Kırsal ağaçları da kademeyle seyreliyor (Tur 34): aynı bütçe.
    this.world.setTreeBudget(level.carBudget);
    this.street.setBudget(level.carBudget);
    this.precipitation.setBudget(level.carBudget);
    this.setPostProcessing(level.postProcessing);
    this.scene.environment = level.environment ? this.envTexture : null;

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.material) (mesh.material as THREE.Material).needsUpdate = true;
    });
    // Gölgeler açılınca three ilk gölge geçişini eski ışık sayısıyla çiziyor ve
    // derinlik programlarını iki kez derliyordu; ön derleme ışıkları önce sayar.
    if (this.shaderWarmup === 'done') {
      this.shaderWarmup = 'idle';
      this.shaderRewarm = true;
    }
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
    if (this.qualityWarmup > 0) {
      this.qualityWarmup--;
      return;
    }
    this.frameSamples++;
    this.frameTimeSum += dt;

    const crawling =
      this.frameSamples >= QUALITY_FAST_FRAMES && this.frameSamples / this.frameTimeSum < QUALITY_FLOOR_FPS / 4;
    if (!crawling && (this.frameTimeSum < QUALITY_WINDOW_SECONDS || this.frameSamples < QUALITY_WINDOW_FRAMES)) {
      return;
    }

    const averageFps = this.frameSamples / this.frameTimeSum;
    this.frameSamples = 0;
    this.frameTimeSum = 0;

    if (averageFps < QUALITY_FLOOR_FPS && this.qualityTier < QUALITY_LEVELS.length - 1) {
      const next = Math.min(QUALITY_LEVELS.length - 1, this.qualityTier + (crawling ? 2 : 1));
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
    /** Detay katmanı (Tur 24): parça başına örnek, görünürlük, lamba parıltısı. */
    decor: Record<DecorPart, number>;
    decorVisible: boolean;
    contactShadows: number;
    /** Kırsalda çizilen gerçek ağaç sayısı (Tur 34). */
    countrysideTrees: number;
    lampGlow: number;
    /** Tur 36: yol karolarının hücreleri, lamba ışık havuzları, gecenin derinliği. */
    roadCells: { straight: number; crosswalk: number; intersection: number };
    lampPools: { count: number; opacity: number; visible: boolean };
    windowLateNight: number;
    groundColorSum: number;
    timeOfDay: number;
    /** Yolda olan zincir kamyonu sayısı. */
    truckCount: number;
    /** Kamyon konumlarının toplamı; hareket ettiklerini ölçmek için. */
    truckPositionSum: number;
    /** Fon araçları görünür mü (veri lensinde susarlar). */
    carsVisible: boolean;
    /** Fon araçları türlere göre ve gece ışıkları (Tur 34). */
    vehicles: { car: number; van: number; bus: number; lights: boolean };
    /** Yayalar ve tüten bacalar (Tur 34). */
    street: { walkers: number; stacks: number; producing: number; puffs: number; dust: number; visible: boolean };
    /** Önemli anlar (Tur 63): toz bulutu, halka, renk dalgası, yükselen bina, havai fişek. */
    moments: {
      dust: number;
      rings: number;
      /** Halka ve havai fişek katmanı görünür mü (veri lensinde değil). */
      visible: boolean;
      shifting: number;
      rising: number;
      fireworks: ReturnType<Fireworks['stats']>;
    };
    /** Mağazalara akan müşteri aracı sayısı. */
    shopperCount: number;
    /** Müşteri konumlarının toplamı; hareket ettiklerini ölçmek için. */
    shopperPositionSum: number;
    /** Müşteri araçlarının rengi — akışın kime gittiğini sınamak için. */
    shopperColors: string[];
    /** Erişilebilirlik ayarları (Tur 47). */
    palette: 'standard' | 'safe';
    reducedMotion: boolean;
    /**
     * Mevsim ve hava (Tur 62): şehrin havası, yerdeki kar, ekrandaki
     * yağmur damlası ve kar tanesi, ağaçların rengi, ışığın bulut payı.
     */
    weather: {
      id: string;
      season: string;
      snowCover: number;
      eventId: string | null;
      rain: number;
      snow: number;
      fallSum: number;
      effects: boolean;
      sunScale: number;
      fogFar: number;
      countrysideTree: string;
      streetTree: string | null;
    };
    /** Kameranın şu an baktığı nokta; azaltılmış harekette odaklanınca hedefle aynı. */
    cameraCurrent: { x: number; z: number };
    /** Genel merkez işareti görünür mü ve nerede duruyor. */
    hqVisible: boolean;
    hqPosition: { x: number; y: number; z: number } | null;
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
    /** Derlenmiş gölgelendirici programı sayısı (Tur 42). */
    programs: number;
    /** Ön derlemenin süresi; ilk kare çizilmeden önce null. */
    shaderWarmupMs: number | null;
    /** Yazılımsal GPU mu. */
    softwareRenderer: boolean;
    /** State eşitleme sayısı ve şehir dokusunun yeniden yerleştirildiği kaçı (Tur 43). */
    stateSyncs: number;
    fabricSyncs: number;
    /** Şehir dokusunun çizilen örnekleri (taban, gövde, çatı). */
    fabricInstances: number;
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
      decor: this.decorTotals(),
      decorVisible: this.buildingDecor.group.visible && this.fabricDecor.group.visible && this.streetDecor.group.visible,
      contactShadows: this.buildingShadows.mesh.count + this.fabricShadows.mesh.count,
      countrysideTrees: this.world.treeCount,
      lampGlow: this.decorKit.lampMaterial.emissiveIntensity,
      roadCells: this.roadCellCounts(),
      lampPools: this.lampLight.info(),
      windowLateNight: windowLateNight(),
      groundColorSum,
      timeOfDay: this.timeOfDay,
      truckCount: this.traffic.truckCount,
      truckPositionSum: this.traffic.truckPositionSum,
      carsVisible: this.traffic.carsVisible,
      vehicles: this.traffic.vehicleStats,
      street: this.street.stats,
      moments: {
        dust: this.street.stats.dust,
        rings: this.rings.stats().rings,
        visible: this.rings.group.visible,
        shifting: this.ownerShifts.size,
        rising: this.risingIds.size,
        fireworks: this.fireworks.stats(),
      },
      shopperCount: this.traffic.shopperCount,
      shopperPositionSum: this.traffic.shopperPositionSum,
      shopperColors: this.traffic.shopperColors,
      palette: this.safePalette ? 'safe' : 'standard',
      reducedMotion: this.reducedMotion,
      weather: {
        id: this.weather?.weather.id ?? 'clear',
        season: this.season.season,
        snowCover: this.season.snow,
        eventId: this.weather?.eventId ?? null,
        ...this.precipitation.stats(),
        fallSum: this.precipitation.heightSum(),
        effects: this.weatherEffects,
        sunScale: this.weatherNow.sun,
        fogFar: (this.scene.fog as THREE.Fog | null)?.far ?? 0,
        countrysideTree: this.world.foliageSample,
        streetTree: this.streetDecor.treeColorSample() ?? this.buildingDecor.treeColorSample(),
      },
      cameraCurrent: this.controller.currentPoint,
      hqVisible: this.hqMarker.visible,
      hqPosition: this.hqMarker.visible
        ? { x: this.hqMarker.position.x, y: this.hqMarker.position.y, z: this.hqMarker.position.z }
        : null,
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
      programs: this.renderer.info.programs?.length ?? 0,
      shaderWarmupMs: this.shaderWarmupMs,
      softwareRenderer: this.softwareRenderer,
      stateSyncs: this.stateSyncs,
      fabricSyncs: this.fabricSyncs,
      fabricInstances: this.fabric.meshes.reduce((sum, mesh) => sum + mesh.count, 0),
    };
  }

  /** Üç detay katmanının parça başına örnek toplamı. */
  private decorTotals(): Record<DecorPart, number> {
    const total = this.buildingDecor.stats();
    for (const layer of [this.fabricDecor, this.streetDecor]) {
      const stats = layer.stats();
      for (const part of Object.keys(total) as DecorPart[]) total[part] += stats[part];
    }
    return total;
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

  /**
   * Bir karenin (binası varsa çatısının) ekrandaki yeri, sayfa CSS
   * pikseliyle. Fırsat balonu (Tur 37c) her karede buna bağlanıyor;
   * `visible` kare kameranın önünde ve tuvalin içindeyse doğru.
   * Yükseklik `syncBuildings` ile aynı formül — balon çatıya otursun.
   */
  screenOfTile(tileId: number): { x: number; y: number; visible: boolean } | null {
    const tile = this.state?.map.tiles[tileId];
    if (!this.state || !tile) return null;
    const building = tile.buildingId ? this.state.buildings[tile.buildingId] : undefined;
    const def = building ? BUILDING_BY_ID[building.defId] : undefined;
    const height = building && def ? Math.max(0.3, def.height) * 1.5 * this.growthOf(building.id) : 0.2;
    const point = this.projected.set(tile.x, height + 0.12, tile.y).project(this.controller.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((point.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - point.y) / 2) * rect.height,
      visible: point.z < 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1,
    };
  }

  /** Testlerin gün döngüsünü beklemeden istediği saate atlaması için. */
  /**
   * Kamerayı bir dünya noktasına kaydırır (kare koordinatı = dünya
   * koordinatı). Gündem ve haber "oraya git" dediğinde bu çağrılıyor;
   * çift dokunuşla aynı yumuşak geçiş.
   */
  focusWorld(x: number, z: number): void {
    this.controller.focusOn(x, z);
    if (this.reducedMotion) this.controller.snap();
  }

  /**
   * Erişilebilirlik ayarları (Tur 47): renk körlüğüne uygun palette
   * oyuncunun rengi, azaltılmış harekette kameranın atlaması. Palet
   * değişince şehir bir sonraki karede yeni renkle boyanıyor.
   */
  /** Ayarlardaki yağmur ve kar (Tur 62); mevsimin rengi ve bulutun ışığı her durumda kalıyor. */
  /**
   * Testler için (Tur 63): binanın çatısının hedef rengi ve dalga sürüyorsa
   * o an çizilen renk.
   */
  buildingAccent(id: string): { target: string; drawn: string } | null {
    const owner = this.buildingOwners.get(id);
    if (!owner) return null;
    const target = `#${owner.accent.toString(16).padStart(6, '0')}`;
    const shift = this.ownerShifts.get(id);
    if (!shift) return { target, drawn: target };
    const k = smooth((performance.now() - shift.start) / (MOMENT.shiftSeconds * 1000));
    return { target, drawn: `#${this.shiftTo.setHex(shift.from).lerp(new THREE.Color(owner.accent), k).getHexString()}` };
  }

  setWeatherEffects(enabled: boolean): void {
    this.weatherEffects = enabled;
  }

  setAccessibility(options: { safePalette: boolean; reducedMotion: boolean }): void {
    this.reducedMotion = options.reducedMotion;
    if (this.reducedMotion) {
      this.rings.clear();
      this.fireworks.stop();
    }
    if (options.safePalette === this.safePalette) return;
    this.safePalette = options.safePalette;
    this.traffic.invalidateColors();
    if (this.state) this.syncState(this.state, this.view);
  }

  private playerAccent(): string {
    return this.safePalette ? SAFE_PLAYER_ACCENT : PLAYER_ACCENT;
  }

  /** Testler ve görsel karşılaştırma: sabit bir kamera bakışı. */
  setView(view: { x: number; z: number; distance?: number; azimuth?: number; polar?: number }): void {
    this.controller.setView(view);
  }

  /** Gün ışığı 0..1 — ses manzarası gece katmanını buna göre açıyor. */
  daylight(): number {
    const elevation = Math.sin(this.timeOfDay * Math.PI * 2);
    return Math.max(0, Math.min(1, elevation * 1.6 + 0.35));
  }

  /** Testler için: kameranın gitmekte olduğu nokta. */
  cameraTarget(): { x: number; z: number } {
    return this.controller.targetPoint;
  }

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
    this.precipitation.dispose();
    this.rings.dispose();
    this.fireworks.dispose();
    this.groundLit.map?.dispose();
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
    this.buildingShadows.dispose();
    this.fabricShadows.dispose();
    this.decorKit.dispose();
    // `scene.environment` düşük kademede null oluyor; dokunun kendisini
    // saklayan alandan atmak gerekiyor, yoksa sızar.
    this.envTexture?.dispose();
    this.envTexture = null;
    this.composer?.dispose();
    this.composer = null;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.traffic.dispose();
    this.street.dispose();
    this.lampLight.dispose();
    this.world.dispose();
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

/**
 * Yol karosunun dokusu ve yönü (Tur 36).
 *
 * Kavşak iki eksende de yol komşusu olan karo (haritanın kenarındaki T
 * kavşaklar da). Kavşağa giren karo yaya geçidi; geçit dokuda yerel -X
 * ucunda, döndürme onu kavşağa çeviriyor: π yerel -X'i +X'e, +π/2 +Z'ye,
 * −π/2 −Z'ye götürüyor.
 */
/**
 * Oyuncunun çatı rengi: kamyon ve müşteri araçlarındaki nane yeşiliyle aynı
 * (`syncRoutes`). Sokakta tek bir "benim" rengi var.
 */
const PLAYER_ACCENT = '#3fd39a';

/** Cephe türüne göre doğal malzeme: sıva ve tuğla, cam ve çelik, sanayi paneli. */
const NATURAL_WALLS: Record<'plaster' | 'glass' | 'panel', readonly string[]> = {
  plaster: ['#e9dcc3', '#e2cfb0', '#d9b99a', '#efe7da', '#cdb89c', '#c78e6e', '#d8c7ae'],
  glass: ['#cbd5de', '#b4c2cf', '#dfe3e6', '#a9b6c2', '#c2c9cf'],
  panel: ['#b7b1a5', '#a9a59b', '#c5bdac', '#9fa3a7'],
};
function naturalColor(target: THREE.Color, facade: FacadeStyle, x: number, y: number): THREE.Color {
  const family = facade === FACADE.office || facade === FACADE.shopOffice ? 'glass' : facade === FACADE.industrial ? 'panel' : 'plaster';
  const list = NATURAL_WALLS[family];
  const roll = Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
  return target.set(list[Math.floor(roll * list.length)]!);
}

function roadCellOf(x: number, y: number, isRoad: (x: number, y: number) => boolean): { cell: number; yaw: number } {
  const junction = (jx: number, jy: number) =>
    isRoad(jx, jy) && (isRoad(jx + 1, jy) || isRoad(jx - 1, jy)) && (isRoad(jx, jy + 1) || isRoad(jx, jy - 1));
  if (junction(x, y)) return { cell: ROAD_CELL.intersection, yaw: 0 };
  const horizontal = isRoad(x + 1, y) || isRoad(x - 1, y) || !(isRoad(x, y + 1) || isRoad(x, y - 1));
  if (horizontal) {
    if (junction(x - 1, y)) return { cell: ROAD_CELL.crosswalk, yaw: 0 };
    if (junction(x + 1, y)) return { cell: ROAD_CELL.crosswalk, yaw: Math.PI };
    return { cell: ROAD_CELL.straight, yaw: 0 };
  }
  if (junction(x, y + 1)) return { cell: ROAD_CELL.crosswalk, yaw: Math.PI / 2 };
  if (junction(x, y - 1)) return { cell: ROAD_CELL.crosswalk, yaw: -Math.PI / 2 };
  return { cell: ROAD_CELL.straight, yaw: Math.PI / 2 };
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


/**
 * Oyuncu binasının siluet ailesi — ROLDEN türetiliyor.
 *
 * Bina kataloğuna ayrı bir `form` alanı eklenmedi: rol zaten tam olarak
 * bu bilgiyi taşıyor (çiftlik toplar, fabrika işler, kule kiralar) ve
 * yirmi altı tanımı elle işaretlemek aynı gerçeği ikinci kez yazmak
 * olurdu. Kural burada, tek yerde.
 */
/** Bacanın tepesinden duman kaynağı. */
function smokeFrom(stack: { x: number; y: number; z: number; width: number }): SmokeEmitter {
  return { x: stack.x, y: stack.y, z: stack.z, size: stack.width };
}

function massFormOf(def: BuildingDef): MassForm {
  switch (def.role) {
    // Tarla ve maden: yatay, karıklı, binaya benzemeyen kütle.
    case 'extract':
      return 'field';
    // Üretim ve lojistik: geniş bacalı hangar.
    case 'process':
    case 'logistics':
      return 'shed';
    // Santral (Tur 57): doğalgaz hangar ve kule, güneş tarlası yatay panel sırası.
    case 'energy':
      return def.solar ? 'field' : 'shed';
    case 'rental':
      return def.height > 2 ? 'tower' : 'block';
    case 'research':
    case 'marketing':
      return 'block';
    default:
      // Perakende: küçük dükkân ev formunda, büyük mağaza blok.
      return def.height < 0.8 ? 'house' : 'block';
  }
}

/**
 * Oyuncu ve rakip binasının cephesi (Tur 24) — formla aynı gerekçe: rol ve
 * kategori zaten söylüyor. Mağazaların zemin katı vitrin; büyük mağaza ve
 * elektronik vitrinin üstünde ofis camı taşıyor, spor salonu baştan cama.
 */
function buildingFacade(def: BuildingDef): FacadeStyle {
  switch (def.role) {
    case 'outlet':
      // Hizmette kuaför mahalle dükkânı, sinema vitrin üstü ofis camı;
      // spor salonu ve klinik baştan cama.
      if (def.id === 'barber_shop') return FACADE.shop;
      if (def.id === 'cinema') return FACADE.shopOffice;
      if (def.category === 'services') return FACADE.office;
      return def.height >= 0.9 && def.category !== 'grocery' && def.category !== 'dining' ? FACADE.shopOffice : FACADE.shop;
    case 'rental':
      return def.category === 'office' ? FACADE.office : FACADE.residential;
    case 'research':
    case 'marketing':
      return FACADE.office;
    case 'process':
    case 'logistics':
    case 'extract':
    case 'energy':
      return FACADE.industrial;
    default:
      return FACADE.residential;
  }
}

/**
 * Şehir dokusunun cephesi. Apartman bloklarının bir kısmının zemin katı
 * dükkân — mahalle böyle görünür; hangisi olduğu kareden (her açılışta
 * aynı).
 */
function structureFacade(structure: StructureDef, tileId: number): FacadeStyle {
  if (structure.id === 'old_shopfront') return FACADE.shop;
  if (structure.id === 'apartment_block') return (tileId * 2654435761) % 7 < 3 ? FACADE.shop : FACADE.residential;
  if (structure.form === 'tower') return FACADE.office;
  if (structure.form === 'shed' || structure.form === 'field') return FACADE.industrial;
  return FACADE.residential;
}
