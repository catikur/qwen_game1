/**
 * Belediye meclisi.
 *
 * Oyunun özgün planında "lobicilik / politika" vardı ve hiç yapılmadı;
 * değerlendirme bunu üç yenilikten biri olarak seçti. Meclis, şehrin
 * kurallarının OYUNUN İÇİNDE değişebildiği tek yer: imar takvimi,
 * kategori vergisi, altyapı, ruhsat.
 *
 * İki ilke:
 *   - AÇIKLANABİLİR SONUÇ: her oylamanın haberi destek yüzdesini, meclisin
 *     kendi eğilimini ve kimin ne kadar ittiğini yazıyor. Görünmez zar
 *     yok; aynı lobiyle aynı sonuç.
 *   - HERKES AYNI KURALLA: rakipler de lobi yapıyor ve doktrinlerine göre
 *     yapıyor — vergilenecek kategoride payı büyük olan karşı çıkar, metro
 *     gelecek bölgede arsası olan destekler. Bağış kamuya açık.
 */
export type MotionKind = 'zoning_rush' | 'category_tax' | 'category_relief' | 'infrastructure' | 'permit_relief';

export const COUNCIL = {
  /** İlk oturum (erken oyun kurulumun). */
  firstSessionDay: 120,
  /** Oturumlar arası (gün). */
  sessionEveryDays: 90,
  /** Önergelerin açıklanmasından oylamaya kadar lobi penceresi. */
  lobbyWindowDays: 20,
  motionsPerSession: 2,
  /** Meclisin kendi eğiliminin aralığı — lobisiz önerge yazı-turaya yakın. */
  baseSupportMin: 0.36,
  baseSupportMax: 0.62,
  /**
   * Lobinin etkisi azalan verimli: bir tarafın harcaması `S` iken etkisi
   * `swingPerUnit · √(S / influenceScale)`. İlk 100 bin bir şey değiştirir,
   * on katı üç katından biraz fazla. Toplam kayma tavanı `maxSwing`.
   */
  influenceScale: 250_000,
  swingPerUnit: 0.1,
  maxSwing: 0.3,
  taxRate: 0.08,
  reliefRate: 0.06,
  policyDays: 180,
  /*
   * Ruhsat kolaylığı ilk sürümde %15 / 120 gündü ve ölçüm iki sorun
   * gösterdi: her rakibin çıkarına olduğu için her çıktığında geçiyordu
   * (700 günde üç kez) ve ucuz inşaat, sınırdaki devralmaları geri ödeme
   * kapısından geçirip sanayi bölgesinin eski dokusunu tamamen yuttu
   * (26 depo → 0). %8 / 90 gün ve meclisin isteksizliği (aşağıda) ile
   * bir fırsat olarak kalıyor, şehri yeniden yazmıyor.
   */
  permitDiscount: 0.08,
  permitDays: 90,
  /** Metro: nüfus tavanına eklenen oran ve arsa değerine tek seferlik artış. */
  infrastructurePopulationBoost: 0.15,
  infrastructureLandBoost: 0.1,
  /** İmar öne çekme: kaç gün erken, ama en erken bu kadar gün sonra. */
  zoningAdvanceDays: 60,
  zoningMinLeadDays: 15,
} as const;

/**
 * Önerge türüne göre meclisin eğilim kayması. Ruhsat geliri belediyenin
 * kendi kasası: meclis ondan vazgeçmeye isteksiz, bütün şirketler lehte
 * olsa bile önerge kendiliğinden geçmez.
 */
export const MOTION_BIAS: Record<MotionKind, number> = {
  zoning_rush: 0,
  category_tax: 0,
  category_relief: 0,
  infrastructure: 0,
  permit_relief: -0.1,
};

export interface MotionText {
  title: string;
  summary: string;
}

/** `{district}` ve `{category}` yer tutucuları önerge üretilirken doluyor. */
export const MOTION_TEXT: Record<MotionKind, MotionText> = {
  zoning_rush: {
    title: '{district} imarı öne çekilsin',
    summary: 'Kabul edilirse {district} 60 gün erken imara açılır.',
  },
  category_tax: {
    title: '{category} satışlarına ek vergi',
    summary: 'Kabul edilirse 180 gün boyunca {category} cirosundan %8 vergi kesilir.',
  },
  category_relief: {
    title: '{category} esnafına teşvik',
    summary: 'Kabul edilirse 180 gün boyunca {category} cirosuna %6 belediye teşviki eklenir.',
  },
  infrastructure: {
    title: '{district} için metro hattı',
    summary: 'Kabul edilirse {district} nüfus tavanı %15 artar ve arsa değeri bir kerede %10 yükselir. Kalıcı.',
  },
  permit_relief: {
    title: 'İnşaat ruhsatlarında kolaylık',
    summary: 'Kabul edilirse 90 gün boyunca bütün yeni binalar %8 ucuza kurulur.',
  },
};
