/**
 * Rakip konsorsiyumu (Tur 37d-3): öndeki pasif oyuncuya ortak baskın.
 *
 * Tek başına baskıncı yalnızca kendinden belirgin küçüğe saldırıyor (net
 * değer < %90). Yani bir kez öne geçen oyuncu baskından kurtuluyor: ölçüm
 * 400. günde el çeken oyuncunun on tohumun onunda 1200. güne ayakta
 * kaldığını ve 600–770. günlerde zafere de ulaştığını gösterdi, kasasında
 * 160–230 M ₺ atıl dururken.
 *
 * Konsorsiyum o boşluğu kapatıyor: oyuncu çok öndeyse, bir süredir bina
 * kurmuyorsa ve parası kasada yatıyorsa en büyük rakipler güç birliği
 * yapıyor (aktivist yatırımcı gibi: "para çalışmıyor"). Önce duyuru ve
 * savunma penceresi, sonra ortak alım. Hisseler önderin hesabına
 * toplanıyor; kontrol, uyarılar ve geri alım kilidi tek baskıncıyla aynı.
 *
 * Savunma: yatırıma dönmek (üç yeni bina ya da kasayı net değerin %20'sinin
 * altına indirmek), hisse geri almak (kilit) ya da halka arzla yatırımcı
 * getirmek. Zaferden sonra kurulmuyor (serbest
 * oyun); zafer gelince süren konsorsiyum dağılıyor.
 */
export const CONSORTIUM = {
  /** Bu günden önce kurulmuyor: şehir kurulsun, baskınlar ısınsın. */
  earliestDay: 300,
  /** Oyuncunun net değeri en güçlü rakibin en az bu katı ("çok önde"). */
  leadRatio: 1.3,
  /** Kasa net değerin en az bu payı ("atıl para"). */
  idleCashShare: 0.3,
  /**
   * Son bu kadar günde yeni bina yok ("yatırım durmuş"). Kasa payı tek
   * başına ayırt etmiyor: ölçümde etkin oynayan vekilin kasası da net
   * değerin ~%70'i.
   */
  idleDays: 90,
  /** Duyurudan alıma kadar savunma penceresi. */
  warningDays: 30,
  /** Üye sayısı: en büyük rakiplerden. */
  minMembers: 2,
  maxMembers: 3,
  /** Günlük alım tavanı: zorluğun tek baskıncı tavanının bu katı. */
  capShare: 0.35,
  /** Her üyenin günlük katkısı: (kasa − taban) × bu. */
  memberBudget: 0.3,
  /** Üyenin kasasında dokunulmayan taban (tek baskıncıyla aynı). */
  memberReserve: 320_000,
  /** Önde olma bu katın altına inerse konsorsiyum dağılıyor. */
  dissolveRatio: 1.1,
  /** Kasa payı bu eşiğin altına inerse para işe koşulmuş sayılıyor. */
  workedCashShare: 0.2,
  /**
   * Ya da kuruluştan bu yana bu kadar yeni bina kurulduysa (yatırıma dönüş).
   * İlk ölçü "kasanın dörtte biri yeni binalara"ydı: 50 M ₺ kasada 12 M ₺,
   * 30 günde etkin oynayan vekilin bile ulaşamadığı bir eşik — yatırıma
   * dönen oyuncu da düşüyordu (10 tohumda 9).
   */
  workedBuilds: 3,
  /** Dağıldıktan sonra yenisi en erken. */
  cooldownDays: 120,
} as const;
