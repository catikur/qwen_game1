/**
 * Holding: birden çok şehir (Tur 22).
 *
 * Oyuncu bir şehirde zafere ulaşınca yeni bir şehre açılabiliyor. Aynı
 * anda bir şehir oynanıyor, diğerleri BEKLİYOR: takvimleri, rakipleri ve
 * şehir gelişimi donuk (SimCity'nin bölge oyunu gibi). Bekleyen şehrin
 * kârı durmuyor: ayrıldığın gündeki kâr eğiliminin bir payı her gün
 * holding kasasına akıyor.
 */
export const HOLDING = {
  /** Kurucu şehir dahil en fazla bu kadar şehir. */
  maxCities: 3,
  /**
   * Bekleyen şehrin kâr eğiliminden holding kasasına akan pay. Uzaktan
   * yönetim: şehri oynamak hem tam kârı hem büyümeyi veriyor, beklemek
   * yarısını ve büyümesizliği.
   */
  remoteShare: 0.5,
  /** Yeni şehre en az bu kadar sermaye (standart başlangıç nakdinin 8 katı). */
  minCapital: 2_000_000,
  /** Yeni şehirde marka bilinirliği: ayrılan şehirdeki ortalamanın bu payı. */
  brandCarry: 0.5,
} as const;

/** Şehir adları; holding kurucu tohumdan kaydırarak sırayla dağıtıyor. */
export const CITY_NAMES: readonly string[] = [
  'Yeşilova',
  'Göldere',
  'Kuzeykent',
  'Çamlıtepe',
  'Sarıyurt',
  'Ilıcaköy',
];
