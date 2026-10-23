import type { CategoryId } from './types';

/**
 * Gayrimenkul geliştiricisi (Tur 58).
 *
 * Kiralık binalar (apartman, rezidans, iş merkezi, plaza) kurulduğu gün
 * dolu açılıyordu ve kirası sabitti. Geliştirici yolu üç şey ekliyor:
 *
 *   - Proje: Konut Sitesi ve Ofis Kampüsü. İnşaatı sürüyor (şantiyenin
 *     gideri var, kirası yok); açılınca kiracılar zamanla geliyor ve
 *     zamanla gidiyor. Bir parsele en çok kiralık birim bu yoldan sığıyor.
 *   - Kira: oyuncu her kiralığın kirasını piyasanın altına ya da üstüne
 *     çekebiliyor. Pahalı kira doluluğu düşürüyor, ucuz kira dolduruyor.
 *   - Kentsel dönüşüm: belediyenin dönüşüm ihalesinden alınan parsel
 *     "dönüşüm hakkı" taşıyor. Üstüne kurulan proje imar artışıyla daha
 *     büyük; eski yapının sahipleri (hak sahipleri) yeni binadan kirasız
 *     daire alıyor. Oyuncu belediyeye bir yapı için dönüşüm başvurusu da
 *     yapabiliyor: sıradaki ihale o parsel.
 *
 * Rakipler proje kurmuyor ve kira ayarlamıyor; eski kiralıklarda kira 1
 * iken hesap eskisiyle bit bit aynı.
 */
export const REAL_ESTATE = {
  /** Kira seviyesi: piyasa kirasının katı, oyuncunun ayarı. */
  rent: { min: 0.8, max: 1.3, step: 0.05 },
  /**
   * Kiranın doluluğa etkisi: kira %10 pahalıysa hedef doluluk bu oranın
   * onda biri kadar düşük (konutta 6 puan). Gelirin en yüksek olduğu kira
   * piyasanın sıcaklığına bağlı: dolu bölgede piyasanın üstü, kiralığı bol
   * bölgede altı. Ofis kiracısı fiyata konuttan az bakıyor.
   */
  elasticity: { housing: 0.6, office: 0.45 } as Partial<Record<CategoryId, number>>,
  /** İnşaat süresince bakımın şantiyeye giden payı; ücret yok. */
  siteUpkeep: 0.3,
  /**
   * Projede doluluk hedefe günde en çok bu kadar yaklaşıyor (kiracı
   * gelişi), hedef düşerse en çok bu kadar uzaklaşıyor (taşınma). Ofis
   * yavaş doluyor ama sözleşmesi uzun: yavaş da boşalıyor.
   */
  leaseUp: { housing: 0.025, office: 0.012 } as Partial<Record<CategoryId, number>>,
  moveOut: { housing: 0.012, office: 0.005 } as Partial<Record<CategoryId, number>>,
  /** Açılış günü dolu olan pay: ön satış ve ön kiralama (ofiste çapa kiracı). */
  prelease: { housing: 0.15, office: 0.25 } as Partial<Record<CategoryId, number>>,
  /** Kentsel dönüşüm parselindeki proje. */
  renewal: {
    /** İmar artışı: kapasite bu kadar büyük. */
    capacityBonus: 0.6,
    /** Hak sahipleri: tanımdaki kapasitenin bu payı kirasız, hep dolu. */
    rightHolders: 0.25,
    /**
     * Dönüşüm başvurusunun bedeli: parselin bugünkü fiyatının payı, en az
     * `minFee`; geri dönmez. Arsa ucuz: taban olmasa başvuru parseli 30 gün
     * rakiplere bedavaya kapatırdı.
     */
    applicationFee: 0.05,
    minFee: 20_000,
  },
} as const;
