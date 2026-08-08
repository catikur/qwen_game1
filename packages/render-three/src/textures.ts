import * as THREE from 'three';

/**
 * Prosedürel dokular.
 *
 * Hepsi çalışma anında canvas'ta çiziliyor — tek bir dosya indirilmiyor.
 * Bu bir kısıt değil tercih: oyun tek bir HTML dosyasına gömülebiliyor
 * (`tools/build-single-file.mjs`) ve dış istek yapan hiçbir şey kalmıyor.
 * Dokular küçük tutuluyor; asıl iş çözünürlükte değil, DESENDE.
 */

function canvas(size: number): { ctx: CanvasRenderingContext2D; el: HTMLCanvasElement } {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2D bağlamı alınamadı — doku üretilemez.');
  return { ctx, el };
}

/** Deterministik gürültü: aynı şehir her açılışta aynı görünsün. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Pencere dokusu — gecenin bütün işi bunda.
 *
 * Eskiden `emissive` binanın TÜM yüzeyine düz uygulanıyordu. Yüksek
 * tutulunca bütün şehir tek parça amber bir kütleye dönüşüyor, kendi
 * renklerini kaybediyordu; o yüzden bilinçli olarak "ima" seviyesinde
 * tutulmuştu (bkz. eski `updateDaylight` yorumu). Gerçek pencerelerle
 * bu ödünleşim ortadan kalkıyor: ışık yalnızca pencerelerden çıktığı
 * için parlaklık serbestçe yükseltilebiliyor.
 *
 * Doku SİYAH zeminli: siyah = sıfır emisyon. Yanan pencereler beyaz,
 * sönükler koyu gri — yani gece her binada aynı desen değil, rastgele
 * bir kısmı yanıyor.
 */
export function makeWindowTexture(): THREE.CanvasTexture {
  const size = 128;
  const { ctx, el } = canvas(size);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 4;
  const cell = size / cols;
  const pad = cell * 0.22;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = hash(x * 7 + y * 13);
      // Pencerelerin yaklaşık üçte biri sönük; hepsi yanarsa bina bir
      // ızgaraya benziyor, hiçbiri yanmazsa gece ölü kalıyor.
      const value = lit > 0.62 ? 0 : 0.45 + lit * 0.85;
      if (value <= 0) continue;
      const shade = Math.round(Math.min(255, value * 255));
      ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.86)}, ${Math.round(shade * 0.62)})`;
      ctx.fillRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
    }
  }

  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Cephe dokusu — gündüz için.
 *
 * Pencere dokusunun gündüz karşılığı: kat çizgileri ve düşey bölümler.
 * Renk taşımıyor, yalnızca AYDINLIK dalgalanması veriyor; böylece bina
 * rengi instanceColor'dan gelmeye devam ediyor.
 */
export function makeFacadeTexture(): THREE.CanvasTexture {
  const size = 128;
  const { ctx, el } = canvas(size);

  //
  // TABAN NEREDEYSE BEYAZ OLMALI. `map` binanın kendi rengiyle ÇARPILIYOR;
  // ortalaması 0,72 olan bir doku bütün şehri o oranda karartıyor ve
  // gündüz binalar siyaha yakın çıkıyordu. Doku burada renk taşımıyor,
  // yalnızca yüzeyde ince bir aydınlık dalgalanması yapıyor — renk
  // instanceColor'dan gelmeye devam ediyor.
  //
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(0, 0, size, size);

  const cols = 4;
  const rows = 4;
  const cell = size / cols;
  const pad = cell * 0.22;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Cam yüzey gövdeden biraz koyu; kenarda ince bir doğrama payı.
      ctx.fillStyle = '#c6c6c6';
      ctx.fillRect(x * cell + pad, y * cell + pad, cell - pad * 2, cell - pad * 2);
    }
  }

  // Kat hattı: her sıranın altında bir tık koyu bir şerit.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let y = 1; y <= rows; y++) ctx.fillRect(0, y * cell - 2, size, 2);

  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Asfalt dokusu — şerit çizgisi ve kaldırım kenarı.
 *
 * Haritanın %44'ü sokak ve bugüne kadar hepsi tek düz renkti. Doku iki
 * şey anlatıyor: yolun YÖNÜ (kesikli orta çizgi) ve yolun KENARI (kaldırım
 * bandı). İkisi birden şehri okunur yapıyor — hangi kare yol, hangisi
 * parsel, tek bakışta ayrılıyor.
 *
 * Kare başına bir kez tekrar eden bir desen; yolun yönü örnek matrisinin
 * döndürülmesiyle geliyor, ayrı doku gerekmiyor.
 */
export function makeRoadTexture(): THREE.CanvasTexture {
  const size = 128;
  const { ctx, el } = canvas(size);

  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, size, size);

  // Asfalt taneciği.
  for (let i = 0; i < 900; i++) {
    const value = hash(i);
    const grey = 22 + Math.round(value * 26);
    ctx.fillStyle = `rgb(${grey}, ${grey + 1}, ${grey + 3})`;
    ctx.fillRect(hash(i * 3.1) * size, hash(i * 7.7) * size, 1.4, 1.4);
  }

  // Kaldırım bandı: karenin iki kenarında açık gri şerit.
  const curb = size * 0.11;
  ctx.fillStyle = '#2f353e';
  ctx.fillRect(0, 0, size, curb);
  ctx.fillRect(0, size - curb, size, curb);

  // Kesikli orta çizgi.
  ctx.fillStyle = '#c9b46a';
  const dash = size * 0.2;
  const gap = size * 0.14;
  for (let x = gap / 2; x < size; x += dash + gap) {
    ctx.fillRect(x, size / 2 - 1.6, dash, 3.2);
  }

  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Gökyüzü ortam haritası.
 *
 * `MeshStandardMaterial` yansıtacak bir şey bulamadığı için bugüne kadar
 * metalik ve pürüzsüz yüzeyler ölü görünüyordu. Küçük bir gradyan küre
 * PMREM'den geçirilince camlar ve metal yüzeyler gökyüzünü yansıtmaya
 * başlıyor — maliyeti bir kerelik.
 */
export function makeSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 64;
  const { ctx, el } = canvas(size);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#9dc4e8');
  gradient.addColorStop(0.5, '#5c7595');
  gradient.addColorStop(1, '#20262f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const source = new THREE.CanvasTexture(el);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(source);
  pmrem.dispose();
  source.dispose();
  return target.texture;
}
