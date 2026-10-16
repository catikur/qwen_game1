import { localizeList } from './localize';

/**
 * Geç oyun giderleri ve krizler (Tur 37a).
 *
 * ÖLÇÜM. Uzun koşu (`packages/core/test/longrun.ts`, üç tohum, 1440 gün)
 * büyümenin üstel değil DOĞRUSAL olduğunu gösterdi: arsa ~720. günde
 * bitiyor, bina sayısı 140–160'ta duruyor, kâr günde ~0,3–0,5 M ₺ kasada
 * birikiyor. 1440. günde servetin %94'ü nakit. Kartopunun sorunu hız değil
 * BOŞLUK: büyüdükçe hiçbir şey zorlaşmıyor, birikene harcanacak yer yok.
 * Rakipler aynı kasayla geri geliyor (oran 2,1 → 1,1).
 *
 * İki fren, ikisi de herkese (rakiplere de) aynı:
 *   - YÖNETİM YÜKÜ: büyük şirket pahalı yönetilir. Belli bir binadan
 *     sonra her bina bakım ve ücreti biraz daha artırıyor.
 *   - SERVET VERGİSİ: kademeli, şirket özkaynağı üzerinden. Kasada
 *     yatan para erir; parayı işe koyan (büyüme, hisse, yeni şehir) daha
 *     az kaybeder.
 *
 * Emlak vergisi denendi ve bırakıldı: geç oyunda mülk servetin yalnızca
 * ~%6'sı, vergisi kâra göre gürültü düzeyinde kalıyordu.
 */
export const LATE_COSTS = {
  /** Bu kadar binaya kadar yönetim yükü yok. */
  overheadFreeBuildings: 30,
  /** Sonraki her bina için bakım ve ücrete eklenen oran. */
  overheadPerBuilding: 0.004,
  /** Yönetim yükünün tavanı (+%60). */
  overheadCap: 0.6,
  /** Servet vergisi dilimleri — özkaynağın `from` üstü kısmına yıllık oran. */
  wealthBrackets: [
    { from: 25_000_000, rate: 0.01 },
    { from: 100_000_000, rate: 0.02 },
    { from: 300_000_000, rate: 0.03 },
  ],
} as const;

/**
 * Kriz (Tur 37a): dönemlerden sert, olaylardan uzun.
 *
 * Mevcut "Durgunluk" olayı 30 gün sürüyordu ve dönemlerin etkisi ±%8–12;
 * nakit ve borç kararı hiçbir zaman sınanmıyordu. Kriz bir AY ÖNCEDEN
 * haber veriyor — hazırlanmak oyunun parçası: nakit biriktiren ucuzlayan
 * arsadan alır, sabit faize bağlanan şoktan korunur, kredili hesapla
 * yaşayan sıkışır.
 */
export interface CrisisDef {
  id: string;
  title: string;
  /** Uyarı haberi (kriz başlamadan `CRISIS_TIMING.warningDays` önce). */
  warningTitle: string;
  warningBody: string;
  /** Başlangıç haberi. */
  body: string;
  endTitle: string;
  endBody: string;
  weight: number;
  /** Süre aralığı (gün) — zar bu aralıktan seçiyor. */
  durationDays: readonly [number, number];
  effects: {
    /** Bütün tüketici kategorilerinin talebine çarpan. */
    demand?: number;
    /** Taban faize eklenen yıllık puan: kredili hesap ve yeni krediler. */
    rateDelta?: number;
    /** Arsa değerine günlük çarpan (olaylardaki gibi). */
    landValueDrift?: number;
    /** İnşaat maliyetine çarpan. */
    buildCost?: number;
  };
}

export const CRISES: CrisisDef[] = [
  {
    id: 'deep_recession',
    title: 'Durgunluk',
    warningTitle: 'Ekonomistler durgunluk uyarısı veriyor',
    warningBody:
      'Siparişler yavaşlıyor; bir ay içinde talep düşebilir. Kasada nakit tutan, ucuzlayan arsadan ve inşaattan yararlanır.',
    body: 'Talep %16 düştü, arsa fiyatları geriliyor ve inşaat %15 ucuzladı. Nakdi olan için alım zamanı.',
    endTitle: 'Durgunluk sona erdi',
    endBody: 'Talep toparlanıyor, inşaat maliyetleri eski düzeyine döndü.',
    weight: 1,
    durationDays: [100, 150],
    effects: { demand: 0.84, landValueDrift: -0.0022, buildCost: 0.85 },
  },
  {
    id: 'rate_shock',
    title: 'Faiz şoku',
    warningTitle: 'Merkez bankası faiz artışının sinyalini verdi',
    warningBody:
      'Bir ay içinde faizler sert yükselebilir. Vadeli kredi şimdi alınırsa faizi sabit kalır; kredili hesap pahalanacak.',
    body: 'Taban faiz 6 puan arttı: kredili hesap ve yeni krediler pahalı. Mevcut vadeli krediler sabit faizli. Talep hafifçe geriledi.',
    endTitle: 'Faizler normale döndü',
    endBody: 'Taban faiz eski düzeyine indi.',
    weight: 1,
    durationDays: [110, 160],
    effects: { rateDelta: 0.06, demand: 0.95, landValueDrift: -0.0012 },
  },
];

export const CRISIS_BY_ID: Record<string, CrisisDef> = Object.fromEntries(CRISES.map((crisis) => [crisis.id, crisis]));

/**
 * Kriz takvimi. İlk uyarı 320–440. gün arasında (oyun ancak orada
 * büyüyor), sonra her krizin bitişinden 300–480 gün sonra yeni bir uyarı.
 * 1440 günlük bir oyunda iki-üç kriz.
 */
export const CRISIS_TIMING = {
  firstDay: 320,
  firstSpread: 120,
  gapDays: [300, 480] as const,
  warningDays: 30,
} as const;

localizeList(CRISES, 'crisis', ['title', 'warningTitle', 'warningBody', 'body', 'endTitle', 'endBody']);
