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
/**
 * Atlas kenarı (piksel). Tur 34'te 256'dan 512'ye çıktı: pencereye çerçeve,
 * kayıt, denizlik ve cam yansıması sığsın diye. `surface.ts` çeyrek
 * kenarındaki payı bu değerden hesaplıyor.
 */
export const FACADE_ATLAS_SIZE = 512;
const ATLAS = FACADE_ATLAS_SIZE;
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
 * PENCERE YERLERİ GÜNDÜZ VE GECE DOKUSUNDA ORTAK.
 *
 * Gece dokusu ışığı pencere dikdörtgenine basıyor; gündüz dokusunda
 * pencere bir piksel kayarsa gece ışık duvara taşar. Yerler bu yüzden tek
 * yerden geliyor.
 */
const RES_ROWS = 4;
const RES_COLS = 3;
const OFFICE_ROWS = 4;
const OFFICE_COLS = 4;

function residentialWindow(x0: number, y0: number, r: number, c: number): { x: number; y: number; w: number; h: number } {
  const rowH = QUAD / RES_ROWS;
  const colW = QUAD / RES_COLS;
  return { x: x0 + c * colW + colW * 0.25, y: y0 + r * rowH + rowH * 0.2, w: colW * 0.5, h: rowH * 0.52 };
}

function officePane(x0: number, y0: number, r: number, c: number): { x: number; y: number; w: number; h: number } {
  const rowH = QUAD / OFFICE_ROWS;
  const colW = QUAD / OFFICE_COLS;
  return { x: x0 + c * colW + 3, y: y0 + r * rowH + 3, w: colW - 6, h: rowH - 17 };
}

/** Sıva: neredeyse beyaz zeminde çok hafif lekelenme — düz renk kâğıt gibi duruyordu. */
function plaster(ctx: CanvasRenderingContext2D, x0: number, y0: number, seed: number): void {
  ctx.fillStyle = '#efefef';
  ctx.fillRect(x0, y0, QUAD, QUAD);
  for (let i = 0; i < 700; i++) {
    const v = hash(seed + i * 1.37);
    ctx.fillStyle = v > 0.5 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.045)';
    ctx.fillRect(x0 + hash(seed + i * 3.1) * QUAD, y0 + hash(seed + i * 7.3) * QUAD, 2 + v * 3, 2 + v * 2);
  }
}

/** Cam: üstte gökyüzü yansıması, altta koyu iç; ortalaması eski düz gri kadar. */
function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bottom: string): void {
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
}

export function makeFacadeAtlas(): THREE.CanvasTexture {
  return paintAtlas(
    {
      // Konut: sıvalı duvar, kat silmesi; pencerede söve, kayıt, denizlik
      // ve gölgeli derinlik. Uzaktan "delik" değil "pencere" okunsun.
      residential: (ctx, x0, y0) => {
        plaster(ctx, x0, y0, 11);
        const rowH = QUAD / RES_ROWS;
        for (let r = 0; r < RES_ROWS; r++) {
          // Kat silmesi: üstte ışık alan ince çıkıntı, altında gölge.
          const band = y0 + r * rowH + rowH - 7;
          ctx.fillStyle = '#fbfbfb';
          ctx.fillRect(x0, band, QUAD, 3);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
          ctx.fillRect(x0, band + 3, QUAD, 4);
          for (let c = 0; c < RES_COLS; c++) {
            const win = residentialWindow(x0, y0, r, c);
            // Söve: pencereyi çevreleyen açık çerçeve.
            ctx.fillStyle = '#fafafa';
            ctx.fillRect(win.x - 5, win.y - 5, win.w + 10, win.h + 8);
            // Lento gölgesi ve iç derinlik (sol ve üst kenar).
            glass(ctx, win.x, win.y, win.w, win.h, '#b4c2cf', '#5e6b79');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
            ctx.fillRect(win.x, win.y, win.w, 4);
            ctx.fillRect(win.x, win.y, 3, win.h);
            // Kayıt: ortada dikme, üçte birde yatay kayıt.
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(win.x + win.w / 2 - 1.5, win.y, 3, win.h);
            ctx.fillRect(win.x, win.y + win.h * 0.34, win.w, 3);
            // Denizlik: pencereden geniş, altında gölge.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(win.x - 8, win.y + win.h + 2, win.w + 16, 5);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
            ctx.fillRect(win.x - 8, win.y + win.h + 7, win.w + 16, 3);
          }
        }
      },
      // Ofis: cam giydirme. Her panelde gökyüzü yansıması, bazı paneller
      // daha açık (bulut), kat aralarında opak döşeme paneli, ince dikmeler.
      office: (ctx, x0, y0) => {
        ctx.fillStyle = '#d6dbe0';
        ctx.fillRect(x0, y0, QUAD, QUAD);
        for (let r = 0; r < OFFICE_ROWS; r++) {
          for (let c = 0; c < OFFICE_COLS; c++) {
            const pane = officePane(x0, y0, r, c);
            const lift = hash(r * 13 + c * 7 + 5) * 0.5;
            const top = lift > 0.32 ? '#cbd8e3' : '#aebdcb';
            glass(ctx, pane.x, pane.y, pane.w, pane.h, top, '#7a8999');
            // Çapraz yansıma şeridi: camı düz boyadan ayıran şey.
            ctx.save();
            ctx.beginPath();
            ctx.rect(pane.x, pane.y, pane.w, pane.h);
            ctx.clip();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.beginPath();
            const o = hash(r * 5 + c * 11) * pane.w;
            ctx.moveTo(pane.x + o, pane.y + pane.h);
            ctx.lineTo(pane.x + o + 18, pane.y + pane.h);
            ctx.lineTo(pane.x + o + 48, pane.y);
            ctx.lineTo(pane.x + o + 30, pane.y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          // Döşeme paneli: kat aralarında koyu-açık iki bant.
          const slab = y0 + (r + 1) * (QUAD / OFFICE_ROWS) - 14;
          ctx.fillStyle = '#e8ebee';
          ctx.fillRect(x0, slab, QUAD, 4);
          ctx.fillStyle = '#9aa6b2';
          ctx.fillRect(x0, slab + 4, QUAD, 10);
        }
        // Dikmeler.
        ctx.fillStyle = '#eef1f3';
        for (let c = 0; c <= OFFICE_COLS; c++) ctx.fillRect(x0 + c * (QUAD / OFFICE_COLS) - 2, y0, 4, QUAD);
      },
      // Vitrin: alt bant — tabela alnı, büyük cam (içinde raf gölgeleri),
      // kapı, süpürgelik. Üst kısım sıva.
      storefront: (ctx, x0, y0) => {
        plaster(ctx, x0, y0, 29);
        const bottom = y0 + QUAD;
        const top = bottom - STOREFRONT_PX;
        // Tabela alnı ve altındaki gölge.
        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(x0, top, QUAD, 20);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x0, top + 20, QUAD, 4);
        // Büyük vitrin camı.
        const gy = top + 28;
        const gh = STOREFRONT_PX - 44;
        glass(ctx, x0 + 8, gy, QUAD - 16, gh, '#a9b8c6', '#55616d');
        // Camın arkasında raflar: vitrin boş kutu gibi durmasın.
        ctx.fillStyle = 'rgba(40, 46, 54, 0.35)';
        for (let i = 0; i < 6; i++) ctx.fillRect(x0 + 18 + i * 26, gy + gh * 0.45, 18, gh * 0.55);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x0 + 8, gy, QUAD - 16, 8);
        // Kapı.
        glass(ctx, x0 + QUAD * 0.62, gy, QUAD * 0.16, gh, '#8796a4', '#3f4954');
        ctx.fillStyle = '#d9d9d9';
        ctx.fillRect(x0 + QUAD * 0.74, gy + gh * 0.5, 3, 12);
        // Doğrama.
        ctx.fillStyle = '#f2f2f2';
        for (const f of [0.31, 0.62, 0.78]) ctx.fillRect(x0 + QUAD * f - 2, gy, 5, gh);
        // Süpürgelik.
        ctx.fillStyle = '#cfcfcf';
        ctx.fillRect(x0, bottom - 16, QUAD, 16);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fillRect(x0, bottom - 16, QUAD, 3);
      },
      // Sanayi: kabartmalı oluklu sac (her olukta ışık-gölge geçişi), üstte
      // kayıtlı şerit pencere, yatay kuşak çizgileri.
      industrial: (ctx, x0, y0) => {
        const rib = 16;
        for (let x = 0; x < QUAD; x += rib) {
          const gradient = ctx.createLinearGradient(x0 + x, 0, x0 + x + rib, 0);
          gradient.addColorStop(0, '#f2f2f2');
          gradient.addColorStop(0.5, '#e2e2e2');
          gradient.addColorStop(1, '#cfcfcf');
          ctx.fillStyle = gradient;
          ctx.fillRect(x0 + x, y0, rib, QUAD);
        }
        const wy = y0 + QUAD * 0.14;
        const wh = QUAD * 0.12;
        glass(ctx, x0, wy, QUAD, wh, '#b7c3cf', '#7d8996');
        ctx.fillStyle = '#efefef';
        for (let x = 0; x <= QUAD; x += QUAD / 8) ctx.fillRect(x0 + x - 2, wy, 4, wh);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.fillRect(x0, wy + wh, QUAD, 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        for (const f of [0.5, 0.82]) ctx.fillRect(x0, y0 + QUAD * f, QUAD, 4);
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
        for (let r = 0; r < RES_ROWS; r++) {
          for (let c = 0; c < RES_COLS; c++) {
            if (!lit(r * 11 + c * 5 + 1, 0.42)) continue;
            const value = 0.55 + hash(r * 3 + c * 17) * 0.45;
            const shade = Math.round(value * 255);
            const win = residentialWindow(x0, y0, r, c);
            ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.84)}, ${Math.round(shade * 0.58)})`;
            ctx.fillRect(win.x, win.y, win.w, win.h);
            // Kayıt gece de görünsün: ışıklı camı bölen koyu çizgiler.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(win.x + win.w / 2 - 1.5, win.y, 3, win.h);
            ctx.fillRect(win.x, win.y + win.h * 0.34, win.w, 3);
          }
        }
      },
      // Ofis gecesi: katların çoğu yanık, ışık daha soğuk ve düz.
      office: (ctx, x0, y0) => {
        for (let r = 0; r < OFFICE_ROWS; r++) {
          for (let c = 0; c < OFFICE_COLS; c++) {
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
        const bottom = y0 + QUAD;
        const top = bottom - STOREFRONT_PX;
        ctx.fillStyle = 'rgb(255, 226, 170)';
        ctx.fillRect(x0 + 8, top + 28, QUAD - 16, STOREFRONT_PX - 44);
        ctx.fillStyle = 'rgb(150, 128, 92)';
        ctx.fillRect(x0, top, QUAD, 20);
      },
      industrial: (ctx, x0, y0) => {
        ctx.fillStyle = 'rgb(120, 112, 96)';
        ctx.fillRect(x0, y0 + QUAD * 0.14, QUAD, QUAD * 0.12);
      },
    },
    '#000000',
  );
}

/**
 * Kiremit dokusu (Tur 34) — kırma çatının sıraları.
 *
 * Çatı tek renk bir piramitti; kullanıcı binaların "pek değişmediğini"
 * söyleyince en çok yer kaplayan ama hiç ayrıntısı olmayan yüzeyin çatı
 * olduğu görüldü. İki sıra, derzleri şaşırtmalı; her sıranın üstü ışık
 * alıyor, altında bir sonraki sıranın gölgesi. Renk taşımıyor (örnek
 * rengiyle çarpılıyor) ve ortalaması beyaza yakın: çatının tonu
 * değişmiyor, yalnızca dokusu geliyor.
 */
export function makeRoofTileTexture(): THREE.CanvasTexture {
  const size = 64;
  const { ctx, el } = canvas(size);
  const row = size / 2;
  for (let r = 0; r < 2; r++) {
    const y = r * row;
    const gradient = ctx.createLinearGradient(0, y, 0, y + row);
    gradient.addColorStop(0, '#d9d9d9');
    gradient.addColorStop(0.2, '#ffffff');
    gradient.addColorStop(1, '#e4e4e4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, size, row);
    // Bir üst sıranın bu sıraya düşen gölgesi.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, y, size, 4);
    // Derzler: sıradan sıraya yarım kiremit kayık.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    const offset = r === 0 ? 0 : size / 4;
    for (let x = offset; x < size + offset; x += size / 2) ctx.fillRect(x % size, y + 4, 2, row - 6);
  }
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
