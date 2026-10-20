import { CRISES, CRISIS_BY_ID, CRISIS_TIMING, LATE_COSTS, MODIFIER_RULES } from '@capital/content';
import type { CrisisDef } from '@capital/content';
import { pushNews } from '../news';
import { createRng, nextFloat, pickWeighted } from '../rng';
import type { CompanyState, GameState } from '../types';
import { ownerFraction } from './equity';
import { noteFeat } from './feats';
import { rivalCrisisReaction } from './rivalry';
import { hasRule } from './rules';

/**
 * Geç oyun giderleri ve krizler (Tur 37a) — gerekçe ve ölçüm
 * `@capital/content` economy.ts'te.
 */

// ------------------------------------------------------------ yönetim yükü

export function lateCostsEnabled(state: GameState): boolean {
  return state.flags.lateCosts !== false;
}

/**
 * Şirket başına bina sayısı, GÜN başına bir kez sayılıyor.
 *
 * Yönetim yükü her binanın bakımına ve her yatırım tahminine giriyor;
 * her seferinde bütün binaları saymak günlük adımı bina sayısının
 * karesine çıkarırdı. Sayım günün ilk sorusunda yapılıyor ve o gün
 * boyunca sabit: gün içinde kurulan bina ertesi günden itibaren sayılıyor
 * (bakım defteri gün başında yazıldığı için zaten öyle).
 *
 * Belirlenimci: gün değişince sayım yeniden yapılıyor ve simülasyon içinde
 * ilk soru her zaman gün başındaki defter sıfırlaması — lig tekrarı da
 * canlı oyun da aynı sayıyı görüyor.
 */
const counts = new WeakMap<GameState, { day: number; byCompany: Map<string, number> }>();

function buildingCounts(state: GameState): Map<string, number> {
  const cached = counts.get(state);
  if (cached && cached.day === state.time.day) return cached.byCompany;
  const byCompany = new Map<string, number>();
  for (const building of Object.values(state.buildings)) {
    byCompany.set(building.companyId, (byCompany.get(building.companyId) ?? 0) + 1);
  }
  counts.set(state, { day: state.time.day, byCompany });
  return byCompany;
}

/** Yönetim yükünün oranı: 0 (küçük şirket) … `overheadCap`. */
export function overheadRate(state: GameState, companyId: string): number {
  if (!lateCostsEnabled(state)) return 0;
  const buildings = buildingCounts(state).get(companyId) ?? 0;
  const over = Math.max(0, buildings - LATE_COSTS.overheadFreeBuildings);
  return Math.min(LATE_COSTS.overheadCap, over * LATE_COSTS.overheadPerBuilding);
}

/** Bakım ve ücrete uygulanan çarpan: 1 + yönetim yükü. */
export function overheadMultiplier(state: GameState, companyId: string): number {
  return 1 + overheadRate(state, companyId);
}

// ------------------------------------------------------------ servet vergisi

/**
 * Yıllık servet vergisi — kademeli, şirket özkaynağı üzerinden.
 *
 * Taban net değer değil özkaynak: net değer kurucuya düşen pay (halka arz
 * etmiş şirkette daha küçük). Vergiyi şirket ödüyor, yani şirketin
 * tamamının değeri üzerinden.
 */
export function annualWealthTax(equity: number): number {
  const brackets = LATE_COSTS.wealthBrackets;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i]!;
    const top = brackets[i + 1]?.from ?? Number.POSITIVE_INFINITY;
    const slice = Math.min(equity, top) - bracket.from;
    if (slice > 0) tax += slice * bracket.rate;
  }
  return tax;
}

/** Bugünkü servet vergisi. Dünkü net değerden — bugünkü henüz hesaplanmadı. */
export function dailyWealthTax(state: GameState, company: CompanyState): number {
  if (!lateCostsEnabled(state)) return 0;
  const equity = company.netWorth / Math.max(0.05, ownerFraction(company));
  if (equity <= 0) return 0;
  return annualWealthTax(equity) / 365;
}

// ------------------------------------------------------------------ kriz

export function crisesEnabled(state: GameState): boolean {
  return state.flags.crises !== false && state.flags.randomEvents !== false;
}

/**
 * Şu an etkisi süren kriz (uyarı evresinde değil). Bayrak kapalıyken yok:
 * kriz sürerken kapatılan bayrak (ortadan alınmış kayıtla eşli deney)
 * etkiyi de kaldırıyor, yoksa takvim dururken etki sonsuza dek kalırdı.
 */
export function activeCrisis(state: GameState): CrisisDef | null {
  if (!crisesEnabled(state) || state.crisis?.phase !== 'active') return null;
  return CRISIS_BY_ID[state.crisis.defId] ?? null;
}

/** Taban faize eklenen kriz puanı (kredili hesap ve yeni krediler). */
export function macroRateDelta(state: GameState): number {
  return activeCrisis(state)?.effects.rateDelta ?? 0;
}

/** İnşaat maliyetine kriz çarpanı. Fırtınalı yıllar kuralında indirim yok (Tur 45). */
export function crisisBuildMultiplier(state: GameState): number {
  const multiplier = activeCrisis(state)?.effects.buildCost ?? 1;
  return multiplier < 1 && hasRule(state, 'storms') && !MODIFIER_RULES.storms.buildDiscount ? 1 : multiplier;
}

/**
 * Kriz zarı DIŞSAL — olay ve dönem takvimiyle aynı ilke: tohumdan ve
 * günden, kimin ne kurduğundan bağımsız. Eşli deneylerde iki kol aynı
 * krizleri aynı günlerde yaşıyor.
 */
function crisisDice(state: GameState, salt: number): ReturnType<typeof createRng> {
  return createRng(((state.meta.seed ^ 0x2c1b3c6d) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

/** Kriz takvimi; Fırtınalı yıllar kuralında yarısı (Tur 45). */
function crisisTiming(state: GameState): { firstDay: number; firstSpread: number; gapDays: readonly [number, number] } {
  return hasRule(state, 'storms') ? MODIFIER_RULES.storms : CRISIS_TIMING;
}

function rangeFrom(dice: ReturnType<typeof createRng>, [min, max]: readonly [number, number]): number {
  return min + Math.floor(nextFloat(dice) * (max - min + 1));
}

/**
 * Kriz takvimi. Günlük adımda dönemden sonra koşuyor.
 *
 *   uyarı ──(warningDays)──▶ kriz ──(süre)──▶ bitiş ──(300–480 gün)──▶ uyarı
 *
 * İlk uyarının günü tohumdan (320–440). Kriz bitince bir sonrakinin günü
 * bitiş gününün zarından.
 */
export function runCrisisTick(state: GameState): void {
  if (!crisesEnabled(state)) return;
  const day = state.time.day;
  const crisis = state.crisis;

  if (crisis) {
    const def = CRISIS_BY_ID[crisis.defId];
    if (crisis.phase === 'warning' && day >= crisis.activeDay) {
      crisis.phase = 'active';
      // Kariyer (Tur 41): kriz başlarken oyuncunun değeri — "krizden büyüyerek çıktı mı?"
      const player = state.companies[state.playerCompanyId];
      if (player) (state.feats ??= {}).crisisWorth = player.netWorth;
      if (def) pushNews(state, 'bad', def.title, def.body);
      // Rakip hikâyesi (Tur 37b): en büyük rakip krize kendi ağzından tepki veriyor.
      rivalCrisisReaction(state);
    } else if (crisis.phase === 'active' && day >= crisis.endDay) {
      delete state.crisis;
      // Oyun bitince gün koşmuyor: buraya gelen oyuncu krizi ayakta atlattı.
      const player = state.companies[state.playerCompanyId];
      if (player) {
        noteFeat(state, 'crisesWeathered');
        if (state.feats?.crisisWorth !== undefined && player.netWorth > state.feats.crisisWorth) noteFeat(state, 'crisesGrown');
        delete state.feats!.crisisWorth;
      }
      state.nextCrisisDay = day + rangeFrom(crisisDice(state, day), crisisTiming(state).gapDays);
      if (def) pushNews(state, 'good', def.endTitle, def.endBody);
    }
    return;
  }

  const timing = crisisTiming(state);
  state.nextCrisisDay ??= timing.firstDay + Math.floor(nextFloat(crisisDice(state, 1)) * (timing.firstSpread + 1));
  if (day < state.nextCrisisDay) return;

  const dice = crisisDice(state, day);
  const def = pickWeighted(dice, CRISES, (c) => c.weight);
  const activeDay = day + CRISIS_TIMING.warningDays;
  state.crisis = {
    defId: def.id,
    phase: 'warning',
    activeDay,
    endDay: activeDay + rangeFrom(dice, def.durationDays),
  };
  pushNews(state, 'bad', def.warningTitle, def.warningBody);
}
