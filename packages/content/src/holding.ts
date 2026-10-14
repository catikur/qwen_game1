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
  /**
   * Uzaktaki şehrin talimatına göre kârdan kasaya akan pay (Tur 32).
   * Varsayılan `half` (= `remoteShare`). `keep`: para şehirde kalıyor —
   * savunmanın ve kötü günlerin yastığı; `all`: hepsi kasaya, şehirde
   * yastık yok.
   */
  payoutShare: { keep: 0, half: 0.5, all: 1 },
  /**
   * Savunma talimatı: en büyük dış pay bunu geçince yerel müdür serbest
   * hisseden geri alıyor, kontrol kilitlenene kadar (Tur 28'in kilidi).
   * Oyuncuyla aynı yol ve günlük tavan; günde şehir nakdinin yedeğin
   * üstündeki kısmının en fazla `defenseCashShare`'i. Yedek rakiplerin
   * savunma yedeğiyle aynı (320 B ₺). Para şehrin kendi kasasından —
   * hepsini kasaya çeken bir şehrin savunması zayıf.
   */
  defendAt: 0.2,
  defenseCashShare: 0.4,
  defenseReserve: 320_000,
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
