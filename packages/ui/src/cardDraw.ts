import type { CardTone, CityCardFacts } from './cardFacts';

/**
 * Şehir kartının çizimi (Tur 64): 1200 × 630, sosyal ağların bağlantı
 * önizlemesinin boyutu.
 *
 * Solda oyunun camdan paneli gibi beyaz bir panel (şehrin her saatinde,
 * gecesinde de okunuyor), sağda şehrin kuşbakışı. Yazı tipleri oyununki:
 * başlık Fredoka, sayılar ve etiketler Nunito; tuval çizmeden önce yüklenmiş
 * olmalarını bekliyor, gelmezse sistem yazı tipiyle çiziyor.
 */
export const CARD = { width: 1200, height: 630 } as const;

const DISPLAY = "'Fredoka', 'Nunito', ui-sans-serif, system-ui, sans-serif";
const SANS = "'Nunito', ui-sans-serif, system-ui, sans-serif";
const INK = '#1d3557';
const MUTED = '#4f6c8e';
/** Sonucun hapı: oyunun parlak düğmeleriyle aynı iki ton (üst, kenar). */
const TONE: Record<CardTone, readonly [string, string]> = {
  win: ['#2dc26f', '#189150'],
  loss: ['#f06464', '#b52f2f'],
  done: ['#5c98f5', '#2e62bc'],
  live: ['#5c98f5', '#2e62bc'],
};
/** Kârın kaynakları, kartın çubuğunda: oyunun kendi tonları. */
const SOURCE_COLOR: Record<string, string> = {
  retail: '#2e62bc',
  realestate: '#8a63b8',
  energy: '#c27c00',
  freight: '#12925a',
};

const PANEL = { x: 40, y: 40, width: 540, height: 550, pad: 36 } as const;

export type Measure = (text: string, font: string) => number;

/**
 * Metni genişliğe sığdırır: büyükten küçüğe boyutları dener, en küçükte de
 * sığmazsa sondan kısaltıp üç nokta koyuyor (harf harf; emoji bölünmüyor).
 */
export function fitText(
  measure: Measure,
  text: string,
  maxWidth: number,
  sizes: readonly number[],
  font: (size: number) => string,
): { text: string; size: number } {
  for (const size of sizes) if (measure(text, font(size)) <= maxWidth) return { text, size };
  const size = sizes[sizes.length - 1]!;
  const chars = Array.from(text);
  while (chars.length > 1 && measure(`${chars.join('').trimEnd()}…`, font(size)) > maxWidth) chars.pop();
  return { text: `${chars.join('').trimEnd()}…`, size };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function spacing(ctx: CanvasRenderingContext2D, value: string): void {
  // Harf aralığı her tarayıcıda yok (Safari'de yeni); yoksa sıkışık kalıyor.
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

/** Şehrin karesi kartı kaplıyor; yoksa oyunun göğü. */
function drawBackdrop(ctx: CanvasRenderingContext2D, city: CanvasImageSource | null): void {
  if (city) {
    ctx.drawImage(city, 0, 0, CARD.width, CARD.height);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, CARD.height);
    sky.addColorStop(0, '#7ccbff');
    sky.addColorStop(0.36, '#a9deff');
    sky.addColorStop(0.66, '#d3eeff');
    sky.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CARD.width, CARD.height);
  }
  // Panelin arkası hafifçe kararıyor: panelin kenarı açık bir şehirde de belli.
  const shade = ctx.createLinearGradient(0, 0, PANEL.x + PANEL.width + 160, 0);
  shade.addColorStop(0, 'rgba(29, 53, 87, 0.28)');
  shade.addColorStop(1, 'rgba(29, 53, 87, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD.width, CARD.height);
}

export function drawCityCard(ctx: CanvasRenderingContext2D, facts: CityCardFacts, city: CanvasImageSource | null): void {
  const measure: Measure = (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  drawBackdrop(ctx, city);

  // Panel: oyunun kalın camı, gölgesiyle.
  ctx.save();
  ctx.shadowColor = 'rgba(29, 53, 87, 0.28)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  roundedRect(ctx, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 34);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fill();
  ctx.restore();

  const left = PANEL.x + PANEL.pad;
  const width = PANEL.width - PANEL.pad * 2;

  // Koşunun türü.
  spacing(ctx, '1.5px');
  const mode = fitText(measure, facts.mode.toLocaleUpperCase(), width, [18, 16, 14], (size) => `800 ${size}px ${SANS}`);
  ctx.font = `800 ${mode.size}px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(mode.text, left, 104);
  spacing(ctx, '0px');

  // Şirket: rengi ve adı.
  ctx.beginPath();
  ctx.arc(left + 13, 152, 13, 0, Math.PI * 2);
  ctx.fillStyle = facts.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(29, 53, 87, 0.22)';
  ctx.stroke();
  const name = fitText(measure, facts.company, width - 40, [60, 54, 48, 42, 36], (size) => `700 ${size}px ${DISPLAY}`);
  ctx.font = `700 ${name.size}px ${DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText(name.text, left + 40, 152 + name.size * 0.36);

  // Sonucun hapı.
  const [top, edge] = TONE[facts.tone];
  const outcome = fitText(measure, facts.outcome, width - 48, [26, 23, 20], (size) => `800 ${size}px ${SANS}`);
  const pillWidth = Math.min(width, measure(outcome.text, `800 ${outcome.size}px ${SANS}`) + 48);
  roundedRect(ctx, left, 206, pillWidth, 56, 28);
  ctx.fillStyle = edge;
  ctx.fill();
  roundedRect(ctx, left, 206, pillWidth, 52, 26);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.font = `800 ${outcome.size}px ${SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(outcome.text, left + 24, 206 + 26 + outcome.size * 0.36);

  // Gün ve tarih.
  const when = fitText(measure, facts.when, width, [22, 20], (size) => `700 ${size}px ${SANS}`);
  ctx.font = `700 ${when.size}px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(when.text, left, 302);

  // Dört sayı, iki sıra.
  const gap = 14;
  const tileWidth = (width - gap) / 2;
  facts.stats.slice(0, 4).forEach((stat, index) => {
    const x = left + (index % 2) * (tileWidth + gap);
    const y = 326 + Math.floor(index / 2) * (76 + gap);
    roundedRect(ctx, x, y, tileWidth, 76, 18);
    ctx.fillStyle = 'rgba(29, 53, 87, 0.06)';
    ctx.fill();
    spacing(ctx, '1px');
    const label = fitText(measure, stat.label.toLocaleUpperCase(), tileWidth - 36, [14, 12], (size) => `800 ${size}px ${SANS}`);
    ctx.font = `800 ${label.size}px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(label.text, x + 18, y + 28);
    spacing(ctx, '0px');
    const value = fitText(measure, stat.value, tileWidth - 36, [30, 26, 22], (size) => `800 ${size}px ${SANS}`);
    ctx.font = `800 ${value.size}px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(value.text, x + 18, y + 62);
  });

  // Şirketin yolu: adı ve kârın kaynakları tek çubukta.
  if (facts.path) {
    const heading = `${facts.path.title}: ${facts.path.name}`;
    const title = fitText(measure, heading, width, [18, 16], (size) => `800 ${size}px ${SANS}`);
    ctx.font = `800 ${title.size}px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(title.text, left, 520);
    const total = facts.path.sources.reduce((sum, source) => sum + source.share, 0) || 1;
    ctx.save();
    roundedRect(ctx, left, 532, width, 14, 7);
    ctx.clip();
    ctx.fillStyle = 'rgba(29, 53, 87, 0.1)';
    ctx.fillRect(left, 532, width, 14);
    let x = left;
    for (const source of facts.path.sources) {
      const w = (source.share / total) * width;
      ctx.fillStyle = SOURCE_COLOR[source.id] ?? MUTED;
      ctx.fillRect(x, 532, w, 14);
      x += w;
    }
    ctx.restore();
    const line = fitText(measure, facts.path.legend, width, [16, 14], (size) => `700 ${size}px ${SANS}`);
    ctx.font = `700 ${line.size}px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(line.text, left, 572);
  }

  // Oyunun adı, sağ altta.
  const brand = 'CapitalForge';
  ctx.font = `700 24px ${DISPLAY}`;
  const brandWidth = ctx.measureText(brand).width + 40;
  roundedRect(ctx, CARD.width - 40 - brandWidth, CARD.height - 40 - 48, brandWidth, 48, 24);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(brand, CARD.width - 40 - brandWidth + 20, CARD.height - 40 - 48 + 33);
  ctx.restore();
}

/** Kartın yazı tipleri: yüklenene dek (en çok 1,5 sn) bekleniyor. */
async function fontsReady(): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.load) return;
  const loads = [`700 60px ${DISPLAY}`, `800 30px ${SANS}`, `700 22px ${SANS}`].map((font) => fonts.load(font).catch(() => []));
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 1500))]);
}

/** Kartı çizip PNG olarak veriyor. */
export async function renderCityCard(facts: CityCardFacts, city: CanvasImageSource | null): Promise<Blob> {
  await fontsReady();
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2B tuval yok');
  drawCityCard(ctx, facts, city);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG yazılamadı'))), 'image/png');
  });
}
