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
 * Cephe atlası (Tur 24) — dört cephe türü tek dokuda.
 *
 * Dörtte birlerin yeri `surface.ts` ile sözleşme: UV'de sol alt konut,
 * sağ alt ofis camı, sol üst vitrin, sağ üst sanayi paneli. Canvas'ın
 * üstü dokunun üstü (v=1) olduğu için "alt" çeyrekler canvas'ın alt
 * yarısında çiziliyor.
 *
 * Gündüz dokusu (`map`) renk TAŞIMIYOR, yalnızca aydınlık dalgalanması:
 * bina rengi örnek renginden gelmeye devam ediyor. Zemini neredeyse beyaz
 * olmalı — `map` binanın rengiyle çarpılıyor ve ortalaması koyu bir doku
 * bütün şehri o oranda karartır (Tur 6'da gündüz binalar siyaha yakın
 * çıkıyordu).
 *
 * Gece dokusu (`emissiveMap`) aynı yerleşimde ve SİYAH zeminli: siyah
 * sıfır emisyon, yani ışık yalnızca pencerelerden çıkıyor ve parlaklık
 * serbestçe yükseltilebiliyor. Pencerelerin bir kısmı sönük — hepsi
 * yanarsa bina ızgaraya, hiçbiri yanmazsa gece ölü bir şehre döner.
 */
const ATLAS = 256;
const QUAD = ATLAS / 2;

type QuadrantPainter = (ctx: CanvasRenderingContext2D, x0: number, y0: number) => void;

function paintAtlas(painters: {
  residential: QuadrantPainter;
  office: QuadrantPainter;
  storefront: QuadrantPainter;
  industrial: QuadrantPainter;
}, background: string): THREE.CanvasTexture {
  const { ctx, el } = canvas(ATLAS);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, ATLAS, ATLAS);
  painters.residential(ctx, 0, QUAD);
  painters.office(ctx, QUAD, QUAD);
  painters.storefront(ctx, 0, 0);
  painters.industrial(ctx, QUAD, 0);
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Vitrin bandının çeyrek içindeki yüksekliği (piksel) — surface.ts'teki 0,42 ile aynı. */
const STOREFRONT_PX = Math.round(QUAD * 0.42);

export function makeFacadeAtlas(): THREE.CanvasTexture {
  return paintAtlas(
    {
      // Konut: kat başına üç delikli pencere, denizlik ve kat bandı.
      residential: (ctx, x0, y0) => {
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(x0, y0, QUAD, QUAD);
        const rows = 4;
        const cols = 3;
        const rowH = QUAD / rows;
        const colW = QUAD / cols;
        for (let r = 0; r < rows; r++) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(x0, y0 + r * rowH + rowH - 3, QUAD, 3);
          for (let c = 0; c < cols; c++) {
            const wx = x0 + c * colW + colW * 0.24;
            const wy = y0 + r * rowH + rowH * 0.2;
            const ww = colW * 0.52;
            const wh = rowH * 0.5;
            ctx.fillStyle = '#a7b0ba';
            ctx.fillRect(wx, wy, ww, wh);
            ctx.fillStyle = '#c3cad1';
            ctx.fillRect(wx, wy, ww, wh * 0.22);
            ctx.fillStyle = '#f7f7f7';
            ctx.fillRect(wx - 2, wy + wh, ww + 4, 3);
          }
        }
      },
      // Ofis: cam giydirme — koyu cam, ince dikmeler, kat başına döşeme bandı.
      office: (ctx, x0, y0) => {
        const gradient = ctx.createLinearGradient(x0, y0, x0 + QUAD, y0 + QUAD);
        gradient.addColorStop(0, '#a4b2c0');
        gradient.addColorStop(1, '#8796a6');
        ctx.fillStyle = gradient;
        ctx.fillRect(x0, y0, QUAD, QUAD);
        const rows = 4;
        const cols = 4;
        ctx.fillStyle = '#dfe3e7';
        for (let r = 0; r < rows; r++) ctx.fillRect(x0, y0 + (r + 1) * (QUAD / rows) - 5, QUAD, 5);
        ctx.fillStyle = '#e9ecef';
        for (let c = 0; c < cols; c++) ctx.fillRect(x0 + c * (QUAD / cols), y0, 2, QUAD);
      },
      // Vitrin: yalnızca alt bant kullanılıyor — süpürgelik, büyük cam, tabela alnı.
      storefront: (ctx, x0, y0) => {
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(x0, y0, QUAD, QUAD);
        const bottom = y0 + QUAD;
        const top = bottom - STOREFRONT_PX;
        // Tabela alnı (açık) — vitrinin üstünde.
        ctx.fillStyle = '#f6f6f6';
        ctx.fillRect(x0, top, QUAD, 10);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(x0, top + 10, QUAD, 2);
        // Büyük vitrin camı ve kapı.
        ctx.fillStyle = '#7d8a96';
        ctx.fillRect(x0 + 4, top + 14, QUAD - 8, STOREFRONT_PX - 22);
        ctx.fillStyle = '#5f6b76';
        ctx.fillRect(x0 + QUAD * 0.62, top + 14, QUAD * 0.16, STOREFRONT_PX - 22);
        // Doğrama.
        ctx.fillStyle = '#f2f2f2';
        for (const f of [0.31, 0.62, 0.78]) ctx.fillRect(x0 + QUAD * f - 1, top + 14, 3, STOREFRONT_PX - 22);
        // Süpürgelik.
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(x0, bottom - 8, QUAD, 8);
      },
      // Sanayi: oluklu panel ve üstte şerit pencere.
      industrial: (ctx, x0, y0) => {
        for (let x = 0; x < QUAD; x += 8) {
          ctx.fillStyle = (x / 8) % 2 === 0 ? '#e9e9e9' : '#d9d9d9';
          ctx.fillRect(x0 + x, y0, 8, QUAD);
        }
        ctx.fillStyle = '#a3acb5';
        ctx.fillRect(x0, y0 + QUAD * 0.16, QUAD, QUAD * 0.1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fillRect(x0, y0 + QUAD * 0.5, QUAD, 3);
      },
    },
    '#eeeeee',
  );
}

export function makeWindowAtlas(): THREE.CanvasTexture {
  const lit = (seed: number, threshold: number) => hash(seed) > threshold;
  return paintAtlas(
    {
      residential: (ctx, x0, y0) => {
        const rows = 4;
        const cols = 3;
        const rowH = QUAD / rows;
        const colW = QUAD / cols;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!lit(r * 11 + c * 5 + 1, 0.42)) continue;
            const value = 0.55 + hash(r * 3 + c * 17) * 0.45;
            const shade = Math.round(value * 255);
            ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.84)}, ${Math.round(shade * 0.58)})`;
            ctx.fillRect(x0 + c * colW + colW * 0.24, y0 + r * rowH + rowH * 0.2, colW * 0.52, rowH * 0.5);
          }
        }
      },
      // Ofis gecesi: katların çoğu yanık, ışık daha soğuk ve düz.
      office: (ctx, x0, y0) => {
        const rows = 4;
        const cols = 4;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!lit(r * 7 + c * 13 + 3, 0.3)) continue;
            const value = 0.6 + hash(r * 19 + c * 7) * 0.3;
            const shade = Math.round(value * 255);
            ctx.fillStyle = `rgb(${Math.round(shade * 0.86)}, ${Math.round(shade * 0.9)}, ${shade})`;
            ctx.fillRect(x0 + c * (QUAD / cols) + 3, y0 + r * (QUAD / rows) + 2, QUAD / cols - 5, QUAD / rows - 9);
          }
        }
      },
      // Vitrin gece hep yanık: dükkân sokağı aydınlatıyor.
      storefront: (ctx, x0, y0) => {
        const bottom = y0 + QUAD;
        const top = bottom - STOREFRONT_PX;
        ctx.fillStyle = 'rgb(255, 226, 170)';
        ctx.fillRect(x0 + 4, top + 14, QUAD - 8, STOREFRONT_PX - 22);
        ctx.fillStyle = 'rgb(150, 128, 92)';
        ctx.fillRect(x0, top, QUAD, 10);
      },
      industrial: (ctx, x0, y0) => {
        ctx.fillStyle = 'rgb(120, 112, 96)';
        ctx.fillRect(x0, y0 + QUAD * 0.16, QUAD, QUAD * 0.1);
      },
    },
    '#000000',
  );
}

/**
 * Tente dokusu — iki tonlu dikey çizgiler. Renk örnek renginden geliyor;
 * doku yalnızca açık/koyu şeritleri veriyor, uçta ince bir saçak.
 */
export function makeAwningTexture(): THREE.CanvasTexture {
  const size = 64;
  const { ctx, el } = canvas(size);
  for (let x = 0; x < size; x += 8) {
    ctx.fillStyle = (x / 8) % 2 === 0 ? '#ffffff' : '#c9c9c9';
    ctx.fillRect(x, 0, 8, size);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, size - 6, size, 6);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Temas gölgesi — binanın zemine oturduğu yerdeki yumuşak karartma.
 * Merkezi koyu, kenara doğru sönen bir kare leke; renk siyah, iş alfada.
 */
export function makeContactShadowTexture(): THREE.CanvasTexture {
  const size = 64;
  const { ctx, el } = canvas(size);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Kare bir leke: köşeleri yuvarlak, kenara doğru yumuşak.
      const dx = Math.abs((x + 0.5) / size - 0.5) * 2;
      const dy = Math.abs((y + 0.5) / size - 0.5) * 2;
      const d = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25);
      const alpha = Math.max(0, Math.min(1, (1 - d) / 0.55));
      const i = (y * size + x) * 4;
      image.data[i] = 0;
      image.data[i + 1] = 0;
      image.data[i + 2] = 0;
      image.data[i + 3] = Math.round(alpha * alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(el);
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
