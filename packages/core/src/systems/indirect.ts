import { BUILDING_BY_ID, CONSUMER_CATEGORIES, getCeoModifiers } from '@capital/content';
import type { CategoryId } from '@capital/content';
import { MARKETING_CAP, RESEARCH_CAP, defaultFocus, marketingLeverage, researchCeiling } from './focus';
import { estimateInvestment, runMarketTick } from './market';
import { distributionRelief, resetDailyLedgers, runProductionTick } from './supply';
import type { BuildingInstance, GameState } from '../types';

/**
 * Dolaylı binaların tahmini — depo, Ar-Ge merkezi, pazarlama ofisi (Tur 21).
 *
 * Üçü de kendi defterine gelir yazmıyor; katkıları başka binaların
 * satırına dağılıyor. `estimateInvestment` bu yüzden `direct: false`
 * diyordu ve yapı menüsü üçü için de aynı cümleyi yazıyordu ("kendi
 * mağazalarının maliyetini düşürür") — Ar-Ge ve pazarlama için yanlış bir
 * cümle, ve hiçbirinde bir sayı yoktu.
 *
 * YÖNTEM: KARŞI-OLGUSAL GÜN. Etkiyi ayrı bir formülle tahmin etmek, pazarın
 * kendi matematiğinin (çekicilik, otomatik fiyat, kanal) ikinci bir
 * kopyasını yazmak olurdu ve iki kopya zamanla ayrışırdı. Onun yerine
 * durumun iki kopyası alınıyor, birine bina ekleniyor ve ikisinde de aynı
 * üretim + pazar adımı koşuluyor. Fark, binanın KALICI durumdaki brüt
 * katkısı (ciro − mal maliyeti); günlük kâr ondan binanın kendi gideri
 * düşülerek bulunuyor.
 *
 * Kalıcı durum: Ar-Ge primi ve marka zamanla birikiyor. İki kopyada da
 * mevcut binaların tavanı ve markanın hedefi oturmuş kabul ediliyor, yani
 * ölçülen şey yalnızca YENİ binanın payı. Etkinin oturma süresi ayrıca
 * söyleniyor.
 *
 * Rakipler bu deneyde hamle yapmıyor (yalnızca üretim ve pazar koşuyor):
 * tahmin "yarın aynı şehirde bu bina olsaydı", "rakipler buna nasıl cevap
 * verir" değil. NPC kararları bunu kullanmıyor; sıralama da değişmedi
 * (parsel başına doğrudan kâr) — tahmin yalnızca gösterge.
 */

export interface IndirectEstimate {
  /** Kalıcı durumda günlük brüt katkı (ciro − mal maliyeti farkı). */
  dailyGain: number;
  /** Katkı eksi binanın gideri ve ücreti. */
  dailyProfit: number;
  paybackDays: number;
  /** Etkinin %90'ının oturduğu yaklaşık gün; depoda 0. */
  rampDays: number;
  /** Ar-Ge / pazarlamada çalışacağı kategori. */
  focus?: CategoryId;
  /** Depoda menzile girecek, şimdiye kadar depolu olmayan mağaza sayısı. */
  covered?: number;
  /** Etki neden sıfır (mağaza yok, menzil boş, tavan dolu). */
  none?: string;
}

/** Ar-Ge priminin tavana yaklaşma hızı (`focus.ts` RESEARCH_RATE). */
const RESEARCH_RATE = 0.025;
const BRAND_RATE = 0.035;
const NINETY = Math.log(10);

/**
 * Kopyada pazarı oturt: üretim + pazar adımları birkaç gün, her gün sonunda
 * markalar kendi hedeflerine (`pay × 1,15 + kaldıraç`) çekiliyor.
 *
 * İlk sürüm TEK gün koşuyordu ve gerçeğin beşte birini buldu (Ar-Ge 953
 * ₺/gün tahmin, 150 gün sonra ölçülen 4.464). İki gecikme kaçıyordu:
 * otomatik fiyat farkın yalnızca %25'ini bir günde kapatıyor, ve marka ile
 * pay birbirini besliyor (kalite → pay → marka → pay). Sekiz gün fiyatın
 * %90'ını oturtuyor; markayı her gün hedefine koymak döngünün sabit
 * noktasını birkaç adımda buluyor.
 */
const SETTLE_DAYS = 8;

function settledGross(state: GameState, companyId: string): number {
  for (let i = 0; i < SETTLE_DAYS; i++) {
    resetDailyLedgers(state);
    runProductionTick(state);
    runMarketTick(state);
    for (const company of Object.values(state.companies)) {
      for (const categoryId of CONSUMER_CATEGORIES) {
        const target = (company.marketShare[categoryId] ?? 0) * 1.15 + marketingLeverage(state, company.id, categoryId);
        company.brand[categoryId] = Math.max(0.05, Math.min(1, target));
      }
    }
  }
  const company = state.companies[companyId];
  return company ? company.today.revenue - company.today.cogs : 0;
}

function phantom(state: GameState, companyId: string, defId: string, tileId: number, focus: CategoryId | null): BuildingInstance {
  const tile = state.map.tiles[tileId]!;
  return {
    id: `probe-${defId}`,
    defId,
    tileId,
    districtId: tile.districtId,
    companyId,
    priceMultiplier: 1,
    autoPrice: true,
    builtDay: state.time.day,
    stocked: [],
    focus,
    last: { unitsSold: 0, capacityUsed: 0, revenue: 0, cogs: 0, upkeep: 0, wages: 0, profit: 0, share: 0, producedUnits: 0, soldToMarket: 0 },
  };
}

/** Bölgenin ortasına en yakın parsel: depo menzili için temsilci kare. */
function centralPlot(state: GameState, districtId: number): number | null {
  const plots = state.map.tiles.filter((t) => t.districtId === districtId && t.kind === 'plot');
  if (plots.length === 0) return null;
  const cx = plots.reduce((s, t) => s + t.x, 0) / plots.length;
  const cy = plots.reduce((s, t) => s + t.y, 0) / plots.length;
  let best = plots[0]!;
  for (const t of plots) {
    if (Math.abs(t.x - cx) + Math.abs(t.y - cy) < Math.abs(best.x - cx) + Math.abs(best.y - cy)) best = t;
  }
  return best.id;
}

/**
 * Tahmin haftalık: arayüz her karede yeniden çiziyor ve bir tahmin iki
 * kopyada sekizer pazar günü demek. Hafta değişince ya da şehirdeki bina
 * sayısı değişince (oyuncu ya da rakip kurdu, yıktı) yeniden hesaplanır.
 */
const cache = new Map<string, { day: number; version: number; value: IndirectEstimate | null }>();
let cacheState: GameState | null = null;

export function indirectEstimate(
  state: GameState,
  companyId: string,
  defId: string,
  districtId: number,
  tileId?: number,
): IndirectEstimate | null {
  const def = BUILDING_BY_ID[defId];
  const company = state.companies[companyId];
  if (!def || !company) return null;
  if (def.role !== 'logistics' && def.role !== 'research' && def.role !== 'marketing') return null;

  if (cacheState !== state) {
    cache.clear();
    cacheState = state;
  }
  const buildings = Object.keys(state.buildings).length;
  const key = `${companyId}|${defId}|${districtId}|${tileId ?? ''}`;
  const hit = cache.get(key);
  const week = Math.floor(state.time.day / 7);
  if (hit && hit.day === week && hit.version === buildings) return hit.value;
  const value = compute(state, companyId, defId, districtId, tileId);
  cache.set(key, { day: week, version: buildings, value });
  return value;
}

function compute(
  state: GameState,
  companyId: string,
  defId: string,
  districtId: number,
  tileId?: number,
): IndirectEstimate | null {
  const def = BUILDING_BY_ID[defId]!;
  const company = state.companies[companyId]!;
  const fixedCosts = estimateInvestment(state, districtId, defId, companyId)?.fixedCosts ?? 0;
  const cost = def.cost;
  const result = (gain: number, rampDays: number, extra: Partial<IndirectEstimate>): IndirectEstimate => {
    const dailyProfit = gain - fixedCosts;
    return {
      dailyGain: gain,
      dailyProfit,
      paybackDays: dailyProfit > 0 ? cost / dailyProfit : Infinity,
      rampDays,
      ...extra,
    };
  };

  const hasOutlets = Object.values(state.buildings).some(
    (b) => b.companyId === companyId && BUILDING_BY_ID[b.defId]?.role === 'outlet',
  );

  if (def.role === 'logistics') {
    const at = tileId !== undefined && state.map.tiles[tileId]?.districtId === districtId ? tileId : centralPlot(state, districtId);
    if (at === null) return null;
    const tile = state.map.tiles[at]!;
    // Menzile girecek ve henüz depolu olmayan mağazalar.
    const covered = Object.values(state.buildings).filter((b) => {
      if (b.companyId !== companyId || BUILDING_BY_ID[b.defId]?.role !== 'outlet') return false;
      const other = state.map.tiles[b.tileId];
      if (!other || distributionRelief(state, b) > 0) return false;
      return Math.abs(other.x - tile.x) + Math.abs(other.y - tile.y) <= def.radius;
    }).length;
    if (covered === 0) {
      return result(0, 0, { covered, none: hasOutlets ? 'Menzilde deposuz mağazan yok.' : 'Henüz mağazan yok.' });
    }
    const base = settledGross(structuredClone(state), companyId);
    const treated = structuredClone(state);
    const probe = phantom(treated, companyId, defId, at, null);
    treated.buildings[probe.id] = probe;
    return result(settledGross(treated, companyId) - base, 0, { covered });
  }

  const focus = defaultFocus(state, companyId, defId);
  if (!focus) return result(0, 0, { none: 'Çalışacağı kategori yok.' });
  if (!hasOutlets) return result(0, 0, { focus, none: 'Henüz mağazan yok — çalışacağı satış yok.' });

  if (def.role === 'research') {
    const ceiling = researchCeiling(state, companyId, focus);
    const next = Math.min(RESEARCH_CAP, ceiling + (def.focusPotency ?? 0));
    if (next <= ceiling) return result(0, 0, { focus, none: 'Bu kategoride Ar-Ge tavanı dolu.' });
    const base = structuredClone(state);
    base.companies[companyId]!.research[focus] = ceiling;
    const treated = structuredClone(state);
    treated.companies[companyId]!.research[focus] = next;
    const gain = settledGross(treated, companyId) - settledGross(base, companyId);
    return result(gain, Math.round(NINETY / RESEARCH_RATE), { focus });
  }

  // Pazarlama: kaldıraç fiyata hemen, markaya hedef üzerinden yansıyor.
  const leverage = marketingLeverage(state, companyId, focus);
  const nextLeverage = Math.min(MARKETING_CAP, leverage + (def.focusPotency ?? 0));
  if (nextLeverage <= leverage) return result(0, 0, { focus, none: 'Bu kategoride pazarlama tavanı dolu.' });
  const base = structuredClone(state);
  const treated = structuredClone(state);
  const probe = phantom(treated, companyId, defId, firstOwnTile(state, companyId) ?? 0, focus);
  treated.buildings[probe.id] = probe;
  const gain = settledGross(treated, companyId) - settledGross(base, companyId);
  const rate = BRAND_RATE * getCeoModifiers(company.ceoId).brandGrowth;
  return result(gain, Math.round(NINETY / rate), { focus });
}

function firstOwnTile(state: GameState, companyId: string): number | null {
  for (const b of Object.values(state.buildings)) if (b.companyId === companyId) return b.tileId;
  return null;
}
