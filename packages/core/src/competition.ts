import { scopedMemo, withBuildingIndex } from './systems/buildingIndex';
import {
  BUILDING_BY_ID,
  CATEGORIES,
  CONSUMER_CATEGORIES,
  baseText,
  formatDecimal,
  formatShortMoney,
  getCeoModifiers,
} from '@capital/content';
import type { CategoryId } from '@capital/content';
import { buildCost } from './actions';
import { bestPlotFor } from './chain';
import { MARKETING_CAP, RESEARCH_CAP, marketingLeverage, researchCeiling } from './systems/focus';
import { tilePrice } from './systems/city';
import { effectivePriceMultiplier } from './systems/rivalry';
import { tc } from './i18n';
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

/**
 * Bir şirketin bir kategorideki mağaza profili.
 *
 * Kart boyunca bütün şirketlerin profilleri tek taramada (Tur 38): lider
 * araması her kategoride her şirketi soruyordu ve her soru bütün binaları
 * tarıyordu — büyük şehrin geç oyununda günün onda biri. Toplamlar aynı
 * sırayla (bina sırası) birikiyor; sonuç birebir aynı.
 */
function profileOf(state: GameState, companyId: string, categoryId: CategoryId): Profile {
  const profile = scopedMemo(state, 'competition-profiles', () => allProfiles(state)).get(`${companyId}|${categoryId}`);
  return profile ?? { outlets: 0, quality: 0, price: 1, utilisation: 0, districts: new Set<number>() };
}

function allProfiles(state: GameState): Map<string, Profile> {
  const sums = new Map<string, { outlets: number; quality: number; price: number; sold: number; capacity: number; districts: Set<number> }>();
  for (const building of Object.values(state.buildings)) {
    const def = BUILDING_BY_ID[building.defId];
    if (def?.role !== 'outlet') continue;
    const key = `${building.companyId}|${def.category}`;
    let sum = sums.get(key);
    if (!sum) {
      sum = { outlets: 0, quality: 0, price: 0, sold: 0, capacity: 0, districts: new Set<number>() };
      sums.set(key, sum);
    }
    sum.outlets += 1;
    sum.quality += effectiveQuality(state, building.companyId, building.defId);
    // Kampanyadaki rakibin fiyatı indirimli (Tur 37b): panel gerçek fiyatı göstersin.
    sum.price += effectivePriceMultiplier(state, building);
    sum.sold += building.last.unitsSold;
    sum.capacity += def.capacity;
    sum.districts.add(building.districtId);
  }
  const profiles = new Map<string, Profile>();
  for (const [key, sum] of sums) {
    profiles.set(key, {
      outlets: sum.outlets,
      quality: sum.quality / sum.outlets,
      price: sum.price / sum.outlets,
      utilisation: sum.capacity > 0 ? sum.sold / sum.capacity : 0,
      districts: sum.districts,
    });
  }
  return profiles;
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
      label: tc('core.competition.armResearch'),
      count: counts.research,
      value: research,
      ceiling: researchTarget,
      cap: RESEARCH_CAP,
      detail:
        counts.research === 0
          ? tc('core.competition.researchNone')
          : research < researchTarget * 0.95
            ? tc('core.competition.researchGrowing', {
                count: counts.research,
                value: formatDecimal(research, 2),
                ceiling: formatDecimal(researchTarget, 2),
              })
            : tc('core.competition.researchCapped', { count: counts.research, value: formatDecimal(research, 2) }),
    },
    {
      kind: 'marketing',
      label: tc('core.competition.armMarketing'),
      count: counts.marketing,
      value: leverage,
      // Pazarlama birikimli değil: kurduğun gün tavanındadır.
      ceiling: leverage,
      cap: MARKETING_CAP,
      detail:
        counts.marketing === 0
          ? tc('core.competition.marketingNone')
          : tc('core.competition.marketingActive', { count: counts.marketing, value: formatDecimal(leverage, 2) }),
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
        districtName: district?.name ?? tc('core.competition.cityFallback'),
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
      blocked: tc('core.competition.bothCapped'),
    };
  }

  const def = BUILDING_BY_ID[research.ceiling < research.cap ? 'research_center' : 'marketing_office'];
  const company = state.companies[companyId];
  if (def && company && company.netWorth < def.unlockNetWorth) {
    return {
      move: null,
      blocked: tc('core.competition.needsNetWorth', { name: def.name, amount: formatShortMoney(def.unlockNetWorth) }),
    };
  }
  return { move: null, blocked: tc('core.competition.noPlot') };
}

function reasonFor(
  kind: ArmKind,
  card: { share: number; outlets: number; channel: 'price' | 'share' },
  arm: CompetitionArm,
  premature: boolean,
  minOutlets: number,
): string {
  if (premature) {
    return tc('core.competition.reasonPremature', { arm: arm.label, outlets: card.outlets, min: minOutlets });
  }

  if (kind === 'marketing') {
    // Gerekçe KANALA göre değişmeli. Kapasiten doluyken "markan payını
    // yukarı çeker" demek yanlış olurdu: aynı kartın üstünde payın
    // çekicilikle sınırlı olmadığı yazıyor. Marka orada fiyat primine
    // giriyor, paya değil.
    return card.channel === 'price'
      ? tc('core.competition.reasonMarketingPrice')
      : tc('core.competition.reasonMarketingShare', { share: Math.round(card.share * 100) });
  }

  return card.channel === 'price'
    ? tc('core.competition.reasonResearchPrice')
    : tc('core.competition.reasonResearchShare');
}

/**
 * Oyuncunun mağazası olan her kategori için bir kart.
 *
 * Hiçbir şey satmıyorsan kart da yok — zincir panelindeki kuralın aynısı.
 */
export function competitionCards(state: GameState, companyId: string): CompetitionCard[] {
  return withBuildingIndex(state, () => competitionCardsFor(state, companyId));
}

function competitionCardsFor(state: GameState, companyId: string): CompetitionCard[] {
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
          ? tc('core.competition.channelPrice', { utilisation: Math.round(profile.utilisation * 100) })
          : tc('core.competition.channelShare', { utilisation: Math.round(profile.utilisation * 100) }),
      move,
      blocked,
    });
  }

  // Eşitlikte Türkçe ada göre: rakipler kartları bu sırayla tarıyor, sıra
  // dile göre değişseydi aynı tohum İngilizcede başka bir oyun oynardı.
  cards.sort((a, b) => b.outlets - a.outlets || categoryOrder(a.category) - categoryOrder(b.category));
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
    return tc('core.competition.notePrice', {
      leader: leader.name,
      utilisation: Math.round(profile.utilisation * 100),
    });
  }

  if (channel === 'share' && share < leader.share) {
    return tc('core.competition.noteShare', { leader: leader.name });
  }

  return null;
}

/** Bir binanın odağını değiştirmenin neden mümkün olmadığını açıklar. */
export function focusBlocker(state: GameState, buildingId: string): string | null {
  const building = state.buildings[buildingId];
  if (!building) return tc('core.competition.buildingNotFound');
  const role = BUILDING_BY_ID[building.defId]?.role;
  if (role !== 'research' && role !== 'marketing') return tc('core.competition.notFocusable');
  return null;
}


let categoryRank: Map<CategoryId, number> | null = null;

/** Kategorilerin Türkçe adlarına göre sırası — etkin dilden bağımsız. */
function categoryOrder(category: CategoryId): number {
  if (!categoryRank) {
    const ids = Object.keys(CATEGORIES) as CategoryId[];
    const name = (id: CategoryId) => baseText(CATEGORIES[id], 'name') ?? CATEGORIES[id].name;
    ids.sort((a, b) => name(a).localeCompare(name(b), 'tr'));
    categoryRank = new Map(ids.map((id, index) => [id, index]));
  }
  return categoryRank.get(category) ?? 0;
}

/** Kartın hamlesi için parsel dahil toplam maliyet. */
export function moveTotalCost(state: GameState, move: CompetitionMove, companyId: string): number {
  return move.cost + tilePrice(state, move.tileId, companyId);
}
