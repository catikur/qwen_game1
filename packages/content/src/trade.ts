/**
 * Şehirler arası hat (Tur 77).
 *
 * Holding'in iki şehrindeki nakliye terminalleri bir hatla bağlanıyor: bir
 * şehrin fazla ürettiği mal öbür şehrin havuzuna giriyor. Hattın üç ölçüsü
 * var. Kapasite: kamyon sayısı çarpı kamyonun günlük yükü; kamyonlar çıkış
 * terminalinin filosundan (taşıma sözleşmeleriyle aynı 16 kamyon). Süre:
 * iki şehrin arası, şehir çiftinden (3–6 gün). Bedel: kamyon başına günlük,
 * yolun her günü için — boş giden kamyonun da bedeli var.
 *
 * Kalibrasyon (DURUM Tur 77, denge bölümü "Şehirler arası hat"): dört
 * günlük hatta dolu giden kamyonun bedeli buğdayın değerinin %6'sı, kumaşın
 * %0,8'i, çipin binde 1,5'i. Hattın kazancı fazla satarken kırılan fiyattan
 * (%15) geliyor: kamyon başına buğdayda günde 110–240 ₺ — taşıma
 * sözleşmesindeki bir kamyonun ücreti kadar (150. günde 175–260 ₺) —,
 * kumaşta 2.300–2.900 ₺. Filo iki iş kolu arasında bölünüyor: ucuz mal
 * için hat sözleşmeyle yarışıyor, değerli malda hat açıkça önde.
 */
export const TRADE_LINE = {
  /** Holding'de en çok hat: üç şehrin altı yönü. */
  maxLines: 6,
  /** Bir kamyonun günde taşıdığı birim. */
  truckUnits: 300,
  /** Kamyonun günlük bedeli, yolun her günü için: dört günlük hatta kamyon günde 60 ₺. */
  truckCostPerTransitDay: 15,
  /** İki şehrin arası: en kısa ve en uzun yol (gün). */
  minTransitDays: 3,
  maxTransitDays: 6,
  /**
   * Hattın varışta pazara sattığı malın fiyatı, spot fiyata oran (Tur 78).
   * Üretim fazlası pazara dökülürken %15 kırılıyor (`SURPLUS_HAIRCUT`);
   * hattın malı planlı geliyor, terminal onu düzenli satıyor: kırık %5.
   */
  saleShare: 0.95,
} as const;

/**
 * Ticaretin fiyatı (Tur 78): rakipler de hat açıyor.
 *
 * Hat artık eksiğini çıkış şehrinin pazarından alabiliyor; mal bir
 * şehirde ucuz, öbüründe pahalıysa üretimsiz de kâr ediyor. Varış
 * şehrine giren mal oranın fazlası: pazarı doyurdukça fiyat düşüyor
 * (spot fiyatın fazla kırığı, `GLUT_DEPTH`). Rakip, oyuncunun yolu pazara
 * satışta kârlı kaldıkça bunu görüyor ve kopyalıyor: varış şehrinin en
 * zengin rakibi aynı malı aynı yoldan getirmeye başlıyor, kâr sürdükçe
 * kamyon ekliyor. Onun malı da varışın fazlası: fark daralıyor. Fark
 * kapanınca rakip kamyon çekiyor, sonunda hattı kapatıyor.
 *
 * Rakip yalnız oyuncunun açtığı yolu kopyalıyor; kendi başına yol
 * aramıyor. Hat açmayan holding'in şehirleri Tur 77'deki gibi yaşıyor.
 */
export const TRADE_RIVAL = {
  /** Oyuncunun yolu bu kadar ardışık gün kârlıysa rakip kopyalıyor. */
  entryDays: 30,
  /** "Kârlı": pazara satışta birim kâr, malın çıkıştaki fiyatının bu payını geçiyor. */
  entryMargin: 0.08,
  /** Rakip kamyonunu bu kadar günde bir gözden geçiriyor: kâr sürüyorsa bir ekliyor, zarardaysa bir çekiyor. */
  reviewDays: 10,
  /** Rakibin bir yoldaki en çok kamyonu. */
  maxTrucks: 6,
  /** Rakip ancak nakdi bu kadar günlük yükün bedeline yetiyorsa kopyalıyor. */
  cashDays: 10,
} as const;
