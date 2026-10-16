import * as THREE from 'three';
import type { BuildingDef, StructureDef } from '@capital/content';
import type { DecorLayer } from './decor';
import type { MassFootprint } from './mass';

/**
 * Detay reçeteleri (Tur 24) — hangi binaya hangi parça.
 *
 * Kural tek yerde: bina tanımından (rol, kategori, kimlik) ve kütlenin
 * gerçek ölçülerinden (`MassFootprint`) parça yerleşimi. Zar KONUMDAN
 * (kare kimliği ya da koordinat): aynı bina her açılışta aynı görünür ve
 * simülasyonun zarına dokunulmaz.
 */

/** Konumdan deterministik 0..1 sayı; `slot` aynı kare için farklı zarlar. */
function dice(x: number, z: number, slot: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + slot * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

const tmp = new THREE.Color();
const c = (hex: string) => tmp.set(hex);

const TERRACOTTA = ['#b5583c', '#a64c35', '#c46a43', '#93503d', '#ad6148'];
const SLATE = '#6d7480';
const METAL = '#c9ccd1';
const DARK_METAL = '#7f858d';
const SOLAR = '#2c3e5c';
const GREEN_ROOF = '#6f9a58';
const TREE_GREENS = ['#5e9a4a', '#4f8a3f', '#6aa556', '#5a8f47', '#78a85a'];
const DOOR = '#4b3b30';
const BRICK = '#a05a45';
const BALCONY = '#e6e2da';

/**
 * Sokak tarafı: karenin en yakın yola bakan yüzü. Bloklar 5 karelik
 * ızgarada, yollar x ya da y 5'in katı olan karelerde. Döndürülen açı
 * parçanın yerel +z eksenini o yöne çeviriyor.
 */
export function streetSide(x: number, y: number, block: number): { yaw: number; nx: number; nz: number } {
  const options = [
    { d: x % block, yaw: -Math.PI / 2, nx: -1, nz: 0 },
    { d: block - (x % block), yaw: Math.PI / 2, nx: 1, nz: 0 },
    { d: y % block, yaw: Math.PI, nx: 0, nz: -1 },
    { d: block - (y % block), yaw: 0, nx: 0, nz: 1 },
  ];
  let best = options[0]!;
  for (const option of options) if (option.d < best.d) best = option;
  return best;
}

/** Bir yüzün dışına, verilen kota parça koyar (tente, tabela, rampa). */
function onFace(
  layer: DecorLayer,
  part: 'awning' | 'sign' | 'box' | 'glass',
  x: number,
  z: number,
  side: { yaw: number; nx: number; nz: number },
  halfWidth: number,
  y: number,
  along: number,
  height: number,
  depth: number,
  color: THREE.Color,
  tilt = 0,
): void {
  const offset = halfWidth + depth / 2;
  layer.add(part, x + side.nx * offset, y, z + side.nz * offset, along, height, depth, color, side.yaw, tilt);
}

/** Dükkân önü: çizgili tente ve üstünde şirket renginde tabela. */
function storefront(
  layer: DecorLayer,
  x: number,
  z: number,
  footprint: MassFootprint,
  side: { yaw: number; nx: number; nz: number },
  awningColor: THREE.Color,
  signColor: THREE.Color,
  wide = false,
): void {
  const half = footprint.bodyWidth / 2;
  const span = footprint.bodyWidth * (wide ? 0.92 : 0.78);
  const bandTop = footprint.bodyBottom + Math.min(0.3, (footprint.bodyTop - footprint.bodyBottom) * 0.55);
  // Tente: vitrin bandının üst kenarından sokağa doğru eğik.
  onFace(layer, 'awning', x, z, side, half, bandTop - 0.05, span, 0.022, 0.13, awningColor, 0.38);
  // Tabela: tentenin hemen üstünde, cepheye yapışık ince pano.
  onFace(layer, 'sign', x, z, side, half, bandTop + 0.005, span * 0.7, 0.055, 0.012, signColor);
}

/** Çatı ekipmanı: klima kutuları, su deposu, güneş paneli ya da yeşil çatı. */
function roofGear(layer: DecorLayer, x: number, z: number, footprint: MassFootprint, kind: 'residential' | 'office' | 'plain'): void {
  const w = footprint.roofWidth;
  const y = footprint.roofY;
  const roll = dice(x, z, 1);
  if (kind === 'residential') {
    if (roll < 0.45) {
      // Su deposu: ayaklı yuvarlak tank — apartman çatısının imzası.
      const tx = x + (dice(x, z, 2) - 0.5) * w * 0.4;
      const tz = z + (dice(x, z, 3) - 0.5) * w * 0.4;
      layer.add('cylinder', tx, y, tz, w * 0.22, 0.12, w * 0.22, c('#a9aeb5'));
    } else if (roll < 0.75) {
      // Güneş panelleri: iki koyu şerit.
      for (const k of [-1, 1]) layer.add('box', x + k * w * 0.18, y, z, w * 0.28, 0.012, w * 0.55, c(SOLAR));
    }
    if (dice(x, z, 4) > 0.5) layer.add('box', x - w * 0.25, y, z + w * 0.25, w * 0.16, 0.06, w * 0.16, c(METAL));
  } else if (kind === 'office') {
    if (roll < 0.3) {
      layer.add('box', x, y, z, w * 0.62, 0.02, w * 0.62, c(GREEN_ROOF));
    } else {
      layer.add('box', x + w * 0.2, y, z - w * 0.15, w * 0.3, 0.07, w * 0.22, c(DARK_METAL));
      layer.add('box', x - w * 0.22, y, z + w * 0.2, w * 0.18, 0.05, w * 0.18, c(METAL));
    }
  } else if (roll < 0.5) {
    layer.add('box', x, y, z, w * 0.24, 0.05, w * 0.24, c(METAL));
  }
}

/**
 * Sokak kapısı ve isteğe bağlı saçak (Tur 34).
 *
 * Şehir dokusunun evleri ve apartmanları sokağa sağır bakıyordu: cephe
 * dokusunda pencere vardı, giriş yoktu. Kapı binayı ölçeğe oturtuyor —
 * yanından geçen yaya ve araba ancak bir kapı varken "ev boyu" okunuyor.
 */
function entrance(
  layer: DecorLayer,
  x: number,
  z: number,
  footprint: MassFootprint,
  side: { yaw: number; nx: number; nz: number },
  wide: boolean,
): void {
  const half = footprint.bodyWidth / 2;
  const doorHeight = Math.min(0.17, (footprint.bodyTop - footprint.bodyBottom) * 0.6);
  onFace(layer, 'box', x, z, side, half, footprint.bodyBottom, wide ? 0.15 : 0.09, doorHeight, 0.012, c(DOOR));
  if (wide) onFace(layer, 'box', x, z, side, half, footprint.bodyBottom + doorHeight + 0.015, 0.28, 0.02, 0.1, c(METAL));
}

/**
 * Kiremit çatıda tuğla baca (Tur 34). Arka yamaçta, mahyaya yakın; kutu
 * yamacın içinden çıkıyor, yani yalnızca tepe kısmı görünüyor.
 */
function houseChimney(layer: DecorLayer, x: number, z: number, footprint: MassFootprint, yaw: number, along: number): void {
  const w = footprint.roofWidth;
  const across = -0.17 * w;
  const lx = along * w;
  const wx = x + lx * Math.cos(yaw) + across * Math.sin(yaw);
  const wz = z - lx * Math.sin(yaw) + across * Math.cos(yaw);
  const slope = footprint.roofHeight * (1 - Math.abs(across) / (w / 2));
  // Yamaçtan 0,13 çıkıyor: daha kısası yukarıdan bakınca çatıda delik gibi okunuyordu.
  layer.add('box', wx, footprint.roofY, wz, 0.06, slope + 0.13, 0.06, c(BRICK), yaw);
}

/** Kırma çatı: ev formunda, gövdenin üstüne. */
function hipRoof(layer: DecorLayer, x: number, z: number, footprint: MassFootprint, color: THREE.Color, yaw: number): void {
  const w = footprint.roofWidth;
  layer.add('roof', x, footprint.roofY, z, w, footprint.roofHeight, w, color, yaw);
}

/** Oyuncu ya da rakip binası. `tint` binanın boyanmış rengi, `owner` şirket rengi. */
export function decorateBuilding(
  layer: DecorLayer,
  def: BuildingDef,
  footprint: MassFootprint,
  x: number,
  z: number,
  side: { yaw: number; nx: number; nz: number },
  tint: THREE.Color,
  owner: THREE.Color,
): void {
  const roofColor = tint.clone().multiplyScalar(0.72);
  const ownerSign = owner.clone().lerp(new THREE.Color('#ffffff'), 0.12);
  const awning = owner.clone();
  const w = footprint.bodyWidth;

  if (footprint.form === 'house') hipRoof(layer, x, z, footprint, roofColor, side.yaw);

  switch (def.id) {
    case 'corner_shop':
    case 'boutique':
      storefront(layer, x, z, footprint, side, awning, ownerSign);
      return;
    case 'barber_shop':
      storefront(layer, x, z, footprint, side, awning, ownerSign);
      // Berber direği: kapının yanında kırmızı-beyaz silindir.
      {
        const off = w / 2 + 0.03;
        const along = side.nz !== 0 ? w * 0.42 : 0;
        const across = side.nx !== 0 ? w * 0.42 : 0;
        layer.add('cylinder', x + side.nx * off + along, footprint.bodyBottom + 0.04, z + side.nz * off + across, 0.035, 0.16, 0.035, c('#d8d8d8'));
        layer.add('cylinder', x + side.nx * off + along, footprint.bodyBottom + 0.1, z + side.nz * off + across, 0.038, 0.05, 0.038, c('#c8382c'));
      }
      return;
    case 'phone_shop':
      storefront(layer, x, z, footprint, side, awning, ownerSign);
      return;
    case 'cafe':
      storefront(layer, x, z, footprint, side, awning, ownerSign);
      // Kaldırımda iki masa: kafeyi bakkaldan ayıran şey.
      for (const k of [-1, 1]) {
        const off = w / 2 + 0.16;
        layer.add('cylinder', x + side.nx * off + (side.nz !== 0 ? k * 0.14 : 0), 0.07, z + side.nz * off + (side.nx !== 0 ? k * 0.14 : 0), 0.07, 0.05, 0.07, c('#e8e2d6'));
      }
      return;
    case 'restaurant':
      storefront(layer, x, z, footprint, side, awning, ownerSign, true);
      roofGear(layer, x, z, footprint, 'plain');
      // Mutfak bacası.
      layer.add('cylinder', x - w * 0.28, footprint.roofY, z - w * 0.22, 0.06, 0.16, 0.06, c(DARK_METAL));
      return;
    case 'supermarket':
      storefront(layer, x, z, footprint, side, awning, ownerSign, true);
      // Geniş çatıda iki klima santrali ve ışıklık.
      layer.add('box', x + w * 0.22, footprint.roofY, z, w * 0.2, 0.06, w * 0.3, c(METAL));
      layer.add('glass', x - w * 0.18, footprint.roofY, z, w * 0.3, 0.03, w * 0.4, c('#ffffff'));
      return;
    case 'department_store':
    case 'electronics_store':
    case 'tech_store':
      storefront(layer, x, z, footprint, side, awning, ownerSign, true);
      // Çatı panosu: uzaktan görünen büyük tabela.
      layer.add('sign', x, footprint.roofY, z - w * 0.1, w * 0.62, 0.14, 0.02, ownerSign, side.yaw);
      roofGear(layer, x, z, footprint, 'office');
      return;
    case 'gym':
      // Cam cephe şeridi ve tabela; tente yok.
      onFace(layer, 'glass', x, z, side, w / 2, footprint.bodyBottom + 0.02, w * 0.85, Math.min(0.42, footprint.bodyTop - footprint.bodyBottom - 0.04), 0.015, c('#ffffff'));
      onFace(layer, 'sign', x, z, side, w / 2 + 0.015, footprint.bodyTop - 0.09, w * 0.55, 0.06, 0.012, ownerSign);
      return;
    case 'cinema': {
      // Işıklı afiş panosu (marquee) girişin üstünde, yanında dikey pano.
      const half = w / 2;
      const bandTop = footprint.bodyBottom + Math.min(0.3, (footprint.bodyTop - footprint.bodyBottom) * 0.5);
      onFace(layer, 'box', x, z, side, half, bandTop - 0.02, w * 0.9, 0.035, 0.16, c('#2b2b30'));
      onFace(layer, 'sign', x, z, side, half + 0.16, bandTop - 0.02, w * 0.86, 0.09, 0.012, c('#ffe08a'));
      onFace(layer, 'sign', x, z, side, half + 0.01, bandTop + 0.06, 0.07, footprint.bodyTop - bandTop - 0.08, 0.04, ownerSign);
      // Çatıda gösterim odası.
      layer.add('box', x, footprint.roofY, z - w * 0.18, w * 0.4, 0.09, w * 0.25, c(DARK_METAL));
      return;
    }
    case 'clinic': {
      // Kırmızı haçlı tabela: beyaz pano üstünde iki kol.
      const y = footprint.bodyTop - 0.16;
      onFace(layer, 'sign', x, z, side, w / 2, y, 0.16, 0.16, 0.012, c('#f4f4f4'));
      onFace(layer, 'sign', x, z, side, w / 2 + 0.012, y + 0.055, 0.12, 0.05, 0.01, c('#d0342c'));
      onFace(layer, 'sign', x, z, side, w / 2 + 0.012, y + 0.02, 0.05, 0.12, 0.01, c('#d0342c'));
      // Giriş saçağı ve çatıda yeşil bahçe.
      onFace(layer, 'box', x, z, side, w / 2, footprint.bodyBottom + 0.2, w * 0.5, 0.025, 0.14, c(METAL));
      layer.add('box', x, footprint.roofY, z, footprint.roofWidth * 0.6, 0.02, footprint.roofWidth * 0.6, c(GREEN_ROOF));
      return;
    }
    case 'residence':
      roofGear(layer, x, z, footprint, 'residential');
      // Çatı havuzu ve sokak yüzünde balkon bantları.
      layer.add('glass', x - footprint.roofWidth * 0.12, footprint.roofY, z + footprint.roofWidth * 0.1, footprint.roofWidth * 0.42, 0.02, footprint.roofWidth * 0.3, c('#6fb7e0'));
      for (const f of [0.3, 0.5, 0.7]) {
        const y = footprint.bodyBottom + (footprint.bodyTop - footprint.bodyBottom) * f;
        onFace(layer, 'box', x, z, side, w / 2, y, w * 0.8, 0.02, 0.07, c('#e6e2da'));
      }
      return;
    case 'business_center':
      roofGear(layer, x, z, footprint, 'office');
      // Giriş saçağı ve cam lobi.
      onFace(layer, 'box', x, z, side, w / 2, footprint.bodyBottom + 0.22, w * 0.7, 0.025, 0.14, c(METAL));
      onFace(layer, 'glass', x, z, side, w / 2, footprint.bodyBottom + 0.02, w * 0.5, 0.18, 0.012, c('#ffffff'));
      return;
    case 'apartment':
      roofGear(layer, x, z, footprint, 'residential');
      // Balkon bantları: sokak yüzünde iki kat.
      for (const f of [0.35, 0.62]) {
        const y = footprint.bodyBottom + (footprint.bodyTop - footprint.bodyBottom) * f;
        onFace(layer, 'box', x, z, side, w / 2, y, w * 0.8, 0.02, 0.07, c('#e6e2da'));
      }
      return;
    case 'office_tower':
      roofGear(layer, x, z, footprint, 'office');
      // Anten direği ve tepe feneri.
      layer.add('box', x + footprint.roofWidth * 0.18, footprint.roofY, z + footprint.roofWidth * 0.18, 0.025, 0.55, 0.025, c(DARK_METAL));
      layer.add('sign', x + footprint.roofWidth * 0.18, footprint.roofY + 0.55, z + footprint.roofWidth * 0.18, 0.05, 0.05, 0.05, c('#ff5a4a'));
      return;
    case 'research_center':
      // Çatıda çanak anten ve cam atrium.
      layer.add('cylinder', x + footprint.roofWidth * 0.2, footprint.roofY, z, 0.05, 0.1, 0.05, c(DARK_METAL));
      layer.add('cylinder', x + footprint.roofWidth * 0.2, footprint.roofY + 0.1, z, 0.22, 0.03, 0.22, c(METAL));
      layer.add('glass', x - footprint.roofWidth * 0.15, footprint.roofY, z, footprint.roofWidth * 0.35, 0.08, footprint.roofWidth * 0.45, c('#ffffff'));
      return;
    case 'marketing_office':
      roofGear(layer, x, z, footprint, 'office');
      // Çatı ilan panosu: pazarlamanın vitrini.
      layer.add('box', x, footprint.roofY, z, 0.03, 0.12, 0.03, c(DARK_METAL));
      layer.add('sign', x, footprint.roofY + 0.12, z, footprint.roofWidth * 0.8, 0.2, 0.025, ownerSign, side.yaw);
      return;
    case 'warehouse':
      // Yükleme rampaları: sokak yüzünde iki koyu kapı ve saçak.
      for (const k of [-0.22, 0.22]) {
        const ox = side.nz !== 0 ? k * w : 0;
        const oz = side.nx !== 0 ? k * w : 0;
        onFace(layer, 'box', x + ox, z + oz, side, w / 2, footprint.bodyBottom, w * 0.3, 0.2, 0.01, c('#3d4148'));
      }
      onFace(layer, 'box', x, z, side, w / 2, footprint.bodyBottom + 0.22, w * 0.9, 0.025, 0.12, c(METAL));
      return;
    case 'flour_mill':
      // Üç bitişik silo — değirmeni uzaktan okutan şey.
      for (const k of [-1, 0, 1]) layer.add('cylinder', x + k * w * 0.24, footprint.bodyBottom, z - w * 0.36, w * 0.24, (footprint.roofY - footprint.bodyBottom) * 1.45, w * 0.24, c('#d6d0c2'));
      return;
    case 'starch_plant':
    case 'meal_plant':
      // Alçak geniş tanklar.
      for (const k of [-1, 1]) layer.add('cylinder', x + k * w * 0.26, footprint.roofY, z + w * 0.12, w * 0.3, 0.16, w * 0.3, c(METAL));
      return;
    case 'tannery':
      // Sepi tankları sıra hâlinde ve tek ince baca.
      for (const k of [-1, 0, 1]) layer.add('cylinder', x + k * w * 0.27, footprint.roofY, z - w * 0.18, w * 0.2, 0.12, w * 0.2, c('#6e5440'));
      layer.add('cylinder', x + w * 0.36, footprint.roofY, z + w * 0.3, 0.06, 0.38, 0.06, c('#4a3d34'));
      return;
    case 'coffee_roastery':
      // Yuvarlak kavurma bacası ve küçük çekirdek silosu.
      layer.add('cylinder', x - w * 0.3, footprint.roofY, z + w * 0.25, 0.09, 0.42, 0.09, c('#5a4434'));
      layer.add('cylinder', x + w * 0.3, footprint.bodyBottom, z - w * 0.36, w * 0.22, (footprint.roofY - footprint.bodyBottom) * 1.2, w * 0.22, c('#cfc5b4'));
      return;
    case 'textile_mill':
    case 'upholstery_mill':
      // Testere dişi çatı: sanayi mahallesinin klasik silueti.
      // Mahya z ekseninde: çatı parçası çeyrek tur dönük, yerel x uzunluk.
      for (const k of [-1, 0, 1]) {
        layer.add('roof', x + k * w * 0.32, footprint.roofY, z, w * 0.85, 0.14, w * 0.3, c(def.id === 'textile_mill' ? '#8f8478' : '#857a90'), Math.PI / 2);
      }
      layer.add('cylinder', x + w * 0.38, footprint.roofY, z + w * 0.38, 0.12, 0.3, 0.12, c('#b7b1a8'));
      return;
    case 'chip_fab':
    case 'sensor_fab':
      // Temiz oda: çatıda sıra sıra soğutucu ve cam şerit.
      for (const k of [-1, 0, 1]) layer.add('box', x + k * w * 0.28, footprint.roofY, z + w * 0.25, w * 0.2, 0.07, w * 0.2, c(METAL));
      layer.add('glass', x, footprint.roofY, z - w * 0.2, w * 0.85, 0.04, w * 0.22, c('#ffffff'));
      return;
    case 'greenhouse':
      // Uzun cam seralar.
      for (const k of [-1, 1]) layer.add('glass', x, footprint.bodyBottom, z + k * w * 0.26, w * 0.92, 0.2, w * 0.4, c('#ffffff'));
      return;
    case 'wheat_farm':
      layer.add('cylinder', x + w * 0.42, footprint.bodyBottom, z - w * 0.42, 0.16, 0.42, 0.16, c('#d9d2c0'));
      return;
    case 'coffee_estate':
      // Sıra sıra kahve fidanları.
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          layer.add('tree', x + (i - 1) * w * 0.32, footprint.bodyBottom, z + (j - 1) * w * 0.32, 0.32, 0.38, 0.32, c('#3f6e34'));
        }
      }
      return;
    case 'cotton_farm':
      layer.add('box', x + w * 0.4, footprint.bodyBottom, z + w * 0.4, 0.2, 0.14, 0.16, c('#b9a98c'));
      return;
    case 'cattle_ranch':
      // Kırmızı ahır çatısı ve ağıl çiti: tarladan ayıran şey hayvan.
      layer.add('roof', x - w * 0.22, footprint.bodyBottom, z - w * 0.22, w * 0.42, 0.24, w * 0.3, c('#9c3b2e'));
      for (const k of [-1, 1]) {
        layer.add('box', x + w * 0.2, footprint.bodyBottom, z + k * w * 0.3, w * 0.5, 0.05, 0.015, c('#e6dcc8'));
        layer.add('box', x + w * 0.2 + k * w * 0.25, footprint.bodyBottom, z, 0.015, 0.05, w * 0.6, c('#e6dcc8'));
      }
      return;
    case 'silicon_mine':
      // Ocak: koyu çukur, malzeme yığını ve vinç kulesi.
      layer.add('box', x, footprint.bodyBottom, z, w * 0.7, 0.012, w * 0.7, c('#3e4248'));
      layer.add('roof', x + w * 0.2, footprint.bodyBottom, z + w * 0.18, w * 0.42, 0.22, w * 0.42, c('#b9bec4'));
      layer.add('box', x - w * 0.32, footprint.bodyBottom, z - w * 0.3, 0.04, 0.6, 0.04, c('#d8a83a'));
      layer.add('box', x - w * 0.18, footprint.bodyBottom + 0.58, z - w * 0.3, 0.32, 0.03, 0.03, c('#d8a83a'));
      return;
    default:
      if (footprint.form === 'block' || footprint.form === 'tower') roofGear(layer, x, z, footprint, 'office');
  }
}

/** Şehir dokusunun yapıları (oyuncuya ait olmayan). */
/**
 * Ev bahçesi (Tur 36): çim, iki yanda alçak çit, kapıdan kaldırıma yürüyüş
 * yolu. Evler parselin ortasında düz bir levhanın üstünde duruyordu; bahçe
 * mahalleyi "konut" diye okutan şey ve aradaki boşluğu dolduruyor. Çim
 * kaldırım bandının içinde kalıyor: bordür ve kaldırım görünmeye devam
 * ediyor.
 */
const LAWNS = ['#7fae5c', '#78a656', '#86b263', '#73a052'];
const HEDGE = '#4d7a3c';
const PATH = '#d4ccbb';
function frontYard(
  layer: DecorLayer,
  x: number,
  z: number,
  footprint: MassFootprint,
  side: { yaw: number; nx: number; nz: number },
): void {
  const lawn = 0.8;
  layer.add('box', x, 0.07, z, lawn, 0.008, lawn, c(LAWNS[Math.floor(dice(x, z, 30) * LAWNS.length)]!));
  // Çitler sokağa dik iki kenarda: komşu bahçeleri ayırıyor.
  const lateralX = side.nz !== 0;
  for (const k of [-1, 1]) {
    const hx = lateralX ? x + k * (lawn / 2 - 0.02) : x;
    const hz = lateralX ? z : z + k * (lawn / 2 - 0.02);
    layer.add('box', hx, 0.078, hz, lateralX ? 0.04 : lawn - 0.06, 0.05, lateralX ? lawn - 0.06 : 0.04, c(HEDGE));
  }
  // Yürüyüş yolu: kapıdan çimin kenarına.
  const from = footprint.bodyWidth / 2;
  const to = lawn / 2;
  const mid = (from + to) / 2;
  const length = Math.max(0.02, to - from);
  layer.add(
    'box',
    x + side.nx * mid,
    0.078,
    z + side.nz * mid,
    side.nx !== 0 ? length : 0.09,
    0.004,
    side.nz !== 0 ? length : 0.09,
    c(PATH),
  );
}

export function decorateStructure(
  layer: DecorLayer,
  structure: StructureDef,
  footprint: MassFootprint,
  x: number,
  z: number,
  side: { yaw: number; nx: number; nz: number },
): void {
  const w = footprint.bodyWidth;
  switch (structure.form) {
    case 'house': {
      const roof = c(TERRACOTTA[Math.floor(dice(x, z, 5) * TERRACOTTA.length)]!).clone();
      if (dice(x, z, 6) > 0.85) roof.set(SLATE);
      hipRoof(layer, x, z, footprint, roof, side.yaw);
      if (dice(x, z, 14) > 0.4) houseChimney(layer, x, z, footprint, side.yaw, dice(x, z, 15) > 0.5 ? 0.2 : -0.2);
      if (structure.id !== 'old_shopfront') {
        entrance(layer, x, z, footprint, side, false);
        frontYard(layer, x, z, footprint, side);
      }
      if (structure.id === 'old_shopfront') {
        const shades = ['#b9583d', '#3f7f6a', '#3c5f8f', '#a1873a'];
        const awning = c(shades[Math.floor(dice(x, z, 7) * shades.length)]!).clone();
        storefront(layer, x, z, footprint, side, awning, awning.clone().multiplyScalar(0.8));
      } else if (dice(x, z, 8) > 0.45) {
        // Arka bahçede bir ağaç.
        const back = -(w / 2 + 0.06);
        layer.add('tree', x + side.nx * back + side.nz * 0.25, 0.07, z + side.nz * back + side.nx * 0.25, 0.42, 0.42, 0.42, c(TREE_GREENS[Math.floor(dice(x, z, 9) * TREE_GREENS.length)]!));
      }
      return;
    }
    case 'block':
      if (structure.id === 'school') {
        // Okul bahçesi: ağaçlar ve bayrak direği.
        layer.add('box', x + w * 0.5, 0.07, z - w * 0.5, 0.02, 0.5, 0.02, c(METAL));
        layer.add('sign', x + w * 0.5 + 0.06, 0.48, z - w * 0.5, 0.12, 0.07, 0.01, c('#d33a2c'));
      }
      entrance(layer, x, z, footprint, side, true);
      if (structure.kind === 'residential') {
        // Balkon bantları: oyuncu apartmanıyla aynı dil, sokak yüzünde.
        for (const f of [0.42, 0.7]) {
          const y = footprint.bodyBottom + (footprint.bodyTop - footprint.bodyBottom) * f;
          onFace(layer, 'box', x, z, side, w / 2, y, w * 0.74, 0.018, 0.06, c(BALCONY));
        }
      }
      roofGear(layer, x, z, footprint, 'residential');
      return;
    case 'tower':
      entrance(layer, x, z, footprint, side, true);
      roofGear(layer, x, z, footprint, 'office');
      // Kulelerin bir kısmında çatı anteni: silüete dikey bir çizgi.
      if (dice(x, z, 16) > 0.6) {
        layer.add('box', x - footprint.roofWidth * 0.2, footprint.roofY, z + footprint.roofWidth * 0.15, 0.02, 0.32, 0.02, c(DARK_METAL));
      }
      return;
    case 'shed':
      if (dice(x, z, 10) > 0.5) {
        for (const k of [-1, 0, 1]) layer.add('roof', x + k * w * 0.32, footprint.roofY, z, w * 0.8, 0.12, w * 0.3, c('#9c958b'), Math.PI / 2);
      }
      return;
    case 'flat': {
      if (structure.id === 'park') {
        // Park: dağınık ağaç kümesi.
        const count = 4 + Math.floor(dice(x, z, 11) * 3);
        for (let i = 0; i < count; i++) {
          const ax = x + (dice(x, z, 20 + i) - 0.5) * 0.7;
          const az = z + (dice(x, z, 40 + i) - 0.5) * 0.7;
          const s = 0.45 + dice(x, z, 60 + i) * 0.3;
          layer.add('tree', ax, footprint.bodyTop, az, s, s, s, c(TREE_GREENS[i % TREE_GREENS.length]!));
        }
      } else {
        // Meydan: ortada çeşme, köşelerde ağaç.
        layer.add('cylinder', x, footprint.bodyTop, z, 0.3, 0.05, 0.3, c('#d8d3c6'));
        layer.add('cylinder', x, footprint.bodyTop + 0.05, z, 0.05, 0.12, 0.05, c('#d8d3c6'));
        for (const [dx, dz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
          layer.add('tree', x + dx * 0.32, footprint.bodyTop, z + dz * 0.32, 0.4, 0.4, 0.4, c(TREE_GREENS[1]!));
        }
      }
      return;
    }
    default:
  }
}

/**
 * Sokak ağaçları ve lambaları — yol karelerinin kaldırımlarında, kavşaklar
 * hariç. Her karede bir ağaç, kaldırımı sırayla değiştirerek; karşı
 * kaldırımda iki karede bir lamba. Bir kez yerleşiyor: yollar oyun
 * boyunca değişmiyor. Lambaların yerini döndürüyor: gece ışık havuzları
 * oraya düşüyor (lamplight.ts).
 */
export function placeStreetTrees(
  layer: DecorLayer,
  tiles: readonly { x: number; y: number; kind: string }[],
  block: number,
): { x: number; z: number }[] {
  const lamps: { x: number; z: number }[] = [];
  layer.begin();
  const pole = new THREE.Color('#4a4f57');
  const head = new THREE.Color('#ffffff');
  for (const tile of tiles) {
    if (tile.kind !== 'road') continue;
    const horizontal = tile.y % block === 0;
    const vertical = tile.x % block === 0;
    if (horizontal && vertical) continue;
    const along = horizontal ? tile.x : tile.y;
    const k = along % 2 === 0 ? 1 : -1;
    const at = (side: number) => ({
      x: horizontal ? tile.x : tile.x + 0.43 * side,
      z: horizontal ? tile.y + 0.43 * side : tile.y,
    });
    const tree = at(k);
    const s = 0.42 + dice(tree.x, tree.z, 12) * 0.16;
    layer.add('tree', tree.x, 0.02, tree.z, s, s, s, c(TREE_GREENS[Math.floor(dice(tree.x, tree.z, 13) * TREE_GREENS.length)]!));
    if (along % 4 === 1) {
      const lamp = at(-k);
      layer.add('box', lamp.x, 0.02, lamp.z, 0.025, 0.42, 0.025, pole);
      layer.add('lamp', lamp.x, 0.44, lamp.z, 0.07, 0.035, 0.07, head);
      lamps.push(lamp);
    }
  }
  layer.end();
  return lamps;
}
