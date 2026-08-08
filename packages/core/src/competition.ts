import {
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  getCeoModifiers,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import { buildCost } from './actions';
import { bestPlotFor } from './chain';
import { MARKETING_CAP, RESEARCH_CAP, marketingLeverage, researchCeiling } from './systems/focus';
import { tilePrice } from './systems/city';
import type { GameState } from './types';

/**
 * Rekabet kartı — oyuncunun rakibini gördüğü tek nesne.
 *
 * Zincir kartı "maliyetim nereden geliyor" sorusunu cevaplıyor. Bu kart
 * onun karşı tarafı: **aynı rafta duran rakibime karşı neredeyim.**
 *
 * Motor tarafında dönen şey karmaşık: çekicilik formülü, bölge bazlı
 * kapasite bütçesi, marka yakınsaması, kıtlıkla çarpılan fiyat primi.
 * Oyuncunun görmesi gereken şey basit: kategoride payım ne, lider kim,
 * hangi kolum ne kadar dolu ve şimdi ne yapmalıyım.
 *
 * `chain.ts` gibi tamamen türetilmiştir — state'e hiçbir şey yazmaz.
 */

/**
 * Mağazaların bu doluluğun üstündeyse kolun karşılığı FİYATTA çıkar.
 *
 * İlk sürüm bunu BÖLGENİN boş talebinden okuyordu ve yanlıştı: bir
 * outlet kapasitesini komşu bölgelere de dağıtıyor, dolayısıyla kendi
 * bölgesinde boş talep düşük görünürken outlet yine de tepede
 * çalışabiliyor. Testte tam bu çıktı — kart "pazar doymuş, kalite paya
 * döner" diyordu, oysa ölçüm aynı kurulumda kârın tamamının FİYATTAN
 * geldiğini gösteriyordu.
 *
 * Doğru sinyal doğrudan mekanizmanın kendisi: kapasiten doluysa
 * çekicilik sana tek birim daha getiremez, getirisi fiyattadır.
 */
const PRICE_CHANNEL_UTILISATION = 0.95;

/**
 * Kolların karşılığını vermeye başladığı mağaza sayısı.
 *
 * Eşikler ölçümden geliyor, tahminden değil. Tur 3'ün nüfus düzeltmesinden
 * sonra kolların geri ödeme eğrisi keskinleşti — çünkü artık pazar
 * gerçekten doyuyor ve kolun değeri ölçekle birlikte hızla büyüyor:
 *
 *   mağaza |  Ar-Ge  | Pazarlama
 *        4 | 604 gün |  802 gün
 *        6 | 246 gün |  245 gün
 *        8 | 134 gün |   89 gün
 *
 * Kart eskiden 3 mağazada Ar-Ge öneriyordu; o tavsiye artık yanlış olurdu.
 * Kartın işi oyuncuya doğruyu söylemek, cesaret vermek değil.
 */
const RESEARCH_MIN_OUTLETS = 6;
const MARKETING_MIN_OUTLETS = 6;

/** Payın bu değerin altındaysa savunma değil GİRİŞ silahı gerekiyor. */
const ENTRY_SHARE = 0.35;

export type ArmKind = 'research' | 'marketing';

export interface CompetitionArm {
  kind: ArmKind;
  label: string;
  /** Bu kategoriye atanmış bina sayısı. */
  count: number;
  /** Şu anki etki: Ar-Ge'de birikmiş prim, pazarlamada kaldıraç. */
  value: number;
  /** Mevcut binalarla ulaşılabilecek tavan. */
  ceiling: number;
  /** Mekaniğin mutlak tavanı (0,30 / 0,35). */
  cap: number;
  detail: string;
}

export interface CompetitionRival {
  companyId: string;
  name: string;
  color: string;
  share: number;
  quality: number;
  brand: number;
  price: number;
}

export interface CompetitionMove {
  kind: ArmKind;
  defId: string;
  name: string;
  tileId: number;
  districtName: string;
  cost: number;
  needsBuyout: boolean;
  reason: string;
  /** Ölçek yetmeden kurulursa boş kapasiteye para ödenir. */
  premature: boolean;
}

export interface CompetitionCard {
  category: CategoryId;
  categoryName: string;
  color: string;
  outlets: number;
  share: number;
  /** Kategorideki mağazalarının ortalama etkin kalitesi (Ar-Ge dahil). */
  quality: number;
  brand: number;
  /** Ortalama fiyat çarpanı. */
  price: number;
  /** Payı en yüksek rakip; yoksa null. */
  leader: CompetitionRival | null;
  arms: CompetitionArm[];
  /** Mağazalarının kapasite doluluğu 0..1 — kanalı bu belirler. */
  utilisation: number;
  /** Mağazalarının bulunduğu bölgelerde karşılanmayan talep oranı. */
  scarcity: number;
  /**
   * Kolun bu kategoride hangi kanaldan ödediği.
   *   'price' — kapasiten dolu, kalite fiyata dönüyor
   *   'share' — boş kapasiten var, kalite paya dönüyor
   */
  channel: 'price' | 'share';
  channelLabel: string;
  /**
   * Tablonun kendi başına söyleyemediği şey.
   *
   * Her boyutta önde olup payı düşük olmak mümkün ve ilk bakışta çelişki
   * gibi görünüyor: pay çekicilikle değil KAPASİTEYLE sınırlıysa daha iyi
   * olmak sana bir birim daha getirmez. Kart bunu söylemezse oyuncu
   * "kaliteyi artırayım" der ve yanlış kolu çeker.
   */
  note: string | null;
  move: CompetitionMove | null;
  blocked: string | null;
}

/** Bir binanın etkin kalitesi — pazar çözümleyicisiyle aynı formül. */
function effectiveQuality(state: GameState, companyId: string, defId: string): number {
  const def = BUILDING_BY_ID[defId];
  if (!def) return 0;
  const company = state.companies[companyId];
  const ceo = getCeoModifiers(company?.ceoId ?? null);
  const bonus = ceo.categoryQuality?.category === def.category ? ceo.categoryQuality.bonus : 0;
  return Math.max(0.05, Math.min(1, def.quality + bonus + (company?.research[def.category] ?? 0)));
}

interface Profile {
  outlets: number;
  quality: number;
  price: number;
  /** Satılan birim / kapasite — kolun hangi kanaldan ödediğini bu belirler. */
  utilisation: number;
  districts: Set<number>;
}

/** Bir şirketin bir kategorideki mağaza profili. */
function profileOf(state: GameState, companyId: string, categoryId: CategoryId): Profile {
  let outlets = 0;
  let quality = 0;
  let price = 0;
  let sold = 0;
  let capacity = 0;
  const districts = new Set<number>();

  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId) continue;
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet' || def.category !== categoryId) continue;
    outlets += 1;
    quality += effectiveQuality(state, companyId, building.defId);
    price += building.priceMultiplier;
    sold += building.last.unitsSold;
    capacity += def.capacity;
    districts.add(building.districtId);
  }

  return {
    outlets,
    quality: outlets > 0 ? quality / outlets : 0,
    price: outlets > 0 ? price / outlets : 1,
    utilisation: capacity > 0 ? sold / capacity : 0,
    districts,
  };
}

function armsFor(state: GameState, companyId: string, categoryId: CategoryId): CompetitionArm[] {
  const counts: Record<ArmKind, number> = { research: 0, marketing: 0 };
  for (const building of Object.values(state.buildings)) {
    if (building.companyId !== companyId || building.focus !== categoryId) continue;
    const role = BUILDING_BY_ID[building.defId]?.role;
    if (role === 'research' || role === 'marketing') counts[role] += 1;
  }

  const research = state.companies[companyId]?.research[categoryId] ?? 0;
  const researchTarget = researchCeiling(state, companyId, categoryId);
  const leverage = marketingLeverage(state, companyId, categoryId);

  return [
    {
      kind: 'research',
      label: 'Ar-Ge',
      count: counts.research,
      value: research,
      ceiling: researchTarget,
      cap: RESEARCH_CAP,
      detail:
        counts.research === 0
          ? 'Merkez yok — kalite bina tanımından geliyor.'
          : research < researchTarget * 0.95
            ? `${counts.research} merkez · kalite +${research.toFixed(2)}, tavan +${researchTarget.toFixed(2)} (ilerliyor)`
            : `${counts.research} merkez · kalite +${research.toFixed(2)} (tavanda)`,
    },
    {
      kind: 'marketing',
      label: 'Pazarlama',
      count: counts.marketing,
      value: leverage,
      // Pazarlama birikimli değil: kurduğun gün tavanındadır.
      ceiling: leverage,
      cap: MARKETING_CAP,
      detail:
        counts.marketing === 0
          ? 'Ofis yok — marka yalnızca payını takip ediyor.'
          : `${counts.marketing} ofis · marka hedefi +${leverage.toFixed(2)}`,
    },
  ];
}

/** Kategorideki en güçlü rakip. */
function leaderOf(
  state: GameState,
  companyId: string,
  categoryId: CategoryId,
): CompetitionRival | null {
  let best: CompetitionRival | null = null;

  for (const company of Object.values(state.companies)) {
    if (company.id === companyId) continue;
    const profile = profileOf(state, company.id, categoryId);
    if (profile.outlets === 0) continue;

    const share = company.marketShare[categoryId] ?? 0;
    if (best && share <= best.share) continue;
    best = {
      companyId: company.id,
      name: company.name,
      color: company.color,
      share,
      quality: profile.quality,
      brand: company.brand[categoryId] ?? 0,
      price: profile.price,
    };
  }

  return best;
}

/**
 * Karttaki tek hamle.
 *
 * Hangi kol? Ölçümün gösterdiği asimetriye göre:
 *   - Payın düşükse PAZARLAMA — kaldıraç toplamsal olduğu için düşük
 *     markada oransal katkısı daha büyük (%37'ye karşı %21). Giriş silahı.
 *   - Payın yerindeyse AR-GE — kalıcı, ölçekle ucuzlayan savunma.
 * İkisi de tavandaysa hamle yok, sebebi yazılı.
 */
function bestMove(
  state: GameState,
  companyId: string,
  categoryId: CategoryId,
  card: { share: number; outlets: number; arms: CompetitionArm[]; channel: 'price' | 'share' },
): { move: CompetitionMove | null; blocked: string | null } {
  const research = card.arms.find((arm) => arm.kind === 'research')!;
  const marketing = card.arms.find((arm) => arm.kind === 'marketing')!;

  const wantMarketing = marketing.ceiling < marketing.cap && card.share < ENTRY_SHARE;
  const order: ArmKind[] = wantMarketing ? ['marketing', 'research'] : ['research', 'marketing'];

  for (const kind of order) {
    const arm = kind === 'research' ? research : marketing;
    if (arm.ceiling >= arm.cap) continue;

    const defId = kind === 'research' ? 'research_center' : 'marketing_office';
    const def = BUILDING_BY_ID[defId];
    if (!def) continue;

    const company = state.companies[companyId];
    if (!company || company.netWorth < def.unlockNetWorth) continue;

    const plot = bestPlotFor(state, def);
    if (!plot) continue;

    const district = state.districts[plot.districtId];
    const minOutlets = kind === 'research' ? RESEARCH_MIN_OUTLETS : MARKETING_MIN_OUTLETS;
    const premature = card.outlets < minOutlets;

    return {
      move: {
        kind,
        defId,
        name: def.name,
        tileId: plot.tileId,
        districtName: district?.name ?? 'Şehir',
        cost: buildCost(state, companyId, defId),
        needsBuyout: plot.needsBuyout,
        premature,
        reason: reasonFor(kind, card, arm, premature, minOutlets),
      },
      blocked: null,
    };
  }

  if (research.ceiling >= research.cap && marketing.ceiling >= marketing.cap) {
    return {
      move: null,
      blocked:
        'Her iki kol da tavanda. Buradan daha fazla açmanın yolu ölçek: bu kategoride daha çok mağaza.',
    };
  }

  const def = BUILDING_BY_ID[research.ceiling < research.cap ? 'research_center' : 'marketing_office'];
  const company = state.companies[companyId];
  if (def && company && company.netWorth < def.unlockNetWorth) {
    return { move: null, blocked: `${def.name} için ${formatShort(def.unlockNetWorth)} şirket değeri gerekiyor.` };
  }
  return { move: null, blocked: 'Şehirde alınabilecek boş parsel kalmamış.' };
}

function reasonFor(
  kind: ArmKind,
  card: { share: number; outlets: number; channel: 'price' | 'share' },
  arm: CompetitionArm,
  premature: boolean,
  minOutlets: number,
): string {
  if (premature) {
    return (
      `${arm.label} sabit gider getirir, faydası ise mağaza sayınla çarpılır. ` +
      `Bu kategoride ${card.outlets} mağazan var; karşılığını ${minOutlets} mağazadan sonra vermeye başlıyor.`
    );
  }

  if (kind === 'marketing') {
    // Gerekçe KANALA göre değişmeli. Kapasiten doluyken "markan payını
    // yukarı çeker" demek yanlış olurdu: aynı kartın üstünde payın
    // çekicilikle sınırlı olmadığı yazıyor. Marka orada fiyat primine
    // giriyor, paya değil.
    return card.channel === 'price'
      ? 'Marka, fiyat primine de giriyor: kapasiten doluyken kolun karşılığı marjda çıkar. ' +
        'Pazarlama Ar-Ge\'den ucuz ve etkisi kurduğun gün başlıyor — en hızlı prim burada.'
      : `Payın %${Math.round(card.share * 100)} — markan payının hak ettiğinden yukarı çekilebilir. ` +
        'Pazarlama düşük markada oransal olarak daha çok kazandırır: giriş silahı.';
  }

  return card.channel === 'price'
    ? 'Mağazaların kapasitesinde çalışıyor: çekicilik sana bir birim daha getiremez. Kalitenin karşılığı burada fiyat primi olarak çıkar.'
    : 'Mağazalarında boş kapasite var: kalite doğrudan paya dönüyor, rakibin müşterisini alırsın.';
}

/**
 * Oyuncunun mağazası olan her kategori için bir kart.
 *
 * Hiçbir şey satmıyorsan kart da yok — zincir panelindeki kuralın aynısı.
 */
export function competitionCards(state: GameState, companyId: string): CompetitionCard[] {
  const company = state.companies[companyId];
  if (!company) return [];

  const cards: CompetitionCard[] = [];

  for (const categoryId of CONSUMER_CATEGORIES) {
    const profile = profileOf(state, companyId, categoryId);
    if (profile.outlets === 0) continue;

    // Kıtlık, YALNIZCA mağazalarının bulunduğu bölgelerden okunuyor.
    // Şehir ortalaması yanıltırdı: sanayi bölgesinde kimsenin satmadığı
    // bir kategori oyuncunun kendi mahallesini doymuş göstermez.
    let scarcity = 0;
    for (const districtId of profile.districts) {
      scarcity += state.districts[districtId]?.unmet[categoryId] ?? 0;
    }
    scarcity = profile.districts.size > 0 ? scarcity / profile.districts.size : 0;

    const channel: 'price' | 'share' =
      profile.utilisation >= PRICE_CHANNEL_UTILISATION ? 'price' : 'share';
    const arms = armsFor(state, companyId, categoryId);
    const share = company.marketShare[categoryId] ?? 0;

    const partial = { share, outlets: profile.outlets, arms, channel };
    const { move, blocked } = bestMove(state, companyId, categoryId, partial);
    const leader = leaderOf(state, companyId, categoryId);

    cards.push({
      category: categoryId,
      categoryName: CATEGORIES[categoryId].name,
      color: CATEGORIES[categoryId].color,
      outlets: profile.outlets,
      share,
      quality: profile.quality,
      brand: company.brand[categoryId] ?? 0,
      price: profile.price,
      leader,
      arms,
      utilisation: profile.utilisation,
      note: noteFor(profile, share, leader, channel),
      scarcity,
      channel,
      channelLabel:
        channel === 'price'
          ? `Mağazaların kapasitesinde çalışıyor (%${Math.round(profile.utilisation * 100)} dolu) — kolun karşılığı hacim değil FİYAT: aynı malı daha pahalıya satarsın.`
          : `Mağazalarında boş kapasite var (%${Math.round(profile.utilisation * 100)} dolu) — kolun karşılığı PAY: rakibin müşterisini alırsın.`,
      move,
      blocked,
    });
  }

  cards.sort((a, b) => b.outlets - a.outlets || a.categoryName.localeCompare(b.categoryName, 'tr'));
  return cards;
}

/**
 * Tablonun altındaki açıklama satırı — yalnızca gerçekten gerektiğinde.
 *
 * Boş bir satır göstermek yerine null dönüyoruz: her karta iliştirilen
 * bir "ipucu" kutusu üçüncü karttan sonra okunmaz hale gelir.
 */
function noteFor(
  profile: Profile,
  share: number,
  leader: CompetitionRival | null,
  channel: 'price' | 'share',
): string | null {
  if (!leader) return null;

  if (channel === 'price' && share < leader.share) {
    return (
      `Payın ${leader.name} şirketinin altında ama sebebi kalite ya da marka değil: ` +
      `mağazaların %${Math.round(profile.utilisation * 100)} dolu çalışıyor. ` +
      'Daha çekici olmak sana bir birim daha getiremez — PAY almanın yolu daha çok mağaza. ' +
      'Kolun buradaki karşılığı pay değil, aynı hacmi daha pahalıya satmak.'
    );
  }

  if (channel === 'share' && share < leader.share) {
    return (
      `Boş kapasiten var ve payın ${leader.name} şirketinin altında: ` +
      'burada kaybettiğin müşteri doğrudan çekicilikten kaybediliyor. Kol hamlesi tam da bunun için.'
    );
  }

  return null;
}

/** Bir binanın odağını değiştirmenin neden mümkün olmadığını açıklar. */
export function focusBlocker(state: GameState, buildingId: string): string | null {
  const building = state.buildings[buildingId];
  if (!building) return 'Bina bulunamadı.';
  const role = BUILDING_BY_ID[building.defId]?.role;
  if (role !== 'research' && role !== 'marketing') return 'Bu bina bir kategoriye atanmaz.';
  return null;
}

function formatShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ₺`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}B ₺`;
  return `${Math.round(value)} ₺`;
}

/** Kartın hamlesi için parsel dahil toplam maliyet. */
export function moveTotalCost(state: GameState, move: CompetitionMove, companyId: string): number {
  return move.cost + tilePrice(state, move.tileId, companyId);
}
