import { BUILDING_BY_ID, CONSUMER_CATEGORIES } from '@capital/content';
import type { CategoryId } from '@capital/content';
import type { GameState } from '../types';

/**
 * Rekabet kolları — Ar-Ge ve pazarlama.
 *
 * Tur 1 satılan şeyin bir maliyeti olmasını sağladı. Bu dosya, aynı rafta
 * duran iki şirketten hangisinin kazanacağı sorusuna fiyattan başka bir
 * cevap veriyor.
 *
 * Çekicilik formülü zaten dört değişken taşıyordu:
 *
 *     çekicilik = kalite^1,15 × marka × (1/fiyat)^esneklik × erişim
 *
 * Ama kalite bir bina sabiti, marka da pazar payının gecikmeli aynasıydı —
 * yani ikisi de oyuncunun dokunamadığı şeylerdi. Ar-Ge merkezi birinciyi,
 * pazarlama ofisi ikincisini oyuncunun eline veriyor.
 *
 * DENGE KISITI. Her iki katkı da TOPLAMSAL ve tabanları sıfır. Hiç Ar-Ge
 * merkezi ve pazarlama ofisi kurmayan bir şirket için `researchCeiling` ve
 * `marketingLeverage` sıfır döner, formüller Tur 1'deki hallerine indirgenir
 * ve ekonomi birebir aynı kalır. Mevcut kalibrasyon (60–110 gün outlet,
 * 170–174 gün zincir) bu sayede geçerliliğini koruyor.
 */

/** Bir kategoride Ar-Ge priminin çıkabileceği en yüksek değer. */
export const RESEARCH_CAP = 0.3;

/** Pazarlamanın marka hedefine ekleyebileceği en yüksek kaldıraç. */
export const MARKETING_CAP = 0.35;

/**
 * Ar-Ge priminin tavanına yaklaşma hızı — günde kalan farkın oranı.
 *
 * %2,5, tek merkezle 0'dan 0,12'ye ~92 günde %90 demek. Daha hızlısı
 * Ar-Ge'yi "kur ve unut" yapardı; daha yavaşı oyuncunun bir oyun ömrü
 * içinde sonucunu görmesini engellerdi.
 */
const RESEARCH_RATE = 0.025;

/** Kategori → 0 sözlüğü. */
export function zeroByCategoryRecord(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>;
  for (const category of CONSUMER_CATEGORIES) out[category] = 0;
  return out;
}

/**
 * Bir şirketin bir kategoriye atadığı binaların toplam gücü.
 *
 * Tavan `cap` ile sertçe kesiliyor: üçüncü Ar-Ge merkezi yalnızca +0,06
 * katıyor, dördüncü hiçbir şey. Azalan verim GÖRÜNÜR olsun istiyoruz;
 * oyuncu "bir tane daha kurayım" tuzağına düşmesin.
 */
function focusPotency(
  state: GameState,
  companyId: string,
  categoryId: CategoryId,
  role: 'research' | 'marketing',
  cap: number,
): number {
  let total = 0;
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    if (building.focus !== categoryId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== role) continue;
    total += def.focusPotency ?? 0;
  }
  return Math.min(cap, total);
}

/** Bir şirketin bir kategoride ulaşabileceği Ar-Ge tavanı. */
export function researchCeiling(
  state: GameState,
  companyId: string,
  categoryId: CategoryId,
): number {
  return focusPotency(state, companyId, categoryId, 'research', RESEARCH_CAP);
}

/**
 * Pazarlamanın marka hedefine kattığı kaldıraç.
 *
 * Ar-Ge'den farklı olarak BİRİKİMLİ DEĞİL: ofisi kurduğun gün etkisini
 * göstermeye başlar, yıktığın gün biter. Marka zaten kendi yavaşlığını
 * taşıyor (günde farkın %3,5'i), üstüne ikinci bir gecikme koymak kolu
 * oyuncunun göremeyeceği kadar uzatırdı.
 */
export function marketingLeverage(
  state: GameState,
  companyId: string,
  categoryId: CategoryId,
): number {
  return focusPotency(state, companyId, categoryId, 'marketing', MARKETING_CAP);
}

/**
 * Ar-Ge birikimini bir gün ilerletir.
 *
 * İki yönlü: tavan yükselince prim yukarı, merkez yıkılınca AYNI HIZLA
 * geri erir. Kalite kiralanır, satın alınmaz — yoksa doğru strateji
 * "merkez kur, tavana çık, yık" olurdu ve mekanik tek seferlik bir
 * maliyete dönerdi.
 */
export function runResearchTick(state: GameState): void {
  for (const company of Object.values(state.companies)) {
    for (const categoryId of CONSUMER_CATEGORIES) {
      const ceiling = researchCeiling(state, company.id, categoryId);
      const current = company.research[categoryId] ?? 0;
      const next = current + (ceiling - current) * RESEARCH_RATE;
      // Sıfıra çok yaklaşınca tam sıfırla: denge kimliği testinin
      // "Ar-Ge'siz oyuncu birebir aynı" iddiası kayan noktada da tutsun.
      company.research[categoryId] = Math.abs(next) < 1e-6 ? 0 : next;
    }
  }
}

/**
 * Bir `research`/`marketing` binası için varsayılan kategori.
 *
 * Şirketin o an EN ÇOK outlet'i olan kategorisi seçilir: yeni kurulan
 * merkez, oyuncunun zaten yatırım yaptığı yere çalışsın. Hiç outlet yoksa
 * binanın kataloğundaki kategori kullanılır.
 */
export function defaultFocus(state: GameState, companyId: string, defId: string): CategoryId | null {
  const def = BUILDING_BY_ID[defId];
  if (!def || (def.role !== 'research' && def.role !== 'marketing')) return null;

  const counts = zeroByCategoryRecord();
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const otherDef = BUILDING_BY_ID[building.defId];
    if (otherDef?.role !== 'outlet') continue;
    if (counts[otherDef.category] === undefined) continue;
    counts[otherDef.category] += 1;
  }

  let best: CategoryId | null = null;
  let bestCount = 0;
  for (const categoryId of CONSUMER_CATEGORIES) {
    if (counts[categoryId] > bestCount) {
      bestCount = counts[categoryId];
      best = categoryId;
    }
  }
  return best ?? (CONSUMER_CATEGORIES.includes(def.category) ? def.category : null);
}
