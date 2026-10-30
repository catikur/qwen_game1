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
} as const;
