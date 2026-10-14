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

/*
 * KENNEY TARZI CEPHE (Tur 33).
 *
 * Dil üç renkten oluşuyor: duvar (nötr, neredeyse beyaz — bina rengi örnek
 * renginden geliyor), çerçeve (saf beyaz, duvardan bir ton açık) ve CAM.
 * Cam mavi ağırlıklı çiziliyor ve gölgelendirici (`surface.ts`) mavi
 * ağırlıklı pikseli bina rengiyle çarpmıyor: pencere mor binada da, sarı
 * binada da aynı açık mavi cam. Eski atlasta pencere duvar renginin koyu
 * bir tonuydu ve şehir yakından "kirli" okunuyordu.
 *
 * Gece dokusu aynı dikdörtgenleri kullanıyor: yanan pencere, gündüzün camı.
 */
const WALL = '#f4f4f4';
const FRAME = '#ffffff';
const GLASS = '#6fa9d8';
const GLASS_LIGHT = '#a9d3f1';
const GLASS_DARK = '#4e86bd';

/** Konut penceresi: kat başına üç, `r` satır `c` sütun. */
function residentialWindow(x0: number, y0: number, r: number, c: number): { x: number; y: number; w: number; h: number } {
  const rowH = QUAD / 4;
  const colW = QUAD / 3;
  return { x: x0 + c * colW + colW * 0.24, y: y0 + r * rowH + rowH * 0.2, w: colW * 0.52, h: rowH * 0.52 };
}

/** Ofis camı: kat başına dört bölme; altta bir döşeme bandı (duvar rengi). */
function officePane(x0: number, y0: number, r: number, c: number): { x: number; y: number; w: number; h: number } {
  const rowH = QUAD / 4;
  const colW = QUAD / 4;
  return { x: x0 + c * colW + 2, y: y0 + r * rowH + 3, w: colW - 4, h: rowH * 0.66 };
}

/** Vitrin camı ve kapısı (çeyreğin alt bandında). */
function storefrontGlass(x0: number, y0: number): { x: number; y: number; w: number; h: number } {
  const top = y0 + QUAD - STOREFRONT_PX;
  return { x: x0 + 5, y: top + 15, w: QUAD - 10, h: STOREFRONT_PX - 24 };
}

/** Sanayi şerit penceresi. */
function industrialStrip(x0: number, y0: number): { x: number; y: number; w: number; h: number } {
  return { x: x0, y: y0 + QUAD * 0.14, w: QUAD, h: QUAD * 0.13 };
}

/** Çerçeveli cam: beyaz kasa, mavi cam, sol üstte ışık payı. */
function paintPane(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, frame: number): void {
  ctx.fillStyle = FRAME;
  ctx.fillRect(rect.x - frame, rect.y - frame, rect.w + frame * 2, rect.h + frame * 2);
  ctx.fillStyle = GLASS;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = GLASS_LIGHT;
  ctx.fillRect(rect.x, rect.y, rect.w * 0.45, rect.h * 0.32);
}

export function makeFacadeAtlas(): THREE.CanvasTexture {
  return paintAtlas(
    {
      // Konut: kat başına üç çerçeveli pencere, ortada kayıt, altta denizlik.
      residential: (ctx, x0, y0) => {
        ctx.fillStyle = WALL;
        ctx.fillRect(x0, y0, QUAD, QUAD);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 3; c++) {
            const w = residentialWindow(x0, y0, r, c);
            paintPane(ctx, w, 3);
            // Kayıt: camı ikiye bölen beyaz çıta.
            ctx.fillStyle = FRAME;
            ctx.fillRect(w.x + w.w / 2 - 1.5, w.y, 3, w.h);
            // Denizlik.
            ctx.fillRect(w.x - 5, w.y + w.h + 2, w.w + 10, 4);
          }
        }
      },
      // Ofis: kat başına bir cam şerit (dört bölme) ve altında duvar renginde döşeme bandı.
      office: (ctx, x0, y0) => {
        ctx.fillStyle = WALL;
        ctx.fillRect(x0, y0, QUAD, QUAD);
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const pane = officePane(x0, y0, r, c);
            ctx.fillStyle = GLASS;
            ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
            ctx.fillStyle = GLASS_LIGHT;
            ctx.fillRect(pane.x, pane.y, pane.w * 0.4, pane.h * 0.3);
          }
          // Döşeme bandının üst kenarında ince beyaz denizlik.
          ctx.fillStyle = FRAME;
          ctx.fillRect(x0, y0 + r * (QUAD / 4) + 3 + (QUAD / 4) * 0.66, QUAD, 3);
        }
      },
      // Vitrin: alt bantta tabela alnı, büyük cam, koyu cam kapı, beyaz doğrama.
      storefront: (ctx, x0, y0) => {
        ctx.fillStyle = WALL;
        ctx.fillRect(x0, y0, QUAD, QUAD);
        const bottom = y0 + QUAD;
        const top = bottom - STOREFRONT_PX;
        const glass = storefrontGlass(x0, y0);
        ctx.fillStyle = FRAME;
        ctx.fillRect(x0, top, QUAD, 11);
        paintPane(ctx, glass, 3);
        ctx.fillStyle = GLASS_DARK;
        ctx.fillRect(x0 + QUAD * 0.62, glass.y, QUAD * 0.16, glass.h);
        ctx.fillStyle = FRAME;
        for (const f of [0.31, 0.62, 0.78]) ctx.fillRect(x0 + QUAD * f - 1.5, glass.y, 3, glass.h);
        ctx.fillStyle = '#d6d6d6';
        ctx.fillRect(x0, bottom - 7, QUAD, 7);
      },
      // Sanayi: geniş oluklu panel, üstte beyaz kayıtlı şerit pencere.
      industrial: (ctx, x0, y0) => {
        for (let x = 0; x < QUAD; x += 10) {
          ctx.fillStyle = (x / 10) % 2 === 0 ? WALL : '#e2e2e2';
          ctx.fillRect(x0 + x, y0, 10, QUAD);
        }
        const strip = industrialStrip(x0, y0);
        ctx.fillStyle = FRAME;
        ctx.fillRect(strip.x, strip.y - 3, strip.w, strip.h + 6);
        ctx.fillStyle = GLASS;
        ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
        ctx.fillStyle = FRAME;
        for (let x = 0; x < QUAD; x += 16) ctx.fillRect(x0 + x, strip.y, 3, strip.h);
      },
    },
    WALL,
  );
}

export function makeWindowAtlas(): THREE.CanvasTexture {
  const lit = (seed: number, threshold: number) => hash(seed) > threshold;
  return paintAtlas(
    {
      residential: (ctx, x0, y0) => {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 3; c++) {
            if (!lit(r * 11 + c * 5 + 1, 0.42)) continue;
            const value = 0.55 + hash(r * 3 + c * 17) * 0.45;
            const shade = Math.round(value * 255);
            const w = residentialWindow(x0, y0, r, c);
            ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.84)}, ${Math.round(shade * 0.58)})`;
            ctx.fillRect(w.x, w.y, w.w, w.h);
          }
        }
      },
      // Ofis gecesi: katların çoğu yanık, ışık daha soğuk ve düz.
      office: (ctx, x0, y0) => {
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            if (!lit(r * 7 + c * 13 + 3, 0.3)) continue;
            const value = 0.6 + hash(r * 19 + c * 7) * 0.3;
            const shade = Math.round(value * 255);
            const pane = officePane(x0, y0, r, c);
            ctx.fillStyle = `rgb(${Math.round(shade * 0.86)}, ${Math.round(shade * 0.9)}, ${shade})`;
            ctx.fillRect(pane.x, pane.y, pane.w, pane.h);
          }
        }
      },
      // Vitrin gece hep yanık: dükkân sokağı aydınlatıyor.
      storefront: (ctx, x0, y0) => {
        const glass = storefrontGlass(x0, y0);
        ctx.fillStyle = 'rgb(255, 226, 170)';
        ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
        ctx.fillStyle = 'rgb(150, 128, 92)';
        ctx.fillRect(x0, y0 + QUAD - STOREFRONT_PX, QUAD, 11);
      },
      industrial: (ctx, x0, y0) => {
        const strip = industrialStrip(x0, y0);
        ctx.fillStyle = 'rgb(120, 112, 96)';
        ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
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

  // Tur 33: Kenney tarzı — orta gri asfalt, açık gri kaldırım, beyaz kesikli çizgi.
  ctx.fillStyle = '#4a4f58';
  ctx.fillRect(0, 0, size, size);

  // Asfalt taneciği: çok hafif, desen değil doku.
  for (let i = 0; i < 500; i++) {
    const value = hash(i);
    const grey = 70 + Math.round(value * 14);
    ctx.fillStyle = `rgb(${grey}, ${grey + 3}, ${grey + 8})`;
    ctx.fillRect(hash(i * 3.1) * size, hash(i * 7.7) * size, 1.4, 1.4);
  }

  // Kaldırım: karenin iki kenarında açık gri bant, yola bakan kenarında bordür.
  const curb = size * 0.13;
  ctx.fillStyle = '#c9cdd3';
  ctx.fillRect(0, 0, size, curb);
  ctx.fillRect(0, size - curb, size, curb);
  ctx.fillStyle = '#9ea4ad';
  ctx.fillRect(0, curb - 3, size, 3);
  ctx.fillRect(0, size - curb, size, 3);

  // Kesikli orta çizgi.
  ctx.fillStyle = '#f4f4ef';
  const dash = size * 0.2;
  const gap = size * 0.14;
  for (let x = gap / 2; x < size; x += dash + gap) {
    ctx.fillRect(x, size / 2 - 2, dash, 4);
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
